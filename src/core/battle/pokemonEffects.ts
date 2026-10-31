// Hiệu ứng ngôn ngữ trait của chiêu trạng thái Pokémon (docs/rules/pokemon-moves.md mục "Chiêu trạng
// thái"): chia máu, chép / tráo / đảo bậc, trung bình / tráo chỉ số, bậc ngẫu nhiên, đổi / tráo / vô
// hiệu ability, khóa skill, Encore, tích trữ, học skill của địch, biến hình Transform, đổi ô, đánh dấu
// Destiny Bond / Grudge / Magic Coat / Snatch. Gộp vào EFFECT_RUNNERS ở traitEffects.ts.

import { abilityTraitId, getCurrentHp, isFainted } from '../monster'
import { assertNever, pick, toBig, type Decimal } from '../shared'
import { STAGE_STATS, type GameData, type Monster, type StageStat } from '../model'
import type { EffectTarget, TraitEffect } from '../registries'
import { Draft, battleStats, changeStage, log, sideOf, slotsOf } from './draft'
import { loseHp, heal } from './hpChanges'
import { addFlatStat, changeIdentity, resolveEffectTargets, type EffectRun } from './traitEffects'

type Effect<T extends TraitEffect['do']> = Extract<TraitEffect, { do: T }>

const targetsOf = (data: GameData, d: Draft, run: EffectRun, to: EffectTarget): Monster[] =>
  resolveEffectTargets(data, d, run, to).filter((monster) => !isFainted(data, monster))

/** Ability hiện tại trong trận (ability bị đổi, không thì theo loài). */
export function currentAbility(d: Draft, data: GameData, monster: Monster): string | null {
  return d.battle.volatiles[monster.id]?.abilityOverride ?? abilityTraitId(data, monster)
}

function setStage(
  data: GameData,
  d: Draft,
  monsterId: string,
  stat: StageStat,
  value: number
): void {
  const current = d.battle.stages[monsterId]?.[stat] ?? 0
  if (current !== value) changeStage(data, d, monsterId, stat, value - current)
}

/** Pain Split: máu hiện tại của hai quái về trung bình. */
function shareHp(data: GameData, d: Draft, run: EffectRun, effect: Effect<'shareHp'>): void {
  for (const other of targetsOf(data, d, run, effect.with)) {
    const pair = [run.owner, other]
    const average = pair
      .reduce((sum, monster) => sum.plus(getCurrentHp(data, monster)), toBig(0))
      .div(2)
      .floor()
    for (const monster of pair) {
      const current = getCurrentHp(data, monster)
      if (current.gt(average)) {
        loseHp(data, d, monster, current.minus(average), (amount) => ({
          type: 'traitDamage',
          monsterId: monster.id,
          amount
        }))
      } else if (current.lt(average)) {
        heal(data, d, monster, average.minus(current), run.owner)
      }
    }
  }
}

function copyStages(data: GameData, d: Draft, run: EffectRun, effect: Effect<'copyStages'>): void {
  const [source] = targetsOf(data, d, run, effect.from)
  if (!source) return
  for (const target of targetsOf(data, d, run, effect.to)) {
    for (const stat of STAGE_STATS) {
      setStage(data, d, target.id, stat, d.battle.stages[source.id]?.[stat] ?? 0)
    }
  }
}

function swapStages(data: GameData, d: Draft, run: EffectRun, effect: Effect<'swapStages'>): void {
  const stats = effect.stats ?? STAGE_STATS
  for (const other of targetsOf(data, d, run, effect.with)) {
    for (const stat of stats) {
      const mine = d.battle.stages[run.owner.id]?.[stat] ?? 0
      const theirs = d.battle.stages[other.id]?.[stat] ?? 0
      setStage(data, d, run.owner.id, stat, theirs)
      setStage(data, d, other.id, stat, mine)
    }
  }
}

function invertStages(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'invertStages'>
): void {
  for (const target of targetsOf(data, d, run, effect.to)) {
    for (const stat of STAGE_STATS) {
      const value = d.battle.stages[target.id]?.[stat] ?? 0
      if (value !== 0) setStage(data, d, target.id, stat, -value)
    }
  }
}

/** Cộng thẳng chỉ số trong trận để chỉ số của quái bằng `value`. */
function setStatTo(
  data: GameData,
  d: Draft,
  monster: Monster,
  stat: Effect<'averageStats'>['stats'][number],
  value: Decimal
): void {
  const current = battleStats(data, d, monster)[stat]
  addFlatStat(data, d, monster, stat, value.minus(current))
}

function averageStats(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'averageStats'>
): void {
  for (const other of targetsOf(data, d, run, effect.with)) {
    for (const stat of effect.stats) {
      const average = battleStats(data, d, run.owner)
        [stat].plus(battleStats(data, d, other)[stat])
        .div(2)
        .floor()
      setStatTo(data, d, run.owner, stat, average)
      setStatTo(data, d, other, stat, average)
    }
  }
}

function swapStats(data: GameData, d: Draft, run: EffectRun, effect: Effect<'swapStats'>): void {
  for (const other of targetsOf(data, d, run, effect.with)) {
    for (const stat of effect.stats) {
      const mine = battleStats(data, d, run.owner)[stat]
      const theirs = battleStats(data, d, other)[stat]
      setStatTo(data, d, run.owner, stat, theirs)
      setStatTo(data, d, other, stat, mine)
    }
  }
}

function swapOwnStats(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'swapOwnStats'>
): void {
  const [a, b] = effect.stats
  for (const target of targetsOf(data, d, run, effect.to)) {
    const stats = battleStats(data, d, target)
    const first = stats[a]
    const second = stats[b]
    setStatTo(data, d, target, a, second)
    setStatTo(data, d, target, b, first)
  }
}

/** Acupressure: +delta bậc một chỉ số ngẫu nhiên chưa tối đa. */
function randomStage(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'randomStage'>
): void {
  const { max } = data.config.battleStage
  for (const target of targetsOf(data, d, run, effect.to)) {
    const open = effect.stats.filter((stat) => (d.battle.stages[target.id]?.[stat] ?? 0) < max)
    if (open.length === 0) continue
    let stat: StageStat
    ;[stat, d.rng] = pick(d.rng, open)
    changeStage(data, d, target.id, stat, effect.delta)
  }
}

function setAbilityOf(d: Draft, monster: Monster, abilityId: string | null): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile || abilityId === null) return
  volatile.abilityOverride = abilityId
  delete volatile.abilitySuppressed
  log(d, { type: 'abilityChanged', monsterId: monster.id, abilityId })
}

function setAbility(data: GameData, d: Draft, run: EffectRun, effect: Effect<'setAbility'>): void {
  const [source] = effect.from ? targetsOf(data, d, run, effect.from) : []
  const abilityId = effect.abilityId ?? (source ? currentAbility(d, data, source) : null)
  for (const target of targetsOf(data, d, run, effect.to)) setAbilityOf(d, target, abilityId)
}

function swapAbilities(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'swapAbilities'>
): void {
  for (const other of targetsOf(data, d, run, effect.with)) {
    const mine = currentAbility(d, data, run.owner)
    const theirs = currentAbility(d, data, other)
    setAbilityOf(d, run.owner, theirs)
    setAbilityOf(d, other, mine)
  }
}

function suppressAbility(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'suppressAbility'>
): void {
  for (const target of targetsOf(data, d, run, effect.to)) {
    const volatile = d.battle.volatiles[target.id]
    if (!volatile) continue
    volatile.abilitySuppressed = true
    log(d, { type: 'abilitySuppressed', monsterId: target.id })
  }
}

/** Skill dùng gần nhất bằng lệnh của quái (Disable, Encore, Mimic, Mirror Move). */
const lastSkillOf = (d: Draft, monster: Monster): string | undefined =>
  d.battle.volatiles[monster.id]?.skillStreak?.skillId

function disableSkill(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'disableSkill'>
): void {
  for (const target of targetsOf(data, d, run, effect.to)) {
    const volatile = d.battle.volatiles[target.id]
    const skillId = lastSkillOf(d, target)
    if (!volatile || !skillId) continue
    volatile.disabledSkill = { skillId, untilTurn: d.battle.turn + effect.turns }
    log(d, { type: 'skillDisabled', monsterId: target.id, skillId })
  }
}

function encore(data: GameData, d: Draft, run: EffectRun, effect: Effect<'encore'>): void {
  for (const target of targetsOf(data, d, run, effect.to)) {
    const volatile = d.battle.volatiles[target.id]
    const skillId = lastSkillOf(d, target)
    if (!volatile || !skillId || volatile.lockedMove) continue
    volatile.lockedMove = { skillId, turnsLeft: effect.turns, kind: 'encore' }
    log(d, { type: 'encored', monsterId: target.id, skillId })
  }
}

/** Stockpile: +1 lần (tới `max`); xả thì về 0 và bỏ bậc thủ / thủ đặc biệt đã cộng. */
function stockpile(data: GameData, d: Draft, run: EffectRun, effect: Effect<'stockpile'>): void {
  for (const target of targetsOf(data, d, run, effect.to)) {
    const volatile = d.battle.volatiles[target.id]
    if (!volatile) continue
    const count = volatile.stockpile ?? 0
    if (effect.change === 'add') {
      if (count >= (effect.max ?? 3)) continue
      volatile.stockpile = count + 1
      continue
    }
    if (count === 0) continue
    delete volatile.stockpile
    for (const stat of ['defense', 'spDefense'] as const)
      changeStage(data, d, target.id, stat, -count)
  }
}

/** Sketch / Mimic: học skill dùng gần nhất của `other` thay skill đang dùng. */
function learnSkill(data: GameData, d: Draft, run: EffectRun, effect: Effect<'learnSkill'>): void {
  const skillId = run.other ? lastSkillOf(d, run.other) : undefined
  if (!skillId || !run.skillId) return
  for (const target of targetsOf(data, d, run, effect.to)) {
    if (target.skillIds.includes(skillId)) continue
    if (effect.permanent) {
      target.skillIds = target.skillIds.map((id) => (id === run.skillId ? skillId : id))
    } else {
      const volatile = d.battle.volatiles[target.id]
      if (!volatile) continue
      volatile.tempSkillIds = [...(volatile.tempSkillIds ?? []), skillId]
      volatile.sealedSkillIds = [...(volatile.sealedSkillIds ?? []), run.skillId]
    }
    log(d, { type: 'skillLearnedInBattle', monsterId: target.id, skillId })
  }
}

/** Transform: hệ, ability, bậc trận, skill và chỉ số (trừ HP) như `from`. */
function transformInto(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'transformInto'>
): void {
  const [source] = targetsOf(data, d, run, effect.from)
  if (!source) return
  for (const target of targetsOf(data, d, run, effect.to)) {
    const volatile = d.battle.volatiles[target.id]
    if (!volatile || target.id === source.id) continue
    changeIdentity(d, target, { elementIds: [...source.elementIds] })
    setAbilityOf(d, target, currentAbility(d, data, source))
    for (const stat of STAGE_STATS)
      setStage(data, d, target.id, stat, d.battle.stages[source.id]?.[stat] ?? 0)
    const sourceStats = battleStats(data, d, source)
    for (const stat of ['attack', 'defense', 'spAttack', 'spDefense', 'speed'] as const) {
      setStatTo(data, d, target, stat, sourceStats[stat])
    }
    volatile.tempSkillIds = [...new Set([...(volatile.tempSkillIds ?? []), ...source.skillIds])]
    volatile.sealedSkillIds = [...new Set([...(volatile.sealedSkillIds ?? []), ...target.skillIds])]
    log(d, { type: 'transformedInto', monsterId: target.id, otherId: source.id })
  }
}

/** Ally Switch: đổi ô sân với đồng đội. */
function swapPositions(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'swapPositions'>
): void {
  const side = sideOf(d, run.owner.id)
  const slots = slotsOf(d.battle, side)
  for (const other of targetsOf(data, d, run, effect.with)) {
    const a = slots.indexOf(run.owner.id)
    const b = slots.indexOf(other.id)
    if (a < 0 || b < 0 || a === b || sideOf(d, other.id) !== side) continue
    slots[a] = other.id
    slots[b] = run.owner.id
    log(d, { type: 'positionsSwapped', monsterId: run.owner.id, otherId: other.id })
  }
}

function markVolatile(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Effect<'markVolatile'>
): void {
  const volatile = d.battle.volatiles[run.owner.id]
  // Không có mục tiêu: `if` / `chance` xét trên chủ hiệu ứng.
  if (!volatile || resolveEffectTargets(data, d, run, 'self').length === 0) return
  switch (effect.mark) {
    case 'destinyBond':
      volatile.destinyBond = true
      return
    case 'grudge':
      volatile.grudge = true
      return
    case 'magicCoat':
      volatile.magicCoatTurn = d.battle.turn
      return
    case 'cudChew':
      volatile.cudChewTurn = d.battle.turn
      return
    case 'snatch':
      volatile.snatchTurn = d.battle.turn
      return
    default:
      assertNever(effect.mark, 'đánh dấu trạng thái tạm')
  }
}

/** Runner của các hiệu ứng trên (gộp vào EFFECT_RUNNERS). */
export const POKEMON_EFFECT_RUNNERS = {
  shareHp,
  copyStages,
  swapStages,
  invertStages,
  averageStats,
  swapStats,
  swapOwnStats,
  randomStage,
  setAbility,
  swapAbilities,
  suppressAbility,
  disableSkill,
  encore,
  stockpile,
  learnSkill,
  transformInto,
  swapPositions,
  markVolatile
}
