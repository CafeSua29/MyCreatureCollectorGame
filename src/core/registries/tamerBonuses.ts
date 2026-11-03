// Kênh thưởng ngự thú sư (docs/rules/tamer-talents.md mục "Kênh thưởng"): danh hiệu đang đeo, cây
// thiên phú ngự thú sư, buff chức vị tông môn, nâng cấp Tiên giới và thiên mệnh cùng cộng vào các kênh ở đây. Nơi dùng hỏi qua tamerBonusAmount /
// tamerBonusMultiplier theo kênh, không rẽ nhánh theo id danh hiệu / nút, không biết nguồn nào cộng.

import type { GameData, GameState, TamerBonusDef, TamerBonusType } from '../model'
import { asObject, checkInteger } from '../shared'
import { checkPercentParams } from './paramChecks'
import { sectBonusScales } from './sects'
import { tamerTalentScales } from './tamerTalents'

export interface TamerBonusHandler {
  validateParams(params: unknown): string[]
  /** Lượng của một hiệu ứng ở hệ số 1 (params đã qua validateParams). */
  amount(params: unknown): number
}

const percentBonus: TamerBonusHandler = {
  validateParams: (params) => checkPercentParams(params),
  // Ép kiểu: validateParams (kiểm tra dữ liệu) đảm bảo params có percent.
  amount: (params) => (params as { percent: number }).percent
}

/** Kênh theo số nguyên ≥ 1 trong một trường của params (lượt hồi chiêu, số ô). */
const countBonus = (field: string): TamerBonusHandler => ({
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkInteger(obj[field], field, 1)
    for (const key of Object.keys(obj)) if (key !== field) issues.push(`trường lạ "${key}"`)
    return issues
  },
  // Ép kiểu: validateParams đảm bảo params có trường này.
  amount: (params) => (params as Record<string, number>)[field]
})

export const TAMER_BONUSES: Readonly<Record<TamerBonusType, TamerBonusHandler>> = {
  expPercent: percentBonus,
  moneyPercent: percentBonus,
  dropRatePercent: percentBonus,
  catchRatePercent: percentBonus,
  recruitPercent: percentBonus,
  shinyChancePercent: percentBonus,
  alchemySuccessPercent: percentBonus,
  smithingSuccessPercent: percentBonus,
  cookingSuccessPercent: percentBonus,
  shopPricePercent: percentBonus,
  dwellingOutputPercent: percentBonus,
  teamStatPercent: percentBonus,
  manaPercent: percentBonus,
  contractLevelPercent: percentBonus,
  tamerSkillCooldown: countBonus('turns'),
  teamDamagePercent: percentBonus,
  contractResonancePercent: percentBonus,
  breakthroughCostPercent: percentBonus,
  startFloorPercent: percentBonus,
  keepMoneyPercent: percentBonus,
  destinySlots: countBonus('slots'),
  partySlotPenalty: countBonus('slots')
}

export const isTamerBonusType = (type: string): type is TamerBonusType =>
  Object.hasOwn(TAMER_BONUSES, type)

/** Tổng lượng một kênh trong danh sách hiệu ứng, nhân hệ số `scale`. */
function sumBonus(
  effects: readonly TamerBonusDef[],
  channel: TamerBonusType,
  scale: number
): number {
  return effects
    .filter((effect) => effect.type === channel)
    .reduce((sum, effect) => sum + TAMER_BONUSES[channel].amount(effect.params) * scale, 0)
}

/**
 * Phần state cần để tính kênh thưởng: danh hiệu đang đeo, cấp thiên phú ngự thú sư, tông môn, nâng
 * cấp Tiên giới, thiên mệnh.
 */
export type TamerBonusState = Pick<GameState, 'titles' | 'destinies'> & {
  tamer: Pick<GameState['tamer'], 'talentRanks'>
  sect: Pick<GameState['sect'], 'sectId' | 'rank'>
  ascension: Pick<GameState['ascension'], 'upgrades'>
}

/** Lượng một kênh của danh hiệu `titleId` (null / id không còn trong dữ liệu: 0). */
export function titleBonusAmount(
  data: GameData,
  titleId: string | null,
  channel: TamerBonusType
): number {
  if (titleId === null || !Object.hasOwn(data.titles, titleId)) return 0
  return sumBonus(data.titles[titleId].effects, channel, 1)
}

/**
 * Tổng lượng một kênh (% hoặc lượt) = danh hiệu đang đeo + mọi nút thiên phú ngự thú sư (lượng ×
 * cấp) + buff tông môn (lượng × (chức vị + 1), docs/rules/sects.md) + nâng cấp Tiên giới (lượng ×
 * cấp) + thiên mệnh (docs/rules/ascension.md). Id không còn trong dữ liệu thì bỏ qua.
 */
export function tamerBonusAmount(
  data: GameData,
  state: TamerBonusState,
  channel: TamerBonusType
): number {
  let total = titleBonusAmount(data, state.titles.active, channel)
  for (const { node, rank } of tamerTalentScales(data, state.tamer.talentRanks)) {
    total += sumBonus(node.effects, channel, rank)
  }
  const sect = sectBonusScales(data, state.sect)
  if (sect) total += sumBonus(sect.effects, channel, sect.scale)
  for (const [upgradeId, rank] of Object.entries(state.ascension.upgrades)) {
    const upgrade = data.ascensionUpgrades[upgradeId]
    if (upgrade) total += sumBonus(upgrade.effects, channel, rank)
  }
  for (const destinyId of state.destinies) {
    const destiny = data.destinies[destinyId]
    if (destiny) total += sumBonus(destiny.effects, channel, 1)
  }
  return total
}

/** Hệ số của một kênh %: 1 + tamerBonusAmount / 100 (không dưới 0); không có nguồn nào thì 1. */
export const tamerBonusMultiplier = (
  data: GameData,
  state: TamerBonusState,
  channel: TamerBonusType
): number => Math.max(0, 1 + tamerBonusAmount(data, state, channel) / 100)
