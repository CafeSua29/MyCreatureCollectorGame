// Bộ phận và điểm yếu của quái (docs/rules/hit-locations.md): loài ghi `bodyParts` / `weakPoints`
// thì dùng, không thì theo race (đã trộn mặc định của nhóm race), không thì config. Điểm duy nhất
// hỏi bộ phận / điểm yếu (trận, AI, UI). Không lưu trong save.

import type { DexState, GameData, Monster, NormalSpecies, ResearchState } from '../model'
import { isDexSpecies } from './dex'
import { hasResearchReveal } from './research'

/** Bộ phận và điểm yếu (điểm yếu luôn nằm trong bộ phận). */
export interface BodyPlan {
  parts: readonly string[]
  weakPoints: readonly string[]
}

/** Bộ phận và điểm yếu của loài thường. */
export function speciesBodyPlan(data: GameData, species: NormalSpecies): BodyPlan {
  const race = data.races[species.raceId]
  const parts = species.bodyParts ?? race?.bodyParts ?? data.config.hitLocations.defaultBodyParts
  // Loài đổi bộ phận mà không ghi điểm yếu: chỉ giữ điểm yếu của race còn có trong bộ phận mới.
  const weak = species.weakPoints ?? race?.weakPoints ?? []
  return { parts, weakPoints: weak.filter((id) => parts.includes(id)) }
}

const NO_PARTS: BodyPlan = { parts: [], weakPoints: [] }

/** Kết quả nhớ theo bộ dữ liệu (AI hỏi rất nhiều lần mỗi lượt). */
const planCache = new WeakMap<GameData, Map<string, BodyPlan>>()

type BodyOwner = Pick<Monster, 'speciesId' | 'baseSpeciesId'>

/** Id loài quyết định bộ phận của quái: loài hiện tại nếu là loài thường, không thì loài gốc. */
export function bodyPlanSpeciesId(data: GameData, monster: BodyOwner): string | null {
  if (data.species[monster.speciesId]?.kind === 'normal') return monster.speciesId
  return data.species[monster.baseSpeciesId]?.kind === 'normal' ? monster.baseSpeciesId : null
}

/**
 * Bộ phận và điểm yếu của quái: theo loài hiện tại (quái fuse: loài gốc), như cân nặng. Loài không
 * tồn tại (save hỏng đang được kiểm tra) thì không có bộ phận nào.
 */
export function monsterBodyPlan(data: GameData, monster: BodyOwner): BodyPlan {
  let cache = planCache.get(data)
  if (!cache) planCache.set(data, (cache = new Map()))
  const key = `${monster.speciesId}|${monster.baseSpeciesId}`
  const cached = cache.get(key)
  if (cached) return cached
  const speciesId = bodyPlanSpeciesId(data, monster)
  const species = speciesId === null ? undefined : data.species[speciesId]
  const plan = species?.kind === 'normal' ? speciesBodyPlan(data, species) : NO_PARTS
  cache.set(key, plan)
  return plan
}

/** Id loài ghi khám phá bộ phận vào Dex (loài quyết định bộ phận, phải thuộc Dex); không có = null. */
export function dexBodySpeciesId(data: GameData, monster: BodyOwner): string | null {
  const speciesId = bodyPlanSpeciesId(data, monster)
  return speciesId !== null && isDexSpecies(data.species[speciesId]) ? speciesId : null
}

/**
 * Bộ phận của quái mà người chơi đã biết có phải điểm yếu không, theo thứ tự bộ phận: bộ phận đã
 * đánh trúng, hoặc mọi bộ phận khi loài đạt cấp nghiên cứu mở điểm yếu (docs/rules/species-research.md);
 * bộ phận không còn trong dữ liệu loài thì bỏ qua (mục "Khám phá điểm yếu", hit-locations.md).
 */
export function revealedBodyParts(
  data: GameData,
  known: { dex: Pick<DexState, 'hitParts'>; research: ResearchState },
  monster: BodyOwner
): readonly string[] {
  const speciesId = dexBodySpeciesId(data, monster)
  if (speciesId === null) return []
  const { parts } = monsterBodyPlan(data, monster)
  if (hasResearchReveal(data, known.research, speciesId, 'revealWeakPoints')) return parts
  const hit = known.dex.hitParts[speciesId]
  return hit ? parts.filter((id) => hit.includes(id)) : []
}
