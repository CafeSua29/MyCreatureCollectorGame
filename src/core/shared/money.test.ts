import { describe, expect, it } from 'vitest'
import { toBig } from './big'
import { expectActionError } from '../testing'
import { levelCost, spendMoney } from './money'

describe('levelCost', () => {
  it('giá mỗi level × tổng level, làm tròn lên', () => {
    expect(levelCost(10, 5).toNumber()).toBe(50)
    expect(levelCost(2.5, 3).toNumber()).toBe(8) // 7,5 → 8
    expect(levelCost(0, 100).toNumber()).toBe(0)
    expect(levelCost(1, 0).toNumber()).toBe(0)
  })
})

describe('spendMoney', () => {
  it('trừ tiền, không sửa object cũ; vừa đủ tiền thì về 0', () => {
    const holder = { money: toBig(100), other: 'x' }
    const paid = spendMoney(holder, toBig(30))
    expect(paid).toEqual({ money: toBig(70), other: 'x' })
    expect(holder.money.toNumber()).toBe(100)
    expect(spendMoney(holder, toBig(100)).money.isZero()).toBe(true)
  })

  it('thiếu tiền: ActionError notEnoughMoney kèm giá và số tiền đang có', () => {
    expectActionError(() => spendMoney({ money: toBig(29) }, toBig(30)), 'notEnoughMoney', {
      need: toBig(30),
      have: toBig(29)
    })
  })

  it('số cực lớn', () => {
    const paid = spendMoney({ money: toBig('1e1000') }, toBig('1e999'))
    expect(paid.money.eq(toBig('9e999'))).toBe(true)
  })
})
