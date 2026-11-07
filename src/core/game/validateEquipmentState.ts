// Kiểm tra phần trang bị của cả save (mục "Trang bị và đồ cầm" ở equipment.md): id món không trùng
// giữa túi, quái, trứng, trận, cửa hàng và cửa hàng tạm của event; nextItemId lớn hơn mọi id; quái của người chơi lắp không
// quá số ô; lý lịch trong phần hồn của hồn khí (soul-relics.md). Từng món đã được kiểm tra ở validateInventory / validateShop / validateMonster.

import { equipmentIdNumber, equipmentSlotCount } from '../inventory'
import { stickerIdNumber } from '../registries'
import { validateHistory } from '../monster'
import type { GameData } from '../model'
import { asObject, checkInteger } from '../shared'

type Raw = Record<string, unknown>

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Các món trang bị (object thô) đang lắp trên một quái. */
function equippedInstances(monster: unknown): unknown[] {
  return listOf(asObject(monster)?.equipment).map((entry) => asObject(entry)?.instance)
}

/** Quái của người chơi (đội, kho, quái đã bắt trong trận) kèm đường dẫn, để kiểm tra số ô. */
function ownedMonsters(state: Raw): { monster: unknown; path: string }[] {
  const battle = asObject(state.battle)
  const lists: [unknown, string][] = [
    [state.party, 'party'],
    [state.storage, 'storage'],
    [battle?.captured, 'battle.captured']
  ]
  return lists.flatMap(([list, path]) =>
    listOf(list).map((monster, i) => ({ monster, path: `${path}[${i}]` }))
  )
}

/**
 * Mọi món trang bị (object thô) trong save: trên quái (kể cả trong trứng), trong túi, cửa hàng, cửa
 * hàng tạm, Đấu giá hành.
 */
function allEquipmentInstances(state: Raw): Raw[] {
  const battle = asObject(state.battle)
  const monsters = [
    ...listOf(state.party),
    ...listOf(state.storage),
    ...listOf(state.eggs).map((egg) => asObject(egg)?.monster),
    ...listOf(battle?.enemies),
    ...listOf(battle?.captured)
  ]
  const bag = listOf(asObject(state.inventory)?.equipment)
  // Món đang đi Khí giới bí cảnh (docs/rules/artifact-spirits.md) tạm rời túi.
  const trial = asObject(state.trial)
  const inItemWorld = trial?.kind === 'itemWorld' ? [trial.instance] : []
  const shop = listOf(asObject(state.shop)?.stock).map((entry) => asObject(entry)?.instance)
  // Cửa hàng tạm của event (docs/rules/events.md).
  const tempShop = listOf(asObject(asObject(state.events)?.tempShop)?.stock).map(
    (entry) => asObject(asObject(entry)?.entry)?.instance
  )
  // Đấu giá hành (docs/rules/auction.md): món trong lô, đồ ký gửi, món giữ hộ.
  const auction = asObject(state.auction)
  const auctionEntries = [
    ...listOf(auction?.lots).map((lot) => asObject(asObject(lot)?.good)?.entry),
    ...listOf(auction?.consignments).map((consignment) => asObject(consignment)?.entry)
  ].map((entry) => asObject(entry)?.instance)
  return [
    ...monsters.flatMap(equippedInstances),
    ...bag,
    ...inItemWorld,
    ...shop,
    ...tempShop,
    ...auctionEntries,
    ...listOf(auction?.held)
  ].flatMap((instance) => {
    const object = asObject(instance)
    return object ? [object] : []
  })
}

/** Id mọi sticker trong save: trong túi và trên skill của quái (kể cả trong trứng, trong trận). */
function allStickerIds(state: Raw): string[] {
  const battle = asObject(state.battle)
  const monsters = [
    ...listOf(state.party),
    ...listOf(state.storage),
    ...listOf(state.eggs).map((egg) => asObject(egg)?.monster),
    ...listOf(battle?.enemies),
    ...listOf(battle?.captured)
  ]
  const onMonsters = monsters.flatMap((monster) =>
    Object.values(asObject(asObject(monster)?.skillStickers) ?? {})
  )
  return [...listOf(asObject(state.inventory)?.stickers), ...onMonsters].flatMap((sticker) => {
    const id = asObject(sticker)?.id
    return typeof id === 'string' ? [id] : []
  })
}

/** Lý lịch trong phần hồn của hồn khí (phần còn lại kiểm tra ở validateEquipmentInstance). */
function checkSoulHistories(data: GameData, instances: readonly Raw[], issues: string[]): void {
  for (const instance of instances) {
    const soul = asObject(instance.soul)
    if (!soul) continue
    issues.push(...validateHistory(data, soul.history, `món "${String(instance.id)}".soul.history`))
  }
}

/** Kiểm tra phần trang bị của save. Trả về danh sách lỗi. */
export function validateEquipmentState(data: GameData, state: Raw): string[] {
  const issues: string[] = []
  issues.push(...checkInteger(state.nextItemId, 'nextItemId', 1))
  const seen = new Set<string>()
  let maxId = 0
  const instances = allEquipmentInstances(state)
  checkSoulHistories(data, instances, issues)
  const ids = instances.flatMap((instance) =>
    typeof instance.id === 'string' ? [instance.id] : []
  )
  // Sticker dùng chung bộ đếm nextItemId (docs/rules/skill-stickers.md).
  let maxLabel = ''
  for (const id of [...ids, ...allStickerIds(state)]) {
    if (seen.has(id)) issues.push(`id món trang bị bị trùng "${id}"`)
    seen.add(id)
    const number = equipmentIdNumber(id) ?? stickerIdNumber(id) ?? 0
    if (number > maxId) {
      maxId = number
      maxLabel = id
    }
  }
  if (typeof state.nextItemId === 'number' && state.nextItemId <= maxId) {
    issues.push(`nextItemId phải lớn hơn mọi id món trang bị (hiện có ${maxLabel})`)
  }
  const realm = asObject(state.tamer)?.realm
  const ascension = asObject(state.ascension)
  if (
    Number.isSafeInteger(state.highestFloor) &&
    Number.isSafeInteger(realm) &&
    Number.isSafeInteger(ascension?.bestFloor) &&
    Number.isSafeInteger(ascension?.bestRealm)
  ) {
    // Đã kiểm tra là số nguyên (cảnh giới sai do validateGameState báo).
    const slots = equipmentSlotCount(data, {
      highestFloor: state.highestFloor as number,
      tamer: { realm: realm as number },
      ascension: {
        bestFloor: ascension?.bestFloor as number,
        bestRealm: ascension?.bestRealm as number
      }
    })
    for (const { monster, path } of ownedMonsters(state)) {
      const count = listOf(asObject(monster)?.equipment).length
      if (count > slots) issues.push(`${path}.equipment: lắp ${count} món, quá ${slots} ô`)
    }
  }
  return issues
}
