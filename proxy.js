/**
 * WebSocket proxy — needed because browser WebSocket API cannot set
 * custom HTTP headers required by Volcengine ASR v3/bigmodel.
 *
 * Browser connects to ws://localhost:8765 (no headers needed).
 * Proxy forwards to v3/bigmodel with X-Api-* auth headers.
 */

const { WebSocketServer } = require('ws');
const WebSocket = require('ws');

const APP_ID = '8012821088';
const TOKEN = 'yKVyiACnoM69nmHXq8HVJsqz8ZOYVoWW';
const RESOURCE_ID = 'volc.bigasr.sauc.duration';
const UPSTREAM = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';
const PORT = 8765;

function validCode(code) {
    if (typeof code !== 'number' || code < 1000 || code > 4999 ||
        code === 1005 || code === 1006 || code === 1015) return 1000;
    return code;
}

const server = new WebSocketServer({ port: PORT });
console.log('[Proxy] Listening on ws://localhost:' + PORT);

server.on('connection', (client) => {
    console.log('[Proxy] Client connected');

    const upstream = new WebSocket(UPSTREAM, {
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
        const size = Buffer.isBuffer(data) ? data.length : data.length;
        console.log('[Proxy] Upstream msg, size:', size);
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        } else {
            console.log('[Proxy] Client not open, dropping upstream msg');
        }
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
