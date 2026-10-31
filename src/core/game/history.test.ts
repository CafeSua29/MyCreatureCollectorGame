// Lý lịch quái qua các luồng thật (monster-history.md): nguồn gốc khi quái về tay người
// chơi, cột mốc của từng tính năng, kiểm tra save, migrate v24 → v25, MonsterView.

import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { validateGameState } from './validateGameState'
import { createSoul, getMaxHp } from '../monster'
import { createBossEgg, createLegacyEgg } from '../progression'
import { getMonsterView } from '../roster'
import { createRng, toBig } from '../shared'
import {
  defined,
  fixtureFloorBiomeIds,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeLegacyData,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { GameAction, GameState, Milestone, Monster, MonsterHistory } from '../model'

const data = makeData()
const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

/** Giờ 50 = ngày 2 (để phân biệt với ngày 0 mặc định). */
const TIME = 50
const DAY = 2

const withTime = (state: GameState): GameState => ({ ...state, time: TIME })

const historyOf = (monster: Monster | undefined): MonsterHistory =>
  defined(defined(monster, 'quái').history, 'lý lịch')

const milestonesOf = (monster: Monster | undefined): Milestone[] => historyOf(monster).milestones

const strike = { slot: 0, kind: 'skill', skillId: 'strike' } as const
const masterBall = (targetId: string) =>
  ({ slot: 0, kind: 'item', itemId: 'masterBall', targetId }) as const

/** Quái địch chỉ biết idle, còn `hpLeft` máu. */
function enemy(id: string, hpLeft: number, overrides: MonsterOverrides = {}): Monster {
  const base = makeMonster({ id, skillIds: ['idle'], ...overrides })
  return { ...base, damageTaken: getMaxHp(data, base).minus(hpLeft) }
}

describe('nguồn gốc', () => {
  it('quái hoang bắt được: wild + bóng, tầng và level lúc bắt', () => {
    const state = withTime({
      ...makeBattleState([makeMonster({ id: 'a' })], [enemy('e', 10, { level: 4, exp: 64 })], {
        floor: 1
      }),
      inventory: makeInventory({ masterBall: 1 })
    })
    const next = run(state, { type: 'submitTurn', commands: [masterBall('e')] })
    expect(historyOf(next.party.find((m) => m.id === 'e'))).toEqual({
      origin: { kind: 'wild', ballItemId: 'masterBall' },
      metDay: DAY,
      metFloor: 1,
      metLevel: 4,
      milestones: []
    })
    expect(validateGameState(data, run(next, { type: 'leaveBattle' }))).toEqual([])
  })

  it('boss bắt được: boss + bóng', () => {
    const state = withTime({
      ...makeBattleState([makeMonster({ id: 'a' })], [enemy('b', 10, { bossMultiplier: 3 })], {
        floor: 2,
        isBoss: true
      }),
      highestFloor: 3,
      floorBiomeIds: fixtureFloorBiomeIds(3),
      inventory: makeInventory({ masterBall: 1 })
    })
    const next = run(state, { type: 'submitTurn', commands: [masterBall('b')] })
    expect(historyOf(next.party.find((m) => m.id === 'b'))).toMatchObject({
      origin: { kind: 'boss', ballItemId: 'masterBall' },
      metFloor: 2
    })
  })

  it('trứng breed: loài gốc của bố mẹ, nhận ở thị trấn', () => {
    const state = withTime({
      ...makeGameState({
        seed: 3,
        party: [makeMonster({ id: 'f', gender: 'male' }), makeMonster({ id: 'm' })],
        money: toBig(1000),
        nextMonsterId: 50
      })
    })
    const next = run(state, { type: 'breed', fatherId: 'f', motherId: 'm' })
    expect(historyOf(next.eggs[0].monster)).toEqual({
      origin: { kind: 'egg', fatherSpeciesId: 'weakling', motherSpeciesId: 'weakling' },
      metDay: DAY,
      metFloor: null,
      metLevel: 1,
      milestones: []
    })
  })

  it('trứng boss và trứng truyền thừa', () => {
    const boss = makeMonster({ id: 'boss', speciesId: 'strongling', baseSpeciesId: 'strongling' })
    const options = { boss, id: 'm9', floor: 3, aging: false, day: DAY, tamerRealm: 0 }
    const [bossEgg] = createBossEgg(data, createRng(1), options)
    expect(historyOf(bossEgg.monster)).toMatchObject({
      origin: { kind: 'bossEgg', bossSpeciesId: 'strongling' },
      metDay: DAY,
      metFloor: 3,
      metLevel: 1
    })
    const soul = createSoul(data, boss, { aptitudeFloor: 1, day: DAY, cause: 'oldAge' })
    const [legacy] = createLegacyEgg(data, createRng(1), { soul, id: 'm9', day: DAY, aging: false })
    expect(historyOf(legacy.monster)).toMatchObject({
      origin: { kind: 'legacy', parentSpeciesId: 'strongling' },
      metFloor: null
    })
  })
})

describe('cột mốc', () => {
  it('trứng nở sau trận thắng: mốc hatched', () => {
    const egg = makeMonster({ id: 'x' })
    const state = withTime({
      ...makeBattleState([makeMonster({ id: 'a' })], [enemy('e', 1)]),
      eggs: [{ id: 'x', battlesLeft: 1, monster: egg }]
    })
    const next = run(state, { type: 'submitTurn', commands: [strike] })
    expect(milestonesOf(next.party.find((m) => m.id === 'x'))).toEqual([
      { day: DAY, kind: 'hatched' }
    ])
  })

  it('tự tiến hóa sau trận, chọn hướng tiến hóa, dùng đá: mốc evolved', () => {
    const grown = makeMonster({ id: 'a', level: 10, exp: 1000 })
    const won = run(withTime(makeBattleState([grown], [enemy('e', 1)])), {
      type: 'submitTurn',
      commands: [strike]
    })
    expect(milestonesOf(won.party[0])).toEqual([
      { day: DAY, kind: 'evolved', fromSpeciesId: 'weakling', toSpeciesId: 'strongling' }
    ])

    const twig = makeMonster({ id: 't', speciesId: 'twig', baseSpeciesId: 'twig', level: 5 })
    const town = withTime(makeGameState({ seed: 1, party: [{ ...twig, exp: toBig(125) }] }))
    const pending = { ...town, party: [{ ...town.party[0], pendingEvolutionIds: ['oak', 'pine'] }] }
    const chosen = run(pending, { type: 'chooseEvolution', monsterId: 't', speciesId: 'pine' })
    expect(milestonesOf(chosen.party[0])).toEqual([
      { day: DAY, kind: 'evolved', fromSpeciesId: 'twig', toSpeciesId: 'pine' }
    ])

    const stoned = run(
      { ...town, inventory: makeInventory({ fireStone: 1 }) },
      { type: 'useItem', itemId: 'fireStone', monsterId: 't' }
    )
    expect(milestonesOf(stoned.party[0])).toEqual([
      { day: DAY, kind: 'evolved', fromSpeciesId: 'twig', toSpeciesId: 'cinder' }
    ])
  })

  it('fuse thành công: mốc fused trên quái gốc (loài gốc của quái phụ)', () => {
    const state = withTime(
      makeGameState({
        seed: 1,
        party: [
          makeMonster({ id: 'a' }),
          makeMonster({ id: 'b', speciesId: 'twig', baseSpeciesId: 'twig' }),
          makeMonster({ id: 'c' })
        ],
        money: toBig(10_000)
      })
    )
    const next = run(state, { type: 'fuse', baseId: 'a', subId: 'b' })
    expect(milestonesOf(next.party[0])).toEqual([{ day: DAY, kind: 'fused', subSpeciesId: 'twig' }])
  })

  it('mở tầng: mốc floorBossDefeated cho quái đã tham chiến (kể cả đã gục), còn lại không', () => {
    const fighter = makeMonster({ id: 'a' })
    const fallen = makeMonster({ id: 'b', damageTaken: 1000 })
    const bench = makeMonster({ id: 'c' })
    const boss = enemy('boss', 1, {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      level: 4,
      exp: 64,
      bossMultiplier: 3
    })
    const battle = makeBattleState([fighter, fallen, bench], [boss], { floor: 2, isBoss: true })
    const state = withTime({
      ...battle,
      highestFloor: 2,
      floorBiomeIds: fixtureFloorBiomeIds(2),
      battle: { ...defined(battle.battle), participants: ['a', 'b'] }
    })
    const next = run(state, { type: 'submitTurn', commands: [strike] })
    expect(next.highestFloor).toBe(3)
    const expected = [{ day: DAY, kind: 'floorBossDefeated', floor: 2 }]
    expect(milestonesOf(next.party.find((m) => m.id === 'a'))).toEqual(expected)
    expect(milestonesOf(next.party.find((m) => m.id === 'b'))).toEqual(expected)
    expect(milestonesOf(next.party.find((m) => m.id === 'c'))).toEqual([])
  })
})

describe('kiểm tra save', () => {
  it('quái của người chơi thiếu lý lịch, quái hoang có lý lịch: báo lỗi', () => {
    const owned = makeGameState({ seed: 1, party: [makeMonster({ history: null })] })
    expect(validateGameState(data, owned)).toEqual([
      'party[0].history: quái của người chơi phải có lý lịch'
    ])
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const tagged = {
      ...battle,
      battle: {
        ...defined(battle.battle),
        enemies: [makeMonster({ id: 'e', contractRealm: null })]
      }
    }
    expect(validateGameState(data, tagged)).toEqual([
      'battle.enemies[0].history: quái hoang chưa bắt phải là null'
    ])
  })

  it('migrate v24 → v25: quái người chơi "unknown", quái hoang null, state hợp lệ', () => {
    const legacyData = makeLegacyData()
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const strip = ({ history: _history, ...rest }: Monster): Omit<Monster, 'history'> => rest
    const v24 = {
      ...battle,
      version: 24,
      party: battle.party.map(strip),
      eggs: [{ id: 'x', battlesLeft: 2, monster: strip(makeMonster({ id: 'x' })) }],
      battle: { ...defined(battle.battle), enemies: defined(battle.battle).enemies.map(strip) }
    }
    const migrated = migrateState(JSON.parse(JSON.stringify(v24)), legacyData)
    const unknown = {
      origin: { kind: 'unknown' },
      metDay: null,
      metFloor: null,
      metLevel: null,
      milestones: []
    }
    expect(migrated.party[0].history).toEqual(unknown)
    expect(migrated.eggs[0].monster.history).toEqual(unknown)
    expect(defined(migrated.battle).enemies[0].history).toBeNull()
    expect(validateGameState(legacyData, migrated)).toEqual([])
  })
})

describe('MonsterView', () => {
  it('có lý lịch đầy đủ (bản sao, không trỏ vào state)', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    const view = defined(getMonsterView(data, state, 'a'), 'view')
    expect(view.history).toEqual(state.party[0].history)
    expect(view.history).not.toBe(state.party[0].history)
  })
})
