import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.whenReady().then(() => {
  // macOS 忽略 BrowserWindow 的 icon 选项，Dock 图标取自 .app 包；
  // 开发运行（npm start）时包是 Electron.app，只能在运行时替换 Dock 图标
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon-mac-512.png'));
  }
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    title: '三国杀 1v1',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon-256.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});
