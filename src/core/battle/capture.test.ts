import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { catchChance, hpCatchFactor, withCatchPity } from '../world'
import { battleCatchChance } from './battleItems'
import { emptyRecord } from './draft'
import { migrateState, validateGameState } from '../game'
import { ActionError, toBig } from '../shared'
import { gameReducer } from '../game'
import { createGameData } from '../gameData'
import {
  defined,
  makeBattleState,
  makeData,
  makeRawData,
  withFixtureText,
  makeMonster,
  makeInventory,
  expectActionError
} from '../testing'
import type { BallItem, BattleCommand, BattleEvent, GameAction, GameState, Monster } from '../model'

// Fixture: weakling catchRate 50, strongling 20. Bóng "ball" ×1, "masterBall" ×1000 (luôn bắt).
// Sàn hệ số HP 10%. Quái mẫu level 1 có 50 HP.
const data = makeData()

/** Bóng trong fixture (thu hẹp kiểu Item → BallItem). */
function ballItem(id: string): BallItem {
  const item = data.items[id]
  if (item?.category !== 'ball') throw new Error(`fixture: "${id}" không phải bóng`)
  return item
}

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  run(state, { type: 'submitTurn', commands })

const useItem = (slot: number, itemId: string, targetId: string): BattleCommand => ({
  slot,
  kind: 'item',
  itemId,
  targetId
})

const idle = (slot: number): BattleCommand => ({ slot, kind: 'skill', skillId: 'idle' })

const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], ...overrides })

const passive = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], ...overrides })

const withInventory = (state: GameState, inventory: Record<string, number>): GameState => ({
  ...state,
  inventory: makeInventory(inventory)
})

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

describe('catchChance', () => {
  const ball = ballItem('ball')

  it('hệ số HP tuyến tính có sàn 10%', () => {
    expect(hpCatchFactor(data, makeMonster())).toBeCloseTo(0.1)
    expect(hpCatchFactor(data, makeMonster({ damageTaken: 25 }))).toBeCloseTo(0.55)
    expect(hpCatchFactor(data, makeMonster({ damageTaken: 49 }))).toBeCloseTo(0.982)
  })

  it('catchRate × bóng × HP', () => {
    expect(catchChance(data, makeMonster(), ball)).toBeCloseTo(5)
    expect(catchChance(data, makeMonster({ damageTaken: 25 }), ball)).toBeCloseTo(27.5)
    const strong = makeMonster({
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire']
    })
    expect(catchChance(data, strong, ball)).toBeCloseTo(2) // 20 × 0,1
  })

  it('trait nhân tỉ lệ bắt theo cấp', () => {
    const friendly = (level: number): Monster =>
      makeMonster({ damageTaken: 25, traits: [{ id: 'friendly', level }] })
    expect(catchChance(data, friendly(1), ball)).toBeCloseTo(27.5 * 1.5)
    // Cấp 2 (tuyến tính): +50% × 1,2 = +60%
    expect(catchChance(data, friendly(2), ball)).toBeCloseTo(27.5 * 1.6)
  })

  it('boss khó bắt hơn: chia cho bossMultiplier', () => {
    // bossMultiplier 5 cũng nhân max HP lên 250; mất 125 = còn nửa máu → 27,5 / 5
    const boss = makeMonster({ damageTaken: 125, bossMultiplier: 5 })
    expect(catchChance(data, boss, ball)).toBeCloseTo(5.5)
  })

  it('kẹp trong [0, 100]', () => {
    expect(catchChance(data, makeMonster(), ballItem('masterBall'))).toEqual(100)
  })
})

describe('ném bóng trong trận', () => {
  it('bắt con địch cuối thì thắng; quái bắt được chỉ cho EXP và vào đội khi hết trận', () => {
    const state = withInventory(
      makeBattleState(
        [ally('a')],
        [passive('e1', { level: 4, exp: toBig(64), damageTaken: toBig(10) })]
      ),
      { masterBall: 2 }
    )
    const next = turn(state, useItem(0, 'masterBall', 'e1'))
    const battle = defined(next.battle)
    expect(battle.outcome).toBe('won')
    expect(eventsOf(next, 'caught')).toEqual([
      { type: 'caught', monsterId: 'e1', destination: 'party' }
    ])
    expect(next.inventory.stacks).toEqual({ masterBall: 1 })
    expect(next.money).toEqual(0) // không tiền
    expect(eventsOf(next, 'drop')).toEqual([]) // không rơi đồ
    expect(defined(next.party.find((m) => m.id === 'a')).exp).toEqual(1 + 8) // EXP như hạ (0,5 × 4²)
    const caught = defined(next.party.find((m) => m.id === 'e1'))
    expect(caught.damageTaken).toEqual(10) // giữ máu đã mất
    expect(caught.exp).toEqual(64) // quái vừa bắt không nhận EXP của trận
  })

  it('đội đầy thì quái bắt được vào kho', () => {
    const party = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ally(id))
    const state = withInventory(makeBattleState(party, [passive('e1')]), { masterBall: 1 })
    const next = turn(state, useItem(0, 'masterBall', 'e1'), idle(1))
    expect(eventsOf(next, 'caught')[0].destination).toBe('storage')
    expect(next.party).toHaveLength(6)
    expect(next.storage.map((m) => m.id)).toEqual(['e1'])
  })

  it('bắt một trong hai địch: con kia vẫn đánh, quái đã bắt chưa vào đội cho tới hết trận', () => {
    const state = withInventory(
      makeBattleState(
        [ally('a'), ally('b'), ally('c')],
        [passive('e1', { level: 4, exp: toBig(64) }), passive('e2', { level: 4, exp: toBig(64) })]
      ),
      { masterBall: 1 }
    )
    const mid = turn(state, useItem(0, 'masterBall', 'e1'), idle(1))
    expect(defined(mid.battle).phase).toBe('chooseActions')
    expect(defined(mid.battle).enemySlots).toEqual([null, 'e2'])
    expect(defined(mid.battle).captured.map((m) => m.id)).toEqual(['e1'])
    expect(mid.party.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    // Quái vừa bắt không được đưa ra sân trong trận này.
    expectActionError(
      () => turn(mid, { slot: 0, kind: 'switch', monsterId: 'e1' }, idle(1)),
      'monsterNotInParty'
    )

    // Hạ e2: tiền chỉ từ e2, EXP từ cả hai.
    const end = turn(
      {
        ...mid,
        battle: {
          ...defined(mid.battle),
          enemies: [{ ...defined(mid.battle).enemies[0], damageTaken: toBig(64) }]
        }
      },
      { slot: 0, kind: 'skill', skillId: 'strike', target: 1 },
      idle(1)
    )
    expect(defined(end.battle).outcome).toBe('won')
    expect(end.money).toEqual(20)
    expect(defined(end.party.find((m) => m.id === 'a')).exp).toEqual(1 + 16)
    expect(end.party.map((m) => m.id)).toEqual(['a', 'b', 'c', 'e1'])
  })

  it('bắt được rồi thua vẫn giữ quái đã bắt', () => {
    const state = withInventory(
      makeBattleState(
        [ally('a', { damageTaken: toBig(45) })],
        [passive('e1'), makeMonster({ id: 'e2' })]
      ),
      { masterBall: 1 }
    )
    const next = turn(state, useItem(0, 'masterBall', 'e1'))
    expect(defined(next.battle).outcome).toBe('lost')
    expect(next.party.map((m) => m.id)).toEqual(['a', 'e1'])
  })

  it('ném trượt: mất bóng, quái hoang vẫn ở lại', () => {
    // bossMultiplier khổng lồ → tỉ lệ ≈ 0
    const state = withInventory(
      makeBattleState([ally('a')], [passive('e1', { bossMultiplier: 1e12 })]),
      { ball: 3 }
    )
    const next = turn(state, useItem(0, 'ball', 'e1'))
    expect(eventsOf(next, 'breakFree')).toEqual([{ type: 'breakFree', monsterId: 'e1' }])
    expect(next.inventory.stacks).toEqual({ ball: 2 })
    expect(defined(next.battle).enemySlots).toEqual(['e1', null])
  })

  it('ném bóng đi trước skill, kể cả khi chậm hơn', () => {
    const state = withInventory(
      makeBattleState(
        [ally('a', { traits: [{ id: 'slow', level: 1 }] }), ally('b')],
        [makeMonster({ id: 'e1' }), makeMonster({ id: 'e2' })]
      ),
      { ball: 1 }
    )
    const next = turn(state, useItem(0, 'ball', 'e1'), idle(1))
    const log = defined(next.battle).log
    const throwIndex = log.findIndex((e) => e.type === 'throwBall')
    const firstSkill = log.findIndex((e) => e.type === 'useSkill')
    expect(throwIndex).toBeGreaterThanOrEqual(0)
    expect(throwIndex).toBeLessThan(firstSkill)
  })

  it('hai bóng vào cùng một con: con thứ hai không ném, không mất bóng', () => {
    // Có thêm e2 để trận chưa kết thúc sau khi bắt e1.
    const state = withInventory(
      makeBattleState([ally('a'), ally('b')], [passive('e1'), passive('e2')]),
      { masterBall: 2 }
    )
    const next = turn(state, useItem(0, 'masterBall', 'e1'), useItem(1, 'masterBall', 'e1'))
    expect(eventsOf(next, 'throwBall')).toHaveLength(1)
    expect(eventsOf(next, 'noTarget')).toHaveLength(1)
    expect(next.inventory.stacks).toEqual({ masterBall: 1 })
  })

  it('báo lỗi: ném vào quái không có trên sân / đã gục, không đủ bóng, vật phẩm không tồn tại', () => {
    const state = withInventory(
      makeBattleState(
        [ally('a'), ally('b')],
        [passive('e1'), passive('e2', { damageTaken: toBig(50) })]
      ),
      { ball: 1 }
    )
    expectActionError(() => turn(state, useItem(0, 'ball', 'zz'), idle(1)), 'cannotThrowItem', {
      itemId: 'ball',
      targetId: 'zz'
    })
    expectActionError(() => turn(state, useItem(0, 'ball', 'e2'), idle(1)), 'cannotThrowItem')
    expectActionError(
      () => turn(state, useItem(0, 'ball', 'e1'), useItem(1, 'ball', 'e1')),
      'notEnoughItem'
    )
    expect(() => turn(state, useItem(0, 'nope', 'e1'), idle(1))).toThrow(ActionError)
  })

  it('cùng state và action cho cùng kết quả', () => {
    const state = withInventory(
      makeBattleState([ally('a')], [passive('e1', { damageTaken: toBig(30) })]),
      { ball: 5 }
    )
    const action = useItem(0, 'ball', 'e1')
    expect(turn(state, action)).toEqual(turn(state, action))
  })
})

describe('bắt trượt (mục "Bắt trượt" ở battle.md)', () => {
  // bossMultiplier khổng lồ → tỉ lệ gốc ≈ 0, chỉ còn phần bắt trượt.
  const hard = (id: string): Monster => passive(id, { bossMultiplier: 1e12 })
  const withMisses = (state: GameState, misses: Record<string, number>): GameState => {
    const battle = defined(state.battle)
    const records = Object.fromEntries(
      Object.entries(misses).map(([id, count]) => [id, { ...emptyRecord(), catchMisses: count }])
    )
    return { ...state, battle: { ...battle, records: { ...battle.records, ...records } } }
  }

  const chanceIn = (state: GameState, ball: BallItem, target: Monster): number =>
    battleCatchChance(
      data,
      { ...state, battle: defined(state.battle) },
      { ball, target, user: state.party[0] }
    )

  it('withCatchPity: cộng 5 điểm % mỗi lần trượt, không trần số lần, kẹp 0–100', () => {
    expect(withCatchPity(data, 10, 0)).toBe(10)
    expect(withCatchPity(data, 10, 1)).toBe(15)
    expect(withCatchPity(data, 10, 3)).toBe(25)
    expect(withCatchPity(data, 10, 18)).toBe(100)
    expect(withCatchPity(data, 0, Number.MAX_SAFE_INTEGER)).toBe(100)
  })

  it('ném trượt ghi vào bản ghi của đúng quái đó, lần ném sau vào nó cộng thêm', () => {
    const state = withInventory(makeBattleState([ally('a'), ally('b')], [hard('e1'), hard('e2')]), {
      ball: 5
    })
    const next = turn(state, useItem(0, 'ball', 'e1'), idle(1))
    expect(eventsOf(next, 'breakFree')).toEqual([{ type: 'breakFree', monsterId: 'e1' }])
    const battle = defined(next.battle)
    expect(battle.records.e1.catchMisses).toBe(1)
    expect(battle.records.e2?.catchMisses ?? 0).toBe(0)
    const ball = ballItem('ball')
    const e1 = defined(battle.enemies.find((m) => m.id === 'e1'))
    const e2 = defined(battle.enemies.find((m) => m.id === 'e2'))
    expect(chanceIn(next, ball, e1)).toBeCloseTo(5)
    expect(chanceIn(next, ball, e2)).toBeCloseTo(0) // quái khác không được cộng
    // Lần ném sau log tỉ lệ đã cộng.
    const again = turn(next, useItem(0, 'ball', 'e1'), idle(1))
    expect(eventsOf(again, 'throwBall').map((e) => e.chance)[1]).toBeCloseTo(5)
  })

  it('cộng dồn theo số lần trượt; đủ lần thì kẹp 100% và chắc chắn bắt được', () => {
    const base = withInventory(makeBattleState([ally('a')], [hard('e1')]), { ball: 1 })
    const target = defined(base.battle).enemies[0]
    const ball = ballItem('ball')
    expect(chanceIn(withMisses(base, { e1: 4 }), ball, target)).toBeCloseTo(20)
    expect(chanceIn(withMisses(base, { e1: 25 }), ball, target)).toBe(100)
    const next = turn(withMisses(base, { e1: 25 }), useItem(0, 'ball', 'e1'))
    expect(eventsOf(next, 'caught')).toHaveLength(1)
  })

  it('hết trận thì mất: trận mới không có bản ghi trượt', () => {
    const fresh = withInventory(makeBattleState([ally('a')], [hard('e1')]), { ball: 1 })
    expect(defined(fresh.battle).records.e1).toBeUndefined()
    const target = defined(fresh.battle).enemies[0]
    expect(chanceIn(fresh, ballItem('ball'), target)).toBeCloseTo(0)
  })

  it('save: catchMisses âm / không nguyên bị chặn; migrate v52 → v53 thêm catchMisses 0', () => {
    const state = withMisses(makeBattleState([ally('a')], [hard('e1')]), { e1: 2 })
    expect(validateGameState(data, state)).toEqual([])
    expect(validateGameState(data, withMisses(state, { e1: -1 }))).toEqual([
      'battle.records.e1.catchMisses phải là số nguyên ≥ 0, nhận -1'
    ])
    const battle = defined(state.battle)
    const { catchMisses: _misses, ...oldRecord } = battle.records.e1
    const old = JSON.parse(
      JSON.stringify({ ...state, version: 52, battle: { ...battle, records: { e1: oldRecord } } })
    )
    const migrated = migrateState(old, data)
    expect(defined(migrated.battle).records.e1.catchMisses).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('dùng thuốc trong trận', () => {
  const party = (): Monster[] => [
    ally('a'),
    ally('b'),
    ally('c', { damageTaken: toBig(30) }),
    ally('d', { damageTaken: toBig(50) })
  ]

  it('thuốc hồi máu cho quái dự bị, ghi log useItem và heal', () => {
    const state = withInventory(makeBattleState(party(), [passive('e1')]), { potion: 1 })
    const next = turn(state, useItem(0, 'potion', 'c'), idle(1))
    expect(defined(next.party.find((m) => m.id === 'c')).damageTaken).toEqual(5) // hồi 25
    expect(next.inventory.stacks).toEqual({})
    expect(eventsOf(next, 'heal')).toContainEqual({ type: 'heal', monsterId: 'c', amount: 25 })
  })

  it('thuốc hồi sinh cho quái đã gục ở dự bị', () => {
    const state = withInventory(makeBattleState(party(), [passive('e1')]), { revive: 1 })
    const next = turn(state, useItem(0, 'revive', 'd'), idle(1))
    expect(defined(next.party.find((m) => m.id === 'd')).damageTaken).toEqual(25)
  })

  it('thuốc thứ hai hết tác dụng lúc dùng thì không bị trừ', () => {
    const state = withInventory(
      makeBattleState([ally('a', { damageTaken: toBig(10) }), ally('b')], [passive('e1')]),
      { potion: 2 }
    )
    const next = turn(state, useItem(0, 'potion', 'a'), useItem(1, 'potion', 'a'))
    expect(next.party[0].damageTaken).toEqual(0)
    expect(eventsOf(next, 'itemNoEffect')).toHaveLength(1)
    expect(next.inventory.stacks).toEqual({ potion: 1 })
  })

  it('báo lỗi: vật phẩm chỉ dùng ngoài trận, thuốc không có tác dụng, quái không có trong đội', () => {
    const state = withInventory(makeBattleState(party(), [passive('e1')]), {
      genderPotion: 1,
      potion: 1
    })
    expectActionError(
      () => turn(state, useItem(0, 'genderPotion', 'a'), idle(1)),
      'itemWrongContext',
      { context: 'battle' }
    )
    expectActionError(() => turn(state, useItem(0, 'potion', 'a'), idle(1)), 'itemNoEffect')
    expectActionError(() => turn(state, useItem(0, 'potion', 'e1'), idle(1)), 'monsterNotInParty')
  })

  it('báo lỗi: đá tiến hóa chỉ dùng ngoài trận, tinh thể không dùng trực tiếp được', () => {
    const state = withInventory(makeBattleState(party(), [passive('e1')]), { fireStone: 1 })
    expectActionError(
      () => turn(state, useItem(0, 'fireStone', 'a'), idle(1)),
      'itemWrongContext',
      { context: 'battle' }
    )
    expectActionError(() => turn(state, useItem(0, 'traitCrystal', 'a'), idle(1)), 'itemNotUsable')
  })
})

describe('bóng có điều kiện trong trận (mục "Bắt quái" ở battle.md)', () => {
  const raw = makeRawData()
  raw.items.push(
    { id: 'healBall', category: 'ball', price: 1, catchMultiplier: 1000, healOnCatch: true },
    {
      id: 'quickBall',
      category: 'ball',
      price: 1,
      catchMultiplier: 1,
      bonuses: [{ type: 'firstTurn', params: { multiplier: 5 } }]
    }
  )
  const balls = createGameData(withFixtureText(raw))
  const quick = balls.items.quickBall as BallItem

  it('Heal Ball: quái bắt được hồi đầy máu, hết trạng thái', () => {
    const hurt = passive('e1', {
      damageTaken: toBig(30),
      statuses: [{ statusId: 'poison', turnsLeft: 3 }]
    })
    const state = withInventory(makeBattleState([ally('a')], [hurt]), { healBall: 1 })
    const next = gameReducer(balls, state, {
      type: 'submitTurn',
      commands: [useItem(0, 'healBall', 'e1')]
    })
    const caught = defined(next.party.find((m) => m.id === 'e1'))
    expect(caught.damageTaken).toEqual(0)
    expect(caught.statuses).toEqual([])
  })

  it('Quick Ball: × 5 ở lượt đầu, lượt sau như bóng thường; log có critical / shakes', () => {
    const state = withInventory(makeBattleState([ally('a')], [passive('e1')]), { quickBall: 1 })
    const battle = defined(state.battle)
    const chanceAt = (turn: number): number =>
      battleCatchChance(
        balls,
        { ...state, battle: { ...battle, turn } },
        { ball: quick, target: battle.enemies[0], user: state.party[0] }
      )
    expect(chanceAt(1)).toBeCloseTo(25)
    expect(chanceAt(2)).toBeCloseTo(5)
    const next = gameReducer(balls, state, {
      type: 'submitTurn',
      commands: [useItem(0, 'quickBall', 'e1')]
    })
    const thrown = (next.battle?.log ?? []).find((e) => e.type === 'throwBall')
    expect(thrown).toMatchObject({ chance: 25, critical: false })
  })
})
