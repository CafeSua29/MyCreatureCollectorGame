// Kiểm tra động phủ trong save (docs/rules/dwelling.md): công trình, quái làm việc khớp việc của
// quái, ô linh điền theo cấp công trình `garden`, kho động phủ.

import { dwellingPlotCount } from '../progression'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from '../gameData'
import { validateGoods } from '../inventory'
import type { BuildingState, GameData } from '../model'

type Raw = Record<string, unknown>

const storedMonsters = (state: Raw): Raw[] =>
  (Array.isArray(state.storage) ? state.storage : []).flatMap((m: unknown) => {
    const monster = asObject(m)
    return monster ? [monster] : []
  })

/** Một công trình: tồn tại, cấp trong [1, maxLevel], quái làm việc không lặp, không quá số ô. */
function checkBuilding(
  data: GameData,
  { id, value, storage }: { id: string; value: unknown; storage: readonly Raw[] },
  issues: string[]
): BuildingState | null {
  const at = `dwelling.buildings.${id}`
  const def = Object.hasOwn(data.buildings, id) ? data.buildings[id] : undefined
  if (!def) {
    issues.push(`${at}: công trình không tồn tại`)
    return null
  }
  const building = asObject(value)
  if (!building) {
    issues.push(`${at} phải là object { level, workers }`)
    return null
  }
  checkKnownFields(building, ['level', 'workers'], at, 'công trình', issues)
  const levelIssues = checkInteger(building.level, `${at}.level`, 1)
  if (def.maxLevel !== undefined && (building.level as number) > def.maxLevel) {
    levelIssues.push(`${at}.level tối đa ${def.maxLevel}`)
  }
  issues.push(...levelIssues)
  const workers = building.workers
  if (!Array.isArray(workers) || workers.some((w) => typeof w !== 'string')) {
    issues.push(`${at}.workers phải là danh sách id quái`)
    return null
  }
  if (new Set(workers).size !== workers.length) issues.push(`${at}.workers bị lặp`)
  if (levelIssues.length > 0) return null
  const level = building.level as number
  if (workers.length > level * def.slotsPerLevel) {
    issues.push(`${at}.workers vượt ${level * def.slotsPerLevel} ô`)
  }
  // Quái tọa hóa đã rời kho (việc theo ngày dọn sau): chỉ quái còn trong kho phải mang đúng việc.
  for (const monsterId of workers) {
    const monster = storage.find((m) => m.id === monsterId)
    const assignment = asObject(monster?.assignment)
    if (monster && (assignment?.kind !== 'dwelling' || assignment.id !== id)) {
      issues.push(`${at}: quái "${String(monsterId)}" không mang việc của công trình này`)
    }
  }
  return { level, workers: workers as string[] }
}

/** Ô linh điền: số ô theo cấp công trình `garden`, mỗi ô null hoặc hạt giống đã lớn [0, growDays]. */
function checkPlots(
  data: GameData,
  { value, count }: { value: unknown; count: number | null },
  issues: string[]
): void {
  if (!Array.isArray(value)) {
    issues.push('dwelling.plots phải là danh sách')
    return
  }
  if (count !== null && value.length !== count) {
    issues.push(`dwelling.plots phải có ${count} ô theo cấp công trình linh điền`)
  }
  value.forEach((entry, i) => {
    if (entry === null) return
    const plot = asObject(entry)
    const at = `dwelling.plots[${i}]`
    checkKnownFields(plot ?? {}, ['seedItemId', 'growth'], at, 'ô linh điền', issues)
    const seed = typeof plot?.seedItemId === 'string' ? data.items[plot.seedItemId] : undefined
    if (seed?.category !== 'seed') {
      issues.push(`${at}.seedItemId phải là hạt giống, nhận "${String(plot?.seedItemId)}"`)
      return
    }
    issues.push(...checkNumber(plot?.growth, `${at}.growth`, 0, seed.growDays))
  })
}

/** Hộp thức ăn: món ăn có trong config.dwelling.foods, số lượng nguyên ≥ 1. */
function checkFeedBox(data: GameData, value: unknown, issues: string[]): void {
  const feedBox = asObject(value)
  if (!feedBox) {
    issues.push('dwelling.feedBox phải là object')
    return
  }
  for (const [itemId, count] of Object.entries(feedBox)) {
    if (!Object.hasOwn(data.config.dwelling.foods, itemId)) {
      issues.push(`dwelling.feedBox: "${itemId}" không phải món ăn`)
    }
    issues.push(...checkInteger(count, `dwelling.feedBox.${itemId}`, 1))
  }
}

/** dwelling: công trình, quái làm việc (hai chiều với `assignment`), ô linh điền, kho động phủ. */
export function validateDwellingState(data: GameData, state: Raw): string[] {
  const dwelling = asObject(state.dwelling)
  if (!dwelling) return ['dwelling phải là object { buildings, plots, storage }']
  const issues: string[] = []
  checkKnownFields(
    dwelling,
    ['buildings', 'plots', 'storage', 'feedBox'],
    'dwelling',
    'động phủ',
    issues
  )
  const storage = storedMonsters(state)
  const rawBuildings = asObject(dwelling.buildings)
  const buildings: Record<string, BuildingState> = {}
  let isComplete = rawBuildings !== null
  if (!rawBuildings) issues.push('dwelling.buildings phải là object')
  for (const [id, value] of Object.entries(rawBuildings ?? {})) {
    const building = checkBuilding(data, { id, value, storage }, issues)
    if (building) buildings[id] = building
    else isComplete = false
  }
  const allWorkers = Object.values(buildings).flatMap((b) => b.workers)
  if (new Set(allWorkers).size !== allWorkers.length) {
    issues.push('dwelling: một quái làm việc ở nhiều công trình')
  }
  for (const monster of storage) {
    const assignment = asObject(monster.assignment)
    if (assignment?.kind !== 'dwelling') continue
    const id = String(assignment.id)
    if (!buildings[id]?.workers.includes(String(monster.id))) {
      issues.push(
        `quái "${String(monster.id)}" mang việc động phủ "${id}" nhưng không có trong công trình`
      )
    }
  }
  checkPlots(
    data,
    { value: dwelling.plots, count: isComplete ? dwellingPlotCount(data, buildings) : null },
    issues
  )
  issues.push(...validateGoods(data, dwelling.storage, 'dwelling.storage'))
  checkFeedBox(data, dwelling.feedBox, issues)
  return issues
}
