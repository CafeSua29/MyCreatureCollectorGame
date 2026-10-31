// Registry điều kiện phụ của hướng tiến hóa (mục "Tiến hóa có điều kiện" ở evolution-skills.md).
// Thêm loại điều kiện mới = thêm handler vào EVOLUTION_CONDITIONS rồi khai báo { type, params }
// trong `conditions` của hướng tiến hóa (species.json); luồng tiến hóa không phải sửa.
// Params được validateParams kiểm tra lúc khởi động nên isMet ép kiểu params trực tiếp.

import { raceMatches, raceRefIds } from './races'
import { asObject, checkEnumList, checkInteger, checkNumber } from '../shared'
import {
  AGE_STAGES,
  DAY_PHASES,
  GENDERS,
  MOON_PHASES,
  SEASONS,
  hourOf,
  type EquippedItem,
  type GameData,
  type Monster
} from '../model'
import { checkFieldIdList, checkIdList } from './paramChecks'
import { ageStage } from './lifespan'
import { MAX_PURITY, purityOf } from './bloodlines'
import { aptitudeTierRank, hasAptitudeAtLeast } from './aptitude'
import { checkHourOfDay, dayPhaseOf, moonPhaseOf, seasonOf } from './calendar'

/**
 * Nơi quái tiến hóa (như Pokémon: lên level / dùng đá ở đâu thì xét ở đó). Trong trận (thắng trận,
 * dùng vật phẩm): map của tầng trận và đúng môi trường đang có. Ngoài trận trên tầng: map của tầng
 * và mọi môi trường tự nhiên của map (ngoài trận không có thời tiết đang diễn ra; evolutionPlace ở
 * world/). Thị trấn: null.
 */
export interface EvolutionPlace {
  biomeId: string
  weatherIds: readonly string[]
  terrainIds: readonly string[]
}

/** Hoàn cảnh lúc xét tiến hóa. */
export interface EvolutionScene {
  /** Đội của người chơi (partnerInParty; chính quái đang xét được bỏ qua). */
  party: readonly Monster[]
  /** Nơi quái đang ở; null = thị trấn (hoặc chưa ở đâu: màn chọn quái khởi đầu). */
  place: EvolutionPlace | null
  /** Tầng mốc chấm tư chất (aptitudeFloor của state) cho điều kiện `aptitude`. */
  aptitudeFloor: number
  /** Giờ game lúc xét (GameState.time) cho điều kiện theo giờ / mùa / tuần trăng (calendar.md). */
  time: number
}

/**
 * Phạm vi của điều kiện: `monster` xét từ quái và đội; `place` xét theo nơi quái đang ở (map,
 * môi trường), không có nơi (thị trấn) thì chưa đủ; `moment` xét theo lúc tiến hóa (giờ, mùa,
 * tuần trăng). `place` và `moment` là hoàn cảnh lúc đặt hướng chờ (assumeScene).
 */
export type EvolutionConditionScope = 'monster' | 'place' | 'moment'

interface ConditionCheck {
  data: GameData
  monster: Monster
  party: readonly Monster[]
  aptitudeFloor: number
  time: number
}

export interface EvolutionConditionHandler {
  scope: EvolutionConditionScope
  validateParams(params: unknown, data: GameData): string[]
  /** Điều kiện `place` nhận nơi quái đang ở (khác null); điều kiện `monster` nhận null. */
  isMet(params: unknown, check: ConditionCheck, place: EvolutionPlace | null): boolean
  /** Đồ cầm bị tiêu khi tiến hóa theo hướng có điều kiện này; null = không tiêu gì. */
  consumedItemId?(params: unknown): string | null
}

/** Params là object; trả về lỗi nếu không phải. */
function withObject(params: unknown, check: (obj: Record<string, unknown>) => string[]): string[] {
  const obj = asObject(params)
  return obj ? check(obj) : ['params phải là object']
}

/** Món trong ô là vật phẩm itemId: đồ cầm gộp chồng, hoặc món trang bị có gốc itemId. */
export const isEquippedItem = (entry: EquippedItem, itemId: string): boolean =>
  entry.storage === 'stack' ? entry.itemId === itemId : entry.instance.baseItemId === itemId

/** Quái đang lắp vật phẩm itemId (đồ cầm hoặc trang bị). */
export const isHolding = (monster: Monster, itemId: string): boolean =>
  monster.equipment.some((entry) => isEquippedItem(entry, itemId))

/** Category lắp được lên quái mà điều kiện tiến hóa / xúc tác dị biến nhận. */
const HOLDABLE_CATEGORIES: readonly string[] = ['held', 'equipment']

/** id phải là vật phẩm lắp được (category `held` hoặc `equipment`). */
export function checkHoldableItemId(data: GameData, itemId: unknown, field: string): string[] {
  const category = typeof itemId === 'string' ? data.items[itemId]?.category : undefined
  return category !== undefined && HOLDABLE_CATEGORIES.includes(category)
    ? []
    : [`${field} phải là vật phẩm category held / equipment, nhận "${String(itemId)}"`]
}

/** Số nguyên ≥ 1 (ngưỡng tối thiểu của điều kiện). */
const checkMin = (obj: Record<string, unknown>): string[] => checkInteger(obj.min, 'min', 1)

const affinity: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues = checkMin(obj)
      const max = data.config.affinity.max
      if (Number.isSafeInteger(obj.min) && (obj.min as number) > max) {
        issues.push(`min tối đa ${max} (thân mật tối đa)`)
      }
      return issues
    }),
  isMet: (params, { monster }) => monster.affinity >= (params as { min: number }).min
}

const affinityMax: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues = checkInteger(obj.max, 'max', 0)
      const max = data.config.affinity.max
      if (Number.isSafeInteger(obj.max) && (obj.max as number) >= max) {
        issues.push(`max phải nhỏ hơn ${max} (thân mật tối đa), không thì luôn đủ`)
      }
      return issues
    }),
  isMet: (params, { monster }) => monster.affinity <= (params as { max: number }).max
}

const biome: EvolutionConditionHandler = {
  scope: 'place',
  validateParams: (params, data) =>
    withObject(params, (obj) =>
      checkIdList(obj.biomeIds, 'biomeIds', data.biomes, { label: 'map' })
    ),
  isMet: (params, _check, place) =>
    place !== null && (params as { biomeIds: string[] }).biomeIds.includes(place.biomeId)
}

/** Một trong các id cần có trong danh sách môi trường của nơi đó. */
const hasAny = (wanted: readonly string[], present: readonly string[]): boolean =>
  wanted.some((id) => present.includes(id))

const weather: EvolutionConditionHandler = {
  scope: 'place',
  validateParams: (params, data) =>
    withObject(params, (obj) => checkFieldIdList(data, obj.weatherIds, 'weatherIds', 'weather')),
  isMet: (params, _check, place) =>
    place !== null && hasAny((params as { weatherIds: string[] }).weatherIds, place.weatherIds)
}

const terrain: EvolutionConditionHandler = {
  scope: 'place',
  validateParams: (params, data) =>
    withObject(params, (obj) => checkFieldIdList(data, obj.terrainIds, 'terrainIds', 'terrain')),
  isMet: (params, _check, place) =>
    place !== null && hasAny((params as { terrainIds: string[] }).terrainIds, place.terrainIds)
}

/** Điều kiện theo lúc tiến hóa: giá trị lịch của `time` nằm trong danh sách `field` của params. */
function calendarCondition(
  field: string,
  allowed: readonly string[],
  valueAt: (data: GameData, time: number) => string
): EvolutionConditionHandler {
  return {
    scope: 'moment',
    validateParams: (params) =>
      withObject(params, (obj) => checkEnumList(obj[field], field, allowed)),
    isMet: (params, { data, time }) =>
      ((params as Record<string, string[]>)[field] ?? []).includes(valueAt(data, time))
  }
}

const timeOfDay = calendarCondition('phases', DAY_PHASES, dayPhaseOf)
const season = calendarCondition('seasons', SEASONS, seasonOf)
const moonPhase = calendarCondition('phases', MOON_PHASES, (_data, time) => moonPhaseOf(time))

/** Giờ nằm trong [fromHour, toHour] (cả hai đầu; fromHour > toHour thì qua nửa đêm). */
const isHourInRange = (hour: number, fromHour: number, toHour: number): boolean =>
  fromHour <= toHour ? hour >= fromHour && hour <= toHour : hour >= fromHour || hour <= toHour

// Theo giờ cụ thể (kiểu "sau nửa đêm" của mogwai), khi thời khắc quá rộng.
const hourRange: EvolutionConditionHandler = {
  scope: 'moment',
  validateParams: (params) =>
    withObject(params, (obj) =>
      (['fromHour', 'toHour'] as const).flatMap((field) => checkHourOfDay(obj[field], field))
    ),
  isMet: (params, { time }) => {
    const { fromHour, toHour } = params as { fromHour: number; toHour: number }
    return isHourInRange(hourOf(time), fromHour, toHour)
  }
}

const knowsSkill: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) =>
      typeof obj.skillId === 'string' && obj.skillId in data.skills
        ? []
        : [`skill không tồn tại "${String(obj.skillId)}"`]
    ),
  isMet: (params, { monster }) => monster.skillIds.includes((params as { skillId: string }).skillId)
}

const knowsElementSkill: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) =>
      typeof obj.elementId === 'string' && obj.elementId in data.elements
        ? []
        : [`hệ không tồn tại "${String(obj.elementId)}"`]
    ),
  isMet: (params, { data, monster }) => {
    const { elementId } = params as { elementId: string }
    return monster.skillIds.some((skillId) => data.skills[skillId]?.elementId === elementId)
  }
}

const hasTrait: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues =
        typeof obj.traitId === 'string' && obj.traitId in data.traits
          ? []
          : [`trait không tồn tại "${String(obj.traitId)}"`]
      if (obj.minLevel !== undefined) issues.push(...checkInteger(obj.minLevel, 'minLevel', 1))
      return issues
    }),
  isMet: (params, { monster }) => {
    const { traitId, minLevel = 1 } = params as { traitId: string; minLevel?: number }
    return monster.traits.some((trait) => trait.id === traitId && trait.level >= minLevel)
  }
}

const gender: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params) =>
    withObject(params, (obj) =>
      (GENDERS as readonly unknown[]).includes(obj.gender)
        ? []
        : [`gender phải là ${GENDERS.join(' / ')}, nhận "${String(obj.gender)}"`]
    ),
  isMet: (params, { monster }) => monster.gender === (params as { gender: string }).gender
}

/** Tính cách của quái là một trong `natureIds` (Toxel → Toxtricity Amped / Low Key, natures.md). */
const nature: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) =>
      checkIdList(obj.natureIds, 'natureIds', data.natures, { label: 'tính cách' })
    ),
  isMet: (params, { monster }) =>
    (params as { natureIds: readonly string[] }).natureIds.includes(monster.natureId)
}

const heldItem: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues = checkHoldableItemId(data, obj.itemId, 'itemId')
      if (obj.consume !== undefined && typeof obj.consume !== 'boolean') {
        issues.push('consume phải là true / false')
      }
      return issues
    }),
  isMet: (params, { monster }) => isHolding(monster, (params as { itemId: string }).itemId),
  consumedItemId: (params) => {
    const { itemId, consume } = params as { itemId: string; consume?: boolean }
    return consume === true ? itemId : null
  }
}

const bossDefeats: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params) => withObject(params, checkMin),
  isMet: (params, { monster }) => monster.bossDefeats >= (params as { min: number }).min
}

// Tầng thức tỉnh ≥ min (docs/rules/awakening.md).
const awakening: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params) => withObject(params, checkMin),
  isMet: (params, { monster }) => monster.awakening >= (params as { min: number }).min
}

// Độ thuần nhóm huyết mạch groupId ≥ min (điểm %, docs/rules/bloodline.md).
const bloodlinePurity: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...(typeof obj.groupId === 'string' && Object.hasOwn(data.bloodlines, obj.groupId)
        ? []
        : [`groupId: nhóm huyết mạch không tồn tại "${String(obj.groupId)}"`]),
      ...checkNumber(obj.min, 'min', Number.MIN_VALUE, MAX_PURITY)
    ]),
  isMet: (params, { monster }) => {
    const { groupId, min } = params as { groupId: string; min: number }
    return purityOf(monster, groupId) >= min
  }
}

const ageStageCondition: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params) =>
    withObject(params, (obj) =>
      (AGE_STAGES as readonly unknown[]).includes(obj.stage)
        ? []
        : [`stage phải là ${AGE_STAGES.join(' / ')}, nhận "${String(obj.stage)}"`]
    ),
  // Tắt thọ nguyên thì quái không có giai đoạn tuổi (ageStage null): coi như đủ, để hướng
  // tiến hóa vẫn đi được (chủ project chốt 2026-10-24).
  isMet: (params, { data, monster }) => {
    const stage = ageStage(data, monster)
    return stage === null || stage === (params as { stage: string }).stage
  }
}

const aptitude: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const rank = typeof obj.min === 'string' ? aptitudeTierRank(data, obj.min) : -1
      if (rank < 0) return [`min phải là id bậc tư chất, nhận "${String(obj.min)}"`]
      // Bậc thấp nhất thì quái nào cũng đủ, điều kiện vô nghĩa.
      return rank === 0 ? ['min không được là bậc tư chất thấp nhất (luôn đủ)'] : []
    }),
  isMet: (params, { data, monster, aptitudeFloor }) =>
    hasAptitudeAtLeast(data, monster, {
      floor: aptitudeFloor,
      minTierId: (params as { min: string }).min
    })
}

/** Trường của partnerInParty: đúng một trong ba. */
const PARTNER_FIELDS = ['speciesId', 'raceId', 'elementId'] as const

type PartnerParams = Partial<Record<(typeof PARTNER_FIELDS)[number], string>>

const partnerInParty: EvolutionConditionHandler = {
  scope: 'monster',
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const given = PARTNER_FIELDS.filter((field) => obj[field] !== undefined)
      if (given.length !== 1) return [`cần đúng một trong ${PARTNER_FIELDS.join(' / ')}`]
      const known = { speciesId: data.species, raceId: raceRefIds(data), elementId: data.elements }
      const field = given[0]
      const id = obj[field]
      return typeof id === 'string' && Object.hasOwn(known[field], id)
        ? []
        : [`${field} không tồn tại "${String(id)}"`]
    }),
  isMet: (params, { data, monster, party }) => {
    const { speciesId, raceId, elementId } = params as PartnerParams
    return party.some(
      (partner) =>
        partner.id !== monster.id &&
        (speciesId === undefined || partner.speciesId === speciesId) &&
        (raceId === undefined || raceMatches(data, partner.raceId, raceId)) &&
        (elementId === undefined || partner.elementIds.includes(elementId))
    )
  }
}

export const EVOLUTION_CONDITIONS: Readonly<Record<string, EvolutionConditionHandler>> = {
  affinity,
  affinityMax,
  biome,
  weather,
  terrain,
  knowsSkill,
  knowsElementSkill,
  hasTrait,
  gender,
  nature,
  heldItem,
  bossDefeats,
  awakening,
  bloodlinePurity,
  ageStage: ageStageCondition,
  partnerInParty,
  aptitude,
  timeOfDay,
  hourRange,
  season,
  moonPhase
}

/**
 * Một điều kiện có đủ không. Điều kiện `place` không có nơi (thị trấn) thì chưa đủ. `assumeScene`
 * (chọn hướng đang chờ): điều kiện `place` / `moment` coi như đủ, vì đã đủ ở nơi và lúc trận thắng
 * đặt hướng chờ.
 */
export function isEvolutionConditionMet(
  data: GameData,
  monster: Monster,
  condition: { type: string; params: unknown },
  { scene, assumeScene = false }: { scene: EvolutionScene; assumeScene?: boolean }
): boolean {
  const handler = EVOLUTION_CONDITIONS[condition.type]
  if (handler.scope !== 'monster' && assumeScene) return true
  const place = handler.scope === 'place' ? scene.place : null
  if (handler.scope === 'place' && place === null) return false
  const { party, aptitudeFloor, time } = scene
  return handler.isMet(condition.params, { data, monster, party, aptitudeFloor, time }, place)
}
