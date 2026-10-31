import { describe, expect, it } from 'vitest'
import { makeData } from '../testing'
import { validateShop } from './validateShop'

const data = makeData()

describe('validateShop', () => {
  it('cửa hàng hợp lệ (kể cả rỗng, món không còn shop: true, tinh thể cấp > 1)', () => {
    expect(validateShop(data, { stock: [] })).toEqual([])
    const stock = [
      { storage: 'stack', itemId: 'potion' },
      { storage: 'stack', itemId: 'masterBall' },
      { storage: 'crystal', traitId: 'regen', level: 1 },
      { storage: 'crystal', traitId: 'regen', level: 2 }
    ]
    expect(validateShop(data, { stock })).toEqual([])
  })

  it('cấu trúc sai', () => {
    expect(validateShop(data, undefined)).toEqual(['shop không hợp lệ'])
    expect(validateShop(data, { stock: {} })).toEqual(['shop.stock phải là danh sách'])
  })

  it('định danh hỏng và món trùng, ghi đường dẫn', () => {
    const stock = [
      { storage: 'stack', itemId: 'nope' },
      { storage: 'crystal', traitId: 'shiny', level: 1 },
      { storage: 'crystal', traitId: 'fast', level: 0 },
      { storage: 'stack', itemId: 'potion' },
      { storage: 'stack', itemId: 'potion' },
      'potion'
    ]
    const issues = validateShop(data, { stock })
    expect(issues).toEqual([
      'shop.stock[0]: vật phẩm không tồn tại "nope"',
      'shop.stock[1]: trait loại "shiny" không có tinh thể',
      'shop.stock[2]: cấp tinh thể phải là số nguyên ≥ 1, nhận 0',
      'shop.stock[4]: trùng món',
      'shop.stock[5]: định danh item phải có storage "stack", "crystal", "book" hoặc "instance"'
    ])
  })
})
