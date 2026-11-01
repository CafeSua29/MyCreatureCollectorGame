// Kiểm tra dữ liệu thần linh (docs/rules/deities.md): deities.json và config.deities. Map trỏ tới thần
// (Biome.deityId) kiểm tra ở checkBiomes.

import { itemDropsFromMonsters } from '../inventory'
import { BLESSING_EFFECTS, isBlessingEffectType } from '../registries'
import {
  ITEM_CATEGORIES,
  type BlessingDef,
  type DeityConfig,
  type DeityDef,
  type DeityShopEntry,
  type GameData
} from '../model'
import { asObject, checkInteger, checkNumber, isFiniteNumber } from '../shared'
import { checkKnownFields, checkStackItemId, fieldList } from './checks'

const DEITY_FIELDS = fieldList<DeityDef>({
  id: true,
  elementId: true,
  tokenItemId: true,
  blessings: true,
  shop: true
})
const BLESSING_FIELDS = fieldList<BlessingDef>({ effects: true })
const SHOP_FIELDS = fieldList<DeityShopEntry>({ itemId: true, price: true, minRank: true })
const CONFIG_FIELDS = fieldList<DeityConfig>({
  favorPerWin: true,
  favorPerBossWin: true,
  favorPerCapture: true,
  incenseItemId: true,
  favorPerIncense: true,
  rankBase: true,
  rankPower: true,
  tokenWildChance: true,
  tokenBossChance: true
})

/** Tín vật: vật phẩm gộp chồng, rơi được từ quái. */
function checkToken(data: GameData, itemId: unknown, where: string, issues: string[]): void {
  if (typeof itemId !== 'string') {
    issues.push(`${where}: tokenItemId phải là id vật phẩm`)
    return
  }
  const problems = checkStackItemId(data, itemId, where, 'tín vật')
  issues.push(...problems)
  const item = data.items[itemId]
  if (problems.length > 0 || !item || !ITEM_CATEGORIES.includes(item.category)) return
  if (!itemDropsFromMonsters(item.category)) {
    issues.push(`${where}: tín vật "${itemId}" (${item.category}) không được rơi từ quái`)
  }
}

/** Chúc phúc: danh sách không rỗng, mỗi chúc phúc ít nhất một hiệu ứng hợp lệ. */
function checkBlessings(blessings: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(blessings) || blessings.length === 0) {
    issues.push(`${where}: blessings phải là danh sách không rỗng`)
    return
  }
  blessings.forEach((blessing: unknown, i) => {
    const at = `${where}: blessings[${i}]`
    checkKnownFields(blessing, BLESSING_FIELDS, at, 'chúc phúc', issues)
    const effects = asObject(blessing)?.effects
    if (!Array.isArray(effects) || effects.length === 0) {
      issues.push(`${at}: effects phải là danh sách không rỗng`)
      return
    }
    effects.forEach((effect: unknown, j) => {
      const obj = asObject(effect)
      const type = obj?.type
      if (typeof type !== 'string' || !isBlessingEffectType(type)) {
        issues.push(`${at}.effects[${j}]: loại hiệu ứng lạ "${String(type)}"`)
        return
      }
      checkKnownFields(obj, ['type', 'params'], `${at}.effects[${j}]`, 'hiệu ứng', issues)
      for (const issue of BLESSING_EFFECTS[type].validateParams(obj?.params)) {
        issues.push(`${at}.effects[${j}] (${type}): ${issue}`)
      }
    })
  })
}

/** Cửa hàng thần: món gộp chồng không trùng, giá nguyên ≥ 1 tín vật, bậc nguyên ≥ 0. */
function checkShop(data: GameData, shop: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(shop)) {
    issues.push(`${where}: shop phải là danh sách`)
    return
  }
  const seen = new Set<string>()
  shop.forEach((entry: unknown, i) => {
    const at = `${where}: shop[${i}]`
    const obj = asObject(entry)
    if (!obj) {
      issues.push(`${at} phải là object`)
      return
    }
    checkKnownFields(obj, SHOP_FIELDS, at, 'món cửa hàng thần', issues)
    if (typeof obj.itemId !== 'string') issues.push(`${at}: itemId phải là id vật phẩm`)
    else {
      issues.push(...checkStackItemId(data, obj.itemId, at))
      if (seen.has(obj.itemId)) issues.push(`${at}: món "${obj.itemId}" bị trùng`)
      seen.add(obj.itemId)
    }
    issues.push(...checkInteger(obj.price, `${at}: price`, 1))
    issues.push(...checkInteger(obj.minRank, `${at}: minRank`, 0))
  })
}

function checkDeity(data: GameData, deity: DeityDef, issues: string[]): void {
  const where = `Thần "${deity.id}"`
  checkKnownFields(deity, DEITY_FIELDS, where, 'thần', issues)
  if (typeof deity.elementId !== 'string' || !Object.hasOwn(data.elements, deity.elementId)) {
    issues.push(`${where}: hệ không tồn tại "${String(deity.elementId)}"`)
  }
  checkToken(data, deity.tokenItemId, where, issues)
  checkBlessings(deity.blessings, where, issues)
  checkShop(data, deity.shop, where, issues)
}

/** config.deities: số không âm, đường cong bậc dương, Hương nến là vật phẩm gộp chồng có giá. */
function checkDeityConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.deities)
  if (!config) {
    issues.push('config.deities phải là object')
    return
  }
  const at = (field: string): string => `config.deities.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.deities', 'config', issues)
  for (const field of ['favorPerWin', 'favorPerBossWin', 'favorPerCapture', 'favorPerIncense']) {
    issues.push(...checkInteger(config[field], at(field), 0))
  }
  for (const field of ['rankBase', 'rankPower']) {
    const value = config[field]
    if (!isFiniteNumber(value) || value <= 0) {
      issues.push(`${at(field)} phải là số dương, nhận ${String(value)}`)
    }
  }
  issues.push(...checkNumber(config.tokenWildChance, at('tokenWildChance'), 0, 100))
  issues.push(...checkNumber(config.tokenBossChance, at('tokenBossChance'), 0, 100))
  if (typeof config.incenseItemId !== 'string') {
    issues.push(`${at('incenseItemId')} phải là id vật phẩm`)
  } else {
    const problems = checkStackItemId(data, config.incenseItemId, at('incenseItemId'))
    issues.push(...problems)
    // Miếu bán hương theo giá vật phẩm (itemBuyPrice) nên hương phải có price.
    const item = data.items[config.incenseItemId]
    if (problems.length === 0 && item && !('price' in item)) {
      issues.push(`${at('incenseItemId')}: Hương nến "${item.id}" phải có price`)
    }
  }
}

/** Kiểm tra thần linh và config.deities. */
export function checkDeityData(data: GameData, issues: string[]): void {
  checkDeityConfig(data, issues)
  for (const deity of Object.values(data.deities)) checkDeity(data, deity, issues)
}
