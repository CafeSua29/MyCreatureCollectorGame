// Kiểm tra nội dung game: hệ, race, loài, skill, vật phẩm, biome, trait, chuỗi tiến hóa.

import { ALLY_TARGETS, SKILL_EFFECTS, checkPowerFormula, checkSkillSpell } from '../registries'
import { TRAIT_HOOKS } from '../registries'
import { checkSkillMechanics } from './validateSkillMechanics'
import { checkSkillFormFields } from './validateSkillForms'
import {
  SKILL_CATEGORIES,
  SKILL_TAGS,
  SKILL_TARGETS,
  TRAIT_KINDS,
  evolutionTargetIds,
  allMaps,
  type GameData,
  type Biome,
  type EncounterEntry,
  type Race,
  type Skill
} from '../model'
import { asObject, checkInteger, checkNumber, isFiniteNumber } from '../shared'
import { checkDrops, checkEffectTargets, checkEffects, checkElementIds, checkStats } from './checks'
import { checkSpeciesEvolutions } from './validateEvolutions'

/** Giới hạn lần dùng, kẹp sát thương, đổi theo lần dùng của skill (nguồn WILDERLOCKE). */
function checkUseRules(data: GameData, skill: Skill, where: string): string[] {
  const issues: string[] = []
  if (skill.maxUsesPerBattle !== undefined) {
    issues.push(...checkInteger(skill.maxUsesPerBattle, `${where}.maxUsesPerBattle`, 1))
  }
  for (const key of ['damageFloorPercent', 'damageCapPercent'] as const) {
    if (skill[key] !== undefined) {
      issues.push(...checkNumber(skill[key], `${where}.${key}`, Number.MIN_VALUE, 100))
    }
  }
  for (const key of ['targetsHighestHpFoe', 'doublesAttackStage'] as const) {
    if (skill[key] !== undefined && skill[key] !== true) {
      issues.push(`${where}: ${key} chỉ được là true`)
    }
  }
  for (const [index, step] of (skill.hitsByHp ?? []).entries()) {
    issues.push(
      ...checkNumber(step.atOrBelowPercent, `${where}.hitsByHp[${index}].atOrBelowPercent`, 0, 100)
    )
    issues.push(...checkInteger(step.hits, `${where}.hitsByHp[${index}].hits`, 1))
  }
  const alternate = skill.alternateUse
  if (alternate?.elementId !== undefined && !Object.hasOwn(data.elements, alternate.elementId)) {
    issues.push(`${where}.alternateUse: hệ không tồn tại "${alternate.elementId}"`)
  }
  if (alternate && alternate.elementId === undefined && alternate.category === undefined) {
    issues.push(`${where}.alternateUse cần elementId hoặc category`)
  }
  return issues
}

export function checkElements(data: GameData, issues: string[]): void {
  for (const element of Object.values(data.elements)) {
    const airborne: unknown = element.airborne
    if (airborne !== undefined && airborne !== true) {
      issues.push(`Hệ "${element.id}": airborne chỉ được là true`)
    }
    for (const [targetId, multiplier] of Object.entries(element.effectiveness ?? {})) {
      if (!(targetId in data.elements)) {
        issues.push(`Hệ "${element.id}": effectiveness tham chiếu hệ không tồn tại "${targetId}"`)
      }
      if (!isFiniteNumber(multiplier) || multiplier < 0) {
        issues.push(`Hệ "${element.id}": effectiveness.${targetId} phải là số ≥ 0`)
      }
    }
  }
}

export function checkRaces(data: GameData, issues: string[]): void {
  for (const race of Object.values(data.races)) {
    checkStats(race.statBias, `Race "${race.id}".statBias`, Number.MIN_VALUE, issues)
    checkStats(race.growth, `Race "${race.id}".growth`, 0, issues)
    if (!Array.isArray(race.breedsWith)) {
      issues.push(`Race "${race.id}": breedsWith phải là danh sách`)
    } else {
      for (const raceId of race.breedsWith) {
        if (!(raceId in data.races)) {
          issues.push(`Race "${race.id}": breedsWith có race không tồn tại "${raceId}"`)
        }
      }
    }
    checkRaceTraitIds(data, race, issues)
  }
}

/** Trait bản sắc của race: ít nhất một, không lặp, tồn tại và đúng loại `race`. */
function checkRaceTraitIds(data: GameData, race: Race, issues: string[]): void {
  const where = `Race "${race.id}"`
  const traitIds: unknown = race.traitIds
  if (!Array.isArray(traitIds) || traitIds.length === 0) {
    issues.push(`${where}: traitIds phải là danh sách không rỗng`)
    return
  }
  const seen = new Set<unknown>()
  for (const traitId of traitIds) {
    if (seen.has(traitId)) issues.push(`${where}: traitIds lặp "${String(traitId)}"`)
    seen.add(traitId)
    const trait = typeof traitId === 'string' ? data.traits[traitId] : undefined
    if (!trait) {
      issues.push(`${where}: traitIds có trait không tồn tại "${String(traitId)}"`)
    } else if (trait.kind !== 'race') {
      issues.push(`${where}: trait "${trait.id}" phải là loại "race", nhận "${trait.kind}"`)
    }
  }
}

export function checkSpecies(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind === 'fused') continue
    if (species.kind !== 'normal') {
      issues.push(`Loài "${(species as { id: string }).id}": kind phải là "normal" hoặc "fused"`)
      continue
    }
    const where = `Loài "${species.id}"`
    if (!(species.raceId in data.races)) {
      issues.push(`${where}: race không tồn tại "${species.raceId}"`)
    }
    // Loài không hệ (Archangel của Cassette Beasts...): danh sách rỗng hợp lệ.
    checkElementIds(data, species.elementIds, where, issues, { allowEmpty: true })
    checkStats(species.baseStats, `${where}.baseStats`, Number.MIN_VALUE, issues)
    checkSpeciesEvolutions(data, species, issues)
    if (!Array.isArray(species.learnset)) {
      issues.push(`${where}: thiếu learnset`)
      continue
    }
    for (const entry of species.learnset) {
      if (!(entry.skillId in data.skills)) {
        issues.push(`${where}: learnset có skill không tồn tại "${entry.skillId}"`)
      }
      issues.push(...checkInteger(entry.level, `${where}: level học skill`, 1))
    }
    if (!species.learnset.some((entry) => entry.level === 1)) {
      issues.push(`${where}: learnset cần ít nhất một skill ở level 1`)
    }
    issues.push(...checkNumber(species.catchRate, `${where}: catchRate`, 0, 100))
  }
}

export function checkSkills(data: GameData, issues: string[]): void {
  for (const skill of Object.values(data.skills)) {
    const where = `Skill "${skill.id}"`
    const tags: unknown = skill.tags
    if (
      tags !== undefined &&
      (!Array.isArray(tags) ||
        tags.length === 0 ||
        !tags.every((tag) => (SKILL_TAGS as readonly unknown[]).includes(tag)) ||
        new Set(tags).size !== tags.length)
    ) {
      issues.push(`${where}: tags phải là danh sách không lặp: ${SKILL_TAGS.join(', ')}`)
    }
    if (!(skill.elementId in data.elements)) {
      issues.push(`${where}: hệ không tồn tại "${skill.elementId}"`)
    }
    if (!SKILL_CATEGORIES.includes(skill.category)) {
      issues.push(`${where}: category không hợp lệ "${skill.category}"`)
    }
    if (!SKILL_TARGETS.includes(skill.target)) {
      issues.push(`${where}: target không hợp lệ "${skill.target}"`)
    }
    if (skill.category === 'status') {
      if (skill.power !== 0) issues.push(`${where}: skill status phải có power = 0`)
    } else {
      issues.push(...checkNumber(skill.power, `${where}: power`, Number.MIN_VALUE))
      if (ALLY_TARGETS.includes(skill.target)) {
        issues.push(`${where}: skill gây sát thương phải nhắm địch`)
      }
    }
    issues.push(...checkNumber(skill.accuracy, `${where}: accuracy`, 1, 100))
    issues.push(...checkInteger(skill.priority, `${where}: priority`))
    checkEffects(SKILL_EFFECTS, skill.effects, where, data, issues)
    checkEffectTargets(skill.effects, skill.target, where, issues)
    if (skill.hits !== undefined) checkHits(skill, where, issues)
    if (skill.firstTurnOnly !== undefined && skill.firstTurnOnly !== true) {
      issues.push(`${where}: firstTurnOnly chỉ được là true`)
    }
    if (skill.alwaysHits !== undefined && skill.alwaysHits !== true) {
      issues.push(`${where}: alwaysHits chỉ được là true`)
    }
    issues.push(...checkUseRules(data, skill, where))
    issues.push(...checkSkillMechanics(data, skill, where))
    issues.push(...checkSkillFormFields(data, skill, where))
    for (const field of ['curesUserStatuses', 'curesTargetStatuses'] as const) {
      const list = skill[field]
      if (list === undefined) continue
      if (!Array.isArray(list) || list.length === 0) {
        issues.push(`${where}: ${field} phải là danh sách không rỗng`)
        continue
      }
      for (const id of list.filter((entry) => !Object.hasOwn(data.statuses, entry))) {
        issues.push(`${where}: ${field}: trạng thái không tồn tại "${String(id)}"`)
      }
    }
    if (skill.powerFormula !== undefined) {
      for (const problem of checkPowerFormula(skill.powerFormula, data)) {
        issues.push(`${where}: ${problem}`)
      }
      if (skill.power <= 0) issues.push(`${where}: powerFormula chỉ dùng cho skill gây sát thương`)
    }
    checkCritFields(skill, where, issues)
    if (skill.spell !== undefined) {
      issues.push(...checkSkillSpell(skill.spell, data).map((issue) => `${where}: ${issue}`))
    }
  }
}

/** Chí mạng riêng của skill: chỉ skill gây sát thương; critStage nguyên ≥ 1, alwaysCrit chỉ true. */
function checkCritFields(skill: Skill, where: string, issues: string[]): void {
  if (skill.critStage === undefined && skill.alwaysCrit === undefined) return
  if (skill.critStage !== undefined) {
    issues.push(...checkInteger(skill.critStage, `${where}: critStage`, 1))
  }
  if (skill.alwaysCrit !== undefined && skill.alwaysCrit !== true) {
    issues.push(`${where}: alwaysCrit chỉ được là true`)
  }
  if (skill.power <= 0)
    issues.push(`${where}: critStage / alwaysCrit chỉ dùng cho skill gây sát thương`)
}

/**
 * Skill đánh nhiều lần: 1 ≤ min ≤ max (số nguyên); chỉ skill gây sát thương nhắm một địch, vì
 * mục tiêu gục giữa chừng thì dừng, không chuyển mục tiêu (mục Battle).
 */
function checkHits(skill: Skill, where: string, issues: string[]): void {
  const hits = asObject(skill.hits)
  if (!hits) {
    issues.push(`${where}: hits phải là object { min, max }`)
    return
  }
  issues.push(...checkInteger(hits.min, `${where}: hits.min`, 1))
  issues.push(
    ...checkInteger(hits.max, `${where}: hits.max`, isFiniteNumber(hits.min) ? hits.min : 1)
  )
  if (skill.power <= 0 || skill.target !== 'enemy') {
    issues.push(`${where}: hits chỉ dùng cho skill gây sát thương nhắm "enemy"`)
  }
}

/** Danh sách loài + trọng số (quái hoang của biome): loài thường, trọng số > 0. */
export function checkEncounters(
  data: GameData,
  encounters: readonly EncounterEntry[] | undefined,
  where: string,
  issues: string[]
): void {
  if (!Array.isArray(encounters) || encounters.length === 0) {
    issues.push(`${where}: cần ít nhất một loài xuất hiện`)
    return
  }
  for (const encounter of encounters) {
    if (data.species[encounter.speciesId]?.kind !== 'normal') {
      issues.push(`${where}: loài không tồn tại "${encounter.speciesId}"`)
    }
    issues.push(...checkNumber(encounter.weight, `${where}: weight`, Number.MIN_VALUE))
  }
}

/** Boss của biome: loài thường không trùng, trọng số (nếu có) > 0, đồ rơi riêng hợp lệ. */
function checkBiomeBosses(data: GameData, biome: Biome, where: string, issues: string[]): void {
  if (!Array.isArray(biome.bosses) || biome.bosses.length === 0) {
    issues.push(`${where}: cần ít nhất một boss (boss tầng)`)
    return
  }
  const seen = new Set<string>()
  for (const boss of biome.bosses) {
    const at = `${where}: boss "${boss.speciesId}"`
    if (data.species[boss.speciesId]?.kind !== 'normal') {
      issues.push(`${where}: boss loài không tồn tại "${boss.speciesId}"`)
    }
    if (seen.has(boss.speciesId)) issues.push(`${at} bị khai báo hai lần`)
    seen.add(boss.speciesId)
    if (boss.weight !== undefined) {
      issues.push(...checkNumber(boss.weight, `${at}.weight`, Number.MIN_VALUE))
    }
    checkDrops(data, boss.drops ?? [], at, issues)
  }
  if (!seen.has(biome.floorBossSpeciesId)) {
    issues.push(
      `${where}: floorBossSpeciesId "${biome.floorBossSpeciesId}" phải nằm trong danh sách bosses`
    )
  }
}

/** Biome (mục "Tầng và biome"): cần ít nhất một biome (mỗi tầng tung ngẫu nhiên một biome). */
export function checkBiomes(data: GameData, issues: string[]): void {
  if (Object.keys(data.biomes).length === 0) issues.push('biomes: cần ít nhất một biome')
  // Map của hiểm địa kiểm như biome (docs/rules/zones.md).
  for (const biome of allMaps(data)) {
    const where = `Biome "${biome.id}"`
    issues.push(...checkNumber(biome.doubleChance, `${where}: doubleChance`, 0, 100))
    if (biome.shinyChance !== undefined) {
      issues.push(...checkNumber(biome.shinyChance, `${where}: shinyChance`, 0, 100))
    }
    if (biome.bossChance !== undefined) {
      issues.push(...checkNumber(biome.bossChance, `${where}: bossChance`, 0, 100))
    }
    const min = biome.bossMultiplierMin ?? data.config.boss?.multiplierMin
    const max = biome.bossMultiplierMax ?? data.config.boss?.multiplierMax
    issues.push(...checkInteger(min, `${where}: bossMultiplierMin`, 1))
    issues.push(...checkInteger(max, `${where}: bossMultiplierMax`, min ?? 1))
    checkEncounters(data, biome.encounters, where, issues)
    checkDrops(data, biome.drops ?? [], where, issues)
    if (!Array.isArray(biome.bossDrops)) issues.push(`${where}: bossDrops phải là danh sách`)
    else checkDrops(data, biome.bossDrops, `${where}: bossDrops`, issues)
    checkBiomeBosses(data, biome, where, issues)
    if (biome.elementIds !== undefined) {
      checkElementIds(data, biome.elementIds, `${where}: elementIds`, issues)
    }
    if (biome.deityId !== undefined && !Object.hasOwn(data.deities, biome.deityId)) {
      issues.push(`${where}: thần không tồn tại "${String(biome.deityId)}"`)
    }
  }
}

/**
 * Chuỗi tiến hóa không có vòng lặp. Một loài được có nhiều dạng trước (tiến hóa giống game gốc, mục
 * "Tiến hóa" ở evolution-skills.md).
 */
export function checkEvolutionGraph(data: GameData, issues: string[]): void {
  const next = new Map<string, string[]>()
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    next.set(species.id, (species.evolutions ?? []).flatMap(evolutionTargetIds))
  }
  // DFS ba màu: gặp lại loài đang trên đường đi là có vòng.
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (start: string): void => {
    const stack: { id: string; index: number }[] = [{ id: start, index: 0 }]
    state.set(start, 'visiting')
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      const targets = next.get(top.id) ?? []
      if (top.index >= targets.length) {
        state.set(top.id, 'done')
        stack.pop()
        continue
      }
      const target = targets[top.index++]
      if (state.get(target) === 'visiting') {
        issues.push(`Chuỗi tiến hóa có vòng lặp qua loài "${target}"`)
      } else if (!state.has(target)) {
        state.set(target, 'visiting')
        stack.push({ id: target, index: 0 })
      }
    }
  }
  for (const id of next.keys()) if (!state.has(id)) visit(id)
}

/** Trait race không áp nhóm loại trừ và phải có ít nhất một race dùng. */
function checkRaceTraitUsage(
  data: GameData,
  traitId: string,
  exclusiveGroup: string | undefined,
  issues: string[]
): void {
  if (exclusiveGroup !== undefined) {
    issues.push(`Trait "${traitId}": trait race không được có exclusiveGroup`)
  }
  const used = Object.values(data.races).some(
    (race) => Array.isArray(race.traitIds) && race.traitIds.includes(traitId)
  )
  if (!used) issues.push(`Trait "${traitId}": trait race nhưng không race nào dùng`)
}

export function checkTraits(data: GameData, issues: string[]): void {
  const groups: Record<string, string[]> = {}
  for (const trait of Object.values(data.traits)) {
    const where = `Trait "${trait.id}"`
    if (!TRAIT_KINDS.includes(trait.kind)) {
      issues.push(`${where}: kind không hợp lệ "${trait.kind}"`)
    }
    if (trait.kind === 'race') checkRaceTraitUsage(data, trait.id, trait.exclusiveGroup, issues)
    if (trait.exclusiveGroup !== undefined) {
      groups[trait.exclusiveGroup] = [...(groups[trait.exclusiveGroup] ?? []), trait.id]
    }
    if (trait.noBattleEffect !== undefined && trait.noBattleEffect !== true) {
      issues.push(`${where}: noBattleEffect chỉ được là true`)
    }
    if (Array.isArray(trait.hooks) && trait.hooks.length === 0 && trait.noBattleEffect !== true) {
      issues.push(`${where}: cần ít nhất một hook`)
    }
    checkEffects(TRAIT_HOOKS, trait.hooks, where, data, issues)
  }
  for (const [group, members] of Object.entries(groups)) {
    if (members.length < 2) {
      issues.push(`Nhóm loại trừ "${group}" chỉ có một trait (${members[0]})`)
    }
  }
}
