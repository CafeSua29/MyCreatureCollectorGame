// Ô spell của Artifact (Siralim, mục "Trait Artifact Siralim" ở trait-dsl.md): sau khi quái tấn
// công (đòn vật lý gây sát thương bằng lệnh của nó), mỗi ô spell tung tỉ lệ (+ điểm của hào quang
// kiểu Battle Born; luôn kích hoạt nếu có Sapphire Power) để tự dùng spell đó (phản ứng, + số lần
// thêm kiểu Celebrate Decline); trait kiểu Overcome cho thêm lần tung độc lập.

import { isFainted } from '../monster'
import { forEachTraitHook } from '../registries'
import { rollPercent } from '../shared'
import type { GameData, Monster } from '../model'
import { Draft, log, monsterBattleContext, sideOf, slotsOf } from './draft'
import { claimAction } from './traitEffects'
import { executeSkill } from './executeSkill'

interface SlotRules {
  slots: { skillId: string; chance: number }[]
  bonusPoints: number
  extraCasts: number
  extraRolls: number[]
}

/** Ô spell của quái (từ trang bị và bản sao trong trận) và luật cộng thêm từ hook của nó. */
export function spellSlotsOf(data: GameData, d: Draft, monster: Monster): SlotRules {
  const rules: SlotRules = { slots: [], bonusPoints: 0, extraCasts: 0, extraRolls: [] }
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      const slot = handler.spellSlot?.(params, scale)
      if (slot) rules.slots.push(slot)
      rules.bonusPoints += handler.spellSlotChanceBonus?.(params, scale) ?? 0
      rules.extraCasts += handler.spellSlotExtraCasts?.(params) ?? 0
      const extra = handler.extraSpellSlotRollChance?.(params, scale)
      if (extra !== undefined) rules.extraRolls.push(extra)
    },
    monsterBattleContext(data, d, monster)
  )
  rules.slots.push(...(d.battle.volatiles[monster.id]?.gainedSpellSlots ?? []))
  return rules
}

/** `caster` dùng spell `skillId` như hành động phản ứng (giới hạn chống lặp của trait). */
export function castSlotSpell(data: GameData, d: Draft, caster: Monster, skillId: string): void {
  const slot = slotsOf(d.battle, sideOf(d, caster.id)).indexOf(caster.id)
  if (slot < 0 || isFainted(data, caster) || !claimAction(data, d)) return
  log(d, { type: 'spellSlotCast', monsterId: caster.id, skillId })
  const skill = data.skills[skillId]
  executeSkill(data, d, { side: sideOf(d, caster.id), slot, user: caster, skill, reactive: true })
}

/** Dùng mọi spell trong ô spell của `owner` (castSpellSlot: Golden Stout, Ruby Power, I Am Above). */
export function castAllSlots(
  data: GameData,
  d: Draft,
  { owner, caster }: { owner: Monster; caster: Monster }
): void {
  const rules = spellSlotsOf(data, d, owner)
  for (const { skillId } of rules.slots) {
    for (let i = 0; i <= rules.extraCasts; i++) castSlotSpell(data, d, caster, skillId)
  }
}

/** Sau khi quái tấn công: mỗi ô spell tung kích hoạt, rồi các lần tung thêm độc lập. */
export function activateSpellSlotsAfterAttack(data: GameData, d: Draft, user: Monster): void {
  const rules = spellSlotsOf(data, d, user)
  if (rules.slots.length === 0) return
  const guaranteed = d.battle.volatiles[user.id]?.spellSlotGuaranteed === true
  const fire = (skillId: string): void => {
    for (let i = 0; i <= rules.extraCasts; i++) castSlotSpell(data, d, user, skillId)
  }
  for (const { skillId, chance } of rules.slots) {
    let hit: boolean
    ;[hit, d.rng] = rollPercent(d.rng, guaranteed ? 100 : chance + rules.bonusPoints)
    if (hit) fire(skillId)
    for (const extra of rules.extraRolls) {
      ;[hit, d.rng] = rollPercent(d.rng, extra)
      if (hit) fire(skillId)
    }
  }
}
