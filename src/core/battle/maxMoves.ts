// Chiêu của quái Dynamax (mục "Dynamax" ở transformation.md): skill gây sát thương thành chiêu Max
// cùng hệ (theo môi trường, kiểu Weather Ball), cùng loại, power theo bảng, một mục tiêu, luôn trúng;
// Gigantamax thì chiêu của hệ đặc trưng thành chiêu G-Max của dạng; skill trạng thái thành Max Guard.

import { skillInField } from '../registries'
import type { BattleField, GameData, MaxPowerTable, Monster, Skill } from '../model'

/** Chiêu Max theo hệ và Max Guard, tính một lần cho mỗi bộ dữ liệu. */
const maxMoveCache = new WeakMap<
  GameData['skills'],
  { byElement: Map<string, Skill>; guard?: Skill }
>()

function maxMoveIndex(data: GameData): { byElement: Map<string, Skill>; guard?: Skill } {
  const cached = maxMoveCache.get(data.skills)
  if (cached) return cached
  const index: { byElement: Map<string, Skill>; guard?: Skill } = { byElement: new Map() }
  for (const skill of Object.values(data.skills)) {
    if (skill.maxMove === 'max') index.byElement.set(skill.elementId, skill)
    else if (skill.maxMove === 'guard') index.guard = skill
  }
  maxMoveCache.set(data.skills, index)
  return index
}

/** Power chiêu Max theo power (một đòn) của skill gốc. */
export function maxMovePower(table: MaxPowerTable, basePower: number): number {
  return table.steps.find((step) => basePower < step.below)?.power ?? table.top
}

/**
 * Chiêu Max thay cho skill gốc của quái Dynamax. Dữ liệu bắt buộc mỗi hệ một chiêu Max và đúng một
 * Max Guard (kiểm tra lúc khởi động) nên không bao giờ thiếu.
 */
export function maxMoveFor(data: GameData, field: BattleField, user: Monster, skill: Skill): Skill {
  if (skill.maxMove) return skill
  const index = maxMoveIndex(data)
  if (skill.power <= 0) {
    if (!index.guard) throw new Error('Thiếu Max Guard (skill maxMove "guard")')
    return index.guard
  }
  const { elementId } = skillInField(data, field, skill, user)
  const max = gmaxMoveFor(data, user, elementId) ?? index.byElement.get(elementId)
  if (!max) throw new Error(`Thiếu chiêu Max của hệ "${elementId}"`)
  const { dynamax } = data.config.transform
  const table = dynamax.lowPowerElementIds.includes(elementId)
    ? dynamax.lowPowerTable
    : dynamax.powerTable
  return {
    ...max,
    category: skill.category,
    power: maxMovePower(table, skill.power),
    target: 'enemy'
  }
}

/** Chiêu G-Max của dạng gmax đang dùng nếu cùng hệ; không thì undefined (dùng chiêu Max thường). */
function gmaxMoveFor(data: GameData, user: Monster, elementId: string): Skill | undefined {
  const formId = user.battleTransform?.formSpeciesId
  const form = formId === undefined ? undefined : data.species[formId]
  if (form?.kind !== 'normal' || form.formKind !== 'gmax' || !form.gmaxSkillId) return undefined
  const gmax = data.skills[form.gmaxSkillId]
  return gmax.elementId === elementId ? gmax : undefined
}
