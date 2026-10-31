import { describe, expect, it } from 'vitest'
import { ACTION_ERROR_MESSAGES } from './actionErrors'
import { toBig } from './big'
import { ActionError, malformedAction } from './errors'

describe('ActionError', () => {
  it('mang mã lỗi + tham số; message là câu debug tính từ tham số', () => {
    const error = new ActionError('floorLocked', { floor: 3, highestFloor: 2 })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ActionError')
    expect(error.code).toBe('floorLocked')
    expect(error.params).toEqual({ floor: 3, highestFloor: 2 })
    expect(error.message).toBe('Tầng 3 chưa mở (cao nhất: 2)')
  })

  it('mã không có tham số được bỏ trống tham số', () => {
    const error = new ActionError('inBattle')
    expect(error.params).toEqual({})
    expect(error.message).toBe(ACTION_ERROR_MESSAGES.inBattle({}))
  })

  it('malformedAction: một mã chung cho lệnh sai dạng, detail chỉ để debug', () => {
    const error = malformedAction('commands phải là danh sách')
    expect(error.code).toBe('malformedAction')
    expect(error.params).toEqual({ detail: 'commands phải là danh sách' })
  })

  it('tham số số cực lớn giữ nguyên Decimal, câu debug không ra Infinity / NaN', () => {
    const need = toBig('1e1000')
    const error = new ActionError('notEnoughMoney', { need, have: toBig(0) })
    expect(error.params.need.eq(need)).toBe(true)
    expect(error.message).toBe('Cần 1e+1000 tiền, có 0')
  })

  it('mọi mã có câu debug không rỗng', () => {
    for (const format of Object.values(ACTION_ERROR_MESSAGES)) {
      // Tham số giả đủ trường cho mọi mã (mỗi câu chỉ đọc trường của mình).
      const params = {
        detail: 'x',
        phase: 'a',
        expected: 'b',
        need: toBig(1),
        have: toBig(0),
        speciesIds: ['a']
      }
      expect(String((format as (p: typeof params) => string)(params)).length).toBeGreaterThan(0)
    }
  })
})
