// Kỹ năng ngự thú sư trong trận (docs/rules/tamer.md): tối đa một lệnh mỗi phe mỗi lượt, không
// chiếm lượt quái, chạy sau bước đổi quái và trước bước biến hình. Mục tiêu `ally` chạy hiệu ứng
// vật phẩm lên một quái trong đội; `allyOnField` / `field` chạy hiệu ứng skill như quái ta trên sân
// tự dùng. Không có tác dụng lúc tới lượt thì không tốn linh lực, không tính hồi chiêu.

import {
  ActionError,
  BIG_ZERO,
  malformedAction,
  rollPercent,
  type TamerSkillBlocker
} from '../shared'
import { applyItemEffects, ITEM_EFFECTS, SKILL_EFFECTS, soulLinkTier } from '../registries'
import { getMaxHp } from '../monster'
import type {
  BattleSide,
  BattleTamer,
  EffectTamerSkill,
  GameData,
  GameState,
  Monster,
  TamerCommand,
  TamerSkill
} from '../model'
import {
  Draft,
  aliveOnField,
  log,
  opponentOf,
  requireBattle,
  reservesOnSide,
  teamOf,
  effectiveField
} from './draft'
import { logRecovery } from './battleItems'
import { refreshPartnerBonus } from './hpChanges'
import { runSkillEffects } from './skillResults'
import { intimidateBlocker, runIntimidate, validateIntimidateTarget } from './recruit'
import { applyMerge, mergeBlocker, mergeGain } from './merge'

/**
 * Linh lực kỹ năng tốn cho một phe (làm tròn lên). Phe người chơi: bản mệnh thú còn sống trên sân
 * thì × bond.manaCostPercent % (mục "Bản mệnh thú"); quái tâm linh tương thông còn sống trên sân thì
 * giảm manaCostReduction % của mức cao nhất trong số đó (mục "Khế ước", docs/rules/tamer.md).
 */
export function tamerSkillManaCost(
  data: GameData,
  d: Draft,
  { side, skill }: { side: BattleSide; skill: TamerSkill }
): number {
  if (side !== 'player') return skill.manaCost
  const onField = aliveOnField(data, d, side).map(({ monster }) => monster)
  const bondFactor = onField.some((monster) => monster.bond)
    ? data.config.bond.manaCostPercent / 100
    : 1
  const reduction = onField.reduce(
    (best, monster) => Math.max(best, soulLinkTier(data, monster)?.manaCostReduction ?? 0),
    0
  )
  if (bondFactor === 1 && reduction === 0) return skill.manaCost
  return Math.ceil(skill.manaCost * bondFactor * (1 - reduction / 100))
}

/**
 * Lý do không dùng được kỹ năng (chưa xét mục tiêu); null = dùng được. `manaCost`: linh lực thật
 * phải tốn (tamerSkillManaCost); bỏ trống = giá gốc của kỹ năng.
 */
export function tamerSkillBlocker(
  tamer: BattleTamer | null,
  skill: TamerSkill,
  manaCost = skill.manaCost
): TamerSkillBlocker | null {
  if (!tamer) return 'noTamer'
  if (skill.unlockRealm > tamer.realm) return 'locked'
  // Ngự thú sư NPC chỉ dùng kỹ năng của lớp (docs/rules/trainers.md).
  if (tamer.skillIds !== null && !tamer.skillIds.includes(skill.id)) return 'locked'
  if ((tamer.cooldowns[skill.id] ?? 0) > 0) return 'onCooldown'
  if (skill.usesPerBattle !== undefined && (tamer.uses[skill.id] ?? 0) >= skill.usesPerBattle) {
    return 'noUsesLeft'
  }
  if (tamer.mana < manaCost) return 'notEnoughMana'
  return null
}

/** Áp hiệu ứng vật phẩm của kỹ năng lên quái (mục tiêu `ally`); null = không có tác dụng. */
function applyAllyEffects(
  data: GameData,
  d: Draft,
  { skill, target }: { skill: EffectTamerSkill; target: Monster }
): ReturnType<typeof applyItemEffects> {
  return applyItemEffects(data, target, skill.effects, {
    highestFloor: d.highestFloor,
    count: 1,
    useCount: 0
  })
}

/**
 * Kiểm tra lệnh ngự thú sư của người chơi trước khi xử lý lượt (state chưa đổi). Sai thì ném lỗi:
 * id lạ / mục tiêu sai dạng là malformedAction, không dùng được là tamerSkillUnavailable.
 */
export function validateTamerCommand(data: GameData, d: Draft, command: TamerCommand): void {
  if (typeof command !== 'object' || command === null) {
    throw malformedAction('lệnh ngự thú sư phải là object')
  }
  const skill = Object.hasOwn(data.tamerSkills, command.skillId)
    ? data.tamerSkills[command.skillId]
    : undefined
  if (!skill) throw malformedAction(`kỹ năng ngự thú sư lạ: ${String(command.skillId)}`)
  const cost = tamerSkillManaCost(data, d, { side: 'player', skill })
  const blocker = tamerSkillBlocker(d.battle.tamers.player, skill, cost)
  if (blocker)
    throw new ActionError('tamerSkillUnavailable', { skillId: skill.id, reason: blocker })
  switch (skill.target) {
    case 'ally': {
      const target = d.party.find((m) => m.id === command.targetId)
      if (!target)
        throw new ActionError('monsterNotInParty', { monsterId: String(command.targetId) })
      if (!applyAllyEffects(data, d, { skill, target })) {
        throw new ActionError('tamerSkillUnavailable', { skillId: skill.id, reason: 'noEffect' })
      }
      return
    }
    case 'allyOnField':
      if (!aliveOnField(data, d, 'player').some(({ monster }) => monster.id === command.targetId)) {
        throw malformedAction('mục tiêu phải là quái ta còn sống trên sân')
      }
      return
    case 'field':
      if (command.targetId !== undefined) throw malformedAction('kỹ năng "field" không có mục tiêu')
      return
    case 'wildFoe': {
      // Thị Uy (docs/rules/recruit.md): chỉ lượt đầu trận quái hoang thường.
      const reason = intimidateBlocker(d.battle)
      if (reason) throw new ActionError('tamerSkillUnavailable', { skillId: skill.id, reason })
      validateIntimidateTarget(data, d, command.targetId)
      return
    }
    case 'merge': {
      // Song thú hợp thể (docs/rules/battle-merge.md): cặp là hai quái ta trên sân, không chọn.
      if (command.targetId !== undefined) throw malformedAction('kỹ năng "merge" không có mục tiêu')
      const reason = mergeBlocker(data, d, 'player')
      if (reason) throw new ActionError('transformUnavailable', { kind: 'merge', reason })
      return
    }
  }
}

/** Trừ linh lực, đặt hồi chiêu (+1 vì cuối lượt này đã trừ một), đếm lần dùng. */
function payForSkill(tamer: BattleTamer, skill: TamerSkill, manaCost: number): void {
  tamer.mana -= manaCost
  if (skill.cooldown > 0) tamer.cooldowns[skill.id] = skill.cooldown + 1
  tamer.uses[skill.id] = (tamer.uses[skill.id] ?? 0) + 1
}

/** Chạy một lệnh ngự thú sư của một phe; true nếu có tác dụng. */
function runTamerCommand(
  data: GameData,
  d: Draft,
  side: BattleSide,
  command: TamerCommand
): boolean {
  const skill = data.tamerSkills[command.skillId]
  if (skill.target === 'wildFoe') {
    // Chỉ phe người chơi có Thị Uy (trận quái hoang không có ngự thú sư địch).
    return side === 'player' && intimidateBlocker(d.battle) === null
      ? runIntimidate(data, d, command.targetId)
      : false
  }
  if (skill.target === 'merge') {
    // Đổi quái trước bước này có thể làm mất cặp: không có tác dụng.
    if (mergeBlocker(data, d, side) !== null) return false
    log(d, { type: 'tamerSkill', side, skillId: skill.id })
    applyMerge(data, d, side)
    return true
  }
  if (skill.target === 'ally') {
    const before = teamOf(data, d, side).find((m) => m.id === command.targetId)
    const applied = before && applyAllyEffects(data, d, { skill, target: before })
    if (!applied) return false
    // Ghi vào danh sách thật của phe (teamOf có thể là bản lọc: luật bí cảnh, quái phụ hợp thể).
    const list = side === 'player' ? d.party : d.battle.enemies
    list[list.findIndex((m) => m.id === before.id)] = applied.monster
    log(d, { type: 'tamerSkill', side, skillId: skill.id, targetId: before.id })
    logRecovery(d, before, applied.monster)
    if (side === 'player') refreshPartnerBonus(data, d, applied.monster)
    return true
  }
  const onField = aliveOnField(data, d, side).map((entry) => entry.monster)
  // allyOnField: chính mục tiêu dùng hiệu ứng; field: quái ta đầu tiên trên sân đứng ra dùng.
  const user =
    skill.target === 'allyOnField' ? onField.find((m) => m.id === command.targetId) : onField[0]
  if (!user) return false
  log(d, { type: 'tamerSkill', side, skillId: skill.id, targetId: command.targetId })
  const run = { user, target: user, damageDealt: BIG_ZERO, skillId: null, shielded: false }
  runSkillEffects(data, d, run, skill.effects)
  return true
}

/**
 * Bước kỹ năng ngự thú sư của lượt: mỗi phe có ngự thú sư tối đa một lệnh (phe địch do AI chọn);
 * cảnh giới cao đi trước, hòa thì random. Không có tác dụng thì log, không tốn gì.
 */
export function runTamerStep(
  data: GameData,
  d: Draft,
  playerCommand: TamerCommand | undefined
): void {
  const commands: { side: BattleSide; command: TamerCommand }[] = []
  if (playerCommand) commands.push({ side: 'player', command: playerCommand })
  const enemyCommand = d.battle.tamers.enemy ? chooseAiTamerCommand(data, d, 'enemy') : null
  if (enemyCommand) commands.push({ side: 'enemy', command: enemyCommand })
  if (commands.length === 2) {
    const realmOf = (side: BattleSide): number => d.battle.tamers[side]?.realm ?? 0
    const diff = realmOf('player') - realmOf('enemy')
    let enemyFirst = diff < 0
    if (diff === 0) [enemyFirst, d.rng] = rollPercent(d.rng, 50)
    if (enemyFirst) commands.reverse()
  }
  for (const { side, command } of commands) {
    const tamer = d.battle.tamers[side]
    const skill = data.tamerSkills[command.skillId]
    // Giá tính trước khi chạy (bản mệnh có thể rời sân vì chính kỹ năng này).
    const cost = tamerSkillManaCost(data, d, { side, skill })
    // Phe kia vừa làm đổi tình thế (hiếm): kỹ năng hết dùng được thì coi như không có tác dụng.
    if (
      tamer &&
      tamerSkillBlocker(tamer, skill, cost) === null &&
      runTamerCommand(data, d, side, command)
    ) {
      payForSkill(tamer, skill, cost)
    } else {
      log(d, { type: 'tamerSkillNoEffect', side, skillId: skill.id, targetId: command.targetId })
    }
  }
}

/** Cuối lượt: hồi chiêu của mọi kỹ năng giảm một lượt, hết thì xóa. */
export function tamersAtTurnEnd(_data: GameData, d: Draft): void {
  for (const tamer of Object.values(d.battle.tamers)) {
    if (!tamer) continue
    for (const [skillId, turns] of Object.entries(tamer.cooldowns)) {
      if (turns <= 1) delete tamer.cooldowns[skillId]
      else tamer.cooldowns[skillId] = turns - 1
    }
  }
}

// ---------- AI ----------

/** Điểm của kỹ năng mục tiêu `ally` lên một quái (cộng aiValue của hiệu ứng vật phẩm). */
function allyScore(data: GameData, skill: EffectTamerSkill, monster: Monster): number {
  const maxHp = getMaxHp(data, monster)
  return skill.effects.reduce(
    (sum, effect) =>
      sum + (ITEM_EFFECTS[effect.type].aiValue?.(effect.params, { data, monster, maxHp }) ?? 0),
    0
  )
}

/** Điểm của kỹ năng hiệu ứng skill khi `user` (quái ta trên sân) dùng lên chính nó. */
function fieldScore(
  data: GameData,
  d: Draft,
  { side, skill, user }: { side: BattleSide; skill: EffectTamerSkill; user: Monster }
): number {
  const ctx = {
    data,
    user,
    target: user,
    targetIsAlly: true,
    stages: d.battle.stages,
    expectedDamage: BIG_ZERO,
    field: effectiveField(data, d),
    side,
    allies: aliveOnField(data, d, side).map((entry) => entry.monster),
    foes: aliveOnField(data, d, opponentOf(side)).map((entry) => entry.monster),
    allyReserves: reservesOnSide(data, d, side),
    foeReserves: reservesOnSide(data, d, opponentOf(side)),
    volatiles: d.battle.volatiles,
    isBoss: d.battle.isBoss,
    battleTurn: d.battle.turn
  }
  return skill.effects.reduce(
    (sum, effect) => sum + SKILL_EFFECTS[effect.type].aiValue(effect.params, ctx),
    0
  )
}

/** Mọi lệnh dùng được của một kỹ năng kèm điểm. */
function scoreTamerSkill(
  data: GameData,
  d: Draft,
  side: BattleSide,
  skill: TamerSkill
): { command: TamerCommand; score: number }[] {
  const onField = aliveOnField(data, d, side).map((entry) => entry.monster)
  switch (skill.target) {
    case 'ally':
      return teamOf(data, d, side)
        .filter((monster) => applyAllyEffects(data, d, { skill, target: monster }) !== null)
        .map((monster) => ({
          command: { skillId: skill.id, targetId: monster.id },
          score: allyScore(data, skill, monster)
        }))
    case 'allyOnField':
      return onField.map((monster) => ({
        command: { skillId: skill.id, targetId: monster.id },
        score: fieldScore(data, d, { side, skill, user: monster })
      }))
    case 'field':
      return onField.length === 0
        ? []
        : [
            {
              command: { skillId: skill.id },
              score: fieldScore(data, d, { side, skill, user: onField[0] })
            }
          ]
    // AI không Thị Uy (người chơi tự quyết thu phục; script mô phỏng tự ra lệnh).
    case 'wildFoe':
      return []
    case 'merge': {
      const gain = mergeGain(data, d, side)
      return gain === null ? [] : [{ command: { skillId: skill.id }, score: gain }]
    }
  }
}

/**
 * Lệnh ngự thú sư AI chọn cho một phe: kỹ năng dùng được có điểm cao nhất (aiValue của hiệu ứng),
 * chỉ khi điểm ≥ ai.tamerSkillMinScore; không thì null. Tất định (không tốn RNG).
 */
export function chooseAiTamerCommand(
  data: GameData,
  d: Draft,
  side: BattleSide
): TamerCommand | null {
  const tamer = d.battle.tamers[side]
  if (!tamer) return null
  let best: { command: TamerCommand; score: number } | null = null
  for (const skill of Object.values(data.tamerSkills)) {
    const cost = tamerSkillManaCost(data, d, { side, skill })
    if (tamerSkillBlocker(tamer, skill, cost) !== null) continue
    for (const option of scoreTamerSkill(data, d, side, skill)) {
      if (!best || option.score > best.score) best = option
    }
  }
  return best && best.score >= data.config.ai.tamerSkillMinScore ? best.command : null
}

/**
 * Gợi ý lệnh ngự thú sư cho người chơi bằng AI chung (tự đánh, script mô phỏng); null = không
 * dùng. Không đổi state; lệnh trả về hợp lệ cho submitTurn.
 */
export function suggestTamerCommand(data: GameData, state: GameState): TamerCommand | null {
  const battle = requireBattle(state, 'chooseActions')
  // AI ngự thú sư không tung RNG nên dùng thẳng state (không đổi gì).
  return chooseAiTamerCommand(data, { ...state, battle }, 'player')
}
