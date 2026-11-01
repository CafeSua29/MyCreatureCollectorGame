// Hợp đồng IPC giữa renderer và main cho save (dùng chung kiểu ở main, preload, renderer).

import type { SaveSummary } from '@core'

/** Thông tin một file save để hiện danh sách (không gồm state). */
export interface SaveEntry {
  /** "<gameId>/<tên file>" */
  id: string
  gameId: string
  kind: 'auto' | 'manual'
  /** Chuỗi ISO 8601; rỗng nếu file hỏng. */
  savedAt: string
  summary: SaveSummary | null
  /** Có nếu file hỏng / không đọc được. */
  error?: string
}

export interface SavesApi {
  /** Thư mục đang dùng để lưu (để hiện cho người chơi). */
  getDir(): Promise<string>
  list(): Promise<SaveEntry[]>
  read(id: string): Promise<string>
  writeAuto(gameId: string, text: string): Promise<string>
  writeManual(gameId: string, text: string): Promise<string>
  delete(id: string): Promise<void>
  deleteGame(gameId: string): Promise<void>
  /** Nội dung profile.json (hồ sơ xuyên save: loài khởi đầu đã mở); null nếu chưa có / không đọc được. */
  readProfile(): Promise<string | null>
  writeProfile(text: string): Promise<void>
  /** Mở hộp thoại chọn nơi lưu, ghi file. Trả về đường dẫn, hoặc null nếu người chơi hủy. */
  exportFile(suggestedName: string, text: string): Promise<string | null>
  /** Mở hộp thoại chọn file save, trả về nội dung, hoặc null nếu người chơi hủy. */
  importFile(): Promise<string | null>
}

export interface GameApi {
  saves: SavesApi
}
