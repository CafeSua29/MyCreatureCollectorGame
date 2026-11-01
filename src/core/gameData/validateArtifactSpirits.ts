// Kiểm tra dữ liệu khí linh và Khí giới bí cảnh (docs/rules/artifact-spirits.md): artifactSpirits.json
// (trọng số, hook / hook thức tỉnh qua TRAIT_HOOKS, softCap) và config.artifactSpirits.

import type { ArtifactSpiritConfig, ArtifactSpiritDef, GameData, ItemWorldConfig } from '../model'
import { TRAIT_HOOKS } from '../registries'
import { asObject, checkInteger, checkNumber } from '../shared'
import {
  checkDrops,
  checkEffects,
  checkIntRange,
  checkItemRewards,
  checkKnownFields,
  checkStackItemId,
  fieldList
} from './checks'
import { checkRarityTable, checkRarityWeights } from './validateEquipment'
import { checkItemGroupId } from './validateItemGroups'

const WHERE = 'config.artifactSpirits'

const DEF_FIELDS = fieldList<ArtifactSpiritDef>({
  id: true,
  weight: true,
  hooks: true,
  awakenedHooks: true,
  softCap: true
})

const CONFIG_FIELDS = fieldList<ArtifactSpiritConfig>({
  slots: true,
  soulRelicSlots: true,
  levelsPerSlot: true,
  wildPotencyPercent: true,
  valueRanges: true,
  dropSpiritWeights: true,
  gradeThresholds: true,
  gradeStep: true,
  awakenGrade: true,
  moveMoneyPerValue: true,
  feed: true,
  breed: true,
  summon: true,
  orbBossDrops: true,
  itemWorld: true
})

const ITEM_WORLD_FIELDS = fieldList<ItemWorldConfig>({
  rarityFloors: true,
  floorsPerDepth: true,
  floorsPerLevel: true,
  spiritChance: true,
  newSpiritDepthPercent: true,
  healPercent: true,
  leaveEvery: true,
  breakItemId: true,
  floorRewards: true,
  bosses: true,
  bonus: true
})

const BOSS_FIELDS = ['id', 'every', 'multiplier', 'bonusRolls', 'rewards']

/** artifactSpirits.json: trọng số ≥ 0 (có loại > 0), hook khác rỗng, softCap > 0 nếu có. */
function checkSpiritDefs(data: GameData, issues: string[]): void {
  const defs = Object.values(data.artifactSpirits)
  if (!defs.some((def) => typeof def.weight === 'number' && def.weight > 0)) {
    issues.push('artifactSpirits.json cần ít nhất một loại khí linh có weight > 0')
  }
  for (const def of defs) {
    const where = `Khí linh "${def.id}"`
    checkKnownFields(def, DEF_FIELDS, where, 'khí linh', issues)
    issues.push(...checkNumber(def.weight, `${where}: weight`, 0))
    if (!Array.isArray(def.hooks) || def.hooks.length === 0) {
      issues.push(`${where}: hooks phải là danh sách hook khác rỗng`)
    } else checkEffects(TRAIT_HOOKS, def.hooks, `${where} (hooks)`, data, issues)
    if (!Array.isArray(def.awakenedHooks)) {
      issues.push(`${where}: awakenedHooks phải là danh sách hook`)
    } else checkEffects(TRAIT_HOOKS, def.awakenedHooks, `${where} (awakenedHooks)`, data, issues)
    if (def.softCap !== undefined) {
      issues.push(...checkNumber(def.softCap, `${where}: softCap`, Number.MIN_VALUE))
    }
  }
}

/** Ngưỡng phẩm cấp: số nguyên ≥ 1 tăng dần ngặt, khác rỗng. */
function checkGrades(config: Record<string, unknown>, issues: string[]): void {
  const thresholds = config.gradeThresholds
  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    issues.push(`${WHERE}.gradeThresholds phải là danh sách ngưỡng khác rỗng`)
  } else {
    let previous = 0
    thresholds.forEach((threshold: unknown, i) => {
      issues.push(...checkInteger(threshold, `${WHERE}.gradeThresholds[${i}]`, 1))
      if (typeof threshold === 'number' && threshold <= previous) {
        issues.push(`${WHERE}.gradeThresholds[${i}] phải lớn hơn ngưỡng trước (${previous})`)
      }
      if (typeof threshold === 'number') previous = threshold
    })
  }
  issues.push(...checkInteger(config.gradeStep, `${WHERE}.gradeStep`, 1))
  issues.push(...checkInteger(config.awakenGrade, `${WHERE}.awakenGrade`, 0))
}

/** Bậc boss: id không trùng, every nguyên ≥ 1, multiplier ≥ 1, bonusRolls nguyên ≥ 0. */
function checkBosses(data: GameData, value: unknown, at: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${at} phải là danh sách`)
    return
  }
  const ids = new Set<string>()
  value.forEach((raw: unknown, i) => {
    const tier = asObject(raw) ?? {}
    const where = `${at}[${i}]`
    checkKnownFields(tier, BOSS_FIELDS, where, 'boss Khí giới bí cảnh', issues)
    if (typeof tier.id !== 'string' || tier.id === '') issues.push(`${where}.id phải là chuỗi`)
    else if (ids.has(tier.id)) issues.push(`${where}.id bị trùng "${tier.id}"`)
    else ids.add(tier.id)
    issues.push(...checkInteger(tier.every, `${where}.every`, 1))
    issues.push(...checkNumber(tier.multiplier, `${where}.multiplier`, 1))
    issues.push(...checkInteger(tier.bonusRolls, `${where}.bonusRolls`, 0))
    checkItemRewards(data, tier.rewards, `${where}.rewards`, issues)
  })
}

function checkItemWorld(data: GameData, value: unknown, issues: string[]): void {
  const at = `${WHERE}.itemWorld`
  const config = asObject(value)
  if (!config) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(config, ITEM_WORLD_FIELDS, at, 'config', issues)
  checkRarityTable(
    config.rarityFloors,
    `${at}.rarityFloors`,
    (entry, where) => checkInteger(entry, where, 1),
    issues
  )
  for (const key of ['floorsPerDepth', 'floorsPerLevel', 'newSpiritDepthPercent']) {
    issues.push(...checkNumber(config[key], `${at}.${key}`, 0))
  }
  for (const key of ['spiritChance', 'healPercent']) {
    issues.push(...checkNumber(config[key], `${at}.${key}`, 0, 100))
  }
  issues.push(...checkInteger(config.leaveEvery, `${at}.leaveEvery`, 1))
  issues.push(...checkStackItemId(data, String(config.breakItemId), `${at}.breakItemId`))
  checkItemRewards(data, config.floorRewards, `${at}.floorRewards`, issues)
  checkBosses(data, config.bosses, `${at}.bosses`, issues)
  const bonus = asObject(config.bonus)
  if (!bonus) {
    issues.push(`${at}.bonus phải là object`)
    return
  }
  checkKnownFields(bonus, ['affixChance', 'spiritValue'], `${at}.bonus`, 'config', issues)
  issues.push(...checkNumber(bonus.affixChance, `${at}.bonus.affixChance`, 0, 100))
  issues.push(...checkInteger(bonus.spiritValue, `${at}.bonus.spiritValue`, 0))
}

/** Nuôi, phối linh, triệu khí linh. */
function checkPavilion(data: GameData, config: Record<string, unknown>, issues: string[]): void {
  const feed = asObject(config.feed)
  if (!feed) issues.push(`${WHERE}.feed phải là object`)
  else {
    checkKnownFields(feed, ['groupId', 'coreValue', 'soulValue'], `${WHERE}.feed`, 'config', issues)
    issues.push(...checkItemGroupId(data, feed.groupId, `${WHERE}.feed.groupId`))
    issues.push(...checkInteger(feed.coreValue, `${WHERE}.feed.coreValue`, 1))
    checkRarityTable(
      feed.soulValue,
      `${WHERE}.feed.soulValue`,
      (entry, where) => checkInteger(entry, where, 1),
      issues
    )
  }
  const breed = asObject(config.breed)
  if (!breed) issues.push(`${WHERE}.breed phải là object`)
  else issues.push(...checkInteger(breed.days, `${WHERE}.breed.days`, 0))
  const summon = asObject(config.summon)
  if (!summon) issues.push(`${WHERE}.summon phải là object`)
  else {
    const at = `${WHERE}.summon`
    checkKnownFields(summon, ['orbItemId', 'rarityWeights'], at, 'config', issues)
    issues.push(...checkStackItemId(data, String(summon.orbItemId), `${at}.orbItemId`))
    checkRarityWeights(summon.rarityWeights, `${at}.rarityWeights`, issues)
  }
  if (!Array.isArray(config.orbBossDrops)) {
    issues.push(`${WHERE}.orbBossDrops phải là danh sách`)
  } else checkDrops(data, config.orbBossDrops, `${WHERE}.orbBossDrops`, issues)
}

/** Ô, hiệu lực, value, số dã linh trên đồ rơi. */
function checkSpiritNumbers(config: Record<string, unknown>, issues: string[]): void {
  checkRarityTable(
    config.slots,
    `${WHERE}.slots`,
    (entry, where) => checkInteger(entry, where, 0),
    issues
  )
  issues.push(...checkInteger(config.soulRelicSlots, `${WHERE}.soulRelicSlots`, 0))
  issues.push(...checkInteger(config.levelsPerSlot, `${WHERE}.levelsPerSlot`, 1))
  issues.push(...checkNumber(config.wildPotencyPercent, `${WHERE}.wildPotencyPercent`, 0, 100))
  issues.push(...checkNumber(config.moveMoneyPerValue, `${WHERE}.moveMoneyPerValue`, 0))
  const ranges = asObject(config.valueRanges)
  checkRarityTable(
    ranges,
    `${WHERE}.valueRanges`,
    (entry, where) => {
      const found: string[] = []
      checkIntRange(entry, where, 1, found)
      return found
    },
    issues
  )
  const weights = config.dropSpiritWeights
  if (!Array.isArray(weights) || weights.length === 0) {
    issues.push(`${WHERE}.dropSpiritWeights phải là danh sách trọng số khác rỗng`)
    return
  }
  weights.forEach((weight: unknown, i) =>
    issues.push(...checkNumber(weight, `${WHERE}.dropSpiritWeights[${i}]`, 0))
  )
  if (!weights.some((weight: unknown) => typeof weight === 'number' && weight > 0)) {
    issues.push(`${WHERE}.dropSpiritWeights cần ít nhất một trọng số > 0`)
  }
}

/** Kiểm tra artifactSpirits.json và config.artifactSpirits. */
export function checkArtifactSpiritData(data: GameData, issues: string[]): void {
  checkSpiritDefs(data, issues)
  const config = asObject(data.config.artifactSpirits)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, CONFIG_FIELDS, WHERE, 'config', issues)
  checkSpiritNumbers(config, issues)
  checkGrades(config, issues)
  checkPavilion(data, config, issues)
  checkItemWorld(data, config.itemWorld, issues)
}
