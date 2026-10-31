// Biến hình ngoài trận (mục "Biến hình trong trận" ở transformation.md): kiểm tra dữ liệu, vật phẩm
// chìa khóa (nhận ở tầng mốc, không bán / vứt, món cửa hàng cần vật phẩm chìa khóa), đổi hệ Tera,
// Max Soup / Dynamax Candy, học lại Tera Blast, migrate v22 → v23, kiểm tra save.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { grantKeyItems } from '../inventory'
import { relearnableSkills } from '../monster'
import { applyItemToMonster } from '../registries'
import { rollShopStock } from '../shop'
import { createRng } from '../shared'
import {
  dataIssues,
  defined,
  expectActionError,
  makeGameState,
  makeInventory,
  makeMonster,
  makeTransformData,
  makeTransformRawData,
  withFixtureText
} from '../testing'
import { STELLAR, type GameState, type Item, type Monster, type RawGameData } from '../model'
import { migrateState, serializeState } from './index'
import { gameReducer } from './reducer'
import { validateGameState } from './validateGameState'

const data = makeTransformData()

const weakling = (overrides: Partial<Monster> = {}): Monster =>
  makeMonster({
    id: 'm1',
    speciesId: 'weakling',
    baseSpeciesId: 'weakling',
    elementIds: ['grass'],
    teraElementId: 'grass',
    ...overrides
  })

const town = (inventory = makeInventory()): GameState => ({
  ...makeGameState({ seed: 1, party: [weakling()] }),
  inventory
})

const issuesAfter = (edit: (raw: RawGameData) => void): string[] => {
  const raw = makeTransformRawData()
  edit(raw)
  return dataIssues(withFixtureText(raw))
}

describe('kiểm tra dữ liệu', () => {
  it('fixture biến hình hợp lệ', () => {
    expect(dataIssues(makeTransformRawData())).toEqual([])
  })

  it('mỗi hệ đúng một chiêu Max, đúng một Max Guard, chiêu Max không nằm trong learnset', () => {
    const issues = issuesAfter((raw) => {
      raw.skills = raw.skills.filter((skill) => skill.id !== 'maxGeyser' && skill.id !== 'maxGuard')
      const first = raw.species[0]
      if (first.kind === 'normal') first.learnset.push({ level: 1, skillId: 'maxStrike' })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Chiêu Max: hệ "water" cần đúng một chiêu, có 0',
        'Chiêu Max: cần đúng một Max Guard, có 0',
        'Loài "weakling": learnset không được có chiêu Max / Z-Move "maxStrike"'
      ])
    )
  })

  it('dạng Mega / gmax không gặp ngoài tự nhiên, trường dạng đúng loại dạng', () => {
    const issues = issuesAfter((raw) => {
      raw.biomes[0].encounters.push({ speciesId: 'weaklingMega', weight: 1 })
      const weak = defined(raw.species.find((s) => s.id === 'weakling'))
      if (weak.kind === 'normal') weak.gmaxSkillId = 'gmaxBloom'
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Biome "field": dạng biến hình "weaklingMega" không được gặp / làm boss',
        'Loài "weakling": gmaxSkillId chỉ dùng cho dạng gmax'
      ])
    )
  })

  it('đá Mega trỏ dạng Mega, Mảnh Tera đủ mỗi hệ, requiresKeyItemId là vật phẩm chìa khóa', () => {
    const issues = issuesAfter((raw) => {
      const stone = defined(raw.items.find((item) => item.id === 'weaklingite'))
      if (stone.category === 'megaStone') stone.formId = 'weakling'
      raw.items = raw.items.filter((item) => item.id !== 'waterTeraShard')
      const potion = defined(raw.items.find((item) => item.id === 'potion'))
      if (potion.category === 'consumable') potion.requiresKeyItemId = 'potion'
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Vật phẩm "weaklingite": formId phải là loài dạng Mega, nhận "weakling"',
        'Mảnh Tera: hệ "water" cần đúng một mảnh, có 0',
        'Vật phẩm "potion": requiresKeyItemId phải là vật phẩm chìa khóa, nhận "potion"'
      ])
    )
  })

  it('config.transform: vật phẩm chìa khóa phải đúng category, số trong khoảng', () => {
    const issues = issuesAfter((raw) => {
      raw.config.transform.keyItems.mega = 'potion'
      raw.config.transform.mega.stoneDropChance = 101
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'config.transform.keyItems.mega phải là vật phẩm chìa khóa',
        expect.stringContaining('config.transform.mega.stoneDropChance')
      ])
    )
  })
})

describe('vật phẩm chìa khóa', () => {
  // Đổi theo trainers.md: vật phẩm chìa khóa nhận khi lần đầu thắng đạo quán, không theo tầng mở.
  it('nhận mọi món của đạo quán đã thắng mà chưa có, theo thứ tự tầng', () => {
    const granted = grantKeyItems(data, makeInventory({ teraOrb: 1 }), [50, 60])
    expect(granted.inventory.stacks).toEqual({ teraOrb: 1, megaRing: 1 })
    expect(granted.events).toEqual([{ type: 'keyItemReceived', itemId: 'megaRing' }])
    expect(grantKeyItems(data, makeInventory(), [10, 20]).events).toEqual([])
  })

  it('không bán, không vứt được', () => {
    const state = town(makeInventory({ teraOrb: 1 }))
    const item = { storage: 'stack', itemId: 'teraOrb' } as const
    expectActionError(
      () => gameReducer(data, state, { type: 'discardItem', item, count: 1 }),
      'keyItemLocked',
      { itemId: 'teraOrb' }
    )
    expectActionError(
      () => gameReducer(data, state, { type: 'sellItem', item, count: 1 }),
      'keyItemLocked'
    )
  })

  it('món requiresKeyItemId chỉ vào danh sách hàng khi đã có vật phẩm chìa khóa', () => {
    const raw = makeTransformRawData()
    for (const entry of raw.items) {
      if (!('price' in entry)) continue
      delete entry.shop
      delete entry.shopWeight
    }
    const shard = defined(raw.items.find((entry) => entry.id === 'waterTeraShard')) as Item
    Object.assign(shard, { shop: true, shopWeight: 1, requiresKeyItemId: 'teraOrb' })
    raw.config.shop = { ...raw.config.shop, crystalWeights: { positive: 0, negative: 0, rare: 0 } }
    const shopData = createGameData(withFixtureText(raw))
    const roll = (stacks: Record<string, number>): string[] =>
      rollShopStock(shopData, createRng(1), {
        highestFloor: 1,
        options: { lifespanEnabled: false, permadeathEnabled: false },
        nextItemId: 1,
        inventory: makeInventory(stacks)
      }).stock.map((entry) => (entry.storage === 'stack' ? entry.itemId : ''))
    expect(roll({})).toEqual([])
    expect(roll({ teraOrb: 1 })).toEqual(['waterTeraShard'])
  })
})

describe('đổi hệ Tera, Max Soup, Dynamax Candy, Tera Blast', () => {
  it('đổi hệ Tera ở thị trấn tốn Mảnh Tera của hệ đích (kể cả Stellar)', () => {
    const state = town(makeInventory({ stellarTeraShard: 60 }))
    const after = gameReducer(data, state, {
      type: 'changeTeraElement',
      monsterId: 'm1',
      elementId: STELLAR
    })
    expect(after.party[0].teraElementId).toBe(STELLAR)
    expect(after.inventory.stacks.stellarTeraShard).toBe(10)
    const action = { type: 'changeTeraElement', monsterId: 'm1', elementId: STELLAR } as const
    expectActionError(() => gameReducer(data, after, action), 'teraElementUnchanged')
    expectActionError(
      () => gameReducer(data, after, { ...action, elementId: 'fire' }),
      'notEnoughItem'
    )
    expectActionError(
      () => gameReducer(data, after, { ...action, elementId: 'mud' }),
      'malformedAction'
    )
    const onFloor: GameState = { ...state, location: { type: 'floor', floor: 1 } }
    expectActionError(() => gameReducer(data, onFloor, action), 'notInTown')
  })

  it('Max Soup bật / tắt Gmax Factor của loài mang được; Dynamax Candy +1 cấp, tối đa 10', () => {
    const soup: Item = {
      id: 'maxSoup',
      category: 'consumable',
      price: 1,
      use: 'field',
      target: 'ally',
      effects: [{ type: 'toggleGmaxFactor', params: {} }]
    }
    const candy: Item = {
      ...soup,
      id: 'dynamaxCandy',
      effects: [{ type: 'dynamaxLevelUp', params: { levels: 1 } }]
    }
    const rng = {
      rng: createRng(1),
      day: 0,
      highestFloor: 1,
      scene: { party: [], place: null, aptitudeFloor: 1, time: 0 }
    }
    expect(applyItemToMonster(data, weakling(), soup, rng)?.monster.gmaxFactor).toBe(true)
    const twig = makeMonster({ speciesId: 'twig', baseSpeciesId: 'twig' })
    expect(applyItemToMonster(data, twig, soup, rng)).toBeNull()
    expect(
      applyItemToMonster(data, weakling({ dynamaxLevel: 9 }), candy, rng)?.monster.dynamaxLevel
    ).toBe(10)
    expect(applyItemToMonster(data, weakling({ dynamaxLevel: 10 }), candy, rng)).toBeNull()
  })

  it('có Tera Orb thì học lại được Tera Blast', () => {
    expect(relearnableSkills(data, weakling())).not.toContain('teraBlast')
    expect(relearnableSkills(data, weakling(), makeInventory({ teraOrb: 1 }))).toContain(
      'teraBlast'
    )
  })
})

describe('save', () => {
  it('migrate v22 → v23: hệ Tera = hệ đầu, không Gmax Factor, cấp 0, Tera Orb đang sạc', () => {
    const current = serializeState(town()) as Record<string, unknown>
    const party = (current.party as Record<string, unknown>[]).map((monster) => {
      const { teraElementId: _t, gmaxFactor: _g, dynamaxLevel: _d, ...rest } = monster
      return rest
    })
    const { teraOrbCharged: _orb, ...rest } = current
    const migrated = migrateState({ ...rest, party, version: 22 }, data)
    expect(migrated.party[0]).toMatchObject({
      teraElementId: 'grass',
      gmaxFactor: false,
      dynamaxLevel: 0
    })
    expect(migrated.teraOrbCharged).toBe(true)
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('báo lỗi hệ Tera lạ, cấp Dynamax quá tối đa, Gmax Factor ở loài không mang được', () => {
    const state: GameState = {
      ...town(),
      party: [
        weakling({ teraElementId: 'mud', dynamaxLevel: 11 }),
        makeMonster({ id: 'm2', speciesId: 'twig', baseSpeciesId: 'twig', gmaxFactor: true })
      ],
      nextMonsterId: 3
    }
    expect(validateGameState(data, state)).toEqual(
      expect.arrayContaining([
        'party[0].teraElementId: hệ Tera không hợp lệ "mud"',
        'party[0].dynamaxLevel tối đa 10, nhận 11',
        'party[1].gmaxFactor: loài "twig" không mang được Gmax Factor'
      ])
    )
  })
})
