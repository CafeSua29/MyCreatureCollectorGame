// Boss thế giới trong mô phỏng (mục "Boss thế giới" ở simulation-features.md, docs/rules/world-boss.md):
// mỗi (đội × tầng) khiêu chiến `challenges` lần bằng action thật (challengeWorldBoss, AI chung chọn
// lệnh tới hết số lượt của trận), mỗi lần một lần xuất hiện mới (loài, seed tung như game ở ngày đầu
// thời gian xuất hiện); đo tổng sát thương theo bội số máu đơn vị và bậc thưởng đạt được.

import {
  createGameState,
  worldBossDailyTask,
  worldBossTierOf,
  type GameData,
  type GameState
} from '@core'
import { runBattle } from './battleRunner'
import {
  floorMapsFor,
  inventoryWithKeyItems,
  withAssumedGrowth,
  withLeadZCrystal
} from './floorSweep'
import { assumedTamerRealm } from './tamer'
import { buildTeam, deriveSeed } from './team'
import type { AssumedMasterySpec } from './mastery'
import type { TeamSpec } from './scenarios'

export interface WorldBossRow {
  teamId: string
  floor: number
  challenges: number
  /** Số lần cả đội gục trước khi hết lượt. */
  lost: number
  /** Tổng sát thương mỗi lần ÷ máu đơn vị của boss lần đó, theo thứ tự. */
  multiples: number[]
  /** Số lần đạt từng bậc (bậc cao nhất đạt được; khóa "-" = chưa đạt bậc nào). */
  tiers: Record<string, number>
}

/** Bậc chưa đạt ở cột bậc thưởng. */
export const NO_TIER = '-'

/** Hệ số an toàn của trần số lượt: trận tự kết thúc ở config.worldBoss.turns lượt. */
const TURN_MARGIN = 5

/**
 * State ở thị trấn ngày đầu thời gian xuất hiện của chu kỳ 0, boss vừa xuất hiện (việc theo ngày như
 * game). Ngày đầu để rời trận (+1 ngày) vẫn còn trong thời gian xuất hiện, kỷ lục còn ở current.
 */
function townWithBoss(data: GameData, state: GameState): GameState {
  const { everyDays, activeDays } = data.config.worldBoss
  const day = everyDays - activeDays
  const time = day * 24 + data.config.clock.startHour
  return worldBossDailyTask(data, { ...state, time }, [], day)
}

/** Một (đội × tầng): `challenges` lần khiêu chiến, mỗi lần một boss mới. */
export function runWorldBoss(
  data: GameData,
  {
    team,
    floor,
    challenges,
    seed,
    mastery
  }: {
    team: TeamSpec
    floor: number
    challenges: number
    seed: number
    mastery: AssumedMasterySpec | null
  }
): WorldBossRow {
  const party = withAssumedGrowth(
    data,
    buildTeam(data, team, floor, deriveSeed(seed, 'team', team.id, floor)),
    { team, floor, mastery }
  )
  const row: WorldBossRow = {
    teamId: team.id,
    floor,
    challenges,
    lost: 0,
    multiples: [],
    tiers: {}
  }
  for (let i = 0; i < challenges; i++) {
    const fresh = createGameState({
      // Mô phỏng đo với thọ nguyên bật (game mới mặc định tắt, docs/rules/options.md).
      lifespanEnabled: true,
      seed: deriveSeed(seed, 'worldBoss', team.id, floor, i),
      party,
      floorBiomeIds: floorMapsFor(data, {
        floor,
        biomeId: null,
        seed: deriveSeed(seed, 'worldBossMap', team.id, floor, i)
      }),
      tamerRealm: assumedTamerRealm(floor)
    })
    const keyed = { ...fresh, inventory: inventoryWithKeyItems(data, fresh) }
    const state = withLeadZCrystal(data, townWithBoss(data, keyed))
    const current = state.worldBoss.current
    if (!current) throw new Error('Mô phỏng boss thế giới: boss không xuất hiện')
    const { state: after, stats } = runBattle(data, state, {
      kind: 'boss',
      maxTurns: data.config.worldBoss.turns + TURN_MARGIN,
      start: { type: 'challengeWorldBoss' }
    })
    if (stats.outcome === 'lost') row.lost++
    const bestDamage = after.worldBoss.current?.bestDamage ?? current.bestDamage
    row.multiples.push(bestDamage.div(current.hpUnit).toNumber())
    const tierId = worldBossTierOf(data, { bestDamage, hpUnit: current.hpUnit })?.id ?? NO_TIER
    row.tiers[tierId] = (row.tiers[tierId] ?? 0) + 1
  }
  return row
}
