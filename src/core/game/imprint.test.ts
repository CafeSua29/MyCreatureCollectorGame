// Dưỡng dục qua action (docs/rules/imprinting.md): chỉ quái nở từ trứng, nhận yêu cầu khi thắng
// trận / nghỉ / cho ăn / vuốt ve, việc theo ngày, breed / fuse, MonsterView, kiểm tra save, migrate.

import { describe, expect, it } from 'vitest'
import { fuseMonsters } from '../progression'
import { buildMonsterView } from '../roster'
import { createRng } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { GameAction, GameState, Imprint, ImprintRequestTask, Monster } from '../model'
import { gameReducer } from './reducer'
import { createNewGame } from './newGame'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'

const data = makeData()

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const activeImprint = (
  task: ImprintRequestTask,
  done = false
): Extract<Imprint, { phase: 'active' }> => ({
  phase: 'active',
  completed: 0,
  total: 5,
  endDay: 10,
  request: { ...task, dueDay: 2, done }
})

const caring = (task: ImprintRequestTask, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ imprint: activeImprint(task), ...overrides })

const completedOf = (monster: Monster | undefined): number =>
  defined(monster).imprint?.completed ?? -1

const winBattle = (state: GameState): GameState =>
  run(state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
  })

describe('chỉ quái nở từ trứng', () => {
  it('trứng nở sau trận thắng: bắt đầu dưỡng dục, trận vừa thắng không tính cho quái mới nở', () => {
    const base = makeBattleState(
      [makeMonster({ id: 'a' })],
      [makeMonster({ id: 'e', damageTaken: 49 })]
    )
    const egg = makeMonster({ id: 'egg1', imprint: null })
    const won = winBattle({
      ...base,
      eggs: [{ id: 'egg1', monster: egg, battlesLeft: 1, infusions: [] }]
    })
    expect(defined(won.battle).outcome).toBe('won')
    const hatched = defined(won.party.find((m) => m.id === 'egg1'))
    expect(hatched.imprint).toMatchObject({ phase: 'active', completed: 0, total: 15 })
    expect(defined(hatched.history).milestones.map((m) => m.kind)).toEqual(['hatched'])
    expect(validateGameState(data, won)).toEqual([])
  })

  it('quái khởi đầu, quái breed còn trong trứng, quái hoang: chưa dưỡng dục', () => {
    const started = createNewGame(data, {
      seed: 99,
      starterSpeciesId: 'twig',
      gender: 'male',
      nickname: null
    })
    expect(started.party[0].imprint).toBeNull()
    const state: GameState = {
      ...makeGameState({
        seed: 3,
        party: [makeMonster({ id: 'f', gender: 'male' })],
        money: 1000,
        nextMonsterId: 50
      }),
      storage: [makeMonster({ id: 'm', gender: 'female' })]
    }
    const bred = run(state, { type: 'breed', fatherId: 'f', motherId: 'm' })
    expect(bred.eggs[0].monster.imprint).toBeNull()
  })

  it('fuse: quái gốc giữ dưỡng dục của mình, của quái phụ mất', () => {
    const base = makeMonster({ id: 'a', imprint: { phase: 'done', completed: 2, total: 4 } })
    const sub = makeMonster({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      imprint: { phase: 'done', completed: 4, total: 4 }
    })
    expect(fuseMonsters(data, createRng(1), base, sub)[0].imprint).toEqual(base.imprint)
    const plain = makeMonster({ id: 'c' })
    expect(fuseMonsters(data, createRng(1), plain, sub)[0].imprint).toBeNull()
  })
})

describe('nhận yêu cầu', () => {
  it('cùng chiến đấu: thắng trận khi ở trong đội (kể cả không ra sân), log imprintProgress', () => {
    const fighter = caring({ kind: 'battle' }, { id: 'a' })
    const bench = caring({ kind: 'battle' }, { id: 'b' })
    const base = makeBattleState([fighter], [makeMonster({ id: 'e', damageTaken: 49 })])
    const stored = caring({ kind: 'battle' }, { id: 's' })
    const won = winBattle({ ...base, party: [fighter, bench], storage: [stored] })
    expect(won.party.map(completedOf)).toEqual([1, 1])
    expect(completedOf(won.storage[0])).toBe(0)
    expect(defined(won.battle).log).toContainEqual({
      type: 'imprintProgress',
      monsterId: 'a',
      completed: 1,
      total: 5
    })
  })

  it('nghỉ: quái trong đội đòi nghỉ thì nghỉ được cả khi đầy máu', () => {
    const state = makeGameState({ seed: 1, party: [caring({ kind: 'rest' })], money: 100 })
    expect(completedOf(run(state, { type: 'rest' }).party[0])).toBe(1)
    expect(completedOf(run(state, { type: 'healParty' }).party[0])).toBe(1)
  })

  it('nghỉ: không ai đòi nghỉ (hoặc đã làm) và đầy máu thì vẫn partyFullHp', () => {
    for (const imprint of [activeImprint({ kind: 'pet' }), activeImprint({ kind: 'rest' }, true)]) {
      const state = makeGameState({ seed: 1, party: [makeMonster({ imprint })], money: 100 })
      expectActionError(() => run(state, { type: 'rest' }), 'partyFullHp')
      expectActionError(() => run(state, { type: 'healParty' }), 'partyFullHp')
    }
  })

  it('cho ăn: đúng món thì mất 1 món và xong, kể cả món không hiệu ứng / quái trong kho', () => {
    const fed = caring({ kind: 'feed', itemId: 'spiritFruit' }, { id: 's' })
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
      storage: [fed],
      inventory: makeInventory({ spiritFruit: 2 })
    }
    const after = run(state, { type: 'useItem', itemId: 'spiritFruit', monsterId: 's' })
    expect(completedOf(after.storage[0])).toBe(1)
    expect(after.inventory.stacks.spiritFruit).toBe(1)
    // Làm rồi thì món không hiệu ứng lại "không có tác dụng".
    expectActionError(
      () => run(after, { type: 'useItem', itemId: 'spiritFruit', monsterId: 's' }),
      'itemNoEffect'
    )
  })

  it('cho ăn: món có hiệu ứng (thuốc) lên quái đầy máu vẫn tính nếu đúng món đang đòi', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [caring({ kind: 'feed', itemId: 'potion' })] }),
      inventory: makeInventory({ potion: 1 })
    }
    const after = run(state, { type: 'useItem', itemId: 'potion', monsterId: 'm1' })
    expect(completedOf(after.party[0])).toBe(1)
    expect(after.inventory.stacks.potion ?? 0).toBe(0)
  })

  it('vuốt ve: đúng yêu cầu thì xong, miễn phí; sai thì imprintNotRequested, state giữ nguyên', () => {
    const state = makeGameState({
      seed: 1,
      party: [caring({ kind: 'pet' }), caring({ kind: 'rest' }, { id: 'b' })]
    })
    const petted = run(state, { type: 'petMonster', monsterId: 'm1' })
    expect(completedOf(petted.party[0])).toBe(1)
    expect(petted.money.eq(state.money)).toBe(true)
    expectActionError(
      () => run(petted, { type: 'petMonster', monsterId: 'm1' }),
      'imprintNotRequested',
      {
        monsterId: 'm1',
        kind: 'pet'
      }
    )
    expectActionError(
      () => run(state, { type: 'petMonster', monsterId: 'b' }),
      'imprintNotRequested'
    )
    expectActionError(() => run(state, { type: 'petMonster', monsterId: 'x' }), 'monsterNotOwned')
    const inBattle = makeBattleState([caring({ kind: 'pet' })], [makeMonster({ id: 'e' })])
    expectActionError(() => run(inBattle, { type: 'petMonster', monsterId: 'm1' }), 'inBattle')
  })
})

describe('việc theo ngày', () => {
  it('qua nửa đêm tới hạn: yêu cầu mới (log), quái trong kho cũng nhận', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a', damageTaken: 1 })], money: 100 }),
      storage: [caring({ kind: 'pet' }, { id: 's' })],
      time: 47
    }
    const rested = run(state, { type: 'rest' })
    const imprint = rested.storage[0].imprint
    expect(imprint?.phase === 'active' && imprint.request.dueDay).toBe(4)
    expect(rested.log).toContainEqual(
      expect.objectContaining({ type: 'imprintRequest', monsterId: 's' })
    )
  })

  it('hết thời gian: chốt buff, log imprintFinished', () => {
    const last: Imprint = { ...activeImprint({ kind: 'pet' }), endDay: 2 }
    const state: GameState = {
      ...makeGameState({
        seed: 1,
        party: [makeMonster({ imprint: last, damageTaken: 1 })],
        money: 100
      }),
      time: 47
    }
    const rested = run(state, { type: 'rest' })
    expect(rested.party[0].imprint).toEqual({ phase: 'done', completed: 0, total: 5 })
    expect(rested.log).toContainEqual({
      type: 'imprintFinished',
      monsterId: 'm1',
      percent: 0
    })
  })
})

describe('MonsterView, save, migrate', () => {
  const place = {
    location: 'party',
    index: 0,
    equipmentSlots: 3,
    scene: { party: [], place: null, aptitudeFloor: 1, time: 0 }
  } as const

  it('MonsterView: %, buff dự kiến, yêu cầu và hạn; đã xong thì không còn yêu cầu', () => {
    const active = makeMonster({ imprint: { ...activeImprint({ kind: 'pet' }), completed: 2 } })
    expect(buildMonsterView(data, active, place).imprint).toEqual({
      phase: 'active',
      percent: 40,
      statPercent: 6,
      request: { kind: 'pet', dueDay: 2, done: false },
      endDay: 10
    })
    const done = makeMonster({ imprint: { phase: 'done', completed: 5, total: 5 } })
    expect(buildMonsterView(data, done, place).imprint).toEqual({
      phase: 'done',
      percent: 100,
      statPercent: 15,
      request: null,
      endDay: null
    })
    expect(buildMonsterView(data, makeMonster(), place).imprint).toBeNull()
  })

  it('kiểm tra save: quái hoang và quái trong trứng phải null; mốc imprintPerfected hợp lệ', () => {
    const perfected = makeMonster({
      imprint: { phase: 'done', completed: 1, total: 1 },
      history: {
        origin: { kind: 'starter' },
        metDay: 0,
        metFloor: null,
        metLevel: 1,
        milestones: [{ day: 3, kind: 'imprintPerfected' }]
      }
    })
    expect(validateGameState(data, makeGameState({ seed: 1, party: [perfected] }))).toEqual([])
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const wild = {
      ...battle,
      battle: {
        ...defined(battle.battle),
        enemies: [{ ...defined(battle.battle).enemies[0], imprint: activeImprint({ kind: 'pet' }) }]
      }
    }
    expect(validateGameState(data, wild)).toContain(
      'battle.enemies[0].imprint: quái hoang chưa bắt phải là null'
    )
    const egg = makeMonster({ id: 'egg1', imprint: activeImprint({ kind: 'pet' }) })
    const withEgg = {
      ...makeGameState({ seed: 1, party: [makeMonster()] }),
      eggs: [{ id: 'egg1', monster: egg, battlesLeft: 1, infusions: [] }]
    }
    expect(validateGameState(data, withEgg)).toContain(
      'eggs[0].monster.imprint: quái chưa nở phải là null'
    )
  })

  it('migrate v28 → v29: mọi quái (kể cả trong trứng, quái hoang) imprint null, state hợp lệ', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const raw = serializeState({
      ...battle,
      eggs: [{ id: 'egg1', monster: makeMonster({ id: 'egg1' }), battlesLeft: 2, infusions: [] }]
    }) as Record<string, unknown>
    const strip = (m: Record<string, unknown>): Record<string, unknown> => {
      const { imprint: _imprint, ...rest } = m
      return rest
    }
    const rawBattle = raw.battle as Record<string, unknown>
    const v28 = {
      ...raw,
      version: 28,
      party: (raw.party as Record<string, unknown>[]).map(strip),
      eggs: (raw.eggs as Record<string, unknown>[]).map((e) => ({
        ...e,
        monster: strip(e.monster as Record<string, unknown>)
      })),
      battle: { ...rawBattle, enemies: (rawBattle.enemies as Record<string, unknown>[]).map(strip) }
    }
    const migrated = migrateState(v28, data)
    expect(migrated.party[0].imprint).toBeNull()
    expect(migrated.eggs[0].monster.imprint).toBeNull()
    expect(defined(migrated.battle).enemies[0].imprint).toBeNull()
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
