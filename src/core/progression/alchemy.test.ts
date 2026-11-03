// Luyện đan và linh điền (docs/rules/alchemy.md): cấp theo exp, tỉ lệ (cấp, kỹ năng đồng hành), luyện
// nhiều lần, thất bại mất nguyên liệu, đan phương, trồng / thu hoạch theo ngày, mua ô, nguyên liệu
// rơi, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import { getMaxHp } from '../monster'
import type { GameData, GameState, RawGameData } from '../model'
import { toBig } from '../shared'
import {
  findLog,
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
import { alchemyExpForLevel, alchemyLevelFromExp, craftChance, craftableTimes } from './alchemy'

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

  it('danh hiệu đang đeo cộng % luyện đan (docs/rules/achievements.md)', () => {
    const titled = { ...townState(), titles: { owned: ['lucky'], active: 'lucky' } }
    expect(craftChance(data, titled, data.recipes.risky)).toBe(70)
  })

  it('thiên phú ngự thú sư cộng % theo kênh của từng nơi luyện, cộng dồn với danh hiệu', () => {
    // Bản sao công thức risky ở Thợ rèn / Đầu bếp (gốc 50%).
    const stationData = makeAlchemyData((raw) => {
      const risky = defined(raw.recipes.find((recipe) => recipe.id === 'risky'))
      raw.recipes.push(
        { ...risky, id: 'riskySmith', station: 'smithing' },
        { ...risky, id: 'riskyCook', station: 'cooking' }
      )
    })
    const base = townState()
    // Nút fixture `trade`: +10% mỗi kênh luyện mỗi cấp.
    const talented = { ...base, tamer: { ...base.tamer, talentRanks: { trade: 2 } } }
    for (const id of ['risky', 'riskySmith', 'riskyCook']) {
      expect(craftChance(stationData, talented, stationData.recipes[id])).toBe(70)
    }
    const both = { ...talented, titles: { owned: ['lucky'], active: 'lucky' } }
    expect(craftChance(stationData, both, stationData.recipes.risky)).toBe(90)
    // Danh hiệu lucky chỉ có kênh luyện đan.
    expect(craftChance(stationData, both, stationData.recipes.riskySmith)).toBe(70)
  })
})

describe('bộ đếm thành tựu', () => {
  it('luyện thành công cộng pillsCrafted theo số lần thành công; thất bại không tính', () => {
    const next = craft(townState({ herb: 20 }), 'risky', 10)
    const { successes } = defined(findLog(next, 'crafted'))
    expect(successes).toBeGreaterThan(0)
    expect(successes).toBeLessThan(10)
    expect(next.stats.pillsCrafted).toBe(successes)
    expect(next.stats.itemsForged).toBe(0)
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
    expect(next.log).toEqual([
      { type: 'crafted', station: 'alchemy', recipeId: 'potion', successes: 3, failures: 0 }
    ])
    expect(validateGameState(data, next)).toEqual([])
  })

  it('thất bại mất nguyên liệu; mỗi lần tung riêng, tất định theo seed', () => {
    const next = craft(townState({ herb: 40 }), 'risky', 20)
    const { successes, failures } = defined(findLog(next, 'crafted'))
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
      'cần đúng một đan phương'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save: cấp lệch exp, công thức đã học không cần đan phương', () => {
    const state = townState()
    const issues = validateGameState(data, {
      ...state,
      alchemy: { level: 5, exp: toBig(0), knownRecipes: ['potion'] }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('alchemy.level'),
        expect.stringContaining('alchemy.knownRecipes')
      ])
    )
  })

  it('migrate v40 → v41: luyện đan cấp 1, 2 ô trống; state hợp lệ', () => {
    const raw = serializeState(townState()) as Record<string, unknown>
    const { alchemy: _alchemy, dwelling: _dwelling, ...old } = raw
    const migrated = migrateState({ ...old, version: 40 }, data)
    expect(migrated.alchemy.level).toBe(1)
    expect(migrated.dwelling.plots).toEqual([null, null])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
