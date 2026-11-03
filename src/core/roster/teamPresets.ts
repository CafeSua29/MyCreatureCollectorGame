// Đội hình mẫu (docs/rules/roster.md mục "Đội hình mẫu"): lưu đội hiện tại, áp lại một lần (đúng quái,
// đúng thứ tự, quái cũ về kho; tùy chọn lắp lại đúng món). Ngoài trận, ở thị trấn hoặc tầng.

import {
  canWearEquipment,
  equipmentSlotCount,
  getItemCount,
  removeItems,
  returnEquippedItem,
  takeEquipment
} from '../inventory'
import { assertNoInstance, assertNoTournament } from '../world'
import { bagUsed, capacityOf, hasPartyRoom } from '../registries'
import { ActionError, malformedAction } from '../shared'
import {
  appendLog,
  type EquippedItem,
  type GameData,
  type GameState,
  type Inventory,
  type Monster,
  type PresetEquipment,
  type TeamPreset,
  type TeamPresetState
} from '../model'
import { normalizeNickname } from './rosterActions'

/** Chưa có mẫu nào (game mới, test). */
export const newTeamPresetState = (): TeamPresetState => ({
  presets: [],
  nextPresetId: 1
})

const toPresetEquipment = (entry: EquippedItem): PresetEquipment =>
  entry.storage === 'instance'
    ? { storage: 'instance', instanceId: entry.instance.id }
    : { storage: 'stack', itemId: entry.itemId }

function requirePreset(state: GameState, presetId: string): TeamPreset {
  const preset = state.teamPresets.presets.find((entry) => entry.id === presetId)
  if (!preset) throw new ActionError('presetNotFound', { presetId: String(presetId) })
  return preset
}

/**
 * Lưu đội hiện tại (thứ tự ô, món đang lắp) thành mẫu mới, hoặc ghi đè mẫu `presetId`. Tên chuẩn hóa
 * như biệt danh. Đủ `slots` mẫu thì `presetSlotsFull`.
 */
export function saveTeamPreset(
  data: GameData,
  state: GameState,
  { name, presetId }: { name: string | null; presetId?: string }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const normalized = normalizeNickname(data, name)
  const content = {
    name: normalized,
    monsterIds: state.party.map((m) => m.id),
    equipmentByMonster: Object.fromEntries(
      state.party.map((m) => [m.id, m.equipment.map(toPresetEquipment)])
    )
  }
  const { presets, nextPresetId } = state.teamPresets
  if (presetId !== undefined) {
    requirePreset(state, presetId)
    const updated = presets.map((p) => (p.id === presetId ? { ...p, ...content } : p))
    return { ...state, teamPresets: { ...state.teamPresets, presets: updated } }
  }
  const max = data.config.teamPresets.slots
  if (presets.length >= max) throw new ActionError('presetSlotsFull', { max })
  return {
    ...state,
    teamPresets: {
      ...state.teamPresets,
      presets: [...presets, { id: `p${nextPresetId}`, ...content }],
      nextPresetId: nextPresetId + 1
    }
  }
}

/** Xóa mẫu. */
export function deleteTeamPreset(state: GameState, presetId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  requirePreset(state, presetId)
  const presets = state.teamPresets.presets.filter((entry) => entry.id !== presetId)
  return { ...state, teamPresets: { ...state.teamPresets, presets } }
}

/** Đội theo mẫu: quái còn sở hữu, rảnh, vừa ô đội; còn lại vào danh sách thiếu. */
function pickTeam(
  data: GameData,
  owned: readonly Monster[],
  preset: TeamPreset
): { team: Monster[]; missing: string[] } {
  const team: Monster[] = []
  const missing: string[] = []
  for (const id of preset.monsterIds) {
    const monster = owned.find((m) => m.id === id)
    if (monster && monster.assignment === null && hasPartyRoom(data, team, monster)) {
      team.push(monster)
    } else {
      missing.push(id)
    }
  }
  return { team, missing }
}

/** Bộ đang lắp ráp: túi và mọi quái, đổi dần khi chuyển món. */
interface Workshop {
  inventory: Inventory
  monsters: Map<string, Monster>
}

/** Lấy món khỏi quái rảnh khác (không thuộc đội mẫu); null = không ai giữ. */
function takeFromOther(
  workshop: Workshop,
  wanted: PresetEquipment,
  teamIds: ReadonlySet<string>
): EquippedItem | null {
  for (const monster of workshop.monsters.values()) {
    if (teamIds.has(monster.id) || monster.assignment !== null) continue
    const index = monster.equipment.findIndex((entry) =>
      wanted.storage === 'instance'
        ? entry.storage === 'instance' && entry.instance.id === wanted.instanceId
        : entry.storage === 'stack' && entry.itemId === wanted.itemId
    )
    if (index < 0) continue
    const equipment = monster.equipment.filter((_, i) => i !== index)
    workshop.monsters.set(monster.id, { ...monster, equipment })
    return monster.equipment[index]
  }
  return null
}

/** Lấy món theo mẫu: trong túi trước, rồi tới quái khác. */
function takeWanted(
  workshop: Workshop,
  wanted: PresetEquipment,
  teamIds: ReadonlySet<string>
): EquippedItem | null {
  if (wanted.storage === 'stack') {
    if (getItemCount(workshop.inventory, wanted.itemId) > 0) {
      workshop.inventory = removeItems(workshop.inventory, wanted.itemId, 1)
      return { storage: 'stack', itemId: wanted.itemId }
    }
    return takeFromOther(workshop, wanted, teamIds)
  }
  if (workshop.inventory.equipment.some((item) => item.id === wanted.instanceId)) {
    const [instance, rest] = takeEquipment(workshop.inventory, wanted.instanceId)
    workshop.inventory = rest
    return { storage: 'instance', instance }
  }
  return takeFromOther(workshop, wanted, teamIds)
}

/**
 * Lắp lại đúng món theo mẫu: tháo hết món của đội về túi, rồi lấy từng món trong túi / quái khác.
 * Món không còn, quá số ô, không đeo được thì vào danh sách thiếu (món không đeo được về túi).
 */
function refitTeam(
  data: GameData,
  state: GameState,
  { workshop, team, preset }: { workshop: Workshop; team: Monster[]; preset: TeamPreset }
): PresetEquipment[] {
  const slots = equipmentSlotCount(data, state)
  const teamIds = new Set(team.map((m) => m.id))
  const missing: PresetEquipment[] = []
  for (const monster of team) {
    for (const entry of monster.equipment) {
      workshop.inventory = returnEquippedItem(workshop.inventory, entry)
    }
    workshop.monsters.set(monster.id, { ...monster, equipment: [] })
  }
  for (const monster of team) {
    const equipment: EquippedItem[] = []
    for (const wanted of preset.equipmentByMonster[monster.id] ?? []) {
      const entry = equipment.length < slots ? takeWanted(workshop, wanted, teamIds) : null
      if (!entry) {
        missing.push(wanted)
      } else if (entry.storage === 'instance' && !canWearEquipment(data, monster, entry.instance)) {
        workshop.inventory = returnEquippedItem(workshop.inventory, entry)
        missing.push(wanted)
      } else {
        equipment.push(entry)
      }
    }
    workshop.monsters.set(monster.id, { ...monster, equipment })
  }
  return missing
}

/**
 * Áp mẫu: đúng quái theo thứ tự, quái cũ về cuối kho; `withEquipment` thì lắp lại đúng món. Quái / món
 * không còn thì bỏ qua, ghi log `presetMissing`. Không còn quái nào áp được: `presetEmpty`; kho không đủ chỗ
 * cho quái cũ: `rosterFull`; túi không đủ chỗ cho món thừa sau khi đổi: `bagOverflow`. Không đang dự
 * giải / tông chiến, không đang đi phó bản (như không được đổi đội giữa chuỗi trận).
 */
export function applyTeamPreset(
  data: GameData,
  state: GameState,
  { presetId, withEquipment }: { presetId: string; withEquipment: boolean }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  assertNoTournament(state)
  assertNoInstance(state)
  if (typeof withEquipment !== 'boolean') throw malformedAction('withEquipment phải là boolean')
  const preset = requirePreset(state, presetId)
  const owned = [...state.party, ...state.storage]
  const { team, missing: missingMonsters } = pickTeam(data, owned, preset)
  if (team.length === 0) throw new ActionError('presetEmpty', { presetId })
  const workshop: Workshop = {
    inventory: state.inventory,
    monsters: new Map(owned.map((m) => [m.id, m]))
  }
  const items = withEquipment ? refitTeam(data, state, { workshop, team, preset }) : []
  const bagCapacity = capacityOf(data, state, 'bag')
  const lost = bagUsed(workshop.inventory) - Math.max(bagCapacity, bagUsed(state.inventory))
  if (lost > 0) throw new ActionError('bagOverflow', { lost })
  const teamIds = new Set(team.map((m) => m.id))
  const current = (m: Monster): Monster => workshop.monsters.get(m.id) ?? m
  const storage = [
    ...state.storage.filter((m) => !teamIds.has(m.id)),
    ...state.party.filter((m) => !teamIds.has(m.id))
  ].map(current)
  const storageCapacity = capacityOf(data, state, 'storage')
  if (storage.length > Math.max(storageCapacity, state.storage.length)) {
    throw new ActionError('rosterFull', { capacity: storageCapacity })
  }
  const applied = { ...state, party: team.map(current), storage, inventory: workshop.inventory }
  if (missingMonsters.length === 0 && items.length === 0) return applied
  return appendLog(applied, { type: 'presetMissing', presetId, monsterIds: missingMonsters, items })
}
