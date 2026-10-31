import { describe, expect, it } from 'vitest'
import { defined } from '@core/testing'
import { DEFAULT_SCENARIOS, MACHINE_SHARE, autoWorkers, parseCliArgs, planWorkers } from './cli'

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
    expect(autoWorkers(8, 14)).toBe(4)
    expect(autoWorkers(8, 3)).toBe(1)
  })

  it('nhiều việc: số luồng CPU được dùng', () => {
    expect(autoWorkers(8, 95)).toBe(8)
    expect(autoWorkers(8, 1e9)).toBe(8)
  })

  it('biên: 0 việc, 1 luồng, 0 luồng: tối thiểu 1', () => {
    expect(autoWorkers(8, 0)).toBe(1)
    expect(autoWorkers(1, 100)).toBe(1)
    expect(autoWorkers(0, 100)).toBe(1)
  })
})

describe('planWorkers', () => {
  const machine = { cpuThreads: 8, totalMemoryMb: 32_768, mainHeapLimitMb: 4096 }
  // 60% RAM trừ heap luồng chính và phần ngoài heap của nó.
  const budget = 32_768 * MACHINE_SHARE - 4096 - 256

  it('tự chọn: trần CPU, heap chia đều phần RAM còn lại; tổng không vượt 60% RAM', () => {
    const plan = planWorkers(machine, 1000, null)
    expect(plan.workers).toBe(8)
    expect(plan.workerHeapMb).toBe(Math.floor(budget / 8 - 256))
    const totalMb = 4096 + 256 + 8 * (defined(plan.workerHeapMb, 'heap') + 256)
    expect(totalMb).toBeLessThanOrEqual(32_768 * MACHINE_SHARE)
  })

  it('--workers N: lớn hơn trần CPU thì hạ xuống; nhỏ hơn thì giữ, heap mỗi worker lớn hơn', () => {
    expect(planWorkers(machine, 1000, 50).workers).toBe(8)
    const plan = planWorkers(machine, 1000, 2)
    expect(plan.workers).toBe(2)
    expect(plan.workerHeapMb).toBe(Math.floor(budget / 2 - 256))
  })

  it('RAM ít: bớt worker để mỗi worker có ít nhất 1 GB heap', () => {
    const small = { cpuThreads: 11, totalMemoryMb: 8192, mainHeapLimitMb: 2048 }
    // (8192 × 0,6 − 2048 − 256) / (1024 + 256) = 2,04 → 2 worker
    expect(planWorkers(small, 1000, null).workers).toBe(2)
  })

  it('biên: 1 worker / 1 việc / RAM không đủ: chạy luồng chính, không tạo worker', () => {
    expect(planWorkers(machine, 1000, 1)).toEqual({ workers: 1, workerHeapMb: null })
    expect(planWorkers(machine, 1, null)).toEqual({ workers: 1, workerHeapMb: null })
    const tiny = { cpuThreads: 8, totalMemoryMb: 2048, mainHeapLimitMb: 1024 }
    expect(planWorkers(tiny, 1000, 8)).toEqual({ workers: 1, workerHeapMb: null })
  })
})
