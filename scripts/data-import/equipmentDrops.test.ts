// Luật danh sách trang bị rơi của map (equipmentDrops.mjs): nhóm món, tỉ lệ hệ / race, trọng số.

import { describe, expect, it } from 'vitest'
import {
  dropGroupOf,
  equipmentDropLookup,
  isMapDrop,
  mapEquipmentDrops,
  mapShares,
  withEquipmentDrops
} from './equipmentDrops.mjs'

const line = (type: string, params: Record<string, unknown> = {}): Record<string, unknown> => ({
  hook: { type, params },
  valueParam: 'percent',
  ranges: {}
})
const equipment = (
  id: string,
  mainLine: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({ id, category: 'equipment', price: 1, mainLine, ...extra })

const items = [
  equipment('sword', line('statModifier')),
  equipment('choiceBand', line('statModifier'), { hooks: [{ type: 'choiceLock', params: {} }] }),
  equipment('charcoal', line('elementDamageDealt', { elementIds: ['fire'] })),
  equipment('lifeOrb', line('elementDamageDealt', { elementIds: ['fire'] }), {
    hooks: [{ type: 'recoilOnAttack', params: {} }]
  }),
  equipment('beastSlayer', line('damageVsRace', { raceIds: ['beast'] })),
  equipment('wolfSlayer', line('damageVsRace', { raceIds: ['wolf'] })),
  equipment('fireGem', line('spellSlot')),
  equipment('waterBooster', line('elementDamageDealt', { elementIds: ['water'] })),
  equipment('crown', line('statModifier'), { unique: { bossSpeciesId: 'a', lines: [] } }),
  equipment('relic', line('statModifier'), { soulRelicStat: 'hp' }),
  equipment('knightHelm', line('statModifier'), { setId: 'knight' }),
  equipment('guardShield', line('statModifier'), { setId: 'guard' }),
  { id: 'potion', category: 'consumable', price: 1 }
]

const lookup = equipmentDropLookup({
  species: [
    { id: 'pup', elementIds: ['fire'], raceId: 'wolf' },
    { id: 'imp', elementIds: ['fire', 'dark'], raceId: 'demon' }
  ],
  races: [
    { id: 'wolf', groupId: 'beast' },
    { id: 'demon', groupId: 'fiend' }
  ],
  items,
  equipmentSets: [
    { id: 'knight', kind: 'named' },
    { id: 'guard', kind: 'rolled' }
  ]
})

const biome = {
  id: 'field',
  encounters: [
    { speciesId: 'pup', weight: 3 },
    { speciesId: 'imp', weight: 1 }
  ]
}

describe('nhóm món', () => {
  it('chỉ trang bị thường rơi ở map: bỏ unique, hồn khí, món bộ đặt tên; giữ món cố định bộ ngẫu nhiên', () => {
    const ids = items.filter((item) => isMapDrop(item, lookup.namedSetIds)).map((item) => item.id)
    expect(ids).toEqual([
      'sword',
      'choiceBand',
      'charcoal',
      'lifeOrb',
      'beastSlayer',
      'wolfSlayer',
      'fireGem',
      'waterBooster',
      'guardShield'
    ])
  })

  it('suy nhóm từ dòng chính và hook cố định', () => {
    const group = (id: string): string =>
      dropGroupOf(items.find((item) => item.id === id) as never).group
    expect(group('sword')).toBe('general')
    expect(group('choiceBand')).toBe('gear')
    expect(group('charcoal')).toBe('element')
    expect(group('lifeOrb')).toBe('gear')
    expect(group('beastSlayer')).toBe('race')
    expect(group('fireGem')).toBe('spell')
  })
})

describe('trọng số rơi theo map', () => {
  it('tỉ lệ hệ / race theo trọng số gặp; race cộng cả nhóm race', () => {
    const { elementShare, raceShare } = mapShares(biome, lookup)
    expect(elementShare).toEqual({ fire: 1, dark: 0.25 })
    expect(raceShare).toEqual({ wolf: 0.75, beast: 0.75, demon: 0.25, fiend: 0.25 })
  })

  it('chung 10, đặc biệt 4, ngọc phép 2, theo hệ / race max(1, tỉ lệ × 20); hệ không có quái thì không rơi', () => {
    expect(mapEquipmentDrops(biome, lookup)).toEqual([
      { itemId: 'sword', weight: 10 },
      { itemId: 'choiceBand', weight: 4 },
      { itemId: 'charcoal', weight: 20 },
      { itemId: 'lifeOrb', weight: 4 },
      { itemId: 'beastSlayer', weight: 15 },
      { itemId: 'wolfSlayer', weight: 15 },
      { itemId: 'fireGem', weight: 2 },
      { itemId: 'guardShield', weight: 10 }
    ])
  })

  it('withEquipmentDrops thay danh sách cũ; map không quái nào hợp thì vẫn có đồ chung', () => {
    const replaced = withEquipmentDrops(
      { ...biome, equipmentDrops: [{ itemId: 'old', weight: 1 }] },
      lookup
    )
    expect(replaced.equipmentDrops?.some((entry) => entry.itemId === 'old')).toBe(false)
    const empty = withEquipmentDrops({ id: 'void', encounters: [] }, lookup)
    expect(empty.equipmentDrops?.map((entry) => entry.itemId)).toEqual([
      'sword',
      'choiceBand',
      'lifeOrb',
      'fireGem',
      'guardShield'
    ])
  })

  it('không có trang bị thường nào: không có trường equipmentDrops', () => {
    const none = equipmentDropLookup({
      species: [],
      races: [],
      items: [],
      equipmentSets: []
    })
    expect(withEquipmentDrops(biome, none)).toEqual(biome)
  })
})
