// Quái chưa khế ước không nghe lệnh (docs/rules/tamer.md mục "Khế ước"): bỏ lượt skill, log
// `disobey`; quái đã khế ước, quái địch, hành động do AI chọn không xét.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { defined, makeBattleState, makeMonster, makeRawData } from '../testing'
import type { BattleEvent, GameData, GameState } from '../model'

/** Fixture với tỉ lệ không nghe lệnh cố định (base, không theo level / thân mật). */
function obedienceData(percent: number): GameData {
  const raw = makeRawData()
  raw.config.tamer.contract = {
    ...raw.config.tamer.contract,
    disobey: { base: percent, levelScale: 0, overLimitScale: 0, max: 100, affinityReduction: 0 }
  }
  return createGameData(raw)
}

const always = obedienceData(100)
const never = obedienceData(0)

const strike = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 } as const

const eventsOf = (state: GameState, type: BattleEvent['type']): BattleEvent[] =>
  defined(state.battle).log.filter((event) => event.type === type)

function battle(contractRealm: number | null): GameState {
  const ally = makeMonster({ id: 'a', skillIds: ['strike'] })
  const state = makeBattleState([ally], [makeMonster({ id: 'e1', skillIds: ['idle'] })])
  // makeBattleState khế ước đội: đặt lại khế ước của quái ta sau khi tạo.
  return { ...state, party: [{ ...state.party[0], contractRealm }] }
}

describe('không nghe lệnh', () => {
  it('chưa khế ước, tỉ lệ 100%: bỏ lượt skill, log disobey', () => {
    const after = gameReducer(always, battle(null), { type: 'submitTurn', commands: [strike] })
    expect(eventsOf(after, 'disobey')).toEqual([{ type: 'disobey', monsterId: 'a' }])
    const used = eventsOf(after, 'useSkill').filter((e) => 'monsterId' in e && e.monsterId === 'a')
    expect(used).toEqual([])
  })

  it('đã khế ước hoặc tỉ lệ 0: nghe lệnh, không tốn RNG', () => {
    const contracted = gameReducer(always, battle(0), { type: 'submitTurn', commands: [strike] })
    expect(eventsOf(contracted, 'disobey')).toEqual([])
    const zero = gameReducer(never, battle(null), { type: 'submitTurn', commands: [strike] })
    expect(eventsOf(zero, 'disobey')).toEqual([])
    const base = gameReducer(never, battle(0), { type: 'submitTurn', commands: [strike] })
    expect(zero.rng).toBe(base.rng)
  })

  it('cùng state cho cùng kết quả', () => {
    const data = obedienceData(50)
    const run = (): GameState =>
      gameReducer(data, battle(null), { type: 'submitTurn', commands: [strike] })
    expect(run()).toEqual(run())
  })
})
