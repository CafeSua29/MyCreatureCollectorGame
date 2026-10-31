// Trường tuổi của quái mới sinh (mục "Tuổi và thọ nguyên" ở lifespan.md): dùng chung cho mọi nơi
// tạo quái (quái hoang, trứng, breed, trứng truyền thừa).

import { BIG_ZERO, checkBig, checkInteger, type Decimal } from '../shared'
import type { GameData, Monster } from '../model'

/** Các trường tuổi / thọ nguyên trên quái. */
export type LifeFields = Pick<
  Monster,
  'ageDays' | 'aging' | 'maxLevelReached' | 'lifespanBonusYears' | 'itemUseCounts'
>

/** Quái mới sinh: tuổi 0, chưa cộng năm nào, chưa dùng vật phẩm nào. */
export function newLifeFields(level: number, aging: boolean): LifeFields {
  const lifespanBonusYears: Decimal = BIG_ZERO
  return { ageDays: 0, aging, maxLevelReached: level, lifespanBonusYears, itemUseCounts: {} }
}

/** Kiểm tra các trường tuổi của quái; `at` dựng đường dẫn trường cho câu lỗi. */
export function checkLifeFields(
  data: GameData,
  monster: Monster,
  at: (field: string) => string
): string[] {
  const issues = [
    ...checkInteger(monster.ageDays, at('ageDays'), 0),
    ...checkInteger(monster.maxLevelReached, at('maxLevelReached'), 1),
    ...checkBig(monster.lifespanBonusYears, at('lifespanBonusYears'), 0)
  ]
  if (typeof monster.aging !== 'boolean') issues.push(`${at('aging')} phải là boolean`)
  const counts = monster.itemUseCounts
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) {
    issues.push(`${at('itemUseCounts')} phải là object`)
    return issues
  }
  for (const [itemId, count] of Object.entries(counts)) {
    if (!(itemId in data.items)) issues.push(`${at('itemUseCounts')}: vật phẩm lạ "${itemId}"`)
    issues.push(...checkInteger(count, at(`itemUseCounts.${itemId}`), 1))
  }
  return issues
}

// Phép tính tuổi / thọ nguyên nằm ở registries/lifespan.ts (bước % chỉ số cần, registries nằm dưới
// monster); xuất lại ở đây để bên ngoài core dùng qua '@core'.
export {
  ageDaysAtPercent,
  ageStage,
  ageYears,
  hasReachedLifespanEnd,
  lifePercent,
  lifespanYears,
  yearsLeft
} from '../registries'
