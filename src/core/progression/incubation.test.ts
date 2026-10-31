import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import { uniformBigStats } from '../monster'
import { createRng, DataError, toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type { Egg, GameAction, GameData, GameState, RawGameData } from '../model'
import { incubateEggs, isSpiritLand, spiritStoneElement, warmEggsAtRest } from './incubation'

/** Dữ liệu test: linh thạch hệ cỏ / lửa, map "field" (tầng 1) là linh địa hệ cỏ, Ôn Dưỡng Lò. */
function makeIncubationData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.items.push(
    { id: 'stoneGrass', category: 'material', price: 1 },
    { id: 'stoneFire', category: 'material', price: 1 },
    {
      id: 'furnace',
      category: 'charm',
      effects: [{ type: 'restEggSteps', value: 2 }],
      townPrice: 30000
    }
  )
  raw.config.alchemy = {
    ...raw.config.alchemy,
    elementStoneItemIds: { grass: 'stoneGrass', fire: 'stoneFire' }
  }
  raw.biomes[0] = { ...raw.biomes[0], elementIds: ['grass'] }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeIncubationData()

const eggOf = (battlesLeft = 5, overrides: Partial<Egg> = {}): Egg => ({
  id: 'egg1',
  monster: makeMonster({ id: 'egg1', genes: uniformStats(100) }),
  battlesLeft,
  infusions: [],
  ...overrides
})

const townWith = (stacks: Record<string, number>, egg = eggOf()): GameState => ({
  ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
  inventory: makeInventory(stacks),
  eggs: [egg],
  money: toBig(100000)
})

const run = (state: GameState, action: GameAction, gameData = data): GameState =>
  gameReducer(gameData, state, action)

const infuse = (itemId: string): GameAction => ({ type: 'infuseEgg', eggId: 'egg1', itemId })

const eggIn = (state: GameState): Egg => defined(state.eggs[0], 'trứng')

describe('đặt linh thạch vào trứng', () => {
  it('cùng hệ: mọi gen +10%, tiêu 1 linh thạch, ghi hệ', () => {
    const state = townWith({ stoneGrass: 2 })
    const next = run(state, infuse('stoneGrass'))
    expect(eggIn(next).monster.genes.attack.toNumber()).toBe(110)
    expect(eggIn(next).infusions).toEqual(['grass'])
    expect(getItemCount(next.inventory, 'stoneGrass')).toBe(1)
    expect(eggIn(state).monster.genes.attack.toNumber()).toBe(100)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('gen nhỏ vẫn tăng ít nhất 1; gen cực lớn tăng đúng %', () => {
    const small = townWith(
      { stoneGrass: 1 },
      eggOf(5, { monster: makeMonster({ id: 'egg1', genes: uniformStats(3) }) })
    )
    expect(eggIn(run(small, infuse('stoneGrass'))).monster.genes.hp.toNumber()).toBe(4)
    const huge = makeMonster({ id: 'egg1', genes: uniformBigStats('1e300') })
    const big = run(townWith({ stoneGrass: 1 }, eggOf(5, { monster: huge })), infuse('stoneGrass'))
    expect(eggIn(big).monster.genes.speed.eq(toBig('1.1e300'))).toBe(true)
  })

  it('khác hệ: đổi hệ Tera theo lần đặt cuối, không tăng gen', () => {
    const next = run(townWith({ stoneFire: 1 }), infuse('stoneFire'))
    expect(eggIn(next).monster.teraElementId).toBe('fire')
    expect(eggIn(next).monster.genes.attack.toNumber()).toBe(100)
    expect(eggIn(next).infusions).toEqual(['fire'])
  })

  it('tối đa maxInfusions linh thạch mỗi trứng', () => {
    let state = townWith({ stoneGrass: 5 })
    for (let i = 0; i < 3; i++) state = run(state, infuse('stoneGrass'))
    expect(eggIn(state).infusions).toHaveLength(3)
    expectActionError(() => run(state, infuse('stoneGrass')), 'eggInfusionsFull', {
      eggId: 'egg1',
      max: 3
    })
  })

  it('shiny: tỉ lệ cộng mỗi linh thạch, quái đã shiny không tung', () => {
    const lucky = makeIncubationData((raw) => {
      raw.config.egg.incubation.infusionShinyChance = 100
    })
    const next = run(townWith({ stoneFire: 1 }), infuse('stoneFire'), lucky)
    expect(eggIn(next).monster.shinyStacks).toBe(1)
    const shiny = makeMonster({ id: 'egg1', shinyStacks: 2 })
    const again = run(townWith({ stoneFire: 1 }, eggOf(5, { monster: shiny })), infuse('stoneFire'))
    expect(eggIn(again).monster.shinyStacks).toBe(2)
  })

  it('báo lỗi: không có trứng, không phải linh thạch, thiếu linh thạch, đang trong trận', () => {
    const state = townWith({ stoneGrass: 1, potion: 1 })
    expectActionError(
      () => run(state, { type: 'infuseEgg', eggId: 'x', itemId: 'stoneGrass' }),
      'eggNotFound',
      { eggId: 'x' }
    )
    expectActionError(() => run(state, infuse('potion')), 'notSpiritStone', { itemId: 'potion' })
    expectActionError(() => run(state, infuse('stoneFire')), 'notEnoughItem')
    const inBattle = { ...makeBattleState([makeMonster({ id: 'a' })], []), eggs: [eggOf()] }
    expectActionError(() => run(inBattle, infuse('stoneGrass')), 'inBattle')
  })

  it('spiritStoneElement: tra hệ theo config, món khác là null', () => {
    expect(spiritStoneElement(data, 'stoneFire')).toBe('fire')
    expect(spiritStoneElement(data, 'potion')).toBeNull()
  })
})

describe('linh địa', () => {
  const field = defined(data.biomes.field, 'map field')
  const fireEgg = eggOf(5, { monster: makeMonster({ id: 'egg1', elementIds: ['fire'] }) })

  it('map có hệ của quái trong trứng: tiến thêm bước; map khác: bước thường', () => {
    expect(isSpiritLand(field, eggOf())).toBe(true)
    expect(isSpiritLand(field, fireEgg)).toBe(false)
    const result = incubateEggs(data, createRng(1), {
      eggs: [eggOf(), fireEgg],
      steps: 1,
      biome: field
    })
    expect(result.eggs.map((egg) => egg.battlesLeft)).toEqual([3, 4])
  })

  it('trứng tới 0 thì tách ra để nở; map không khai báo hệ không là linh địa', () => {
    const plain = { ...field, elementIds: undefined }
    const result = incubateEggs(data, createRng(1), { eggs: [eggOf(1)], steps: 1, biome: plain })
    expect(result.hatched.map((egg) => egg.battlesLeft)).toEqual([0])
    expect(result.rng).toBe(createRng(1))
  })

  it('đột biến ở linh địa: mọi gen tăng (tỉ lệ 100%)', () => {
    const mutating = makeIncubationData((raw) => {
      raw.config.egg.incubation.spiritLandMutationChance = 100
    })
    const result = incubateEggs(mutating, createRng(1), { eggs: [eggOf()], steps: 1, biome: field })
    const genes = defined(result.eggs[0], 'trứng').monster.genes
    for (const value of Object.values(genes)) expect(value.gt(100)).toBe(true)
  })

  it('trận thắng ở map tầng 1 (linh địa hệ cỏ): trứng giảm 2', () => {
    const dying = makeMonster({ id: 'e', damageTaken: 49, skillIds: ['idle'] })
    const state = { ...makeBattleState([makeMonster({ id: 'a' })], [dying]), eggs: [eggOf()] }
    const won = run(state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
    })
    expect(won.eggs.map((egg) => egg.battlesLeft)).toEqual([3])
  })
})

describe('Ôn Dưỡng Lò', () => {
  it('nghỉ: trứng tiến restEggSteps bước nhưng dừng ở 1; không có bùa thì không đổi', () => {
    const state = {
      ...townWith({ furnace: 1 }),
      eggs: [eggOf(5), eggOf(2, { id: 'e2' }), eggOf(0, { id: 'e3' })]
    }
    expect(warmEggsAtRest(data, state).eggs.map((egg) => egg.battlesLeft)).toEqual([3, 1, 0])
    const without = { ...state, inventory: makeInventory() }
    expect(warmEggsAtRest(data, without)).toBe(without)
  })

  it('action rest có bùa: trứng tiến', () => {
    const hurt = makeMonster({ id: 'a', damageTaken: 5 })
    const state = { ...townWith({ furnace: 1 }), party: [hurt] }
    expect(eggIn(run(state, { type: 'rest' })).battlesLeft).toBe(3)
  })

  it('mua ở cửa hàng thị trấn một lần, giá townPrice', () => {
    const bought = run(townWith({}), { type: 'buyCharm', itemId: 'furnace' })
    expect(getItemCount(bought.inventory, 'furnace')).toBe(1)
    expect(bought.money.toNumber()).toBe(70000)
    expectActionError(
      () => run(bought, { type: 'buyCharm', itemId: 'furnace' }),
      'charmNotForSale',
      {
        reason: 'owned'
      }
    )
  })

  it('báo lỗi: bùa không bán, thiếu tiền, không ở thị trấn', () => {
    const state = townWith({})
    expectActionError(() => run(state, { type: 'buyCharm', itemId: 'potion' }), 'charmNotForSale', {
      reason: 'notSold'
    })
    expectActionError(
      () => run({ ...state, money: toBig(29999) }, { type: 'buyCharm', itemId: 'furnace' }),
      'notEnoughMoney'
    )
    const away = { ...state, location: { type: 'floor' as const, floor: 1 } }
    expectActionError(() => run(away, { type: 'buyCharm', itemId: 'furnace' }), 'notInTown')
  })
})

describe('kiểm tra dữ liệu', () => {
  it('báo lỗi townPrice, hiệu ứng restEggSteps, elementIds của map, config ấp trứng', () => {
    let message = ''
    try {
      makeIncubationData((raw) => {
        raw.items.push({
          id: 'badCharm',
          category: 'charm',
          effects: [{ type: 'restEggSteps', value: 0.5 }],
          townPrice: 0
        })
        raw.biomes[1] = { ...raw.biomes[1], elementIds: ['nope'] }
        raw.config.egg.incubation.maxInfusions = -1
      })
    } catch (error) {
      message = error instanceof DataError ? error.issues.join('\n') : String(error)
    }
    const expected = [
      'townPrice',
      'restEggSteps',
      'elementIds: hệ không tồn tại "nope"',
      'egg.incubation.maxInfusions'
    ]
    for (const part of expected) expect(message).toContain(part)
  })
})

describe('save', () => {
  it('trứng có hệ không có linh thạch hoặc quá số linh thạch thì báo lỗi', () => {
    const bad = townWith({}, eggOf(5, { infusions: ['water', 'grass', 'grass', 'grass'] }))
    const issues = validateGameState(data, bad).join('\n')
    expect(issues).toMatch(/infusions: tối đa 3/)
    expect(issues).toMatch(/infusions\[0\]: hệ không có linh thạch "water"/)
  })
})

describe('migrate', () => {
  it('v77 → v78: trứng cũ chưa đặt linh thạch nào', () => {
    const raw = serializeState(townWith({})) as { eggs: Record<string, unknown>[] }
    const eggs = raw.eggs.map(({ infusions: _infusions, ...egg }) => egg)
    const migrated = migrateState({ ...raw, eggs, version: 77 }, data)
    expect(migrated.eggs.map((egg) => egg.infusions)).toEqual([[]])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
