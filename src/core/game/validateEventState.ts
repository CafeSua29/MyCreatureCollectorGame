// Kiểm tra phần event trong save (docs/rules/events.md): GameState.events (event chờ, modifier,
// chuỗi, cửa hàng tạm, trận event đang chờ kết quả, thú triều, cửa hàng đóng) và BattleState.special.
// Gọi từ validateGameState.

import type { EventDef, GameData } from '../model'
import { validateShop } from '../shop'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkZoneBattle } from './validateZoneState'
import { checkGatheringBattle } from './validateGatheringState'
import { checkWorldBossBattle } from './validateWorldBossState'

type Raw = Record<string, unknown>

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Tầng null (thị trấn) hoặc tầng đã mở. */
function checkFloorOrTown(value: unknown, highestFloor: unknown, path: string): string[] {
  if (value === null) return []
  const issues = checkInteger(value, path, 1)
  if (typeof value === 'number' && typeof highestFloor === 'number' && value > highestFloor) {
    issues.push(`${path} phải ≤ tầng cao nhất (${highestFloor})`)
  }
  return issues
}

/** Id event tồn tại (trả về event nếu có). */
function eventOf(
  data: GameData,
  value: unknown,
  path: string,
  issues: string[]
): EventDef | undefined {
  if (typeof value === 'string' && Object.hasOwn(data.events, value)) return data.events[value]
  issues.push(`${path}: event không tồn tại "${String(value)}"`)
  return undefined
}

/** Event chờ: event tồn tại, chỗ gặp, chuỗi (chỉ event nhóm chain mới có chainId). */
function checkPending(data: GameData, state: Raw, value: unknown, issues: string[]): void {
  if (value === null) return
  const pending = asObject(value)
  if (!pending) {
    issues.push('events.pending phải là null hoặc { eventId, floor, chainId }')
    return
  }
  const event = eventOf(data, pending.eventId, 'events.pending.eventId', issues)
  issues.push(...checkFloorOrTown(pending.floor, state.highestFloor, 'events.pending.floor'))
  const chained = pending.chainId !== null
  if (chained && typeof pending.chainId !== 'string') {
    issues.push('events.pending.chainId phải là null hoặc chuỗi')
  }
  if (event && chained !== (event.group === 'chain')) {
    issues.push('events.pending.chainId: chỉ bước của chuỗi (nhóm chain) mới có chuỗi')
  }
  if (state.battle !== null) issues.push('events.pending: có event chờ thì không trong trận')
}

/** Modifier: tồn tại, không trùng, thời hạn khớp loại thời hạn. */
function checkModifiers(data: GameData, value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push('events.modifiers phải là danh sách')
    return
  }
  const seen = new Set<string>()
  value.forEach((entry: unknown, i) => {
    const active = asObject(entry) ?? {}
    const at = `events.modifiers[${i}]`
    const id = active.modifierId
    if (typeof id !== 'string' || !Object.hasOwn(data.eventModifiers, id)) {
      issues.push(`${at}.modifierId: modifier không tồn tại "${String(id)}"`)
      return
    }
    if (seen.has(id)) issues.push(`${at}: modifier "${id}" bị trùng`)
    seen.add(id)
    const byTown = data.eventModifiers[id].duration.kind === 'town'
    if (byTown && active.battlesLeft !== null) issues.push(`${at}.battlesLeft phải là null`)
    if (!byTown) issues.push(...checkInteger(active.battlesLeft, `${at}.battlesLeft`, 1))
  })
}

/** Chuỗi: id không trùng, bước là event nhóm chain, số trận chờ ≥ 0, tầng mở chuỗi ≥ 1. */
function checkChains(data: GameData, value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push('events.chains phải là danh sách')
    return
  }
  const seen = new Set<string>()
  value.forEach((entry: unknown, i) => {
    const chain = asObject(entry) ?? {}
    const at = `events.chains[${i}]`
    if (typeof chain.chainId !== 'string' || chain.chainId === '') {
      issues.push(`${at}.chainId phải là chuỗi không rỗng`)
    } else if (seen.has(chain.chainId)) issues.push(`${at}: chuỗi "${chain.chainId}" bị trùng`)
    else seen.add(chain.chainId)
    const event = eventOf(data, chain.eventId, `${at}.eventId`, issues)
    if (event && event.group !== 'chain') issues.push(`${at}.eventId phải là event nhóm chain`)
    issues.push(...checkInteger(chain.battlesLeft, `${at}.battlesLeft`, 0))
    issues.push(...checkInteger(chain.floor, `${at}.floor`, 1))
  })
}

/** Cửa hàng tạm: hàng như cửa hàng thị trấn, số còn lại, hệ số giá, chỗ gặp. */
function checkTempShop(data: GameData, state: Raw, value: unknown, issues: string[]): void {
  if (value === null) return
  const shop = asObject(value)
  if (!shop || !Array.isArray(shop.stock)) {
    issues.push('events.tempShop phải là null hoặc { stock, priceMultiplier, floor }')
    return
  }
  const entries = shop.stock.map((entry: unknown) => asObject(entry)?.entry)
  issues.push(...validateShop(data, { stock: entries }, 'events.tempShop'))
  shop.stock.forEach((entry: unknown, i) => {
    const remaining = asObject(entry)?.remaining
    if (remaining !== null) {
      issues.push(...checkInteger(remaining, `events.tempShop.stock[${i}].remaining`, 1))
    }
  })
  issues.push(...checkNumber(shop.priceMultiplier, 'events.tempShop.priceMultiplier', 0))
  issues.push(...checkFloorOrTown(shop.floor, state.highestFloor, 'events.tempShop.floor'))
}

/** Trận event chờ kết quả: trỏ tới đúng một kết quả startBattle; đang có trận event. */
function checkBattleRef(data: GameData, state: Raw, value: unknown, issues: string[]): void {
  if (value === null) return
  const ref = asObject(value)
  if (!ref) {
    issues.push('events.battle phải là null hoặc vị trí kết quả startBattle')
    return
  }
  const event = eventOf(data, ref.eventId, 'events.battle.eventId', issues)
  const option = event?.options.find((entry) => entry.id === ref.optionId)
  const outcome =
    typeof ref.outcomeIndex === 'number' ? option?.outcomes[ref.outcomeIndex] : undefined
  const result = typeof ref.resultIndex === 'number' ? outcome?.results[ref.resultIndex] : undefined
  if (event && result?.type !== 'startBattle') {
    issues.push('events.battle: vị trí không trỏ tới kết quả startBattle')
  }
  if (ref.chainId !== null && typeof ref.chainId !== 'string') {
    issues.push('events.battle.chainId phải là null hoặc chuỗi')
  }
  const special = asObject(asObject(state.battle)?.special)
  if (special?.kind !== 'event' || special.eventId !== ref.eventId) {
    issues.push('events.battle: phải đang trong trận của event đó')
  }
}

/**
 * Thú triều: null, đã lên lịch / báo trước tới ngày ≥ 0, hoặc đang diễn ra (đã thắng ≤ số đợt, mốc
 * thú vương trong [1, số đợt]; ở thị trấn).
 */
function checkBeastTide(state: Raw, value: unknown, issues: string[]): void {
  if (value === null) return
  const tide = asObject(value)
  if (tide?.phase === 'scheduled' || tide?.phase === 'warned') {
    issues.push(...checkInteger(tide.day, 'events.beastTide.day', 0))
    return
  }
  if (tide?.phase !== 'active') {
    issues.push(
      'events.beastTide phải là null, { phase: "scheduled" | "warned", day } hoặc { phase: "active" }'
    )
    return
  }
  issues.push(...checkInteger(tide.waves, 'events.beastTide.waves', 1))
  // Đã thắng hết số đợt thì còn thú vương (bắt buộc): cleared tối đa = waves.
  issues.push(...checkInteger(tide.cleared, 'events.beastTide.cleared', 0))
  issues.push(...checkInteger(tide.kingAfter, 'events.beastTide.kingAfter', 1))
  const { cleared, waves, kingAfter } = tide
  if (typeof cleared === 'number' && typeof waves === 'number' && cleared > waves) {
    issues.push('events.beastTide.cleared phải ≤ waves')
  }
  if (typeof kingAfter === 'number' && typeof waves === 'number' && kingAfter > waves) {
    issues.push('events.beastTide.kingAfter phải ≤ waves')
  }
  if (asObject(state.location)?.type !== 'town') {
    issues.push('events.beastTide: đang có thú triều thì phải ở thị trấn')
  }
}

/** Kiểm tra GameState.events. */
export function validateEventState(data: GameData, state: Raw): string[] {
  const events = asObject(state.events)
  if (!events) return ['events phải là object']
  const issues: string[] = []
  checkPending(data, state, events.pending, issues)
  if (!Array.isArray(events.log)) issues.push('events.log phải là danh sách')
  else if (listOf(events.log).some((entry) => typeof asObject(entry)?.type !== 'string')) {
    issues.push('events.log: mỗi dòng phải có type')
  }
  checkModifiers(data, events.modifiers, issues)
  checkChains(data, events.chains, issues)
  checkTempShop(data, state, events.tempShop, issues)
  checkBattleRef(data, state, events.battle, issues)
  checkBeastTide(state, events.beastTide, issues)
  if (events.shopClosedUntilDay !== null) {
    issues.push(...checkInteger(events.shopClosedUntilDay, 'events.shopClosedUntilDay', 0))
  }
  return issues
}

/**
 * battle.special: null, trận event (event tồn tại, noFlee, hệ số tiền ≥ 0), đợt thú triều / thú
 * vương (trận chưa kết thúc thì là đợt kế tiếp của thú triều đang diễn ra, khớp tiến độ) hoặc trận
 * hiểm địa (validateZoneState.ts), trận câu cá / khai thác (validateGatheringState.ts), boss thế giới
 * (validateWorldBossState.ts).
 */
export function checkBattleSpecial(
  data: GameData,
  battle: Raw,
  state: Raw,
  issues: string[]
): void {
  if (battle.special === null) return
  const special = asObject(battle.special)
  if (special?.kind === 'event') {
    eventOf(data, special.eventId, 'battle.special.eventId', issues)
    if (typeof special.noFlee !== 'boolean') issues.push('battle.special.noFlee phải là boolean')
    issues.push(...checkNumber(special.moneyMultiplier, 'battle.special.moneyMultiplier', 0))
    return
  }
  if (special?.kind === 'zone') {
    checkZoneBattle(data, battle, state, issues)
    return
  }
  if (special?.kind === 'gathering') {
    checkGatheringBattle(battle, issues)
    return
  }
  if (special?.kind === 'worldBoss') {
    checkWorldBossBattle(battle, state, issues)
    return
  }
  if (special?.kind !== 'beastTide') {
    issues.push(
      'battle.special phải là null hoặc { kind: "event" | "beastTide" | "zone" | "gathering" | ' +
        '"worldBoss" }'
    )
    return
  }
  issues.push(...checkInteger(special.waves, 'battle.special.waves', 1))
  issues.push(...checkInteger(special.wave, 'battle.special.wave', 1))
  if (typeof special.king !== 'boolean') issues.push('battle.special.king phải là boolean')
  if (battle.phase === 'ended') return
  const tide = asObject(asObject(state.events)?.beastTide)
  if (tide?.phase !== 'active' || tide.cleared !== Number(special.wave) - 1) {
    issues.push('battle.special: đợt thú triều phải là đợt kế tiếp của thú triều đang diễn ra')
    return
  }
  // Đợt thường chỉ khi còn đợt; thú vương khi đã đủ mốc.
  const wave = Number(special.wave)
  if (special.king ? tide.cleared < Number(tide.kingAfter) : wave > Number(tide.waves)) {
    issues.push('battle.special: đợt thú triều / thú vương không khớp tiến độ thú triều')
  }
}
