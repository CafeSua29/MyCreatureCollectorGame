// Thần linh trong trận (docs/rules/deities.md): thần cai quản map của trận, ân sủng sau trận, tín vật
// rơi, hệ số chúc phúc của trận. Đặt ân sủng / cửa hàng thần ở Miếu (thị trấn): world/deities.ts.

import { blessingMultiplier, favorRank, type BlessingChannel } from '../registries'
import { toBig } from '../shared'
import type { BattleOutcome, BattleState, DropEntry, GameData, GameState } from '../model'
import { battleBiome } from '../world'
import { Draft, log } from './draft'
import { TRAINER_MODE_RULES } from './trainerModes'
import { specialRule } from './specialBattles'

/**
 * Thần cai quản map của trận; null nếu trận không diễn ra trong map (độ kiếp, giải đấu, đấu trường,
 * thú triều) hoặc map không có thần.
 */
export function battleDeityId(
  data: GameData,
  state: Pick<GameState, 'floorBiomeIds'>,
  battle: Pick<BattleState, 'floor' | 'trial' | 'special' | 'trainer' | 'tribulation'>
): string | null {
  if (battle.tribulation) return null
  if (battle.trainer && !TRAINER_MODE_RULES[battle.trainer.mode].inMap) return null
  if (battle.special && !specialRule(battle.special).inMap) return null
  return battleBiome(data, state, battle).deityId ?? null
}

/** Hệ số một kênh chúc phúc cho trận đang đánh (1 nếu không có thần / chưa có bậc). */
export const battleBlessingMultiplier = (
  data: GameData,
  state: Pick<GameState, 'floorBiomeIds' | 'favor'> & { battle: BattleState },
  channel: BlessingChannel
): number =>
  blessingMultiplier(data, state.favor, {
    deityId: battleDeityId(data, state, state.battle),
    channel
  })

/** Cộng ân sủng với thần; log ân sủng nhận và lên bậc (nếu có). */
export function gainFavor(
  data: GameData,
  d: Draft,
  { deityId, amount }: { deityId: string; amount: number }
): void {
  if (amount <= 0) return
  const before = Object.hasOwn(d.favor, deityId) ? d.favor[deityId] : toBig(0)
  const after = before.plus(amount)
  d.favor = { ...d.favor, [deityId]: after }
  const rank = favorRank(data, after)
  log(d, { type: 'favorGained', deityId, amount, rank })
  if (rank > favorRank(data, before)) log(d, { type: 'blessingRankUp', deityId, rank })
}

/**
 * Hết trận trong map có thần (mọi kết quả): mỗi quái bắt được + favorPerCapture; thắng thì
 * + favorPerWin, trận boss thêm favorPerBossWin.
 */
export function grantBattleFavor(data: GameData, d: Draft, outcome: BattleOutcome): void {
  const deityId = battleDeityId(data, d, d.battle)
  if (deityId === null) return
  const config = data.config.deities
  let amount = d.battle.captured.length * config.favorPerCapture
  if (outcome === 'won') {
    amount += config.favorPerWin + (d.battle.isBoss ? config.favorPerBossWin : 0)
  }
  gainFavor(data, d, { deityId, amount })
}

/** Tín vật của thần cai quản map rơi từ mỗi quái hoang / boss bị hạ (× hệ số rơi của trận). */
export function deityTokenDrops(data: GameData, d: Draft): DropEntry[] {
  const deityId = battleDeityId(data, d, d.battle)
  if (deityId === null) return []
  const { tokenWildChance, tokenBossChance } = data.config.deities
  const chance = d.battle.isBoss ? tokenBossChance : tokenWildChance
  return chance > 0 ? [{ itemId: data.deities[deityId].tokenItemId, chance }] : []
}
