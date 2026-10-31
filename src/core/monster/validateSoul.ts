// Kiểm tra hồn phách trong save (docs/rules/soul-relics.md): cấu trúc, id tồn tại, trait chiếm ô,
// lý lịch. Id hồn phách không trùng id quái: kiểm tra ở validateGameState (cùng bộ đếm nextMonsterId).

import { asObject, checkInteger } from '../shared'
import { usesTraitSlot, type GameData } from '../model'
import { validateHistory } from './history'
import { checkBigStats } from './validateMonster'

const SOUL_FIELDS: readonly string[] = [
  'id',
  'speciesId',
  'baseSpeciesId',
  'raceId',
  'nickname',
  'level',
  'genes',
  'traits',
  'shinyStacks',
  'contractRealm',
  'aptitudeTierId',
  'history'
]

/** Danh sách trait chiếm ô (giữ cấp) của hồn phách. */
function checkSoulTraits(data: GameData, value: unknown, where: string): string[] {
  if (!Array.isArray(value)) return [`${where} phải là danh sách`]
  return value.flatMap((entry: unknown, i) => {
    const at = `${where}[${i}]`
    const trait = asObject(entry)
    const def = typeof trait?.id === 'string' ? data.traits[trait.id] : undefined
    if (!trait || !def) return [`${at}: trait không tồn tại "${String(trait?.id)}"`]
    const issues = checkInteger(trait.level, `${at}.level`, 1)
    if (!usesTraitSlot(def.kind)) issues.push(`${at}: trait loại "${def.kind}" không chiếm ô`)
    return issues
  })
}

/** Kiểm tra một hồn phách ở vị trí `path`. Trả về danh sách lỗi. */
export function validateSoul(data: GameData, value: unknown, path: string): string[] {
  const soul = asObject(value)
  if (!soul) return [`${path}: không phải hồn phách hợp lệ`]
  const at = (field: string): string => `${path}.${field}`
  const issues: string[] = []
  if (typeof soul.id !== 'string' || soul.id === '') {
    issues.push(`${at('id')} phải là chuỗi khác rỗng, nhận ${String(soul.id)}`)
  }
  if (typeof soul.speciesId !== 'string' || !data.species[soul.speciesId]) {
    issues.push(`${at('speciesId')}: loài không tồn tại "${String(soul.speciesId)}"`)
  }
  // Loài gốc phải là loài thường: chỉ số gốc của nó là trọng số chọn dòng chính hồn khí.
  const base = typeof soul.baseSpeciesId === 'string' ? data.species[soul.baseSpeciesId] : undefined
  if (base?.kind !== 'normal') {
    issues.push(`${at('baseSpeciesId')}: không phải loài thường "${String(soul.baseSpeciesId)}"`)
  }
  if (typeof soul.raceId !== 'string' || !data.races[soul.raceId]) {
    issues.push(`${at('raceId')}: race không tồn tại "${String(soul.raceId)}"`)
  }
  if (soul.nickname !== null && typeof soul.nickname !== 'string') {
    issues.push(`${at('nickname')} phải là chuỗi hoặc null`)
  }
  issues.push(...checkInteger(soul.level, at('level'), 1))
  issues.push(...checkBigStats(soul.genes, at('genes'), 1))
  issues.push(...checkSoulTraits(data, soul.traits, at('traits')))
  issues.push(...checkInteger(soul.shinyStacks, at('shinyStacks'), 0))
  if (soul.contractRealm !== null) {
    issues.push(...checkInteger(soul.contractRealm, at('contractRealm'), 0))
  }
  if (typeof soul.aptitudeTierId !== 'string' || !data.aptitudeTiers[soul.aptitudeTierId]) {
    issues.push(
      `${at('aptitudeTierId')}: bậc tư chất không tồn tại "${String(soul.aptitudeTierId)}"`
    )
  }
  issues.push(...validateHistory(data, soul.history, at('history')))
  for (const key of Object.keys(soul)) {
    if (!SOUL_FIELDS.includes(key)) issues.push(`${path}: trường lạ "${key}"`)
  }
  return issues
}

/**
 * Kiểm tra danh sách hồn phách (`inventory.souls`). Trả về lỗi và id hợp lệ dạng chuỗi (để kiểm tra
 * trùng với id quái).
 */
export function validateSouls(
  data: GameData,
  value: unknown,
  path = 'inventory.souls'
): { issues: string[]; ids: string[] } {
  if (!Array.isArray(value)) return { issues: [`${path} phải là danh sách`], ids: [] }
  const issues = value.flatMap((soul: unknown, i) => validateSoul(data, soul, `${path}[${i}]`))
  const ids = value.flatMap((soul: unknown) => {
    const id = asObject(soul)?.id
    return typeof id === 'string' ? [id] : []
  })
  return { issues, ids }
}
