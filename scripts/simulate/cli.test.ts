import { describe, expect, it } from 'vitest'
import { defined } from '@core/testing'
import { DEFAULT_SCENARIOS, autoWorkers, parseCliArgs, planWorkers } from './cli'

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

  it('nhiều việc: số luồng CPU của máy trừ luồng chính', () => {
    expect(autoWorkers(12, 95)).toBe(11)
    expect(autoWorkers(12, 1e9)).toBe(11)
  })

  it('biên: 0 việc, 1 luồng, 0 luồng: tối thiểu 1', () => {
    expect(autoWorkers(12, 0)).toBe(1)
    expect(autoWorkers(1, 100)).toBe(1)
    expect(autoWorkers(0, 100)).toBe(1)
  })
})

describe('planWorkers', () => {
  const machine = { cpuThreads: 12, totalMemoryMb: 32_768, mainHeapLimitMb: 4096 }
  // Toàn bộ RAM trừ heap luồng chính và phần ngoài heap của nó.
  const budget = 32_768 - 4096 - 256

  it('tự chọn: số luồng − 1, heap chia đều RAM còn lại; tổng không vượt RAM máy', () => {
    const plan = planWorkers(machine, 1000, null)
    expect(plan.workers).toBe(11)
    expect(plan.workerHeapMb).toBe(Math.floor(budget / 11 - 256))
    const totalMb = 4096 + 256 + 11 * (defined(plan.workerHeapMb, 'heap') + 256)
    expect(totalMb).toBeLessThanOrEqual(32_768)
  })

  it('--workers N: lớn hơn số luồng thì hạ xuống; nhỏ hơn thì giữ, heap mỗi worker lớn hơn', () => {
    expect(planWorkers(machine, 1000, 50).workers).toBe(12)
    const plan = planWorkers(machine, 1000, 2)
    expect(plan.workers).toBe(2)
    expect(plan.workerHeapMb).toBe(Math.floor(budget / 2 - 256))
  })

  it('RAM ít: bớt worker để mỗi worker có ít nhất 1 GB heap', () => {
    const small = { cpuThreads: 12, totalMemoryMb: 4096, mainHeapLimitMb: 1024 }
    // (4096 − 1024 − 256) / (1024 + 256) = 2,2 → 2 worker
    expect(planWorkers(small, 1000, null).workers).toBe(2)
  })

  it('biên: 1 worker / 1 việc / RAM không đủ: chạy luồng chính, không tạo worker', () => {
    expect(planWorkers(machine, 1000, 1)).toEqual({ workers: 1, workerHeapMb: null })
    expect(planWorkers(machine, 1, null)).toEqual({ workers: 1, workerHeapMb: null })
    const tiny = { cpuThreads: 8, totalMemoryMb: 2048, mainHeapLimitMb: 1024 }
    expect(planWorkers(tiny, 1000, 8)).toEqual({ workers: 1, workerHeapMb: null })
  })

  it('máy cực lớn: số worker theo số việc, heap hữu hạn', () => {
    const huge = { cpuThreads: 1024, totalMemoryMb: 1e9, mainHeapLimitMb: 4096 }
    const plan = planWorkers(huge, 30, null)
    expect(plan.workers).toBe(10)
    expect(Number.isFinite(defined(plan.workerHeapMb, 'heap'))).toBe(true)
  })
})
