// Độ khó và chế độ thử thách (docs/rules/challenge-modes.md): số theo độ khó, loài trùng của
// Nuzlocke, bảng ánh xạ loài của Randomizer. Điểm DUY NHẤT trả lời các câu hỏi này.

import { createRng, shuffle } from '../shared'
import {
  DIFFICULTIES,
  STAT_NAMES,
  type ChallengeMode,
  type Difficulty,
  type DifficultyNumbers,
  type EncounterEntry,
  type GameData,
  type GameOptions,
  type GameState,
  type Monster,
  type RandomizerOptions
} from '../model'
import { evolutionLineOf } from '../inventory'
import { isDexSpecies } from './dex'
import { tamerBonusAmount, type TamerBonusState } from './tamerBonuses'

/** Số của mức độ khó (level, gen, cuồng bạo, % thưởng). */
export const difficultyNumbers = (data: GameData, difficulty: Difficulty): DifficultyNumbers =>
  data.config.challenge.difficulties[difficulty]

/** Thứ hạng của mức độ khó (Dễ = 0); so "khó hơn / dễ hơn". */
export const difficultyRank = (difficulty: Difficulty): number => DIFFICULTIES.indexOf(difficulty)

/** Game đang chơi chế độ thử thách này không. */
export function hasChallengeMode(options: GameOptions, mode: ChallengeMode): boolean {
  switch (mode) {
    case 'nuzlocke':
      return options.nuzlocke !== null
    case 'hardcore':
      return options.hardcore
    case 'randomizer':
      return options.randomizer !== null
  }
}

/**
 * Nuzlocke, dupes clause: quái thuộc chuỗi tiến hóa đã từng sở hữu (Dex) thì không tính là lượt gặp
 * và không bắt được; tắt dupes clause (hoặc không chơi Nuzlocke) thì không có quái trùng.
 */
export function isNuzlockeDupe(
  data: GameData,
  state: Pick<GameState, 'options' | 'dex'>,
  monster: Pick<Monster, 'baseSpeciesId'>
): boolean {
  if (!state.options.nuzlocke?.dupesClause) return false
  const owned = new Set(state.dex.owned)
  return evolutionLineOf(data, monster.baseSpeciesId).some((id) => owned.has(id))
}

const baseStatTotal = (data: GameData, speciesId: string): number => {
  const species = data.species[speciesId]
  if (species?.kind !== 'normal') return 0
  return STAT_NAMES.reduce((sum, stat) => sum + species.baseStats[stat], 0)
}

const randomizerCache = new WeakMap<GameData['species'], Map<number, ReadonlyMap<string, string>>>()

/**
 * Bảng ánh xạ loài của Randomizer: loài của Dex (trừ Thiên Kiếp) xếp theo tổng chỉ số gốc (bằng nhau
 * thì theo id), chia bậc mỗi `tierSize` loài liền nhau, xáo trong từng bậc theo seed. Tất định theo
 * (dữ liệu, seed); tính một lần rồi nhớ.
 */
function randomizerMap(data: GameData, seed: number): ReadonlyMap<string, string> {
  let bySeed = randomizerCache.get(data.species)
  if (!bySeed) {
    bySeed = new Map()
    randomizerCache.set(data.species, bySeed)
  }
  const cached = bySeed.get(seed)
  if (cached) return cached
  const excluded = data.config.awakening.tribulation.speciesId
  const pool = Object.keys(data.species)
    .filter((id) => id !== excluded && isDexSpecies(data.species[id]))
    .map((id) => ({ id, total: baseStatTotal(data, id) }))
    .sort((a, b) => a.total - b.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((entry) => entry.id)
  const { tierSize } = data.config.challenge.randomizer
  const map = new Map<string, string>()
  let rng = createRng(seed)
  for (let start = 0; start < pool.length; start += tierSize) {
    const tier = pool.slice(start, start + tierSize)
    let shuffled: string[]
    ;[shuffled, rng] = shuffle(rng, tier)
    tier.forEach((id, i) => map.set(id, shuffled[i] ?? id))
  }
  bySeed.set(seed, map)
  return map
}

/** Loài thật của một loài khi bật Randomizer; không bật / loài ngoài bảng thì giữ nguyên. */
export function randomizedSpeciesId(
  data: GameData,
  randomizer: RandomizerOptions | null,
  speciesId: string
): string {
  if (!randomizer) return speciesId
  return randomizerMap(data, randomizer.seed).get(speciesId) ?? speciesId
}

/** Danh sách gặp sau Randomizer (giữ trọng số; bảng là hoán vị nên hai loài không ra cùng một loài). */
export function randomizeEncounters(
  data: GameData,
  randomizer: RandomizerOptions | null,
  encounters: readonly EncounterEntry[]
): readonly EncounterEntry[] {
  if (!randomizer) return encounters
  return encounters.map((entry) => ({
    ...entry,
    speciesId: randomizedSpeciesId(data, randomizer, entry.speciesId)
  }))
}

/** Trộn vào seed Randomizer để bảng learnset khác bảng loài (hằng tỉ lệ vàng 32-bit). */
const LEARNSET_SEED_SALT = 0x9e3779b9

/**
 * Loài cho learnset của một loài khi bật xáo learnset: hoán vị riêng trong cùng bậc tổng chỉ số gốc
 * (khác bảng loài nhờ seed trộn); loài ngoài bảng giữ learnset của chính nó.
 */
export function learnsetDonorId(data: GameData, seed: number, speciesId: string): string {
  return randomizerMap(data, (seed ^ LEARNSET_SEED_SALT) >>> 0).get(speciesId) ?? speciesId
}

const learnsetDataCache = new WeakMap<GameData, Map<number, GameData>>()

/**
 * Dữ liệu game của một game (docs/rules/challenge-modes.md mục "Randomizer"): bật xáo learnset thì
 * learnset của mỗi loài là learnset của loài cho (`learnsetDonorId`), không thì đúng dữ liệu gốc.
 * Điểm DUY NHẤT: `gameReducer` dùng dữ liệu này cho mọi action, UI / script tra learnset của game
 * (học lại skill, skill sẽ học) cũng phải đi qua đây. Tính một lần mỗi (dữ liệu, seed) rồi nhớ.
 */
function learnsetDataFor(data: GameData, options: Pick<GameOptions, 'randomizer'>): GameData {
  const randomizer = options.randomizer
  if (!randomizer?.learnsets) return data
  let bySeed = learnsetDataCache.get(data)
  if (!bySeed) {
    bySeed = new Map()
    learnsetDataCache.set(data, bySeed)
  }
  const cached = bySeed.get(randomizer.seed)
  if (cached) return cached
  const species = Object.fromEntries(
    Object.entries(data.species).map(([id, entry]) => {
      if (entry.kind !== 'normal') return [id, entry]
      const donor = data.species[learnsetDonorId(data, randomizer.seed, id)]
      if (donor?.kind !== 'normal' || donor === entry) return [id, entry]
      return [id, { ...entry, learnset: donor.learnset }]
    })
  )
  const shuffled: GameData = { ...data, species }
  bySeed.set(randomizer.seed, shuffled)
  return shuffled
}

/** Bộ dữ liệu gốc của một bản đã đổi theo game, để gọi lại gameDataFor không trừ ô đội hai lần. */
const rawDataOf = new WeakMap<GameData, GameData>()
const partySizeCache = new WeakMap<GameData, Map<number, GameData>>()

/**
 * Dữ liệu của game này: learnset đã xáo (Randomizer) và số ô đội sau kênh partySlotPenalty (thiên
 * mệnh, docs/rules/ascension.md). Gọi đầu gameReducer nên mọi chỗ đọc config.partySize đều đúng.
 */
export function gameDataFor(
  data: GameData,
  state: Pick<GameState, 'options'> & TamerBonusState
): GameData {
  const raw = rawDataOf.get(data) ?? data
  const learnsets = learnsetDataFor(raw, state.options)
  const penalty = tamerBonusAmount(raw, state, 'partySlotPenalty')
  if (penalty === 0) return learnsets
  let byPenalty = partySizeCache.get(learnsets)
  if (!byPenalty) partySizeCache.set(learnsets, (byPenalty = new Map()))
  const cached = byPenalty.get(penalty)
  if (cached) return cached
  // Đội luôn đủ chỗ cho một quái lớn.
  const partySize = Math.max(raw.config.size.largePartySlots, raw.config.partySize - penalty)
  const reduced: GameData = { ...learnsets, config: { ...learnsets.config, partySize } }
  rawDataOf.set(reduced, raw)
  byPenalty.set(penalty, reduced)
  return reduced
}
