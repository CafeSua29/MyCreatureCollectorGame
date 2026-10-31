// Kích cỡ quái (docs/rules/monster-size.md): suy ra từ cân nặng (weight.ts), không lưu trong save.
// Quái lớn chiếm cả 2 ô sân, hành động 1 lần mỗi lượt như quái khác nhưng chỉ số × statMultipliers và
// sát thương skill × damageMultiplier (bù cho việc chiếm 2 ô), chiếm
// largePartySlots ô đội. Điểm duy nhất hỏi kích cỡ và số ô đội.

import type { GameData, Monster, NormalSpecies, StatName } from '../model'
import { monsterWeightKg, speciesWeightKg } from './weight'

export const MONSTER_SIZES = ['normal', 'large'] as const
export type MonsterSize = (typeof MONSTER_SIZES)[number]

const sizeOfWeight = (data: GameData, weightKg: number): MonsterSize =>
  weightKg >= data.config.size.largeWeightKg ? 'large' : 'normal'

/** Kích cỡ của loài thường theo cân nặng. */
export function speciesSize(data: GameData, species: NormalSpecies): MonsterSize {
  return sizeOfWeight(data, speciesWeightKg(data, species))
}

/** Kích cỡ theo (loài, loài gốc), nhớ theo bộ dữ liệu: chỉ số tính lại rất nhiều lần mỗi trận. */
const sizeCache = new WeakMap<GameData, Map<string, MonsterSize>>()

/**
 * Kích cỡ của quái: theo loài hiện tại (quái fuse: loài gốc), không theo dạng biến hình (Mega /
 * gmax chỉ đổi dạng trong trận nên kích cỡ không đổi giữa trận). Loài không tồn tại (save hỏng
 * đang được kiểm tra) coi là thường.
 */
export function monsterSize(
  data: GameData,
  monster: Pick<Monster, 'speciesId' | 'baseSpeciesId'>
): MonsterSize {
  let cache = sizeCache.get(data)
  if (!cache) sizeCache.set(data, (cache = new Map()))
  const key = `${monster.speciesId}|${monster.baseSpeciesId}`
  const cached = cache.get(key)
  if (cached) return cached
  const known =
    data.species[monster.speciesId]?.kind === 'normal' ||
    data.species[monster.baseSpeciesId]?.kind === 'normal'
  const size = known ? sizeOfWeight(data, monsterWeightKg(data, monster)) : 'normal'
  cache.set(key, size)
  return size
}

/** Quái lớn (chiếm cả 2 ô sân). */
export const isLargeMonster = (
  data: GameData,
  monster: Pick<Monster, 'speciesId' | 'baseSpeciesId'>
): boolean => monsterSize(data, monster) === 'large'

/** Hệ số chỉ số theo kích cỡ (bước biến hình / HP của thứ tự tính chỉ số); thiếu = 1. */
export const sizeStatMultiplier = (
  data: GameData,
  monster: Pick<Monster, 'speciesId' | 'baseSpeciesId'>,
  stat: StatName
): number => (isLargeMonster(data, monster) ? (data.config.size.statMultipliers[stat] ?? 1) : 1)

/** Hệ số sát thương skill theo kích cỡ của quái đánh. */
export const sizeDamageMultiplier = (
  data: GameData,
  monster: Pick<Monster, 'speciesId' | 'baseSpeciesId'>
): number => (isLargeMonster(data, monster) ? data.config.size.damageMultiplier : 1)

/** Số ô đội quái chiếm: thường 1, lớn largePartySlots. */
export const partySlotsOf = (
  data: GameData,
  monster: Pick<Monster, 'speciesId' | 'baseSpeciesId'>
): number => (isLargeMonster(data, monster) ? data.config.size.largePartySlots : 1)

/** Tổng số ô đội các quái chiếm. */
export const partySlotsUsed = (
  data: GameData,
  monsters: readonly Pick<Monster, 'speciesId' | 'baseSpeciesId'>[]
): number => monsters.reduce((total, monster) => total + partySlotsOf(data, monster), 0)

/** Đội (kể cả quái sắp vào cùng lúc trong `party`) còn đủ ô cho `monster` không. */
export const hasPartyRoom = (
  data: GameData,
  party: readonly Pick<Monster, 'speciesId' | 'baseSpeciesId'>[],
  monster: Pick<Monster, 'speciesId' | 'baseSpeciesId'>
): boolean => partySlotsUsed(data, party) + partySlotsOf(data, monster) <= data.config.partySize

/**
 * Quái mới vào đội lần lượt (quái không đủ ô thì về kho): trả về đội sau khi nhận. Dùng chung cho
 * quái bắt / thu phục trong trận (vào đội lúc hết trận theo đúng thứ tự này).
 */
export function partyAfterJoining<T extends Pick<Monster, 'speciesId' | 'baseSpeciesId'>>(
  data: GameData,
  party: readonly T[],
  newcomers: readonly T[]
): T[] {
  return newcomers.reduce<T[]>(
    (current, monster) => (hasPartyRoom(data, current, monster) ? [...current, monster] : current),
    [...party]
  )
}
