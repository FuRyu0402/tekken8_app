const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    // 初期サイズ
    width: 500,
    height: 800,
    // 小さくしすぎて崩れるのを防ぐための最小サイズ制限
    minWidth: 420,
    minHeight: 715,
    // --- 【ここを追加】横幅の最大値を制限（縦は制限なし） ---
    maxWidth: 600,
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