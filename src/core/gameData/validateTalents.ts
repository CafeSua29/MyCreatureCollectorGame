// Kiểm tra dữ liệu thiên phú quái (docs/rules/monster-talents.md): config.talents,
// talentBranches.json, talents.json.

import { TRAIT_HOOKS, checkIdList, raceRefIds } from '../registries'
import type { GameData, TalentNodeDef } from '../model'
import { asObject, checkInteger } from '../shared'
import { checkDrops, checkEffects, checkKnownFields } from './checks'

const CONFIG_FIELDS = ['levelsPerPoint', 'pointsPerAwakening', 'bossDrops']
const BRANCH_FIELDS = ['id', 'raceIds']
const NODE_FIELDS = ['id', 'branchId', 'requires', 'maxRank', 'costPerRank', 'hooks']

function checkTalentConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.talents)
  if (!config) {
    issues.push('config.talents phải là object')
    return
  }
  const at = (field: string): string => `config.talents.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.talents', 'config', issues)
  issues.push(...checkInteger(config.levelsPerPoint, at('levelsPerPoint'), 1))
  issues.push(...checkInteger(config.pointsPerAwakening, at('pointsPerAwakening'), 0))
  if (!Array.isArray(config.bossDrops)) issues.push(`${at('bossDrops')} phải là danh sách`)
  else checkDrops(data, config.bossDrops, at('bossDrops'), issues)
}

function checkBranches(data: GameData, issues: string[]): void {
  for (const branch of Object.values(data.talentBranches)) {
    const where = `Nhánh thiên phú "${branch.id}"`
    checkKnownFields(branch, BRANCH_FIELDS, where, 'nhánh thiên phú', issues)
    if (branch.raceIds === undefined) continue
    const problems = checkIdList(branch.raceIds, 'raceIds', raceRefIds(data), { label: 'race' })
    issues.push(...problems.map((problem) => `${where}: ${problem}`))
  }
}

/**
 * Nút yêu cầu: tồn tại, khác chính nút, cùng nhánh hoặc ở nhánh chung (nút nhánh race khác thì
 * không bao giờ đủ), cấp nguyên trong [1, maxRank của nút đó].
 */
function checkRequires(data: GameData, node: TalentNodeDef, where: string): string[] {
  if (node.requires === undefined) return []
  const requires = asObject(node.requires)
  if (!requires) return [`${where}: requires phải là object id nút → cấp`]
  const issues: string[] = []
  for (const [requiredId, rank] of Object.entries(requires)) {
    const at = `${where}: requires.${requiredId}`
    const required = data.talents[requiredId]
    if (!required || requiredId === node.id) {
      issues.push(`${at}: nút không tồn tại hoặc trùng chính nút`)
      continue
    }
    const branch = data.talentBranches[required.branchId]
    if (required.branchId !== node.branchId && branch?.raceIds !== undefined) {
      issues.push(`${at}: nút yêu cầu phải cùng nhánh hoặc ở nhánh chung`)
    }
    issues.push(...checkInteger(rank, at, 1))
    if (required.maxRank !== undefined && typeof rank === 'number' && rank > required.maxRank) {
      issues.push(`${at}: vượt cấp tối đa ${required.maxRank} của nút yêu cầu`)
    }
  }
  return issues
}

/** Nút nằm trong vòng yêu cầu (A cần B, B cần A): không bao giờ nâng được. */
function findRequireCycle(data: GameData, startId: string): boolean {
  const seen = new Set<string>()
  const stack = Object.keys(data.talents[startId].requires ?? {})
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined || seen.has(id) || !data.talents[id]) continue
    if (id === startId) return true
    seen.add(id)
    stack.push(...Object.keys(data.talents[id].requires ?? {}))
  }
  return false
}

function checkNodes(data: GameData, issues: string[]): void {
  for (const node of Object.values(data.talents)) {
    const where = `Thiên phú "${node.id}"`
    checkKnownFields(node, NODE_FIELDS, where, 'thiên phú', issues)
    if (!Object.hasOwn(data.talentBranches, node.branchId)) {
      issues.push(`${where}: nhánh không tồn tại "${String(node.branchId)}"`)
    }
    issues.push(...checkInteger(node.costPerRank, `${where}: costPerRank`, 1))
    if (node.maxRank !== undefined) {
      issues.push(...checkInteger(node.maxRank, `${where}: maxRank`, 1))
    }
    issues.push(...checkRequires(data, node, where))
    if (findRequireCycle(data, node.id)) issues.push(`${where}: yêu cầu thành vòng`)
    checkEffects(TRAIT_HOOKS, node.hooks, where, data, issues)
  }
}

/** Kiểm tra mọi dữ liệu thiên phú. */
export function checkTalentData(data: GameData, issues: string[]): void {
  checkTalentConfig(data, issues)
  checkBranches(data, issues)
  checkNodes(data, issues)
}
