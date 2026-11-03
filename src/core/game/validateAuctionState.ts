// Kiểm tra Đấu giá hành trong save (docs/rules/auction.md): lô, đồ ký gửi, món giữ hộ. Nội dung món
// trang bị và id món kiểm tra chung ở validateEquipmentState; quái trong trứng ở validateGameState.

import { describeItemRefProblem, findItemRefProblem, validateEquipmentInstance } from '../inventory'
import { AUCTION_LOT_KINDS, type GameData } from '../model'
import { asObject, checkBig, checkInteger, isValidBig } from '../shared'

/** Kiểm tra một trứng tại đường dẫn, trả về id trứng; do validateGameState cung cấp. */
type EggCheck = (egg: unknown, path: string) => string

/** Item `{ entry, count }`: định danh hợp lệ (món trang bị: nội dung món), count ≥ 1 (món: đúng 1). */
function checkEntry(
  data: GameData,
  holder: Record<string, unknown>,
  at: string,
  issues: string[]
): void {
  const entry = asObject(holder.entry)
  if (entry?.storage === 'instance') {
    issues.push(...validateEquipmentInstance(data, entry.instance, `${at}.entry.instance`))
    if (holder.count !== 1) issues.push(`${at}.count: món trang bị phải là 1`)
    return
  }
  const problem = findItemRefProblem(data, holder.entry)
  if (problem) issues.push(`${at}.entry: ${describeItemRefProblem(problem)}`)
  issues.push(...checkInteger(holder.count, `${at}.count`, 1))
}

/** Lô: loại, thứ bán (item / trứng), giá khởi điểm ≥ 1, giá trần NPC ≥ 0, giá đặt null hoặc ≥ khởi điểm. */
function checkLot(
  data: GameData,
  lot: Record<string, unknown>,
  { at, checkEgg }: { at: string; checkEgg: EggCheck },
  issues: string[]
): string | null {
  if (!(AUCTION_LOT_KINDS as readonly unknown[]).includes(lot.kind)) {
    issues.push(`${at}.kind phải là ${AUCTION_LOT_KINDS.join(' / ')}`)
  }
  issues.push(...checkBig(lot.startPrice, `${at}.startPrice`, 1))
  issues.push(...checkBig(lot.npcPrice, `${at}.npcPrice`, 0))
  if (lot.bid !== null) {
    issues.push(...checkBig(lot.bid, `${at}.bid`, 1))
    if (isValidBig(lot.bid) && isValidBig(lot.startPrice) && lot.bid.lt(lot.startPrice)) {
      issues.push(`${at}.bid phải ≥ startPrice`)
    }
  }
  const good = asObject(lot.good)
  if (good?.kind === 'egg') return checkEgg(good.egg, `${at}.good.egg`)
  if (good?.kind === 'item') checkEntry(data, good, `${at}.good`, issues)
  else issues.push(`${at}.good.kind phải là item / egg`)
  return null
}

/**
 * auction: lô và đồ ký gửi id "a<số>" nhỏ hơn nextId, không trùng; ngày đóng phiên nguyên ≥ 0; món
 * giữ hộ hợp lệ. Trả về id trứng trong lô (để kiểm tra trùng id với mọi quái khác).
 */
export function validateAuctionState(
  data: GameData,
  state: Record<string, unknown>,
  { checkEgg, issues }: { checkEgg: EggCheck; issues: string[] }
): string[] {
  const auction = asObject(state.auction)
  if (!auction) {
    issues.push('auction phải là object { lots, closeDay, consignments, held, nextId }')
    return []
  }
  issues.push(...checkInteger(auction.closeDay, 'auction.closeDay', 0))
  issues.push(...checkInteger(auction.nextId, 'auction.nextId', 1))
  const next = typeof auction.nextId === 'number' ? auction.nextId : 0
  const ids: unknown[] = []
  const eggIds: string[] = []
  const eachObject = (
    list: unknown,
    path: string,
    visit: (entry: Record<string, unknown>, at: string) => void
  ): void => {
    if (!Array.isArray(list)) {
      issues.push(`${path} phải là danh sách`)
      return
    }
    list.forEach((value: unknown, i) => {
      const at = `${path}[${i}]`
      const entry = asObject(value)
      if (!entry) {
        issues.push(`${at} phải là object`)
        return
      }
      ids.push(entry.id)
      const { id } = entry
      if (typeof id !== 'string' || !/^a\d+$/.test(id) || Number(id.slice(1)) >= next) {
        issues.push(`${at}.id phải có dạng "a<số>" nhỏ hơn nextId`)
      }
      visit(entry, at)
    })
  }
  eachObject(auction.lots, 'auction.lots', (lot, at) => {
    const eggId = checkLot(data, lot, { at, checkEgg }, issues)
    if (eggId !== null) eggIds.push(eggId)
  })
  eachObject(auction.consignments, 'auction.consignments', (consignment, at) => {
    checkEntry(data, consignment, at, issues)
    issues.push(...checkBig(consignment.reservePrice, `${at}.reservePrice`, 0))
  })
  if (new Set(ids).size !== ids.length) issues.push('auction: id lô / ký gửi bị trùng')
  if (!Array.isArray(auction.held)) issues.push('auction.held phải là danh sách')
  else {
    auction.held.forEach((instance: unknown, i) => {
      issues.push(...validateEquipmentInstance(data, instance, `auction.held[${i}]`))
    })
  }
  return eggIds
}
