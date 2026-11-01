// Kiểm tra nghiên cứu loài trong save (docs/rules/species-research.md). Gọi từ validateGameState.

import { asObject, checkInteger } from '../shared'
import { isDexSpecies, maxResearchLevel } from '../registries'
import { RESEARCH_TASK_KINDS, type GameData } from '../model'
import { checkKnownFields } from '../gameData'

/** research: id loài thuộc Dex; bộ đếm theo loại việc đã biết, nguyên ≥ 0; cấp đã nhận trong [0, max]. */
export function validateResearchState(data: GameData, value: unknown): string[] {
  const issues: string[] = []
  const research = asObject(value)
  if (!research) return ['research phải là object']
  for (const [speciesId, entryValue] of Object.entries(research)) {
    const path = `research.${speciesId}`
    if (!isDexSpecies(data.species[speciesId])) issues.push(`${path}: không phải loài thuộc Dex`)
    const entry = asObject(entryValue)
    if (!entry) {
      issues.push(`${path} phải là object`)
      continue
    }
    checkKnownFields(entry, ['counters', 'claimedLevel'], path, 'nghiên cứu loài', issues)
    const counters = asObject(entry.counters)
    if (!counters) issues.push(`${path}.counters phải là object`)
    else {
      checkKnownFields(
        counters,
        RESEARCH_TASK_KINDS,
        `${path}.counters`,
        'bộ đếm nghiên cứu',
        issues
      )
      for (const [kind, count] of Object.entries(counters)) {
        issues.push(...checkInteger(count, `${path}.counters.${kind}`, 0))
      }
    }
    const problems = checkInteger(entry.claimedLevel, `${path}.claimedLevel`, 0)
    issues.push(...problems)
    if (problems.length === 0 && Number(entry.claimedLevel) > maxResearchLevel(data)) {
      issues.push(`${path}.claimedLevel vượt cấp tối đa ${maxResearchLevel(data)}`)
    }
  }
  return issues
}
