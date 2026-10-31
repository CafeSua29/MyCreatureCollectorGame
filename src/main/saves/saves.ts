// Đọc / ghi file save trên đĩa. Không import Electron (test được với thư mục tạm).
//
// Cấu trúc thư mục:  <saveDir>/<gameId>/auto-1.json .. auto-3.json   (tự lưu, xoay vòng)
//                                       manual-<thời điểm ms>.json   (lưu tay, không giới hạn)
// Id của một save = "<gameId>/<tên file>". Mọi id / gameId từ renderer đều được kiểm tra
// (chống path traversal). Ghi file an toàn: ghi ra file tạm rồi đổi tên đè lên file chính.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseSaveSummary } from '@core'
import type { SaveEntry } from '../../preload/api'

/** Số file tự lưu xoay vòng cho mỗi game. */
export const AUTOSAVE_SLOTS = 3

const GAME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const SAVE_FILE = /^(auto-[1-9]\d*|manual-\d+(-\d+)?)\.json$/

function parseId(id: string): { gameId: string; file: string } {
  const [gameId, file, ...rest] = String(id).split('/')
  if (rest.length > 0 || !GAME_ID.test(gameId ?? '') || !SAVE_FILE.test(file ?? '')) {
    throw new Error(`Id save không hợp lệ: ${id}`)
  }
  return { gameId, file }
}

function checkGameId(gameId: string): void {
  if (!GAME_ID.test(gameId)) throw new Error(`gameId không hợp lệ: ${gameId}`)
}

/** Ghi an toàn: ghi file tạm cạnh file đích rồi đổi tên đè lên (không để lại file dở). */
export function atomicWrite(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, text, 'utf8')
  fs.renameSync(temp, file)
}

/** Thư mục save: thư mục đầu tiên trong danh sách ghi được (tạo nếu chưa có). */
export function resolveSaveDir(candidates: string[]): string {
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      const probe = path.join(dir, '.write-test')
      fs.writeFileSync(probe, '')
      fs.rmSync(probe)
      return dir
    } catch {
      // Không ghi được (ví dụ cài trong Program Files): thử thư mục kế tiếp.
    }
  }
  throw new Error('Không tìm được thư mục nào ghi được để lưu game')
}

/** Đọc phần thông tin (không gồm state) của một file save; file hỏng thì ghi lỗi. */
function readEntry(saveDir: string, gameId: string, file: string): SaveEntry {
  const id = `${gameId}/${file}`
  const kind = file.startsWith('auto-') ? 'auto' : 'manual'
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(saveDir, gameId, file), 'utf8'))
    return { id, gameId, kind, savedAt: String(raw.savedAt), summary: parseSaveSummary(raw.summary) }
  } catch {
    return {
      id,
      gameId,
      kind,
      savedAt: '',
      summary: null,
      error: 'File save hỏng hoặc không đọc được'
    }
  }
}

/** Mọi save, mới nhất trước. */
export function listSaves(saveDir: string): SaveEntry[] {
  if (!fs.existsSync(saveDir)) return []
  const entries: SaveEntry[] = []
  for (const gameId of fs.readdirSync(saveDir)) {
    const gameDir = path.join(saveDir, gameId)
    if (!GAME_ID.test(gameId) || !fs.statSync(gameDir).isDirectory()) continue
    for (const file of fs.readdirSync(gameDir)) {
      if (SAVE_FILE.test(file)) entries.push(readEntry(saveDir, gameId, file))
    }
  }
  return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function readSave(saveDir: string, id: string): string {
  const { gameId, file } = parseId(id)
  return fs.readFileSync(path.join(saveDir, gameId, file), 'utf8')
}

/** Tự lưu: ghi vào ô còn trống, hết ô thì ghi đè ô có savedAt cũ nhất. Trả về id. */
export function writeAutosave(saveDir: string, gameId: string, text: string): string {
  checkGameId(gameId)
  const slots = Array.from({ length: AUTOSAVE_SLOTS }, (_, i) => `auto-${i + 1}.json`)
  const existing = slots.map((file) => ({
    file,
    exists: fs.existsSync(path.join(saveDir, gameId, file)),
    savedAt: fs.existsSync(path.join(saveDir, gameId, file))
      ? readEntry(saveDir, gameId, file).savedAt
      : ''
  }))
  const target =
    existing.find((slot) => !slot.exists) ??
    existing.reduce((oldest, slot) => (slot.savedAt < oldest.savedAt ? slot : oldest))
  atomicWrite(path.join(saveDir, gameId, target.file), text)
  return `${gameId}/${target.file}`
}

/** Lưu tay: luôn tạo file mới. `now` là thời điểm (ms) dùng làm tên file. Trả về id. */
export function writeManualSave(
  saveDir: string,
  gameId: string,
  text: string,
  now: number
): string {
  checkGameId(gameId)
  let file = `manual-${now}.json`
  for (let i = 1; fs.existsSync(path.join(saveDir, gameId, file)); i++)
    file = `manual-${now}-${i}.json`
  atomicWrite(path.join(saveDir, gameId, file), text)
  return `${gameId}/${file}`
}

export function deleteSave(saveDir: string, id: string): void {
  const { gameId, file } = parseId(id)
  fs.rmSync(path.join(saveDir, gameId, file), { force: true })
  const gameDir = path.join(saveDir, gameId)
  if (fs.existsSync(gameDir) && fs.readdirSync(gameDir).length === 0) fs.rmdirSync(gameDir)
}

export function deleteGame(saveDir: string, gameId: string): void {
  checkGameId(gameId)
  fs.rmSync(path.join(saveDir, gameId), { recursive: true, force: true })
}
