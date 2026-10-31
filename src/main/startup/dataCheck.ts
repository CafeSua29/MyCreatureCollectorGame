// Kiểm tra dữ liệu game lúc khởi động app. File này không import Electron để test được.

import type { GameDataResult } from '@core'

/** Số dòng lỗi tối đa hiện trong hộp thoại. */
export const MAX_ISSUE_LINES = 20

/** Nội dung hộp thoại lỗi: tối đa maxLines dòng, phần thừa ghi "... và X lỗi khác". */
export function formatDataIssues(issues: string[], maxLines = MAX_ISSUE_LINES): string {
  const shown = issues.slice(0, maxLines).map((issue) => `• ${issue}`)
  const hidden = issues.length - shown.length
  if (hidden > 0) shown.push(`... và ${hidden} lỗi khác`)
  return [
    `Dữ liệu game (src/data/*.json) có ${issues.length} lỗi nên game không thể chạy:`,
    '',
    ...shown
  ].join('\n')
}

/** Tóm tắt một dòng khi dữ liệu hợp lệ (in ra console ở dev mode). */
export function summarizeGameData(result: Extract<GameDataResult, { ok: true }>): string {
  const { data } = result
  const count = (record: Record<string, unknown>): number => Object.keys(record).length
  return (
    `Dữ liệu game hợp lệ: ${count(data.species)} loài, ${count(data.skills)} skill, ` +
    `${count(data.traits)} trait, ${count(data.items)} vật phẩm, ${count(data.biomes)} biome`
  )
}
