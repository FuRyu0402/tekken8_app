const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('matchResults', {
  getStats: () => ipcRenderer.invoke('results:get-stats'),
  addWin: () => ipcRenderer.invoke('results:add-win'),
  addLose: () => ipcRenderer.invoke('results:add-lose'),
  undo: () => ipcRenderer.invoke('results:undo'),
  clear: () => ipcRenderer.invoke('results:clear'),
  getAppSettings: () => ipcRenderer.invoke('app-settings:get'),
  setBackupBeforeClear: (enabled) => ipcRenderer.invoke('app-settings:set-backup-before-clear', enabled),
  listMonitors: () => ipcRenderer.invoke('auto-tracker:list-monitors'),
  restoreMonitorSelection: () => ipcRenderer.invoke('monitor-settings:restore'),
  saveMonitorSelection: (monitorIndex) => ipcRenderer.invoke('monitor-settings:save', monitorIndex),
  startAutoTracker: (monitorIndex) => ipcRenderer.invoke('auto-tracker:start', monitorIndex),
  stopAutoTracker: () => ipcRenderer.invoke('auto-tracker:stop'),
  getAutoTrackerStatus: () => ipcRenderer.invoke('auto-tracker:get-status'),
  onAutoTrackerStatus: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('auto-tracker:status-changed', listener);
    return () => ipcRenderer.removeListener('auto-tracker:status-changed', listener);
  },
});
