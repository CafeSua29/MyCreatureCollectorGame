// Khí giới bí cảnh trong mô phỏng (mục "Khí giới bí cảnh" ở simulation-features.md,
// docs/rules/artifact-spirits.md): mỗi (đội × tầng × bậc món) đi Khí giới bí cảnh bằng action thật
// (enterItemWorld, challengeItemWorld, AI chung chọn lệnh) từ tầng 0 tới khi thua / hết lượt / đủ
// maxDepth tầng; đo số cấp món lên được, giờ, tiền nhận trong lượt đi, dã linh thu phục, và giá cường
// hóa đúng số cấp đó để so hai cách lên cấp món.

import {
  createGameState,
  enhanceCost,
  equipmentInstanceId,
  isRandomEquipment,
  itemWorldBossTier,
  rollEquipment,
  spiritsOf,
  toBig,
  type Decimal,
  type EquipmentInstance,
  type GameData,
  type GameState,
  type NormalRarity
} from '@core'
import { runBattle } from './battleRunner'
import { simAct } from './events'
import { floorMapsFor, inventoryWithKeyItems, withAssumedGrowth } from './floorSweep'
import { assumedTamerRealm } from './tamer'
import { buildTeam, deriveSeed } from './team'
import type { AssumedMasterySpec } from './mastery'
import type { TeamSpec } from './scenarios'

export interface ItemWorldRow {
  teamId: string
  floor: number
  rarity: NormalRarity
  /** Số tầng đã qua (= số cấp món lên được). */
  cleared: number
  battles: number
  /** Dừng vì thua / hết lượt (false = đủ maxDepth tầng). */
  stopped: boolean
  hours: number
  /** Tiền nhận trong các trận của lượt đi. */
  moneyEarned: Decimal
  /** Giá cường hóa món từ cấp 1 lên đúng số cấp đó (tiền, Đá cường hóa, yêu đan). */
  enhanceMoney: Decimal
  enhanceStones: number
  enhanceCores: number
  spiritsSubdued: number
}

/** Món thường đầu tiên trong dữ liệu (không unique, không hồn khí). */
function sampleItemId(data: GameData): string {
  for (const item of Object.values(data.items)) {
    if (item.category === 'equipment' && isRandomEquipment(data, item)) return item.id
  }
  throw new Error('Mô phỏng Khí giới bí cảnh: dữ liệu không có trang bị thường')
}

/** Tổng giá cường hóa từ cấp 1 lên cấp 1 + levels. */
function enhanceTotals(
  data: GameData,
  instance: EquipmentInstance,
  levels: number
): Pick<ItemWorldRow, 'enhanceMoney' | 'enhanceStones' | 'enhanceCores'> {
  let money = toBig(0)
  let stones = 0
  let cores = 0
  for (let level = 1; level <= levels; level++) {
    const cost = enhanceCost(data, { ...instance, level })
    money = money.plus(cost.money)
    stones += cost.stones
    cores += cost.cores
  }
  return { enhanceMoney: money, enhanceStones: stones, enhanceCores: cores }
}

/** State ở thị trấn với đội giả định và một món mới cấp 1 bậc `rarity` trong túi. */
function startState(
  data: GameData,
  { team, floor, rarity, seed, mastery }: ItemWorldInput
): { state: GameState; instance: EquipmentInstance } {
  const party = withAssumedGrowth(
    data,
    buildTeam(data, team, floor, deriveSeed(seed, 'team', team.id, floor)),
    { team, floor, mastery }
  )
  const fresh = createGameState({
    // Mô phỏng đo với thọ nguyên bật (game mới mặc định tắt, docs/rules/options.md).
    lifespanEnabled: true,
    seed: deriveSeed(seed, 'itemWorld', team.id, floor, rarity),
    party,
    floorBiomeIds: floorMapsFor(data, {
      floor,
      biomeId: null,
      seed: deriveSeed(seed, 'itemWorldMap', team.id, floor)
    }),
    tamerRealm: assumedTamerRealm(floor)
  })
  const [instance, rng] = rollEquipment(data, fresh.rng, {
    itemId: sampleItemId(data),
    rarity,
    id: equipmentInstanceId(fresh.nextItemId)
  })
  const inventory = inventoryWithKeyItems(data, fresh)
  return {
    state: {
      ...fresh,
      rng,
      nextItemId: fresh.nextItemId + 1,
      inventory: { ...inventory, equipment: [...inventory.equipment, instance] }
    },
    instance
  }
}

interface ItemWorldInput {
  team: TeamSpec
  floor: number
  rarity: NormalRarity
  maxDepth: number
  maxTurns: number
  seed: number
  mastery: AssumedMasterySpec | null
}

/** Một (đội × tầng × bậc): đi Khí giới bí cảnh từ tầng 0 tới khi dừng. */
export function runItemWorld(data: GameData, input: ItemWorldInput): ItemWorldRow {
  const start = startState(data, input)
  let state = simAct(data, start.state, { type: 'enterItemWorld', instanceId: start.instance.id })
  const row: ItemWorldRow = {
    teamId: input.team.id,
    floor: input.floor,
    rarity: input.rarity,
    cleared: 0,
    battles: 0,
    stopped: false,
    hours: 0,
    moneyEarned: toBig(0),
    ...enhanceTotals(data, start.instance, 0),
    spiritsSubdued: 0
  }
  let subdued = 0
  for (let depth = 1; depth <= input.maxDepth; depth++) {
    const before = state
    const run = runBattle(data, before, {
      kind: itemWorldBossTier(data, depth) ? 'boss' : 'wild',
      maxTurns: input.maxTurns,
      start: { type: 'challengeItemWorld' }
    })
    row.battles++
    row.hours += run.state.time - before.time
    row.moneyEarned = row.moneyEarned.plus(run.state.money.minus(before.money))
    state = run.state
    if (run.stats.outcome !== 'won' || state.trial?.kind !== 'itemWorld') {
      row.stopped = true
      break
    }
    row.cleared++
    subdued = spiritsOf(state.trial.instance).filter((spirit) => spirit.subdued).length
  }
  row.spiritsSubdued = subdued
  return { ...row, ...enhanceTotals(data, start.instance, row.cleared) }
}
