// "Người chơi" cho ăn thiên tài địa bảo (mục "Thiên tài địa bảo" ở simulation-features.md,
// docs/rules/treasures.md): sau mỗi trận dùng hết địa bảo trong túi lên quái đội mẫu: đúng khẩu vị
// thì ưu tiên quái đó, không thì quái ăn ít món đó nhất (kháng); Ngộ Đạo Trà cho skill power cao
// nhất. Món không có tác dụng (kháng quá nhiều, không trait nâng được) thì để lại. Món thuộc nhóm
// nguyên liệu (config.itemGroups, ví dụ yêu đan) chỉ cho quái đúng khẩu vị ăn; không ai đúng khẩu
// vị thì giữ lại để luyện đan / đúc trang bị (giả định của mô phỏng).

import {
  ActionError,
  isFavoriteItem,
  itemNeedsSkill,
  type ConsumableItem,
  type GameData,
  type GameState,
  type Monster
} from '@core'
import { simAct } from './events'

/** Hiệu ứng của thiên tài địa bảo (treasureEffects.ts); vật phẩm có hiệu ứng này là địa bảo. */
const TREASURE_EFFECT_TYPES: readonly string[] = [
  'addGenes',
  'addGenesAll',
  'addGenesTopStat',
  'addMasteryExp',
  'traitLevelUp'
]

function treasureItem(data: GameData, itemId: string): ConsumableItem | null {
  const item = data.items[itemId]
  if (item?.category !== 'consumable' || item.use === 'battle') return null
  return item.effects.some((effect) => TREASURE_EFFECT_TYPES.includes(effect.type)) ? item : null
}

/** Món là nguyên liệu nhóm (yêu đan...): chỉ quái đúng khẩu vị mới ăn. */
const isGroupMaterial = (data: GameData, itemId: string): boolean =>
  Object.values(data.config.itemGroups).some((itemIds) => itemIds.includes(itemId))

/** Quái ăn: đúng khẩu vị trước, rồi quái ăn ít món này nhất (đội mẫu theo thứ tự đội). */
function eater(
  data: GameData,
  item: ConsumableItem,
  team: readonly Monster[]
): Monster | undefined {
  const uses = (m: Monster): number => m.itemUseCounts[item.id] ?? 0
  const favorites = team.filter((m) => isFavoriteItem(data, item, m))
  if (favorites.length === 0 && isGroupMaterial(data, item.id)) return undefined
  const pool = favorites.length > 0 ? favorites : team
  return pool.reduce<Monster | undefined>(
    (best, m) => (best === undefined || uses(m) < uses(best) ? m : best),
    undefined
  )
}

const strongestSkill = (data: GameData, monster: Monster): string =>
  monster.skillIds.reduce((best, id) =>
    data.skills[id].power > data.skills[best].power ? id : best
  )

/** Dùng hết địa bảo trong túi lên đội mẫu; trả state mới và số món đã dùng. */
export function feedTreasures(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; used: number } {
  let used = 0
  for (const [itemId, count] of Object.entries(state.inventory.stacks)) {
    const item = treasureItem(data, itemId)
    if (!item) continue
    for (let i = 0; i < count; i++) {
      const monster = eater(
        data,
        item,
        state.party.filter((m) => teamIds.has(m.id))
      )
      if (!monster) break
      const skillId = itemNeedsSkill(item) ? strongestSkill(data, monster) : undefined
      try {
        state = simAct(data, state, {
          type: 'useItem',
          itemId,
          monsterId: monster.id,
          ...(skillId ? { skillId } : {})
        })
        used++
      } catch (error) {
        // Không có tác dụng (kháng quá nhiều, không trait nâng được): giữ lại, thử món khác.
        if (error instanceof ActionError && error.code === 'itemNoEffect') break
        throw error
      }
    }
  }
  return { state, used }
}
