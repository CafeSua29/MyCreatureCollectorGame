// Kiểm tra dữ liệu luyện đan / luyện khí / nấu ăn (docs/rules/alchemy.md, cooking.md): recipes.json,
// config.alchemy, config.cooking, mỗi công thức cần đan phương có đúng một đan phương.

import { raceRefIds } from '../registries'
import { itemStorage } from '../inventory'
import { CRAFT_STATIONS, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkDrops, checkKnownFields, checkMaterialMap } from './checks'
import { checkItemGroupId } from './validateItemGroups'

const RECIPE_FIELDS = [
  'id',
  'station',
  'output',
  'inputs',
  'money',
  'minLevel',
  'successChance',
  'exp',
  'scroll'
]

const CONFIG_FIELDS = [
  'expBase',
  'expPower',
  'levelBonusPercent',
  'raceEssenceItemIds',
  'elementStoneItemIds',
  'essenceChance',
  'stoneChance',
  'wildDrops',
  'bossDrops'
]

/** Một món { itemId gộp chồng, count nguyên ≥ 1 }. */
function checkAmount(data: GameData, value: unknown, at: string, issues: string[]): void {
  const amount = asObject(value)
  const itemId = amount?.itemId
  const item = typeof itemId === 'string' ? data.items[itemId] : undefined
  if (!item || itemStorage(item.category) !== 'stack') {
    issues.push(`${at}.itemId phải là vật phẩm gộp chồng, nhận "${String(itemId)}"`)
  }
  issues.push(...checkInteger(amount?.count, `${at}.count`, 1))
}

/** Nguyên liệu: { itemId, count } hoặc { groupId (nhóm config.itemGroups), count }. */
function checkInput(data: GameData, value: unknown, at: string, issues: string[]): void {
  const input = asObject(value)
  if (input && Object.hasOwn(input, 'groupId')) {
    checkKnownFields(input, ['groupId', 'count', 'sameItem'], at, 'nguyên liệu', issues)
    issues.push(...checkItemGroupId(data, input.groupId, at))
    issues.push(...checkInteger(input.count, `${at}.count`, 1))
    if (input.sameItem !== undefined && input.sameItem !== true) {
      issues.push(`${at}.sameItem chỉ được là true`)
    }
    return
  }
  checkAmount(data, value, at, issues)
}

function checkRecipes(data: GameData, issues: string[]): void {
  for (const recipe of Object.values(data.recipes)) {
    const where = `Công thức "${recipe.id}"`
    checkKnownFields(recipe, RECIPE_FIELDS, where, 'công thức', issues)
    if (recipe.station !== undefined && !CRAFT_STATIONS.includes(recipe.station)) {
      issues.push(`${where}: station lạ "${String(recipe.station)}"`)
    }
    // Đan phương / công thức đã học hiện chỉ lưu cho luyện đan (alchemy.knownRecipes).
    if (recipe.scroll && recipe.station !== undefined && recipe.station !== 'alchemy') {
      issues.push(`${where}: công thức ${recipe.station} chưa hỗ trợ scroll`)
    }
    checkAmount(data, recipe.output, `${where}: output`, issues)
    if (!Array.isArray(recipe.inputs) || recipe.inputs.length === 0) {
      issues.push(`${where}: inputs phải là danh sách không rỗng`)
    } else {
      recipe.inputs.forEach((input, i) => checkInput(data, input, `${where}: inputs[${i}]`, issues))
    }
    issues.push(...checkNumber(recipe.money, `${where}: money`, 0))
    issues.push(...checkInteger(recipe.minLevel, `${where}: minLevel`, 1))
    issues.push(...checkNumber(recipe.successChance, `${where}: successChance`, 0, 100))
    issues.push(...checkNumber(recipe.exp, `${where}: exp`, 0))
    if (recipe.scroll !== undefined && recipe.scroll !== true) {
      issues.push(`${where}: scroll chỉ được là true`)
    }
    const scrolls = Object.values(data.items).filter(
      (item) => item.category === 'recipeScroll' && item.recipeId === recipe.id
    ).length
    if (recipe.scroll && scrolls !== 1) {
      issues.push(`${where}: cần đúng một đan phương, có ${scrolls}`)
    }
  }
}

function checkConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.alchemy)
  if (!config) {
    issues.push('config.alchemy phải là object')
    return
  }
  const at = (field: string): string => `config.alchemy.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.alchemy', 'config', issues)
  issues.push(...checkNumber(config.expBase, at('expBase'), Number.MIN_VALUE))
  issues.push(...checkNumber(config.expPower, at('expPower'), Number.MIN_VALUE))
  issues.push(...checkNumber(config.levelBonusPercent, at('levelBonusPercent'), 0))
  issues.push(...checkNumber(config.essenceChance, at('essenceChance'), 0, 100))
  issues.push(...checkNumber(config.stoneChance, at('stoneChance'), 0, 100))
  checkMaterialMap(
    data,
    config.raceEssenceItemIds,
    { at: at('raceEssenceItemIds'), known: raceRefIds(data) },
    issues
  )
  checkMaterialMap(
    data,
    config.elementStoneItemIds,
    { at: at('elementStoneItemIds'), known: data.elements },
    issues
  )
  for (const key of ['wildDrops', 'bossDrops'] as const) {
    if (!Array.isArray(config[key])) issues.push(`${at(key)} phải là danh sách`)
    else checkDrops(data, config[key], at(key), issues)
  }
}

/** config.cooking: đường cong cấp nấu ăn (docs/rules/cooking.md). */
function checkCookingConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.cooking)
  if (!config) {
    issues.push('config.cooking phải là object')
    return
  }
  const at = (field: string): string => `config.cooking.${field}`
  checkKnownFields(
    config,
    ['expBase', 'expPower', 'levelBonusPercent'],
    'config.cooking',
    'config',
    issues
  )
  issues.push(...checkNumber(config.expBase, at('expBase'), Number.MIN_VALUE))
  issues.push(...checkNumber(config.expPower, at('expPower'), Number.MIN_VALUE))
  issues.push(...checkNumber(config.levelBonusPercent, at('levelBonusPercent'), 0))
}

/** Kiểm tra mọi dữ liệu luyện đan / nấu ăn. */
export function checkAlchemyData(data: GameData, issues: string[]): void {
  checkRecipes(data, issues)
  checkConfig(data, issues)
  checkCookingConfig(data, issues)
}
