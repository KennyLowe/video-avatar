import { app, BrowserWindow, shell } from 'electron';
import * as path from 'node:path';
import { logger, setLogLevel, enforceRetention } from '@main/logging/jsonl.js';
import { registerIpcHandlers } from '@main/ipc/index.js';
import { reconcileOnLaunch } from '@main/workers/reconciler.js';
import { registerHandler } from '@main/workers/jobQueue.js';
import { runAvatarVideo } from '@main/workers/handlers/avatarVideo.js';
import { getSettings } from '@main/platform/settings.js';

// Electron main entry point. Single-window desktop app. v1 Non-negotiables:
//   - No auto-update (Non-negotiable #12 / FR-056).
//   - Single instance — running the .exe twice should just focus the open
//     window rather than opening a second copy with its own DB lock.
//   - Preload bridge enforced; nodeIntegration off; contextIsolation on.

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(bootstrap);
}

app.on('window-all-closed', () => {
  // Standard Windows behaviour: quit when the last window closes. On macOS we
  // would keep the app alive, but the constitution locks us to Windows 11.
  app.quit();
});

async function bootstrap(): Promise<void> {
  try {
    const settings = getSettings();
    setLogLevel(settings.logLevel);
    enforceRetention(settings.logRetentionDays);
    logger.info('app.launch', {
      version: app.getVersion(),
      electron: process.versions.electron,
    });

    registerHandler('avatar_video', (ctx) => runAvatarVideo(ctx));
    registerIpcHandlers();
    await reconcileOnLaunch();

    createMainWindow();
  } catch (err) {
    logger.error('app.bootstrap_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.resolve(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Anything the app links externally (provider dashboards, docs) should
    // open in the operator's default browser — never inside the Electron
    // shell, which has our preload bridge attached.
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.resolve(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}
