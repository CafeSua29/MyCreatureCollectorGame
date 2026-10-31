// Tâm linh tương thông (docs/rules/tamer.md mục "Khế ước"): mức theo ngày khế ước + thân mật, % chỉ
// số, giảm linh lực kỹ năng ngự thú sư khi quái còn sống trên sân, việc theo ngày, save.

import { describe, expect, it } from 'vitest'
import { computeStats } from '../monster'
import { soulLinkTier } from '../registries'
import { soulLinkDailyTask } from '../tamer'
import { migrateState, validateGameState } from '../game'
import { cloneData } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster
} from '../testing'
import type { Monster, TamerSkill } from '../model'
import { tamerSkillManaCost } from './tamerSkills'

const data = makeData()
const linked = (
  contractDays: number,
  affinity: number,
  overrides: Partial<Monster> = {}
): Monster =>
  makeMonster({
    id: 'a',
    contractRealm: 0,
    contractDays,
    affinity,
    skillIds: ['strike'],
    ...overrides
  })

describe('mức tâm linh tương thông', () => {
  it('đủ cả số ngày và thân mật mới đạt; lấy mức cao nhất; chưa khế ước không có', () => {
    expect(soulLinkTier(data, linked(6, 255))).toBeNull()
    expect(soulLinkTier(data, linked(7, 99))).toBeNull()
    expect(soulLinkTier(data, linked(7, 100))?.id).toBe('attuned')
    expect(soulLinkTier(data, linked(30, 150))?.id).toBe('resonant')
    expect(soulLinkTier(data, linked(500, 160))?.id).toBe('resonant') // thiếu thân mật cho mức 3
    expect(soulLinkTier(data, linked(Number.MAX_SAFE_INTEGER, 255))?.id).toBe('oneMind')
    expect(soulLinkTier(data, { contractRealm: null, contractDays: 0, affinity: 255 })).toBeNull()
  })

  it('+ % mọi chỉ số của mức vào nguồn contract', () => {
    expect(computeStats(data, linked(0, 255)).percentBySource.contract.attack).toBe(0)
    expect(computeStats(data, linked(100, 255)).percentBySource.contract.attack).toBe(7)
  })
})

describe('giảm linh lực kỹ năng ngự thú sư', () => {
  const skill = { ...Object.values(data.tamerSkills)[0], manaCost: 30 } as TamerSkill
  const costWith = (monster: Monster): number => {
    const state = makeBattleState([monster], [makeMonster({ id: 'e1' })])
    const party = [{ ...state.party[0], ...monster }]
    return tamerSkillManaCost(
      data,
      { ...state, party, battle: defined(state.battle) },
      {
        side: 'player',
        skill
      }
    )
  }

  it('quái trên sân đạt mức: − manaCostReduction %, làm tròn lên; nhân với bản mệnh', () => {
    expect(costWith(linked(0, 0))).toBe(30)
    expect(costWith(linked(7, 100))).toBe(27)
    expect(costWith(linked(100, 255))).toBe(21)
    // Bản mệnh (× 50%) và mức 3 (− 30%): 30 × 0,5 × 0,7 = 10,5 → 11.
    expect(costWith(linked(100, 255, { bond: true }))).toBe(11)
  })
})

describe('việc theo ngày và save', () => {
  it('quái đã khế ước ở đội / kho +1 ngày; quái chưa khế ước giữ 0', () => {
    const state = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
      storage: [
        makeMonster({ id: 'b', contractDays: 3 }),
        makeMonster({ id: 'c', contractRealm: null })
      ]
    }
    const next = soulLinkDailyTask(data, state, [], 1)
    expect(next.party[0].contractDays).toBe(1)
    expect(next.storage.map((m) => m.contractDays)).toEqual([4, 0])
  })

  it('kiểm tra: âm, chưa khế ước mà có ngày; config mức sai', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    const bad = { ...state, party: [{ ...state.party[0], contractRealm: null, contractDays: 2 }] }
    expect(validateGameState(data, bad)).toContain(
      'party[0].contractDays: quái chưa khế ước phải là 0'
    )
    const negative = { ...state, party: [{ ...state.party[0], contractDays: -1 }] }
    expect(validateGameState(data, negative).some((i) => i.includes('contractDays'))).toBe(true)
    const issues = dataIssuesAfter((raw) => {
      raw.config.tamer.contract.soulLinkTiers = [
        { id: 'x', days: 10, minAffinity: 0, statPercent: 1, manaCostReduction: 10 },
        { id: 'x', days: 5, minAffinity: 0, statPercent: 1, manaCostReduction: 120 }
      ]
    })
    expect(issues).toEqual([
      'config.tamer.contract.soulLinkTiers[1].id phải là chuỗi không rỗng, không trùng',
      'config.tamer.contract.soulLinkTiers[1].days phải là số nguyên ≥ 11, nhận 5',
      expect.stringContaining('soulLinkTiers[1].manaCostReduction')
    ])
  })

  it('migrate v54 → v55: mọi quái contractDays 0', () => {
    const current = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    const strip = (m: Monster): Omit<Monster, 'contractDays'> => {
      const { contractDays: _days, ...rest } = m
      return rest
    }
    const old = JSON.parse(
      JSON.stringify({ ...cloneData(current), version: 54, party: current.party.map(strip) })
    )
    const migrated = migrateState(old, data)
    expect(migrated.party[0].contractDays).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
