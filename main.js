const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { AutoTrackerManager, createQuitCoordinator, validateMonitorIndex } = require('./auto_tracker_manager');
const { findSavedMonitor, loadMonitorSettings, saveMonitorSettings } = require('./monitor_settings');
const { loadAppSettings, updateAppSetting } = require('./app_settings');

const ALLOWED_COMMANDS = new Set(['get-stats', 'add-win', 'add-lose', 'undo', 'clear']);
const MAX_JSON_OUTPUT_BYTES = 1024 * 1024;
let monitorListPromise = null;
let availableMonitors = [];

function resolveTrackerPaths() {
  const trackerDir = path.resolve(__dirname, '..', 'tekken8_auto_tracker');
  const venvPython = path.join(trackerDir, '.venv', 'Scripts', 'python.exe');
  return {
    trackerDir,
    pythonPath: process.env.TEKKEN8_PYTHON || (fs.existsSync(venvPython) ? venvPython : 'python'),
    resultCliPath: path.join(trackerDir, 'result_cli.py'),
    monitorCliPath: path.join(trackerDir, 'monitor_cli.py'),
    capturePath: path.join(trackerDir, 'capture_classifier.py'),
  };
}

function childEnvironment() {
  return {
    ...process.env,
    TEKKEN8_PYTHON: process.env.TEKKEN8_PYTHON || '',
    TEKKEN8_LOG_PATH: process.env.TEKKEN8_LOG_PATH || '',
    TEKKEN8_ARCHIVE_DIR: process.env.TEKKEN8_ARCHIVE_DIR || '',
    PYTHONIOENCODING: 'utf-8',
  };
}

function runJsonPython(scriptPath, args = []) {
  const { trackerDir, pythonPath } = resolveTrackerPaths();
  if (!fs.existsSync(scriptPath)) return Promise.reject(new Error(`Python CLIが見つかりません: ${scriptPath}`));
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, ...args], {
      cwd: trackerDir,
      env: childEnvironment(),
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let tooLarge = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > MAX_JSON_OUTPUT_BYTES) {
        tooLarge = true;
        child.kill();
      } else stdout += chunk;
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (tooLarge) return reject(new Error('Python CLIの応答サイズが上限を超えました。'));
      let payload;
      try { payload = JSON.parse(stdout.trim()); } catch (_error) {
        return reject(new Error(stderr.trim() || `PythonのJSON応答を解析できませんでした（終了コード: ${code}）。`));
      }
      if (code !== 0 || !payload.ok) return reject(new Error(payload.error || stderr.trim() || 'Python処理に失敗しました。'));
      resolve(payload.data);
    });
  });
}

function resultArguments(command, options = {}) {
  const args = [command];
  if (command === 'clear') args.push(options.backupBeforeClear === false ? '--no-backup' : '--backup');
  if (process.env.TEKKEN8_LOG_PATH) args.push('--log-path', process.env.TEKKEN8_LOG_PATH);
  if (process.env.TEKKEN8_ARCHIVE_DIR) args.push('--archive-dir', process.env.TEKKEN8_ARCHIVE_DIR);
  return args;
}

function runResultCommand(command, options) {
  if (!ALLOWED_COMMANDS.has(command)) return Promise.reject(new Error(`許可されていない操作です: ${command}`));
  return runJsonPython(resolveTrackerPaths().resultCliPath, resultArguments(command, options));
}

function listMonitors() {
  if (monitorListPromise) return monitorListPromise;
  monitorListPromise = runJsonPython(resolveTrackerPaths().monitorCliPath)
    .then((monitors) => {
      if (!Array.isArray(monitors)) throw new Error('モニター一覧の形式が不正です。');
      availableMonitors = monitors;
      return monitors;
    })
    .finally(() => { monitorListPromise = null; });
  return monitorListPromise;
}

function broadcastAutoTrackerStatus(state) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('auto-tracker:status-changed', state);
  }
}

const autoTracker = new AutoTrackerManager({
  onStatus: broadcastAutoTrackerStatus,
  buildLaunch: (monitorIndex) => {
    const { trackerDir, pythonPath, capturePath } = resolveTrackerPaths();
    if (!fs.existsSync(capturePath)) throw new Error(`自動判定スクリプトが見つかりません: ${capturePath}`);
    return {
      command: pythonPath,
      args: ['-u', capturePath, '--monitor-index', String(monitorIndex), '--no-preview'],
      options: { cwd: trackerDir, env: childEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    };
  },
});

function registerIpcHandlers() {
  ipcMain.handle('results:get-stats', () => runResultCommand('get-stats'));
  ipcMain.handle('results:add-win', () => runResultCommand('add-win'));
  ipcMain.handle('results:add-lose', () => runResultCommand('add-lose'));
  ipcMain.handle('results:undo', () => runResultCommand('undo'));
  ipcMain.handle('results:clear', async (event) => {
    const settings = await loadAppSettings(app.getPath('userData'));
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await dialog.showMessageBox(owner, {
      type: 'warning', buttons: ['キャンセル', '全記録を消去'], defaultId: 0, cancelId: 0,
      title: '全記録の消去', message: 'すべての戦績を消去しますか？',
      detail: settings.backupBeforeClear
        ? '消去前にバックアップCSVが作成されます。'
        : 'バックアップなしで削除され、元に戻せません。',
      noLink: true,
    });
    if (choice.response !== 1) return { canceled: true };
    return { canceled: false, result: await runResultCommand('clear', settings) };
  });
  ipcMain.handle('app-settings:get', () => loadAppSettings(app.getPath('userData')));
  ipcMain.handle('app-settings:set-backup-before-clear', (_event, enabled) => (
    updateAppSetting(app.getPath('userData'), 'backupBeforeClear', enabled)
  ));
  ipcMain.handle('auto-tracker:list-monitors', () => listMonitors());
  ipcMain.handle('monitor-settings:restore', async () => {
    if (availableMonitors.length === 0) await listMonitors();
    const savedMonitor = await loadMonitorSettings(app.getPath('userData'));
    const matchedMonitor = findSavedMonitor(availableMonitors, savedMonitor);
    return matchedMonitor ? matchedMonitor.index : null;
  });
  ipcMain.handle('monitor-settings:save', async (_event, monitorIndex) => {
    const validIndex = validateMonitorIndex(monitorIndex, availableMonitors);
    const monitor = availableMonitors.find((candidate) => candidate.index === validIndex);
    await saveMonitorSettings(app.getPath('userData'), monitor);
    return { saved: true };
  });
  ipcMain.handle('auto-tracker:start', async (_event, monitorIndex) => {
    if (availableMonitors.length === 0) await listMonitors();
    const validIndex = validateMonitorIndex(monitorIndex, availableMonitors);
    return autoTracker.start(validIndex);
  });
  ipcMain.handle('auto-tracker:stop', () => autoTracker.stop());
  ipcMain.handle('auto-tracker:get-status', () => autoTracker.getStatus());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 520, height: 820, minWidth: 440, minHeight: 700, maxWidth: 640, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true },
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', createQuitCoordinator(autoTracker, () => app.quit()));
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
