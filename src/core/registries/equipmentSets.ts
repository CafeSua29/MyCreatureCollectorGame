// Đếm bộ trang bị và thưởng bộ (docs/rules/equipment-sets.md): một hàm duy nhất đếm bộ theo món đang
// lắp (equipmentSetStates), hook thưởng bộ gọi từ equipmentHooks (traitHooks.ts). Bộ ngẫu nhiên kích
// hoạt ⌊số món / size⌋ lần (hook nhân hệ số = số lần); bộ đặt tên đếm món gốc khác nhau, cộng dồn mọi
// mốc ≤ số đó.

import { findEquipmentItem, findEquipmentLine, findEquipmentSet, lineParams } from '../inventory'
import type {
  EquipmentInstance,
  EquipmentSetKind,
  EquippedItem,
  GameData,
  Monster,
  NamedEquipmentSetDef,
  RolledEquipmentSetDef,
  TraitHookDef
} from '../model'
import { TRAIT_HOOKS } from './traitHooks'

/** Một bộ quái đang có ít nhất một món (MonsterView, thành tựu). */
export interface EquipmentSetState {
  setId: string
  kind: EquipmentSetKind
  /**
   * Số món đếm được: bộ ngẫu nhiên gồm cả món vô hình được gán; bộ đặt tên là số món gốc khác nhau
   * cộng phần giảm số món cần (không vượt số món của bộ).
   */
  count: number
  /** Bộ ngẫu nhiên: số lần kích hoạt; bộ đặt tên: số mốc thưởng đang có. */
  activeBonuses: number
}

/** Hook thưởng bộ đang có tác dụng, hệ số = số lần kích hoạt (bộ đặt tên: 1). */
export interface EquipmentSetHook {
  hook: TraitHookDef
  scale: number
  setId: string
}

/** Món trang bị (không gồm đồ cầm: đồ cầm không có bộ) đang lắp. */
const equippedInstances = (equipment: readonly EquippedItem[]): EquipmentInstance[] =>
  equipment.flatMap((entry) => (entry.storage === 'instance' ? [entry.instance] : []))

/**
 * Giảm số món cần lớn nhất trên các món đang lắp (hook `setPieceReduction` ở hook cố định hoặc dòng
 * của món): như Diablo III chỉ một món có tác dụng nên lấy lớn nhất, không cộng dồn.
 */
function setPieceReductionOf(data: GameData, instances: readonly EquipmentInstance[]): number {
  let best = 0
  for (const instance of instances) {
    const item = findEquipmentItem(data, instance.baseItemId)
    if (!item) continue
    const lineHooks = instance.rolls.flatMap((roll) => {
      const line = findEquipmentLine(data, item, roll.lineId, instance.soul)
      return line ? [{ type: line.hook.type, params: lineParams(line, roll.value) }] : []
    })
    for (const hook of [...(item.hooks ?? []), ...lineHooks]) {
      best = Math.max(best, TRAIT_HOOKS[hook.type]?.setPieceReduction?.(hook.params) ?? 0)
    }
  }
  return best
}

/** Số món đếm được của từng bộ ngẫu nhiên không vô hình (khóa theo thứ tự dữ liệu). */
function rolledCounts(
  data: GameData,
  instances: readonly EquipmentInstance[]
): { counts: Map<RolledEquipmentSetDef, number>; wildcards: number } {
  const counts = new Map<RolledEquipmentSetDef, number>()
  let wildcards = 0
  for (const instance of instances) {
    const set = instance.setId === undefined ? null : findEquipmentSet(data, instance.setId)
    if (set?.kind !== 'rolled') continue
    if (set.wildcard) wildcards++
    else counts.set(set, (counts.get(set) ?? 0) + 1)
  }
  return { counts, wildcards }
}

/**
 * Gán một món vô hình (Intangible: tối đa một món có tác dụng, như gốc) cho bộ đầu tiên (thứ tự dữ
 * liệu) còn thiếu đúng một món tới lần kích hoạt kế tiếp; không bộ nào thiếu đúng một món thì bỏ.
 */
function assignWildcard(counts: Map<RolledEquipmentSetDef, number>, wildcards: number): void {
  if (wildcards === 0) return
  for (const [set, count] of counts) {
    if (count % set.size === set.size - 1) {
      counts.set(set, count + 1)
      return
    }
  }
}

/** Số món gốc khác nhau của bộ đặt tên đang lắp (món trùng chỉ tính một, như Diablo II). */
function distinctPieces(
  set: NamedEquipmentSetDef,
  instances: readonly EquipmentInstance[]
): number {
  const worn = new Set(
    instances
      .filter(
        (instance) => instance.setId === set.id && set.pieceItemIds.includes(instance.baseItemId)
      )
      .map((instance) => instance.baseItemId)
  )
  return worn.size
}

/**
 * Số món đếm được của bộ đặt tên: món gốc khác nhau, cộng phần giảm số món cần khi bộ có từ
 * `reductionMinPieces` món trở lên và đang đeo ít nhất một món; không vượt số món của bộ.
 */
function namedCount(
  data: GameData,
  set: NamedEquipmentSetDef,
  { distinct, reduction }: { distinct: number; reduction: number }
): number {
  const total = set.pieceItemIds.length
  if (distinct === 0 || total < data.config.equipmentSets.reductionMinPieces) return distinct
  return Math.min(total, distinct + reduction)
}

/**
 * Mọi bộ quái đang có ít nhất một món (theo thứ tự dữ liệu), một hàm duy nhất đếm bộ cho thưởng bộ,
 * MonsterView và thành tựu. Món vô hình không có hiệu ứng riêng nên không xuất hiện.
 */
export function equipmentSetStates(
  data: GameData,
  equipment: readonly EquippedItem[]
): EquipmentSetState[] {
  const instances = equippedInstances(equipment)
  if (instances.every((instance) => instance.setId === undefined)) return []
  const { counts, wildcards } = rolledCounts(data, instances)
  assignWildcard(counts, wildcards)
  const reduction = setPieceReductionOf(data, instances)
  const states: EquipmentSetState[] = []
  for (const set of Object.values(data.equipmentSets)) {
    if (set.kind === 'rolled') {
      const count = counts.get(set) ?? 0
      if (count > 0) {
        states.push({
          setId: set.id,
          kind: 'rolled',
          count,
          activeBonuses: Math.floor(count / set.size)
        })
      }
      continue
    }
    const count = namedCount(data, set, { distinct: distinctPieces(set, instances), reduction })
    if (count === 0) continue
    states.push({
      setId: set.id,
      kind: 'named',
      count,
      activeBonuses: set.bonuses.filter((bonus) => bonus.pieces <= count).length
    })
  }
  return states
}

/** Bộ Seal đang kích hoạt trên các món này (docs/rules/equipment-sets.md mục "Seal"). */
export function hasActiveSealSet(data: GameData, equipment: readonly EquippedItem[]): boolean {
  return equipmentSetStates(data, equipment).some((state) => {
    const set = findEquipmentSet(data, state.setId)
    return set?.kind === 'rolled' && set.seal === true && state.activeBonuses > 0
  })
}

/** Dữ liệu có bộ Seal không, nhớ theo `data` (gọi mỗi lần dựng bối cảnh trận nên không duyệt lại). */
const SEAL_SET_DATA = new WeakMap<GameData, boolean>()

function hasSealSetData(data: GameData): boolean {
  let known = SEAL_SET_DATA.get(data)
  if (known === undefined) {
    known = Object.values(data.equipmentSets).some(
      (set) => set.kind === 'rolled' && set.seal === true
    )
    SEAL_SET_DATA.set(data, known)
  }
  return known
}

/**
 * Quái bị Seal (bộ `sealable` không có tác dụng): địch trên sân có bộ Seal đang kích hoạt và phe mình
 * trên sân (cả chính nó) không có, vì Seal của phe mình vô hiệu Seal của địch (Seal cũng `sealable`).
 * Dữ liệu không có bộ Seal thì không tính gì.
 */
export function setsSealedFor(
  data: GameData,
  { foes, allies }: { foes: readonly Monster[]; allies: readonly Monster[] }
): boolean {
  if (!hasSealSetData(data)) return false
  const sealed = (monster: Monster): boolean => hasActiveSealSet(data, monster.equipment)
  return foes.some(sealed) && !allies.some(sealed)
}

/**
 * Hook thưởng bộ đang có tác dụng: bộ ngẫu nhiên × số lần kích hoạt (bỏ bộ `sealable` khi bị Seal của
 * địch vô hiệu), bộ đặt tên mọi mốc ≤ số món đếm được (hệ số 1). Không đổi theo cấp món.
 */
export function equipmentSetHooks(
  data: GameData,
  equipment: readonly EquippedItem[],
  { setsSealed = false }: { setsSealed?: boolean } = {}
): EquipmentSetHook[] {
  const result: EquipmentSetHook[] = []
  for (const state of equipmentSetStates(data, equipment)) {
    const set = findEquipmentSet(data, state.setId)
    if (!set || state.activeBonuses === 0) continue
    if (set.kind === 'rolled') {
      if (set.sealable && setsSealed) continue
      for (const hook of set.hooks) {
        result.push({ hook, scale: state.activeBonuses, setId: set.id })
      }
      continue
    }
    for (const bonus of set.bonuses.slice(0, state.activeBonuses)) {
      for (const hook of bonus.hooks) result.push({ hook, scale: 1, setId: set.id })
    }
  }
  return result
}
