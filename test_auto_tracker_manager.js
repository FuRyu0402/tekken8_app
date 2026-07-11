const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { AutoTrackerManager, createQuitCoordinator, validateMonitorIndex } = require('./auto_tracker_manager');

function launch(script) {
  return { command: process.execPath, args: ['-e', script], options: { stdio: ['pipe', 'pipe', 'pipe'] } };
}

const STOPPABLE = `
process.stdin.setEncoding('utf8');
process.stdin.on('data', data => { if (/stop|quit/.test(data)) process.exit(0); });
setInterval(() => {}, 1000);
`;

function waitFor(predicate, timeout = 2000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); resolve(); }
      else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('timeout')); }
    }, 10);
  });
}

test('monitor index accepts only listed integers', () => {
  const monitors = [{ index: 1 }, { index: 2 }];
  assert.equal(validateMonitorIndex(2, monitors), 2);
  assert.throws(() => validateMonitorIndex('2', monitors), /整数/);
  assert.throws(() => validateMonitorIndex(0, monitors), /利用できない/);
  assert.throws(() => validateMonitorIndex(3, monitors), /利用できない/);
});

test('double start is rejected and repeated stop is safe', async () => {
  const manager = new AutoTrackerManager({ buildLaunch: () => launch(STOPPABLE), stopTimeoutMs: 500 });
  await manager.start(1);
  await assert.rejects(manager.start(1), /すでに起動中/);
  const first = manager.stop();
  const second = manager.stop();
  assert.strictEqual(first, second);
  await first;
  assert.equal(manager.getStatus().status, 'stopped');
  assert.equal(manager.hasProcess(), false);
  assert.equal(manager.forceTimer, null);
  await manager.stop();
  assert.equal(manager.getStatus().status, 'stopped');
});

test('spawn failure changes state to error and clears process', async () => {
  const manager = new AutoTrackerManager({
    buildLaunch: () => ({ command: path.join(__dirname, 'missing-command.exe'), args: [], options: {} }),
  });
  await assert.rejects(manager.start(1));
  assert.equal(manager.getStatus().status, 'error');
  assert.equal(manager.hasProcess(), false);
  assert.ok(manager.getStatus().lastError);
});

test('stdout and stderr retain only bounded last lines', async () => {
  const script = `
process.stdout.write('first\\nlast-out\\n');
process.stderr.write('warning\\nlast-error\\n');
${STOPPABLE}`;
  const manager = new AutoTrackerManager({ buildLaunch: () => launch(script), stopTimeoutMs: 500 });
  await manager.start(1);
  await waitFor(() => manager.lastStderrLine === 'last-error');
  assert.equal(manager.lastStdoutLine, 'last-out');
  assert.equal(manager.lastStderrLine, 'last-error');
  assert.ok(manager.lastStdoutLine.length <= 1000);
  await manager.stop();
});

test('abnormal close records the last stderr and clears process', async () => {
  const manager = new AutoTrackerManager({
    buildLaunch: () => launch(`process.stderr.write('dummy failure\\n'); setTimeout(() => process.exit(3), 30);`),
  });
  await manager.start(2);
  await waitFor(() => manager.getStatus().status === 'error');
  assert.match(manager.getStatus().lastError, /dummy failure/);
  assert.equal(manager.hasProcess(), false);
  assert.equal(manager.forceTimer, null);
});

test('stop timeout force kills and clears its timer after close', async () => {
  const manager = new AutoTrackerManager({
    buildLaunch: () => launch('process.stdin.resume(); setInterval(() => {}, 1000);'),
    stopTimeoutMs: 50,
  });
  await manager.start(1);
  await manager.stop();
  assert.equal(manager.getStatus().status, 'stopped');
  assert.equal(manager.hasProcess(), false);
  assert.equal(manager.forceTimer, null);
});

test('quit coordinator prevents duplicate shutdown and waits for child close', async () => {
  const manager = new AutoTrackerManager({ buildLaunch: () => launch(STOPPABLE), stopTimeoutMs: 500 });
  await manager.start(1);
  let prevented = 0;
  let quitCalls = 0;
  const handler = createQuitCoordinator(manager, () => { quitCalls += 1; });
  const event = { preventDefault: () => { prevented += 1; } };
  handler(event);
  handler(event);
  await waitFor(() => quitCalls === 1);
  assert.equal(prevented, 2);
  assert.equal(manager.hasProcess(), false);
});

test('preload exposes only fixed APIs and status listener returns cleanup', () => {
  const source = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  const expected = [
    'getStats', 'addWin', 'addLose', 'undo', 'clear', 'listMonitors',
    'startAutoTracker', 'stopAutoTracker', 'getAutoTrackerStatus', 'onAutoTrackerStatus',
    'restoreMonitorSelection', 'saveMonitorSelection',
  ];
  for (const name of expected) assert.match(source, new RegExp(`\\b${name}\\b`));
  assert.doesNotMatch(source, /invoke\([^'\"]|send\([^'\"]/);
  assert.match(source, /return \(\) => ipcRenderer\.removeListener/);
});

test('renderer policy disables undo and clear while running but keeps WIN and LOSE available', () => {
  const source = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
  assert.match(source, /undoButton\.disabled = resultBusy \|\| running \|\| stopping/);
  assert.match(source, /clearButton\.disabled = resultBusy \|\| running \|\| stopping/);
  assert.match(source, /addWinButton\.disabled = resultBusy \|\| stopping/);
  assert.match(source, /addLoseButton\.disabled = resultBusy \|\| stopping/);
});

test('Electron capture launch always includes no-preview', () => {
  const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.match(
    source,
    /args: \['-u', capturePath, '--monitor-index', String\(monitorIndex\), '--no-preview'\]/,
  );
});
