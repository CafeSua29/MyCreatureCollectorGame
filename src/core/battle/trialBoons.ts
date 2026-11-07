// Ân huệ trong lượt bí cảnh (docs/rules/trial-boons.md): tung lựa chọn sau trận thắng, chọn / bỏ ở
// thị trấn, ân huệ của trận (hook theo phe, % thưởng). Hồi máu / rương thêm áp ở trialOutcome.ts.

import { ActionError, toBig, type Decimal } from '../shared'
import { appendLog } from '../model'
import {
  rollTrialBoonChoices,
  trialBoonBossWeakenPercent,
  trialBoonRewardPercent,
  trialBoonStacks
} from '../registries'
import { getMaxHp } from '../monster'
import { floorLevelRange } from '../world'
import type {
  BattleRewardChannel,
  BattleTrial,
  GameData,
  GameState,
  SecretRealm,
  TeamBonus,
  TrialBoonStack
} from '../model'
import { log, type Draft } from './draft'

/**
 * Sau trận thắng (trừ trận cuối): tung lựa chọn ân huệ cho bí cảnh `realm` (đã cộng tiến độ; độ bất
 * ổn tầng hiện tại nâng bậc hiếm, không đổi được giữa lượt vì setInstability bị chặn), log
 * trialBoonOffered khi có lựa chọn. Trả bí cảnh kèm lựa chọn.
 */
export function offerTrialBoons(data: GameData, d: Draft, realm: SecretRealm): SecretRealm {
  let boonChoices: string[]
  ;[boonChoices, d.rng] = rollTrialBoonChoices(data, d.rng, {
    realm,
    instabilityLevel: d.instability.level
  })
  if (boonChoices.length > 0) log(d, { type: 'trialBoonOffered', boonIds: [...boonChoices] })
  return { ...realm, boonChoices }
}

/** Ân huệ của trận đang đánh: chỉ trận bí cảnh, lấy từ bí cảnh đang đi. */
export function battleTrialBoons(
  state: Pick<GameState, 'trial'>,
  trial: Pick<BattleTrial, 'kind'> | null
): readonly TrialBoonStack[] {
  if (trial?.kind !== 'realm' || state.trial?.kind !== 'realm') return []
  return state.trial.boons
}

/** Mục phối hợp đội phe người chơi của các ân huệ trong trận (hệ số hook = cấp). */
export const trialBoonTeamBonuses = (boons: readonly TrialBoonStack[]): TeamBonus[] =>
  boons.map(({ boonId, stacks }) => ({ kind: 'boon', id: boonId, stacks }))

/** % thưởng theo kênh của ân huệ trong trận bí cảnh đang kết thúc (không phải trận bí cảnh: 0). */
export const battleTrialBoonRewardPercent = (
  data: GameData,
  d: Draft,
  channel: BattleRewardChannel
): number => trialBoonRewardPercent(data, battleTrialBoons(d, d.battle.trial), channel)

/**
 * Ân huệ bossWeaken lúc mở trận boss bí cảnh: mỗi quái địch mất % max HP (làm tròn xuống, tổng kẹp
 * bossWeakenCapPercent nên không gục), log bossWeakened. Trận khác / không có ân huệ: không đổi.
 */
export function weakenTrialBosses(data: GameData, d: Draft): void {
  if (!d.battle.isBoss) return
  const percent = trialBoonBossWeakenPercent(data, battleTrialBoons(d, d.battle.trial))
  if (percent <= 0) return
  d.battle.enemies = d.battle.enemies.map((enemy) => {
    const amount = getMaxHp(data, enemy).times(percent).div(100).floor()
    if (amount.lte(0)) return enemy
    log(d, { type: 'bossWeakened', monsterId: enemy.id, amount })
    return { ...enemy, damageTaken: enemy.damageTaken.plus(amount) }
  })
}

/** Bí cảnh có lựa chọn ân huệ đang chờ (ngoài trận); không thì noTrial / noTrialBoonChoice. */
function requireBoonChoices(state: GameState): SecretRealm {
  if (state.battle) throw new ActionError('inBattle')
  if (state.trial?.kind !== 'realm') throw new ActionError('noTrial')
  if (state.trial.boonChoices.length === 0) throw new ActionError('noTrialBoonChoice')
  return state.trial
}

/** Chọn một ân huệ trong lựa chọn: chưa có thì cấp 1, đã có thì + 1 cấp; xóa lựa chọn. */
export function chooseTrialBoon(state: GameState, boonId: string): GameState {
  const realm = requireBoonChoices(state)
  if (!realm.boonChoices.includes(boonId)) throw new ActionError('notTrialBoonChoice', { boonId })
  const stacks = trialBoonStacks(realm, boonId) + 1
  const boons =
    stacks === 1
      ? [...realm.boons, { boonId, stacks }]
      : realm.boons.map((boon) => (boon.boonId === boonId ? { boonId, stacks } : boon))
  const trial: SecretRealm = { ...realm, boons, boonChoices: [] }
  return appendLog({ ...state, trial }, { type: 'trialBoonChosen', boonId, stacks })
}

/** Tiền khi bỏ lựa chọn: moneyPerLevel × level tối đa của tầng sức mạnh × skipMoneyPercent %. */
export function trialBoonSkipMoney(data: GameData, floor: number): Decimal {
  const { moneyPerLevel } = data.config.rewards
  return toBig(moneyPerLevel)
    .times(floorLevelRange(data, floor).max)
    .times(data.config.trials.boons.skipMoneyPercent)
    .div(100)
    .floor()
}

/** Bỏ lựa chọn ân huệ, nhận một ít tiền theo tầng sức mạnh của bí cảnh. */
export function skipTrialBoon(data: GameData, state: GameState): GameState {
  const realm = requireBoonChoices(state)
  const money = trialBoonSkipMoney(data, realm.floor)
  return appendLog(
    { ...state, money: state.money.plus(money), trial: { ...realm, boonChoices: [] } },
    { type: 'trialBoonSkipped', money }
  )
}
