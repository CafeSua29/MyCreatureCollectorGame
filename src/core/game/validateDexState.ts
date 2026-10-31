// Kiểm tra phần Bộ sưu tập trong save (docs/rules/dex.md): loài đã gặp / đã sở hữu, mốc đã nhận.

import { asObject } from '../shared'
import { isDexSpecies } from '../registries'
import type { GameData } from '../model'
import { checkKnownFields } from '../gameData'

/** Danh sách id loài của Dex, không trùng. */
function checkSpeciesList(
  data: GameData,
  value: unknown,
  path: string,
  issues: string[]
): string[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách id loài`)
    return []
  }
  value.forEach((id, i) => {
    if (typeof id !== 'string' || !isDexSpecies(data.species[id])) {
      issues.push(`${path}[${i}]: loài không thuộc Bộ sưu tập "${String(id)}"`)
    } else if (value.indexOf(id) !== i) {
      issues.push(`${path}[${i}]: loài bị trùng "${id}"`)
    }
  })
  return value.filter((id): id is string => typeof id === 'string')
}

/** Kiểm tra dex: danh sách hợp lệ, đã sở hữu thì đã gặp, mốc đã nhận tồn tại và không trùng. */
export function validateDexState(data: GameData, value: unknown): string[] {
  const dex = asObject(value)
  if (!dex) return ['dex phải là object']
  const issues: string[] = []
  checkKnownFields(
    dex,
    ['seen', 'owned', 'shinyOwned', 'claimedMilestones', 'claimedRegions', 'hitParts'],
    'dex',
    'Bộ sưu tập',
    issues
  )
  const seen = new Set(checkSpeciesList(data, dex.seen, 'dex.seen', issues))
  const owned = new Set(checkSpeciesList(data, dex.owned, 'dex.owned', issues))
  for (const id of owned) {
    if (!seen.has(id)) issues.push(`dex.owned: loài "${id}" chưa có trong dex.seen`)
  }
  for (const id of checkSpeciesList(data, dex.shinyOwned, 'dex.shinyOwned', issues)) {
    if (!owned.has(id)) issues.push(`dex.shinyOwned: loài "${id}" chưa có trong dex.owned`)
  }
  const milestoneIds = data.config.dex.milestones.map((m) => m.id)
  checkClaimedIds(dex.claimedMilestones, milestoneIds, 'dex.claimedMilestones', issues)
  checkClaimedIds(dex.claimedRegions, Object.keys(data.biomes), 'dex.claimedRegions', issues)
  checkHitParts(data, dex.hitParts, issues)
  return issues
}

/**
 * Bộ phận đã đánh trúng theo loài: loài thuộc Dex, id bộ phận tồn tại, không trùng. Không bắt bộ phận
 * nằm trong bộ phận hiện tại của loài (dữ liệu loài đổi thì phần thừa chỉ bị bỏ qua khi tra).
 */
function checkHitParts(data: GameData, value: unknown, issues: string[]): void {
  const hitParts = asObject(value)
  if (!hitParts) {
    issues.push('dex.hitParts phải là object')
    return
  }
  for (const [speciesId, parts] of Object.entries(hitParts)) {
    const path = `dex.hitParts.${speciesId}`
    if (!isDexSpecies(data.species[speciesId])) {
      issues.push(`${path}: loài không thuộc Bộ sưu tập`)
    }
    checkClaimedIds(parts, Object.keys(data.bodyParts), path, issues)
  }
}

/** Danh sách id đã nhận: mỗi id tồn tại (mốc / map), không trùng. */
function checkClaimedIds(
  value: unknown,
  known: readonly string[],
  path: string,
  issues: string[]
): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách`)
    return
  }
  value.forEach((id, i) => {
    if (typeof id !== 'string' || !known.includes(id)) {
      issues.push(`${path}[${i}]: id không tồn tại "${String(id)}"`)
    } else if (value.indexOf(id) !== i) {
      issues.push(`${path}[${i}]: id bị trùng "${id}"`)
    }
  })
}
