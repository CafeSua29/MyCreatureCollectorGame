// Danh sách loài của khu bảo tồn (docs/rules/safari-zone.md): đổi mỗi rotationDays ngày, random
// từ loài của các map đã mở, ưu tiên loài hiếm (catchRate thấp, phẩm cấp loài cao hiếm hơn), mỗi ô
// có tỉ lệ nhỏ lấy loài không gán vào map nào. Mọi loài hợp lệ đều có cơ hội (trọng số > 0).

import { speciesRankIndex, speciesRankOf } from '../registries'
import { pickWeighted, rollPercent, type RngState } from '../shared'
import {
  BATTLE_FORM_KINDS,
  type DayEvent,
  type GameData,
  type GameState,
  type NormalSpecies
} from '../model'
import { findBiome } from './floors'

/** Loài vào khu được: loài thường, không phải dạng chỉ có trong trận (Mega, gmax, battleOnly). */
const isSafariSpecies = (species: NormalSpecies): boolean =>
  species.formKind === undefined || !BATTLE_FORM_KINDS.includes(species.formKind)

function normalSpecies(data: GameData, speciesId: string): NormalSpecies | null {
  const species = data.species[speciesId]
  return species?.kind === 'normal' && isSafariSpecies(species) ? species : null
}

/** Loài quái thường của các map đã mở (không trùng, theo thứ tự tầng). Boss không vào khu. */
function mappedSpecies(data: GameData, floorBiomeIds: readonly string[]): NormalSpecies[] {
  const ids = new Set<string>()
  for (const biomeId of new Set(floorBiomeIds)) {
    for (const entry of findBiome(data, biomeId)?.encounters ?? []) ids.add(entry.speciesId)
  }
  return [...ids].flatMap((id) => normalSpecies(data, id) ?? [])
}

/** Loài không gán vào map nào (không là quái thường, boss hay boss tầng của biome nào). */
const unmappedCache = new WeakMap<GameData['species'], NormalSpecies[]>()

function unmappedSpecies(data: GameData): NormalSpecies[] {
  const cached = unmappedCache.get(data.species)
  if (cached) return cached
  const mapped = new Set<string>()
  for (const biome of Object.values(data.biomes)) {
    for (const entry of biome.encounters) mapped.add(entry.speciesId)
    for (const boss of biome.bosses) mapped.add(boss.speciesId)
    mapped.add(biome.floorBossSpeciesId)
  }
  const result = Object.keys(data.species).flatMap((id) =>
    mapped.has(id) ? [] : (normalSpecies(data, id) ?? [])
  )
  unmappedCache.set(data.species, result)
  return result
}

/**
 * Trọng số loài: (rarityWeightBase + 100 − catchRate) ^ rarityExponent × rankFalloff ^ thứ hạng
 * phẩm cấp loài.
 */
export function safariSpeciesWeight(data: GameData, species: NormalSpecies): number {
  const { rarityWeightBase, rarityExponent, rankFalloff } = data.config.safari
  const rank = Math.max(0, speciesRankIndex(data, speciesRankOf(data, species).id))
  const rarity = Math.max(0, rarityWeightBase + 100 - species.catchRate) ** rarityExponent
  return rarity * rankFalloff ** rank
}

/**
 * Tung danh sách loài mới: rosterSize ô không trùng, mỗi ô tung unmappedChance lấy loài không gán
 * vào map nào (một nhóm hết loài thì lấy nhóm kia), rồi chọn theo trọng số trong nhóm.
 */
export function rollSafariRoster(
  data: GameData,
  rng: RngState,
  floorBiomeIds: readonly string[]
): [string[], RngState] {
  const { rosterSize, unmappedChance } = data.config.safari
  const mapped = mappedSpecies(data, floorBiomeIds)
  const unmapped = unmappedSpecies(data)
  const roster: string[] = []
  const notChosen = (species: NormalSpecies): boolean => !roster.includes(species.id)
  for (let i = 0; i < rosterSize; i++) {
    const mappedLeft = mapped.filter(notChosen)
    const unmappedLeft = unmapped.filter(notChosen)
    if (mappedLeft.length === 0 && unmappedLeft.length === 0) break
    let useUnmapped = mappedLeft.length === 0
    if (mappedLeft.length > 0 && unmappedLeft.length > 0) {
      ;[useUnmapped, rng] = rollPercent(rng, unmappedChance)
    }
    let species: NormalSpecies
    ;[species, rng] = pickWeighted(rng, useUnmapped ? unmappedLeft : mappedLeft, (entry) =>
      safariSpeciesWeight(data, entry)
    )
    roster.push(species.id)
  }
  return [roster, rng]
}

/** Khu bảo tồn lúc bắt đầu: chưa có danh sách (tung lúc vào khu lần đầu hoặc qua ngày đầu tiên). */
export const newSafariState = (): GameState['safari'] => ({
  roster: [],
  refreshDay: 0,
  visit: null,
  log: []
})

/** Tới ngày làm mới (`day` ≥ refreshDay) thì tung danh sách mới, làm mới tiếp sau rotationDays. */
export function refreshSafariRoster(data: GameData, state: GameState, day: number): GameState {
  if (day < state.safari.refreshDay) return state
  const [roster, rng] = rollSafariRoster(data, state.rng, state.floorBiomeIds)
  const refreshDay = day + data.config.safari.rotationDays
  return { ...state, rng, safari: { ...state.safari, roster, refreshDay } }
}

/** Việc theo ngày (DAILY_TASKS): làm mới danh sách loài khi tới ngày. */
export const safariDailyTask = (
  data: GameData,
  state: GameState,
  _events: DayEvent[],
  day: number
): GameState => refreshSafariRoster(data, state, day)
