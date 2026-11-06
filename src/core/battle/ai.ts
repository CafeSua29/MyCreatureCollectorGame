// AI trận đấu (mục "AI trận đấu" ở battle.md): một AI chấm điểm dùng chung cho quái hoang, boss
// và phe người chơi (tự đánh, script mô phỏng). Chấm điểm từng (skill, mục tiêu) theo sát thương
// dự kiến và hiệu ứng, rồi tung theo trọng số = điểm: mọi lựa chọn có điểm > 0 đều có thể ra,
// điểm càng cao càng dễ ra (chủ project muốn ngẫu nhiên nhiều nhất có thể).
// AI chọn skill hoặc phòng thủ / khiêu khích (máu càng thấp càng muốn): không đổi quái, không dùng
// vật phẩm, không ném bóng. Skill bị chặn (Scorned / Silenced / Seal) không được chọn; skill tạm trong
// trận (trait Siralim) có thể được chọn. Skill có thế (đủ thuần thục) chấm thêm thế mạnh / thế nhanh
// như các ứng viên riêng; Z-Move (docs/rules/z-moves.md) cũng là ứng viên riêng.

import { expectedDamage, newStatsMemo, type StatsMemo } from './damage'
import { reactionEffectsOn } from './elementReactions'
import { isBoobyTrapped } from './boobyTraps'
import { currentStamina, maxStamina, staminaCostOf } from './stamina'
import { getCurrentHp, getMaxHp, holdTurnsLeft, skillMasteryBonus } from '../monster'
import {
  SKILL_EFFECTS,
  meetsSpellRequirements,
  spellAfterEffects,
  spellTargetEffects,
  traitDodgeChance,
  traitSecondaryChanceMultiplier,
  zPowerEffects,
  revealedBodyParts,
  type TraitEffect
} from '../registries'
import {
  BIG_ZERO,
  createRng,
  memoInReadOnlyScope,
  minBig,
  pick,
  pickWeighted,
  runReadOnlyScope,
  type Decimal
} from '../shared'
import type {
  BattleCommand,
  BattleSide,
  GameData,
  GameState,
  Monster,
  MoveStyle,
  Skill,
  TacticWeights
} from '../model'
import { battleSkillIds, isBattleOnlyMove } from '../model'
import {
  Draft,
  actingSlots,
  aliveOnField,
  battleStats,
  damageArena,
  monsterBattleContext,
  opponentOf,
  requireBattle,
  reservesOnSide,
  userField,
  effectiveField
} from './draft'
import { skillAccuracy } from './environment'
import { absorbAiScore } from './elementAbsorb'
import { hitTraitScore, knockoutValueFactor } from './hitTraitScore'
import { allyVersion, comboPartnerInput, isSkillBlocked } from './executeSkill'
import { usableCombos } from './combos'
import { compareSpeed } from './rooms'
import { findEquipmentItem } from '../inventory'
import { battleSkill } from './transform'
import { zMoveBlocker, zMoveFor } from './zMoves'
import { withSuggestedTransforms } from './transformAi'
import { withSynergyEffects } from './skillSynergy'
import { styledSkill, usableStyles } from './moveStyles'
import { canAim, chooseAim, type AimChoice } from './hitLocations'
import { canReach } from './reach'

/** Không nhắm bộ phận: hệ số 1. */
const NO_AIM: AimChoice = { accuracyFactor: 1, damageFactor: 1 }
import { frenziedPlayerSlots } from './frenzy'

/**
 * Trộn vào state.rng khi gợi ý lệnh cho người chơi: tách luồng ngẫu nhiên của AI khỏi luồng của
 * lượt sắp xử lý, để gợi ý không phải đổi state mà vẫn tất định theo seed.
 */
const SUGGEST_RNG_SALT = 0x5eeda1

interface Candidate {
  /** Skill (bỏ trống = lệnh `guard`). */
  skillId?: string
  /** Lệnh phòng thủ / khiêu khích thay cho skill. */
  guard?: 'defend' | 'provoke' | 'rest'
  /** Ô địch được nhắm (chỉ skill `enemy`). */
  target?: number
  /** Thế mạnh / thế nhanh (docs/rules/move-styles.md); bỏ trống = thế thường. */
  style?: MoveStyle
  /** Dùng skill thành Z-Move (docs/rules/z-moves.md). */
  zMove?: true
  /** Nhắm đồng đội bằng skill có `onAlly` (Pollen Puff). */
  targetAlly?: true
  /** Bộ phận địch được nhắm (docs/rules/hit-locations.md); bỏ trống = không nhắm. */
  aim?: string
  score: number
  /** Sát thương dự kiến (đã nhân accuracy) lên từng địch, để quái sau không dồn đòn thừa. */
  plannedDamage: { monsterId: string; amount: Decimal }[]
}

/**
 * Chọn lệnh skill cho mọi quái còn sống trên sân của một bên. RNG đi qua d.rng. `allowCombos`:
 * xét hợp kích kỹ (bỏ trống = có; hành động thêm của trait thì không). AI chỉ đọc draft (trừ d.rng)
 * nên chạy trong phạm vi chỉ đọc để nhớ hook / bối cảnh / max HP đã tính.
 */
export function chooseAiCommands(
  data: GameData,
  d: Draft,
  side: BattleSide,
  options: { allowCombos?: boolean } = {}
): BattleCommand[] {
  return runReadOnlyScope(() => chooseCommands(data, d, side, options))
}

function chooseCommands(
  data: GameData,
  d: Draft,
  side: BattleSide,
  { allowCombos = true }: { allowCombos?: boolean }
): BattleCommand[] {
  const team = teamContext(data, d, side)
  const candidatesOf = unplannedCache(data, d, side, team)
  const combo = allowCombos ? chooseCombo(data, d, { side, team, candidatesOf }) : null
  if (combo) return combo
  // Phối hợp 2 quái: quái sau chấm điểm với HP địch đã trừ sát thương dự kiến của quái trước.
  const planned = new Map<string, Decimal>()
  const commands: BattleCommand[] = []
  // Mỗi phe một Z-Move mỗi trận: quái trước đã chọn Z-Move thì quái sau không chọn nữa.
  let zMoveChosen = false
  // Thực thể hợp thể chọn lệnh cho cả hai ô của nó (docs/rules/battle-merge.md).
  for (const { slot, monster } of actingSlots(data, d, side)) {
    // Chưa có sát thương dự kiến (quái đầu, hoặc quái trước không đánh): dùng lại lựa chọn đã chấm.
    const listed =
      planned.size === 0
        ? candidatesOf(slot, monster)
        : listCandidates(data, d, { side, slot, user: monster, planned, ...team })
    const candidates = zMoveChosen ? listed.filter((candidate) => !candidate.zMove) : listed
    let chosen: Candidate
    ;[chosen, d.rng] = pickCandidate(data, d, candidates, monster)
    if (chosen.zMove) zMoveChosen = true
    for (const { monsterId, amount } of chosen.plannedDamage) {
      planned.set(monsterId, (planned.get(monsterId) ?? BIG_ZERO).plus(amount))
    }
    commands.push(
      chosen.guard !== undefined || chosen.skillId === undefined
        ? { slot, kind: chosen.guard ?? 'defend' }
        : {
            slot,
            kind: 'skill',
            skillId: chosen.skillId,
            target: chosen.target,
            ...(chosen.style ? { style: chosen.style } : {}),
            ...(chosen.zMove ? { zMove: true } : {}),
            ...(chosen.targetAlly ? { targetAlly: true } : {}),
            // Lệnh chỉ nhắm được khi skill gốc nhắm được (Z-Move / chiêu Max có thể khác skill gốc).
            ...(chosen.aim !== undefined && canAim(data.skills[chosen.skillId])
              ? { aim: chosen.aim }
              : {})
          }
    )
  }
  return commands
}

/**
 * Gợi ý lệnh cho phe người chơi bằng AI chung (tự đánh, script mô phỏng). Không đổi state;
 * lệnh trả về hợp lệ cho submitTurn.
 */
export function suggestBattleCommands(
  data: GameData,
  state: GameState,
  { transforms = true, combos = true }: SuggestOptions = {}
): BattleCommand[] {
  const battle = requireBattle(state, 'chooseActions')
  const d: Draft = { ...state, battle, rng: createRng(state.rng ^ SUGGEST_RNG_SALT) }
  // Quái cuồng bạo không nhận lệnh (docs/rules/frenzy.md): lượt của nó AI chọn lúc giải lượt.
  const frenzied = frenziedPlayerSlots(battle)
  const allowCombos = combos && frenzied.length === 0
  const commands = chooseAiCommands(data, d, 'player', { allowCombos }).filter(
    (command) => !frenzied.includes(command.slot)
  )
  return transforms ? withSuggestedTransforms(data, d, commands) : commands
}

/** Tùy chọn tự đánh (docs/rules/auto-battle.md): cho AI biến hình / hợp kích không (mặc định có). */
export interface SuggestOptions {
  transforms?: boolean
  combos?: boolean
}

/**
 * Điểm của lựa chọn tốt nhất của một quái trên sân (cùng thang điểm lệnh); `user` có thể là bản
 * giả định đã biến hình (AI chấm lợi của biến hình). 0 nếu không có lựa chọn nào.
 */
export function bestCandidateScore(
  data: GameData,
  d: Draft,
  { side, slot, user }: { side: BattleSide; slot: number; user: Monster }
): number {
  return runReadOnlyScope(() => {
    const team = teamContext(data, d, side)
    return bestScore(listCandidates(data, d, { side, slot, user, planned: new Map(), ...team }))
  })
}

const bestScore = (candidates: readonly Candidate[]): number =>
  candidates.reduce((best, candidate) => Math.max(best, candidate.score), 0)

/** Quái trên sân / dự bị của hai phe và bộ nhớ chỉ số cho một lần chấm điểm (draft không đổi). */
function teamContext(data: GameData, d: Draft, side: BattleSide): TeamContext {
  return {
    allies: aliveOnField(data, d, side).map((entry) => entry.monster),
    foes: aliveOnField(data, d, opponentOf(side)).map((entry) => entry.monster),
    allyReserves: reservesOnSide(data, d, side),
    foeReserves: reservesOnSide(data, d, opponentOf(side)),
    statsMemo: aiStatsMemo(data, d)
  }
}

/**
 * Bộ nhớ chỉ số dùng chung cho mọi lần chấm điểm trên cùng draft trong phạm vi chỉ đọc (chọn lệnh,
 * xét biến hình gọi bestCandidateScore nhiều lần); ngoài phạm vi thì bộ nhớ mới. StatsMemo chỉ đúng
 * trên một draft không đổi nên khóa theo chính draft.
 */
export const aiStatsMemo = (data: GameData, d: Draft): StatsMemo =>
  memoInReadOnlyScope(AI_STATS_MEMO_TABLE, [data, d], newStatsMemo)

const AI_STATS_MEMO_TABLE = {}

type TeamContext = Omit<ChooserContext, 'side' | 'slot' | 'user' | 'planned'>

/** Lựa chọn của một quái khi chưa có sát thương dự kiến, chấm một lần cho cả lần chọn lệnh. */
type UnplannedCandidates = (slot: number, user: Monster) => Candidate[]

function unplannedCache(
  data: GameData,
  d: Draft,
  side: BattleSide,
  team: TeamContext
): UnplannedCandidates {
  const cache = new Map<number, Candidate[]>()
  return (slot, user) => {
    const cached = cache.get(slot)
    if (cached) return cached
    const candidates = listCandidates(data, d, { side, slot, user, planned: new Map(), ...team })
    cache.set(slot, candidates)
    return candidates
  }
}

/** Tung theo trọng số = điểm; mọi điểm ≤ 0 thì chọn đều (vẫn phải ra lệnh). */
function pickCandidate(
  data: GameData,
  d: Draft,
  candidates: readonly Candidate[],
  user: Monster
): [Candidate, Draft['rng']] {
  if (candidates.length === 0) return [fallbackCandidate(data, d, user), d.rng]
  if (candidates.some((candidate) => candidate.score > 0)) {
    return pickWeighted(d.rng, candidates, (candidate) => Math.max(0, candidate.score))
  }
  return pick(d.rng, candidates)
}

/**
 * Không có lựa chọn nào dùng được (ví dụ chỉ có skill `ally` mà không còn đồng đội): vẫn ra skill
 * đầu tiên không phải chờ, lúc xử lý sẽ ghi noTarget như lệnh của người chơi; mọi skill đang chờ
 * (hold) thì phòng thủ.
 */
function fallbackCandidate(data: GameData, d: Draft, user: Monster): Candidate {
  const ready = battleSkillIds(user).find(
    (id) => holdTurnsLeft(d.battle, user, data.skills[id]) === 0
  )
  if (ready === undefined) return { guard: 'defend', score: 0, plannedDamage: [] }
  return { skillId: ready, score: 0, plannedDamage: [] }
}

interface ChooserContext {
  side: BattleSide
  slot: number
  user: Monster
  planned: ReadonlyMap<string, Decimal>
  /** Quái còn sống trên sân của phe mình (kể cả user) và phe địch. */
  allies: readonly Monster[]
  foes: readonly Monster[]
  /** Quái dự bị còn sống của phe mình và phe địch. */
  allyReserves: readonly Monster[]
  foeReserves: readonly Monster[]
  /** Bộ nhớ chỉ số của lần chấm điểm này (draft không đổi trong lúc chấm). */
  statsMemo: StatsMemo
}

/** Đồng đội còn sống trên sân của quái đang chọn lệnh (không gồm chính nó; synergy). */
const partnersOf = (ctx: ChooserContext): readonly Monster[] =>
  ctx.allies.filter((ally) => ally.id !== ctx.user.id)

/** Một cách nhắm của skill: các mục tiêu, có phải phe mình, ô địch được nhắm (skill `enemy`). */
interface TargetChoice {
  targets: readonly Monster[]
  isAlly: boolean
  target?: number
}

/** Mọi cách nhắm của skill theo `target` của nó (không có mục tiêu thì rỗng). */
function targetChoices(
  data: GameData,
  d: Draft,
  ctx: ChooserContext,
  skill: Skill
): TargetChoice[] {
  const opponents = aliveOnField(data, d, opponentOf(ctx.side))
  const ally = aliveOnField(data, d, ctx.side).find((entry) => entry.monster.id !== ctx.user.id)
  switch (skill.target) {
    case 'enemy':
      return opponents.map(({ slot, monster }) => ({
        targets: [monster],
        isAlly: false,
        target: slot
      }))
    case 'allEnemies':
      return opponents.length > 0
        ? [{ targets: opponents.map((entry) => entry.monster), isAlly: false }]
        : []
    case 'self':
      return [{ targets: [ctx.user], isAlly: true }]
    case 'ally':
      return ally ? [{ targets: [ally.monster], isAlly: true }] : []
    case 'allAllies':
      return [{ targets: ally ? [ctx.user, ally.monster] : [ctx.user], isAlly: true }]
  }
}

/** Skill đủ điều kiện `requires` lên mục tiêu lúc chọn lệnh (điều kiện theo lượt coi như thỏa). */
function meetsRequirementsAtChoice(
  data: GameData,
  d: Draft,
  { user, skill, target }: { user: Monster; skill: Skill; target: Monster }
): boolean {
  if (skill.spell?.requires === undefined) return true
  const userCtx = monsterBattleContext(data, d, user)
  const targetCtx = monsterBattleContext(data, d, target)
  const view = {
    data,
    self: user,
    selfCtx: userCtx,
    target,
    targetCtx,
    other: target,
    otherCtx: targetCtx,
    skill
  }
  return meetsSpellRequirements(skill, view, { ignoreTurnState: true })
}

/** Mọi lựa chọn (skill, mục tiêu) dùng được của một quái, kèm điểm. */
function listCandidates(data: GameData, d: Draft, ctx: ChooserContext): Candidate[] {
  const candidates: Candidate[] = [
    ...guardCandidates(data, ctx.user),
    ...restCandidates(data, d, ctx.user)
  ]
  const tempSkillIds = d.battle.volatiles[ctx.user.id]?.tempSkillIds ?? []
  for (const skillId of new Set([...battleSkillIds(ctx.user), ...tempSkillIds])) {
    const chosen = data.skills[skillId]
    if (isSkillBlocked(data, d, { user: ctx.user, skill: chosen })) continue
    // Skill đã bị thay bằng Booby Trap: dùng là tự đánh mình, AI không chọn.
    if (isBoobyTrapped(d, ctx.user.id, skillId)) continue
    if (holdTurnsLeft(d.battle, ctx.user, chosen) > 0) continue
    // Chấm skill thật khi dùng (đang Dynamax: chiêu Max một mục tiêu; Tera Blast...; synergy cộng
    // hiệu ứng, power ở công thức sát thương), lệnh vẫn ghi skill gốc.
    const actual = battleSkill(data, d, ctx.user, chosen)
    // Mỗi thế dùng được là một ứng viên riêng (chiêu Max không có thế).
    const styles = actual.maxMove ? [] : usableStyles(data, ctx.user, chosen)
    for (const style of [undefined, ...styles]) {
      const skill = withSynergyEffects(styledSkill(data, actual, style), partnersOf(ctx))
      for (const choice of targetChoices(data, d, ctx, skill)) {
        const { isAlly, target } = choice
        const targets = choice.targets.filter((monster) =>
          meetsRequirementsAtChoice(data, d, { user: ctx.user, skill, target: monster })
        )
        if (targets.length === 0) continue
        const scored = scoreSkill(data, d, ctx, { skill, targets, isAlly, style })
        candidates.push({ ...scored, skillId, target, ...(style ? { style } : {}) })
      }
    }
    candidates.push(...zMoveCandidates(data, d, ctx, chosen))
    candidates.push(...allyCandidates(data, d, ctx, actual))
  }
  return candidates
}

/** Skill có `onAlly` (Pollen Puff): thêm ứng viên nhắm đồng đội, chấm như skill hỗ trợ. */
function allyCandidates(data: GameData, d: Draft, ctx: ChooserContext, skill: Skill): Candidate[] {
  if (!skill.onAlly) return []
  const ally = allyVersion(skill)
  return targetChoices(data, d, ctx, ally).map(({ targets, isAlly }) => ({
    ...scoreSkill(data, d, ctx, { skill: ally, targets, isAlly }),
    skillId: skill.id,
    targetAlly: true
  }))
}

/**
 * Ứng viên Z-Move của skill (docs/rules/z-moves.md): chấm Z-Move thật (không thế, không synergy),
 * skill trạng thái cộng điểm Z-Power. Rỗng nếu quái không dùng Z-Move từ skill này được.
 */
function zMoveCandidates(
  data: GameData,
  d: Draft,
  ctx: ChooserContext,
  chosen: Skill
): Candidate[] {
  if (zMoveBlocker(data, d, { side: ctx.side, monster: ctx.user, skill: chosen })) return []
  const zSkill = zMoveFor(data, ctx.user, chosen)
  if (!zSkill) return []
  const powerValue = spellAiValue(data, zPowerEffects(zSkill))
  return targetChoices(data, d, ctx, zSkill).map(({ targets, isAlly, target }) => {
    const scored = scoreSkill(data, d, ctx, { skill: zSkill, targets, isAlly })
    return { ...scored, score: scored.score + powerValue, skillId: chosen.id, target, zMove: true }
  })
}

interface ComboOption {
  comboId: string
  target?: number
  score: number
}

/**
 * Hợp kích kỹ (docs/rules/team.md): mỗi hợp kích dùng được chấm như một skill của quái chậm hơn
 * (quái tung chiêu) có đồng đội, lấy cách nhắm tốt nhất; rồi tung theo trọng số giữa "đánh riêng"
 * (tổng điểm lựa chọn tốt nhất của hai quái) và từng hợp kích. Trả về hai lệnh hợp kích, hoặc null
 * nếu không có hợp kích nào điểm > 0 (không tốn RNG) hoặc tung ra đánh riêng.
 */
function chooseCombo(
  data: GameData,
  d: Draft,
  {
    side,
    team,
    candidatesOf
  }: { side: BattleSide; team: TeamContext; candidatesOf: UnplannedCandidates }
): BattleCommand[] | null {
  const combos = usableCombos(data, d, side)
  if (combos.length === 0) return null
  const onField = aliveOnField(data, d, side)
  const bySpeed = compareSpeed(data, d.battle.field)
  const [first, second] = onField
  // Quái chậm hơn tới lượt sau nên là quái tung chiêu.
  const firstActsFirst =
    bySpeed(
      battleStats(data, d, first.monster).speed,
      battleStats(data, d, second.monster).speed
    ) <= 0
  const [caster, partner] = firstActsFirst ? [second, first] : [first, second]
  const ctx: ChooserContext = {
    side,
    slot: caster.slot,
    user: caster.monster,
    planned: new Map(),
    ...team
  }
  const options: ComboOption[] = []
  for (const { comboId } of combos) {
    const skill = data.skills[comboId]
    let best: ComboOption | null = null
    for (const { targets, isAlly, target } of targetChoices(data, d, ctx, skill)) {
      const { score } = scoreSkill(data, d, ctx, {
        skill,
        targets,
        isAlly,
        partner: partner.monster
      })
      if (score > 0 && (best === null || score > best.score)) best = { comboId, target, score }
    }
    if (best) options.push(best)
  }
  if (options.length === 0) return null
  const separate = onField.reduce(
    (sum, { slot, monster }) => sum + bestScore(candidatesOf(slot, monster)),
    0
  )
  let chosen: ComboOption | null
  ;[chosen, d.rng] = pickWeighted<ComboOption | null>(d.rng, [null, ...options], (option) =>
    option === null ? Math.max(0, separate) : option.score
  )
  if (chosen === null) return null
  const { comboId, target } = chosen
  return onField.map(({ slot }) => ({ slot, kind: 'combo', comboId, target }))
}

/** Trọng số AI theo chiến thuật của quái (quái hoang / boss luôn `balanced`). */
const tacticWeights = (data: GameData, user: Monster): TacticWeights =>
  data.config.autoBattle.tactics[user.tactic]

/**
 * Lệnh phòng thủ / khiêu khích: điểm = trọng số × phần máu đã mất của quái ra lệnh × trọng số phòng
 * thủ của chiến thuật.
 */
function guardCandidates(data: GameData, user: Monster): Candidate[] {
  const missing =
    (1 - getCurrentHp(data, user).div(getMaxHp(data, user)).toNumber()) *
    tacticWeights(data, user).guard
  const { defendWeight, provokeWeight } = data.config.ai
  // Chỉ thêm khi có điểm > 0: lệnh 0 điểm không được chen vào lần chọn đều khi mọi skill 0 điểm.
  const candidates: Candidate[] = [
    { guard: 'defend', score: defendWeight * missing, plannedDamage: [] },
    { guard: 'provoke', score: provokeWeight * missing, plannedDamage: [] }
  ]
  return candidates.filter((candidate) => candidate.score > 0)
}

/** Nghỉ: điểm theo phần thể lực đã mất (docs/rules/stamina.md); đầy thì không xét. */
function restCandidates(data: GameData, d: Draft, user: Monster): Candidate[] {
  const max = maxStamina(data, d, user)
  const missing = 1 - currentStamina(data, d, user) / max
  const score = missing * data.config.stamina.restWeight
  return score > 0 ? [{ guard: 'rest', score, plannedDamage: [] }] : []
}

/**
 * Điểm mất nếu dùng skill làm quá sức: phần máu hiện tại sẽ mất theo phần thiếu và mất lượt kế tiếp
 * (không gục vì quá sức khi còn lựa chọn khác).
 */
function overexertAiCost(data: GameData, d: Draft, user: Monster, skill: Skill): number {
  const deficit = staminaCostOf(data, d, user, skill) - currentStamina(data, d, user)
  if (deficit <= 0) return 0
  const { overexertHpPercent, exhaustedPenalty } = data.config.stamina
  const lost = getMaxHp(data, user)
    .times(deficit * overexertHpPercent)
    .div(100)
  const share = Math.min(1, lost.div(getCurrentHp(data, user)).toNumber())
  return share + exhaustedPenalty
}

/** Điểm của một skill lên các mục tiêu: cộng điểm từng mục tiêu (mục "AI trận đấu"). */
/** Bản "nhìn thấy" của quái đang Illusion, một bản mỗi quái của draft (giữ bộ nhớ chỉ số). */
const perceivedCache = new WeakMap<Monster, Monster>()

/**
 * Quái phe kia như AI nhìn thấy (Illusion, battle-traits.md): đang giả loài khác thì AI tính khắc hệ
 * theo hệ của loài đó (như người chơi bị lừa ở Pokémon); không thì chính nó.
 */
function perceivedFoe(data: GameData, d: Draft, target: Monster): Monster {
  const speciesId = d.battle.volatiles[target.id]?.illusionSpeciesId
  const species = speciesId === undefined ? undefined : data.species[speciesId]
  if (species?.kind !== 'normal') return target
  const cached = perceivedCache.get(target)
  if (cached && cached.elementIds.join() === species.elementIds.join()) return cached
  const seen: Monster = { ...target, elementIds: [...species.elementIds] }
  perceivedCache.set(target, seen)
  return seen
}

function scoreSkill(
  data: GameData,
  d: Draft,
  ctx: ChooserContext,
  {
    skill,
    targets,
    isAlly,
    partner,
    style
  }: {
    skill: Skill
    targets: readonly Monster[]
    isAlly: boolean
    /** Đồng đội cùng tung hợp kích kỹ (công trung bình, STAB của hai quái). */
    partner?: Monster
    /** Thế của ứng viên (skill đã đổi theo thế; power nhân trong công thức sát thương). */
    style?: MoveStyle
  }
): Omit<Candidate, 'target'> {
  const { ai } = data.config
  const spread = skill.target === 'allEnemies' && targets.length > 1
  // Chiến thuật của quái (docs/rules/auto-battle.md): trọng số từng phần điểm.
  const weights = tacticWeights(data, ctx.user)
  let score = 0
  const addDamage = (value: number): void => {
    score += value * weights.damage
  }
  const addEffect = (value: number): void => {
    const weight = value < 0 ? weights.penalty : isAlly ? weights.allyEffects : weights.foeEffects
    score += value * weight
  }
  const plannedDamage: Candidate['plannedDamage'] = []
  let firstHitChance = 1
  // Chỉ nhắm bộ phận khi skill nhắm một địch; quái hoang (phe địch không có ngự thú sư NPC) đánh
  // theo bản năng, không nhắm (docs/rules/hit-locations.md mục "AI").
  const aimable =
    !isAlly &&
    targets.length === 1 &&
    canAim(skill) &&
    (ctx.side === 'player' || d.battle.trainer !== null)
  let aim: string | undefined
  // Hiệu ứng phụ: trait kiểu Serene Grace × mốc thuần thục của skill (như lúc đánh thật).
  const chanceMultiplier =
    traitSecondaryChanceMultiplier(data, ctx.user) *
    skillMasteryBonus(data, ctx.user, skill).secondaryChanceMultiplier
  targets.forEach((target, index) => {
    // Illusion: AI thấy địch mang hệ của loài nó giả, máu / chỉ số vẫn là thật.
    const seen = isAlly ? target : perceivedFoe(data, d, target)
    // Địch hút được skill (kiểu Water Absorb): không sát thương, không hiệu ứng, địch được hồi.
    const absorbed = isAlly ? null : absorbAiScore(data, d, { user: ctx.user, skill, target: seen })
    if (absorbed !== null) {
      addDamage(absorbed)
      return
    }
    // Hiệu ứng chỉ chạy khi trúng; skill nhắm phe mình luôn trúng. Accuracy theo môi trường và
    // trait (accuracy của quái dùng, né của mục tiêu).
    const userCtx = monsterBattleContext(data, d, ctx.user)
    const targetCtx = monsterBattleContext(data, d, target)
    const dodge =
      isAlly || skill.power <= 0
        ? 0
        : traitDodgeChance({
            data,
            attacker: ctx.user,
            defender: seen,
            attackerCtx: userCtx,
            defenderCtx: targetCtx,
            skill
          })
    // Skill cận chiến không với tới quái đang bay: không trúng (docs/rules/hit-locations.md).
    const reachable = isAlly || canReach(data, d, { user: ctx.user, skill, target })
    let hitChance = !reachable
      ? 0
      : isAlly || isBattleOnlyMove(skill)
        ? 1
        : (skillAccuracy(data, userField(data, d, ctx.user), skill, {
            user: ctx.user,
            target,
            userCtx,
            targetCtx,
            stages: d.battle.stages
          }) /
            100) *
          (1 - dodge / 100)
    let dealt = BIG_ZERO
    if (!isAlly && skill.power > 0 && reachable) {
      const remaining = getCurrentHp(data, target).minus(ctx.planned.get(target.id) ?? BIG_ZERO)
      // Địch đã được quái trước dự kiến hạ thì đánh thêm không có giá trị.
      if (remaining.gt(0)) {
        const damage = expectedDamage({
          data,
          attacker: ctx.user,
          defender: seen,
          skill,
          attackerStages: d.battle.stages[ctx.user.id],
          defenderStages: d.battle.stages[target.id],
          spread,
          arena: damageArena(data, d, { attacker: ctx.user, defender: seen }),
          partner: partner && comboPartnerInput(data, d, partner),
          style,
          statsMemo: ctx.statsMemo
        })
        // Nhắm bộ phận (một địch, docs/rules/hit-locations.md): chấm theo máu thực mất + hạ gục; phe
        // người chơi không nhắm bộ phận làm vỡ yêu đan khi đòn dự kiến hạ gục và chỉ biết điểm yếu
        // đã khám phá trong Dex; ngự thú sư NPC biết hết.
        const isPlayer = ctx.side === 'player'
        const aimChoice = aimable
          ? chooseAim(data, {
              skill,
              target,
              damage,
              remaining,
              keepCore: isPlayer,
              revealed: isPlayer ? revealedBodyParts(data, d, target) : null
            })
          : NO_AIM
        aim = aimChoice.aim
        hitChance *= aimChoice.accuracyFactor
        const aimedDamage = damage.times(aimChoice.damageFactor)
        dealt = minBig(aimedDamage, remaining)
        // Điểm theo tỉ lệ máu nên đổi sang number an toàn dù chỉ số lớn cỡ nào.
        addDamage(hitChance * dealt.div(remaining).toNumber())
        if (dealt.gte(remaining)) {
          const fullHp = remaining.gte(getMaxHp(data, target))
          addDamage(hitChance * ai.koBonus * knockoutValueFactor(data, d, { target, fullHp }))
        }
        addDamage(ai.lowHpTargetWeight * (1 - remaining.div(getMaxHp(data, target)).toNumber()))
        const strike = { user: ctx.user, target, skill, side: ctx.side, dealt, remaining }
        addDamage(hitChance * hitTraitScore(data, d, strike))
        plannedDamage.push({ monsterId: target.id, amount: dealt.times(hitChance) })
      }
    }
    const effectContext = {
      data,
      user: ctx.user,
      target,
      targetIsAlly: isAlly,
      stages: d.battle.stages,
      expectedDamage: dealt,
      field: effectiveField(data, d),
      side: ctx.side,
      allies: ctx.allies,
      foes: ctx.foes,
      allyReserves: ctx.allyReserves,
      foeReserves: ctx.foeReserves,
      volatiles: d.battle.volatiles,
      isBoss: d.battle.isBoss,
      chanceMultiplier,
      battleTurn: d.battle.turn
    }
    for (const effect of skill.effects) {
      const handler = SKILL_EFFECTS[effect.type]
      // Hiệu ứng cả chiêu chạy một lần (lên mục tiêu trúng đầu tiên) nên chỉ chấm một lần.
      if (handler.timing === 'perSkill' && index > 0) continue
      addEffect(hitChance * handler.aiValue(effect.params, effectContext))
    }
    // Phản ứng hệ: buff cho địch là điểm âm, debuff là điểm dương (element-reactions.md).
    for (const effect of reactionEffectsOn(data, d, { user: ctx.user, skill, target })) {
      addEffect(hitChance * SKILL_EFFECTS[effect.type].aiValue(effect.params, effectContext))
    }
    addEffect(hitChance * spellAiValue(data, spellTargetEffects(skill)))
    if (index === 0) addEffect(hitChance * spellAiValue(data, spellAfterEffects(skill)))
    if (index === 0) firstHitChance = hitChance
  })
  addEffect(-selfCostAiValue(data, ctx.user, skill, firstHitChance))
  addEffect(-overexertAiCost(data, d, ctx.user, skill))
  return {
    skillId: skill.id,
    ...(aim !== undefined ? { aim } : {}),
    score: score * aiHintMultiplier(data, d, ctx.user, skill),
    plannedDamage
  }
}

/**
 * Điểm mất do chi phí tự thân của skill (cụm 4, pokemon-moves.md), cùng thang với điểm sát thương:
 * phần máu hiện tại của quái dùng sẽ mất (kỳ vọng theo tỉ lệ trúng); tự gục còn trừ thêm koBonus như
 * cho địch hạ một quái.
 */
function selfCostAiValue(data: GameData, user: Monster, skill: Skill, hitChance: number): number {
  const current = getCurrentHp(data, user)
  if (current.lte(0)) return 0
  const percentOfCurrent = (percent: number): number =>
    Math.min(1, getMaxHp(data, user).times(percent).div(100).div(current).toNumber())
  let value = 0
  if (skill.selfDamagePercent) value += percentOfCurrent(skill.selfDamagePercent)
  if (skill.crashDamagePercent)
    value += (1 - hitChance) * percentOfCurrent(skill.crashDamagePercent)
  const faintChance = skill.selfFaint === 'always' ? 1 : skill.selfFaint === 'onHit' ? hitChance : 0
  value += faintChance * (1 + data.config.ai.koBonus)
  return Math.min(1 + data.config.ai.koBonus, value)
}

/**
 * Hệ số điểm từ gợi ý AI của món unique đang lắp (mục "Trang bị unique của boss": boss chơi đúng
 * phong cách món của nó). Mọi gợi ý khớp skill thì nhân dồn; Magic Room tắt món nên tắt cả gợi ý.
 */
function aiHintMultiplier(data: GameData, d: Draft, user: Monster, skill: Skill): number {
  if (monsterBattleContext(data, d, user)?.itemsDisabled) return 1
  let multiplier = 1
  for (const entry of user.equipment) {
    if (entry.storage !== 'instance') continue
    const hints = findEquipmentItem(data, entry.instance.baseItemId)?.unique?.aiHints ?? []
    for (const hint of hints) {
      if (hint.effectType && !skill.effects.some((effect) => effect.type === hint.effectType))
        continue
      if (hint.category && hint.category !== skill.category) continue
      if (hint.elementId && hint.elementId !== skill.elementId) continue
      multiplier *= hint.multiplier
    }
  }
  return multiplier
}

/**
 * Điểm thô của hiệu ứng spell Siralim (mục "AI trận đấu"): mỗi hiệu ứng một mức cố định, minion
 * theo `minionWeight`; không mô phỏng kết quả vì hiệu ứng "ngôn ngữ" trait rất đa dạng.
 */
function spellAiValue(data: GameData, effects: readonly TraitEffect[]): number {
  const { minionWeight, spellEffectWeight } = data.config.ai
  return effects.reduce(
    (sum, effect) => sum + (effect.do === 'minion' ? minionWeight : spellEffectWeight),
    0
  )
}
