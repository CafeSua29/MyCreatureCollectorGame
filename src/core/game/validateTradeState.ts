// Kiểm tra bảng trao đổi với NPC (docs/rules/trades.md) và đội hình mẫu (docs/rules/roster.md) trong save.

import { TRADE_WANTS } from '../progression'
import { TRADE_WANT_KINDS, type GameData, type TradeWant } from '../model'
import { asObject, checkInteger } from '../shared'

/** Kiểm tra quái hoang (quái NPC đưa) tại đường dẫn; do validateGameState cung cấp. */
type WildMonsterCheck = (monster: unknown, path: string) => void

function checkWant(data: GameData, value: unknown, at: string, issues: string[]): void {
  const want = asObject(value)
  const kind = want?.kind
  if (!want || !(TRADE_WANT_KINDS as readonly unknown[]).includes(kind)) {
    issues.push(`${at}.kind phải là ${TRADE_WANT_KINDS.join(' / ')}`)
    return
  }
  issues.push(...checkInteger(want.minLevel, `${at}.minLevel`, 1))
  // Ép kiểu: kind đã kiểm tra thuộc TRADE_WANT_KINDS; isValid tự xét trường theo loại.
  const typed = want as unknown as TradeWant
  if (!TRADE_WANTS[typed.kind].isValid(data, typed)) {
    issues.push(`${at}: id trong yêu cầu không tồn tại`)
  }
}

function checkGive(
  data: GameData,
  value: unknown,
  { at, checkWild }: { at: string; checkWild: WildMonsterCheck },
  issues: string[]
): string | null {
  const give = asObject(value)
  if (give?.kind === 'monster') {
    checkWild(give.monster, `${at}.monster`)
    const id = asObject(give.monster)?.id
    return typeof id === 'string' ? id : null
  }
  if (give?.kind === 'item') {
    const { itemId } = give
    if (typeof itemId !== 'string' || !Object.hasOwn(data.items, itemId)) {
      issues.push(`${at}.itemId: vật phẩm không tồn tại "${String(itemId)}"`)
    }
    issues.push(...checkInteger(give.count, `${at}.count`, 1))
    return null
  }
  issues.push(`${at}.kind phải là monster / item`)
  return null
}

/**
 * trades: đề nghị id "t<số>" nhỏ hơn nextOfferId, không trùng; NPC / yêu cầu / thứ đưa hợp lệ; ngày
 * làm mới nguyên ≥ 0. Trả về id quái NPC đưa (để kiểm tra trùng id với mọi quái khác).
 */
export function validateTradeState(
  data: GameData,
  state: Record<string, unknown>,
  { checkWild, issues }: { checkWild: WildMonsterCheck; issues: string[] }
): string[] {
  const trades = asObject(state.trades)
  if (!trades) {
    issues.push('trades phải là object { offers, refreshDay, nextOfferId }')
    return []
  }
  issues.push(...checkInteger(trades.refreshDay, 'trades.refreshDay', 0))
  issues.push(...checkInteger(trades.nextOfferId, 'trades.nextOfferId', 1))
  if (!Array.isArray(trades.offers)) {
    issues.push('trades.offers phải là danh sách')
    return []
  }
  const next = typeof trades.nextOfferId === 'number' ? trades.nextOfferId : 0
  const offerIds: unknown[] = []
  const monsterIds: string[] = []
  trades.offers.forEach((entry, i) => {
    const at = `trades.offers[${i}]`
    const offer = asObject(entry)
    if (!offer) {
      issues.push(`${at} phải là object`)
      return
    }
    const { id } = offer
    offerIds.push(id)
    if (typeof id !== 'string' || !/^t\d+$/.test(id) || Number(id.slice(1)) >= next) {
      issues.push(`${at}.id phải có dạng "t<số>" nhỏ hơn nextOfferId`)
    }
    if (typeof offer.npcNameId !== 'string' || !Object.hasOwn(data.npcNames, offer.npcNameId)) {
      issues.push(`${at}.npcNameId: tên NPC không tồn tại "${String(offer.npcNameId)}"`)
    }
    checkWant(data, offer.want, `${at}.want`, issues)
    const monsterId = checkGive(data, offer.give, { at: `${at}.give`, checkWild }, issues)
    if (monsterId !== null) monsterIds.push(monsterId)
  })
  if (new Set(offerIds).size !== offerIds.length) issues.push('trades.offers: id bị trùng')
  return monsterIds
}

/** Một món trong mẫu: `{ storage: 'instance', instanceId }` hoặc `{ storage: 'stack', itemId }`. */
function checkPresetItem(value: unknown, at: string, issues: string[]): void {
  const item = asObject(value)
  const ok =
    (item?.storage === 'instance' && typeof item.instanceId === 'string') ||
    (item?.storage === 'stack' && typeof item.itemId === 'string')
  if (!ok) issues.push(`${at} phải là món trang bị hoặc đồ gộp chồng`)
}

/**
 * teamPresets (docs/rules/roster.md): tối đa `slots` mẫu, id "p<số>" < nextPresetId không trùng, tên
 * null hoặc chuỗi; id quái / món chỉ kiểm tra dạng (quái / món mất rồi vẫn hợp lệ, lúc áp bỏ qua).
 */
export function validateTeamPresetState(data: GameData, value: unknown): string[] {
  const state = asObject(value)
  if (!state) return ['teamPresets phải là object { presets, nextPresetId, lastMissing }']
  const issues = checkInteger(state.nextPresetId, 'teamPresets.nextPresetId', 1)
  if (!Array.isArray(state.presets)) return [...issues, 'teamPresets.presets phải là danh sách']
  const { slots } = data.config.teamPresets
  if (state.presets.length > slots) issues.push(`teamPresets.presets: tối đa ${slots} mẫu`)
  const next = typeof state.nextPresetId === 'number' ? state.nextPresetId : 0
  const ids: unknown[] = []
  state.presets.forEach((entry, i) => {
    const at = `teamPresets.presets[${i}]`
    const preset = asObject(entry)
    if (!preset) {
      issues.push(`${at} phải là object`)
      return
    }
    ids.push(preset.id)
    const { id, name, monsterIds, equipmentByMonster } = preset
    if (typeof id !== 'string' || !/^p\d+$/.test(id) || Number(id.slice(1)) >= next) {
      issues.push(`${at}.id phải có dạng "p<số>" nhỏ hơn nextPresetId`)
    }
    if (name !== null && typeof name !== 'string') issues.push(`${at}.name phải là null hoặc chuỗi`)
    if (!Array.isArray(monsterIds) || monsterIds.some((m) => typeof m !== 'string')) {
      issues.push(`${at}.monsterIds phải là danh sách id quái`)
    }
    const equipment = asObject(equipmentByMonster)
    if (!equipment) {
      issues.push(`${at}.equipmentByMonster phải là object`)
      return
    }
    for (const [monsterId, items] of Object.entries(equipment)) {
      if (!Array.isArray(items))
        issues.push(`${at}.equipmentByMonster.${monsterId} phải là danh sách`)
      else items.forEach((item, j) => checkPresetItem(item, `${at}.${monsterId}[${j}]`, issues))
    }
  })
  if (new Set(ids).size !== ids.length) issues.push('teamPresets.presets: id bị trùng')
  if (state.lastMissing !== null) {
    const missing = asObject(state.lastMissing)
    if (!missing || !Array.isArray(missing.monsterIds) || !Array.isArray(missing.items)) {
      issues.push('teamPresets.lastMissing phải là null hoặc { monsterIds, items }')
    }
  }
  return issues
}
