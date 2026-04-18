import { app, BrowserWindow, shell } from 'electron';
import * as path from 'node:path';
import { logger, setLogLevel, enforceRetention } from '@main/logging/jsonl.js';
import { registerIpcHandlers } from '@main/ipc/index.js';
import { reconcileOnLaunch } from '@main/workers/reconciler.js';
import { registerHandler } from '@main/workers/jobQueue.js';
import { runAvatarVideo } from '@main/workers/handlers/avatarVideo.js';
import { runVoiceTrain } from '@main/workers/handlers/voiceTrain.js';
import { runAvatarTrain } from '@main/workers/handlers/avatarTrain.js';
import { runRender } from '@main/workers/handlers/render.js';
import { getSettings } from '@main/platform/settings.js';

// Nothing the main window renders actually needs the GPU — Monaco, React,
// and plain CSS all run fine on the software rasteriser. Remotion's render
// uses its own headless Chromium process. Disabling hardware acceleration
// and the GPU child process outright sidesteps GPU-process-launch failures
// that appear on RDP sessions, VMs, remote tools, and machines with
// unsupported drivers (Chromium exits with "GPU process isn't usable.
// Goodbye." otherwise). Must be called before app.whenReady().
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-sandbox');
// Route GL through ANGLE + SwiftShader — Chromium's proper software GL
// backend. Works on RDP, VMs, and machines with no usable GPU driver; slow
// but produces actual frames. With only `--disable-gpu` set the compositor
// has no rasterizer and the window paints empty.
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');

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
    registerHandler('voice_train', (ctx) => runVoiceTrain(ctx));
    registerHandler('avatar_train', (ctx) => runAvatarTrain(ctx));
    registerHandler('render', (ctx) => runRender(ctx));
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
      // Sandbox is off by default. Chromium's renderer sandbox refuses to
      // initialise when the working directory is a UNC / mapped network
      // path, or on RDP sessions with tight group policy — exit code 18 at
      // launch. We keep contextIsolation on and the preload bridge as the
      // only renderer↔main channel, so this is a small security downgrade,
      // not a hole: the renderer still has no Node APIs or filesystem
      // access outside what the typed IPC surface exposes.
      sandbox: false,
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
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.resolve(__dirname, '../renderer/index.html'));
  }
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logger.error('renderer.load_failed', { code, desc, url });
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logger.error('renderer.process_gone', { reason: details.reason, exitCode: details.exitCode });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}
