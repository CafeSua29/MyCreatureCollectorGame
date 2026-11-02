// Kiểm tra dữ liệu hệ thống event (docs/rules/events.md): events.json (lựa chọn, kết quả theo loại),
// eventModifiers.json, config.events (tỉ lệ, chợ đen, thú triều). Kiểm tra params của từng loại kết
// quả ở EVENT_RESULT_CHECKS (cùng khóa với EVENT_RESULT_APPLIERS ở events/).

import {
  CRYSTAL_TRAIT_KINDS,
  DAY_PHASES,
  EVENT_GROUPS,
  MOON_PHASES,
  SEASONS,
  EVENT_RESULT_TYPES,
  NORMAL_RARITIES,
  TEMP_SHOP_POOLS,
  type EventDef,
  type EventModifierDef,
  type EventResultType,
  type GameData,
  type TempShopPool
} from '../model'
import { EVENT_MODIFIER_EFFECTS, isEventModifierEffectType } from '../registries'
import { asObject, checkEnumList, checkInteger, checkNumber } from '../shared'
import {
  checkDrops,
  checkIntRange,
  checkItemRewards,
  checkKnownFields,
  checkStackItemId,
  fieldList
} from './checks'

/** Bối cảnh khi kiểm tra một danh sách kết quả. */
interface ResultScope {
  data: GameData
  /** Event chứa kết quả (advanceChain chỉ có ở event của chuỗi). */
  event: EventDef
  /** Được có startBattle (kết quả của lựa chọn; không có trong onWin / onLoss). */
  allowBattle: boolean
}

interface ResultCheck {
  fields: readonly string[]
  check(params: Record<string, unknown>, scope: ResultScope): string[]
}

const BATTLE_KINDS = ['wild', 'boss', 'trainer'] as const
const EGG_SOURCES = ['wild', 'boss'] as const

/** Bảng bậc trang bị thường không rỗng. */
function checkRarityWeights(value: unknown, where: string): string[] {
  const weights = asObject(value)
  if (!weights || Object.keys(weights).length === 0) return [`${where} phải là object không rỗng`]
  return Object.entries(weights).flatMap(([rarity, weight]) => [
    ...((NORMAL_RARITIES as readonly string[]).includes(rarity)
      ? []
      : [`${where}: bậc lạ "${rarity}"`]),
    ...checkNumber(weight, `${where}.${rarity}`, 0)
  ])
}

/** Danh sách món { itemId, weight, min, max } (item gộp chồng, số lượng nguyên ≥ 1). */
function checkWeightedItems(data: GameData, value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${where} phải là danh sách không rỗng`]
  const issues: string[] = []
  value.forEach((entry: unknown, i) => {
    const item = asObject(entry) ?? {}
    const at = `${where}[${i}]`
    checkKnownFields(item, ['itemId', 'weight', 'min', 'max'], at, 'món', issues)
    issues.push(...checkStackItemId(data, String(item.itemId), at))
    issues.push(...checkNumber(item.weight, `${at}.weight`, 0))
    checkIntRange({ min: item.min, max: item.max }, at, 1, issues)
  })
  return issues
}

/** Id event của một bước chuỗi (nhóm chain). */
function checkChainEventId(data: GameData, value: unknown): string[] {
  const event =
    typeof value === 'string' && Object.hasOwn(data.events, value) ? data.events[value] : undefined
  if (!event) return [`eventId: event không tồn tại "${String(value)}"`]
  return event.group === 'chain' ? [] : [`eventId: "${String(value)}" không thuộc nhóm chain`]
}

const TEMP_SHOP_POOL_CHECKS: Readonly<Record<TempShopPool, ResultCheck>> = {
  // Hàng như cửa hàng thị trấn, lấy count món đầu.
  regular: {
    fields: ['count'],
    check(params) {
      const issues: string[] = []
      checkIntRange(params.count, 'count', 1, issues)
      return issues
    }
  },
  // Hàng chợ đen theo config.events.blackMarket.
  blackMarket: { fields: [], check: () => [] },
  // Tinh thể của một loại trait, cấp `level`, count món khác nhau.
  crystal: {
    fields: ['traitKind', 'level', 'count'],
    check(params) {
      const issues = [
        ...checkInteger(params.level, 'level', 1),
        ...checkInteger(params.count, 'count', 1)
      ]
      if (!(CRYSTAL_TRAIT_KINDS as readonly unknown[]).includes(params.traitKind)) {
        issues.push(`traitKind phải là một trong ${CRYSTAL_TRAIT_KINDS.join(', ')}`)
      }
      return issues
    }
  }
}

const RESULT_FIELDS = fieldList<{ type: true; params: true }>({ type: true, params: true })

const EVENT_RESULT_CHECKS: Readonly<Record<EventResultType, ResultCheck>> = {
  giveItems: {
    fields: ['items', 'rolls'],
    check: (params, { data }) => [
      ...checkWeightedItems(data, params.items, 'items'),
      ...checkInteger(params.rolls, 'rolls', 1)
    ]
  },
  // Tiền = battles × tiền một quái hoang level cao nhất của tầng.
  giveMoney: {
    fields: ['battles'],
    check(params) {
      const issues = checkNumber(params.battles, 'battles', 0)
      if (params.battles === 0) issues.push('battles phải > 0')
      return issues
    }
  },
  loseMoneyPercent: {
    fields: ['percent'],
    check(params) {
      const issues = checkNumber(params.percent, 'percent', 0, 100)
      if (params.percent === 0) issues.push('percent phải > 0')
      return issues
    }
  },
  giveEquipment: {
    fields: ['count', 'rarityWeights'],
    check: (params) => [
      ...checkInteger(params.count, 'count', 1),
      ...checkRarityWeights(params.rarityWeights, 'rarityWeights')
    ]
  },
  giveEgg: {
    fields: ['source'],
    check: (params) =>
      (EGG_SOURCES as readonly unknown[]).includes(params.source)
        ? []
        : [`source phải là một trong ${EGG_SOURCES.join(', ')}`]
  },
  giveMonster: { fields: [], check: () => [] },
  healParty: { fields: [], check: () => [] },
  applyStatus: {
    fields: ['statusId', 'count'],
    check(params, { data }) {
      const issues = checkInteger(params.count, 'count', 1)
      const id = params.statusId
      const status =
        typeof id === 'string' && Object.hasOwn(data.statuses, id) ? data.statuses[id] : undefined
      if (!status) issues.push(`statusId: trạng thái không tồn tại "${String(id)}"`)
      else if (status.battleOnly) issues.push(`statusId: "${String(id)}" chỉ có trong trận`)
      return issues
    }
  },
  addModifier: {
    fields: ['modifierId'],
    check: (params, { data }) =>
      typeof params.modifierId === 'string' && Object.hasOwn(data.eventModifiers, params.modifierId)
        ? []
        : [`modifierId: modifier không tồn tại "${String(params.modifierId)}"`]
  },
  openTempShop: {
    fields: ['pool', 'priceMultiplier', 'count', 'traitKind', 'level'],
    check(params, scope) {
      const issues = checkNumber(params.priceMultiplier, 'priceMultiplier', 0)
      if (params.priceMultiplier === 0) issues.push('priceMultiplier phải > 0')
      const pool = params.pool
      if (!(TEMP_SHOP_POOLS as readonly unknown[]).includes(pool)) {
        return [...issues, `pool phải là một trong ${TEMP_SHOP_POOLS.join(', ')}`]
      }
      const rule = TEMP_SHOP_POOL_CHECKS[pool as TempShopPool]
      const { pool: _pool, priceMultiplier: _price, ...rest } = params
      checkKnownFields(rest, rule.fields, 'params', `pool ${String(pool)}`, issues)
      return [...issues, ...rule.check(rest, scope)]
    }
  },
  startChain: {
    fields: ['chainId', 'eventId', 'battles'],
    check: (params, { data }) => [
      ...(typeof params.chainId === 'string' && params.chainId !== ''
        ? []
        : ['chainId phải là chuỗi không rỗng']),
      ...checkChainEventId(data, params.eventId),
      // 0 = bước kế tiếp xuất hiện ngay lần gặp kế tiếp trên tầng.
      ...checkInteger(params.battles, 'battles', 0)
    ]
  },
  advanceChain: {
    fields: ['eventId', 'battles'],
    check: (params, { data, event }) => [
      ...(event.group === 'chain' ? [] : ['advanceChain chỉ có ở event nhóm chain']),
      ...checkChainEventId(data, params.eventId),
      // 0 = bước kế tiếp xuất hiện ngay lần gặp kế tiếp trên tầng.
      ...checkInteger(params.battles, 'battles', 0)
    ]
  },
  startBattle: {
    fields: [
      'kind',
      'count',
      'strength',
      'enemyHpPercent',
      'levelOffset',
      'noFlee',
      'moneyMultiplier',
      'onWin',
      'onLoss'
    ],
    check(params, scope) {
      const issues: string[] = []
      if (!scope.allowBattle) issues.push('startBattle không có trong onWin / onLoss')
      if (!(BATTLE_KINDS as readonly unknown[]).includes(params.kind)) {
        issues.push(`kind phải là một trong ${BATTLE_KINDS.join(', ')}`)
      }
      if (params.count !== undefined) issues.push(...checkInteger(params.count, 'count', 1))
      if (params.strength !== undefined) issues.push(...checkNumber(params.strength, 'strength', 1))
      if (params.enemyHpPercent !== undefined) {
        issues.push(...checkNumber(params.enemyHpPercent, 'enemyHpPercent', 1, 100))
      }
      if (params.levelOffset !== undefined) {
        issues.push(...checkInteger(params.levelOffset, 'levelOffset', 0))
      }
      if (typeof params.noFlee !== 'boolean') issues.push('noFlee phải là boolean')
      if (params.moneyMultiplier !== undefined) {
        issues.push(...checkNumber(params.moneyMultiplier, 'moneyMultiplier', 0))
      }
      const after = { ...scope, allowBattle: false }
      for (const key of ['onWin', 'onLoss'] as const) {
        if (params[key] !== undefined) issues.push(...checkResults(params[key], key, after))
      }
      return issues
    }
  }
}

/** Danh sách kết quả: loại có trong registry, params đúng loại, startBattle chỉ ở cuối. */
function checkResults(value: unknown, where: string, scope: ResultScope): string[] {
  if (!Array.isArray(value)) return [`${where} phải là danh sách kết quả`]
  const issues: string[] = []
  value.forEach((entry: unknown, i) => {
    const at = `${where}[${i}]`
    const result = asObject(entry)
    if (!result) {
      issues.push(`${at} phải là { type, params }`)
      return
    }
    checkKnownFields(result, RESULT_FIELDS, at, 'kết quả event', issues)
    if (!(EVENT_RESULT_TYPES as readonly unknown[]).includes(result.type)) {
      issues.push(`${at}.type phải là một trong ${EVENT_RESULT_TYPES.join(', ')}`)
      return
    }
    const type = result.type as EventResultType
    if (type === 'startBattle' && i !== value.length - 1) {
      issues.push(`${at}: startBattle phải là kết quả cuối`)
    }
    const params = asObject(result.params)
    if (!params) {
      issues.push(`${at}.params phải là object`)
      return
    }
    const rule = EVENT_RESULT_CHECKS[type]
    if (type !== 'openTempShop') checkKnownFields(params, rule.fields, `${at}.params`, type, issues)
    for (const issue of rule.check(params, scope)) issues.push(`${at}.params: ${issue}`)
  })
  return issues
}

const EVENT_FIELDS = fieldList<EventDef>({
  id: true,
  group: true,
  weight: true,
  minFloor: true,
  biomeIds: true,
  dayPhases: true,
  seasons: true,
  moonPhases: true,
  options: true
})

/** Trường lịch của event (docs/rules/calendar.md) và giá trị hợp lệ. */
const EVENT_CALENDAR_FIELDS = [
  ['dayPhases', DAY_PHASES],
  ['seasons', SEASONS],
  ['moonPhases', MOON_PHASES]
] as const

function checkOptions(data: GameData, event: EventDef, where: string, issues: string[]): void {
  if (!Array.isArray(event.options) || event.options.length === 0) {
    issues.push(`${where}: options phải là danh sách không rỗng`)
    return
  }
  const seen = new Set<string>()
  event.options.forEach((option, i) => {
    const at = `${where}.options[${i}]`
    checkKnownFields(option, ['id', 'costItems', 'outcomes'], at, 'lựa chọn event', issues)
    if (typeof option.id !== 'string' || option.id === '') issues.push(`${at}: thiếu id`)
    else if (seen.has(option.id)) issues.push(`${at}: id "${option.id}" bị trùng`)
    seen.add(option.id)
    if (option.costItems !== undefined) {
      checkItemRewards(data, option.costItems, `${at}.costItems`, issues)
    }
    if (!Array.isArray(option.outcomes) || option.outcomes.length === 0) {
      issues.push(`${at}: outcomes phải là danh sách không rỗng`)
      return
    }
    let total = 0
    option.outcomes.forEach((outcome, j) => {
      const outcomeAt = `${at}.outcomes[${j}]`
      checkKnownFields(outcome, ['weight', 'results'], outcomeAt, 'kết quả lựa chọn', issues)
      issues.push(...checkNumber(outcome.weight, `${outcomeAt}.weight`, 0))
      if (typeof outcome.weight === 'number') total += outcome.weight
      const scope = { data, event, allowBattle: true }
      issues.push(...checkResults(outcome.results, `${outcomeAt}.results`, scope))
    })
    if (total <= 0) issues.push(`${at}: tổng weight của outcomes phải > 0`)
  })
}

function checkEvent(data: GameData, event: EventDef, issues: string[]): void {
  const where = `Event "${event.id}"`
  checkKnownFields(event, EVENT_FIELDS, where, 'event', issues)
  if (!(EVENT_GROUPS as readonly unknown[]).includes(event.group)) {
    issues.push(`${where}: group phải là một trong ${EVENT_GROUPS.join(', ')}`)
  }
  issues.push(...checkNumber(event.weight, `${where}: weight`, 0))
  issues.push(...checkInteger(event.minFloor, `${where}: minFloor`, 1))
  if (event.biomeIds !== undefined) {
    if (!Array.isArray(event.biomeIds) || event.biomeIds.length === 0) {
      issues.push(`${where}: biomeIds phải là danh sách không rỗng`)
    } else {
      for (const id of event.biomeIds) {
        if (!Object.hasOwn(data.biomes, id)) issues.push(`${where}: map không tồn tại "${id}"`)
      }
    }
  }
  for (const [field, allowed] of EVENT_CALENDAR_FIELDS) {
    if (event[field] === undefined) continue
    for (const issue of checkEnumList(event[field], field, allowed))
      issues.push(`${where}: ${issue}`)
  }
  checkOptions(data, event, where, issues)
}

function checkModifier(data: GameData, modifier: EventModifierDef, issues: string[]): void {
  const where = `Modifier "${modifier.id}"`
  checkKnownFields(modifier, ['id', 'effects', 'duration'], where, 'modifier', issues)
  if (!Array.isArray(modifier.effects) || modifier.effects.length === 0) {
    issues.push(`${where}: effects phải là danh sách không rỗng`)
  } else {
    modifier.effects.forEach((effect, i) => {
      const at = `${where}: effects[${i}]`
      if (!isEventModifierEffectType(String(effect.type))) {
        issues.push(`${at}: loại hiệu ứng lạ "${String(effect.type)}"`)
        return
      }
      const handler = EVENT_MODIFIER_EFFECTS[effect.type as keyof typeof EVENT_MODIFIER_EFFECTS]
      for (const issue of handler.validateParams(effect.params, data))
        issues.push(`${at}: ${issue}`)
    })
  }
  const duration = asObject(modifier.duration)
  if (duration?.kind === 'battles') {
    checkKnownFields(duration, ['kind', 'count'], `${where}: duration`, 'thời hạn', issues)
    issues.push(...checkInteger(duration.count, `${where}: duration.count`, 1))
  } else if (duration?.kind === 'town') {
    checkKnownFields(duration, ['kind'], `${where}: duration`, 'thời hạn', issues)
  } else {
    issues.push(`${where}: duration phải là { kind: "battles", count } hoặc { kind: "town" }`)
  }
}

function checkBlackMarket(data: GameData, value: unknown, issues: string[]): void {
  const at = 'config.events.blackMarket'
  const market = asObject(value)
  if (!market) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(
    market,
    ['count', 'minItemPrice', 'itemWeightPower', 'extraItemIds', 'equipment', 'skillBooks'],
    at,
    'chợ đen',
    issues
  )
  checkIntRange(market.count, `${at}.count`, 1, issues)
  issues.push(...checkNumber(market.minItemPrice, `${at}.minItemPrice`, 0))
  issues.push(...checkNumber(market.itemWeightPower, `${at}.itemWeightPower`))
  if (!Array.isArray(market.extraItemIds)) {
    issues.push(`${at}.extraItemIds phải là danh sách`)
  } else {
    market.extraItemIds.forEach((itemId: unknown, i) => {
      issues.push(
        ...checkStackItemId(data, String(itemId), `${at}.extraItemIds[${i}]`, 'vật phẩm chợ đen')
      )
    })
  }
  const equipment = asObject(market.equipment) ?? {}
  issues.push(...checkNumber(equipment.weight, `${at}.equipment.weight`, 0))
  issues.push(...checkRarityWeights(equipment.rarityWeights, `${at}.equipment.rarityWeights`))
  issues.push(...checkNumber(equipment.minRollPercent, `${at}.equipment.minRollPercent`, 0, 100))
  const books = asObject(market.skillBooks) ?? {}
  issues.push(...checkNumber(books.weight, `${at}.skillBooks.weight`, 0))
  issues.push(...checkNumber(books.reusableChance, `${at}.skillBooks.reusableChance`, 0, 100))
}

function checkBeastTide(data: GameData, value: unknown, issues: string[]): void {
  const at = 'config.events.beastTide'
  const tide = asObject(value)
  if (!tide) {
    issues.push(`${at} phải là object`)
    return
  }
  checkIntRange(tide.intervalDays, `${at}.intervalDays`, 1, issues)
  issues.push(...checkInteger(tide.warningDays, `${at}.warningDays`, 0))
  checkIntRange(tide.waves, `${at}.waves`, 1, issues)
  issues.push(...checkNumber(tide.kingAfterPercent, `${at}.kingAfterPercent`, 0, 100))
  issues.push(...checkNumber(tide.kingStrength, `${at}.kingStrength`, 1))
  issues.push(...checkInteger(tide.floorOffset, `${at}.floorOffset`))
  issues.push(...checkNumber(tide.strengthPerWavePercent, `${at}.strengthPerWavePercent`, 0))
  issues.push(...checkNumber(tide.lossMoneyPercent, `${at}.lossMoneyPercent`, 0, 100))
  issues.push(...checkInteger(tide.closedDays, `${at}.closedDays`, 0))
  if (!Array.isArray(tide.waveDrops)) issues.push(`${at}.waveDrops phải là danh sách`)
  else checkDrops(data, tide.waveDrops, `${at}.waveDrops`, issues)
  const completion = asObject(tide.completion)
  if (!completion) {
    issues.push(`${at}.completion phải là object`)
    return
  }
  checkItemRewards(data, completion.items, `${at}.completion.items`, issues)
  if (!Array.isArray(completion.pickOneItemIds)) {
    issues.push(`${at}.completion.pickOneItemIds phải là danh sách`)
  } else {
    for (const id of completion.pickOneItemIds) {
      issues.push(...checkStackItemId(data, String(id), `${at}.completion.pickOneItemIds`))
    }
  }
  issues.push(...checkInteger(completion.skillBooks, `${at}.completion.skillBooks`, 0))
  if (typeof completion.egg !== 'boolean') issues.push(`${at}.completion.egg phải là boolean`)
}

/** Kiểm tra event, modifier và config.events. */
export function checkEventData(data: GameData, issues: string[]): void {
  for (const event of Object.values(data.events)) checkEvent(data, event, issues)
  for (const modifier of Object.values(data.eventModifiers)) checkModifier(data, modifier, issues)
  const config = asObject(data.config.events)
  if (!config) {
    issues.push('config.events phải là object')
    return
  }
  checkKnownFields(
    config,
    ['wildBattleChance', 'exploreChance', 'townChance', 'blackMarket', 'beastTide'],
    'config.events',
    'config',
    issues
  )
  for (const key of ['wildBattleChance', 'exploreChance', 'townChance'] as const) {
    issues.push(...checkNumber(config[key], `config.events.${key}`, 0, 100))
  }
  checkBlackMarket(data, config.blackMarket, issues)
  checkBeastTide(data, config.beastTide, issues)
}
