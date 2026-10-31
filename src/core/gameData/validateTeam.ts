// Kiểm tra dữ liệu phối hợp đội (docs/rules/team.md): synergies.json, formations.json, phần riêng
// của comboSkills.json (phần skill kiểm tra chung với skill thường), config.formations, config.combo.

import {
  FORMATION_REQUIREMENTS,
  MONSTER_CONDITIONS,
  checkBattleOnlyHooks,
  checkTypedParams
} from '../registries'
import { isBattleOnlyMove, type GameData } from '../model'
import { asObject, checkInteger } from '../shared'
import { checkDrops, checkKnownFields } from './checks'

const pushAll = (issues: string[], where: string, problems: readonly string[]): void => {
  for (const problem of problems) issues.push(`${where}: ${problem}`)
}

/** Cộng hưởng: điều kiện quái hợp lệ, bậc có count nguyên ≥ 1 tăng dần, hook chỉ dùng trong trận. */
function checkSynergies(data: GameData, issues: string[]): void {
  for (const synergy of Object.values(data.synergies)) {
    const where = `Cộng hưởng "${synergy.id}"`
    checkKnownFields(synergy, ['id', 'match', 'tiers'], where, 'cộng hưởng', issues)
    issues.push(...checkTypedParams(MONSTER_CONDITIONS, synergy.match, `${where}: match`, data))
    if (!Array.isArray(synergy.tiers) || synergy.tiers.length === 0) {
      issues.push(`${where}: tiers phải là danh sách không rỗng`)
      continue
    }
    let previous = 0
    synergy.tiers.forEach((tier, i) => {
      const at = `${where}: tiers[${i}]`
      checkKnownFields(tier, ['count', 'hooks'], at, 'bậc cộng hưởng', issues)
      issues.push(...checkInteger(tier.count, `${at}.count`, 1))
      if (typeof tier.count === 'number') {
        if (tier.count <= previous) issues.push(`${at}: count phải tăng dần`)
        if (tier.count > data.config.partySize) {
          issues.push(`${at}: count tối đa bằng số quái trong đội (${data.config.partySize})`)
        }
        previous = tier.count
      }
      pushAll(issues, at, checkBattleOnlyHooks(tier.hooks, 'cộng hưởng', data))
    })
  }
}

/** Trận pháp: yêu cầu theo registry (ít nhất một), điều kiện quái nhận (tùy chọn), hook trong trận. */
function checkFormations(data: GameData, issues: string[]): void {
  for (const formation of Object.values(data.formations)) {
    const where = `Trận pháp "${formation.id}"`
    checkKnownFields(formation, ['id', 'requires', 'match', 'hooks'], where, 'trận pháp', issues)
    if (!Array.isArray(formation.requires) || formation.requires.length === 0) {
      issues.push(`${where}: requires phải là danh sách không rỗng`)
    } else {
      formation.requires.forEach((requirement, i) => {
        const at = `${where}: requires[${i}]`
        issues.push(...checkTypedParams(FORMATION_REQUIREMENTS, requirement, at, data))
      })
    }
    if (formation.match !== undefined) {
      issues.push(...checkTypedParams(MONSTER_CONDITIONS, formation.match, `${where}: match`, data))
    }
    pushAll(issues, where, checkBattleOnlyHooks(formation.hooks, 'trận pháp', data))
  }
  // Mỗi trận pháp học được từ đúng một trận đồ (nguồn duy nhất để học).
  for (const formationId of Object.keys(data.formations)) {
    const count = Object.values(data.items).filter(
      (item) => item.category === 'formationScroll' && item.formationId === formationId
    ).length
    if (count !== 1) {
      issues.push(`Trận pháp "${formationId}": cần đúng một trận đồ, có ${count}`)
    }
  }
}

/**
 * Hợp kích kỹ: cặp đúng 2 điều kiện quái hợp lệ; không phải chiêu Max / Tera Blast (luật biến hình
 * không áp); không nằm trong learnset của loài nào (chỉ dùng qua lệnh hợp kích).
 */
function checkComboSkills(data: GameData, issues: string[]): void {
  for (const combo of Object.values(data.comboSkills)) {
    const where = `Hợp kích kỹ "${combo.id}"`
    if (!Array.isArray(combo.pair) || combo.pair.length !== 2) {
      issues.push(`${where}: pair phải là danh sách đúng 2 điều kiện`)
    } else {
      combo.pair.forEach((condition, i) => {
        issues.push(
          ...checkTypedParams(MONSTER_CONDITIONS, condition, `${where}: pair[${i}]`, data)
        )
      })
    }
    const skill = data.skills[combo.id]
    if (isBattleOnlyMove(skill) || skill.teraBlast !== undefined) {
      issues.push(`${where}: không được là chiêu Max / Z-Move / Tera Blast`)
    }
  }
  for (const species of Object.values(data.species)) {
    const learnset =
      'learnset' in species && Array.isArray(species.learnset) ? species.learnset : []
    for (const entry of learnset) {
      if (entry.skillId in data.comboSkills) {
        issues.push(`Loài "${species.id}": learnset có hợp kích kỹ "${entry.skillId}"`)
      }
    }
  }
}

function checkTeamConfig(data: GameData, issues: string[]): void {
  const formations = asObject(data.config.formations)
  if (!formations) {
    issues.push('config.formations phải là object')
  } else {
    checkKnownFields(formations, ['floorBossDrops'], 'config.formations', 'config', issues)
    const at = 'config.formations.floorBossDrops'
    if (!Array.isArray(formations.floorBossDrops)) issues.push(`${at} phải là danh sách`)
    else checkDrops(data, formations.floorBossDrops, at, issues)
  }
  const combo = asObject(data.config.combo)
  if (!combo) {
    issues.push('config.combo phải là object')
    return
  }
  checkKnownFields(combo, ['minAffinity'], 'config.combo', 'config', issues)
  issues.push(...checkInteger(combo.minAffinity, 'config.combo.minAffinity', 0))
  const max = data.config.affinity?.max
  if (typeof combo.minAffinity === 'number' && typeof max === 'number' && combo.minAffinity > max) {
    issues.push(`config.combo.minAffinity tối đa ${max} (affinity.max), nhận ${combo.minAffinity}`)
  }
}

/** Kiểm tra mọi dữ liệu phối hợp đội. */
export function checkTeamData(data: GameData, issues: string[]): void {
  checkSynergies(data, issues)
  checkFormations(data, issues)
  checkComboSkills(data, issues)
  checkTeamConfig(data, issues)
}
