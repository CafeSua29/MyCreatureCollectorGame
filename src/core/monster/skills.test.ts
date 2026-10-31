import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { toBig } from '../shared'
import { gainExp } from './exp'
import { relearnCost, relearnableSkills } from './skills'
import { gameReducer } from '../game'
import {
  makeBattleState,
  makeData,
  makeMonster,
  expectActionError,
  makeGameState
} from '../testing'
import type { GameAction, GameState, Monster } from '../model'

// learnset weakling: strike 1, growl 1, blast 5, pumpUp 8, sap 12. Học lại: 10 × level.
const data = makeData()

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const full = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', skillIds: ['strike', 'growl', 'quick', 'idle'], ...overrides })

describe('danh sách chờ học khi đủ ô', () => {
  it('lên level với 4 skill: skill mới vào danh sách chờ, ghi canLearnSkill', () => {
    const result = gainExp(data, full({ level: 4, exp: toBig(64) }), toBig(61)) // → level 5
    expect(result.monster.skillIds).toEqual(['strike', 'growl', 'quick', 'idle'])
    expect(result.monster.pendingSkillIds).toEqual(['blast'])
    expect(result.events).toContainEqual({
      type: 'canLearnSkill',
      monsterId: 'a',
      skillId: 'blast'
    })
  })

  it('không thêm trùng skill đang chờ', () => {
    const monster = full({ level: 4, exp: toBig(64), pendingSkillIds: ['blast'] })
    expect(gainExp(data, monster, toBig(61)).monster.pendingSkillIds).toEqual(['blast'])
  })
})

describe('learnPendingSkill / skipPendingSkill', () => {
  const state = {
    ...makeGameState({
      seed: 1,
      party: [full({ level: 5, exp: toBig(125), pendingSkillIds: ['blast'] })]
    }),
    storage: [full({ id: 's', level: 5, exp: toBig(125), pendingSkillIds: ['blast'] })]
  }

  it('học skill chờ: quên một skill cũ, bỏ khỏi danh sách chờ', () => {
    const next = run(state, {
      type: 'learnPendingSkill',
      monsterId: 'a',
      skillId: 'blast',
      forgetSkillId: 'quick'
    })
    expect(next.party[0].skillIds).toEqual(['strike', 'growl', 'blast', 'idle'])
    expect(next.party[0].pendingSkillIds).toEqual([])
  })

  it('dùng được cho quái trong kho', () => {
    const next = run(state, { type: 'skipPendingSkill', monsterId: 's', skillId: 'blast' })
    expect(next.storage[0].pendingSkillIds).toEqual([])
  })

  it('bỏ qua: xóa khỏi danh sách chờ, skill không đổi', () => {
    const next = run(state, { type: 'skipPendingSkill', monsterId: 'a', skillId: 'blast' })
    expect(next.party[0].pendingSkillIds).toEqual([])
    expect(next.party[0].skillIds).toEqual(state.party[0].skillIds)
  })

  it('báo lỗi: đủ ô mà không chọn skill quên, quên skill không biết, skill không chờ', () => {
    expectActionError(
      () => run(state, { type: 'learnPendingSkill', monsterId: 'a', skillId: 'blast' }),
      'mustForgetSkill'
    )
    expectActionError(
      () =>
        run(state, {
          type: 'learnPendingSkill',
          monsterId: 'a',
          skillId: 'blast',
          forgetSkillId: 'sap'
        }),
      'skillNotKnown'
    )
    expectActionError(
      () => run(state, { type: 'skipPendingSkill', monsterId: 'a', skillId: 'sap' }),
      'skillNotPending'
    )
  })

  it('còn ô trống thì học thẳng, không được chỉ định skill quên', () => {
    const roomy = makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a', skillIds: ['strike'], pendingSkillIds: ['growl'] })]
    })
    const next = run(roomy, { type: 'learnPendingSkill', monsterId: 'a', skillId: 'growl' })
    expect(next.party[0].skillIds).toEqual(['strike', 'growl'])
    expectActionError(
      () =>
        run(roomy, {
          type: 'learnPendingSkill',
          monsterId: 'a',
          skillId: 'growl',
          forgetSkillId: 'strike'
        }),
      'skillSlotFree'
    )
  })
})

describe('relearnSkill (NPC ở thị trấn)', () => {
  const monster = full({ level: 8, exp: toBig(512) })
  const state = { ...makeGameState({ seed: 1, party: [monster] }), money: toBig(1000) }

  it('skill học lại được: learnset loài gốc ở level ≤ level hiện tại, chưa biết', () => {
    expect(relearnableSkills(data, monster)).toEqual(['blast', 'pumpUp'])
    expect(relearnCost(data, monster)).toEqual(80)
  })

  it('học lại tốn tiền, thay skill cũ', () => {
    const next = run(state, {
      type: 'relearnSkill',
      monsterId: 'a',
      skillId: 'pumpUp',
      forgetSkillId: 'idle'
    })
    expect(next.party[0].skillIds).toEqual(['strike', 'growl', 'quick', 'pumpUp'])
    expect(next.money).toEqual(920)
  })

  it('học lại skill đang chờ thì xóa khỏi danh sách chờ', () => {
    const pending = {
      ...state,
      party: [full({ level: 8, exp: toBig(512), pendingSkillIds: ['blast'] })]
    }
    const next = run(pending, {
      type: 'relearnSkill',
      monsterId: 'a',
      skillId: 'blast',
      forgetSkillId: 'idle'
    })
    expect(next.party[0].pendingSkillIds).toEqual([])
  })

  it('báo lỗi: ngoài thị trấn, skill chưa tới level, thiếu tiền, đang trong trận', () => {
    const action: GameAction = {
      type: 'relearnSkill',
      monsterId: 'a',
      skillId: 'pumpUp',
      forgetSkillId: 'idle'
    }
    expectActionError(
      () => run({ ...state, location: { type: 'floor', floor: 1 } }, action),
      'notInTown'
    )
    expectActionError(() => run({ ...state, ...{ money: toBig(79) } }, action), 'notEnoughMoney', {
      need: toBig(80)
    })
    expectActionError(() => run(state, { ...action, skillId: 'sap' }), 'cannotRelearnSkill')
    const inBattle = {
      ...makeBattleState([monster], [makeMonster({ id: 'e' })]),
      money: toBig(1000)
    }
    expectActionError(() => run(inBattle, action), 'inBattle')
  })
})
