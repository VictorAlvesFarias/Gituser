import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron';
import { startServer } from '../server/src/app.ts';
import { configurePaths } from '../server/src/paths.ts';

// This file is bundled to desktop/dist/main.mjs, so paths are relative to that folder.
const here = import.meta.dirname;
const repoRoot = join(here, '..', '..');

configurePaths(
  app.isPackaged
    ? { scriptsDir: join(process.resourcesPath, 'scripts'), clientDistDir: join(process.resourcesPath, 'client') }
    : { scriptsDir: join(repoRoot, 'server', 'scripts'), clientDistDir: join(repoRoot, 'client', 'dist') },
);

let mainWindow: BrowserWindow | null = null;

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 420,
    minHeight: 500,
    title: 'Gituser',
    icon: join(repoRoot, 'build', 'icon.png'),
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  const origin = `http://127.0.0.1:${port}`;
  mainWindow.loadURL(origin);
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Links like "Criar token no GitHub" open in the real browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (url.startsWith('https://')) void shell.openExternal(url);
    }
  });
  mainWindow.on('closed', () => (mainWindow = null));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // Only our own server, plus GitHub avatars, may be loaded by the window.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; img-src 'self' data: https://github.com https://avatars.githubusercontent.com; style-src 'self' 'unsafe-inline'",
          ],
        },
      });
    });
    try {
      const server = await startServer(0);
      app.on('will-quit', server.close);
      createWindow(server.port);
      app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow(server.port));
    } catch (error) {
      dialog.showErrorBox('Gituser', `Não foi possível iniciar o servidor interno:\n${(error as Error).message}`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
}
