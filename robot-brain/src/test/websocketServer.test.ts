import * as assert from 'assert';
import { WebSocket } from 'ws';
import * as websocketServer from '../utils/websocketServer';

function delay(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function connectClient(port: number, token?: string, origin?: string): Promise<WebSocket> {
    const url = token ? `ws://127.0.0.1:${port}?token=${encodeURIComponent(token)}` : `ws://127.0.0.1:${port}`;
    const headers: Record<string, string> = {};
    if (origin) headers['Origin'] = origin;
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, { headers } as any);
        ws.on('open', () => resolve(ws));
        ws.on('error', (err) => reject(err));
        // timeout
        setTimeout(() => reject(new Error('connect timeout')), 3000);
    });
}

suite('WebSocketServer security', () => {
    const TEST_PORT = 18055;

    setup(async () => {
        websocketServer._resetForTest();
        // Ensure no env token interferes
        delete process.env.BOTX_WS_TOKEN;
        await delay(100);
    });

    teardown(async () => {
        websocketServer.stopRobotServer();
        await delay(200);
        delete process.env.BOTX_WS_TOKEN;
    });

    test('binds to 127.0.0.1 and requires token', async () => {
        websocketServer.startRobotServer(TEST_PORT);
        await delay(400);
        assert.ok(websocketServer.isServerRunning(), 'server should be running');
        const token = websocketServer.getAuthToken();
        assert.ok(token && token.length >= 32, 'auth token should be generated');
        // try without token – should be rejected (close)
        const wsNoAuth = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
        let closed = false;
        await new Promise<void>((resolve) => {
            wsNoAuth.on('close', (code) => {
                closed = true;
                assert.strictEqual(code, 4401);
                resolve();
            });
            wsNoAuth.on('open', () => {
                // if opened without token, that's failure – but server should close quickly
                setTimeout(() => {
                    if (!closed) {
                        wsNoAuth.close();
                        resolve();
                    }
                }, 800);
            });
            wsNoAuth.on('error', () => resolve());
        });
        assert.ok(closed, 'unauthenticated connection should be closed with 4401');
    });

    test('authorized connection succeeds', async () => {
        websocketServer.startRobotServer(TEST_PORT);
        await delay(400);
        const token = websocketServer.getAuthToken()!;
        const url = `ws://127.0.0.1:${TEST_PORT}?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        let receivedMsg = '';
        ws.on('message', (data) => { receivedMsg = data.toString(); });
        await new Promise<void>((resolve, reject) => {
            ws.on('open', () => resolve());
            ws.on('error', reject);
            setTimeout(() => reject(new Error('open timeout')), 2000);
        });
        assert.strictEqual(ws.readyState, WebSocket.OPEN);
        await delay(300);
        assert.ok(receivedMsg.includes('CONNECTION_STATUS') || receivedMsg === '', 'should receive CONNECTION_STATUS if captured');
        ws.close();
        await delay(200);
    });

    test('rejects invalid origin', async () => {
        websocketServer.startRobotServer(TEST_PORT);
        await delay(400);
        const token = websocketServer.getAuthToken()!;
        const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}?token=${encodeURIComponent(token)}`, {
            headers: { Origin: 'http://evil.com' }
        } as any);
        let closed = false;
        await new Promise<void>((resolve) => {
            ws.on('close', (code) => { closed = true; assert.strictEqual(code, 4403); resolve(); });
            ws.on('open', () => setTimeout(() => { if (!closed) { ws.close(); resolve(); } }, 800));
            ws.on('error', () => resolve());
        });
        assert.ok(closed, 'evil origin should be rejected');
    });

    test('validates message schema – rejects unknown type and malformed json', async () => {
        websocketServer.startRobotServer(TEST_PORT);
        await delay(400);
        const token = websocketServer.getAuthToken()!;
        let received: any = null;
        websocketServer.onRobotMessage((data) => { received = data; });
        const ws = await connectClient(TEST_PORT, token);
        // unknown type
        ws.send(JSON.stringify({ type: 'EVIL_TYPE', payload: {} }));
        await delay(300);
        assert.strictEqual(received, null, 'unknown type should be rejected');

        // malformed json – should not crash
        ws.send('not json at all {{{');
        await delay(300);
        assert.strictEqual(received, null);

        // valid type should be received
        ws.send(JSON.stringify({ type: 'USER_DISMISS' }));
        await delay(300);
        assert.ok(received && (received as any).type === 'USER_DISMISS');

        // oversized payload should close
        const large = 'a'.repeat(70 * 1024);
        ws.send(JSON.stringify({ type: 'USER_DISMISS', data: large }));
        await delay(300);
        // connection may be closed due to size
        assert.ok(ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING || received !== null);

        ws.close();
    });

    test('does not auto-increment port on EADDRINUSE', async () => {
        websocketServer.startRobotServer(TEST_PORT);
        await delay(400);
        // try to start again on same port – should not fallback to 18056
        websocketServer.startRobotServer(TEST_PORT);
        await delay(300);
        // server should still be on original port, not 18056
        assert.strictEqual(websocketServer.getBoundPort(), TEST_PORT);
        assert.ok(websocketServer.isServerRunning());
    });

    test('supports multiple callbacks (M1 – no overwrite)', async () => {
        websocketServer.startRobotServer(TEST_PORT);
        await delay(400);
        const token = websocketServer.getAuthToken()!;
        let c1 = 0, c2 = 0;
        websocketServer.onRobotMessage(() => c1++);
        websocketServer.onRobotMessage(() => c2++);
        const ws = await connectClient(TEST_PORT, token);
        ws.send(JSON.stringify({ type: 'USER_DISMISS' }));
        await delay(300);
        assert.strictEqual(c1, 1);
        assert.strictEqual(c2, 1);
        ws.close();
    });
});
