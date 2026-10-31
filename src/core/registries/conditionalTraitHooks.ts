// Hook trait chỉ số có điều kiện và theo đồng đội (mục "Trait" ở stats-traits.md): % chỉ số khi
// máu thấp / cao, khi đang dính trạng thái, trong các lượt đầu trên sân, khi có đồng đội; buff
// đồng đội, giảm sát thương đồng đội nhận, đổi accuracy của địch. Cùng quy ước với traitHooks.ts.
// Hook chỉ số có điều kiện không được đổi HP: max HP phải tính được trước điều kiện (tỉ lệ máu)
// và không đổi theo lượt / đồng đội. Ngưỡng và số lượt không đổi theo cấp trait.

import { asObject, checkEnumList, checkInteger, checkNumber } from '../shared'
import { MOVE_FLAGS, type MoveFlag, type PartialStats } from '../model'
import type { StatModifier, TraitContext, TraitHookHandler } from './traitHooks'
import { checkIdList } from './paramChecks'
import {
  checkConditionalPercent,
  scaleStats,
  validateEmptyParams,
  validatePartialStats
} from './traitHookUtils'

const NO_MODIFIER: StatModifier = { flat: {}, percent: {} }

/** Hook chỉ có `percent` chỉ số có điều kiện. */
function validatePercentStats(params: unknown): string[] {
  const obj = asObject(params)
  return obj ? checkConditionalPercent(obj.percent) : ['params phải là object']
}

/** Hook `{ <ngưỡng>, percent }` theo tỉ lệ máu. */
function validateHpThreshold(field: string) {
  return (params: unknown): string[] => {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [...checkNumber(obj[field], field, 0, 100), ...checkConditionalPercent(obj.percent)]
  }
}

const percentWhen = (condition: boolean, params: unknown, scale: number): StatModifier =>
  condition
    ? { flat: {}, percent: scaleStats((params as { percent: PartialStats }).percent, scale) }
    : NO_MODIFIER

/** % máu hiện tại; bỏ trống ở lượt tính max HP. */
const hpPercent = (ctx: TraitContext): number | undefined =>
  ctx.hpRatio === undefined ? undefined : ctx.hpRatio * 100

// ---------- statModifierWhileLowHp / statModifierWhileHighHp: theo tỉ lệ máu ----------

// Máu thấp: ≤ ngưỡng (như Blaze); máu cao: > ngưỡng (hai điều kiện bù nhau ở cùng ngưỡng).
const statModifierWhileLowHp: TraitHookHandler = {
  validateParams: validateHpThreshold('hpBelowPercent'),
  needsHpRatio: true,
  modifyStats(params, scale, ctx) {
    const hp = hpPercent(ctx)
    const threshold = (params as { hpBelowPercent: number }).hpBelowPercent
    return percentWhen(hp !== undefined && hp <= threshold, params, scale)
  }
}

const statModifierWhileHighHp: TraitHookHandler = {
  validateParams: validateHpThreshold('hpAbovePercent'),
  needsHpRatio: true,
  modifyStats(params, scale, ctx) {
    const hp = hpPercent(ctx)
    const threshold = (params as { hpAbovePercent: number }).hpAbovePercent
    return percentWhen(hp !== undefined && hp > threshold, params, scale)
  }
}

// ---------- statModifierWhileStatused: khi đang dính trạng thái bất thường (kiểu Guts) ----------

const statModifierWhileStatused: TraitHookHandler = {
  validateParams: validatePercentStats,
  modifyStats: (params, scale, { monster }) =>
    percentWhen(monster.statuses.length > 0, params, scale)
}

// ---------- statModifierIfCanEvolve: khi loài còn tiến hóa được (kiểu Eviolite) ----------

// Điều kiện không theo trận (loài hiện tại có hướng tiến hóa, chưa fuse) nên đổi được cả HP.
const statModifierIfCanEvolve: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    if (obj.percent === undefined) return ['percent là bắt buộc']
    return validatePartialStats(obj.percent, 'percent')
  },
  modifyStats(params, scale, { data, monster }) {
    const species = data.species[monster.speciesId]
    const canEvolve = !monster.fused && species?.kind === 'normal' && species.evolutions.length > 0
    return percentWhen(canEvolve, params, scale)
  }
}

// ---------- ignoreStatusDamagePenalty: bỏ qua hệ số giảm sát thương của trạng thái (Guts) ----------

// Như Pokémon: Guts không bị bỏng giảm sát thương vật lý. Chỉ bỏ qua hệ số < 1 (hệ số tăng nếu có
// vẫn giữ). Bật / tắt, không đổi theo cấp trait.
const ignoreStatusDamagePenalty: TraitHookHandler = {
  validateParams: validateEmptyParams,
  ignoresStatusDamagePenalty: () => true
}

// ---------- skipChargeTurn: bỏ lượt nạp của skill nạp (Power Herb) ----------

const skipChargeTurn: TraitHookHandler = {
  heldUse: 'charge',
  validateParams: validateEmptyParams,
  skipsChargeTurn: () => true
}

/** Cờ hành vi bật / tắt của ability (hook abilityFlag). */
export const ABILITY_FLAGS = [
  'ignoresTargetAbility',
  'bouncesStatusMoves',
  'keepsItems',
  'maxHits',
  'blocksSecondaryEffects',
  'contactIgnoresProtect',
  'ignoresRedirect',
  'ignoresOpponentStages',
  'ignoresScreens',
  'blocksSelfFaint',
  'blocksStatusMoves',
  'blocksPriorityMoves',
  'suppressesAbilities',
  'ignoresOwnItems',
  'drainHurts',
  'halvesStatusAccuracy',
  'suppressesWeather',
  'actsInSun',
  'contactPiercesProtect',
  'blocksFoeBerries',
  'ripensBerries',
  'eatsBerriesEarly',
  'passesItemToAlly',
  'reflectsStatDrops',
  'copiesFoeBoosts',
  'ignoresElementStatusImmunity',
  'noContact'
] as const

export type AbilityFlag = (typeof ABILITY_FLAGS)[number]

// ---------- abilityFlag / hitsImmuneWith / convertsSkillElement: ability Pokémon (abilities.md) ----------

const abilityFlag: TraitHookHandler = {
  validateParams: (params) => {
    const obj = asObject(params)
    return obj && (ABILITY_FLAGS as readonly unknown[]).includes(obj.flag)
      ? []
      : [`flag phải là một trong ${ABILITY_FLAGS.join(', ')}`]
  },
  abilityFlag: (params) => (params as { flag: AbilityFlag }).flag
}

const hitsImmune: TraitHookHandler = {
  validateParams: (params, data) => {
    const obj = asObject(params)
    return obj
      ? checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' })
      : ['params phải là object']
  },
  hitsImmuneWith: (params, elementId) =>
    (params as { elementIds: string[] }).elementIds.includes(elementId)
}

const convertSkillElement: TraitHookHandler = {
  validateParams: (params, data) => {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...(obj.moveFlags === undefined
        ? checkIdList(obj.fromElementIds, 'fromElementIds', data.elements, { label: 'hệ' })
        : checkEnumList(obj.moveFlags, 'moveFlags', MOVE_FLAGS)),
      ...(typeof obj.toElementId === 'string' && Object.hasOwn(data.elements, obj.toElementId)
        ? []
        : [`toElementId: hệ không tồn tại "${String(obj.toElementId)}"`]),
      ...checkNumber(obj.percent, 'percent', 0)
    ]
  },
  // Theo hệ (Pixilate: Thường → Tiên) hoặc theo cờ chiêu (Liquid Voice: chiêu âm thanh → Nước).
  convertsSkillElement(params, skill) {
    const p = params as {
      fromElementIds?: string[]
      moveFlags?: MoveFlag[]
      toElementId: string
      percent: number
    }
    const matches = p.moveFlags
      ? p.moveFlags.some((flag) => skill.moveFlags?.includes(flag))
      : (p.fromElementIds ?? []).includes(skill.elementId)
    return matches ? { elementId: p.toElementId, percent: p.percent } : null
  }
}

const weightMultiplier: TraitHookHandler = {
  validateParams: (params) => {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.multiplier, 'multiplier', Number.MIN_VALUE)
      : ['params phải là object']
  },
  weightMultiplier: (params) => (params as { multiplier: number }).multiplier
}

// ---------- effectivenessCapAtFullHp: đầy máu thì mọi đòn như bị kháng (Tera Shell) ----------

// Như Pokémon: đòn trung tính / khắc hệ lên quái đầy máu chỉ còn hệ số `cap` (×0,5); đòn đã bị kháng
// hay miễn nhiễm giữ nguyên.
const effectivenessCapAtFullHp: TraitHookHandler = {
  validateParams: (params) => {
    const obj = asObject(params)
    return obj ? checkNumber(obj.cap, 'cap', Number.MIN_VALUE) : ['params phải là object']
  },
  modifyDamageTaken(params, _scale, { effectiveness, defenderHpRatio }) {
    const { cap } = params as { cap: number }
    return defenderHpRatio >= 1 && effectiveness > cap ? cap / effectiveness : 1
  }
}

// ---------- moveFlagImmunity: miễn skill mang cờ chiêu (Overcoat: chiêu bột) ----------

const moveFlagImmunity: TraitHookHandler = {
  validateParams: (params) => {
    const obj = asObject(params)
    return obj ? checkEnumList(obj.flags, 'flags', MOVE_FLAGS) : ['params phải là object']
  },
  immuneMoveFlags: (params) => (params as { flags: MoveFlag[] }).flags
}

// ---------- recoilImmunity: miễn phản lực của skill (Rock Head) ----------

// Như Pokémon: chỉ miễn phản lực theo sát thương (`recoilPercent`), không miễn mất máu khi trượt
// (Jump Kick) hay chi phí máu (Mind Blown). Bật / tắt, không đổi theo cấp trait.
const recoilImmunity: TraitHookHandler = {
  validateParams: validateEmptyParams,
  immuneToRecoil: () => true
}

// ---------- statModifierFirstTurns: trong N lượt đầu trên sân (kiểu Slow Start) ----------

const statModifierFirstTurns: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [...checkInteger(obj.turns, 'turns', 1), ...checkConditionalPercent(obj.percent)]
  },
  modifyStats(params, scale, { battle }) {
    const { turns } = params as { turns: number }
    return percentWhen(battle !== undefined && battle.turnsOnField <= turns, params, scale)
  }
}

// ---------- statModifierWithAlly: khi có đồng đội còn sống trên sân ----------

const statModifierWithAlly: TraitHookHandler = {
  validateParams: validatePercentStats,
  modifyStats: (params, scale, { battle }) =>
    percentWhen(battle !== undefined && battle.allies.length > 0, params, scale)
}

export const CONDITIONAL_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  recoilImmunity,
  effectivenessCapAtFullHp,
  moveFlagImmunity,
  abilityFlag,
  hitsImmune,
  convertSkillElement,
  weightMultiplier,
  skipChargeTurn,
  statModifierWhileLowHp,
  statModifierWhileHighHp,
  statModifierWhileStatused,
  statModifierIfCanEvolve,
  ignoreStatusDamagePenalty,
  statModifierFirstTurns,
  statModifierWithAlly
}
