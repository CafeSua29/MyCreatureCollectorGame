import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { createGameData } from '../gameData'
import { ActionError, cloneData, toBig } from '../shared'
import { isFainted } from '../monster'
import { suggestReplacements } from './battleActions'
import { gameReducer } from '../game'
import {
  atFloor,
  defined,
  makeBattleState,
  makeData,
  makeMonster,
  makeRawData,
  expectActionError,
  makeGameState,
  withFixtureText
} from '../testing'
import type { BattleCommand, BattleEvent, GameAction, GameData, GameState, Monster } from '../model'

// Quái mẫu level 1: mọi chỉ số 50. strike giữa hai quái mẫu gây 7 sát thương.
// Quái "passive" chỉ biết idle (không làm gì), giúp cô lập hành động của bên kia.
const data = makeData()

const run = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  run(state, { type: 'submitTurn', commands })

const strike = (slot = 0, target?: number): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId: 'strike',
  target
})

const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'quick', 'wave', 'idle'], ...overrides })

const enemy = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, ...overrides })

const passive = (id: string, overrides: MonsterOverrides = {}): Monster =>
  enemy(id, { skillIds: ['idle'], ...overrides })

const monsterIn = (state: GameState, id: string): Monster =>
  defined(state.party.find((m) => m.id === id) ?? state.battle?.enemies.find((m) => m.id === id))

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

function dataWith(edit: (raw: ReturnType<typeof makeRawData>) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(raw)
}

describe('startWildBattle', () => {
  const state = makeGameState({ seed: 7, party: [ally('a'), ally('b'), ally('c')] })

  it('sinh quái hoang, đưa 2 quái đầu đội ra sân', () => {
    const next = run(atFloor(state, 1), { type: 'startWildBattle' })
    const battle = defined(next.battle)
    expect(battle.phase).toBe('chooseActions')
    expect(battle.enemies).toHaveLength(1)
    expect(battle.enemySlots).toEqual(['m4', null])
    expect(battle.playerSlots).toEqual(['a', 'b'])
    expect(battle.participants).toEqual(['a', 'b'])
    expect(next.nextMonsterId).toEqual(5)
    expect(state.battle).toBeNull()
  })

  it('biome có doubleChance 100 luôn gặp 2 quái', () => {
    const next = run(atFloor(state, 3), { type: 'startWildBattle' })
    expect(defined(next.battle).enemySlots).toEqual(['m4', 'm5'])
  })

  it('bỏ qua quái đã gục khi xếp ra sân', () => {
    const party = [ally('a', { damageTaken: toBig(50) }), ally('b'), ally('c')]
    const next = run(atFloor(makeGameState({ seed: 1, party }), 1), {
      type: 'startWildBattle'
    })
    expect(defined(next.battle).playerSlots).toEqual(['b', 'c'])
  })

  it('báo lỗi: ở thị trấn, đang trong trận, cả đội đã gục', () => {
    expectActionError(() => run(state, { type: 'startWildBattle' }), 'notOnFloor')
    const inBattle = run(atFloor(state, 1), { type: 'startWildBattle' })
    expect(() => run(atFloor(inBattle, 1), { type: 'startWildBattle' })).toThrow(ActionError)
    const wiped = makeGameState({ seed: 1, party: [ally('a', { damageTaken: toBig(50) })] })
    expectActionError(() => run(atFloor(wiped, 1), { type: 'startWildBattle' }), 'noHealthyMonster')
  })
})

describe('submitTurn — lượt cơ bản', () => {
  it('hai bên đánh nhau, HP lưu bằng damageTaken, state cũ không đổi', () => {
    const state = makeBattleState([ally('a')], [enemy('e1')])
    const before = cloneData(state)
    const next = turn(state, strike())
    expect(monsterIn(next, 'e1').damageTaken).toEqual(7)
    expect(monsterIn(next, 'a').damageTaken).toEqual(7)
    expect(defined(next.battle).turn).toEqual(2)
    expect(state).toEqual(before)
  })

  it('cùng state và action cho cùng kết quả', () => {
    const state = makeBattleState([ally('a'), ally('b')], [enemy('e1'), enemy('e2')])
    const commands = [strike(0, 1), { slot: 1, kind: 'skill', skillId: 'wave' } as BattleCommand]
    expect(turn(state, ...commands)).toEqual(turn(state, ...commands))
  })

  it('speed cao đánh trước', () => {
    const fast = makeBattleState([ally('a', { traits: [{ id: 'fast', level: 1 }] })], [enemy('e1')])
    const fastOrder = eventsOf(turn(fast, strike()), 'useSkill').map((e) => e.monsterId)
    expect(fastOrder).toEqual(['a', 'e1'])

    const slow = makeBattleState([ally('a', { traits: [{ id: 'slow', level: 1 }] })], [enemy('e1')])
    const slowOrder = eventsOf(turn(slow, strike()), 'useSkill').map((e) => e.monsterId)
    expect(slowOrder).toEqual(['e1', 'a'])
  })

  it('priority cao đánh trước bất kể speed', () => {
    const state = makeBattleState(
      [ally('a', { traits: [{ id: 'slow', level: 1 }] })],
      [enemy('e1')]
    )
    const next = turn(state, { slot: 0, kind: 'skill', skillId: 'quick' })
    expect(eventsOf(next, 'useSkill').map((e) => e.monsterId)).toEqual(['a', 'e1'])
  })

  it('bậc trận ảnh hưởng thứ tự và sát thương', () => {
    const state = makeBattleState([ally('a')], [passive('e1')], {
      stages: { a: { attack: 2 } }
    })
    expect(monsterIn(turn(state, strike()), 'e1').damageTaken).toEqual(30)
  })
})

describe('submitTurn — mục tiêu và skill', () => {
  it('mục tiêu đã gục giữa lượt thì đòn chuyển sang địch còn lại', () => {
    const state = makeBattleState(
      [ally('a', { traits: [{ id: 'fast', level: 1 }] }), ally('b')],
      [passive('e1', { damageTaken: toBig(45) }), passive('e2')]
    )
    const next = turn(state, strike(0, 0), strike(1, 0))
    expect(monsterIn(next, 'e1').damageTaken).toEqual(50)
    expect(monsterIn(next, 'e2').damageTaken).toEqual(7)
    expect(defined(next.battle).enemySlots).toEqual([null, 'e2'])
  })

  it('skill đánh cả hai địch nhận hệ số spread; còn một địch thì không', () => {
    const wave: BattleCommand = { slot: 0, kind: 'skill', skillId: 'wave' }
    // 0,3 × 0,4 × 50 = 6; × 0,75 = 4,5 → 4
    const two = turn(makeBattleState([ally('a')], [passive('e1'), passive('e2')]), wave)
    expect(monsterIn(two, 'e1').damageTaken).toEqual(4)
    expect(monsterIn(two, 'e2').damageTaken).toEqual(4)
    const one = turn(makeBattleState([ally('a')], [passive('e1')]), wave)
    expect(monsterIn(one, 'e1').damageTaken).toEqual(6)
  })

  it('skill status: giảm bậc cả hai địch, tăng bậc bản thân, tăng bậc đồng đội', () => {
    const state = makeBattleState(
      [ally('a', { skillIds: ['growl'] }), ally('b', { skillIds: ['pumpUp', 'cheer'] })],
      [passive('e1'), passive('e2')]
    )
    const growl = turn(
      state,
      { slot: 0, kind: 'skill', skillId: 'growl' },
      { slot: 1, kind: 'skill', skillId: 'pumpUp' }
    )
    expect(defined(growl.battle).stages.e1?.attack).toEqual(-1)
    expect(defined(growl.battle).stages.e2?.attack).toEqual(-1)
    expect(defined(growl.battle).stages.b?.attack).toEqual(2)

    const cheer = turn(
      state,
      { slot: 0, kind: 'skill', skillId: 'growl' },
      { slot: 1, kind: 'skill', skillId: 'cheer' }
    )
    expect(defined(cheer.battle).stages.a?.attack).toEqual(1)
  })

  it('bậc trận kẹp ở +6, log ghi lượng thực tăng', () => {
    const state = makeBattleState([ally('a', { skillIds: ['pumpUp'] })], [passive('e1')], {
      stages: { a: { attack: 5 } }
    })
    const next = turn(state, { slot: 0, kind: 'skill', skillId: 'pumpUp' })
    expect(defined(next.battle).stages.a?.attack).toEqual(6)
    expect(eventsOf(next, 'stage').find((e) => e.monsterId === 'a')?.delta).toEqual(1)
  })

  it('skill hút máu hồi theo % sát thương gây ra', () => {
    // sap (cỏ, STAB): 0,15 × 50 × 1,5 = 11,25 → 11; hồi 50% = 5,5 → 6
    const state = makeBattleState(
      [ally('a', { skillIds: ['sap'], damageTaken: toBig(20) })],
      [passive('e1')]
    )
    const next = turn(state, { slot: 0, kind: 'skill', skillId: 'sap' })
    expect(monsterIn(next, 'e1').damageTaken).toEqual(11)
    expect(monsterIn(next, 'a').damageTaken).toEqual(14)
  })

  it('skill có accuracy < 100 có lúc trượt, có lúc trúng', () => {
    let misses = 0
    let hits = 0
    for (let seed = 0; seed < 60; seed++) {
      const state = {
        ...makeBattleState([ally('a', { skillIds: ['shaky'] })], [passive('e1')]),
        rng: seed
      }
      const next = turn(state, { slot: 0, kind: 'skill', skillId: 'shaky' })
      if (eventsOf(next, 'miss').length > 0) misses++
      else hits++
    }
    expect(misses).toBeGreaterThan(10)
    expect(hits).toBeGreaterThan(10)
  })

  it('trait hồi máu cuối lượt', () => {
    // regen 10% của 50 = 5
    const state = makeBattleState(
      [ally('a', { traits: [{ id: 'regen', level: 1 }], damageTaken: toBig(20) })],
      [passive('e1')]
    )
    const next = turn(state, strike())
    expect(monsterIn(next, 'a').damageTaken).toEqual(15)
    expect(eventsOf(next, 'heal')).toContainEqual({ type: 'heal', monsterId: 'a', amount: 5 })
  })

  it('skill đánh mọi địch: hiệu ứng lên chính quái dùng chạy một lần cho cả chiêu', () => {
    // Như Clanging Scales: −1 thủ một lần dù trúng hai địch; hạ bậc mục tiêu vẫn lên từng địch.
    const raw = cloneData(makeRawData())
    raw.skills.push({
      id: 'scales',
      elementId: 'normal',
      category: 'special',
      power: 40,
      accuracy: 100,
      priority: 0,
      target: 'allEnemies',
      effects: [
        { type: 'statStage', params: { who: 'self', stat: 'defense', delta: -1 } },
        { type: 'statStage', params: { who: 'target', stat: 'speed', delta: -1 } }
      ]
    })
    const scalesData = createGameData(withFixtureText(raw))
    const state = makeBattleState(
      [ally('a', { skillIds: ['scales'] })],
      [passive('e1'), passive('e2')]
    )
    const next = gameReducer(scalesData, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'scales' }]
    })
    expect(defined(next.battle).stages).toEqual({
      a: { defense: -1 },
      e1: { speed: -1 },
      e2: { speed: -1 }
    })
  })
})

describe('submitTurn — đổi quái', () => {
  it('đổi quái đi trước mọi skill; quái mới chịu đòn, bậc của quái cũ bị xóa', () => {
    const state = makeBattleState([ally('a'), ally('c')], [enemy('e1')], {
      playerSlots: ['a', null],
      stages: { a: { attack: 3 } }
    })
    const next = turn(state, { slot: 0, kind: 'switch', monsterId: 'c' })
    expect(defined(next.battle).playerSlots).toEqual(['c', null])
    expect(monsterIn(next, 'c').damageTaken).toEqual(7)
    expect(monsterIn(next, 'a').damageTaken).toEqual(0)
    expect(defined(next.battle).stages.a).toBeUndefined()
    expect(defined(next.battle).participants).toContain('c')
  })

  it('báo lỗi khi đổi sang quái đang trên sân, đã gục, không có trong đội, hoặc chọn hai lần', () => {
    const state = makeBattleState(
      [ally('a'), ally('b'), ally('c'), ally('d', { damageTaken: toBig(50) })],
      [enemy('e1')]
    )
    const swap = (slot: number, monsterId: string): BattleCommand => ({
      slot,
      kind: 'switch',
      monsterId
    })
    expectActionError(() => turn(state, swap(0, 'b'), strike(1)), 'monsterAlreadyActive')
    expectActionError(() => turn(state, swap(0, 'd'), strike(1)), 'monsterFainted')
    expectActionError(() => turn(state, swap(0, 'zz'), strike(1)), 'monsterNotInParty')
    expectActionError(() => turn(state, swap(0, 'c'), swap(1, 'c')), 'monsterChosenTwice')
  })
})

describe('submitTurn — kiểm tra lệnh', () => {
  const state = makeBattleState([ally('a'), ally('b')], [enemy('e1')])

  it('cần đúng một lệnh cho mỗi ô có quái còn sống', () => {
    expect(() => turn(state, strike(0))).toThrow(ActionError)
    expect(() => turn(state, strike(0), strike(0))).toThrow(ActionError)
    expect(() => turn(state, strike(0), strike(1), strike(2))).toThrow(ActionError)
  })

  it('báo lỗi skill quái không biết và ô mục tiêu sai', () => {
    expectActionError(
      () => turn(state, { slot: 0, kind: 'skill', skillId: 'sap' }, strike(1)),
      'skillNotKnown'
    )
    expectActionError(() => turn(state, strike(0, 5), strike(1)), 'malformedAction')
  })

  it('báo lỗi khi không có trận hoặc sai pha', () => {
    const noBattle = makeGameState({ seed: 1, party: [ally('a')] })
    expectActionError(() => turn(noBattle, strike()), 'noBattle')
    const ended = makeBattleState([ally('a')], [enemy('e1')], { phase: 'ended', outcome: 'fled' })
    expectActionError(() => turn(ended, strike()), 'wrongBattlePhase')
  })
})

describe('kết thúc trận', () => {
  it('thắng: nhận tiền, EXP cho quái tham chiến còn sống, vật phẩm rơi', () => {
    // Địch level 4: máu 65, mỗi con cho 8 EXP và 20 tiền. Vùng field rơi potion 100%.
    const state = makeBattleState(
      [ally('a', { traits: [{ id: 'fast', level: 1 }] }), ally('b'), ally('c')],
      [enemy('e1', { level: 4, exp: toBig(64), damageTaken: toBig(60) })]
    )
    const next = turn(state, strike(0), strike(1))
    const battle = defined(next.battle)
    expect(battle.phase).toBe('ended')
    expect(battle.outcome).toBe('won')
    expect(next.money).toEqual(20)
    expect(monsterIn(next, 'a').exp).toEqual(9)
    expect(monsterIn(next, 'a').level).toEqual(2)
    expect(monsterIn(next, 'b').exp).toEqual(9)
    expect(monsterIn(next, 'c').exp).toEqual(1) // không tham chiến
    expect(next.inventory.stacks).toEqual({ potion: 1 })
    expect(eventsOf(next, 'won')).toEqual([{ type: 'won', money: toBig(20) }])
    // Địch gục trước khi kịp đánh.
    expect(eventsOf(next, 'useSkill').some((e) => e.monsterId === 'e1')).toBe(false)
  })

  it('quái tham chiến đã gục không nhận EXP', () => {
    const state = makeBattleState(
      [
        ally('a', { traits: [{ id: 'fast', level: 1 }] }),
        ally('b', { damageTaken: toBig(50) }),
        ally('c')
      ],
      [enemy('e1', { damageTaken: toBig(45) })],
      { playerSlots: ['a', null], participants: ['a', 'b'] }
    )
    const next = turn(state, strike())
    expect(defined(next.battle).outcome).toBe('won')
    expect(monsterIn(next, 'b').exp).toEqual(1)
  })

  it('thua: mất % tiền, về thị trấn, không tự hồi máu', () => {
    const state = {
      ...makeBattleState([ally('a', { damageTaken: toBig(45) })], [enemy('e1')]),
      money: toBig(1000)
    }
    expect(state.location.type).toBe('floor')
    const next = turn(state, { slot: 0, kind: 'skill', skillId: 'idle' })
    expect(defined(next.battle).outcome).toBe('lost')
    expect(next.money).toEqual(900)
    expect(next.location).toEqual({ type: 'town' })
    // Vào thị trấn: cửa hàng random lại hàng (fixture luôn 3 món).
    expect(state.shop.stock).toEqual([])
    expect(next.shop.stock).toHaveLength(3)
    expect(monsterIn(next, 'a').damageTaken).toEqual(50) // vẫn gục (max HP 50)
    expect(eventsOf(next, 'lost')).toEqual([{ type: 'lost', moneyLost: 100 }])

    // Rời trận vẫn ở thị trấn; NPC hồi máu miễn phí hồi được cả quái đã gục.
    const left = run(next, { type: 'leaveBattle' })
    expect(left.location).toEqual({ type: 'town' })
    expect(run(left, { type: 'healParty' }).party[0].damageTaken).toEqual(0)
  })

  it('thua khi tiền = 0: không âm tiền', () => {
    const state = {
      ...makeBattleState([ally('a', { damageTaken: toBig(45) })], [enemy('e1')]),
      money: toBig(0)
    }
    const next = turn(state, { slot: 0, kind: 'skill', skillId: 'idle' })
    expect(next.money).toEqual(0)
    expect(next.location).toEqual({ type: 'town' })
  })

  it('leaveBattle chỉ được khi trận đã kết thúc; giữ HP đã mất', () => {
    const state = makeBattleState([ally('a', { damageTaken: toBig(10) })], [enemy('e1')])
    expect(() => run(state, { type: 'leaveBattle' })).toThrow(ActionError)
    const ended = {
      ...state,
      battle: { ...defined(state.battle), phase: 'ended' as const, outcome: 'fled' as const }
    }
    const left = run(ended, { type: 'leaveBattle' })
    expect(left.battle).toBeNull()
    expect(left.party[0].damageTaken).toEqual(10)
  })
})

describe('quái gục và thay quái', () => {
  it('quái gục khi còn dự bị thì chờ người chơi chọn quái thay', () => {
    const state = makeBattleState(
      [ally('a', { damageTaken: toBig(45) }), ally('b'), ally('c')],
      [enemy('e1')],
      {
        playerSlots: ['a', null]
      }
    )
    const fainted = turn(state, { slot: 0, kind: 'skill', skillId: 'idle' })
    expect(defined(fainted.battle).phase).toBe('chooseReplacement')
    expect(eventsOf(fainted, 'faint')).toEqual([{ type: 'faint', monsterId: 'a' }])

    expectActionError(() => turn(fainted, strike()), 'wrongBattlePhase')
    const replace = (replacements: { slot: number; monsterId: string }[]): GameState =>
      run(fainted, { type: 'replaceFainted', replacements })
    // Phải thay hết mức có thể: ô 1 vốn trống cũng được thay (còn dự bị).
    expectActionError(() => replace([]), 'replacementIncomplete', { slot: 0 })
    expectActionError(() => replace([{ slot: 0, monsterId: 'b' }]), 'replacementIncomplete', {
      slot: 1
    })
    expectActionError(() => replace([{ slot: 2, monsterId: 'b' }]), 'slotNotReplaceable', {
      slot: 2
    })
    expectActionError(
      () =>
        replace([
          { slot: 0, monsterId: 'b' },
          { slot: 0, monsterId: 'c' }
        ]),
      'slotNotReplaceable',
      { slot: 0 }
    )
    expectActionError(() => replace([{ slot: 0, monsterId: 'a' }]), 'monsterCannotEnter')

    const next = replace([
      { slot: 0, monsterId: 'b' },
      { slot: 1, monsterId: 'c' }
    ])
    expect(defined(next.battle).phase).toBe('chooseActions')
    expect(defined(next.battle).playerSlots).toEqual(['b', 'c'])
    expect(defined(next.battle).participants).toContain('b')
  })

  it('quái gục khi không còn dự bị thì ô để trống, trận tiếp tục', () => {
    const state = makeBattleState(
      [ally('a'), ally('b', { damageTaken: toBig(47) })],
      [enemy('e1', { skillIds: ['wave'] })]
    )
    const next = turn(
      state,
      { slot: 0, kind: 'skill', skillId: 'idle' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    )
    expect(defined(next.battle).phase).toBe('chooseActions')
    expect(defined(next.battle).playerSlots).toEqual(['a', null])
    // Lượt sau chỉ cần lệnh cho ô 0.
    expect(() => turn(next, strike(0))).not.toThrow()
  })

  it('suggestReplacements: dự bị đầu tiên cho mỗi ô gục, hợp lệ cho replaceFainted', () => {
    const state = makeBattleState(
      [
        ally('a'),
        ally('b', { damageTaken: toBig(47) }),
        ally('c', { damageTaken: toBig(999) }),
        ally('d')
      ],
      [enemy('e1', { skillIds: ['wave'] })]
    )
    const fainted = turn(
      state,
      { slot: 0, kind: 'skill', skillId: 'idle' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    )
    const suggestion = suggestReplacements(data, fainted)
    // c đã gục nên bỏ qua, d là dự bị còn sống đầu tiên.
    expect(suggestion).toEqual([{ slot: 1, monsterId: 'd' }])
    expect(suggestReplacements(data, fainted)).toEqual(suggestion)
    const next = run(fainted, { type: 'replaceFainted', replacements: suggestion })
    expect(defined(next.battle).playerSlots).toEqual(['a', 'd'])
  })

  it('suggestReplacements: hai ô gục, một dự bị thì chỉ thay ô đầu', () => {
    const state = makeBattleState(
      [ally('a', { damageTaken: toBig(47) }), ally('b', { damageTaken: toBig(47) }), ally('c')],
      [enemy('e1', { skillIds: ['wave'] })]
    )
    const fainted = turn(
      state,
      { slot: 0, kind: 'skill', skillId: 'idle' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    )
    expect(defined(fainted.battle).phase).toBe('chooseReplacement')
    const suggestion = suggestReplacements(data, fainted)
    expect(suggestion).toEqual([{ slot: 0, monsterId: 'c' }])
    const next = run(fainted, { type: 'replaceFainted', replacements: suggestion })
    expect(defined(next.battle).playerSlots).toEqual(['c', null])
  })

  it('suggestReplacements báo lỗi khi không ở giai đoạn thay quái', () => {
    const state = makeBattleState([ally('a')], [enemy('e1')])
    expectActionError(() => suggestReplacements(data, state), 'wrongBattlePhase')
    expectActionError(() => suggestReplacements(data, { ...state, battle: null }), 'noBattle')
  })
})

describe('flee', () => {
  it('thành công thì kết thúc trận', () => {
    const always = dataWith((raw) => (raw.config.battle.fleeChance = 100))
    const next = run(makeBattleState([ally('a')], [enemy('e1')]), { type: 'flee' }, always)
    expect(defined(next.battle).outcome).toBe('fled')
    expect(eventsOf(next, 'fled')).toHaveLength(1)
  })

  it('thất bại thì mất lượt, địch vẫn đánh', () => {
    const never = dataWith((raw) => (raw.config.battle.fleeChance = 0))
    const next = run(makeBattleState([ally('a')], [enemy('e1')]), { type: 'flee' }, never)
    expect(defined(next.battle).phase).toBe('chooseActions')
    expect(eventsOf(next, 'fleeFailed')).toHaveLength(1)
    expect(monsterIn(next, 'a').damageTaken).toEqual(7)
  })
})

describe('trận đầy đủ', () => {
  it('đánh từ đầu đến khi kết thúc, chỉ dùng action hợp lệ', () => {
    // Đội ta level 30 (chỉ số 195) gặp 2 quái level 5 (chỉ số 70): luôn thắng, kể cả khi AI địch
    // dùng growl hạ Công của ta nhiều lần.
    const party = [
      ally('a', { level: 30, exp: toBig(27000) }),
      ally('b', { level: 30, exp: toBig(27000) }),
      ally('c')
    ]
    let state = run(atFloor(makeGameState({ seed: 99, party }), 3), {
      type: 'startWildBattle'
    })
    const alive = (id: string | null): boolean =>
      id !== null && !isFainted(data, monsterIn(state, id))
    for (let i = 0; i < 100 && defined(state.battle).phase !== 'ended'; i++) {
      const battle = defined(state.battle)
      if (battle.phase === 'chooseReplacement') {
        const slot = battle.playerSlots.findIndex((id) => id !== null && !alive(id))
        const reserve = defined(
          state.party.find((m) => !battle.playerSlots.includes(m.id) && !isFainted(data, m))
        )
        state = run(state, {
          type: 'replaceFainted',
          replacements: [{ slot, monsterId: reserve.id }]
        })
        continue
      }
      const commands = battle.playerSlots.flatMap((id, slot) => (alive(id) ? [strike(slot)] : []))
      state = turn(state, ...commands)
    }
    expect(defined(state.battle).phase).toBe('ended')
    expect(defined(state.battle).outcome).toBe('won')
    expect(run(state, { type: 'leaveBattle' }).battle).toBeNull()
  })
})
