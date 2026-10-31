// Hiệu ứng cấy ghép trong trận (docs/rules/implant.md): cấp dương dùng hooks × cấp, cấp âm dùng
// failHooks × |cấp| (hiệu ứng ngược), nguồn hook `implant`.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { defined, makeBattleState, makeData, makeMonster } from '../testing'
import type { BattleCommand, GameState, Monster } from '../model'

// Quái mẫu level 1: mọi chỉ số 50 (max HP 50). strike giữa hai quái mẫu gây 7 sát thương.
const data = makeData()

const strike: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
const idle: BattleCommand = { slot: 0, kind: 'skill', skillId: 'idle' }
const turn = (state: GameState, command: BattleCommand): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands: [command] })

const ally = (implantEffects: Record<string, number> = {}): Monster =>
  makeMonster({ id: 'a', skillIds: ['strike', 'idle'], implantEffects, damageTaken: 20 })
const foe = (implantEffects: Record<string, number> = {}): Monster =>
  makeMonster({ id: 'e', skillIds: ['idle'], implantEffects })

const damageOf = (state: GameState, id: string): number =>
  defined(
    state.party.find((m) => m.id === id) ?? state.battle?.enemies.find((m) => m.id === id)
  ).damageTaken.toNumber()

describe('hiệu ứng cấy trong trận', () => {
  it('Tái Sinh: hồi 1% max HP × cấp cuối lượt; cấp âm thì mất máu', () => {
    // 10 cấp = 10% của 50 = 5.
    expect(damageOf(turn(makeBattleState([ally({ regeneration: 10 })], [foe()]), idle), 'a')).toBe(
      15
    )
    expect(damageOf(turn(makeBattleState([ally({ regeneration: -10 })], [foe()]), idle), 'a')).toBe(
      25
    )
    expect(damageOf(turn(makeBattleState([ally()], [foe()]), idle), 'a')).toBe(20)
  })

  it('Cương Hóa: giảm sát thương nhận; hiệu ứng ngược tăng', () => {
    const hit = (effects: Record<string, number>): number =>
      damageOf(turn(makeBattleState([ally()], [foe(effects)]), strike), 'e')
    const plain = hit({})
    expect(hit({ hardening: 2 })).toBeLessThan(plain)
    expect(hit({ hardening: -2 })).toBeGreaterThan(plain)
  })
})
