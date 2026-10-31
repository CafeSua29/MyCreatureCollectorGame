// Phối hợp đội (docs/rules/team.md): điều kiện quái, yêu cầu trận pháp, cộng hưởng / trận pháp có
// tác dụng của một đội, hook lên từng quái.

import { describe, expect, it } from 'vitest'
import { getMaxHp } from '../monster'
import { makeMonster, makeTeamData } from '../testing'
import type { Monster } from '../model'
import {
  activeTeamBonuses,
  isFormationMet,
  matchesMonsterCondition,
  synergyTierOf,
  teamBonusHooks
} from './teamBonuses'

const data = makeTeamData()

const brute = (id: string, elementIds = ['grass']): Monster =>
  makeMonster({ id, raceId: 'brute', elementIds })
const neutral = (id: string, elementIds = ['grass']): Monster =>
  makeMonster({ id, raceId: 'neutral', elementIds })
const fainted = (monster: Monster): Monster => ({
  ...monster,
  damageTaken: getMaxHp(data, monster)
})

describe('điều kiện trên một quái', () => {
  it('element / race / species', () => {
    const monster = brute('a', ['fire', 'grass'])
    expect(matchesMonsterCondition(data, { type: 'element', elementId: 'grass' }, monster)).toBe(
      true
    )
    expect(matchesMonsterCondition(data, { type: 'element', elementId: 'water' }, monster)).toBe(
      false
    )
    expect(matchesMonsterCondition(data, { type: 'race', raceId: 'brute' }, monster)).toBe(true)
    expect(matchesMonsterCondition(data, { type: 'race', raceId: 'neutral' }, monster)).toBe(false)
    expect(
      matchesMonsterCondition(data, { type: 'species', speciesIds: ['weakling'] }, monster)
    ).toBe(true)
    expect(matchesMonsterCondition(data, { type: 'species', speciesIds: ['oak'] }, monster)).toBe(
      false
    )
  })
})

describe('bậc cộng hưởng', () => {
  const kin = data.synergies.bruteKin
  it('chưa tới bậc đầu thì null; bậc cao nhất đủ điều kiện thắng; vượt bậc cuối giữ bậc cuối', () => {
    expect(synergyTierOf(kin, 0)).toBeNull()
    expect(synergyTierOf(kin, 1)).toBeNull()
    expect(synergyTierOf(kin, 2)?.count).toBe(2)
    expect(synergyTierOf(kin, 3)?.count).toBe(3)
    expect(synergyTierOf(kin, Number.MAX_SAFE_INTEGER)?.count).toBe(3)
  })
})

describe('yêu cầu trận pháp', () => {
  it('distinctElements: đếm hệ khác nhau của cả đội (quái hai hệ đếm cả hai)', () => {
    expect(isFormationMet(data, 'duality', [neutral('a')])).toBe(false)
    expect(isFormationMet(data, 'duality', [neutral('a'), neutral('b')])).toBe(false)
    expect(isFormationMet(data, 'duality', [neutral('a', ['fire', 'grass'])])).toBe(true)
  })

  it('race: đủ số quái của race đó, kể cả quái gục', () => {
    expect(isFormationMet(data, 'bruteGate', [brute('a'), neutral('b')])).toBe(false)
    expect(isFormationMet(data, 'bruteGate', [brute('a'), fainted(brute('b'))])).toBe(true)
  })

  it('elements: đội có đủ mọi hệ liệt kê', () => {
    expect(isFormationMet(data, 'fireGrass', [neutral('a', ['fire'])])).toBe(false)
    expect(isFormationMet(data, 'fireGrass', [neutral('a', ['fire']), neutral('b')])).toBe(true)
  })
})

describe('activeTeamBonuses', () => {
  it('đếm cả quái gục; chỉ cộng hưởng đã tới bậc đầu; trận pháp đủ yêu cầu', () => {
    const team = [brute('a', ['fire']), fainted(brute('b', ['fire'])), neutral('c')]
    expect(activeTeamBonuses(data, team, 'bruteGate')).toEqual([
      { kind: 'synergy', id: 'bruteKin', count: 2 },
      { kind: 'synergy', id: 'fireAttuned', count: 2 },
      { kind: 'formation', id: 'bruteGate' }
    ])
  })

  it('trận pháp không đủ yêu cầu thì không có tác dụng; null = không dùng', () => {
    const team = [neutral('a')]
    expect(activeTeamBonuses(data, team, 'duality')).toEqual([])
    expect(activeTeamBonuses(data, team, null)).toEqual([])
  })

  it('đội rỗng: không có gì', () => {
    expect(activeTeamBonuses(data, [], 'duality')).toEqual([])
  })
})

describe('teamBonusHooks', () => {
  const bonuses = activeTeamBonuses(data, [brute('a'), brute('b'), brute('c')], 'bruteGate')

  it('quái khớp nhận hook của bậc theo số đếm và trận pháp khớp `match`', () => {
    expect(teamBonusHooks(data, brute('a'), bonuses)).toEqual([
      { kind: 'synergy', id: 'bruteKin', hooks: data.synergies.bruteKin.tiers[1].hooks, scale: 1 },
      { kind: 'formation', id: 'bruteGate', hooks: data.formations.bruteGate.hooks, scale: 1 }
    ])
  })

  it('quái không khớp không nhận (trận pháp có match, cộng hưởng khác race)', () => {
    expect(teamBonusHooks(data, neutral('x'), bonuses)).toEqual([])
  })

  it('trận pháp không có match: mọi quái nhận', () => {
    const duality = activeTeamBonuses(data, [neutral('a', ['fire', 'grass'])], 'duality')
    expect(teamBonusHooks(data, neutral('x'), duality)).toEqual([
      { kind: 'formation', id: 'duality', hooks: data.formations.duality.hooks, scale: 1 }
    ])
  })
})
