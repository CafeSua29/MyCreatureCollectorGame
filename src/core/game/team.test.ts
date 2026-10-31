// Phối hợp đội qua gameReducer và save (docs/rules/team.md): học / chọn trận pháp, kiểm tra save,
// migrate v30 → v31, trận đồ rơi từ boss tầng.

import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'
import { getItemCount } from '../inventory'
import { createGameData } from '../gameData'
import { getMaxHp } from '../monster'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeTeamData,
  makeTeamRawData,
  withFixtureText
} from '../testing'
import type { GameState } from '../model'

const data = makeTeamData()

const withScrolls = (stacks: Record<string, number>): GameState => ({
  ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
  inventory: makeInventory(stacks)
})

describe('learnFormation', () => {
  it('tiêu một trận đồ, thêm trận pháp vào known (theo thứ tự học)', () => {
    const state = withScrolls({ dualityScroll: 2, bruteGateScroll: 1 })
    const once = gameReducer(data, state, { type: 'learnFormation', itemId: 'dualityScroll' })
    expect(once.formations).toEqual({ known: ['duality'], active: null })
    expect(getItemCount(once.inventory, 'dualityScroll')).toBe(1)
    const twice = gameReducer(data, once, { type: 'learnFormation', itemId: 'bruteGateScroll' })
    expect(twice.formations.known).toEqual(['duality', 'bruteGate'])
    expect(getItemCount(twice.inventory, 'bruteGateScroll')).toBe(0)
  })

  it('lỗi: đã học, không có trận đồ, không phải trận đồ, item lạ, đang trong trận', () => {
    const state = withScrolls({ dualityScroll: 1, potion: 1 })
    const learned = gameReducer(data, state, { type: 'learnFormation', itemId: 'dualityScroll' })
    const again = { ...learned, inventory: makeInventory({ dualityScroll: 1 }) }
    expectActionError(
      () => gameReducer(data, again, { type: 'learnFormation', itemId: 'dualityScroll' }),
      'formationAlreadyKnown',
      { formationId: 'duality' }
    )
    expectActionError(
      () => gameReducer(data, state, { type: 'learnFormation', itemId: 'bruteGateScroll' }),
      'notEnoughItem'
    )
    expectActionError(
      () => gameReducer(data, state, { type: 'learnFormation', itemId: 'potion' }),
      'notFormationScroll'
    )
    expectActionError(
      () => gameReducer(data, state, { type: 'learnFormation', itemId: 'nope' }),
      'unknownItem'
    )
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expectActionError(
      () => gameReducer(data, battle, { type: 'learnFormation', itemId: 'dualityScroll' }),
      'inBattle'
    )
    expect(state.formations).toEqual({ known: [], active: null })
  })
})

describe('setFormation', () => {
  const known: GameState = {
    ...withScrolls({}),
    formations: { known: ['duality', 'bruteGate'], active: null }
  }

  it('chọn / đổi / bỏ trận pháp đã học, miễn phí', () => {
    const chosen = gameReducer(data, known, { type: 'setFormation', formationId: 'duality' })
    expect(chosen.formations.active).toBe('duality')
    expect(chosen.money).toEqual(known.money)
    const changed = gameReducer(data, chosen, { type: 'setFormation', formationId: 'bruteGate' })
    expect(changed.formations.active).toBe('bruteGate')
    const cleared = gameReducer(data, changed, { type: 'setFormation', formationId: null })
    expect(cleared.formations.active).toBeNull()
  })

  it('lỗi: chưa học, chọn đúng trận pháp đang dùng, bỏ khi đang không dùng, trong trận', () => {
    expectActionError(
      () => gameReducer(data, known, { type: 'setFormation', formationId: 'fireGrass' }),
      'formationNotKnown'
    )
    expectActionError(
      () => gameReducer(data, known, { type: 'setFormation', formationId: null }),
      'formationUnchanged'
    )
    const active = { ...known, formations: { ...known.formations, active: 'duality' } }
    expectActionError(
      () => gameReducer(data, active, { type: 'setFormation', formationId: 'duality' }),
      'formationUnchanged'
    )
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expectActionError(
      () => gameReducer(data, battle, { type: 'setFormation', formationId: null }),
      'inBattle'
    )
  })
})

describe('kiểm tra save', () => {
  const base = withScrolls({})

  it('hợp lệ: đã học và đang dùng', () => {
    const state = { ...base, formations: { known: ['duality'], active: 'duality' } }
    expect(validateGameState(data, state)).toEqual([])
  })

  it('lỗi: trận pháp lạ, bị lặp, active chưa học', () => {
    const issues = validateGameState(data, {
      ...base,
      formations: { known: ['nope', 'duality', 'duality'], active: 'bruteGate' }
    })
    expect(issues).toEqual([
      'formations.known: trận pháp không tồn tại "nope"',
      'formations.known bị lặp',
      'formations.active phải là null hoặc trận pháp đã học, nhận "bruteGate"'
    ])
  })

  it('battle.teamBonuses: id lạ, count chưa tới bậc, phe địch có cộng hưởng, lặp', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const issues = validateGameState(data, {
      ...battle,
      battle: {
        ...defined(battle.battle),
        teamBonuses: {
          player: [
            { kind: 'synergy', id: 'bruteKin', count: 1 },
            { kind: 'formation', id: 'nope' },
            { kind: 'formation', id: 'duality' },
            { kind: 'formation', id: 'duality' }
          ],
          enemy: [{ kind: 'synergy', id: 'bruteKin', count: 2 }]
        }
      }
    })
    expect(issues).toEqual([
      'battle.teamBonuses.player[0]: count 1 chưa tới bậc đầu của "bruteKin"',
      'battle.teamBonuses.player[1]: trận pháp không tồn tại "nope"',
      'battle.teamBonuses.player bị lặp',
      'battle.teamBonuses.enemy: quái hoang không có cộng hưởng'
    ])
  })
})

describe('migrate v30 → v31', () => {
  it('chưa học trận pháp nào; trận đang dở không có cộng hưởng; state hợp lệ', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const raw = serializeState(battle) as Record<string, unknown>
    const { formations: _formations, ...rest } = raw
    const { teamBonuses: _teamBonuses, ...rawBattle } = raw.battle as Record<string, unknown>
    const migrated = migrateState({ ...rest, version: 30, battle: rawBattle }, data)
    expect(migrated.formations).toEqual({ known: [], active: null })
    expect(defined(migrated.battle).teamBonuses).toEqual({ player: [], enemy: [] })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('trận đồ rơi từ boss tầng', () => {
  it('config.formations.floorBossDrops tung khi hạ boss tầng của map', () => {
    const raw = makeTeamRawData()
    raw.config.formations = { floorBossDrops: [{ itemId: 'dualityScroll', chance: 100 }] }
    const dropData = createGameData(withFixtureText(raw))
    const base = makeMonster({
      id: 'boss',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire'],
      skillIds: ['idle']
    })
    const boss = { ...base, history: null, damageTaken: getMaxHp(dropData, base).minus(1) }
    const state = makeBattleState([makeMonster({ id: 'a' })], [boss], { isBoss: true })
    const won = gameReducer(dropData, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
    })
    expect(defined(won.battle).outcome).toBe('won')
    expect(getItemCount(won.inventory, 'dualityScroll')).toBe(1)
  })
})
