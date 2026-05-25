// PR-5 Test Suite: ASR + Translation Proxy
const WebSocket = require('ws');
const http = require('http');

const WS_URL = 'ws://localhost:8765';
const API_KEY = 'ark-d5de3e24-ae04-4a1f-9883-17739e59e76e-ec6c4';
const MODEL = 'ep-20260525143250-c4m4w';

let passed = 0, failed = 0;

function record(name, ok, detail) {
    if (ok) { passed++; console.log('  PASS:', name); }
    else { failed++; console.log('  FAIL:', name, '—', detail); }
}

function buildASRFrame(payload) {
    const payloadBytes = typeof payload === 'string'
        ? new TextEncoder().encode(payload)
        : new Uint8Array(payload);
    const frame = new ArrayBuffer(8 + payloadBytes.length);
    const dv = new DataView(frame);
    dv.setUint8(0, 0x11); dv.setUint8(1, 0x10);
    dv.setUint8(2, 0x10); dv.setUint8(3, 0x00);
    dv.setUint32(4, payloadBytes.length, false);
    new Uint8Array(frame).set(payloadBytes, 8);
    return frame;
}

function translate(text) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: 'Translate from Chinese to English. Only output translation.' },
                { role: 'user', content: text }
            ],
            temperature: 0.3, max_tokens: 512,
        });
        const req = http.request({
            hostname: 'localhost', port: 8766, path: '/translate', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch(e) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', (e) => reject(e));
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
    });
}

async function testASR() {
    console.log('\n=== ASR Proxy Tests ===');

    // Test 1: WS connection
    const t1 = await new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        ws.on('open', () => { ws.close(); resolve('connected'); });
        ws.on('error', (e) => resolve('error: ' + e.message));
        setTimeout(() => resolve('timeout'), 5000);
    });
    record('WS connect to proxy', t1 === 'connected', t1);

    // Test 2: Auth handshake
    const t2 = await new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let done = false;
        ws.on('open', () => {
            ws.send(buildASRFrame(JSON.stringify({
                user: { uid: 'test_' + Date.now() },
                audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1, codec: 'raw' },
                request: {
                    model_name: 'bigmodel', language: 'zh-CN',
                    enable_itn: true, enable_punc: true, result_type: 'single',
                    show_utterances: false,
                    vad: { vad_enable: true, end_window_size: 2000 },
                },
            })));
        });
        ws.on('message', (data) => {
            if (!done) {
                done = true;
                const text = new TextDecoder().decode(data);
                resolve({ len: data.length, hasJSON: text.includes('{') });
                ws.close();
            }
        });
        ws.on('error', (e) => { if (!done) { done = true; resolve('error: ' + e.message); } });
        setTimeout(() => { if (!done) { done = true; resolve('timeout'); } }, 10000);
    });
    record('ASR auth response', typeof t2 === 'object' && t2.hasJSON, JSON.stringify(t2));

    // Test 3: Send audio after auth
    const t3 = await new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let authDone = false;
        ws.on('open', () => {
            ws.send(buildASRFrame(JSON.stringify({
                user: { uid: 'test_' + Date.now() },
                audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1, codec: 'raw' },
                request: {
                    model_name: 'bigmodel', language: 'zh-CN',
                    enable_itn: true, enable_punc: true, result_type: 'single',
                    show_utterances: false,
                    vad: { vad_enable: true, end_window_size: 2000 },
                },
            })));
        });
        ws.on('message', () => {
            if (!authDone) {
                authDone = true;
                const silence = new Uint8Array(1600).fill(0);
                ws.send(buildASRFrame(silence.buffer));
                resolve('ok');
                ws.close();
            }
        });
        ws.on('error', (e) => resolve('error: ' + e.message));
        setTimeout(() => resolve('timeout'), 10000);
    });
    record('ASR post-auth audio send', t3 === 'ok', t3);
}

async function testTranslation() {
    console.log('\n=== Translation Proxy Tests ===');

    // Test 1: Proxy reachable
    try {
        const r1 = await translate('hello');
        record('Proxy reachable', r1.status === 200, 'status=' + r1.status);
    } catch(e) {
        record('Proxy reachable', false, e.message);
    }

    // Test 2: Simple EN → output
    const r2 = await translate('Hello world');
    record('Simple text response', !!r2.body?.choices?.[0]?.message?.content, JSON.stringify(r2.body).substring(0, 80));

    // Test 3: Long text
    const long = ('这是一个测试句子。').repeat(5);
    const r3 = await translate(long);
    record('Long text (5x)', r3.status === 200, 'status=' + r3.status);

    // Test 4: Empty input
    const r4 = await translate('');
    record('Empty input handled', r4.status === 200 || (r4.body?.error), 'status=' + r4.status);

    // Test 5: Missing auth
    const r5 = await new Promise((resolve) => {
        const body = JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'hi' }] });
        const req = http.request({
            hostname: 'localhost', port: 8766, path: '/translate', method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, body: d }));
        });
        req.setTimeout(10000, () => { req.destroy(); resolve({ status: 'timeout' }); });
        req.write(body); req.end();
    });
    record('No auth header → error', r5.body?.includes('error') || r5.status >= 400, 'status=' + r5.status);

    // Test 6: CORS preflight
    const r6 = await new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost', port: 8766, path: '/translate', method: 'OPTIONS',
        }, (res) => {
            resolve({ status: res.statusCode, acao: res.headers['access-control-allow-origin'] });
        });
        req.setTimeout(5000, () => { req.destroy(); resolve({ status: 'timeout' }); });
        req.end();
    });
    record('CORS OPTIONS', r6.status === 204 && r6.acao === '*', 'status=' + r6.status + ' ACAO=' + r6.acao);

    // Test 7: Latency
    const start = Date.now();
    const r7 = await translate('hello');
    const elapsed = Date.now() - start;
    record('Latency < 10s', elapsed < 10000, elapsed + 'ms');

    // Test 8: Translation quality check
    const r8 = await translate('你好世界');
    const content = r8.body?.choices?.[0]?.message?.content || '';
    record('Translation contains output', content.length > 0, content.substring(0, 60));
}

async function main() {
    console.log('PR-5 Test Suite — ' + new Date().toISOString());
    await testASR();
    await testTranslation();

    console.log('\n=== Results ===');
    console.log('Passed:', passed, '/', passed + failed);
    console.log('Failed:', failed);
    process.exit(failed > 0 ? 1 : 0);
}
main();
