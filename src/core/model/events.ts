// Hệ thống event (docs/rules/events.md): event (src/data/events.json; tên ở i18n), hiệu ứng toàn
// cục (src/data/eventModifiers.json), state event trong GameState, trận event / thú triều trong
// BattleState, config.

import type { Decimal } from '../shared'
import type { DropEntry, EffectDef, EquipmentRarity, NormalRarity } from './content'
import type { ShopEntry } from './state'
import type { ItemReward } from './trainers'
import type { GatheringMethod } from './gathering'
import type { DayPhase, MoonPhase, Season } from './time'

/**
 * Nhóm event: `explore` gặp ở tầng (startWildBattle, explore), `town` khi vào thị trấn, `chain` chỉ
 * xuất hiện là bước của chuỗi event.
 */
export const EVENT_GROUPS = ['explore', 'town', 'chain'] as const

export type EventGroup = (typeof EVENT_GROUPS)[number]

/**
 * Loại kết quả event (registry EVENT_RESULTS ở registries/eventResults.ts cho kiểm tra dữ liệu,
 * EVENT_RESULT_APPLIERS ở events/eventResults.ts cho việc áp).
 */
export const EVENT_RESULT_TYPES = [
  'giveItems',
  'giveMoney',
  'loseMoneyPercent',
  'giveEquipment',
  'giveEgg',
  'giveMonster',
  'healParty',
  'applyStatus',
  'addModifier',
  'openTempShop',
  'startChain',
  'advanceChain',
  'startBattle'
] as const

export type EventResultType = (typeof EVENT_RESULT_TYPES)[number]

export interface EventResultDef {
  type: EventResultType
  params: Record<string, unknown>
}

/** Một kết quả của lựa chọn: trọng số khi tung, các kết quả áp theo thứ tự. */
export interface EventOutcomeDef {
  weight: number
  results: EventResultDef[]
}

export interface EventOptionDef {
  /** Id lựa chọn trong event (UI dịch theo id, ví dụ "open", "leave"). */
  id: string
  /** Vật phẩm tiêu khi chọn (thiếu thì không chọn được). */
  costItems?: ItemReward[]
  outcomes: EventOutcomeDef[]
}

export interface EventDef {
  id: string
  group: EventGroup
  /** Trọng số khi tung event trong nhóm (chain: không dùng, ghi 0). */
  weight: number
  /** Tầng tối thiểu (tầng đang đứng; event thị trấn: tầng cao nhất). */
  minFloor: number
  /** Chỉ ở các map này (event thị trấn: map của tầng cao nhất); bỏ trống = mọi map. */
  biomeIds?: string[]
  /** Chỉ vào các thời khắc / mùa / tuần trăng này (docs/rules/calendar.md); bỏ trống = mọi lúc. */
  dayPhases?: DayPhase[]
  seasons?: Season[]
  moonPhases?: MoonPhase[]
  options: EventOptionDef[]
}

/** Loại hiệu ứng của modifier (registry EVENT_MODIFIER_EFFECTS ở registries/eventModifiers.ts). */
export const EVENT_MODIFIER_EFFECT_TYPES = [
  'bossChancePercent',
  'shinyChancePercent',
  'moneyPercent',
  'dropRatePercent',
  'shopPricePercent',
  'eventChancePercent',
  'fixedField'
] as const

export type EventModifierEffectType = (typeof EVENT_MODIFIER_EFFECT_TYPES)[number]

/**
 * Thời hạn của modifier: số trận trên tầng (thắng, thua, chạy đều tính), hoặc tới khi rời thị
 * trấn.
 */
export type EventModifierDuration = { kind: 'battles'; count: number } | { kind: 'town' }

export interface EventModifierDef {
  id: string
  effects: EffectDef[]
  duration: EventModifierDuration
}

/** Event đang chờ chọn; floor null = ở thị trấn; chainId: event là bước của chuỗi đó. */
export interface PendingEvent {
  eventId: string
  floor: number | null
  chainId: string | null
}

/** Modifier đang có; battlesLeft null = tới khi rời thị trấn. */
export interface ActiveModifier {
  modifierId: string
  battlesLeft: number | null
}

/**
 * Chuỗi event đang chạy: bước kế tiếp `eventId` xuất hiện sau `battlesLeft` trận thắng ở tầng ≥
 * `floor` (tầng lúc mở chuỗi).
 */
export interface ActiveChain {
  chainId: string
  eventId: string
  battlesLeft: number
  floor: number
}

/** Một món của cửa hàng tạm; remaining null = không giới hạn (item gộp chồng). */
export interface TempShopEntry {
  entry: ShopEntry
  remaining: number | null
}

/**
 * Cửa hàng tạm của event (thương nhân, chợ đen...): giá = giá cửa hàng × priceMultiplier; chỉ mua
 * được khi còn ở chỗ gặp (tầng `floor`, null = thị trấn).
 */
export interface TempShop {
  stock: TempShopEntry[]
  priceMultiplier: number
  floor: number | null
}

/**
 * Trận do event mở (startBattle): kết quả sau trận tra lại theo vị trí của kết quả startBattle
 * trong dữ liệu (onWin / onLoss), áp khi rời trận.
 */
export interface EventBattleRef {
  eventId: string
  optionId: string
  outcomeIndex: number
  resultIndex: number
  chainId: string | null
}

/**
 * Thú triều: đã lên lịch (đến ngày `day`, chưa báo), đang báo trước (đến ngày `day`), hoặc đang diễn
 * ra (đã thắng `cleared` / `waves` đợt; thách đấu thú vương được từ khi cleared ≥ `kingAfter`).
 */
export type BeastTideState =
  | { phase: 'scheduled'; day: number }
  | { phase: 'warned'; day: number }
  | { phase: 'active'; cleared: number; waves: number; kingAfter: number }

export interface EventState {
  pending: PendingEvent | null
  /** Kết quả của lần giải quyết event gần nhất (chọn lựa chọn, sau trận event, rút lui); UI báo. */
  log: EventLogEntry[]
  modifiers: ActiveModifier[]
  chains: ActiveChain[]
  tempShop: TempShop | null
  battle: EventBattleRef | null
  beastTide: BeastTideState | null
  /** Cửa hàng thị trấn đóng tới hết ngày này (sau thú triều thất bại); null = mở. */
  shopClosedUntilDay: number | null
}

export type EventLogEntry =
  | { type: 'eventResolved'; eventId: string; optionId: string }
  | { type: 'itemGained'; itemId: string; count: number }
  | { type: 'itemSpent'; itemId: string; count: number }
  | { type: 'moneyGained'; amount: Decimal }
  | { type: 'moneyLost'; amount: Decimal }
  | { type: 'equipmentGained'; instanceId: string; itemId: string; rarity: EquipmentRarity }
  | { type: 'eggGained'; eggId: string }
  | { type: 'monsterJoined'; monsterId: string; destination: 'party' | 'storage' }
  /** Đội đủ và kho quái đầy: quái muốn đi theo không nhận được (docs/rules/capacity.md). */
  | { type: 'monsterRefused'; speciesId: string }
  /** Túi trang bị đầy: món được tặng bị mất (docs/rules/capacity.md). */
  | { type: 'equipmentLost'; itemId: string; rarity: EquipmentRarity }
  | { type: 'partyHealed' }
  | { type: 'statusApplied'; monsterId: string; statusId: string }
  | { type: 'statusImmune'; monsterId: string; statusId: string }
  | { type: 'modifierAdded'; modifierId: string; battlesLeft: number | null }
  | { type: 'tempShopOpened'; entries: number }
  | { type: 'chainStarted'; chainId: string; eventId: string; battlesLeft: number }
  | { type: 'chainAdvanced'; chainId: string; eventId: string; battlesLeft: number }
  | { type: 'chainEnded'; chainId: string }
  | { type: 'battleStarted' }
  | { type: 'beastTideArrived'; waves: number }
  | { type: 'beastTideRetreated'; moneyLost: Decimal; shopClosedUntilDay: number }

/** Trận đặc biệt (BattleState.special): trận do event mở, một đợt thú triều, hiểm địa, câu cá / khai thác. */
export type SpecialBattle =
  | { kind: 'event'; eventId: string; noFlee: boolean; moneyMultiplier: number }
  /** Đợt thú triều thứ `wave`; `king` = trận thú vương (bắt được, hạ / bắt là hết thú triều). */
  | { kind: 'beastTide'; wave: number; waves: number; king: boolean }
  /** Trận trong hiểm địa (docs/rules/zones.md); `guardian` = boss canh giữ ở bước cuối. */
  | { kind: 'zone'; zoneId: string; guardian: boolean }
  /**
   * Trận câu cá / khai thác trên tầng (docs/rules/gathering.md); `ambush` = bị phục kích (không chạy
   * được ở lượt đầu).
   */
  | { kind: 'gathering'; method: GatheringMethod; ambush: boolean }

export type SpecialBattleKind = SpecialBattle['kind']

/** Loại pool của cửa hàng tạm (registry TEMP_SHOP_POOLS ở registries/eventResults.ts). */
export const TEMP_SHOP_POOLS = ['regular', 'blackMarket', 'crystal'] as const

export type TempShopPool = (typeof TEMP_SHOP_POOLS)[number]

/** Một món vật phẩm của chợ đen: trọng số, số lượng bán đều trong [min, max]. */
export interface BlackMarketItem {
  itemId: string
  weight: number
  min: number
  max: number
}

export interface EventConfig {
  /** % startWildBattle gặp event khám phá thay cho trận. */
  wildBattleChance: number
  /** % action explore gặp event khám phá (còn lại ra trận quái hoang). */
  exploreChance: number
  /** % vào thị trấn (từ tầng) gặp event thị trấn. */
  townChance: number
  blackMarket: {
    count: { min: number; max: number }
    items: BlackMarketItem[]
    /** Trang bị thường (không unique): trọng số của mỗi lượt, bậc, dòng tung ở minRollPercent % trên. */
    equipment: {
      weight: number
      rarityWeights: Partial<Record<NormalRarity, number>>
      minRollPercent: number
    }
    /** Bí kíp skill power > skillBook.shopMaxPower; reusableChance % là Chân kinh. */
    skillBooks: { weight: number; reusableChance: number }
  }
  beastTide: BeastTideConfig
}

export interface BeastTideConfig {
  /** Thú triều kế tiếp đến sau số ngày đều trong khoảng này (tính từ lúc lên lịch). */
  intervalDays: { min: number; max: number }
  /** Báo trước warningDays ngày. */
  warningDays: number
  waves: { min: number; max: number }
  /** Thách đấu thú vương được sau ⌈số đợt × kingAfterPercent / 100⌉ đợt thắng (tối thiểu 1). */
  kingAfterPercent: number
  /** Thú vương: boss của map, chỉ số × (hệ số của đợt) × kingStrength. */
  kingStrength: number
  /** Tầng của quái thú triều = tầng cao nhất + floorOffset (có thể âm), tối thiểu 1. */
  floorOffset: number
  /** Chỉ số quái của đợt n × (1 + strengthPerWavePercent × (n − 1) / 100). */
  strengthPerWavePercent: number
  /** Thua hoặc rút lui: mất % tiền, cửa hàng đóng closedDays ngày. */
  lossMoneyPercent: number
  closedDays: number
  /** Thưởng mỗi đợt thắng (tung từng món, × hệ số rơi), thêm vào đồ rơi thường của trận. */
  waveDrops: DropEntry[]
  /** Hạ / bắt thú vương: món cố định, một món đều trong pickOneItemIds, sách kỹ năng, trứng hiếm. */
  completion: {
    items: ItemReward[]
    pickOneItemIds: string[]
    skillBooks: number
    egg: boolean
  }
}
