const resultStatusElement = document.getElementById('status');
const autoStatusElement = document.getElementById('auto-status');
const autoErrorElement = document.getElementById('auto-error');
const monitorSelect = document.getElementById('monitor-select');
const refreshMonitorsButton = document.getElementById('refresh-monitors');
const startButton = document.getElementById('start-auto-tracker');
const stopButton = document.getElementById('stop-auto-tracker');
const addWinButton = document.getElementById('add-win');
const addLoseButton = document.getElementById('add-lose');
const undoButton = document.getElementById('undo');
const clearButton = document.getElementById('clear');
const backupBeforeClearToggle = document.getElementById('backup-before-clear');

let resultBusy = false;
let monitorLoading = false;
let autoUiError = null;
let autoState = { status: 'stopped', monitorIndex: null, lastError: null, userStopped: false };
let pollingErrorVisible = false;
let shouldRestoreMonitor = true;

const STATUS_LABELS = {
  stopped: '停止中',
  starting: '起動中',
  running: '自動判定中',
  stopping: '停止処理中',
  error: '異常終了',
};

const statsPoller = window.createStatsPoller({
  fetchStats: window.matchResults.getStats,
  onStats: (stats) => {
    renderStats(stats);
    if (pollingErrorVisible) {
      pollingErrorVisible = false;
      setResultStatus('戦績の自動更新が復旧しました。');
    }
  },
  onError: (message) => {
    pollingErrorVisible = true;
    setResultStatus(`戦績の自動更新に失敗しました: ${message}`, true);
  },
  intervalMs: 1000,
});

function setResultStatus(message, isError = false) {
  resultStatusElement.textContent = message;
  resultStatusElement.classList.toggle('status-error', isError);
}

function applyControls() {
  const status = autoState.status;
  const running = status === 'starting' || status === 'running';
  const stopping = status === 'stopping';
  const idle = status === 'stopped' || status === 'error';
  const hasMonitor = monitorSelect.value !== '';

  monitorSelect.disabled = resultBusy || monitorLoading || !idle;
  refreshMonitorsButton.disabled = resultBusy || monitorLoading || !idle;
  startButton.disabled = resultBusy || monitorLoading || !idle || !hasMonitor;
  stopButton.disabled = resultBusy || stopping || !running;
  addWinButton.disabled = resultBusy || stopping;
  addLoseButton.disabled = resultBusy || stopping;
  undoButton.disabled = resultBusy || running || stopping;
  clearButton.disabled = resultBusy || running || stopping;
  backupBeforeClearToggle.disabled = resultBusy;
}

function renderAutoState(state) {
  autoState = state;
  statsPoller.updateStatus(state.status);
  autoStatusElement.textContent = monitorLoading ? 'モニター取得中' : (STATUS_LABELS[state.status] || state.status);
  const error = state.lastError || autoUiError;
  autoErrorElement.textContent = error || '';
  autoErrorElement.hidden = !error;
  applyControls();
}

function formatMonitor(monitor) {
  const primary = monitor.is_primary ? '・メイン' : '';
  const name = monitor.name ? `・${monitor.name}` : '';
  return `モニター ${monitor.index} — ${monitor.width}×${monitor.height}（left: ${monitor.left}, top: ${monitor.top}）${primary}${name}`;
}

async function loadMonitors() {
  if (monitorLoading) return;
  monitorLoading = true;
  autoUiError = null;
  renderAutoState(autoState);
  const previous = monitorSelect.value;
  try {
    const monitors = await window.matchResults.listMonitors();
    monitorSelect.replaceChildren();
    const unselectedOption = document.createElement('option');
    unselectedOption.value = '';
    unselectedOption.textContent = monitors.length === 0 ? '利用可能な個別モニターがありません' : 'モニターを選択してください';
    monitorSelect.appendChild(unselectedOption);
    for (const monitor of monitors) {
      const option = document.createElement('option');
      option.value = String(monitor.index);
      option.textContent = formatMonitor(monitor);
      monitorSelect.appendChild(option);
    }
    if (previous && [...monitorSelect.options].some((option) => option.value === previous)) {
      monitorSelect.value = previous;
    } else if (shouldRestoreMonitor && monitors.length > 0) {
      const restoredIndex = await window.matchResults.restoreMonitorSelection();
      const restoredValue = restoredIndex === null ? '' : String(restoredIndex);
      monitorSelect.value = [...monitorSelect.options].some((option) => option.value === restoredValue)
        ? restoredValue
        : '';
    }
    if (monitors.length > 0) shouldRestoreMonitor = false;
  } catch (error) {
    monitorSelect.replaceChildren();
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'モニター一覧を取得できませんでした';
    monitorSelect.appendChild(option);
    autoUiError = error.message || String(error);
  } finally {
    monitorLoading = false;
    renderAutoState(autoState);
  }
}

function formatTimestamp(value) { return value || '日時なし'; }

function renderStats(stats) {
  document.getElementById('total-matches').textContent = stats.total_matches;
  document.getElementById('total-wins').textContent = stats.win_count;
  document.getElementById('total-loses').textContent = stats.lose_count;
  document.getElementById('win-rate').textContent = `${stats.win_rate.toFixed(1)}%`;
  const history = document.getElementById('history-list');
  history.replaceChildren();
  if (stats.recent_matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = '記録はまだありません。';
    history.appendChild(empty);
    return;
  }
  [...stats.recent_matches].reverse().forEach((match) => {
    const item = document.createElement('div');
    item.className = `history-item item-${match.result.toLowerCase()}`;
    const time = document.createElement('span');
    time.className = 'time-text';
    time.textContent = formatTimestamp(match.timestamp);
    const result = document.createElement('strong');
    result.textContent = match.result;
    item.append(time, result);
    history.appendChild(item);
  });
}

async function performResult(action, successMessage) {
  if (resultBusy) return;
  resultBusy = true;
  applyControls();
  setResultStatus('処理中です…');
  try {
    const response = await action();
    if (response && response.canceled) {
      setResultStatus('消去をキャンセルしました。');
      return;
    }
    const stats = response && response.result
      ? response.result.stats
      : (response && response.stats ? response.stats : response);
    renderStats(stats);
    setResultStatus(successMessage);
  } catch (error) {
    setResultStatus(error.message || String(error), true);
  } finally {
    resultBusy = false;
    applyControls();
  }
}

refreshMonitorsButton.addEventListener('click', loadMonitors);
monitorSelect.addEventListener('change', async () => {
  applyControls();
  if (monitorSelect.value === '') return;
  try {
    await window.matchResults.saveMonitorSelection(Number(monitorSelect.value));
    autoUiError = null;
    renderAutoState(autoState);
  } catch (error) {
    autoUiError = error.message || String(error);
    renderAutoState(autoState);
  }
});
startButton.addEventListener('click', async () => {
  try {
    autoUiError = null;
    renderAutoState({ ...autoState, status: 'starting', lastError: null });
    await window.matchResults.startAutoTracker(Number(monitorSelect.value));
  } catch (error) {
    autoUiError = error.message || String(error);
    renderAutoState(await window.matchResults.getAutoTrackerStatus());
  }
});
stopButton.addEventListener('click', async () => {
  try { await window.matchResults.stopAutoTracker(); } catch (error) {
    autoUiError = error.message || String(error);
    renderAutoState(await window.matchResults.getAutoTrackerStatus());
  }
});
addWinButton.addEventListener('click', () => performResult(window.matchResults.addWin, 'WINを追加しました。'));
addLoseButton.addEventListener('click', () => performResult(window.matchResults.addLose, 'LOSEを追加しました。'));
undoButton.addEventListener('click', () => performResult(window.matchResults.undo, '直前の記録を取り消しました。'));
clearButton.addEventListener('click', () => performResult(window.matchResults.clear, '全記録を消去しました。'));
backupBeforeClearToggle.addEventListener('change', async () => {
  backupBeforeClearToggle.disabled = true;
  try {
    const settings = await window.matchResults.setBackupBeforeClear(backupBeforeClearToggle.checked);
    backupBeforeClearToggle.checked = settings.backupBeforeClear;
    setResultStatus('設定を保存しました。');
  } catch (error) {
    backupBeforeClearToggle.checked = !backupBeforeClearToggle.checked;
    setResultStatus(error.message || String(error), true);
  } finally {
    applyControls();
  }
});

async function loadAppSettings() {
  try {
    const settings = await window.matchResults.getAppSettings();
    backupBeforeClearToggle.checked = settings.backupBeforeClear;
  } catch (error) {
    backupBeforeClearToggle.checked = true;
    setResultStatus(error.message || String(error), true);
  }
}

const removeStatusListener = window.matchResults.onAutoTrackerStatus(renderAutoState);
window.addEventListener('beforeunload', () => {
  statsPoller.destroy();
  removeStatusListener();
}, { once: true });

Promise.allSettled([
  window.matchResults.getAutoTrackerStatus().then(renderAutoState),
  loadMonitors(),
  performResult(window.matchResults.getStats, '戦績を読み込みました。'),
  loadAppSettings(),
]);
