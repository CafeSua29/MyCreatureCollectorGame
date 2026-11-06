// Lợi thế riêng của boss và do thám boss tầng (như Battle Advantage / Courier của WILDERLOCKE,
// docs/rules/shiny-boss.md mục "Lợi thế boss"). Lợi thế là trait tạm có sẵn (kind boss) nên thêm lợi thế =
// thêm trait và một mục `config.boss.advantages`. Lợi thế tung ngẫu nhiên mỗi lần gặp boss (game xoay
// quanh ngẫu nhiên); do thám tung trước và giữ kết quả tới lần đánh boss tầng đó.

import {
  ActionError,
  pickWeighted,
  rollPercent,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import type { GameData, GameState, ScoutedBoss } from '../model'
import { floorBossLevel, floorSite } from '../world'

/**
 * Tung lợi thế của một boss: `randomChance` % có lợi thế, số lợi thế theo `countWeights` (phần tử i = trọng
 * số của i + 1 lợi thế), mỗi lợi thế chọn theo `weight`, không trùng. Không có cấu hình thì không tốn RNG.
 */
export function rollBossAdvantages(data: GameData, rng: RngState): [string[], RngState] {
  const config = data.config.boss.advantages
  if (!config || config.entries.length === 0) return [[], rng]
  let hit: boolean
  ;[hit, rng] = rollPercent(rng, config.randomChance)
  if (!hit) return [[], rng]
  const counts = config.countWeights.map((weight, index) => ({ count: index + 1, weight }))
  let chosen: (typeof counts)[number]
  ;[chosen, rng] = pickWeighted(rng, counts, (item) => item.weight)
  let pool = config.entries.filter((entry) => entry.weight > 0)
  const ids: string[] = []
  for (let i = 0; i < chosen.count && pool.length > 0; i++) {
    let entry: (typeof pool)[number]
    ;[entry, rng] = pickWeighted(rng, pool, (item) => item.weight)
    ids.push(entry.traitId)
    pool = pool.filter((item) => item !== entry)
  }
  return [ids, rng]
}

export interface BossScoutReport {
  floor: number
  speciesId: string
  level: number
  elementIds: readonly string[]
  multiplierMin: number
  multiplierMax: number
  advantageTraitIds: readonly string[]
}

const scoutedOf = (state: GameState, floor: number): ScoutedBoss | undefined =>
  state.scoutedBosses.find((entry) => entry.floor === floor)

/** Thông tin boss tầng đang đứng, sau khi đã do thám; chưa do thám thì undefined. */
export function bossScoutReport(data: GameData, state: GameState): BossScoutReport | undefined {
  if (state.location.type !== 'floor') return undefined
  const { floor } = state.location
  const scouted = scoutedOf(state, floor)
  if (!scouted) return undefined
  const { biome } = floorSite(data, state, floor)
  const species = data.species[biome.floorBossSpeciesId]
  return {
    floor,
    speciesId: biome.floorBossSpeciesId,
    level: floorBossLevel(data, floor),
    elementIds: species?.kind === 'normal' ? species.elementIds : [],
    multiplierMin: biome.bossMultiplierMin ?? data.config.boss.multiplierMin,
    multiplierMax: biome.bossMultiplierMax ?? data.config.boss.multiplierMax,
    advantageTraitIds: scouted.advantageTraitIds
  }
}

/** Giá do thám boss tầng: theo số tầng. */
export function bossScoutPrice(data: GameData, floor: number): Decimal {
  return toBig(data.config.boss.scoutPricePerFloor ?? 0).times(floor)
}

/**
 * Trả tiền do thám boss tầng đang đứng: tung trước lợi thế của lần đánh tới và giữ lại; đã do thám (chưa
 * đánh) thì không tốn thêm.
 */
export function scoutBoss(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'floor') throw new ActionError('notOnFloor')
  const { floor } = state.location
  if (scoutedOf(state, floor)) return state
  const need = bossScoutPrice(data, floor)
  if (state.money.lt(need)) throw new ActionError('notEnoughMoney', { need, have: state.money })
  const [advantageTraitIds, rng] = rollBossAdvantages(data, state.rng)
  return {
    ...state,
    rng,
    money: state.money.minus(need),
    scoutedBosses: [...state.scoutedBosses, { floor, advantageTraitIds }]
  }
}
