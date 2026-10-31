// Nạp dữ liệu game thật cho lần chạy mô phỏng (luồng chính và từng worker), kiểm tra trước khi chạy.

import { tryCreateGameData, type GameData, type RawGameData } from '@core'
import { rawGameData } from '@data'

/** Kiểm tra toàn bộ dữ liệu game; lỗi thì ném kèm danh sách lỗi. */
export function loadGameData(): { raw: RawGameData; data: GameData } {
  const checked = tryCreateGameData(rawGameData)
  if (!checked.ok) throw new Error(`Dữ liệu game lỗi:\n${checked.issues.join('\n')}`)
  return { raw: rawGameData, data: checked.data }
}
