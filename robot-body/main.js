const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.disableHardwareAcceleration();

let mainWindow;
const WIN_WIDTH = 360;
const WIN_HEIGHT = 180;

// Last applied window-level visibility. Tracks hide()/showInactive() calls so
// rapid VS Code focus flaps don't issue redundant window-manager operations
// (no flicker, no duplicate windows). Starts `true`: the companion launches
// visible (standalone `npm start` appearance unchanged) and only follows the
// brain's WINDOW_VISIBILITY reports once they arrive.
let botxVisible = true;

function applyBotxVisibility(visible) {
  const show = visible !== false;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (botxVisible === show) {
    return;
  }
  botxVisible = show;
  try {
    if (show) {
      // showInactive: restore same position/state without stealing focus
      // back from VS Code. Never recreates the window.
      if (!mainWindow.isVisible()) {
        mainWindow.showInactive();
      }
    } else {
      // hide(): window, WS connection, timers and position are preserved.
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      }
    }
  } catch {
    // ignore – window may be transitioning
  }
}

function clampPosition(x, y) {
  const displays = screen.getAllDisplays();
  let bounds = displays[0].workArea;
  for (const d of displays) {
    const db = d.workArea;
    if (x >= db.x && x < db.x + db.width && y >= db.y && y < db.y + db.height) {
      bounds = db;
      break;
    }
  }
  const clampedX = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - WIN_WIDTH));
  const clampedY = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - WIN_HEIGHT));
  return { x: clampedX, y: clampedY };
}

app.whenReady().then(() => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x: screenWidth - WIN_WIDTH - 20,
    y: screenHeight - WIN_HEIGHT - 20,
    transparent: true,
    frame: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // Click-to-disappear fix: the companion must never steal OS focus from
    // VS Code. A click would otherwise deactivate the Extension Host, and the
    // brain would (correctly per protocol) report VS Code as unfocused, which
    // hides the robot. Non-focusable windows still receive mouse input
    // (click/drag/wheel) on Windows; only activation is suppressed.
    // NOTE: intentionally NOT setIgnoreMouseEvents — the robot stays clickable.
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  ipcMain.on('set-position', (_event, targetX, targetY) => {
    if (typeof targetX !== 'number' || typeof targetY !== 'number' || !Number.isFinite(targetX) || !Number.isFinite(targetY)) {
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      const pos = clampPosition(targetX, targetY);
      mainWindow.setPosition(pos.x, pos.y);
    }
  });

  ipcMain.on('brain-event', (_event, data) => {
    if (!data || typeof data !== 'object') {
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('brain-event', data);
    }
  });

  // VS Code-active-only visibility, driven by the brain's WINDOW_VISIBILITY
  // reports (VS Code window focus state). Hides/shows the BrowserWindow
  // without destroying it: robot state, WS connection and position survive.
  ipcMain.on('hide-window', () => {
    applyBotxVisibility(false);
  });

  ipcMain.on('show-window', () => {
    applyBotxVisibility(true);
  });

  ipcMain.handle('get-auth-token', () => {
    try {
      const tokenPath = path.join(os.tmpdir(), 'botx-ws-token');
      if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, 'utf-8').trim();
        if (token && token.length >= 16) {
          return token;
        }
      }
    } catch {
      // ignore – token unavailable
    }
    return '';
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
