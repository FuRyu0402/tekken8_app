const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ALLOWED_COMMANDS = new Set(['get-stats', 'add-win', 'add-lose', 'undo', 'clear']);
const RESULT_PATH_OVERRIDES = Object.freeze({
  logPath: process.env.TEKKEN8_LOG_PATH?.trim() || null,
  archiveDir: process.env.TEKKEN8_ARCHIVE_DIR?.trim() || null,
});

function resolveTrackerPaths() {
  const trackerDir = path.resolve(__dirname, '..', 'tekken8_auto_tracker');
  const cliPath = path.join(trackerDir, 'result_cli.py');
  const venvPython = path.join(trackerDir, '.venv', 'Scripts', 'python.exe');
  const pythonPath = process.env.TEKKEN8_PYTHON || (fs.existsSync(venvPython) ? venvPython : 'python');
  return { trackerDir, cliPath, pythonPath };
}

function runResultCommand(command) {
  if (!ALLOWED_COMMANDS.has(command)) {
    return Promise.reject(new Error(`許可されていない操作です: ${command}`));
  }

  const { trackerDir, cliPath, pythonPath } = resolveTrackerPaths();
  if (!fs.existsSync(cliPath)) {
    return Promise.reject(new Error(`Python CLIが見つかりません: ${cliPath}`));
  }

  return new Promise((resolve, reject) => {
    const args = [cliPath, command];
    if (RESULT_PATH_OVERRIDES.logPath) {
      args.push('--log-path', RESULT_PATH_OVERRIDES.logPath);
    }
    if (RESULT_PATH_OVERRIDES.archiveDir) {
      args.push('--archive-dir', RESULT_PATH_OVERRIDES.archiveDir);
    }
    const child = spawn(pythonPath, args, {
      cwd: trackerDir,
      env: {
        ...process.env,
        ...(RESULT_PATH_OVERRIDES.logPath
          ? { TEKKEN8_LOG_PATH: RESULT_PATH_OVERRIDES.logPath }
          : {}),
        ...(RESULT_PATH_OVERRIDES.archiveDir
          ? { TEKKEN8_ARCHIVE_DIR: RESULT_PATH_OVERRIDES.archiveDir }
          : {}),
      },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      let payload;
      try {
        payload = JSON.parse(stdout.trim());
      } catch (_error) {
        reject(new Error(stderr.trim() || `Pythonの応答を解析できませんでした (終了コード: ${code})`));
        return;
      }
      if (code !== 0 || !payload.ok) {
        reject(new Error(payload.error || stderr.trim() || `Python処理に失敗しました (終了コード: ${code})`));
        return;
      }
      resolve(payload.data);
    });
  });
}

function registerIpcHandlers() {
  ipcMain.handle('results:get-stats', () => runResultCommand('get-stats'));
  ipcMain.handle('results:add-win', () => runResultCommand('add-win'));
  ipcMain.handle('results:add-lose', () => runResultCommand('add-lose'));
  ipcMain.handle('results:undo', () => runResultCommand('undo'));
  ipcMain.handle('results:clear', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await dialog.showMessageBox(owner, {
      type: 'warning',
      buttons: ['キャンセル', '全記録を消去'],
      defaultId: 0,
      cancelId: 0,
      title: '全記録の消去',
      message: 'すべての戦績を消去しますか？',
      detail: '消去前にPython側でバックアップが作成されます。',
      noLink: true,
    });
    if (choice.response !== 1) return { canceled: true };
    return { canceled: false, result: await runResultCommand('clear') };
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 720,
    minWidth: 420,
    minHeight: 620,
    maxWidth: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
