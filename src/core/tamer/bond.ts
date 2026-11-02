// Bản mệnh thú (docs/rules/tamer.md mục "Bản mệnh thú"): luật dùng chung cho chỉ số / thọ nguyên
// (hệ số theo cờ Monster.bond), linh lực trong trận, đạo thương khi bản mệnh chết hẳn. Action kết /
// đổi bản mệnh ở roster/bondActions.ts.

import { ActionError, BIG_ZERO } from '../shared'
import { dayOf, type GameData, type GameState, type Monster } from '../model'

/** Đang bị đạo thương vào ngày `day` (mặc định hôm nay). */
export function isTamerWounded(
  state: Pick<GameState, 'tamer' | 'time'>,
  day = dayOf(state.time)
): boolean {
  const until = state.tamer.woundUntilDay
  return until !== null && day <= until
}

/** Ném tamerWounded nếu đang bị đạo thương (chặn đột phá). */
export function assertNotWounded(state: Pick<GameState, 'tamer' | 'time'>): void {
  const until = state.tamer.woundUntilDay
  if (until !== null && isTamerWounded(state))
    throw new ActionError('tamerWounded', { untilDay: until })
}

/** Ngày cuối đạo thương nếu bản mệnh chết hẳn hôm nay (tính cả hôm nay). */
export const woundUntilDayFrom = (data: GameData, day: number): number =>
  day + data.config.bond.woundDays - 1

/**
 * Trong các quái vừa chết hẳn có bản mệnh thì ngự thú sư bị đạo thương: trả tamer mới và id bản mệnh
 * (null nếu không có bản mệnh trong danh sách).
 */
export function woundIfBondDied(
  data: GameData,
  state: Pick<GameState, 'tamer' | 'time'>,
  died: readonly Monster[]
): { tamer: GameState['tamer']; bondId: string | null; woundUntilDay: number } {
  const bond = died.find((monster) => monster.bond)
  const woundUntilDay = woundUntilDayFrom(data, dayOf(state.time))
  if (!bond) return { tamer: state.tamer, bondId: null, woundUntilDay }
  return { tamer: { ...state.tamer, woundUntilDay }, bondId: bond.id, woundUntilDay }
}

/** Ném isBondBeast nếu quái là bản mệnh (không thả / làm quái phụ / hiến tế). */
export function assertNotBond(monster: Monster): void {
  if (monster.bond) throw new ActionError('isBondBeast', { monsterId: monster.id })
}

/** Ngự thú sư mới (game mới, test): chưa từng kết bản mệnh, không đạo thương, chưa nâng thiên phú. */
export const newTamerState = (realm = 0): GameState['tamer'] => ({
  realm,
  exp: BIG_ZERO,
  bondDay: null,
  woundUntilDay: null,
  talentRanks: {},
  bonusTalentPoints: 0
})
