const { contextBridge, ipcRenderer } = require('electron');

// Explicit allowlist of channels the renderer may interact with.
// No generic send(channel, payload) is exposed.
const ALLOWED_SEND_CHANNELS = new Set([
    'cursor-move',
    'drag-start',
    'drag-move',
    'drag-end',
    'editor-changed',
    'set-companion-position',
    'hide-window',
    'show-window',
    'set-position'
]);

const ALLOWED_RECEIVE_CHANNELS = new Set([
    'brain-event',
    'toggle-drag'
]);

function validateNumber(n) {
    return typeof n === 'number' && Number.isFinite(n);
}

contextBridge.exposeInMainWorld('electronAPI', {
    sendCursorMove: (x, y) => {
        if (!validateNumber(x) || !validateNumber(y)) return;
        ipcRenderer.send('cursor-move', { x, y });
    },
    sendDragStart: () => {
        ipcRenderer.send('drag-start');
    },
    sendDragMove: (dx, dy) => {
        if (!validateNumber(dx) || !validateNumber(dy)) return;
        ipcRenderer.send('drag-move', { dx, dy });
    },
    sendDragEnd: () => {
        ipcRenderer.send('drag-end');
    },
    sendEditorChanged: () => {
        ipcRenderer.send('editor-changed');
    },
    setCompanionPosition: (targetX, targetY) => {
        if (!validateNumber(targetX) || !validateNumber(targetY)) return;
        ipcRenderer.send('set-companion-position', { targetX, targetY });
    },
    setPosition: (targetX, targetY) => {
        if (!validateNumber(targetX) || !validateNumber(targetY)) return;
        ipcRenderer.send('set-position', targetX, targetY);
    },
    onToggleDrag: (callback) => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('toggle-drag', (_event, data) => callback(data));
    },
    hideWindow: () => {
        ipcRenderer.send('hide-window');
    },
    showWindow: () => {
        ipcRenderer.send('show-window');
    }
});

// Minimal secure botx API – narrowly scoped, no arbitrary IPC.
contextBridge.exposeInMainWorld('botx', {
    window: {
        minimize: () => ipcRenderer.send('hide-window'),
        close: () => ipcRenderer.send('hide-window'),
        // VS Code-active-only visibility: hide/show the floating window
        // without destroying it (state, position and WS survive).
        hide: () => ipcRenderer.send('hide-window'),
        show: () => ipcRenderer.send('show-window'),
        setPosition: (x, y) => {
            if (!validateNumber(x) || !validateNumber(y)) return;
            ipcRenderer.send('set-position', x, y);
        }
    },
    onBrainEvent: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('brain-event', handler);
        return () => ipcRenderer.removeListener('brain-event', handler);
    },
    events: {
        subscribe: (callback) => {
            if (typeof callback !== 'function') return () => {};
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('brain-event', handler);
            return () => ipcRenderer.removeListener('brain-event', handler);
        }
    },
    getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
    getAuthTokenSync: () => {
        // Synchronous fallback not available with invoke; return empty and let async path handle
        return '';
    }
});
