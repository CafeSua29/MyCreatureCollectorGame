// Sinh bí cảnh và tầng tháp thí luyện (docs/rules/trials.md): map chủ đề, luật, số trận, tầng sức
// mạnh. Bí cảnh đi theo RNG của save; tầng tháp tất định theo số tầng (RNG riêng từ băm số tầng).

import { createRng, hashToUnit, nextInt, type RngState } from '../shared'
import { rollTrialRules } from '../registries'
import type { GameData, GameState, Monster, SecretRealm, TrialRule } from '../model'
import { findBiome, rollFloorBiome, type FloorSite } from './floors'

/** Số seed tối đa của RNG (createRng lấy 32 bit). */
const SEED_RANGE = 2 ** 32

/**
 * Bí cảnh mới (vào bằng Bí Cảnh Lệnh): tầng sức mạnh = tầng cao nhất + floorOffset (tối thiểu 1;
 * floorOffset −1 = tầng đã vượt gần nhất, vì boss của tầng cao nhất chưa hạ), map chủ đề đều
 * trên mọi map, số trận trong battleCount, luật theo ruleCount (luật một hệ lấy hệ trong các hệ của
 * `fighters`: quái còn sống trong đội lúc vào).
 */
export function rollSecretRealm(
  data: GameData,
  rng: RngState,
  { highestFloor, fighters }: { highestFloor: number; fighters: readonly Monster[] }
): [SecretRealm, RngState] {
  const config = data.config.trials.realm
  let biomeId: string
  ;[biomeId, rng] = rollFloorBiome(data, rng)
  let battleCount: number
  ;[battleCount, rng] = nextInt(rng, config.battleCount.min, config.battleCount.max)
  const elementIds = [...new Set(fighters.flatMap((monster) => monster.elementIds))]
  let rules: TrialRule[]
  ;[rules, rng] = rollTrialRules(data, rng, { count: config.ruleCount, inTower: false, elementIds })
  const floor = Math.max(1, highestFloor + config.floorOffset)
  return [{ kind: 'realm', floor, biomeId, rules, battleCount, cleared: 0 }, rng]
}

/** Tầng và map của bí cảnh: đủ để sinh quái như một tầng thường. */
export function realmSite(
  data: GameData,
  state: Pick<GameState, 'options' | 'time'>,
  realm: SecretRealm
): FloorSite {
  const biome = findBiome(data, realm.biomeId)
  if (!biome) throw new Error(`Bí cảnh có map không hợp lệ "${realm.biomeId}"`)
  return { floor: realm.floor, biome, aging: state.options.lifespanEnabled, time: state.time }
}

/** Tầng tháp đã sinh: tầng sức mạnh + map, luật, trận boss hay NPC, RNG riêng để sinh đội. */
export interface TowerFloorPlan {
  site: FloorSite
  rules: TrialRule[]
  isBoss: boolean
  rng: RngState
}

/** Tầng sức mạnh của tầng tháp: ⌈tầng tháp × floorScale⌉, tối thiểu 1. */
export const towerPowerFloor = (data: GameData, towerFloor: number): number =>
  Math.max(1, Math.ceil(towerFloor * data.config.trials.tower.floorScale))

/**
 * Tầng tháp `towerFloor`: tất định theo số tầng (cùng tầng luôn cùng map, luật, loại trận và đội):
 * map đều trên mọi map, luật dùng được ở tháp, mỗi bossEvery tầng là trận boss.
 */
export function towerFloorPlan(
  data: GameData,
  state: Pick<GameState, 'options'>,
  towerFloor: number
): TowerFloorPlan {
  const config = data.config.trials.tower
  const seed = createRng(Math.floor(hashToUnit('tower', towerFloor) * SEED_RANGE))
  const [biomeId, afterBiome] = rollFloorBiome(data, seed)
  const [rules, rng] = rollTrialRules(data, afterBiome, {
    count: config.ruleCount,
    inTower: true,
    elementIds: []
  })
  const biome = findBiome(data, biomeId)
  if (!biome) throw new Error(`Map không hợp lệ "${biomeId}"`)
  const site = {
    floor: towerPowerFloor(data, towerFloor),
    biome,
    aging: state.options.lifespanEnabled,
    // Ngoài lịch để cùng tầng tháp luôn cùng đội (docs/rules/calendar.md).
    time: null
  }
  return { site, rules, isBoss: towerFloor % config.bossEvery === 0, rng }
}
