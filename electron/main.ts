import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import { fork, ChildProcess } from 'child_process';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;
const SERVER_PORT = 3000;
const isMac = process.platform === 'darwin';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'legalbill.db');
    const copiesPath = path.join(userDataPath, 'copies');

    // Ensure directories exist
    ensureDir(userDataPath);
    ensureDir(copiesPath);

    // Determine server entry point
    let serverPath: string;
    let forkOptions: { env: NodeJS.ProcessEnv; execArgv?: string[]; stdio?: any };

    // Puppeteer cache: in packaged app, use bundled chrome; in dev, use default
    let puppeteerCacheDir: string | undefined;
    if (!isDev) {
      puppeteerCacheDir = path.join(process.resourcesPath, 'puppeteer-cache');
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(SERVER_PORT),
      DB_PATH: dbPath,
      COPIES_PATH: copiesPath,
      ELECTRON: '1',
      ...(puppeteerCacheDir ? { PUPPETEER_CACHE_DIR: puppeteerCacheDir } : {}),
    };

    if (isDev) {
      console.log('Skipping server fork in dev mode - managed by concurrently');
      return resolve();
    } else {
      // In production, use compiled server
      serverPath = path.join(process.resourcesPath, 'server', 'dist', 'index.js');
      forkOptions = {
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      };
    }

    console.log(`Starting server from: ${serverPath}`);
    console.log(`DB path: ${dbPath}`);
    console.log(`Copies path: ${copiesPath}`);

    // Track whether the promise has been settled to avoid double resolve/reject
    let settled = false;

    serverProcess = fork(serverPath, [], forkOptions);

    // Capture server stdout for logging
    serverProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[server] ${data.toString().trim()}`);
    });

    // Capture server stderr for error diagnostics
    let stderrOutput = '';
    serverProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      stderrOutput += text + '\n';
      console.error(`[server:err] ${text}`);
    });

    serverProcess.on('message', (msg: unknown) => {
      if (msg === 'server-ready') {
        console.log('Server is ready!');
        if (!settled) {
          settled = true;
          resolve();
        }
      }
    });

    serverProcess.on('error', (err) => {
      console.error('Server process error:', err);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    serverProcess.on('exit', (code) => {
      console.log(`Server process exited with code ${code}`);
      // If the server exits before it sent 'server-ready', it crashed
      if (!settled) {
        settled = true;
        const errorMsg = stderrOutput.trim() || `Server exited with code ${code}`;
        reject(new Error(errorMsg));
      }
      serverProcess = null;
    });

    // Fallback: resolve after 5 seconds even if no 'server-ready' message
    setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn('Server did not send ready signal within 5s — continuing anyway');
        resolve();
      }
    }, 5000);
  });
}

function createWindow() {
  // Platform-specific window options
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a14',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 16, y: 16 };
  } else {
    // Windows / Linux: use hidden title bar with system overlay controls
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#0a0a14',
      symbolColor: '#ffffff',
      height: 36,
    };
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // In production, load the built client
    mainWindow.loadFile(path.join(process.resourcesPath, 'client', 'dist', 'index.html'));
  }

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err: any) {
    console.error('Failed to start server:', err);
    dialog.showErrorBox(
      'LexLedger — Server Error',
      `The backend server failed to start.\n\n${err.message || err}\n\nThe app may not function correctly.`
    );
  }
  createWindow();
});

app.on('window-all-closed', () => {
  // Kill the server process
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
