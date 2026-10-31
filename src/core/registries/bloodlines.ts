// Huyết mạch (docs/rules/bloodline.md), điểm duy nhất cho mọi câu hỏi theo dữ liệu: loài thuộc nhóm
// nào, huyết mạch chính của quái, cấp trait huyết mạch, chỉ số gốc pha huyết mạch, hệ số thọ nguyên,
// đặt / cộng độ thuần. Đặt ở registries để chỉ số (monster/), hook trait, thọ nguyên dùng chung.

import { evolutionLineOf } from '../inventory'
import {
  BATTLE_FORM_KINDS,
  STAT_NAMES,
  type BloodlineDef,
  type BloodlinePurity,
  type GameData,
  type Monster,
  type Stats,
  type TraitInstance
} from '../model'
import { raceMatchesAny } from './races'

/** Độ thuần tối đa (điểm %) và số chữ số thập phân được lưu. */
export const MAX_PURITY = 100
const PURITY_DECIMALS = 10

/** Làm tròn 1 chữ số thập phân, kẹp [0, 100]. */
export const clampPurity = (value: number): number =>
  Math.min(MAX_PURITY, Math.max(0, Math.round(value * PURITY_DECIMALS) / PURITY_DECIMALS))

/** Độ thuần hợp lệ để lưu: trong (0, 100], tối đa 1 chữ số thập phân. */
export const isStoredPurity = (value: unknown): value is number =>
  typeof value === 'number' &&
  value > 0 &&
  value <= MAX_PURITY &&
  Math.abs(value * PURITY_DECIMALS - Math.round(value * PURITY_DECIMALS)) < 1e-9

/** Loài khớp trực tiếp luật thành viên của nhóm (chưa xét chuỗi tiến hóa, loại trừ). */
function matchesDirectly(
  data: GameData,
  group: BloodlineDef,
  listed: ReadonlySet<string>,
  speciesId: string
): boolean {
  const species = data.species[speciesId]
  if (species?.kind !== 'normal') return false
  return (
    listed.has(speciesId) ||
    raceMatchesAny(data, species.raceId, group.raceIds ?? []) ||
    species.elementIds.some((id) => (group.elementIds ?? []).includes(id))
  )
}

/** Loài → id các nhóm (thứ tự bloodlines.json); tính một lần cho mỗi bộ dữ liệu. */
const membershipCache = new WeakMap<GameData['bloodlines'], Map<string, string[]>>()

function membership(data: GameData): Map<string, string[]> {
  const cached = membershipCache.get(data.bloodlines)
  if (cached) return cached
  const groups = Object.values(data.bloodlines)
  const direct = groups.map((group) => {
    const listed = new Set(group.speciesIds ?? [])
    return new Set(
      Object.keys(data.species).filter((id) => matchesDirectly(data, group, listed, id))
    )
  })
  const result = new Map<string, string[]>()
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate')) {
      continue
    }
    // Cả chuỗi tiến hóa cùng huyết mạch: tiến hóa không làm mất huyết mạch (Magikarp → Gyarados).
    const line = evolutionLineOf(data, species.id)
    const ids = groups
      .filter(
        (group, i) =>
          !group.ancestorSpeciesIds.includes(species.id) &&
          !(group.excludeSpeciesIds ?? []).includes(species.id) &&
          line.some((id) => direct[i].has(id))
      )
      .map((group) => group.id)
    if (ids.length > 0) result.set(species.id, ids)
  }
  membershipCache.set(data.bloodlines, result)
  return result
}

/**
 * Id các nhóm huyết mạch loài là thành viên (thứ tự bloodlines.json): loài trong chuỗi tiến hóa
 * khớp race / hệ / danh sách loài của nhóm, trừ loài bị loại và loài tổ của chính nhóm đó.
 */
export function bloodlineGroupsOf(data: GameData, speciesId: string): readonly string[] {
  return membership(data).get(speciesId) ?? []
}

/** Loài có thuộc ít nhất một nhóm huyết mạch không. */
export const hasBloodline = (data: GameData, speciesId: string): boolean =>
  bloodlineGroupsOf(data, speciesId).length > 0

/** Id các nhóm mà loài là loài tổ. */
export function ancestorGroupsOf(data: GameData, speciesId: string): string[] {
  return Object.values(data.bloodlines)
    .filter((group) => group.ancestorSpeciesIds.includes(speciesId))
    .map((group) => group.id)
}

/** Độ thuần của quái ở một nhóm (0 nếu không có). */
export const purityOf = (monster: Pick<Monster, 'bloodlines'>, groupId: string): number =>
  monster.bloodlines.find((entry) => entry.groupId === groupId)?.purity ?? 0

/**
 * Huyết mạch chính: nhóm có độ thuần cao nhất; hòa thì theo thứ tự trong bloodlines.json (bloodlines
 * của quái lưu đúng thứ tự đó nên lấy nhóm đầu). Không có huyết mạch thì undefined.
 */
export function mainBloodline(monster: Pick<Monster, 'bloodlines'>): BloodlinePurity | undefined {
  let best: BloodlinePurity | undefined
  for (const entry of monster.bloodlines) if (!best || entry.purity > best.purity) best = entry
  return best
}

/** Cấp trait huyết mạch = số mốc độ thuần đã đạt (0 = chưa có trait). */
export const bloodlineTraitLevel = (data: GameData, purity: number): number =>
  data.config.bloodline.milestones.filter((milestone) => purity >= milestone).length

/** Trait huyết mạch của quái (suy từ huyết mạch chính, không lưu); undefined nếu chưa đạt mốc nào. */
export function bloodlineTraitOf(data: GameData, monster: Monster): TraitInstance | undefined {
  const main = mainBloodline(monster)
  if (!main) return undefined
  const level = bloodlineTraitLevel(data, main.purity)
  return level > 0 ? { id: data.bloodlines[main.groupId].traitId, level } : undefined
}

/** Trung bình chỉ số gốc của các loài tổ của nhóm. */
function ancestorBaseStats(data: GameData, groupId: string): Stats {
  const ancestors = data.bloodlines[groupId].ancestorSpeciesIds.flatMap((id) => {
    const species = data.species[id]
    return species?.kind === 'normal' ? [species.baseStats] : []
  })
  return Object.fromEntries(
    STAT_NAMES.map((stat) => [
      stat,
      ancestors.reduce((sum, stats) => sum + stats[stat], 0) / Math.max(1, ancestors.length)
    ])
  ) as Stats
}

/**
 * Chỉ số gốc pha huyết mạch chính (bước đầu của thứ tự tính chỉ số): từng chỉ số
 * max(gốc, (1 − p) × gốc + p × gốc tổ), p = độ thuần / 100 × mixAtFullPurity. Không bao giờ giảm.
 */
export function bloodlineBaseStats(data: GameData, monster: Monster, base: Stats): Stats {
  const main = mainBloodline(monster)
  if (!main) return base
  const share = (main.purity / MAX_PURITY) * data.config.bloodline.mixAtFullPurity
  const ancestor = ancestorBaseStats(data, main.groupId)
  return Object.fromEntries(
    STAT_NAMES.map((stat) => [
      stat,
      Math.max(base[stat], (1 - share) * base[stat] + share * ancestor[stat])
    ])
  ) as Stats
}

/**
 * Hệ số thọ nguyên của huyết mạch chính: 1 + (thọ nguyên loài tổ / thọ nguyên loài gốc − 1) × độ
 * thuần / 100, không dưới 1 (thọ nguyên loài tổ = trung bình các loài tổ có thọ nguyên).
 */
export function bloodlineLifespanMultiplier(data: GameData, monster: Monster): number {
  const main = mainBloodline(monster)
  const own = data.species[monster.baseSpeciesId]
  if (!main || own?.kind !== 'normal' || !own.lifespan) return 1
  const lifespans = data.bloodlines[main.groupId].ancestorSpeciesIds.flatMap((id) => {
    const species = data.species[id]
    return species?.kind === 'normal' && species.lifespan ? [species.lifespan] : []
  })
  if (lifespans.length === 0) return 1
  const ancestor = lifespans.reduce((sum, years) => sum + years, 0) / lifespans.length
  return Math.max(1, 1 + (ancestor / own.lifespan - 1) * (main.purity / MAX_PURITY))
}

/**
 * Đặt độ thuần của một nhóm (kẹp, làm tròn; 0 thì bỏ nhóm), giữ thứ tự bloodlines.json. Nơi gọi bảo
 * đảm loài gốc của quái thuộc nhóm.
 */
export function withPurity(
  data: GameData,
  bloodlines: readonly BloodlinePurity[],
  groupId: string,
  purity: number
): BloodlinePurity[] {
  const value = clampPurity(purity)
  const others = bloodlines.filter((entry) => entry.groupId !== groupId)
  const next = value > 0 ? [...others, { groupId, purity: value }] : others
  const order = Object.keys(data.bloodlines)
  return next.sort((a, b) => order.indexOf(a.groupId) - order.indexOf(b.groupId))
}

/** Cộng độ thuần vào một nhóm mà loài gốc của quái thuộc (không thuộc thì giữ nguyên). */
export function addPurity(
  data: GameData,
  monster: Monster,
  groupId: string,
  amount: number
): Monster {
  if (!bloodlineGroupsOf(data, monster.baseSpeciesId).includes(groupId)) return monster
  const bloodlines = withPurity(
    data,
    monster.bloodlines,
    groupId,
    purityOf(monster, groupId) + amount
  )
  return { ...monster, bloodlines }
}

/** Chỉ giữ các nhóm loài `speciesId` còn thuộc (sau khi đổi loài: tiến hóa, phản tổ). */
export function keepValidBloodlines(
  data: GameData,
  bloodlines: readonly BloodlinePurity[],
  speciesId: string
): BloodlinePurity[] {
  const groups = bloodlineGroupsOf(data, speciesId)
  return bloodlines.filter((entry) => groups.includes(entry.groupId))
}
