const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('haven', {
  sources: () => ipcRenderer.invoke('sources:list'),
  select: id => ipcRenderer.invoke('sources:select',id),
  clearSources: () => ipcRenderer.invoke('sources:clear'),
  canIsolateAudio: () => ipcRenderer.invoke('sources:audio-isolation'),
  readSession: () => ipcRenderer.invoke('session:read'),
  saveSession: value => ipcRenderer.invoke('session:save',value),
  clearSession: () => ipcRenderer.invoke('session:clear'),
  checkUpdate: base => ipcRenderer.invoke('updates:check',base),
  installUpdate: (base,version) => ipcRenderer.invoke('updates:install',base,version),
  window: action => ipcRenderer.invoke('window:control',action),
})
