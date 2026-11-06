// Trạng thái (buff / debuff) trong trận (mục "Trạng thái bất thường" và "Buff và debuff" ở
// battle.md): gây trạng thái (miễn nhiễm, kháng, chặn, đổi trạng thái của trait, nhóm loại trừ,
// môi trường chặn, thời hạn và potency theo trait), mất lượt, cuối lượt (sát thương theo % máu,
// tan băng, Bomb nổ, thoát Snared, tự phòng thủ / khiêu khích, giảm thời hạn).

import {
  conflictingStatus,
  getCurrentHp,
  getMaxHp,
  isFainted,
  isStatusImmune,
  rollStatusDuration,
  withStatus
} from '../monster'
import {
  STATUS_HOOKS,
  findStatusHook,
  forEachStatusHook,
  forEachTraitHook,
  hasAbilityFlag,
  isIndirectDamageImmune,
  statusBlockingField,
  type EnforcedStatusRule,
  type StatusConversion,
  type StatusDurationRule,
  type TraitHookHandler
} from '../registries'
import { maxBig, minBig, pick, rollPercent, type Decimal } from '../shared'
import type {
  BattleSide,
  GameData,
  Monster,
  MonsterBattleContext,
  Skill,
  StatusInstance,
  StatusKind
} from '../model'
import {
  Draft,
  aliveOnField,
  battleStats,
  findMonster,
  log,
  monsterBattleContext,
  opponentOf,
  sideOf,
  monsterField
} from './draft'
import { emitTraitEvent } from './eventQueue'
import { endCoating } from './coatings'
import { heal, loseHp, removeStatus } from './hpChanges'
import { isBlockedByLockIn } from './multiTurnMoves'
import { extremeStat, statDamage } from './damage'

/** Tùy chọn khi gây trạng thái. */
export interface InflictOptions {
  /** Quái gây ra (thời hạn / potency theo trait của nó, sự kiện statusInflicted). */
  source?: Monster
  /** Số lượt cố định thay cho thời hạn của trạng thái. */
  turns?: number
  /** Lượng của trạng thái theo lượng (Barrier); kẹp theo hook của trạng thái. */
  amount?: Decimal
  /**
   * Số lượt cộng thêm sau mọi luật thời hạn (thế mạnh, docs/rules/move-styles.md); trạng thái không
   * có hạn thì bỏ qua.
   */
  turnsBonus?: number
  /** Bản lan của Voodoo (không lan tiếp). */
  echoed?: true
}

/** Đồng đội còn sống trên sân của `monster` (không gồm nó). */
function partnerOnField(data: GameData, d: Draft, monster: Monster): Monster | undefined {
  return aliveOnField(data, d, sideOf(d, monster.id)).find(
    (entry) => entry.monster.id !== monster.id
  )?.monster
}

/**
 * Voodoo của Temtem (cờ `spreadsDebuffsToPartner` của quái gây ra): debuff gây lên quái phe địch cũng
 * gây lên đồng đội của nó (một lần, không lan tiếp).
 */
function spreadDebuffToPartner(
  data: GameData,
  d: Draft,
  { monster, statusId, options }: { monster: Monster; statusId: string; options: InflictOptions }
): void {
  const { source } = options
  if (options.echoed || !source || data.statuses[statusId].kind !== 'debuff') return
  if (sideOf(d, source.id) === sideOf(d, monster.id)) return
  if (!hasAbilityFlag(data, source, 'spreadsDebuffsToPartner', ctxOf(data, d, source))) return
  const partner = partnerOnField(data, d, monster)
  if (partner) inflictStatus(data, d, partner, statusId, { ...options, echoed: true })
}

const ctxOf = (data: GameData, d: Draft, monster: Monster): MonsterBattleContext | undefined =>
  monsterBattleContext(data, d, monster)

/** Tổng % một pha số trên mọi hook có tác dụng lên quái. */
function sumHooks(
  data: GameData,
  d: Draft,
  monster: Monster,
  read: (handler: TraitHookHandler, params: unknown, scale: number) => number | undefined
): number {
  let total = 0
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      total += read(handler, params, scale) ?? 0
    },
    ctxOf(data, d, monster)
  )
  return total
}

/** Trạng thái `statusId` bị chặn gây mới hay không (không ghi log, không tốn RNG). */
function blockedReason(
  data: GameData,
  d: Draft,
  monster: Monster,
  statusId: string,
  source?: Monster
): 'immune' | 'group' | 'field' | 'blocked' | null {
  const kind = data.statuses[statusId].kind
  const ctx = ctxOf(data, d, monster)
  const ignoreElement =
    source !== undefined &&
    source.id !== monster.id &&
    hasAbilityFlag(data, source, 'ignoresElementStatusImmunity', ctxOf(data, d, source))
  if (isStatusImmune(data, monster, statusId, ctx, { ignoreElement })) return 'immune'
  const view = { data, self: monster, selfCtx: ctx }
  let blocked = false
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      if (handler.blocksStatusGain?.(params, kind, view)) blocked = true
    },
    ctx
  )
  if (blocked || isBlockedByLockIn(data, d, statusId)) return 'blocked'
  if (
    !data.statuses[statusId].overwritesGroup &&
    conflictingStatus(data, monster, statusId) !== null
  ) {
    return 'group'
  }
  const side = sideOf(d, monster.id)
  return statusBlockingField(data, monsterField(data, d, monster), { monster, side }, statusId) ===
    null
    ? null
    : 'field'
}

/** Trạng thái ngẫu nhiên của một loại (chia đều trên mọi trạng thái loại đó). */
export function rollRandomStatusId(data: GameData, d: Draft, kind: StatusKind): string | undefined {
  const pool = Object.values(data.statuses).filter(
    (status) => status.kind === kind && !status.excludeFromRandom
  )
  if (pool.length === 0) return undefined
  let chosen: (typeof pool)[number]
  ;[chosen, d.rng] = pick(d.rng, pool)
  return chosen.id
}

interface ConversionHit {
  conversion: StatusConversion
  owner: Monster
}

/**
 * Trait đổi trạng thái sắp dính lên `monster` (kiểu Chaos Transformation, Doom and Gloom, Wings of
 * Despair): xét quái nhận trước (onto self), rồi mọi quái trên sân theo quan hệ với nó; trait đầu
 * tiên trúng tỉ lệ thì áp.
 */
function rollConversion(
  data: GameData,
  d: Draft,
  monster: Monster,
  kind: StatusKind
): ConversionHit | null {
  const side = sideOf(d, monster.id)
  const owners = [
    monster,
    ...aliveOnField(data, d, 'player').map((e) => e.monster),
    ...aliveOnField(data, d, 'enemy').map((e) => e.monster)
  ]
  const seen = new Set<string>()
  for (const owner of owners) {
    if (seen.has(owner.id)) continue
    seen.add(owner.id)
    const relation =
      owner.id === monster.id ? 'self' : sideOf(d, owner.id) === side ? 'ally' : 'foe'
    const conversions: StatusConversion[] = []
    forEachTraitHook(
      data,
      owner,
      (handler, params, scale) => {
        const conversion = handler.statusConversion?.(params, scale)
        if (conversion && conversion.from === kind && conversion.onto === relation) {
          conversions.push(conversion)
        }
      },
      ctxOf(data, d, owner)
    )
    for (const conversion of conversions) {
      let hit: boolean
      ;[hit, d.rng] = rollPercent(d.rng, conversion.chance)
      if (hit) return { conversion, owner }
    }
  }
  return null
}

/** Thời hạn sau luật ghi đè của trait (bên gây: inflicted, bên nhận: received). */
function durationAfterRules(
  data: GameData,
  d: Draft,
  {
    monster,
    source,
    statusId,
    turns
  }: { monster: Monster; source?: Monster; statusId: string; turns: number | null }
): number | null {
  let result = turns
  const kind = data.statuses[statusId].kind
  const applies = (rule: StatusDurationRule): boolean =>
    (rule.kind === undefined || rule.kind === kind) &&
    (rule.statusIds === undefined || rule.statusIds.includes(statusId))
  const readRules = (owner: Monster, on: StatusDurationRule['on']): void => {
    forEachTraitHook(
      data,
      owner,
      (handler, params) => {
        const rule = handler.statusDurationRule?.(params)
        if (rule && rule.on === on && applies(rule)) result = rule.turns
      },
      ctxOf(data, d, owner)
    )
  }
  if (source) readRules(source, 'inflicted')
  readRules(monster, 'received')
  if (result === null) return result
  let bonus = 0
  const addBonus = (owner: Monster, on: 'inflicted' | 'received'): void => {
    forEachTraitHook(
      data,
      owner,
      (handler, params) => {
        bonus += handler.statusDurationBonusTurns?.(params, statusId, kind, on) ?? 0
      },
      ctxOf(data, d, owner)
    )
  }
  if (source) addBonus(source, 'inflicted')
  addBonus(monster, 'received')
  return Math.max(0, result + bonus)
}

/** Lượng của trạng thái theo lượng: Barrier kẹp theo % chỉ số cao nhất, Inverted theo max HP. */
function statusAmount(
  data: GameData,
  d: Draft,
  monster: Monster,
  statusId: string,
  requested: Decimal | undefined
): Decimal | undefined {
  let amount = requested
  forEachStatusHookOf(data, statusId, (hook, params) => {
    if (hook === 'barrier' && amount) {
      const cap = extremeStat(battleStats(data, d, monster), 'highest')
        .times((params as { capPercent: number }).capPercent)
        .div(100)
      amount = minBig(amount, cap)
    }
    if (hook === 'invert') {
      amount = getMaxHp(data, monster)
        .times((params as { amountPercentOfMaxHp: number }).amountPercentOfMaxHp)
        .div(100)
        .ceil()
    }
  })
  return amount
}

function forEachStatusHookOf(
  data: GameData,
  statusId: string,
  fn: (type: string, params: unknown) => void
): void {
  for (const hook of data.statuses[statusId].hooks) fn(hook.type, hook.params)
}

/**
 * Gây trạng thái lên một quái trong trận (skill, vật phẩm ném, bẫy, trait). Đã gục thì bỏ qua.
 * Thứ tự: trait đổi trạng thái (đổi loại / chuyển sang quái khác), miễn nhiễm, chặn nhận trạng
 * thái, nhóm loại trừ (trạng thái `overwritesGroup` thì thay trạng thái cũ cùng nhóm), môi trường
 * chặn, kháng debuff (tỉ lệ) rồi dính: thời hạn (dữ liệu / tùy chọn / luật trait), potency (trait
 * của bên gây), lượng. Dính lại thì lấy thời hạn dài hơn.
 */
/**
 * Quái vừa biến hình / hợp thể / đổi dạng: mỗi trạng thái `damageOnTransform` (Glass Bonds) làm nó
 * mất % max HP, ít nhất 1 (docs/rules/element-reactions.md).
 */
export function punishTransform(data: GameData, d: Draft, monster: Monster): void {
  for (const { statusId } of [...monster.statuses]) {
    const percent = data.statuses[statusId]?.damageOnTransform
    if (!percent || isFainted(data, monster)) continue
    const amount = maxBig(1, getMaxHp(data, monster).times(percent).div(100).floor())
    loseHp(data, d, monster, amount, (dealt) => ({
      type: 'statusDamage',
      monsterId: monster.id,
      statusId,
      amount: dealt
    }))
  }
}

export function inflictStatus(
  data: GameData,
  d: Draft,
  monster: Monster,
  statusId: string,
  options: InflictOptions = {}
): void {
  if (isFainted(data, monster)) return
  const kind = data.statuses[statusId].kind
  const conversion = rollConversion(data, d, monster, kind)
  if (conversion) {
    const redirected = convertTarget(data, d, monster, conversion, options)
    if (conversion.conversion.redirect !== undefined) {
      if (redirected) inflictStatus(data, d, redirected, statusId, { ...options, source: monster })
      return
    }
    const replacement =
      conversion.conversion.to && rollRandomStatusId(data, d, conversion.conversion.to)
    if (replacement && replacement !== statusId) {
      inflictStatus(data, d, monster, replacement, options)
      return
    }
  }
  const reason = blockedReason(data, d, monster, statusId, options.source)
  if (reason !== null) {
    logBlocked(data, d, monster, statusId, reason)
    return
  }
  if (kind === 'debuff' && rollsResist(data, d, monster, statusId)) {
    log(d, { type: 'statusImmune', monsterId: monster.id, statusId })
    return
  }
  applyStatus(data, d, monster, statusId, options)
}

/** Quái nhận trạng thái thay theo trait đổi trạng thái (steal: chủ trait, reflect: địch ngẫu nhiên). */
function convertTarget(
  data: GameData,
  d: Draft,
  monster: Monster,
  { conversion, owner }: ConversionHit,
  options: InflictOptions
): Monster | undefined {
  if (conversion.redirect === 'steal') return owner.id === monster.id ? undefined : owner
  if (conversion.redirect !== 'reflect') return undefined
  if (options.source && options.source.id !== monster.id) return options.source
  const foes = aliveOnField(data, d, opponentOf(sideOf(d, monster.id)))
  if (foes.length === 0) return undefined
  let chosen: (typeof foes)[number]
  ;[chosen, d.rng] = pick(d.rng, foes)
  return chosen.monster
}

function logBlocked(
  data: GameData,
  d: Draft,
  monster: Monster,
  statusId: string,
  reason: 'immune' | 'group' | 'field' | 'blocked'
): void {
  if (reason === 'group') {
    const blockingStatusId = conflictingStatus(data, monster, statusId) ?? statusId
    log(d, { type: 'statusBlockedByStatus', monsterId: monster.id, statusId, blockingStatusId })
    return
  }
  if (reason === 'field') {
    const side = sideOf(d, monster.id)
    const fieldId =
      statusBlockingField(data, monsterField(data, d, monster), { monster, side }, statusId) ?? ''
    log(d, { type: 'statusBlockedByField', monsterId: monster.id, statusId, fieldId })
    return
  }
  log(d, { type: 'statusImmune', monsterId: monster.id, statusId })
}

/** Kháng debuff theo tỉ lệ (trait "resistant"), gộp độc lập; không có tỉ lệ thì không tốn RNG. */
function rollsResist(data: GameData, d: Draft, monster: Monster, statusId: string): boolean {
  const ctx = ctxOf(data, d, monster)
  const view = { data, self: monster, selfCtx: ctx }
  let miss = 1
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      const chance = handler.debuffResistChance?.(params, scale, view, statusId) ?? 0
      miss *= 1 - Math.min(100, chance) / 100
    },
    ctx
  )
  if (miss >= 1) return false
  let resisted: boolean
  ;[resisted, d.rng] = rollPercent(d.rng, (1 - miss) * 100)
  return resisted
}

/** Dính trạng thái đã qua mọi bước chặn: thời hạn, potency, lượng, log, sự kiện. */
function applyStatus(
  data: GameData,
  d: Draft,
  monster: Monster,
  statusId: string,
  options: InflictOptions
): void {
  const def = data.statuses[statusId]
  // Cold của Temtem: dính lần nữa khi đang có thì thành trạng thái khác (Frozen), cùng thời hạn mới.
  if (def.stacksInto && monster.statuses.some((status) => status.statusId === statusId)) {
    removeStatus(d, monster, statusId)
    inflictStatus(data, d, monster, def.stacksInto, options)
    return
  }
  let turns: number | null
  if (options.turns !== undefined) turns = options.turns
  else [turns, d.rng] = rollStatusDuration(data, d.rng, statusId)
  turns = durationAfterRules(data, d, { monster, source: options.source, statusId, turns })
  if (turns !== null && options.turnsBonus) turns += options.turnsBonus
  // Bớt lượt về 0 (Resistant của Temtem: trạng thái 1 lượt không dính).
  if (turns === 0) {
    log(d, { type: 'statusImmune', monsterId: monster.id, statusId })
    return
  }
  if (def.overwritesGroup && def.exclusiveGroup !== undefined) {
    for (const status of [...monster.statuses]) {
      if (
        status.statusId !== statusId &&
        data.statuses[status.statusId].exclusiveGroup === def.exclusiveGroup
      ) {
        removeStatus(d, monster, status.statusId)
      }
    }
  }
  const potency = options.source
    ? 100 +
      sumHooks(data, d, options.source, (h, p, s) => h.inflictedPotencyPercent?.(p, s, statusId))
    : 100
  const amount = statusAmount(data, d, monster, statusId, options.amount)
  // Trạng thái mất khi quái gây ra rời sân (Bind, Mean Look) nhớ quái gây ra.
  const sourceId = def.endsWhenSourceLeaves || def.drainsToSource ? options.source?.id : undefined
  monster.statuses = withStatus(monster.statuses, statusId, turns, { potency, amount, sourceId })
  const current = monster.statuses.find((status) => status.statusId === statusId)
  log(d, {
    type: 'statusApplied',
    monsterId: monster.id,
    statusId,
    turns: current?.turnsLeft ?? turns ?? 0
  })
  const source = options.source
  spreadDebuffToPartner(data, d, { monster, statusId, options })
  emitTraitEvent(d, { type: 'statusGained', subjectId: monster.id, otherId: source?.id, statusId })
  if (source && source.id !== monster.id && def.kind === 'debuff') {
    emitTraitEvent(d, {
      type: 'statusInflicted',
      subjectId: source.id,
      otherId: monster.id,
      statusId
    })
  }
}

/** Chữa mọi debuff của quái (skill / trait chữa trạng thái), log từng trạng thái. Buff giữ nguyên. */
export function cureAllStatuses(data: GameData, d: Draft, monster: Monster): void {
  // Lớp phủ hệ gỡ được như trạng thái (gốc: "removable").
  endCoating(d, monster.id)
  for (const status of [...monster.statuses]) {
    if (data.statuses[status.statusId].kind !== 'debuff') continue
    monster.statuses = monster.statuses.filter((s) => s.statusId !== status.statusId)
    log(d, { type: 'statusCured', monsterId: monster.id, statusId: status.statusId })
    emitTraitEvent(d, { type: 'statusEnded', subjectId: monster.id, statusId: status.statusId })
  }
}

/**
 * Quái dính mới được trạng thái này không: chưa gục, chưa có trạng thái đó, không miễn nhiễm,
 * không bị chặn, nhóm loại trừ hay môi trường chặn. Dùng trước khi tung tỉ lệ để không tốn RNG và
 * không ghi log thừa.
 */
export function canInflictStatus(
  data: GameData,
  d: Draft,
  monster: Monster,
  statusId: string
): boolean {
  if (isFainted(data, monster)) return false
  if (monster.statuses.some((status) => status.statusId === statusId)) return false
  return blockedReason(data, d, monster, statusId) === null
}

/** Trait cho quái vẫn hành động dù đang có trạng thái làm mất lượt (Frost Affinity, Sleepwalking). */
function actsThrough(data: GameData, d: Draft, monster: Monster, statusId: string): boolean {
  let result = false
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      if (handler.actsThroughStatus?.(params, statusId)) result = true
    },
    ctxOf(data, d, monster)
  )
  return result
}

/** Các quái còn sống trên sân thuộc phạm vi luật "luôn có trạng thái", tính từ phe quái mang trait. */
function enforcedTargets(
  data: GameData,
  d: Draft,
  holder: Monster,
  scope: EnforcedStatusRule['scope']
): Monster[] {
  if (scope === 'self') return [holder]
  const side = sideOf(d, holder.id)
  const sides =
    scope === 'side' ? [side] : scope === 'foes' ? [opponentOf(side)] : [side, opponentOf(side)]
  return sides.flatMap((s) => aliveOnField(data, d, s).map((entry) => entry.monster))
}

/**
 * Đồng bộ trait "luôn có trạng thái" (hook `enforcedStatuses`, Inherit the Earth): quái trong phạm vi
 * luôn có trạng thái đang tới phiên, kể cả vừa hết hạn, bị chữa hay miễn nhiễm. Phiên suy từ số lượt
 * trên sân của quái mang nên không cần lưu thêm state; đổi phiên lúc sang lượt mới để lệnh chọn đầu
 * lượt không bị chặn giữa chừng ("đầu lượt" của Siralim, trait-dsl.md). Quái mang rời sân thì trạng
 * thái hết theo thời hạn của nó.
 */
export function syncEnforcedStatuses(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster: holder } of aliveOnField(data, d, side)) {
      const ctx = ctxOf(data, d, holder)
      const rules: EnforcedStatusRule[] = []
      forEachTraitHook(
        data,
        holder,
        (handler, params) => {
          const rule = handler.enforcedStatusRule?.(params)
          if (rule) rules.push(rule)
        },
        ctx
      )
      for (const rule of rules) {
        const phase = Math.max(0, (ctx?.turnsOnField ?? 1) - 1) % rule.statusIds.length
        const statusId = rule.statusIds[phase]
        for (const target of enforcedTargets(data, d, holder, rule.scope)) {
          for (const other of rule.statusIds) {
            if (other !== statusId) removeStatus(d, target, other)
          }
          if (!target.statuses.some((status) => status.statusId === statusId)) {
            applyStatus(data, d, target, statusId, {})
          }
        }
      }
    }
  }
}

/**
 * Tung mất lượt theo các trạng thái đang có (theo thứ tự trạng thái); trạng thái đầu tiên trúng
 * thì ghi log và các trạng thái sau không tung nữa. Trả về true nếu quái mất lượt.
 */
export function rollSkipTurn(data: GameData, d: Draft, monster: Monster, skill?: Skill): boolean {
  endStatusesBeforeMove(data, d, monster)
  let skippedBy: string | null = null
  forEachStatusHook(data, monster, (handler, params, statusId) => {
    if (skippedBy !== null || !handler.skipTurnChance) return
    // Sleep Talk / Snore dùng được khi đang ngủ.
    if (skill?.usableWhileStatusIds?.includes(statusId)) return
    if (actsThrough(data, d, monster, statusId)) return
    let skipped: boolean
    ;[skipped, d.rng] = rollPercent(d.rng, handler.skipTurnChance(params))
    if (skipped) skippedBy = statusId
  })
  if (skippedBy === null) return false
  log(d, { type: 'statusSkipTurn', monsterId: monster.id, statusId: skippedBy })
  return true
}

/**
 * Trạng thái tự hết lúc tới lượt, trước khi xét mất lượt (đông lạnh tan 20% rồi hành động luôn như
 * Pokémon). Không có hook thì không tốn RNG.
 */
function endStatusesBeforeMove(data: GameData, d: Draft, monster: Monster): void {
  for (const status of [...monster.statuses]) {
    for (const hook of data.statuses[status.statusId].hooks) {
      const chance = STATUS_HOOKS[hook.type].endBeforeMoveChance?.(hook.params)
      if (chance === undefined) continue
      let ends: boolean
      ;[ends, d.rng] = rollPercent(d.rng, chance)
      if (ends) {
        removeStatus(d, monster, status.statusId)
        break
      }
    }
  }
}

/** Skill tự chữa trạng thái của quái dùng trước khi dùng (Flame Wheel, Scald rã đông như Pokémon). */
export function cureUserBeforeSkill(d: Draft, user: Monster, skill: Skill): void {
  for (const statusId of skill.curesUserStatuses ?? []) removeStatus(d, user, statusId)
}

/**
 * Lú lẫn kiểu Pokémon (hook `selfHit`): theo tỉ lệ, quái tự đánh mình bằng đòn `power` (công / thủ
 * physical của chính nó trong trận, không hệ, không chí mạng) thay vì dùng skill. Trả về true nếu tự
 * đánh (mất lượt). Không có hook thì không tốn RNG.
 */
export function rollSelfHit(data: GameData, d: Draft, monster: Monster): boolean {
  const hook = findStatusHook(data, monster, (handler, params) => handler.selfHit?.(params))
  if (!hook) return false
  let hit: boolean
  ;[hit, d.rng] = rollPercent(d.rng, hook.value.chance)
  if (!hit) return false
  const stats = battleStats(data, d, monster)
  const amount = maxBig(
    1,
    statDamage(data, {
      attackStat: stats.attack,
      defense: stats.defense,
      power: hook.value.power
    }).floor()
  )
  loseHp(data, d, monster, amount, (dealt) => ({
    type: 'selfHit',
    monsterId: monster.id,
    statusId: hook.statusId,
    amount: dealt
  }))
  return true
}

/** % hồi máu thay sát thương của trạng thái (trait kiểu In Flames); 0 = không. */
function statusHealPercent(data: GameData, d: Draft, monster: Monster, statusId: string): number {
  let best = 0
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      best = Math.max(best, handler.statusHealPercent?.(params, statusId) ?? 0)
    },
    ctxOf(data, d, monster)
  )
  return best
}

/** Lượng sát thương một lần của trạng thái trên quái (% máu × hệ số boss × trait bên nhận). */
export function statusTickAmount(
  data: GameData,
  d: Draft,
  monster: Monster,
  { statusId, percent, basis }: { statusId: string; percent: number; basis: 'max' | 'current' },
  factor: number
): Decimal {
  const modifier = sumHooks(data, d, monster, (h, p, s) => h.statusDamagePercent?.(p, s, statusId))
  const hp = basis === 'current' ? getCurrentHp(data, monster) : getMaxHp(data, monster)
  return maxBig(
    1,
    hp
      .times(percent)
      .times(factor)
      .times(Math.max(0, 1 + modifier / 100))
      .div(100)
      .ceil()
  )
}

/** Sát thương trạng thái cuối lượt (theo % máu, kể cả potency); trait có thể biến thành hồi máu. */
function applyStatusDamage(data: GameData, d: Draft, monster: Monster, factor: number): void {
  const damages: { statusId: string; percent: number; basis: 'max' | 'current' }[] = []
  forEachStatusHook(data, monster, (handler, params, statusId, ctx) => {
    if (handler.turnEndDamagePercent) {
      damages.push({
        statusId,
        percent: handler.turnEndDamagePercent(params, ctx),
        basis: handler.turnEndDamageBasis?.(params) ?? 'max'
      })
    }
  })
  for (const entry of damages) {
    // Gục rồi hồi sinh (trait) thì đã mất mọi trạng thái: không trừ tiếp.
    if (!monster.statuses.some((status) => status.statusId === entry.statusId)) return
    const amount = statusTickAmount(data, d, monster, entry, factor)
    const healPercent = statusHealPercent(data, d, monster, entry.statusId)
    if (healPercent > 0) {
      heal(data, d, monster, amount.times(healPercent).div(100).ceil())
      continue
    }
    if (isIndirectDamageImmune(data, monster, ctxOf(data, d, monster))) continue
    const sourceId = monster.statuses.find((status) => status.statusId === entry.statusId)?.sourceId
    const dealt = loseHp(
      data,
      d,
      monster,
      amount,
      (lost) => ({
        type: 'statusDamage',
        monsterId: monster.id,
        statusId: entry.statusId,
        amount: lost
      }),
      { kind: 'indirect', statusId: entry.statusId }
    )
    if (data.statuses[entry.statusId].drainsToSource)
      drainToSource(data, d, { monster, sourceId, dealt })
    // Gục thì đã mất mọi trạng thái (loseHp), không gây thêm.
    if (isFainted(data, monster)) return
  }
}

/**
 * Leech Seed: lượng máu vừa mất hồi cho quái gây ra còn sống trên sân; quái mất máu có Liquid Ooze
 * thì quái gây ra mất lượng đó (như Pokémon).
 */
function drainToSource(
  data: GameData,
  d: Draft,
  { monster, sourceId, dealt }: { monster: Monster; sourceId?: string; dealt: Decimal }
): void {
  if (sourceId === undefined || dealt.lte(0)) return
  const onField = [...d.battle.playerSlots, ...d.battle.enemySlots].includes(sourceId)
  const source = onField ? findMonster(d, sourceId) : undefined
  if (!source || isFainted(data, source)) return
  if (hasAbilityFlag(data, monster, 'drainHurts', ctxOf(data, d, monster))) {
    loseHp(data, d, source, dealt, (lost) => ({
      type: 'traitDamage',
      monsterId: source.id,
      amount: lost
    }))
    return
  }
  heal(data, d, source, dealt, monster)
}

/** Bomb nổ cuối lượt: mất % max HP × potency rồi hết trạng thái. */
/**
 * Sát thương "gây ngay N lượt sát thương của trạng thái" (hiệu ứng statusBurst): theo % máu
 * (turnEndDamage), theo lần nổ (Bomb: detonate, một lần mỗi lượt) hoặc theo lượng đã lưu (Mania);
 * trạng thái không gây sát thương thì undefined.
 */
export function statusBurstAmount(
  data: GameData,
  d: Draft,
  monster: Monster,
  status: StatusInstance,
  turns: number
): Decimal | undefined {
  const factor = hazardDamageFactor(data, d, sideOf(d, monster.id))
  const potency = (status.potency ?? 100) / 100
  for (const hook of data.statuses[status.statusId].hooks) {
    const handler = STATUS_HOOKS[hook.type]
    if (handler?.dealsAmountAtTurnEnd?.(hook.params)) {
      if (!status.amount || status.amount.lte(0)) continue
      return maxBig(1, status.amount.times(potency).times(turns).times(factor).ceil())
    }
    const percent =
      hook.type === 'turnEndDamage'
        ? (hook.params as { percent: number }).percent
        : handler?.detonatePercent?.(hook.params)
    if (percent === undefined) continue
    const basis =
      hook.type === 'turnEndDamage'
        ? ((hook.params as { basis?: 'max' | 'current' }).basis ?? 'max')
        : 'max'
    return statusTickAmount(
      data,
      d,
      monster,
      { statusId: status.statusId, percent: percent * potency * turns, basis },
      factor
    )
  }
  return undefined
}

/**
 * Trạng thái gây sát thương cuối lượt bằng lượng đã lưu lúc dính (Mania): lượng × potency × hệ số
 * trận boss, cộng % sát thương trạng thái của trait; không giảm lượng sau mỗi lần.
 */
function applyAmountDamage(data: GameData, d: Draft, monster: Monster, factor: number): void {
  for (const status of [...monster.statuses]) {
    const def = data.statuses[status.statusId]
    const deals = def.hooks.some((h) => STATUS_HOOKS[h.type]?.dealsAmountAtTurnEnd?.(h.params))
    if (!deals || !status.amount || status.amount.lte(0) || isFainted(data, monster)) continue
    if (isIndirectDamageImmune(data, monster, ctxOf(data, d, monster))) continue
    const modifier = sumHooks(data, d, monster, (h, p, s) =>
      h.statusDamagePercent?.(p, s, status.statusId)
    )
    const amount = maxBig(
      1,
      status.amount
        .times(status.potency ?? 100)
        .times(factor)
        .times(Math.max(0, 1 + modifier / 100))
        .div(100)
        .ceil()
    )
    loseHp(
      data,
      d,
      monster,
      amount,
      (dealt) => ({
        type: 'statusDamage',
        monsterId: monster.id,
        statusId: status.statusId,
        amount: dealt
      }),
      { kind: 'indirect', statusId: status.statusId }
    )
  }
}

function detonateStatuses(data: GameData, d: Draft, monster: Monster, factor: number): void {
  for (const status of [...monster.statuses]) {
    const hook = data.statuses[status.statusId].hooks.find((h) => h.type === 'detonate')
    if (!hook || isFainted(data, monster)) continue
    const percent = (hook.params as { percent: number }).percent * ((status.potency ?? 100) / 100)
    removeStatus(d, monster, status.statusId)
    if (isIndirectDamageImmune(data, monster, ctxOf(data, d, monster))) continue
    const amount = statusTickAmount(
      data,
      d,
      monster,
      { statusId: status.statusId, percent, basis: 'max' },
      factor
    )
    loseHp(
      data,
      d,
      monster,
      amount,
      (dealt) => ({
        type: 'statusDamage',
        monsterId: monster.id,
        statusId: status.statusId,
        amount: dealt
      }),
      { kind: 'indirect', statusId: status.statusId }
    )
  }
}

/**
 * Giảm thời hạn mọi trạng thái 1 lượt (về 0 thì hết); trạng thái không theo lượt đếm số lượt đã
 * qua, tung tỉ lệ tan (Frozen), thoát Snared (`attempts` lần tung = số quái trên sân).
 */
function tickStatuses(data: GameData, d: Draft, monster: Monster, attempts: number): void {
  const before = monster.statuses
  const remaining: StatusInstance[] = []
  for (const status of monster.statuses) {
    const endChance = endChanceOf(data, status)
    let ends = false
    if (endChance > 0) [ends, d.rng] = rollPercent(d.rng, endChance)
    const breakChance = breakChanceOf(data, status.statusId)
    for (let i = 0; i < attempts && !ends && breakChance > 0; i++) {
      ;[ends, d.rng] = rollPercent(d.rng, breakChance)
    }
    if (!ends && (status.turnsLeft === null || status.turnsLeft > 1)) {
      const next: StatusInstance = {
        ...status,
        turnsLeft: status.turnsLeft === null ? null : status.turnsLeft - 1
      }
      // Trạng thái thời hạn cố định suy số lượt đã qua từ thời hạn; chỉ trạng thái không theo lượt
      // (hoặc bị kéo dài mãi) mới đếm trên trạng thái.
      if (status.turnsLeft === null || data.statuses[status.statusId].duration === undefined) {
        next.turnsElapsed = (status.turnsElapsed ?? 0) + 1
      }
      remaining.push(next)
      continue
    }
    log(d, { type: 'statusEnded', monsterId: monster.id, statusId: status.statusId })
    emitTraitEvent(d, { type: 'statusEnded', subjectId: monster.id, statusId: status.statusId })
  }
  monster.statuses = remaining
  for (const ended of endedThisTick(before, remaining)) {
    // Yawn: hết hạn thì dính trạng thái kế tiếp (ngủ).
    const next = data.statuses[ended.statusId]?.onEndStatusId
    if (next) inflictStatus(data, d, monster, next)
    // Doomed của Temtem: hết đếm ngược thì gục.
    if (data.statuses[ended.statusId]?.faintsOnEnd) {
      loseHp(data, d, monster, getCurrentHp(data, monster), (amount) => ({
        type: 'perished',
        monsterId: monster.id,
        amount
      }))
    }
  }
  dropUnsupportedStatuses(data, d, monster)
}

/** Trạng thái có ở `before` mà không còn ở `after`. */
const endedThisTick = (
  before: readonly StatusInstance[],
  after: readonly StatusInstance[]
): StatusInstance[] =>
  before.filter((status) => !after.some((entry) => entry.statusId === status.statusId))

/** Trạng thái cần một trạng thái khác (Nightmare cần ngủ) mất khi trạng thái đó không còn. */
export function dropUnsupportedStatuses(data: GameData, d: Draft, monster: Monster): void {
  for (const status of [...monster.statuses]) {
    const required = data.statuses[status.statusId]?.requiresStatusId
    if (required && !monster.statuses.some((entry) => entry.statusId === required)) {
      removeStatus(d, monster, status.statusId)
    }
  }
}

const endChanceOf = (data: GameData, status: StatusInstance): number => {
  let chance = 0
  const turnsElapsed = (status.turnsElapsed ?? 0) + 1
  for (const hook of data.statuses[status.statusId].hooks) {
    if (hook.type !== 'thaw') continue
    const { chance: base, doubling } = hook.params as { chance: number; doubling?: true }
    chance = Math.max(chance, doubling ? Math.min(100, base * 2 ** (turnsElapsed - 1)) : base)
  }
  return chance
}

const breakChanceOf = (data: GameData, statusId: string): number => {
  const hook = data.statuses[statusId].hooks.find((h) => h.type === 'stuckAtBottom')
  return hook ? (hook.params as { breakChance: number }).breakChance : 0
}

/** Buff tự phòng thủ / khiêu khích (Defensive / Taunting): bật cho lượt sau. */
function autoGuards(data: GameData, d: Draft, monster: Monster): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile) return
  forEachStatusHook(data, monster, (handler, params) => {
    const command = handler.autoGuard?.(params)
    if (command === 'defend') volatile.defending = d.battle.turn + 1
    if (command === 'provoke') volatile.provoking = d.battle.turn + 1
  })
}

/**
 * Hệ số sát thương trạng thái và môi trường: boss hoang (quái địch của trận boss) nhận ít hơn
 * (config.status.bossDamageMultiplier, dùng chung cho cả hai).
 */
export function hazardDamageFactor(data: GameData, d: Draft, side: BattleSide): number {
  return side === 'enemy' && d.battle.isBoss ? data.config.status.bossDamageMultiplier : 1
}

/**
 * Cuối lượt, với mọi quái còn sống trên sân: sát thương trạng thái, Bomb nổ, tự phòng thủ, rồi
 * giảm thời hạn (thời hạn chỉ giảm khi quái ở trên sân, kể cả lượt vừa bị dính).
 */
export function statusesAtTurnEnd(data: GameData, d: Draft): void {
  const onField = aliveOnField(data, d, 'player').length + aliveOnField(data, d, 'enemy').length
  for (const side of ['player', 'enemy'] as const) {
    const factor = hazardDamageFactor(data, d, side)
    for (const { monster } of aliveOnField(data, d, side)) {
      // Miễn sát thương gián tiếp (kiểu Magic Guard): không mất máu, thời hạn vẫn giảm.
      applyStatusDamage(data, d, monster, factor)
      if (!isFainted(data, monster)) applyAmountDamage(data, d, monster, factor)
      if (!isFainted(data, monster)) detonateStatuses(data, d, monster, factor)
      if (!isFainted(data, monster)) autoGuards(data, d, monster)
      if (!isFainted(data, monster)) tickStatuses(data, d, monster, onField)
    }
  }
}

/** Hết trận: mất mọi trạng thái chỉ có trong trận (`battleOnly`, trạng thái Siralim) của quái ta. */
export function clearBattleOnlyStatuses(data: GameData, monsters: Monster[]): void {
  for (const monster of monsters) {
    monster.statuses = monster.statuses.filter(
      (status) => !data.statuses[status.statusId].battleOnly
    )
  }
}
