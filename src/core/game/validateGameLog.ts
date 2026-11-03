// Kiểm tra log ngoài trận khi load (docs/rules/game-log.md): danh sách dòng đúng loại, đủ trường,
// trường Decimal hợp lệ. Log chỉ để UI báo kết quả action gần nhất nên không tra chéo id.

import { asObject, checkBig } from '../shared'
import type { GameLogEntry, GameLogType } from '../model'
import { LOG_BIG_FIELDS } from './bigFields'

type FieldsOf<T extends GameLogType> = readonly Exclude<
  keyof Extract<GameLogEntry, { type: T }>,
  'type'
>[]

/**
 * Trường bắt buộc của từng loại dòng (Record theo loại: thêm loại mà thiếu mục thì TypeScript báo).
 * Trường tùy chọn (`?`) không liệt kê.
 */
const GAME_LOG_FIELDS: { readonly [T in GameLogType]: FieldsOf<T> } = {
  // Thời gian trôi (docs/rules/lifespan.md và các mục có việc theo ngày).
  diedOfOldAge: ['monsterId', 'speciesId', 'nickname'],
  legacyEggHatched: ['monsterId'],
  monsterAutoJoined: ['monsterId'],
  gameOver: [],
  nearingLifespanEnd: ['monsterId', 'yearsLeft'],
  imprintRequest: ['monsterId', 'request'],
  imprintFinished: ['monsterId', 'percent'],
  cropRipe: ['plotIndex', 'seedItemId'],
  expeditionReturned: ['activeId', 'expeditionId', 'successPercent', 'injuredIds', 'eggId'],
  bondBroken: ['monsterId', 'woundUntilDay'],
  beastTideWarning: ['day'],
  beastTideArrived: ['waves'],
  worldBossAppeared: ['speciesId', 'endDay'],
  worldBossLeft: ['speciesId', 'tierId'],
  auctionWon: ['lotId', 'price', 'received'],
  auctionLost: ['lotId', 'npcPrice'],
  consignmentSold: ['consignmentId', 'item', 'count', 'earned'],
  consignmentReturned: ['consignmentId', 'npcPrice', 'received'],
  // Kết quả event (docs/rules/events.md).
  eventResolved: ['eventId', 'optionId'],
  itemGained: ['itemId', 'count'],
  itemSpent: ['itemId', 'count'],
  moneyGained: ['amount'],
  moneyLost: ['amount'],
  equipmentGained: ['instanceId', 'itemId', 'rarity'],
  eggGained: ['eggId'],
  monsterJoined: ['monsterId', 'destination'],
  monsterRefused: ['speciesId'],
  equipmentLost: ['itemId', 'rarity'],
  partyHealed: [],
  statusApplied: ['monsterId', 'statusId'],
  statusImmune: ['monsterId', 'statusId'],
  modifierAdded: ['modifierId', 'battlesLeft'],
  tempShopOpened: ['entries'],
  chainStarted: ['chainId', 'eventId', 'battlesLeft'],
  chainAdvanced: ['chainId', 'eventId', 'battlesLeft'],
  chainEnded: ['chainId'],
  battleStarted: [],
  beastTideRetreated: ['moneyLost', 'shopClosedUntilDay'],
  // Khu bảo tồn (docs/rules/safari-zone.md).
  safariEncounter: ['monsterId', 'speciesId'],
  safariThrowBall: ['monsterId', 'chance', 'critical', 'shakes'],
  safariBreakFree: ['monsterId'],
  safariCaught: ['monsterId', 'destination'],
  safariLure: ['monsterId', 'kind', 'itemId', 'favorite'],
  safariFled: ['monsterId'],
  safariSkipped: ['monsterId'],
  safariVisitEnded: ['caught'],
  // Action khác.
  gathered: ['method', 'tier', 'lureItemId', 'items', 'encounter'],
  presetMissing: ['presetId', 'monsterIds', 'items'],
  crafted: ['station', 'recipeId', 'successes', 'failures'],
  zoneStep: ['zoneId', 'result'],
  fused: ['baseId', 'outcome'],
  breakthrough: ['success', 'realm'],
  ascended: ['count', 'essenceGained', 'startFloor'],
  destiniesChosen: ['destinyIds'],
  contractAttempted: ['monsterId', 'outcome'],
  implanted: ['monsterId', 'tierId', 'success', 'fails', 'died'],
  researchLevelUp: ['speciesId', 'level'],
  equipmentCast: ['instanceId', 'itemId', 'rarity'],
  equipmentSalvaged: ['instanceIds', 'enhanceStones', 'refiningStones', 'soulPoints', 'spirits'],
  gachaPulled: ['eggIds']
}

/** Trường Decimal theo loại dòng (đọc theo loại bất kỳ). */
const BIG_FIELD_OF: Partial<Record<GameLogType, string>> = LOG_BIG_FIELDS

const isLogType = (type: unknown): type is GameLogType =>
  typeof type === 'string' && Object.hasOwn(GAME_LOG_FIELDS, type)

/** log: danh sách dòng, mỗi dòng loại đã biết, đủ trường, trường Decimal hợp lệ. */
export function validateGameLog(state: Record<string, unknown>): string[] {
  if (!Array.isArray(state.log)) return ['log phải là danh sách']
  const issues: string[] = []
  state.log.forEach((raw: unknown, i) => {
    const entry = asObject(raw)
    const at = `log[${i}]`
    if (!entry || !isLogType(entry.type)) {
      issues.push(`${at}: loại dòng log lạ "${String(entry?.type)}"`)
      return
    }
    const fields: readonly string[] = GAME_LOG_FIELDS[entry.type]
    for (const field of fields) {
      if (!(field in entry)) issues.push(`${at}: thiếu ${field}`)
    }
    const bigField = BIG_FIELD_OF[entry.type]
    if (bigField !== undefined && bigField in entry) {
      issues.push(...checkBig(entry[bigField], `${at}.${bigField}`))
    }
  })
  return issues
}
