// Kiểm tra phần trận đấu của trait Siralim trong save (mục "Ngôn ngữ trait" ở trait-dsl.md): trạng thái
// tạm thêm (minion, trait tạm, Seal, skill tạm, chỉ số cộng thẳng, phòng thủ / khiêu khích, hệ /
// race gốc, Timeline; lượt chờ của skill có hold; thế đã dùng ở lượt trước), bản ghi trận và bộ đếm chung. Gọi từ validateGameState.

import { checkKnownFields } from '../gameData'
import {
  INVULNERABLE_KINDS,
  LOCK_IN_KINDS,
  MOVE_STYLES,
  NON_HP_STATS,
  SKILL_CATEGORIES,
  type GameData
} from '../model'
import { asObject, checkBig, checkInteger, checkNumber } from '../shared'

/** Danh sách id không lặp, mỗi id có trong `known`. */
function checkIds(
  value: unknown,
  path: string,
  known: Readonly<Record<string, unknown>>,
  issues: string[]
): void {
  if (!Array.isArray(value) || new Set(value).size !== value.length) {
    issues.push(`${path} phải là danh sách không lặp`)
    return
  }
  for (const id of value) {
    if (typeof id !== 'string' || !Object.hasOwn(known, id)) {
      issues.push(`${path}: id không tồn tại "${String(id)}"`)
    }
  }
}

function checkMinionList(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách`)
    return
  }
  const seen = new Set<string>()
  value.forEach((entry, i) => {
    const minion = asObject(entry)
    const id = minion?.minionId
    const at = `${path}[${i}]`
    if (typeof id !== 'string' || !Object.hasOwn(data.minions, id)) {
      issues.push(`${at}: minion không tồn tại "${String(id)}"`)
      return
    }
    if (seen.has(id)) issues.push(`${path}: minion "${id}" bị lặp`)
    seen.add(id)
    issues.push(...checkInteger(minion?.stacks, `${at}.stacks`, 1))
  })
}

function checkGainedTraits(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách`)
    return
  }
  value.forEach((entry, i) => {
    const trait = asObject(entry)
    if (typeof trait?.id !== 'string' || !Object.hasOwn(data.traits, trait.id)) {
      issues.push(`${path}[${i}]: trait không tồn tại "${String(trait?.id)}"`)
    }
    issues.push(...checkInteger(trait?.level, `${path}[${i}].level`, 1))
  })
}

function checkFlatStats(value: unknown, path: string, issues: string[]): void {
  const flat = asObject(value)
  if (!flat) {
    issues.push(`${path} phải là object`)
    return
  }
  for (const [stat, amount] of Object.entries(flat)) {
    if (!(NON_HP_STATS as readonly string[]).includes(stat))
      issues.push(`${path}.${stat}: chỉ số không hợp lệ`)
    issues.push(...checkBig(amount, `${path}.${stat}`, -Infinity))
  }
}

function checkIdentity(data: GameData, value: unknown, path: string, issues: string[]): void {
  const identity = asObject(value)
  if (!identity) {
    issues.push(`${path} phải là object`)
    return
  }
  checkIds(identity.elementIds, `${path}.elementIds`, data.elements, issues)
  if (typeof identity.raceId !== 'string' || !Object.hasOwn(data.races, identity.raceId)) {
    issues.push(`${path}.raceId: race không tồn tại "${String(identity.raceId)}"`)
  }
}

/** Phần thêm của một trạng thái tạm (trait Siralim). */
export function checkVolatileExtras(
  data: GameData,
  volatile: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  if (volatile.minions !== undefined)
    checkMinionList(data, volatile.minions, `${path}.minions`, issues)
  if (volatile.gainedTraits !== undefined) {
    checkGainedTraits(data, volatile.gainedTraits, `${path}.gainedTraits`, issues)
  }
  if (volatile.gainedSpellSlots !== undefined) {
    if (!Array.isArray(volatile.gainedSpellSlots))
      issues.push(`${path}.gainedSpellSlots phải là danh sách`)
    else {
      volatile.gainedSpellSlots.forEach((slot: unknown, i) => {
        const entry = asObject(slot)
        checkIds([entry?.skillId], `${path}.gainedSpellSlots[${i}].skillId`, data.skills, issues)
        issues.push(...checkNumber(entry?.chance, `${path}.gainedSpellSlots[${i}].chance`, 0, 100))
      })
    }
  }
  if (volatile.spellSlotGuaranteed !== undefined && volatile.spellSlotGuaranteed !== true) {
    issues.push(`${path}.spellSlotGuaranteed chỉ được là true`)
  }
  if (volatile.healsReplacement !== undefined && volatile.healsReplacement !== true) {
    issues.push(`${path}.healsReplacement chỉ được là true`)
  }
  if (volatile.focusStages !== undefined) {
    issues.push(...checkInteger(volatile.focusStages, `${path}.focusStages`, 1))
  }
  if (volatile.choiceLockSkillId !== undefined) {
    checkIds([volatile.choiceLockSkillId], `${path}.choiceLockSkillId`, data.skills, issues)
  }
  if (volatile.sealedSkillIds !== undefined) {
    checkIds(volatile.sealedSkillIds, `${path}.sealedSkillIds`, data.skills, issues)
  }
  if (volatile.tempSkillIds !== undefined) {
    checkIds(volatile.tempSkillIds, `${path}.tempSkillIds`, data.skills, issues)
  }
  if (volatile.flatStats !== undefined)
    checkFlatStats(volatile.flatStats, `${path}.flatStats`, issues)
  for (const field of ['defending', 'provoking'] as const) {
    if (volatile[field] !== undefined)
      issues.push(...checkInteger(volatile[field], `${path}.${field}`, 1))
  }
  if (volatile.originalIdentity !== undefined) {
    checkIdentity(data, volatile.originalIdentity, `${path}.originalIdentity`, issues)
  }
  if (
    volatile.timeline !== undefined &&
    volatile.timeline !== 'top' &&
    volatile.timeline !== 'bottom'
  ) {
    issues.push(`${path}.timeline phải là top / bottom`)
  }
  if (volatile.damagedSinceTurnEnd !== undefined && volatile.damagedSinceTurnEnd !== true) {
    issues.push(`${path}.damagedSinceTurnEnd chỉ được là true`)
  }
  if (volatile.holdReadyTurns !== undefined) {
    checkHoldReadyTurns(data, volatile.holdReadyTurns, `${path}.holdReadyTurns`, issues)
  }
  if (volatile.styleSpeed !== undefined) {
    checkStyleSpeed(data, volatile.styleSpeed, `${path}.styleSpeed`, issues)
  }
  if (volatile.turnLog !== undefined) checkTurnLog(volatile.turnLog, `${path}.turnLog`, issues)
  checkMultiTurnVolatile(data, volatile, path, issues)
  const protect = asObject(volatile.protect)
  if (protect?.skillId !== undefined) {
    checkIds([protect.skillId], `${path}.protect.skillId`, data.skills, issues)
  }
  if (volatile.abilitySuppressed !== undefined && volatile.abilitySuppressed !== true) {
    issues.push(`${path}.abilitySuppressed chỉ được là true`)
  }
  if (volatile.lastSkillFailed !== undefined && volatile.lastSkillFailed !== true) {
    issues.push(`${path}.lastSkillFailed chỉ được là true`)
  }
}

/** Trạng thái chiêu nhiều lượt trên quái (docs/rules/pokemon-moves.md mục "Chiêu nhiều lượt"). */
function checkMultiTurnVolatile(
  data: GameData,
  volatile: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  const skillRef = (value: unknown, where: string): void => {
    const obj = asObject(value)
    checkIds([obj?.skillId], `${where}.skillId`, data.skills, issues)
  }
  if (volatile.charging !== undefined) {
    skillRef(volatile.charging, `${path}.charging`)
    const kind = asObject(volatile.charging)?.invulnerable
    if (kind !== undefined && !(INVULNERABLE_KINDS as readonly unknown[]).includes(kind)) {
      issues.push(`${path}.charging.invulnerable không hợp lệ`)
    }
  }
  if (volatile.mustRecharge !== undefined) {
    issues.push(...checkInteger(volatile.mustRecharge, `${path}.mustRecharge`, 1))
  }
  if (volatile.lockedMove !== undefined) {
    skillRef(volatile.lockedMove, `${path}.lockedMove`)
    const locked = asObject(volatile.lockedMove)
    issues.push(...checkInteger(locked?.turnsLeft, `${path}.lockedMove.turnsLeft`, 0))
    if (!(LOCK_IN_KINDS as readonly unknown[]).includes(locked?.kind)) {
      issues.push(`${path}.lockedMove.kind không hợp lệ`)
    }
  }
  if (volatile.skillStreak !== undefined) {
    skillRef(volatile.skillStreak, `${path}.skillStreak`)
    const streak = asObject(volatile.skillStreak)
    issues.push(...checkInteger(streak?.count, `${path}.skillStreak.count`, 1))
    issues.push(...checkInteger(streak?.turn, `${path}.skillStreak.turn`, 1))
  }
  if (volatile.stockpile !== undefined) {
    issues.push(...checkInteger(volatile.stockpile, `${path}.stockpile`, 1))
  }
  if (volatile.abilityOverride !== undefined) {
    checkIds([volatile.abilityOverride], `${path}.abilityOverride`, data.traits, issues)
  }
  if (volatile.disabledSkill !== undefined) {
    skillRef(volatile.disabledSkill, `${path}.disabledSkill`)
    issues.push(
      ...checkInteger(
        asObject(volatile.disabledSkill)?.untilTurn,
        `${path}.disabledSkill.untilTurn`,
        1
      )
    )
  }
  for (const flag of ['destinyBond', 'grudge'] as const) {
    if (volatile[flag] !== undefined && volatile[flag] !== true)
      issues.push(`${path}.${flag} chỉ được là true`)
  }
  for (const key of [
    'magicCoatTurn',
    'snatchTurn',
    'cudChewTurn',
    'swoopedUntilTurn',
    'offBalanceUntilTurn'
  ] as const) {
    if (volatile[key] !== undefined)
      issues.push(...checkInteger(volatile[key], `${path}.${key}`, 1))
  }
  if (volatile.bide !== undefined) {
    skillRef(volatile.bide, `${path}.bide`)
    const bide = asObject(volatile.bide)
    issues.push(...checkInteger(bide?.turnsLeft, `${path}.bide.turnsLeft`, 0))
    issues.push(...checkBig(bide?.damage, `${path}.bide.damage`, 0))
    if (bide?.lastAttackerId !== undefined && typeof bide.lastAttackerId !== 'string') {
      issues.push(`${path}.bide.lastAttackerId phải là id quái`)
    }
  }
  for (const key of ['carriedBy', 'commanding', 'commandedBy'] as const) {
    const value = volatile[key]
    if (value !== undefined && (typeof value !== 'string' || value === '')) {
      issues.push(`${path}.${key} phải là id quái`)
    }
  }
  if (volatile.illusionSpeciesId !== undefined) {
    checkIds([volatile.illusionSpeciesId], `${path}.illusionSpeciesId`, data.species, issues)
  }
  if (volatile.turnStartCharge !== undefined) {
    skillRef(volatile.turnStartCharge, `${path}.turnStartCharge`)
    issues.push(
      ...checkInteger(asObject(volatile.turnStartCharge)?.turn, `${path}.turnStartCharge.turn`, 1)
    )
  }
}

/** Đòn đến muộn đang chờ (battle.delayedAttacks). */
export function checkDelayedAttacks(data: GameData, value: unknown, issues: string[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push('battle.delayedAttacks phải là danh sách')
    return
  }
  value.forEach((entry: unknown, i) => {
    const attack = asObject(entry)
    const where = `battle.delayedAttacks[${i}]`
    checkIds([attack?.skillId], `${where}.skillId`, data.skills, issues)
    if (typeof attack?.userId !== 'string') issues.push(`${where}.userId phải là id quái`)
    if (attack?.side !== 'player' && attack?.side !== 'enemy')
      issues.push(`${where}.side không hợp lệ`)
    issues.push(...checkInteger(attack?.slot, `${where}.slot`, 0))
    issues.push(...checkInteger(attack?.turn, `${where}.turn`, 1))
    if (attack?.healPercent !== undefined) {
      issues.push(...checkNumber(attack.healPercent, `${where}.healPercent`, Number.MIN_VALUE, 100))
    }
  })
}

/**
 * Nhật ký trong lượt (thường đã bỏ ở cuối lượt nên save không có): lượt nguyên ≥ 1, cờ chỉ được là
 * true, mỗi đòn có id quái ra đòn, loại skill, lượng số lớn > 0.
 */
function checkTurnLog(value: unknown, path: string, issues: string[]): void {
  const log = asObject(value)
  if (!log) {
    issues.push(`${path} không hợp lệ`)
    return
  }
  const flags = ['acted', 'statsRaised', 'statsLowered'] as const
  checkKnownFields(log, ['turn', ...flags, 'hits'], path, 'turnLog', issues)
  issues.push(...checkInteger(log.turn, `${path}.turn`, 1))
  for (const flag of flags) {
    if (log[flag] !== undefined && log[flag] !== true)
      issues.push(`${path}.${flag} chỉ được là true`)
  }
  if (log.hits === undefined) return
  if (!Array.isArray(log.hits)) {
    issues.push(`${path}.hits phải là danh sách`)
    return
  }
  log.hits.forEach((entry: unknown, i) => {
    const hit = asObject(entry)
    const where = `${path}.hits[${i}]`
    if (!hit || typeof hit.by !== 'string') issues.push(`${where}.by phải là id quái`)
    if (!(SKILL_CATEGORIES as readonly unknown[]).includes(hit?.category)) {
      issues.push(`${where}.category phải là ${SKILL_CATEGORIES.join(' / ')}`)
    }
    issues.push(...checkBig(hit?.amount, `${where}.amount`, Number.MIN_VALUE))
  })
}

/** Thế đã dùng ở lượt trước (docs/rules/move-styles.md): lượt nguyên ≥ 1, skill có thế, tên thế. */
function checkStyleSpeed(data: GameData, value: unknown, path: string, issues: string[]): void {
  const entry = asObject(value)
  if (!entry) {
    issues.push(`${path} không hợp lệ`)
    return
  }
  checkKnownFields(entry, ['turn', 'skillId', 'style'], path, 'styleSpeed', issues)
  issues.push(...checkInteger(entry.turn, `${path}.turn`, 1))
  const skillId = entry.skillId
  if (
    typeof skillId !== 'string' ||
    !Object.hasOwn(data.skills, skillId) ||
    data.skills[skillId].styles === undefined
  ) {
    issues.push(`${path}.skillId: skill không tồn tại hoặc không có thế "${String(skillId)}"`)
  }
  if (!(MOVE_STYLES as readonly unknown[]).includes(entry.style)) {
    issues.push(`${path}.style phải là ${MOVE_STYLES.join(' / ')}`)
  }
}

/** Lượt dùng lại skill có hold (mục "Hold" ở battle.md): theo id skill có hold, nguyên ≥ 1. */
function checkHoldReadyTurns(data: GameData, value: unknown, path: string, issues: string[]): void {
  const bySkill = asObject(value)
  if (!bySkill) {
    issues.push(`${path} không hợp lệ`)
    return
  }
  for (const [skillId, turn] of Object.entries(bySkill)) {
    if (!Object.hasOwn(data.skills, skillId) || data.skills[skillId].hold === undefined) {
      issues.push(`${path}: skill không tồn tại hoặc không có hold "${skillId}"`)
    }
    issues.push(...checkInteger(turn, `${path}.${skillId}`, 1))
  }
}

const RECORD_COUNTS = [
  'turnsTaken',
  'attacks',
  'casts',
  'timesDamaged',
  'defends',
  'provokes',
  'deaths',
  'revivals',
  'traitsGained',
  'catchMisses'
] as const
const RECORD_AMOUNTS = ['damageTaken', 'damageDealt', 'healingReceived'] as const

/** Bản ghi trận theo id quái trong trận. */
export function checkRecords(
  data: GameData,
  value: unknown,
  known: readonly string[],
  issues: string[]
): void {
  const byMonster = asObject(value)
  if (!byMonster) {
    issues.push('battle.records không hợp lệ')
    return
  }
  for (const [monsterId, entry] of Object.entries(byMonster)) {
    const path = `battle.records.${monsterId}`
    if (!known.includes(monsterId)) issues.push(`${path}: quái không có trong trận`)
    const record = asObject(entry) ?? {}
    for (const field of RECORD_COUNTS)
      issues.push(...checkInteger(record[field], `${path}.${field}`, 0))
    for (const field of RECORD_AMOUNTS) issues.push(...checkBig(record[field], `${path}.${field}`))
    if (
      record.lastAction !== null &&
      record.lastAction !== 'attack' &&
      record.lastAction !== 'cast'
    ) {
      issues.push(`${path}.lastAction phải là attack / cast / null`)
    }
    const used = record.usedTriggers
    if (!Array.isArray(used) || !used.every((id) => typeof id === 'string')) {
      issues.push(`${path}.usedTriggers phải là danh sách id`)
    }
    if (record.berriesEaten !== undefined) {
      issues.push(...checkInteger(record.berriesEaten, `${path}.berriesEaten`, 0))
    }
    if (record.lastConsumedItemId !== undefined && typeof record.lastConsumedItemId !== 'string') {
      issues.push(`${path}.lastConsumedItemId phải là id vật phẩm`)
    }
    if (record.skillUses !== undefined) {
      const uses = asObject(record.skillUses)
      if (!uses) issues.push(`${path}.skillUses phải là object`)
      for (const [skillId, count] of Object.entries(uses ?? {})) {
        if (!Object.hasOwn(data.skills, skillId)) {
          issues.push(`${path}.skillUses: skill không tồn tại "${skillId}"`)
        }
        issues.push(...checkInteger(count, `${path}.skillUses.${skillId}`, 1))
      }
    }
    checkRecordParts(data, record, path, issues)
  }
}

/** Phần vị trí ra đòn của bản ghi trận (docs/rules/hit-locations.md): id bộ phận tồn tại. */
function checkRecordParts(
  data: GameData,
  record: Record<string, unknown>,
  path: string,
  issues: string[]
): void {
  const isPart = (id: unknown): boolean =>
    typeof id === 'string' && Object.hasOwn(data.bodyParts, id)
  if (record.partDamagePercent !== undefined) {
    const parts = asObject(record.partDamagePercent)
    if (!parts) issues.push(`${path}.partDamagePercent phải là object`)
    for (const [partId, percent] of Object.entries(parts ?? {})) {
      if (!isPart(partId))
        issues.push(`${path}.partDamagePercent: bộ phận không tồn tại "${partId}"`)
      issues.push(...checkNumber(percent, `${path}.partDamagePercent.${partId}`, 0))
    }
  }
  const broken = record.brokenParts
  if (
    broken !== undefined &&
    (!Array.isArray(broken) || !broken.every(isPart) || new Set(broken).size !== broken.length)
  ) {
    issues.push(`${path}.brokenParts phải là danh sách bộ phận không trùng`)
  }
  if (record.knockoutPart !== undefined && !isPart(record.knockoutPart)) {
    issues.push(`${path}.knockoutPart phải là id bộ phận`)
  }
}

/** Sổ món lắp trước khi bị lấy / tráo trong trận (battle.itemLedger): danh sách món theo id quái. */
export function checkItemLedger(value: unknown, known: readonly string[], issues: string[]): void {
  if (value === undefined) return
  const ledger = asObject(value)
  if (!ledger) {
    issues.push('battle.itemLedger phải là object')
    return
  }
  for (const [monsterId, entries] of Object.entries(ledger)) {
    if (!known.includes(monsterId))
      issues.push(`battle.itemLedger.${monsterId}: quái không có trong trận`)
    if (!Array.isArray(entries)) issues.push(`battle.itemLedger.${monsterId} phải là danh sách món`)
  }
}

/** Bộ đếm chung của trận. */
export function checkCounters(data: GameData, value: unknown, issues: string[]): void {
  const counters = asObject(value)
  if (!counters) {
    issues.push('battle.counters không hợp lệ')
    return
  }
  const casts = asObject(counters.casts)
  issues.push(...checkInteger(casts?.player, 'battle.counters.casts.player', 0))
  issues.push(...checkInteger(casts?.enemy, 'battle.counters.casts.enemy', 0))
  issues.push(...checkInteger(counters.deaths, 'battle.counters.deaths', 0))
  if (counters.faintTurn !== undefined) {
    const turns = asObject(counters.faintTurn)
    if (!turns) issues.push('battle.counters.faintTurn phải là object')
    for (const side of ['player', 'enemy'] as const) {
      if (turns?.[side] !== undefined) {
        issues.push(...checkInteger(turns[side], `battle.counters.faintTurn.${side}`, 1))
      }
    }
  }
  if (counters.fieldStreaks !== undefined) {
    const streaks = asObject(counters.fieldStreaks)
    if (!streaks) issues.push('battle.counters.fieldStreaks phải là object')
    for (const [skillId, value] of Object.entries(streaks ?? {})) {
      const where = `battle.counters.fieldStreaks.${skillId}`
      checkIds([skillId], where, data.skills, issues)
      const streak = asObject(value)
      issues.push(...checkInteger(streak?.turn, `${where}.turn`, 1))
      issues.push(...checkInteger(streak?.count, `${where}.count`, 1))
    }
  }
  const last = counters.lastCastSkillId
  if (last !== null && (typeof last !== 'string' || !Object.hasOwn(data.skills, last))) {
    issues.push(`battle.counters.lastCastSkillId: skill không tồn tại "${String(last)}"`)
  }
}
