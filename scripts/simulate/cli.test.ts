import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIOS, autoWorkers, parseCliArgs } from './cli'

describe('parseCliArgs', () => {
  it('không tham số: kịch bản mặc định, số worker tự chọn (null)', () => {
    expect(parseCliArgs([])).toEqual({
      scenarioPath: DEFAULT_SCENARIOS,
      workers: null,
      parts: null,
      teams: null
    })
  })

  it('đọc đường dẫn kịch bản và --workers ở mọi vị trí', () => {
    expect(parseCliArgs(['--workers', '4', 'a.json'])).toMatchObject({
      scenarioPath: 'a.json',
      workers: 4
    })
    expect(parseCliArgs(['a.json', '--workers=1']).workers).toBe(1)
  })

  it('báo lỗi: --workers không phải số nguyên ≥ 1, thừa tham số, tùy chọn lạ', () => {
    for (const value of ['0', '-2', '1.5', 'abc', '']) {
      expect(() => parseCliArgs([`--workers=${value}`])).toThrow('--workers')
    }
    expect(() => parseCliArgs(['a.json', 'b.json'])).toThrow('Cách dùng')
    expect(() => parseCliArgs(['--fast'])).toThrow()
  })
})

describe('--parts / --teams', () => {
  it('đọc danh sách cách nhau bằng dấu phẩy; phần theo thứ tự chuẩn; progressionSweep kéo theo progression', () => {
    expect(parseCliArgs(['--parts', 'lineage,sweep']).parts).toEqual(['sweep', 'lineage'])
    expect(parseCliArgs(['--parts=progressionSweep']).parts).toEqual([
      'progression',
      'progressionSweep'
    ])
    expect(parseCliArgs(['--teams', 'duo, full6']).teams).toEqual(['duo', 'full6'])
  })

  it('báo lỗi: phần lạ, danh sách rỗng', () => {
    expect(() => parseCliArgs(['--parts', 'sweep,nope'])).toThrow('nope')
    expect(() => parseCliArgs(['--parts', ','])).toThrow('--parts')
    expect(() => parseCliArgs(['--teams', ''])).toThrow('--teams')
  })
})

describe('autoWorkers', () => {
  it('ít việc: mỗi worker ít nhất 3 việc', () => {
    expect(autoWorkers(12, 14)).toBe(4)
    expect(autoWorkers(12, 3)).toBe(1)
  })

  it('nhiều việc: số luồng CPU − 1', () => {
    expect(autoWorkers(12, 95)).toBe(11)
    expect(autoWorkers(12, 1e9)).toBe(11)
  })

  it('biên: 0 việc, 1 luồng CPU, 0 luồng: tối thiểu 1', () => {
    expect(autoWorkers(12, 0)).toBe(1)
    expect(autoWorkers(1, 100)).toBe(1)
    expect(autoWorkers(0, 100)).toBe(1)
  })
})
