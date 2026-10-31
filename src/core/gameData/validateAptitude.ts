// Kiểm tra bậc tư chất (docs/rules/aptitude.md): aptitudeTiers.json.
// Danh sách / id trùng đã kiểm ở indexById (createGameData); ở đây kiểm ngưỡng.

import type { GameData } from '../model'
import { checkThresholdTiers } from './checks'

/** Ít nhất một bậc, bậc đầu từ 0 (quái nào cũng có bậc), `from` là số tăng dần ngặt. */
export function checkAptitudeTiers(data: GameData, issues: string[]): void {
  checkThresholdTiers(
    Object.values(data.aptitudeTiers),
    { file: 'aptitudeTiers', label: 'bậc tư chất' },
    issues
  )
}
