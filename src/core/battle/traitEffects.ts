// Chạy hiệu ứng của trait kích hoạt theo sự kiện (hook `trigger`, mục "Trait Siralim" ở
// battle.md): chọn mục tiêu, tính lượng, rồi gây sát thương / hồi máu / đổi chỉ số / trạng thái /
// đánh / dùng skill / hồi sinh / thêm lượt / Timeline / minion / trait tạm / Seal / max HP / đổi
// hệ, race. Mỗi loại hiệu ứng một hàm trong EFFECT_RUNNERS (Record theo loại: thêm loại mới mà
// quên chạy thì TypeScript báo lỗi). Đánh / dùng skill tính vào giới hạn hành động phụ.

import { clearScreens, placeSideField } from './sideFields'
import { changeBattleForm, revertBattleForm } from './battleForms'
import { retreatFromField } from './fleeTraits'
import { reduceHold, startPerish } from './volatiles'
import { activeTransform, getCurrentHp, getMaxHp, isFainted } from '../monster'
import {
  equipmentTraitInstances,
  checkAllConditions,
  counterValue,
  hasStatusFlag,
  hasAbilityFlag,
  hasTraitFlag,
  recordTotal,
  type DslCondition,
  type DslView,
  type AmountSpec,
  type CounterSpec,
  type EffectTarget,
  type StageSelector,
  type StatSelector,
  type TraitEffect,
  type TraitEffectType
} from '../registries'
import { BIG_ZERO, maxBig, minBig, pick, rollPercent, toBig, type Decimal } from '../shared'
import {
  battleSkillIds,
  NON_HP_STATS,
  STAGE_STATS,
  type EquippedItem,
  type GameData,
  type Monster,
  type NonHpStat,
  type Skill,
  type StageStat
} from '../model'
import {
  Draft,
  aliveOnField,
  clockwiseFrom,
  battleStats,
  canEnterSlot,
  log,
  monsterBattleContext,
  opponentOf,
  recordOf,
  sideOf,
  slotsOf,
  teamOf
} from './draft'
import { emitTraitEvent, queueOf } from './eventQueue'
import { heal, loseHp, removeStatus, reviveMonster } from './hpChanges'
import { amountStatValue, extremeStat, statDamage } from './damage'
import { applyStageChange, stageCause } from './stageChanges'
import {
  hazardDamageFactor,
  inflictStatus,
  rollRandomStatusId,
  statusBurstAmount
} from './statuses'
import { addMinion, removeMinions, rollRandomMinionId } from './minions'
import { insertExtraAction, movePendingAction } from './actionQueue'
import { clearGlobalField, enterField, placeField } from './environment'
import { executeSkill } from './executeSkill'
import { castAllSlots, spellSlotsOf } from './spellSlots'
import { giveEquipment, swapEquipment, takeEquipment } from './itemLedger'
import { eatHeldItems } from './heldItems'
import { pendingSkillOf } from './actionQueue'
import { POKEMON_EFFECT_RUNNERS } from './pokemonEffects'
import { changeStamina, drainStamina, exhaust, staminaChangeOf } from './stamina'

/** Một lần chạy hiệu ứng: chủ trait, hệ số, các quái của sự kiện. */
export interface EffectRun {
  owner: Monster
  /** Hệ số cấp trait / potency / số stack minion. */
  scale: number
  subject?: Monster
  other?: Monster
  /** Lượng của sự kiện (sát thương vừa gây / nhận, máu vừa hồi). */
  amount?: Decimal
  /** Skill của sự kiện (hiệu ứng cast `sameSkill`). */
  skillId?: string
  /** Góc nhìn điều kiện của lần kích hoạt (bộ đếm `per` của lượng). */
  view?: DslView
  /** Điều kiện lọc từng mục tiêu của hiệu ứng đang chạy (`if` của hiệu ứng). */
  filter?: readonly DslCondition[]
  /** % áp lên từng mục tiêu của hiệu ứng đang chạy (`chance` của hiệu ứng). */
  chance?: number
}

/** Chọn ngẫu nhiên một phần tử (không có thì undefined). */
function pickOne<T>(d: Draft, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined
  let chosen: T
  ;[chosen, d.rng] = pick(d.rng, items)
  return chosen
}

/** Quái mục tiêu của hiệu ứng (mục tiêu đã gục bị bỏ, trừ hồi sinh / kill lên chính nó). */
export function resolveEffectTargets(
  data: GameData,
  d: Draft,
  run: EffectRun,
  target: EffectTarget
): Monster[] {
  const targets = rawEffectTargets(data, d, run, target)
  const filter = run.filter
  const passed =
    !filter || filter.length === 0
      ? targets
      : targets.filter((monster) =>
          checkAllConditions(
            {
              ...(run.view ?? { data, self: run.owner }),
              target: monster,
              targetCtx: monsterBattleContext(data, d, monster)
            },
            filter
          )
        )
  if (run.chance === undefined) return passed
  const chance = run.chance
  return passed.filter((): boolean => {
    let hit: boolean
    ;[hit, d.rng] = rollPercent(d.rng, chance)
    return hit
  })
}

function rawEffectTargets(
  data: GameData,
  d: Draft,
  run: EffectRun,
  target: EffectTarget
): Monster[] {
  const side = sideOf(d, run.owner.id)
  const onSide = aliveOnField(data, d, side).map((e) => e.monster)
  const foes = aliveOnField(data, d, opponentOf(side)).map((e) => e.monster)
  switch (target) {
    case 'self':
      return [run.owner]
    case 'subject':
      return run.subject ? [run.subject] : []
    case 'other':
      return run.other ? [run.other] : []
    case 'allies':
      return onSide.filter((m) => m.id !== run.owner.id)
    case 'side':
      return onSide
    case 'foes':
      return foes
    case 'randomFoe':
      return [pickOne(d, foes)].filter((m): m is Monster => m !== undefined)
    case 'randomAlly':
      return [
        pickOne(
          d,
          onSide.filter((m) => m.id !== run.owner.id)
        )
      ].filter((m): m is Monster => m !== undefined)
    case 'otherFoes':
      return foes.filter((m) => m.id !== run.other?.id)
    case 'subjectAllies': {
      if (!run.subject) return []
      const subjectSide = sideOf(d, run.subject.id)
      return aliveOnField(data, d, subjectSide)
        .map((e) => e.monster)
        .filter((m) => m.id !== run.subject?.id)
    }
    case 'faintedAlly':
      return [
        pickOne(
          d,
          teamOf(data, d, side).filter((m) => isFainted(data, m))
        )
      ].filter((m): m is Monster => m !== undefined)
    case 'faintedAllies':
      return teamOf(data, d, side).filter((m) => isFainted(data, m))
    case 'lowestHpAlly':
      return lowestHp(data, onSide)
    case 'lowestHpFoe':
      return lowestHp(data, foes)
    case 'leftAlly': {
      // Quái "bên trái" (Siralim): ô sân ngay trước chủ hiệu ứng ở phe mình.
      const slot = slotsOf(d.battle, side).indexOf(run.owner.id)
      const left = slot > 0 ? slotsOf(d.battle, side)[slot - 1] : null
      return onSide.filter((m) => m.id === left)
    }
    case 'nextClockwise':
      return nextClockwise(data, d, run.owner)
  }
}

/**
 * Quái kế tiếp theo chiều kim đồng hồ quanh sân (Landing Transmog của Temtem): ô của phe mình theo thứ
 * tự, rồi ô phe địch ngược thứ tự (hai phe đối mặt), bỏ ô trống / quái gục / quái cùng loài với chủ.
 */
function nextClockwise(data: GameData, d: Draft, owner: Monster): Monster[] {
  const next = clockwiseFrom(data, d, owner.id).find(
    (monster) => monster.speciesId !== owner.speciesId
  )
  return next ? [next] : []
}

/** Quái ít máu nhất (theo tỉ lệ máu) trong danh sách. */
/** Hệ số số lần theo bộ đếm (`countPer` / `timesPer`): nguyên, không âm; không có = 1. */
function timesFromCounter(run: EffectRun, spec: CounterSpec | undefined): number {
  if (!spec || !run.view) return 1
  return Math.max(0, Math.floor(counterValue(run.view, spec)))
}

function lowestHp(data: GameData, monsters: readonly Monster[]): Monster[] {
  const ratio = (m: Monster): number => getCurrentHp(data, m).div(getMaxHp(data, m)).toNumber()
  return [...monsters].sort((a, b) => ratio(a) - ratio(b)).slice(0, 1)
}

/** Hệ số nhân của lượng theo bộ đếm (`per`); không có thì 1. */
function perFactor(run: EffectRun, amount: AmountSpec): number {
  if (!amount.per || !run.view) return amount.per ? 0 : 1
  return Math.max(0, counterValue(run.view, amount.per))
}

/** Quái của `of` trong lượng (self / subject / other / target / attacker). */
function amountOwner(run: EffectRun, of: string, target?: Monster): Monster | undefined {
  if (of === 'subject') return run.subject
  if (of === 'target') return target ?? run.other
  // Sự kiện không có bên kia (cuối lượt, vào sân): "bên kia" là từng mục tiêu của hiệu ứng.
  if (of === 'other') return run.other ?? target
  return run.owner
}

/** Giá trị thẳng của một lượng (chỉ số / máu / sự kiện / số cố định), đã nhân hệ số. */
function plainAmount(
  data: GameData,
  d: Draft,
  run: EffectRun,
  amount: AmountSpec,
  target?: Monster
): Decimal {
  return basePlainAmount(data, d, run, amount, target).times(perFactor(run, amount))
}

function basePlainAmount(
  data: GameData,
  d: Draft,
  run: EffectRun,
  amount: AmountSpec,
  target?: Monster
): Decimal {
  if ('flat' in amount) return toBig(amount.flat)
  const percent = amount.percent * run.scale
  if ('event' in amount) return (run.amount ?? BIG_ZERO).times(percent).div(100)
  const monster = amountOwner(run, amount.of, target)
  if (!monster) return BIG_ZERO
  if ('record' in amount) {
    const ctx = monsterBattleContext(data, d, monster)
    return recordTotal(ctx, amount.record, amount.side).times(percent).div(100)
  }
  if ('stat' in amount) {
    return amountStatValue(battleStats(data, d, monster), amount.stat)
      .times(percent)
      .div(100)
  }
  const maxHp = getMaxHp(data, monster)
  const current = getCurrentHp(data, monster)
  const base =
    amount.hp === 'max' ? maxHp : amount.hp === 'current' ? current : maxHp.minus(current)
  return base.times(percent).div(100)
}

/** Sát thương của một lượng lên `target`: theo chỉ số thì qua công thức chung, còn lại lượng thẳng. */
function damageAmount(
  data: GameData,
  d: Draft,
  run: EffectRun,
  amount: AmountSpec,
  target: Monster
): Decimal {
  if (!('stat' in amount)) return plainAmount(data, d, run, amount, target)
  const monster = amountOwner(run, amount.of, target)
  if (!monster) return BIG_ZERO
  return statDamage(data, {
    attackStat: amountStatValue(battleStats(data, d, monster), amount.stat),
    defense: battleStats(data, d, target).defense,
    power: amount.percent * run.scale
  }).times(perFactor(run, amount))
}

/** Chỉ số được chọn theo bộ chọn (cao nhất / thấp nhất tính theo chỉ số trong trận). */
function selectStats(
  data: GameData,
  d: Draft,
  monster: Monster,
  selector: StatSelector
): NonHpStat[] {
  if (Array.isArray(selector)) return [...selector]
  if (selector === 'all') return [...NON_HP_STATS]
  // Ngẫu nhiên: thủ gồm cả hai loại thủ như quy ước chỉ số Siralim (Defense = defense + spDefense).
  if (selector === 'random') {
    const groups: NonHpStat[][] = [['attack'], ['spAttack'], ['defense', 'spDefense'], ['speed']]
    return [...(pickOne(d, groups) ?? ['attack'])]
  }
  const stats = battleStats(data, d, monster)
  const target = extremeStat(stats, selector)
  return [NON_HP_STATS.find((stat) => stats[stat].eq(target)) ?? 'attack']
}

/** Chỉ số đổi bậc của hiệu ứng `stage`: danh sách (có thể có chính xác / né) hoặc như selectStats. */
const selectStageStats = (
  data: GameData,
  d: Draft,
  monster: Monster,
  selector: StageSelector
): StageStat[] =>
  Array.isArray(selector) ? [...selector] : selectStats(data, d, monster, selector)

/** Trạng thái chặn tăng / giảm chỉ số (Feared / Warded) hoặc trait chặn tăng. */
function blocksGain(data: GameData, d: Draft, monster: Monster): boolean {
  if (hasStatusFlag(data, monster, (handler, params) => handler.blocksStatGain?.(params)))
    return true
  const ctx = monsterBattleContext(data, d, monster)
  const view = { data, self: monster, selfCtx: ctx }
  return hasTraitFlag(
    data,
    monster,
    (handler, params) => handler.blocksStatGain?.(params, view),
    ctx
  )
}
const blocksLoss = (data: GameData, monster: Monster): boolean =>
  hasStatusFlag(data, monster, (handler, params) => handler.blocksStatLoss?.(params))

/** Cộng / trừ chỉ số thẳng trong trận (flatStats); log, sự kiện statGain / statLoss. */
export function addFlatStat(
  data: GameData,
  d: Draft,
  monster: Monster,
  stat: NonHpStat,
  amount: Decimal
): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile || amount.eq(0) || isFainted(data, monster)) return
  if (amount.gt(0) && blocksGain(data, d, monster)) return
  if (amount.lt(0) && blocksLoss(data, monster)) return
  const flat = (volatile.flatStats ??= {})
  flat[stat] = (flat[stat] ?? BIG_ZERO).plus(amount)
  log(d, { type: 'flatStat', monsterId: monster.id, stat, amount })
  emitTraitEvent(d, { type: amount.gt(0) ? 'statGain' : 'statLoss', subjectId: monster.id, amount })
}

/** Còn được chạy thêm hành động phụ (đánh / dùng skill do trait) cho hành động gốc này không. */
export function claimAction(data: GameData, d: Draft): boolean {
  const queue = queueOf(d)
  if (queue.actions >= data.config.battle.traitChain.maxActions) return false
  queue.actions++
  return true
}

/** Skill gây sát thương ngẫu nhiên của quái, ưu tiên physical (Attack của Siralim). */
function randomAttackSkill(data: GameData, d: Draft, monster: Monster): Skill | undefined {
  const skills = battleSkillIds(monster)
    .map((id) => data.skills[id])
    .filter((s) => s.power > 0)
  const physical = skills.filter((s) => s.category === 'physical')
  return pickOne(d, physical.length > 0 ? physical : skills)
}

/** Ô của quái trên sân (undefined = không ở trên sân). */
function slotOf(d: Draft, monster: Monster): number | undefined {
  const index = slotsOf(d.battle, sideOf(d, monster.id)).indexOf(monster.id)
  return index < 0 ? undefined : index
}

/** Chủ trait đánh một mục tiêu bằng skill gây sát thương ngẫu nhiên (đòn do trait). */
function traitAttack(
  data: GameData,
  d: Draft,
  owner: Monster,
  target: Monster,
  damagePercent: number
): void {
  const slot = slotOf(d, owner)
  if (slot === undefined || isFainted(data, owner) || isFainted(data, target)) return
  const skill = randomAttackSkill(data, d, owner)
  if (!skill || !claimAction(data, d)) return
  executeSkill(data, d, {
    side: sideOf(d, owner.id),
    slot,
    user: owner,
    skill,
    targetId: target.id,
    reactive: true,
    damagePercent
  })
}

/** Pool skill cho hiệu ứng cast. */
function castPool(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Extract<TraitEffect, { do: 'cast' }>
): Skill[] {
  const owner = run.owner
  if (effect.sameSkill) return run.skillId ? [data.skills[run.skillId]] : []
  const called = calledSkills(data, d, run, effect)
  if (called) return called
  if (effect.lastCast) {
    const last = d.battle.counters.lastCastSkillId
    return last ? [data.skills[last]] : []
  }
  // Hợp kích kỹ không phải spell riêng của một quái (docs/rules/team.md).
  const spellOnly = (skill: Skill): boolean =>
    skill.category !== 'physical' && !(skill.id in data.comboSkills)
  const categories = effect.categories
  const matches = (skill: Skill): boolean =>
    (categories === undefined || categories.includes(skill.category)) &&
    (effect.tags === undefined || (skill.tags ?? []).some((tag) => effect.tags?.includes(tag))) &&
    (effect.elementIds === undefined || effect.elementIds.includes(skill.elementId)) &&
    (!effect.sameElement || owner.elementIds.includes(skill.elementId))
  if (effect.skillId) return [data.skills[effect.skillId]]
  const own = [...new Set(battleSkillIds(owner))].map((id) => data.skills[id])
  switch (effect.pool) {
    case 'own':
      return own.filter(matches)
    case 'ownSpell':
      return own.filter((skill) => spellOnly(skill) && matches(skill))
    case 'global':
      return Object.values(data.skills).filter((skill) => spellOnly(skill) && matches(skill))
    case 'party': {
      // Assist: skill của đồng đội cùng phe (cả dự bị), trừ chính quái dùng.
      const team = sideOf(d, owner.id) === 'player' ? d.party : d.battle.enemies
      const ids = new Set(team.filter((m) => m.id !== owner.id).flatMap((m) => battleSkillIds(m)))
      return [...ids].map((id) => data.skills[id]).filter((skill) => allowedCall(skill, effect))
    }
    default:
      return []
  }
}

/** Skill tạm ngẫu nhiên: spell (special / status) theo họ và / hoặc theo hệ của quái. */
function randomTempSkill(
  data: GameData,
  d: Draft,
  monster: Monster,
  effect: Extract<TraitEffect, { do: 'tempSkill' }>
): string | undefined {
  const pool = Object.values(data.skills).filter(
    (skill) =>
      skill.category !== 'physical' &&
      !(skill.id in data.comboSkills) &&
      (effect.tags === undefined || (skill.tags ?? []).some((tag) => effect.tags?.includes(tag))) &&
      (effect.elementIds === undefined || effect.elementIds.includes(skill.elementId)) &&
      (!effect.sameElement || monster.elementIds.includes(skill.elementId))
  )
  return pickOne(d, pool)?.id
}

/** Chủ trait dùng một skill (cast do trait): mục tiêu là `target` nếu có, không thì mặc định. */
/** Skill chiêu gọi được (không phải chiêu Max / Z, không bị loại, không nạp lượt nếu cấm). */
function allowedCall(skill: Skill, effect: Extract<TraitEffect, { do: 'cast' }>): boolean {
  if (skill.maxMove || skill.zMove) return false
  if (effect.excludeSkillIds?.includes(skill.id)) return false
  return !(effect.excludeCharge && skill.charge)
}

/**
 * Lựa chọn của nhóm "gọi chiêu khác" (Metronome, Sleep Talk, Mirror Move, Copycat, Me First, Nature
 * Power); null = không phải nhóm này (dùng luật pool cũ).
 */
function calledSkills(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Extract<TraitEffect, { do: 'cast' }>
): Skill[] | null {
  const pick = (ids: readonly (string | undefined)[]): Skill[] =>
    ids
      .filter((id): id is string => id !== undefined && Object.hasOwn(data.skills, id))
      .map((id) => data.skills[id])
      .filter((skill) => allowedCall(skill, effect))
  if (effect.skillIds) return pick(effect.skillIds)
  if (effect.byField) {
    const { weather, terrain } = d.battle.field
    return pick([effect.byField[terrain.id] ?? effect.byField[weather.id] ?? effect.skillId])
  }
  if (effect.lastOf === 'battle') return pick([d.battle.counters.lastSkillId])
  const other = run.other
  if (effect.lastOf === 'other')
    return pick([other ? d.battle.volatiles[other.id]?.skillStreak?.skillId : undefined])
  if (effect.pendingOf === 'other')
    return pick([other ? pendingSkillOf(d, other.id)?.skillId : undefined])
  if (effect.excludeSkillIds || effect.excludeCharge) {
    // Sleep Talk: skill của chính quái, trừ danh sách loại / chiêu nạp lượt.
    return [...new Set(battleSkillIds(run.owner))]
      .map((id) => data.skills[id])
      .filter((skill) => skill.id !== run.skillId && allowedCall(skill, effect))
  }
  return null
}

function traitCast(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Extract<TraitEffect, { do: 'cast' }>
): void {
  const owner = effect.by
    ? (resolveEffectTargets(data, d, run, effect.by)[0] ?? run.owner)
    : run.owner
  const slot = slotOf(d, owner)
  if (slot === undefined || isFainted(data, owner)) return
  const skill = pickOne(d, castPool(data, d, run, effect))
  if (!skill || !claimAction(data, d)) return
  const target = effect.to ? resolveEffectTargets(data, d, run, effect.to)[0] : undefined
  executeSkill(data, d, {
    side: sideOf(d, owner.id),
    slot,
    user: owner,
    skill,
    targetId: target?.id,
    reactive: true,
    ...(effect.damagePercent ? { damagePercent: effect.damagePercent } : {})
  })
}

/** Hồi sinh quái phe mình đã gục; ô sân phe đó đang trống thì vào sân ngay. */
function reviveAlly(data: GameData, d: Draft, monster: Monster, hpPercent: number): void {
  if (!isFainted(data, monster)) return
  reviveMonster(data, d, monster, hpPercent)
  if (slotOf(d, monster) !== undefined) return
  const side = sideOf(d, monster.id)
  const slots = slotsOf(d.battle, side)
  // Quái lớn hồi sinh chỉ vào sân khi mọi ô trống (docs/rules/monster-size.md).
  const emptySlot = slots.indexOf(null)
  if (emptySlot >= 0 && canEnterSlot(data, slots, { slot: emptySlot, monster })) {
    enterField(data, d, { side, slot: emptySlot, monster })
  }
}

/** Fling: món bị ném có `flingStatusId` thì gây trạng thái đó lên mục tiêu. */
function flingStatuses(
  data: GameData,
  d: Draft,
  run: EffectRun,
  to: EffectTarget,
  taken: readonly EquippedItem[]
): void {
  const statusIds = taken.flatMap((entry) => {
    const item = entry.storage === 'stack' ? data.items[entry.itemId] : undefined
    return item?.category === 'held' && item.flingStatusId ? [item.flingStatusId] : []
  })
  if (statusIds.length === 0) return
  for (const target of resolveEffectTargets(data, d, run, to)) {
    for (const statusId of statusIds)
      inflictStatus(data, d, target, statusId, { source: run.owner })
  }
}

/** Hạ ngay (boss hoang chỉ mất phần máu theo hệ số boss, như luật hạ ngay hiện có). */
function killMonster(
  data: GameData,
  d: Draft,
  { owner, target, belowHpPercent }: { owner: Monster; target: Monster; belowHpPercent?: number }
): void {
  if (isFainted(data, target)) return
  if (belowHpPercent !== undefined) {
    const ratio = getCurrentHp(data, target).div(getMaxHp(data, target)).toNumber()
    if (ratio * 100 >= belowHpPercent) return
  }
  const factor = hazardDamageFactor(data, d, sideOf(d, target.id))
  const current = getCurrentHp(data, target)
  const amount = factor >= 1 ? current : maxBig(1, current.times(factor).ceil())
  loseHp(
    data,
    d,
    target,
    amount,
    (dealt) => ({ type: 'traitDamage', monsterId: target.id, amount: dealt }),
    {
      kind: 'cost',
      source: owner
    }
  )
}

/** Đổi max HP trong trận (giữ máu đã mất; không xuống dưới 1 máu hiện tại). */
export function changeMaxHp(data: GameData, d: Draft, monster: Monster, delta: Decimal): void {
  if (isFainted(data, monster) || delta.eq(0)) return
  const maxHp = getMaxHp(data, monster)
  const current = getCurrentHp(data, monster)
  // Giảm: max HP mới tối thiểu 1, máu hiện tại tối thiểu 1.
  const applied = delta.lt(0) ? maxBig(delta, toBig(1).minus(maxHp)) : delta
  monster.battleMaxHpDelta = (monster.battleMaxHpDelta ?? BIG_ZERO).plus(applied)
  if (applied.lt(0) && current.plus(applied).lt(1)) {
    monster.damageTaken = maxHp.plus(applied).minus(1)
  }
  log(d, { type: 'maxHpChanged', monsterId: monster.id, amount: applied })
  if (applied.gt(0))
    emitTraitEvent(d, { type: 'maxHpGained', subjectId: monster.id, amount: applied })
}

/** Khóa một skill special / status ngẫu nhiên chưa khóa của quái tới hết trận (Seal). */
function sealSkill(data: GameData, d: Draft, monster: Monster): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile) return
  const sealed = volatile.sealedSkillIds ?? []
  const candidates = [...new Set(battleSkillIds(monster))].filter(
    (id) => data.skills[id].category !== 'physical' && !sealed.includes(id)
  )
  const skillId = pickOne(d, candidates)
  if (!skillId) return
  volatile.sealedSkillIds = [...sealed, skillId]
  log(d, { type: 'skillSealed', monsterId: monster.id, skillId })
}

/** Trait ngẫu nhiên cho hiệu ứng "nhận trait ngẫu nhiên" (loại positive / rare, chia đều). */
function randomTraitId(data: GameData, d: Draft): string | undefined {
  const pool = Object.values(data.traits).filter((t) => t.kind === 'positive' || t.kind === 'rare')
  return pickOne(d, pool)?.id
}

/** Thêm trait tạm cho quái trên sân (mất khi rời sân). */
export function gainTrait(
  data: GameData,
  d: Draft,
  monster: Monster,
  traitId: string,
  level = 1
): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile || isFainted(data, monster)) return
  const gained = (volatile.gainedTraits ??= [])
  if (gained.some((t) => t.id === traitId) || monster.traits.some((t) => t.id === traitId)) return
  gained.push({ id: traitId, level })
  recordOf(d, monster.id).traitsGained++
  log(d, { type: 'traitGained', monsterId: monster.id, traitId })
}

/**
 * Đổi hệ / race của quái trong trận (giữ bản gốc để trả lại khi rời sân / hết trận). Quái đã Tera
 * không bị đổi hệ (như Soak với quái Tera trong Pokémon), race vẫn đổi.
 */
export function changeIdentity(
  d: Draft,
  monster: Monster,
  { elementIds, raceId }: { elementIds?: string[]; raceId?: string }
): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile) return
  volatile.originalIdentity ??= { elementIds: [...monster.elementIds], raceId: monster.raceId }
  if (elementIds && activeTransform(monster)?.kind !== 'tera') monster.elementIds = [...elementIds]
  if (raceId) monster.raceId = raceId
  log(d, {
    type: 'identityChanged',
    monsterId: monster.id,
    elementIds: monster.elementIds,
    raceId: monster.raceId
  })
}

/**
 * Hệ mới của hiệu ứng identity theo luật chiêu Pokémon: thêm hệ (Forest's Curse), hệ skill đầu tiên
 * (Conversion), hệ ngẫu nhiên kháng skill gần nhất của `other` (Conversion 2); không có thì undefined.
 */
function identityElements(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Extract<TraitEffect, { do: 'identity' }>,
  target: Monster
): string[] | undefined {
  if (effect.addElementIds) return [...new Set([...target.elementIds, ...effect.addElementIds])]
  if (effect.elementFromSkill) {
    return run.skillId ? [data.skills[run.skillId].elementId] : undefined
  }
  if (effect.restoreElements) {
    return d.battle.volatiles[target.id]?.originalIdentity?.elementIds
  }
  if (effect.removeElementIds) {
    const removed = effect.removeElementIds
    return target.elementIds.filter((id) => !removed.includes(id))
  }
  if (effect.elementFromFirstSkill) {
    const first = target.skillIds[0]
    return first ? [data.skills[first].elementId] : undefined
  }
  if (effect.resistLastSkillOfOther && run.other) {
    const lastId = d.battle.volatiles[run.other.id]?.skillStreak?.skillId
    if (!lastId) return undefined
    const attack = data.elements[data.skills[lastId].elementId].effectiveness
    const resisting = Object.keys(data.elements).filter((id) => (attack[id] ?? 1) < 1)
    if (resisting.length === 0) return undefined
    const chosen = pickOne(d, resisting)
    return chosen ? [chosen] : undefined
  }
  return undefined
}

/** Hai danh sách hệ giống nhau (không xét thứ tự). */
const sameElements = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id))

/** Bật phòng thủ / khiêu khích cho quái tới hết lượt này (hiệu ứng trait, buff). */
export function guard(d: Draft, monster: Monster, command: 'defend' | 'provoke'): void {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile) return
  if (command === 'defend') volatile.defending = Math.max(volatile.defending ?? 0, d.battle.turn)
  else volatile.provoking = Math.max(volatile.provoking ?? 0, d.battle.turn)
  const record = recordOf(d, monster.id)
  if (command === 'defend') record.defends++
  else record.provokes++
  log(d, { type: command, monsterId: monster.id })
  emitTraitEvent(d, { type: command, subjectId: monster.id })
}

type Runner<T extends TraitEffectType> = (
  data: GameData,
  d: Draft,
  run: EffectRun,
  effect: Extract<TraitEffect, { do: T }>
) => void

type Runners = { [T in TraitEffectType]: Runner<T> }

const forTargets = (
  data: GameData,
  d: Draft,
  run: EffectRun,
  to: EffectTarget,
  fn: (target: Monster) => void
): void => {
  for (const target of resolveEffectTargets(data, d, run, to)) fn(target)
}

const EFFECT_RUNNERS: Runners = {
  ...POKEMON_EFFECT_RUNNERS,
  damage(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      for (let i = 0; i < (effect.times ?? 1) && !isFainted(data, target); i++) {
        const factor = hazardDamageFactor(data, d, sideOf(d, target.id))
        const amount = maxBig(
          1,
          damageAmount(data, d, run, effect.amount, target).times(factor).ceil()
        )
        loseHp(
          data,
          d,
          target,
          amount,
          (dealt) => ({ type: 'traitDamage', monsterId: target.id, amount: dealt }),
          {
            kind: 'indirect',
            source: run.owner,
            reactive: true
          }
        )
      }
    })
  },
  heal(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      heal(data, d, target, plainAmount(data, d, run, effect.amount, target).ceil(), run.owner)
    })
  },
  stage(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      for (const stat of selectStageStats(data, d, target, effect.stats)) {
        applyStageChange(data, d, {
          targetId: target.id,
          stat,
          delta: effect.delta,
          cause: stageCause(d, run.owner.id, target.id),
          sourceId: run.owner.id
        })
      }
    })
  },
  stamina(data, d, run, effect) {
    const donors = effect.from ? resolveEffectTargets(data, d, run, effect.from) : []
    forTargets(data, d, run, effect.to, (target) => {
      if (effect.from)
        drainStamina(data, d, { donors, receiver: target, amount: effect.amount ?? 0 })
      else changeStamina(data, d, target, staminaChangeOf(data, d, target, effect, run.amount))
    })
  },
  flatStat(data, d, run, effect) {
    const donors = effect.from ? resolveEffectTargets(data, d, run, effect.from) : []
    forTargets(data, d, run, effect.to, (target) => {
      const statOwner = donors[0] ?? target
      for (const stat of selectStats(data, d, statOwner, effect.stats)) {
        // Lấy chỉ số của quái khác: lượng `of: subject` tính trên quái bị lấy.
        const subject = donors[0] ?? run.subject ?? target
        const amount = plainAmount(data, d, { ...run, subject }, effect.amount, target)
        // Lấy chỉ số của quái khác (steal): quái bị lấy mất đúng lượng đó.
        for (const donor of donors) addFlatStat(data, d, donor, stat, amount.neg())
        addFlatStat(data, d, target, stat, effect.lose ? amount.neg() : amount)
      }
    })
  },
  status(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const count =
        (effect.count ?? 1) *
        (effect.perStack ? Math.max(1, Math.floor(run.scale)) : 1) *
        timesFromCounter(run, effect.countPer)
      for (let i = 0; i < count; i++) {
        const statusId =
          effect.statusId ?? (effect.random && rollRandomStatusId(data, d, effect.random))
        if (!statusId) continue
        const amount = effect.amount
          ? plainAmount(data, d, run, effect.amount, target).ceil()
          : undefined
        inflictStatus(data, d, target, statusId, { source: run.owner, turns: effect.turns, amount })
      }
    })
  },
  cure(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const matching = target.statuses.filter(
        (s) =>
          data.statuses[s.statusId].kind === effect.kind &&
          (effect.statusIds === undefined || effect.statusIds.includes(s.statusId))
      )
      for (const status of matching.slice(0, effect.count ?? matching.length)) {
        removeStatus(d, target, status.statusId)
      }
    })
  },
  moveStatuses(data, d, run, effect) {
    const sources = resolveEffectTargets(data, d, run, effect.from)
    const targets = resolveEffectTargets(data, d, run, effect.to)
    for (const source of sources) {
      const moved = source.statuses.filter((s) => data.statuses[s.statusId].kind === effect.kind)
      for (const status of moved) {
        if (!effect.copy) removeStatus(d, source, status.statusId)
        for (const target of targets) {
          if (target.id !== source.id)
            inflictStatus(data, d, target, status.statusId, { source: run.owner })
        }
      }
    }
  },
  statusPotency(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      for (const status of target.statuses) {
        if (!effect.statusIds.includes(status.statusId)) continue
        status.potency = Math.max(1, (status.potency ?? 100) + effect.percent * run.scale)
        log(d, {
          type: 'statusPotency',
          monsterId: target.id,
          statusId: status.statusId,
          potency: status.potency
        })
      }
    })
  },
  statusBurst(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      for (const statusId of effect.statusIds) {
        const status = target.statuses.find((s) => s.statusId === statusId)
        if (!status || isFainted(data, target)) continue
        const amount = statusBurstAmount(data, d, target, status, effect.turns)
        if (!amount) continue
        if (effect.remove) removeStatus(d, target, statusId)
        loseHp(
          data,
          d,
          target,
          amount,
          (dealt) => ({ type: 'statusDamage', monsterId: target.id, statusId, amount: dealt }),
          { kind: 'indirect', source: run.owner, statusId }
        )
      }
    })
  },
  attack(data, d, run, effect) {
    const attackers = effect.by ? resolveEffectTargets(data, d, run, effect.by) : [run.owner]
    for (const attacker of attackers) {
      forTargets(data, d, run, effect.to, (target) => {
        if (target.id === attacker.id) return
        const times = (effect.times ?? 1) * timesFromCounter(run, effect.timesPer)
        for (let i = 0; i < times; i++) {
          traitAttack(data, d, attacker, target, effect.damagePercent * run.scale)
        }
      })
    }
  },
  cast(data, d, run, effect) {
    const times = (effect.times ?? 1) * timesFromCounter(run, effect.timesPer)
    for (let i = 0; i < times; i++) traitCast(data, d, run, effect)
  },
  revive(data, d, run, effect) {
    const targets =
      effect.to === 'self' || effect.to === 'subject' || effect.to === 'other'
        ? [
            effect.to === 'self' ? run.owner : effect.to === 'subject' ? run.subject : run.other
          ].filter((m): m is Monster => m !== undefined)
        : resolveEffectTargets(data, d, run, effect.to)
    for (const target of targets)
      reviveAlly(data, d, target, Math.min(100, effect.hpPercent * run.scale))
  },
  kill(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) =>
      killMonster(data, d, { owner: run.owner, target, belowHpPercent: effect.belowHpPercent })
    )
  },
  extraTurn(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const slot = slotOf(d, target)
      if (slot === undefined || isFainted(data, target)) return
      insertExtraAction(d, {
        side: sideOf(d, target.id),
        slot,
        monsterId: target.id,
        priority: 0,
        actsLast: false,
        speed: BIG_ZERO,
        tiebreak: 0
      })
      log(d, { type: 'extraTurn', monsterId: target.id })
    })
  },
  timeline(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const volatile = d.battle.volatiles[target.id]
      if (!volatile) return
      // Còn hành động chờ trong lượt thì đổi chỗ ngay; không thì áp cho lượt sau.
      if (!movePendingAction(d, target.id, effect.position)) volatile.timeline = effect.position
      log(d, { type: 'timelineMoved', monsterId: target.id, position: effect.position })
      if (effect.position === 'top')
        emitTraitEvent(d, { type: 'timelineTop', subjectId: target.id })
    })
  },
  minion(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      if (effect.existing) {
        const owned = d.battle.volatiles[target.id]?.minions ?? []
        for (const { minionId } of [...owned]) {
          addMinion(data, d, target, minionId, effect.stacks)
        }
        return
      }
      for (let i = 0; i < (effect.count ?? 1); i++) {
        const minionId =
          effect.minionId ?? (effect.pool ? pickOne(d, effect.pool) : rollRandomMinionId(data, d))
        if (minionId) addMinion(data, d, target, minionId, effect.stacks)
      }
    })
  },
  removeMinions(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => removeMinions(d, target, effect.minionId))
  },
  gainTrait(data, d, run, effect) {
    const donors = effect.copyFrom ? resolveEffectTargets(data, d, run, effect.copyFrom) : []
    forTargets(data, d, run, effect.to, (target) => {
      for (let i = 0; i < (effect.count ?? 1); i++) {
        const donor = donors[0]
        const traitId =
          effect.traitId ??
          (donor
            ? pickOne(
                d,
                donor.traits.map((t) => t.id)
              )
            : randomTraitId(data, d))
        if (traitId) gainTrait(data, d, target, traitId)
      }
    })
  },
  seal(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      for (let i = 0; i < effect.count; i++) sealSkill(data, d, target)
    })
  },
  maxHp(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const amount = plainAmount(data, d, run, effect.amount, target).ceil()
      changeMaxHp(data, d, target, effect.lose ? amount.neg() : amount)
    })
  },
  maxHpToCurrent(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) =>
      changeMaxHp(data, d, target, target.damageTaken.neg())
    )
  },
  takeItems(data, d, run, effect) {
    const receiver = effect.to ? resolveEffectTargets(data, d, run, effect.to)[0] : undefined
    forTargets(data, d, run, effect.from, (holder) => {
      if (keepsItemsFrom(data, d, run.owner, holder)) return
      // consume: món dùng mất (Natural Gift, Fling), không trả lại hết trận.
      const taken = takeEquipment(data, d, holder, effect.tags, {
        consume: effect.consume === true,
        firstWith: effect.firstWith
      })
      if (taken.length > 0 && receiver) giveEquipment(d, receiver, taken)
      if (effect.flingTo) flingStatuses(data, d, run, effect.flingTo, taken)
    })
  },
  swapItems(data, d, run, effect) {
    forTargets(data, d, run, effect.with, (other) => {
      if (!keepsItemsFrom(data, d, run.owner, other)) swapEquipment(d, run.owner, other)
    })
  },
  eatItems(data, d, run, effect) {
    forTargets(data, d, run, effect.from, (holder) => {
      const taken = takeEquipment(data, d, holder, effect.tags, { consume: true })
      if (taken.length === 0) return
      giveEquipment(d, run.owner, taken, { temporary: true })
      eatHeldItems(data, d, run.owner, effect.tags)
    })
  },
  recycleItem(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const itemId = d.battle.records[target.id]?.lastConsumedItemId
      if (!itemId) return
      giveEquipment(d, target, [{ storage: 'stack', itemId }], { temporary: true })
      delete recordOf(d, target.id).lastConsumedItemId
      log(d, { type: 'itemRecycled', monsterId: target.id, itemId })
    })
  },
  amplifyStages(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const stages = d.battle.stages[target.id]
      if (!stages) return
      for (const stat of STAGE_STATS) {
        const value = stages[stat] ?? 0
        if (value === 0) continue
        applyStageChange(data, d, {
          targetId: target.id,
          stat,
          delta: Math.sign(value) * effect.amount,
          cause: 'self',
          echoed: true
        })
      }
    })
  },
  removeStages(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      if (
        hasAbilityFlag(data, target, 'stagesUnremovable', monsterBattleContext(data, d, target))
      ) {
        return
      }
      const stages = d.battle.stages[target.id]
      if (!stages) return
      for (const stat of effect.stats ?? STAGE_STATS) {
        const value = stages[stat] ?? 0
        if (effect.sign === 'positive' ? value <= 0 : value >= 0) continue
        const size = Math.min(Math.abs(value), effect.amount ?? Math.abs(value))
        const next = value - Math.sign(value) * size
        if (next === 0) delete stages[stat]
        else stages[stat] = next
      }
    })
  },
  transferStages(data, d, run, effect) {
    const sources = resolveEffectTargets(data, d, run, effect.from)
    forTargets(data, d, run, effect.to, (target) => {
      for (const source of sources) {
        const stages = d.battle.stages[source.id]
        if (!stages || source.id === target.id) continue
        for (const stat of effect.stats ?? STAGE_STATS) {
          const value = stages[stat] ?? 0
          if (effect.sign === 'positive' ? value <= 0 : value >= 0) continue
          delete stages[stat]
          applyStageChange(data, d, {
            targetId: target.id,
            stat,
            delta: value,
            cause: 'foe',
            sourceId: source.id
          })
        }
      }
    })
  },
  restoreStages(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const stages = d.battle.stages[target.id]
      if (!stages) return
      const lowered = STAGE_STATS.filter((stat) =>
        effect.all ? (stages[stat] ?? 0) !== 0 : (stages[stat] ?? 0) < 0
      )
      if (lowered.length === 0) return
      for (const stat of lowered) delete stages[stat]
      log(d, { type: 'stagesRestored', monsterId: target.id, stats: lowered })
    })
  },
  command(data, d, run, effect) {
    const owner = run.owner
    const volatile = d.battle.volatiles[owner.id]
    if (!volatile || volatile.commanding || isFainted(data, owner)) return
    if (resolveEffectTargets(data, d, run, 'self').length === 0) return
    const partner = aliveOnField(data, d, sideOf(d, owner.id))
      .map((entry) => entry.monster)
      .find(
        (ally) =>
          ally.id !== owner.id &&
          effect.partnerSpeciesIds.includes(ally.speciesId) &&
          !d.battle.volatiles[ally.id]?.commandedBy
      )
    const partnerVolatile = partner && d.battle.volatiles[partner.id]
    if (!partner || !partnerVolatile) return
    volatile.commanding = partner.id
    partnerVolatile.commandedBy = owner.id
    log(d, { type: 'commanding', monsterId: owner.id, partnerId: partner.id })
    for (const stat of NON_HP_STATS) {
      applyStageChange(data, d, {
        targetId: partner.id,
        stat,
        delta: effect.stages,
        cause: 'self'
      })
    }
  },
  illusion(data, d, run, effect) {
    const owner = run.owner
    const volatile = d.battle.volatiles[owner.id]
    if (!volatile || resolveEffectTargets(data, d, run, 'self').length === 0) return
    if (effect.end) {
      if (volatile.illusionSpeciesId === undefined) return
      delete volatile.illusionSpeciesId
      log(d, { type: 'illusionEnded', monsterId: owner.id })
      return
    }
    // Như Pokémon: quái còn sống cuối cùng trong đội (không phải chính nó).
    const disguise = [...teamOf(data, d, sideOf(d, owner.id))]
      .reverse()
      .find((monster) => monster.id !== owner.id && !isFainted(data, monster))
    if (!disguise) return
    volatile.illusionSpeciesId = disguise.speciesId
  },
  perish(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => startPerish(data, d, target.id, effect.turns))
  },
  retreat(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => retreatFromField(data, d, target))
  },
  clearFields(data, d, run, effect) {
    if (resolveEffectTargets(data, d, run, 'self').length === 0) return
    for (const layer of effect.layers) clearGlobalField(data, d, layer, run.owner)
  },
  changeForm(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const formId = effect.forms?.[target.speciesId]
      if (effect.revert || (effect.toggle && target.battleForm?.speciesId === formId)) {
        revertBattleForm(data, d, target)
        return
      }
      if (formId === undefined) return
      changeBattleForm(data, d, target, {
        speciesId: formId,
        ...(effect.untilLeave ? { untilLeave: true } : {})
      })
    })
  },
  clearScreens(data, d, run) {
    if (resolveEffectTargets(data, d, run, 'self').length === 0) return
    for (const side of ['player', 'enemy'] as const) clearScreens(data, d, side, run.owner)
  },
  placeField(data, d, run, effect) {
    if (resolveEffectTargets(data, d, run, 'self').length === 0) return
    const layer = data.fieldEffects[effect.fieldId].layer
    if (layer !== 'weather' && layer !== 'terrain') return
    placeField(
      data,
      d,
      { layer, fieldId: effect.fieldId },
      { source: 'trait', monsterId: run.owner.id }
    )
  },
  placeSideField(data, d, run, effect) {
    // Không có mục tiêu: `if` / `chance` xét trên chủ hiệu ứng.
    if (resolveEffectTargets(data, d, run, 'self').length === 0) return
    placeSideField(data, d, { side: effect.side, fieldId: effect.fieldId }, run.owner)
  },
  setHp(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const maxHp = getMaxHp(data, target)
      target.damageTaken = minBig(maxHp.minus(1), maxHp.times(1 - effect.percent / 100).floor())
    })
  },
  exhaust(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => exhaust(d, target))
  },
  reduceHold(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => reduceHold(data, d, target, effect.turns))
  },
  defend(_data, d, run, effect) {
    for (const target of resolveEffectTargets(_data, d, run, effect.to)) guard(d, target, 'defend')
  },
  provoke(_data, d, run, effect) {
    for (const target of resolveEffectTargets(_data, d, run, effect.to)) guard(d, target, 'provoke')
  },
  focus(data, d, run, effect) {
    forTargets(data, d, run, effect.to, (target) => {
      const volatile = d.battle.volatiles[target.id]
      if (!volatile || volatile.focusStages !== undefined) return
      volatile.focusStages = effect.stages
      log(d, { type: 'focused', monsterId: target.id, stages: effect.stages })
    })
  },
  healReplacement(data, d, run, effect) {
    for (const target of resolveEffectTargets(data, d, run, effect.to)) {
      const volatile = d.battle.volatiles[target.id]
      if (volatile) volatile.healsReplacement = true
    }
  },
  identity(data, d, run, effect) {
    const elementSource =
      effect.elementFrom && resolveEffectTargets(data, d, run, effect.elementFrom)[0]
    const raceSource = effect.raceFrom && resolveEffectTargets(data, d, run, effect.raceFrom)[0]
    forTargets(data, d, run, effect.to, (target) => {
      const elementIds =
        effect.elementIds ??
        (elementSource ? elementSource.elementIds : undefined) ??
        identityElements(data, d, run, effect, target)
      // Mimicry: hệ đã đúng như vậy (chưa đổi, hoặc địa hình đổi mà hệ mới trùng) thì không đổi.
      if (effect.restoreElements || effect.elementIds) {
        if (!raceSource && (!elementIds || sameElements(elementIds, target.elementIds))) return
      }
      changeIdentity(d, target, {
        elementIds,
        raceId: raceSource ? raceSource.raceId : undefined
      })
    })
  },
  castSpellSlot(data, d, run, effect) {
    for (const target of resolveEffectTargets(data, d, run, effect.to)) {
      castAllSlots(data, d, { owner: target, caster: effect.by === 'self' ? run.owner : target })
    }
  },
  copySpellSlot(data, d, run, effect) {
    const sources = resolveEffectTargets(data, d, run, effect.from)
    const slots = sources.flatMap((source) => spellSlotsOf(data, d, source).slots)
    if (slots.length === 0) return
    for (const target of resolveEffectTargets(data, d, run, effect.to)) {
      const volatile = d.battle.volatiles[target.id]
      if (volatile) volatile.gainedSpellSlots = [...(volatile.gainedSpellSlots ?? []), ...slots]
    }
  },
  guaranteeSpellSlot(data, d, run, effect) {
    for (const target of resolveEffectTargets(data, d, run, effect.to)) {
      const volatile = d.battle.volatiles[target.id]
      if (volatile) volatile.spellSlotGuaranteed = true
    }
  },
  shareEquipmentTraits(data, d, run, effect) {
    const traits = equipmentTraitInstances(data, run.owner)
    for (const target of resolveEffectTargets(data, d, run, effect.to)) {
      for (const { id, level } of traits) gainTrait(data, d, target, id, level)
    }
  },
  tempSkill(data, d, run, effect) {
    for (const target of resolveEffectTargets(data, d, run, effect.to)) {
      const volatile = d.battle.volatiles[target.id]
      if (!volatile) continue
      for (let i = 0; i < (effect.count ?? 1); i++) {
        const skillId = effect.skillId ?? randomTempSkill(data, d, target, effect)
        if (!skillId) continue
        volatile.tempSkillIds = [...new Set([...(volatile.tempSkillIds ?? []), skillId])]
      }
    }
  }
}

/** Chạy các hiệu ứng của một lần kích hoạt theo thứ tự (dừng nếu chủ trait rời trận). */
export function runTraitEffects(
  data: GameData,
  d: Draft,
  run: EffectRun,
  effects: readonly TraitEffect[]
): void {
  for (const effect of effects) {
    // Ép kiểu vì Record theo loại bảo đảm runner khớp đúng hiệu ứng có cùng `do`.
    const runner = EFFECT_RUNNERS[effect.do] as Runner<typeof effect.do>
    runner(data, d, { ...run, filter: effect.if, chance: effect.chance }, effect as never)
  }
}

/** Sticky Hold: quái phe địch giữ món, không bị lấy / tráo. */
function keepsItemsFrom(data: GameData, d: Draft, owner: Monster, holder: Monster): boolean {
  if (sideOf(d, owner.id) === sideOf(d, holder.id)) return false
  return hasAbilityFlag(data, holder, 'keepsItems', monsterBattleContext(data, d, holder))
}

/** Tìm quái theo id (undefined khi không còn trong trận, ví dụ đã bị bắt). */
export function findMonsterSafe(d: Draft, id: string | undefined): Monster | undefined {
  if (id === undefined) return undefined
  return d.party.find((m) => m.id === id) ?? d.battle.enemies.find((m) => m.id === id)
}
