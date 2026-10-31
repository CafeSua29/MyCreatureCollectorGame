// Đồ cầm tiêu hao trong trận (mục "Trang bị và đồ cầm" ở equipment.md): hook của đồ cầm tác dụng
// một lần rồi đồ mất khỏi ô của quái (mất hẳn, không về túi). Lúc kích hoạt theo `heldUse` của hook:
// trigger chạy (traitEvents.ts), trụ lại (hitTraits.ts), hệ số sát thương của đòn khác 1 và bị
// đánh trúng khi đang bay (executeSkill.ts), đi trước theo tỉ lệ (actionTraits.ts).

import {
  BERRY_ITEM_TAG,
  forEachTraitHook,
  hasAbilityFlag,
  TRAIT_HOOKS,
  type TraitHookHandler
} from '../registries'
import type { GameData, Monster } from '../model'
import { Draft, aliveOnField, log, monsterBattleContext, recordOf, sideOf } from './draft'
import { runTraitEffects } from './traitEffects'
import { emitTraitEvent } from './eventQueue'

/**
 * Bỏ một đồ cầm `itemId` khỏi ô của quái, log `heldItemConsumed`. Trả về false nếu quái không còn
 * đồ đó (đã tiêu hao trước trong cùng hành động): khi đó hiệu ứng không được chạy nữa.
 */
export function consumeHeldItem(
  data: GameData,
  d: Draft,
  monster: Monster,
  itemId: string
): boolean {
  // Đồ không tiêu hao (Razor Claw...) tác dụng mãi, không mất khỏi ô.
  const item = data.items[itemId]
  if (item?.category === 'held' && item.persistent) {
    return monster.equipment.some((entry) => entry.storage === 'stack' && entry.itemId === itemId)
  }
  const index = monster.equipment.findIndex(
    (entry) => entry.storage === 'stack' && entry.itemId === itemId
  )
  if (index < 0) return false
  monster.equipment = monster.equipment.filter((_, i) => i !== index)
  log(d, { type: 'heldItemConsumed', monsterId: monster.id, itemId })
  // Recycle lắp lại món vừa dùng; Belch cần đã ăn berry trong trận.
  const record = recordOf(d, monster.id)
  record.lastConsumedItemId = itemId
  if (item?.category === 'held' && (item.tags ?? []).includes(BERRY_ITEM_TAG)) {
    record.berriesEaten = (record.berriesEaten ?? 0) + 1
    // Cheek Pouch, Cud Chew phản ứng khi quái ăn berry.
    emitTraitEvent(d, { type: 'berryEaten', subjectId: monster.id })
  }
  passItemFromAlly(data, d, monster)
  return true
}

/**
 * Symbiosis: quái vừa tiêu hao đồ cầm và giờ không cầm gì thì đồng đội trên sân có Symbiosis chuyền
 * đồ cầm (món đầu tiên) của nó sang (như Pokémon).
 */
function passItemFromAlly(data: GameData, d: Draft, monster: Monster): void {
  if (monster.equipment.length > 0) return
  const side = sideOf(d, monster.id)
  for (const { monster: ally } of aliveOnField(data, d, side)) {
    if (ally.id === monster.id) continue
    if (!hasAbilityFlag(data, ally, 'passesItemToAlly', monsterBattleContext(data, d, ally))) {
      continue
    }
    const index = ally.equipment.findIndex((entry) => entry.storage === 'stack')
    const entry = ally.equipment[index]
    if (!entry) continue
    ally.equipment = ally.equipment.filter((_, i) => i !== index)
    monster.equipment = [entry]
    log(d, { type: 'itemsSwapped', monsterId: ally.id, otherId: monster.id })
    return
  }
}

/** Cud Chew: cuối lượt sau lượt ăn berry, quái ăn lại berry đó (hiệu ứng chạy lại, không mất đồ). */
export function cudChewAtTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      const volatile = d.battle.volatiles[monster.id]
      const eatenTurn = volatile?.cudChewTurn
      if (!volatile || eatenTurn === undefined || eatenTurn >= d.battle.turn) continue
      delete volatile.cudChewTurn
      const itemId = recordOf(d, monster.id).lastConsumedItemId
      const item = itemId === undefined ? undefined : data.items[itemId]
      if (item?.category !== 'held') continue
      log(d, { type: 'traitTriggered', monsterId: monster.id, traitId: item.id, source: 'held' })
      for (const hook of item.hooks) {
        const def = TRAIT_HOOKS[hook.type].trigger?.(hook.params)
        if (def) runTraitEffects(data, d, { owner: monster, scale: 1 }, def.effects)
      }
    }
  }
}

/**
 * Tiêu hao các đồ cầm có hook thỏa `test`: mỗi loại món một cái (cầm hai món giống nhau thì món thứ
 * hai còn lại cho lần sau).
 */
export function consumeHeldWhere(
  data: GameData,
  d: Draft,
  monster: Monster,
  test: (handler: TraitHookHandler, params: unknown) => boolean
): void {
  const itemIds = new Set<string>()
  forEachTraitHook(
    data,
    monster,
    (handler, params, _scale, sourceId, source) => {
      if (source.kind === 'held' && source.ownerId === monster.id && test(handler, params)) {
        itemIds.add(sourceId)
      }
    },
    monsterBattleContext(data, d, monster)
  )
  for (const itemId of itemIds) consumeHeldItem(data, d, monster, itemId)
}

/**
 * Quái ăn ngay mọi đồ cầm có nhãn khớp (kiểu Teatime): hiệu ứng của các trigger của món chạy luôn,
 * bỏ qua sự kiện và điều kiện; món không có trigger (berry kháng hệ...) chỉ mất. Magic Room vẫn ăn
 * được (như Pokémon: Teatime không bị Magic Room chặn).
 */
export function eatHeldItems(
  data: GameData,
  d: Draft,
  monster: Monster,
  tags?: readonly string[]
): void {
  for (const entry of [...monster.equipment]) {
    if (entry.storage !== 'stack') continue
    const item = data.items[entry.itemId]
    if (item?.category !== 'held' || item.persistent) continue
    if (tags && !(item.tags ?? []).some((tag) => tags.includes(tag))) continue
    if (!consumeHeldItem(data, d, monster, item.id)) continue
    log(d, { type: 'traitTriggered', monsterId: monster.id, traitId: item.id, source: 'held' })
    for (const hook of item.hooks) {
      const def = TRAIT_HOOKS[hook.type].trigger?.(hook.params)
      if (def) runTraitEffects(data, d, { owner: monster, scale: 1 }, def.effects)
    }
  }
}
