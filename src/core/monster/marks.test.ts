// Dấu ấn trên quái (docs/rules/marks.md): nhận / lên cấp / mất dấu, chọn theo bộ phận, bộ đếm có ngưỡng
// tăng dần, di truyền, dấu sẵn của quái hoang, luân hồi, lý lịch, chỉ số và kiểm tra save.

import { describe, expect, it } from 'vitest'
import { createRng, toBig } from '../shared'
import type { MarkInstance, MarkOrigin, Monster, StatBreakdown } from '../model'
import { makeData, makeMarkData, makeMonster } from '../testing'
import {
  advanceCountedMark,
  checkMonsterMarks,
  clearRebirthMarks,
  gainMark,
  markChangesBetween,
  noteMarkChanges,
  partMarkCandidates,
  removeMark,
  rollChildMarks,
  rollPartMarkGain,
  rollSpawnMarks,
  type MarkResult
} from './marks'
import { computeStats } from './stats'
import { startHistory } from './history'
import { markDefOfKind } from '../registries'

const data = makeMarkData()
const origin: MarkOrigin = { source: 'partBreak', floor: 3 }
const mark = (markId: string, extra: Partial<MarkInstance> = {}): MarkInstance => ({
  markId,
  level: 1,
  origin,
  ...extra
})
const withMarks = (marks: MarkInstance[], extra: Partial<Monster> = {}): Monster =>
  ({ ...makeMonster({ id: 'a' }), marks, ...extra }) as Monster
const checkSave = (monster: Monster): string[] =>
  checkMonsterMarks(
    data,
    { marks: monster.marks, counters: monster.markCounters },
    { marks: 'marks', counters: 'markCounters' }
  )

describe('nhận dấu', () => {
  it('dấu mới cấp 1, nhận lại cùng id thì lên cấp, tới maxLevel thì thôi', () => {
    const first = gainMark(data, withMarks([]), { markId: 'thirdEye', origin })
    expect(first.monster.marks).toEqual([mark('thirdEye')])
    expect(first.changes).toEqual([
      { kind: 'gained', markId: 'thirdEye', targetId: undefined, level: 1, origin }
    ])
    const second = gainMark(data, first.monster, { markId: 'thirdEye', origin })
    expect(second.monster.marks[0].level).toBe(2)
    // maxLevel 2: không đổi, không có thay đổi.
    const third = gainMark(data, second.monster, { markId: 'thirdEye', origin })
    expect(third.monster).toBe(second.monster)
    expect(third.changes).toEqual([])
  })

  it('bộ phận đã có đột biến khác id thì không ra; sẹo và đột biến cùng bộ phận được', () => {
    const horned = withMarks([mark('stoneHorn')])
    expect(gainMark(data, horned, { markId: 'thirdEye', origin }).changes).toEqual([])
    expect(gainMark(data, horned, { markId: 'blindEye', origin }).monster.marks).toHaveLength(2)
  })

  it('dấu theo đối tượng cần đúng đối tượng; mỗi đối tượng một mục', () => {
    const none = withMarks([])
    expect(gainMark(data, none, { markId: 'fearSpecies', origin }).changes).toEqual([])
    expect(
      gainMark(data, none, { markId: 'fearSpecies', targetId: 'nope', origin }).changes
    ).toEqual([])
    expect(gainMark(data, none, { markId: 'blindEye', targetId: 'fire', origin }).changes).toEqual(
      []
    )
    const feared = gainMark(data, none, { markId: 'fearSpecies', targetId: 'weakling', origin })
    const both = gainMark(data, feared.monster, {
      markId: 'fearSpecies',
      targetId: 'strongling',
      origin
    })
    expect(both.monster.marks.map((m) => m.targetId)).toEqual(['weakling', 'strongling'])
    // Đối tượng status chỉ là debuff (buff không phải thứ để thích nghi).
    const buff = Object.values(data.statuses).find((status) => status.kind === 'buff')
    expect(
      gainMark(data, none, { markId: 'statusAdapted', targetId: buff?.id ?? '', origin }).changes
    ).toEqual([])
  })

  it('mục không tồn tại: không đổi', () => {
    const monster = withMarks([])
    expect(gainMark(data, monster, { markId: 'ghost', origin }).monster).toBe(monster)
  })

  it('bỏ dấu ghi lý do; không có thì không đổi', () => {
    const monster = withMarks([mark('blindEye')])
    const removed = removeMark(monster, { markId: 'blindEye' }, 'treated')
    expect(removed.monster.marks).toEqual([])
    expect(removed.changes).toEqual([
      { kind: 'removed', markId: 'blindEye', targetId: undefined, reason: 'treated' }
    ])
    expect(removeMark(monster, { markId: 'limp' }, 'treated').changes).toEqual([])
  })
})

describe('chọn sẹo / đột biến theo bộ phận', () => {
  it('chỉ bộ phận quái có (fixture: đầu, thân, chân), sẹo trạng thái tách sẹo vết thương', () => {
    const monster = withMarks([])
    const scars = partMarkCandidates(data, { monster, kind: 'scar' }).map((def) => def.id)
    expect(scars).toEqual(['blindEye', 'chestWound', 'limp'])
    const burn = partMarkCandidates(data, { monster, kind: 'scar', scar: { statusId: 'burn' } })
    expect(burn.map((def) => def.id)).toEqual(['deepBurn'])
    const legs = partMarkCandidates(data, { monster, kind: 'mutation', partId: 'legs' })
    expect(legs.map((def) => def.id)).toEqual(['springLegs'])
  })

  it('bộ phận đã có dấu cùng loại thì chỉ còn đúng dấu đó (lên cấp)', () => {
    const monster = withMarks([mark('stoneHorn')])
    const head = partMarkCandidates(data, { monster, kind: 'mutation', partId: 'head' })
    expect(head.map((def) => def.id)).toEqual(['stoneHorn'])
  })

  it('tỉ lệ 0 hoặc không có mục hợp thì không tốn RNG; 100 thì luôn ra', () => {
    const rng = createRng(5)
    const monster = withMarks([])
    const [none, same] = rollPartMarkGain(data, rng, {
      monster,
      kind: 'scar',
      chance: 0,
      origin
    })
    expect(none.changes).toEqual([])
    expect(same).toBe(rng)
    const [noPart, same2] = rollPartMarkGain(data, rng, {
      monster,
      kind: 'scar',
      partId: 'wings',
      chance: 100,
      origin
    })
    expect(noPart.changes).toEqual([])
    expect(same2).toBe(rng)
    const [hit] = rollPartMarkGain(data, rng, {
      monster,
      kind: 'scar',
      partId: 'legs',
      chance: 100,
      origin
    })
    expect(hit.monster.marks.map((m) => m.markId)).toEqual(['limp'])
  })
})

describe('bộ đếm có ngưỡng tăng dần', () => {
  const def = markDefOfKind(data, 'elementAdapted', 'adaptation')
  if (!def) throw new Error('thiếu elementAdapted')
  const advance = (monster: Monster, amount: number): MarkResult =>
    advanceCountedMark(data, monster, { def, targetId: 'fire', amount, origin })

  it('ngưỡng threshold × (cấp + 1): 2 lên cấp 1, thêm 4 lên cấp 2, phần dư giữ lại', () => {
    const one = advance(withMarks([]), 3)
    expect(one.monster.marks).toEqual([mark('elementAdapted', { targetId: 'fire' })])
    expect(one.monster.markCounters).toEqual({ 'elementAdapted:fire': 1 })
    const two = advance(one.monster, 3)
    expect(two.monster.marks[0].level).toBe(2)
    expect(two.monster.markCounters).toEqual({})
  })

  it('một lần cộng lớn lên nhiều cấp; tới maxLevel thì bỏ bộ đếm', () => {
    const big = advance(withMarks([]), 1_000_000)
    expect(big.monster.marks[0].level).toBe(3)
    expect(big.changes.map((change) => change.kind === 'gained' && change.level)).toEqual([1, 2, 3])
    expect(big.monster.markCounters).toEqual({})
  })

  it('0 hoặc đối tượng sai: không đổi', () => {
    const monster = withMarks([])
    expect(advance(monster, 0).monster).toBe(monster)
    expect(
      advanceCountedMark(data, monster, { def, targetId: 'nope', amount: 5, origin }).monster
    ).toBe(monster)
  })
})

describe('chỉ số', () => {
  const base = makeMonster({ id: 'a' })
  const stats = (monster: Monster): StatBreakdown => computeStats(data, monster)

  it('hook của dấu × hệ số cấp vào nguồn % `marks`', () => {
    const scarred = stats(withMarks([mark('chestWound', { level: 3 })]))
    // levelEffectStep 0,2: cấp 3 = × 1,4.
    expect(scarred.percentBySource.marks.defense).toBeCloseTo(-14)
    expect(scarred.final.defense.lt(stats(base).final.defense)).toBe(true)
  })

  it('trait của dấu (cấp = cấp dấu) và bộ phận không còn thì dấu không có tác dụng', () => {
    // Quái fixture không có cánh: Cánh dơi (trait fast) không có tác dụng.
    const winged = stats(withMarks([mark('batWings')]))
    expect(winged.percentBySource.marks.speed).toBe(0)
    const winged2 = computeStats(
      makeMarkData({}, (raw) => {
        raw.config.hitLocations.defaultBodyParts = ['head', 'torso', 'legs', 'wings']
      }),
      withMarks([mark('batWings')])
    )
    expect(winged2.percentBySource.marks.speed).toBe(50)
  })

  it('cấp cực lớn vẫn hữu hạn', () => {
    const huge = stats(withMarks([mark('springLegs', { level: 1_000_000_000 })]))
    expect(Number.isFinite(huge.percentBySource.marks.speed)).toBe(true)
    expect(huge.final.speed.isFinite()).toBe(true)
  })

  it('dữ liệu không có mục dấu: dấu trong save không làm gì', () => {
    const plain = makeData()
    expect(computeStats(plain, base).percentBySource.marks.defense).toBe(0)
  })
})

describe('di truyền và bẩm sinh', () => {
  it('đột biến 100% truyền giữ cấp, sẹo / chiến tích không truyền, mẹ trước bố', () => {
    const mother = withMarks([
      mark('springLegs', { level: 4 }),
      mark('blindEye'),
      mark('bossSlayer')
    ])
    const father = withMarks([])
    const [child] = rollChildMarks(data, createRng(1), {
      child: withMarks([]),
      parents: [mother, father]
    })
    expect(child.marks).toEqual([
      { markId: 'springLegs', level: 4, origin: { source: 'inherited', floor: null } }
    ])
  })

  it('con không có bộ phận thì không nhận đột biến của bộ phận đó', () => {
    const mother = withMarks([mark('batWings')])
    const data100 = makeMarkData({ mutationInheritPercent: 100 })
    const [child] = rollChildMarks(data100, createRng(1), {
      child: withMarks([]),
      parents: [mother]
    })
    expect(child.marks).toEqual([])
  })

  it('đột biến bẩm sinh theo birthMutationPercent', () => {
    const born = makeMarkData({ birthMutationPercent: 100 })
    const [child] = rollChildMarks(born, createRng(1), { child: withMarks([]), parents: [] })
    expect(child.marks).toHaveLength(1)
    expect(child.marks[0].origin).toEqual({ source: 'birth', floor: null })
  })
})

describe('quái hoang mang dấu sẵn', () => {
  it('wildMarkPercent 0 không tốn RNG; 100 luôn có một dấu', () => {
    const rng = createRng(2)
    const monster = withMarks([])
    expect(rollSpawnMarks(data, rng, { monster, floor: 5 })[1]).toBe(rng)
    const always = makeMarkData({ wildMarkPercent: 100, wildMutationShare: 0 })
    const [marked] = rollSpawnMarks(always, rng, { monster, floor: 5 })
    expect(marked.marks).toHaveLength(1)
    expect(always.marks[marked.marks[0].markId].kind).toBe('scar')
    expect(marked.marks[0].origin).toEqual({ source: 'wild', floor: 5 })
  })
})

describe('luân hồi', () => {
  it('xóa sẹo, ám ảnh và bộ đếm ám ảnh; giữ đột biến, thích nghi, chiến tích', () => {
    const monster = withMarks(
      [
        mark('blindEye'),
        mark('fearSpecies', { targetId: 'weakling' }),
        mark('springLegs'),
        mark('elementAdapted', { targetId: 'fire' }),
        mark('bossSlayer')
      ],
      { markCounters: { 'fearSpecies:strongling': 2, 'elementAdapted:water': 1 } }
    )
    const reborn = clearRebirthMarks(data, monster)
    expect(reborn.monster.marks.map((m) => m.markId)).toEqual([
      'springLegs',
      'elementAdapted',
      'bossSlayer'
    ])
    expect(reborn.monster.markCounters).toEqual({ 'elementAdapted:water': 1 })
    expect(reborn.changes.map((change) => change.kind === 'removed' && change.reason)).toEqual([
      'rebirth',
      'rebirth'
    ])
  })
})

describe('lý lịch và so trước / sau', () => {
  it('mốc markGained / markRemoved; quái chưa có lý lịch thì không ghi', () => {
    const owned = startHistory(
      withMarks([]),
      { kind: 'starter' },
      { day: 0, floor: null, level: 1 }
    )
    const gained = gainMark(data, owned, {
      markId: 'fearSpecies',
      targetId: 'weakling',
      origin: { source: 'trauma', floor: 2, opponentSpeciesId: 'weakling' }
    })
    const noted = noteMarkChanges(data, gained.monster, gained.changes, 7)
    expect(noted.history?.milestones).toEqual([
      {
        day: 7,
        kind: 'markGained',
        markId: 'fearSpecies',
        targetId: 'weakling',
        level: 1,
        source: 'trauma',
        floor: 2,
        opponentSpeciesId: 'weakling'
      }
    ])
    const wild = withMarks([], { history: null })
    expect(noteMarkChanges(data, wild, gained.changes, 7)).toBe(wild)
  })

  it('markChangesBetween: dấu mới, lên cấp, mất', () => {
    const before = withMarks([mark('blindEye'), mark('stoneHorn')])
    const after = withMarks([mark('stoneHorn', { level: 2 }), mark('limp')])
    const itemOrigin: MarkOrigin = { source: 'item', floor: null }
    expect(markChangesBetween(before, after, { origin: itemOrigin, reason: 'item' })).toEqual([
      { kind: 'gained', markId: 'stoneHorn', targetId: undefined, level: 2, origin: itemOrigin },
      { kind: 'gained', markId: 'limp', targetId: undefined, level: 1, origin: itemOrigin },
      { kind: 'removed', markId: 'blindEye', targetId: undefined, reason: 'item' }
    ])
  })
})

describe('kiểm tra save', () => {
  it('hợp lệ', () => {
    expect(
      checkSave(
        withMarks(
          [
            mark('blindEye', { winBattles: 3 }),
            mark('fearSpecies', { targetId: 'weakling', resolveCount: 1 })
          ],
          { markCounters: { 'elementAdapted:fire': 1 } }
        )
      )
    ).toEqual([])
  })

  it('id lạ, đối tượng sai, cấp vượt tối đa, trùng, hai sẹo một bộ phận, bộ đếm sai', () => {
    const issues = (marks: unknown[], counters: unknown = {}): string =>
      checkMonsterMarks(data, { marks, counters }, { marks: 'marks', counters: 'c' }).join('\n')
    expect(issues([mark('ghost')])).toContain('dấu không tồn tại')
    expect(issues([mark('fearSpecies')])).toContain('targetId')
    expect(issues([mark('blindEye', { targetId: 'fire' })])).toContain('không có targetId')
    expect(issues([mark('thirdEye', { level: 3 })])).toContain('maxLevel')
    expect(issues([mark('limp'), mark('limp')])).toContain('trùng')
    expect(issues([mark('blindEye'), { ...mark('chestWound'), markId: 'blindEye' }])).toContain(
      'trùng'
    )
    const twoScars = issues([mark('chestWound'), mark('deepBurn')])
    expect(twoScars).toContain('hơn một scar')
    expect(issues([mark('limp', { resolveCount: 1 })])).toContain('chỉ ám ảnh')
    expect(issues([{ ...mark('limp'), origin: { source: 'magic', floor: 0 } }])).toContain('source')
    expect(issues([], { k: 0 })).toContain('c.k')
    expect(issues([], { k: 1.5 })).toContain('c.k')
  })

  it('cấp số rất lớn hợp lệ khi mục không trần', () => {
    expect(checkSave(withMarks([mark('springLegs', { level: Number.MAX_SAFE_INTEGER })]))).toEqual(
      []
    )
    expect(toBig(1).isFinite()).toBe(true)
  })
})
