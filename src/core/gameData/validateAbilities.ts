// Kiểm tra dữ liệu ability theo loài (docs/rules/abilities.md): config.abilities, `abilities` /
// `hiddenAbility` của loài.

import { asObject, checkNumber } from '../shared'
import type { GameData } from '../model'
import { checkKnownFields } from './checks'

const CONFIG_FIELDS = ['wildHiddenChance', 'inheritChance', 'inheritHiddenChance']

function checkAbilityConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.abilities)
  if (!config) {
    issues.push('config.abilities phải là object')
    return
  }
  checkKnownFields(config, CONFIG_FIELDS, 'config.abilities', 'config', issues)
  for (const field of CONFIG_FIELDS) {
    issues.push(...checkNumber(config[field], `config.abilities.${field}`, 0, 100))
  }
}

const traitExists = (data: GameData, id: unknown): boolean =>
  typeof id === 'string' && Object.hasOwn(data.traits, id)

/** abilities: 1–2 id trait tồn tại, không lặp; hiddenAbility (nếu có) cần abilities, trait tồn tại. */
function checkSpeciesAbilities(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    const where = `Loài "${species.id}"`
    const { abilities, hiddenAbility } = species
    if (abilities !== undefined) {
      if (!Array.isArray(abilities) || abilities.length < 1 || abilities.length > 2) {
        issues.push(`${where}: abilities phải là danh sách 1–2 id trait`)
      } else {
        for (const id of abilities.filter((entry) => !traitExists(data, entry))) {
          issues.push(`${where}: abilities: trait không tồn tại "${String(id)}"`)
        }
        if (new Set(abilities).size !== abilities.length) issues.push(`${where}: abilities bị lặp`)
      }
    }
    if (hiddenAbility === undefined) continue
    if (abilities === undefined) issues.push(`${where}: có hiddenAbility thì phải có abilities`)
    if (!traitExists(data, hiddenAbility)) {
      issues.push(`${where}: hiddenAbility: trait không tồn tại "${String(hiddenAbility)}"`)
    }
  }
}

/** Kiểm tra mọi dữ liệu ability. */
export function checkAbilityData(data: GameData, issues: string[]): void {
  checkAbilityConfig(data, issues)
  checkSpeciesAbilities(data, issues)
}
