// Vị trí mọi trường Decimal trong GameState (docs/rules/big-numbers.md). Danh sách DUY NHẤT dùng
// cho cả migrate (số cũ → chuỗi) lẫn đọc save (chuỗi → Decimal). Thêm trường Decimal mới vào
// state thì thêm vào đây (và tăng SAVE_VERSION nếu đổi cấu trúc save).

import { STAT_NAMES, type BattleEvent, type DayEvent, type EventLogEntry } from '../model'
import { asObject, type Decimal } from '../shared'

/** Trường Decimal trên mỗi quái (genes / fusingBonusStats: từng chỉ số). */
const MONSTER_BIG_FIELDS = ['exp', 'damageTaken', 'battleMaxHpDelta', 'lifespanBonusYears'] as const
const MONSTER_BIG_STATS = ['genes', 'fusingBonusStats'] as const

/** Tên trường kiểu Decimal của một loại sự kiện (never nếu không có). */
type DecimalKeys<E> = { [K in keyof E]-?: E[K] extends Decimal ? K : never }[keyof E]

/**
 * Trường Decimal trong sự kiện log trận, theo loại sự kiện. Kiểu suy từ BattleEvent: thêm sự kiện
 * có trường Decimal mà quên khai báo ở đây thì TypeScript báo lỗi.
 */
type EventBigFields = {
  readonly [E in BattleEvent as DecimalKeys<E> extends never ? never : E['type']]: DecimalKeys<E>
}

const EVENT_BIG_FIELDS: EventBigFields = {
  damage: 'amount',
  heal: 'amount',
  statusDamage: 'amount',
  selfHit: 'amount',
  fieldDamage: 'amount',
  perished: 'amount',
  selfDamage: 'amount',
  substituteCreated: 'hp',
  substituteDamaged: 'amount',
  expGain: 'amount',
  won: 'money',
  tamerExpGained: 'amount',
  lost: 'moneyLost',
  traitDamage: 'amount',
  revived: 'amount',
  barrierAbsorbed: 'amount',
  maxHpChanged: 'amount',
  flatStat: 'amount'
}

/** Trường Decimal trong sự kiện khi thời gian trôi (GameState.dayEvents), như EVENT_BIG_FIELDS. */
type DayEventBigFields = {
  readonly [E in DayEvent as DecimalKeys<E> extends never ? never : E['type']]: DecimalKeys<E>
}

const DAY_EVENT_BIG_FIELDS: DayEventBigFields = {
  nearingLifespanEnd: 'yearsLeft'
}

/** Trường Decimal trong log kết quả event (GameState.events.log, docs/rules/events.md). */
type EventLogBigFields = {
  readonly [E in EventLogEntry as DecimalKeys<E> extends never ? never : E['type']]: DecimalKeys<E>
}

const EVENT_LOG_BIG_FIELDS: EventLogBigFields = {
  moneyGained: 'amount',
  moneyLost: 'amount',
  beastTideRetreated: 'moneyLost'
}

type Convert = (value: unknown) => unknown
type Raw = Record<string, unknown>

function mapField(object: Raw | null, key: string, convert: Convert): void {
  if (object && key in object) object[key] = convert(object[key])
}

function mapMonster(value: unknown, convert: Convert): void {
  const monster = asObject(value)
  if (!monster) return
  for (const field of MONSTER_BIG_FIELDS) mapField(monster, field, convert)
  for (const field of MONSTER_BIG_STATS) {
    const stats = asObject(monster[field])
    for (const stat of STAT_NAMES) mapField(stats, stat, convert)
  }
  // Exp thuần thục của từng skill.
  for (const entry of Object.values(asObject(monster.skillMastery) ?? {})) {
    mapField(asObject(entry), 'exp', convert)
  }
  // Lượng còn lại của trạng thái theo lượng (Barrier, Inverted).
  if (Array.isArray(monster.statuses)) {
    for (const status of monster.statuses) mapField(asObject(status), 'amount', convert)
  }
}

/** Bản ghi trận: tổng máu đã mất / đã gây / đã được hồi. */
const RECORD_BIG_FIELDS = ['damageTaken', 'damageDealt', 'healingReceived'] as const

const listOrEmpty = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

function mapMonsterList(value: unknown, convert: Convert): void {
  if (Array.isArray(value)) for (const monster of value) mapMonster(monster, convert)
}

function mapBattle(value: unknown, convert: Convert): void {
  const battle = asObject(value)
  if (!battle) return
  mapMonsterList(battle.enemies, convert)
  mapMonsterList(battle.captured, convert)
  const volatiles = asObject(battle.volatiles)
  for (const volatile of Object.values(volatiles ?? {})) {
    const entry = asObject(volatile)
    mapField(entry, 'substituteHp', convert)
    // Bide: sát thương đã tích (còn qua các lượt nên có trong save).
    mapField(asObject(entry?.bide), 'damage', convert)
    const flat = asObject(entry?.flatStats)
    for (const stat of STAT_NAMES) mapField(flat, stat, convert)
  }
  for (const record of Object.values(asObject(battle.records) ?? {})) {
    for (const field of RECORD_BIG_FIELDS) mapField(asObject(record), field, convert)
  }
  mapEvents(battle.log, EVENT_BIG_FIELDS, convert)
}

/** Trường Decimal của từng sự kiện trong một danh sách log, theo bảng trường của loại sự kiện. */
function mapEvents(log: unknown, fields: Readonly<Record<string, string>>, convert: Convert): void {
  if (!Array.isArray(log)) return
  for (const entry of log) {
    const event = asObject(entry)
    const type = String(event?.type)
    // Log thô (JSON) có thể có loại lạ; loại không có trường Decimal thì bỏ qua.
    const field = Object.hasOwn(fields, type) ? fields[type] : undefined
    if (field) mapField(event, field, convert)
  }
}

/**
 * Áp convert lên mọi trường Decimal của một state dạng dữ liệu thô (JSON). SỬA TẠI CHỖ: chỉ gọi
 * trên bản sao vừa parse / vừa clone, không bao giờ trên GameState đang dùng.
 */
export function mapBigFieldsInPlace(rawState: unknown, convert: Convert): void {
  const state = asObject(rawState)
  if (!state) return
  mapField(state, 'money', convert)
  mapField(asObject(state.tamer), 'exp', convert)
  mapField(asObject(state.alchemy), 'exp', convert)
  mapField(asObject(state.smithing), 'exp', convert)
  // Tiền thưởng nhiệm vụ trên bảng và đang nhận (docs/rules/quests.md).
  const quests = asObject(state.quests)
  for (const list of [quests?.board, quests?.active]) {
    if (Array.isArray(list))
      for (const quest of list) mapField(asObject(asObject(quest)?.reward), 'money', convert)
  }
  mapMonsterList(state.party, convert)
  mapMonsterList(state.storage, convert)
  // Gen của hồn phách (docs/rules/soul-relics.md).
  for (const soul of listOrEmpty(asObject(state.inventory)?.souls)) {
    const genes = asObject(asObject(soul)?.genes)
    for (const stat of STAT_NAMES) mapField(genes, stat, convert)
  }
  if (Array.isArray(state.eggs))
    for (const egg of state.eggs) mapMonster(asObject(egg)?.monster, convert)
  mapBattle(state.battle, convert)
  mapEvents(state.dayEvents, DAY_EVENT_BIG_FIELDS, convert)
  mapEvents(asObject(state.events)?.log, EVENT_LOG_BIG_FIELDS, convert)
}
