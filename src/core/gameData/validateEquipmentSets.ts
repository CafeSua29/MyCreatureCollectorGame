// Kiểm tra bộ trang bị (docs/rules/equipment-sets.md): equipmentSets.json (union theo kind, hook qua
// TRAIT_HOOKS, món gốc của bộ đặt tên khớp hai chiều với setId của món), setId trên món gốc và
// config.equipmentSets.

import { TRAIT_HOOKS } from '../registries'
import {
  EQUIPMENT_RARITIES,
  EQUIPMENT_SET_KINDS,
  type EquipmentItem,
  type GameData,
  type TraitHookDef
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkEffects, checkKnownFields } from './checks'
import { checkRarityTable } from './validateEquipment'

const WHERE = 'config.equipmentSets'
const PIECE_SOURCES = ['wild', 'boss', 'chest', 'auction'] as const
const ROLLED_FIELDS: readonly string[] = [
  'id',
  'kind',
  'size',
  'hooks',
  'weight',
  'wildcard',
  'seal',
  'sealable'
]
const NAMED_FIELDS: readonly string[] = ['id', 'kind', 'rarity', 'pieceItemIds', 'bonuses']
/** Số món tối thiểu của một lần kích hoạt / một bộ đặt tên. */
const MIN_SET_PIECES = 2

/** Kiểm tra config.equipmentSets. */
export function checkEquipmentSetConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.equipmentSets)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(
    config,
    ['pieceChance', 'reductionMinPieces', 'rerollMoney'],
    WHERE,
    WHERE,
    issues
  )
  const chances = asObject(config.pieceChance)
  if (!chances) issues.push(`${WHERE}.pieceChance phải là object`)
  checkKnownFields(chances, PIECE_SOURCES, `${WHERE}.pieceChance`, 'nguồn món bộ', issues)
  for (const source of PIECE_SOURCES) {
    issues.push(...checkNumber(chances?.[source], `${WHERE}.pieceChance.${source}`, 0, 100))
  }
  issues.push(
    ...checkInteger(config.reductionMinPieces, `${WHERE}.reductionMinPieces`, MIN_SET_PIECES)
  )
  checkRarityTable(
    config.rerollMoney,
    `${WHERE}.rerollMoney`,
    (entry, at) => checkNumber(entry, at, 0),
    issues
  )
}

/** Cờ chỉ được là true. */
function checkFlag(value: unknown, field: string, where: string, issues: string[]): void {
  if (value !== undefined && value !== true) issues.push(`${where}: ${field} chỉ được là true`)
}

/** Danh sách hook trait (có thể rỗng khi `allowEmpty`). */
function checkHooks(
  data: GameData,
  hooks: unknown,
  { where, allowEmpty }: { where: string; allowEmpty: boolean },
  issues: string[]
): void {
  if (!Array.isArray(hooks) || (!allowEmpty && hooks.length === 0)) {
    issues.push(`${where}: hooks phải là danh sách hook${allowEmpty ? '' : ' khác rỗng'}`)
    return
  }
  // Ép kiểu vì checkEffects tự kiểm tra từng hook (type có trong registry, params hợp lệ).
  checkEffects(TRAIT_HOOKS, hooks as TraitHookDef[], where, data, issues)
}

/** Bộ ngẫu nhiên: size nguyên ≥ 2, weight ≥ 0, cờ; bộ vô hình không có hook, bộ khác có hook. */
function checkRolledSet(
  data: GameData,
  set: Readonly<Record<string, unknown>>,
  where: string,
  issues: string[]
): void {
  checkKnownFields(set, ROLLED_FIELDS, where, 'bộ ngẫu nhiên', issues)
  issues.push(...checkInteger(set.size, `${where}: size`, MIN_SET_PIECES))
  issues.push(...checkNumber(set.weight, `${where}: weight`, 0))
  for (const field of ['wildcard', 'seal', 'sealable'] as const) {
    checkFlag(set[field], field, where, issues)
  }
  if (set.wildcard === true) {
    if (Array.isArray(set.hooks) && set.hooks.length > 0) {
      issues.push(`${where}: bộ vô hình không có hook`)
    }
    if (set.seal === true || set.sealable === true) {
      issues.push(`${where}: bộ vô hình không có seal / sealable`)
    }
  }
  // Bộ vô hình và bộ Seal không có hiệu ứng riêng ngoài cờ.
  const allowEmpty = set.wildcard === true || set.seal === true
  checkHooks(data, set.hooks, { where, allowEmpty }, issues)
}

/** Món gốc của bộ đặt tên: trang bị tồn tại, ghi ngược setId, đúng loại theo bậc của bộ. */
function checkPiece(
  data: GameData,
  { setId, rarity, itemId }: { setId: string; rarity: unknown; itemId: unknown },
  where: string
): string[] {
  const item = typeof itemId === 'string' ? data.items[itemId] : undefined
  if (item?.category !== 'equipment')
    return [`${where}: trang bị không tồn tại "${String(itemId)}"`]
  const issues: string[] = []
  if (item.setId !== setId) issues.push(`${where}: món "${item.id}" không ghi setId "${setId}"`)
  if (item.soulRelicStat !== undefined) issues.push(`${where}: món gốc hồn khí "${item.id}"`)
  if ((rarity === 'unique') !== (item.unique !== undefined)) {
    issues.push(`${where}: bộ bậc "unique" chỉ gồm món unique của boss và ngược lại ("${item.id}")`)
  }
  if (rarity !== 'unique') issues.push(...checkNormalPiece(item, rarity, where))
  return issues
}

/** Món bộ đặt tên bậc thường: dòng chính chỉ có khoảng bậc của bộ, không bán ở cửa hàng. */
function checkNormalPiece(item: EquipmentItem, rarity: unknown, where: string): string[] {
  const issues: string[] = []
  const rarities = Object.keys(item.mainLine.ranges)
  if (rarities.length !== 1 || rarities[0] !== rarity) {
    issues.push(`${where}: món "${item.id}" chỉ có khoảng dòng chính cho bậc "${String(rarity)}"`)
  }
  if (item.shop !== undefined) issues.push(`${where}: món "${item.id}" không bán ở cửa hàng`)
  return issues
}

/** Mốc thưởng: pieces nguyên tăng ngặt trong [2, số món], hook khác rỗng. */
function checkBonuses(
  data: GameData,
  { bonuses, pieceCount }: { bonuses: unknown; pieceCount: number },
  where: string,
  issues: string[]
): void {
  if (!Array.isArray(bonuses) || bonuses.length === 0) {
    issues.push(`${where}: bonuses phải là danh sách mốc khác rỗng`)
    return
  }
  let previous = 0
  bonuses.forEach((entry: unknown, i) => {
    const at = `${where}: bonuses[${i}]`
    const bonus = asObject(entry)
    if (!bonus) {
      issues.push(`${at} phải là { pieces, hooks }`)
      return
    }
    checkKnownFields(bonus, ['pieces', 'hooks'], at, 'mốc thưởng bộ', issues)
    const pieceIssues = checkInteger(bonus.pieces, `${at}.pieces`, MIN_SET_PIECES)
    issues.push(...pieceIssues)
    if (pieceIssues.length === 0 && Number(bonus.pieces) > pieceCount) {
      issues.push(`${at}.pieces vượt số món của bộ (${pieceCount})`)
    }
    if (pieceIssues.length === 0 && Number(bonus.pieces) <= previous) {
      issues.push(`${at}.pieces phải tăng dần`)
    }
    previous = Number(bonus.pieces)
    checkHooks(data, bonus.hooks, { where: at, allowEmpty: false }, issues)
  })
}

/** Bộ đặt tên: bậc, ≥ 2 món gốc không trùng khớp hai chiều, mốc thưởng tăng dần. */
function checkNamedSet(
  data: GameData,
  set: Readonly<Record<string, unknown>>,
  where: string,
  issues: string[]
): void {
  checkKnownFields(set, NAMED_FIELDS, where, 'bộ đặt tên', issues)
  if (!EQUIPMENT_RARITIES.some((rarity) => rarity === set.rarity)) {
    issues.push(`${where}: bậc không hợp lệ "${String(set.rarity)}"`)
  }
  const pieces = set.pieceItemIds
  if (!Array.isArray(pieces) || pieces.length < MIN_SET_PIECES) {
    issues.push(`${where}: pieceItemIds cần ít nhất ${MIN_SET_PIECES} món`)
    return
  }
  if (new Set(pieces).size !== pieces.length) issues.push(`${where}: pieceItemIds bị trùng món`)
  for (const itemId of pieces) {
    issues.push(...checkPiece(data, { setId: String(set.id), rarity: set.rarity, itemId }, where))
  }
  checkBonuses(data, { bonuses: set.bonuses, pieceCount: pieces.length }, where, issues)
}

/** setId trên món gốc: bộ tồn tại; bộ đặt tên thì món nằm trong pieceItemIds. */
function checkItemSetIds(data: GameData, issues: string[]): void {
  for (const item of Object.values(data.items)) {
    if (item.category !== 'equipment' || item.setId === undefined) continue
    const where = `Trang bị "${item.id}": setId`
    if (typeof item.setId !== 'string') {
      issues.push(`${where} phải là chuỗi`)
      continue
    }
    const set = Object.hasOwn(data.equipmentSets, item.setId)
      ? data.equipmentSets[item.setId]
      : undefined
    if (!set) issues.push(`${where}: bộ không tồn tại "${item.setId}"`)
    else if (set.kind === 'named' && !set.pieceItemIds.includes(item.id)) {
      issues.push(`${where}: bộ "${set.id}" không ghi món này trong pieceItemIds`)
    } else if (set.kind === 'rolled' && set.wildcard === true) {
      issues.push(`${where}: món gốc không cố định bộ vô hình "${set.id}"`)
    }
  }
}

/** Kiểm tra equipmentSets.json và setId trên món gốc. */
export function checkEquipmentSets(data: GameData, issues: string[]): void {
  for (const value of Object.values(data.equipmentSets)) {
    const set = asObject(value)
    const where = `Bộ trang bị "${String(set?.id)}"`
    if (!set) continue
    if (set.kind === 'rolled') checkRolledSet(data, set, where, issues)
    else if (set.kind === 'named') checkNamedSet(data, set, where, issues)
    else {
      issues.push(`${where}: kind phải là một trong ${EQUIPMENT_SET_KINDS.join(', ')}`)
    }
  }
  checkItemSetIds(data, issues)
}
