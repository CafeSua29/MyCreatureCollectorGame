// Đọc / ghi hồ sơ xuyên save (<saveDir>/profile.json, docs/rules/saves.md). Main chỉ đọc / ghi chữ;
// kiểm tra nội dung ở core (parseProfile: file hỏng coi như hồ sơ rỗng). Không import Electron.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { atomicWrite } from './saves'

export const PROFILE_FILE = 'profile.json'

/** profile.json lớn hơn mức này thì coi như hỏng (hồ sơ thật chỉ vài KB). */
const MAX_PROFILE_BYTES = 5 * 1024 * 1024

/** Nội dung profile.json; chưa có / không đọc được / quá lớn = null (renderer coi như hồ sơ rỗng). */
export function readProfile(saveDir: string): string | null {
  const file = path.join(saveDir, PROFILE_FILE)
  try {
    if (fs.statSync(file).size > MAX_PROFILE_BYTES) return null
    return fs.readFileSync(file, 'utf8')
  } catch {
    // Chưa có file hoặc không đọc được: hồ sơ rỗng, không chặn game.
    return null
  }
}

/** Ghi an toàn profile.json. */
export function writeProfile(saveDir: string, text: string): void {
  atomicWrite(path.join(saveDir, PROFILE_FILE), text)
}
