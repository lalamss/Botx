import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from './logger';
import type { RobotCommand, WindowAnchorPayload, RobotStateUpdatePayload } from '../core/types';

const clients: Set<WebSocket> = new Set();
const clientState = new Map<WebSocket, { isAlive: boolean }>();
const messageCallbacks: Set<(data: Record<string, unknown>) => void> = new Set();
const messageQueue: string[] = [];
const MAX_QUEUE_SIZE = 500;
const MAX_MESSAGE_SIZE = 64 * 1024;
const ALLOWED_MESSAGE_TYPES = new Set(['CURSOR_MOVE', 'USER_DISMISS', 'EDITOR_CHANGED', 'WINDOW_VISIBILITY']);
let server: WebSocketServer | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let authToken: string | null = null;
let boundPort: number | null = null;

const HEARTBEAT_INTERVAL_MS = 30000;
const ACTION_COOLDOWN_MS = 3000;
let lastActionTime = 0;

function getTokenFilePath(): string {
    return path.join(os.tmpdir(), 'botx-ws-token');
}

function generateAuthToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export function getAuthToken(): string | null {
    return authToken;
}

function writeTokenFile(token: string): void {
    try {
        const tokenPath = getTokenFilePath();
        fs.writeFileSync(tokenPath, token, { mode: 0o600 });
    } catch (err) {
        Logger.info('WEBSOCKET', { Event: 'Failed to write token file', Error: String(err) });
    }
}

function clearTokenFile(): void {
    try {
        const tokenPath = getTokenFilePath();
        if (fs.existsSync(tokenPath)) {
            fs.unlinkSync(tokenPath);
        }
    } catch {
        // ignore
    }
}

function validateOrigin(origin: string | undefined): boolean {
    if (!origin) return true; // Electron file:// may have no origin or 'null'
    if (origin === 'null' || origin === 'file://') return true;
    try {
        const url = new URL(origin);
        const host = url.hostname;
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
        return false;
    }
}

function timingSafeEqual(a: string, b: string): boolean {
    try {
        const bufA = Buffer.from(a);
        const bufB = Buffer.from(b);
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
}

function validateMessage(data: unknown): { valid: boolean; reason?: string; parsed?: Record<string, unknown> } {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return { valid: false, reason: 'payload not object' };
    }
    const obj = data as Record<string, unknown>;
    const type = obj['type'];
    if (typeof type !== 'string' || !type) {
        return { valid: false, reason: 'missing type' };
    }
    if (!ALLOWED_MESSAGE_TYPES.has(type)) {
        return { valid: false, reason: `unknown message type: ${type}` };
    }
    if (type === 'CURSOR_MOVE') {
        if (typeof obj['relativeX'] !== 'number' || typeof obj['relativeY'] !== 'number') {
            return { valid: false, reason: 'invalid CURSOR_MOVE payload' };
        }
    }
    if (type === 'USER_DISMISS') {
        // no extra validation
    }
    return { valid: true, parsed: obj };
}

function flushQueue(): void {
    if (messageQueue.length === 0) { return; }
    const batch = messageQueue.splice(0, messageQueue.length);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            for (const msg of batch) {
                try {
                    client.send(msg);
                } catch (err) {
                    Logger.info("WEBSOCKET", { Event: "Queue flush send failed", Error: String(err) });
                    clients.delete(client);
                    clientState.delete(client);
                }
            }
        }
    }
}

function handleConnection(ws: WebSocket, req: import('http').IncomingMessage): void {
    const origin = req.headers.origin as string | undefined;
    if (!validateOrigin(origin)) {
        Logger.info('WEBSOCKET', { Event: 'Rejected connection: invalid origin', Origin: origin ?? 'undefined' });
        ws.close(4403, 'Forbidden origin');
        return;
    }

    // Token validation: if authToken is set, require token query param
    if (authToken) {
        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const token = url.searchParams.get('token');
            if (!token || !timingSafeEqual(token, authToken)) {
                Logger.info('WEBSOCKET', { Event: 'Rejected connection: invalid token' });
                ws.close(4401, 'Unauthorized');
                return;
            }
        } catch {
            Logger.info('WEBSOCKET', { Event: 'Rejected connection: token parse error' });
            ws.close(4401, 'Unauthorized');
            return;
        }
    }

    clients.add(ws);
    clientState.set(ws, { isAlive: true });
    Logger.info('WEBSOCKET', { Event: 'Client connected', Total: String(clients.size) });

    const connectMsg = JSON.stringify({ type: "CONNECTION_STATUS", status: "CONNECTED" });
    try {
        ws.send(connectMsg);
    } catch (err) {
        Logger.info("WEBSOCKET", { Event: "Failed to send CONNECTION_STATUS", Error: String(err) });
    }

    flushQueue();

    ws.on('message', (raw) => {
        try {
            const rawStr = raw.toString();
            if (rawStr.length > MAX_MESSAGE_SIZE) {
                Logger.info('WEBSOCKET', { Event: 'Message too large', Size: String(rawStr.length) });
                ws.close(1009, 'Message too large');
                return;
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(rawStr);
            } catch {
                Logger.info('WEBSOCKET', { Event: 'Invalid JSON received' });
                return;
            }
            const validation = validateMessage(parsed);
            if (!validation.valid) {
                Logger.info('WEBSOCKET', { Event: 'Invalid message rejected', Reason: validation.reason ?? 'unknown' });
                return;
            }
            for (const cb of messageCallbacks) {
                try {
                    cb(validation.parsed!);
                } catch (err) {
                    Logger.info('WEBSOCKET', { Event: 'messageCallback error', Error: String(err) });
                }
            }
        } catch (err) {
            Logger.info('WEBSOCKET', { Event: 'Message handling error', Error: String(err) });
        }
    });

    ws.on('pong', () => {
        const state = clientState.get(ws);
        if (state) state.isAlive = true;
    });

    ws.on('close', () => {
        clients.delete(ws);
        clientState.delete(ws);
        Logger.info('WEBSOCKET', { Event: 'Client disconnected', Total: String(clients.size) });
    });

    ws.on('error', (err) => {
        Logger.info('WEBSOCKET', { Event: 'Client error', Error: String(err) });
        clients.delete(ws);
        clientState.delete(ws);
    });
}

function startServer(port: number): void {
    if (server) {
        Logger.info('WEBSOCKET', { Event: 'Server already running' });
        return;
    }

    // Generate auth token on first start if not exists
    if (!authToken) {
        // Allow override via env for testing, but never log it
        const envToken = process.env.BOTX_WS_TOKEN;
        authToken = envToken && envToken.length >= 16 ? envToken : generateAuthToken();
        writeTokenFile(authToken);
    }

    server = new WebSocketServer({ host: '127.0.0.1', port });
    boundPort = port;

    server.on('connection', handleConnection);

    server.on('listening', () => {
        Logger.info('WEBSOCKET', { Event: 'Server started', Port: String(port), Host: '127.0.0.1' });
        console.log(`[COMMUNICATION] WebSocket Server running on 127.0.0.1:${port}.`);
        heartbeatTimer = setInterval(() => {
            for (const client of clients) {
                const state = clientState.get(client);
                if (!state) continue;
                if (state.isAlive === false) {
                    clients.delete(client);
                    clientState.delete(client);
                    client.terminate();
                    Logger.info('WEBSOCKET', { Event: 'Client terminated (no pong)' });
                    continue;
                }
                state.isAlive = false;
                client.ping();
            }
        }, HEARTBEAT_INTERVAL_MS);
    });

    server.on('error', (err) => {
        Logger.info('WEBSOCKET', { Event: 'Server error', Error: String(err) });
        console.log(`[COMMUNICATION] WebSocket Server error on 127.0.0.1:${port}: ${err.message}`);
        // Do NOT auto-increment port. Fail clearly.
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
            console.log(`[COMMUNICATION] Port ${port} is already in use. Server failed to start. No fallback port will be tried.`);
            server = null;
            boundPort = null;
        }
    });
}

export function startRobotServer(port: number): void {
    startServer(port);
}

// For testing: allow starting without token file, and reset state
export function _resetForTest(): void {
    stopRobotServer();
    authToken = null;
    clearTokenFile();
    boundPort = null;
    messageCallbacks.clear();
    clients.clear();
    clientState.clear();
    messageQueue.length = 0;
}

export function onRobotMessage(callback: (data: Record<string, unknown>) => void): void {
    messageCallbacks.add(callback);
}

export function offRobotMessage(callback: (data: Record<string, unknown>) => void): void {
    messageCallbacks.delete(callback);
}

export function getBoundPort(): number | null {
    return boundPort;
}

export function isServerRunning(): boolean {
    return server !== null;
}

type CursorMovePayload = { type: "CURSOR_MOVE"; relativeX: number; relativeY: number };
type ActionPayload = { type: "ACTION"; animation?: string; speech?: string };
type EditorChangedPayload = { type: "EDITOR_CHANGED" };
type UserDismissPayload = { type: "USER_DISMISS" };
type RobotStatePayload = RobotCommand;
type WindowAnchorPayloadType = WindowAnchorPayload;
type RobotStateUpdatePayloadType = RobotStateUpdatePayload;
type WindowVisibilityPayload = { type: "WINDOW_VISIBILITY"; visible: boolean };
type RobotPayload = CursorMovePayload | ActionPayload | EditorChangedPayload | UserDismissPayload | RobotStatePayload | WindowAnchorPayloadType | RobotStateUpdatePayloadType | WindowVisibilityPayload;

export function sendToRobot(payload: RobotPayload): void {
    if (payload.type === 'ACTION') {
        const now = Date.now();
        if (now - lastActionTime < ACTION_COOLDOWN_MS) {
            Logger.info("WEBSOCKET", { Event: "ACTION rate-limited", CooldownMs: String(ACTION_COOLDOWN_MS - (now - lastActionTime)) });
            return;
        }
        lastActionTime = now;
    }

    const message = JSON.stringify(payload);
    if (clients.size === 0) {
        if (messageQueue.length >= MAX_QUEUE_SIZE) {
            messageQueue.shift();
        }
        messageQueue.push(message);
        Logger.info("WEBSOCKET", { Event: "No clients, queued message", Type: payload.type, QueueSize: String(messageQueue.length) });
        return;
    }
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (err) {
                Logger.info("WEBSOCKET", {
                    Event: "Send failed",
                    Error: String(err)
                });
                clients.delete(client);
                clientState.delete(client);
            }
        }
    }
}

export function stopRobotServer(): void {
    messageCallbacks.clear();
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if (server) {
        for (const client of clients) {
            try { client.close(); } catch { /* ignore */ }
        }
        clients.clear();
        clientState.clear();
        try { server.close(); } catch { /* ignore */ }
        server = null;
        boundPort = null;
        Logger.info('WEBSOCKET', { Event: 'Server stopped' });
    }
    clearTokenFile();
    authToken = null;
}
