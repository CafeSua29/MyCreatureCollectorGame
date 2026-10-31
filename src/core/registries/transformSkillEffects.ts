// Hiệu ứng skill bảo vệ (mục "Dynamax" ở transformation.md, họ Protect ở pokemon-moves.md): chặn
// skill nhắm vào quái trong lượt (Max Guard, Protect, Detect, King's Shield...) hoặc trụ lại 1 máu
// (Endure). Gộp vào SKILL_EFFECTS.

import { asObject, checkNumber } from '../shared'
import { getCurrentHp, getMaxHp } from '../monster'
import type { GameData } from '../model'
import { noChanges, type SkillEffectHandler } from './skillEffectTypes'
import { checkTraitEffects, type TraitEffect } from './traitDsl'

// ---------- protect: chặn mọi skill nhắm vào quái dùng trong lượt (kiểu Max Guard) ----------

export interface ProtectParams {
  /** Dùng thành công liên tiếp thì tỉ lệ lần sau ÷ số này (Pokémon: 3). */
  consecutiveChanceDivisor: number
  /** protect (mặc định): chặn skill; endure: trụ lại 1 máu trước đòn skill trong lượt (Endure). */
  mode?: 'protect' | 'endure'
  /** all (mặc định): chặn mọi skill nhắm vào; damaging: chỉ skill gây sát thương (King's Shield). */
  blocks?: 'all' | 'damaging'
  /**
   * Hiệu ứng ngôn ngữ trait khi chặn đòn tiếp xúc (self = quái bảo vệ, other = quái đánh; Spiky
   * Shield mất 1/8 máu, King's Shield −1 công, Baneful Bunker gây độc).
   */
  onContact?: TraitEffect[]
}

function validateProtect(params: unknown, data: GameData): string[] {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  const issues = checkNumber(obj.consecutiveChanceDivisor, 'consecutiveChanceDivisor', 1)
  if (obj.mode !== undefined && obj.mode !== 'protect' && obj.mode !== 'endure') {
    issues.push('mode phải là protect / endure')
  }
  if (obj.blocks !== undefined && obj.blocks !== 'all' && obj.blocks !== 'damaging') {
    issues.push('blocks phải là all / damaging')
  }
  if (obj.onContact !== undefined)
    issues.push(...checkTraitEffects(obj.onContact, 'onContact', data))
  return issues
}

const protect: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams: validateProtect,
  checkTarget: (_params, target) => (target === 'self' ? [] : ['chỉ dùng cho skill nhắm self']),
  apply(params, { rng }) {
    const { consecutiveChanceDivisor } = params as ProtectParams
    return { ...noChanges(rng), protect: { consecutiveChanceDivisor } }
  },
  // Như lệnh phòng thủ: defendWeight × máu đã mất (máu càng thấp càng muốn bảo vệ) × tỉ lệ thành
  // công (dùng liên tiếp ở lượt trước thì ÷ divisor mỗi lần).
  aiValue(params, { data, user, volatiles, battleTurn }) {
    const { consecutiveChanceDivisor } = params as ProtectParams
    const previous = volatiles?.[user.id]?.protect
    const streak =
      previous && battleTurn !== undefined && previous.turn === battleTurn - 1
        ? previous.streak + 1
        : 0
    const missing = 1 - getCurrentHp(data, user).div(getMaxHp(data, user)).toNumber()
    return data.config.ai.defendWeight * missing * consecutiveChanceDivisor ** -streak
  }
}

export const TRANSFORM_SKILL_EFFECTS: Readonly<Record<string, SkillEffectHandler>> = {
  protect
}
