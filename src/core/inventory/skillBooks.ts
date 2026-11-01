// Sách kỹ năng (docs/rules/skill-books.md): skill nào có sách, độ hiếm của sách theo số loài học được
// (learnset lấy từ game gốc: chiêu phổ biến ở game gốc có nhiều loài học) cộng bậc theo power, giá
// theo power + độ hiếm, quái nào học được sách (tương thích). Action học sách ở monster/skillBooks.ts.

import { pickWeighted, rollPercent, toBig, type Decimal, type RngState } from '../shared'
import {
  isBattleOnlyMove,
  type GameData,
  type Monster,
  type Skill,
  type SkillBookRarityDef
} from '../model'
import { evolutionLineOf } from './evolutionLine'
import type { BookKey } from './inventory'

/**
 * Skill có sách không: không phải chiêu Max / G-Max / Z-Move (chỉ có trong trận) và không phải hợp
 * kích kỹ (chỉ dùng qua lệnh hợp kích của hai quái).
 */
export function isBookableSkill(data: GameData, skill: Skill): boolean {
  return !isBattleOnlyMove(skill) && !Object.hasOwn(data.comboSkills, skill.id)
}

/** Số loài học được từng skill theo learnset + bookSkillIds; tính một lần cho mỗi bộ dữ liệu. */
const learnerCache = new WeakMap<GameData['species'], Map<string, number>>()

/**
 * Số loài thường học được skill bằng level (learnset) hoặc sách (bookSkillIds: TM / tutor của game
 * gốc), mỗi loài tính một lần. Chiêu trứng không tính (chỉ học qua breeding).
 */
export function skillLearnerCount(data: GameData, skillId: string): number {
  let counts = learnerCache.get(data.species)
  if (!counts) {
    counts = new Map<string, number>()
    for (const species of Object.values(data.species)) {
      if (species.kind !== 'normal') continue
      const ids = [
        ...species.learnset.map((entry) => entry.skillId),
        ...(species.bookSkillIds ?? [])
      ]
      for (const id of new Set(ids)) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    learnerCache.set(data.species, counts)
  }
  return counts.get(skillId) ?? 0
}

/**
 * Bậc hiếm của sách: bậc phổ biến nhất có minLearners ≤ số loài học được, rồi hiếm thêm một bậc mỗi
 * mốc power đạt (tối đa bậc cuối).
 */
export function skillBookRarityOf(data: GameData, skillId: string): SkillBookRarityDef {
  const { rarities, rarityPowerSteps } = data.config.skillBook
  const learners = skillLearnerCount(data, skillId)
  const found = rarities.findIndex((tier) => learners >= tier.minLearners)
  const base = found === -1 ? rarities.length - 1 : found
  const power = data.skills[skillId].power
  const bonus = rarityPowerSteps.filter((step) => power >= step).length
  return rarities[Math.min(base + bonus, rarities.length - 1)]
}

/** Skill học được theo chuỗi tiến hóa (learnset + bookSkillIds) của từng loài gốc; cache theo dữ liệu. */
const lineSkillCache = new WeakMap<GameData['species'], Map<string, Set<string>>>()

function lineSkillIds(data: GameData, speciesId: string): Set<string> {
  let cache = lineSkillCache.get(data.species)
  if (!cache) {
    cache = new Map()
    lineSkillCache.set(data.species, cache)
  }
  const cached = cache.get(speciesId)
  if (cached) return cached
  const skillIds = new Set<string>()
  for (const id of evolutionLineOf(data, speciesId)) {
    const species = data.species[id]
    if (species?.kind !== 'normal') continue
    for (const entry of species.learnset) skillIds.add(entry.skillId)
    for (const skillId of species.bookSkillIds ?? []) skillIds.add(skillId)
  }
  cache.set(speciesId, skillIds)
  return skillIds
}

/**
 * Quái học được skill từ sách không: skill cùng hệ với quái, skill hệ dùng chung
 * (`skillBook.universalElementIds`, hệ thường), hoặc skill có trong learnset / bookSkillIds của một
 * loài trong chuỗi tiến hóa của loài gốc (quái fuse: loài của quái gốc).
 */
export function isSkillBookCompatible(
  data: GameData,
  monster: Pick<Monster, 'elementIds' | 'baseSpeciesId'>,
  skillId: string
): boolean {
  const skill = Object.hasOwn(data.skills, skillId) ? data.skills[skillId] : undefined
  if (!skill) return false
  if (monster.elementIds.includes(skill.elementId)) return true
  if (data.config.skillBook.universalElementIds.includes(skill.elementId)) return true
  return lineSkillIds(data, monster.baseSpeciesId).has(skillId)
}

/** Có quái trong đội học được skill này từ sách mà chưa biết / chưa chờ học (kệ sách, boss rơi). */
export function isSkillBookUsefulForParty(
  data: GameData,
  party: readonly Pick<Monster, 'elementIds' | 'baseSpeciesId' | 'skillIds' | 'pendingSkillIds'>[],
  skillId: string
): boolean {
  return party.some(
    (monster) =>
      !monster.skillIds.includes(skillId) &&
      !monster.pendingSkillIds.includes(skillId) &&
      isSkillBookCompatible(data, monster, skillId)
  )
}

/**
 * Giá gốc của sách ở tầng cao nhất: (priceBase + power × pricePerPower) × hệ số bậc hiếm ×
 * highestFloor; Chân kinh × reusablePriceMultiplier; làm tròn xuống.
 */
export function skillBookPrice(data: GameData, book: BookKey, highestFloor: number): Decimal {
  const { priceBase, pricePerPower, reusablePriceMultiplier } = data.config.skillBook
  const power = data.skills[book.skillId].power
  const price = toBig(priceBase + power * pricePerPower)
    .times(skillBookRarityOf(data, book.skillId).priceMultiplier)
    .times(highestFloor)
  // Làm tròn xuống: hệ số bậc có thể lẻ (×1,5) mà giá luôn là số nguyên.
  return (book.reusable ? price.times(reusablePriceMultiplier) : price).floor()
}

/**
 * Tung `count` sách từ danh sách skill (rương bí cảnh, thưởng thú triều, boss thế giới): bỏ skill không
 * có sách, skill đội học được mà chưa biết × partyMultiplier như sách boss rơi, reusableChance % là
 * Chân kinh. Không còn skill nào có sách thì rỗng, không tốn RNG.
 */
export function rollSkillBooks(
  data: GameData,
  rng: RngState,
  {
    skillIds,
    party,
    count,
    reusableChance
  }: {
    skillIds: readonly string[]
    party: Parameters<typeof isSkillBookUsefulForParty>[1]
    count: number
    reusableChance: number
  }
): [BookKey[], RngState] {
  const bookable = [...new Set(skillIds)].filter((id) => isBookableSkill(data, data.skills[id]))
  if (bookable.length === 0) return [[], rng]
  const { partyMultiplier } = data.config.skillBook
  const weightOf = (id: string): number =>
    isSkillBookUsefulForParty(data, party, id) ? partyMultiplier : 1
  const books: BookKey[] = []
  for (let i = 0; i < count; i++) {
    let skillId: string
    ;[skillId, rng] = pickWeighted(rng, bookable, weightOf)
    let reusable: boolean
    ;[reusable, rng] = rollPercent(rng, reusableChance)
    books.push({ skillId, reusable })
  }
  return [books, rng]
}

/** Skill trong learnset của các loài (bỏ loài không phải loài thường). */
export const learnsetSkillIds = (data: GameData, speciesIds: readonly string[]): string[] =>
  speciesIds.flatMap((speciesId) => {
    const species = data.species[speciesId]
    return species?.kind === 'normal' ? species.learnset.map((learn) => learn.skillId) : []
  })
