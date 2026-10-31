// Kiểm tra phần khu bảo tồn trong save (docs/rules/safari-zone.md): danh sách loài, lượt vào khu
// đang diễn ra (quái đang gặp là quái hoang), log.

import { asObject, checkInteger } from '../shared'
import { SAFARI_LURES, type GameData } from '../model'
import { checkKnownFields } from '../gameData'

/** Kiểm tra một quái hoang ở `path` (validateGameState truyền vào, ghi lỗi vào issues của nó). */
export type WildMonsterCheck = (monster: unknown, path: string) => void

function checkRoster(data: GameData, value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push('safari.roster phải là danh sách id loài')
    return
  }
  value.forEach((id, i) => {
    if (typeof id !== 'string' || data.species[id]?.kind !== 'normal') {
      issues.push(`safari.roster[${i}]: loài không hợp lệ "${String(id)}"`)
    } else if (value.indexOf(id) !== i) {
      issues.push(`safari.roster[${i}]: loài bị trùng "${id}"`)
    }
  })
}

function checkLure(value: unknown, path: string, issues: string[]): void {
  if (value === null) return
  const lure = asObject(value)
  if (!lure) {
    issues.push(`${path} phải là object hoặc null`)
    return
  }
  checkKnownFields(lure, ['kind', 'turnsLeft', 'favorite'], path, 'mồi / đá', issues)
  if (!SAFARI_LURES.some((kind) => kind === lure.kind)) {
    issues.push(`${path}.kind không hợp lệ "${String(lure.kind)}"`)
  }
  issues.push(...checkInteger(lure.turnsLeft, `${path}.turnsLeft`, 1))
  if (typeof lure.favorite !== 'boolean') issues.push(`${path}.favorite phải là boolean`)
  else if (lure.favorite && lure.kind !== 'bait')
    issues.push(`${path}.favorite: chỉ mồi có khẩu vị`)
}

/** Lượt vào khu; trả về id quái đang gặp (để kiểm tra trùng id). */
function checkVisit(
  state: Record<string, unknown>,
  value: unknown,
  { checkWild, issues }: { checkWild: WildMonsterCheck; issues: string[] }
): string[] {
  if (value === null) return []
  const visit = asObject(value)
  if (!visit) {
    issues.push('safari.visit phải là object hoặc null')
    return []
  }
  checkKnownFields(
    visit,
    ['encountersLeft', 'balls', 'encounter', 'caught'],
    'safari.visit',
    'khu bảo tồn',
    issues
  )
  issues.push(...checkInteger(visit.encountersLeft, 'safari.visit.encountersLeft', 0))
  issues.push(...checkInteger(visit.balls, 'safari.visit.balls', 1))
  issues.push(...checkInteger(visit.caught, 'safari.visit.caught', 0))
  if (state.battle !== null) issues.push('safari.visit: không được có trận đang diễn ra')
  if (asObject(state.location)?.type !== 'town') issues.push('safari.visit: chỉ có ở thị trấn')
  const encounter = asObject(visit.encounter)
  if (!encounter) {
    issues.push('safari.visit.encounter phải là object')
    return []
  }
  const path = 'safari.visit.encounter'
  checkKnownFields(encounter, ['monster', 'misses', 'lure'], path, 'lần gặp', issues)
  checkWild(encounter.monster, `${path}.monster`)
  issues.push(...checkInteger(encounter.misses, `${path}.misses`, 0))
  checkLure(encounter.lure, `${path}.lure`, issues)
  const id = asObject(encounter.monster)?.id
  return typeof id === 'string' ? [id] : []
}

/** Kiểm tra safari; trả về id quái đang gặp (rỗng nếu không ở trong khu). */
export function validateSafariState(
  data: GameData,
  state: Record<string, unknown>,
  { checkWild, issues }: { checkWild: WildMonsterCheck; issues: string[] }
): string[] {
  const safari = asObject(state.safari)
  if (!safari) {
    issues.push('safari phải là object')
    return []
  }
  checkKnownFields(
    safari,
    ['roster', 'refreshDay', 'visit', 'log'],
    'safari',
    'khu bảo tồn',
    issues
  )
  checkRoster(data, safari.roster, issues)
  issues.push(...checkInteger(safari.refreshDay, 'safari.refreshDay', 0))
  if (!Array.isArray(safari.log)) issues.push('safari.log phải là danh sách')
  else if (safari.log.some((entry) => typeof asObject(entry)?.type !== 'string')) {
    issues.push('safari.log: mỗi dòng phải có type')
  }
  return checkVisit(state, safari.visit, { checkWild, issues })
}
