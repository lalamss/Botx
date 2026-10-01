const { app, BrowserWindow, ipcMain } = require('electron');

app.disableHardwareAcceleration();

let mainWindow;

function clampPosition(x, y, winWidth, winHeight) {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  let bounds = displays[0].workArea;
  for (const d of displays) {
    const db = d.workArea;
    if (x >= db.x && x < db.x + db.width && y >= db.y && y < db.y + db.height) {
      bounds = db;
      break;
    }
  }
  const clampedX = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - winWidth));
  const clampedY = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - winHeight));
  return { x: clampedX, y: clampedY };
}

app.whenReady().then(() => {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  mainWindow = new BrowserWindow({
    width: 360,
    height: 180,
    x: screenWidth - 380,
    y: screenHeight - 200,
    transparent: true,
    frame: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile('index.html');

  ipcMain.on('set-position', (_event, targetX, targetY) => {
    if (typeof targetX !== 'number' || typeof targetY !== 'number' || !Number.isFinite(targetX) || !Number.isFinite(targetY)) {
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      const size = mainWindow.getSize();
      const pos = clampPosition(targetX, targetY, size[0], size[1]);
      mainWindow.setPosition(pos.x, pos.y);
    }
  });

  ipcMain.handle('get-auth-token', () => {
    try {
      const tokenPath = path.join(os.tmpdir(), 'botx-ws-token');
      if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, 'utf-8').trim();
        if (token && token.length >= 16) return token;
      }
    } catch {}
    return '';
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
