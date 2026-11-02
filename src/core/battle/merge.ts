// Song thú hợp thể (docs/rules/battle-merge.md): kỹ năng ngự thú sư hợp hai quái ta trên sân thành một
// thực thể vài lượt. Quái chính (ô đầu) ở lại trên sân, chiếm mọi ô, mang bản chụp quái phụ trong
// biến hình loại `merge` (chỉ số, skill, trait, trang bị của quái phụ áp lên thực thể); quái phụ thật
// vẫn trong đội nhưng ẩn khỏi sân. Tách ra khi hết lượt (quái phụ về ô cũ), rời sân hoặc hết trận;
// bị hạ thì cả hai cùng gục. Chỉ số gộp ở bước biến hình của computeStats.

import { getMaxHp, isFainted } from '../monster'
import { cloneData, maxBig, minBig, type Decimal } from '../shared'
import {
  mergePartnerOf,
  type BattleSide,
  type GameData,
  type Monster,
  type TransformFailReason
} from '../model'
import { Draft, aliveOnField, clearOnFieldState, findMonster, log, slotsOf } from './draft'
import { transformBlocker } from './transform'
import { bestCandidateScore } from './ai'
import { incomingShare } from './transformAi'

/** Cặp hợp thể của một phe: quái chính (ô đầu), quái phụ và ô của nó. */
export interface MergePair {
  lead: Monster
  partner: Monster
  partnerSlot: number
}

/** Hai quái thường còn sống trên sân của phe (quái ô đầu là quái chính); null = không đủ cặp. */
export function mergePairOf(data: GameData, d: Draft, side: BattleSide): MergePair | null {
  const onField = aliveOnField(data, d, side)
  if (onField.length !== 2) return null
  const [lead, partner] = onField
  return { lead: lead.monster, partner: partner.monster, partnerSlot: partner.slot }
}

/** Hai quái hợp nhau: cùng race, có chung ít nhất một hệ, hoặc một con là bản mệnh. */
const isCompatible = (a: Monster, b: Monster): boolean =>
  a.raceId === b.raceId || a.elementIds.some((id) => b.elementIds.includes(id)) || a.bond || b.bond

/**
 * Lý do phe không hợp thể được lúc này (null = được): luật chung của biến hình cho cả hai quái (độ
 * kiếp, luật bí cảnh, phe đã dùng, quái đã biến hình, quái lớn), đủ cặp, thân mật (chỉ phe người
 * chơi: quái NPC coi như đủ, như vật phẩm chìa khóa), hợp nhau.
 */
export function mergeBlocker(
  data: GameData,
  d: Draft,
  side: BattleSide
): TransformFailReason | null {
  const pair = mergePairOf(data, d, side)
  if (!pair) {
    // Vẫn báo lý do chung (độ kiếp, đã dùng) nếu có, rồi mới tới thiếu cặp.
    const first = aliveOnField(data, d, side)[0]?.monster
    const general = first && transformBlocker(data, d, { side, monster: first, kind: 'merge' })
    return general || 'needsPair'
  }
  for (const monster of [pair.lead, pair.partner]) {
    const reason = transformBlocker(data, d, { side, monster, kind: 'merge' })
    if (reason) return reason
  }
  const { minAffinity } = data.config.transform.merge
  if (side === 'player' && [pair.lead, pair.partner].some((m) => m.affinity < minAffinity)) {
    return 'affinityTooLow'
  }
  return isCompatible(pair.lead, pair.partner) ? null : 'incompatible'
}

/** Hệ của thực thể: hệ đầu của mỗi con (trùng thì một hệ). */
const mergedElementIds = (lead: Monster, partner: Monster): string[] => [
  // Quái đang không hệ (Burn Up) không góp hệ nào.
  ...new Set([...lead.elementIds.slice(0, 1), ...partner.elementIds.slice(0, 1)])
]

/**
 * Quái chính sau khi hợp thể (bản mới, không đụng quái cũ): biến hình `merge` mang bản chụp quái
 * phụ, hệ gộp, máu đã mất = tổng máu đã mất của hai con (max HP = tổng max HP). `originalElementIds`:
 * hệ trả lại khi tách.
 */
function mergedLead(
  data: GameData,
  { lead, partner, partnerSlot }: MergePair,
  originalElementIds: readonly string[]
): Monster {
  // Bản chụp không mang trạng thái / biến hình: trạng thái của thực thể là của quái chính.
  const snapshot: Monster = { ...cloneData(partner), statuses: [] }
  delete snapshot.battleTransform
  return {
    ...lead,
    elementIds: mergedElementIds(lead, partner),
    damageTaken: lead.damageTaken.plus(partner.damageTaken),
    battleTransform: {
      kind: 'merge',
      originalElementIds: [...originalElementIds],
      turnsLeft: data.config.transform.merge.turns,
      mergePartner: { monster: snapshot, slot: partnerSlot }
    }
  }
}

/** Hợp thể cặp của phe (đã kiểm tra mergeBlocker): quái phụ rời sân, quái chính chiếm mọi ô. */
export function applyMerge(data: GameData, d: Draft, side: BattleSide): void {
  const pair = mergePairOf(data, d, side)
  if (!pair) throw new Error('Phe không có cặp hợp thể')
  const { lead, partner, partnerSlot } = pair
  // Quái chính đang bị đổi hệ (trait Siralim): hệ gốc thật nằm ở originalIdentity, như applyTransform.
  const identity = d.battle.volatiles[lead.id]?.originalIdentity
  const merged = mergedLead(data, pair, identity?.elementIds ?? lead.elementIds)
  if (identity) identity.elementIds = [...merged.elementIds]
  clearOnFieldState(data, d, partner.id)
  Object.assign(lead, merged)
  partner.battleTransform = {
    kind: 'merge',
    originalElementIds: [...partner.elementIds],
    mergedIntoId: lead.id
  }
  slotsOf(d.battle, side)[partnerSlot] = lead.id
  d.battle.transformsUsed[side].push('merge')
  log(d, { type: 'merged', side, monsterId: lead.id, partnerId: partner.id })
}

/**
 * Máu đã mất của một con khi tách: theo tỉ lệ max HP của nó trong tổng, làm tròn xuống (có lợi cho
 * quái), còn sống thì còn ít nhất 1 máu.
 */
function splitDamage(damage: Decimal, { own, total }: { own: Decimal; total: Decimal }): Decimal {
  return maxBig(0, minBig(own.minus(1), damage.times(own).div(total).floor()))
}

/**
 * Tách thực thể hợp thể: hai con về dạng riêng (vẫn tính đã biến hình), máu chia theo tỉ lệ max HP,
 * thực thể đã gục thì cả hai gục. `placePartner`: quái phụ về ô cũ (hết lượt); không thì nó chỉ trở
 * lại đội (thực thể rời sân, hết trận). Quái phụ nhận bậc trận của thực thể.
 */
export function unmerge(
  data: GameData,
  d: Draft,
  lead: Monster,
  { placePartner }: { placePartner: boolean }
): void {
  const transform = lead.battleTransform
  const snapshot = mergePartnerOf(lead)
  if (!transform || !snapshot || !transform.mergePartner) return
  const partner = findMonster(d, snapshot.id)
  const alive = !isFainted(data, lead)
  const damage = lead.damageTaken
  const identity = d.battle.volatiles[lead.id]?.originalIdentity
  if (identity) identity.elementIds = [...transform.originalElementIds]
  else lead.elementIds = [...transform.originalElementIds]
  lead.battleTransform = {
    kind: 'merge',
    originalElementIds: transform.originalElementIds,
    ended: true
  }
  partner.battleTransform = {
    kind: 'merge',
    originalElementIds: [...partner.elementIds],
    ended: true
  }
  const leadMax = getMaxHp(data, lead)
  const partnerMax = getMaxHp(data, partner)
  if (alive) {
    const total = leadMax.plus(partnerMax)
    lead.damageTaken = splitDamage(damage, { own: leadMax, total })
    partner.damageTaken = splitDamage(damage, { own: partnerMax, total })
  } else {
    lead.damageTaken = leadMax
    partner.damageTaken = partnerMax
    // Gục thì mất mọi trạng thái (như quái gục thường).
    partner.statuses = []
  }
  log(d, { type: 'unmerged', monsterId: lead.id, partnerId: partner.id })
  if (!placePartner || !alive) return
  const side = d.party.some((m) => m.id === lead.id) ? 'player' : 'enemy'
  slotsOf(d.battle, side)[transform.mergePartner.slot] = partner.id
  d.battle.volatiles[partner.id] = {
    firstTurn: d.battle.volatiles[lead.id]?.firstTurn ?? d.battle.turn
  }
  const stages = d.battle.stages[lead.id]
  if (stages) d.battle.stages[partner.id] = { ...stages }
}

/**
 * Lợi của hợp thể cho AI (như lợi biến hình, transformAi.ts): điểm lệnh tốt nhất của thực thể × 2
 * hành động − điểm hai quái riêng, cộng phần tỉ lệ máu đỡ được trước đòn mạnh nhất của địch (trung
 * bình hai con so với thực thể). null = không hợp thể được.
 */
export function mergeGain(data: GameData, d: Draft, side: BattleSide): number | null {
  if (mergeBlocker(data, d, side) !== null) return null
  const pair = mergePairOf(data, d, side)
  if (!pair) return null
  const identity = d.battle.volatiles[pair.lead.id]?.originalIdentity
  const merged = mergedLead(data, pair, identity?.elementIds ?? pair.lead.elementIds)
  const score = (user: Monster, slot: number): number =>
    bestCandidateScore(data, d, { side, slot, user })
  const offense = score(merged, 0) * 2 - score(pair.lead, 0) - score(pair.partner, pair.partnerSlot)
  const separate =
    (incomingShare(data, d, side, pair.lead) + incomingShare(data, d, side, pair.partner)) / 2
  return offense + separate - incomingShare(data, d, side, merged)
}

/** Quái chính đang hợp thể của hai phe (kể cả đã gục chưa dọn): để tách khi hết trận. */
export function activeMergeLeads(d: Draft): Monster[] {
  return [...d.party, ...d.battle.enemies].filter((m) => mergePartnerOf(m) !== undefined)
}
