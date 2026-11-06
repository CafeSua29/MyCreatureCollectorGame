// Xử lý hàng đợi sự kiện kích hoạt trait (mục "Ngôn ngữ trait" ở trait-dsl.md): với mỗi sự kiện, tìm
// hook `trigger` khớp (loại sự kiện, quan hệ với quái của sự kiện, trạng thái, điều kiện, tỉ lệ,
// một lần mỗi lượt / trận) trên mọi quái liên quan rồi chạy hiệu ứng (traitEffects.ts). Hiệu ứng
// có thể xếp sự kiện mới (tầng sau); quá maxDepth tầng thì bỏ (chống lặp vô hạn).

import { isFainted } from '../monster'
import {
  checkAllConditions,
  counterValue,
  forEachTraitHook,
  type DslView,
  triggerLogSource,
  type TriggerDef
} from '../registries'
import { rollPercent, type Decimal } from '../shared'
import type { GameData, Monster, NonHpStat, TriggerLogSource } from '../model'
import {
  Draft,
  battleStats,
  log,
  monsterBattleContext,
  recordOf,
  sideOf,
  slotsOf,
  teamOf
} from './draft'
import { consumeHeldItem } from './heldItems'
import { queueOf, type QueuedEvent } from './eventQueue'
import { syncEnforcedStatuses } from './statuses'
import { findMonsterSafe, runTraitEffects } from './traitEffects'

/** Một trait khớp sự kiện, chờ chạy. */
interface Listener {
  owner: Monster
  def: TriggerDef
  scale: number
  sourceId: string
  /** Hiệu ứng đến từ trạng thái / minion (log), bỏ trống = trait. */
  sourceKind?: TriggerLogSource
}

/** Lần kích hoạt "một lần mỗi lượt" đã dùng (gắn với bản nháp như hàng đợi sự kiện). */
const usedThisTurn = new WeakMap<object, Set<string>>()

function turnKeySet(d: Draft): Set<string> {
  let set = usedThisTurn.get(d)
  if (!set) {
    set = new Set()
    usedThisTurn.set(d, set)
  }
  return set
}

/** Quan hệ của `subject` với chủ trait có khớp phạm vi của trigger không. */
function inScope(d: Draft, def: TriggerDef, owner: Monster, subject: Monster | undefined): boolean {
  if (!subject) return def.scope === 'any'
  const sameSide = sideOf(d, owner.id) === sideOf(d, subject.id)
  switch (def.scope) {
    case 'self':
      return subject.id === owner.id
    case 'allies':
      return sameSide && subject.id !== owner.id
    case 'side':
      return sameSide
    case 'foes':
      return !sameSide
    case 'any':
      return true
  }
}

/** Trigger có cần chủ trait đã gục không (hiệu ứng khi chết / "khi đang chết"). */
const firesWhileFainted = (def: TriggerDef): boolean =>
  (def.on === 'faint' && def.scope === 'self') ||
  (def.when ?? []).some((condition) => condition.if === 'selfDead')

/**
 * Quái có thể phản ứng: quái đang ở ô sân (kể cả vừa gục còn trong ô) và quái đã gục của cả hai
 * phe (chỉ với trigger chạy khi gục).
 */
function candidateOwners(data: GameData, d: Draft): Monster[] {
  const onField = (['player', 'enemy'] as const).flatMap((side) =>
    slotsOf(d.battle, side).flatMap((id) => (id === null ? [] : [findMonsterSafe(d, id)]))
  )
  const fainted = [...teamOf(data, d, 'player'), ...teamOf(data, d, 'enemy')].filter((m) =>
    isFainted(data, m)
  )
  const result: Monster[] = []
  for (const monster of [...onField, ...fainted]) {
    if (monster && !result.some((m) => m.id === monster.id)) result.push(monster)
  }
  return result
}

/** Các trigger khớp sự kiện, theo thứ tự quái rồi hook. */
function listeners(data: GameData, d: Draft, event: QueuedEvent): Listener[] {
  const subject = findMonsterSafe(d, event.subjectId)
  const result: Listener[] = []
  for (const owner of candidateOwners(data, d)) {
    const ownerFainted = isFainted(data, owner)
    forEachTraitHook(
      data,
      owner,
      (handler, params, scale, sourceId, source) => {
        const def = handler.trigger?.(params)
        if (!def || def.on !== event.type) return
        if (ownerFainted && !firesWhileFainted(def)) return
        if (!inScope(d, def, owner, subject)) return
        if (
          def.statusIds &&
          (event.statusId === undefined || !def.statusIds.includes(event.statusId))
        )
          return
        if (
          def.statusKind &&
          (event.statusId === undefined || data.statuses[event.statusId].kind !== def.statusKind)
        ) {
          return
        }
        const sourceKind = triggerLogSource(source.kind)
        result.push({ owner, def, scale, sourceId, sourceKind })
      },
      monsterBattleContext(data, d, owner)
    )
  }
  return result
}

/** Góc nhìn điều kiện của một trigger. */
function triggerView(data: GameData, d: Draft, owner: Monster, event: QueuedEvent): DslView {
  const subject = findMonsterSafe(d, event.subjectId)
  const other = findMonsterSafe(d, event.otherId)
  return {
    data,
    self: owner,
    selfCtx: monsterBattleContext(data, d, owner),
    subject,
    subjectCtx: subject && monsterBattleContext(data, d, subject),
    other,
    otherCtx: other && monsterBattleContext(data, d, other),
    target: other,
    targetCtx: other && monsterBattleContext(data, d, other),
    skill: event.skillId ? data.skills[event.skillId] : undefined,
    amount: event.amount,
    critical: event.critical,
    effectiveness: event.effectiveness,
    reactive: event.reactive
  }
}

/** Kiểm tra giới hạn một lần mỗi lượt / trận của trigger; dùng được thì đánh dấu. */
function claimUse(d: Draft, listener: Listener): boolean {
  const { def, owner, sourceId } = listener
  if (def.oncePerBattle) {
    const record = recordOf(d, owner.id)
    if (record.usedTriggers.includes(sourceId)) return false
    record.usedTriggers.push(sourceId)
  }
  if (def.oncePerTurn) {
    const key = `${d.battle.turn}|${owner.id}|${sourceId}`
    const used = turnKeySet(d)
    if (used.has(key)) return false
    used.add(key)
  }
  return true
}

/** Chạy một trigger đã khớp: điều kiện, tỉ lệ, hiệu ứng, rồi lặp lại theo tỉ lệ (nếu có). */
function fire(data: GameData, d: Draft, listener: Listener, event: QueuedEvent): void {
  const { owner, def, scale, sourceId } = listener
  const view = triggerView(data, d, owner, event)
  const readStat = (monster: Monster, stat: NonHpStat): Decimal =>
    battleStats(data, d, monster)[stat]
  if (!checkAllConditions(view, def.when, readStat)) return
  if (def.chance !== undefined) {
    const per = def.chancePer ? Math.max(0, counterValue(view, def.chancePer)) : 1
    let hit: boolean
    ;[hit, d.rng] = rollPercent(d.rng, Math.min(100, def.chance * scale * per))
    if (!hit) return
  }
  if (!claimUse(d, listener)) return
  // Đồ cầm: kích hoạt thì mất; đã mất trước đó (trigger khác của cùng món) thì không chạy.
  if (listener.sourceKind === 'held' && !consumeHeldItem(data, d, owner, sourceId)) return
  const run = {
    owner,
    scale,
    subject: view.subject,
    other: view.other,
    amount: event.amount,
    skillId: event.skillId,
    view
  }
  const { maxRepeats } = data.config.battle.traitChain
  let repeatChance = def.repeatChance ?? 0
  for (let i = 0; i <= maxRepeats; i++) {
    log(d, {
      type: 'traitTriggered',
      monsterId: owner.id,
      traitId: sourceId,
      ...(listener.sourceKind ? { source: listener.sourceKind } : {})
    })
    runTraitEffects(data, d, run, def.effects)
    if (repeatChance <= 0) return
    let again: boolean
    ;[again, d.rng] = rollPercent(d.rng, repeatChance)
    if (!again) return
    repeatChance -= def.repeatDecay ?? 0
  }
}

/**
 * Xử lý hết hàng đợi sự kiện của bản nháp. Sự kiện tầng quá `maxDepth` bị bỏ. Gọi sau mỗi hành
 * động gốc (lệnh của quái, bước cuối lượt, vào sân); hết hàng đợi thì đặt lại tầng và số hành động
 * phụ cho hành động gốc kế tiếp.
 */
export function flushTraitEvents(data: GameData, d: Draft): void {
  // Mọi bước của trận đều đi qua đây nên là điểm duy nhất giữ trait "luôn có trạng thái".
  syncEnforcedStatuses(data, d)
  const queue = queueOf(d)
  const { maxDepth } = data.config.battle.traitChain
  while (queue.events.length > 0) {
    const event = queue.events.shift()
    if (!event || event.depth > maxDepth) continue
    for (const listener of listeners(data, d, event)) {
      queue.depth = event.depth + 1
      fire(data, d, listener, event)
    }
  }
  queue.depth = 0
  queue.actions = 0
}
