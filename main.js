const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    // 初期サイズ
    width: 450,
    height: 750,
    // 小さくしすぎて崩れるのを防ぐための最小サイズ制限
    minWidth: 350,
    minHeight: 500,
    autoHideMenuBar: true, // メニューバーを自動で隠す
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});