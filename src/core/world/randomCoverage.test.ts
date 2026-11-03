// Luật "mọi kết quả hợp lệ đều có cơ hội" (chủ project chốt, 2026-11-02): loài không gặp ở map nào, lớp
// NPC lệch hệ của map, sách mạnh, map chưa mở vẫn có cơ hội ra, trọng số có thể thấp nhưng không bằng 0.

import { describe, expect, it } from 'vitest'
import { blackMarketItems } from '../shop'
import { createGameData } from '../gameData'
import { gachaSpeciesPool, defaultGameOptions } from '../progression'
import { rollShopStock } from '../shop'
import { createRng } from '../shared'
import { defined, makeInventory, makeRawData, withFixtureText } from '../testing'
import { BATTLE_FORM_KINDS, type GameData, type RawGameData } from '../model'
import { rollSafariRoster } from './safariRoster'
import { biomeTrainerClasses, trainerSpeciesPool } from './trainers'

function build(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const wildIds = (data: GameData): Set<string> =>
  new Set(Object.values(data.biomes).flatMap((b) => b.encounters.map((e) => e.speciesId)))

/** Loài thường có thể sở hữu mà không gặp ở map nào. */
const nonWild = (data: GameData): string[] =>
  Object.values(data.species).flatMap((species) =>
    species.kind === 'normal' &&
    !wildIds(data).has(species.id) &&
    !BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate')
      ? [species.id]
      : []
  )

describe('đội NPC', () => {
  it('loài không gặp ở map nào có trọng số nonWildSpeciesWeight; dạng trong trận không bao giờ', () => {
    const data = build((raw) => (raw.config.trainers.nonWildSpeciesWeight = 0.1))
    expect(nonWild(data).length).toBeGreaterThan(0)
    const pool = trainerSpeciesPool(data, [])
    for (const id of nonWild(data)) {
      expect(pool).toContainEqual({ speciesId: id, weight: 0.1 })
    }
    for (const entry of pool) {
      const species = data.species[entry.speciesId]
      expect(
        species.kind === 'normal' && BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate')
      ).toBe(false)
    }
    // Trọng số 0: chỉ loài hoang.
    const off = build((raw) => (raw.config.trainers.nonWildSpeciesWeight = 0))
    expect(trainerSpeciesPool(off, []).every((e) => wildIds(off).has(e.speciesId))).toBe(true)
  })

  it('lớp NPC lệch hệ của map vẫn gặp được với offThemeClassWeight', () => {
    const base = build()
    const biome = Object.values(base.biomes)[0]
    const present = new Set(
      biome.encounters.flatMap((entry) => {
        const species = base.species[entry.speciesId]
        return species.kind === 'normal' ? species.elementIds : []
      })
    )
    const absent = Object.keys(base.elements).find((id) => !present.has(id))
    expect(absent).toBeDefined()
    const data = build((raw) => {
      raw.config.trainers.offThemeClassWeight = 0.02
      const regular = defined(raw.trainers.find((t) => t.kind === 'regular'))
      raw.trainers.push({ ...regular, id: 'offTheme', elementIds: [defined(absent)] })
    })
    const entry = biomeTrainerClasses(data, biome).find((e) => e.trainerClass.id === 'offTheme')
    expect(entry?.weight).toBe(0.02)
  })
})

describe('map khai riêng lớp NPC', () => {
  it('lớp khai riêng trọng số 1, lớp thường khác offThemeClassWeight; 0 thì chỉ lớp khai riêng', () => {
    const make = (weight: number): GameData =>
      build((raw) => {
        raw.config.trainers.offThemeClassWeight = weight
        const regular = defined(raw.trainers.find((t) => t.kind === 'regular'))
        raw.trainers.push({ ...regular, id: 'other' })
        raw.biomes[0].trainerClassIds = [regular.id]
      })
    const data = make(0.02)
    const biome = Object.values(data.biomes)[0]
    const entries = biomeTrainerClasses(data, biome)
    expect(entries.find((e) => e.trainerClass.id === 'other')?.weight).toBe(0.02)
    expect(entries.filter((e) => e.weight === 1)).toHaveLength(1)
    const closed = make(0)
    expect(biomeTrainerClasses(closed, Object.values(closed.biomes)[0])).toHaveLength(1)
  })
})

describe('chợ đen', () => {
  it('chỉ đồ gộp chồng không bán ở cửa hàng, giá ≥ minItemPrice; đắt hơn thì hiếm hơn', () => {
    const data = build((raw) => {
      raw.config.events.blackMarket.minItemPrice = 100
      raw.config.events.blackMarket.itemWeightPower = -0.5
      raw.config.events.blackMarket.extraItemIds = ['extraCheap']
      raw.items.push(
        { id: 'rareA', category: 'material', price: 100 },
        { id: 'rareB', category: 'material', price: 10000 },
        { id: 'cheap', category: 'material', price: 99 },
        { id: 'extraCheap', category: 'material', price: 25, shop: true, shopWeight: 1 },
        { id: 'sold', category: 'material', price: 5000, shop: true, shopWeight: 1 }
      )
    })
    const pool = blackMarketItems(data)
    const ids = pool.map((entry) => entry.itemId)
    expect(ids).toEqual(expect.arrayContaining(['rareA', 'rareB']))
    expect(ids).toContain('extraCheap')
    expect(ids).not.toContain('cheap')
    expect(ids).not.toContain('sold')
    const weight = (id: string): number => defined(pool.find((e) => e.itemId === id)).weight
    expect(weight('rareA')).toBeCloseTo(0.1)
    expect(weight('rareB')).toBeCloseTo(0.01)
  })
})

describe('Cây thần', () => {
  it('loài dạng đầu không gặp ở map nào vẫn ra theo phẩm cấp', () => {
    const data = build((raw) => {
      raw.species.push({
        ...(raw.species.find((s) => s.id === 'weakling') as (typeof raw.species)[number]),
        id: 'lonely',
        evolutions: []
      } as (typeof raw.species)[number])
    })
    expect(wildIds(data).has('lonely')).toBe(false)
    const pool = gachaSpeciesPool(data).map((entry) => entry.speciesId)
    expect(pool).toContain('lonely')
  })
})

describe('khu bảo tồn', () => {
  it('loài của mọi map, kể cả map chưa mở; loài chỉ làm boss cũng vào được', () => {
    const data = build((raw) => {
      raw.config.safari.rosterSize = 999
      raw.config.safari.unmappedChance = 50
    })
    const [roster] = rollSafariRoster(data, createRng(1))
    for (const id of wildIds(data)) expect(roster).toContain(id)
    for (const id of nonWild(data)) expect(roster).toContain(id)
  })
})

describe('kệ sách', () => {
  const stockBooks = (data: GameData, seed: number): string[] =>
    rollShopStock(data, createRng(seed), {
      highestFloor: 1,
      nextItemId: 1,
      inventory: makeInventory(),
      options: defaultGameOptions({ lifespanEnabled: false, permadeathEnabled: false })
    }).stock.flatMap((entry) => (entry.storage === 'book' ? [entry.skillId] : []))

  it('chiêu mạnh hơn shopMaxPower: hệ số > 0 thì lên kệ được, hệ số 0 thì không', () => {
    const withFactor = (factor: number): GameData =>
      build((raw) => {
        raw.config.skillBook = {
          ...raw.config.skillBook,
          shopMin: 1,
          shopMax: 1,
          shopMaxPower: 0,
          shopRareSkillFactor: factor
        }
      })
    const open = withFactor(1)
    const strong = Array.from({ length: 30 }, (_, seed) => stockBooks(open, seed)).flat()
    expect(strong.some((id) => open.skills[id].power > 0)).toBe(true)
    const closed = withFactor(0)
    const none = Array.from({ length: 30 }, (_, seed) => stockBooks(closed, seed)).flat()
    expect(none.every((id) => closed.skills[id].power <= 0)).toBe(true)
  })
})
