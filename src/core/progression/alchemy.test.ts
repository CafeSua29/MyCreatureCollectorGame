// Luyện đan và linh điền (docs/rules/alchemy.md): cấp theo exp, tỉ lệ (cấp, kỹ năng đồng hành), luyện
// nhiều lần, thất bại mất nguyên liệu, đan phương, trồng / thu hoạch theo ngày, mua ô, nguyên liệu
// rơi, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import { getMaxHp } from '../monster'
import { HOURS_PER_DAY, type GameData, type GameState, type RawGameData } from '../model'
import { toBig } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import {
  alchemyExpForLevel,
  alchemyLevelFromExp,
  craftChance,
  craftableTimes,
  nextPlotPrice
} from './alchemy'
import { advanceTime } from './time'

function makeAlchemyData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.items.push(
    { id: 'herb', category: 'material', price: 10 },
    { id: 'pill', category: 'material', price: 100 },
    {
      id: 'seedHerb',
      category: 'seed',
      price: 20,
      growDays: 2,
      harvest: [{ itemId: 'herb', min: 1, max: 3 }]
    },
    { id: 'scrollPill', category: 'recipeScroll', price: 50, recipeId: 'pill' }
  )
  raw.recipes.push(
    {
      id: 'potion',
      output: { itemId: 'potion', count: 2 },
      inputs: [{ itemId: 'herb', count: 1 }],
      money: 10,
      minLevel: 1,
      successChance: 100,
      exp: 10
    },
    {
      id: 'risky',
      output: { itemId: 'pill', count: 1 },
      inputs: [{ itemId: 'herb', count: 2 }],
      money: 0,
      minLevel: 1,
      successChance: 50,
      exp: 1
    },
    {
      id: 'pill',
      output: { itemId: 'pill', count: 1 },
      inputs: [{ itemId: 'herb', count: 1 }],
      money: 0,
      minLevel: 3,
      successChance: 60,
      exp: 1,
      scroll: true
    }
  )
  raw.partnerSkills.push({
    id: 'alchemist',
    effects: [{ type: 'alchemySuccessPercent', params: { percent: 15 } }]
  })
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeAlchemyData()

function townState(stacks: Record<string, number> = { herb: 10 }, money = 1000): GameState {
  return {
    ...makeGameState({ seed: 9, party: [makeMonster({ id: 'a' })] }),
    money: toBig(money),
    inventory: makeInventory(stacks)
  }
}

const craft = (state: GameState, recipeId: string, times = 1, gameData = data): GameState =>
  gameReducer(gameData, state, { type: 'craft', recipeId, times })
const withLevel = (state: GameState, level: number): GameState => ({
  ...state,
  alchemy: { ...state.alchemy, level, exp: alchemyExpForLevel(data, level) }
})

describe('cấp luyện đan', () => {
  it('tổng exp đạt cấp L = ⌈10 × (L − 1)²⌉; tính ngược đúng ở biên', () => {
    expect(alchemyExpForLevel(data, 1).toString()).toBe('0')
    expect(alchemyExpForLevel(data, 3).toString()).toBe('40')
    expect(alchemyLevelFromExp(data, toBig(39))).toBe(2)
    expect(alchemyLevelFromExp(data, toBig(40))).toBe(3)
    expect(alchemyLevelFromExp(data, toBig('1e20'))).toBe(3162277661)
  })

  it('tỉ lệ: gốc + 1 điểm mỗi cấp trên mức yêu cầu + kỹ năng đồng hành, kẹp 100', () => {
    const recipe = data.recipes.risky
    expect(craftChance(data, townState(), recipe)).toBe(50)
    expect(craftChance(data, withLevel(townState(), 11), recipe)).toBe(60)
    const partnerData = makeAlchemyData((raw) => (raw.races[0].partnerSkillId = 'alchemist'))
    expect(craftChance(partnerData, townState(), partnerData.recipes.risky)).toBe(65)
    expect(craftChance(data, withLevel(townState(), 200), data.recipes.risky)).toBe(100)
  })
})

describe('luyện đan', () => {
  it('luyện nhiều lần: trừ nguyên liệu và tiền cho mọi lần, nhận món ra, + exp, ghi kết quả', () => {
    const next = craft(townState(), 'potion', 3)
    expect(getItemCount(next.inventory, 'herb')).toBe(7)
    expect(getItemCount(next.inventory, 'potion')).toBe(6)
    expect(next.money.toString()).toBe('970')
    expect(next.alchemy.exp.toString()).toBe('30')
    expect(next.alchemy.level).toBe(2)
    expect(next.alchemy.lastCraft).toEqual({ recipeId: 'potion', successes: 3, failures: 0 })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('thất bại mất nguyên liệu; mỗi lần tung riêng, tất định theo seed', () => {
    const next = craft(townState({ herb: 40 }), 'risky', 20)
    const { successes, failures } = defined(next.alchemy.lastCraft)
    expect(successes + failures).toBe(20)
    expect(successes).toBeGreaterThan(0)
    expect(failures).toBeGreaterThan(0)
    expect(getItemCount(next.inventory, 'pill')).toBe(successes)
    expect(getItemCount(next.inventory, 'herb')).toBe(0)
    expect(craft(townState({ herb: 40 }), 'risky', 20)).toEqual(next)
  })

  it('lỗi: công thức lạ, chưa học, cấp thấp, thiếu nguyên liệu / tiền, ngoài thị trấn, times sai', () => {
    expectActionError(() => craft(townState(), 'nope'), 'recipeUnknown', { recipeId: 'nope' })
    expectActionError(() => craft(townState(), 'pill'), 'recipeNotLearned', { recipeId: 'pill' })
    const learned = { ...townState(), alchemy: { ...townState().alchemy, knownRecipes: ['pill'] } }
    expectActionError(() => craft(learned, 'pill'), 'alchemyLevelTooLow', { need: 3, have: 1 })
    expectActionError(() => craft(townState({ herb: 2 }), 'potion', 3), 'notEnoughItem')
    expectActionError(() => craft(townState({ herb: 10 }, 5), 'potion'), 'notEnoughMoney')
    expectActionError(() => craft(atFloor(townState(), 1), 'potion'), 'notInTown')
    expectActionError(() => craft(townState(), 'potion', 0), 'malformedAction')
  })

  it('số lần luyện tối đa theo nguyên liệu và tiền', () => {
    expect(craftableTimes(data, townState({ herb: 7 }, 50), data.recipes.potion)).toBe(5)
    expect(craftableTimes(data, townState({ herb: 7 }), data.recipes.risky)).toBe(3)
  })
})

describe('đan phương', () => {
  it('học: tiêu đan phương, biết công thức; đã biết / không phải đan phương thì báo lỗi', () => {
    const state = townState({ scrollPill: 2, herb: 1 })
    const next = gameReducer(data, state, { type: 'learnRecipe', itemId: 'scrollPill' })
    expect(next.alchemy.knownRecipes).toEqual(['pill'])
    expect(getItemCount(next.inventory, 'scrollPill')).toBe(1)
    expectActionError(
      () => gameReducer(data, next, { type: 'learnRecipe', itemId: 'scrollPill' }),
      'recipeAlreadyKnown'
    )
    expectActionError(
      () => gameReducer(data, state, { type: 'learnRecipe', itemId: 'herb' }),
      'notRecipeScroll'
    )
  })
})

describe('linh điền', () => {
  const plant = (state: GameState, plotIndex = 0): GameState =>
    gameReducer(data, state, { type: 'plantSeed', plotIndex, itemId: 'seedHerb' })
  const reap = (state: GameState, plotIndex = 0): GameState =>
    gameReducer(data, state, { type: 'harvest', plotIndex })
  const days = (state: GameState, count: number): GameState =>
    advanceTime(data, state, count * HOURS_PER_DAY)

  it('trồng → đủ ngày (báo chín đúng ngày) → thu hoạch số lượng trong khoảng; ô trống lại', () => {
    const planted = plant(townState({ seedHerb: 1 }))
    expect(planted.garden.plots[0]).toEqual({ seedItemId: 'seedHerb', plantedDay: 0 })
    expectActionError(() => reap(planted), 'cropNotReady', { plotIndex: 0, daysLeft: 2 })
    const ripe = days(planted, 3)
    expect(ripe.dayEvents).toContainEqual({
      type: 'cropRipe',
      plotIndex: 0,
      seedItemId: 'seedHerb'
    })
    expect(ripe.dayEvents.filter((e) => e.type === 'cropRipe')).toHaveLength(1)
    const reaped = reap(ripe)
    const herbs = getItemCount(reaped.inventory, 'herb')
    expect(herbs).toBeGreaterThanOrEqual(1)
    expect(herbs).toBeLessThanOrEqual(3)
    expect(reaped.garden.plots[0]).toBeNull()
    expect(validateGameState(data, reaped)).toEqual([])
  })

  it('lỗi: ô đang trồng / trống, không phải hạt giống, ô lạ, ngoài thị trấn', () => {
    const planted = plant(townState({ seedHerb: 2 }))
    expectActionError(() => plant(planted), 'plotOccupied', { plotIndex: 0 })
    expectActionError(() => reap(planted, 1), 'plotEmpty', { plotIndex: 1 })
    expectActionError(
      () => gameReducer(data, townState(), { type: 'plantSeed', plotIndex: 0, itemId: 'herb' }),
      'notSeed'
    )
    expectActionError(() => plant(townState({ seedHerb: 1 }), 9), 'malformedAction')
    expectActionError(() => plant(atFloor(townState({ seedHerb: 1 }), 1)), 'notInTown')
  })

  it('mua thêm ô: giá 5000 × 2^(số ô đã mua thêm)', () => {
    const state = townState({}, 20000)
    expect(nextPlotPrice(data, state).toString()).toBe('5000')
    const once = gameReducer(data, state, { type: 'buyPlot' })
    expect(once.garden.plots).toHaveLength(3)
    expect(nextPlotPrice(data, once).toString()).toBe('10000')
    const twice = gameReducer(data, once, { type: 'buyPlot' })
    expectActionError(() => gameReducer(data, twice, { type: 'buyPlot' }), 'notEnoughMoney')
  })
})

describe('nguyên liệu rơi', () => {
  it('tinh phách theo race, linh thạch theo hệ đầu, dược liệu; boss thêm đan phương', () => {
    const drops = makeAlchemyData((raw) => {
      raw.items.push(
        { id: 'essNeutral', category: 'material', price: 1 },
        { id: 'stoneGrass', category: 'material', price: 1 }
      )
      raw.config.alchemy = {
        ...raw.config.alchemy,
        raceEssenceItemIds: { neutral: 'essNeutral' },
        elementStoneItemIds: { grass: 'stoneGrass' },
        essenceChance: 100,
        stoneChance: 100,
        wildDrops: [{ itemId: 'herb', chance: 100 }],
        bossDrops: [{ itemId: 'scrollPill', chance: 100 }]
      }
    })
    const prey = { ...makeMonster({ id: 'e', skillIds: ['idle'] }), bossMultiplier: 2 }
    const dying = { ...prey, damageTaken: getMaxHp(drops, prey).minus(1) }
    const won = gameReducer(
      drops,
      makeBattleState([makeMonster({ id: 'a' })], [dying], { isBoss: true }),
      {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
      }
    )
    for (const itemId of ['essNeutral', 'stoneGrass', 'herb', 'scrollPill']) {
      expect(getItemCount(won.inventory, itemId), itemId).toBe(1)
    }
  })
})

describe('dữ liệu và save', () => {
  it('công thức sai, đan phương thiếu / sai, hạt giống sai, config sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.items.push(
          { id: 'seedBad', category: 'seed', price: 1, growDays: 0, harvest: [] },
          { id: 'scrollBad', category: 'recipeScroll', price: 1, recipeId: 'nope' }
        )
        raw.recipes.push({
          id: 'bad',
          output: { itemId: 'ghost', count: 0 },
          inputs: [],
          money: -1,
          minLevel: 0,
          successChance: 101,
          exp: 1,
          scroll: true
        })
        raw.config.alchemy = { ...raw.config.alchemy, plotPriceGrowth: 0.5 }
      },
      { regenerateText: true }
    )
    const text = issues.join('\n')
    for (const fragment of [
      'growDays',
      'harvest',
      'recipeId',
      'output.itemId',
      'inputs',
      'money',
      'minLevel',
      'successChance',
      'cần đúng một đan phương',
      'config.alchemy.plotPriceGrowth'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save: cấp lệch exp, công thức đã học không cần đan phương, ô trồng thứ không phải hạt', () => {
    const state = townState()
    const issues = validateGameState(data, {
      ...state,
      alchemy: { level: 5, exp: toBig(0), knownRecipes: ['potion'], lastCraft: null },
      garden: { plots: [{ seedItemId: 'herb', plantedDay: 0 }, null] }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('alchemy.level'),
        expect.stringContaining('alchemy.knownRecipes'),
        expect.stringContaining('garden.plots[0].seedItemId')
      ])
    )
  })

  it('migrate v40 → v41: luyện đan cấp 1, 2 ô trống; state hợp lệ', () => {
    const raw = serializeState(townState()) as Record<string, unknown>
    const { alchemy: _alchemy, garden: _garden, ...old } = raw
    const migrated = migrateState({ ...old, version: 40 }, data)
    expect(migrated.alchemy.level).toBe(1)
    expect(migrated.garden.plots).toEqual([null, null])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
