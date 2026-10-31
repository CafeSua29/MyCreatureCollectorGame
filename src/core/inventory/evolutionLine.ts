// Chuỗi tiến hóa theo dữ liệu (điểm duy nhất): dạng trước / dạng sau của từng loài, chuỗi đầy đủ,
// dạng đầu. Một loài có thể có nhiều dạng trước (tiến hóa giống game gốc, ví dụ cây Digimon) và
// tiến hóa có thể đổi race (mục "Tiến hóa" ở docs/rules/evolution-skills.md).

import { evolutionTargetIds, type GameData } from '../model'

interface EvolutionLinks {
  previous: Map<string, string[]>
  next: Map<string, string[]>
}

const linksCache = new WeakMap<GameData['species'], EvolutionLinks>()
const lineCache = new WeakMap<GameData['species'], Map<string, string[]>>()
const baseCache = new WeakMap<GameData['species'], Map<string, string[]>>()

/** Bản đồ loài → các dạng trước và loài → các dạng sau (mọi hướng, kể cả dị biến); cache theo dữ liệu. */
function evolutionLinks(data: GameData): EvolutionLinks {
  const cached = linksCache.get(data.species)
  if (cached) return cached
  const previous = new Map<string, string[]>()
  const next = new Map<string, string[]>()
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    const targets = species.evolutions.flatMap((evolution) => evolutionTargetIds(evolution))
    next.set(species.id, targets)
    for (const targetId of targets) {
      const list = previous.get(targetId)
      if (list === undefined) previous.set(targetId, [species.id])
      else if (!list.includes(species.id)) list.push(species.id)
    }
  }
  const links = { previous, next }
  linksCache.set(data.species, links)
  return links
}

/** Các dạng trước trực tiếp của loài (theo thứ tự dữ liệu; rỗng nếu là dạng đầu). */
export function preEvolutionsOf(data: GameData, speciesId: string): readonly string[] {
  return evolutionLinks(data).previous.get(speciesId) ?? []
}

/** Lấy mọi loài đi được từ loài đầu theo một chiều (không lặp, dừng ở vòng lặp nếu có). */
function walk(start: readonly string[], step: (id: string) => readonly string[]): string[] {
  const seen = new Set<string>()
  const queue = [...start]
  for (let i = 0; i < queue.length; i++) {
    if (seen.has(queue[i])) continue
    seen.add(queue[i])
    queue.push(...step(queue[i]))
  }
  return [...seen]
}

/**
 * Chuỗi tiến hóa của loài: chính nó, mọi dạng trước và mọi dạng sau (không gồm nhánh anh em: Vaporeon
 * gồm Eevee, không gồm Flareon).
 */
export function evolutionLineOf(data: GameData, speciesId: string): string[] {
  let cache = lineCache.get(data.species)
  if (!cache) {
    cache = new Map()
    lineCache.set(data.species, cache)
  }
  const cached = cache.get(speciesId)
  if (cached) return cached
  const { previous, next } = evolutionLinks(data)
  const before = walk(previous.get(speciesId) ?? [], (id) => previous.get(id) ?? [])
  const after = walk(next.get(speciesId) ?? [], (id) => next.get(id) ?? [])
  const result = [...new Set([speciesId, ...before, ...after])]
  cache.set(speciesId, result)
  return result
}

/**
 * Mọi dạng đầu (không có dạng trước) của loài, thứ tự tất định; loài không có dạng trước là dạng
 * đầu của chính nó. Dùng cho breeding / trứng: nhiều dạng đầu thì chọn ngẫu nhiên trong đó.
 */
export function baseFormsOf(data: GameData, speciesId: string): readonly string[] {
  let cache = baseCache.get(data.species)
  if (!cache) {
    cache = new Map()
    baseCache.set(data.species, cache)
  }
  const cached = cache.get(speciesId)
  if (cached) return cached
  const { previous } = evolutionLinks(data)
  const ancestors = walk([speciesId], (id) => previous.get(id) ?? [])
  const roots = ancestors.filter((id) => (previous.get(id) ?? []).length === 0)
  // Chuỗi vòng (dữ liệu sai, bị kiểm tra dữ liệu chặn) không có dạng đầu: coi chính loài là dạng đầu.
  const result = roots.length > 0 ? roots : [speciesId]
  cache.set(speciesId, result)
  return result
}
