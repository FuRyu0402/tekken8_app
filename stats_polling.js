function createStatsPoller({
  fetchStats,
  onStats,
  onError,
  intervalMs = 1000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let timer = null;
  let inFlight = false;
  let active = false;
  let destroyed = false;
  let lastErrorMessage = null;

  async function tick() {
    if (!active || destroyed || inFlight) return;
    inFlight = true;
    try {
      const stats = await fetchStats();
      if (active && !destroyed) {
        lastErrorMessage = null;
        onStats(stats);
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      if (active && !destroyed && message !== lastErrorMessage) {
        lastErrorMessage = message;
        onError(message);
      }
    } finally {
      inFlight = false;
    }
  }

  function stop() {
    active = false;
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
  }

  function updateStatus(status) {
    if (destroyed) return;
    const shouldRun = status === 'starting' || status === 'running';
    if (!shouldRun) {
      stop();
      return;
    }
    active = true;
    if (timer === null) timer = setIntervalFn(tick, intervalMs);
  }

  function destroy() {
    destroyed = true;
    stop();
  }

  return {
    updateStatus,
    tick,
    stop,
    destroy,
    isRunning: () => timer !== null,
    isInFlight: () => inFlight,
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createStatsPoller };
else window.createStatsPoller = createStatsPoller;
