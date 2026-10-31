import { describe, expect, it } from 'vitest'
import { memoInReadOnlyScope, runReadOnlyScope } from './readOnlyScope'

/** Đếm số lần tính thật của một hàm được nhớ trong phạm vi. */
function counted(table: object): { get: (keys: (object | undefined)[]) => number; calls: number } {
  const counter = {
    calls: 0,
    get: (keys: (object | undefined)[]): number =>
      memoInReadOnlyScope(table, keys, () => ++counter.calls)
  }
  return counter
}

describe('runReadOnlyScope / memoInReadOnlyScope', () => {
  it('ngoài phạm vi luôn tính lại', () => {
    const counter = counted({})
    const key = {}
    counter.get([key])
    counter.get([key])
    expect(counter.calls).toBe(2)
  })

  it('trong phạm vi nhớ theo dãy khóa (cả khóa undefined), khác khóa thì tính riêng', () => {
    const counter = counted({})
    const [a, b] = [{}, {}]
    runReadOnlyScope(() => {
      expect(counter.get([a, undefined])).toBe(1)
      expect(counter.get([a, undefined])).toBe(1)
      expect(counter.get([a, b])).toBe(2)
      expect(counter.get([b, a])).toBe(3)
      expect(counter.get([a])).toBe(4)
    })
    expect(counter.calls).toBe(4)
  })

  it('bảng khác nhau không dùng chung kết quả', () => {
    const [first, second] = [counted({}), counted({})]
    const key = {}
    runReadOnlyScope(() => {
      first.get([key])
      second.get([key])
    })
    expect([first.calls, second.calls]).toEqual([1, 1])
  })

  it('nhớ cả giá trị undefined; hết phạm vi thì quên', () => {
    const table = {}
    const key = {}
    let calls = 0
    const get = (): undefined => memoInReadOnlyScope(table, [key], () => void calls++)
    runReadOnlyScope(() => {
      get()
      get()
    })
    expect(calls).toBe(1)
    runReadOnlyScope(get)
    expect(calls).toBe(2)
  })

  it('phạm vi lồng nhau dùng chung bộ nhớ của phạm vi ngoài', () => {
    const counter = counted({})
    const key = {}
    runReadOnlyScope(() => {
      counter.get([key])
      runReadOnlyScope(() => counter.get([key]))
      counter.get([key])
    })
    expect(counter.calls).toBe(1)
  })

  it('tính lỗi thì không nhớ, lỗi ném ra ngoài và phạm vi vẫn đóng', () => {
    const table = {}
    const key = {}
    let calls = 0
    const failing = (): number =>
      memoInReadOnlyScope(table, [key], () => {
        calls++
        throw new Error('hỏng')
      })
    expect(() =>
      runReadOnlyScope(() => {
        expect(failing).toThrow('hỏng')
        failing()
      })
    ).toThrow('hỏng')
    expect(calls).toBe(2)
    // Đã đóng phạm vi: tính lại như thường.
    const counter = counted({})
    counter.get([key])
    counter.get([key])
    expect(counter.calls).toBe(2)
  })
})
