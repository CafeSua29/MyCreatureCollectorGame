// Dùng vật phẩm trong trận: ném bóng bắt quái, ném vật phẩm vào quái hoang, dùng thuốc lên quái
// của ta, kiểm tra lệnh.

import { recordQuestEvent } from '../quests'
import { ActionError, BIG_ZERO } from '../shared'
import { autoLockCaught, isFainted, mergeTraitLevel, startHistory } from '../monster'
import {
  applyItemToMonster,
  ballBonusMultiplier,
  ballCatchRateBonus,
  criticalCaptureMultiplier,
  battleRules,
  hasTrialRule,
  capacityOf,
  hasPartyRoom,
  hasRosterRoom,
  mealMultiplier,
  partyAfterJoining,
  tamerBonusMultiplier,
  recordEvolutionResearch,
  recordMonsterResearch,
  researchMultiplier
} from '../registries'
import { assertUsableIn, itemTarget, removeItems } from '../inventory'
import {
  dayOf,
  hourOf,
  type BallItem,
  type BattleState,
  type ConsumableItem,
  type GameData,
  type GameState,
  type Item,
  type Monster
} from '../model'
import { specialRule } from './specialBattles'
import { battleBlessingMultiplier } from './deities'
import { Draft, clearOnFieldState, log, recordOf, removeFromField } from './draft'
import { refreshPartnerBonus } from './hpChanges'
import { runSkillEffects } from './skillResults'
import { isShielded } from './volatiles'
import { isDynamaxed } from './transform'
import { nuzlockeCaptureError, spendNuzlockeEncounter } from './nuzlocke'
import { partnerMultiplier } from '../tamer'
import { catchChance, evolutionScene, rollCapture, withCatchPity } from '../world'

// ---------- Dùng vật phẩm, ném bóng ----------

export function consumeItem(d: Draft, itemId: string): void {
  d.inventory = removeItems(d.inventory, itemId, 1)
}

/** Quái hoang còn sống trên sân được nhắm (bóng, vật phẩm ném) kèm ô của nó; null nếu không có. */
export function enemyTarget(
  data: GameData,
  battle: BattleState,
  targetId: string
): { slot: number; target: Monster } | null {
  const slot = battle.enemySlots.indexOf(targetId)
  const target = battle.enemies.find((m) => m.id === targetId)
  if (slot < 0 || !target || isFainted(data, target)) return null
  return { slot, target }
}

/** Loài gốc người chơi đang sở hữu (đội, kho, trứng, quái vừa bắt trong trận) cho Repeat Ball. */
function ownedSpeciesIds(
  state: Pick<GameState, 'party' | 'storage' | 'eggs'> & { battle: BattleState }
): Set<string> {
  const owned = [
    ...state.party,
    ...state.storage,
    ...state.eggs.map((egg) => egg.monster),
    ...state.battle.captured
  ]
  return new Set(owned.map((monster) => monster.baseSpeciesId))
}

/**
 * Tỉ lệ bắt (%) khi quái `user` ném bóng `ball` vào quái hoang `target` của trận đang diễn ra:
 * điều kiện của bóng (lượt, giờ, loài đã có, level quái ném), kỹ năng đồng hành của đội, chúc phúc của thần
 * cai quản map và bắt trượt
 * (số lần nó đã thoát khỏi bóng trong trận). Dùng cho lệnh, UI, mô phỏng.
 */
export function battleCatchChance(
  data: GameData,
  state: Pick<
    GameState,
    | 'party'
    | 'storage'
    | 'eggs'
    | 'time'
    | 'cooking'
    | 'floorBiomeIds'
    | 'favor'
    | 'titles'
    | 'tamer'
    | 'sect'
    | 'research'
    | 'ascension'
    | 'destinies'
  > & {
    battle: BattleState
  },
  { ball, target, user }: { ball: BallItem; target: Monster; user: Monster }
): number {
  const ctx = {
    data,
    target,
    turn: state.battle.turn,
    hour: hourOf(state.time),
    ownedSpeciesIds: ownedSpeciesIds(state),
    userLevel: user.level
  }
  const chance = catchChance(data, target, ball, {
    playerMultiplier:
      partnerMultiplier(data, state.party, 'catchRatePercent') *
      mealMultiplier(data, state.cooking.meal, 'catchRatePercent') *
      battleBlessingMultiplier(data, state, 'catchRatePercent') *
      tamerBonusMultiplier(data, state, 'catchRatePercent') *
      researchMultiplier(data, state.research, target.speciesId, 'catchRatePercent'),
    bonusMultiplier: ballBonusMultiplier(ball, ctx),
    catchRateBonus: ballCatchRateBonus(ball, ctx)
  })
  return withCatchPity(data, chance, state.battle.records[target.id]?.catchMisses ?? 0)
}

/** Bóng: tung tỉ lệ bắt. Thành công thì quái hoang rời sân và vào battle.captured. */
export function throwBall(
  data: GameData,
  d: Draft,
  user: Monster,
  ball: BallItem,
  targetId: string
): void {
  const found = enemyTarget(data, d.battle, targetId)
  // Mục tiêu đã gục, đã bị bắt trước đó trong lượt, hoặc vừa Dynamax ở bước biến hình: không ném,
  // không mất bóng.
  if (!found || isDynamaxed(found.target)) {
    log(d, { type: 'noTarget', monsterId: user.id })
    return
  }
  const { target } = found
  // Hai bóng cùng lượt mà bóng trước đã lấp chỗ cuối: không ném, không mất bóng (capacity.md).
  if (!hasRosterRoom(data, d, { pending: d.battle.captured, newcomer: target })) {
    log(d, { type: 'rosterFull', monsterId: user.id })
    return
  }
  // Nuzlocke: bóng trước cùng lượt đã bắt con của lượt gặp thì không ném, không mất bóng.
  if (nuzlockeCaptureError(data, d, target)) {
    log(d, { type: 'nuzlockeBlocked', monsterId: user.id })
    return
  }
  consumeItem(d, ball.id)
  const chance = battleCatchChance(data, d, { ball, target, user })
  const roll = rollCapture(data, d.rng, {
    chance,
    criticalMultiplier: criticalCaptureMultiplier(data, d.dex)
  })
  d.rng = roll.rng
  const { critical, shakes } = roll
  log(d, {
    type: 'throwBall',
    monsterId: user.id,
    itemId: ball.id,
    targetId,
    chance,
    critical,
    shakes
  })
  if (!roll.caught) {
    recordOf(d, targetId).catchMisses++
    log(d, { type: 'breakFree', monsterId: targetId })
    return
  }
  // Đội không đổi trong trận, nên biết trước quái sẽ vào đội hay vào kho.
  const destination = hasPartyRoom(
    data,
    partyAfterJoining(data, d.party, d.battle.captured),
    target
  )
    ? 'party'
    : 'storage'
  d.battle.enemies = d.battle.enemies.filter((m) => m.id !== targetId)
  removeFromField(d, 'enemy', targetId)
  clearOnFieldState(data, d, targetId)
  // Bắt được boss: giữ bossMultiplier và nhận trait "Huyết thống boss". Thân mật khởi đầu theo
  // bóng (docs/rules/affinity.md).
  const affinity = ball.startAffinity ?? data.config.affinity.start.caught
  // Nghiên cứu loài (docs/rules/species-research.md): bắt khi đang có trạng thái bất thường (debuff),
  // xét trước khi Heal Ball chữa.
  if (target.statuses.some((status) => data.statuses[status.statusId]?.kind === 'debuff')) {
    d.research = recordMonsterResearch(data, d.research, [target], 'caughtWithStatus')
  }
  // Heal Ball: hồi đầy máu, hết trạng thái bất thường.
  const healed = ball.healOnCatch ? { ...target, damageTaken: BIG_ZERO, statuses: [] } : target
  const caughtMonster = {
    ...(d.battle.isBoss ? mergeTraitLevel(healed, data.config.boss.traitId, 1) : healed),
    affinity
  }
  // Bắt bằng bóng không khế ước: khế ước là bước riêng (docs/rules/tamer.md mục "Khế ước").
  d.battle.captured.push(
    startHistory(
      autoLockCaught(caughtMonster),
      { kind: d.battle.isBoss ? 'boss' : 'wild', ballItemId: ball.id },
      { day: dayOf(d.time), floor: d.battle.floor, level: target.level }
    )
  )
  spendNuzlockeEncounter(d)
  log(d, { type: 'caught', monsterId: targetId, destination })
  // Nhiệm vụ bắt quái (docs/rules/quests.md): hệ / race lúc bắt.
  d.quests = recordQuestEvent(data, d.quests, {
    type: 'caught',
    raceId: target.raceId,
    elementIds: target.elementIds
  })
}

/**
 * Vật phẩm ném (consumable nhắm `enemy`): chạy hiệu ứng như skill trúng quái hoang (trúng / trượt
 * theo chance của hiệu ứng). Ném trượt vẫn mất vật phẩm, như bóng.
 */
export function throwItem(
  data: GameData,
  d: Draft,
  user: Monster,
  item: ConsumableItem,
  targetId: string
): void {
  const found = enemyTarget(data, d.battle, targetId)
  if (!found) {
    log(d, { type: 'noTarget', monsterId: user.id })
    return
  }
  consumeItem(d, item.id)
  log(d, { type: 'throwItem', monsterId: user.id, itemId: item.id, targetId })
  const target = found.target
  // Thế thân chặn hiệu ứng gây lên quái hoang như chặn skill.
  const shielded = isShielded(d, user, target)
  runSkillEffects(
    data,
    d,
    { user, target, damageDealt: BIG_ZERO, skillId: null, shielded },
    item.effects
  )
}

/** Thuốc: áp lên quái của ta (cả dự bị). Không có tác dụng thì không mất vật phẩm. */
export function applyItemToAlly(
  data: GameData,
  d: Draft,
  user: Monster,
  item: Item,
  targetId: string
): void {
  const index = d.party.findIndex((m) => m.id === targetId)
  const before = d.party[index]
  const applied = applyItemToMonster(data, before, item, {
    rng: d.rng,
    day: dayOf(d.time),
    highestFloor: d.highestFloor,
    scene: evolutionScene(data, d)
  })
  if (!applied) {
    log(d, { type: 'itemNoEffect', monsterId: user.id, itemId: item.id, targetId })
    return
  }
  const after = applied.monster
  d.rng = applied.rng
  d.research = recordEvolutionResearch(data, d.research, applied.events)
  consumeItem(d, item.id)
  d.party[index] = after
  log(d, { type: 'useItem', monsterId: user.id, itemId: item.id, targetId })
  logRecovery(d, before, after)
  refreshPartnerBonus(data, d, after)
}

/** Log máu hồi và trạng thái được chữa của quái ta (thuốc, kỹ năng ngự thú sư nhắm quái ta). */
export function logRecovery(d: Draft, before: Monster, after: Monster): void {
  const healed = before.damageTaken.minus(after.damageTaken)
  if (healed.gt(0)) log(d, { type: 'heal', monsterId: after.id, amount: healed })
  for (const { statusId } of before.statuses) {
    if (!after.statuses.some((status) => status.statusId === statusId)) {
      log(d, { type: 'statusCured', monsterId: after.id, statusId })
    }
  }
}

export function validateItemCommand(
  data: GameData,
  state: GameState,
  battle: BattleState,
  itemId: string,
  targetId: string
): void {
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  assertUsableIn(item, 'battle')
  // Không bắt quái của ngự thú sư NPC (như Pokémon; docs/rules/trainers.md).
  if (item.category === 'ball' && battle.trainer) {
    throw new ActionError('trainerBattleRestricted', { command: 'ball' })
  }
  // Bí cảnh / tháp (docs/rules/trials.md): không bắt quái; luật noItems (cả thuộc tính bất ổn,
  // docs/rules/instability.md) cấm mọi vật phẩm.
  if (hasTrialRule(data, battleRules(battle), 'noItems')) {
    throw new ActionError('trialRestricted', { command: 'item' })
  }
  if (item.category === 'ball' && battle.trial) {
    throw new ActionError('trialRestricted', { command: 'ball' })
  }
  // Đợt thú triều không bắt quái, trừ thú vương (docs/rules/events.md).
  if (
    item.category === 'ball' &&
    battle.special &&
    !specialRule(battle.special).canCapture(battle.special)
  ) {
    throw new ActionError('specialBattleRestricted', { command: 'ball' })
  }
  if (itemTarget(item) === 'enemy') {
    const found = enemyTarget(data, battle, targetId)
    if (!found) throw new ActionError('cannotThrowItem', { itemId, targetId })
    // Không ném bóng được vào quái đang Dynamax (như Pokémon).
    if (item.category === 'ball' && isDynamaxed(found.target)) {
      throw new ActionError('cannotCatchDynamaxed', { monsterId: targetId })
    }
    // Đội đủ và kho đầy (kể cả quái đã bắt trong trận): báo lỗi ngay, không mất bóng (capacity.md).
    if (
      item.category === 'ball' &&
      !hasRosterRoom(data, state, { pending: battle.captured, newcomer: found.target })
    ) {
      throw new ActionError('rosterFull', { capacity: capacityOf(data, state, 'storage') })
    }
    // Nuzlocke: chỉ bắt được ở lượt gặp đầu tiên của khu (docs/rules/challenge-modes.md).
    const nuzlocke =
      item.category === 'ball'
        ? nuzlockeCaptureError(data, { ...state, battle }, found.target)
        : null
    if (nuzlocke) throw nuzlocke
    return
  }
  const target = state.party.find((m) => m.id === targetId)
  if (!target) throw new ActionError('monsterNotInParty', { monsterId: targetId })
  // Chỉ thử xem có tác dụng không: RNG thật được tung lúc tới lượt dùng (applyItemToAlly).
  const options = {
    rng: state.rng,
    day: dayOf(state.time),
    highestFloor: state.highestFloor,
    scene: evolutionScene(data, state)
  }
  if (!applyItemToMonster(data, target, item, options)) {
    throw new ActionError('itemNoEffect', { itemId, monsterId: targetId })
  }
}
