// Trận đấu 2v2 với quái hoang, boss, Thiên Kiếp, ngự thú sư NPC (trainerBattles.ts).
//
// Mỗi hàm public nhận (data, state, ...) và trả về state mới. Action sai ném ActionError
// trước khi đụng tới state. Bên trong, hàm làm việc trên một bản sao sâu (draft) của state
// rồi trả bản sao đó về, nên state cũ không bao giờ bị sửa.
//
// Vòng đời: (startWildBattle | challengeBoss) → (submitTurn | flee)* ↔ replaceFainted → ended → leaveBattle.
//
// Bắt quái: quái bắt được rời trận ngay và nằm trong battle.captured; khi trận kết thúc
// (bất kể thắng, thua hay chạy) mới vào đội, hoặc vào kho nếu đội đầy. Nhờ vậy nó không
// thể bị đưa ra sân thay quái ngay trong trận vừa bắt.

import { ActionError, malformedAction, rollPercent } from '../shared'
import {
  blessingMultiplier,
  charmEffect,
  battleRules,
  escapeBlockingRoom,
  eventModifierMultiplier,
  isLargeMonster,
  monsterBodyPlan,
  skillSwitchesUserOut
} from '../registries'
import {
  floorSite,
  generateEncounter,
  generateFloorBossEncounter,
  generateTribulationEncounter,
  type FloorSite
} from '../world'
import { getItemCount } from '../inventory'
import { activeTransform, holdTurnsLeft, isFainted, lockedSkillIds, masteryOf } from '../monster'
import {
  battleSkillIds,
  isMergedAway,
  mergePartnerOf,
  MOVE_STYLES,
  type BattleCommand,
  type BattleState,
  type GameData,
  type GameState,
  type Monster,
  type TamerCommand
} from '../model'
import {
  Draft,
  SLOT_COUNT,
  requireBattle,
  canEnterSlot,
  cloneDraft,
  commandSlotsOf,
  fillableSlot,
  replacementOptions,
  log,
  findMonster
} from './draft'
import { isTrapped, trappedPlayerMonster } from './trapping'
import { hasUsableSkill } from './executeSkill'
import { enterFieldTogether } from './environment'
import { validateItemCommand } from './battleItems'
import { resolveTurn, settleAfterTurn } from './turn'
import { styleBlockReason } from './moveStyles'
import { canAim } from './hitLocations'
import { playerFleeTrait } from './fleeTraits'
import { finish } from './outcome'
import { assertNotTribulation, payForTribulation } from './tribulation'
import { validateTransformCommands } from './transform'
import { validateZMoveCommands } from './zMoves'
import { partnerMultiplier } from '../tamer'
import { validateTamerCommand } from './tamerSkills'
import { validateComboCommands } from './combos'
import { openBattle } from './openBattle'
import { assertReadyForBattle, openTrainerBattle, rollFloorTrainer } from './trainerBattles'
import { chooseReplacements } from './trainerAi'
import { specialRule } from './specialBattles'
import { frenziedPlayerSlots } from './frenzy'
import { battleInstabilityFor, foreignEncounterSite } from './instability'

/** Trận quái hoang thường trên tầng: không bí cảnh, độ kiếp, trận đặc biệt, NPC. */
const NO_SPECIAL_BATTLE = { trial: null, tribulation: null, special: null, trainer: null }

// ---------- Action public ----------

/**
 * Đánh quái hoang ở tầng người chơi đang đứng: có thể gặp ngự thú sư NPC (docs/rules/trainers.md),
 * không thì quái hoang (có thể gặp boss ngẫu nhiên).
 */
export function startWildBattle(data: GameData, state: GameState): GameState {
  const site = requireBattleStart(data, state)
  const [trainerClass, afterTrainer] = rollFloorTrainer(data, state.rng, site)
  if (trainerClass) {
    return openTrainerBattle(
      data,
      { ...state, rng: afterTrainer },
      { site, trainerClass, mode: 'floor' }
    )
  }
  // Thuộc tính bất ổn foreignSpecies (docs/rules/instability.md): bảng gặp của map khác.
  const instability = battleInstabilityFor(state, NO_SPECIAL_BATTLE)
  const [encounterSite, rng] = foreignEncounterSite(data, afterTrainer, {
    site,
    rules: battleRules({ trial: null, instability })
  })
  const encounter = generateEncounter(data, rng, encounterSite, state.nextMonsterId)
  return openBattle(data, state, { site, encounter })
}

/**
 * Độ kiếp lên tầng thức tỉnh kế tiếp (ở thị trấn; docs/rules/awakening.md): trừ tiền và Thức tỉnh
 * đan rồi mở trận với Thiên Kiếp ở tầng cao nhất đã mở (gen của Thiên Kiếp theo tầng đó).
 */
export function startTribulation(data: GameData, state: GameState, monsterId: string): GameState {
  const paid = payForTribulation(data, state, monsterId)
  const site = floorSite(data, paid.state, paid.state.highestFloor)
  const encounter = generateTribulationEncounter(data, paid.state.rng, {
    site,
    monster: paid.monster,
    nextMonsterId: paid.state.nextMonsterId
  })
  return openBattle(data, paid.state, {
    site,
    encounter,
    tribulation: { monster: paid.monster, tier: paid.monster.awakening + 1 }
  })
}

/** Gọi boss tầng của tầng đang đứng: miễn phí, không giới hạn số lần (mục "Tầng và biome"). */
export function challengeBoss(data: GameData, state: GameState): GameState {
  const site = requireBattleStart(data, state)
  const encounter = generateFloorBossEncounter(data, state.rng, site, state.nextMonsterId)
  return openBattle(data, state, { site, encounter })
}

/**
 * Điều kiện bắt đầu trận: không trong trận, đang ở một tầng, còn quái đánh được. Trả về tầng kèm
 * map của nó và hệ số tỉ lệ gặp của người chơi.
 */
export function requireBattleStart(data: GameData, state: GameState): FloorSite {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'floor') throw new ActionError('notOnFloor')
  assertReadyForBattle(data, state)
  // Kỹ năng đồng hành (docs/rules/partner-skills.md), modifier của event (docs/rules/events.md),
  // bùa (docs/rules/dex.md) và chúc phúc của thần cai quản map (docs/rules/deities.md) nhân tỉ lệ
  // shiny / gặp boss.
  const { modifiers } = state.events
  const site = floorSite(data, state, state.location.floor)
  const odds = {
    shinyMultiplier:
      partnerMultiplier(data, state.party, 'shinyChancePercent') *
      eventModifierMultiplier(data, modifiers, 'shinyChancePercent') *
      charmEffect(data, state.inventory, 'shinyChanceMultiplier') *
      blessingMultiplier(data, state.favor, {
        deityId: site.biome.deityId ?? null,
        channel: 'shinyChancePercent'
      }),
    bossChanceMultiplier:
      partnerMultiplier(data, state.party, 'bossChancePercent') *
      eventModifierMultiplier(data, modifiers, 'bossChancePercent')
  }
  return { ...site, odds }
}

export function submitTurn(
  data: GameData,
  state: GameState,
  commands: BattleCommand[],
  tamerCommand?: TamerCommand
): GameState {
  const battle = requireBattle(state, 'chooseActions')
  if (!Array.isArray(commands)) throw malformedAction('commands phải là danh sách')

  // Quái cuồng bạo mất điều khiển (docs/rules/frenzy.md): không nhận lệnh, AI chọn thay.
  const frenzied = frenziedPlayerSlots(battle)
  // Quái lớn chiếm 2 ô nhưng chỉ một lệnh, ở ô đầu của nó (docs/rules/monster-size.md); thực thể hợp
  // thể ra lệnh ở cả hai ô (docs/rules/battle-merge.md).
  const mergedIds = state.party.filter((m) => mergePartnerOf(m)).map((m) => m.id)
  const activeSlots = commandSlotsOf(battle.playerSlots, mergedIds).flatMap((slot) => {
    const id = battle.playerSlots[slot]
    const monster = state.party.find((m) => m.id === id)
    return monster && !isFainted(data, monster) && !frenzied.includes(slot) ? [slot] : []
  })
  const commandSlots = commands.map((c) => c.slot)
  const frenziedCommand = commands.find((c) => frenzied.includes(c.slot))
  if (frenziedCommand) {
    throw new ActionError('monsterFrenzied', {
      monsterId: battle.playerSlots[frenziedCommand.slot] as string
    })
  }
  if (
    commandSlots.length !== activeSlots.length ||
    new Set(commandSlots).size !== commandSlots.length ||
    !activeSlots.every((slot) => commandSlots.includes(slot))
  ) {
    throw malformedAction(`cần đúng một lệnh cho mỗi ô ${activeSlots.join(', ')}`)
  }

  const switchTargets = new Set<string>()
  const itemUses: Record<string, number> = {}
  for (const command of commands) {
    const monster = state.party.find((m) => m.id === battle.playerSlots[command.slot]) as Monster
    if (command.kind === 'skill') {
      const tempSkillIds = battle.volatiles[monster.id]?.tempSkillIds ?? []
      if (
        !battleSkillIds(monster).includes(command.skillId) &&
        !tempSkillIds.includes(command.skillId)
      ) {
        throw new ActionError('skillNotKnown', { monsterId: monster.id, skillId: command.skillId })
      }
      if (lockedSkillIds(data, monster).includes(command.skillId)) {
        throw new ActionError('humanFormSkillLocked', {
          monsterId: monster.id,
          skillId: command.skillId
        })
      }
      const turnsLeft = holdTurnsLeft(battle, monster, data.skills[command.skillId])
      // Không còn skill nào dùng được: lệnh skill nào cũng thành Struggle (như Pokémon).
      const stuck =
        data.config.battle.struggleSkillId !== undefined &&
        !hasUsableSkill(data, { ...state, battle }, monster)
      if (turnsLeft > 0 && !stuck) {
        throw new ActionError('skillOnHold', {
          monsterId: monster.id,
          skillId: command.skillId,
          turnsLeft
        })
      }
      if (command.target !== undefined && !(command.target >= 0 && command.target < SLOT_COUNT)) {
        throw malformedAction(`ô mục tiêu không hợp lệ: ${command.target}`)
      }
      if (command.style !== undefined) validateStyle(data, monster, command)
      if (command.aim !== undefined) validateAim(data, battle, command)
      if (command.targetAlly !== undefined) {
        if (command.targetAlly !== true || !data.skills[command.skillId].onAlly) {
          throw malformedAction('targetAlly chỉ dùng cho skill có onAlly')
        }
      }
      if (command.switchTo !== undefined) {
        if (!skillSwitchesUserOut(data.skills[command.skillId])) {
          throw malformedAction('switchTo chỉ dùng cho skill có hiệu ứng rút về')
        }
        claimIncoming(data, state, command.switchTo, switchTargets)
        assertCanSwitchIn(data, state, { slot: command.slot, monsterId: command.switchTo })
      }
    } else if (command.kind === 'switch') {
      assertCanEscape(data, battle)
      assertNotTrapped(data, state, battle.playerSlots[command.slot])
      claimIncoming(data, state, command.monsterId, switchTargets)
    } else if (command.kind === 'defend' || command.kind === 'provoke') {
      // Phòng thủ / khiêu khích luôn dùng được.
    } else if (command.kind === 'combo') {
      // Hợp kích kỹ kiểm tra theo cặp lệnh ở validateComboCommands.
    } else if (command.kind === 'item') {
      assertNotTribulation(battle, 'item')
      validateItemCommand(data, state, battle, command.itemId, command.targetId)
      const { itemId } = command
      itemUses[itemId] = (itemUses[itemId] ?? 0) + 1
      const have = getItemCount(state.inventory, itemId)
      if (itemUses[itemId] > have) {
        throw new ActionError('notEnoughItem', { itemId, have, need: itemUses[itemId] })
      }
    } else {
      throw malformedAction('loại lệnh không hợp lệ')
    }
  }

  validateLargeSwitches(data, state, commands)
  validateComboCommands(data, { battle, party: state.party }, commands)
  const d = cloneDraft(state)
  // Bản nháp chưa đổi gì: lệnh biến hình / ngự thú sư sai thì ném lỗi, state gốc giữ nguyên.
  const transforms = validateTransformCommands(data, d, commands)
  validateZMoveCommands(data, d, commands)
  if (tamerCommand !== undefined) validateTamerCommand(data, d, tamerCommand)
  resolveTurn(data, d, commands, { transforms, tamerCommand })
  return d
}

/**
 * Bộ phận được nhắm (docs/rules/hit-locations.md): id bộ phận tồn tại, skill gây sát thương nhắm một
 * địch, quái đang ở ô mục tiêu có bộ phận đó (mục tiêu đổi giữa lượt thì lúc đánh tự bỏ nhắm).
 */
function validateAim(
  data: GameData,
  battle: BattleState,
  command: Extract<BattleCommand, { kind: 'skill' }>
): void {
  const { aim } = command
  if (typeof aim !== 'string' || !Object.hasOwn(data.bodyParts, aim)) {
    throw malformedAction(`bộ phận không hợp lệ: ${String(aim)}`)
  }
  if (!canAim(data.skills[command.skillId])) {
    throw malformedAction('aim chỉ dùng cho skill gây sát thương nhắm một địch')
  }
  const targetId = command.target === undefined ? null : battle.enemySlots[command.target]
  const target = battle.enemies.find((monster) => monster.id === targetId)
  if (target && !monsterBodyPlan(data, target).parts.includes(aim)) {
    throw new ActionError('bodyPartMissing', { monsterId: target.id, partId: aim })
  }
}

/**
 * Thế của lệnh skill (docs/rules/move-styles.md): đúng tên thế, skill có `styles`, quái không dùng
 * chiêu Max (đang / sắp Dynamax), đủ cấp thuần thục.
 */
function validateStyle(
  data: GameData,
  monster: Monster,
  command: Extract<BattleCommand, { kind: 'skill' }>
): void {
  const skill = data.skills[command.skillId]
  if (!(MOVE_STYLES as readonly unknown[]).includes(command.style)) {
    throw malformedAction(`thế không hợp lệ: ${String(command.style)}`)
  }
  const reason = styleBlockReason(data, monster, skill)
  if (reason === 'noStyles') throw malformedAction(`skill "${skill.id}" không có thế`)
  const dynamax = activeTransform(monster)?.kind === 'dynamax' || command.transform === 'dynamax'
  if (dynamax) throw malformedAction('quái Dynamax dùng chiêu Max, không có thế')
  if (reason === 'locked') {
    throw new ActionError('styleLocked', {
      monsterId: monster.id,
      skillId: skill.id,
      level: masteryOf(monster, skill.id).level,
      need: data.config.moveStyles.unlockMastery
    })
  }
}

/**
 * Quái được chọn vào sân trong lượt (lệnh đổi quái, quái thay của skill rút về): trong đội, chưa
 * ra sân, còn sống, chưa được chọn bởi lệnh khác (quái lớn được nhiều lệnh đổi cùng chọn: nó thay
 * cả các ô đó). Ghi vào `claimed`.
 */
function claimIncoming(
  data: GameData,
  state: GameState,
  monsterId: string,
  claimed: Set<string>
): void {
  assertNotTribulation(state.battle, 'switch')
  const incoming = state.party.find((m) => m.id === monsterId)
  if (!incoming) throw new ActionError('monsterNotInParty', { monsterId })
  // Quái phụ đang hợp thể nằm trong thực thể trên sân (docs/rules/battle-merge.md).
  if (state.battle?.playerSlots.includes(monsterId) || isMergedAway(incoming)) {
    throw new ActionError('monsterAlreadyActive', { monsterId })
  }
  if (isFainted(data, incoming)) throw new ActionError('monsterFainted', { monsterId })
  if (claimed.has(monsterId) && !isLargeMonster(data, incoming)) {
    throw new ActionError('monsterChosenTwice', { monsterId })
  }
  claimed.add(monsterId)
}

/**
 * Quái thay của skill rút về vào được ô của quái dùng skill (quái lớn: mọi ô khác trống / thuộc
 * chính quái rút về; docs/rules/monster-size.md).
 */
function assertCanSwitchIn(
  data: GameData,
  state: GameState,
  { slot, monsterId }: { slot: number; monsterId: string }
): void {
  // claimIncoming đã kiểm tra quái có trong đội; submitTurn chỉ chạy khi đang trong trận.
  const monster = state.party.find((m) => m.id === monsterId) as Monster
  const slots = (state.battle as BattleState).playerSlots
  if (!canEnterSlot(data, slots, { slot, monster })) {
    throw new ActionError('largeNeedsAllSlots', { monsterId })
  }
}

/**
 * Lệnh đổi sang quái lớn (docs/rules/monster-size.md): mọi ô khác của phe phải trống, thuộc chính
 * quái đang rút ở ô đó (quái lớn rút về) hoặc cũng có lệnh đổi sang đúng quái lớn này.
 */
function validateLargeSwitches(
  data: GameData,
  state: GameState,
  commands: readonly BattleCommand[]
): void {
  const battle = state.battle as BattleState
  for (const command of commands) {
    if (command.kind !== 'switch') continue
    const incoming = state.party.find((m) => m.id === command.monsterId) as Monster
    const vacating = commands.flatMap((other) =>
      other.kind === 'switch' && other.monsterId === command.monsterId
        ? [battle.playerSlots[other.slot] ?? '']
        : []
    )
    if (
      !canEnterSlot(data, battle.playerSlots, { slot: command.slot, monster: incoming, vacating })
    ) {
      throw new ActionError('largeNeedsAllSlots', { monsterId: incoming.id })
    }
  }
}

/** Quái ở ô đang bị giữ chân (Bind, Mean Look) thì không đổi ra được. */
function assertNotTrapped(
  data: GameData,
  state: GameState,
  monsterId: string | null | undefined
): void {
  if (!monsterId) return
  const d = cloneDraft(state)
  if (isTrapped(data, d, findMonster(d, monsterId))) {
    throw new ActionError('monsterTrapped', { monsterId })
  }
}

/** Lệnh đổi quái / chạy trốn bị room chặn (kiểu Fairy Lock); thay quái gục thì không bị chặn. */
function assertCanEscape(data: GameData, battle: BattleState): void {
  const fieldId = escapeBlockingRoom(data, battle.field)
  if (fieldId !== null) throw new ActionError('escapeBlocked', { fieldId })
}

/**
 * Chạy trốn: thành công thì kết thúc trận, thất bại thì mất lượt (địch vẫn đánh). Quái ta trên sân
 * có trait kiểu Run Away thì tỉ lệ là số lớn hơn giữa tỉ lệ chung và của trait, và vượt được room
 * chặn chạy trốn (như Pokémon; mục "Trait chạy trốn").
 */
export function flee(data: GameData, state: GameState): GameState {
  const battle = requireBattle(state, 'chooseActions')
  assertNotTribulation(battle, 'flee')
  if (battle.trainer) throw new ActionError('trainerBattleRestricted', { command: 'flee' })
  // Bí cảnh / tháp không chạy trốn: bỏ bí cảnh giữa hai trận (docs/rules/trials.md).
  if (battle.trial) throw new ActionError('trialRestricted', { command: 'flee' })
  // Trận event không chạy được / thú triều (docs/rules/events.md), phục kích lượt đầu (gathering.md).
  if (battle.special && !specialRule(battle.special).canFlee(battle.special, battle)) {
    throw new ActionError('specialBattleRestricted', { command: 'flee' })
  }
  const d = cloneDraft(state)
  // Rút lui (boss thế giới, docs/rules/world-boss.md): luôn được, kết thúc trận sớm.
  if (battle.special && specialRule(battle.special).fleeIsRetreat) {
    log(d, { type: 'fled' })
    finish(data, d, 'fled')
    return d
  }
  const trait = playerFleeTrait(data, d)
  if (trait === null) assertCanEscape(data, battle)
  // Quái bị giữ chân (Bind, Mean Look) không chạy được; trait kiểu Run Away thì vượt được như Pokémon.
  const trapped = trait === null ? trappedPlayerMonster(data, d) : null
  if (trapped) throw new ActionError('monsterTrapped', { monsterId: trapped.id })
  // Kỹ năng đồng hành nhân tỉ lệ chung (docs/rules/partner-skills.md).
  const baseChance =
    data.config.battle.fleeChance * partnerMultiplier(data, d.party, 'fleeChancePercent')
  const usesTrait =
    trait !== null && (trait.chance > baseChance || escapeBlockingRoom(data, battle.field) !== null)
  if (usesTrait)
    log(d, { type: 'traitTriggered', monsterId: trait.monsterId, traitId: trait.traitId })
  let escaped: boolean
  ;[escaped, d.rng] = rollPercent(d.rng, Math.max(baseChance, trait?.chance ?? 0))
  if (escaped) {
    log(d, { type: 'fled' })
    finish(data, d, 'fled')
  } else {
    log(d, { type: 'fleeFailed' })
    resolveTurn(data, d, [])
  }
  return d
}

/**
 * Chọn quái thay cho các ô trống (ô gục, ô quái lớn rút về để lại). Phải thay hết mức có thể: sau
 * khi thay không còn ô trống nào mà quái dự bị còn lại vào được (quái lớn cần mọi ô trống, lấy hết
 * ô; docs/rules/monster-size.md); ô không thay được để trống.
 */
export function replaceFainted(
  data: GameData,
  state: GameState,
  replacements: { slot: number; monsterId: string }[]
): GameState {
  const battle = requireBattle(state, 'chooseReplacement')
  const { openSlots, reserves, vacantSlots } = replacementOptions(data, state, battle)
  if (!Array.isArray(replacements)) throw malformedAction('replacements phải là danh sách')

  const slots = [...vacantSlots]
  for (const { slot, monsterId } of replacements) {
    if (!openSlots.includes(slot) || slots[slot] !== null) {
      throw new ActionError('slotNotReplaceable', { slot })
    }
    const monster = reserves.find((m) => m.id === monsterId)
    if (!monster || slots.includes(monsterId)) {
      throw new ActionError('monsterCannotEnter', { monsterId })
    }
    if (!canEnterSlot(data, slots, { slot, monster })) {
      throw new ActionError('largeNeedsAllSlots', { monsterId })
    }
    if (isLargeMonster(data, monster)) slots.fill(monsterId)
    else slots[slot] = monsterId
  }
  const left = fillableSlot(
    data,
    slots,
    reserves.filter((m) => !slots.includes(m.id))
  )
  if (left !== null) throw new ActionError('replacementIncomplete', { slot: left })

  const d = cloneDraft(state)
  enterFieldTogether(
    data,
    d,
    'player',
    replacements.map(({ slot, monsterId }) => ({ slot, monster: findMonster(d, monsterId) }))
  )
  // Quái thay có thể gục ngay vì bẫy: phân thua / chọn thay tiếp / để trống ô như cuối lượt.
  settleAfterTurn(data, d)
  return d
}

/**
 * Gợi ý lệnh thay quái (tự đánh, script mô phỏng): AI chọn quái thay chung (chooseReplacements,
 * docs/rules/trainers.md) cho từng ô gục theo thứ tự ô. Không đổi state; kết quả hợp lệ cho
 * replaceFainted.
 */
export function suggestReplacements(
  data: GameData,
  state: GameState
): { slot: number; monsterId: string }[] {
  const battle = requireBattle(state, 'chooseReplacement')
  const { openSlots, vacantSlots } = replacementOptions(data, state, battle)
  // Ô gục được dọn trước khi chấm (quái gục không còn là đồng đội trên sân).
  const d: Draft = { ...state, battle: { ...battle, playerSlots: vacantSlots } }
  return chooseReplacements(data, d, 'player', openSlots).map(({ slot, monster }) => ({
    slot,
    monsterId: monster.id
  }))
}

/** Rời trận đã kết thúc. Quái hoang bị bỏ đi; HP, EXP, tiền, vật phẩm đã được áp vào state. */
export function leaveBattle(state: GameState): GameState {
  requireBattle(state, 'ended')
  return { ...state, battle: null }
}
