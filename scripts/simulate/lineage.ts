// Mức mạnh lên sau breed / fuse nhiều đời (mục "Breed / fuse nhiều đời" ở simulation-features.md).
// Chỉ đo gen, chỉ số và giá; gọi thẳng hàm thuần của core (makeOffspring, fuseMonsters) thay vì đi
// qua NPC thị trấn, vì ở đây không đo kinh tế hay thời gian ấp trứng. Fuse luôn coi là thành công
// để đo chỉ số; tỉ lệ thành công (không bùa) ghi riêng từng đời và tỉ lệ đi tới đời đó. Mỗi lần
// fuse "người chơi" kế thừa skill mạnh nhất của quái phụ (chooseInheritance), đo tổng power bộ
// skill.

import {
  BIG_ZERO,
  DataError,
  STAT_NAMES,
  aptitudeOf,
  breedBlocker,
  breedCost,
  computeStats,
  createRng,
  monsterExpForLevel,
  floorGeneMultiplier,
  fuseCost,
  fuseMonsters,
  fuseSuccessChance,
  inheritableSkillIds,
  makeOffspring,
  newFusionSpecies,
  pick,
  rollMonster,
  type BigStats,
  type Decimal,
  type GameData,
  type Monster,
  type RngState,
  type SkillInheritance
} from '@core'
import type { BreedingSpec, FusionSpec } from './scenarios'
import { buildMonster, deriveSeed, geneValue } from './team'

export type LineageKind = 'breed' | 'fuse'

export interface LineageRow {
  kind: LineageKind
  /** 0 = quái ban đầu; breed: đời con thứ n; fuse: sau n lần fuse. */
  generation: number
  geneTotal: Decimal
  statTotal: Decimal
  /** statTotal / statTotal của đời 0. */
  statRatio: Decimal
  /** Tư chất so với tầng của kịch bản (docs/rules/aptitude.md): id bậc và tỉ lệ gen. */
  aptitudeTierId: string
  aptitudeRatio: Decimal
  /** Giá để ra đời này (đời 0: 0). */
  cost: Decimal
  /** Fuse: tỉ lệ % lần fuse ra đời này thành công (không bùa); breed / đời 0: null. */
  successChance: number | null
  /** Fuse: tỉ lệ % đi được tới đời này mà không lần nào thất bại (tích các successChance). */
  reachChance: number | null
  /** Tổng power các skill đang biết (skill trạng thái tính 0). */
  skillPower: number
  /** Fuse: số skill kế thừa ở lần fuse ra đời này; breed / đời 0: null. */
  inheritedSkills: number | null
  /** Ghi chú khi không làm được đời này (ví dụ không có con cái, hết loài mới). */
  note: string
}

const sumStats = (stats: BigStats): Decimal =>
  STAT_NAMES.reduce((sum, stat) => sum.plus(stats[stat]), BIG_ZERO)

const skillPowerOf = (data: GameData, skillId: string): number => data.skills[skillId].power ?? 0

const sumSkillPower = (data: GameData, monster: Monster): number =>
  monster.skillIds.reduce((sum, skillId) => sum + skillPowerOf(data, skillId), 0)

/**
 * "Người chơi" chọn kế thừa (fusing.md): skill power cao nhất của quái phụ, tối đa
 * config.fusion.inheritSkills; còn ô thì học, hết ô thì quên skill yếu nhất nếu yếu hơn, không thì
 * bỏ (không để vào chờ học).
 */
export function chooseInheritance(data: GameData, base: Monster, sub: Monster): SkillInheritance {
  const byPowerDesc = (a: string, b: string): number =>
    skillPowerOf(data, b) - skillPowerOf(data, a)
  const candidates = inheritableSkillIds(data, base, sub).sort(byPowerDesc)
  const weakestFirst = [...base.skillIds].sort(byPowerDesc).reverse()
  let freeSlots = data.config.maxSkills - base.skillIds.length
  const inheritSkillIds: string[] = []
  const forgetSkillIds: string[] = []
  for (const skillId of candidates) {
    if (inheritSkillIds.length >= data.config.fusion.inheritSkills) break
    if (freeSlots > 0) {
      freeSlots--
      inheritSkillIds.push(skillId)
      continue
    }
    const forget = weakestFirst[forgetSkillIds.length]
    if (forget === undefined || skillPowerOf(data, forget) >= skillPowerOf(data, skillId)) break
    inheritSkillIds.push(skillId)
    forgetSkillIds.push(forget)
  }
  return { inheritSkillIds, forgetSkillIds }
}

/** Bản sao quái ở level cho trước (để đo chỉ số và tính giá ở cùng một mức level). */
const atLevel = (data: GameData, monster: Monster, level: number): Monster => ({
  ...monster,
  level,
  exp: monsterExpForLevel(data, monster, level)
})

function makeRow(
  data: GameData,
  base: {
    kind: LineageKind
    generation: number
    monster: Monster
    /** Tầng của kịch bản: tầng mốc chấm tư chất. */
    floor: number
    cost: Decimal
    note?: string
    successChance?: number
    reachChance?: number
    inheritedSkills?: number
  },
  firstStatTotal: Decimal | null
): LineageRow {
  const statTotal = sumStats(computeStats(data, base.monster).final)
  const aptitude = aptitudeOf(data, base.monster, base.floor)
  return {
    kind: base.kind,
    generation: base.generation,
    geneTotal: sumStats(base.monster.genes),
    statTotal,
    statRatio: statTotal.div(firstStatTotal ?? statTotal),
    aptitudeTierId: aptitude.tier.id,
    aptitudeRatio: aptitude.ratio,
    cost: base.cost,
    successChance: base.successChance ?? null,
    reachChance: base.reachChance ?? null,
    skillPower: sumSkillPower(data, base.monster),
    inheritedSkills: base.inheritedSkills ?? null,
    note: base.note ?? ''
  }
}

/** Quái hoang cùng loài của tầng ở level cho trước (bố mỗi đời, quái phụ khi fuse). */
function rollWild(
  data: GameData,
  rng: RngState,
  { speciesId, level, floor, id }: { speciesId: string; level: number; floor: number; id: string }
): [Monster, RngState] {
  return rollMonster(
    data,
    rng,
    {
      encounters: [{ speciesId, weight: 1 }],
      levelMin: level,
      levelMax: level,
      geneMultiplier: floorGeneMultiplier(data, floor),
      shinyChance: 0,
      // Chỉ đo chỉ số theo đời: không tính tuổi (hiệu ứng tuổi làm lệch so sánh giữa các đời).
      aging: false
    },
    id
  )
}

/**
 * Breed nhiều đời: mỗi đời bố là quái hoang cùng loài của tầng, lấy con cái có tổng gen cao nhất
 * trong offspringPerGeneration con làm mẹ đời sau (lớn tới measureLevel).
 */
export function runBreeding(data: GameData, spec: BreedingSpec, seed: number): LineageRow[] {
  let rng = createRng(deriveSeed(seed, 'breeding', spec.speciesId))
  const level = spec.measureLevel
  let mother: Monster
  ;[mother, rng] = buildMonster(data, rng, {
    id: 'mother0',
    speciesId: spec.speciesId,
    level,
    genes: geneValue(data, spec.floor, spec.genes),
    traits: []
  })
  // Không tính tuổi khi đo chỉ số theo đời (như rollWild); con nhận cờ aging của mẹ.
  mother = { ...mother, gender: 'female', aging: false }
  const rows = [
    makeRow(
      data,
      { kind: 'breed', generation: 0, monster: mother, floor: spec.floor, cost: BIG_ZERO },
      null
    )
  ]
  const first = rows[0].statTotal

  for (let generation = 1; generation <= spec.generations; generation++) {
    let father: Monster
    ;[father, rng] = rollWild(data, rng, { ...spec, level, id: `father${generation}` })
    father = { ...father, gender: 'male' }
    const blocker = breedBlocker(data, father, mother)
    if (blocker)
      throw new DataError([`breeding: loài "${spec.speciesId}" không breed được (${blocker})`])
    const cost = breedCost(data, father, mother)
    let best: Monster | null = null
    for (let i = 0; i < spec.offspringPerGeneration; i++) {
      let child: Monster
      ;[child, rng] = makeOffspring(data, rng, father, mother, `child${generation}-${i}`)
      if (child.gender !== 'female') continue
      if (!best || sumStats(child.genes).gt(sumStats(best.genes))) best = child
    }
    if (best) mother = atLevel(data, best, level)
    const note = best ? '' : 'không có con cái, giữ mẹ cũ'
    rows.push(
      makeRow(
        data,
        { kind: 'breed', generation, monster: mother, floor: spec.floor, cost, note },
        first
      )
    )
  }
  return rows
}

/** Fuse liên tục với quái phụ cùng level, loài ngẫu nhiên chưa có trong lineage. */
export function runFusion(data: GameData, spec: FusionSpec, seed: number): LineageRow[] {
  let rng = createRng(deriveSeed(seed, 'fusion', spec.speciesId))
  let base: Monster
  ;[base, rng] = buildMonster(data, rng, {
    id: 'base',
    speciesId: spec.speciesId,
    level: spec.level,
    genes: geneValue(data, spec.floor, spec.genes),
    traits: []
  })
  // Không tính tuổi khi đo chỉ số theo lần fuse (như rollWild).
  base = { ...base, aging: false }
  const rows = [
    makeRow(
      data,
      { kind: 'fuse', generation: 0, monster: base, floor: spec.floor, cost: BIG_ZERO },
      null
    )
  ]
  const first = rows[0].statTotal
  const normalSpecies = Object.values(data.species).filter((species) => species.kind === 'normal')
  let reachChance = 100

  for (let generation = 1; generation <= spec.fusions; generation++) {
    // Quái phụ là quái hoang (lineage rỗng): loài của nó phải là loài mới với quái gốc.
    const owned = new Set([base.baseSpeciesId, ...base.lineage])
    const candidates = normalSpecies.filter((species) => !owned.has(species.id))
    if (candidates.length === 0) {
      rows.push({ ...rows[rows.length - 1], generation, cost: BIG_ZERO, note: 'hết loài mới' })
      break
    }
    let species: (typeof candidates)[number]
    ;[species, rng] = pick(rng, candidates)
    let sub: Monster
    ;[sub, rng] = rollWild(data, rng, { ...spec, speciesId: species.id, id: `sub${generation}` })
    if (newFusionSpecies(base, sub).length === 0)
      throw new Error('Mô phỏng: quái phụ không có loài mới')
    const cost = fuseCost(data, base, sub)
    const successChance = fuseSuccessChance(data, base, sub)
    reachChance = (reachChance * successChance) / 100
    const inheritance = chooseInheritance(data, base, sub)
    ;[base, rng] = fuseMonsters(data, rng, base, sub, inheritance)
    rows.push(
      makeRow(
        data,
        {
          kind: 'fuse',
          generation,
          monster: base,
          floor: spec.floor,
          cost,
          successChance,
          reachChance,
          inheritedSkills: inheritance.inheritSkillIds.length
        },
        first
      )
    )
  }
  return rows
}
