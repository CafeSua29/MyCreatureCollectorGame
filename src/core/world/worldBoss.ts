// Boss thế giới (docs/rules/world-boss.md): danh sách loài, sinh boss tất định theo lần xuất hiện, lịch
// xuất hiện theo ngày, bậc thưởng theo kỷ lục. Trận ở battle/worldBoss.ts, việc theo ngày và nhận
// thưởng ở progression/worldBoss.ts.

import { BATTLE_FORM_KINDS } from '../model'
import { getMaxHp } from '../monster'
import { isLargeMonster, speciesRankIndex, speciesRankOf } from '../registries'
import { createRng, type Decimal, type RngState } from '../shared'
import type { GameData, Monster, NormalSpecies, WorldBossAppearance, WorldBossTier } from '../model'
import { floorBossLevel, floorGeneMultiplier } from './floors'
import { rollBossTransformTraits, rollMonster } from './encounter'

/** Một loài boss thế giới được và trọng số của nó. */
export interface WorldBossCandidate {
  speciesId: string
  weight: number
}

const candidateCache = new WeakMap<GameData, readonly WorldBossCandidate[]>()

/**
 * Loài boss thế giới: mọi loài thường trừ dạng chỉ có trong trận, trọng số = rankWeights theo phẩm cấp
 * loài (vượt danh sách lấy số cuối) × largeWeight nếu là loài lớn.
 */
export function worldBossCandidates(data: GameData): readonly WorldBossCandidate[] {
  const cached = candidateCache.get(data)
  if (cached) return cached
  const { rankWeights, largeWeight } = data.config.worldBoss
  const candidates = Object.values(data.species)
    .filter((species): species is NormalSpecies => species.kind === 'normal')
    .filter((species) => !BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate'))
    .map((species) => {
      const rank = Math.max(0, speciesRankIndex(data, speciesRankOf(data, species).id))
      const weight = rankWeights[Math.min(rank, rankWeights.length - 1)] ?? 0
      const large = isLargeMonster(data, { speciesId: species.id, baseSpeciesId: species.id })
      return { speciesId: species.id, weight: weight * (large ? largeWeight : 1) }
    })
    .filter((candidate) => candidate.weight > 0)
  candidateCache.set(data, candidates)
  return candidates
}

/** Chu kỳ của ngày và ngày đó có nằm trong thời gian xuất hiện (activeDays ngày cuối chu kỳ) không. */
export function worldBossWindow(
  data: GameData,
  day: number
): { cycle: number; active: boolean; endDay: number } {
  const { everyDays, activeDays } = data.config.worldBoss
  const cycle = Math.floor(day / everyDays)
  const endDay = (cycle + 1) * everyDays - 1
  return { cycle, active: day > endDay - activeDays, endDay }
}

/** Level boss của tầng tham chiếu: level boss tầng + levelOffset, tối thiểu 1. */
export const worldBossLevel = (data: GameData, floor: number): number =>
  Math.max(1, floorBossLevel(data, floor) + data.config.worldBoss.levelOffset)

type BossSource = Pick<WorldBossAppearance, 'speciesId' | 'floor' | 'level' | 'seed'>

/**
 * Boss của lần xuất hiện, sinh tất định từ `seed` (mọi lần khiêu chiến cùng một boss): gen theo tầng,
 * không shiny, không già đi, biến hình theo luật boss, HP vô hạn, hệ số boss của config.
 */
export function generateWorldBoss(
  data: GameData,
  { source, id }: { source: BossSource; id: string }
): Monster {
  let rng: RngState = createRng(source.seed)
  let boss: Monster
  ;[boss, rng] = rollMonster(
    data,
    rng,
    {
      encounters: [{ speciesId: source.speciesId, weight: 1 }],
      levelMin: source.level,
      levelMax: source.level,
      geneMultiplier: floorGeneMultiplier(data, source.floor),
      shinyChance: 0,
      aging: false
    },
    id
  )
  ;[boss] = rollBossTransformTraits(data, rng, { floor: source.floor, boss })
  return { ...boss, bossMultiplier: data.config.worldBoss.bossMultiplier, endlessHp: true }
}

/** Máu thường (bossMultiplier 1, không HP vô hạn) của boss: đơn vị ngưỡng bậc thưởng. */
export function worldBossHpUnit(data: GameData, boss: Monster): Decimal {
  const { endlessHp: _endlessHp, ...plain } = boss
  return getMaxHp(data, { ...plain, bossMultiplier: 1 })
}

/** Bậc thưởng cao nhất mà kỷ lục đạt (kỷ lục ≥ minHpMultiple × máu đơn vị); null = chưa đạt bậc nào. */
export function worldBossTierOf(
  data: GameData,
  { bestDamage, hpUnit }: Pick<WorldBossAppearance, 'bestDamage' | 'hpUnit'>
): WorldBossTier | null {
  let reached: WorldBossTier | null = null
  for (const tier of data.config.worldBoss.tiers) {
    if (bestDamage.gte(hpUnit.times(tier.minHpMultiple))) reached = tier
  }
  return reached
}
