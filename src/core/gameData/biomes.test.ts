import { describe, expect, it } from 'vitest'
import { createGameData } from './gameData'
import { DataError } from '../shared'
import { makeRawData } from '../testing'

/** Lỗi dữ liệu sau khi áp `edit` lên fixture (chuỗi rỗng = hợp lệ). */
function issues(edit: (raw: ReturnType<typeof makeRawData>) => void): string {
  const raw = makeRawData()
  edit(raw)
  try {
    createGameData(raw)
    return ''
  } catch (error) {
    if (error instanceof DataError) return error.issues.join('\n')
    throw error
  }
}

describe('kiểm tra biome', () => {
  it('fixture hợp lệ; boss không có trọng số (chỉ gặp qua challengeBoss) hợp lệ', () => {
    expect(issues(() => {})).toBe('')
    expect(issues((raw) => delete raw.biomes[1].bosses[0].weight)).toBe('')
  })

  it('cần ít nhất một biome; id trùng báo lỗi', () => {
    expect(issues((raw) => (raw.biomes = []))).toMatch(/biomes: cần ít nhất một biome/)
    expect(issues((raw) => (raw.biomes[1].id = 'field'))).toMatch(/biomes: id "field" bị trùng/)
  })

  it('boss tầng phải nằm trong danh sách bosses; cần ít nhất một boss', () => {
    expect(issues((raw) => (raw.biomes[0].floorBossSpeciesId = 'twig'))).toMatch(
      /Biome "field": floorBossSpeciesId "twig" phải nằm trong danh sách bosses/
    )
    expect(issues((raw) => (raw.biomes[0].bosses = []))).toMatch(
      /Biome "field": cần ít nhất một boss/
    )
  })

  it('boss: loài thường tồn tại, không trùng, trọng số > 0, đồ rơi hợp lệ', () => {
    const text = issues((raw) => {
      raw.biomes[0].bosses.push(
        { speciesId: 'strongling', drops: [] },
        { speciesId: 'fused', drops: [] },
        { speciesId: 'twig', weight: 0, drops: [{ itemId: 'ghost', chance: 101 }] }
      )
    })
    expect(text).toMatch(/boss "strongling" bị khai báo hai lần/)
    expect(text).toMatch(/boss loài không tồn tại "fused"/)
    expect(text).toMatch(/boss "twig"\.weight/)
    expect(text).toMatch(/boss "twig": vật phẩm rơi không tồn tại "ghost"/)
    expect(text).toMatch(/boss "twig": chance/)
  })

  it('bossDrops: phải là danh sách, vật phẩm tồn tại và gộp chồng, tỉ lệ trong [0, 100]', () => {
    expect(issues((raw) => (raw.biomes[0].bossDrops = [{ itemId: 'ball', chance: 100 }]))).toBe('')
    const text = issues((raw) => {
      raw.biomes[0].bossDrops = [
        { itemId: 'ghost', chance: 10 },
        { itemId: 'traitCrystal', chance: 10 },
        { itemId: 'ball', chance: 101 }
      ]
    })
    expect(text).toMatch(/Biome "field": bossDrops: vật phẩm rơi không tồn tại "ghost"/)
    expect(text).toMatch(/Biome "field": bossDrops: vật phẩm rơi "traitCrystal" .* không gộp/)
    expect(text).toMatch(/Biome "field": bossDrops: chance/)
    // Ép kiểu để thử JSON thiếu trường.
    expect(
      issues((raw) => delete (raw.biomes[0] as Partial<(typeof raw.biomes)[0]>).bossDrops)
    ).toMatch(/Biome "field": bossDrops phải là danh sách/)
  })

  it('tỉ lệ và multiplier của biome', () => {
    const text = issues((raw) => {
      raw.biomes[0].doubleChance = 101
      raw.biomes[0].shinyChance = -1
      raw.biomes[0].bossChance = 150
      raw.biomes[1].bossMultiplierMin = 0
      raw.biomes[2].bossMultiplierMax = 1
    })
    expect(text).toMatch(/Biome "field": doubleChance/)
    expect(text).toMatch(/Biome "field": shinyChance/)
    expect(text).toMatch(/Biome "field": bossChance/)
    expect(text).toMatch(/Biome "lair": bossMultiplierMin/)
    expect(text).toMatch(/Biome "pairs": bossMultiplierMax/)
  })

  it('config.floors: levelPerFloor nguyên ≥ 2, geneGrowthPerFloor ≥ 1', () => {
    expect(issues((raw) => (raw.config.floors.levelPerFloor = 1))).toMatch(
      /config\.floors\.levelPerFloor/
    )
    expect(issues((raw) => (raw.config.floors.levelPerFloor = 2.5))).toMatch(
      /config\.floors\.levelPerFloor/
    )
    expect(issues((raw) => (raw.config.floors.geneGrowthPerFloor = 0.9))).toMatch(
      /config\.floors\.geneGrowthPerFloor/
    )
    expect(issues((raw) => (raw.config.floors.geneGrowthPerFloor = Infinity))).toMatch(
      /config\.floors\.geneGrowthPerFloor/
    )
    expect(issues((raw) => (raw.config.floors.levelPerFloor = 1_000_000))).toBe('')
  })
})
