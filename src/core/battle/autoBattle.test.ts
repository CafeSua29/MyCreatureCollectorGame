// Tự động đánh (docs/rules/auto-battle.md): chiến thuật đổi lựa chọn của AI, tùy chọn không biến hình
// / hợp kích, quái "theo lệnh", lý do dừng tự farm, tự nghỉ, đổi chiến thuật, kiểm tra / migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { BattleEvent, GameState, Monster, Tactic } from '../model'
import { suggestBattleCommands } from './ai'
import { manualMonsterOnField, nextAutoFarmStep, partyHpPercent } from './autoBattle'

const data = makeData()

const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'pumpUp'], ...overrides })

/** Tần suất skill AI chọn cho quái `a` qua nhiều seed. */
function picks(tactic: Tactic): Record<string, number> {
  const counts: Record<string, number> = {}
  for (let seed = 1; seed <= 40; seed++) {
    const state = {
      ...makeBattleState(
        [fighter('a', { tactic })],
        [makeMonster({ id: 'e', skillIds: ['idle'] })]
      ),
      rng: seed
    }
    const [command] = suggestBattleCommands(data, state)
    const key = command.kind === 'skill' ? command.skillId : command.kind
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

describe('chiến thuật', () => {
  it('toàn lực đánh nhiều hơn, thận trọng buff nhiều hơn (cùng seed)', () => {
    const allOut = picks('allOut')
    const cautious = picks('cautious')
    expect(allOut.strike ?? 0).toBeGreaterThan(cautious.strike ?? 0)
    expect(cautious.pumpUp ?? 0).toBeGreaterThan(allOut.pumpUp ?? 0)
  })

  it('balanced giữ nguyên AI chung (quái hoang luôn balanced)', () => {
    expect(picks('balanced')).toEqual(picks('balanced'))
  })

  it('tắt biến hình: lệnh không có transform', () => {
    const state = makeBattleState([fighter('a')], [makeMonster({ id: 'e', skillIds: ['idle'] })])
    for (const command of suggestBattleCommands(data, state, {
      transforms: false,
      combos: false
    })) {
      expect(command.kind === 'skill' ? command.transform : undefined).toBeUndefined()
    }
  })

  it('đổi chiến thuật (ngoài trận); chiến thuật lạ / trong trận báo lỗi', () => {
    const state = makeGameState({ seed: 1, party: [fighter('a')] })
    const next = gameReducer(data, state, { type: 'setTactic', monsterId: 'a', tactic: 'support' })
    expect(defined(next.party[0]).tactic).toBe('support')
    expectActionError(
      () => gameReducer(data, state, { type: 'setTactic', monsterId: 'a', tactic: 'x' as Tactic }),
      'malformedAction'
    )
    const battle = makeBattleState([fighter('a')], [makeMonster({ id: 'e' })])
    expectActionError(
      () => gameReducer(data, battle, { type: 'setTactic', monsterId: 'a', tactic: 'manual' }),
      'inBattle'
    )
  })

  it('quái "theo lệnh" trên sân', () => {
    const state = makeBattleState(
      [fighter('a'), fighter('b', { tactic: 'manual' })],
      [makeMonster({ id: 'e' })]
    )
    expect(manualMonsterOnField(state)).toBe('b')
    expect(manualMonsterOnField(makeGameState({ seed: 1, party: [fighter('a')] }))).toBeNull()
  })
})

describe('tự farm', () => {
  const settings = { minHpPercent: 50, autoRest: true }
  const endedWith = (log: BattleEvent[], party: Monster[] = [fighter('a')]): GameState => {
    const state = makeBattleState(party, [makeMonster({ id: 'e' })])
    return { ...state, battle: { ...defined(state.battle), phase: 'ended', outcome: 'won', log } }
  }

  it('dừng khi gặp shiny / boss, quái ta gục, trứng nở', () => {
    const reason = (log: BattleEvent[]): unknown => nextAutoFarmStep(data, endedWith(log), settings)
    expect(reason([{ type: 'shinyAppeared', monsterId: 'e' }])).toEqual({
      kind: 'stop',
      reason: 'shinyMet'
    })
    expect(reason([{ type: 'bossAppeared', monsterId: 'e' }])).toEqual({
      kind: 'stop',
      reason: 'bossMet'
    })
    expect(reason([{ type: 'faint', monsterId: 'a' }])).toEqual({
      kind: 'stop',
      reason: 'monsterFainted'
    })
    expect(reason([{ type: 'faint', monsterId: 'e' }])).toEqual({ kind: 'continue' })
    expect(reason([{ type: 'eggHatched', monsterId: 'x', destination: 'party' }])).toEqual({
      kind: 'stop',
      reason: 'eggHatched'
    })
  })

  it('dừng khi có quái chờ chọn, có quái theo lệnh', () => {
    const pending = makeGameState({
      seed: 1,
      party: [fighter('a', { pendingSkillIds: ['blast'] })]
    })
    expect(nextAutoFarmStep(data, pending, settings)).toEqual({
      kind: 'stop',
      reason: 'pendingChoice'
    })
    const manual = makeGameState({ seed: 1, party: [fighter('a', { tactic: 'manual' })] })
    expect(nextAutoFarmStep(data, manual, settings)).toEqual({
      kind: 'stop',
      reason: 'manualTactic'
    })
  })

  it('máu dưới ngưỡng: tự nghỉ nếu bật và đủ tiền, không thì dừng', () => {
    const hurtMonster = fighter('a')
    const hurt = fighter('a', { damageTaken: getMaxHp(data, hurtMonster).times(0.6).floor() })
    const state = { ...atFloor(makeGameState({ seed: 1, party: [hurt] }), 1), money: toBig(1e6) }
    expect(partyHpPercent(data, state)).toBeLessThan(50)
    expect(nextAutoFarmStep(data, state, settings)).toEqual({ kind: 'rest' })
    expect(nextAutoFarmStep(data, state, { ...settings, autoRest: false })).toEqual({
      kind: 'stop',
      reason: 'lowHp'
    })
    expect(nextAutoFarmStep(data, { ...state, money: toBig(0) }, settings)).toEqual({
      kind: 'stop',
      reason: 'cannotAffordRest'
    })
    expect(nextAutoFarmStep(data, state, { ...settings, minHpPercent: 0 })).toEqual({
      kind: 'continue'
    })
  })
})

describe('dữ liệu và save', () => {
  it('config sai: thiếu chiến thuật, trọng số âm', () => {
    const issues = dataIssuesAfter((raw) => {
      const { manual: _manual, ...rest } = raw.config.autoBattle.tactics
      raw.config.autoBattle = {
        tactics: {
          ...rest,
          allOut: { ...rest.allOut, damage: -1 }
        } as typeof raw.config.autoBattle.tactics
      }
    })
    const text = issues.join('\n')
    expect(text).toContain('config.autoBattle.tactics.manual')
    expect(text).toContain('config.autoBattle.tactics.allOut.damage')
  })

  it('quái có chiến thuật lạ báo lỗi; migrate v43 → v44: mọi quái balanced', () => {
    const bad = makeGameState({ seed: 1, party: [fighter('a', { tactic: 'x' as Tactic })] })
    expect(validateGameState(data, bad).join('\n')).toContain('tactic')
    const raw = serializeState(makeGameState({ seed: 1, party: [fighter('a')] })) as Record<
      string,
      unknown
    >
    const strip = (m: unknown): unknown => {
      const { tactic: _tactic, ...rest } = m as Record<string, unknown>
      return rest
    }
    const migrated = migrateState(
      { ...raw, version: 43, party: (raw.party as unknown[]).map(strip) },
      data
    )
    expect(defined(migrated.party[0]).tactic).toBe('balanced')
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
