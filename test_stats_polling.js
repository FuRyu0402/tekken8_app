const assert = require('node:assert/strict');
const test = require('node:test');
const { createStatsPoller } = require('./stats_polling');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness(fetchStats = async () => ({ total_matches: 1 })) {
  const intervals = [];
  const cleared = [];
  const stats = [];
  const errors = [];
  const poller = createStatsPoller({
    fetchStats,
    onStats: (value) => stats.push(value),
    onError: (message) => errors.push(message),
    setIntervalFn: (callback, milliseconds) => {
      const timer = { callback, milliseconds };
      intervals.push(timer);
      return timer;
    },
    clearIntervalFn: (timer) => cleared.push(timer),
  });
  return { poller, intervals, cleared, stats, errors };
}

test('starting and running start one 1000ms polling interval', () => {
  const { poller, intervals } = harness();
  poller.updateStatus('starting');
  poller.updateStatus('running');
  poller.updateStatus('running');
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].milliseconds, 1000);
  assert.equal(poller.isRunning(), true);
});

test('stopped stopping and error stop polling', () => {
  for (const status of ['stopped', 'stopping', 'error']) {
    const { poller, cleared } = harness();
    poller.updateStatus('running');
    poller.updateStatus(status);
    assert.equal(poller.isRunning(), false, status);
    assert.equal(cleared.length, 1, status);
  }
});

test('polling restarts after a stopped to running transition', () => {
  const { poller, intervals, cleared } = harness();
  poller.updateStatus('running');
  poller.updateStatus('stopped');
  poller.updateStatus('starting');
  assert.equal(intervals.length, 2);
  assert.equal(cleared.length, 1);
});

test('an in-flight statistics request prevents overlapping calls', async () => {
  const pending = deferred();
  let calls = 0;
  const { poller } = harness(() => { calls += 1; return pending.promise; });
  poller.updateStatus('running');
  const first = poller.tick();
  await poller.tick();
  await poller.tick();
  assert.equal(calls, 1);
  pending.resolve({ total_matches: 2 });
  await first;
  await poller.tick();
  assert.equal(calls, 2);
});

test('temporary duplicate errors are reported once and do not stop polling', async () => {
  let shouldFail = true;
  const { poller, errors, stats } = harness(async () => {
    if (shouldFail) throw new Error('temporary');
    return { total_matches: 3 };
  });
  poller.updateStatus('running');
  await poller.tick();
  await poller.tick();
  assert.deepEqual(errors, ['temporary']);
  assert.equal(poller.isRunning(), true);
  shouldFail = false;
  await poller.tick();
  assert.equal(stats.length, 1);
});

test('destroy clears the interval and ignores later state changes', () => {
  const { poller, intervals, cleared } = harness();
  poller.updateStatus('running');
  poller.destroy();
  poller.updateStatus('running');
  assert.equal(cleared.length, 1);
  assert.equal(intervals.length, 1);
  assert.equal(poller.isRunning(), false);
});

test('manual result operations still render returned statistics immediately', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, 'renderer.js'), 'utf8');
  assert.match(source, /renderStats\(stats\);\s*setResultStatus\(successMessage\)/);
  assert.match(source, /performResult\(window\.matchResults\.addWin/);
  assert.match(source, /performResult\(window\.matchResults\.addLose/);
  assert.match(source, /performResult\(window\.matchResults\.undo/);
  assert.match(source, /performResult\(window\.matchResults\.clear/);
});
