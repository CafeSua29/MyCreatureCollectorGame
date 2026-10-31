// Phẩm cấp tư chất (docs/rules/aptitude.md): tỉ lệ gen so với gen tối đa quái hoang ở tầng mốc.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { toBig } from '../shared'
import { dataIssuesAfter, makeData, makeRawData, uniformStats } from '../testing'
import type { BigStats, GameData, RawGameData } from '../model'
import {
  aptitudeFloor,
  aptitudeOf,
  aptitudeTierRank,
  hasAptitudeAtLeast,
  wildGeneMaxTotal
} from './aptitude'

// Fixture: geneMax 10, 6 chỉ số → tổng gen tối đa tầng 1 là 60; gen không tăng theo tầng.
const data = makeData()

/** Bảng bậc hồn khí theo bộ bậc tư chất vừa thay (soul-relics.md), để test chỉ thấy lỗi của bậc. */
const matchRelicRarities = (raw: RawGameData): void => {
  raw.config.soulRelic.rarityByAptitude = Object.fromEntries(
    raw.aptitudeTiers.map((tier) => [tier.id, 'common'])
  )
}

const genes = (value: number | string): { genes: BigStats } => {
  const result = {} as BigStats
  for (const [stat, v] of Object.entries(uniformStats(0))) {
    result[stat as keyof BigStats] = toBig(v).plus(value)
  }
  return { genes: result }
}

/** Dữ liệu fixture với gen quái hoang tăng geneGrowthPerFloor mỗi tầng. */
function growingData(geneGrowthPerFloor: number): GameData {
  const raw = makeRawData()
  raw.config.floors.geneGrowthPerFloor = geneGrowthPerFloor
  return createGameData(raw)
}

describe('aptitudeOf', () => {
  it('đúng bậc ở mỗi ngưỡng (ngưỡng thuộc bậc trên)', () => {
    const cases: [number, string][] = [
      [0, 'mortal'],
      [2.9, 'mortal'],
      [3, 'good'],
      [5.9, 'good'],
      [6, 'superior'],
      [9, 'refined'],
      [11.9, 'refined'],
      [12, 'heavenly'],
      [19.9, 'heavenly'],
      [20, 'divine']
    ]
    for (const [gene, tierId] of cases) {
      expect(aptitudeOf(data, genes(gene), 1).tier.id, `gen ${gene}`).toBe(tierId)
    }
    expect(aptitudeOf(data, genes(10), 1).ratio.eq(1)).toBe(true)
  })

  it('tụt bậc khi tầng mốc tăng (gen quái hoang tầng cao lớn hơn)', () => {
    const growing = growingData(2)
    // Tầng 2: gen tối đa 20 mỗi chỉ số → gen 10 chỉ còn tỉ lệ 0,5.
    expect(wildGeneMaxTotal(growing, 2).eq(120)).toBe(true)
    expect(aptitudeOf(growing, genes(10), 1).tier.id).toBe('refined')
    expect(aptitudeOf(growing, genes(10), 2).tier.id).toBe('good')
    expect(aptitudeOf(growing, genes(10), 3).tier.id).toBe('mortal')
  })

  it('số cực lớn: tầng rất cao và gen rất lớn vẫn hữu hạn', () => {
    const growing = growingData(1.1)
    const floor = 1_000_000
    const max = wildGeneMaxTotal(growing, floor)
    expect(max.isFinite()).toBe(true)
    const perStat = max.div(6)
    const heavenly = aptitudeOf(growing, genes(perStat.times(1.5).toFixed()), floor)
    expect(heavenly.tier.id).toBe('heavenly')
    expect(heavenly.ratio.isFinite()).toBe(true)
    expect(aptitudeOf(growing, genes('1e9999'), 1).tier.id).toBe('divine')
  })

  it('tầng mốc là tầng cao nhất từng đạt', () => {
    expect(aptitudeFloor({ highestFloor: 7 })).toBe(7)
  })
})

describe('thứ hạng bậc', () => {
  it('theo thứ tự trong config, id lạ là −1', () => {
    expect(aptitudeTierRank(data, 'mortal')).toBe(0)
    expect(aptitudeTierRank(data, 'divine')).toBe(5)
    expect(aptitudeTierRank(data, 'nope')).toBe(-1)
  })

  it('hasAptitudeAtLeast: đúng bậc tối thiểu hoặc cao hơn', () => {
    expect(hasAptitudeAtLeast(data, genes(9), { floor: 1, minTierId: 'refined' })).toBe(true)
    expect(hasAptitudeAtLeast(data, genes(8.9), { floor: 1, minTierId: 'refined' })).toBe(false)
    expect(hasAptitudeAtLeast(data, genes(30), { floor: 1, minTierId: 'refined' })).toBe(true)
  })
})

describe('aptitudeTiers.json', () => {
  it('fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('bậc đầu phải từ 0, from tăng dần ngặt, là số, không trường lạ', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.aptitudeTiers = [
          { id: 'a', from: 0.1 },
          { id: 'b', from: 0.1 },
          { id: 'c', from: 'x' as unknown as number },
          { id: 'd', from: 1, extra: 1 } as unknown as { id: string; from: number }
        ]
        matchRelicRarities(raw)
      },
      { regenerateText: true }
    )
    expect(issues).toEqual([
      'Bậc tư chất "a": bậc đầu phải có from 0',
      'Bậc tư chất "b": from phải lớn hơn bậc trước (0.1), nhận 0.1',
      'Bậc tư chất "c": from phải là số',
      'Bậc tư chất "d": trường "extra" không thuộc bậc tư chất'
    ])
  })

  it('không có bậc nào / id trùng', () => {
    const none = (raw: RawGameData): void => {
      raw.aptitudeTiers = []
      matchRelicRarities(raw)
    }
    expect(dataIssuesAfter(none, { regenerateText: true })).toEqual([
      'aptitudeTiers: cần ít nhất một bậc'
    ])
    expect(
      dataIssuesAfter(
        (raw) => {
          raw.aptitudeTiers = [
            { id: 'a', from: 0 },
            { id: 'a', from: 1 }
          ]
          matchRelicRarities(raw)
        },
        { regenerateText: true }
      )
    ).toEqual(['aptitudeTiers: id "a" bị trùng'])
  })

  it('thiếu tên bậc trong i18n', () => {
    const issues = dataIssuesAfter((raw) => {
      delete raw.text.languages.en.content.aptitudeTiers.divine
    })
    expect(issues).toEqual(['Ngôn ngữ "en".aptitudeTiers: thiếu tên cho "divine"'])
  })
})
