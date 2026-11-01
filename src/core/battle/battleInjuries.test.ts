// Chấn thương trận theo vị trí ra đòn (docs/rules/dwelling.md mục "Bệnh và chấn thương",
// hit-locations.md): bộ phận trúng đòn hạ gục / bị phá chọn chấn thương, bộ phận bị phá gây chấn
// thương cả khi không gục, không có bộ phận thì chấn thương chung; hồi máu ở thị trấn chữa bệnh.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, validateGameState } from '../game'
import { rollAilmentOf } from '../progression'
import { createRng, toBig } from '../shared'
import type { GameData, GameState, RawGameData } from '../model'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import { emptyRecord } from './draft'

function makeInjuryData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.ailments.push(
    { id: 'bruise', weight: 1, causes: ['battle'], workPercent: 90, cureTier: 1 },
    {
      id: 'concussion',
      weight: 1,
      causes: ['battle'],
      workPercent: 60,
      statPercents: { spAttack: -20 },
      bodyParts: ['head'],
      cureTier: 2
    },
    {
      id: 'brokenWing',
      weight: 1,
      causes: ['battle'],
      workPercent: 60,
      bodyParts: ['wings'],
      cureTier: 2
    }
  )
  raw.config.dwelling = {
    ...raw.config.dwelling,
    needs: { ...raw.config.dwelling.needs, faintAilmentChance: 0, brokenPartAilmentChance: 100 }
  }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeInjuryData()

describe('chọn chấn thương theo bộ phận', () => {
  const roll = (parts: string[]): string | undefined =>
    rollAilmentOf(data, createRng(1), { cause: 'battle', chance: 100, parts })[0]?.id

  it('trúng đầu → chấn thương gắn với đầu; trúng chỗ không có chấn thương riêng / không rõ → chung', () => {
    expect(roll(['head'])).toBe('concussion')
    expect(roll(['wings'])).toBe('brokenWing')
    expect(roll(['tail'])).toBe('bruise')
    expect(roll([])).toBe('bruise')
  })
})

describe('chấn thương khi trận kết thúc', () => {
  const winWith = (gameData: GameData, brokenParts: string[]): GameState => {
    const base = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['strike'] })],
      [makeMonster({ id: 'e1', skillIds: ['idle'], damageTaken: toBig(45) })]
    )
    const battle = defined(base.battle)
    const state: GameState = {
      ...base,
      battle: { ...battle, records: { ...battle.records, a: { ...emptyRecord(), brokenParts } } }
    }
    return gameReducer(gameData, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
    })
  }

  it('bị phá bộ phận thì không gục cũng chấn thương đúng chỗ (brokenPartAilmentChance)', () => {
    const next = winWith(data, ['wings'])
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.party[0].ailment).toEqual({ id: 'brokenWing', restDays: 0 })
    expect(defined(next.battle).log).toContainEqual({
      type: 'ailmentGained',
      monsterId: 'a',
      ailmentId: 'brokenWing'
    })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('không gục, không bị phá bộ phận: không chấn thương, không tốn RNG', () => {
    expect(winWith(data, []).party[0].ailment).toBeNull()
  })
})

describe('hồi máu ở thị trấn', () => {
  it('chữa bệnh / chấn thương của cả đội; đội đầy máu mà còn bệnh vẫn hồi được', () => {
    const state = makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a', ailment: { id: 'concussion', restDays: 2 } })]
    })
    const healed = gameReducer(data, state, { type: 'healParty' })
    expect(healed.party[0].ailment).toBeNull()
    expectActionError(() => gameReducer(data, healed, { type: 'healParty' }), 'partyFullHp')
  })
})

describe('kiểm tra dữ liệu', () => {
  it('bodyParts lạ hoặc gắn cho bệnh không có nguồn trận báo lỗi', () => {
    expect(() =>
      makeInjuryData((raw) => {
        raw.ailments.push(
          {
            id: 'x',
            weight: 1,
            causes: ['battle'],
            workPercent: 1,
            bodyParts: ['fin'],
            cureTier: 1
          },
          { id: 'y', weight: 1, causes: ['work'], workPercent: 1, bodyParts: ['head'], cureTier: 1 }
        )
      })
    ).toThrow(/Bệnh "x": bodyParts phải là danh sách id bộ phận[\s\S]*Bệnh "y": bodyParts chỉ dùng/)
  })
})
