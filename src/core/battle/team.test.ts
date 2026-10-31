// Cộng hưởng đội và trận pháp trong trận (docs/rules/team.md): tính lúc vào trận từ cả đội, chỉ phe
// người chơi, chỉ quái khớp trên sân, chỉ trong trận; nguồn % chỉ số riêng; miễn hạ bậc.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { computeStats } from '../monster'
import {
  atFloor,
  defined,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeTeamData
} from '../testing'
import type { GameState, Monster, TeamBonus } from '../model'
import { battleStats, monsterBattleContext, type Draft } from './draft'

const data = makeTeamData()

const brute = (id: string, extra: Partial<Monster> = {}): Monster =>
  makeMonster({ id, raceId: 'brute', ...extra })

function withFormation(state: GameState, formationId: string | null): GameState {
  return {
    ...state,
    formations: { known: formationId === null ? [] : [formationId], active: formationId }
  }
}

/** Trận giữa chừng với cộng hưởng / trận pháp cho trước của phe người chơi. */
function battleWith(party: Monster[], bonuses: TeamBonus[]): Draft {
  const state = makeBattleState(party, [makeMonster({ id: 'e', skillIds: ['idle'] })], {
    teamBonuses: { player: bonuses, enemy: [] }
  })
  return state as Draft
}

describe('vào trận', () => {
  it('phe người chơi nhận cộng hưởng / trận pháp tính từ cả đội (kể cả dự bị); quái hoang không', () => {
    const party = [brute('a'), makeMonster({ id: 'b' }), brute('c', { elementIds: ['fire'] })]
    const state = atFloor(withFormation(makeGameState({ seed: 5, party }), 'bruteGate'), 1)
    const battle = defined(gameReducer(data, state, { type: 'startWildBattle' }).battle)
    expect(battle.teamBonuses).toEqual({
      player: [
        { kind: 'synergy', id: 'bruteKin', count: 2 },
        { kind: 'formation', id: 'bruteGate' }
      ],
      enemy: []
    })
  })

  it('trận pháp không đủ yêu cầu: không có tác dụng, trận vẫn bắt đầu', () => {
    const state = atFloor(
      withFormation(makeGameState({ seed: 5, party: [makeMonster({ id: 'a' })] }), 'bruteGate'),
      1
    )
    const battle = defined(gameReducer(data, state, { type: 'startWildBattle' }).battle)
    expect(battle.teamBonuses.player).toEqual([])
  })
})

describe('áp lên chỉ số', () => {
  const party = [brute('a'), makeMonster({ id: 'b' })]
  const bonuses: TeamBonus[] = [{ kind: 'synergy', id: 'bruteKin', count: 3 }]

  it('quái khớp trên sân nhận % của bậc (nguồn synergy); quái không khớp không nhận', () => {
    const d = battleWith(party, bonuses)
    const [a, b] = d.party
    const outside = computeStats(data, a).final
    expect(battleStats(data, d, a).attack).toEqual(outside.attack.times(1.2))
    expect(battleStats(data, d, b).attack).toEqual(computeStats(data, b).final.attack)
  })

  it('% đi vào nguồn synergy / formation của percentBySource', () => {
    const d = battleWith(party, [...bonuses, { kind: 'formation', id: 'bruteGate' }])
    const a = d.party[0]
    const { percentBySource } = computeStats(data, a, {
      battle: defined(monsterBattleContext(data, d, a))
    })
    expect(percentBySource.synergy.attack).toBe(20)
    expect(percentBySource.formation.attack).toBe(50)
  })

  it('ngoài trận không có (MonsterView / chỉ số thường không đổi)', () => {
    const a = brute('a')
    expect(computeStats(data, a).percentBySource.synergy.attack).toBe(0)
  })
})

describe('trận pháp miễn hạ bậc', () => {
  it('fireGrass: địch dùng growl không hạ được công', () => {
    const party = [makeMonster({ id: 'a', elementIds: ['fire'] }), makeMonster({ id: 'b' })]
    const enemy = makeMonster({ id: 'e', skillIds: ['growl'] })
    const state = makeBattleState(party, [enemy], {
      teamBonuses: { player: [{ kind: 'formation', id: 'fireGrass' }], enemy: [] }
    })
    const next = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'defend' },
        { slot: 1, kind: 'defend' }
      ]
    })
    const battle = defined(next.battle)
    expect(battle.stages.a?.attack ?? 0).toBe(0)
    expect(battle.log.some((e) => e.type === 'stageBlockedByTrait')).toBe(true)
  })
})
