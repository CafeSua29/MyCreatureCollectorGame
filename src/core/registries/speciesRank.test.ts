// Phẩm cấp loài (docs/rules/species-rank.md): bậc theo tổng chỉ số gốc, huyền thoại cộng bậc, ghi đè.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { dataIssuesAfter, makeData, makeMonster, makeRawData, uniformStats } from '../testing'
import type { GameData, NormalSpecies, SpeciesRankDef } from '../model'
import { baseStatTotal, monsterSpeciesRankOf, speciesRankIndex, speciesRankOf } from './speciesRank'

// Fixture: G 0, F 200, E 300, S 500, X 600; huyền thoại catchRate ≤ 5 cộng 1 bậc.
const data = makeData()
const base = data.species.weakling as NormalSpecies

/** Loài thử có tổng chỉ số `total` (dồn hết vào HP). */
const speciesWith = (total: number, extra: Partial<NormalSpecies> = {}): NormalSpecies => ({
  ...base,
  baseStats: { ...uniformStats(0), hp: total },
  ...extra
})

const rankId = (species: NormalSpecies, gameData = data): string =>
  speciesRankOf(gameData, species).id

describe('speciesRankOf', () => {
  it('đúng bậc ở mỗi ngưỡng (ngưỡng thuộc bậc trên)', () => {
    const cases: [number, string][] = [
      [0, 'G'],
      [199, 'G'],
      [200, 'F'],
      [299, 'F'],
      [300, 'E'],
      [499, 'E'],
      [500, 'S'],
      [600, 'X'],
      [1e12, 'X']
    ]
    for (const [total, expected] of cases) expect(rankId(speciesWith(total))).toBe(expected)
  })

  it('tổng chỉ số gốc cộng đủ 6 chỉ số', () => {
    expect(baseStatTotal({ baseStats: uniformStats(30) })).toBe(180)
    expect(rankId(data.species.strongling as NormalSpecies)).toBe('E')
  })

  it('huyền thoại (catchRate ≤ 5) cộng một bậc, không vượt bậc cao nhất', () => {
    expect(rankId(speciesWith(300, { catchRate: 5 }))).toBe('S')
    expect(rankId(speciesWith(300, { catchRate: 6 }))).toBe('E')
    expect(rankId(speciesWith(0, { catchRate: 0 }))).toBe('F')
    expect(rankId(speciesWith(500, { catchRate: 1 }))).toBe('X')
    expect(rankId(speciesWith(600, { catchRate: 1 }))).toBe('X')
  })

  it('số bậc cộng theo config, kể cả 0 và vượt trần', () => {
    const withBonus = (legendaryBonus: number): GameData => {
      const raw = makeRawData()
      raw.config.speciesRank.legendaryBonus = legendaryBonus
      return createGameData(raw)
    }
    expect(rankId(speciesWith(300, { catchRate: 1 }), withBonus(0))).toBe('E')
    expect(rankId(speciesWith(0, { catchRate: 1 }), withBonus(2))).toBe('E')
    expect(rankId(speciesWith(0, { catchRate: 1 }), withBonus(100))).toBe('X')
  })

  it('ghi đè rank thắng tổng chỉ số và cộng bậc huyền thoại', () => {
    expect(rankId(speciesWith(1000, { catchRate: 1, rank: 'G' }))).toBe('G')
    expect(rankId(speciesWith(0, { rank: 'X' }))).toBe('X')
  })
})

describe('monsterSpeciesRankOf', () => {
  it('quái thường theo loài của nó', () => {
    expect(monsterSpeciesRankOf(data, makeMonster({ id: 'a' })).id).toBe('G')
  })

  it('quái fuse theo loài gốc (baseSpeciesId)', () => {
    const fused = makeMonster({ id: 'f', speciesId: 'fused', baseSpeciesId: 'strongling' })
    expect(monsterSpeciesRankOf(data, fused).id).toBe('E')
  })
})

describe('speciesRankIndex', () => {
  it('thứ tự trong file; id lạ là −1', () => {
    expect(speciesRankIndex(data, 'G')).toBe(0)
    expect(speciesRankIndex(data, 'X')).toBe(4)
    expect(speciesRankIndex(data, 'Z')).toBe(-1)
  })
})

describe('speciesRanks.json, config.speciesRank, rank của loài', () => {
  it('fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('bậc đầu phải từ 0, from tăng dần ngặt, là số, không trường lạ', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.speciesRanks = [
          { id: 'a', from: 10 },
          { id: 'b', from: 10 },
          { id: 'c', from: 'x' as unknown as number },
          { id: 'd', from: 100, extra: 1 } as unknown as SpeciesRankDef
        ]
        // Boss thế giới tham chiếu phẩm cấp theo id (docs/rules/world-boss.md).
        raw.config.worldBoss.minSpeciesRankId = 'a'
      },
      { regenerateText: true }
    )
    expect(issues).toEqual([
      'Phẩm cấp loài "a": bậc đầu phải có from 0',
      'Phẩm cấp loài "b": from phải lớn hơn bậc trước (10), nhận 10',
      'Phẩm cấp loài "c": from phải là số',
      'Phẩm cấp loài "d": trường "extra" không thuộc phẩm cấp loài'
    ])
  })

  it('không có bậc nào / id trùng', () => {
    expect(dataIssuesAfter((raw) => (raw.speciesRanks = []), { regenerateText: true })).toEqual([
      'speciesRanks: cần ít nhất một bậc',
      // Boss thế giới tham chiếu phẩm cấp theo id (docs/rules/world-boss.md).
      'config.worldBoss.minSpeciesRankId: phẩm cấp loài không tồn tại "G"'
    ])
    expect(
      dataIssuesAfter(
        (raw) => {
          raw.speciesRanks = [
            { id: 'a', from: 0 },
            { id: 'a', from: 1 }
          ]
          raw.config.worldBoss.minSpeciesRankId = 'a'
        },
        { regenerateText: true }
      )
    ).toEqual(['speciesRanks: id "a" bị trùng'])
  })

  it('config: số nguyên ≥ 0, không trường lạ', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.speciesRank = {
        legendaryCatchRate: -1,
        legendaryBonus: 0.5,
        extra: 1
      } as unknown as typeof raw.config.speciesRank
    })
    expect(issues).toEqual([
      'config.speciesRank: trường "extra" không thuộc config',
      'config.speciesRank.legendaryCatchRate phải là số nguyên ≥ 0, nhận -1',
      'config.speciesRank.legendaryBonus phải là số nguyên ≥ 0, nhận 0.5'
    ])
  })

  it('ghi đè rank phải là id phẩm cấp loài', () => {
    const issues = dataIssuesAfter((raw) => {
      const weakling = raw.species.find((species) => species.id === 'weakling')
      if (weakling?.kind === 'normal') weakling.rank = 'Z'
    })
    expect(issues).toEqual(['Loài "weakling": rank không phải phẩm cấp loài, nhận "Z"'])
  })

  it('thiếu tên bậc trong i18n', () => {
    const issues = dataIssuesAfter((raw) => {
      delete raw.text.languages.en.content.speciesRanks.X
    })
    expect(issues).toEqual(['Ngôn ngữ "en".speciesRanks: thiếu tên cho "X"'])
  })
})
