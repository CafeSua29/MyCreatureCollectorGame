import { describe, expect, it } from 'vitest'
import { addMilestone, startHistory, validateHistory } from './history'
import { validateMonster } from './validateMonster'
import { createGameData } from '../gameData'
import { defined, makeData, makeMonster, makeRawData } from '../testing'
import type { HistoryOrigin, Milestone, MonsterHistory } from '../model'

const data = makeData()

const wild = makeMonster({ id: 'w', history: null })

const history = (overrides: Partial<MonsterHistory> = {}): MonsterHistory => ({
  origin: { kind: 'starter' },
  metDay: 0,
  metFloor: null,
  metLevel: 1,
  milestones: [],
  ...overrides
})

const hatched = (day: number): Milestone => ({ day, kind: 'hatched' })

describe('startHistory', () => {
  it('gắn nguồn gốc và lúc gặp, chưa có mốc; thay lý lịch cũ', () => {
    const origin: HistoryOrigin = { kind: 'wild', ballItemId: 'ball' }
    const monster = startHistory(wild, origin, { day: 3, floor: 2, level: 7 })
    expect(monster.history).toEqual({
      origin,
      metDay: 3,
      metFloor: 2,
      metLevel: 7,
      milestones: []
    })
    expect(wild.history).toBeNull() // không sửa quái cũ
    const restarted = startHistory(
      addMilestone(data, monster, hatched(4)),
      { kind: 'starter' },
      { day: 0, floor: null, level: 1 }
    )
    expect(defined(restarted.history, 'lý lịch').milestones).toEqual([])
  })
})

describe('addMilestone', () => {
  it('thêm vào cuối, cũ trước mới', () => {
    const monster = addMilestone(data, addMilestone(data, makeMonster(), hatched(1)), {
      day: 2,
      kind: 'floorBossDefeated',
      floor: 1
    })
    expect(defined(monster.history, 'lý lịch').milestones).toEqual([
      hatched(1),
      { day: 2, kind: 'floorBossDefeated', floor: 1 }
    ])
  })

  it('quái hoang chưa có lý lịch: giữ nguyên', () => {
    expect(addMilestone(data, wild, hatched(1))).toBe(wild)
  })

  it('giới hạn maxMilestones: 49 → 50 giữ hết, 50 → 51 bỏ mốc cũ nhất', () => {
    const filled = (count: number): ReturnType<typeof makeMonster> =>
      makeMonster({
        history: history({ milestones: Array.from({ length: count }, (_, i) => hatched(i)) })
      })
    const at50 = defined(addMilestone(data, filled(49), hatched(49)).history, 'lý lịch')
    expect(at50.milestones).toHaveLength(50)
    expect(at50.milestones[0]).toEqual(hatched(0))
    const at51 = defined(addMilestone(data, filled(50), hatched(50)).history, 'lý lịch')
    expect(at51.milestones).toHaveLength(50)
    expect(at51.milestones[0]).toEqual(hatched(1))
    expect(at51.milestones[49]).toEqual(hatched(50))
  })

  it('giới hạn 1: chỉ giữ mốc mới nhất', () => {
    const raw = makeRawData()
    raw.config.history = { maxMilestones: 1 }
    const tiny = createGameData(raw)
    const monster = addMilestone(tiny, addMilestone(tiny, makeMonster(), hatched(1)), hatched(2))
    expect(defined(monster.history, 'lý lịch').milestones).toEqual([hatched(2)])
  })
})

describe('validateHistory', () => {
  const check = (value: unknown): string[] => validateHistory(data, value, 'h')

  it('hợp lệ: null, mọi nguồn gốc đã làm, mốc đã làm, ngày cực lớn', () => {
    expect(check(null)).toEqual([])
    const origins: HistoryOrigin[] = [
      { kind: 'starter' },
      { kind: 'wild', ballItemId: 'ball' },
      { kind: 'boss', ballItemId: 'masterBall' },
      { kind: 'egg', fatherSpeciesId: 'weakling', motherSpeciesId: 'twig' },
      { kind: 'bossEgg', bossSpeciesId: 'strongling' },
      { kind: 'legacy', parentSpeciesId: 'weakling' },
      { kind: 'unknown' }
    ]
    for (const origin of origins) expect(check(history({ origin }))).toEqual([])
    const day = Number.MAX_SAFE_INTEGER
    const milestones: Milestone[] = [
      hatched(day),
      { day, kind: 'evolved', fromSpeciesId: 'twig', toSpeciesId: 'oak' },
      { day, kind: 'fused', subSpeciesId: 'twig' },
      { day, kind: 'fuseFailed', subSpeciesId: 'twig' },
      { day, kind: 'floorBossDefeated', floor: Number.MAX_SAFE_INTEGER }
    ]
    expect(check(history({ metDay: day, metFloor: 3, metLevel: day, milestones }))).toEqual([])
    // Save cũ: cả ba trường gặp null.
    expect(check(history({ origin: { kind: 'unknown' }, metDay: null, metLevel: null }))).toEqual(
      []
    )
    expect(validateMonster(data, makeMonster())).toEqual([])
  })

  it('báo lỗi nguồn gốc: kind lạ, bóng / loài sai, thiếu hoặc thừa trường', () => {
    const issuesOf = (origin: unknown): string[] =>
      check({ ...history(), origin } as unknown as MonsterHistory)
    expect(issuesOf({ kind: 'gacha' })).toEqual(['h.origin.kind không hợp lệ "gacha"'])
    expect(issuesOf({ kind: 'toString' })).toEqual(['h.origin.kind không hợp lệ "toString"'])
    expect(issuesOf({ kind: 'wild', ballItemId: 'potion' })).toEqual([
      'h.origin.ballItemId: bóng không hợp lệ "potion"'
    ])
    expect(issuesOf({ kind: 'wild' })).toEqual([
      'h.origin.ballItemId: bóng không hợp lệ "undefined"'
    ])
    expect(issuesOf({ kind: 'legacy', parentSpeciesId: 'fused' })).toEqual([
      'h.origin.parentSpeciesId: loài không hợp lệ "fused"'
    ])
    expect(issuesOf({ kind: 'starter', extra: 1 })).toEqual(['h.origin: trường lạ "extra"'])
    expect(issuesOf('starter')).toEqual(['h.origin phải là object'])
  })

  it('báo lỗi mốc: ngày âm / lẻ, trường sai, mốc của tính năng chưa làm', () => {
    const issuesOf = (milestone: unknown): string[] =>
      check(history({ milestones: [milestone as Milestone] }))
    expect(issuesOf({ day: -1, kind: 'hatched' })).toHaveLength(1)
    expect(issuesOf({ day: 1.5, kind: 'hatched' })).toHaveLength(1)
    expect(issuesOf({ day: 1, kind: 'floorBossDefeated', floor: 0 })).toHaveLength(1)
    expect(issuesOf({ day: 1, kind: 'evolved', fromSpeciesId: 'zz', toSpeciesId: 'oak' })).toEqual([
      'h.milestones[0].fromSpeciesId: loài không hợp lệ "zz"'
    ])
    expect(issuesOf({ day: 1, kind: 'hatched', floor: 2 })).toEqual([
      'h.milestones[0]: trường lạ "floor"'
    ])
    // Thức tỉnh đã làm (bước 5l+.1): mốc hợp lệ.
    expect(issuesOf({ day: 1, kind: 'awakened', tier: 1 })).toEqual([])
    expect(issuesOf({ day: 1, kind: 'tribulationFailed', tier: 1, failures: 0 })).toHaveLength(1)
    expect(issuesOf({ day: 1, kind: 'reborn', count: 1 })).toEqual([
      'h.milestones[0]: mốc "reborn" chưa hỗ trợ (chờ rebirth.md)'
    ])
  })

  it('báo lỗi trường gặp, số mốc vượt giới hạn, trường lạ', () => {
    expect(check(history({ metDay: null }))).toHaveLength(1)
    expect(check(history({ metFloor: 0 }))).toHaveLength(1)
    expect(check(history({ metLevel: 0 }))).toHaveLength(1)
    const tooMany = Array.from({ length: 51 }, (_, i) => hatched(i))
    expect(check(history({ milestones: tooMany }))).toEqual(['h.milestones: 51 mốc, tối đa 50'])
    expect(check({ ...history(), note: 'x' })).toEqual(['h: trường lạ "note"'])
    expect(check({ ...history(), milestones: 'x' })).toEqual(['h.milestones phải là danh sách'])
    expect(check(5)).toEqual(['h phải là object hoặc null'])
  })
})
