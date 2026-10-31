// IPC cho save: renderer gọi qua window.api.saves (preload), main đọc / ghi file.

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as fs from 'node:fs'
import { dirname, join } from 'node:path'
import {
  deleteGame,
  deleteSave,
  listSaves,
  readSave,
  resolveSaveDir,
  writeAutosave,
  writeManualSave
} from './saves'

/** File save nhập vào lớn hơn mức này thì từ chối (save bình thường chỉ vài trăm KB). */
const MAX_IMPORT_BYTES = 50 * 1024 * 1024

/**
 * Thư mục save, ưu tiên "portable": thư mục "saves" cạnh file chạy game, để copy cả thư mục
 * game vào USB là mang theo được save. Không ghi được (ví dụ cài trong Program Files) thì dùng
 * thư mục dữ liệu người dùng của hệ điều hành.
 * - Bản portable của electron-builder: PORTABLE_EXECUTABLE_DIR là thư mục chứa file .exe gốc.
 * - Bản đóng gói thường: thư mục chứa file chạy.
 * - Dev: thư mục project.
 * Biến môi trường MCC_SAVE_DIR (nếu có) được ưu tiên trước hết (dùng khi test).
 */
export function saveDirCandidates(): string[] {
  const override = process.env.MCC_SAVE_DIR ? [process.env.MCC_SAVE_DIR] : []
  const nearApp =
    process.env.PORTABLE_EXECUTABLE_DIR ??
    (app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath())
  return [...override, join(nearApp, 'saves'), join(app.getPath('userData'), 'saves')]
}

export function registerSaveIpc(): string {
  const saveDir = resolveSaveDir(saveDirCandidates())

  ipcMain.handle('saves:getDir', () => saveDir)
  ipcMain.handle('saves:list', () => listSaves(saveDir))
  ipcMain.handle('saves:read', (_, id: string) => readSave(saveDir, id))
  ipcMain.handle('saves:writeAuto', (_, gameId: string, text: string) =>
    writeAutosave(saveDir, gameId, String(text))
  )
  ipcMain.handle('saves:writeManual', (_, gameId: string, text: string) =>
    writeManualSave(saveDir, gameId, String(text), Date.now())
  )
  ipcMain.handle('saves:delete', (_, id: string) => deleteSave(saveDir, id))
  ipcMain.handle('saves:deleteGame', (_, gameId: string) => deleteGame(saveDir, gameId))

  ipcMain.handle('saves:exportFile', async (event, suggestedName: string, text: string) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options = {
      title: 'Xuất save ra file',
      defaultPath: join(app.getPath('documents'), String(suggestedName)),
      filters: [{ name: 'Save game', extensions: ['json'] }]
    }
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    fs.writeFileSync(result.filePath, String(text), 'utf8')
    return result.filePath
  })

  ipcMain.handle('saves:importFile', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options = {
      title: 'Nhập save từ file',
      filters: [{ name: 'Save game', extensions: ['json'] }],
      properties: ['openFile' as const]
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    if (fs.statSync(file).size > MAX_IMPORT_BYTES) throw new Error('File quá lớn, không phải save')
    return fs.readFileSync(file, 'utf8')
  })

  return saveDir
}
