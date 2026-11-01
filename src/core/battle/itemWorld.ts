// Khí giới bí cảnh (docs/rules/artifact-spirits.md, như Item World của Disgaea): vào thế giới bên
// trong một món trong túi ở Khí Linh Các, đánh lần lượt từng tầng (món +1 cấp mỗi tầng), gặp và thu
// phục dã linh, boss mỗi 10 tầng; rời ở mốc hoặc bằng Phá Giới Phù. Việc sau trận ở trialOutcome.ts
// (dùng chung khung chuỗi trận của bí cảnh, docs/rules/trials.md).

import { ActionError, malformedAction, pick, rollPercent, type RngState } from '../shared'
import {
  addEquipment,
  depthOf,
  findWearer,
  removeItems,
  rollSpirit,
  spiritSlotCount,
  spiritsOf,
  takeEquipment,
  withSpirits
} from '../inventory'
import {
  findBiome,
  generateEncounter,
  assertNoTournament,
  generateFloorBossEncounter,
  itemWorldBossTier,
  itemWorldPowerFloor,
  rollFloorBiome,
  type Encounter,
  type FloorSite
} from '../world'
import type {
  BattleSpirit,
  BattleTrial,
  EquipmentInstance,
  GameData,
  GameState,
  ItemWorldBossTier,
  ItemWorldRun
} from '../model'
import { openBattle } from './openBattle'
import { assertReadyForBattle, requireTown } from './trainerBattles'

/** Lượt Khí giới bí cảnh đang đi; không có thì noItemWorld. */
function requireItemWorld(state: GameState): ItemWorldRun {
  if (state.trial?.kind !== 'itemWorld') throw new ActionError('noItemWorld')
  return state.trial
}

/**
 * Vào Khí giới bí cảnh bằng món `instanceId` trong túi (món đang lắp phải tháo trước): món rời túi
 * vào lượt đi, tiếp tục từ tầng chưa qua (depth + 1). Chưa mở trận.
 */
export function enterItemWorld(data: GameData, state: GameState, instanceId: unknown): GameState {
  assertReadyForBattle(data, state)
  requireTown(state)
  assertNoTournament(state)
  if (typeof instanceId !== 'string') throw malformedAction('instanceId phải là chuỗi')
  const wearer = findWearer(state, instanceId)
  if (wearer) {
    throw new ActionError('equipmentEquipped', { instanceId, monsterId: wearer.monster.id })
  }
  const [instance, inventory] = takeEquipment(state.inventory, instanceId)
  return { ...state, inventory, trial: { kind: 'itemWorld', instance, cleared: 0 } }
}

/**
 * Rời Khí giới bí cảnh giữa hai trận: chưa qua tầng nào trong lượt này, hoặc tầng đã qua của món
 * chia hết leaveEvery; không thì phải dùng Phá Giới Phù (`useTalisman`). Món về túi (được vượt sức
 * chứa như đồ tự về túi, docs/rules/capacity.md), giữ cấp, khí linh và tầng đã qua.
 */
export function leaveItemWorld(
  data: GameData,
  state: GameState,
  useTalisman: unknown = false
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const run = requireItemWorld(state)
  const config = data.config.artifactSpirits.itemWorld
  const depth = depthOf(run.instance)
  const atMilestone = run.cleared === 0 || depth % config.leaveEvery === 0
  let inventory = state.inventory
  // Đang ở mốc thì rời miễn phí, không tốn Phá Giới Phù dù có gửi useTalisman.
  if (!atMilestone) {
    if (useTalisman !== true) {
      throw new ActionError('itemWorldLeaveLocked', { depth, leaveEvery: config.leaveEvery })
    }
    inventory = removeItems(inventory, config.breakItemId, 1)
  }
  return { ...state, trial: null, inventory: addEquipment(inventory, run.instance) }
}

/**
 * Dã linh của tầng: spiritChance % gặp một dã linh có sẵn trên món (đều), không có thì một khí linh
 * mới (dã linh, value theo bậc món × (1 + newSpiritDepthPercent × tầng %)) nếu món còn ô. Khí linh
 * mới gắn ngay lên món (chưa thu phục).
 */
function rollFloorSpirit(
  data: GameData,
  rng: RngState,
  { instance, depth }: { instance: EquipmentInstance; depth: number }
): { instance: EquipmentInstance; index: number | null; rng: RngState } {
  const config = data.config.artifactSpirits.itemWorld
  const [met, afterChance] = rollPercent(rng, config.spiritChance)
  if (!met) return { instance, index: null, rng: afterChance }
  const spirits = spiritsOf(instance)
  const wild = spirits.flatMap((spirit, index) => (spirit.subdued ? [] : [index]))
  if (wild.length > 0) {
    const [index, next] = pick(afterChance, wild)
    return { instance, index, rng: next }
  }
  if (spirits.length >= spiritSlotCount(data, instance)) {
    return { instance, index: null, rng: afterChance }
  }
  const [spirit, next] = rollSpirit(data, afterChance, {
    rarity: instance.rarity,
    subdued: false,
    valuePercent: config.newSpiritDepthPercent * depth
  })
  return { instance: withSpirits(instance, [...spirits, spirit]), index: spirits.length, rng: next }
}

/** Quái địch của tầng: boss (Khí Tướng / Vương / Thần, mạnh hơn theo multiplier) hoặc quái hoang. */
function floorEncounter(
  data: GameData,
  state: GameState,
  { site, tier, rng }: { site: FloorSite; tier: ItemWorldBossTier | null; rng: RngState }
): Encounter {
  if (!tier) return generateEncounter(data, rng, site, state.nextMonsterId)
  const encounter = generateFloorBossEncounter(data, rng, site, state.nextMonsterId)
  if (tier.multiplier === 1) return encounter
  const enemies = encounter.enemies.map((enemy) => ({
    ...enemy,
    bossMultiplier: enemy.bossMultiplier * tier.multiplier
  }))
  return { ...encounter, enemies }
}

/**
 * Đánh tầng kế tiếp (depth + 1) của món ở thị trấn: map đều trên mọi map, quái theo tầng sức mạnh
 * của món (không theo tầng thế giới), mỗi tầng chia hết `every` của bậc boss là trận boss; có thể
 * gặp dã linh (một quái địch mang nó: hạ quái đó và thắng trận thì thu phục). Không áp độ bất ổn.
 */
export function challengeItemWorld(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const run = requireItemWorld(state)
  const depth = depthOf(run.instance) + 1
  const [biomeId, afterBiome] = rollFloorBiome(data, state.rng)
  const biome = findBiome(data, biomeId)
  if (!biome) throw new Error(`Map không hợp lệ "${biomeId}"`)
  const floorSpirit = rollFloorSpirit(data, afterBiome, { instance: run.instance, depth })
  const site: FloorSite = {
    floor: itemWorldPowerFloor(data, run.instance, depth),
    biome,
    aging: state.options.lifespanEnabled,
    time: state.time
  }
  const tier = itemWorldBossTier(data, depth)
  const encounter = floorEncounter(data, state, { site, tier, rng: floorSpirit.rng })
  let rng = encounter.rng
  let spirit: BattleSpirit | null = null
  if (floorSpirit.index !== null && encounter.enemies.length > 0) {
    const [carrier, next] = pick(rng, encounter.enemies)
    rng = next
    spirit = { carrierId: carrier.id, index: floorSpirit.index }
  }
  const trial: BattleTrial = {
    kind: 'itemWorld',
    biomeId,
    rules: [],
    depth,
    bossTierId: tier?.id ?? null,
    spirit
  }
  const before = { ...state, trial: { ...run, instance: floorSpirit.instance } }
  return openBattle(data, before, { site, encounter: { ...encounter, rng }, trial })
}
