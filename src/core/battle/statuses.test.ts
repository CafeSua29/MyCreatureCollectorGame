import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { SKILL_EFFECTS, type SkillEffectAiContext } from '../registries'
import { BIG_ZERO, createRng, toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeField,
  makeInventory,
  makeMonster,
  makeRawData
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  GameAction,
  GameData,
  GameState,
  Monster,
  StatusInstance
} from '../model'

// Fixture: quái mẫu level 1 có 50 HP, mọi chỉ số 50; strike (vật lý, 50) gây 7 sát thương lên quái
// hệ normal (quái ta hệ ghost nên strike không có STAB). Độc 10% / cuối lượt, 4 lượt; bỏng 6,25%, vật lý × 0,5, 3 lượt; ngủ 1–3 lượt mất lượt.
// Hệ cỏ miễn độc, lửa miễn bỏng. Boss hoang nhận ½ sát thương trạng thái.
const data = makeData()

const run = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  run(state, { type: 'submitTurn', commands })

const skill = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})

const useItem = (slot: number, itemId: string, targetId: string): BattleCommand => ({
  slot,
  kind: 'item',
  itemId,
  targetId
})

const poisoned = (turnsLeft = 4): StatusInstance[] => [{ statusId: 'poison', turnsLeft }]

/** Quái ta hệ ghost (không miễn gì, strike không STAB), biết các skill gây trạng thái. */
const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['ghost'],
    skillIds: ['strike', 'idle', 'toxin', 'hypnosis'],
    ...overrides
  })

/** Quái địch chỉ đứng im (AI chỉ có skill idle), hệ normal. */
const passive = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, elementIds: ['normal'], skillIds: ['idle'], ...overrides })

const battle = (
  party: Monster[],
  enemies: Monster[],
  inventory: Record<string, number> = {},
  isBoss = false
): GameState => ({
  ...makeBattleState(party, enemies, { isBoss }),
  inventory: makeInventory(inventory)
})

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const enemy = (state: GameState, id = 'e1'): Monster =>
  defined(
    state.battle?.enemies.find((m) => m.id === id) ??
      state.battle?.captured.find((m) => m.id === id),
    `quái địch ${id}`
  )

const member = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id),
    `quái ${id}`
  )

describe('gây trạng thái bằng skill (applyStatus)', () => {
  it('dính trạng thái, cuối lượt mất 10% max HP và giảm thời hạn ngay lượt bị dính', () => {
    const after = turn(battle([ally('a')], [passive('e1')]), skill(0, 'toxin'))
    expect(eventsOf(after, 'statusApplied')).toEqual([
      { type: 'statusApplied', monsterId: 'e1', statusId: 'poison', turns: 4 }
    ])
    const [damage] = eventsOf(after, 'statusDamage')
    expect(damage.monsterId).toBe('e1')
    expect(damage.amount.toNumber()).toBe(5)
    expect(enemy(after).damageTaken.toNumber()).toBe(5)
    expect(enemy(after).statuses).toEqual(poisoned(3))
  })

  it('miễn nhiễm theo hệ (cỏ miễn độc) và theo trait: chỉ ghi log, không dính', () => {
    const grass = turn(
      battle([ally('a')], [passive('e1', { elementIds: ['grass'] })]),
      skill(0, 'toxin')
    )
    expect(eventsOf(grass, 'statusImmune')).toEqual([
      { type: 'statusImmune', monsterId: 'e1', statusId: 'poison' }
    ])
    expect(enemy(grass).statuses).toEqual([])
    const trait = turn(
      battle([ally('a')], [passive('e1', { traits: [{ id: 'immunity', level: 1 }] })]),
      skill(0, 'hypnosis')
    )
    expect(eventsOf(trait, 'statusImmune')).toHaveLength(1)
    expect(enemy(trait).statuses).toEqual([])
  })

  it('dính lại: làm mới thời hạn (lấy dài hơn), không cộng dồn sát thương', () => {
    const state = battle([ally('a')], [passive('e1', { statuses: poisoned(2) })])
    const after = turn(state, skill(0, 'toxin'))
    expect(eventsOf(after, 'statusApplied')[0].turns).toBe(4)
    expect(eventsOf(after, 'statusDamage')).toHaveLength(1)
    expect(enemy(after).statuses).toEqual(poisoned(3))
  })

  it('ngủ: thời hạn tung trong 1–3 lượt', () => {
    const after = turn(battle([ally('a')], [passive('e1')]), skill(0, 'hypnosis'))
    const [applied] = eventsOf(after, 'statusApplied')
    expect(applied.turns).toBeGreaterThanOrEqual(1)
    expect(applied.turns).toBeLessThanOrEqual(3)
  })

  it('nhiều trạng thái cùng lúc, mỗi trạng thái gây sát thương riêng', () => {
    const statuses = [...poisoned(2), { statusId: 'burn', turnsLeft: 2 }]
    const after = turn(battle([ally('a')], [passive('e1', { statuses })]), skill(0, 'idle'))
    expect(eventsOf(after, 'statusDamage').map((e) => [e.statusId, e.amount.toNumber()])).toEqual([
      ['poison', 5],
      ['burn', 4]
    ])
    expect(enemy(after).statuses).toEqual([...poisoned(1), { statusId: 'burn', turnsLeft: 1 }])
  })
})

describe('mất lượt (ngủ, tê liệt)', () => {
  const asleep = (turnsLeft: number): MonsterOverrides => ({
    statuses: [{ statusId: 'sleep', turnsLeft }]
  })

  it('ngủ chặn skill; hết hạn thì tự tỉnh (statusEnded)', () => {
    const state = battle([ally('a', asleep(2))], [passive('e1')])
    const first = turn(state, skill(0, 'strike'))
    expect(eventsOf(first, 'statusSkipTurn')).toEqual([
      { type: 'statusSkipTurn', monsterId: 'a', statusId: 'sleep' }
    ])
    expect(eventsOf(first, 'useSkill').map((e) => e.monsterId)).toEqual(['e1'])
    expect(enemy(first).damageTaken.toNumber()).toBe(0)
    expect(member(first, 'a').statuses).toEqual([{ statusId: 'sleep', turnsLeft: 1 }])

    const second = turn(first, skill(0, 'strike'))
    expect(eventsOf(second, 'statusSkipTurn')).toHaveLength(2)
    expect(eventsOf(second, 'statusEnded')).toEqual([
      { type: 'statusEnded', monsterId: 'a', statusId: 'sleep' }
    ])
    expect(member(second, 'a').statuses).toEqual([])
    const third = turn(second, skill(0, 'strike'))
    expect(enemy(third).damageTaken.toNumber()).toBe(7)
  })

  it('mất lượt không chặn dùng vật phẩm và đổi quái', () => {
    const state = battle(
      [ally('a', { ...asleep(3), damageTaken: 20 }), ally('b'), ally('c')],
      [passive('e1')],
      { potion: 1 }
    )
    const after = turn(state, useItem(0, 'potion', 'a'), {
      slot: 1,
      kind: 'switch',
      monsterId: 'c'
    })
    expect(eventsOf(after, 'statusSkipTurn')).toEqual([])
    expect(eventsOf(after, 'useItem')).toHaveLength(1)
    expect(after.battle?.playerSlots).toEqual(['a', 'c'])
  })

  it('tê liệt: mất lượt khoảng 25% số lần, tất định theo seed', () => {
    let skipped = 0
    const tries = 400
    for (let seed = 0; seed < tries; seed++) {
      const state = {
        ...battle(
          [ally('a', { statuses: [{ statusId: 'paralysis', turnsLeft: 3 }] })],
          [passive('e1')]
        ),
        rng: createRng(seed)
      }
      if (eventsOf(turn(state, skill(0, 'strike')), 'statusSkipTurn').length > 0) skipped++
    }
    expect(skipped / tries).toBeGreaterThan(0.18)
    expect(skipped / tries).toBeLessThan(0.32)
  })
})

describe('bỏng giảm sát thương vật lý', () => {
  it('skill vật lý × 0,5, skill đặc biệt giữ nguyên', () => {
    const burn = { statuses: [{ statusId: 'burn', turnsLeft: 3 }] }
    const hit = (overrides: MonsterOverrides, skillId: string): number => {
      const state = battle([ally('a', { skillIds: [skillId], ...overrides })], [passive('e1')])
      const [damage] = eventsOf(turn(state, skill(0, skillId)), 'damage')
      return damage.amount.toNumber()
    }
    expect(hit({}, 'strike')).toBe(7)
    expect(hit(burn, 'strike')).toBe(3)
    expect(hit(burn, 'blast')).toBe(hit({}, 'blast'))
  })
})

describe('cuối lượt', () => {
  it('sát thương trạng thái hạ gục: mất mọi trạng thái, thắng trận', () => {
    const state = battle(
      [ally('a')],
      [
        passive('e1', {
          damageTaken: 48,
          statuses: [...poisoned(), { statusId: 'sleep', turnsLeft: 2 }]
        })
      ]
    )
    const after = turn(state, skill(0, 'idle'))
    expect(eventsOf(after, 'statusDamage')[0].amount.toNumber()).toBe(2)
    expect(eventsOf(after, 'faint')).toEqual([{ type: 'faint', monsterId: 'e1' }])
    expect(enemy(after).statuses).toEqual([])
    expect(after.battle?.outcome).toBe('won')
  })

  it('gục vì sát thương skill cũng mất mọi trạng thái', () => {
    const state = battle([ally('a')], [passive('e1', { damageTaken: 45, statuses: poisoned() })])
    const after = turn(state, skill(0, 'strike'))
    expect(enemy(after).statuses).toEqual([])
    expect(eventsOf(after, 'statusDamage')).toEqual([])
  })

  it('boss hoang nhận ½ sát thương trạng thái (làm tròn lên); quái ta bình thường', () => {
    const state = battle(
      [ally('a', { statuses: poisoned() })],
      [passive('e1', { statuses: poisoned() })],
      {},
      true
    )
    const after = turn(state, skill(0, 'idle'))
    expect(enemy(after).damageTaken.toNumber()).toBe(3)
    expect(member(after, 'a').damageTaken.toNumber()).toBe(5)
  })

  it('tối thiểu 1 sát thương; max HP cực lớn vẫn đúng 10%', () => {
    const raw = makeRawData()
    raw.config.status.bossDamageMultiplier = 0
    const zeroBoss = createGameData(raw)
    const state = battle([ally('a')], [passive('e1', { statuses: poisoned() })], {}, true)
    const after = run(state, { type: 'submitTurn', commands: [skill(0, 'idle')] }, zeroBoss)
    expect(eventsOf(after, 'statusDamage')[0].amount.toNumber()).toBe(1)

    const hugeHp = {
      hp: toBig('1e300'),
      attack: 10,
      defense: 10,
      spAttack: 10,
      spDefense: 10,
      speed: 10
    }
    const huge = turn(
      battle([ally('a')], [passive('e1', { genes: hugeHp, statuses: poisoned() })]),
      skill(0, 'idle')
    )
    const amount = eventsOf(huge, 'statusDamage')[0].amount
    expect(amount.isFinite()).toBe(true)
    expect(amount.div('2e299').toNumber()).toBeCloseTo(1)
  })

  it('quái dự bị (không trên sân) không mất máu, không giảm thời hạn', () => {
    const state = battle(
      [ally('a'), ally('b'), ally('c', { statuses: poisoned() })],
      [passive('e1')]
    )
    const after = turn(state, skill(0, 'idle'), skill(1, 'idle'))
    expect(member(after, 'c').statuses).toEqual(poisoned(4))
    expect(member(after, 'c').damageTaken).toEqual(BIG_ZERO)
  })

  it('chạy trốn thất bại vẫn tính cuối lượt', () => {
    let state = battle([ally('a', { statuses: poisoned() })], [passive('e1')])
    // Tìm seed chạy trốn thất bại (fleeChance 75%).
    for (let seed = 0; ; seed++) {
      const fled = run({ ...state, rng: createRng(seed) }, { type: 'flee' })
      if (fled.battle?.outcome !== 'fled') {
        state = fled
        break
      }
    }
    expect(member(state, 'a').statuses).toEqual(poisoned(3))
  })

  it('bắt quái: giữ nguyên trạng thái', () => {
    const state = battle([ally('a')], [passive('e1', { statuses: poisoned(2) })], { masterBall: 1 })
    const after = turn(state, useItem(0, 'masterBall', 'e1'))
    expect(after.battle?.captured[0].statuses).toEqual(poisoned(2))
  })
})

describe('vật phẩm ném', () => {
  it('trúng: mất vật phẩm, gây trạng thái lên quái hoang', () => {
    const state = battle([ally('a')], [passive('e1')], { poisonBomb: 2 })
    const after = turn(state, useItem(0, 'poisonBomb', 'e1'))
    expect(eventsOf(after, 'throwItem')).toEqual([
      { type: 'throwItem', monsterId: 'a', itemId: 'poisonBomb', targetId: 'e1' }
    ])
    expect(after.inventory.stacks.poisonBomb).toBe(1)
    expect(enemy(after).statuses).toEqual(poisoned(3))
  })

  it('trượt hoặc miễn nhiễm: vẫn mất vật phẩm', () => {
    const miss = turn(
      battle([ally('a')], [passive('e1')], { dudBomb: 1 }),
      useItem(0, 'dudBomb', 'e1')
    )
    expect(miss.inventory.stacks.dudBomb).toBeUndefined()
    expect(enemy(miss).statuses).toEqual([])
    const immune = turn(
      battle([ally('a')], [passive('e1', { elementIds: ['grass'] })], { poisonBomb: 1 }),
      useItem(0, 'poisonBomb', 'e1')
    )
    expect(immune.inventory.stacks.poisonBomb).toBeUndefined()
    expect(eventsOf(immune, 'statusImmune')).toHaveLength(1)
  })

  it('mục tiêu đã bị bắt trước trong lượt: noTarget, không mất vật phẩm', () => {
    // b chậm hơn (trait slow) nên ném sau a.
    const slow = ally('b', { traits: [{ id: 'slow', level: 1 }] })
    const state = battle([ally('a'), slow], [passive('e1'), passive('e2')], {
      masterBall: 1,
      poisonBomb: 1
    })
    const after = turn(state, useItem(0, 'masterBall', 'e1'), useItem(1, 'poisonBomb', 'e1'))
    expect(after.inventory.stacks.poisonBomb).toBe(1)
    expect(eventsOf(after, 'noTarget')).toEqual([{ type: 'noTarget', monsterId: 'b' }])
  })

  it('báo lỗi khi nhắm quái ta, quái lạ hoặc quái hoang đã gục; state giữ nguyên', () => {
    const state = battle(
      [ally('a'), ally('b')],
      [passive('e1'), passive('e2', { damageTaken: 50 })],
      { poisonBomb: 1 }
    )
    for (const targetId of ['a', 'zz', 'e2']) {
      expectActionError(
        () => turn(state, useItem(0, 'poisonBomb', targetId), skill(1, 'idle')),
        'cannotThrowItem',
        { itemId: 'poisonBomb', targetId }
      )
    }
  })
})

describe('thuốc giải trong trận', () => {
  it('chữa trạng thái, ghi statusCured; thuốc chữa mọi trạng thái', () => {
    const statuses = [...poisoned(), { statusId: 'sleep', turnsLeft: 2 }]
    const state = battle([ally('a', { statuses })], [passive('e1')], { antidote: 1, fullHeal: 1 })
    const antidote = turn(state, useItem(0, 'antidote', 'a'))
    expect(eventsOf(antidote, 'statusCured')).toEqual([
      { type: 'statusCured', monsterId: 'a', statusId: 'poison' }
    ])
    expect(member(antidote, 'a').statuses).toEqual([{ statusId: 'sleep', turnsLeft: 1 }])
    const full = turn(state, useItem(0, 'fullHeal', 'a'))
    expect(member(full, 'a').statuses).toEqual([])
    expect(full.inventory.stacks.fullHeal).toBeUndefined()
  })

  it('không có trạng thái cần chữa: itemNoEffect, state giữ nguyên', () => {
    const state = battle(
      [ally('a', { statuses: [{ statusId: 'burn', turnsLeft: 1 }] })],
      [passive('e1')],
      { antidote: 1 }
    )
    expectActionError(() => turn(state, useItem(0, 'antidote', 'a')), 'itemNoEffect', {
      itemId: 'antidote',
      monsterId: 'a'
    })
  })
})

describe('AI chấm điểm applyStatus', () => {
  const handler = SKILL_EFFECTS.applyStatus
  const context = (target: Monster, targetIsAlly = false): SkillEffectAiContext => ({
    data,
    user: ally('a'),
    target,
    targetIsAlly,
    stages: {},
    expectedDamage: BIG_ZERO,
    field: makeField(),
    side: 'player',
    allies: [],
    foes: [target],
    allyReserves: [],
    foeReserves: []
  })

  it('địch chưa dính, không miễn: trọng số của trạng thái × chance%', () => {
    expect(handler.aiValue({ statusId: 'poison' }, context(passive('e1')))).toBeCloseTo(0.3)
    expect(handler.aiValue({ statusId: 'sleep', chance: 50 }, context(passive('e1')))).toBeCloseTo(
      0.175
    )
  })

  it('0 khi nhắm phe mình, đã dính hoặc miễn nhiễm', () => {
    expect(handler.aiValue({ statusId: 'poison' }, context(passive('e1'), true))).toBe(0)
    const already = passive('e1', { statuses: poisoned() })
    expect(handler.aiValue({ statusId: 'poison' }, context(already))).toBe(0)
    const grass = passive('e1', { elementIds: ['grass'] })
    expect(handler.aiValue({ statusId: 'poison' }, context(grass))).toBe(0)
  })
})
