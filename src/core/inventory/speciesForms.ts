// Dạng biến hình của loài theo dữ liệu (điểm duy nhất; mục "Biến hình trong trận" ở
// transformation.md): dạng Mega / gmax theo loài gốc, loài nào mang được Gmax Factor. Cache theo bộ
// dữ liệu. Đặt cạnh evolutionLine vì chỉ tra dữ liệu loài (registries / gameData dùng được).

import type { FormKind, GameData, NormalSpecies } from '../model'

/** Dạng theo loài gốc (formOf) và loại dạng; tính một lần cho mỗi bộ dữ liệu. */
const formsCache = new WeakMap<GameData['species'], Map<string, NormalSpecies[]>>()

const formKey = (speciesId: string, kind: FormKind): string => `${kind}:${speciesId}`

function formIndex(data: GameData): Map<string, NormalSpecies[]> {
  const cached = formsCache.get(data.species)
  if (cached) return cached
  const index = new Map<string, NormalSpecies[]>()
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || !species.formOf || !species.formKind) continue
    // Dạng Mega / gmax chỉ của một dạng khác (Mega Droopy của Tatsugiri Droopy) xếp theo dạng đó.
    for (const fromId of species.fromSpeciesIds ?? [species.formOf]) {
      const key = formKey(fromId, species.formKind)
      index.set(key, [...(index.get(key) ?? []), species])
    }
  }
  formsCache.set(data.species, index)
  return index
}

/**
 * Các dạng loại `kind` loài `speciesId` biến thành được (Mega X / Y là hai dạng; dạng có
 * `fromSpeciesIds` chỉ theo các loài đó), theo thứ tự dữ liệu.
 */
export function formsOf(data: GameData, speciesId: string, kind: FormKind): NormalSpecies[] {
  return formIndex(data).get(formKey(speciesId, kind)) ?? []
}

/** Loài mang được Gmax Factor, tính một lần cho mỗi bộ dữ liệu. */
const gmaxCapableCache = new WeakMap<GameData['species'], Set<string>>()

/**
 * Loài mang được Gmax Factor: chính nó có dạng gmax, hoặc tiến hóa (một hay nhiều bước) thành loài
 * có dạng gmax (Charmander mang được để sau này thành Charizard Gigantamax).
 */
export function canHaveGmaxFactor(data: GameData, speciesId: string): boolean {
  let capable = gmaxCapableCache.get(data.species)
  if (!capable) {
    capable = new Set<string>()
    const memo = new Map<string, boolean>()
    const visit = (id: string): boolean => {
      const known = memo.get(id)
      if (known !== undefined) return known
      // Đặt false trước để chuỗi tiến hóa vòng (dữ liệu lỗi) không lặp vô hạn.
      memo.set(id, false)
      const species = data.species[id]
      const result =
        species?.kind === 'normal' &&
        (formsOf(data, id, 'gmax').length > 0 ||
          species.evolutions.some((evolution) => visit(evolution.speciesId)))
      memo.set(id, result)
      return result
    }
    for (const id of Object.keys(data.species)) if (visit(id)) capable.add(id)
    gmaxCapableCache.set(data.species, capable)
  }
  return capable.has(speciesId)
}
