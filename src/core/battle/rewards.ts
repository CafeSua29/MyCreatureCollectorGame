// Nhận phần thưởng sau trận vào túi kèm log (dùng chung cho đồ rơi, trận NPC, rương bí cảnh, tháp).

import {
  addBooks,
  addEquipment,
  addItems,
  equipmentInstanceId,
  isBookableSkill,
  isSkillBookUsefulForParty,
  rollEquipment
} from '../inventory'
import { getMaxHp, percentOfMaxHp } from '../monster'
import { hasBagRoom } from '../registries'
import { BIG_ZERO, maxBig, minBig, pickWeighted, rollPercent, type Decimal } from '../shared'
import type {
  Biome,
  EquipmentInstance,
  EquipmentRarity,
  GameData,
  ItemReward,
  Monster
} from '../model'
import { Draft, log } from './draft'

/** Thêm item gộp chồng rơi từ quái vào túi và ghi log. */
export function gainDrop(d: Draft, itemId: string, count: number): void {
  d.inventory = addItems(d.inventory, itemId, count)
  log(d, { type: 'drop', itemId })
}

/** Thêm món vào túi và ghi log rơi; túi trang bị đầy thì món mất (docs/rules/capacity.md). */
export function gainEquipment(data: GameData, d: Draft, instance: EquipmentInstance): void {
  if (!hasBagRoom(data, d)) {
    log(d, { type: 'equipmentLost', itemId: instance.baseItemId, rarity: instance.rarity })
    return
  }
  d.inventory = addEquipment(d.inventory, instance)
  log(d, {
    type: 'equipmentDropped',
    instanceId: instance.id,
    itemId: instance.baseItemId,
    rarity: instance.rarity
  })
}

/** Tạo món mới (id từ nextItemId) rồi cho vào túi. */
export function gainNewEquipment(
  data: GameData,
  d: Draft,
  { itemId, rarity }: { itemId: string; rarity: EquipmentRarity }
): void {
  let instance: EquipmentInstance
  const id = equipmentInstanceId(d.nextItemId)
  ;[instance, d.rng] = rollEquipment(data, d.rng, { itemId, rarity, id })
  d.nextItemId++
  gainEquipment(data, d, instance)
}

/** Nhận các món thưởng cố định (số lượng), ghi log. */
export function grantItemRewards(d: Draft, rewards: readonly ItemReward[]): void {
  for (const { itemId, count } of rewards) {
    d.inventory = addItems(d.inventory, itemId, count)
    log(d, { type: 'itemRewarded', itemId, count })
  }
}

/**
 * Sách kỹ năng theo map (rương bí cảnh, thưởng thú triều): skill trong learnset các loài của map
 * (trừ skill không có sách), skill đội học được mà chưa biết × partyMultiplier như sách boss rơi;
 * reusableChance % là Chân kinh. Map không có skill nào có sách thì không tốn RNG.
 */
export function gainBiomeSkillBooks(
  data: GameData,
  d: Draft,
  { biome, count, reusableChance }: { biome: Biome; count: number; reusableChance: number }
): void {
  const skillIds = [
    ...new Set(
      biome.encounters.flatMap((entry) => {
        const species = data.species[entry.speciesId]
        return species?.kind === 'normal' ? species.learnset.map((learn) => learn.skillId) : []
      })
    )
  ].filter((id) => isBookableSkill(data, data.skills[id]))
  if (skillIds.length === 0) return
  const { partyMultiplier } = data.config.skillBook
  const weightOf = (id: string): number =>
    isSkillBookUsefulForParty(data, d.party, id) ? partyMultiplier : 1
  for (let i = 0; i < count; i++) {
    let skillId: string
    ;[skillId, d.rng] = pickWeighted(d.rng, skillIds, weightOf)
    let reusable: boolean
    ;[reusable, d.rng] = rollPercent(d.rng, reusableChance)
    d.inventory = addBooks(d.inventory, { skillId, reusable }, 1)
    log(d, { type: 'skillBookDropped', skillId, reusable })
  }
}

/**
 * Hồi `percent` % max HP cho mọi quái trong đội, kể cả quái đã gục (đứng dậy với phần máu đó), ghi
 * log heal (giữa các trận bí cảnh, giữa các đợt thú triều). 0 thì không làm gì.
 */
export function healPartyPercent(data: GameData, d: Draft, percent: number): void {
  if (percent <= 0) return
  d.party = d.party.map((monster) => {
    if (monster.damageTaken.lte(0)) return monster
    const healed = healPercentOfMaxHp(data, monster, percent)
    log(d, { type: 'heal', monsterId: monster.id, amount: healed.amount })
    return healed.monster
  })
}

/**
 * Hồi `percent` % max HP cho một quái, kể cả quái đã gục (đứng dậy với phần máu đó; máu đã mất có
 * thể vượt max HP do đòn quá tay: tính từ 0 máu). Trả quái mới và lượng máu hồi.
 */
export function healPercentOfMaxHp(
  data: GameData,
  monster: Monster,
  percent: number
): { monster: Monster; amount: Decimal } {
  const maxHp = getMaxHp(data, monster)
  const lost = minBig(monster.damageTaken, maxHp)
  const damageTaken = maxBig(BIG_ZERO, lost.minus(percentOfMaxHp(maxHp, percent)))
  return { monster: { ...monster, damageTaken }, amount: lost.minus(damageTaken) }
}
