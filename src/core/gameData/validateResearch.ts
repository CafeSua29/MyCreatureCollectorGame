// Kiểm tra dữ liệu nghiên cứu loài (docs/rules/species-research.md): config.research.

import {
  RESEARCH_PERCENT_TYPES,
  RESEARCH_REVEAL_TYPES,
  RESEARCH_TASK_KINDS,
  RESEARCH_TASK_SCOPES,
  type GameData
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { isDexSpecies } from '../registries'
import { checkItemRewards, checkKnownFields } from './checks'

const includes = (list: readonly string[], value: unknown): boolean =>
  typeof value === 'string' && list.includes(value)

/** Cấp trong [1, cấp tối đa]. */
function checkLevel(value: unknown, where: string, maxLevel: number): string[] {
  const problems = checkInteger(value, where, 1)
  if (problems.length > 0) return problems
  return Number(value) > maxLevel ? [`${where} vượt cấp tối đa ${maxLevel}`] : []
}

/** Danh sách số nguyên ≥ 1, tăng ngặt, không rỗng. */
function checkIncreasing(value: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where} phải là danh sách không rỗng`)
    return
  }
  value.forEach((entry: unknown, i) => {
    const problems = checkInteger(entry, `${where}[${i}]`, 1)
    issues.push(...problems)
    if (problems.length === 0 && i > 0 && Number(entry) <= Number(value[i - 1])) {
      issues.push(`${where}[${i}] phải lớn hơn mốc trước`)
    }
  })
}

/** Một nhiệm vụ: loại việc đã biết, mốc tăng ngặt, điểm nguyên ≥ 1; mẫu chung có thêm phạm vi. */
function checkTask(value: unknown, where: string, isTemplate: boolean, issues: string[]): void {
  const task = asObject(value)
  if (!task) {
    issues.push(`${where} phải là object`)
    return
  }
  const fields = isTemplate
    ? ['kind', 'thresholds', 'points', 'scope']
    : ['kind', 'thresholds', 'points']
  checkKnownFields(task, fields, where, 'nhiệm vụ nghiên cứu', issues)
  if (!includes(RESEARCH_TASK_KINDS, task.kind)) {
    issues.push(`${where}.kind: loại việc không hợp lệ "${String(task.kind)}"`)
  }
  checkIncreasing(task.thresholds, `${where}.thresholds`, issues)
  issues.push(...checkInteger(task.points, `${where}.points`, 1))
  if (task.scope !== undefined && !includes(RESEARCH_TASK_SCOPES, task.scope)) {
    issues.push(`${where}.scope: phạm vi không hợp lệ "${String(task.scope)}"`)
  }
}

function checkTaskList(value: unknown, where: string, isTemplate: boolean, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  value.forEach((task: unknown, i) => checkTask(task, `${where}[${i}]`, isTemplate, issues))
}

/** Nhiệm vụ riêng: id loài thuộc Dex, danh sách nhiệm vụ hợp lệ. */
function checkSpeciesTasks(data: GameData, value: unknown, issues: string[]): void {
  const where = 'config.research.speciesTasks'
  const bySpecies = asObject(value)
  if (!bySpecies) {
    issues.push(`${where} phải là object`)
    return
  }
  for (const [speciesId, tasks] of Object.entries(bySpecies)) {
    if (!isDexSpecies(data.species[speciesId])) {
      issues.push(`${where}: "${speciesId}" không phải loài thuộc Dex`)
    }
    checkTaskList(tasks, `${where}.${speciesId}`, false, issues)
  }
}

/** Lợi ích: cấp trong [1, cấp tối đa], loại đã biết; loại % có percent khác 0, ≥ −100. */
function checkBenefits(value: unknown, maxLevel: number, issues: string[]): void {
  const where = 'config.research.benefits'
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  value.forEach((entry: unknown, i) => {
    const at = `${where}[${i}]`
    const benefit = asObject(entry)
    if (!benefit) {
      issues.push(`${at} phải là object`)
      return
    }
    issues.push(...checkLevel(benefit.level, `${at}.level`, maxLevel))
    if (includes(RESEARCH_REVEAL_TYPES, benefit.type)) {
      checkKnownFields(benefit, ['level', 'type'], at, 'lợi ích mở thông tin', issues)
    } else if (includes(RESEARCH_PERCENT_TYPES, benefit.type)) {
      checkKnownFields(benefit, ['level', 'type', 'percent'], at, 'lợi ích %', issues)
      issues.push(...checkNumber(benefit.percent, `${at}.percent`, -100))
      if (benefit.percent === 0) issues.push(`${at}.percent phải khác 0`)
    } else {
      issues.push(`${at}.type: loại lợi ích không hợp lệ "${String(benefit.type)}"`)
    }
  })
}

/** Thưởng theo cấp: cấp trong [1, cấp tối đa] tăng ngặt, món thưởng gộp chồng. */
function checkLevelRewards(
  data: GameData,
  value: unknown,
  maxLevel: number,
  issues: string[]
): void {
  const where = 'config.research.levelRewards'
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  let last = 0
  value.forEach((entry: unknown, i) => {
    const at = `${where}[${i}]`
    const reward = asObject(entry)
    if (!reward) {
      issues.push(`${at} phải là object`)
      return
    }
    checkKnownFields(reward, ['level', 'items'], at, 'thưởng cấp nghiên cứu', issues)
    const problems = checkLevel(reward.level, `${at}.level`, maxLevel)
    issues.push(...problems)
    if (problems.length === 0) {
      if (Number(reward.level) <= last) issues.push(`${at}.level phải tăng dần`)
      last = Number(reward.level)
    }
    checkItemRewards(data, reward.items, `${at}.items`, issues)
  })
}

/** Kiểm tra config.research. */
export function checkResearchData(data: GameData, issues: string[]): void {
  const research = asObject(data.config.research)
  if (!research) {
    issues.push('config.research phải là object')
    return
  }
  checkKnownFields(
    research,
    ['levelPoints', 'tasks', 'speciesTasks', 'benefits', 'levelRewards'],
    'config.research',
    'nghiên cứu loài',
    issues
  )
  checkIncreasing(research.levelPoints, 'config.research.levelPoints', issues)
  const maxLevel = Array.isArray(research.levelPoints) ? research.levelPoints.length : 0
  checkTaskList(research.tasks, 'config.research.tasks', true, issues)
  checkSpeciesTasks(data, research.speciesTasks, issues)
  checkBenefits(research.benefits, maxLevel, issues)
  checkLevelRewards(data, research.levelRewards, maxLevel, issues)
}
