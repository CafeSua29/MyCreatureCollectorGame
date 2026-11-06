// Đổi bậc trận do quái hoặc bẫy gây ra (mục "Bậc trận và trait đổi bậc" ở battle-traits.md): điểm duy nhất xét chặn hạ bậc
// (Mist, trait kiểu Clear Body) và kích hoạt trait đổi bậc (Intimidate, Speed Boost, Moxie,
// Defiant). Hạ gục (Moxie) gọi từ recordKnockout ở hitTraits.ts. Skill, vật phẩm ném, trait và bẫy đều đi qua đây.

import { isFainted } from '../monster'
import {
  forEachTraitHook,
  hasAbilityFlag,
  hasStatusFlag,
  hasTraitFlag,
  stageTraitEffects,
  statLowerBlockingField,
  statLowerBlockingTrait
} from '../registries'
import { emitTraitEvent } from './eventQueue'
import type { StageTraitEvent } from '../registries'
import type { GameData, Monster, StageStat } from '../model'
import {
  currentTurnLog,
  Draft,
  aliveOnField,
  changeStage,
  findMonster,
  log,
  monsterBattleContext,
  opponentOf,
  sideOf
} from './draft'
import { isShielded } from './volatiles'

/** Ai gây ra lần đổi bậc: chính quái đó, đồng đội, quái địch, hay bẫy của phe địch. */
export type StageCause = 'self' | 'ally' | 'foe' | 'hazard'

interface StageCauseRule {
  /** Hiệu ứng theo phe chặn hạ bậc (Mist) có tác dụng không (Mist không chặn Sticky Web). */
  fieldBlocks: boolean
  /** Trait miễn hạ bậc (statLowerImmunity) có tác dụng không. */
  traitBlocks: boolean
  /** Bị hạ bậc thật thì chạy trait stageOnStatLowered (như Pokémon: chỉ do phe địch). */
  triggersStatLowered: boolean
}

const STAGE_CAUSE_RULES: Readonly<Record<StageCause, StageCauseRule>> = {
  self: { fieldBlocks: false, traitBlocks: false, triggersStatLowered: false },
  ally: { fieldBlocks: true, traitBlocks: true, triggersStatLowered: false },
  foe: { fieldBlocks: true, traitBlocks: true, triggersStatLowered: true },
  hazard: { fieldBlocks: false, traitBlocks: true, triggersStatLowered: true }
}

/** Nguyên nhân khi quái `sourceId` đổi bậc quái `targetId`. */
export function stageCause(d: Draft, sourceId: string, targetId: string): StageCause {
  if (sourceId === targetId) return 'self'
  return sideOf(d, sourceId) === sideOf(d, targetId) ? 'ally' : 'foe'
}

export interface StageChange {
  targetId: string
  stat: StageStat
  delta: number
  cause: StageCause
  /** Quái gây ra (Mirror Armor phản lại hạ bậc lên nó); bỏ trống = không rõ / bẫy. */
  sourceId?: string
  /** Lần đổi bậc do Mirror Armor phản / Opportunist chép: không phản / chép tiếp (chống lặp). */
  echoed?: true
}

/** Hạ bậc bị chặn (Mist hoặc trait) thì ghi log và trả true. */
function isLowerBlocked(data: GameData, d: Draft, target: Monster, change: StageChange): boolean {
  const rule = STAGE_CAUSE_RULES[change.cause]
  const { stat } = change
  if (rule.fieldBlocks) {
    const fieldId = statLowerBlockingField(data, d.battle.field, sideOf(d, target.id))
    if (fieldId !== null) {
      log(d, { type: 'stageBlockedByField', monsterId: target.id, stat, fieldId })
      return true
    }
  }
  if (rule.traitBlocks) {
    // Bối cảnh trận để hook từ hào quang / cộng hưởng / trận pháp cũng chặn được.
    const traitId = statLowerBlockingTrait(
      data,
      target,
      stat,
      monsterBattleContext(data, d, target)
    )
    if (traitId !== null) {
      log(d, { type: 'stageBlockedByTrait', monsterId: target.id, stat, traitId })
      return true
    }
  }
  return false
}

const DEFENSE_TO_ATTACK: Partial<Record<StageStat, StageStat>> = {
  defense: 'attack',
  spDefense: 'spAttack'
}

/** Harmony của WILDERLOCKE: quái khác trên sân đổi bậc thì quái mang hook chép đúng chỉ số đó. */
function copyStagesToOthers(
  data: GameData,
  d: Draft,
  source: Monster,
  stat: StageStat,
  changed: number
): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      if (monster.id === source.id) continue
      let copies = false
      forEachTraitHook(
        data,
        monster,
        (handler, params) => {
          if (handler.copiesStagesOf?.(params).includes(stat)) copies = true
        },
        monsterBattleContext(data, d, monster)
      )
      if (copies) {
        applyStageChange(data, d, {
          targetId: monster.id,
          stat,
          delta: changed,
          cause: 'self',
          echoed: true
        })
      }
    }
  }
}

/**
 * Đổi bậc một quái: quái gục thì bỏ qua; hạ bậc thì xét chặn theo nguyên nhân; bị phe địch hạ bậc
 * thật (sau kẹp giới hạn) thì chạy trait stageOnStatLowered của nó.
 */
export function applyStageChange(data: GameData, d: Draft, rawChange: StageChange): void {
  const target = findMonster(d, rawChange.targetId)
  if (isFainted(data, target)) return
  const ctx = monsterBattleContext(data, d, target)
  // Savage của WILDERLOCKE: đổi bậc thủ thành đổi bậc công cùng loại.
  const change: StageChange =
    hasAbilityFlag(data, target, 'defenseStagesToAttack', ctx) && DEFENSE_TO_ATTACK[rawChange.stat]
      ? { ...rawChange, stat: DEFENSE_TO_ATTACK[rawChange.stat] as StageStat }
      : rawChange
  if (change.delta < 0 && isLowerBlocked(data, d, target, change)) return
  if (change.delta < 0 && reflectsLower(data, d, target, change)) return
  if (change.delta > 0 && blocksGain(data, d, target)) return
  if (change.delta < 0 && change.cause !== 'self' && blocksLoss(data, target)) return
  const delta = scaledDelta(data, d, target, change.delta)
  if (delta === 0) return
  const changed = changeStage(data, d, target.id, change.stat, delta)
  const turnLog = changed === 0 ? undefined : currentTurnLog(d, target.id)
  if (turnLog && changed > 0) turnLog.statsRaised = true
  if (turnLog && changed < 0) turnLog.statsLowered = true
  // Reflect của WILDERLOCKE: đổi bậc bất kỳ cũng áp lên quái gây ra.
  if (
    changed !== 0 &&
    !change.echoed &&
    change.sourceId !== undefined &&
    change.sourceId !== target.id &&
    hasAbilityFlag(data, target, 'reflectsAllStages', ctx)
  ) {
    applyStageChange(data, d, {
      targetId: change.sourceId,
      stat: change.stat,
      delta: change.delta,
      cause: 'foe',
      sourceId: target.id,
      echoed: true
    })
  }
  if (changed !== 0 && !change.echoed) copyStagesToOthers(data, d, target, change.stat, changed)
  if (changed > 0) emitTraitEvent(d, { type: 'statGain', subjectId: target.id })
  if (changed > 0 && !change.echoed) copyFoeBoost(data, d, target, { stat: change.stat, changed })
  if (changed < 0) emitTraitEvent(d, { type: 'statLoss', subjectId: target.id })
  if (changed < 0 && STAGE_CAUSE_RULES[change.cause].triggersStatLowered) {
    triggerStageTraits(data, d, target, 'statLowered')
  }
}

/**
 * Mirror Armor: hạ bậc do địch gây (skill, trait; không phải bẫy) phản lại lên quái gây ra, quái
 * mang không bị hạ. Trả về true nếu đã phản.
 */
function reflectsLower(data: GameData, d: Draft, target: Monster, change: StageChange): boolean {
  if (change.cause !== 'foe' || change.echoed || change.sourceId === undefined) return false
  const ctx = monsterBattleContext(data, d, target)
  if (!hasAbilityFlag(data, target, 'reflectsStatDrops', ctx)) return false
  const source = findMonster(d, change.sourceId)
  log(d, { type: 'stageReflected', monsterId: target.id, targetId: source.id, stat: change.stat })
  applyStageChange(data, d, {
    targetId: source.id,
    stat: change.stat,
    delta: change.delta,
    cause: 'foe',
    sourceId: target.id,
    echoed: true
  })
  return true
}

/** Opportunist: địch trên sân tăng bậc thì quái mang tăng đúng bậc đó (không chép lần chép). */
function copyFoeBoost(
  data: GameData,
  d: Draft,
  target: Monster,
  { stat, changed }: { stat: StageStat; changed: number }
): void {
  for (const { monster: foe } of aliveOnField(data, d, opponentOf(sideOf(d, target.id)))) {
    const ctx = monsterBattleContext(data, d, foe)
    if (!hasAbilityFlag(data, foe, 'copiesFoeBoosts', ctx)) continue
    applyStageChange(data, d, {
      targetId: foe.id,
      stat,
      delta: changed,
      cause: 'self',
      echoed: true
    })
  }
}

/** Không được tăng bậc: trạng thái kiểu Feared hoặc trait / hào quang chặn tăng chỉ số. */
function blocksGain(data: GameData, d: Draft, target: Monster): boolean {
  if (hasStatusFlag(data, target, (handler, params) => handler.blocksStatGain?.(params)))
    return true
  const ctx = monsterBattleContext(data, d, target)
  const view = { data, self: target, selfCtx: ctx }
  return hasTraitFlag(
    data,
    target,
    (handler, params) => handler.blocksStatGain?.(params, view),
    ctx
  )
}

/** Không bị giảm bậc do quái khác: trạng thái kiểu Warded. */
const blocksLoss = (data: GameData, target: Monster): boolean =>
  hasStatusFlag(data, target, (handler, params) => handler.blocksStatLoss?.(params))

/**
 * Số bậc sau hệ số của trait (stageMultiplier: tăng / giảm nhiều hơn hoặc ít hơn): làm tròn,
 * tối thiểu 1 bậc khi hệ số > 0; hệ số 0 = không đổi.
 */
function scaledDelta(data: GameData, d: Draft, target: Monster, delta: number): number {
  let factor = 1
  forEachTraitHook(
    data,
    target,
    (handler, params, scale) => {
      const multiplier = handler.stageChangeMultiplier?.(params, scale)
      if (multiplier) factor *= delta > 0 ? multiplier.gain : multiplier.loss
    },
    monsterBattleContext(data, d, target)
  )
  if (factor === 1) return delta
  if (factor === 0) return 0
  // Hệ số âm đảo chiều đổi bậc (Contrary), độ lớn theo |hệ số|.
  return Math.sign(delta * factor) * Math.max(1, Math.round(Math.abs(delta * factor)))
}

/**
 * Chạy trait đổi bậc của quái khi `event` xảy ra (quái đã gục thì không). Mỗi trait ghi log
 * `traitTriggered` một lần trước các thay đổi của nó. Địch đang núp sau thế thân không bị đổi bậc
 * (như Intimidate trong Pokémon).
 */
export function triggerStageTraits(
  data: GameData,
  d: Draft,
  owner: Monster,
  event: StageTraitEvent
): void {
  if (isFainted(data, owner)) return
  let lastTraitId: string | null = null
  for (const { traitId, effect } of stageTraitEffects(data, owner, event)) {
    if (traitId !== lastTraitId) log(d, { type: 'traitTriggered', monsterId: owner.id, traitId })
    lastTraitId = traitId
    const targets =
      effect.target === 'self'
        ? [owner]
        : aliveOnField(data, d, opponentOf(sideOf(d, owner.id)))
            .map((entry) => entry.monster)
            .filter((foe) => !isShielded(d, owner, foe))
    for (const target of targets) {
      applyStageChange(data, d, {
        targetId: target.id,
        stat: effect.stat,
        delta: effect.stages,
        cause: stageCause(d, owner.id, target.id),
        sourceId: owner.id
      })
    }
  }
}
