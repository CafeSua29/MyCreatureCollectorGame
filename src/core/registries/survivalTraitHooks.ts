// Hook trait sống sót (mục "Trait sống sót" ở battle-traits.md): trụ lại 1 máu trước đòn skill chí mạng
// (kiểu Sturdy khi đầy máu, hoặc theo tỉ lệ một lần mỗi trận) và hồi sinh một lần mỗi trận (kiểu
// Phượng hoàng). Cùng quy ước với traitHooks.ts: tỉ lệ và % máu nhân hệ số cấp, kẹp 100; điều kiện
// đầy máu và số lần không đổi theo cấp.

import { asObject, checkNumber } from '../shared'
import type { TraitHookHandler } from './traitHooks'

/** Một cách trụ lại đang thỏa điều kiện: tỉ lệ (%, 100 = chắc chắn), có giới hạn một lần mỗi trận. */
export interface LethalSurvival {
  chance: number
  oncePerBattle: boolean
}

interface SurviveLethalParams {
  /** true: chỉ khi đầy máu trước đòn (không giới hạn số lần, như Sturdy). */
  fromFullHp: boolean
  /** %; bỏ trống = 100. Bắt buộc khi fromFullHp = false. */
  chance?: number
  /**
   * true: không áp khi đầy máu trước đòn (thân mật: tránh trụ đòn hạ ngay từ đầy máu); chỉ dùng
   * với fromFullHp = false.
   */
  exceptFullHp?: true
}

const checkChance = (value: unknown): string[] =>
  checkNumber(value, 'chance', Number.MIN_VALUE, 100)

// ---------- surviveLethal: đòn skill đủ hạ gục thì còn 1 máu ----------

const surviveLethal: TraitHookHandler = {
  heldUse: 'survive',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    if (typeof obj.fromFullHp !== 'boolean') return ['fromFullHp phải là true hoặc false']
    // Không cần đầy máu mà luôn trụ thì quái bất tử với skill: bắt buộc có tỉ lệ (và một lần mỗi
    // trận, xem lethalSurvival).
    if (!obj.fromFullHp && obj.chance === undefined) {
      return ['chance là bắt buộc khi fromFullHp = false']
    }
    if (obj.exceptFullHp !== undefined && (obj.exceptFullHp !== true || obj.fromFullHp)) {
      return ['exceptFullHp chỉ được ghi true, cùng fromFullHp = false']
    }
    return obj.chance === undefined ? [] : checkChance(obj.chance)
  },
  lethalSurvival(params, scale, { fullHp }) {
    const { fromFullHp, chance, exceptFullHp } = params as SurviveLethalParams
    if (fromFullHp && !fullHp) return null
    if (exceptFullHp && fullHp) return null
    return {
      chance: chance === undefined ? 100 : Math.min(100, chance * scale),
      // Phải đầy máu thì muốn trụ lại phải hồi đầy trước; không cần đầy máu thì một lần mỗi trận
      // để không có quái bất tử.
      oncePerBattle: !fromFullHp
    }
  }
}

// ---------- reviveOnce: gục thì sống lại với % max HP, một lần mỗi trận ----------

const reviveOnce: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.hpPercent, 'hpPercent', Number.MIN_VALUE, 100)
      : ['params phải là object']
  },
  revivePercent: (params, scale) =>
    Math.min(100, (params as { hpPercent: number }).hpPercent * scale)
}

export const SURVIVAL_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  surviveLethal,
  reviveOnce
}
