// Độ thuần huyết mạch đến từ đâu (docs/rules/bloodline.md mục "Độ thuần đến từ đâu"): quái hoang /
// boss, con breeding (kèm đột biến phản tổ, sinh loài tổ), fuse, thắng trận boss; kiểm tra trường
// `bloodlines` của quái. Tra cứu theo dữ liệu (thành viên, huyết mạch chính...) ở registries/bloodlines.ts.

import {
  bloodlineGroupsOf,
  isStoredPurity,
  mainBloodline,
  purityOf,
  withPurity
} from '../registries'
import { asObject, nextInt, pick, pickWeighted, rollPercent, type RngState } from '../shared'
import type { BloodlinePurity, GameData, Monster } from '../model'

/**
 * Độ thuần mỗi nhóm của quái hoang / boss: chọn khoảng theo wildPurityWeights rồi tung đều, cộng
 * `bonus` (boss), kẹp 100. Loài không thuộc nhóm nào thì không tốn RNG.
 */
export function rollWildBloodlines(
  data: GameData,
  rng: RngState,
  speciesId: string,
  bonus = 0
): [BloodlinePurity[], RngState] {
  let bloodlines: BloodlinePurity[] = []
  for (const groupId of bloodlineGroupsOf(data, speciesId)) {
    let tier: GameData['config']['bloodline']['wildPurityWeights'][number]
    ;[tier, rng] = pickWeighted(rng, data.config.bloodline.wildPurityWeights, (t) => t.weight)
    let purity: number
    ;[purity, rng] = nextInt(rng, tier.min, tier.max)
    bloodlines = withPurity(data, bloodlines, groupId, purity + bonus)
  }
  return [bloodlines, rng]
}

/**
 * Sinh loài tổ khi breed: mẹ (không fuse) có huyết mạch chính ≥ ancestorBirthMinPurity thì
 * ancestorBirthChance % con là một loài tổ ngẫu nhiên của nhóm đó. Không đủ điều kiện thì không tốn RNG.
 */
export function rollAncestorBirth(
  data: GameData,
  rng: RngState,
  mother: Monster
): [string | undefined, RngState] {
  const { ancestorBirthChance, ancestorBirthMinPurity } = data.config.bloodline
  const main = mainBloodline(mother)
  if (mother.fused || !main || main.purity < ancestorBirthMinPurity) return [undefined, rng]
  let born: boolean
  ;[born, rng] = rollPercent(rng, ancestorBirthChance)
  if (!born) return [undefined, rng]
  return pick(rng, data.bloodlines[main.groupId].ancestorSpeciesIds)
}

/**
 * Độ thuần của con breeding: mỗi nhóm loài con thuộc mà bố hoặc mẹ có độ thuần = trung bình của bố
 * mẹ (thiếu = 0) + số nguyên đều trong [−breedDownPoints, +breedUpPoints], kẹp [0, 100]; rồi
 * atavismMutationChance % huyết mạch chính của con +atavismMutationPoints (đột biến phản tổ). Nhóm
 * cả hai đều 0 thì không có (không tự sinh huyết mạch), không tốn RNG.
 */
export function rollChildBloodlines(
  data: GameData,
  rng: RngState,
  { speciesId, father, mother }: { speciesId: string; father: Monster; mother: Monster }
): [BloodlinePurity[], RngState] {
  const config = data.config.bloodline
  let bloodlines: BloodlinePurity[] = []
  for (const groupId of bloodlineGroupsOf(data, speciesId)) {
    const average = (purityOf(father, groupId) + purityOf(mother, groupId)) / 2
    if (average <= 0) continue
    let delta: number
    ;[delta, rng] = nextInt(rng, -config.breedDownPoints, config.breedUpPoints)
    bloodlines = withPurity(data, bloodlines, groupId, average + delta)
  }
  const main = mainBloodline({ bloodlines })
  if (!main) return [bloodlines, rng]
  let mutated: boolean
  ;[mutated, rng] = rollPercent(rng, config.atavismMutationChance)
  if (mutated) {
    bloodlines = withPurity(
      data,
      bloodlines,
      main.groupId,
      main.purity + config.atavismMutationPoints
    )
  }
  return [bloodlines, rng]
}

/**
 * Huyết mạch sau fuse: quái gốc giữ của mình, cộng fusePurityPercent % độ thuần của quái phụ ở các
 * nhóm mà loài gốc của quái gốc cũng thuộc; nhóm khác của quái phụ mất.
 */
export function fuseBloodlines(data: GameData, base: Monster, sub: Monster): BloodlinePurity[] {
  const share = data.config.bloodline.fusePurityPercent / 100
  return bloodlineGroupsOf(data, base.baseSpeciesId).reduce<BloodlinePurity[]>(
    (bloodlines, groupId) =>
      withPurity(
        data,
        bloodlines,
        groupId,
        purityOf(base, groupId) + purityOf(sub, groupId) * share
      ),
    [...base.bloodlines]
  )
}

/**
 * Độ thuần nhận khi thắng trận boss, theo nhóm: địch (bị hạ hoặc bị bắt) là loài tổ của nhóm thì
 * ancestorKillPurity, không thì địch thuộc nhóm cho bossKillPurity.
 */
export function bossKillPurityGains(
  data: GameData,
  defeated: readonly Monster[]
): Map<string, number> {
  const { bossKillPurity, ancestorKillPurity } = data.config.bloodline
  const gains = new Map<string, number>()
  const raise = (groupId: string, amount: number): void => {
    gains.set(groupId, Math.max(gains.get(groupId) ?? 0, amount))
  }
  for (const enemy of defeated) {
    for (const groupId of bloodlineGroupsOf(data, enemy.baseSpeciesId))
      raise(groupId, bossKillPurity)
    for (const group of Object.values(data.bloodlines)) {
      if (group.ancestorSpeciesIds.includes(enemy.baseSpeciesId))
        raise(group.id, ancestorKillPurity)
    }
  }
  return gains
}

/** Cộng độ thuần theo `gains` vào các nhóm loài gốc của quái thuộc. */
export function applyPurityGains(
  data: GameData,
  monster: Monster,
  gains: ReadonlyMap<string, number>
): Monster {
  let bloodlines = monster.bloodlines
  for (const groupId of bloodlineGroupsOf(data, monster.baseSpeciesId)) {
    const gain = gains.get(groupId) ?? 0
    if (gain > 0)
      bloodlines = withPurity(data, bloodlines, groupId, purityOf(monster, groupId) + gain)
  }
  return bloodlines === monster.bloodlines ? monster : { ...monster, bloodlines }
}

/**
 * Kiểm tra `bloodlines` của quái: danh sách `{ groupId, purity }`, nhóm tồn tại và loài gốc thuộc
 * nhóm, độ thuần trong (0, 100] tối đa 1 chữ số thập phân, không lặp, đúng thứ tự bloodlines.json.
 */
export function validateBloodlines(data: GameData, monster: Monster, field: string): string[] {
  const value: unknown = monster.bloodlines
  if (!Array.isArray(value)) return [`${field} phải là danh sách`]
  const groups = bloodlineGroupsOf(data, monster.baseSpeciesId)
  const order = Object.keys(data.bloodlines)
  const issues: string[] = []
  let lastIndex = -1
  value.forEach((raw: unknown, i) => {
    const where = `${field}[${i}]`
    const entry = asObject(raw)
    if (!entry) {
      issues.push(`${where} phải là object`)
      return
    }
    for (const field of Object.keys(entry)) {
      if (field !== 'groupId' && field !== 'purity') issues.push(`${where}: trường lạ "${field}"`)
    }
    const groupId = entry.groupId
    if (typeof groupId !== 'string' || !groups.includes(groupId)) {
      issues.push(`${where}: loài "${monster.baseSpeciesId}" không thuộc nhóm "${String(groupId)}"`)
      return
    }
    if (!isStoredPurity(entry.purity)) {
      issues.push(`${where}.purity phải trong (0, 100], tối đa 1 chữ số thập phân`)
    }
    const index = order.indexOf(groupId)
    if (index <= lastIndex) issues.push(`${where}: nhóm lặp hoặc sai thứ tự`)
    lastIndex = Math.max(lastIndex, index)
  })
  return issues
}
