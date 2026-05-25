/**
 * Local proxy — needed because browser WebSocket/HTTP APIs cannot set
 * custom headers required by Volcengine services.
 *
 * WebSocket: ws://localhost:8765  →  v3/bigmodel ASR
 * HTTP:      http://localhost:8766/translate  →  Doubao LLM API
 */

const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');

const APP_ID = '8012821088';
const TOKEN = 'yKVyiACnoM69nmHXq8HVJsqz8ZOYVoWW';
const RESOURCE_ID = 'volc.bigasr.sauc.duration';
const ASR_UPSTREAM = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';
const TRANSLATE_UPSTREAM = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const WS_PORT = 8765;
const HTTP_PORT = 8766;

function validCode(code) {
    if (typeof code !== 'number' || code < 1000 || code > 4999 ||
        code === 1005 || code === 1006 || code === 1015) return 1000;
    return code;
}

// ==================== WebSocket Proxy (ASR) ====================

const wsServer = new WebSocketServer({ port: WS_PORT });
console.log('[Proxy] WS listening on ws://localhost:' + WS_PORT);

wsServer.on('connection', (client) => {
    console.log('[Proxy] Client connected');

    const upstream = new WebSocket(ASR_UPSTREAM, {
        headers: {
            'X-Api-App-Key': APP_ID,
            'X-Api-Access-Key': TOKEN,
            'X-Api-Resource-Id': RESOURCE_ID,
        },
    });

    let upstreamReady = false;
    const clientBuffer = [];

    upstream.on('open', () => {
        console.log('[Proxy] Upstream connected');
        upstreamReady = true;
        for (const chunk of clientBuffer) upstream.send(chunk);
        clientBuffer.length = 0;
    });

    upstream.on('message', (data) => {
        if (client.readyState === WebSocket.OPEN) client.send(data);
    });

    upstream.on('error', (err) => {
        console.error('[Proxy] Upstream error:', err.message);
        if (client.readyState === WebSocket.OPEN) client.close(1011, err.message);
    });

    upstream.on('close', (code, reason) => {
        console.log('[Proxy] Upstream closed:', code, reason?.toString() || '');
        if (client.readyState === WebSocket.OPEN) client.close(validCode(code), reason);
    });

    client.on('message', (data) => {
        if (upstream.readyState === WebSocket.OPEN) {
            upstream.send(data);
        } else {
            clientBuffer.push(data);
        }
    });

    client.on('error', (err) => {
        console.error('[Proxy] Client error:', err.message);
        if (upstream.readyState === WebSocket.OPEN) upstream.close(1011, err.message);
    });

    client.on('close', (code, reason) => {
        console.log('[Proxy] Client disconnected:', code, reason?.toString() || '');
        if (upstream.readyState === WebSocket.OPEN) upstream.close(validCode(code), reason);
    });
});

// ==================== HTTP Proxy (Translation) ====================

const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method not allowed');
        return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
        console.log('[Proxy] HTTP translate request, body:', body.substring(0, 80) + '...');

        // Pass through the client's Authorization header
        const upstreamReq = https.request(TRANSLATE_UPSTREAM, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization || ('Bearer ' + TOKEN),
            },
        }, (upstreamRes) => {
            let data = '';
            upstreamRes.on('data', (chunk) => { data += chunk; });
            upstreamRes.on('end', () => {
                console.log('[Proxy] HTTP translate response:', upstreamRes.statusCode, data.substring(0, 120));
                res.writeHead(upstreamRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(data);
            });
        });

        upstreamReq.on('error', (err) => {
            console.error('[Proxy] HTTP upstream error:', err.message);
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'Upstream error: ' + err.message }));
        });

        upstreamReq.write(body);
        upstreamReq.end();
    });
});

httpServer.listen(HTTP_PORT, () => {
    console.log('[Proxy] HTTP listening on http://localhost:' + HTTP_PORT + '/translate');
});
