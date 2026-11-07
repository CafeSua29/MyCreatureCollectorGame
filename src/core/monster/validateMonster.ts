// Kiểm tra một quái so với dữ liệu game (loài, trait, skill, shiny, ô trait...).

import { checkMonsterMarks } from './marks'
import { traitSlotCap } from './awakening'
import { skillCapacity } from './humanForm'
import { checkShinyConsistency } from './shiny'
import { isGenderlessSpecies } from './gender'
import { validateStatuses } from './status'
import {
  ASSIGNMENT_KINDS,
  WORK_TYPES,
  ABILITY_SLOTS,
  GENDERS,
  STAT_NAMES,
  HUMAN_FORM_STATES,
  TACTICS,
  TRANSFORM_KINDS,
  TRAIT_KIND_RULES,
  usesTraitSlot,
  type GameData,
  type Monster,
  type NormalSpecies
} from '../model'
import {
  asObject,
  checkBig,
  checkInteger,
  checkNumber,
  DataError,
  memoInReadOnlyScope
} from '../shared'
import { checkElementIds, isTeraElement } from '../gameData'
import {
  canHaveGmaxFactor,
  isBookableSkill,
  validateEquippedItems,
  validateSkillStickers
} from '../inventory'
import { checkLifeFields } from './life'
import { validateHistory } from './history'
import { validateImprint } from './imprint'
import { validateSkillMastery } from './mastery'
import { validateTalentRanks } from './talents'
import { validateSpiritVirus } from './spiritVirus'
import { validatePolarity } from './polarity'
import { validateBloodlines } from './bloodline'
import { maxWorkTraits } from '../registries'

/** Bệnh (docs/rules/dwelling.md): null hoặc { id bệnh tồn tại, restDays nguyên ≥ 0, < idleCureDays }. */
function checkAilment(data: GameData, value: unknown, at: string): string[] {
  if (value === null) return []
  const ailment = asObject(value)
  if (!ailment) return [`${at} phải là null hoặc { id, restDays }`]
  const issues: string[] = []
  if (typeof ailment.id !== 'string' || !Object.hasOwn(data.ailments, ailment.id)) {
    issues.push(`${at}.id: bệnh không tồn tại "${String(ailment.id)}"`)
  }
  issues.push(...checkInteger(ailment.restDays, `${at}.restDays`, 0))
  const { idleCureDays } = data.config.dwelling.needs
  if (typeof ailment.restDays === 'number' && ailment.restDays >= idleCureDays) {
    issues.push(`${at}.restDays phải nhỏ hơn ${idleCureDays}`)
  }
  return issues
}

/** Điểm sách làm việc (docs/rules/dwelling.md): object loại việc → số nguyên ≥ 0. */
function checkWorkPoints(value: unknown, at: string): string[] {
  const points = asObject(value)
  if (!points) return [`${at} phải là object { loại việc: điểm }`]
  return Object.entries(points).flatMap(([type, count]) =>
    (WORK_TYPES as readonly string[]).includes(type)
      ? checkInteger(count, `${at}.${type}`, 0)
      : [`${at}: loại việc lạ "${type}"`]
  )
}

/** Trait làm việc (docs/rules/dwelling.md): id tồn tại, không lặp, không quá số tối đa, không trùng nhóm. */
function checkWorkTraits(data: GameData, monster: Monster, at: string, issues: string[]): void {
  const traits: unknown = monster.workTraits
  if (!Array.isArray(traits)) {
    issues.push(`${at} phải là danh sách id trait làm việc`)
    return
  }
  for (const id of traits) {
    if (typeof id !== 'string' || !Object.hasOwn(data.workTraits, id)) {
      issues.push(`${at}: trait làm việc không tồn tại "${String(id)}"`)
    }
  }
  if (new Set(traits).size !== traits.length) issues.push(`${at} bị lặp`)
  if (traits.length > maxWorkTraits(data)) issues.push(`${at} tối đa ${maxWorkTraits(data)} trait`)
  const groups = traits.flatMap((id: unknown) => {
    const group = typeof id === 'string' ? data.workTraits[id]?.group : undefined
    return group === undefined ? [] : [group]
  })
  if (new Set(groups).size !== groups.length) issues.push(`${at}: hai trait cùng nhóm`)
}

/** Object chỉ số → số nguyên ≥ 0 (cấp hồn tinh, điểm nỗ lực). */
function checkCountStats(value: unknown, field: string): string[] {
  const stats = asObject(value)
  if (!stats) return [`${field} phải là object chỉ số → số nguyên`]
  return STAT_NAMES.flatMap((stat) => checkInteger(stats[stat], `${field}.${stat}`, 0))
}

/** Trả về loài cung cấp chỉ số gốc của quái, hoặc undefined nếu không hợp lệ. */
export function getBaseSpecies(data: GameData, monster: Monster): NormalSpecies | undefined {
  const species = data.species[monster.baseSpeciesId]
  return species?.kind === 'normal' ? species : undefined
}

/**
 * Trường biến hình của quái (mục "Biến hình trong trận"): hệ Tera, Gmax Factor (chỉ loài mang được;
 * quái fuse giữ cờ cũ), cấp Dynamax, biến hình đang có trong trận.
 */
function checkTransformFields(
  data: GameData,
  monster: Monster,
  at: (field: string) => string
): string[] {
  const issues: string[] = []
  if (!isTeraElement(data, monster.teraElementId)) {
    issues.push(`${at('teraElementId')}: hệ Tera không hợp lệ "${String(monster.teraElementId)}"`)
  }
  const fixedTera = data.species[monster.speciesId]
  if (
    fixedTera?.kind === 'normal' &&
    fixedTera.teraElementId !== undefined &&
    monster.teraElementId !== fixedTera.teraElementId
  ) {
    issues.push(`${at('teraElementId')}: loài "${fixedTera.id}" có hệ Tera cố định`)
  }
  if (typeof monster.gmaxFactor !== 'boolean') {
    issues.push(`${at('gmaxFactor')} phải là boolean`)
  } else if (monster.gmaxFactor && !monster.fused && !canHaveGmaxFactor(data, monster.speciesId)) {
    issues.push(`${at('gmaxFactor')}: loài "${monster.speciesId}" không mang được Gmax Factor`)
  }
  issues.push(...checkInteger(monster.dynamaxLevel, at('dynamaxLevel'), 0))
  if (Number.isSafeInteger(monster.dynamaxLevel)) {
    const { maxLevel } = data.config.transform.dynamax
    if (monster.dynamaxLevel > maxLevel) {
      issues.push(`${at('dynamaxLevel')} tối đa ${maxLevel}, nhận ${monster.dynamaxLevel}`)
    }
  }
  if (monster.battleTransform !== undefined) {
    issues.push(...checkBattleTransform(data, monster.battleTransform, at('battleTransform')))
  }
  if (monster.battleForm !== undefined) {
    issues.push(...checkBattleForm(data, monster.battleForm, at('battleForm')))
  }
  return issues
}

/** Dạng trong trận (docs/rules/battle-forms.md): loài dạng battleOnly tồn tại, hệ gốc hợp lệ. */
function checkBattleForm(data: GameData, value: unknown, path: string): string[] {
  const form = asObject(value)
  if (!form) return [`${path} không hợp lệ`]
  const issues: string[] = []
  const species = typeof form.speciesId === 'string' ? data.species[form.speciesId] : undefined
  if (form.copied !== undefined && form.copied !== true)
    issues.push(`${path}.copied chỉ được là true`)
  if (form.copied === true) {
    if (species?.kind !== 'normal') {
      issues.push(`${path}.speciesId: loài không tồn tại "${String(form.speciesId)}"`)
    }
  } else if (species?.kind !== 'normal' || species.formKind !== 'battleOnly') {
    issues.push(`${path}.speciesId: không phải dạng trong trận "${String(form.speciesId)}"`)
  }
  checkOriginalElements(data, form.originalElementIds, `${path}.originalElementIds`, issues)
  if (form.untilLeave !== undefined && form.untilLeave !== true) {
    issues.push(`${path}.untilLeave chỉ được là true`)
  }
  return issues
}

/** Biến hình trong trận: loại hợp lệ, dạng / hệ Tera tồn tại, hệ gốc hợp lệ, số lượt nguyên ≥ 0. */
function checkBattleTransform(data: GameData, value: unknown, path: string): string[] {
  const transform = asObject(value)
  if (!transform) return [`${path} không hợp lệ`]
  const issues: string[] = []
  if (!TRANSFORM_KINDS.some((kind) => kind === transform.kind)) {
    issues.push(`${path}.kind phải là một trong ${TRANSFORM_KINDS.join(', ')}`)
  }
  const form = transform.formSpeciesId
  if (form !== undefined && (typeof form !== 'string' || data.species[form]?.kind !== 'normal')) {
    issues.push(`${path}.formSpeciesId: loài không tồn tại "${String(form)}"`)
  }
  if (transform.teraElementId !== undefined && !isTeraElement(data, transform.teraElementId)) {
    issues.push(`${path}.teraElementId không hợp lệ "${String(transform.teraElementId)}"`)
  }
  checkOriginalElements(data, transform.originalElementIds, `${path}.originalElementIds`, issues)
  if (transform.turnsLeft !== undefined) {
    issues.push(...checkInteger(transform.turnsLeft, `${path}.turnsLeft`, 0))
  }
  if (transform.ended !== undefined && transform.ended !== true) {
    issues.push(`${path}.ended chỉ được là true`)
  }
  const boosted = transform.stellarBoostedElementIds
  if (boosted !== undefined) {
    checkElementIds(data, boosted, `${path}.stellarBoostedElementIds`, issues)
  }
  issues.push(...checkMergeFields(data, transform, path))
  return issues
}

/**
 * Trường hợp thể (docs/rules/battle-merge.md): chỉ loại `merge`; quái chính mang bản chụp quái phụ
 * hợp lệ (không biến hình) và ô của nó, quái phụ mang id quái chính; không có cả hai.
 */
function checkMergeFields(
  data: GameData,
  transform: Record<string, unknown>,
  path: string
): string[] {
  const { mergePartner, mergedIntoId } = transform
  // Rogue Fusion (docs/rules/rogue-fusion.md): chỉ trên quái chính của hợp thể.
  if (transform.rogue !== undefined && (transform.rogue !== true || mergePartner === undefined)) {
    return [`${path}.rogue chỉ được là true trên quái chính hợp thể`]
  }
  if (mergePartner === undefined && mergedIntoId === undefined) return []
  if (transform.kind !== 'merge') return [`${path}: trường hợp thể chỉ có ở biến hình "merge"`]
  if (mergePartner !== undefined && mergedIntoId !== undefined) {
    return [`${path}: không thể vừa là quái chính vừa là quái phụ hợp thể`]
  }
  if (mergedIntoId !== undefined) {
    return typeof mergedIntoId === 'string' && mergedIntoId !== ''
      ? []
      : [`${path}.mergedIntoId phải là id quái`]
  }
  const partner = asObject(mergePartner)
  if (!partner) return [`${path}.mergePartner không hợp lệ`]
  const issues = checkInteger(partner.slot, `${path}.mergePartner.slot`, 0)
  const monster = asObject(partner.monster)
  if (!monster) return [...issues, `${path}.mergePartner.monster không hợp lệ`]
  if (monster.battleTransform !== undefined) {
    issues.push(`${path}.mergePartner.monster không được đang biến hình`)
  }
  // Đã kiểm tra là object; validateMonster tự kiểm tra từng trường.
  issues.push(
    ...validateMonster(data, monster as unknown as Monster, `${path}.mergePartner.monster`)
  )
  return issues
}

/** Bộ chỉ số Decimal (gen, fusingBonusStats): mọi chỉ số hữu hạn ≥ min. */
export function checkBigStats(value: unknown, where: string, min: number): string[] {
  const stats = asObject(value)
  if (!stats) return [`${where}: thiếu bộ chỉ số`]
  return STAT_NAMES.flatMap((stat) => checkBig(stats[stat], `${where}.${stat}`, min))
}

/** Hiệu ứng cấy: id trong serumEffects.json → cấp nguyên khác 0 (docs/rules/implant.md). */
/** Luyện thể: bộ phận → kiểu của đúng bộ phận đó (docs/rules/body-refinement.md). */
function checkRefinements(data: GameData, value: unknown, where: string): string[] {
  const refinements = asObject(value)
  if (!refinements) return [`${where} phải là object`]
  return Object.entries(refinements).flatMap(([partId, refinementId]) => {
    const refinement =
      typeof refinementId === 'string' && Object.hasOwn(data.bodyRefinements, refinementId)
        ? data.bodyRefinements[refinementId]
        : undefined
    if (!refinement) return [`${where}.${partId}: kiểu luyện thể lạ "${String(refinementId)}"`]
    return refinement.partId === partId
      ? []
      : [`${where}.${partId}: kiểu "${refinement.id}" thuộc bộ phận "${refinement.partId}"`]
  })
}

function checkImplantEffects(data: GameData, value: unknown, where: string): string[] {
  const effects = asObject(value)
  if (!effects) return [`${where} phải là object`]
  return Object.entries(effects).flatMap(([effectId, level]) => {
    if (!Object.hasOwn(data.serumEffects, effectId)) {
      return [`${where}: hiệu ứng không tồn tại "${effectId}"`]
    }
    return Number.isSafeInteger(level) && level !== 0
      ? []
      : [`${where}.${effectId} phải là số nguyên khác 0, nhận ${String(level)}`]
  })
}

/**
 * Hệ của quái trong trận: danh sách rỗng hợp lệ (Burn Up, Double Shock, docs/rules/pokemon-moves.md;
 * biến hình lúc đang không hệ giữ hệ gốc rỗng); ngoài trận và quái không đang đổi hệ thì
 * validateGameState chặn (checkTypelessMonsters).
 */
function checkOriginalElements(
  data: GameData,
  elementIds: unknown,
  where: string,
  issues: string[]
): void {
  if (!Array.isArray(elementIds) || elementIds.length > 0) {
    checkElementIds(data, elementIds, where, issues)
  }
}

/**
 * Kiểm tra một quái so với dữ liệu game. Trả về danh sách lỗi; rỗng nếu hợp lệ.
 * `path` (ví dụ "party[0]") được ghép vào thông báo để chỉ rõ trường lỗi ("party[0].genes.attack").
 */
export function validateMonster(data: GameData, monster: Monster, path = ''): string[] {
  const issues: string[] = []
  const { config } = data
  // Tên trường đầy đủ, ví dụ "party[0].genes". Lỗi của trường dùng tên này nên đã đủ đường dẫn.
  const at = (field: string): string => (path ? `${path}.${field}` : field)
  // Lỗi không gắn với một trường cụ thể: thêm tiền tố "party[0]: ".
  const addIssue = (...messages: string[]): void => {
    for (const message of messages) issues.push(path ? `${path}: ${message}` : message)
  }

  if (typeof monster.id !== 'string' || monster.id === '') addIssue('thiếu id')
  for (const field of ['locked', 'favorite'] as const) {
    if (typeof monster[field] !== 'boolean') issues.push(`${at(field)} phải là boolean`)
  }
  if (monster.nickname !== null) {
    if (
      typeof monster.nickname !== 'string' ||
      monster.nickname.trim() !== monster.nickname ||
      monster.nickname === '' ||
      [...monster.nickname].length > config.maxNicknameLength
    ) {
      addIssue(
        `biệt danh phải là null hoặc chuỗi đã cắt khoảng trắng, 1–${config.maxNicknameLength} ký tự`
      )
    }
  }

  const species = data.species[monster.speciesId]
  if (!species) {
    addIssue(`loài không tồn tại "${monster.speciesId}"`)
  } else if (monster.fused && monster.speciesId !== config.fusedSpeciesId) {
    addIssue(`quái fuse phải có speciesId "${config.fusedSpeciesId}"`)
  } else if (!monster.fused && species.kind !== 'normal') {
    addIssue(`quái chưa fuse không được dùng loài "${monster.speciesId}"`)
  }
  if (!getBaseSpecies(data, monster)) {
    addIssue(`baseSpeciesId "${monster.baseSpeciesId}" phải là loài thường tồn tại`)
  }
  if (!monster.fused && monster.baseSpeciesId !== monster.speciesId) {
    addIssue('quái chưa fuse phải có baseSpeciesId bằng speciesId')
  }
  if (!monster.fused && monster.lineage.length > 0) {
    addIssue('quái chưa fuse không được có lineage')
  }
  for (const speciesId of monster.lineage) {
    if (data.species[speciesId]?.kind !== 'normal') {
      addIssue(`lineage chứa loài không hợp lệ "${speciesId}"`)
    }
  }

  if (!(monster.raceId in data.races)) addIssue(`race không tồn tại "${monster.raceId}"`)
  checkOriginalElements(data, monster.elementIds, at('elementIds'), issues)
  // Hệ Bootleg (docs/rules/bootleg.md): null hoặc id hệ tồn tại.
  if (
    monster.bootlegElementId !== null &&
    (typeof monster.bootlegElementId !== 'string' ||
      !Object.hasOwn(data.elements, monster.bootlegElementId))
  ) {
    issues.push(`${at('bootlegElementId')} phải là null hoặc id hệ tồn tại`)
  }

  issues.push(...checkInteger(monster.level, at('level'), 1))
  issues.push(...checkBig(monster.exp, at('exp'), 0))
  if (!GENDERS.includes(monster.gender)) {
    addIssue(`gender không hợp lệ "${monster.gender}"`)
  } else if ((monster.gender === 'none') !== isGenderlessSpecies(data, monster.baseSpeciesId)) {
    // Loài gốc (baseSpeciesId) quyết định: quái fuse lấy giới tính của quái gốc.
    addIssue(
      monster.gender === 'none'
        ? `gender "none" chỉ dành cho loài không giới tính ("${monster.baseSpeciesId}")`
        : `loài "${monster.baseSpeciesId}" không giới tính, gender phải là "none"`
    )
  }
  issues.push(...checkBigStats(monster.genes, at('genes'), 1))
  issues.push(...checkBigStats(monster.fusingBonusStats, at('fusingBonusStats'), 0))
  issues.push(...checkInteger(monster.shinyStacks, at('shinyStacks'), 0))
  issues.push(...checkInteger(monster.sacrificeStacks, at('sacrificeStacks'), 0))
  issues.push(...checkInteger(monster.starCopies, at('starCopies'), 0))
  issues.push(...checkInteger(monster.rebirths, at('rebirths'), 0))
  // Cấy ghép thất bại trừ chỉ số nên được phép âm (docs/rules/implant.md).
  issues.push(...checkBigStats(monster.implantBonusStats, at('implantBonusStats'), -Infinity))
  issues.push(...checkImplantEffects(data, monster.implantEffects, at('implantEffects')))
  issues.push(...checkRefinements(data, monster.refinements, at('refinements')))
  // Dấu ấn (docs/rules/marks.md).
  issues.push(
    ...checkMonsterMarks(
      data,
      { marks: monster.marks, counters: monster.markCounters },
      { marks: at('marks'), counters: at('markCounters') }
    )
  )
  issues.push(...checkInteger(monster.implantAttempts, at('implantAttempts'), 0))
  issues.push(...checkInteger(monster.implantFails, at('implantFails'), 0))
  if (monster.implantFails > monster.implantAttempts) {
    addIssue('implantFails không được vượt implantAttempts')
  }
  // Thất bại lần thứ maxFails thì quái đã mất, quái còn sống luôn ít hơn.
  if (monster.implantFails >= data.config.implant.maxFails) {
    addIssue(`implantFails phải nhỏ hơn ${data.config.implant.maxFails}`)
  }
  issues.push(...checkNumber(monster.bossMultiplier, at('bossMultiplier'), 1))
  issues.push(...checkBig(monster.damageTaken, at('damageTaken'), 0))
  issues.push(...validateStatuses(data, monster.statuses, at('statuses')))
  // Số ô cần tầng cao nhất của người chơi nên kiểm tra ở validateGameState.
  issues.push(...validateEquippedItems(data, monster.equipment, at('equipment')))
  // Max HP đổi trong trận (âm được): Decimal hữu hạn.
  if (monster.battleMaxHpDelta !== undefined) {
    issues.push(...checkBig(monster.battleMaxHpDelta, at('battleMaxHpDelta'), -Infinity))
  }
  issues.push(...checkTransformFields(data, monster, at))
  issues.push(...checkLifeFields(data, monster, at))
  issues.push(...validateHistory(data, monster.history, at('history')))
  issues.push(...validateImprint(data, monster.imprint, at('imprint')))
  issues.push(...checkInteger(monster.affinity, at('affinity'), 0))
  if (Number.isSafeInteger(monster.affinity) && monster.affinity > data.config.affinity.max) {
    issues.push(`${at('affinity')} tối đa ${data.config.affinity.max}, nhận ${monster.affinity}`)
  }
  issues.push(...checkInteger(monster.bossDefeats, at('bossDefeats'), 0))
  // Thức tỉnh (docs/rules/awakening.md).
  issues.push(...checkInteger(monster.awakening, at('awakening'), 0))
  issues.push(...checkInteger(monster.injuryBattlesLeft, at('injuryBattlesLeft'), 0))
  if (!(TACTICS as readonly unknown[]).includes(monster.tactic)) {
    issues.push(`${at('tactic')} phải là ${TACTICS.join(' / ')}`)
  }
  // Việc của quái (docs/rules/expeditions.md, dwelling.md): null hoặc { kind, id }; khớp đội thám
  // hiểm / công trình kiểm ở validateExpeditionState / validateDwellingState.
  if (monster.assignment !== null) {
    const assignment = asObject(monster.assignment)
    if (
      !(ASSIGNMENT_KINDS as readonly unknown[]).includes(assignment?.kind) ||
      typeof assignment?.id !== 'string'
    ) {
      issues.push(
        `${at('assignment')} phải là null hoặc { kind: ${ASSIGNMENT_KINDS.join(' / ')}, id }`
      )
    }
  }
  checkWorkTraits(data, monster, at('workTraits'), issues)
  issues.push(...checkWorkPoints(monster.workPoints, at('workPoints')))
  issues.push(...checkInteger(monster.workSoulLevel, at('workSoulLevel'), 0))
  const needMax = data.config.dwelling.needs.max
  issues.push(...checkNumber(monster.fullness, at('fullness'), 0, needMax))
  issues.push(...checkNumber(monster.sanity, at('sanity'), 0, needMax))
  issues.push(...checkAilment(data, monster.ailment, at('ailment')))
  // Hóa hình (docs/rules/human-form.md): nhân hình chỉ khi race cho hóa hình.
  if (!(HUMAN_FORM_STATES as readonly unknown[]).includes(monster.humanForm)) {
    issues.push(`${at('humanForm')} phải là ${HUMAN_FORM_STATES.join(' / ')}`)
  } else if (monster.humanForm === 'human' && data.races[monster.raceId]?.humanForm === false) {
    addIssue(`race "${monster.raceId}" không có nhân hình, humanForm không được là "human"`)
  }
  const { maxFailures } = config.awakening
  if (
    !Number.isSafeInteger(monster.tribulationFailures) ||
    monster.tribulationFailures < 0 ||
    monster.tribulationFailures > maxFailures
  ) {
    issues.push(`${at('tribulationFailures')} phải là số nguyên trong [0, ${maxFailures}]`)
  }
  if (typeof monster.natureId !== 'string' || !Object.hasOwn(data.natures, monster.natureId)) {
    issues.push(`${at('natureId')}: tính cách không tồn tại "${String(monster.natureId)}"`)
  }
  issues.push(...validateSkillMastery(data, monster.skillMastery, at('skillMastery')))
  // Hồn tinh (docs/rules/soul-levels.md): mỗi chỉ số một cấp nguyên ≥ 0.
  issues.push(...checkCountStats(monster.soulLevels, at('soulLevels')))
  // Điểm nỗ lực (docs/rules/effort-values.md): nguyên ≥ 0. Trần chỉ áp lúc nhận điểm, không kiểm ở
  // đây để đổi trần trong config không làm hỏng save cũ.
  issues.push(...checkCountStats(monster.effortValues, at('effortValues')))
  issues.push(...validateSpiritVirus(monster.spiritVirus, at('spiritVirus')))
  issues.push(...validateBloodlines(data, monster, at('bloodlines')))
  issues.push(...validatePolarity(data, monster.polarity, at('polarity')))
  if (!(ABILITY_SLOTS as readonly unknown[]).includes(monster.abilitySlot)) {
    issues.push(`${at('abilitySlot')} phải là ${ABILITY_SLOTS.join(' / ')}`)
  }
  issues.push(...validateTalentRanks(data, monster.talentRanks, at('talentRanks')))
  if (monster.contractRealm !== null) {
    issues.push(...checkInteger(monster.contractRealm, at('contractRealm'), 0))
  }
  issues.push(...checkInteger(monster.contractDays, at('contractDays'), 0))
  if (monster.contractRealm === null && monster.contractDays !== 0) {
    issues.push(`${at('contractDays')}: quái chưa khế ước phải là 0`)
  }
  // Bản mệnh thú (docs/rules/tamer.md): cờ boolean; số bản mệnh kiểm tra ở validateGameState.
  if (typeof monster.bond !== 'boolean') issues.push(`${at('bond')} phải là boolean`)

  if (!Array.isArray(monster.pendingSkillIds)) {
    addIssue('pendingSkillIds phải là danh sách')
  } else {
    for (const skillId of monster.pendingSkillIds) {
      if (!(skillId in data.skills)) addIssue(`skill chờ học không tồn tại "${skillId}"`)
      if (monster.skillIds?.includes(skillId)) addIssue(`skill chờ học "${skillId}" đã biết`)
    }
    if (new Set(monster.pendingSkillIds).size !== monster.pendingSkillIds.length) {
      addIssue('skill chờ học bị lặp')
    }
  }
  if (!Array.isArray(monster.extraSkillIds)) {
    addIssue('extraSkillIds phải là danh sách')
  } else {
    for (const skillId of monster.extraSkillIds) {
      const skill = typeof skillId === 'string' ? data.skills[skillId] : undefined
      if (!skill) addIssue(`skill ngoài learnset không tồn tại "${String(skillId)}"`)
      else if (!isBookableSkill(data, skill)) {
        addIssue(`skill ngoài learnset "${skillId}" không dạy được (chiêu Max / hợp kích)`)
      }
    }
    if (new Set(monster.extraSkillIds).size !== monster.extraSkillIds.length) {
      addIssue('skill ngoài learnset bị lặp')
    }
  }
  if (!Array.isArray(monster.pendingEvolutionIds)) {
    addIssue('pendingEvolutionIds phải là danh sách')
  } else if (monster.pendingEvolutionIds.length > 0) {
    const current = data.species[monster.speciesId]
    const targets = current?.kind === 'normal' ? current.evolutions.map((e) => e.speciesId) : []
    for (const speciesId of monster.pendingEvolutionIds) {
      if (monster.fused || !targets.includes(speciesId)) {
        addIssue(`hướng tiến hóa chờ chọn không hợp lệ "${speciesId}"`)
      }
    }
  }
  // Cờ vừa thoái hóa (mục "Thoái hóa" ở evolution-skills.md): null hoặc id loài tồn tại.
  const devolvedFrom: unknown = monster.devolvedFromSpeciesId
  if (
    devolvedFrom !== null &&
    (typeof devolvedFrom !== 'string' || !(devolvedFrom in data.species))
  ) {
    addIssue(
      `devolvedFromSpeciesId phải là null hoặc id loài tồn tại, có "${String(devolvedFrom)}"`
    )
  }

  // Sticker trên skill (docs/rules/skill-stickers.md); hỏng thì tính số ô như không có sticker.
  const stickerIssues = validateSkillStickers(data, monster.skillStickers, {
    skillIds: Array.isArray(monster.skillIds) ? monster.skillIds : [],
    path: at('skillStickers')
  })
  issues.push(...stickerIssues)
  const capacity = skillCapacity(
    data,
    stickerIssues.length > 0 ? { ...monster, skillStickers: {} } : monster
  )
  if (
    !Array.isArray(monster.skillIds) ||
    monster.skillIds.length === 0 ||
    monster.skillIds.length > capacity
  ) {
    addIssue(`cần từ 1 đến ${capacity} skill`)
  } else {
    if (new Set(monster.skillIds).size !== monster.skillIds.length) addIssue('skill bị lặp')
    for (const skillId of monster.skillIds) {
      if (!(skillId in data.skills)) addIssue(`skill không tồn tại "${skillId}"`)
      // Hợp kích kỹ chỉ dùng qua lệnh hợp kích của hai quái (docs/rules/team.md).
      if (skillId in data.comboSkills) addIssue(`skill "${skillId}" là hợp kích kỹ`)
    }
  }

  const seenTraits = new Set<string>()
  const seenGroups = new Map<string, string>()
  let usedSlots = 0
  for (const { id, level } of monster.traits) {
    const trait = data.traits[id]
    if (!trait) {
      addIssue(`trait không tồn tại "${id}"`)
      continue
    }
    if (!TRAIT_KIND_RULES[trait.kind].inTraitList) {
      addIssue(`trait "${id}" loại "${trait.kind}" không được lưu trong traits`)
      continue
    }
    if (seenTraits.has(id)) addIssue(`trait "${id}" bị lặp, phải gộp thành cấp cao hơn`)
    seenTraits.add(id)
    issues.push(...checkInteger(level, at(`traits.${id}.level`), 1))
    if (usesTraitSlot(trait.kind)) usedSlots++
    if (trait.exclusiveGroup !== undefined) {
      const other = seenGroups.get(trait.exclusiveGroup)
      if (other !== undefined && other !== id) {
        addIssue(`trait "${other}" và "${id}" loại trừ nhau (nhóm ${trait.exclusiveGroup})`)
      }
      seenGroups.set(trait.exclusiveGroup, id)
    }
  }
  if (Number.isSafeInteger(monster.shinyStacks)) {
    addIssue(...checkShinyConsistency(data, monster))
  }
  for (const { id } of monster.traits) {
    if (data.traits[id]?.kind === 'boss' && id !== config.boss.traitId) {
      addIssue(`trait boss phải là "${config.boss.traitId}", không phải "${id}"`)
    }
  }
  const { initial } = config.traitSlots
  // Trần ô trait riêng của quái: tăng theo mốc ô trait thức tỉnh (docs/rules/awakening.md).
  const max = Number.isSafeInteger(monster.awakening)
    ? traitSlotCap(data, monster)
    : config.traitSlots.max
  if (
    !Number.isSafeInteger(monster.traitSlots) ||
    monster.traitSlots < initial ||
    monster.traitSlots > max
  ) {
    issues.push(`${at('traitSlots')} phải là số nguyên trong [${initial}, ${max}]`)
  }
  const maxSlots = monster.traitSlots
  if (usedSlots > maxSlots) addIssue(`dùng ${usedSlots} ô trait, tối đa ${maxSlots}`)

  return issues
}

/** Như validateMonster nhưng ném DataError khi có lỗi. */
export function assertValidMonster(data: GameData, monster: Monster): void {
  // Trong phạm vi chỉ đọc quái không đổi: đã hợp lệ thì khỏi kiểm tra lại (mỗi lần tính chỉ số).
  memoInReadOnlyScope(VALID_MONSTER_TABLE, [data, monster], () => {
    const issues = validateMonster(data, monster)
    if (issues.length > 0) throw new DataError(issues)
    return true
  })
}

const VALID_MONSTER_TABLE = {}
