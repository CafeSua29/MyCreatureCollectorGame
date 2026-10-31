// Hook ability đổi dạng trong trận (mục "Dạng trong trận" ở docs/rules/battle-forms.md): đổi dạng khi
// dùng skill (Stance Change), khi rời sân (Zero to Hero), chặn đòn đầu bằng dạng (Disguise, Ice
// Face). Đổi dạng theo sự kiện khác (máu, thời tiết, cuối lượt) viết bằng hiệu ứng `changeForm` của
// ngôn ngữ trait. Bảng dạng là loài → dạng, loài khác (ability bị chép sang) thì không có tác dụng.

import { asObject, checkEnumList, checkNumber } from '../shared'
import { SKILL_CATEGORIES, type Skill, type SkillCategory } from '../model'
import type { TraitHookHandler } from './traitHooks'
import { checkFormMap, checkIdList } from './paramChecks'

type FormMap = Readonly<Record<string, string>>

/** Dạng chặn đòn (Disguise, Ice Face): dạng sau khi chặn và máu mất (% max HP). */
export interface DisguiseRule {
  formId: string
  hpCostPercent: number
}

const formOnSkill: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkFormMap(data, obj.forms, 'forms'),
      ...checkIdList(obj.revertSkillIds, 'revertSkillIds', data.skills, { label: 'skill' })
    ]
  },
  // Stance Change: trước skill gây sát thương → dạng tấn công; trước skill về dạng (King's Shield)
  // → dạng thường. Skill trạng thái khác giữ nguyên.
  formForSkill(params, speciesId, skill: Skill) {
    const p = params as { forms: FormMap; revertSkillIds: string[] }
    if (!Object.hasOwn(p.forms, speciesId)) return undefined
    if (p.revertSkillIds.includes(skill.id)) return null
    return skill.category === 'status' ? undefined : p.forms[speciesId]
  }
}

const formOnLeave: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    return obj ? checkFormMap(data, obj.forms, 'forms') : ['params phải là object']
  },
  formOnLeave: (params, speciesId) => (params as { forms: FormMap }).forms[speciesId]
}

const disguise: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkFormMap(data, obj.forms, 'forms'),
      ...checkEnumList(obj.categories, 'categories', SKILL_CATEGORIES),
      ...checkNumber(obj.hpCostPercent, 'hpCostPercent', 0, 100)
    ]
  },
  disguiseRule(params, speciesId, category: SkillCategory): DisguiseRule | null {
    const p = params as { forms: FormMap; categories: SkillCategory[]; hpCostPercent: number }
    const formId = p.forms[speciesId]
    if (formId === undefined || !p.categories.includes(category)) return null
    return { formId, hpCostPercent: p.hpCostPercent }
  }
}

export const FORM_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  formOnSkill,
  formOnLeave,
  disguise
}
