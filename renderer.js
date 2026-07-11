const buttons = Array.from(document.querySelectorAll('button[data-action]'));
const statusElement = document.getElementById('status');
let busy = false;

function setBusy(value) {
  busy = value;
  buttons.forEach((button) => { button.disabled = value; });
  document.body.classList.toggle('is-busy', value);
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('status-error', isError);
}

function formatTimestamp(value) {
  if (!value) return '日時なし';
  return value;
}

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

async function perform(action, successMessage) {
  if (busy) return;
  setBusy(true);
  setStatus('処理中です…');
  try {
    const response = await action();
    if (response && response.canceled) {
      setStatus('消去をキャンセルしました。');
      return;
    }
    const stats = response && response.result
      ? response.result.stats
      : (response && response.stats ? response.stats : response);
    renderStats(stats);
    setStatus(successMessage);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusy(false);
  }
}

document.getElementById('add-win').addEventListener('click', () => {
  perform(window.matchResults.addWin, 'WINを追加しました。');
});
document.getElementById('add-lose').addEventListener('click', () => {
  perform(window.matchResults.addLose, 'LOSEを追加しました。');
});
document.getElementById('undo').addEventListener('click', () => {
  perform(window.matchResults.undo, '直前の記録を取り消しました。');
});
document.getElementById('clear').addEventListener('click', () => {
  perform(window.matchResults.clear, '全記録を消去しました。');
});

perform(window.matchResults.getStats, '戦績を読み込みました。');
