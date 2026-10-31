// Khế ước (docs/rules/tamer.md): cộng hưởng chỉ số, thọ nguyên theo cảnh giới khế ước, nâng khế ước
// mọi quái đang sở hữu (cả trứng), quái hoang không có.

import { describe, expect, it } from 'vitest'
import { computeStats, getMaxHp } from '../monster'
import { lifespanYears, monsterSpeciesRankOf, speciesRankIndex } from '../registries'
import { makeData, makeGameState, makeMonster, makeRawData } from '../testing'
import { createGameData } from '../gameData'
import {
  bindContract,
  contractChance,
  contractEscapeChance,
  contractedCount,
  disobeyChance,
  raiseOwnedContracts
} from './contract'

const data = makeData()

describe('cộng hưởng khế ước', () => {
  it('+3% mọi chỉ số mỗi cảnh giới khế ước, ở bước áp trait (HP 50 → 50 × 1,3 = 65)', () => {
    const monster = makeMonster({ contractRealm: 10 })
    const stats = computeStats(data, monster)
    expect(stats.percentBySource.contract).toEqual({
      hp: 30,
      attack: 30,
      defense: 30,
      spAttack: 30,
      spDefense: 30,
      speed: 30
    })
    expect(stats.final.hp.toNumber()).toBe(65)
    // Max HP (có cache) cũng đổi theo cảnh giới khế ước.
    expect(getMaxHp(data, monster).toNumber()).toBe(65)
    expect(getMaxHp(data, { ...monster, contractRealm: 0 }).toNumber()).toBe(50)
  })

  it('quái hoang (null) và cảnh giới 0 không có cộng hưởng', () => {
    expect(computeStats(data, makeMonster({ contractRealm: null })).final.hp.toNumber()).toBe(50)
    expect(computeStats(data, makeMonster({ contractRealm: 0 })).percentBySource.contract.hp).toBe(
      0
    )
  })

  it('cảnh giới cực lớn: chỉ số hữu hạn', () => {
    const huge = computeStats(data, makeMonster({ contractRealm: 1_000_000_000 }))
    expect(huge.final.attack.isFinite()).toBe(true)
  })

  it('thọ nguyên × (1 + 10% × cảnh giới khế ước)', () => {
    const base = lifespanYears(data, makeMonster({ contractRealm: 0 }))
    const contracted = lifespanYears(data, makeMonster({ contractRealm: 5 }))
    expect(contracted.div(base).toNumber()).toBeCloseTo(1.5)
  })
})

describe('bindContract / raiseOwnedContracts', () => {
  it('khế ước = max(đang có, cảnh giới); quái hoang null nhận cảnh giới', () => {
    expect(bindContract(makeMonster({ contractRealm: null }), 3).contractRealm).toBe(3)
    expect(bindContract(makeMonster({ contractRealm: 5 }), 3).contractRealm).toBe(5)
    const same = makeMonster({ contractRealm: 3 })
    expect(bindContract(same, 3)).toBe(same)
  })

  it('nâng đội, kho và quái trong trứng đã khế ước; quái chưa khế ước giữ nguyên', () => {
    const egg = { id: 'm9', monster: makeMonster({ id: 'm9' }), battlesLeft: 3 }
    const state = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
      storage: [makeMonster({ id: 'b' }), makeMonster({ id: 'c', contractRealm: null })],
      eggs: [egg]
    }
    const raised = raiseOwnedContracts(state, 2)
    expect(raised.party[0].contractRealm).toBe(2)
    expect(raised.storage[0].contractRealm).toBe(2)
    expect(raised.storage[1].contractRealm).toBeNull()
    expect(raised.eggs[0].monster.contractRealm).toBe(2)
    expect(contractedCount(raised)).toBe(3)
  })
})

describe('cộng hưởng gốc khi đã khế ước (baseStatPercent / baseLifespanPercent)', () => {
  const raw = makeRawData()
  raw.config.tamer.contract = {
    ...raw.config.tamer.contract,
    baseStatPercent: 5,
    baseLifespanPercent: 10
  }
  const based = createGameData(raw)

  it('đã khế ước cảnh giới 0: +5% chỉ số, thọ nguyên × 1,1; chưa khế ước: không có', () => {
    const contracted = computeStats(based, makeMonster({ contractRealm: 0 }))
    expect(contracted.percentBySource.contract.attack).toBe(5)
    expect(
      computeStats(based, makeMonster({ contractRealm: null })).percentBySource.contract.attack
    ).toBe(0)
    expect(
      computeStats(based, makeMonster({ contractRealm: 2 })).percentBySource.contract.attack
    ).toBe(11)
    const free = lifespanYears(based, makeMonster({ contractRealm: null }))
    const bound = lifespanYears(based, makeMonster({ contractRealm: 0 }))
    expect(bound.div(free).toNumber()).toBeCloseTo(1.1)
  })
})

describe('contractChance / contractEscapeChance', () => {
  const rankOf = (monster: ReturnType<typeof makeMonster>): number =>
    speciesRankIndex(data, monsterSpeciesRankOf(data, monster).id)

  it('base − levelPenalty × level / giới hạn − rankPenalty × bậc − bossPenalty + affinityBonus × thân mật / tối đa', () => {
    const monster = makeMonster({ level: 50, affinity: 0 })
    expect(contractChance(data, monster, 0)).toBeCloseTo(90 - 40 * 0.5 - 4 * rankOf(monster))
    const trusted = { ...monster, affinity: 255 }
    expect(contractChance(data, trusted, 0)).toBeCloseTo(90 - 20 - 4 * rankOf(monster) + 20)
    const boss = { ...monster, bossMultiplier: 3 }
    expect(contractChance(data, boss, 0)).toBeCloseTo(90 - 20 - 4 * rankOf(monster) - 15)
    // Cảnh giới cao hơn: giới hạn level cao hơn nên dễ hơn.
    expect(contractChance(data, monster, 4)).toBeGreaterThan(contractChance(data, monster, 0))
  })

  it('kẹp min 10 / max 100 (số cực lớn)', () => {
    const hard = makeMonster({ level: 100, affinity: 0, bossMultiplier: 1e12 })
    expect(contractChance(data, hard, 0)).toBeGreaterThanOrEqual(10)
    const easy = makeMonster({ level: 1, affinity: 255 })
    expect(contractChance(data, easy, 1_000_000)).toBeLessThanOrEqual(100)
  })

  it('bỏ trốn = escapeChance × (1 − thân mật / tối đa): 0 thân mật 20%, thân mật tối đa 0%', () => {
    expect(contractEscapeChance(data, makeMonster({ affinity: 0 }))).toBe(20)
    expect(contractEscapeChance(data, makeMonster({ affinity: 255 }))).toBe(0)
  })
})

describe('disobeyChance (quái chưa khế ước không nghe lệnh)', () => {
  const free = (
    overrides: Parameters<typeof makeMonster>[0] = {}
  ): ReturnType<typeof makeMonster> =>
    makeMonster({ contractRealm: null, affinity: 0, ...overrides })

  it('đã khế ước: 0', () => {
    expect(disobeyChance(data, makeMonster({ contractRealm: 0, level: 10_000 }), 0)).toBe(0)
  })

  it('trong giới hạn level: 1 + 5 × level / giới hạn (tối đa 6%)', () => {
    expect(disobeyChance(data, free({ level: 1 }), 0)).toBeCloseTo(1 + 5 * 0.01)
    expect(disobeyChance(data, free({ level: 50 }), 0)).toBeCloseTo(3.5)
    expect(disobeyChance(data, free({ level: 100 }), 0)).toBeCloseTo(6)
    // Cảnh giới cao hơn: giới hạn cao hơn nên ít hơn.
    expect(disobeyChance(data, free({ level: 100 }), 1)).toBeCloseTo(1 + 5 * 0.5)
  })

  it('vượt giới hạn: + 30 × phần vượt, kẹp 50 (số cực lớn)', () => {
    expect(disobeyChance(data, free({ level: 150 }), 0)).toBeCloseTo(6 + 15)
    expect(disobeyChance(data, free({ level: 1_000_000 }), 0)).toBe(50)
  })

  it('thân mật giảm tới 80%', () => {
    expect(disobeyChance(data, free({ level: 100, affinity: 255 }), 0)).toBeCloseTo(6 * 0.2)
  })
})
