// Fusing (NPC ở thị trấn): quái phụ mất đi, quái gốc mạnh lên. Race, hệ, gender nào cũng được,
// miễn quái phụ đóng góp ít nhất 1 loài chưa có ở quái gốc (điều kiện fuse, mục Fusing).
// Fuse có thể thất bại (tỉ lệ ở fusionChance.ts): mất cả hai quái, trừ khi có Bùa Hộ Mệnh thì
// giữ nguyên quái gốc. Tiền và bùa luôn mất.
//
// Quái gốc sau fuse thành công:
// - fusingBonusStats += ½ chỉ số của quái phụ ở bước withFusingBonus (sau cộng fusingBonusStats,
//   trước áp trait), cộng dồn vô hạn, giữ số thực.
// - traitSlots + 1 (tối đa trần ô trait của quái gốc: config.traitSlots.max + mốc ô trait thức tỉnh).
// - Trait thường random lại từ tổng trait của cả hai: trùng thì gộp cấp; xáo trộn rồi lấy dần cho
//   đủ ô; bốc phải trait loại trừ với trait đã chọn thì bỏ cả cặp và bốc bù tiếp; hết thì thiếu ô.
// - Trait boss gộp cấp (cộng); shinyStacks cộng dồn, trait shiny cấp = shinyStacks.
// - bossMultiplier = cao nhất của hai quái.
// - Loài chung "fused", fused = true, lineage thêm loài gốc + lineage của quái phụ (không lặp).
// - Giữ: baseSpeciesId, race, hệ, skill, level, EXP, gen, gender, biệt danh, máu đã mất,
//   skill chờ học. Xóa hướng tiến hóa chờ chọn (quái fuse không tiến hóa).
// - Kế thừa tối đa config.fusion.inheritSkills skill người chơi chọn của quái phụ (fusionSkills.ts).

import { assertNotBond } from '../tamer'
import { recordQuestEvent } from '../quests'
import {
  ActionError,
  levelCost,
  malformedAction,
  rollPercent,
  shuffle,
  spendMoney,
  type Decimal,
  type RngState
} from '../shared'
import {
  addMilestone,
  addShinyStacks,
  assertNotBusy,
  betterSpiritVirus,
  computeStats,
  fuseBloodlines,
  mapBigStats,
  mergeTraitLevel,
  soulFuseRefund,
  traitSlotCap
} from '../monster'
import { addSoulCrystalPoints, removeItems } from '../inventory'
import {
  assertOverflowConfirmed,
  fusionAidProtectsBase,
  fusionAidSlot,
  bumpStat,
  returnEquipmentWithinCapacity,
  yearsLeft,
  type FusionAidSlot
} from '../registries'
import {
  dayOf,
  usesTraitSlot,
  type BigStats,
  type FuseRaceMatch,
  type FusionAidItem,
  type GameData,
  type GameState,
  type Monster,
  type TraitInstance
} from '../model'
import { fuseRaceMatch, fuseSuccessChance } from './fusionChance'
import {
  NO_SKILL_INHERITANCE,
  applySkillInheritance,
  inheritableSkillIds,
  parseSkillInheritance,
  type SkillInheritance
} from './fusionSkills'

export function fuseCost(data: GameData, base: Monster, sub: Monster): Decimal {
  return levelCost(data.config.fuseCostPerLevel, base.level + sub.level)
}

/** Phần chỉ số quái gốc nhận thêm: ½ chỉ số withFusingBonus của quái phụ. */
export function fusionBonusGain(data: GameData, sub: Monster): BigStats {
  const subStats = computeStats(data, sub).withFusingBonus
  return mapBigStats((stat) => subStats[stat].div(2))
}

/** Loài đã có của quái gốc / loài đóng góp của quái phụ: loài gốc + các loài trong lineage. */
function speciesOf(monster: Monster): string[] {
  return [monster.baseSpeciesId, ...monster.lineage]
}

/**
 * Các loài quái phụ đóng góp mà quái gốc chưa có. Rỗng thì không fuse được: mỗi lần fuse phải
 * thêm ít nhất 1 loài mới (điều kiện fuse, mục Fusing).
 */
export function newFusionSpecies(base: Monster, sub: Monster): string[] {
  const owned = speciesOf(base)
  return [...new Set(speciesOf(sub))].filter((speciesId) => !owned.includes(speciesId))
}

/** Bùa fuse dùng cho ô `slot`: id phải là bùa fuse đúng ô; bỏ trống = không dùng. */
function findFusionAid(data: GameData, itemId: unknown, slot: FusionAidSlot): FusionAidItem | null {
  if (itemId === undefined) return null
  if (typeof itemId !== 'string') {
    throw malformedAction(`bùa fuse ô ${slot} phải là id`)
  }
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  if (item.category !== 'fusionAid' || fusionAidSlot(item) !== slot) {
    throw new ActionError('wrongFusionAid', { itemId, slot })
  }
  return item
}

/** Xem trước những gì chắc chắn (trait random lúc fuse nên không xem trước được). */
export function previewFusion(
  data: GameData,
  base: Monster,
  sub: Monster,
  boostItemId?: string
): {
  canFuse: boolean
  newSpeciesIds: string[]
  cost: Decimal
  /** Tỉ lệ % thành công, đã cộng bùa tăng tỉ lệ. */
  successChance: number
  raceMatch: FuseRaceMatch
  bonusGain: BigStats
  traitSlots: number
  shinyStacks: number
  bossMultiplier: number
  /** Skill của quái phụ chọn kế thừa được (tối đa config.fusion.inheritSkills). */
  inheritableSkillIds: string[]
  /** Điểm hồn tinh hoàn lại từ quái phụ (docs/rules/soul-levels.md). */
  soulCrystalRefund: number
} {
  const newSpeciesIds = newFusionSpecies(base, sub)
  const boostItem = findFusionAid(data, boostItemId, 'boost')
  return {
    canFuse: newSpeciesIds.length > 0,
    newSpeciesIds,
    cost: fuseCost(data, base, sub),
    successChance: fuseSuccessChance(data, base, sub, boostItem),
    raceMatch: fuseRaceMatch(data, base, sub),
    bonusGain: fusionBonusGain(data, sub),
    traitSlots: Math.min(traitSlotCap(data, base), base.traitSlots + 1),
    shinyStacks: base.shinyStacks + sub.shinyStacks,
    bossMultiplier: Math.max(base.bossMultiplier, sub.bossMultiplier),
    inheritableSkillIds: inheritableSkillIds(data, base, sub),
    soulCrystalRefund: soulFuseRefund(data, sub)
  }
}

const isSlotTrait = (data: GameData, trait: TraitInstance): boolean =>
  usesTraitSlot(data.traits[trait.id].kind)

/** Gộp trait trùng id (cộng cấp), giữ thứ tự xuất hiện đầu tiên. */
function mergeDuplicates(traits: TraitInstance[]): TraitInstance[] {
  const merged: TraitInstance[] = []
  for (const trait of traits) {
    const existing = merged.find((t) => t.id === trait.id)
    if (existing) existing.level += trait.level
    else merged.push({ ...trait })
  }
  return merged
}

/**
 * Chọn trait cho các ô: xáo trộn pool rồi lấy dần. Trait mới loại trừ với một trait đã chọn thì
 * bỏ cả hai và bốc bù tiếp; hết pool thì chấp nhận thiếu ô.
 */
export function pickFusionTraits(
  data: GameData,
  rng: RngState,
  pool: TraitInstance[],
  slots: number
): [TraitInstance[], RngState] {
  let shuffled: TraitInstance[]
  ;[shuffled, rng] = shuffle(rng, pool)
  const selected: TraitInstance[] = []
  for (const trait of shuffled) {
    if (selected.length >= slots) break
    const group = data.traits[trait.id].exclusiveGroup
    const clash =
      group === undefined
        ? -1
        : selected.findIndex((t) => data.traits[t.id].exclusiveGroup === group)
    if (clash >= 0) selected.splice(clash, 1)
    else selected.push(trait)
  }
  return [selected, rng]
}

/** Kết quả fuse của quái gốc (quái phụ do nơi gọi xóa đi); `inheritance` đã qua kiểm tra. */
export function fuseMonsters(
  data: GameData,
  rng: RngState,
  base: Monster,
  sub: Monster,
  inheritance: SkillInheritance = NO_SKILL_INHERITANCE
): [Monster, RngState] {
  const { config } = data
  const gain = fusionBonusGain(data, sub)
  const fusingBonusStats = mapBigStats((stat) => base.fusingBonusStats[stat].plus(gain[stat]))
  const traitSlots = Math.min(traitSlotCap(data, base), base.traitSlots + 1)

  const pool = mergeDuplicates([...base.traits, ...sub.traits].filter((t) => isSlotTrait(data, t)))
  let slotTraits: TraitInstance[]
  ;[slotTraits, rng] = pickFusionTraits(data, rng, pool, traitSlots)

  const lineage = [...base.lineage]
  for (const speciesId of [sub.baseSpeciesId, ...sub.lineage]) {
    if (!lineage.includes(speciesId)) lineage.push(speciesId)
  }

  // Quái fuse giữ mọi thứ còn lại của quái gốc, kể cả trạng thái bất thường (trạng thái của quái
  // phụ mất theo nó).
  let fused: Monster = {
    ...base,
    speciesId: config.fusedSpeciesId,
    fused: true,
    lineage,
    fusingBonusStats,
    traitSlots,
    traits: slotTraits,
    shinyStacks: 0,
    // Hiến tế: giữ stack của mình + stack của quái phụ, không +1 (docs/rules/sacrifice.md).
    sacrificeStacks: base.sacrificeStacks + sub.sacrificeStacks,
    // Luân hồi: giữ của mình + ½ của quái phụ, làm tròn xuống (docs/rules/rebirth.md).
    rebirths: base.rebirths + Math.floor(sub.rebirths / 2),
    // Cấy ghép: quái gốc giữ của mình (giữ qua ...base); phần cấy của quái phụ đã nằm trong chỉ số
    // withFusingBonus của nó nên tự truyền ½ qua fusingBonusStats (docs/rules/implant.md).
    bossMultiplier: Math.max(base.bossMultiplier, sub.bossMultiplier),
    // Thân mật lấy cao hơn của hai quái (docs/rules/affinity.md).
    affinity: Math.max(base.affinity, sub.affinity),
    // Linh dịch: giữ trạng thái tốt hơn của hai quái (docs/rules/spirit-virus.md).
    spiritVirus: betterSpiritVirus(base.spiritVirus, sub.spiritVirus),
    // Huyết mạch: cộng một phần độ thuần của quái phụ (docs/rules/bloodline.md).
    bloodlines: fuseBloodlines(data, base, sub),
    pendingEvolutionIds: [],
    // Hấp thu thọ nguyên (mục "Tuổi và thọ nguyên"): quái gốc giữ tuổi, nhận % số năm còn lại của
    // quái phụ; tắt thọ nguyên thì không hấp thu.
    lifespanBonusYears: base.aging
      ? base.lifespanBonusYears.plus(
          yearsLeft(data, sub).times(config.lifespan.fuseAbsorbPercent).div(100)
        )
      : base.lifespanBonusYears
  }

  const bossLevel = [...base.traits, ...sub.traits]
    .filter((t) => t.id === config.boss.traitId)
    .reduce((sum, t) => sum + t.level, 0)
  if (bossLevel > 0) fused = mergeTraitLevel(fused, config.boss.traitId, bossLevel)
  fused = addShinyStacks(data, fused, base.shinyStacks + sub.shinyStacks)
  return [applySkillInheritance(data, fused, sub, inheritance), rng]
}

/**
 * Lệnh fuse: quái gốc, quái phụ, tối đa 1 bùa tăng tỉ lệ và 1 Bùa Hộ Mệnh, skill kế thừa của quái
 * phụ (và skill quên để học ngay khi đủ ô).
 */
export interface FuseOrder {
  baseId: string
  subId: string
  boostItemId?: string
  protectItemId?: string
  inheritSkillIds?: readonly string[]
  forgetSkillIds?: readonly string[]
  /** Xác nhận bỏ món đang lắp không đủ chỗ về túi (docs/rules/capacity.md). */
  discardOverflow?: boolean
}

/** Đội trong trường hợp xấu nhất: mất quái phụ, và cả quái gốc nếu không được hộ mệnh. */
function worstCaseParty(state: GameState, order: FuseOrder, isProtected: boolean): Monster[] {
  return state.party.filter((m) => m.id !== order.subId && (isProtected || m.id !== order.baseId))
}

/** NPC fusing ở thị trấn. */
export function fuse(data: GameData, state: GameState, order: FuseOrder): GameState {
  const { baseId, subId } = order
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  if (baseId === subId) throw new ActionError('fuseSameMonster')
  const find = (id: string): Monster => {
    const monster = state.party.find((m) => m.id === id) ?? state.storage.find((m) => m.id === id)
    if (!monster) throw new ActionError('monsterNotOwned', { monsterId: id })
    // Quái đang thám hiểm bị khóa (docs/rules/expeditions.md).
    assertNotBusy(monster)
    return monster
  }
  const base = find(baseId)
  const sub = find(subId)
  // Bản mệnh thú không làm quái phụ (docs/rules/tamer.md mục "Bản mệnh thú").
  assertNotBond(sub)
  if (newFusionSpecies(base, sub).length === 0) {
    throw new ActionError('fuseNoNewSpecies', { speciesIds: speciesOf(sub) })
  }
  const boostItem = findFusionAid(data, order.boostItemId, 'boost')
  const protectItem = findFusionAid(data, order.protectItemId, 'protect')
  const isProtected = protectItem !== null && fusionAidProtectsBase(protectItem)
  const inheritance = parseSkillInheritance(data, base, sub, order)
  // Kiểm tra trước khi tung: đội phải còn ít nhất 1 con kể cả khi thất bại.
  if (worstCaseParty(state, order, isProtected).length === 0) {
    throw new ActionError('partyWouldBeEmpty')
  }
  // Túi không đủ chỗ cho món của các quái có thể mất (trường hợp xấu nhất) thì phải xác nhận.
  assertOverflowConfirmed(data, state, {
    monsters: isProtected ? [sub] : [sub, base],
    discardOverflow: order.discardOverflow
  })
  const paid = spendMoney(state, fuseCost(data, base, sub))
  // Bùa tiêu hao dù thành công hay thất bại.
  let inventory = paid.inventory
  for (const item of [boostItem, protectItem]) {
    if (item) inventory = removeItems(inventory, item.id, 1)
  }

  const chance = fuseSuccessChance(data, base, sub, boostItem)
  const [succeeded, rolledRng] = rollPercent(state.rng, chance)
  let rng = rolledRng
  let result: Monster | null = isProtected ? base : null
  if (succeeded) [result, rng] = fuseMonsters(data, rng, base, sub, inheritance)
  // Mốc lý lịch trên quái gốc còn lại: fuse thành công, hoặc thất bại nhưng được hộ mệnh.
  if (result) {
    const kind = succeeded ? 'fused' : 'fuseFailed'
    const day = dayOf(state.time)
    result = addMilestone(data, result, { day, kind, subSpeciesId: sub.baseSpeciesId })
  }
  // Món trên quái phụ (và quái gốc nếu mất) tự về túi, kèm một phần hồn tinh đã dùng
  // (docs/rules/soul-levels.md).
  for (const lost of result ? [sub] : [sub, base]) {
    inventory = returnEquipmentWithinCapacity(data, state, inventory, lost)
    inventory = addSoulCrystalPoints(data, inventory, soulFuseRefund(data, lost))
  }
  const update = (monsters: Monster[]): Monster[] =>
    monsters.flatMap((m) => {
      if (m.id === subId) return []
      if (m.id !== baseId) return [m]
      return result ? [result] : []
    })
  // Nhiệm vụ fuse chỉ tính lần fuse thành công (docs/rules/quests.md).
  const quests = succeeded ? recordQuestEvent(data, state.quests, { type: 'fused' }) : state.quests
  return {
    ...paid,
    rng,
    inventory,
    party: update(state.party),
    storage: update(state.storage),
    quests,
    stats: succeeded ? bumpStat(state.stats, 'fusions') : state.stats
  }
}

/** Kết quả một lần fuse, cho UI báo người chơi. */
export type FuseOutcome = 'success' | 'failed' | 'protected'

/**
 * Suy kết quả từ state trước / sau một action fuse không lỗi: quái gốc mất là thất bại; còn mà
 * lineage không thêm loài là thất bại có Bùa Hộ Mệnh (fuse thành công luôn thêm ít nhất 1 loài).
 */
export function fuseOutcome(before: GameState, after: GameState, baseId: string): FuseOutcome {
  const findIn = (state: GameState): Monster | undefined =>
    state.party.find((m) => m.id === baseId) ?? state.storage.find((m) => m.id === baseId)
  const baseBefore = findIn(before)
  if (!baseBefore) throw new Error(`fuseOutcome: không có quái gốc "${baseId}" trước khi fuse`)
  const baseAfter = findIn(after)
  if (!baseAfter) return 'failed'
  return baseAfter.lineage.length > baseBefore.lineage.length ? 'success' : 'protected'
}
