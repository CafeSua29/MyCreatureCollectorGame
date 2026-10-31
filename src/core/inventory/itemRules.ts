// Luật chung theo category của item: nằm ở phần nào của túi, dùng được ở đâu, nhắm ai.
// Mỗi hàm switch đủ mọi category (assertNever): thêm category mới thì TypeScript báo chỗ cần xử lý.

import { ActionError, assertNever } from '../shared'
import type { GameOptions, Item, ItemCategory, ItemTarget } from '../model'

/**
 * Phần của túi chứa item: chồng theo id, chồng tinh thể (trait + cấp), chồng sách (skill + loại),
 * hay món riêng.
 */
export type ItemStorage = 'stack' | 'crystal' | 'book' | 'instance'

/** Nơi dùng trực tiếp một item (action useItem ngoài trận, lệnh item trong trận). */
export type ItemUseContext = 'field' | 'battle'

/** Item thuộc category này nằm ở phần nào của túi. */
export function itemStorage(category: ItemCategory): ItemStorage {
  switch (category) {
    case 'consumable':
    case 'ball':
    case 'evolutionStone':
    case 'held':
    case 'fusionAid':
    case 'keyItem':
    case 'megaStone':
    case 'teraShard':
    case 'zCrystal':
    case 'material':
    case 'formationScroll':
    case 'recipeScroll':
    case 'seed':
    case 'soulCrystal':
    case 'bait':
    case 'dish':
    case 'charm':
      return 'stack'
    case 'traitCrystal':
      return 'crystal'
    case 'skillBook':
      return 'book'
    case 'equipment':
      return 'instance'
    default:
      return assertNever(category, 'category vật phẩm')
  }
}

/**
 * Những nơi dùng trực tiếp được item; rỗng = không dùng trực tiếp (lắp, inject, dùng khi fuse, sách
 * dùng qua action riêng useSkillBook, mồi dụ qua useBait, món ăn qua eatDish...).
 */
export function itemUseContexts(item: Item): readonly ItemUseContext[] {
  switch (item.category) {
    case 'consumable':
      return item.use === 'both' ? ['field', 'battle'] : [item.use]
    case 'ball':
      return ['battle']
    case 'evolutionStone':
      return ['field']
    case 'held':
    case 'equipment':
    case 'traitCrystal':
    case 'fusionAid':
    case 'keyItem':
    case 'megaStone':
    case 'teraShard':
    case 'zCrystal':
    case 'material':
    case 'formationScroll':
    case 'recipeScroll':
    case 'seed':
    case 'soulCrystal':
    case 'skillBook':
    case 'bait':
    case 'dish':
    case 'charm':
      return []
    default:
      return assertNever(item, 'vật phẩm')
  }
}

/**
 * Item dùng trực tiếp nhắm ai: quái của ta (`ally`) hay quái hoang trên sân (`enemy`: bóng,
 * vật phẩm ném); null nếu không dùng trực tiếp.
 */
export function itemTarget(item: Item): ItemTarget | null {
  switch (item.category) {
    case 'consumable':
      return item.target
    case 'ball':
      return 'enemy'
    case 'evolutionStone':
      return 'ally'
    case 'held':
    case 'equipment':
    case 'traitCrystal':
    case 'fusionAid':
    case 'keyItem':
    case 'megaStone':
    case 'teraShard':
    case 'zCrystal':
    case 'material':
    case 'formationScroll':
    case 'recipeScroll':
    case 'seed':
    case 'soulCrystal':
    case 'skillBook':
    case 'bait':
    case 'dish':
    case 'charm':
      return null
    default:
      return assertNever(item, 'vật phẩm')
  }
}

/**
 * Item có xuất hiện trong cửa hàng / bảng rơi theo tùy chọn luật chơi không (`requiresOption`, kiểu
 * Thọ Nguyên Đan khi tắt thọ nguyên). Món đã có trong túi không bị ảnh hưởng.
 */
export function isItemOffered(item: Item, options: GameOptions): boolean {
  const flag = 'requiresOption' in item ? item.requiresOption : undefined
  return flag === undefined || options[flag]
}

/** Item có được nằm trong bảng đồ rơi của quái hoang / boss không (bùa fuse không rơi). */
export function itemDropsFromMonsters(category: ItemCategory): boolean {
  switch (category) {
    case 'consumable':
    case 'ball':
    case 'evolutionStone':
    case 'held':
    case 'equipment':
    case 'traitCrystal':
    case 'megaStone':
    case 'teraShard':
    case 'zCrystal':
    case 'material':
    case 'formationScroll':
    case 'recipeScroll':
    case 'seed':
    case 'soulCrystal':
    case 'skillBook':
    case 'bait':
    case 'dish':
      return true
    // Bùa fuse chỉ ở cửa hàng; vật phẩm chìa khóa chỉ nhận ở tầng mốc; bùa chỉ nhận từ thưởng Dex.
    case 'fusionAid':
    case 'keyItem':
    case 'charm':
      return false
    default:
      return assertNever(category, 'category vật phẩm')
  }
}

/** Item thuộc category này lắp vào ô trên quái được không (trang bị, đồ cầm). */
export function isEquippable(category: ItemCategory): boolean {
  switch (category) {
    case 'held':
    case 'equipment':
    case 'megaStone':
    case 'zCrystal':
      return true
    case 'consumable':
    case 'ball':
    case 'evolutionStone':
    case 'traitCrystal':
    case 'fusionAid':
    case 'keyItem':
    case 'teraShard':
    case 'material':
    case 'formationScroll':
    case 'recipeScroll':
    case 'seed':
    case 'soulCrystal':
    case 'skillBook':
    case 'bait':
    case 'dish':
    case 'charm':
      return false
    default:
      return assertNever(category, 'category vật phẩm')
  }
}

/**
 * Item thuộc category này có rời túi được không (bán, vứt): vật phẩm chìa khóa (mục "Vật phẩm chìa
 * khóa" ở transformation.md) và bùa (dex.md) thì không.
 */
export function canLeaveBag(category: ItemCategory): boolean {
  return category !== 'keyItem' && category !== 'charm'
}

/** Ném ActionError nếu item không dùng trực tiếp được ở context này. */
export function assertUsableIn(item: Item, context: ItemUseContext): void {
  const contexts = itemUseContexts(item)
  if (contexts.includes(context)) return
  if (contexts.length === 0) throw new ActionError('itemNotUsable', { itemId: item.id })
  throw new ActionError('itemWrongContext', { itemId: item.id, context })
}
