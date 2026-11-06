// Hook trạng thái cho buff / debuff theo hiệu ứng gốc của Siralim (mục "Buff và debuff" ở
// battle.md): hết khi bị đánh / tan dần, chặn loại skill, mục tiêu ngẫu nhiên, rối loạn, chặn đổi
// chỉ số, chặn hồi máu, phản sát thương, nổ, khiên, chặn đòn, tàng hình, tự phòng thủ, kẹt cuối
// Timeline, đảo ngược, tái sinh. Hiệu ứng dạng trait (Berserk, Protected...) khai báo bằng
// `traitHooks` của trạng thái, không ở đây. Cùng quy ước với statusHooks.ts.

import { asObject, checkNumber } from '../shared'
import { SKILL_CATEGORIES, type NonHpStat, type SkillCategory } from '../model'
import type { StatusHookHandler } from './statusHooks'
import { isStageStat } from './paramChecks'

const emptyParams = (params: unknown): string[] => {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  return Object.keys(obj).length === 0 ? [] : ['hook này không có params']
}

const withObject = (
  params: unknown,
  check: (obj: Record<string, unknown>) => string[]
): string[] => {
  const obj = asObject(params)
  return obj ? check(obj) : ['params phải là object']
}

function checkCategories(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  return value.flatMap((c) =>
    (SKILL_CATEGORIES as readonly unknown[]).includes(c)
      ? []
      : [`${field}: loại skill lạ "${String(c)}"`]
  )
}

const percentParam =
  (field: string, min = 0, max = 100) =>
  (params: unknown): string[] =>
    withObject(params, (obj) => checkNumber(obj[field], field, min, max))

const endsOnDamage: StatusHookHandler = {
  validateParams: emptyParams,
  endsOnDamage: () => true
}

interface ThawParams {
  chance: number
  /** Tỉ lệ gấp đôi sau mỗi cuối lượt (Frozen). */
  doubling?: true
}

const thaw: StatusHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => [
      ...checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100),
      ...(obj.doubling === undefined || obj.doubling === true ? [] : ['doubling chỉ được là true'])
    ]),
  endChanceAtTurnEnd(params, { turnsElapsed }) {
    const { chance, doubling } = params as ThawParams
    return doubling ? Math.min(100, chance * 2 ** (turnsElapsed - 1)) : chance
  }
}

const blockCategories: StatusHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => checkCategories(obj.categories, 'categories')),
  blockedCategories: (params) => (params as { categories: SkillCategory[] }).categories
}

const randomTarget: StatusHookHandler = {
  validateParams: emptyParams,
  randomizesTarget: () => true
}

const confusion: StatusHookHandler = {
  validateParams: percentParam('chance', Number.MIN_VALUE),
  confusionChance: (params) => (params as { chance: number }).chance
}

const blockStatGain: StatusHookHandler = {
  validateParams: emptyParams,
  blocksStatGain: () => true
}

const blockStatLoss: StatusHookHandler = {
  validateParams: emptyParams,
  blocksStatLoss: () => true
}

const healBlock: StatusHookHandler = {
  validateParams: percentParam('damagePercent', 0, Infinity),
  healBlockDamagePercent: (params) => (params as { damagePercent: number }).damagePercent
}

const recoil: StatusHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => [
      ...(isStageStat(obj.stat) ? [] : ['stat phải là chỉ số khác hp']),
      ...checkNumber(obj.percent, 'percent', Number.MIN_VALUE)
    ]),
  recoilOnDamage: (params) => params as { stat: NonHpStat; percent: number }
}

const detonate: StatusHookHandler = {
  validateParams: percentParam('percent', Number.MIN_VALUE),
  detonatePercent: (params) => (params as { percent: number }).percent
}

const barrier: StatusHookHandler = {
  validateParams: percentParam('capPercent', Number.MIN_VALUE, Infinity),
  barrierCapPercent: (params) => (params as { capPercent: number }).capPercent
}

const shell: StatusHookHandler = {
  validateParams: emptyParams,
  blocksNextHit: () => true
}

const untargetable: StatusHookHandler = {
  validateParams: emptyParams,
  untargetable: () => true
}

const endsAfterAction: StatusHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) =>
      obj.categories === undefined ? [] : checkCategories(obj.categories, 'categories')
    ),
  endsAfterAction: (params) => (params as { categories?: SkillCategory[] }).categories ?? null
}

const autoGuard: StatusHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) =>
      obj.command === 'defend' || obj.command === 'provoke'
        ? []
        : ['command phải là defend / provoke']
    ),
  autoGuard: (params) => (params as { command: 'defend' | 'provoke' }).command
}

const stuckAtBottom: StatusHookHandler = {
  validateParams: percentParam('breakChance'),
  stuckAtBottom: (params) => params as { breakChance: number }
}

const invert: StatusHookHandler = {
  validateParams: percentParam('amountPercentOfMaxHp', Number.MIN_VALUE, Infinity),
  inverts: (params) => params as { amountPercentOfMaxHp: number }
}

const rebirth: StatusHookHandler = {
  validateParams: percentParam('hpPercent', Number.MIN_VALUE),
  rebirthPercent: (params) => (params as { hpPercent: number }).hpPercent
}

/** Cuối lượt mất máu bằng lượng của trạng thái (Mania: 3% tổng máu mọi quái đã hồi lúc dính). */
const amountDamage: StatusHookHandler = {
  validateParams: emptyParams,
  dealsAmountAtTurnEnd: () => true
}

export const SIRALIM_STATUS_HOOKS: Readonly<Record<string, StatusHookHandler>> = {
  endsOnDamage,
  thaw,
  blockCategories,
  randomTarget,
  confusion,
  blockStatGain,
  blockStatLoss,
  healBlock,
  recoil,
  detonate,
  barrier,
  shell,
  untargetable,
  endsAfterAction,
  autoGuard,
  stuckAtBottom,
  invert,
  rebirth,
  amountDamage
}
