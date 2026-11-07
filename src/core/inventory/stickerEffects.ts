// Registry hiệu ứng thuộc tính sticker (docs/rules/skill-stickers.md): mỗi loại hiệu ứng một handler.
// Loại cộng số / cờ góp vào hiệu lực của đúng skill mang sticker (StickerSkillBonus, đọc ở các bước
// trận); loại `trait` cho hook trait lên quái (tự dùng skill, chỉ số bị động...); `extraSlot` thêm ô
// skill. Thêm cơ chế mới = thêm một mục ở đây.

import { asObject, checkInteger, checkNumber } from '../shared'
import { STAT_NAMES, type StatName, type StickerEffectType, type StickerSkillBonus } from '../model'

export interface StickerEffectHandler {
  /** Lỗi của params (giá trị đã ghi vào); hook của loại `trait` kiểm tra thêm ở gameData. */
  validateParams(params: unknown): string[]
  /** Góp vào hiệu lực của skill mang sticker. */
  addTo?(bonus: StickerSkillBonus, params: unknown): StickerSkillBonus
  /** Hook trait lên quái mang sticker (chưa kiểm tra kiểu: dữ liệu đã qua kiểm tra lúc khởi động). */
  traitHooks?(params: unknown): readonly unknown[]
  /** Số ô skill cộng thêm cho quái mang sticker. */
  extraSkillSlots?: number
  /** Dán được lên skill quái không tương thích (gốc "Compatibility: works with any tape"). */
  ignoresCompatibility?: true
}

/** Hiệu lực rỗng (không có sticker). */
export const NO_STICKER_BONUS: StickerSkillBonus = {
  powerPercent: 0,
  accuracyPercent: 0,
  critChancePercent: 0,
  critDamagePercent: 0,
  effectChancePercent: 0,
  splashPercent: 0,
  priorityChance: 0,
  extraHits: 0,
  statusTurns: 0,
  healPercent: 0,
  expPercent: 0,
  repeatChance: 0,
  multitargetChance: 0,
  wallChance: 0,
  staminaRefunds: [],
  attackStats: [],
  typeAdvantageCrit: false,
  ignoresWalls: false,
  destroysWalls: false
}

/** Trường lạ trong params. */
function unknownKeys(params: unknown, allowed: readonly string[]): string[] {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  return Object.keys(obj)
    .filter((key) => !allowed.includes(key))
    .map((key) => `params có trường lạ "${key}"`)
}

/** Giá trị số `key` của params (đã kiểm tra lúc khởi động; thiếu thì 0). */
function numberParam(params: unknown, key: string): number {
  const value = asObject(params)?.[key]
  return typeof value === 'number' ? value : 0
}

type NumericBonusField = {
  [K in keyof StickerSkillBonus]: StickerSkillBonus[K] extends number ? K : never
}[keyof StickerSkillBonus]

/** Loại cộng số `{ value }` vào một trường của hiệu lực (`integer`: giá trị nguyên ≥ 1). */
function additive(field: NumericBonusField, integer = false): StickerEffectHandler {
  return {
    validateParams: (params) => [
      ...unknownKeys(params, ['value']),
      ...(integer
        ? checkInteger(asObject(params)?.value, 'value', 1)
        : checkNumber(asObject(params)?.value, 'value', 0))
    ],
    addTo: (bonus, params) => ({ ...bonus, [field]: bonus[field] + numberParam(params, 'value') })
  }
}

/** Loại cờ không tham số. */
function flag(
  field?: 'typeAdvantageCrit' | 'ignoresWalls' | 'destroysWalls'
): StickerEffectHandler {
  return {
    validateParams: (params) => unknownKeys(params, []),
    ...(field ? { addTo: (bonus) => ({ ...bonus, [field]: true }) } : {})
  }
}

const isStatName = (value: unknown): value is StatName =>
  typeof value === 'string' && (STAT_NAMES as readonly string[]).includes(value)

export const STICKER_EFFECTS: Readonly<Record<StickerEffectType, StickerEffectHandler>> = {
  power: additive('powerPercent'),
  accuracy: additive('accuracyPercent'),
  critChance: additive('critChancePercent'),
  critDamage: additive('critDamagePercent'),
  effectChance: additive('effectChancePercent'),
  splash: additive('splashPercent'),
  priorityChance: additive('priorityChance'),
  extraHits: additive('extraHits', true),
  statusTurns: additive('statusTurns', true),
  heal: additive('healPercent'),
  exp: additive('expPercent'),
  repeatChance: additive('repeatChance'),
  multitargetChance: additive('multitargetChance'),
  wallChance: additive('wallChance'),
  // AP Refund của gốc: hoàn `amount` thể lực (1 AP = 10) hoặc toàn bộ giá skill (`all`).
  staminaRefund: {
    validateParams(params) {
      const obj = asObject(params)
      const issues = [
        ...unknownKeys(params, ['chance', 'amount', 'all']),
        ...checkNumber(obj?.chance, 'chance', 0, 100)
      ]
      if ((obj?.amount === undefined) === (obj?.all === undefined)) {
        issues.push('cần đúng một trong amount / all')
      }
      if (obj?.amount !== undefined) issues.push(...checkInteger(obj.amount, 'amount', 1))
      if (obj?.all !== undefined && obj.all !== true) issues.push('all phải là true')
      return issues
    },
    addTo: (bonus, params) => ({
      ...bonus,
      staminaRefunds: [
        ...bonus.staminaRefunds,
        {
          chance: numberParam(params, 'chance'),
          amount: asObject(params)?.all === true ? 'all' : numberParam(params, 'amount')
        }
      ]
    })
  },
  // Alternative Attack của gốc: dùng chỉ số này làm công nếu cao hơn.
  attackStat: {
    validateParams: (params) => [
      ...unknownKeys(params, ['stat']),
      ...(isStatName(asObject(params)?.stat) ? [] : ['stat phải là tên chỉ số'])
    ],
    addTo(bonus, params) {
      const stat = asObject(params)?.stat
      return isStatName(stat) ? { ...bonus, attackStats: [...bonus.attackStats, stat] } : bonus
    }
  },
  typeAdvantageCrit: flag('typeAdvantageCrit'),
  ignoresWalls: flag('ignoresWalls'),
  destroysWalls: flag('destroysWalls'),
  compatibility: { ...flag(), ignoresCompatibility: true },
  extraSlot: { ...flag(), extraSkillSlots: 1 },
  trait: {
    validateParams(params) {
      const hooks = asObject(params)?.hooks
      const issues = unknownKeys(params, ['hooks'])
      if (!Array.isArray(hooks) || hooks.length === 0)
        issues.push('hooks phải là danh sách khác rỗng')
      return issues
    },
    traitHooks(params) {
      const hooks = asObject(params)?.hooks
      return Array.isArray(hooks) ? hooks : []
    }
  }
}
