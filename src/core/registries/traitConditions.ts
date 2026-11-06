// Tính điều kiện và bộ đếm của "ngôn ngữ" trait (traitDsl.ts) từ một góc nhìn (DslView): quái mang
// trait, quái của sự kiện, mục tiêu đòn... Hàm thuần, không sửa gì.

import { raceMatchesAny } from './races'
import { isLayerFieldIn } from './fieldIds'
import { abilityTraitId, activeTransform, getCurrentHp, getMaxHp, isGrounded } from '../monster'
import { BIG_ZERO, assertNever, minBig, type Decimal } from '../shared'
import {
  NON_HP_STATS,
  type GameData,
  type Monster,
  type MonsterBattleContext,
  type NonHpStat,
  type Skill,
  type StatusKind,
  type TurnLog
} from '../model'
import type {
  CounterSpec,
  DslCondition,
  DslWho,
  MoveFlagCondition,
  RecordAmount,
  RecordScope
} from './traitDsl'
import { equipmentStatLineCount, equipmentStatPercents } from './traitHooks'
import { staminaOf } from './combatTraitQueries'

/** Góc nhìn khi tính điều kiện: các quái liên quan (kèm bối cảnh trận nếu có) và sự kiện. */
export interface DslView {
  data: GameData
  self: Monster
  selfCtx?: MonsterBattleContext
  subject?: Monster
  subjectCtx?: MonsterBattleContext
  other?: Monster
  otherCtx?: MonsterBattleContext
  /** Mục tiêu đòn (pha sát thương: bên nhận). */
  target?: Monster
  targetCtx?: MonsterBattleContext
  /** Quái đánh (pha sát thương: bên đánh). */
  attacker?: Monster
  attackerCtx?: MonsterBattleContext
  skill?: Skill
  /** Lượng của sự kiện (sát thương vừa gây / nhận, máu vừa hồi). */
  amount?: Decimal
  critical?: boolean
  /** Hệ số khắc chế của đòn của sự kiện (> 1 = khắc hệ). */
  effectiveness?: number
  /** Hành động do trait / minion gây ra (không phải lượt của quái hành động). */
  reactive?: boolean
}

/** Quái và bối cảnh của `who` trong góc nhìn; không có thì undefined. */
export function resolveWho(
  view: DslView,
  who: DslWho
): { monster: Monster; ctx?: MonsterBattleContext } | undefined {
  switch (who) {
    case 'self':
      return { monster: view.self, ctx: view.selfCtx }
    case 'subject':
      return view.subject ? { monster: view.subject, ctx: view.subjectCtx } : undefined
    case 'other':
      return view.other ? { monster: view.other, ctx: view.otherCtx } : undefined
    case 'target':
      return view.target ? { monster: view.target, ctx: view.targetCtx } : undefined
    case 'attacker':
      return view.attacker ? { monster: view.attacker, ctx: view.attackerCtx } : undefined
    default:
      return assertNever(who)
  }
}

/** Nhật ký lượt hiện tại của quái `who` (VolatileState.turnLog); lượt khác / ngoài trận = undefined. */
function turnLogOf(view: DslView, who: DslWho): TurnLog | undefined {
  const found = resolveWho(view, who)
  const log = found?.ctx?.volatiles[found.monster.id]?.turnLog
  return log !== undefined && log.turn === found?.ctx?.battleTurn ? log : undefined
}

/** Tỉ lệ máu hiện tại / max HP trong [0, 1]. */
export function hpRatioOf(data: GameData, monster: Monster): number {
  return getCurrentHp(data, monster).div(getMaxHp(data, monster)).toNumber()
}

export const statusCount = (data: GameData, monster: Monster, kind?: StatusKind): number =>
  monster.statuses.filter((s) => kind === undefined || data.statuses[s.statusId].kind === kind)
    .length

const hasAnyStatus = (monster: Monster, statusIds: readonly string[]): boolean =>
  monster.statuses.some((s) => statusIds.includes(s.statusId))

/** Quái phe của `ctx` đang trên sân: chính nó và đồng đội. */
const sideOnField = (monster: Monster, ctx: MonsterBattleContext | undefined): Monster[] => [
  monster,
  ...(ctx?.allies ?? [])
]

const percentOf = (part: Decimal, whole: Decimal): number =>
  whole.lte(0) ? 0 : part.div(whole).times(100).toNumber()

/** Tổng một mục bản ghi trận của quái (hoặc cả phe của nó); thiếu bối cảnh trận thì 0. */
export function recordTotal(
  ctx: MonsterBattleContext | undefined,
  key: RecordAmount,
  scope: RecordScope | undefined
): Decimal {
  if (!ctx) return BIG_ZERO
  if (scope === undefined) return ctx.record[key]
  const ids = scope === 'all' ? Object.keys(ctx.records) : ctx.teamIds
  return ids.reduce((sum, id) => sum.plus(ctx.records[id]?.[key] ?? BIG_ZERO), BIG_ZERO)
}

/** Giá trị một bộ đếm; thiếu bối cảnh trận thì các bộ đếm trận là 0. */
export function counterValue(view: DslView, spec: CounterSpec): number {
  const found = resolveWho(view, spec.who ?? 'self')
  const raw = found
    ? baseCounter(view.data, found.monster, found.ctx, spec, view.skill, view.target?.id)
    : 0
  const value = spec.divisor === undefined ? raw : Math.floor(raw / spec.divisor)
  const total = value + (spec.bonus ?? 0)
  return spec.max === undefined ? total : Math.min(spec.max, total)
}

function baseCounter(
  data: GameData,
  monster: Monster,
  ctx: MonsterBattleContext | undefined,
  spec: CounterSpec,
  skill: Skill | undefined,
  targetId?: string
): number {
  const record = ctx?.record
  const skillElementOf = (id: string): string => data.skills[id]?.elementId ?? ''
  switch (spec.of) {
    case 'turnsOnField':
      return ctx?.turnsOnField ?? 0
    case 'berriesEaten':
      return record?.berriesEaten ?? 0
    case 'stockpile':
      return ctx?.volatiles[monster.id]?.stockpile ?? 0
    case 'stamina':
      return staminaOf(data, monster, ctx)
    case 'skillUsesOnTarget':
      // Số lần quái đã dùng skill đang xét lên mục tiêu đang xét (Decompose, Short Circuit).
      return skill && targetId ? (record?.skillTargetUses?.[`${skill.id}|${targetId}`] ?? 0) : 0
    case 'skillUsesOfElement':
      return (spec.elementIds ?? []).reduce((sum, id) => sum + (record?.elementUses?.[id] ?? 0), 0)
    case 'knownSkillsOfElement':
      return monster.skillIds.filter((id) => spec.elementIds?.includes(skillElementOf(id))).length
    case 'skillUses':
      // Số lần quái đã dùng skill đang xét trong trận (Trump Card).
      return skill ? (record?.skillUses?.[skill.id] ?? 0) : 0
    case 'skillStreak': {
      // Số lần liên tiếp quái dùng skill đang xét (Fury Cutter, Rollout); lượt khác / skill khác = 0.
      const streak = ctx?.volatiles[monster.id]?.skillStreak
      return streak && streak.turn === ctx?.battleTurn ? streak.count : 0
    }
    case 'fieldStreak': {
      // Số lượt liên tiếp có quái (bất kỳ) dùng skill đang xét, tính cả lượt này (Echoed Voice).
      const streak = skill ? ctx?.counters.fieldStreaks?.[skill.id] : undefined
      return streak && streak.turn === ctx?.battleTurn ? streak.count : 0
    }
    case 'turnsTaken':
      return record?.turnsTaken ?? 0
    case 'missingHpPercent':
      return (1 - hpRatioOf(data, monster)) * 100
    case 'hpPercent':
      return hpRatioOf(data, monster) * 100
    case 'alliesOnField':
      return ctx?.allies.length ?? 0
    case 'livingAllies':
      return ctx?.livingAllies ?? 1
    case 'livingFoes':
      return ctx?.livingFoes ?? 0
    case 'livingDiff':
      return (ctx?.livingAllies ?? 1) - (ctx?.livingFoes ?? 0)
    case 'faintedAllies':
      return ctx?.faintedAllies ?? 0
    case 'faintedFoes':
      return ctx?.faintedFoes ?? 0
    case 'faintedDiff':
      return (ctx?.faintedAllies ?? 0) - (ctx?.faintedFoes ?? 0)
    case 'deathsTotal':
      return ctx?.counters.deaths ?? 0
    case 'knockouts':
      return ctx?.knockouts ?? 0
    case 'timesDamaged':
      return record?.timesDamaged ?? 0
    case 'attacks':
      return record?.attacks ?? 0
    case 'casts':
      return record?.casts ?? 0
    case 'defends':
      return record?.defends ?? 0
    case 'provokes':
      return record?.provokes ?? 0
    case 'revivals':
      return record?.revivals ?? 0
    case 'deaths':
      return record?.deaths ?? 0
    case 'buffs':
      return statusCount(data, monster, 'buff')
    case 'debuffs':
      return statusCount(data, monster, 'debuff')
    case 'statuses':
      return spec.statusIds
        ? monster.statuses.filter((s) => spec.statusIds?.includes(s.statusId)).length
        : monster.statuses.length
    case 'minionStacks':
      return (ctx?.volatiles[monster.id]?.minions ?? []).reduce((sum, m) => sum + m.stacks, 0)
    case 'minionTypes':
      return ctx?.volatiles[monster.id]?.minions?.length ?? 0
    case 'traitsGained':
      return record?.traitsGained ?? 0
    case 'sideCasts':
      return ctx ? ctx.counters.casts[ctx.side] : 0
    case 'totalCasts':
      return ctx ? ctx.counters.casts.player + ctx.counters.casts.enemy : 0
    case 'foesWithStatus':
      return (ctx?.foes ?? []).filter((foe) => hasAnyStatus(foe, spec.statusIds ?? [])).length
    case 'foesWithDebuffs':
      return (ctx?.foes ?? []).filter((foe) => statusCount(data, foe, 'debuff') > 0).length
    case 'raceOnSide':
      return sideOnField(monster, ctx).filter((m) =>
        raceMatchesAny(data, m.raceId, spec.raceIds ?? [])
      ).length
    case 'traitOnSide':
      return sideOnField(monster, ctx).filter(
        (m) => m.id !== monster.id && m.traits.some((trait) => trait.id === spec.traitId)
      ).length
    case 'sameRaceOnSide':
      return sideOnField(monster, ctx).filter((m) => m.raceId === monster.raceId).length
    case 'sameElementOnSide':
      return sideOnField(monster, ctx).filter((m) =>
        m.elementIds.some((id) => monster.elementIds.includes(id))
      ).length
    case 'elementOnSide':
      return sideOnField(monster, ctx).filter((m) =>
        m.elementIds.some((id) => spec.elementIds?.includes(id))
      ).length
    case 'distinctElementsOnSide':
      return new Set(sideOnField(monster, ctx).flatMap((m) => m.elementIds.slice(0, 1))).size
    case 'damageTakenPercent':
      return percentOf(record?.damageTaken ?? BIG_ZERO, getMaxHp(data, monster))
    case 'damageDealtPercent':
      return percentOf(record?.damageDealt ?? BIG_ZERO, getMaxHp(data, monster))
    case 'healingReceivedPercent':
      return percentOf(record?.healingReceived ?? BIG_ZERO, getMaxHp(data, monster))
    case 'sealedSkills':
      return ctx?.volatiles[monster.id]?.sealedSkillIds?.length ?? 0
    case 'foeBuffs':
      return (ctx?.foes ?? []).reduce((sum, foe) => sum + statusCount(data, foe, 'buff'), 0)
    case 'equipmentStatLines':
      return spec.stat ? equipmentStatLineCount(data, monster, spec.stat) : 0
    case 'equipmentStatPercent':
      return spec.stat ? equipmentStatPercents(data, monster)[spec.stat] : 0
    case 'stageTotal':
      return Object.values(ctx?.stages ?? {}).reduce((sum, step) => sum + Math.max(0, step ?? 0), 0)
    default:
      return assertNever(spec.of)
  }
}

/** Chỉ số cuối (number, chỉ để so sánh) của quái theo bối cảnh. */
type StatReader = (monster: Monster, stat: NonHpStat) => Decimal

/** Mọi điều kiện đều đúng (danh sách rỗng / bỏ trống = đúng). */
export function checkAllConditions(
  view: DslView,
  conditions: readonly DslCondition[] | undefined,
  readStat?: StatReader
): boolean {
  return (conditions ?? []).every((condition) => isConditionMet(view, condition, readStat))
}

function isConditionMet(view: DslView, condition: DslCondition, readStat?: StatReader): boolean {
  const { data } = view
  const whoOf = (who: DslWho): Monster | undefined => resolveWho(view, who)?.monster
  switch (condition.if) {
    case 'hpBelow': {
      const monster = whoOf(condition.who)
      return monster !== undefined && hpRatioOf(data, monster) * 100 < condition.percent
    }
    case 'hpAbove': {
      const monster = whoOf(condition.who)
      return monster !== undefined && hpRatioOf(data, monster) * 100 > condition.percent
    }
    case 'hasStatus': {
      const monster = whoOf(condition.who)
      if (!monster) return false
      const has = (id: string): boolean => monster.statuses.some((s) => s.statusId === id)
      return condition.all ? condition.statusIds.every(has) : condition.statusIds.some(has)
    }
    case 'lacksStatus': {
      const monster = whoOf(condition.who)
      return monster !== undefined && !hasAnyStatus(monster, condition.statusIds)
    }
    case 'statusCount': {
      const monster = whoOf(condition.who)
      return monster !== undefined && statusCount(data, monster, condition.kind) >= condition.min
    }
    case 'noStatus': {
      const monster = whoOf(condition.who)
      return monster !== undefined && statusCount(data, monster, condition.kind) === 0
    }
    case 'category':
      return view.skill !== undefined && condition.categories.includes(view.skill.category)
    case 'singleTarget':
      return view.skill?.target === 'enemy' || view.skill?.target === 'ally'
    case 'defending':
    case 'provoking': {
      const found = resolveWho(view, condition.who)
      const volatile = found?.ctx?.volatiles[found.monster.id]
      const turn = found?.ctx?.battleTurn
      return condition.if === 'defending'
        ? turn !== undefined && volatile?.defending === turn
        : turn !== undefined && volatile?.provoking === turn
    }
    case 'counterAtLeast':
      return counterValue(view, condition.counter) >= condition.min
    case 'counterBelow':
      return counterValue(view, condition.counter) < condition.max
    case 'race': {
      const monster = whoOf(condition.who)
      return monster !== undefined && raceMatchesAny(view.data, monster.raceId, condition.raceIds)
    }
    case 'sameRace':
      return whoOf(condition.who)?.raceId === view.self.raceId
    case 'element': {
      const monster = whoOf(condition.who)
      return monster?.elementIds.some((id) => condition.elementIds.includes(id)) ?? false
    }
    case 'sameElement': {
      const monster = whoOf(condition.who)
      return monster?.elementIds.some((id) => view.self.elementIds.includes(id)) ?? false
    }
    case 'sameSide': {
      const monster = whoOf(condition.who)
      return [view.self, ...(view.selfCtx?.allies ?? [])].some((m) => m.id === monster?.id)
    }
    case 'isSelf':
      return whoOf(condition.who)?.id === view.self.id
    case 'notSelf': {
      const monster = whoOf(condition.who)
      return monster !== undefined && monster.id !== view.self.id
    }
    case 'selfDead':
      return getCurrentHp(data, view.self).lte(0)
    case 'damageAbove': {
      const subject = condition.who ? whoOf(condition.who) : (view.subject ?? view.target)
      if (!subject || !view.amount) return false
      const threshold = damageThreshold(view, subject, condition, readStat)
      return threshold !== undefined && view.amount.gt(threshold)
    }
    case 'statHigher':
    case 'statLower':
      return compareStat(view, condition, readStat)
    case 'reactive':
      return (view.reactive ?? false) === condition.value
    case 'noDamageSinceTurnEnd':
      return view.selfCtx?.volatiles[view.self.id]?.damagedSinceTurnEnd !== true
    case 'partyAllRace': {
      const side = sideOnField(view.self, view.selfCtx)
      return side.every((m) => m.raceId === view.self.raceId)
    }
    case 'bossBattle':
      return (view.selfCtx?.isBossBattle ?? false) === condition.value
    case 'levelOdd':
      return (view.self.level % 2 === 1) === condition.value
    case 'noGainedStats': {
      const stages = view.selfCtx?.stages ?? {}
      const flat = view.selfCtx?.volatiles[view.self.id]?.flatStats ?? {}
      return (condition.stats ?? NON_HP_STATS).every(
        (stat) => !stages[stat] && flat[stat] === undefined
      )
    }
    case 'critical':
      return view.critical === true
    case 'superEffective':
      return view.effectiveness !== undefined && view.effectiveness > 1
    case 'notVeryEffective':
      return view.effectiveness !== undefined && view.effectiveness > 0 && view.effectiveness < 1
    case 'counterMultipleOf': {
      const value = counterValue(view, condition.counter)
      return value > 0 && value % condition.every === 0
    }
    case 'skillPriority':
      return view.skill !== undefined && view.skill.priority >= condition.min
    case 'facing': {
      // Hai quái phe đối nhau đứng cùng chỉ số ô (ô 0 đối ô 0); quái lớn đứng mọi ô nên đối mọi quái.
      const other = resolveWho(view, condition.who)
      const own = view.selfCtx?.slotIndexes ?? []
      const theirs = other?.ctx?.slotIndexes ?? []
      return (
        other !== undefined &&
        other.ctx?.side !== view.selfCtx?.side &&
        own.some((slot) => theirs.includes(slot))
      )
    }
    case 'skillPowerAtMost':
      return view.skill !== undefined && view.skill.power <= condition.power
    case 'lastSkillCategory': {
      const category = resolveWho(view, condition.who)?.ctx?.record.lastSkillCategory
      return category !== undefined && condition.categories.includes(category)
    }
    case 'skillSameElement':
      return (
        view.skill !== undefined &&
        view.self.elementIds.includes(view.skill.elementId) === condition.value
      )
    case 'moveFlag':
      return view.skill !== undefined && skillHasFlag(view.skill, condition.flags)
    case 'skillElement':
      return view.skill !== undefined && condition.elementIds.includes(view.skill.elementId)
    case 'skill':
      return view.skill !== undefined && condition.skillIds.includes(view.skill.id)
    case 'skillTarget':
      return view.skill !== undefined && condition.targets.includes(view.skill.target)
    case 'skillTag':
      return view.skill?.tags?.some((tag) => condition.tags.includes(tag)) ?? false
    case 'fieldActive': {
      const field = view.selfCtx?.field
      if (!field) return false
      return condition.fieldIds
        ? isLayerFieldIn(data, field, condition.layer, condition.fieldIds)
        : field[condition.layer].id !== data.config.field.defaults[condition.layer]
    }
    case 'roomActive': {
      const rooms = view.selfCtx?.field.rooms ?? []
      return rooms.some((room) => condition.fieldIds.includes(room.id))
    }
    case 'grounded': {
      const found = resolveWho(view, condition.who)
      if (!found) return false
      return isGrounded(data, found.monster, found.ctx?.field) === condition.value
    }
    case 'holdsItem': {
      const found = resolveWho(view, condition.who)
      if (!found) return false
      const { monster } = found
      const tags = condition.tags
      // Món bị tắt coi như không cầm (Fling, Natural Gift thất bại trong Magic Room như Pokémon).
      const disabled = condition.usable === true && found.ctx?.itemsDisabled === true
      const holds =
        !disabled &&
        monster.equipment.some((entry) => {
          if (!tags) return true
          const item = entry.storage === 'stack' ? data.items[entry.itemId] : undefined
          return item?.category === 'held' && (item.tags ?? []).some((tag) => tags.includes(tag))
        })
      return holds === condition.value
    }
    case 'transformed': {
      const monster = whoOf(condition.who)
      const kind = monster ? activeTransform(monster)?.kind : undefined
      return kind !== undefined && (!condition.kinds || condition.kinds.includes(kind))
    }
    case 'actedThisTurn':
      return (turnLogOf(view, condition.who)?.acted === true) === condition.value
    case 'statsChangedThisTurn': {
      const log = turnLogOf(view, condition.who)
      return condition.direction === 'raised'
        ? log?.statsRaised === true
        : log?.statsLowered === true
    }
    case 'hitThisTurn': {
      const byId = condition.by ? whoOf(condition.by)?.id : undefined
      const hit = (turnLogOf(view, condition.who)?.hits ?? []).some(
        (entry) =>
          (!condition.by || entry.by === byId) &&
          (!condition.categories || condition.categories.includes(entry.category))
      )
      return hit === (condition.value ?? true)
    }
    case 'lastSkillFailed': {
      const found = resolveWho(view, condition.who)
      return found?.ctx?.volatiles[found.monster.id]?.lastSkillFailed === true
    }
    case 'not':
      return !checkAllConditions(view, [condition.condition], readStat)
    case 'oppositeGender': {
      const monster = whoOf(condition.who)
      const own = view.self.gender
      return (
        monster !== undefined &&
        own !== 'none' &&
        monster.gender !== 'none' &&
        monster.gender !== own
      )
    }
    case 'allyFaintedLastTurn': {
      const found = resolveWho(view, condition.who)
      const ctx = found?.ctx
      return ctx !== undefined && ctx.counters.faintTurn?.[ctx.side] === ctx.battleTurn - 1
    }
    case 'usedOtherSkills': {
      const found = resolveWho(view, condition.who)
      const skill = view.skill
      if (!found || !skill) return false
      const others = found.monster.skillIds.filter((id) => id !== skill.id)
      const uses = found.ctx?.record.skillUses ?? {}
      return others.length > 0 && others.every((id) => (uses[id] ?? 0) > 0)
    }
    case 'levelAtLeast': {
      const monster = whoOf(condition.who)
      return monster !== undefined && monster.level >= condition.level
    }
    case 'commanded': {
      const found = resolveWho(view, condition.who)
      const commanderId = found?.ctx?.volatiles[found.monster.id]?.commandedBy
      if (commanderId === undefined) return false
      if (condition.speciesIds === undefined) return true
      const commander = found?.ctx?.allies.find((monster) => monster.id === commanderId)
      return commander !== undefined && condition.speciesIds.includes(commander.speciesId)
    }
    case 'hpFellBelow': {
      const monster = whoOf(condition.who)
      if (!monster || view.amount === undefined) return false
      const maxHp = getMaxHp(data, monster)
      const now = getCurrentHp(data, monster)
      const threshold = maxHp.times(condition.percent).div(100)
      return now.lte(threshold) && now.plus(view.amount).gt(threshold)
    }
    case 'foeStatSumLower': {
      const foes = view.selfCtx?.foes ?? []
      if (!readStat || foes.length === 0) return false
      const sum = (stat: NonHpStat): Decimal =>
        foes.reduce((total, foe) => total.plus(readStat(foe, stat)), BIG_ZERO)
      return sum(condition.stat).lt(sum(condition.than))
    }
    case 'abilityOnField': {
      const ctx = view.selfCtx
      const onField = [view.self, ...(ctx?.allies ?? []), ...(ctx?.foes ?? [])]
      return onField.some((monster) => {
        const volatile = ctx?.volatiles[monster.id]
        if (volatile?.abilitySuppressed) return false
        const ability = volatile?.abilityOverride ?? abilityTraitId(data, monster)
        return ability !== null && condition.abilityIds.includes(ability)
      })
    }
    case 'inForm': {
      const formId = whoOf(condition.who)?.battleForm?.speciesId
      return (
        formId !== undefined && (!condition.speciesIds || condition.speciesIds.includes(formId))
      )
    }
    case 'consumedItem': {
      const found = resolveWho(view, condition.who)
      return (
        found?.ctx?.record.lastConsumedItemId !== undefined && found.monster.equipment.length === 0
      )
    }
    case 'fainted': {
      const monster = whoOf(condition.who)
      return monster !== undefined && getCurrentHp(data, monster).lte(0)
    }
    case 'hasAbility': {
      const found = resolveWho(view, condition.who)
      if (!found) return false
      const volatile = found.ctx?.volatiles[found.monster.id]
      if (found.ctx?.abilitySuppressed) return false
      const ability = volatile?.abilityOverride ?? abilityTraitId(data, found.monster)
      return ability !== null && condition.abilityIds.includes(ability)
    }
    case 'previousSkillThisTurn': {
      const previous = view.selfCtx?.previousSkill
      if (!previous || !condition.skillIds.includes(previous.skillId)) return false
      return !condition.sameSide || previous.side === view.selfCtx?.side
    }
    case 'pendingSkill': {
      const pending = resolveWho(view, condition.who)?.ctx?.pendingSkill
      if (!pending) return false
      const category = data.skills[pending.skillId].category
      if (condition.categories && !condition.categories.includes(category)) return false
      return condition.minPriority === undefined || pending.priority >= condition.minPriority
    }
    default:
      return assertNever(condition)
  }
}

/** Ngưỡng sát thương của `damageAbove`: theo max HP hoặc chỉ số thấp nhất (cần `readStat`). */
function damageThreshold(
  view: DslView,
  subject: Monster,
  condition: Extract<DslCondition, { if: 'damageAbove' }>,
  readStat?: StatReader
): Decimal | undefined {
  if (condition.percentOfMaxHp !== undefined) {
    return getMaxHp(view.data, subject).times(condition.percentOfMaxHp).div(100)
  }
  if (!readStat || condition.percentOfLowestStat === undefined) return undefined
  const [first, ...rest] = NON_HP_STATS.map((stat) => readStat(subject, stat))
  const lowest = minBig(first, ...rest)
  return lowest.times(condition.percentOfLowestStat).div(100)
}

function compareStat(
  view: DslView,
  condition: Extract<DslCondition, { if: 'statHigher' | 'statLower' }>,
  readStat?: StatReader
): boolean {
  if (!readStat) return false
  const mine = readStat(view.self, condition.stat)
  const others =
    condition.than === 'target'
      ? view.target
        ? [view.target]
        : []
      : [...(view.selfCtx?.foes ?? [])]
  if (others.length === 0) return false
  const beats = (other: Monster): boolean => {
    const theirs = readStat(other, condition.stat)
    return condition.if === 'statHigher' ? mine.gt(theirs) : mine.lt(theirs)
  }
  return condition.than === 'allFoes' ? others.every(beats) : others.some(beats)
}

/** Skill có một trong các cờ (cờ loại chiêu, tiếp xúc, phản lực). */
function skillHasFlag(skill: Skill, flags: readonly MoveFlagCondition[]): boolean {
  return flags.some((flag) => {
    if (flag === 'contact') return skill.contact === true
    if (flag === 'recoil') return (skill.recoilPercent ?? 0) > 0
    if (flag === 'secondary') return skill.effects.some((effect) => hasChance(effect.params))
    return skill.moveFlags?.includes(flag) === true
  })
}

/** Params hiệu ứng skill có tỉ lệ `chance` < 100 (hiệu ứng phụ; ≥ 100 là chắc chắn, effectChance). */
const hasChance = (params: unknown): boolean =>
  typeof params === 'object' &&
  params !== null &&
  'chance' in params &&
  typeof params.chance === 'number' &&
  params.chance < 100
