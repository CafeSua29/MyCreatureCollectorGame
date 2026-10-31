// Kiểm tra dữ liệu của biến hình trong trận (mục "Biến hình trong trận" ở transformation.md):
// config.transform, chiêu Max / G-Max / Max Guard / Tera Blast, trường biến hình của loài, dạng
// Mega / gmax không gặp được ngoài tự nhiên. Luật category vật phẩm (keyItem, megaStone,
// teraShard) ở itemCategories.ts.

import {
  MAX_MOVE_KINDS,
  STAT_NAMES,
  TRANSFORM_KINDS,
  evolutionTargetIds,
  isBattleOnlyMove,
  type GameData,
  type MaxPowerTable,
  type NormalSpecies,
  allMaps
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'

const BATTLE_ONLY_FORMS: readonly string[] = ['mega', 'gmax']

/** Bảng power chiêu Max / Z-Move: các bậc `below` tăng dần, power > 0, `top` > 0. */
export function checkPowerTable(table: MaxPowerTable | undefined, where: string): string[] {
  if (!table || !Array.isArray(table.steps) || table.steps.length === 0) {
    return [`${where}.steps phải là danh sách không rỗng`]
  }
  const issues = checkNumber(table.top, `${where}.top`, Number.MIN_VALUE)
  table.steps.forEach((step, i) => {
    const previous = i === 0 ? 0 : table.steps[i - 1].below
    issues.push(...checkNumber(step.below, `${where}.steps[${i}].below`, previous + Number.EPSILON))
    issues.push(...checkNumber(step.power, `${where}.steps[${i}].power`, Number.MIN_VALUE))
  })
  return issues
}

/** Vật phẩm chìa khóa của từng loại (tầng đạo quán nhận: validateTrainers.ts). */
function checkKeyItems(data: GameData, issues: string[]): void {
  const { keyItems } = data.config.transform
  const isKeyItem = (itemId: string): boolean => data.items[itemId]?.category === 'keyItem'
  // Loại không ghi vật phẩm chìa khóa: ai cũng dùng được (kể cả quái hoang / boss).
  for (const kind of TRANSFORM_KINDS) {
    const itemId = keyItems?.[kind]
    if (itemId !== undefined && !isKeyItem(itemId)) {
      issues.push(`config.transform.keyItems.${kind} phải là vật phẩm chìa khóa`)
    }
  }
}

/** Số và id của config.transform. */
function checkTransformConfig(data: GameData, issues: string[]): void {
  const transform = data.config.transform
  if (!asObject(transform)) {
    issues.push('config.transform không hợp lệ')
    return
  }
  const push = (problems: string[]): void => {
    for (const problem of problems) issues.push(`config.transform.${problem}`)
  }
  checkKeyItems(data, issues)
  push(checkNumber(transform.mega?.stoneDropChance, 'mega.stoneDropChance', 0, 100))
  const { dynamax, tera, boss } = transform
  push(checkInteger(dynamax?.turns, 'dynamax.turns', 1))
  push(checkNumber(dynamax?.hpMultiplierBase, 'dynamax.hpMultiplierBase', Number.MIN_VALUE))
  push(checkNumber(dynamax?.hpMultiplierPerLevel, 'dynamax.hpMultiplierPerLevel', 0))
  push(checkInteger(dynamax?.maxLevel, 'dynamax.maxLevel', 0))
  push(checkPowerTable(dynamax?.powerTable, 'dynamax.powerTable'))
  push(checkPowerTable(dynamax?.lowPowerTable, 'dynamax.lowPowerTable'))
  for (const elementId of dynamax?.lowPowerElementIds ?? []) {
    if (!(elementId in data.elements)) push([`dynamax.lowPowerElementIds: hệ lạ "${elementId}"`])
  }
  push(checkNumber(dynamax?.bossGmaxFactorChance, 'dynamax.bossGmaxFactorChance', 0, 100))
  for (const field of [
    'sameStabMultiplier',
    'stellarOriginalMultiplier',
    'stellarOtherMultiplier',
    'stellarBlastEffectiveness'
  ] as const) {
    push(checkNumber(tera?.[field], `tera.${field}`, 0))
  }
  push(checkNumber(tera?.minPower, 'tera.minPower', 0))
  push(checkNumber(tera?.stellarBlastPower, 'tera.stellarBlastPower', Number.MIN_VALUE))
  for (const [i, entry] of (tera?.stellarBlastSelfStages ?? []).entries()) {
    // Đọc từ JSON nên kiểm tra lại dù type đã loại hp.
    const stat: string = entry.stat
    if (!STAT_NAMES.some((name) => name === stat) || stat === 'hp') {
      push([`tera.stellarBlastSelfStages[${i}].stat phải là chỉ số khác hp`])
    }
    push(checkInteger(entry.delta, `tera.stellarBlastSelfStages[${i}].delta`))
  }
  push(checkInteger(tera?.changeCost, 'tera.changeCost', 1))
  push(checkNumber(tera?.bossOwnElementChance, 'tera.bossOwnElementChance', 0, 100))
  push(checkInteger(tera?.stellarFromFloor, 'tera.stellarFromFloor', 1))
  push(checkNumber(tera?.stellarChance, 'tera.stellarChance', 0, 100))
  push(checkNumber(tera?.shardDrop?.chance, 'tera.shardDrop.chance', 0, 100))
  push(checkInteger(tera?.shardDrop?.min, 'tera.shardDrop.min', 1))
  push(checkInteger(tera?.shardDrop?.max, 'tera.shardDrop.max', tera?.shardDrop?.min ?? 1))
  for (const skillId of tera?.relearnSkillIds ?? []) {
    if (!(skillId in data.skills)) push([`tera.relearnSkillIds: skill lạ "${skillId}"`])
  }
  const { merge } = transform
  push(checkInteger(merge?.turns, 'merge.turns', 1))
  push(checkNumber(merge?.lowerSharePercent, 'merge.lowerSharePercent', 0, 100))
  push(checkNumber(merge?.minAffinity, 'merge.minAffinity', 0))
  push(checkNumber(boss?.base, 'boss.base', 0))
  push(checkNumber(boss?.perFloor, 'boss.perFloor', 0))
  for (const kind of TRANSFORM_KINDS) {
    push(checkNumber(boss?.weights?.[kind], `boss.weights.${kind}`, 0))
  }
  for (const [i, drop] of (transform.bossDrops ?? []).entries()) {
    if (!(drop.itemId in data.items)) push([`bossDrops[${i}]: vật phẩm lạ "${drop.itemId}"`])
    push(checkNumber(drop.chance, `bossDrops[${i}].chance`, 0, 100))
  }
}

/**
 * Chiêu của quái Dynamax: maxMove hợp lệ; mỗi hệ đúng một chiêu Max (gây sát thương, nhắm một
 * địch); đúng một Max Guard (skill trạng thái nhắm self); chiêu G-Max gây sát thương. Tera Blast /
 * ignoresProtect chỉ ghi true. Chiêu Max không nằm trong learnset (kiểm tra ở checkFormSpecies).
 */
function checkMaxMoves(data: GameData, issues: string[]): void {
  const skills = Object.values(data.skills)
  for (const skill of skills) {
    const where = `Skill "${skill.id}"`
    if (skill.maxMove !== undefined && !MAX_MOVE_KINDS.includes(skill.maxMove)) {
      issues.push(`${where}: maxMove phải là một trong ${MAX_MOVE_KINDS.join(', ')}`)
    }
    if (skill.teraBlast !== undefined && skill.teraBlast !== true) {
      issues.push(`${where}: teraBlast chỉ được ghi true`)
    }
    if (skill.ignoresProtect !== undefined && skill.ignoresProtect !== true) {
      issues.push(`${where}: ignoresProtect chỉ được ghi true`)
    }
    const attacking = skill.maxMove === 'max' || skill.maxMove === 'gmax'
    if (attacking && (skill.power <= 0 || skill.target !== 'enemy')) {
      issues.push(`${where}: chiêu Max / G-Max phải gây sát thương và nhắm một địch`)
    }
    if (skill.maxMove === 'guard' && (skill.power !== 0 || skill.target !== 'self')) {
      issues.push(`${where}: Max Guard phải là skill trạng thái nhắm self`)
    }
  }
  for (const elementId of Object.keys(data.elements)) {
    const count = skills.filter((s) => s.maxMove === 'max' && s.elementId === elementId).length
    if (count !== 1) issues.push(`Chiêu Max: hệ "${elementId}" cần đúng một chiêu, có ${count}`)
  }
  const guards = skills.filter((skill) => skill.maxMove === 'guard').length
  if (guards !== 1) issues.push(`Chiêu Max: cần đúng một Max Guard, có ${guards}`)
}

/**
 * Trường biến hình của loài: gmaxSkillId chỉ ở dạng gmax, trỏ tới chiêu G-Max; megaSkillId chỉ ở
 * dạng Mega, trỏ tới skill có thật. Chiêu Max / Z-Move không có trong learnset của loài nào.
 */
function checkFormSpecies(data: GameData, species: NormalSpecies, issues: string[]): void {
  const where = `Loài "${species.id}"`
  if (species.gmaxSkillId !== undefined) {
    if (species.formKind !== 'gmax') issues.push(`${where}: gmaxSkillId chỉ dùng cho dạng gmax`)
    if (data.skills[species.gmaxSkillId]?.maxMove !== 'gmax') {
      issues.push(`${where}: gmaxSkillId phải là chiêu G-Max, nhận "${species.gmaxSkillId}"`)
    }
  }
  if (species.megaSkillId !== undefined) {
    if (species.formKind !== 'mega') issues.push(`${where}: megaSkillId chỉ dùng cho dạng Mega`)
    if (!(species.megaSkillId in data.skills)) {
      issues.push(`${where}: megaSkillId skill không tồn tại "${species.megaSkillId}"`)
    }
  }
  for (const entry of species.learnset ?? []) {
    const skill = data.skills[entry.skillId]
    if (skill && isBattleOnlyMove(skill)) {
      issues.push(`${where}: learnset không được có chiêu Max / Z-Move "${entry.skillId}"`)
    }
  }
}

/**
 * Dạng Mega / gmax chỉ là dạng biến hình trong trận: không gặp ngoài tự nhiên, không làm boss, không
 * là quái khởi đầu, không phải đích tiến hóa (nên không nở từ trứng, không sở hữu được).
 */
function checkBattleOnlyForms(data: GameData, issues: string[]): void {
  const isForm = (speciesId: string): boolean => {
    const species = data.species[speciesId]
    return species?.kind === 'normal' && BATTLE_ONLY_FORMS.includes(species.formKind ?? '')
  }
  for (const biome of allMaps(data)) {
    const used = [
      ...biome.encounters.map((entry) => entry.speciesId),
      ...biome.bosses.map((boss) => boss.speciesId),
      biome.floorBossSpeciesId
    ]
    for (const speciesId of new Set(used.filter(isForm))) {
      issues.push(`Biome "${biome.id}": dạng biến hình "${speciesId}" không được gặp / làm boss`)
    }
  }
  for (const speciesId of data.config.starter?.speciesIds ?? []) {
    if (isForm(speciesId)) issues.push(`config.starter: dạng biến hình "${speciesId}"`)
  }
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    for (const targetId of (species.evolutions ?? []).flatMap(evolutionTargetIds)) {
      if (isForm(targetId)) {
        issues.push(`Loài "${species.id}": không tiến hóa thành dạng biến hình "${targetId}"`)
      }
    }
  }
}

/** Biome: powerSpot chỉ ghi true. */
function checkPowerSpots(data: GameData, issues: string[]): void {
  for (const biome of allMaps(data)) {
    if (biome.powerSpot !== undefined && biome.powerSpot !== true) {
      issues.push(`Biome "${biome.id}": powerSpot chỉ được ghi true`)
    }
  }
}

/** Kiểm tra mọi dữ liệu của biến hình trong trận. */
export function checkTransformData(data: GameData, issues: string[]): void {
  checkTransformConfig(data, issues)
  checkMaxMoves(data, issues)
  for (const species of Object.values(data.species)) {
    if (species.kind === 'normal') checkFormSpecies(data, species, issues)
  }
  checkBattleOnlyForms(data, issues)
  checkPowerSpots(data, issues)
}
