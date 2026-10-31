// Kiểm tra cấu hình cân bằng (src/data/balance.json).

import {
  CRYSTAL_TRAIT_KINDS,
  FUSE_RACE_MATCHES,
  STAT_NAMES,
  TRAIT_KIND_RULES,
  TRAIT_KINDS,
  type GameData,
  type HitCountWeights,
  type TraitKind
} from '../model'
import { asObject, checkInteger, checkNumber, isFiniteNumber } from '../shared'
import { checkKnownFields } from './checks'

/** Bảng trọng số số đòn: khoảng nguyên 1 ≤ min ≤ max, không trùng, đủ trọng số > 0 cho mỗi số đòn. */
function checkHitCountWeights(
  table: readonly HitCountWeights[] | undefined,
  issues: string[]
): void {
  const where = 'config.battle.hitCountWeights'
  if (!Array.isArray(table)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  const seen = new Set<string>()
  table.forEach((entry, i) => {
    const at = `battle.hitCountWeights[${i}]`
    const problems = [
      ...checkInteger(entry.min, `${at}.min`, 1),
      ...checkInteger(entry.max, `${at}.max`, entry.min ?? 1)
    ]
    issues.push(...problems.map((problem) => `config.${problem}`))
    if (problems.length > 0) return
    const key = `${entry.min}-${entry.max}`
    if (seen.has(key)) issues.push(`${where}: khoảng ${key} bị khai báo hai lần`)
    seen.add(key)
    const weights = entry.weights
    if (
      !Array.isArray(weights) ||
      weights.length !== entry.max - entry.min + 1 ||
      weights.some((w) => !isFiniteNumber(w) || w <= 0)
    ) {
      issues.push(`${where}[${i}].weights cần ${entry.max - entry.min + 1} trọng số > 0`)
    }
  })
}

/** Ngưỡng quy đổi % chỉ số sang bậc trận: danh sách số tăng dần, mỗi số > 0. */
function checkStagePercentSteps(value: unknown, issues: string[]): void {
  const where = 'config.battle.stagePercentSteps'
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where} phải là danh sách số không rỗng`)
    return
  }
  value.forEach((step, i) => {
    const previous = i === 0 ? 0 : value[i - 1]
    if (!isFiniteNumber(step) || step <= (isFiniteNumber(previous) ? previous : 0)) {
      issues.push(`${where}[${i}] phải là số lớn hơn phần tử trước (và > 0)`)
    }
  })
}

/** Trọng số AI theo trạng thái: đủ mọi trạng thái, không thừa id, mỗi số ≥ 0. */
function checkStatusWeights(data: GameData, issues: string[]): void {
  const where = 'config.ai.statusWeights'
  const weights = asObject(data.config.ai?.statusWeights)
  if (!weights) {
    issues.push(`${where} phải là object id trạng thái → trọng số`)
    return
  }
  for (const statusId of Object.keys(data.statuses)) {
    if (!(statusId in weights)) issues.push(`${where}: thiếu trọng số cho trạng thái "${statusId}"`)
  }
  for (const [statusId, weight] of Object.entries(weights)) {
    if (!(statusId in data.statuses)) {
      issues.push(`${where}: trạng thái không tồn tại "${statusId}"`)
    }
    issues.push(...checkNumber(weight, `${where}.${statusId}`, 0))
  }
}

/** Bảng số theo loại trait có tinh thể: đủ mọi loại, không thừa loại, mỗi số ≥ 0. */
function checkCrystalKindTable(value: unknown, where: string, issues: string[]): void {
  const table = asObject(value)
  if (!table) {
    issues.push(`${where} phải là object loại trait → số`)
    return
  }
  for (const kind of CRYSTAL_TRAIT_KINDS) {
    if (!(kind in table)) issues.push(`${where}: thiếu loại trait "${kind}"`)
  }
  for (const [kind, number] of Object.entries(table)) {
    if (!CRYSTAL_TRAIT_KINDS.some((k) => k === kind)) {
      issues.push(`${where}: "${kind}" không phải loại trait có tinh thể`)
    }
    issues.push(...checkNumber(number, `${where}.${kind}`, 0))
  }
}

/** Tinh thể và cửa hàng (mục "Cửa hàng và vứt vật phẩm"). */
function checkShopConfig(data: GameData, issues: string[]): void {
  const push = (problems: string[]): void => {
    for (const problem of problems) issues.push(`config.${problem}`)
  }
  const crystal = data.config.crystal ?? ({} as GameData['config']['crystal'])
  push(checkNumber(crystal.extractCostBase, 'crystal.extractCostBase', 0))
  checkCrystalKindTable(crystal.kindCostMultipliers, 'config.crystal.kindCostMultipliers', issues)
  const shop = data.config.shop ?? ({} as GameData['config']['shop'])
  push(checkInteger(shop.stockMin, 'shop.stockMin', 1))
  push(checkInteger(shop.stockMax, 'shop.stockMax', shop.stockMin ?? 1))
  push(checkNumber(shop.sellPercent, 'shop.sellPercent', 0, 100))
  // ≥ 100 / sellPercent thì mua rồi bán lại không có lời; chỉ chặn số âm, cân bằng do chủ project.
  push(checkNumber(shop.crystalBuyMultiplier, 'shop.crystalBuyMultiplier', 0))
  checkCrystalKindTable(shop.crystalWeights, 'config.shop.crystalWeights', issues)
}

/**
 * dropPerUnit dương nhỏ nhất: marketSellTotal lặp từng cái trong đoạn giá còn tụt, dài tối đa
 * (1 − minFactor) / dropPerUnit cái, nên chặn dưới để vòng lặp không quá 10.000 lần.
 */
const MIN_DROP_PER_UNIT = 0.0001

/** Bậc tụt giá: maxPrice tăng dần, chỉ bậc cuối không ghi maxPrice; dropPerUnit = 0 hoặc đủ lớn. */
function checkDropTiers(value: unknown, issues: string[]): void {
  const where = 'config.market.dropTiers'
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where} cần ít nhất một bậc`)
    return
  }
  let previous = -Infinity
  value.forEach((raw: unknown, i) => {
    const tier = asObject(raw)
    const at = `${where}[${i}]`
    if (!tier) {
      issues.push(`${at} không hợp lệ`)
      return
    }
    checkKnownFields(tier, ['maxPrice', 'dropPerUnit'], at, 'bậc tụt giá', issues)
    const drop = tier.dropPerUnit
    if (drop !== 0) issues.push(...checkNumber(drop, `${at}.dropPerUnit`, MIN_DROP_PER_UNIT, 1))
    const isLast = i === value.length - 1
    if (isLast) {
      if (tier.maxPrice !== undefined) issues.push(`${at}: bậc cuối không ghi maxPrice`)
      return
    }
    issues.push(...checkNumber(tier.maxPrice, `${at}.maxPrice`, 0))
    if (isFiniteNumber(tier.maxPrice)) {
      if (tier.maxPrice <= previous) issues.push(`${at}.maxPrice phải tăng dần`)
      previous = tier.maxPrice
    }
  })
}

/** Giá thị trường động (mục "Giá thị trường động" ở world-items.md). */
function checkMarketConfig(data: GameData, issues: string[]): void {
  const push = (problems: string[]): void => {
    for (const problem of problems) issues.push(`config.${problem}`)
  }
  const market = data.config.market ?? ({} as GameData['config']['market'])
  push(checkNumber(market.minFactor, 'market.minFactor', Number.MIN_VALUE, 1))
  push(checkNumber(market.recoveryPerDay, 'market.recoveryPerDay', 0, 1))
  push(checkNumber(market.removeBelow, 'market.removeBelow', 0))
  push(checkNumber(market.dayFactorMin, 'market.dayFactorMin', 0))
  push(checkNumber(market.dayFactorMax, 'market.dayFactorMax', market.dayFactorMin ?? 0))
  push(checkNumber(market.hotMultiplier, 'market.hotMultiplier', 0))
  checkDropTiers(market.dropTiers, issues)
}

/** Tỉ lệ fuse thành công (mục Fusing): % theo mức hợp race, hệ số lineage trong (0, 1]. */
function checkFuseChanceConfig(data: GameData, issues: string[]): void {
  const fuseChance = asObject(data.config.fuseChance)
  if (!fuseChance) {
    issues.push('config.fuseChance phải là object')
    return
  }
  const raceChances = asObject(fuseChance.raceChances)
  if (!raceChances) {
    issues.push('config.fuseChance.raceChances phải là object mức hợp race → %')
  } else {
    for (const match of FUSE_RACE_MATCHES) {
      issues.push(
        ...checkNumber(raceChances[match], `config.fuseChance.raceChances.${match}`, 0, 100)
      )
    }
    for (const key of Object.keys(raceChances)) {
      if (!FUSE_RACE_MATCHES.some((match) => match === key)) {
        issues.push(`config.fuseChance.raceChances: "${key}" không phải mức hợp race`)
      }
    }
  }
  issues.push(
    ...checkNumber(fuseChance.lineageFactor, 'config.fuseChance.lineageFactor', Number.MIN_VALUE, 1)
  )
}

/**
 * Trọng số loại trait của quái hoang: mỗi khóa là loại `wildRollable`, trọng số hữu hạn ≥ 0, có ít
 * nhất một loại > 0.
 */
function checkTraitKindWeights(value: unknown): string[] {
  const field = 'config.wild.traitKindWeights'
  const weights = asObject(value)
  if (!weights) return [`${field} phải là object`]
  const issues: string[] = []
  for (const [kind, weight] of Object.entries(weights)) {
    const isKnown = (TRAIT_KINDS as readonly string[]).includes(kind)
    if (!isKnown || !TRAIT_KIND_RULES[kind as TraitKind].wildRollable) {
      issues.push(`${field}: loại trait "${kind}" không hợp lệ hoặc không tung cho quái hoang`)
    } else if (!isFiniteNumber(weight) || weight < 0) {
      issues.push(`${field}.${kind} phải là số hữu hạn ≥ 0, nhận ${String(weight)}`)
    }
  }
  if (!Object.values(weights).some((weight) => isFiniteNumber(weight) && weight > 0)) {
    issues.push(`${field} cần ít nhất một loại có trọng số > 0`)
  }
  return issues
}

export function checkConfig(data: GameData, issues: string[]): void {
  const { config } = data
  const push = (problems: string[]): void => {
    for (const problem of problems) issues.push(`config.${problem}`)
  }
  push(checkNumber(config.geneWeight, 'geneWeight', 0))
  push(checkNumber(config.shinyMultiplier, 'shinyMultiplier', Number.MIN_VALUE))
  push(checkNumber(config.levelEffectStep, 'levelEffectStep', 0))
  push(checkInteger(config.traitSlots?.initial, 'traitSlots.initial', 0))
  push(checkInteger(config.traitSlots?.max, 'traitSlots.max', config.traitSlots?.initial ?? 0))
  push(checkNumber(config.fuseCostPerLevel, 'fuseCostPerLevel', 0))
  checkFuseChanceConfig(data, issues)
  push(checkInteger(config.fusion?.inheritSkills, 'fusion.inheritSkills', 0))
  checkShopConfig(data, issues)
  checkMarketConfig(data, issues)
  // config.starter kiểm tra ở validateStarters.ts.
  push(checkInteger(config.partySize, 'partySize', 1))
  push(checkInteger(config.maxSkills, 'maxSkills', 1))
  push(checkNumber(config.restCostPerLevel, 'restCostPerLevel', 0))
  push(checkNumber(config.capture?.hpFloorPercent, 'capture.hpFloorPercent', 0, 100))
  push(checkNumber(config.capture?.pityPercentPerMiss, 'capture.pityPercentPerMiss', 0, 100))
  push(checkInteger(config.capture?.shakeChecks, 'capture.shakeChecks', 1))
  push(checkNumber(config.weight?.defaultRaceKg, 'weight.defaultRaceKg', Number.MIN_VALUE))
  push(
    checkNumber(config.weight?.referenceStatTotal, 'weight.referenceStatTotal', Number.MIN_VALUE)
  )
  push(checkNumber(config.weight?.statExponent, 'weight.statExponent', 0))
  push(checkNumber(config.size?.largeWeightKg, 'size.largeWeightKg', Number.MIN_VALUE))
  for (const [stat, value] of Object.entries(config.size?.statMultipliers ?? {})) {
    if (!(STAT_NAMES as readonly string[]).includes(stat)) {
      issues.push(`size.statMultipliers: chỉ số lạ "${stat}"`)
    }
    push(checkNumber(value, `size.statMultipliers.${stat}`, Number.MIN_VALUE))
  }
  push(checkNumber(config.size?.damageMultiplier, 'size.damageMultiplier', Number.MIN_VALUE))
  push(checkInteger(config.size?.largePartySlots, 'size.largePartySlots', 1))
  if ((config.size?.largePartySlots ?? 0) > config.partySize) {
    issues.push('size.largePartySlots không được lớn hơn partySize')
  }
  push(checkNumber(config.capture?.criticalDivisor, 'capture.criticalDivisor', Number.MIN_VALUE))
  push(checkInteger(config.maxNicknameLength, 'maxNicknameLength', 1))
  push(checkInteger(config.history?.maxMilestones, 'history.maxMilestones', 1))
  push(checkNumber(config.relearnCostPerLevel, 'relearnCostPerLevel', 0))
  push(checkNumber(config.shiny?.wildChance, 'shiny.wildChance', 0, 100))
  const boss = config.boss ?? ({} as GameData['config']['boss'])
  if (data.traits[boss.traitId]?.kind !== 'boss') {
    issues.push(`config.boss.traitId "${boss.traitId}" phải trỏ tới trait loại "boss"`)
  }
  push(checkNumber(boss.chance, 'boss.chance', 0, 100))
  push(checkInteger(boss.multiplierMin, 'boss.multiplierMin', 1))
  push(checkInteger(boss.multiplierMax, 'boss.multiplierMax', boss.multiplierMin ?? 1))
  push(checkNumber(boss.eggChance, 'boss.eggChance', 0, 100))
  const breeding = config.breeding ?? ({} as GameData['config']['breeding'])
  push(checkNumber(breeding.costPerLevel, 'breeding.costPerLevel', 0))
  push(checkNumber(breeding.shinyChance, 'breeding.shinyChance', 0, 100))
  push(checkNumber(breeding.shinyChanceOneParent, 'breeding.shinyChanceOneParent', 0, 100))
  push(checkNumber(breeding.mutationChance, 'breeding.mutationChance', 0, 100))
  push(checkNumber(breeding.geneDownPercent, 'breeding.geneDownPercent', 0, 100))
  push(checkNumber(breeding.geneUpPercent, 'breeding.geneUpPercent', 0))
  const egg = config.egg ?? ({} as GameData['config']['egg'])
  push(checkInteger(egg.hatchBattlesMin, 'egg.hatchBattlesMin', 1))
  push(checkInteger(egg.hatchBattlesMax, 'egg.hatchBattlesMax', egg.hatchBattlesMin ?? 1))
  if (data.traits[config.shiny?.traitId]?.kind !== 'shiny') {
    issues.push(`config.shiny.traitId "${config.shiny?.traitId}" phải trỏ tới trait loại "shiny"`)
  }

  const stage = config.battleStage
  if (
    !stage ||
    !Number.isSafeInteger(stage.min) ||
    !Number.isSafeInteger(stage.max) ||
    stage.min > 0 ||
    stage.max < 0
  ) {
    issues.push('config.battleStage cần min ≤ 0 ≤ max, đều là số nguyên')
  }
  push(checkNumber(stage?.base, 'battleStage.base', Number.MIN_VALUE))
  push(checkNumber(stage?.accuracyBase, 'battleStage.accuracyBase', Number.MIN_VALUE))

  const battle = config.battle ?? ({} as GameData['config']['battle'])
  push(checkNumber(battle.damageFactor, 'battle.damageFactor', Number.MIN_VALUE))
  if (battle.struggleSkillId !== undefined && data.skills[battle.struggleSkillId] === undefined) {
    issues.push(`config.battle.struggleSkillId: skill không tồn tại "${battle.struggleSkillId}"`)
  }
  push(checkNumber(battle.stabMultiplier, 'battle.stabMultiplier', 0))
  push(checkNumber(battle.critChance, 'battle.critChance', 0, 100))
  if (!Array.isArray(battle.critStageChances)) {
    issues.push('config.battle.critStageChances phải là danh sách')
  } else {
    battle.critStageChances.forEach((chance, i) =>
      push(checkNumber(chance, `battle.critStageChances[${i}]`, 0, 100))
    )
  }
  push(checkNumber(battle.critMultiplier, 'battle.critMultiplier', 0))
  push(checkNumber(battle.randomMin, 'battle.randomMin', 0))
  push(checkNumber(battle.randomMax, 'battle.randomMax', battle.randomMin ?? 0))
  push(checkNumber(battle.spreadMultiplier, 'battle.spreadMultiplier', 0))
  push(checkNumber(battle.fleeChance, 'battle.fleeChance', 0, 100))
  checkHitCountWeights(battle.hitCountWeights, issues)
  for (const command of ['defend', 'provoke'] as const) {
    const guard = asObject(battle[command])
    push(checkInteger(guard?.priority, `battle.${command}.priority`))
    push(checkNumber(guard?.damageTakenPercent, `battle.${command}.damageTakenPercent`, -100))
  }
  const chain = asObject(battle.traitChain)
  push(checkInteger(chain?.maxDepth, 'battle.traitChain.maxDepth', 0))
  push(checkInteger(chain?.maxActions, 'battle.traitChain.maxActions', 0))
  push(checkInteger(chain?.maxRepeats, 'battle.traitChain.maxRepeats', 0))
  checkStagePercentSteps(battle.stagePercentSteps, issues)

  push(checkNumber(config.status?.bossDamageMultiplier, 'status.bossDamageMultiplier', 0))

  const ai = config.ai ?? ({} as GameData['config']['ai'])
  push(checkNumber(ai.koBonus, 'ai.koBonus', 0))
  push(checkNumber(ai.lowHpTargetWeight, 'ai.lowHpTargetWeight', 0))
  push(checkNumber(ai.stageValuePerStep, 'ai.stageValuePerStep', 0))
  push(checkNumber(ai.healWeight, 'ai.healWeight', 0))
  push(checkNumber(ai.fieldWeight, 'ai.fieldWeight', 0))
  push(checkNumber(ai.defendWeight, 'ai.defendWeight', 0))
  push(checkNumber(ai.provokeWeight, 'ai.provokeWeight', 0))
  push(checkNumber(ai.minionWeight, 'ai.minionWeight', 0))
  push(checkNumber(ai.spellEffectWeight, 'ai.spellEffectWeight', 0))
  push(checkNumber(ai.transformMinGain, 'ai.transformMinGain'))
  push(checkNumber(ai.reviveBonus, 'ai.reviveBonus', 0))
  push(checkNumber(ai.tamerSkillMinScore, 'ai.tamerSkillMinScore', 0))
  push(checkNumber(ai.holdTurnWeight, 'ai.holdTurnWeight', 0))
  checkStatusWeights(data, issues)

  const rewards = config.rewards ?? ({} as GameData['config']['rewards'])
  push(checkNumber(rewards.expFactor, 'rewards.expFactor', 0))
  push(checkInteger(rewards.minExp, 'rewards.minExp', 0))
  push(checkNumber(rewards.moneyPerLevel, 'rewards.moneyPerLevel', 0))
  push(checkNumber(rewards.losePenaltyPercent, 'rewards.losePenaltyPercent', 0, 100))

  const wild = config.wild ?? ({} as GameData['config']['wild'])
  push(checkInteger(wild.geneMin, 'wild.geneMin', 1))
  push(checkInteger(wild.geneMax, 'wild.geneMax', wild.geneMin ?? 1))
  if (
    !Array.isArray(wild.traitCountWeights) ||
    wild.traitCountWeights.length === 0 ||
    wild.traitCountWeights.some((w) => !isFiniteNumber(w) || w < 0) ||
    wild.traitCountWeights.every((w) => w === 0)
  ) {
    issues.push(
      'config.wild.traitCountWeights phải là danh sách trọng số ≥ 0, có ít nhất một số > 0'
    )
  }
  issues.push(...checkTraitKindWeights(wild.traitKindWeights))

  const floors = config.floors ?? ({} as GameData['config']['floors'])
  // ≥ 2 để khoảng level quái thường [L(N − 1) + 1, LN − 1] không rỗng.
  push(checkInteger(floors.levelPerFloor, 'floors.levelPerFloor', 2))
  // ≥ 1 để khoảng gen không bao giờ nhỏ lại (gen tối thiểu 1, mục Dữ liệu quái).
  push(checkNumber(floors.geneGrowthPerFloor, 'floors.geneGrowthPerFloor', 1))

  if (data.species[config.fusedSpeciesId]?.kind !== 'fused') {
    issues.push(`config.fusedSpeciesId "${config.fusedSpeciesId}" phải trỏ tới loài kind "fused"`)
  }
}
