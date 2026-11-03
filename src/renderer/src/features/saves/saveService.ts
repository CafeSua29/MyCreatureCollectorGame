// Thao tác save phía renderer: tạo nội dung file (core), gọi main đọc / ghi qua window.api.saves.
// Load luôn: parse + migrate + kiểm tra (core.parseSave), rồi đổi seed (reroll được).

import { canSaveManually, parseSave, reseedState, serializeSave, type SaveKind } from '@core'
import type { GameData, GameState } from '@core'
import { newSeed } from '../../shared/game/gameData'

const api = (): typeof window.api.saves => window.api.saves

export interface Session {
  gameId: string
  state: GameState
}

export type LoadResult = ({ ok: true } & Session) | { ok: false; issues: string[] }

/** Id game mới: chữ thường, số, gạch ngang (dùng làm tên thư mục save). */
export function newGameId(): string {
  return `g-${Date.now().toString(36)}-${newSeed().toString(36)}`
}

function serialize(data: GameData, session: Session, kind: SaveKind): string {
  return serializeSave(data, {
    gameId: session.gameId,
    kind,
    savedAt: new Date().toISOString(),
    state: session.state
  })
}

/** Có tự lưu state này không: trong trận thì không (tắt app giữa trận → về trước khi vào trận). */
export function shouldAutosave(state: GameState): boolean {
  return state.battle === null
}

export async function autosave(data: GameData, session: Session): Promise<boolean> {
  if (!shouldAutosave(session.state)) return false
  await api().writeAuto(session.gameId, serialize(data, session, 'auto'))
  return true
}

export async function manualSave(data: GameData, session: Session): Promise<void> {
  await api().writeManual(session.gameId, serialize(data, session, 'manual'))
}

/** Đọc save theo id: kiểm tra đầy đủ, rồi đổi seed để làm lại cùng action ra kết quả khác. */
export async function loadSave(data: GameData, id: string): Promise<LoadResult> {
  const parsed = parseSave(data, await api().read(id))
  if (!parsed.ok) return parsed
  return { ok: true, gameId: parsed.save.gameId, state: reseedState(parsed.save.state, newSeed()) }
}

/** Xuất save hiện tại ra file người chơi chọn (ví dụ USB). Trả về đường dẫn, null nếu hủy. */
export async function exportSave(data: GameData, session: Session): Promise<string | null> {
  const date = new Date().toISOString().slice(0, 10)
  return api().exportFile(`${session.gameId}-${date}.json`, serialize(data, session, 'manual'))
}

/**
 * Nhập save từ file: kiểm tra đầy đủ, lưu vào thư mục save như một bản lưu tay của game đó
 * (cùng gameId thì nối tiếp game cũ; game Hardcore lưu thành bản tự lưu vì không có lưu tay), rồi
 * load. null nếu người chơi hủy.
 */
export async function importSave(data: GameData): Promise<LoadResult | null> {
  const text = await api().importFile()
  if (text === null) return null
  const parsed = parseSave(data, text)
  if (!parsed.ok) return parsed
  const session = { gameId: parsed.save.gameId, state: parsed.save.state }
  if (canSaveManually(parsed.save.summary)) await manualSave(data, session)
  else await api().writeAuto(session.gameId, serialize(data, session, 'auto'))
  return { ok: true, gameId: session.gameId, state: reseedState(session.state, newSeed()) }
}

/** Thông báo lỗi từ IPC (Promise bị reject) thành chuỗi hiển thị. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Electron thêm tiền tố "Error invoking remote method '...': Error: " vào lỗi từ main.
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
