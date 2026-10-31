import { describe, expect, it } from 'vitest'
import { dataIssuesAfter, defined } from '../testing'
import type { Item, RawGameData } from '../model'

/** Lỗi dữ liệu sau khi áp `edit` lên dữ liệu thô của fixture. */
const issuesAfter = (edit: (raw: RawGameData) => void): string => dataIssuesAfter(edit).join('\n')

const itemOf = (raw: RawGameData, id: string): Item =>
  defined(
    raw.items.find((item) => item.id === id),
    id
  )

/** Gán trường tùy ý vào item (giả lập JSON sai, không theo kiểu). */
const patch = (raw: RawGameData, id: string, fields: Record<string, unknown>): void => {
  Object.assign(itemOf(raw, id), fields)
}

describe('checkItems: category', () => {
  it('fixture hợp lệ', () => {
    expect(issuesAfter(() => {})).toBe('')
  })

  it('category lạ hoặc thiếu', () => {
    const text = issuesAfter((raw) => {
      patch(raw, 'potion', { category: 'food' })
      patch(raw, 'revive', { category: undefined })
    })
    expect(text).toMatch(/Vật phẩm "potion": category phải là một trong consumable, ball/)
    expect(text).toMatch(/Vật phẩm "revive": category phải là một trong/)
  })

  it('trường không thuộc category báo lỗi', () => {
    const text = issuesAfter((raw) => {
      patch(raw, 'fireStone', { use: 'field', effects: [] })
      patch(raw, 'potion', { catchMultiplier: 2 })
      patch(raw, 'traitCrystal', { price: 100 })
    })
    expect(text).toMatch(/"fireStone": trường "use" không thuộc category "evolutionStone"/)
    expect(text).toMatch(/"fireStone": trường "effects" không thuộc category "evolutionStone"/)
    expect(text).toMatch(/"potion": trường "catchMultiplier" không thuộc category "consumable"/)
    expect(text).toMatch(/"traitCrystal": trường "price" không thuộc category "traitCrystal"/)
  })
})

describe('checkItems: luật từng category', () => {
  it('consumable: thiếu effects, use sai, price âm; effects rỗng hợp lệ (món ăn dưỡng dục)', () => {
    const text = issuesAfter((raw) => {
      patch(raw, 'potion', { effects: undefined })
      patch(raw, 'revive', { effects: [], price: -1 })
      patch(raw, 'genderPotion', { use: 'nowhere' })
    })
    expect(text).toMatch(/"potion": thiếu danh sách hiệu ứng/)
    expect(text).not.toMatch(/"revive": cần ít nhất một hiệu ứng/)
    expect(text).toMatch(/"revive": price phải là số hữu hạn ≥ 0/)
    expect(text).toMatch(/"genderPotion": use phải là "field", "battle" hoặc "both"/)
  })

  it('ball: catchMultiplier phải > 0 và hữu hạn', () => {
    const text = issuesAfter((raw) => {
      patch(raw, 'ball', { catchMultiplier: 0 })
      patch(raw, 'masterBall', { catchMultiplier: Infinity })
    })
    expect(text).toMatch(/"ball": catchMultiplier phải là số hữu hạn/)
    expect(text).toMatch(/"masterBall": catchMultiplier phải là số hữu hạn/)
  })

  it('evolutionStone: price phải là số', () => {
    expect(issuesAfter((raw) => patch(raw, 'fireStone', { price: 'đắt' }))).toMatch(
      /"fireStone": price phải là số hữu hạn ≥ 0/
    )
  })

  it('traitCrystal: phải có đúng một định nghĩa', () => {
    const none = issuesAfter((raw) => {
      raw.items = raw.items.filter((item) => item.category !== 'traitCrystal')
    })
    expect(none).toMatch(/cần đúng một vật phẩm category "traitCrystal", có 0/)
    const two = issuesAfter((raw) => {
      raw.items.push({ id: 'crystal2', category: 'traitCrystal' })
    })
    expect(two).toMatch(/cần đúng một vật phẩm category "traitCrystal", có 2/)
  })
})

describe('item nhận theo số lượng phải gộp chồng theo id', () => {
  it('bảng rơi của biome / boss và đồ khởi đầu không được là tinh thể trait', () => {
    const text = issuesAfter((raw) => {
      raw.biomes[0].drops = [{ itemId: 'traitCrystal', chance: 10 }]
      raw.biomes[0].bosses[0].drops = [{ itemId: 'traitCrystal', chance: 10 }]
      raw.config.starter.items = { traitCrystal: 1 }
    })
    expect(text).toMatch(/Biome "field": vật phẩm rơi "traitCrystal" \(traitCrystal\) không gộp/)
    expect(text).toMatch(
      /boss "strongling": vật phẩm rơi "traitCrystal" \(traitCrystal\) không gộp/
    )
    expect(text).toMatch(/config\.starter\.items: vật phẩm "traitCrystal" \(traitCrystal\)/)
  })

  it('đồ khởi đầu không tồn tại', () => {
    expect(issuesAfter((raw) => (raw.config.starter.items = { ghost: 1 }))).toMatch(
      /config\.starter\.items: vật phẩm không tồn tại "ghost"/
    )
  })
})

describe('checkItems: cửa hàng (shop / shopWeight)', () => {
  it('shop: true kèm shopWeight > 0 hợp lệ ở mọi category có giá', () => {
    const text = issuesAfter((raw) => {
      patch(raw, 'fireStone', { shop: true, shopWeight: 0.5 })
      patch(raw, 'masterBall', { shop: true, shopWeight: Number.MAX_SAFE_INTEGER })
    })
    expect(text).toBe('')
  })

  it('shop không phải true, thiếu / sai shopWeight, shopWeight không có shop', () => {
    const text = issuesAfter((raw) => {
      patch(raw, 'potion', { shop: false })
      patch(raw, 'ball', { shopWeight: 0 })
      patch(raw, 'antidote', { shopWeight: undefined })
      patch(raw, 'revive', { shopWeight: 5 })
      patch(raw, 'fullHeal', { shop: true, shopWeight: Infinity })
    })
    expect(text).toMatch(/"potion": shop chỉ được ghi true/)
    expect(text).toMatch(/"ball": shopWeight phải là số hữu hạn ≥ /)
    expect(text).toMatch(/"antidote": shopWeight phải là số hữu hạn/)
    expect(text).toMatch(/"revive": shopWeight chỉ dùng khi shop: true/)
    expect(text).toMatch(/"fullHeal": shopWeight phải là số hữu hạn/)
  })

  it('tinh thể trait không có shop / shopWeight (giá theo trait + cấp)', () => {
    const text = issuesAfter((raw) => patch(raw, 'traitCrystal', { shop: true, shopWeight: 1 }))
    expect(text).toMatch(/"traitCrystal".*shop/)
  })
})

describe('checkConfig: tinh thể và cửa hàng', () => {
  it('số âm, stockMin > stockMax, sellPercent > 100', () => {
    const text = issuesAfter((raw) => {
      raw.config.crystal = { ...raw.config.crystal, extractCostBase: -1 }
      raw.config.shop = {
        ...raw.config.shop,
        stockMin: 0,
        stockMax: -1,
        sellPercent: 101,
        crystalBuyMultiplier: -2
      }
    })
    expect(text).toMatch(/config\.crystal\.extractCostBase phải là số hữu hạn ≥ 0/)
    expect(text).toMatch(/config\.shop\.stockMin phải là số nguyên ≥ 1/)
    expect(text).toMatch(/config\.shop\.stockMax phải là số nguyên ≥ 0/)
    expect(text).toMatch(/config\.shop\.sellPercent phải là số hữu hạn trong \[0, 100\]/)
    expect(text).toMatch(/config\.shop\.crystalBuyMultiplier/)
  })

  it('bảng theo loại trait: thiếu loại, thừa loại, giá trị sai, không phải object', () => {
    const text = issuesAfter((raw) => {
      // Giả lập JSON sai (không theo kiểu).
      raw.config.crystal = {
        ...raw.config.crystal,
        kindCostMultipliers: { positive: 1, negative: 1, shiny: 2 } as unknown as Record<
          'positive' | 'negative' | 'rare',
          number
        >
      }
      raw.config.shop = {
        ...raw.config.shop,
        crystalWeights: { positive: -1, negative: 1, rare: 1 }
      }
    })
    expect(text).toMatch(/config\.crystal\.kindCostMultipliers: thiếu loại trait "rare"/)
    expect(text).toMatch(/kindCostMultipliers: "shiny" không phải loại trait có tinh thể/)
    expect(text).toMatch(/config\.shop\.crystalWeights\.positive phải là số hữu hạn ≥ 0/)
    const missing = issuesAfter((raw) => {
      Object.assign(raw.config, { shop: { ...raw.config.shop, crystalWeights: null } })
    })
    expect(missing).toMatch(/config\.shop\.crystalWeights phải là object/)
  })
})

describe('checkItems: bùa fuse, giá cố định, đồ rơi', () => {
  it('fusionAid: thiếu / rỗng effects, hook lạ, points ngoài [0, 100], hai ô trong một bùa', () => {
    const text = issuesAfter((raw) => {
      patch(raw, 'fusionCharm', { effects: [] })
      patch(raw, 'fusionAmulet', {
        effects: [
          { type: 'fuseProtect', params: {} },
          { type: 'fuseChanceBonus', params: { points: 10 } }
        ]
      })
      raw.items.push({ id: 'noEffects', category: 'fusionAid', price: 1 } as unknown as Item, {
        id: 'oddCharm',
        category: 'fusionAid',
        price: 1,
        effects: [
          { type: 'teleport', params: {} },
          { type: 'fuseChanceBonus', params: { points: 120 } }
        ]
      })
    })
    expect(text).toMatch(/"fusionCharm": cần ít nhất một hiệu ứng/)
    expect(text).toMatch(/"fusionAmulet": mọi hiệu ứng của một bùa phải cùng ô/)
    expect(text).toMatch(/"noEffects": thiếu danh sách hiệu ứng/)
    expect(text).toMatch(/"oddCharm": hook "teleport" chưa có trong registry/)
    expect(text).toMatch(/"oddCharm": hook "fuseChanceBonus": points/)
    // Hook lạ không tính là một ô.
    expect(text).not.toMatch(/"oddCharm": mọi hiệu ứng/)
  })

  it('fusionAid: trường không thuộc category báo lỗi', () => {
    const text = issuesAfter((raw) => patch(raw, 'fusionCharm', { use: 'field' }))
    expect(text).toMatch(/"fusionCharm": trường "use" không thuộc category "fusionAid"/)
  })

  it('fixedPrice chỉ ghi true', () => {
    expect(issuesAfter((raw) => patch(raw, 'potion', { fixedPrice: true }))).toBe('')
    const text = issuesAfter((raw) => patch(raw, 'potion', { fixedPrice: false }))
    expect(text).toMatch(/"potion": fixedPrice chỉ được ghi true/)
  })

  it('bùa fuse không được rơi từ quái hoang, bảng chung của boss hay đồ riêng của boss', () => {
    const text = issuesAfter((raw) => {
      const biome = defined(raw.biomes[0])
      biome.drops = [{ itemId: 'fusionCharm', chance: 10 }]
      biome.bossDrops = [{ itemId: 'fusionAmulet', chance: 10 }]
      defined(biome.bosses[0]).drops = [{ itemId: 'fusionCharm', chance: 10 }]
    })
    expect(text).toMatch(/Biome "field": vật phẩm "fusionCharm" \(fusionAid\) không được rơi/)
    expect(text).toMatch(/bossDrops: vật phẩm "fusionAmulet" \(fusionAid\) không được rơi/)
    expect(text).toMatch(/boss.*"fusionCharm" \(fusionAid\) không được rơi/)
  })
})
