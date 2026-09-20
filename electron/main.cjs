'use strict';

/**
 * ExamOS desktop shell.
 *
 * The desktop build is the same application as the web build: this process
 * starts the Next.js standalone server on a free local port, then opens a
 * window pointed at it. The database and uploaded files live in the OS
 * application-data folder, so they survive reinstalls and upgrades.
 */

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

let serverProcess = null;
let mainWindow = null;
let serverUrl = null;

const isPackaged = app.isPackaged;

function serverDirectory() {
  return isPackaged
    ? path.join(process.resourcesPath, 'app-server')
    : path.join(__dirname, '..', '.next', 'standalone');
}

/** Asks the OS for a free port by binding to 0 and reading what it gave us. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(url.port, url.hostname);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error('The ExamOS server did not start in time.'));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

async function startServer() {
  const directory = serverDirectory();
  const entry = path.join(directory, 'server.js');

  if (!fs.existsSync(entry)) {
    throw new Error(
      `The application server is missing (${entry}). Run "npm run build" before starting the desktop app.`,
    );
  }

  const port = await freePort();
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  serverProcess = spawn(process.execPath, [entry], {
    cwd: directory,
    env: {
      ...process.env,
      // Run Electron's bundled Node as a plain Node process.
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      EXAMOS_DATA_DIR: dataDir,
      EXAMOS_DESKTOP: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null && !app.isQuitting) {
      dialog.showErrorBox(
        'ExamOS stopped',
        'The application server stopped unexpectedly. Please restart ExamOS.',
      );
    }
  });

  serverUrl = new URL(`http://127.0.0.1:${port}`);
  await waitForServer(serverUrl);
  return serverUrl;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    show: false,
    backgroundColor: '#0d0f14',
    autoHideMenuBar: false,
    title: 'ExamOS',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(url.toString());

  // Anything that is not the local app opens in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url.origin)) {
      void shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url.origin)) {
      event.preventDefault();
      void shell.openExternal(target);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Saves the current page as a PDF — the desktop equivalent of "print to PDF". */
async function saveAsPdf() {
  if (!mainWindow) return;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save as PDF',
    defaultPath: 'examos.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return;

  const data = await mainWindow.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: false,
    margins: { marginType: 'default' },
  });
  fs.writeFileSync(filePath, data);
  void shell.showItemInFolder(filePath);
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.print({}),
        },
        { label: 'Save as PDF…', accelerator: 'CmdOrCtrl+Shift+P', click: () => void saveAsPdf() },
        { type: 'separator' },
        {
          label: 'Open data folder',
          click: () => void shell.openPath(path.join(app.getPath('userData'), 'data')),
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// A single instance owns the database file; a second launch focuses the first.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    try {
      const url = await startServer();
      createWindow(url);
    } catch (error) {
      dialog.showErrorBox('ExamOS could not start', String(error && error.message ? error.message : error));
      app.quit();
      return;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && serverUrl) createWindow(serverUrl);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    if (serverProcess && !serverProcess.killed) serverProcess.kill();
  });
}
