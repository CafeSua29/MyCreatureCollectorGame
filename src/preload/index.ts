import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { GameApi } from './api'

// API cho renderer: chỉ những hàm cụ thể, không lộ ipcRenderer trực tiếp.
const api: GameApi = {
  saves: {
    getDir: () => ipcRenderer.invoke('saves:getDir'),
    list: () => ipcRenderer.invoke('saves:list'),
    read: (id) => ipcRenderer.invoke('saves:read', id),
    writeAuto: (gameId, text) => ipcRenderer.invoke('saves:writeAuto', gameId, text),
    writeManual: (gameId, text) => ipcRenderer.invoke('saves:writeManual', gameId, text),
    delete: (id) => ipcRenderer.invoke('saves:delete', id),
    deleteGame: (gameId) => ipcRenderer.invoke('saves:deleteGame', gameId),
    exportFile: (suggestedName, text) =>
      ipcRenderer.invoke('saves:exportFile', suggestedName, text),
    importFile: () => ipcRenderer.invoke('saves:importFile')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    // Lỗi lúc nạp preload chưa có kênh nào khác để báo (chưa có log ra file).
    // eslint-disable-next-line no-console
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
