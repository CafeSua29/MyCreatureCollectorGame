/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Đường dẫn và hàm đọc cho các script nhập loài từ game đã cài (content-sources-real.md mục "Đọc dữ liệu
// từ game đã cài"). Thư mục Steam đổi bằng biến môi trường STEAM_COMMON.

import { readFileSync } from 'node:fs'

export const STEAM_COMMON = process.env.STEAM_COMMON ?? 'G:/SteamLibrary/steamapps/common'
const DUMP = new URL('./dump/', import.meta.url)

/** File do extract.py trích ra (bỏ BOM). */
export const readDump = (path) => readFileSync(new URL(path, DUMP), 'utf8').replace(/^\uFEFF/, '')
export const readDumpJson = (path) => JSON.parse(readDump(path))
/** File JSON nằm thẳng trong thư mục game (RPG Maker). */
export const readGameJson = (path) =>
  JSON.parse(readFileSync(`${STEAM_COMMON}/${path}`, 'utf8').replace(/^\uFEFF/, ''))

/** CSV có ngoặc kép (không có xuống dòng trong ô) thành các hàng. */
export function parseCsv(text) {
  return text.split(/\r?\n/).map((line) => {
    const cells = []
    let cell = ''
    let quoted = false
    for (const char of line) {
      if (char === '"') quoted = !quoted
      else if (char === ',' && !quoted) {
        cells.push(cell)
        cell = ''
      } else cell += char
    }
    cells.push(cell)
    return cells
  })
}

/**
 * Tổng 6 chỉ số theo bậc khi nguồn có số thật khác thang của game: giữ dáng chỉ số, đưa về thang của bậc
 * (như Koltera 2).
 */
const TIER_TOTALS = { baby: 220, small: 290, medium: 420, peak: 520, large: 560, mythic: 630 }
export function statsAtTier(shape, tier) {
  const sum = Object.values(shape).reduce((a, b) => a + b, 0)
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [
      key,
      Math.max(1, Math.round((value * TIER_TOTALS[tier]) / sum))
    ])
  )
}
