const characterList = [
    "アーマーキング", "アズセナ", "飛鳥", "アリサ", "アンナ", "一八", "ヴィクター", "エディ",
    "キング", "クマ", "クラウディオ", "クライヴ", "州光", "ザフィーナ", "ジャック8", "シャオユウ",
    "シャヒーン", "準", "仁", "スティーブ", "デビル仁", "ドラグノフ", "ニーナ", "範馬 勇次郎",
    "パンダ", "平八", "ファラン", "ファーカムラム", "フェン", "ブライアン", "ボブ", "ポール",
    "ミアリズ", "吉光", "ラース", "リディア", "リリ", "リロイ", "リー", "レイヴン", "麗奈",
    "レオ", "ロジャーJr.", "ロウ"
];

let matchHistory = JSON.parse(localStorage.getItem('t8_counter_v4')) || [];
let characterMemos = JSON.parse(localStorage.getItem('t8_memos_v4')) || {};
let currentSelectedOpponent = localStorage.getItem('t8_current_opp_v4') || "一八";

// メモエリアのイベントリスナーを1回だけ登録
document.getElementById('char-memo').addEventListener('input', saveCharacterMemo);

// 自分キャラのドロップダウン初期化
function initMyCharacterDropdown() {
    const mySelect = document.getElementById('my-char-select');
    mySelect.innerHTML = '';
    characterList.forEach(char => {
        const opt = document.createElement('option');
        opt.value = char;
        opt.textContent = char;
        mySelect.appendChild(opt);
    });
    mySelect.value = "仁";
}

// 対戦相手グリッドの生成
function initOpponentGrid() {
    const grid = document.getElementById('char-grid');
    grid.innerHTML = '';
    characterList.forEach(char => {
        const btn = document.createElement('button');
        btn.className = 'char-btn';
        if (char.length >= 6) btn.classList.add('long-name');
        btn.id = 'btn-' + char;
        btn.textContent = char;
        btn.onclick = function () { selectOpponent(char); };
        grid.appendChild(btn);
    });
    highlightCurrentOpponent();
}

// 現在選択中のキャラを強調
function highlightCurrentOpponent() {
    characterList.forEach(char => {
        const btn = document.getElementById('btn-' + char);
        if (btn) btn.classList.remove('selected');
    });
    const activeBtn = document.getElementById('btn-' + currentSelectedOpponent);
    if (activeBtn) activeBtn.classList.add('selected');
}

// キャラボタンを押したらメモ欄と記録バーを更新するだけ
function selectOpponent(char) {
    currentSelectedOpponent = char;
    localStorage.setItem('t8_current_opp_v4', currentSelectedOpponent);
    highlightCurrentOpponent();
    loadCharacterMemo();
    document.getElementById('record-bar-char').textContent = char;
}

// 記録バーのWIN/LOSEボタンで記録
function recordResult(result) {
    if (!currentSelectedOpponent || currentSelectedOpponent === "未選択") return;
    const myChar = document.getElementById('my-char-select').value;
    matchHistory.push({
        myChar: myChar,
        oppChar: currentSelectedOpponent,
        result: result,
        timestamp: new Date().getTime()
    });
    localStorage.setItem('t8_counter_v4', JSON.stringify(matchHistory));
    updateDisplay();
}

// 1件戻す
function undoLastResult() {
    if (matchHistory.length === 0) return;
    matchHistory.pop();
    localStorage.setItem('t8_counter_v4', JSON.stringify(matchHistory));
    updateDisplay();
}

function formatTimestamp(ms) {
    if (!ms) return "不明";
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function updateDisplay() {
    let wins = 0, loses = 0;
    const listContainer = document.getElementById('history-list');
    listContainer.innerHTML = '';

    const maxDisplay = 10;
    let count = 0;

    for (let i = matchHistory.length - 1; i >= 0; i--) {
        const match = matchHistory[i];
        if (match.result === 'WIN') wins++;
        if (match.result === 'LOSE') loses++;

        if (count < maxDisplay) {
            const item = document.createElement('div');
            item.className = 'history-item ' + (match.result === 'WIN' ? 'item-win' : 'item-lose');
            item.innerHTML =
                '<div class="char-info">' +
                '<strong>' + match.oppChar + '</strong>' +
                '<span class="time-text">(' + formatTimestamp(match.timestamp) + ' / 自分: ' + match.myChar + ')</span>' +
                '</div>' +
                '<span><strong>' + match.result + '</strong></span>';
            listContainer.appendChild(item);
            count++;
        }
    }

    const total = wins + loses;
    const rate = total > 0 ? Math.round((wins / total) * 100) : 0;

    document.getElementById('total-wins').innerText = wins;
    document.getElementById('total-loses').innerText = loses;
    document.getElementById('win-rate').innerText = rate + '%';
}

function loadCharacterMemo() {
    document.getElementById('memo-label').textContent =
        '対戦相手 [ ' + currentSelectedOpponent + ' ] の対策メモ';
    document.getElementById('char-memo').value =
        characterMemos[currentSelectedOpponent] || "";
}

function saveCharacterMemo() {
    characterMemos[currentSelectedOpponent] =
        document.getElementById('char-memo').value;
    localStorage.setItem('t8_memos_v4', JSON.stringify(characterMemos));
}

function clearHistory() {
    document.getElementById('reset-modal').style.display = 'flex';
}

function closeResetModal() {
    document.getElementById('reset-modal').style.display = 'none';
}

function executeReset() {
    matchHistory = [];
    localStorage.setItem('t8_counter_v4', JSON.stringify([]));
    updateDisplay();
    highlightCurrentOpponent();
    loadCharacterMemo();
    closeResetModal();
}

// グリッド下端ドラッグでリサイズ
(function () {
    const charGrid = document.getElementById('char-grid');
    const EDGE_SIZE = 16; // 下端から何px以内でリサイズモードになるか
    let isDragging = false;
    let startY = 0;
    let startGridH = 0;

    charGrid.addEventListener('mousemove', function (e) {
        if (isDragging) return;
        const rect = charGrid.getBoundingClientRect();
        const nearBottom = e.clientY >= rect.bottom - EDGE_SIZE;
        charGrid.style.cursor = nearBottom ? 'ns-resize' : '';
    });

    charGrid.addEventListener('mouseleave', function () {
        if (!isDragging) charGrid.style.cursor = '';
    });

    charGrid.addEventListener('mousedown', function (e) {
        const rect = charGrid.getBoundingClientRect();
        if (e.clientY < rect.bottom - EDGE_SIZE) return;
        isDragging = true;
        startY = e.clientY;
        startGridH = charGrid.getBoundingClientRect().height;
        charGrid.style.flex = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        const delta = e.clientY - startY;
        const newH = Math.max(80, startGridH + delta);
        charGrid.style.height = newH + 'px';
    });

    document.addEventListener('mouseup', function () {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    });
})();

// 起動時初期化
initMyCharacterDropdown();
initOpponentGrid();
updateDisplay();
loadCharacterMemo();
document.getElementById('record-bar-char').textContent = currentSelectedOpponent;