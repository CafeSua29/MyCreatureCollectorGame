// Bộ sưu tập (docs/rules/dex.md): loài nào tính vào Dex, % đã sở hữu, hệ số bắt chí mạng, thưởng sưu
// tập. Điểm duy nhất cho các câu hỏi này (ghi Dex ở roster/dex.ts).

import {
  BATTLE_FORM_KINDS,
  type DexState,
  type GameData,
  type Monster,
  type Species
} from '../model'
import { evolutionLineOf } from '../inventory'

/** Loài tính vào Dex: loài thường, không phải dạng chỉ có trong trận (Mega, gmax, battleOnly). */
export const isDexSpecies = (species: Species | undefined): boolean =>
  species?.kind === 'normal' &&
  (species.formKind === undefined || !BATTLE_FORM_KINDS.includes(species.formKind))

/**
 * Loài của quái tính vào Dex / nghiên cứu loài: loài hiện tại và loài gốc (quái fuse tính theo loài
 * gốc vì loài hiện tại là loài fuse chung), chỉ loài thuộc Dex, không trùng.
 */
export function dexSpeciesOf(
  data: GameData,
  monster: Pick<Monster, 'speciesId' | 'baseSpeciesId'>
): string[] {
  const ids = [monster.speciesId, monster.baseSpeciesId]
  return ids.filter((id, i) => ids.indexOf(id) === i && isDexSpecies(data.species[id]))
}

const totalCache = new WeakMap<GameData['species'], number>()

/** Tổng số loài của Dex. */
export function dexTotal(data: GameData): number {
  const cached = totalCache.get(data.species)
  if (cached !== undefined) return cached
  const total = Object.values(data.species).filter(isDexSpecies).length
  totalCache.set(data.species, total)
  return total
}

/** % loài đã sở hữu (0–100). */
export function dexOwnedPercent(data: GameData, dex: Pick<DexState, 'owned'>): number {
  const total = dexTotal(data)
  return total === 0 ? 0 : Math.min(100, (dex.owned.length * 100) / total)
}

/** Hệ số bắt chí mạng: mốc cao nhất có ownedPercent ≤ % đã sở hữu; chưa đạt mốc nào = 0. */
export function criticalCaptureMultiplier(data: GameData, dex: Pick<DexState, 'owned'>): number {
  const percent = dexOwnedPercent(data, dex)
  let multiplier = 0
  for (const tier of data.config.capture.criticalTiers) {
    if (percent >= tier.ownedPercent) multiplier = tier.multiplier
  }
  return multiplier
}

/** % mọi chỉ số trong trận của thưởng sưu tập = ⌊đã sở hữu / collectionStep⌋ × collectionStatPercent. */
export function collectionStatPercent(data: GameData, dex: Pick<DexState, 'owned'>): number {
  const { collectionStep, collectionStatPercent: perStep } = data.config.dex
  return Math.floor(dex.owned.length / collectionStep) * perStep
}

const numberCache = new WeakMap<GameData['species'], Map<string, number>>()

/**
 * Số Dex (như số Pokédex quốc gia): đánh theo thứ tự loài trong dữ liệu, chỉ loài gốc; dạng khác
 * (`formOf`, kể cả dạng vùng) dùng chung số của loài gốc. Loài không thuộc Dex = null.
 */
export function dexNumber(data: GameData, speciesId: string): number | null {
  let numbers = numberCache.get(data.species)
  if (!numbers) {
    numbers = new Map()
    let next = 1
    for (const species of Object.values(data.species)) {
      if (isDexSpecies(species) && species.kind === 'normal' && !species.formOf) {
        numbers.set(species.id, next++)
      }
    }
    for (const species of Object.values(data.species)) {
      if (!isDexSpecies(species) || species.kind !== 'normal' || !species.formOf) continue
      const base = numbers.get(species.formOf)
      if (base !== undefined) numbers.set(species.id, base)
    }
    numberCache.set(data.species, numbers)
  }
  return numbers.get(speciesId) ?? null
}

const regionCache = new WeakMap<GameData['biomes'], Map<string, readonly string[]>>()

/**
 * Loài của Dex một map (như Pokédex vùng): loài gặp ngoài tự nhiên và boss của map, kèm mọi dạng
 * tiến hóa trước / sau của chúng; chỉ loài thuộc Dex. Map không tồn tại = rỗng.
 */
export function regionalDexSpecies(data: GameData, biomeId: string): readonly string[] {
  let cache = regionCache.get(data.biomes)
  if (!cache) {
    cache = new Map()
    regionCache.set(data.biomes, cache)
  }
  const cached = cache.get(biomeId)
  if (cached) return cached
  const biome = data.biomes[biomeId]
  const roots = biome
    ? [...biome.encounters.map((e) => e.speciesId), ...biome.bosses.map((b) => b.speciesId)]
    : []
  const ids = new Set(roots.flatMap((id) => evolutionLineOf(data, id)))
  const result = [...ids].filter((id) => isDexSpecies(data.species[id]))
  cache.set(biomeId, result)
  return result
}

/** Tiến độ Dex của map: số loài đã sở hữu / tổng loài của map. */
export function regionalDexProgress(
  data: GameData,
  dex: Pick<DexState, 'owned'>,
  biomeId: string
): { owned: number; total: number } {
  const species = regionalDexSpecies(data, biomeId)
  const owned = new Set(dex.owned)
  return { owned: species.filter((id) => owned.has(id)).length, total: species.length }
}
