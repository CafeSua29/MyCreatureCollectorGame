// Thưởng sưu tập trong trận (docs/rules/dex.md): phe người chơi + % mọi chỉ số theo số loài đã sở hữu.

import { describe, expect, it } from 'vitest'
import { defined, makeBattleState, makeData, makeMonster } from '../testing'
import type { DexState, GameState } from '../model'
import { battleStats } from './draft'
import { newDexState } from '../roster'

const data = makeData()
const many = (count: number): string[] => Array.from({ length: count }, (_, i) => `s${i}`)
const withDex = (state: GameState, dex: Partial<DexState>): GameState => ({
  ...state,
  dex: { ...newDexState(), ...dex }
})

describe('thưởng sưu tập trong trận', () => {
  it('trong trận chỉ phe người chơi được cộng', () => {
    const state = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e1' })])
    const boosted = withDex(state, { owned: many(200), seen: many(200) })
    const d = { ...boosted, battle: defined(boosted.battle) }
    const plain = { ...state, battle: defined(state.battle) }
    const ally = d.party[0]
    expect(
      battleStats(data, d, ally)
        .attack.div(battleStats(data, plain, ally).attack)
        .toNumber()
    ).toBeCloseTo(1.02)
    const enemy = d.battle.enemies[0]
    expect(battleStats(data, d, enemy).attack.eq(battleStats(data, plain, enemy).attack)).toBe(true)
  })
})
