// Minion trong trận (mục "Minion" ở battle.md): sinh vật bám vào quái, có stack; hiệu ứng là hook
// trait của minion (hệ số = số stack, chạy qua forEachTraitHook). Thêm / bớt stack, tự mất dần
// cuối lượt theo tỉ lệ, minion ngẫu nhiên. Mất khi quái rời sân (trạng thái tạm).

import { forEachTraitHook } from '../registries'
import { pick, rollPercent } from '../shared'
import type { GameData, MinionInstance, Monster } from '../model'
import { Draft, aliveOnField, log, monsterBattleContext } from './draft'
import { emitTraitEvent } from './eventQueue'

/** Hệ số của trait / hào quang lên minion của quái: % tỉ lệ mất cộng thêm, stack tối đa thêm. */
function minionModifiers(
  data: GameData,
  d: Draft,
  monster: Monster,
  minionId: string
): { leaveChancePercent: number; extraMaxStacks: number } {
  const total = { leaveChancePercent: 0, extraMaxStacks: 0 }
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      const modifier = handler.minionModifier?.(params, scale, minionId)
      if (!modifier) return
      total.leaveChancePercent += modifier.leaveChancePercent
      total.extraMaxStacks += modifier.extraMaxStacks
    },
    monsterBattleContext(data, d, monster)
  )
  return total
}

/** Minion ngẫu nhiên (chia đều, trừ minion không ra từ hiệu ứng ngẫu nhiên). */
export function rollRandomMinionId(data: GameData, d: Draft): string | undefined {
  const pool = Object.values(data.minions).filter((minion) => !minion.excludeFromRandom)
  if (pool.length === 0) return undefined
  let chosen: (typeof pool)[number]
  ;[chosen, d.rng] = pick(d.rng, pool)
  return chosen.id
}

/**
 * Thêm `stacks` stack minion cho quái đang trên sân (kẹp ở stack tối đa, kể cả phần trait cộng
 * thêm). Quái không ở trên sân / đã gục thì bỏ qua. Log minionGained, xếp sự kiện minionGained.
 */
export function addMinion(
  data: GameData,
  d: Draft,
  monster: Monster,
  minionId: string,
  stacks: number
): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile) return
  const max =
    data.minions[minionId].maxStacks + minionModifiers(data, d, monster, minionId).extraMaxStacks
  const minions = (volatile.minions ??= [])
  const current = minions.find((minion) => minion.minionId === minionId)
  const before = current?.stacks ?? 0
  const after = Math.min(max, before + stacks)
  if (after <= before) return
  if (current) current.stacks = after
  else minions.push({ minionId, stacks: after })
  log(d, { type: 'minionGained', monsterId: monster.id, minionId, stacks: after })
  emitTraitEvent(d, { type: 'minionGained', subjectId: monster.id })
}

/** Gỡ mọi minion của quái, hoặc chỉ một loại `minionId` (minion tự hiến tế kiểu Brim Fiends). */
export function removeMinions(d: Draft, monster: Monster, minionId?: string): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile?.minions) return
  const kept: MinionInstance[] = []
  for (const minion of volatile.minions) {
    if (minionId !== undefined && minion.minionId !== minionId) {
      kept.push(minion)
      continue
    }
    log(d, { type: 'minionLost', monsterId: monster.id, minionId: minion.minionId, stacks: 0 })
  }
  if (kept.length > 0) volatile.minions = kept
  else delete volatile.minions
}

/** Cuối lượt: mỗi loại minion của quái trên sân tung tỉ lệ bớt một stack. */
export function minionsAtTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      const volatile = d.battle.volatiles[monster.id]
      if (!volatile?.minions) continue
      const kept: MinionInstance[] = []
      for (const minion of volatile.minions) {
        const modifier = minionModifiers(data, d, monster, minion.minionId).leaveChancePercent
        const chance = data.minions[minion.minionId].leaveChance * Math.max(0, 1 + modifier / 100)
        let leaves: boolean
        ;[leaves, d.rng] = rollPercent(d.rng, chance)
        if (!leaves) {
          kept.push(minion)
          continue
        }
        const stacks = minion.stacks - 1
        log(d, { type: 'minionLost', monsterId: monster.id, minionId: minion.minionId, stacks })
        if (stacks > 0) kept.push({ ...minion, stacks })
      }
      if (kept.length > 0) volatile.minions = kept
      else delete volatile.minions
    }
  }
}
