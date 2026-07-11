const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('matchResults', {
  getStats: () => ipcRenderer.invoke('results:get-stats'),
  addWin: () => ipcRenderer.invoke('results:add-win'),
  addLose: () => ipcRenderer.invoke('results:add-lose'),
  undo: () => ipcRenderer.invoke('results:undo'),
  clear: () => ipcRenderer.invoke('results:clear'),
});
