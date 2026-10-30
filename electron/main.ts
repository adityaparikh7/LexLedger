// Desktop shell around the hosted LexLedger web app. Data lives in the cloud and on the device
// (the web app's offline copy); there is no local server any more. On first run the web app
// can import the database left by earlier desktop versions (see the legacy:* handlers).
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

/** The web app to load: LEXLEDGER_APP_URL, else app-config.json (baked into the build), else
 *  the Vite dev server when running unpackaged. */
function resolveAppUrl(): URL | null {
  let configured = process.env.LEXLEDGER_APP_URL;
  if (!configured) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app-config.json'), 'utf8'));
      configured = config.appUrl;
    } catch {
      // No config file
    }
  }
  if (!configured && isDev) configured = 'http://localhost:5173';
  try {
    return configured ? new URL(configured) : null;
  } catch {
    return null;
  }
}

const APP_URL = resolveAppUrl();

function isAppPage(url: string): boolean {
  try {
    return APP_URL !== null && new URL(url).origin === APP_URL.origin;
  } catch {
    return false;
  }
}

function openOutside(url: string) {
  if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
}

/** Shown when the app can't be reached and hasn't been cached yet (first launch offline). */
function offlinePage(): string {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>LexLedger</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F8F8F8;color:#4A4A4A;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:32px;max-width:380px;text-align:center}
h1{color:#2E5E4E;font-size:20px;margin:0 0 8px}p{font-size:14px;line-height:1.5;margin:0 0 20px}
button{background:#2E5E4E;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer}</style></head>
<body><div class="card"><h1>Can't reach LexLedger</h1><p>Connect to the internet to open LexLedger for the first time. After that it also works offline.</p>
<button onclick="location.href=${JSON.stringify(APP_URL?.href ?? '')}">Try again</button></div></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function createWindow() {
  // Platform-specific window options
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F8F8F8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 16, y: 16 };
  } else {
    // Windows / Linux: use hidden title bar with system overlay controls
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#FFFFFF',
      symbolColor: '#4A4A4A',
      height: 36,
    };
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Stay on the app's own pages; mail links and other sites open in the system's apps
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppPage(url) || url.startsWith('data:')) return;
    event.preventDefault();
    openOutside(url);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // PDFs opened from the app (blob: URLs) get their own window
    if (isAppPage(url) || url.startsWith('blob:')) return { action: 'allow' };
    openOutside(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, url, isMainFrame) => {
    // -3 is an aborted load (e.g. a redirect), not a failure
    if (isMainFrame && errorCode !== -3 && isAppPage(url)) {
      void mainWindow?.loadURL(offlinePage());
    }
  });

  if (APP_URL) {
    void mainWindow.loadURL(APP_URL.href);
  } else {
    dialog.showErrorBox('LexLedger', 'This build has no server address. Set "appUrl" in electron/app-config.json and rebuild.');
    app.quit();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- Data from earlier desktop versions ----
// Those versions kept a SQLite database (legalbill.db) in this app's userData folder, with daily
// backups next to it. The web app offers to upload it to the user's cloud account.

const LEGACY_DB = path.join(app.getPath('userData'), 'legalbill.db');
const LEGACY_BACKUPS = path.join(app.getPath('userData'), 'backups');

interface LegacyData {
  /** 'database': the app's own database; 'backup': its newest automatic backup */
  source: 'database' | 'backup';
  modifiedAt: string;
  size: number;
  file: string;
}

let legacyCache: LegacyData | null | undefined;

/** A self-contained copy of the database. The old app used WAL mode, so recent changes may only
 *  be in legalbill.db-wal; opening a copy with SQLite and checkpointing folds them in. Returns
 *  null when that isn't possible (no built-in SQLite in this Electron, or a damaged file). */
function snapshotLegacyDatabase(): string | null {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexledger-legacy-'));
  const copy = path.join(dir, 'legalbill.db');
  fs.copyFileSync(LEGACY_DB, copy);
  if (fs.existsSync(`${LEGACY_DB}-wal`)) fs.copyFileSync(`${LEGACY_DB}-wal`, `${copy}-wal`);
  try {
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(copy);
    const row = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'invoices'").get() as { n: number };
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    return row.n > 0 ? copy : null;
  } catch (err) {
    console.warn('Could not snapshot the old database:', err);
    return null;
  }
}

function newestBackup(): string | null {
  try {
    const files = fs.readdirSync(LEGACY_BACKUPS)
      .filter((f) => /^lexledger-.*\.db$/.test(f) && !f.includes('pre-restore'))
      .map((f) => path.join(LEGACY_BACKUPS, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

function findLegacyData(): LegacyData | null {
  if (legacyCache !== undefined) return legacyCache;
  legacyCache = null;
  if (fs.existsSync(LEGACY_DB)) {
    const walSize = fs.existsSync(`${LEGACY_DB}-wal`) ? fs.statSync(`${LEGACY_DB}-wal`).size : 0;
    const modified = Math.max(fs.statSync(LEGACY_DB).mtimeMs, walSize ? fs.statSync(`${LEGACY_DB}-wal`).mtimeMs : 0);
    // With nothing in the WAL, the database file is already complete
    const file = walSize === 0 ? LEGACY_DB : snapshotLegacyDatabase();
    if (file) {
      legacyCache = { source: 'database', modifiedAt: new Date(modified).toISOString(), size: fs.statSync(file).size, file };
      return legacyCache;
    }
  }
  const backup = newestBackup();
  if (backup) {
    const stat = fs.statSync(backup);
    legacyCache = { source: 'backup', modifiedAt: stat.mtime.toISOString(), size: stat.size, file: backup };
  }
  return legacyCache;
}

/** Only the LexLedger web app may read local files. */
function fromApp(event: IpcMainInvokeEvent): boolean {
  return isAppPage(event.senderFrame?.url ?? '');
}

ipcMain.handle('legacy:find', (event) => {
  if (!fromApp(event)) return null;
  const found = findLegacyData();
  return found && { source: found.source, modifiedAt: found.modifiedAt, size: found.size };
});

ipcMain.handle('legacy:read', (event) => {
  if (!fromApp(event)) return null;
  const found = findLegacyData();
  return found ? new Uint8Array(fs.readFileSync(found.file)) : null;
});

// Native folder picker for the renderer (used to choose the backup folder)
ipcMain.handle('dialog:select-folder', async (_event, defaultPath?: string) => {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose a folder for LexLedger backups',
    properties: ['openDirectory', 'createDirectory'],
    ...(typeof defaultPath === 'string' && defaultPath ? { defaultPath } : {}),
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
