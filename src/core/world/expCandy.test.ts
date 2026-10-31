// Kẹo EXP và Kẹo Hiếm (mục "Kẹo EXP và Kẹo Hiếm" ở world-items.md). Fixture levelPerFloor 2: level
// giữa tầng F = 2F − 1, nên hệ số kẹo theo tầng = (2F − 1)².

import { describe, expect, it } from 'vitest'
import { toBig } from '../shared'
import { gameReducer } from '../game'
import { expCandyScale, expForLevel } from '../monster'
import { floorLevelRange } from './floors'
import {
  agingMonster,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type { GameAction, GameState, Monster } from '../model'

const data = makeData()

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

/** State có quái `a` trong đội, túi kẹo, tầng cao nhất cho trước. */
function candyState(
  monster: Monster,
  {
    highestFloor = 1,
    stacks = { expCandyS: 5, rareCandy: 5 }
  }: { highestFloor?: number; stacks?: Record<string, number> } = {}
): GameState {
  return {
    ...makeGameState({ seed: 1, party: [monster] }),
    highestFloor,
    inventory: makeInventory(stacks)
  }
}

const useCandy = (itemId: string, count?: number): GameAction => ({
  type: 'useItem',
  itemId,
  monsterId: 'a',
  ...(count === undefined ? {} : { count })
})

const partyMonster = (state: GameState): Monster => defined(state.party[0], 'quái a')

describe('expCandyScale', () => {
  it('= (EXP quái hoang ở level giữa tầng) / (ở tầng 1), level giữa = trung điểm floorLevelRange', () => {
    for (const floor of [1, 2, 10, 777]) {
      const { min, max } = floorLevelRange(data, floor)
      const ratio = toBig((min + max) / 2)
        .div(1)
        .pow(2)
      expect(expCandyScale(data, floor)).toEqual(ratio)
    }
    expect(expCandyScale(data, 1)).toEqual(1)
    expect(expCandyScale(data, 3)).toEqual(25)
  })

  it('tầng cực cao vẫn chính xác (Decimal)', () => {
    const floor = Number.MAX_SAFE_INTEGER
    expect(expCandyScale(data, floor)).toEqual(toBig(2).times(floor).minus(1).pow(2))
  })
})

describe('Kẹo EXP', () => {
  const weakling = makeMonster({ id: 'a', level: 1, exp: 1, skillIds: ['strike', 'growl'] })

  it('tầng 1: + đúng EXP gốc, lên level, tự học skill, tăng maxLevelReached, trừ kẹo', () => {
    const next = run(candyState(weakling), useCandy('expCandyS'))
    const monster = partyMonster(next)
    // 1 + 800 = 801: level 9 (9³ = 729 ≤ 801 < 1000).
    expect(monster.exp).toEqual(801)
    expect(monster).toMatchObject({ level: 9, maxLevelReached: 9 })
    expect(monster.skillIds).toEqual(['strike', 'growl', 'blast', 'pumpUp'])
    expect(next.inventory.stacks.expCandyS).toBe(4)
  })

  it('nhân hệ số theo tầng cao nhất từng đạt', () => {
    const state = candyState(weakling, { highestFloor: 3 })
    const monster = partyMonster(run(state, useCandy('expCandyS')))
    expect(monster.exp).toEqual(1 + 800 * 25)
  })

  it('dùng nhiều cái một lần: EXP cộng dồn, lên nhiều level', () => {
    const next = run(candyState(weakling), useCandy('expCandyS', 3))
    expect(partyMonster(next).exp).toEqual(2401)
    expect(partyMonster(next).level).toBe(13)
    expect(next.inventory.stacks.expCandyS).toBe(2)
  })

  it('dùng hết đúng số đang có thì xóa chồng', () => {
    const next = run(candyState(weakling), useCandy('expCandyS', 5))
    expect(next.inventory.stacks.expCandyS).toBeUndefined()
  })

  it('tầng cực cao: EXP cực lớn vẫn đúng', () => {
    const floor = 1_000_000
    const monster = partyMonster(
      run(candyState(weakling, { highestFloor: floor }), useCandy('expCandyS'))
    )
    const expected = toBig(800).times(expCandyScale(data, floor)).plus(1)
    expect(monster.exp).toEqual(expected)
    expect(expForLevel(monster.level, 'mediumFast').lte(expected)).toBe(true)
    expect(expForLevel(monster.level + 1, 'mediumFast').gt(expected)).toBe(true)
  })

  it('không nhân % EXP (ấu niên cho +50% EXP trận đấu, kẹo vẫn cho đúng số)', () => {
    const young = agingMonster(data, 5, { id: 'a', level: 1, exp: 1 })
    const base = candyState(young)
    const state = { ...base, options: { ...base.options, lifespanEnabled: true } }
    expect(partyMonster(run(state, useCandy('expCandyS'))).exp).toEqual(801)
  })

  it('đủ 4 ô skill thì skill mới vào danh sách chờ học', () => {
    const full = makeMonster({
      id: 'a',
      level: 4,
      exp: 64,
      skillIds: ['strike', 'growl', 'wave', 'sap']
    })
    const monster = partyMonster(run(candyState(full), useCandy('expCandyS')))
    expect(monster.skillIds).toEqual(['strike', 'growl', 'wave', 'sap'])
    expect(monster.pendingSkillIds).toEqual(['blast', 'pumpUp'])
  })

  it('dùng được lên quái đã gục và quái trong kho', () => {
    const fainted = { ...weakling, damageTaken: toBig(1_000_000) }
    expect(partyMonster(run(candyState(fainted), useCandy('expCandyS'))).level).toBe(9)

    const state = { ...candyState(makeMonster({ id: 'b' })), storage: [weakling] }
    const next = run(state, useCandy('expCandyS'))
    expect(defined(next.storage[0], 'quái trong kho').level).toBe(9)
  })
})

describe('Kẹo Hiếm', () => {
  it('luôn +1 level, EXP lên đúng mức tối thiểu của level mới', () => {
    const monster = makeMonster({ id: 'a', level: 50, exp: expForLevel(50, 'mediumFast').plus(7) })
    const next = partyMonster(run(candyState(monster), useCandy('rareCandy')))
    expect(next.level).toBe(51)
    expect(next.exp).toEqual(expForLevel(51, 'mediumFast'))
    expect(next.maxLevelReached).toBe(51)
  })

  it('level cực cao vẫn +1; dùng nhiều cái lên đúng ngần ấy level', () => {
    const high = makeMonster({
      id: 'a',
      level: 1_000_000,
      exp: expForLevel(1_000_000, 'mediumFast')
    })
    expect(partyMonster(run(candyState(high), useCandy('rareCandy'))).level).toBe(1_000_001)
    const low = makeMonster({ id: 'a', level: 2, exp: 8 })
    expect(partyMonster(run(candyState(low), useCandy('rareCandy', 5))).level).toBe(7)
  })

  it('level đích vượt số nguyên an toàn: không có tác dụng, không mất kẹo', () => {
    const level = Number.MAX_SAFE_INTEGER
    const top = makeMonster({ id: 'a', level, exp: 1 })
    expectActionError(() => run(candyState(top), useCandy('rareCandy')), 'itemNoEffect')
  })
})

describe('tiến hóa ngay sau khi dùng kẹo', () => {
  it('một hướng: tiến hóa luôn', () => {
    const monster = makeMonster({ id: 'a', level: 9, exp: expForLevel(9, 'mediumFast') })
    const next = partyMonster(run(candyState(monster), useCandy('rareCandy')))
    expect(next).toMatchObject({ speciesId: 'strongling', level: 10 })
  })

  it('nhiều hướng: đặt danh sách chờ chọn', () => {
    const twig = makeMonster({
      id: 'a',
      speciesId: 'twig',
      baseSpeciesId: 'twig',
      level: 4,
      exp: 64
    })
    const next = partyMonster(run(candyState(twig), useCandy('rareCandy')))
    expect(next.speciesId).toBe('twig')
    expect(next.pendingEvolutionIds).toEqual(['oak', 'pine'])
  })

  it('không lên level thì không xét tiến hóa (quái đủ level chờ tiến hóa vẫn giữ nguyên)', () => {
    // Đủ level tiến hóa (10) nhưng chưa tiến hóa; +800 EXP không đủ lên level 21.
    const ready = makeMonster({ id: 'a', level: 20, exp: expForLevel(20, 'mediumFast') })
    const state = candyState(ready, { stacks: { expCandyS: 1 } })
    const next = partyMonster(run(state, useCandy('expCandyS')))
    expect(next.level).toBe(20)
    expect(next.speciesId).toBe('weakling')
  })
})

describe('lỗi khi dùng kẹo', () => {
  const monster = makeMonster({ id: 'a' })

  it('count > 1 với vật phẩm không cho dùng nhiều cái', () => {
    const state = candyState(monster, { stacks: { potion: 5 } })
    expectActionError(
      () => run(state, { type: 'useItem', itemId: 'potion', monsterId: 'a', count: 2 }),
      'itemCountNotAllowed',
      { itemId: 'potion' }
    )
  })

  it('không đủ kẹo, count sai dạng, quái không phải của ta, đang trong trận', () => {
    const state = candyState(monster)
    expectActionError(() => run(state, useCandy('expCandyS', 6)), 'notEnoughItem', {
      have: 5,
      need: 6
    })
    for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      expectActionError(() => run(state, useCandy('expCandyS', count)), 'malformedAction')
    }
    expectActionError(
      () => run(state, { type: 'useItem', itemId: 'rareCandy', monsterId: 'z' }),
      'monsterNotOwned'
    )
    const inBattle = makeBattleState([monster], [makeMonster({ id: 'e' })])
    expectActionError(() => run(inBattle, useCandy('rareCandy')), 'inBattle')
  })

  it('kẹo chỉ dùng ngoài trận', () => {
    const state = {
      ...makeBattleState([monster], [makeMonster({ id: 'e' })]),
      inventory: makeInventory({ rareCandy: 1 })
    }
    const command = { slot: 0, kind: 'item', itemId: 'rareCandy', targetId: 'a' } as const
    expectActionError(
      () => run(state, { type: 'submitTurn', commands: [command] }),
      'itemWrongContext',
      { context: 'battle' }
    )
  })
})
