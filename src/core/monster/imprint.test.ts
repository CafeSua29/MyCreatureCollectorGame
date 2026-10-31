// Dưỡng dục trên từng quái (docs/rules/imprinting.md): bắt đầu khi nở, sinh yêu cầu, nhận yêu cầu,
// quá hạn, chốt buff, % đủ 100 khi làm hết, chỉ số, kiểm tra trường imprint.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { ageDaysAtPercent } from '../registries'
import { createRng } from '../shared'
import { defined, makeData, makeMonster, makeRawData, withFixtureText } from '../testing'
import type {
  DayEvent,
  GameData,
  Imprint,
  ImprintConfig,
  ImprintRequestTask,
  Monster
} from '../model'
import { advanceImprint, fulfillImprint, startImprint, validateImprint } from './imprint'
import { computeStats } from './stats'
import { getMaxHp } from './hp'

const data = makeData()

function imprintData(config: Partial<ImprintConfig>): GameData {
  const raw = makeRawData()
  raw.config.imprint = { ...raw.config.imprint, ...config }
  return createGameData(withFixtureText(raw))
}

const activeImprint = (
  task: ImprintRequestTask,
  { completed = 0, total = 5, endDay = 10, dueDay = 2, done = false } = {}
): Imprint => ({
  phase: 'active',
  completed,
  total,
  endDay,
  request: { ...task, dueDay, done }
})

const activeOf = (monster: Monster): Extract<Imprint, { phase: 'active' }> => {
  const { imprint } = monster
  if (imprint?.phase !== 'active') throw new Error('quái không đang dưỡng dục')
  return imprint
}

/** Chạy từng ngày tới `lastDay`, ngày nào cũng làm đúng yêu cầu đang có (nếu `care`). */
function runDays(
  monster: Monster,
  { from, lastDay, care }: { from: number; lastDay: number; care: boolean }
): { monster: Monster; events: DayEvent[] } {
  let current = monster
  let rng = createRng(9)
  const events: DayEvent[] = []
  for (let day = from; day <= lastDay; day++) {
    ;[current, rng] = advanceImprint(data, rng, { monster: current, day, events })
    if (care && current.imprint?.phase === 'active') {
      current = fulfillImprint(current, current.imprint.request)
    }
  }
  return { monster: current, events }
}

describe('startImprint', () => {
  it('bật thọ nguyên: tới hết ấu niên, tổng yêu cầu tính sẵn, yêu cầu đầu hạn 2 ngày', () => {
    const egg = makeMonster({ aging: true })
    const youngDays = ageDaysAtPercent(data, egg, 10)
    const [hatched] = startImprint(data, createRng(1), egg, 5)
    const imprint = activeOf(hatched)
    expect(imprint).toMatchObject({ completed: 0, endDay: 5 + youngDays })
    expect(imprint.total).toBe(Math.ceil(youngDays / 2))
    expect(imprint.request).toMatchObject({ dueDay: 7, done: false })
  })

  it('tất định: cùng RNG cùng yêu cầu', () => {
    const egg = makeMonster()
    expect(startImprint(data, createRng(4), egg, 0)).toEqual(
      startImprint(data, createRng(4), egg, 0)
    )
  })

  it('tắt thọ nguyên: fallbackDays (30) ngày, 15 yêu cầu', () => {
    const [hatched] = startImprint(data, createRng(1), makeMonster({ aging: false }), 0)
    expect(activeOf(hatched)).toMatchObject({ endDay: 30, total: 15 })
  })

  it('mỗi quái một lần: đã có imprint (đang hoặc đã xong) thì giữ nguyên, không tốn RNG', () => {
    const rng = createRng(1)
    for (const imprint of [
      activeImprint({ kind: 'pet' }),
      { phase: 'done', completed: 1, total: 2 } as const
    ]) {
      const monster = makeMonster({ imprint })
      expect(startImprint(data, rng, monster, 0)).toEqual([monster, rng])
    }
  })

  it('thọ nguyên cực lớn: endDay kẹp ở số nguyên an toàn, tổng yêu cầu hữu hạn', () => {
    const egg = makeMonster({ aging: true, lifespanBonusYears: '1e30' })
    const imprint = activeOf(startImprint(data, createRng(1), egg, 3)[0])
    expect(imprint.endDay).toBe(Number.MAX_SAFE_INTEGER)
    expect(Number.isSafeInteger(imprint.total)).toBe(true)
  })

  it('thời gian dưỡng dục 1 ngày (fallbackDays 1): một yêu cầu, hạn = endDay', () => {
    const short = imprintData({ fallbackDays: 1 })
    const imprint = activeOf(startImprint(short, createRng(1), makeMonster(), 0)[0])
    expect(imprint).toMatchObject({ endDay: 1, total: 1, request: { dueDay: 1 } })
  })

  it('trọng số: chỉ loại có trọng số > 0 được ra; cho ăn chọn món trong foods', () => {
    const weights = { feed: 0, battle: 0, rest: 0, pet: 0 }
    const petOnly = imprintData({ requestWeights: { ...weights, pet: 1 } })
    const feedOnly = imprintData({ requestWeights: { ...weights, feed: 1 } })
    for (let seed = 1; seed <= 20; seed++) {
      expect(
        activeOf(startImprint(petOnly, createRng(seed), makeMonster(), 0)[0]).request.kind
      ).toBe('pet')
      const request = activeOf(startImprint(feedOnly, createRng(seed), makeMonster(), 0)[0]).request
      expect(request.kind).toBe('feed')
      expect(data.config.imprint.foods).toContain(request.kind === 'feed' ? request.itemId : '')
    }
  })

  it('món đúng khẩu vị (race / hệ) được đòi với trọng số favoriteFoodWeight', () => {
    const raw = makeRawData()
    const weights = { feed: 1, battle: 0, rest: 0, pet: 0 }
    raw.config.imprint = { ...raw.config.imprint, requestWeights: weights, favoriteFoodWeight: 1e9 }
    // potion đúng khẩu vị race neutral (race của quái fixture), spiritFruit không.
    raw.items = raw.items.map((item) =>
      item.id === 'potion' && item.category === 'consumable'
        ? { ...item, favoriteRaceIds: ['neutral'] }
        : item
    )
    const favorite = createGameData(withFixtureText(raw))
    for (let seed = 1; seed <= 20; seed++) {
      const request = activeOf(startImprint(favorite, createRng(seed), makeMonster(), 0)[0]).request
      expect(request).toMatchObject({ kind: 'feed', itemId: 'potion' })
    }
    // Quái khác race: hai món như nhau, cả hai đều có lúc được đòi.
    const other = makeMonster({ raceId: 'brute' })
    const items = new Set(
      Array.from({ length: 20 }, (_, i) => {
        const request = activeOf(startImprint(favorite, createRng(i + 1), other, 0)[0]).request
        return request.kind === 'feed' ? request.itemId : ''
      })
    )
    expect(items).toEqual(new Set(['potion', 'spiritFruit']))
  })
})

describe('fulfillImprint', () => {
  it('đúng việc: +1, đánh dấu xong; làm lại hay sai việc thì không đổi', () => {
    const monster = makeMonster({ imprint: activeImprint({ kind: 'rest' }) })
    const done = fulfillImprint(monster, { kind: 'rest' })
    expect(activeOf(done)).toMatchObject({ completed: 1, request: { done: true } })
    expect(fulfillImprint(done, { kind: 'rest' })).toBe(done)
    expect(fulfillImprint(monster, { kind: 'pet' })).toBe(monster)
  })

  it('cho ăn phải đúng món', () => {
    const monster = makeMonster({ imprint: activeImprint({ kind: 'feed', itemId: 'spiritFruit' }) })
    expect(fulfillImprint(monster, { kind: 'feed', itemId: 'potion' })).toBe(monster)
    expect(
      activeOf(fulfillImprint(monster, { kind: 'feed', itemId: 'spiritFruit' })).completed
    ).toBe(1)
  })

  it('chưa dưỡng dục hoặc đã xong: không đổi', () => {
    const none = makeMonster()
    const finished = makeMonster({ imprint: { phase: 'done', completed: 0, total: 3 } })
    expect(fulfillImprint(none, { kind: 'pet' })).toBe(none)
    expect(fulfillImprint(finished, { kind: 'pet' })).toBe(finished)
  })
})

describe('advanceImprint', () => {
  it('chưa tới hạn: không đổi, không tốn RNG', () => {
    const monster = makeMonster({ imprint: activeImprint({ kind: 'pet' }) })
    const events: DayEvent[] = []
    const rng = createRng(1)
    expect(advanceImprint(data, rng, { monster, day: 1, events })).toEqual([monster, rng])
    expect(events).toEqual([])
  })

  it('tới hạn: yêu cầu mới hạn +2 (sinh từ ngày hạn cũ), quá hạn thì mất phần đó', () => {
    const monster = makeMonster({ imprint: activeImprint({ kind: 'pet' }) })
    const events: DayEvent[] = []
    const [next] = advanceImprint(data, createRng(1), { monster, day: 2, events })
    const imprint = activeOf(next)
    expect(imprint).toMatchObject({ completed: 0, request: { dueDay: 4, done: false } })
    expect(events).toEqual([{ type: 'imprintRequest', monsterId: 'm1', request: imprint.request }])
  })

  it('nhảy nhiều ngày: sinh lần lượt theo lịch cố định', () => {
    const monster = makeMonster({ imprint: activeImprint({ kind: 'pet' }) })
    const events: DayEvent[] = []
    const [next] = advanceImprint(data, createRng(1), { monster, day: 7, events })
    expect(activeOf(next).request.dueDay).toBe(8)
    expect(events.map((e) => (e.type === 'imprintRequest' ? e.request.dueDay : null))).toEqual([
      4, 6, 8
    ])
  })

  it('hết thời gian: chốt buff, thân mật + percent / 2 (làm tròn xuống), chưa đủ 100% không có mốc', () => {
    const imprint = activeImprint({ kind: 'pet' }, { completed: 3, total: 5, dueDay: 10 })
    const monster = makeMonster({ imprint, affinity: 10 })
    const events: DayEvent[] = []
    const [next] = advanceImprint(data, createRng(1), { monster, day: 10, events })
    expect(next.imprint).toEqual({ phase: 'done', completed: 3, total: 5 })
    expect(next.affinity).toBe(10 + 30)
    expect(defined(next.history).milestones).toEqual([])
    expect(events).toEqual([{ type: 'imprintFinished', monsterId: 'm1', percent: 60 }])
  })

  it('làm hết mọi yêu cầu: đúng 100%, thân mật +50, mốc imprintPerfected', () => {
    // 7 ngày: yêu cầu ngày 0, 2, 4, 6 (hạn cuối = endDay 7, ngắn hơn 2 ngày); 3 ngày: 2 yêu cầu;
    // 30 ngày: 15 yêu cầu (100 / 15 không chia hết).
    for (const fallbackDays of [7, 3, 30]) {
      const shortData = imprintData({ fallbackDays })
      let [monster] = startImprint(shortData, createRng(2), makeMonster({ affinity: 0 }), 0)
      monster = fulfillImprint(monster, activeOf(monster).request)
      let rng = createRng(3)
      const events: DayEvent[] = []
      for (let day = 1; day <= fallbackDays; day++) {
        ;[monster, rng] = advanceImprint(shortData, rng, { monster, day, events })
        if (monster.imprint?.phase === 'active') {
          monster = fulfillImprint(monster, monster.imprint.request)
        }
      }
      expect(monster.imprint?.phase).toBe('done')
      expect(events.at(-1)).toEqual({ type: 'imprintFinished', monsterId: 'm1', percent: 100 })
      expect(monster.affinity).toBe(50)
      expect(defined(monster.history).milestones).toEqual([
        { day: fallbackDays, kind: 'imprintPerfected' }
      ])
    }
  })

  it('không làm gì: 0%, không tăng thân mật', () => {
    const [hatched] = startImprint(data, createRng(1), makeMonster({ affinity: 5 }), 0)
    const { monster, events } = runDays(hatched, { from: 1, lastDay: 30, care: false })
    expect(monster.imprint).toEqual({ phase: 'done', completed: 0, total: 15 })
    expect(monster.affinity).toBe(5)
    expect(events.filter((e) => e.type === 'imprintRequest')).toHaveLength(14)
  })
})

describe('buff chỉ số', () => {
  const statsOf = (imprint: Imprint | null): ReturnType<typeof computeStats> =>
    computeStats(data, makeMonster({ imprint }))

  it('đã xong: +15% × percent mọi chỉ số (kể cả max HP); đang dưỡng dục thì chưa có', () => {
    const none = statsOf(null)
    const full = statsOf({ phase: 'done', completed: 4, total: 4 })
    const half = statsOf({ phase: 'done', completed: 1, total: 2 })
    expect(full.percentBySource.imprint.attack).toBe(15)
    expect(full.percentBySource.imprint.hp).toBe(15)
    expect(half.percentBySource.imprint.speed).toBe(7.5)
    expect(
      statsOf(activeImprint({ kind: 'pet' }, { completed: 5, total: 5 })).percentBySource.imprint
    ).toEqual(none.percentBySource.imprint)
    expect(full.final.attack.gt(none.final.attack)).toBe(true)
    const done = makeMonster({ imprint: { phase: 'done', completed: 4, total: 4 } })
    expect(getMaxHp(data, done).gt(getMaxHp(data, makeMonster()))).toBe(true)
  })
})

describe('validateImprint', () => {
  it('hợp lệ: null, đang dưỡng dục (mọi loại yêu cầu), đã xong', () => {
    expect(validateImprint(data, null, 'imprint')).toEqual([])
    expect(validateImprint(data, { phase: 'done', completed: 0, total: 1 }, 'imprint')).toEqual([])
    const tasks: ImprintRequestTask[] = [
      { kind: 'feed', itemId: 'spiritFruit' },
      { kind: 'battle' },
      { kind: 'rest' },
      { kind: 'pet' }
    ]
    for (const task of tasks) {
      expect(validateImprint(data, activeImprint(task), 'imprint')).toEqual([])
    }
  })

  it('sai: completed > total, total 0, phase lạ, trường lạ, yêu cầu sai', () => {
    const check = (value: unknown): string[] => validateImprint(data, value, 'imprint')
    expect(check({ phase: 'done', completed: 3, total: 2 })).toEqual([
      'imprint.completed (3) không được vượt total (2)'
    ])
    expect(check({ phase: 'done', completed: 0, total: 0 })).toHaveLength(1)
    expect(check({ phase: 'later', completed: 0, total: 1 })).toEqual([
      'imprint.phase không hợp lệ "later"'
    ])
    expect(check({ phase: 'done', completed: 0, total: 1, endDay: 3 })).toEqual([
      'imprint: trường lạ "endDay"'
    ])
    expect(check(activeImprint({ kind: 'feed', itemId: 'fireStone' }))).toHaveLength(1)
    expect(check(activeImprint({ kind: 'pet' }, { dueDay: 11 }))).toEqual([
      'imprint.request.dueDay không được sau endDay (10)'
    ])
    expect(check({ ...activeImprint({ kind: 'pet' }), request: { kind: 'dance' } })).toEqual([
      'imprint.request.kind không hợp lệ "dance"'
    ])
    expect(
      check({ ...activeImprint({ kind: 'pet' }), request: { kind: 'pet', dueDay: 1, done: 1 } })
    ).toEqual(['imprint.request.done phải là boolean'])
    expect(
      check({
        ...activeImprint({ kind: 'pet' }),
        request: { kind: 'pet', dueDay: 1, done: false, itemId: 'potion' }
      })
    ).toEqual(['imprint.request: trường lạ "itemId"'])
    expect(check('x')).toEqual(['imprint phải là object hoặc null'])
  })
})
