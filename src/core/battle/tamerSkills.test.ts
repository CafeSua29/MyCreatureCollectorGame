// Kỹ năng ngự thú sư trong trận (docs/rules/tamer.md): ba loại mục tiêu, linh lực, hồi chiêu, số
// lần mỗi trận, lỗi lệnh, thứ tự lượt (trước vật phẩm / skill), không tác dụng thì không tốn, AI.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { getMaxHp } from '../monster'
import { suggestTamerCommand } from './tamerSkills'
import { toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleState,
  BattleTamer,
  GameState,
  Monster,
  TamerCommand
} from '../model'

const data = makeData()

const turn = (state: GameState, tamer?: TamerCommand, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, {
    type: 'submitTurn',
    commands: commands.length > 0 ? commands : idleAll(state),
    tamer
  })

/** Mọi quái ta trên sân còn sống dùng idle (không đổi máu, không đổi bậc). */
function idleAll(state: GameState): BattleCommand[] {
  const battle = defined(state.battle, 'trận')
  return battle.playerSlots.flatMap((id, slot) => {
    const monster = state.party.find((m) => m.id === id)
    return monster && monster.damageTaken.lt(getMaxHp(data, monster))
      ? [{ slot, kind: 'skill', skillId: 'idle' } as const]
      : []
  })
}

const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle', 'strike'], ...overrides })
const foe = (id: string): Monster => makeMonster({ id, skillIds: ['idle'] })

const playerTamer = (state: GameState): BattleTamer =>
  defined(defined(state.battle, 'trận').tamers.player, 'ngự thú sư')

function withTamer(state: GameState, tamer: Partial<BattleTamer>): GameState {
  const battle = defined(state.battle, 'trận')
  const tamers: BattleState['tamers'] = {
    ...battle.tamers,
    player: { ...playerTamer(state), ...tamer }
  }
  return { ...state, battle: { ...battle, tamers } }
}

const member = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id),
    `quái ${id}`
  )

describe('kỹ năng ngự thú sư: mục tiêu ally (hiệu ứng vật phẩm)', () => {
  it('hồi 25% max HP (50 → 13), trừ linh lực, đặt hồi chiêu, log, không chiếm lượt quái', () => {
    const state = makeBattleState([ally('a', { damageTaken: 30 }), ally('b')], [foe('e1')])
    const after = turn(state, { skillId: 'mend', targetId: 'a' })
    expect(member(after, 'a').damageTaken.toNumber()).toBe(17)
    // Linh lực 50 − 20; hồi chiêu 2 lượt còn lại sau cuối lượt dùng.
    expect(playerTamer(after)).toEqual({
      realm: 0,
      mana: 30,
      cooldowns: { mend: 2 },
      uses: { mend: 1 },
      skillIds: null
    })
    const log = defined(after.battle, 'trận').log
    expect(log).toContainEqual({
      type: 'tamerSkill',
      side: 'player',
      skillId: 'mend',
      targetId: 'a'
    })
    expect(log).toContainEqual({ type: 'heal', monsterId: 'a', amount: toBig(13) })
    // Quái a vẫn hành động bằng lệnh của nó trong cùng lượt.
    expect(log).toContainEqual({ type: 'useSkill', monsterId: 'a', skillId: 'idle' })
  })

  it('hồi chiêu: chặn đúng 2 lượt sau rồi dùng lại được', () => {
    let state = makeBattleState([ally('a', { damageTaken: 40 }), ally('b')], [foe('e1')])
    state = turn(state, { skillId: 'mend', targetId: 'a' })
    for (let i = 0; i < 2; i++) {
      expectActionError(
        () => turn(state, { skillId: 'mend', targetId: 'a' }),
        'tamerSkillUnavailable',
        {
          reason: 'onCooldown'
        }
      )
      state = turn(state)
    }
    expect(playerTamer(state).cooldowns).toEqual({})
    expect(
      member(turn(state, { skillId: 'mend', targetId: 'a' }), 'a').damageTaken.toNumber()
    ).toBe(14)
  })

  it('chữa trạng thái cả quái dự bị; không có trạng thái thì noEffect, state giữ nguyên', () => {
    const poisoned = ally('c', { statuses: [{ statusId: 'poison', turnsLeft: 3 }] })
    const state = makeBattleState([ally('a'), ally('b'), poisoned], [foe('e1')])
    const after = turn(state, { skillId: 'cleanse', targetId: 'c' })
    expect(member(after, 'c').statuses).toEqual([])
    expect(defined(after.battle, 'trận').log).toContainEqual({
      type: 'statusCured',
      monsterId: 'c',
      statusId: 'poison'
    })
    expectActionError(
      () => turn(state, { skillId: 'cleanse', targetId: 'a' }),
      'tamerSkillUnavailable',
      {
        skillId: 'cleanse',
        reason: 'noEffect'
      }
    )
  })

  it('hồi sinh quái dự bị đã gục, chỉ một lần mỗi trận', () => {
    const fainted = ally('c', { damageTaken: 50 })
    let state = makeBattleState(
      [ally('a'), ally('b'), fainted, ally('d', { damageTaken: 50 })],
      [foe('e1')]
    )
    state = turn(state, { skillId: 'recall', targetId: 'c' })
    // 25% của 50 = 12,5 → 13 máu.
    expect(member(state, 'c').damageTaken.toNumber()).toBe(37)
    expect(playerTamer(state).uses).toEqual({ recall: 1 })
    expectActionError(
      () => turn(state, { skillId: 'recall', targetId: 'd' }),
      'tamerSkillUnavailable',
      {
        reason: 'noUsesLeft'
      }
    )
  })

  it('mục tiêu không có trong đội: monsterNotInParty', () => {
    const state = makeBattleState([ally('a', { damageTaken: 10 })], [foe('e1')])
    expectActionError(() => turn(state, { skillId: 'mend', targetId: 'e1' }), 'monsterNotInParty')
  })
})

describe('kỹ năng ngự thú sư: mục tiêu allyOnField / field (hiệu ứng skill)', () => {
  it('allyOnField: +1 công cho quái ta trên sân (cần cảnh giới 1)', () => {
    const state = makeBattleState([ally('a'), ally('b')], [foe('e1')])
    expectActionError(
      () => turn(state, { skillId: 'cheer', targetId: 'a' }),
      'tamerSkillUnavailable',
      {
        reason: 'locked'
      }
    )
    const after = turn(withTamer(state, { realm: 1 }), { skillId: 'cheer', targetId: 'b' })
    expect(defined(after.battle, 'trận').stages.b).toEqual({ attack: 1 })
  })

  it('allyOnField: mục tiêu không trên sân là lệnh sai dạng', () => {
    const state = withTamer(makeBattleState([ally('a'), ally('b'), ally('c')], [foe('e1')]), {
      realm: 1
    })
    expectActionError(() => turn(state, { skillId: 'cheer', targetId: 'c' }), 'malformedAction')
  })

  it('field: −1 tốc độ cả phe địch trên sân; ghi targetId là lệnh sai dạng', () => {
    const state = makeBattleState([ally('a')], [foe('e1'), foe('e2')])
    const after = turn(state, { skillId: 'slowFoes' })
    const { stages } = defined(after.battle, 'trận')
    expect(stages.e1).toEqual({ speed: -1 })
    expect(stages.e2).toEqual({ speed: -1 })
    expect(stages.a).toBeUndefined()
    expectActionError(() => turn(state, { skillId: 'slowFoes', targetId: 'a' }), 'malformedAction')
  })

  it('kỹ năng chạy trước skill của quái: tốc độ địch đã giảm trước khi địch hành động', () => {
    const state = makeBattleState([ally('a')], [foe('e1')])
    const log = defined(turn(state, { skillId: 'slowFoes' }).battle, 'trận').log
    const tamerAt = log.findIndex((e) => e.type === 'tamerSkill')
    const firstSkillAt = log.findIndex((e) => e.type === 'useSkill')
    expect(tamerAt).toBeGreaterThanOrEqual(0)
    expect(tamerAt).toBeLessThan(firstSkillAt)
  })
})

describe('kỹ năng ngự thú sư: lỗi lệnh', () => {
  const state = makeBattleState([ally('a', { damageTaken: 30 })], [foe('e1')])

  it('thiếu linh lực, phe không có ngự thú sư: tamerSkillUnavailable, state giữ nguyên', () => {
    const poor = withTamer(state, { mana: 19 })
    expectActionError(
      () => turn(poor, { skillId: 'mend', targetId: 'a' }),
      'tamerSkillUnavailable',
      {
        reason: 'notEnoughMana'
      }
    )
    const battle = defined(state.battle, 'trận')
    const none = { ...state, battle: { ...battle, tamers: { player: null, enemy: null } } }
    expectActionError(
      () => turn(none, { skillId: 'mend', targetId: 'a' }),
      'tamerSkillUnavailable',
      {
        reason: 'noTamer'
      }
    )
  })

  it('đủ linh lực vừa khít (biên): dùng được, còn 0', () => {
    const exact = withTamer(state, { mana: 20 })
    expect(playerTamer(turn(exact, { skillId: 'mend', targetId: 'a' })).mana).toBe(0)
  })

  it('kỹ năng lạ, lệnh không phải object: malformedAction', () => {
    expectActionError(() => turn(state, { skillId: 'nope' }), 'malformedAction')
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'submitTurn',
          commands: idleAll(state),
          // Ép kiểu để giả lập renderer gửi sai dạng.
          tamer: 'mend' as unknown as TamerCommand
        }),
      'malformedAction'
    )
  })
})

describe('AI ngự thú sư (suggestTamerCommand)', () => {
  it('hồi quái mất nhiều máu; đội đầy máu và không có gì đáng dùng thì null', () => {
    const hurt = makeBattleState([ally('a', { damageTaken: 40 }), ally('b')], [foe('e1')])
    expect(suggestTamerCommand(data, hurt)).toEqual({ skillId: 'mend', targetId: 'a' })
    // Đầy máu: chỉ còn hạ tốc một địch (0,15 điểm mỗi bậc) < ngưỡng 0,2.
    const healthy = makeBattleState([ally('a'), ally('b')], [foe('e1')])
    expect(suggestTamerCommand(data, healthy)).toBeNull()
  })

  it('ưu tiên hồi sinh quái đã gục', () => {
    const state = makeBattleState(
      [ally('a', { damageTaken: 10 }), ally('b'), ally('c', { damageTaken: 50 })],
      [foe('e1')]
    )
    expect(suggestTamerCommand(data, state)).toEqual({ skillId: 'recall', targetId: 'c' })
  })

  it('lệnh gợi ý hợp lệ cho submitTurn, không đổi state', () => {
    const state = makeBattleState([ally('a', { damageTaken: 40 })], [foe('e1')])
    const command = defined(suggestTamerCommand(data, state), 'lệnh')
    expect(() => turn(state, command)).not.toThrow()
  })
})
