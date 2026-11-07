// Mở trận đặc biệt (docs/rules/events.md): trận do kết quả event startBattle (quái hoang / boss / ngự
// thú sư NPC của map) và đợt thú triều ở thị trấn. Việc sau trận ở specialBattles.ts (luật theo loại)
// và events/ (kết quả onWin / onLoss của event).

import { ActionError, type RngState } from '../shared'
import { getMaxHp } from '../monster'
import {
  floorSite,
  generateAnyBossEncounter,
  generateWildMonster,
  rollBiomeTrainerClass,
  rollRegularTrainerClass,
  type Encounter,
  type FloorSite
} from '../world'
import type {
  BeastTideState,
  GameData,
  GameState,
  Monster,
  SpecialBattle,
  TrainerClass
} from '../model'
import { openBattle } from './openBattle'
import { assertReadyForBattle, openTrainerBattle } from './trainerBattles'

/** Loại đối thủ của trận event. */
export type EventBattleKind = 'wild' | 'boss' | 'trainer'

export interface EventBattleSpec {
  site: FloorSite
  kind: EventBattleKind
  /** Số quái hoang (kind wild). */
  count: number
  /** Chỉ số quái địch × strength (nhân vào bossMultiplier; quái hoang / boss). */
  strength: number
  /** Quái địch vào trận còn % máu này (quái hoang / boss; 100 = đầy). */
  enemyHpPercent: number
  /** Level cộng thêm cho đội NPC (kind trainer). */
  levelOffset: number
  special: Extract<SpecialBattle, { kind: 'event' }>
}

/** Quái địch × strength và còn enemyHpPercent % máu (ít nhất 1 máu). */
function adjustEnemies(
  data: GameData,
  enemies: readonly Monster[],
  { strength, enemyHpPercent }: { strength: number; enemyHpPercent: number }
): Monster[] {
  return enemies.map((enemy) => {
    const strong = { ...enemy, bossMultiplier: enemy.bossMultiplier * strength }
    if (enemyHpPercent >= 100) return strong
    const maxHp = getMaxHp(data, strong)
    const left = maxHp.times(enemyHpPercent).div(100).floor()
    return { ...strong, damageTaken: maxHp.minus(left.lt(1) ? 1 : left) }
  })
}

/** count quái hoang thường của map (không tung boss / số quái của map). */
function wildEncounter(
  data: GameData,
  state: GameState,
  { site, count }: { site: FloorSite; count: number }
): Encounter {
  let { rng } = state
  let nextMonsterId = state.nextMonsterId
  const enemies: Monster[] = []
  for (let i = 0; i < count; i++) {
    let monster: Monster
    ;[monster, rng] = generateWildMonster(data, rng, site, `m${nextMonsterId}`)
    nextMonsterId++
    enemies.push(monster)
  }
  return { enemies, isBoss: false, rng, nextMonsterId }
}

/** Lớp NPC của map; map không có lớp nào thì lớp thường bất kỳ. */
function rollEventTrainerClass(
  data: GameData,
  rng: RngState,
  site: FloorSite
): [TrainerClass, RngState] {
  const [themed, next] = rollBiomeTrainerClass(data, rng, site.biome)
  return themed ? [themed, next] : rollRegularTrainerClass(data, next)
}

/** Mở trận của kết quả event startBattle (đã kiểm tra còn quái đánh được, không trong trận). */
export function openEventBattle(
  data: GameData,
  state: GameState,
  spec: EventBattleSpec
): GameState {
  const { site, special } = spec
  if (spec.kind === 'trainer') {
    const [trainerClass, rng] = rollEventTrainerClass(data, state.rng, site)
    return openTrainerBattle(
      data,
      { ...state, rng },
      { site, trainerClass, mode: 'event', extraLevels: spec.levelOffset, special }
    )
  }
  const encounter =
    spec.kind === 'boss'
      ? generateAnyBossEncounter(data, state.rng, site, state.nextMonsterId)
      : wildEncounter(data, state, { site, count: spec.count })
  const enemies = adjustEnemies(data, encounter.enemies, spec)
  return openBattle(data, state, { site, encounter: { ...encounter, enemies }, special })
}

/** Thú triều đang diễn ra (ở thị trấn, đánh được trận); không thì báo lỗi. */
function requireTide(
  data: GameData,
  state: GameState
): Extract<BeastTideState, { phase: 'active' }> {
  assertReadyForBattle(data, state)
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const tide = state.events.beastTide
  if (tide?.phase !== 'active') throw new ActionError('noBeastTide')
  return tide
}

/**
 * Thú vương: boss của map (generateAnyBossEncounter) với hệ số boss thấp nhất của map (độ khó đều
 * đặn, không phụ thuộc may rủi tung hệ số; mạnh thêm bằng kingStrength).
 */
function kingEncounter(data: GameData, state: GameState, site: FloorSite): Encounter {
  const encounter = generateAnyBossEncounter(data, state.rng, site, state.nextMonsterId)
  const multiplier = site.biome.bossMultiplierMin ?? data.config.boss.multiplierMin
  const enemies = encounter.enemies.map((enemy) => ({ ...enemy, bossMultiplier: multiplier }))
  return { ...encounter, enemies }
}

/**
 * Mở trận thú triều đợt `wave`: quái của map tầng cao nhất + floorOffset (tối thiểu 1), chỉ số × (1
 * + strengthPerWavePercent × (wave − 1) / 100); thú vương là boss của map (hệ số boss thấp nhất) ×
 * kingStrength, đợt
 * thường 2 quái hoang thường. Không chạy; chỉ bắt được thú vương.
 */
function openTideBattle(
  data: GameData,
  state: GameState,
  { wave, waves, king }: { wave: number; waves: number; king: boolean }
): GameState {
  const config = data.config.events.beastTide
  const floor = Math.max(1, state.highestFloor + config.floorOffset)
  // Thú triều: tỉ lệ Bootleg × beastTideMultiplier (docs/rules/bootleg.md).
  const site: FloorSite = {
    ...floorSite(data, state, floor),
    odds: {
      shinyMultiplier: 1,
      bossChanceMultiplier: 1,
      bootlegMultiplier: data.config.bootleg.beastTideMultiplier
    }
  }
  const waveStrength = 1 + (config.strengthPerWavePercent * (wave - 1)) / 100
  const strength = king ? waveStrength * config.kingStrength : waveStrength
  const encounter = king
    ? kingEncounter(data, state, site)
    : wildEncounter(data, state, { site, count: 2 })
  const enemies = adjustEnemies(data, encounter.enemies, { strength, enemyHpPercent: 100 })
  return openBattle(data, state, {
    site,
    encounter: { ...encounter, enemies },
    special: { kind: 'beastTide', wave, waves, king }
  })
}

/** Thủ thành: đợt kế tiếp; đã thắng đủ mọi đợt thì đợt kế tiếp là thú vương (bắt buộc). */
export function defendTown(data: GameData, state: GameState): GameState {
  const tide = requireTide(data, state)
  const wave = tide.cleared + 1
  return openTideBattle(data, state, { wave, waves: tide.waves, king: wave > tide.waves })
}

/** Thách đấu thú vương sớm: được từ khi đã thắng kingAfter đợt. Hạ / bắt thú vương là hết thú triều. */
export function challengeBeastKing(data: GameData, state: GameState): GameState {
  const tide = requireTide(data, state)
  if (tide.cleared < tide.kingAfter) {
    throw new ActionError('beastKingLocked', { cleared: tide.cleared, need: tide.kingAfter })
  }
  return openTideBattle(data, state, { wave: tide.cleared + 1, waves: tide.waves, king: true })
}
