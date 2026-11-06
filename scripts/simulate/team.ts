// Dựng quái của đội mẫu và seed của từng trận cho script mô phỏng.

import {
  BIG_ONE,
  DataError,
  ageDaysAtPercent,
  availableRefinements,
  computeStats,
  createRng,
  floorBig,
  floorBossLevel,
  floorGeneMultiplier,
  rollMonster,
  uniformBigStats,
  validateMonster,
  type Decimal,
  type GameData,
  type Monster,
  type RngState,
  type TraitInstance
} from '@core'
import type { GeneSpec, MemberSpec, TeamSpec } from './scenarios'

/** Seed 32 bit từ các phần định danh của một lần chạy (FNV-1a), để chạy lại ra cùng kết quả. */
export function deriveSeed(...parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5
  for (const char of parts.join(':')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** Level của quái mẫu ở một tầng: level boss tầng + levelOffset, tối thiểu 1. */
export function memberLevel(data: GameData, floor: number, levelOffset: number): number {
  return Math.max(1, floorBossLevel(data, floor) + levelOffset)
}

/** Gen của quái mẫu: "wild" = giữa khoảng gen quái hoang của tầng (đã nhân hệ số tầng). */
export function geneValue(data: GameData, floor: number, genes: GeneSpec): Decimal {
  if (genes !== 'wild') return floorBig(genes)
  const { geneMin, geneMax } = data.config.wild
  return floorBig(floorGeneMultiplier(data, floor).times((geneMin + geneMax) / 2))
}

export interface MonsterBlueprint {
  id: string
  speciesId: string
  level: number
  /** Gen đều cho mọi chỉ số. */
  genes: Decimal
  traits: readonly TraitInstance[]
  /** Kiểu luyện thể đang lắp (body-refinement.md). */
  refinements?: readonly string[]
}

/**
 * Tính cách đội mẫu chọn bằng Bạc Hà như người chơi thật (docs/rules/natures.md): tăng chỉ số tấn công
 * cao hơn (công / đặc công ở bước level), giảm chỉ số tấn công còn lại. Không có tính cách khớp thì
 * giữ tính cách đã tung.
 */
export function bestNatureId(data: GameData, monster: Monster): string {
  const { leveled } = computeStats(data, monster)
  const [up, down] = leveled.attack.gte(leveled.spAttack)
    ? (['attack', 'spAttack'] as const)
    : (['spAttack', 'attack'] as const)
  const match = Object.values(data.natures).find((n) => n.up === up && n.down === down)
  return match?.id ?? monster.natureId
}

/** Kiểu luyện thể của bản mẫu mà quái có bộ phận (loài khác nhau có bộ phận khác nhau). */
function refinementsFor(
  data: GameData,
  monster: Monster,
  ids: readonly string[]
): Record<string, string> {
  const available = availableRefinements(data, monster)
  const result: Record<string, string> = {}
  for (const id of ids) {
    if (!data.bodyRefinements[id]) throw new DataError([`Kiểu luyện thể lạ "${id}"`])
    const refinement = available.find((entry) => entry.id === id)
    if (refinement) result[refinement.partId] = id
  }
  return result
}

/**
 * Dựng một quái theo bản mẫu: đi qua rollMonster (giới tính, skill theo level như quái hoang,
 * không shiny) rồi đặt gen, trait, tuổi (như quái khởi đầu) và tính cách tốt nhất (bestNatureId).
 * Quái không hợp lệ thì ném DataError.
 */
export function buildMonster(
  data: GameData,
  rng: RngState,
  blueprint: MonsterBlueprint
): [Monster, RngState] {
  let rolled: Monster
  ;[rolled, rng] = rollMonster(
    data,
    rng,
    {
      encounters: [{ speciesId: blueprint.speciesId, weight: 1 }],
      levelMin: blueprint.level,
      levelMax: blueprint.level,
      geneMultiplier: BIG_ONE,
      shinyChance: 0,
      // Game thật mặc định bật thọ nguyên: đội mẫu già đi, bắt đầu ở tuổi quái khởi đầu.
      aging: true
    },
    blueprint.id
  )
  const built: Monster = {
    ...rolled,
    ageDays: ageDaysAtPercent(data, rolled, data.config.lifespan.spawnAgePercent.starter),
    genes: uniformBigStats(blueprint.genes),
    traits: blueprint.traits.map((trait) => ({ ...trait })),
    refinements: refinementsFor(data, rolled, blueprint.refinements ?? [])
  }
  const monster: Monster = { ...built, natureId: bestNatureId(data, built) }
  const issues = validateMonster(data, monster, `quái mẫu ${blueprint.speciesId}`)
  if (issues.length > 0) throw new DataError(issues)
  return [monster, rng]
}

/** Đội mẫu ở một tầng: id m1, m2... theo thứ tự khai báo. Cùng seed ra cùng đội. */
export function buildTeam(data: GameData, team: TeamSpec, floor: number, seed: number): Monster[] {
  let rng = createRng(seed)
  return team.members.map((member: MemberSpec, i) => {
    let monster: Monster
    ;[monster, rng] = buildMonster(data, rng, {
      id: `m${i + 1}`,
      speciesId: member.speciesId,
      level: memberLevel(data, floor, member.levelOffset),
      genes: geneValue(data, floor, member.genes),
      traits: member.traits,
      refinements: member.refinements
    })
    return monster
  })
}
