import { describe, expect, it } from 'vitest'
import { rawGameData } from '@data'
import { dataIssues, makeRawData, withEquipmentFixtures, withFixtureText } from '../testing'
import type { EquipmentItem, RawGameData } from '../model'
import { createGameData } from './gameData'

/** Lỗi kiểm tra dữ liệu sau khi sửa raw fixture có trang bị. */
function issuesAfter(edit: (raw: RawGameData) => void): string {
  const raw = withEquipmentFixtures(makeRawData())
  edit(raw)
  return dataIssues(withFixtureText(raw)).join('\n')
}

function equipmentOf(raw: RawGameData, id: string): EquipmentItem {
  const item = raw.items.find((entry) => entry.id === id)
  if (item?.category !== 'equipment') throw new Error(`thiếu trang bị ${id}`)
  return item
}

describe('trang bị gốc', () => {
  it('fixture và dữ liệu thật hợp lệ', () => {
    expect(issuesAfter(() => {})).toBe('')
    expect(() => createGameData(rawGameData)).not.toThrow()
  })

  it('dòng chính: hook lạ, thiếu valueParam, giá trị sai với hook, thiếu bậc, min > max', () => {
    const text = issuesAfter((raw) => {
      equipmentOf(raw, 'sword').mainLine = {
        hook: { type: 'ghostHook', params: {} },
        valueParam: 'percent.attack',
        ranges: { common: { min: 5, max: 1 } }
      }
      equipmentOf(raw, 'staff').mainLine.valueParam = ''
      // actFirstChance: chance phải trong (0, 100].
      equipmentOf(raw, 'quickClaw').mainLine.ranges.common = { min: 0, max: 150 }
    })
    expect(text).toMatch(/"sword".mainLine.hook: hook trait không tồn tại "ghostHook"/)
    expect(text).toMatch(/"sword".mainLine.ranges.common.max phải là số nguyên ≥ 5/)
    expect(text).toMatch(/"sword".mainLine.ranges thiếu bậc "uncommon"/)
    expect(text).toMatch(/"staff".mainLine.valueParam phải là chuỗi khác rỗng/)
    expect(text).toMatch(/"quickClaw".mainLine.hook \(giá trị 0\): chance/)
    expect(text).toMatch(/"quickClaw".mainLine.hook \(giá trị 150\): chance/)
  })

  it('bậc unique chỉ ở món unique; món unique chỉ có bậc unique, không bán ở cửa hàng', () => {
    const text = issuesAfter((raw) => {
      equipmentOf(raw, 'sword').mainLine.ranges.unique = { min: 1, max: 1 }
      const crown = equipmentOf(raw, 'stronglingCrown')
      crown.mainLine.ranges.common = { min: 1, max: 1 }
      crown.shop = true
      crown.shopWeight = 1
    })
    expect(text).toMatch(/"sword".mainLine.ranges: bậc "unique" chỉ dùng cho món unique/)
    expect(text).toMatch(/"stronglingCrown".mainLine.ranges: món unique chỉ có bậc "unique"/)
    expect(text).toMatch(/"stronglingCrown": trang bị unique không bán ở cửa hàng/)
  })

  it('phần unique: loài boss, dòng unique (≥ 1, id không trùng / không "main"), gợi ý AI', () => {
    const text = issuesAfter((raw) => {
      const crown = equipmentOf(raw, 'stronglingCrown')
      const unique = crown.unique
      if (!unique) throw new Error('thiếu unique')
      unique.bossSpeciesId = 'fused'
      unique.lines.push(
        { ...unique.lines[0] },
        { ...unique.lines[0], id: 'main' },
        { ...unique.lines[0], id: 'affixSpeed' }
      )
      unique.aiHints = [{ multiplier: 0 }, { category: 'magic' as never, multiplier: 1 }]
      const ring = equipmentOf(raw, 'stronglingRing')
      if (ring.unique) ring.unique.lines = []
    })
    expect(text).toMatch(
      /"stronglingCrown".unique.bossSpeciesId: loài thường không tồn tại "fused"/
    )
    expect(text).toMatch(/lines\[1\].id "crownSpeed" trùng dòng khác/)
    expect(text).toMatch(/lines\[2\].id phải là chuỗi khác rỗng, khác "main"/)
    expect(text).toMatch(/lines\[3\].id "affixSpeed" trùng dòng khác của món hoặc dòng phụ/)
    expect(text).toMatch(/aiHints\[0\]: cần ít nhất một điều kiện/)
    expect(text).toMatch(/aiHints\[0\].multiplier/)
    expect(text).toMatch(/aiHints\[1\].category không hợp lệ "magic"/)
    expect(text).toMatch(/"stronglingRing".unique.lines cần ít nhất một dòng unique/)
  })

  it('trường lạ trong dòng / khoảng báo lỗi', () => {
    const text = issuesAfter((raw) => {
      const sword = equipmentOf(raw, 'sword')
      Object.assign(sword.mainLine, { weight: 3 })
      Object.assign(sword.mainLine.ranges.common ?? {}, { mean: 1 })
    })
    expect(text).toMatch(/"sword".mainLine: trường "weight" không thuộc dòng trang bị/)
    expect(text).toMatch(/ranges.common: trường "mean" không thuộc khoảng giá trị/)
  })
})

describe('dòng phụ, danh sách rơi của map, config', () => {
  it('dòng phụ: id "main", trọng số âm, hook sai', () => {
    const text = issuesAfter((raw) => {
      raw.equipmentAffixes.push({
        id: 'main',
        weight: -1,
        hook: { type: 'statModifier', params: {} },
        valueParam: 'percent.power',
        ranges: { rare: { min: 1, max: 1 } }
      })
    })
    expect(text).toMatch(/Dòng phụ "main": id "main" dành cho dòng chính/)
    expect(text).toMatch(/Dòng phụ "main": weight/)
    expect(text).toMatch(/Dòng phụ "main".hook \(giá trị 1\): percent.power không phải chỉ số/)
  })

  it('danh sách rơi: món không phải trang bị, món unique, trùng, trọng số ≤ 0', () => {
    const text = issuesAfter((raw) => {
      raw.biomes[0].equipmentDrops = [
        { itemId: 'potion', weight: 1 },
        { itemId: 'stronglingCrown', weight: 1 },
        { itemId: 'sword', weight: 0 },
        { itemId: 'sword', weight: 1 }
      ]
    })
    expect(text).toMatch(/Biome "field": equipmentDrops: trang bị không tồn tại "potion"/)
    expect(text).toMatch(/món unique "stronglingCrown" chỉ rơi từ boss của nó/)
    expect(text).toMatch(/weight của "sword"/)
    expect(text).toMatch(/trùng món "sword"/)
  })

  it('config.equipment: mốc tăng dần, tỉ lệ trong [0, 100], bảng bậc đủ, bậc lạ', () => {
    const text = issuesAfter((raw) => {
      raw.config.equipment = {
        ...raw.config.equipment,
        floorMilestones: [50, 20],
        dropChance: 150,
        rarityWeights: { common: 0 },
        bossRarityWeights: { unique: 1 } as never,
        floorBoostFrom: 'unique' as never,
        affixCounts: { ...raw.config.equipment.affixCounts, rare: 1.5 }
      }
    })
    expect(text).toMatch(/config.equipment.floorMilestones\[1\] phải là số nguyên ≥ 51/)
    expect(text).toMatch(/config.equipment.dropChance/)
    expect(text).toMatch(/config.equipment.rarityWeights cần ít nhất một bậc có trọng số > 0/)
    expect(text).toMatch(/config.equipment.bossRarityWeights: "unique" không phải bậc thường/)
    expect(text).toMatch(/config.equipment.floorBoostFrom phải là bậc thường/)
    expect(text).toMatch(/config.equipment.affixCounts.rare/)
  })
})
