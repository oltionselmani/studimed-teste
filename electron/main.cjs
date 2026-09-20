'use strict';

/**
 * ExamOS desktop shell.
 *
 * The desktop build is the same application as the web build: this process
 * starts the Next.js standalone server on a free local port, then opens a
 * window pointed at it. The database and uploaded files live in the OS
 * application-data folder, so they survive reinstalls and upgrades.
 */

const { app, BrowserWindow, Menu, clipboard, dialog, shell } = require('electron');
const os = require('node:os');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

let serverProcess = null;
let mainWindow = null;
let splashWindow = null;
let serverUrl = null;
let serverPort = null;
// The server listens on the loopback address unless the student explicitly
// opens it to their network, so nothing is reachable by default.
let boundHost = '127.0.0.1';

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

/** The machine's address on the local network, for reaching it from a phone. */
function lanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
}

async function startServer({ host = '127.0.0.1', port } = {}) {
  const directory = serverDirectory();
  const entry = path.join(directory, 'server.js');

  if (!fs.existsSync(entry)) {
    throw new Error(
      `The application server is missing (${entry}). Run "npm run build" before starting the desktop app.`,
    );
  }

  const chosenPort = port ?? (await freePort());
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  serverProcess = spawn(process.execPath, [entry], {
    cwd: directory,
    env: {
      ...process.env,
      // Run Electron's bundled Node as a plain Node process.
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(chosenPort),
      HOSTNAME: host,
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

  serverPort = chosenPort;
  boundHost = host;
  // The window always talks to loopback, even when the server is also
  // listening on the network for a phone.
  serverUrl = new URL(`http://127.0.0.1:${chosenPort}`);
  await waitForServer(serverUrl);
  return serverUrl;
}

/**
 * Opens the running server to the local network so a phone on the same Wi-Fi
 * can use it — which is what makes photographing a printed exam practical.
 *
 * Off by default, and the dialog says plainly what it exposes: anyone on the
 * same network can reach the sign-in page while it is on.
 */
async function shareToPhone() {
  const address = lanAddress();
  if (!address) {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: 'No network connection found',
      detail:
        'ExamOS could not find a local network address. Connect this computer to Wi-Fi and try again.',
    });
    return;
  }

  if (boundHost !== '0.0.0.0') {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Share', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Let your phone use ExamOS?',
      detail:
        'ExamOS will accept connections from other devices on this network until you close it. ' +
        'Anyone on the same Wi-Fi will be able to reach the sign-in page, so they still need your ' +
        'email and password. Your data stays on this computer.',
    });
    if (response !== 0) return;

    if (serverProcess && !serverProcess.killed) serverProcess.kill();
    try {
      await startServer({ host: '0.0.0.0', port: serverPort ?? undefined });
    } catch (error) {
      dialog.showErrorBox('Could not share', String(error && error.message ? error.message : error));
      return;
    }
  }

  const url = `http://${address}:${serverPort}`;
  clipboard.writeText(url);
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    message: 'Open this on your phone',
    detail:
      `${url}\n\nThe address is on your clipboard. Open it in Safari or Chrome on your phone, ` +
      'sign in, then use Share → Add to Home Screen to get an ExamOS icon.\n\n' +
      'Sharing stops when you quit ExamOS.',
  });
}

/**
 * A small window shown while the local server boots, so launching the app
 * looks like something is happening instead of nothing. It is closed the
 * moment the real window has something to paint.
 */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    show: true,
    center: true,
    backgroundColor: '#04092e',
    title: 'ExamOS',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  return splashWindow;
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
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

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });
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
        { label: 'Share to my phone…', click: () => void shareToPhone() },
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
    createSplash();
    try {
      const url = await startServer();
      createWindow(url);
    } catch (error) {
      closeSplash();
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
