// Danh hiệu (docs/rules/achievements.md mục "Danh hiệu"): mỗi loại hiệu ứng một handler; mọi loại là
// một kênh %, chỉ danh hiệu đang đeo có tác dụng. Nơi dùng hỏi qua titlePercent / titleMultiplier,
// không rẽ nhánh theo id danh hiệu.

import type { GameData, TitleEffectType, TitleState } from '../model'
import { checkPercentParams } from './paramChecks'

export interface TitleEffectHandler {
  validateParams(params: unknown): string[]
}

const percentEffect: TitleEffectHandler = { validateParams: (params) => checkPercentParams(params) }

export const TITLE_EFFECTS: Readonly<Record<TitleEffectType, TitleEffectHandler>> = {
  expPercent: percentEffect,
  moneyPercent: percentEffect,
  dropRatePercent: percentEffect,
  catchRatePercent: percentEffect,
  recruitPercent: percentEffect,
  shinyChancePercent: percentEffect,
  alchemySuccessPercent: percentEffect
}

export const isTitleEffectType = (type: string): type is TitleEffectType =>
  Object.hasOwn(TITLE_EFFECTS, type)

/** Tổng % một kênh của danh hiệu đang đeo (không đeo / id không còn trong dữ liệu: 0). */
export function titlePercent(
  data: GameData,
  titles: Pick<TitleState, 'active'>,
  channel: TitleEffectType
): number {
  const { active } = titles
  if (active === null || !Object.hasOwn(data.titles, active)) return 0
  return (
    data.titles[active].effects
      .filter((effect) => effect.type === channel)
      // Ép kiểu: kiểm tra dữ liệu (TITLE_EFFECTS.validateParams) đảm bảo params có percent.
      .reduce((sum, effect) => sum + (effect.params as { percent: number }).percent, 0)
  )
}

/** Hệ số của một kênh: 1 + titlePercent / 100 (không dưới 0); không đeo danh hiệu thì 1. */
export const titleMultiplier = (
  data: GameData,
  titles: Pick<TitleState, 'active'>,
  channel: TitleEffectType
): number => Math.max(0, 1 + titlePercent(data, titles, channel) / 100)
