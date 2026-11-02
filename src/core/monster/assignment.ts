// Việc của quái (docs/rules/expeditions.md): quái đang làm việc bị khóa. Điểm duy nhất hỏi "quái
// có đang bận không" để mọi action khóa quái (vào đội, fuse, breed, thả, kẹo) báo cùng một lỗi.

import { ActionError } from '../shared'
import type { Monster } from '../model'

/** Quái đang khóa thì ném monsterLocked (mọi action làm mất quái gọi hàm này, docs/rules/roster.md). */
export function assertNotLocked(monster: Monster): void {
  if (monster.locked) throw new ActionError('monsterLocked', { monsterId: monster.id })
}

/** Quái shiny / boss bắt về tự khóa (mở được). */
export const autoLockCaught = (monster: Monster): Monster =>
  monster.shinyStacks > 0 || monster.bossMultiplier > 1 ? { ...monster, locked: true } : monster

/** Quái đang làm việc thì ném monsterBusy. */
export function assertNotBusy(monster: Monster): void {
  if (monster.assignment !== null) throw new ActionError('monsterBusy', { monsterId: monster.id })
}
