// Luật sinh biome từ danh sách map (biomeAssign.mjs): môi trường sống, gán loài, boss, đồ rơi.

import { describe, expect, it } from 'vitest'
import {
  MAPS_PER_SPECIES,
  MIN_SPECIES_PER_MAP,
  RANDOM_BOSSES_PER_MAP,
  assignSpecies,
  averageWildTotal,
  bossCandidates,
  bossFieldOf,
  encounterWeight,
  fieldEntries,
  finalForms,
  habitatScore,
  hashUnit,
  jitter,
  mapBossDrops,
  mapChances,
  mapDrops,
  mapElements,
  pickBosses,
  wildCandidates
} from './biomeAssign.mjs'

interface TestSpecies {
  kind: 'normal'
  id: string
  raceId: string
  elementIds: string[]
  baseStats: Record<string, number>
  evolutions: { speciesId: string; level?: number }[]
  catchRate?: number
  source?: string
  origin?: string
  formKind?: string
}

const stats = (total: number): Record<string, number> => ({
  hp: total,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0
})

const species = (id: string, overrides: Partial<TestSpecies> = {}): TestSpecies => ({
  kind: 'normal',
  id,
  raceId: 'beast',
  elementIds: ['normal'],
  baseStats: stats(300),
  evolutions: [],
  catchRate: 45,
  source: 'animals',
  ...overrides
})

const themes = {
  volcanic: { elements: ['fire', 'rock'], excludeElements: ['ice'] },
  snowMountain: { elements: ['ice', 'rock'], excludeElements: ['fire'] },
  ocean: { elements: ['water'], excludeElements: ['fire'] },
  grassland: { elements: ['normal', 'grass'], excludeElements: [] }
}

interface TestMap {
  id: string
  source: string
  region: string
  theme: string
  elements: string[]
  speciesHints: string[]
  weather?: Record<string, number>
  terrain?: Record<string, number>
  bossField?: Record<string, string>
}

const map = (id: string, theme: string, overrides: Partial<TestMap> = {}): TestMap => ({
  id,
  source: 'realWorld',
  region: 'landform',
  theme,
  elements: [],
  speciesHints: [],
  ...overrides
})

const volcano = map('volcano', 'volcanic')
const peak = map('peak', 'snowMountain')
const sea = map('sea', 'ocean')
const field = map('field', 'grassland')
const ctx = { themes, factions: { lizardmen: new Set(['saurus']) } }

describe('hashUnit / jitter', () => {
  it('tất định, trong khoảng, khóa khác ra số khác', () => {
    expect(hashUnit('a', 'b')).toBe(hashUnit('a', 'b'))
    expect(hashUnit('a', 'b')).not.toBe(hashUnit('a', 'c'))
    for (let i = 0; i < 50; i++) {
      const value = jitter(5, 10, 1, 'k', i)
      expect(value).toBeGreaterThanOrEqual(5)
      expect(value).toBeLessThanOrEqual(10)
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})

describe('habitatScore', () => {
  it('cáo tuyết (hệ băng) sống ở núi tuyết, không sống ở núi lửa', () => {
    const fox = species('arcticFox', { elementIds: ['ice'] })
    expect(habitatScore(fox, peak, ctx)).toBeGreaterThan(0)
    expect(habitatScore(fox, volcano, ctx)).toBeNull()
  })

  it('không có hệ nào khớp thì không sống được; hệ chính khớp điểm cao hơn hệ phụ', () => {
    expect(habitatScore(species('x', { elementIds: ['psychic'] }), field, ctx)).toBeNull()
    const primary = habitatScore(species('a', { elementIds: ['grass', 'psychic'] }), field, ctx)
    const secondary = habitatScore(species('b', { elementIds: ['psychic', 'grass'] }), field, ctx)
    expect(primary).toBeGreaterThan(secondary ?? Infinity)
  })

  it('race thủy sinh chỉ sống ở map có hệ nước; relaxed bỏ luật này', () => {
    const fish = species('fish', { raceId: 'aquatic', elementIds: ['normal'] })
    expect(habitatScore(fish, field, ctx)).toBeNull()
    expect(habitatScore(fish, field, ctx, { relaxed: true })).not.toBeNull()
  })

  it('loài của phe Warhammer sống ở map của phe dù không khớp hệ; gợi ý mềm cộng điểm', () => {
    const saurus = species('saurus', { elementIds: ['psychic'] })
    const jungle = map('lustria', 'grassland', { speciesHints: ['warhammer:lizardmen'] })
    expect(habitatScore(saurus, jungle, ctx)).not.toBeNull()
    const pokemonMap = map('route', 'grassland', { speciesHints: ['pokemon'] })
    const pokemon = species('pidgey', { source: undefined })
    expect(habitatScore(pokemon, pokemonMap, ctx)).toBeGreaterThan(
      habitatScore(species('dog'), pokemonMap, ctx) ?? Infinity
    )
  })
})

describe('wildCandidates / finalForms', () => {
  const chain = [
    species('egg', { evolutions: [{ speciesId: 'mid' }] }),
    species('mid', { evolutions: [{ speciesId: 'endA' }, { speciesId: 'endB' }] }),
    species('endA', { baseStats: stats(500) }),
    species('endB', { baseStats: stats(450) }),
    species('mega', { formKind: 'mega' })
  ]
  const byId = new Map(chain.map((s) => [s.id, s]))

  it('chỉ dạng đầu, bỏ dạng trong trận', () => {
    expect(wildCandidates(chain).map((s: TestSpecies) => s.id)).toEqual(['egg'])
  })

  it('mọi nhánh dạng cuối', () => {
    expect(finalForms('egg', byId).sort()).toEqual(['endA', 'endB'])
    expect(finalForms('mega', byId)).toEqual([])
  })

  it('boss: dạng cuối có chỉ số gần mức nhắm nhất làm boss tầng, khác nhau giữa các map', () => {
    expect(bossCandidates(field, ['egg'], byId, ctx, 440).map((c: { id: string }) => c.id)).toEqual(
      ['endB', 'endA']
    )
    const candidates = bossCandidates(field, ['egg'], byId, ctx, 520)
    expect(candidates.map((c: { id: string }) => c.id)).toEqual(['endA', 'endB'])
    const used = new Set<string>()
    expect(pickBosses(candidates, used)).toEqual({
      floorBossSpeciesId: 'endA',
      randomBossIds: ['endB']
    })
    expect(pickBosses(candidates, used)?.floorBossSpeciesId).toBe('endB')
    expect(pickBosses([], used)).toBeNull()
  })
})

describe('assignSpecies', () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, i) => species(`ice${i}`, { elementIds: ['ice'] })),
    ...Array.from({ length: 30 }, (_, i) => species(`fire${i}`, { elementIds: ['fire'] })),
    ...Array.from({ length: 30 }, (_, i) => species(`grass${i}`, { elementIds: ['grass'] })),
    species('saurus', { elementIds: ['psychic'] })
  ]
  const lustria = map('lustria', 'grassland', { speciesHints: ['warhammer:lizardmen'] })
  const maps = [volcano, peak, sea, field, lustria]
  const result = assignSpecies({ candidates: pool, maps, ctx })

  it('loài không vào map không sống được; loài của phe vào map của phe', () => {
    expect(result.get('volcano').some((id: string) => id.startsWith('ice'))).toBe(false)
    expect(result.get('peak').some((id: string) => id.startsWith('fire'))).toBe(false)
    expect(result.get('lustria')).toContain('saurus')
  })

  it('mỗi loài ở tối đa MAPS_PER_SPECIES map (trừ map của phe và phần bổ sung); mọi loài có map', () => {
    const counts = new Map<string, number>()
    for (const ids of result.values())
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    for (const s of pool) expect(counts.get(s.id) ?? 0).toBeGreaterThan(0)
    expect(MAPS_PER_SPECIES).toBeGreaterThan(0)
  })

  it('map ít loài được bổ sung tới MIN_SPECIES_PER_MAP nếu đủ loài sống được', () => {
    expect(result.get('peak').length).toBeGreaterThanOrEqual(Math.min(MIN_SPECIES_PER_MAP, 30))
  })

  it('tất định', () => {
    expect(assignSpecies({ candidates: pool, maps, ctx })).toEqual(result)
  })
})

describe('đồ rơi, tỉ lệ, môi trường', () => {
  it('đồ rơi khác nhau giữa các map, tất định; thuốc / đá theo môi trường và hệ', () => {
    const swamp = map('mire', 'grassland', {
      elements: ['grass'],
      weather: { toxicMiasma: 30, clear: 70 }
    })
    const drops = mapDrops(swamp, mapElements(swamp, themes))
    expect(drops).toEqual(mapDrops(swamp, mapElements(swamp, themes)))
    expect(drops.map((d: { itemId: string }) => d.itemId)).toEqual(
      expect.arrayContaining(['antidote', 'leafStone', 'dawnStone'])
    )
    const other = mapDrops(map('other', 'grassland'), mapElements(field, themes))
    expect(other).not.toEqual(drops)
  })

  it('đồ rơi boss: bùa vùng chỉ với map Pokémon của vùng có dạng vùng miền', () => {
    const alola = map('lush', 'grassland', {
      source: 'pokemon',
      region: 'Alola',
      elements: ['grass']
    })
    expect(mapBossDrops(alola).map((d: { itemId: string }) => d.itemId)).toContain('alolaCharm')
    const kanto = { ...alola, id: 'k', region: 'Kanto' }
    expect(mapBossDrops(kanto).map((d: { itemId: string }) => d.itemId)).not.toContain('alolaCharm')
  })

  it('tỉ lệ gặp đôi / gặp boss trong khoảng, khác nhau giữa các map', () => {
    const chances = ['a', 'b', 'c', 'd'].map((id) => mapChances(map(id, 'grassland'), 3))
    for (const { doubleChance, bossChance } of chances) {
      expect(doubleChance).toBeGreaterThanOrEqual(30)
      expect(doubleChance).toBeLessThanOrEqual(70)
      expect(bossChance).toBeGreaterThanOrEqual(1.5)
      expect(bossChance).toBeLessThanOrEqual(4.5)
    }
    expect(new Set(chances.map((c) => c.doubleChance)).size).toBeGreaterThan(1)
  })

  it('môi trường: bỏ trọng số 0; đấu trường chỉ lớp có ghi', () => {
    expect(fieldEntries({ rain: 2, sun: 0 })).toEqual([{ fieldId: 'rain', weight: 2 }])
    expect(bossFieldOf(map('m', 'grassland', { bossField: { weather: 'snow' } }), themes)).toEqual({
      weather: 'snow'
    })
    expect(bossFieldOf(map('m', 'grassland', { bossField: {} }), themes)).toBeUndefined()
  })

  it('chỉ số trung bình quái hoang theo trọng số gặp', () => {
    const byId = new Map([
      ['a', species('a', { baseStats: stats(200) })],
      ['b', species('b', { baseStats: stats(400) })]
    ])
    const encounters = [
      { speciesId: 'a', weight: 3 },
      { speciesId: 'b', weight: 1 }
    ]
    expect(averageWildTotal(encounters, byId)).toBe(250)
    expect(averageWildTotal([], byId)).toBe(0)
  })

  it('trọng số gặp = catchRate, tối thiểu 1; số boss ngẫu nhiên', () => {
    expect(encounterWeight(species('a', { catchRate: 120 }))).toBe(120)
    expect(encounterWeight(species('b', { catchRate: 0 }))).toBe(1)
    expect(RANDOM_BOSSES_PER_MAP).toBe(3)
  })
})
