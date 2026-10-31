// Phối hợp đội (docs/rules/team.md): điều kiện trên một quái (MONSTER_CONDITIONS, dùng chung cho
// cộng hưởng, quái nhận trận pháp, mỗi bên của hợp kích kỹ), yêu cầu trận pháp với cả đội
// (FORMATION_REQUIREMENTS), cộng hưởng / trận pháp có tác dụng của một đội và hook của chúng lên
// một quái. Thêm loại điều kiện / yêu cầu mới = thêm một handler, không sửa nơi gọi.
// Tách khỏi traitHooks.ts để file đó import được (nguồn hook "synergy" / "formation") mà không vòng.

import { raceMatches, raceRefIds } from './races'
import { asObject, assertNever, checkInteger } from '../shared'
import type {
  FormationRequirementDef,
  GameData,
  Monster,
  MonsterConditionDef,
  SynergyDef,
  SynergyTier,
  TeamBonus,
  TraitHookDef
} from '../model'
import { checkIdList } from './paramChecks'
import { partnerBattleHooks } from './partnerEffects'

interface ParamsHandler<P> {
  /** Trường của điều kiện ngoài `type` (trường lạ báo lỗi). */
  fields: readonly string[]
  validateParams(params: Readonly<Record<string, unknown>>, data: GameData): string[]
  /** Params đã qua validateParams. */
  parse(params: Readonly<Record<string, unknown>>): P
}

export interface MonsterConditionHandler<P = unknown> extends ParamsHandler<P> {
  matches(params: P, monster: Monster, data: GameData): boolean
}

export interface FormationRequirementHandler<P = unknown> extends ParamsHandler<P> {
  /** Cả đội (kể cả quái gục) đủ yêu cầu không. */
  isMet(params: P, team: readonly Monster[], data: GameData): boolean
}

/** Kiểm tra id đơn (raceId, elementId) tồn tại trong `known`. */
function checkId(
  value: unknown,
  field: string,
  known: Readonly<Record<string, unknown>>,
  label: string
): string[] {
  return typeof value === 'string' && Object.hasOwn(known, value)
    ? []
    : [`${field}: ${label} không tồn tại "${String(value)}"`]
}

const element: MonsterConditionHandler<{ elementId: string }> = {
  fields: ['elementId'],
  validateParams: (params, data) => checkId(params.elementId, 'elementId', data.elements, 'hệ'),
  parse: (params) => ({ elementId: params.elementId as string }),
  matches: ({ elementId }, monster) => monster.elementIds.includes(elementId)
}

const race: MonsterConditionHandler<{ raceId: string }> = {
  fields: ['raceId'],
  validateParams: (params, data) => checkId(params.raceId, 'raceId', raceRefIds(data), 'race'),
  parse: (params) => ({ raceId: params.raceId as string }),
  // Id nhóm race khớp mọi race trong nhóm (mục "Race" ở stats-traits.md).
  matches: ({ raceId }, monster, data) => raceMatches(data, monster.raceId, raceId)
}

const species: MonsterConditionHandler<{ speciesIds: readonly string[] }> = {
  fields: ['speciesIds'],
  validateParams: (params, data) =>
    checkIdList(params.speciesIds, 'speciesIds', data.species, { label: 'loài' }),
  parse: (params) => ({ speciesIds: params.speciesIds as string[] }),
  matches: ({ speciesIds }, monster) => speciesIds.includes(monster.speciesId)
}

/**
 * Điều kiện trên một quái theo loại. Chưa có: huyết mạch `bloodline { groupId }` (chờ
 * docs/roadmap/bloodline.md).
 */
export const MONSTER_CONDITIONS: Readonly<Record<string, MonsterConditionHandler>> = {
  element,
  race,
  species
}

/** Quái thỏa điều kiện không (điều kiện đã kiểm tra lúc khởi động). */
export function matchesMonsterCondition(
  data: GameData,
  condition: MonsterConditionDef,
  monster: Monster
): boolean {
  const handler = MONSTER_CONDITIONS[condition.type]
  return handler.matches(handler.parse(condition), monster, data)
}

const countAtLeast = (params: Readonly<Record<string, unknown>>): string[] =>
  checkInteger(params.count, 'count', 1)

/** Số hệ khác nhau trong đội. */
const distinctElementCount = (team: readonly Monster[]): number =>
  new Set(team.flatMap((monster) => monster.elementIds)).size

const distinctElements: FormationRequirementHandler<{ count: number }> = {
  fields: ['count'],
  validateParams: countAtLeast,
  parse: (params) => ({ count: params.count as number }),
  isMet: ({ count }, team) => distinctElementCount(team) >= count
}

const sameRace: FormationRequirementHandler<{ count: number }> = {
  fields: ['count'],
  validateParams: countAtLeast,
  parse: (params) => ({ count: params.count as number }),
  isMet({ count }, team) {
    const byRace = new Map<string, number>()
    for (const monster of team) byRace.set(monster.raceId, (byRace.get(monster.raceId) ?? 0) + 1)
    return [...byRace.values()].some((n) => n >= count)
  }
}

const raceCount: FormationRequirementHandler<{ raceId: string; count: number }> = {
  fields: ['raceId', 'count'],
  validateParams: (params, data) => [
    ...checkId(params.raceId, 'raceId', raceRefIds(data), 'race'),
    ...countAtLeast(params)
  ],
  parse: (params) => ({ raceId: params.raceId as string, count: params.count as number }),
  isMet: ({ raceId, count }, team, data) =>
    team.filter((m) => raceMatches(data, m.raceId, raceId)).length >= count
}

const elements: FormationRequirementHandler<{ elementIds: readonly string[] }> = {
  fields: ['elementIds'],
  validateParams: (params, data) =>
    checkIdList(params.elementIds, 'elementIds', data.elements, { label: 'hệ' }),
  parse: (params) => ({ elementIds: params.elementIds as string[] }),
  isMet: ({ elementIds }, team) =>
    elementIds.every((id) => team.some((monster) => monster.elementIds.includes(id)))
}

/** Yêu cầu của trận pháp với cả đội theo loại. */
export const FORMATION_REQUIREMENTS: Readonly<Record<string, FormationRequirementHandler>> = {
  distinctElements,
  sameRace,
  race: raceCount,
  elements
}

/** Kiểm tra một điều kiện / yêu cầu `{ type, ...params }` theo registry của nó. */
export function checkTypedParams(
  registry: Readonly<Record<string, ParamsHandler<unknown>>>,
  value: unknown,
  where: string,
  data: GameData
): string[] {
  const obj = asObject(value)
  if (!obj) return [`${where}: phải là object`]
  const type = obj.type
  if (typeof type !== 'string' || !Object.hasOwn(registry, type)) {
    return [`${where}: loại "${String(type)}" chưa có trong registry`]
  }
  const handler = registry[type]
  const issues = Object.keys(obj)
    .filter((field) => field !== 'type' && !handler.fields.includes(field))
    .map((field) => `${where}: trường "${field}" không thuộc loại "${type}"`)
  return [...issues, ...handler.validateParams(obj, data).map((issue) => `${where}: ${issue}`)]
}

/** Bậc cao nhất có `count` ≤ số quái khớp (bậc theo count tăng dần); null nếu chưa tới bậc đầu. */
export function synergyTierOf(synergy: SynergyDef, count: number): SynergyTier | null {
  let found: SynergyTier | null = null
  for (const tier of synergy.tiers) {
    if (tier.count > count) break
    found = tier
  }
  return found
}

/** Trận pháp có đủ yêu cầu với đội không. */
export function isFormationMet(
  data: GameData,
  formationId: string,
  team: readonly Monster[]
): boolean {
  return data.formations[formationId].requires.every((requirement: FormationRequirementDef) => {
    const handler = FORMATION_REQUIREMENTS[requirement.type]
    return handler.isMet(handler.parse(requirement), team, data)
  })
}

/**
 * Cộng hưởng (đã tới bậc đầu) và trận pháp (đủ yêu cầu) có tác dụng với một đội: đếm trên cả đội,
 * kể cả quái gục. `formationId` null = không dùng trận pháp.
 */
export function activeTeamBonuses(
  data: GameData,
  team: readonly Monster[],
  formationId: string | null
): TeamBonus[] {
  const result: TeamBonus[] = []
  for (const synergy of Object.values(data.synergies)) {
    const count = team.filter((monster) =>
      matchesMonsterCondition(data, synergy.match, monster)
    ).length
    if (synergyTierOf(synergy, count)) result.push({ kind: 'synergy', id: synergy.id, count })
  }
  if (formationId !== null && isFormationMet(data, formationId, team)) {
    result.push({ kind: 'formation', id: formationId })
  }
  return result
}

export interface TeamBonusHooks {
  kind: TeamBonus['kind']
  id: string
  hooks: readonly TraitHookDef[]
  /** Hệ số hook (kỹ năng đồng hành: sức mạnh theo thân mật; còn lại 1). */
  scale: number
}

/**
 * Hook của cộng hưởng / trận pháp / kỹ năng đồng hành lên một quái: cộng hưởng và trận pháp chỉ
 * cho quái khớp điều kiện, kỹ năng đồng hành cho mọi quái của phe.
 */
export function teamBonusHooks(
  data: GameData,
  monster: Monster,
  bonuses: readonly TeamBonus[]
): TeamBonusHooks[] {
  const result: TeamBonusHooks[] = []
  for (const bonus of bonuses) {
    const hooks = teamBonusHooksOf(data, bonus, monster)
    if (hooks) result.push({ kind: bonus.kind, id: bonus.id, ...hooks })
  }
  return result
}

function teamBonusHooksOf(
  data: GameData,
  bonus: TeamBonus,
  monster: Monster
): { hooks: readonly TraitHookDef[]; scale: number } | null {
  switch (bonus.kind) {
    case 'synergy': {
      const synergy = data.synergies[bonus.id]
      const tier = synergyTierOf(synergy, bonus.count)
      if (!tier || !matchesMonsterCondition(data, synergy.match, monster)) return null
      return { hooks: tier.hooks, scale: 1 }
    }
    case 'formation': {
      const formation = data.formations[bonus.id]
      if (formation.match && !matchesMonsterCondition(data, formation.match, monster)) return null
      return { hooks: formation.hooks, scale: 1 }
    }
    case 'partner': {
      const hooks = partnerBattleHooks(data.partnerSkills[bonus.id].effects)
      return hooks.length > 0 ? { hooks, scale: bonus.strength } : null
    }
    default:
      return assertNever(bonus, 'loại phối hợp đội')
  }
}
