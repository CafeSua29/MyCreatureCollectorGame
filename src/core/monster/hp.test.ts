// percentOfMaxHp: phép % max HP làm tròn lên dùng chung cho mọi hồi máu / mất máu theo % max HP.

import { describe, expect, it } from 'vitest'
import { toBig } from '../shared'
import { percentOfMaxHp } from './hp'

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
