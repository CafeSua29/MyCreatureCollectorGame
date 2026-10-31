// Việc của quái (docs/rules/expeditions.md): quái đang làm việc bị khóa. Điểm duy nhất hỏi "quái
// có đang bận không" để mọi action khóa quái (vào đội, fuse, breed, thả, kẹo) báo cùng một lỗi.

import { ActionError } from '../shared'
import type { Monster } from '../model'

/** Quái đang làm việc thì ném monsterBusy. */
export function assertNotBusy(monster: Monster): void {
  if (monster.assignment !== null) throw new ActionError('monsterBusy', { monsterId: monster.id })
}
