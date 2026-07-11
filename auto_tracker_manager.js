const { spawn: defaultSpawn } = require('child_process');

const ACTIVE_STATUSES = new Set(['starting', 'running', 'stopping']);

function publicState(state) {
  return {
    status: state.status,
    monitorIndex: state.monitorIndex,
    lastError: state.lastError,
    userStopped: state.userStopped,
  };
}

function validateMonitorIndex(value, monitors) {
  if (!Number.isInteger(value)) throw new Error('モニター番号は整数で指定してください。');
  if (!monitors.some((monitor) => monitor.index === value)) {
    throw new Error(`利用できないモニター番号です: ${value}`);
  }
  return value;
}

class AutoTrackerManager {
  constructor({ buildLaunch, spawn = defaultSpawn, stopTimeoutMs = 5000, onStatus = () => {} }) {
    this.buildLaunch = buildLaunch;
    this.spawn = spawn;
    this.stopTimeoutMs = stopTimeoutMs;
    this.onStatus = onStatus;
    this.child = null;
    this.stopPromise = null;
    this.forceTimer = null;
    this.lastStdoutLine = '';
    this.lastStderrLine = '';
    this.state = { status: 'stopped', monitorIndex: null, lastError: null, userStopped: false };
  }

  getStatus() { return publicState(this.state); }
  hasProcess() { return this.child !== null; }
  isActive() { return ACTIVE_STATUSES.has(this.state.status); }

  updateState(patch) {
    this.state = { ...this.state, ...patch };
    this.onStatus(this.getStatus());
  }

  start(monitorIndex) {
    if (this.child || this.isActive()) return Promise.reject(new Error('自動判定はすでに起動中です。'));
    this.updateState({ status: 'starting', monitorIndex, lastError: null, userStopped: false });

    let launch;
    try {
      launch = this.buildLaunch(monitorIndex);
      this.child = this.spawn(launch.command, launch.args, launch.options);
    } catch (error) {
      this.child = null;
      this.updateState({ status: 'error', lastError: error.message, monitorIndex: null });
      return Promise.reject(error);
    }

    const child = this.child;
    this.consumeOutput(child.stdout, (line) => { this.lastStdoutLine = line; });
    this.consumeOutput(child.stderr, (line) => { this.lastStderrLine = line; });

    return new Promise((resolve, reject) => {
      let settled = false;
      child.once('spawn', () => {
        if (this.child !== child) return;
        settled = true;
        this.updateState({ status: 'running' });
        resolve(this.getStatus());
      });
      child.once('error', (error) => {
        if (this.child !== child) return;
        this.clearForceTimer();
        this.child = null;
        this.stopPromise = null;
        this.updateState({ status: 'error', lastError: error.message, monitorIndex: null });
        if (!settled) reject(error);
      });
      child.once('close', (code, signal) => {
        if (this.child !== child) return;
        const userStopped = this.state.userStopped || this.state.status === 'stopping';
        this.clearForceTimer();
        this.child = null;
        this.stopPromise = null;
        if (userStopped) {
          this.updateState({ status: 'stopped', monitorIndex: null, lastError: null, userStopped: true });
        } else {
          const detail = this.lastStderrLine || `終了コード: ${code}${signal ? ` (${signal})` : ''}`;
          this.updateState({ status: 'error', monitorIndex: null, lastError: `自動判定が異常終了しました。${detail}` });
        }
        if (!settled) {
          settled = true;
          reject(new Error(this.state.lastError || '自動判定を起動できませんでした。'));
        }
      });
    });
  }

  consumeOutput(stream, saveLine) {
    if (!stream) return;
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      if (lines.length) saveLine(lines.at(-1).slice(-1000));
    });
  }

  stop() {
    if (!this.child) return Promise.resolve(this.getStatus());
    if (this.stopPromise) return this.stopPromise;

    const child = this.child;
    this.updateState({ status: 'stopping', userStopped: true });
    this.stopPromise = new Promise((resolve) => {
      child.once('close', () => resolve(this.getStatus()));
    });

    try {
      if (child.stdin && !child.stdin.destroyed && child.stdin.writable) child.stdin.write('stop\n');
    } catch (_error) {
      // The timeout fallback handles an unavailable stdin.
    }

    this.forceTimer = setTimeout(() => {
      this.forceTimer = null;
      if (this.child === child) {
        try { child.kill(); } catch (_error) { /* close/error handlers own cleanup */ }
      }
    }, this.stopTimeoutMs);
    return this.stopPromise;
  }

  clearForceTimer() {
    if (this.forceTimer) clearTimeout(this.forceTimer);
    this.forceTimer = null;
  }
}

function createQuitCoordinator(manager, quit) {
  let allowQuit = false;
  let quitting = false;
  return (event) => {
    if (allowQuit || !manager.hasProcess()) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    manager.stop().catch(() => {}).finally(() => {
      allowQuit = true;
      quit();
    });
  };
}

module.exports = { AutoTrackerManager, createQuitCoordinator, publicState, validateMonitorIndex };
