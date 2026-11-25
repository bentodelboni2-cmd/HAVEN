const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('haven', {
  sources: () => ipcRenderer.invoke('sources:list'),
  select: (id,audio) => ipcRenderer.invoke('sources:select',id,audio),
  window: action => ipcRenderer.invoke('window:control',action),
})
