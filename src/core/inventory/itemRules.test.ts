import { describe, expect, it } from 'vitest'
import { ActionError } from '../shared'
import { makeData, expectActionError } from '../testing'
import { ITEM_CATEGORIES, type Item } from '../model'
import { assertUsableIn, itemDropsFromMonsters, itemStorage, itemUseContexts } from './itemRules'

const data = makeData()

/** Item mẫu của các category chưa có trong dữ liệu (chỉ để kiểm tra luật chung). */
const futureItems: Item[] = [
  {
    id: 'berry',
    category: 'held',
    price: 10,
    hooks: [{ type: 'surviveLethal', params: { fromFullHp: true } }]
  },
  {
    id: 'sword',
    category: 'equipment',
    price: 10,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.attack',
      ranges: {}
    }
  },
  { id: 'charm', category: 'fusionAid', price: 10, effects: [] }
]

describe('itemStorage', () => {
  it('mọi category đều có phần túi: trang bị là món riêng, tinh thể và sách riêng, còn lại gộp theo id', () => {
    const storage = Object.fromEntries(ITEM_CATEGORIES.map((c) => [c, itemStorage(c)]))
    expect(storage).toEqual({
      consumable: 'stack',
      ball: 'stack',
      evolutionStone: 'stack',
      held: 'stack',
      equipment: 'instance',
      traitCrystal: 'crystal',
      fusionAid: 'stack',
      keyItem: 'stack',
      megaStone: 'stack',
      teraShard: 'stack',
      zCrystal: 'stack',
      material: 'stack',
      formationScroll: 'stack',
      recipeScroll: 'stack',
      seed: 'stack',
      soulCrystal: 'stack',
      skillBook: 'book',
      bait: 'stack',
      charm: 'stack'
    })
  })

  it('category lạ (dữ liệu hỏng lúc chạy) ném lỗi', () => {
    expect(() => itemStorage('weird' as never)).toThrow(/category vật phẩm/)
  })
})

describe('itemUseContexts', () => {
  it('thuốc theo use; bóng trong trận; đá ngoài trận', () => {
    expect(itemUseContexts(data.items.potion)).toEqual(['field', 'battle'])
    expect(itemUseContexts(data.items.genderPotion)).toEqual(['field'])
    expect(itemUseContexts(data.items.ball)).toEqual(['battle'])
    expect(itemUseContexts(data.items.fireStone)).toEqual(['field'])
  })

  it('tinh thể, đồ cầm, trang bị, bùa fuse không dùng trực tiếp', () => {
    expect(itemUseContexts(data.items.traitCrystal)).toEqual([])
    for (const item of futureItems) expect(itemUseContexts(item)).toEqual([])
  })
})

describe('assertUsableIn', () => {
  it('dùng đúng nơi thì không ném', () => {
    expect(() => assertUsableIn(data.items.potion, 'battle')).not.toThrow()
    expect(() => assertUsableIn(data.items.fireStone, 'field')).not.toThrow()
  })

  it('sai nơi hoặc không dùng trực tiếp được thì ném ActionError có lý do', () => {
    expectActionError(() => assertUsableIn(data.items.ball, 'field'), 'itemWrongContext', {
      itemId: 'ball',
      context: 'field'
    })
    expectActionError(() => assertUsableIn(data.items.fireStone, 'battle'), 'itemWrongContext', {
      context: 'battle'
    })
    expect(() => assertUsableIn(data.items.traitCrystal, 'field')).toThrow(ActionError)
    expectActionError(() => assertUsableIn(futureItems[1], 'battle'), 'itemNotUsable')
  })
})

describe('itemDropsFromMonsters', () => {
  it('mọi category rơi được trừ bùa fuse, vật phẩm chìa khóa và bùa Dex', () => {
    const drops = Object.fromEntries(ITEM_CATEGORIES.map((c) => [c, itemDropsFromMonsters(c)]))
    expect(drops).toEqual({
      consumable: true,
      ball: true,
      evolutionStone: true,
      held: true,
      equipment: true,
      traitCrystal: true,
      fusionAid: false,
      keyItem: false,
      megaStone: true,
      teraShard: true,
      zCrystal: true,
      material: true,
      formationScroll: true,
      recipeScroll: true,
      seed: true,
      soulCrystal: true,
      skillBook: true,
      bait: true,
      charm: false
    })
  })
})
