// Hook thuộc tính Artifact của Siralim trên trang bị (mục "Trang bị và đồ cầm" ở equipment.md,
// "Trait Artifact Siralim" ở trait-dsl.md): ô spell, sức mạnh theo hệ ("[Class] Strength"), trait của
// món, hệ số dòng theo nhãn, chia % chỉ số trang bị cho đồng đội, giảm số món cần của bộ trang bị. Cùng quy ước cấp với traitHooks.ts:
// tỉ lệ / % nhân hệ số cấp; id, số lần, nhãn không đổi.

import { raceRefIds } from './races'
import { asObject, checkInteger, checkNumber } from '../shared'
import { NON_HP_STATS, TRAIT_KIND_RULES, type GameData, type NonHpStat } from '../model'
import type { TraitHookHandler } from './traitHooks'
import { checkIdList } from './paramChecks'
import { percentToMultiplier } from './traitHookUtils'

/** Ô spell của Artifact: sau khi quái tấn công, tung tỉ lệ để tự dùng spell. */
export interface SpellSlot {
  skillId: string
  chance: number
}

/** Hệ số của các dòng trang bị theo nhãn (kiểu Imbue, Warcraft, Aura Boost, Reticence). */
export interface LinePotency {
  tags: string[]
  percent: number
  /** Chỉ dòng đầu tiên mang nhãn trên quái (Aura Boost: "ô chỉ số đầu tiên"). */
  firstOnly?: boolean
  /** Bỏ qua dòng có tăng HP (Reticence: "trừ Health"; dòng nhiều chỉ số có HP bỏ cả dòng). */
  excludeHpLines?: boolean
}

/** Chia % chỉ số từ trang bị của quái phát hào quang (dùng bên trong `aura`). */
export interface EquipmentShare {
  percent: number
  stats: NonHpStat[]
  /** stats: cộng % chỉ số; damage: cộng % sát thương đòn vật lý (Dissection). */
  as: 'stats' | 'damage'
  /** Chỉ quái nhận thuộc các race này (Lead by Example); bỏ trống = mọi quái nhận. */
  raceIds?: string[]
}

function withObject(params: unknown, check: (obj: Record<string, unknown>) => string[]): string[] {
  const obj = asObject(params)
  return obj ? check(obj) : ['params phải là object']
}

const checkChance = (value: unknown, field: string): string[] =>
  checkNumber(value, field, Number.MIN_VALUE, 100)

function checkTags(value: unknown): string[] {
  return Array.isArray(value) && value.length > 0 && value.every((t) => typeof t === 'string' && t)
    ? []
    : ['tags phải là danh sách chuỗi khác rỗng']
}

function checkStats(value: unknown): string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((stat) => (NON_HP_STATS as readonly unknown[]).includes(stat))
    ? []
    : ['stats phải là danh sách chỉ số khác hp']
}

// ---------- spellSlot: ô spell (Siralim Spell Slot) ----------

const spellSlot: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkIdList([obj.skillId], 'skillId', data.skills, { label: 'skill' }),
      ...checkChance(obj.chance, 'chance')
    ]),
  spellSlot(params, scale) {
    const { skillId, chance } = params as SpellSlot
    return { skillId, chance: Math.min(100, chance * scale) }
  }
}

// ---------- Trait tác động ô spell ----------

// Battle Born: ô spell của phe +điểm % kích hoạt.
const spellSlotChanceBonus: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => checkNumber(obj.points, 'points', Number.MIN_VALUE)),
  spellSlotChanceBonus: (params, scale) => (params as { points: number }).points * scale
}

// Celebrate Decline: ô spell kích hoạt thì dùng thêm `count` lần.
const spellSlotExtraCasts: TraitHookHandler = {
  validateParams: (params) => withObject(params, (obj) => checkInteger(obj.count, 'count', 1)),
  spellSlotExtraCasts: (params) => (params as { count: number }).count
}

// Overcome: sau khi tấn công, ô spell có thêm một lần tung độc lập.
const extraSpellSlotRoll: TraitHookHandler = {
  validateParams: (params) => withObject(params, (obj) => checkChance(obj.chance, 'chance')),
  extraSpellSlotRollChance: (params, scale) =>
    Math.min(100, (params as { chance: number }).chance * scale)
}

// ---------- damageVsElement / damageFromElement: "[Class] Strength" ----------

interface ElementPercentParams {
  elementIds: string[]
  percent: number
}

const checkElementPercent = (params: unknown, data: GameData): string[] =>
  withObject(params, (obj) => [
    ...checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' }),
    ...checkNumber(obj.percent, 'percent', -100)
  ])

/** Gây thêm % sát thương lên quái mang một trong các hệ. */
const damageVsElement: TraitHookHandler = {
  validateParams: checkElementPercent,
  modifyDamageDealt(params, scale, { defender }) {
    const { elementIds, percent } = params as ElementPercentParams
    return defender.elementIds.some((id) => elementIds.includes(id))
      ? percentToMultiplier(percent * scale)
      : 1
  }
}

/** Nhận % sát thương (âm = ít hơn) từ quái mang một trong các hệ. */
const damageFromElement: TraitHookHandler = {
  validateParams: checkElementPercent,
  modifyDamageTaken(params, scale, { attacker }) {
    const { elementIds, percent } = params as ElementPercentParams
    return attacker.elementIds.some((id) => elementIds.includes(id))
      ? percentToMultiplier(percent * scale)
      : 1
  }
}

// ---------- equipmentTrait: món cho thêm một trait ("Artifact's trait") ----------

// Trait cho thêm chạy như trait của món (nguồn equipment); cấp = giá trị dòng.
const equipmentTrait: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const trait = typeof obj.traitId === 'string' ? data.traits[obj.traitId] : undefined
      const issues = checkInteger(obj.level, 'level', 1)
      if (!trait) issues.push(`trait không tồn tại "${String(obj.traitId)}"`)
      else if (!TRAIT_KIND_RULES[trait.kind].usesSlot) {
        issues.push(`trait loại "${trait.kind}" không cho qua trang bị được`)
      }
      return issues
    }),
  grantedTrait: (params) => params as { traitId: string; level: number }
}

// ---------- equipmentLinePotency: hệ số dòng trang bị theo nhãn ----------

const equipmentLinePotency: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => {
      const issues = [...checkTags(obj.tags), ...checkNumber(obj.percent, 'percent', -100)]
      for (const flag of ['firstOnly', 'excludeHpLines']) {
        if (obj[flag] !== undefined && obj[flag] !== true) issues.push(`${flag} chỉ được ghi true`)
      }
      return issues
    }),
  linePotency(params, scale) {
    const spec = params as LinePotency
    return { ...spec, percent: spec.percent * scale }
  }
}

// ---------- equipmentShare: chia % chỉ số trang bị của quái phát hào quang ----------

// Chỉ có tác dụng bên trong hào quang `aura` (forEachTraitHook đổi thành hook chỉ số / sát thương
// theo trang bị của quái phát).
const equipmentShare: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues = [
        ...checkNumber(obj.percent, 'percent', Number.MIN_VALUE),
        ...checkStats(obj.stats)
      ]
      if (obj.as !== 'stats' && obj.as !== 'damage') issues.push('as phải là stats / damage')
      if (obj.raceIds !== undefined) {
        issues.push(...checkIdList(obj.raceIds, 'raceIds', raceRefIds(data), { label: 'race' }))
      }
      return issues
    }),
  equipmentShare: (params, scale) => {
    const spec = params as EquipmentShare
    return { ...spec, percent: spec.percent * scale }
  }
}

/**
 * Giảm số món cần của bộ đặt tên (kiểu Ring of Royal Grandeur, docs/rules/equipment-sets.md): chỉ tính
 * khi nằm trên món đang lắp; không đổi theo cấp món (số món nguyên).
 */
const setPieceReduction: TraitHookHandler = {
  validateParams: (params) => withObject(params, (obj) => checkInteger(obj.value, 'value', 1)),
  setPieceReduction: (params) => (params as { value: number }).value
}

export const ARTIFACT_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  setPieceReduction,
  spellSlot,
  spellSlotChanceBonus,
  spellSlotExtraCasts,
  extraSpellSlotRoll,
  damageVsElement,
  damageFromElement,
  equipmentTrait,
  equipmentLinePotency,
  equipmentShare
}
