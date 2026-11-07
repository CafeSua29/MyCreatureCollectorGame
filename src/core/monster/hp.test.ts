// percentOfMaxHp: phép % max HP làm tròn lên dùng chung cho mọi hồi máu / mất máu theo % max HP.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { makeMonster, makeRawData } from '../testing'
import { toBig } from '../shared'
import { computeStats } from './stats'
import { getMaxHp, isFainted, percentOfMaxHp } from './hp'

describe('percentOfMaxHp', () => {
  it('làm tròn lên', () => {
    expect(percentOfMaxHp(toBig(50), 25).toNumber()).toBe(13)
    expect(percentOfMaxHp(toBig(50), 6.25).toNumber()).toBe(4)
    expect(percentOfMaxHp(toBig(40), 25).toNumber()).toBe(10)
  })

  it('biên: 0%, 100%, max HP 1', () => {
    expect(percentOfMaxHp(toBig(50), 0).toNumber()).toBe(0)
    expect(percentOfMaxHp(toBig(50), 100).toNumber()).toBe(50)
    expect(percentOfMaxHp(toBig(1), 1).toNumber()).toBe(1)
  })

  it('số cực lớn không ra NaN / Infinity', () => {
    const result = percentOfMaxHp(toBig('1e500'), 25)
    expect(result.isFinite()).toBe(true)
    expect(result.eq(toBig('2.5e499'))).toBe(true)
  })
})

describe('getMaxHp: bộ nhớ theo object quái', () => {
  const data = createGameData(makeRawData())
  const fresh = (monster: Parameters<typeof computeStats>[1]): string =>
    computeStats(data, monster).final.hp.toString()

  it('quái bị sửa tại chỗ (bản nháp trận) thì tính lại max HP', () => {
    const monster = makeMonster({ level: 10 })
    const before = getMaxHp(data, monster)
    monster.level = 20
    expect(getMaxHp(data, monster).gt(before)).toBe(true)
    expect(getMaxHp(data, monster).toString()).toBe(fresh(monster))
    monster.genes = { ...monster.genes, hp: monster.genes.hp.plus(1000) }
    expect(getMaxHp(data, monster).toString()).toBe(fresh(monster))
  })

  it('Decimal mới cùng giá trị vẫn dùng lại kết quả; số cực lớn không ra NaN / Infinity', () => {
    const monster = makeMonster({ level: 10 })
    const before = getMaxHp(data, monster)
    monster.genes = { ...monster.genes, hp: toBig(monster.genes.hp.toString()) }
    expect(getMaxHp(data, monster)).toBe(before)
    monster.genes = { ...monster.genes, hp: toBig('1e500') }
    const huge = getMaxHp(data, monster)
    expect(huge.isFinite()).toBe(true)
    expect(huge.toString()).toBe(fresh(monster))
  })

  it('biên: damageTaken không nằm trong chữ ký, gục đúng khi bằng max HP', () => {
    const monster = makeMonster({ level: 1 })
    const maxHp = getMaxHp(data, monster)
    monster.damageTaken = maxHp.minus(1)
    expect(isFainted(data, monster)).toBe(false)
    monster.damageTaken = maxHp
    expect(isFainted(data, monster)).toBe(true)
    expect(getMaxHp(data, monster)).toBe(maxHp)
  })
})
