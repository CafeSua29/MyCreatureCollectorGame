// Kiểm tra hướng tiến hóa của loài (evolution-skills.md): loài đích, level, đá, điều kiện phụ
// (registry EVOLUTION_CONDITIONS), tiến hóa dị biến; config.evolution (đồ rơi từ boss).

import { EVOLUTION_CONDITIONS, checkHoldableItemId } from '../registries'
import type { Evolution, GameData, NormalSpecies } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkDrops, checkEffects, checkKnownFields } from './checks'

/**
 * Loài đích của tiến hóa (thường hoặc dị biến): loài thường có sẵn. Được khác race (tiến hóa giống game
 * gốc, mục "Tiến hóa" ở evolution-skills.md).
 */
function checkTarget(
  data: GameData,
  targetId: string,
  { where, label }: { where: string; label: string }
): string[] {
  const target = data.species[targetId]
  if (target?.kind !== 'normal')
    return [`${where}: ${label} thành loài không tồn tại "${targetId}"`]
  return []
}

/** Dị biến: loài khác loài thường của hướng, tỉ lệ %, xúc tác là đồ cầm và đi cùng tỉ lệ riêng. */
function checkMutation(data: GameData, evolution: Evolution, where: string): string[] {
  const mutation = asObject(evolution.mutation)
  if (!mutation) return [`${where}: mutation phải là object`]
  const at = `${where}.mutation`
  const speciesId = mutation.speciesId
  if (typeof speciesId !== 'string') return [`${at}: speciesId phải là chuỗi`]
  const issues = checkTarget(data, speciesId, { where, label: 'dị biến' })
  if (speciesId === evolution.speciesId) issues.push(`${at}: trùng loài thường của hướng tiến hóa`)
  issues.push(...checkNumber(mutation.chance, `${at}.chance`, 0, 100))
  const hasCatalyst = mutation.catalystItemId !== undefined
  if (hasCatalyst !== (mutation.catalystChance !== undefined)) {
    issues.push(`${at}: catalystItemId và catalystChance phải có cùng nhau`)
  }
  if (hasCatalyst) {
    issues.push(...checkHoldableItemId(data, mutation.catalystItemId, `${at}.catalystItemId`))
    issues.push(...checkNumber(mutation.catalystChance, `${at}.catalystChance`, 0, 100))
  }
  return issues
}

/** Mọi hướng tiến hóa của một loài thường. */
export function checkSpeciesEvolutions(
  data: GameData,
  species: NormalSpecies,
  issues: string[]
): void {
  const where = `Loài "${species.id}"`
  const stones = new Set<string>()
  for (const evolution of species.evolutions ?? []) {
    issues.push(...checkTarget(data, evolution.speciesId, { where, label: 'tiến hóa' }))
    issues.push(...checkInteger(evolution.level, `${where}: level tiến hóa`, 1))
    if (evolution.itemId !== undefined) {
      if (data.items[evolution.itemId]?.category !== 'evolutionStone') {
        issues.push(`${where}: "${evolution.itemId}" phải là vật phẩm category evolutionStone`)
      }
      if (stones.has(evolution.itemId)) {
        issues.push(`${where}: hai hướng tiến hóa dùng chung đá "${evolution.itemId}"`)
      }
      stones.add(evolution.itemId)
    }
    const at = `${where}: tiến hóa thành "${evolution.speciesId}"`
    if (evolution.conditions !== undefined) {
      checkEffects(EVOLUTION_CONDITIONS, evolution.conditions, `${at}.conditions`, data, issues)
    }
    if (evolution.mutation !== undefined) issues.push(...checkMutation(data, evolution, at))
  }
}

/** Kiểm tra config.evolution: bảng rơi từ boss và boss tầng. */
export function checkEvolutionConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.evolution)
  if (!config) {
    issues.push('config.evolution phải là object')
    return
  }
  checkKnownFields(config, ['bossDrops', 'floorBossDrops'], 'config.evolution', 'config', issues)
  for (const key of ['bossDrops', 'floorBossDrops'] as const) {
    const at = `config.evolution.${key}`
    if (!Array.isArray(config[key])) issues.push(`${at} phải là danh sách`)
    else checkDrops(data, config[key], at, issues)
  }
}
