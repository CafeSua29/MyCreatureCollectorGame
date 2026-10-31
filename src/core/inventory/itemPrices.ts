// Giá item (mục "Cửa hàng và vứt vật phẩm"): giá gốc theo định danh, giá bán, giá mua. Tính bằng
// Decimal vì cấp tinh thể và tầng không có trần. Vật phẩm có price nhân highestFloor (tiền thưởng
// tăng theo tầng nên giá phải tăng theo), trừ item ghi fixedPrice; tinh thể tính theo trait + cấp.

import { assertNever, toBig, type Decimal } from '../shared'
import { hasCrystal, type GameData, type ItemEntry } from '../model'
import { equipmentBasePrice } from './equipment'
import { skillBookPrice } from './skillBooks'

/** Giá extract tinh thể = extractCostBase × cấp² × hệ số theo loại trait (mục "Extract / inject trait"). */
export function crystalExtractCost(data: GameData, traitId: string, level: number): Decimal {
  const { kind } = data.traits[traitId]
  if (!hasCrystal(kind)) throw new Error(`Trait "${traitId}" loại "${kind}" không có tinh thể`)
  const { extractCostBase, kindCostMultipliers } = data.config.crystal
  return toBig(extractCostBase).times(toBig(level).pow(2)).times(kindCostMultipliers[kind])
}

/** Giá item gộp chồng = price × highestFloor (fixedPrice: chỉ price); tinh thể không có `price`. */
function stackItemPrice(data: GameData, itemId: string, highestFloor: number): Decimal {
  const item = data.items[itemId]
  switch (item.category) {
    case 'consumable':
    case 'ball':
    case 'evolutionStone':
    case 'held':
    case 'fusionAid':
    case 'megaStone':
    case 'teraShard':
    case 'zCrystal':
    case 'material':
    case 'formationScroll':
    case 'recipeScroll':
    case 'seed':
    case 'soulCrystal':
    case 'bait':
      return item.fixedPrice ? toBig(item.price) : toBig(item.price).times(highestFloor)
    case 'equipment':
      throw new Error(`Trang bị "${itemId}" tính giá theo từng món (equipmentBasePrice)`)
    case 'traitCrystal':
    case 'skillBook':
    case 'keyItem':
    case 'charm':
      throw new Error(`Vật phẩm "${itemId}" không có price`)
    default:
      return assertNever(item, 'vật phẩm')
  }
}

/**
 * Giá gốc của item (định danh đã kiểm tra bằng parseItemRef, hoặc chính món trang bị) ở tầng cao
 * nhất đã mở: `price × highestFloor` (hoặc `price` nếu fixedPrice), tinh thể = giá extract, sách theo
 * skill (skillBookPrice), trang bị thêm × hệ số bậc.
 */
export function itemBasePrice(data: GameData, entry: ItemEntry, highestFloor: number): Decimal {
  switch (entry.storage) {
    case 'stack':
      return stackItemPrice(data, entry.itemId, highestFloor)
    case 'crystal':
      return crystalExtractCost(data, entry.traitId, entry.level)
    case 'book':
      return skillBookPrice(data, entry, highestFloor)
    case 'instance':
      return equipmentBasePrice(data, entry.instance, highestFloor)
    default:
      return assertNever(entry, 'item')
  }
}

/** Giá bán mỗi món = sellPercent % giá gốc lúc bán, làm tròn xuống. */
export function itemSellPrice(data: GameData, entry: ItemEntry, highestFloor: number): Decimal {
  return itemBasePrice(data, entry, highestFloor)
    .times(data.config.shop.sellPercent)
    .div(100)
    .floor()
}

/**
 * Giá mua mỗi món: vật phẩm, trang bị = giá gốc; tinh thể = crystalBuyMultiplier × giá extract (mua
 * rồi bán lại không có lời).
 */
export function itemBuyPrice(data: GameData, entry: ItemEntry, highestFloor: number): Decimal {
  const base = itemBasePrice(data, entry, highestFloor)
  return entry.storage === 'crystal' ? base.times(data.config.shop.crystalBuyMultiplier) : base
}
