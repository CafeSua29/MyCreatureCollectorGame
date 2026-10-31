// Trứng: quái bên trong được random sẵn lúc tạo trứng (tất định theo RNG), nở sau một số
// trận THẮNG quái hoang (kể cả trận boss). Trứng boss và trứng breeding dùng chung cơ chế này.

import { floorGeneMultiplier, rollMonster } from '../world'
import { baseFormsOf } from '../inventory'
import { BIG_ONE, maxBig, nextInt, pick, type RngState } from '../shared'
import {
  addMilestone,
  addShinyStacks,
  mapBigStats,
  mergeTraitLevel,
  rollPolarity,
  startHistory,
  startImprint
} from '../monster'
import {
  type Biome,
  type Egg,
  type GameData,
  type HistoryOrigin,
  type Monster,
  type SoulRemnant,
  type TraitInstance
} from '../model'

/** Bảng gặp của trứng: mọi dạng đầu của loài, cùng trọng số (loài có nhiều dạng trước). */
const baseEncounters = (
  data: GameData,
  speciesId: string
): { speciesId: string; weight: number }[] =>
  baseFormsOf(data, speciesId).map((id) => ({ speciesId: id, weight: 1 }))

/** Bọc một quái đã random sẵn thành trứng, số trận cần để nở random trong config.egg. */
export function wrapEgg(data: GameData, rng: RngState, monster: Monster): [Egg, RngState] {
  const { hatchBattlesMin, hatchBattlesMax } = data.config.egg
  let battlesLeft: number
  ;[battlesLeft, rng] = nextInt(rng, hatchBattlesMin, hatchBattlesMax)
  return [{ id: monster.id, monster, battlesLeft }, rng]
}

/**
 * Trứng rơi từ boss: quái thường (bossMultiplier 1), level 1, loài là dạng đầu tiên chưa
 * tiến hóa của loài boss, gen và trait random như quái hoang của tầng boss rơi trứng (khoảng gen
 * nhân theo tầng), có thể shiny theo tỉ lệ chung, kèm trait "Huyết thống boss" cấp 1.
 */
export function createBossEgg(
  data: GameData,
  rng: RngState,
  options: {
    boss: Monster
    id: string
    floor: number
    aging: boolean
    day: number
  }
): [Egg, RngState] {
  const { boss, id, floor, aging, day } = options
  let monster: Monster
  ;[monster, rng] = rollMonster(
    data,
    rng,
    {
      encounters: baseEncounters(data, boss.speciesId),
      levelMin: 1,
      levelMax: 1,
      geneMultiplier: floorGeneMultiplier(data, floor),
      shinyChance: data.config.shiny.wildChance,
      aging
    },
    id
  )
  // Trứng boss theo cực của boss, trait cực tính random lại (docs/rules/polarity.md).
  let polarity: Monster['polarity'] = null
  if (boss.polarity) [polarity, rng] = rollPolarity(data, rng, boss.polarity.pole)
  monster = startHistory(
    {
      ...mergeTraitLevel(monster, data.config.boss.traitId, 1),
      polarity,
      affinity: data.config.affinity.start.egg
    },
    { kind: 'bossEgg', bossSpeciesId: boss.baseSpeciesId },
    { day, floor, level: monster.level }
  )
  return wrapEgg(data, rng, monster)
}

/** Chỗ nhận trứng: map, tầng (gen), ngày, có già đi không. */
export interface EggSite {
  biome: Biome
  floor: number
  aging: boolean
  day: number
}

/**
 * Trứng của một loài (dạng đầu tiên chưa tiến hóa), level 1, gen như quái hoang của tầng, shiny theo
 * tỉ lệ chung, nguồn gốc `origin` (trứng thám hiểm, event, thú triều); không có trait "Huyết thống
 * boss".
 */
export function createSpeciesEgg(
  data: GameData,
  rng: RngState,
  options: EggSite & { speciesId: string; id: string; origin: HistoryOrigin }
): [Egg, RngState] {
  const { floor, aging, day } = options
  let monster: Monster
  ;[monster, rng] = rollMonster(
    data,
    rng,
    {
      encounters: baseEncounters(data, options.speciesId),
      levelMin: 1,
      levelMax: 1,
      geneMultiplier: floorGeneMultiplier(data, floor),
      shinyChance: data.config.shiny.wildChance,
      aging
    },
    options.id
  )
  monster = startHistory({ ...monster, affinity: data.config.affinity.start.egg }, options.origin, {
    day,
    floor,
    level: monster.level
  })
  return wrapEgg(data, rng, monster)
}

/**
 * Trứng hiếm: loài đều trong các boss của map (createSpeciesEgg). Map không có boss thì không có
 * trứng (null, không tốn RNG). Dùng cho thám hiểm (docs/rules/expeditions.md) và thú triều.
 */
export function createBiomeBossEgg(
  data: GameData,
  rng: RngState,
  options: EggSite & { id: string; origin: HistoryOrigin }
): [Egg | null, RngState] {
  if (options.biome.bosses.length === 0) return [null, rng]
  let boss: Biome['bosses'][number]
  ;[boss, rng] = pick(rng, options.biome.bosses)
  return createSpeciesEgg(data, rng, { ...options, speciesId: boss.speciesId })
}

/** Trứng hiếm thám hiểm mang về (docs/rules/expeditions.md): createBiomeBossEgg của mẫu thám hiểm. */
export function createExpeditionEgg(
  data: GameData,
  rng: RngState,
  options: EggSite & { expeditionId: string; id: string }
): [Egg | null, RngState] {
  const { expeditionId, ...rest } = options
  return createBiomeBossEgg(data, rng, { ...rest, origin: { kind: 'expeditionEgg', expeditionId } })
}

/**
 * Trứng truyền thừa ấp từ hồn phách (docs/rules/soul-relics.md, luật trứng ở lifespan.md): dạng đầu
 * tiên của loài gốc, level 1, gen = genePercent % gen của quái (làm tròn xuống, tối thiểu như quái
 * hoang tầng 1), giữ 1 trait random chiếm ô (giữ cấp), shiny thì giữ shiny ×1, không còn là boss;
 * giới tính, hệ Tera random như quái hoang.
 */
export function createLegacyEgg(
  data: GameData,
  rng: RngState,
  { soul, id, day, aging }: { soul: SoulRemnant; id: string; day: number; aging: boolean }
): [Egg, RngState] {
  const { geneMin } = data.config.wild
  const { genePercent } = data.config.lifespan.legacyEgg
  let child: Monster
  ;[child, rng] = rollMonster(
    data,
    rng,
    {
      encounters: baseEncounters(data, soul.baseSpeciesId),
      levelMin: 1,
      levelMax: 1,
      geneMultiplier: BIG_ONE,
      shinyChance: 0,
      aging
    },
    id
  )
  let traits: TraitInstance[] = []
  if (soul.traits.length > 0) {
    let kept: TraitInstance
    ;[kept, rng] = pick(rng, soul.traits)
    traits = [{ ...kept }]
  }
  const genes = mapBigStats((stat) =>
    maxBig(geneMin, soul.genes[stat].times(genePercent).div(100).floor())
  )
  child = { ...child, genes, traits, affinity: data.config.affinity.start.egg }
  if (soul.shinyStacks > 0) child = addShinyStacks(data, child, 1)
  // Trứng truyền thừa ấp ở thị trấn (hoặc tự ấp khi thời gian trôi), không ở tầng nào (metFloor null).
  // Con chưa khế ước (khế ước của quái đã chết mất cùng nó; docs/rules/tamer.md mục "Khế ước").
  child = startHistory(
    child,
    { kind: 'legacy', parentSpeciesId: soul.baseSpeciesId },
    { day, floor: null, level: child.level }
  )
  return wrapEgg(data, rng, child)
}

/**
 * Quái nở khỏi trứng vào ngày `day`: thêm mốc lý lịch "hatched" và bắt đầu dưỡng dục (kèm yêu cầu
 * đầu tiên, docs/rules/imprinting.md).
 */
export function hatchMonster(
  data: GameData,
  rng: RngState,
  { monster, day }: { monster: Monster; day: number }
): [Monster, RngState] {
  return startImprint(data, rng, addMilestone(data, monster, { day, kind: 'hatched' }), day)
}

/**
 * Một trận thắng trôi qua: giảm bộ đếm mọi trứng `amount` (1 + trait kiểu Flame Body), tách các
 * trứng đã đến lúc nở.
 */
export function tickEggs(eggs: Egg[], amount: number): { eggs: Egg[]; hatched: Monster[] } {
  const remaining: Egg[] = []
  const hatched: Monster[] = []
  for (const egg of eggs) {
    const battlesLeft = egg.battlesLeft - amount
    if (battlesLeft <= 0) hatched.push(egg.monster)
    else remaining.push({ ...egg, battlesLeft })
  }
  return { eggs: remaining, hatched }
}
