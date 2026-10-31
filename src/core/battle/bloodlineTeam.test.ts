// Phối hợp đội theo huyết mạch (docs/rules/bloodline.md, team.md): điều kiện quái bloodline có
// minPurity, yêu cầu trận pháp theo huyết mạch, cộng hưởng / trận pháp có tác dụng, hợp kích song
// huyết, trận đồ của nhóm rơi từ boss.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getItemCount } from '../inventory'
import { getMaxHp } from '../monster'
import { FORMATION_REQUIREMENTS, activeTeamBonuses, matchesMonsterCondition } from '../registries'
import {
  dataIssues,
  defined,
  makeBattleState,
  makeBloodlineData,
  makeBloodlineRawData,
  makeMonster
} from '../testing'
import type { BloodlinePurity, GameAction, GameData, Monster } from '../model'
import { comboBlocker } from './combos'

const data = makeBloodlineData()

const nymph = (id: string, bloodlines: BloodlinePurity[]): Monster =>
  makeMonster({
    id,
    speciesId: 'nymph',
    baseSpeciesId: 'nymph',
    elementIds: ['grass'],
    affinity: 200,
    bloodlines
  })
const wyrm = (id: string, purity: number): Monster => nymph(id, [{ groupId: 'wyrm', purity }])
const stone = (id: string, purity: number): Monster => nymph(id, [{ groupId: 'stone', purity }])

/** Kiểm tra một yêu cầu trận pháp với đội. */
const requirementMet = (requirement: Record<string, unknown>, team: Monster[]): boolean => {
  const handler = FORMATION_REQUIREMENTS[String(requirement.type)]
  return handler.isMet(handler.parse(requirement), team, data)
}

describe('điều kiện quái bloodline', () => {
  it('minPurity: huyết mạch chính phải đủ độ thuần', () => {
    const condition = { type: 'bloodline', groupId: 'wyrm', minPurity: 25 }
    expect(matchesMonsterCondition(data, condition, wyrm('a', 25))).toBe(true)
    expect(matchesMonsterCondition(data, condition, wyrm('a', 24.9))).toBe(false)
    // Bỏ trống minPurity: có huyết mạch chính của nhóm là đủ.
    expect(
      matchesMonsterCondition(data, { type: 'bloodline', groupId: 'wyrm' }, wyrm('a', 0.1))
    ).toBe(true)
  })

  it('kiểm tra dữ liệu minPurity', () => {
    const raw = makeBloodlineRawData()
    raw.synergies[0].match = { type: 'bloodline', groupId: 'wyrm', minPurity: 0 }
    expect(dataIssues(raw).join('\n')).toMatch(/minPurity phải trong \(0, 100\], nhận 0/)
  })
})

describe('yêu cầu trận pháp theo huyết mạch', () => {
  it('bloodline { groupId, count, minPurity }', () => {
    const requirement = { type: 'bloodline', groupId: 'wyrm', count: 2, minPurity: 30 }
    expect(requirementMet(requirement, [wyrm('a', 30), wyrm('b', 40)])).toBe(true)
    expect(requirementMet(requirement, [wyrm('a', 29), wyrm('b', 40)])).toBe(false)
    expect(requirementMet(requirement, [wyrm('a', 30), stone('b', 40)])).toBe(false)
  })

  it('bloodlines: đủ mọi nhóm; distinctBloodlines: số nhóm khác nhau', () => {
    const both = { type: 'bloodlines', groupIds: ['wyrm', 'stone'] }
    expect(requirementMet(both, [wyrm('a', 1), stone('b', 1)])).toBe(true)
    expect(requirementMet(both, [wyrm('a', 1), wyrm('b', 1)])).toBe(false)
    const distinct = { type: 'distinctBloodlines', count: 2 }
    expect(requirementMet(distinct, [wyrm('a', 1), stone('b', 1), nymph('c', [])])).toBe(true)
    expect(requirementMet(distinct, [wyrm('a', 1), nymph('c', [])])).toBe(false)
  })

  it('sameMainBloodline: một nhóm bất kỳ đủ số quái đủ độ thuần', () => {
    const pure = { type: 'sameMainBloodline', count: 2, minPurity: 75 }
    expect(requirementMet(pure, [stone('a', 75), stone('b', 80), wyrm('c', 99)])).toBe(true)
    expect(requirementMet(pure, [stone('a', 74), stone('b', 80), wyrm('c', 99)])).toBe(false)
  })
})

describe('cộng hưởng, trận pháp, hợp kích', () => {
  it('2 quái huyết mạch wyrm: cộng hưởng bloodlineWyrm và trận pháp wyrmClan có tác dụng', () => {
    const team = [wyrm('a', 10), wyrm('b', 10)]
    expect(activeTeamBonuses(data, team, 'wyrmClan')).toEqual([
      { kind: 'synergy', id: 'bloodlineWyrm', count: 2 },
      { kind: 'formation', id: 'wyrmClan' }
    ])
    expect(activeTeamBonuses(data, [wyrm('a', 10), stone('b', 10)], 'wyrmClan')).toEqual([])
  })

  it('hợp kích song huyết cần cả hai quái đủ 25%', () => {
    const state = makeBattleState([wyrm('a', 25), wyrm('b', 30)], [makeMonster({ id: 'e' })])
    const battle = defined(state.battle)
    const pair = (a: Monster, b: Monster): readonly [Monster, Monster] => [a, b]
    expect(
      comboBlocker(data, battle, {
        side: 'player',
        comboId: 'comboWyrm',
        pair: pair(wyrm('a', 25), wyrm('b', 30))
      })
    ).toBeNull()
    expect(
      comboBlocker(data, battle, {
        side: 'player',
        comboId: 'comboWyrm',
        pair: pair(wyrm('a', 20), wyrm('b', 30))
      })
    ).toBe('pairMismatch')
  })
})

describe('trận đồ của nhóm', () => {
  const strike: GameAction = {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
  }
  const hero = makeMonster({ id: 'a', level: 50, exp: 125000 })
  const boss = (gameData: GameData, speciesId: string): Monster => {
    const enemy = makeMonster({ id: 'e', speciesId, baseSpeciesId: speciesId, skillIds: ['idle'] })
    return { ...enemy, damageTaken: getMaxHp(gameData, enemy).minus(1) }
  }

  it('boss thuộc nhóm rơi theo scrollDropChance; loài tổ chắc chắn rơi', () => {
    const raw = makeBloodlineRawData()
    raw.config.bloodline.scrollDropChance = 100
    const always = createGameData(raw)
    const won = gameReducer(
      always,
      makeBattleState([hero], [boss(always, 'nymph')], { isBoss: true }),
      strike
    )
    expect(getItemCount(won.inventory, 'wyrmClanScroll')).toBe(1)
    const ancestor = gameReducer(
      data,
      makeBattleState([hero], [boss(data, 'elderWyrm')], { isBoss: true }),
      strike
    )
    expect(getItemCount(ancestor.inventory, 'wyrmClanScroll')).toBe(1)
  })

  it('scrollItemId phải là trận đồ', () => {
    const raw = makeBloodlineRawData()
    raw.bloodlines[0].scrollItemId = 'wyrmEssence'
    expect(dataIssues(raw)).toContain(
      'Huyết mạch "wyrm": scrollItemId "wyrmEssence" phải là trận đồ'
    )
  })
})
