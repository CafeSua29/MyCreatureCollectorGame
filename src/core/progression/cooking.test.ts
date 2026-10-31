// Linh thực (docs/rules/cooking.md): nấu (dùng chung craft, cấp nấu ăn riêng), ăn / thay món, đếm
// trận, từng hiệu ứng (chỉ số trong trận, EXP, tiền, đồ rơi, bắt, thân mật), dưỡng dục bằng món ăn,
// kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import { computeStats } from '../monster'
import { mealMultiplier, mealStatPercent, tickMeal } from '../registries'
import { toBig } from '../shared'
import { safariCatchChance } from '../world'
import { battleStats, monsterBattleContext, type Draft } from '../battle/draft'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeFieldMoveRawData,
  makeGameState,
  makeInventory,
  makeMonster,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  ActiveMeal,
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster,
  RawGameData
} from '../model'
import { craftExpForLevel, craftLevelFromExp } from './alchemy'

const percent = (type: string, value: number): { type: string; params: unknown } => ({
  type,
  params: { percent: value }
})

/** Món "feast" có mọi kênh %, "bun" chỉ số, "sad" tiền âm; đồ rơi của map 50%, chạy luôn thoát. */
function makeCookingData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeFieldMoveRawData()
  raw.items.push(
    { id: 'herb', category: 'material', price: 10 },
    {
      id: 'feast',
      category: 'dish',
      price: 100,
      battles: 2,
      effects: [
        percent('moneyPercent', 50),
        percent('expPercent', 50),
        percent('dropRatePercent', 100),
        percent('catchRatePercent', 100),
        percent('affinityGainPercent', 100)
      ]
    },
    {
      id: 'bun',
      category: 'dish',
      price: 20,
      battles: 3,
      effects: [
        { type: 'statPercent', params: { percent: 20, stat: 'attack' } },
        { type: 'statPercent', params: { percent: 5 } }
      ]
    },
    { id: 'sad', category: 'dish', price: 1, battles: 1, effects: [percent('moneyPercent', -50)] }
  )
  raw.recipes.push(
    {
      id: 'feast',
      station: 'cooking',
      output: { itemId: 'feast', count: 1 },
      inputs: [{ itemId: 'herb', count: 2 }],
      money: 0,
      minLevel: 1,
      successChance: 100,
      exp: 10
    },
    {
      id: 'bun',
      station: 'cooking',
      output: { itemId: 'bun', count: 2 },
      inputs: [{ itemId: 'herb', count: 1 }],
      money: 0,
      minLevel: 3,
      successChance: 100,
      exp: 1
    }
  )
  raw.config.imprint.foods.push('bun')
  // Chạy trốn luôn thoát (test đếm trận khi chạy).
  raw.config.battle.fleeChance = 100
  for (const biome of raw.biomes) {
    biome.drops = biome.drops.map((drop) => ({ ...drop, chance: 50 }))
  }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeCookingData()

const meal = (itemId: string, battlesLeft = 2): ActiveMeal => ({ itemId, battlesLeft })
const withMeal = (state: GameState, active: ActiveMeal | null): GameState => ({
  ...state,
  cooking: { ...state.cooking, meal: active }
})
const townState = (stacks: Record<string, number> = { herb: 10 }): GameState => ({
  ...makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] }),
  inventory: makeInventory(stacks)
})
const eat = (state: GameState, itemId: string): GameState =>
  gameReducer(data, state, { type: 'eatDish', itemId })

const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], ...overrides })
/** Quái hoang level 4 sắp gục (8 EXP, 20 tiền khi bị hạ). */
const prey = (id: string): Monster =>
  fighter(id, { level: 4, exp: toBig(64), damageTaken: toBig(60), skillIds: ['idle'] })
const strike: BattleCommand[] = [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
const run = (state: GameState, commands = strike): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })
const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)
/** Thắng một trận với quái ta "a" (đánh một đòn hạ prey), có món ăn `active`. */
const winWith = (active: ActiveMeal | null, party = [fighter('a')], seed = 1): GameState =>
  run({ ...withMeal(makeBattleState(party, [prey('e1')]), active), rng: seed })

describe('nấu ăn (craft ở nơi luyện cooking)', () => {
  it('cấp nấu ăn riêng: + exp nấu, ghi lần nấu gần nhất; luyện đan / luyện khí không đổi', () => {
    const next = gameReducer(data, townState(), { type: 'craft', recipeId: 'feast', times: 2 })
    expect(getItemCount(next.inventory, 'feast')).toBe(2)
    expect(next.cooking.exp.toString()).toBe('20')
    expect(next.cooking.level).toBe(2)
    expect(next.cooking.lastCraft).toEqual({ recipeId: 'feast', successes: 2, failures: 0 })
    expect(next.alchemy.exp.toString()).toBe('0')
    expect(next.smithing.exp.toString()).toBe('0')
    expect(validateGameState(data, next)).toEqual([])
  })

  it('thiếu cấp nấu ăn: cookingLevelTooLow; cộng exp giữ món đang ăn', () => {
    expectActionError(
      () => gameReducer(data, townState(), { type: 'craft', recipeId: 'bun', times: 1 }),
      'cookingLevelTooLow',
      { need: 3, have: 1 }
    )
    const eating = withMeal(townState(), meal('bun', 3))
    const next = gameReducer(data, eating, { type: 'craft', recipeId: 'feast', times: 1 })
    expect(next.cooking.meal).toEqual(meal('bun', 3))
  })

  it('đường cong cấp như luyện đan; exp cực lớn vẫn tính được', () => {
    expect(craftExpForLevel(data, 'cooking', 3).toString()).toBe('40')
    expect(craftLevelFromExp(data, 'cooking', toBig('1e20'))).toBe(3162277661)
  })
})

describe('ăn món ăn (eatDish)', () => {
  it('đặt món cho cả đội với thời hạn của món, tiêu một món', () => {
    const next = eat(townState({ feast: 2 }), 'feast')
    expect(next.cooking.meal).toEqual(meal('feast', 2))
    expect(getItemCount(next.inventory, 'feast')).toBe(1)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('ăn món khác thì thay (không chồng); ăn lại cùng món thì làm mới thời hạn', () => {
    const fed = eat(townState({ feast: 1, bun: 2 }), 'bun')
    const replaced = eat({ ...fed, cooking: { ...fed.cooking, meal: meal('bun', 1) } }, 'bun')
    expect(replaced.cooking.meal).toEqual(meal('bun', 3))
    expect(eat(replaced, 'feast').cooking.meal).toEqual(meal('feast', 2))
  })

  it('lỗi: trong trận, vật phẩm lạ, không phải món ăn, hết món; state giữ nguyên', () => {
    const battle = {
      ...makeBattleState([fighter('a')], [prey('e1')]),
      inventory: makeInventory({ feast: 1 })
    }
    expectActionError(() => eat(battle, 'feast'), 'inBattle')
    expectActionError(() => eat(townState(), 'ghost'), 'unknownItem', { itemId: 'ghost' })
    expectActionError(() => eat(townState(), 'herb'), 'notDish', { itemId: 'herb' })
    expectActionError(() => eat(townState(), 'feast'), 'notEnoughItem', {
      itemId: 'feast',
      have: 0,
      need: 1
    })
  })

  it('dưỡng dục: quái trong đội đang đòi đúng món thì xong yêu cầu; quái đi thám hiểm thì không', () => {
    const imprint = {
      phase: 'active' as const,
      completed: 0,
      total: 5,
      endDay: 10,
      request: { kind: 'feed' as const, itemId: 'bun', dueDay: 2, done: false }
    }
    const away = makeMonster({
      id: 'b',
      imprint,
      assignment: { kind: 'expedition', id: 'x1' }
    })
    const state = {
      ...townState({ bun: 1 }),
      party: [makeMonster({ id: 'a', imprint }), away]
    }
    const next = eat(state, 'bun')
    expect(defined(next.party[0]).imprint).toMatchObject({ completed: 1, request: { done: true } })
    expect(defined(next.party[1]).imprint).toEqual(imprint)
    expect(eat({ ...state, inventory: makeInventory({ feast: 1 }) }, 'feast').party[0]).toEqual(
      state.party[0]
    )
  })
})

describe('thời hạn theo trận', () => {
  it('mỗi trận (thắng, chạy) bớt 1; về 0 thì mất', () => {
    expect(winWith(meal('feast', 2)).cooking.meal).toEqual(meal('feast', 1))
    expect(winWith(meal('feast', 1)).cooking.meal).toBeNull()
    expect(winWith(null).cooking.meal).toBeNull()
    const fled = gameReducer(
      data,
      withMeal(makeBattleState([fighter('a')], [fighter('e1')]), meal('bun', 3)),
      { type: 'flee' }
    )
    expect(battleOf(fled).outcome).toBe('fled')
    expect(fled.cooking.meal).toEqual(meal('bun', 2))
  })

  it('tickMeal: biên 1 → null, null giữ null', () => {
    expect(tickMeal(meal('bun', 1))).toBeNull()
    expect(tickMeal(meal('bun', 1e9))).toEqual(meal('bun', 1e9 - 1))
    expect(tickMeal(null)).toBeNull()
  })
})

describe('hiệu ứng', () => {
  it('hệ số kênh: 1 + % / 100, không dưới 0; không ăn / món lạ = 1', () => {
    expect(mealMultiplier(data, meal('feast'), 'moneyPercent')).toBe(1.5)
    expect(mealMultiplier(data, meal('sad'), 'moneyPercent')).toBe(0.5)
    expect(mealMultiplier(data, meal('feast'), 'catchRatePercent')).toBe(2)
    expect(mealMultiplier(data, meal('bun'), 'moneyPercent')).toBe(1)
    expect(mealMultiplier(data, null, 'expPercent')).toBe(1)
    expect(mealMultiplier(data, meal('herb'), 'expPercent')).toBe(1)
  })

  it('tiền thắng trận nhân hệ số, kể cả % âm', () => {
    const moneyWon = (active: ActiveMeal | null): string => {
      const state = withMeal(makeBattleState([fighter('a')], [prey('e1')]), active)
      return run(state).money.minus(state.money).toString()
    }
    const base = toBig(moneyWon(null))
    expect(moneyWon(meal('feast'))).toBe(base.times(1.5).floor().toString())
    expect(moneyWon(meal('sad', 1))).toBe(base.times(0.5).floor().toString())
  })

  it('EXP nhân hệ số, làm tròn xuống', () => {
    const expOf = (active: ActiveMeal | null): string =>
      defined(winWith(active).party[0]).exp.toString()
    // EXP gốc 1 + 8 (× 1,5 = 12).
    expect(expOf(null)).toBe('9')
    expect(expOf(meal('feast'))).toBe('13')
  })

  it('đồ rơi nhân tỉ lệ (50% × 2 = luôn rơi)', () => {
    const drops = (active: ActiveMeal | null): number[] =>
      Array.from(
        { length: 30 },
        (_, i) => eventsOf(winWith(active, undefined, i + 1), 'drop').length
      )
    expect(new Set(drops(meal('feast')))).toEqual(new Set([1]))
    expect(drops(null)).toContain(0)
  })

  it('thân mật nhận khi thắng + 100% (cộng với hook, làm tròn)', () => {
    const gained = (active: ActiveMeal | null): number => defined(winWith(active).party[0]).affinity
    const base = gained(null)
    expect(base).toBeGreaterThan(0)
    expect(gained(meal('feast'))).toBe(base * 2)
  })

  it('tỉ lệ bắt trong trận và ở khu bảo tồn nhân hệ số', () => {
    const chanceWith = (active: ActiveMeal | null): number => {
      const state = {
        ...withMeal(
          makeBattleState([fighter('a')], [fighter('e1', { skillIds: ['idle'] })]),
          active
        ),
        inventory: makeInventory({ ball: 1 })
      }
      const next = run(state, [{ slot: 0, kind: 'item', itemId: 'ball', targetId: 'e1' }])
      return defined(eventsOf(next, 'throwBall')[0]).chance
    }
    const plain = chanceWith(null)
    expect(plain).toBeGreaterThan(0)
    expect(chanceWith(meal('feast'))).toBeCloseTo(Math.min(100, plain * 2))
    const encounter = { monster: fighter('w'), misses: 0, lure: null }
    const safari = (active: ActiveMeal | null): number =>
      safariCatchChance(data, withMeal(townState(), active), encounter)
    expect(safari(meal('feast'))).toBeCloseTo(Math.min(100, safari(null) * 2))
  })

  it('% chỉ số trong trận cho quái ta (nguồn meal, cộng dồn hiệu ứng); quái địch không', () => {
    expect(mealStatPercent(data, meal('bun'))).toEqual({
      hp: 5,
      attack: 25,
      defense: 5,
      spAttack: 5,
      spDefense: 5,
      speed: 5
    })
    expect(mealStatPercent(data, null)).toEqual({})
    const d = withMeal(makeBattleState([fighter('a')], [fighter('e1')]), meal('bun')) as Draft
    const [a] = d.party
    const ally = defined(a)
    const { percentBySource } = computeStats(data, ally, {
      battle: defined(monsterBattleContext(data, d, ally))
    })
    expect(percentBySource.meal).toMatchObject({ attack: 25, hp: 5 })
    expect(battleStats(data, d, ally).attack).toEqual(
      computeStats(data, ally).final.attack.times(1.25).floor()
    )
    const enemy = defined(d.battle.enemies[0])
    expect(battleStats(data, d, enemy).attack).toEqual(computeStats(data, enemy).final.attack)
  })
})

describe('dữ liệu và save', () => {
  it('món ăn sai, công thức nấu có scroll, config.cooking sai, món dưỡng dục sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.items.push(
          { id: 'dishEmpty', category: 'dish', price: 1, battles: 0, effects: [] },
          {
            id: 'dishBad',
            category: 'dish',
            price: 1,
            battles: 1,
            effects: [
              percent('moneyPercent', 0),
              percent('expPercent', -101),
              { type: 'statPercent', params: { percent: 5, stat: 'luck' } },
              { type: 'flyPercent', params: { percent: 5 } }
            ]
          },
          { id: 'scrollCook', category: 'recipeScroll', price: 1, recipeId: 'cookScroll' }
        )
        raw.recipes.push({
          id: 'cookScroll',
          station: 'cooking',
          output: { itemId: 'dishEmpty', count: 1 },
          inputs: [{ itemId: 'dishEmpty', count: 1 }],
          money: 0,
          minLevel: 1,
          successChance: 100,
          exp: 1,
          scroll: true
        })
        raw.config.cooking = { expBase: 0, expPower: 2, levelBonusPercent: -1 }
        raw.config.imprint.foods.push('dishGhost')
      },
      { regenerateText: true }
    )
    const text = issues.join('\n')
    for (const fragment of [
      'Vật phẩm "dishEmpty": battles',
      'Vật phẩm "dishEmpty": effects phải có ít nhất một hiệu ứng',
      'percent phải khác 0',
      'percent',
      'stat lạ "luck"',
      'hook "flyPercent" chưa có trong registry',
      'công thức cooking chưa hỗ trợ scroll',
      'config.cooking.expBase',
      'config.cooking.levelBonusPercent',
      'config.imprint.foods: "dishGhost"'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
    // Món ăn hợp lệ trong imprint.foods (bun ở makeCookingData) không báo lỗi.
    expect(text).not.toContain('config.imprint.foods: "bun"')
  })

  it('save: cấp lệch exp, lần nấu là công thức luyện đan, món ăn sai', () => {
    const state = townState()
    const issues = validateGameState(data, {
      ...state,
      cooking: {
        level: 4,
        exp: toBig(0),
        lastCraft: null,
        meal: { itemId: 'herb', battlesLeft: 0, extra: 1 }
      }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cooking.level'),
        expect.stringContaining('cooking.meal.itemId'),
        expect.stringContaining('cooking.meal.battlesLeft'),
        expect.stringContaining('extra')
      ])
    )
    const alchemyRecipe = makeCookingData((raw) =>
      raw.recipes.push({
        id: 'pill',
        output: { itemId: 'herb', count: 1 },
        inputs: [{ itemId: 'herb', count: 1 }],
        money: 0,
        minLevel: 1,
        successChance: 100,
        exp: 1
      })
    )
    const wrongStation = {
      ...state,
      cooking: { ...state.cooking, lastCraft: { recipeId: 'pill', successes: 1, failures: 0 } }
    }
    expect(validateGameState(alchemyRecipe, wrongStation)).toEqual([
      expect.stringContaining('cooking.lastCraft')
    ])
    expect(validateGameState(data, { ...state, cooking: null })).toContain('cooking phải là object')
  })

  it('save giữ exp cực lớn và món ăn (Decimal)', () => {
    // Cấp tối đa vẫn là số nguyên an toàn (√(1e25 / 10) ≈ 3,2e12).
    const exp = toBig('1e25')
    const state = withMeal(
      {
        ...townState(),
        cooking: {
          level: craftLevelFromExp(data, 'cooking', exp),
          exp,
          lastCraft: null,
          meal: null
        }
      },
      meal('bun', 3)
    )
    const loaded = migrateState(serializeState(state), data)
    expect(loaded.cooking.exp.eq(exp)).toBe(true)
    expect(loaded.cooking.meal).toEqual(meal('bun', 3))
    expect(validateGameState(data, loaded)).toEqual([])
  })

  it('migrate v78 → v79: cấp nấu ăn 1, chưa ăn món nào; state hợp lệ', () => {
    const raw = serializeState(townState()) as Record<string, unknown>
    const { cooking: _cooking, ...old } = raw
    const migrated = migrateState({ ...old, version: 78 }, data)
    expect(migrated.cooking).toEqual({ level: 1, exp: toBig(0), lastCraft: null, meal: null })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
