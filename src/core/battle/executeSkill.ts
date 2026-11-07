// Dùng skill: lượt đầu trên sân (firstTurnOnly), skill bị chặn (Scorned / Silenced / Seal), bị
// ngắt (trait), chọn mục tiêu (tự chuyển khi mục tiêu đã gục; khiêu khích, chặn đòn, tàng hình,
// Blind, Confused, trait mục tiêu ngẫu nhiên: targeting.ts), hiệu ứng theo phe chặn skill (guard),
// trait hút skill theo hệ (elementAbsorb.ts), trúng / trượt (accuracy theo môi trường), né độc lập
// (trait / buff), sát thương (một hoặc nhiều đòn, đòn thêm của trait, thế thân nhận thay, Inverted
// đổi thành hồi máu, Cursed phản sát thương), hiệu ứng (từng đòn, từng mục tiêu, cả chiêu), rút về,
// bản ghi trận và sự kiện cho trait (attack / cast / attacked / crit / dodged), lặp skill (trait),
// synergy theo đồng đội (skillSynergy.ts), skill đang chờ (hold), thế mạnh / nhanh (moveStyles.ts).
// Áp kết quả hiệu ứng ở skillResults.ts, trạng thái tạm ở volatiles.ts.

import { computeDamage, skillEffectivenessOn, statDamage, type DamagePartner } from './damage'
import { rollHitCount, withHitsByHp } from './multiHit'
import {
  activeTransform,
  addMasteryExp,
  getCurrentHp,
  getMaxHp,
  percentOfMaxHp,
  holdTurnsLeft,
  isFainted,
  lockedSkillIds,
  skillMasteryBonus
} from '../monster'
import { BIG_ZERO, maxBig, rollPercent, type Decimal } from '../shared'
import {
  SKILL_EFFECTS,
  findStatusHook,
  forEachTraitHook,
  hpRatioOf,
  hasStatusFlag,
  hasTraitFlag,
  fieldBlockingSkill,
  isSkillBannedByRoom,
  meetsSpellRequirements,
  priorityBoostBlockerTraitId,
  protectingSideField,
  skillInField,
  skillTargetInField,
  skillPriority,
  hasAbilityFlag,
  sideSecondaryChanceMultiplier,
  spellAfterEffects,
  spellTargetEffects,
  traitDodgeChance,
  traitSecondaryChanceMultiplier,
  type DslView,
  type SkillEffectResult,
  type SkillEffectTiming,
  type TraitEffect
} from '../registries'
import {
  STAGE_STATS,
  battleSkillIds,
  canTargetAllyByCommand,
  isBattleOnlyMove,
  isOffensiveTarget,
  isReducedSpread,
  type BattleSide,
  type GameData,
  type Monster,
  type MoveStyle,
  type Skill
} from '../model'
import { enterField, skillAccuracy } from './environment'
import {
  Draft,
  changeStage,
  findMonster,
  battleStats,
  log,
  damageArena,
  monsterBattleContext,
  recordOf,
  reservesOnSide,
  sideOf,
  slotsOf,
  canEnterSlot,
  aliveOnField,
  opponentOf,
  currentTurnLog,
  userField
} from './draft'
import { applyDamage, consumeInverted, heal, loseHp, removeStatus } from './hpChanges'
import { emitTraitEvent } from './eventQueue'
import { disguiseBlocks, formBeforeSkillUse } from './battleForms'
import { absorbSkill } from './elementAbsorb'
import { applyRecoil, survivableDamage, triggerHitTraits } from './hitTraits'
import { consumeHeldItem, consumeHeldWhere } from './heldItems'
import { activateSpellSlotsAfterAttack } from './spellSlots'
import { runSkillEffects } from './skillResults'
import {
  aimAccuracyFactor,
  aimChanceMultiplier,
  aimDamageFactor,
  aimedPartOn,
  afterAimedStrike,
  markOffBalance,
  offBalanceCritStage,
  recordPartHit,
  usesBrokenPart,
  revealPart,
  type AimedPart
} from './hitLocations'
import { canReach, markSwoop, skillReach } from './reach'
import { consumeWall, wallAbsorbs } from './walls'
import { startCoating } from './coatings'
import { overexert, payStamina } from './stamina'
import {
  afterStickerUse,
  refundStickerStamina,
  stickerBonusOf,
  stickerRepeats,
  stickerSplash,
  stickerSpread
} from './stickers'
import { springBoobyTrap } from './boobyTraps'
import { isPassiveOnly } from './passiveSkills'
import { changeIdentity, runTraitEffects } from './traitEffects'
import { breakScreens } from './sideFields'
import { resolveTargets } from './targeting'
import { battleSkill, recordStellarUse } from './transform'
import { startZMove } from './zMoves'
import { runElementReactions } from './elementReactions'
import { synergyPartner, withSynergyEffects } from './skillSynergy'
import { markStyleUsed, styleStatusTurnsBonus, styledSkill } from './moveStyles'
import { movePendingAction, pendingSkillOf, recordSkillThisTurn } from './actionQueue'
import {
  advanceLockIn,
  bideStep,
  dropCarried,
  endBide,
  isOutOfReach,
  recordFieldStreak,
  recordStreak,
  scheduleDelayedAttack,
  scheduleRecharge,
  startChargeIfNeeded,
  startLockIn,
  takeDueDelayedAttacks
} from './multiTurnMoves'
import {
  activeProtect,
  damageSubstitute,
  failsFirstTurnRule,
  protectionAgainst,
  isShielded,
  passOnState,
  recordSkillOutcome,
  snapshotPassedState,
  startHold
} from './volatiles'

export { resolveTargets }

// ---------- Dùng skill ----------

/** Một lần dùng skill: quái dùng ở ô nào, mục tiêu, quái vào thay nếu skill làm quái dùng rút về. */
export interface SkillUse {
  side: BattleSide
  slot: number
  user: Monster
  skill: Skill
  targetSlot?: number
  /** Mục tiêu chỉ định theo id (đòn / spell do trait); bỏ trống = theo targetSlot. */
  targetId?: string
  switchTo?: string
  /** Do trait / minion gây ra (không phải lượt của quái dùng). */
  reactive?: boolean
  /** % sát thương của lần dùng (đòn do trait, lặp skill); bỏ trống = 100. */
  damagePercent?: number
  /**
   * Đồng đội cùng tung hợp kích kỹ (docs/rules/team.md): công / đặc công trung bình hai quái, STAB
   * nếu một trong hai cùng hệ; bỏ trống = skill thường.
   */
  partner?: Monster
  /**
   * Thế mạnh / thế nhanh của lệnh (docs/rules/move-styles.md); chỉ có tác dụng với skill có
   * `styles` (chiêu Max thì không).
   */
  style?: MoveStyle
  /** Lệnh dùng skill thành Z-Move (docs/rules/z-moves.md); chỉ lần dùng đầu, không tính lặp. */
  zMove?: true
  /** Lần dùng do Magic Coat phản lại (không phản tiếp). */
  reflected?: true
  /** Nhắm đồng đội bằng skill có `onAlly` (Pollen Puff). */
  targetAlly?: true
  /** Nhắm địch bằng skill có `onFoe` (Wall của Cassette Beasts). */
  targetFoe?: true
  /** Bộ phận địch được nhắm (docs/rules/hit-locations.md); bỏ trống = không nhắm. */
  aim?: string
}

/**
 * Lệnh `targetAlly`: Pollen Puff (có `onAlly`) thành skill trạng thái nhắm đồng đội với hiệu ứng `onAlly`;
 * đòn đơn nhắm địch / Other Team or Ally đánh thẳng vào đồng đội như gốc (Wake Up, chiêu trận đôi).
 */
export function allyVersion(skill: Skill): Skill {
  if (skill.onAlly) {
    return { ...skill, category: 'status', power: 0, target: 'ally', effects: skill.onAlly }
  }
  return canTargetAllyByCommand(skill.target) ? { ...skill, target: 'ally' } : skill
}

/**
 * Chạy các hiệu ứng có `timing` này của skill lên một mục tiêu; trả về yêu cầu rút về.
 * `skipUserOnly`: bỏ hiệu ứng chỉ lên quái dùng (đã chạy ở mục tiêu trúng trước của cùng chiêu).
 */
function applySkillEffects(
  data: GameData,
  d: Draft,
  {
    user,
    skill,
    target,
    style,
    chanceBonus = 1,
    walled = false
  }: {
    user: Monster
    skill: Skill
    target: Monster
    style?: MoveStyle
    /** Hệ số tỉ lệ thêm (hiệu ứng trúng điểm yếu, docs/rules/hit-locations.md); bỏ trống = 1. */
    chanceBonus?: number
    /** Tường của mục tiêu đã chặn đòn (như thế thân: bỏ đổi bậc / trạng thái lên mục tiêu). */
    walled?: boolean
  },
  timing: SkillEffectTiming,
  damageDealt: Decimal,
  skipUserOnly = false
): SkillEffectResult['switchOut'] {
  const effects = skill.effects.filter((effect) => {
    const handler = SKILL_EFFECTS[effect.type]
    return handler.timing === timing && !(skipUserOnly && handler.userOnly?.(effect.params))
  })
  const sticker = stickerBonusOf(data, user, skill)
  return runSkillEffects(
    data,
    d,
    {
      user,
      target,
      damageDealt,
      skillId: skill.id,
      shielded: walled || isShielded(d, user, target),
      // Trait kiểu Serene Grace × mốc thuần thục của skill (docs/rules/skill-mastery.md); Shield
      // Dust của mục tiêu phe địch tắt hiệu ứng phụ.
      chanceMultiplier:
        chanceBonus *
        (sideOf(d, target.id) !== sideOf(d, user.id) &&
        hasAbilityFlag(
          data,
          target,
          'blocksSecondaryEffects',
          monsterBattleContext(data, d, target)
        )
          ? 0
          : 1) *
        traitSecondaryChanceMultiplier(data, user, monsterBattleContext(data, d, user)) *
        sideSecondaryChanceMultiplier(data, d.battle.field, sideOf(d, user.id)) *
        skillMasteryBonus(data, user, skill).secondaryChanceMultiplier *
        (1 + sticker.effectChancePercent / 100),
      // Sticker Status Duration Boost: +lượt cho trạng thái skill gây (docs/rules/skill-stickers.md).
      statusTurnsBonus: styleStatusTurnsBonus(data, skill, style) + sticker.statusTurns
    },
    effects
  )
}

/** Đòn thêm của trait (kiểu Multistrike): số đòn cộng thêm và % sát thương mỗi đòn. */
function traitExtraHits(
  data: GameData,
  d: Draft,
  user: Monster,
  skill: Skill
): { count: number; percent: number } {
  let count = 0
  let percent = 100
  forEachTraitHook(
    data,
    user,
    (handler, params, scale) => {
      const extra = handler.extraHits?.(params, scale, skill.category)
      if (!extra) return
      count += extra.count
      percent = (percent * extra.damagePercent) / 100
    },
    monsterBattleContext(data, d, user)
  )
  return { count, percent }
}

/** Đầu vào công thức sát thương của đồng đội cùng tung hợp kích kỹ (bậc trận, bối cảnh trận). */
export function comboPartnerInput(data: GameData, d: Draft, partner: Monster): DamagePartner {
  return {
    monster: partner,
    stages: d.battle.stages[partner.id],
    context: monsterBattleContext(data, d, partner)
  }
}

/** Inverted của quái dùng: sát thương lên địch thành hồi máu cho địch (trừ lượng còn lại). */
function invertedStatusId(data: GameData, user: Monster): string | undefined {
  return user.statuses.find((s) =>
    data.statuses[s.statusId].hooks.some((hook) => hook.type === 'invert')
  )?.statusId
}

/** Wall nhắm địch: skill thành skill trạng thái nhắm địch với hiệu ứng `onFoe`. */
function foeVersion(skill: Skill): Skill {
  if (!skill.onFoe) return skill
  return { ...skill, category: 'status', power: 0, target: 'enemy', effects: skill.onFoe }
}

/** Kết quả một đòn: sát thương thực, miễn nhiễm, bị kháng hệ, chí mạng, thế thân / tường nhận thay. */
interface StrikeResult {
  dealt: Decimal
  immune: boolean
  resisted: boolean
  critical: boolean
  shielded: boolean
  /** Tường của mục tiêu chặn trọn đòn (docs/rules/element-reactions.md). */
  walled?: boolean
}

const MISSED_STRIKE: StrikeResult = {
  dealt: BIG_ZERO,
  immune: false,
  resisted: false,
  critical: false,
  shielded: false
}

/**
 * Một đòn lên mục tiêu: thế thân (nếu có, trước đòn của phe địch) nhận thay, Inverted đổi thành hồi
 * máu, không thì mục tiêu mất máu. Trả về sát thương thực gây ra, mục tiêu có miễn nhiễm không và
 * có chí mạng không.
 */
function strikeOnce(
  data: GameData,
  d: Draft,
  use: SkillUse & { target: Monster },
  {
    spread,
    damagePercent,
    aimed = null
  }: { spread: boolean; damagePercent: number; aimed?: AimedPart | null }
): StrikeResult {
  const { user, skill, target } = use
  if (skill.power <= 0) return MISSED_STRIKE
  const baseArena = damageArena(data, d, { attacker: user, defender: target })
  // Bộ phận được nhắm: cộng bậc chí mạng (đầu), nhân sát thương (bộ phận, điểm yếu). Mục tiêu đang
  // mất thế: cộng bậc chí mạng (hit-locations.md).
  const arena = {
    ...baseArena,
    attackerFocusStages:
      (baseArena.attackerFocusStages ?? 0) +
      (aimed?.part.critStage ?? 0) +
      offBalanceCritStage(data, d, target),
    reactive: use.reactive
  }
  const result = computeDamage({
    data,
    attacker: user,
    defender: target,
    skill,
    attackerStages: d.battle.stages[user.id],
    defenderStages: d.battle.stages[target.id],
    spread,
    arena,
    damagePercent: damagePercent * aimDamageFactor(data, aimed),
    partner: use.partner && comboPartnerInput(data, d, use.partner),
    style: use.style,
    rng: d.rng
  })
  d.rng = result.rng
  // Đồ cầm có hệ số sát thương tác dụng trong đòn (Gem, berry kháng hệ) dùng một lần.
  for (const use of result.heldUsed)
    consumeHeldItem(data, d, findMonster(d, use.monsterId), use.itemId)
  const immune = result.effectiveness === 0
  const inverted = invertedStatusId(data, user)
  if (!immune && inverted && sideOf(d, user.id) !== sideOf(d, target.id)) {
    consumeInverted(d, user, inverted, result.damage)
    heal(data, d, target, result.damage, user)
    return MISSED_STRIKE
  }
  const shielded = !immune && isShielded(d, user, target)
  // Tường (Cassette Beasts): chặn trọn đòn, đòn khắc hệ phá tường rồi trúng như thường.
  if (
    !shielded &&
    wallAbsorbs(data, d, { user, target, skill, effectiveness: result.effectiveness })
  ) {
    return { ...MISSED_STRIKE, shielded: true, walled: true }
  }
  // Disguise / Ice Face: chặn hẳn đòn (sau thế thân, như Pokémon).
  if (!immune && !shielded && disguiseBlocks(data, d, { user, target, skill })) {
    return MISSED_STRIKE
  }
  const dealt = shielded
    ? damageSubstitute(d, target, result.damage)
    : applyDamage(data, d, target, survivableDamage(data, d, target, result.damage), {
        effectiveness: result.effectiveness,
        critical: result.critical,
        info: { kind: 'skill', source: user, skill, reactive: use.reactive }
      })
  // Đồ cầm kiểu Air Balloon: bay tới khi bị đánh trúng.
  if (!shielded && dealt.gt(0)) {
    consumeHeldWhere(data, d, target, (handler, params) => handler.isAirborne?.(params) ?? false)
  }
  // Trait khi trúng đòn / hạ gục (hút máu, hạ ngay, phản đòn, Moxie...).
  triggerHitTraits(data, d, { user, target, skill }, { dealt, shielded })
  if (dealt.gt(0) && result.critical) {
    emitTraitEvent(d, {
      type: 'crit',
      subjectId: user.id,
      otherId: target.id,
      skillId: skill.id,
      amount: dealt
    })
  }
  if (dealt.gt(0)) cursedRecoil(data, d, user, target)
  return { dealt, immune, resisted: result.effectiveness < 1, critical: result.critical, shielded }
}

/** Cursed: quái dùng gây sát thương bằng skill thì mất máu tính theo chỉ số của mục tiêu. */
function cursedRecoil(data: GameData, d: Draft, user: Monster, target: Monster): void {
  const curse = findStatusHook(data, user, (handler, params) => handler.recoilOnDamage?.(params))
  if (!curse || isFainted(data, user)) return
  const amount = maxBig(
    1,
    statDamage(data, {
      attackStat: battleStats(data, d, target)[curse.value.stat],
      defense: battleStats(data, d, user).defense,
      power: curse.value.percent
    }).ceil()
  )
  loseHp(
    data,
    d,
    user,
    amount,
    (dealt) => ({
      type: 'statusDamage',
      monsterId: user.id,
      statusId: curse.statusId,
      amount: dealt
    }),
    { kind: 'indirect', source: target, statusId: curse.statusId }
  )
}

/**
 * Đánh một mục tiêu đã trúng: mỗi đòn tính sát thương riêng (chí mạng, dao động riêng) rồi chạy
 * hiệu ứng perHit. Mục tiêu gục, miễn nhiễm, hoặc quái đánh gục (phản đòn) thì dừng (mục Battle).
 * Trả về tổng sát thương.
 */
function strikeTarget(
  data: GameData,
  d: Draft,
  hit: SkillUse & { target: Monster },
  { spread, aimed }: { spread: boolean; aimed: AimedPart | null }
): { total: Decimal; walled: boolean } {
  const { user, target } = hit
  const skill = withHitsByHp(hit.skill, hpRatioOf(data, user) * 100)
  let hitCount: number
  const { minHitsBonus } = skillMasteryBonus(data, user, skill)
  // Skill Link: đòn nhiều lần luôn đủ số tối đa.
  const maxHits = hasAbilityFlag(data, user, 'maxHits', monsterBattleContext(data, d, user))
  ;[hitCount, d.rng] = rollHitCount(
    data.config.battle,
    skill,
    d.rng,
    maxHits ? (skill.hits?.max ?? 1) : minHitsBonus
  )
  // Z-Move không nhận đòn thêm của trait (như Pokémon: Parental Bond không áp lên Z-Move).
  const extra =
    skill.power > 0 && skill.zMove === undefined
      ? traitExtraHits(data, d, user, skill)
      : { count: 0, percent: 100 }
  // Sticker Extra Hit: thêm đòn đủ sát thương (docs/rules/skill-stickers.md).
  const stickerHits = skill.power > 0 ? stickerBonusOf(data, user, skill).extraHits : 0
  hitCount += extra.count + stickerHits
  const damagePercent = ((hit.damagePercent ?? 100) * extra.percent) / 100
  let total = BIG_ZERO
  let landed = 0
  let resisted = false
  let walled = false
  let bodyDealt = BIG_ZERO
  while (landed < hitCount) {
    // Triple Axel / Triple Kick: đòn thứ n power × n.
    const percent = skill.escalatingHits ? damagePercent * (landed + 1) : damagePercent
    const strike = strikeOnce(data, d, hit, {
      spread,
      damagePercent: percent,
      aimed
    })
    const { dealt, immune, shielded } = strike
    resisted ||= strike.resisted
    walled ||= strike.walled === true
    // Vị trí ra đòn: sát thương vào bộ phận (thế thân nhận thay thì không), phá bộ phận, đòn hạ gục.
    const partDealt = shielded ? BIG_ZERO : dealt
    recordPartHit(data, d, { user, target, skill, aimed, dealt: partDealt })
    bodyDealt = bodyDealt.plus(partDealt)
    landed++
    total = total.plus(dealt)
    applySkillEffects(data, d, hit, 'perHit', dealt)
    if (immune || isFainted(data, target) || isFainted(data, user)) break
  }
  if (skill.hits || extra.count > 0 || stickerHits > 0) {
    log(d, { type: 'hitCount', monsterId: user.id, targetId: target.id, hits: landed })
  }
  // Mất thế: trúng điểm yếu (thế thân nhận thay thì không), bị kháng hệ (hit-locations.md).
  if (aimed) afterAimedStrike(data, d, { user, target, aimed, dealt: bodyDealt, resisted })
  stickerSplash(data, d, { user, target, skill, dealt: total })
  // Tường chặn mọi đòn (không đòn nào xuyên qua) thì hiệu ứng và phản ứng không tới mục tiêu.
  return { total, walled: walled && total.lte(0) }
}

/**
 * Rút quái dùng skill về (hiệu ứng switchOut): quái `switchTo` vào thay nếu vẫn còn ở dự bị, không
 * thì quái dự bị còn sống đầu tiên; không còn dự bị (quái hoang không có dự bị) thì ở lại sân.
 * Có passOn thì truyền trạng thái tạm cho quái vào thay (kiểu Baton Pass, Shed Tail).
 */
function switchUserOut(
  data: GameData,
  d: Draft,
  { side, slot, user, switchTo, skill, reactive }: SkillUse,
  request: NonNullable<SkillEffectResult['switchOut']>,
  firstHit: Monster
): void {
  if (isFainted(data, user) || slotsOf(d.battle, side)[slot] !== user.id) return
  if (request.onlyIfResisted && !resistedBy(data, d, user, skill, firstHit)) return
  // Crossfade không gọi được bằng chiêu / trait khác (gốc: thất bại khi bị gọi).
  if (request.coatIncomingTurns !== undefined && reactive) return
  // Quái lớn chỉ vào khi mọi ô khác đã trống (docs/rules/monster-size.md).
  const slots = slotsOf(d.battle, side)
  const reserves = reservesOnSide(data, d, side).filter((monster) =>
    canEnterSlot(data, slots, { slot, monster })
  )
  const incoming = reserves.find((m) => m.id === switchTo) ?? reserves[0]
  if (!incoming) return
  // Lấy trước khi quái rút về rời sân (rời sân thì mất bậc trận và trạng thái tạm, trả hệ gốc).
  const passed = snapshotPassedState(d, user.id)
  const outgoingElementIds = [...user.elementIds]
  enterField(data, d, { side, slot, monster: incoming })
  if (request.coatIncomingTurns !== undefined && !isFainted(data, incoming)) {
    coatWith(d, incoming, outgoingElementIds, request.coatIncomingTurns)
  }
  if (request.passOn) {
    passOnState(data, d, { from: user, to: incoming, mode: request.passOn, passed })
  }
  if (request.incomingEffects?.length) {
    runTraitEffects(
      data,
      d,
      { owner: incoming, scale: 1, subject: incoming, other: incoming, skillId: skill.id },
      request.incomingEffects as TraitEffect[]
    )
  }
}

/** Lớp phủ giữ hệ cho quái (Crossfade): đang Tera hoặc đã đúng hệ đó thì thôi. */
function coatWith(d: Draft, monster: Monster, elementIds: readonly string[], turns: number): void {
  if (activeTransform(monster)?.kind === 'tera') return
  if (
    elementIds.length === monster.elementIds.length &&
    elementIds.every((id, i) => monster.elementIds[i] === id)
  ) {
    return
  }
  changeIdentity(d, monster, { elementIds: [...elementIds] })
  startCoating(d, monster.id, turns)
}

/** Đòn bị kháng (hệ số khắc chế dưới 1, không tính miễn nhiễm) lên mục tiêu trúng đầu tiên. */
function resistedBy(
  data: GameData,
  d: Draft,
  user: Monster,
  skill: Skill,
  target: Monster
): boolean {
  const factor = skillEffectivenessOn({
    data,
    attacker: user,
    defender: target,
    skill,
    spread: false,
    arena: damageArena(data, d, { attacker: user, defender: target })
  })
  return factor > 0 && factor < 1
}

/** Log dùng skill; hệ do môi trường đổi (kiểu Weather Ball) ghi vào để UI hiện hệ thật đã dùng. */
function logSkillUse(
  data: GameData,
  d: Draft,
  { user, skill, style }: Pick<SkillUse, 'user' | 'skill' | 'style'>
): void {
  const { elementId } = skillInField(data, userField(data, d, user), skill, user)
  log(d, {
    type: 'useSkill',
    monsterId: user.id,
    skillId: skill.id,
    ...(elementId === skill.elementId ? {} : { elementId }),
    ...(style !== undefined && skill.styles !== undefined ? { style } : {})
  })
}

/**
 * Mục tiêu bị địch nhắm có được hiệu ứng theo phe của nó chặn skill không (kiểu Wide Guard); chặn
 * thì ghi log.
 */
function isGuarded(
  data: GameData,
  d: Draft,
  user: Monster,
  skill: Skill,
  target: Monster
): boolean {
  const targetSide = sideOf(d, target.id)
  if (targetSide === sideOf(d, user.id)) return false
  const fieldId = protectingSideField(data, d.battle.field, targetSide, { skill, user })
  if (fieldId === null) return false
  log(d, { type: 'protectedByField', monsterId: target.id, fieldId, userId: user.id })
  return true
}

/**
 * Đòn tiếp xúc bị bảo vệ chặn: chạy hiệu ứng `onContact` của bảo vệ lên quái đánh (King's Shield,
 * Spiky Shield, Baneful Bunker...; self = quái bảo vệ, other = quái đánh).
 */
function punishContact(
  data: GameData,
  d: Draft,
  { user, target, skill }: { user: Monster; target: Monster; skill: Skill }
): void {
  const effects = (activeProtect(data, d, target)?.onContact ?? []) as readonly TraitEffect[]
  if (!skill.contact || effects.length === 0) return
  const view: DslView = {
    data,
    self: target,
    selfCtx: monsterBattleContext(data, d, target),
    other: user,
    otherCtx: monsterBattleContext(data, d, user),
    subject: user,
    subjectCtx: monsterBattleContext(data, d, user),
    skill
  }
  runTraitEffects(
    data,
    d,
    { owner: target, scale: 1, subject: user, other: user, skillId: skill.id, view },
    effects
  )
}

/**
 * Magic Coat: skill phản lại được nhắm vào quái có Magic Coat trong lượt thì quái đó dùng lại lên quái
 * dùng (một lần, không phản tiếp).
 */
function reflectBack(data: GameData, d: Draft, use: SkillUse, target: Monster): boolean {
  if (!use.skill.reflectable || use.reflected) return false
  // Magic Coat (trong lượt) hoặc ability Magic Bounce.
  const coated = d.battle.volatiles[target.id]?.magicCoatTurn === d.battle.turn
  const bounces = hasAbilityFlag(
    data,
    target,
    'bouncesStatusMoves',
    monsterBattleContext(data, d, target)
  )
  if (!coated && !bounces) return false
  const side = sideOf(d, target.id)
  const slot = slotsOf(d.battle, side).indexOf(target.id)
  if (slot < 0) return false
  log(d, { type: 'reflected', monsterId: target.id, skillId: use.skill.id })
  executeSkill(data, d, {
    side,
    slot,
    user: target,
    skill: use.skill,
    targetId: use.user.id,
    reactive: true,
    reflected: true
  })
  return true
}

/**
 * Snatch: skill cướp được (tăng bậc / hồi máu nhắm bản thân) do quái khác dùng trong lượt có Snatch
 * thì quái có Snatch dùng thay (một lần).
 */
function snatched(data: GameData, d: Draft, use: SkillUse): boolean {
  if (!use.skill.snatchable) return false
  const thief = [...d.battle.playerSlots, ...d.battle.enemySlots].find(
    (id) =>
      id !== null && id !== use.user.id && d.battle.volatiles[id]?.snatchTurn === d.battle.turn
  )
  if (!thief) return false
  const volatile = d.battle.volatiles[thief]
  if (volatile) delete volatile.snatchTurn
  const side = sideOf(d, thief)
  log(d, { type: 'snatched', monsterId: thief, skillId: use.skill.id })
  executeSkill(data, d, {
    side,
    slot: slotsOf(d.battle, side).indexOf(thief),
    user: findMonster(d, thief),
    skill: use.skill,
    reactive: true
  })
  return true
}

/** Powder: quái dính trạng thái nổ dùng skill hệ đó thì mất % max HP, skill thất bại. */
function explodesOnUse(data: GameData, d: Draft, user: Monster, skill: Skill): boolean {
  for (const status of user.statuses) {
    const rule = data.statuses[status.statusId]?.explodesOnElement
    if (!rule || !rule.elementIds.includes(skill.elementId)) continue
    loseHp(data, d, user, percentOfMaxHp(getMaxHp(data, user), rule.percent), (amount) => ({
      type: 'selfDamage',
      monsterId: user.id,
      skillId: skill.id,
      amount,
      reason: 'cost'
    }))
    log(d, { type: 'skillFailed', monsterId: user.id, skillId: skill.id, reason: 'condition' })
    return true
  }
  return false
}

/** Electrify: skill của quái dính trạng thái đổi hệ đổi sang hệ đó trong lượt. */
function electrified(data: GameData, user: Monster, skill: Skill): Skill {
  for (const status of user.statuses) {
    const elementId = data.statuses[status.statusId]?.skillElementOverride
    if (elementId) return { ...skill, elementId }
  }
  return skill
}

/** Lần dùng ở bước `index` của chuỗi: power × `damagePercents[index]`% (không có chuỗi thì giữ nguyên). */
function chainStepUse(use: SkillUse, index: number): SkillUse {
  const percent = use.skill.chain?.damagePercents?.[index]
  if (percent === undefined || percent === 100) return use
  const power = Math.max(1, Math.round((use.skill.power * percent) / 100))
  return { ...use, skill: { ...use.skill, power } }
}

/**
 * Spreader của Temtem (hook `spreadsSingleTarget`): đòn đơn nhắm địch đúng loại đánh mọi địch, đủ sát
 * thương mỗi quái nhưng power × `powerPercent`% khi có từ 2 địch trên sân.
 */
function spreadByTrait(data: GameData, d: Draft, user: Monster, skill: Skill): Skill {
  if (skill.target !== 'enemy' || skill.power <= 0 || skill.hits) return skill
  let percent: number | undefined
  forEachTraitHook(
    data,
    user,
    (handler, params) => {
      percent ??= handler.singleTargetSpreadPercent?.(params, skill)
    },
    monsterBattleContext(data, d, user)
  )
  if (percent === undefined) return skill
  const foes = aliveOnField(data, d, opponentOf(sideOf(d, user.id))).length
  const power = foes > 1 ? Math.max(1, Math.round((skill.power * percent) / 100)) : skill.power
  return { ...skill, target: 'allEnemies', fullSpread: true, power }
}

/**
 * Multitarget / Unitarget (element-reactions.md): trạng thái đổi mục tiêu skill gây sát thương nhắm
 * địch. Skill đánh nhiều lần và skill tự nhắm kẻ vừa đánh giữ nguyên (luật "Skill đánh nhiều lần").
 */
function retargetedByStatus(data: GameData, user: Monster, skill: Skill): Skill {
  if (skill.power <= 0 || skill.hits || skill.targetsLastAttacker) return skill
  if (skill.target !== 'enemy' && skill.target !== 'allEnemies') return skill
  for (const status of user.statuses) {
    const target = data.statuses[status.statusId]?.skillTargetOverride
    if (target) return target === skill.target ? skill : { ...skill, target }
  }
  return skill
}

/** Spring-Loaded: skill cận chiến của quái mang trạng thái thành tầm xa (không tiếp xúc). */
function springLoaded(data: GameData, user: Monster, skill: Skill): Skill {
  if (skillReach(skill) !== 'melee') return skill
  if (!user.statuses.some((status) => data.statuses[status.statusId]?.meleeAsRanged)) return skill
  const { contact: _contact, ...rest } = skill
  return { ...rest, reach: 'ranged' }
}

/** Long Reach: skill của quái không tiếp xúc (không dính Spiky Shield, Rough Skin theo tiếp xúc...). */
function withoutContact(data: GameData, d: Draft, user: Monster, skill: Skill): Skill {
  if (!skill.contact) return skill
  if (!hasAbilityFlag(data, user, 'noContact', monsterBattleContext(data, d, user))) return skill
  const { contact: _contact, ...rest } = skill
  return rest
}

/** Skill đủ điều kiện `requires` của phần spell lên mục tiêu (Steel Roller, Sucker Punch...). */
function meetsRequirements(data: GameData, d: Draft, use: SkillUse, target: Monster): boolean {
  if (use.skill.spell?.requires === undefined) return true
  const userCtx = monsterBattleContext(data, d, use.user)
  const targetCtx = monsterBattleContext(data, d, target)
  return meetsSpellRequirements(use.skill, {
    data,
    self: use.user,
    selfCtx: userCtx,
    target,
    targetCtx,
    other: target,
    otherCtx: targetCtx,
    skill: use.skill,
    reactive: use.reactive
  })
}

/**
 * Skill được trait cộng priority mà mục tiêu phe địch miễn (Prankster trước hệ Bóng tối, như
 * Pokémon): không có tác dụng lên mục tiêu đó, ghi log.
 */
function isBoostUnaffected(
  data: GameData,
  d: Draft,
  user: Monster,
  skill: Skill,
  target: Monster
): boolean {
  const traitId = priorityBoostBlockerTraitId(
    data,
    { user, skill, target },
    monsterBattleContext(data, d, user)
  )
  if (traitId === null) return false
  log(d, { type: 'boostUnaffected', monsterId: target.id, userId: user.id, traitId })
  return true
}

/**
 * Skill của quái có bị chặn không: trạng thái chặn loại skill (Scorned / Silenced), skill bị khóa
 * (Seal), bộ phận ra chiêu đã bị phá, room cấm skill (Gravity), thời tiết nguyên thủy chặn hệ
 * (Heavy Rain), trait chặn tự chọn loại skill (chỉ với hành động của chính nó, không với skill do trait).
 */
export function isSkillBlocked(
  data: GameData,
  d: Draft,
  { user, skill, reactive }: { user: Monster; skill: Skill; reactive?: boolean }
): boolean {
  // Skill chỉ bị động (passive của Cassette Beasts) không dùng được, kể cả do trait chọn.
  if (isPassiveOnly(skill)) return true
  // Paint Swipe: chỉ dùng được khi đang có lớp phủ hệ.
  if (skill.requiresCoating && d.battle.volatiles[user.id]?.coatingTurnsLeft === undefined) {
    return true
  }
  const byStatus = hasStatusFlag(data, user, (handler, params) =>
    handler.blockedCategories?.(params).includes(skill.category)
  )
  if (byStatus) return true
  if (d.battle.volatiles[user.id]?.sealedSkillIds?.includes(skill.id)) return true
  if (
    skill.maxUsesPerBattle !== undefined &&
    (d.battle.records[user.id]?.skillUses?.[skill.id] ?? 0) >= skill.maxUsesPerBattle
  ) {
    return true
  }
  // Bộ phận ra chiêu đã bị phá (hit-locations.md mục "Phá bộ phận"), kể cả skill do trait.
  if (usesBrokenPart(d, user, skill)) return true
  // Ô skill nhân hình đang khóa (docs/rules/human-form.md): AI bỏ qua, dùng (kể cả do trait) thất bại.
  if (lockedSkillIds(data, user).includes(skill.id)) return true
  if (isSkillBannedByRoom(data, d.battle.field, skill.id)) return true
  // Thời tiết nguyên thủy (Heavy Rain chặn chiêu Lửa), xét theo hệ đã đổi và môi trường của quái.
  const field = userField(data, d, user)
  if (fieldBlockingSkill(data, field, skillInField(data, field, skill, user)) !== null) return true
  if (isPokemonBlocked(data, d, user, skill)) return true
  if (reactive) return false
  if (isLockedOut(data, d, user, skill)) return true
  let byTrait = false
  forEachTraitHook(
    data,
    user,
    (handler, params) => {
      if (handler.blockedCategories?.(params).includes(skill.category)) byTrait = true
    },
    monsterBattleContext(data, d, user)
  )
  return byTrait
}

/**
 * Skill thật quái dùng bằng lệnh: không còn skill nào (đã biết, tạm có) dùng được (bị chặn / đang
 * chờ) thì dùng Struggle (config.battle.struggleSkillId), như Pokémon; không có Struggle thì giữ.
 */
export function skillOrStruggle(data: GameData, d: Draft, user: Monster, skill: Skill): Skill {
  const struggleId = data.config.battle.struggleSkillId
  if (struggleId === undefined || hasUsableSkill(data, d, user)) return skill
  return data.skills[struggleId]
}

/** Quái còn skill dùng được: không bị chặn, không đang chờ (hold). */
export function hasUsableSkill(data: GameData, d: Draft, user: Monster): boolean {
  const tempSkillIds = d.battle.volatiles[user.id]?.tempSkillIds ?? []
  return [...battleSkillIds(user), ...tempSkillIds].some((id) => {
    const skill = data.skills[id]
    return holdTurnsLeft(d.battle, user, skill) === 0 && !isSkillBlocked(data, d, { user, skill })
  })
}

/**
 * Chặn theo luật chiêu Pokémon: skill bị Disable, Torment (không dùng lại skill vừa dùng ở lượt
 * trước), Imprison của quái phe địch trên sân (biết skill này).
 */
function isPokemonBlocked(data: GameData, d: Draft, user: Monster, skill: Skill): boolean {
  const volatile = d.battle.volatiles[user.id]
  const disabled = volatile?.disabledSkill
  if (disabled && disabled.skillId === skill.id && disabled.untilTurn >= d.battle.turn) return true
  const streak = volatile?.skillStreak
  const tormented = user.statuses.some((s) => data.statuses[s.statusId]?.blocksRepeatSkill)
  // Chuỗi đã ghi lần dùng hiện tại trước bước chặn (count ≥ 2 ở lượt này); AI xét trước khi ghi.
  const repeats =
    streak?.skillId === skill.id &&
    (streak.turn === d.battle.turn - 1 || (streak.turn === d.battle.turn && streak.count >= 2))
  if (tormented && repeats) return true
  if (
    skill.moveFlags?.includes('sound') &&
    user.statuses.some((s) => data.statuses[s.statusId]?.blocksSoundSkills)
  ) {
    return true
  }
  const foes = aliveOnField(data, d, opponentOf(sideOf(d, user.id))).map((entry) => entry.monster)
  return foes.some(
    (foe) =>
      foe.statuses.some((s) => data.statuses[s.statusId]?.imprisons) &&
      battleSkillIds(foe).includes(skill.id)
  )
}

/** Quái đang có hook khóa skill (kiểu Choice Band) có tác dụng không. */
const locksChoice = (data: GameData, d: Draft, user: Monster): boolean =>
  hasTraitFlag(
    data,
    user,
    (handler, params) => handler.locksChoice?.(params),
    monsterBattleContext(data, d, user)
  )

/** Skill khác skill đã khóa (kiểu Choice Band) thì không dùng được. */
function isLockedOut(data: GameData, d: Draft, user: Monster, skill: Skill): boolean {
  const locked = d.battle.volatiles[user.id]?.choiceLockSkillId
  return locked !== undefined && locked !== skill.id && locksChoice(data, d, user)
}

/** Lần dùng skill đầu tiên trên sân của quái mang hook khóa skill: khóa vào skill đó. */
function lockChoice(data: GameData, d: Draft, user: Monster, skill: Skill): void {
  const volatile = d.battle.volatiles[user.id]
  if (!volatile || volatile.choiceLockSkillId !== undefined || !locksChoice(data, d, user)) return
  volatile.choiceLockSkillId = skill.id
}

/** Hành động bị ngắt theo tỉ lệ (trait kiểu Stomp phát qua hào quang lên địch). */
function rollInterrupt(data: GameData, d: Draft, user: Monster, skill: Skill): boolean {
  let miss = 1
  const ctx = monsterBattleContext(data, d, user)
  const view = { data, self: user, selfCtx: ctx, attacker: user, attackerCtx: ctx, skill }
  forEachTraitHook(
    data,
    user,
    (handler, params, scale) => {
      miss *= 1 - Math.min(100, handler.interruptChance?.(params, scale, view) ?? 0) / 100
    },
    ctx
  )
  if (miss >= 1) return false
  let interrupted: boolean
  ;[interrupted, d.rng] = rollPercent(d.rng, (1 - miss) * 100)
  if (interrupted) log(d, { type: 'interrupted', monsterId: user.id })
  return interrupted
}

/**
 * Trúng accuracy rồi không bị né; trượt / né thì ghi log (né xếp sự kiện dodged). Chiêu Max và
 * Z-Move luôn trúng (bỏ qua accuracy và né).
 */
function landsOn(
  data: GameData,
  d: Draft,
  use: SkillUse,
  { target, aimed }: { target: Monster; aimed: AimedPart | null }
): boolean {
  const { user, skill } = use
  // Tầm chiêu: cận chiến của quái đứng trên đất không với tới quái đang bay (hit-locations.md).
  if (!canReach(data, d, { user, skill, target })) {
    log(d, { type: 'outOfReach', monsterId: user.id, targetId: target.id })
    return false
  }
  // Mục tiêu đang bán vô hình (Fly, Dig...): chỉ skill trúng được kiểu đó mới trúng.
  if (isOutOfReach(d, skill, target, use.user)) {
    log(d, { type: 'miss', monsterId: user.id, targetId: target.id })
    return false
  }
  if (isBattleOnlyMove(skill)) return true
  // Stomp, Body Slam... luôn trúng quái đã Minimize.
  const vsStatuses = skill.alwaysHitsVsStatusIds ?? []
  if (target.statuses.some((status) => vsStatuses.includes(status.statusId))) return true
  const userCtx = monsterBattleContext(data, d, user)
  const targetCtx = monsterBattleContext(data, d, target)
  // Accuracy theo từng mục tiêu (né đòn của mục tiêu), tung một lần cho cả chiêu lên mục tiêu đó
  // (kể cả chiêu đánh nhiều lần).
  const baseAccuracy = skillAccuracy(data, userField(data, d, user), skill, {
    user,
    target,
    userCtx,
    targetCtx,
    stages: d.battle.stages
  })
  // Wonder Skin: skill trạng thái nhắm nó có chính xác tối đa 50%. Nhắm bộ phận đổi accuracy.
  const accuracy =
    (skill.category === 'status' && hasAbilityFlag(data, target, 'halvesStatusAccuracy', targetCtx)
      ? Math.min(baseAccuracy, 50)
      : baseAccuracy) * aimAccuracyFactor(skill, aimed)
  let hit: boolean
  ;[hit, d.rng] = rollPercent(d.rng, accuracy)
  if (!hit) {
    log(d, { type: 'miss', monsterId: user.id, targetId: target.id })
    // Nhắm bộ phận mà hụt thì lộ sơ hở (mất thế, hit-locations.md).
    if (aimed) markOffBalance(data, d, { monster: user, cause: 'missed' })
    return false
  }
  if (skill.power <= 0) return true
  const dodge = traitDodgeChance({
    data,
    attacker: user,
    defender: target,
    attackerCtx: userCtx,
    defenderCtx: targetCtx,
    skill,
    reactive: use.reactive
  })
  if (dodge <= 0) return true
  let dodged: boolean
  ;[dodged, d.rng] = rollPercent(d.rng, dodge)
  if (!dodged) return true
  log(d, { type: 'dodge', monsterId: target.id, attackerId: user.id })
  emitTraitEvent(d, { type: 'dodged', subjectId: target.id, otherId: user.id, skillId: skill.id })
  if (aimed) markOffBalance(data, d, { monster: user, cause: 'missed' })
  return false
}

/**
 * Hiệu ứng "ngôn ngữ" trait của spell Siralim lên một quái (mục "Spell Siralim"): quái dùng là chủ
 * hiệu ứng, quái nhận là subject / other / target, lượng = sát thương đã gây.
 */
function runSpellEffects(
  data: GameData,
  d: Draft,
  {
    user,
    skill,
    target,
    amount,
    chain
  }: {
    user: Monster
    skill: Skill
    target: Monster
    amount: Decimal
    /** Bước của chuỗi (`Skill.chain`; điều kiện `chainStep`). */
    chain?: { index: number; size: number }
  },
  effects: readonly TraitEffect[]
): void {
  if (effects.length === 0) return
  const targetCtx = monsterBattleContext(data, d, target)
  const view: DslView = {
    data,
    self: user,
    selfCtx: monsterBattleContext(data, d, user),
    subject: target,
    subjectCtx: targetCtx,
    other: target,
    otherCtx: targetCtx,
    target,
    targetCtx,
    skill,
    amount,
    ...(chain ? { chain } : {})
  }
  const run = { owner: user, scale: 1, subject: target, other: target, amount, skillId: skill.id }
  runTraitEffects(data, d, { ...run, view }, effects)
}

/** Bản ghi trận, sự kiện attack / cast và trạng thái hết sau hành động của quái dùng. */
function afterUse(
  data: GameData,
  d: Draft,
  use: SkillUse,
  { firstHit, totalDealt }: { firstHit: Monster | null; totalDealt: Decimal }
): void {
  const { user, skill } = use
  const record = recordOf(d, user.id)
  const isAttack = skill.category === 'physical' && skill.power > 0
  if (isAttack) record.attacks++
  else if (skill.category !== 'physical') {
    record.casts++
    d.battle.counters.casts[sideOf(d, user.id)]++
    d.battle.counters.lastCastSkillId = skill.id
  }
  if (!use.reactive) record.lastAction = isAttack ? 'attack' : 'cast'
  const event = {
    subjectId: user.id,
    otherId: firstHit?.id,
    skillId: skill.id,
    reactive: use.reactive,
    amount: totalDealt
  }
  if (isAttack && firstHit) emitTraitEvent(d, { ...event, type: 'attack' })
  // Ô spell của Artifact kích hoạt sau đòn tấn công bằng lệnh của quái (không phải đòn phản ứng).
  if (isAttack && firstHit && !use.reactive) activateSpellSlotsAfterAttack(data, d, user)
  if (skill.category !== 'physical') emitTraitEvent(d, { ...event, type: 'cast' })
  for (const status of [...user.statuses]) {
    const ends = findStatusHook(data, { ...user, statuses: [status] }, (handler, params) => {
      if (!handler.endsAfterAction) return undefined
      const categories = handler.endsAfterAction(params)
      return categories === null || categories.includes(skill.category) ? true : undefined
    })
    if (ends) removeStatus(d, user, status.statusId)
  }
}

/** Không lặp, 100% hiệu quả (Z-Move). */
const NO_REPEATS = { extra: 0, percent: 100 } as const

/** Số lần lặp skill của trait (kiểu Multicast) và % hiệu quả mỗi lần. */
function traitRepeats(
  data: GameData,
  d: Draft,
  user: Monster,
  skill: Skill
): { extra: number; percent: number } {
  let extra = 0
  let percent = 100
  forEachTraitHook(
    data,
    user,
    (handler, params, scale) => {
      const repeat = handler.repeatSkill?.(params, scale, skill.category)
      if (!repeat) return
      extra += repeat.extra
      percent = (percent * repeat.damagePercent) / 100
    },
    monsterBattleContext(data, d, user)
  )
  return { extra, percent }
}

/**
 * Synergy của skill (mục "Synergy" ở battle.md): có đồng đội đúng hệ trên sân thì ghi log và cộng
 * hiệu ứng synergy vào skill (power cộng ở công thức sát thương).
 */
function withSynergy(data: GameData, d: Draft, use: SkillUse): SkillUse {
  const ctx = monsterBattleContext(data, d, use.user)
  const scene = { data, user: use.user, allies: ctx?.allies ?? [], ctx }
  const partner = synergyPartner(scene, use.skill)
  if (!partner) return use
  log(d, { type: 'synergy', monsterId: use.user.id, skillId: use.skill.id, partnerId: partner.id })
  return { ...use, skill: withSynergyEffects(scene, use.skill) }
}

/** Z-Move xuyên Max Guard: chỉ gây protectDamagePercent % sát thương lên mục tiêu đó. */
const piercingStrike = (
  data: GameData,
  use: SkillUse,
  target: Monster
): SkillUse & { target: Monster } => ({
  ...use,
  target,
  damagePercent:
    ((use.damagePercent ?? 100) * data.config.transform.zMove.protectDamagePercent) / 100
})

/** Kết quả một lần dùng skill: số quái phe địch bị hạ (exp thuần thục), có trúng mục tiêu nào không. */
interface SkillOutcome {
  knockouts: number
  landed: boolean
}

const FAILED: SkillOutcome = { knockouts: 0, landed: false }

/**
 * Một lần dùng skill (không tính lặp của trait). Quái đang biến hình dùng skill thật (chiêu Max,
 * Tera Blast...: battleSkill); khóa / chặn skill vẫn xét theo skill gốc đã chọn.
 */
function performSkillOnce(
  data: GameData,
  d: Draft,
  chosen: SkillUse,
  zSkill: Skill | null
): SkillOutcome {
  const { user } = chosen
  const original = chosen.targetAlly
    ? allyVersion(chosen.skill)
    : chosen.targetFoe
      ? foeVersion(chosen.skill)
      : chosen.skill
  // Hợp kích kỹ không đổi theo biến hình (không thành chiêu Max). Thế đổi skill thật khi dùng
  // (chiêu Max không có thế nên giữ nguyên). Z-Move đã tính sẵn lúc bắt đầu (startZMove).
  const actual = chosen.partner
    ? chosen
    : {
        ...chosen,
        skill: skillTargetInField(
          data,
          userField(data, d, user),
          withoutContact(
            data,
            d,
            user,
            retargetedByStatus(
              data,
              user,
              stickerSpread(
                data,
                d,
                user,
                spreadByTrait(
                  data,
                  d,
                  user,
                  springLoaded(
                    data,
                    user,
                    electrified(
                      data,
                      user,
                      zSkill ??
                        styledSkill(data, battleSkill(data, d, user, original), chosen.style)
                    )
                  )
                )
              )
            )
          ),
          user
        )
      }
  logSkillUse(data, d, actual)
  if (explodesOnUse(data, d, user, actual.skill)) return FAILED
  // Damp: quái trên sân có ability chặn chiêu tự gục (Explosion, Self-Destruct, Mind Blown...).
  if (actual.skill.selfFaint && dampedBy(data, d)) {
    log(d, {
      type: 'skillFailed',
      monsterId: user.id,
      skillId: actual.skill.id,
      reason: 'condition'
    })
    return FAILED
  }
  if (failsFirstTurnRule(d, user, actual.skill)) {
    log(d, {
      type: 'skillFailed',
      monsterId: user.id,
      skillId: actual.skill.id,
      reason: 'notFirstTurn'
    })
    return FAILED
  }
  if (isSkillBlocked(data, d, chosen)) {
    log(d, { type: 'skillBlocked', monsterId: user.id, skillId: actual.skill.id })
    return FAILED
  }
  // Hợp kích kỹ không khóa skill kiểu Choice Band (không phải skill riêng của quái).
  if (!chosen.reactive && !chosen.partner) lockChoice(data, d, user, original)
  if (rollInterrupt(data, d, user, actual.skill)) return FAILED
  // Stance Change: đổi dạng trước khi skill có tác dụng (chỉ số dạng mới tính cho đòn này).
  if (!chosen.reactive) formBeforeSkillUse(data, d, user, actual.skill)
  const use = withLastAttacker(d, withSynergy(data, d, actual))
  if (!use) {
    log(d, {
      type: 'skillFailed',
      monsterId: user.id,
      skillId: actual.skill.id,
      reason: 'condition'
    })
    applySelfCosts(data, d, actual, { ...FAILED, totalDealt: BIG_ZERO })
    return FAILED
  }
  const thrown = throwWall(data, d, use)
  if (!thrown) {
    log(d, { type: 'skillFailed', monsterId: user.id, skillId: use.skill.id, reason: 'condition' })
    return FAILED
  }
  const outcome = applyToTargets(data, d, thrown)
  applySelfCosts(data, d, thrown, outcome)
  return outcome
}

/**
 * Skill tự nhắm kẻ vừa đánh (Counter, Mirror Coat, Metal Burst): mục tiêu là quái phe địch còn trên
 * sân gây đòn cuối cùng đúng loại cho quái dùng trong lượt; không có thì null (thất bại).
 */
function withLastAttacker(d: Draft, use: SkillUse): SkillUse | null {
  const rule = use.skill.targetsLastAttacker
  if (!rule) return use
  const log = d.battle.volatiles[use.user.id]?.turnLog
  const hits = log?.turn === d.battle.turn ? (log.hits ?? []) : []
  const userSide = sideOf(d, use.user.id)
  const onField = new Set([...d.battle.playerSlots, ...d.battle.enemySlots])
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i]
    if (rule.categories && !rule.categories.includes(hit.category)) continue
    if (!onField.has(hit.by) || sideOf(d, hit.by) === userSide) continue
    return { ...use, targetId: hit.by }
  }
  return null
}

/** Kết quả dùng skill lên các mục tiêu, kèm tổng sát thương (chi phí tự thân kiểu Jump Kick). */
interface TargetsOutcome extends SkillOutcome {
  totalDealt: Decimal
}

/** Dùng skill lên các mục tiêu (đã qua chặn / khóa / ngắt): điều kiện, bảo vệ, trúng, đòn, hiệu ứng. */
function applyToTargets(data: GameData, d: Draft, use: SkillUse): TargetsOutcome {
  const { user, side, slot, skill, targetSlot } = use
  const targets = resolveTargets(data, d, {
    side,
    slot,
    user,
    skill,
    targetSlot,
    targetId: use.targetId
  })
  if (targets.length === 0) {
    log(d, { type: 'noTarget', monsterId: user.id })
    return { ...FAILED, totalDealt: BIG_ZERO }
  }
  const targetsOpponent = isOffensiveTarget(skill.target)
  const spread = isReducedSpread(skill, targets.length)
  if (targetsOpponent) markSwoop(data, d, { user, skill, targets })

  let firstHit: Monster | null = null
  let totalDealt = BIG_ZERO
  let knockouts = 0
  let requirementFailed = false
  // Chuỗi (Chain Lightning): mục tiêu trước chặn được đòn thì dừng; mỗi bước một % sát thương.
  let chainStopped = false
  for (const [index, target] of targets.entries()) {
    if (skill.chain && chainStopped) break
    chainStopped = skill.chain !== undefined
    const stepUse = chainStepUse(use, index)
    const hitsFoe = sideOf(d, target.id) !== sideOf(d, user.id)
    if (!meetsRequirements(data, d, use, target)) {
      if (!requirementFailed) {
        log(d, { type: 'skillFailed', monsterId: user.id, skillId: skill.id, reason: 'condition' })
      }
      requirementFailed = true
      continue
    }
    if (hitsFoe && reflectBack(data, d, use, target)) continue
    // Queenly Majesty / Dazzling / Armor Tail: phe mục tiêu chặn skill priority > 0 của địch.
    if (hitsFoe && blocksPriorityAgainst(data, d, { user, skill, target })) {
      log(d, { type: 'skillFailed', monsterId: user.id, skillId: skill.id, reason: 'condition' })
      continue
    }
    // Hệ Cỏ / Overcoat: miễn chiêu bột (cờ chiêu) của quái khác.
    if (target.id !== user.id && immuneToMoveFlags(data, d, { skill, target })) {
      log(d, { type: 'skillFailed', monsterId: user.id, skillId: skill.id, reason: 'condition' })
      continue
    }
    // Good as Gold: miễn skill trạng thái của quái khác.
    if (
      skill.category === 'status' &&
      target.id !== user.id &&
      blocksStatusMoves(data, d, target)
    ) {
      log(d, { type: 'skillFailed', monsterId: user.id, skillId: skill.id, reason: 'condition' })
      continue
    }
    const aimed = hitsFoe ? aimedPartOn(data, { skill, target, aim: use.aim }) : null
    const protection = protectionAgainst(data, d, { user, target, skill })
    if (protection === 'blocked') {
      punishContact(data, d, { user, target, skill })
      continue
    }
    if (targetsOpponent && hitsFoe) {
      if (isGuarded(data, d, user, skill, target)) continue
      if (isBoostUnaffected(data, d, user, skill, target)) continue
      // Mục tiêu hút skill theo hệ (kiểu Water Absorb): trước accuracy, không nhận gì thêm.
      if (absorbSkill(data, d, { user, skill, target })) continue
      if (!landsOn(data, d, use, { target, aimed })) continue
      if (aimed) {
        log(d, {
          type: 'aimedHit',
          monsterId: user.id,
          targetId: target.id,
          partId: aimed.part.id,
          weakPoint: aimed.weak
        })
        revealPart(data, d, target, aimed)
      }
    }
    if (skill.breaksScreens && hitsFoe) breakScreens(data, d, { user, target })
    if (skill.stealsBoosts && hitsFoe) stealBoosts(data, d, { user, target })
    chainStopped = false
    const strike =
      protection === 'pierced' ? piercingStrike(data, stepUse, target) : { ...stepUse, target }
    const wasStanding = !isFainted(data, target)
    const { total: dealt, walled } = strikeTarget(data, d, strike, { spread, aimed })
    applySkillEffects(data, d, { ...strike, walled }, 'afterHits', dealt, firstHit !== null)
    // Hiệu ứng khi trúng bộ phận (một lần cho cả chiêu lên mục tiêu, như hiệu ứng phụ của skill).
    if (aimed && dealt.gt(0) && !isFainted(data, target)) {
      const partHit = { ...strike.skill, effects: aimed.part.hitEffects }
      applySkillEffects(
        data,
        d,
        { ...strike, skill: partHit, chanceBonus: aimChanceMultiplier(data, aimed) },
        'afterHits',
        dealt
      )
    }
    runElementReactions(data, d, { user, skill, target, walled })
    const chain = skill.chain ? { index, size: targets.length } : undefined
    runSpellEffects(
      data,
      d,
      { user, skill, target, amount: dealt, chain },
      spellTargetEffects(skill)
    )
    if (hitsFoe && dealt.gt(0) && skill.category === 'physical') {
      emitTraitEvent(d, {
        type: 'attacked',
        subjectId: target.id,
        otherId: user.id,
        skillId: skill.id,
        amount: dealt,
        reactive: use.reactive
      })
    }
    if (hitsFoe && wasStanding && isFainted(data, target)) knockouts++
    firstHit ??= target
    totalDealt = totalDealt.plus(dealt)
  }
  afterUse(data, d, use, { firstHit, totalDealt })
  if (totalDealt.gt(0)) applyRecoil(data, d, user)
  // Tera Stellar: hệ của skill gây sát thương vừa dùng hết lượt tăng.
  if (firstHit && skill.power > 0) {
    recordStellarUse(user, skillInField(data, userField(data, d, user), skill, user).elementId)
  }
  // Hiệu ứng cả chiêu (setField, setSideField, switchOut...): một lần, chỉ khi trúng ít nhất một
  // mục tiêu.
  if (!firstHit) return { knockouts, landed: false, totalDealt }
  const request = applySkillEffects(
    data,
    d,
    { user, skill, target: firstHit, style: use.style },
    'perSkill',
    totalDealt
  )
  runSpellEffects(
    data,
    d,
    { user, skill, target: firstHit, amount: totalDealt },
    spellAfterEffects(skill)
  )
  if (request) switchUserOut(data, d, use, request, firstHit)
  return { knockouts, landed: true, totalDealt }
}

/** Throw: dùng tường của quái làm đạn, sát thương × lượt còn lại; không có tường thì null. */
function throwWall(data: GameData, d: Draft, use: SkillUse): SkillUse | null {
  if (!use.skill.consumesWall) return use
  const turns = consumeWall(data, d, use.user)
  return turns === null ? null : { ...use, damagePercent: (use.damagePercent ?? 100) * turns }
}

/** Có quái trên sân mang ability Damp (chặn chiêu tự gục). */
const dampedBy = (data: GameData, d: Draft): boolean =>
  (['player', 'enemy'] as const).some((side) =>
    aliveOnField(data, d, side).some(({ monster }) =>
      hasAbilityFlag(data, monster, 'blocksSelfFaint', monsterBattleContext(data, d, monster))
    )
  )

/** Skill có priority > 0 nhắm vào phe có quái mang cờ blocksPriorityMoves. */
function blocksPriorityAgainst(
  data: GameData,
  d: Draft,
  { user, skill, target }: { user: Monster; skill: Skill; target: Monster }
): boolean {
  if (skillPriority(data, user, skill, monsterBattleContext(data, d, user)) <= 0) return false
  return aliveOnField(data, d, sideOf(d, target.id)).some(({ monster }) =>
    hasAbilityFlag(data, monster, 'blocksPriorityMoves', monsterBattleContext(data, d, monster))
  )
}

/** Mục tiêu miễn skill theo cờ chiêu: hệ có `immuneMoveFlags` hoặc hook `moveFlagImmunity`. */
function immuneToMoveFlags(
  data: GameData,
  d: Draft,
  { skill, target }: { skill: Skill; target: Monster }
): boolean {
  const flags = skill.moveFlags ?? []
  if (flags.length === 0) return false
  const byElement = target.elementIds.some((id) =>
    (data.elements[id]?.immuneMoveFlags ?? []).some((flag) => flags.includes(flag))
  )
  if (byElement) return true
  return hasTraitFlag(
    data,
    target,
    (handler, params) => (handler.immuneMoveFlags?.(params) ?? []).some((f) => flags.includes(f)),
    monsterBattleContext(data, d, target)
  )
}

const blocksStatusMoves = (data: GameData, d: Draft, target: Monster): boolean =>
  hasAbilityFlag(data, target, 'blocksStatusMoves', monsterBattleContext(data, d, target))

/** Spectral Thief: chuyển mọi bậc đang dương của mục tiêu sang quái dùng (cộng dồn, kẹp như thường). */
function stealBoosts(
  data: GameData,
  d: Draft,
  { user, target }: { user: Monster; target: Monster }
): void {
  const stages = d.battle.stages[target.id]
  if (!stages) return
  const stolen = STAGE_STATS.filter((stat) => (stages[stat] ?? 0) > 0)
  if (stolen.length === 0) return
  log(d, { type: 'boostsStolen', monsterId: user.id, targetId: target.id, stats: stolen })
  for (const stat of stolen) {
    const amount = stages[stat] ?? 0
    delete stages[stat]
    changeStage(data, d, user.id, stat, amount)
  }
}

/**
 * Chi phí tự thân sau khi dùng skill (như Pokémon): mất % max HP mỗi lần dùng (Mind Blown), trượt /
 * không gây sát thương thì mất % max HP (Jump Kick), tự gục (Explosion; Final Gambit chỉ khi trúng).
 */
function applySelfCosts(data: GameData, d: Draft, use: SkillUse, outcome: TargetsOutcome): void {
  const { user, skill } = use
  const lose = (amount: Decimal, reason: 'faint' | 'crash' | 'cost' | 'recoil'): void => {
    if (isFainted(data, user) || amount.lte(0)) return
    loseHp(data, d, user, amount, (dealt) => ({
      type: 'selfDamage',
      monsterId: user.id,
      skillId: skill.id,
      amount: dealt,
      reason
    }))
  }
  const maxHp = getMaxHp(data, user)
  if (skill.selfDamagePercent) lose(percentOfMaxHp(maxHp, skill.selfDamagePercent), 'cost')
  // Phản lực theo tổng sát thương gây ra, ít nhất 1 (Double-Edge 33%, Head Smash 50%), như Pokémon.
  const recoilImmune = hasTraitFlag(
    data,
    user,
    (handler, params) => handler.immuneToRecoil?.(params),
    monsterBattleContext(data, d, user)
  )
  if (skill.recoilPercent && outcome.totalDealt.gt(0) && !recoilImmune) {
    lose(maxBig(1, outcome.totalDealt.times(skill.recoilPercent).div(100).round()), 'recoil')
  }
  const missed = !outcome.landed || outcome.totalDealt.lte(0)
  if (skill.crashDamagePercent && missed) {
    lose(percentOfMaxHp(maxHp, skill.crashDamagePercent), 'crash')
  }
  if (skill.selfFaint === 'always' || (skill.selfFaint === 'onHit' && outcome.landed)) {
    lose(getCurrentHp(data, user), 'faint')
  }
}

/** Id mục tiêu đã chọn của lần dùng (id chỉ định, hoặc quái ở ô mục tiêu phe địch). */
function chosenTargetId(d: Draft, use: SkillUse): string | undefined {
  if (use.targetId) return use.targetId
  if (use.targetSlot === undefined) return undefined
  return slotsOf(d.battle, opponentOf(use.side))[use.targetSlot] ?? undefined
}

/**
 * Lượt đầu của chiêu nhiều lượt bằng lệnh của quái: đòn đến muộn (đặt lên ô mục tiêu) hoặc nạp
 * (Fly, Solar Beam). Trả về true nếu lượt này không đánh.
 */
function beginMultiTurn(data: GameData, d: Draft, use: SkillUse): boolean {
  const { user, skill } = use
  if (skill.bide) {
    const step = bideStep(d, { user, skill })
    if (step.kind === 'release') {
      if (step.targetId) use.targetId = step.targetId
      return false
    }
    logSkillUse(data, d, use)
    if (step.kind === 'fail') {
      log(d, { type: 'skillFailed', monsterId: user.id, skillId: skill.id, reason: 'condition' })
    }
    return true
  }
  const targetId = chosenTargetId(d, use)
  if (skill.delayedTurns !== undefined) {
    logSkillUse(data, d, use)
    const target = targetId ? findMonster(d, targetId) : undefined
    const delayedTarget = skill.delayedHealPercent !== undefined ? user : target
    if (!delayedTarget || !scheduleDelayedAttack(d, { user, skill, target: delayedTarget })) {
      log(d, { type: 'skillFailed', monsterId: user.id, skillId: skill.id, reason: 'condition' })
    }
    return true
  }
  if (!skill.charge) return false
  const volatile = d.battle.volatiles[user.id]
  const charging = volatile?.charging?.skillId === skill.id
  if (startChargeIfNeeded(data, d, { user, skill, targetId })) return true
  // Lượt đánh sau khi nạp: nhắm lại mục tiêu đã chọn lúc nạp.
  if (charging && targetId) use.targetId = targetId
  return false
}

/**
 * Cuối lượt: đòn đến muộn tới hạn trúng quái đang ở ô đã chọn (như Pokémon: quái dùng không cần
 * còn trên sân; ô trống / quái đã gục thì mất).
 */
export function resolveDelayedAttacks(data: GameData, d: Draft): void {
  for (const attack of takeDueDelayedAttacks(d)) {
    const targetId = slotsOf(d.battle, attack.side)[attack.slot]
    if (!targetId) continue
    const target = findMonster(d, targetId)
    if (isFainted(data, target)) continue
    const user = findMonster(d, attack.userId)
    const userSide = sideOf(d, user.id)
    const skill = data.skills[attack.skillId]
    // Wish: hồi % max HP của quái dùng cho quái đang ở ô.
    if (attack.healPercent !== undefined) {
      heal(data, d, target, percentOfMaxHp(getMaxHp(data, user), attack.healPercent), user)
      continue
    }
    log(d, { type: 'delayedAttackHit', monsterId: user.id, skillId: skill.id, targetId })
    strikeOnce(
      data,
      d,
      { side: userSide, slot: 0, user, skill, target, reactive: true },
      {
        spread: false,
        damagePercent: 100
      }
    )
  }
}

/** Skill đổi theo lần dùng (`alternateUse`) và mục tiêu bắt buộc (`targetsHighestHpFoe`). */
function resolvedUse(data: GameData, d: Draft, use: SkillUse): SkillUse {
  let result = use
  const alternate = use.skill.alternateUse
  if (alternate && (d.battle.records[use.user.id]?.skillUses?.[use.skill.id] ?? 0) % 2 === 1) {
    result = { ...result, skill: { ...result.skill, ...alternate } }
  }
  if (use.skill.targetsHighestHpFoe) {
    const foes = aliveOnField(data, d, opponentOf(sideOf(d, use.user.id))).map((e) => e.monster)
    const highest = foes.reduce<Monster | undefined>(
      (best, foe) => (!best || getCurrentHp(data, foe).gt(getCurrentHp(data, best)) ? foe : best),
      undefined
    )
    if (highest) result = { ...result, targetId: highest.id }
  }
  return result
}

/**
 * Dùng skill, rồi lặp thêm theo trait (kiểu Multicast: mọi lần, kể cả lần đầu, theo % hiệu quả
 * của trait). Dừng lặp khi quái dùng gục hoặc rời ô sân. Skill đang chờ (hold) dùng bằng lệnh của
 * quái (kể cả skill do trait chọn ngẫu nhiên) thì thất bại; dùng được thì bắt đầu chờ lại.
 */
export function executeSkill(data: GameData, d: Draft, rawUse: SkillUse): void {
  const use = resolvedUse(data, d, rawUse)
  // Thể lực (docs/rules/stamina.md): chỉ skill bằng lệnh của chính quái, skill còn đang chờ thì không
  // ra đòn nên không tốn; quá sức phạt sau khi skill xong (vẫn ra đòn).
  const paysStamina =
    !use.reactive && !use.partner && holdTurnsLeft(d.battle, use.user, use.skill) === 0
  const deficit = paysStamina ? payStamina(data, d, use.user, use.skill) : 0
  runResolvedSkill(data, d, use)
  if (paysStamina) refundStickerStamina(data, d, use.user, use.skill)
  if (deficit > 0) overexert(data, d, use.user, deficit)
}

function runResolvedSkill(data: GameData, d: Draft, use: SkillUse): void {
  const ownAction = !use.reactive && !use.partner
  if (ownAction && holdTurnsLeft(d.battle, use.user, use.skill) > 0) {
    logSkillUse(data, d, use)
    log(d, { type: 'skillFailed', monsterId: use.user.id, skillId: use.skill.id, reason: 'onHold' })
    recordSkillOutcome(d, use.user, false)
    return
  }
  if (ownAction) {
    const turnLog = currentTurnLog(d, use.user.id)
    if (turnLog) turnLog.acted = true
    // Destiny Bond / Grudge chỉ giữ tới lần dùng skill kế tiếp.
    const volatile = d.battle.volatiles[use.user.id]
    if (volatile) {
      delete volatile.destinyBond
      delete volatile.grudge
    }
    if (snatched(data, d, use)) return
    // Encore: đếm lượt bị ép dùng lại.
    if (volatile?.lockedMove?.kind === 'encore' && volatile.lockedMove.skillId === use.skill.id) {
      volatile.lockedMove.turnsLeft--
      if (volatile.lockedMove.turnsLeft <= 0) delete volatile.lockedMove
    }
    recordStreak(d, use.user, use.skill)
    // Sticker Trick: skill đã bị thay bằng Booby Trap thì tự đánh chính mình thay cho skill.
    if (springBoobyTrap(data, d, use.user, use.skill.id)) {
      recordSkillOutcome(d, use.user, false)
      return
    }
    recordFieldStreak(d, use.skill)
    // Chiêu nhiều lượt (pokemon-moves.md mục "Chiêu nhiều lượt"): nạp, đòn đến muộn.
    if (beginMultiTurn(data, d, use)) {
      recordSkillOutcome(d, use.user, true)
      return
    }
    startLockIn(d, { user: use.user, skill: use.skill, targetId: chosenTargetId(d, use) })
  }
  // Thế đã dùng: lượt sau tốc độ xếp thứ tự theo thế (rút về giữa chiêu thì mất cùng trạng thái tạm).
  if (ownAction && use.style !== undefined && use.skill.styles !== undefined) {
    markStyleUsed(d, use.user, use.skill, use.style)
  }
  // Z-Move: phe hết lượt Z-Move và Z-Power chạy khi quái thật sự dùng; không lặp theo trait (như
  // Pokémon: Parental Bond không áp, Instruct không gọi lại được Z-Move).
  const zSkill = ownAction && use.zMove ? startZMove(data, d, use) : null
  const repeats = zSkill
    ? NO_REPEATS
    : stickerRepeats(data, d, use, traitRepeats(data, d, use.user, use.skill))
  const damagePercent = ((use.damagePercent ?? 100) * repeats.percent) / 100
  let used = false
  let knockouts = 0
  let landed = false
  for (let i = 0; i <= repeats.extra; i++) {
    if (isFainted(data, use.user) || slotsOf(d.battle, use.side)[use.slot] !== use.user.id) break
    const outcome = performSkillOnce(data, d, { ...use, damagePercent }, zSkill)
    knockouts += outcome.knockouts
    landed ||= outcome.landed
    used = true
  }
  if (!used) return
  if (!use.partner) {
    // Bộ đếm EXP theo chiêu: mọi lần skill được dùng / kích hoạt (sticker Exp, skill-stickers.md).
    const activated = recordOf(d, use.user.id)
    activated.activatedSkills = {
      ...activated.activatedSkills,
      [use.skill.id]: (activated.activatedSkills?.[use.skill.id] ?? 0) + 1
    }
    afterStickerUse(data, d, use.user, use.skill)
  }
  if (ownAction) {
    // Sau khi dùng: skill kế tiếp trong lượt thấy skill này là "vừa dùng" (Round, Fusion Flare).
    recordSkillThisTurn(d, use.skill.id, use.side)
    if (use.skill.pullsAllySameSkill) pullAlliesUsing(data, d, use)
    d.battle.counters.lastSkillId = use.skill.id
    const record = recordOf(d, use.user.id)
    record.skillUses = {
      ...record.skillUses,
      [use.skill.id]: (record.skillUses?.[use.skill.id] ?? 0) + 1
    }
    record.lastSkillCategory = use.skill.category
    record.elementUses = {
      ...record.elementUses,
      [use.skill.elementId]: (record.elementUses?.[use.skill.elementId] ?? 0) + 1
    }
    if (use.targetId) {
      const key = `${use.skill.id}|${use.targetId}`
      record.skillTargetUses = {
        ...record.skillTargetUses,
        [key]: (record.skillTargetUses?.[key] ?? 0) + 1
      }
    }
    recordSkillOutcome(d, use.user, landed)
    scheduleRecharge(d, use.user, use.skill, landed)
    if (use.skill.bide) endBide(d, use.user)
    if (use.skill.carriesTarget) dropCarried(d, use.user.id)
    if (use.skill.lockIn) advanceLockIn(data, d, use.user, landed)
  }
  gainMastery(data, d, use, knockouts)
  if (ownAction) startHold(d, use.user, use.skill)
}

/** Round: đồng đội trên sân đang chờ dùng cùng skill đi ngay sau (giữ thứ tự giữa chúng). */
function pullAlliesUsing(data: GameData, d: Draft, { user, side, skill }: SkillUse): void {
  const allies = aliveOnField(data, d, side)
    .map((entry) => entry.monster)
    .filter((ally) => ally.id !== user.id && pendingSkillOf(d, ally.id)?.skillId === skill.id)
  for (const ally of [...allies].reverse()) movePendingAction(d, ally.id, 'top')
}

/**
 * Exp thuần thục sau lệnh dùng skill (docs/rules/skill-mastery.md): useExp một lần cho cả lệnh (trúng
 * hay trượt, kể cả lặp của trait), knockoutExp mỗi quái địch bị hạ. Chỉ skill quái đang biết, dùng
 * bằng lệnh của chính nó (không tính skill do trait / minion, hợp kích kỹ); exp vào skill gốc đã chọn
 * (biến hình thành chiêu Max vẫn tính cho skill gốc).
 */
function gainMastery(data: GameData, d: Draft, use: SkillUse, knockouts: number): void {
  const { user, skill } = use
  if (use.reactive || use.partner || !user.skillIds.includes(skill.id)) return
  const { useExp, knockoutExp } = data.config.mastery
  const amount = useExp + knockoutExp * knockouts
  if (amount <= 0) return
  const gained = addMasteryExp(data, user, { skillId: skill.id, amount })
  user.skillMastery = gained.skillMastery
  if (gained.level > gained.levelBefore) {
    log(d, { type: 'masteryLevelUp', monsterId: user.id, skillId: skill.id, level: gained.level })
  }
}
