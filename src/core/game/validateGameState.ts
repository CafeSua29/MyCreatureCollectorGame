// Kiểm tra toàn bộ một GameState (đã migrate) trước khi dùng (load save, nhập save).
// Mọi số phải hữu hạn (bắt Infinity, NaN, null, chuỗi thay cho số; JSON.stringify(Infinity) ra
// null nên save đã tràn số sẽ đọc lên thành null); số nguyên phải là số nguyên an toàn (≤ 2^53 − 1).
// Thông báo lỗi luôn ghi đường dẫn trường, ví dụ "party[0].genes.attack" (mục Lưu / đọc save).

import { isLargeMonster, isTypelessSpecies, partySlotsUsed } from '../registries'
import {
  validateAlchemyState,
  validateCookingState,
  validateSmithingState
} from './validateAlchemyState'
import { validateQuestState } from './validateQuestState'
import { validateSectState } from './validateSectState'
import { validateTeamPresetState, validateTradeState } from './validateTradeState'
import { validateAuctionState } from './validateAuctionState'
import { validateDwellingState } from './validateDwellingState'
import { validateExpeditionState } from './validateExpeditionState'
import { checkBattleTrainer, validateTrainerState } from './validateTrainerState'
import { checkBattleTrial, validateTrialState } from './validateTrialState'
import { checkBattleInstability, validateInstabilityState } from './validateInstabilityState'
import { validateDeityState } from './validateDeityState'
import { checkBattleSpecial, validateEventState } from './validateEventState'
import { isFainted, validateMonster, validateSouls } from '../monster'
import { validateInventory } from '../inventory'
import { validateMarket, validateShop } from '../shop'
import { findBiome, isValidFloor } from '../world'
import {
  GLOBAL_FIELD_LAYERS,
  ONCE_PER_BATTLE_EFFECTS,
  STAGE_STATS,
  TRANSFORM_KINDS,
  type GameData,
  type GameState,
  type Monster
} from '../model'
import { asObject, checkBig, checkInteger, type Decimal } from '../shared'
import { SAVE_VERSION } from './reducer'
import {
  checkCounters,
  checkDelayedAttacks,
  checkItemLedger,
  checkRecords,
  checkVolatileExtras
} from './validateBattleExtras'
import { isGameOverSave, validateChallengeState } from './validateChallengeState'
import { validateAscensionState } from './validateAscensionState'
import { validateTimeState } from './validateTimeState'
import { checkBattleTamers, validateBondState, validateTamer } from './validateTamerState'
import { validateRecruitState } from './validateRecruitState'
import { validateSafariState } from './validateSafariState'
import { validateLabState } from './validateLabState'
import { validateCapacityState } from './validateCapacityState'
import { validateZoneState } from './validateZoneState'
import { validateEssenceState, validateHatcheryState } from './validatePhereonState'
import { validateGameLog } from './validateGameLog'
import { validateWorldBossState } from './validateWorldBossState'
import { validateSpiritState } from './validateSpiritState'
import { validateDexState } from './validateDexState'
import { validateResearchState } from './validateResearchState'
import { validateAchievementState } from './validateAchievementState'
import { validateEquipmentState } from './validateEquipmentState'
import { checkTeamBonuses, validateFormationState } from './validateTeamState'

const RNG_STATES = 2 ** 32
const BATTLE_PHASES: readonly string[] = ['chooseActions', 'chooseReplacement', 'ended']

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Quái của người chơi (đội, kho, trứng, quái vừa bắt) bắt buộc có lý lịch; quái hoang trong trận
 * thì không (monster-history.md). Quái của ngự thú sư NPC (`npc`): như quái hoang nhưng đã khế ước
 * với NPC (docs/rules/trainers.md).
 */
type Ownership = 'owned' | 'wild' | 'npc'

/** Kiểm tra một quái ở vị trí `path`; quái thiếu hẳn trường cũng không làm crash. */
function checkMonster(
  data: GameData,
  monster: unknown,
  { path, ownership }: { path: string; ownership: Ownership },
  issues: string[]
): void {
  const object = asObject(monster)
  if (!object) {
    issues.push(`${path}: không phải quái hợp lệ`)
    return
  }
  if (ownership === 'owned' && object.history === null) {
    issues.push(`${path}.history: quái của người chơi phải có lý lịch`)
  }
  const notOwned = ownership === 'wild' ? 'quái hoang chưa bắt' : 'quái của NPC'
  if (ownership !== 'owned' && object.history !== null) {
    issues.push(`${path}.history: ${notOwned} phải là null`)
  }
  // Quái của NPC luôn đã khế ước với NPC; quái của người chơi có thể chưa (khế ước là bước riêng);
  // quái hoang chưa (docs/rules/tamer.md mục "Khế ước").
  if (ownership === 'npc' && object.contractRealm === null) {
    issues.push(`${path}.contractRealm: quái của NPC phải có cảnh giới khế ước`)
  }
  if (ownership === 'wild' && object.contractRealm !== null) {
    issues.push(`${path}.contractRealm: quái hoang chưa bắt phải là null`)
  }
  // HP vô hạn chỉ có trên boss thế giới đang trong trận (docs/rules/world-boss.md).
  if (object.endlessHp !== undefined && (ownership !== 'wild' || object.endlessHp !== true)) {
    issues.push(`${path}.endlessHp: chỉ quái hoang trong trận mới có, và phải là true`)
  }
  // Dưỡng dục chỉ bắt đầu khi quái nở (docs/rules/imprinting.md).
  if (ownership !== 'owned' && object.imprint !== null) {
    issues.push(`${path}.imprint: ${notOwned} phải là null`)
  }
  try {
    // Ép kiểu vì dữ liệu đến từ file: validateMonster tự kiểm tra từng trường.
    const typed = monster as unknown as Monster
    const monsterIssues = validateMonster(data, typed, path)
    issues.push(...monsterIssues)
    // Gục thì mất mọi trạng thái (mục "Trạng thái bất thường"); cần quái hợp lệ để tính max HP.
    if (monsterIssues.length === 0 && isFainted(data, typed) && typed.statuses.length > 0) {
      issues.push(`${path}.statuses: quái đã gục không được có trạng thái`)
    }
  } catch (error) {
    issues.push(`${path}: dữ liệu quái hỏng (${errorMessage(error)})`)
  }
}

/** Kiểm tra danh sách quái tại `path`; trả về id của các quái để kiểm tra trùng. */
/**
 * Quái không hệ chỉ hợp lệ khi loài của nó không hệ (data.md mục "Loài không hệ") hoặc đang đổi hệ
 * trong trận (có originalIdentity để trả lại hệ lúc rời sân / hết trận; Burn Up, Double Shock,
 * docs/rules/pokemon-moves.md).
 */
function checkTypelessMonsters(
  data: GameData,
  state: Record<string, unknown>,
  issues: string[]
): void {
  const battle = asObject(state.battle)
  const volatiles = asObject(battle?.volatiles)
  const lists = [state.party, state.storage, battle?.enemies]
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const monster = asObject(entry)
      if (!Array.isArray(monster?.elementIds) || monster.elementIds.length > 0) continue
      if (asObject(volatiles?.[String(monster.id)])?.originalIdentity) continue
      if ([monster.speciesId, monster.baseSpeciesId].some((id) => isTypelessSpecies(data, id))) {
        continue
      }
      issues.push(`quái "${String(monster.id)}".elementIds: chỉ trong trận mới được không hệ`)
    }
  }
}

function checkMonsterList(
  data: GameData,
  list: unknown,
  { path, ownership }: { path: string; ownership: Ownership },
  issues: string[]
): string[] {
  if (!Array.isArray(list)) {
    issues.push(`${path} phải là danh sách`)
    return []
  }
  list.forEach((monster, i) =>
    checkMonster(data, monster, { path: `${path}[${i}]`, ownership }, issues)
  )
  return list.map((monster) => String(asObject(monster)?.id))
}

/** Tầng phải là số nguyên ≥ 1 và đã mở (≤ highestFloor). */
function checkFloor(floor: unknown, highestFloor: unknown, path: string, issues: string[]): void {
  if (!isValidFloor(floor)) {
    issues.push(`${path} phải là số nguyên ≥ 1, nhận ${String(floor)}`)
  } else if (typeof highestFloor === 'number' && floor > highestFloor) {
    issues.push(`${path}: tầng ${floor} chưa mở (highestFloor ${highestFloor})`)
  }
}

/**
 * Map của các tầng đã mở: danh sách id biome tồn tại, đúng một map mỗi tầng 1..highestFloor. Không
 * kiểm tra thêm luật tung map vì dữ liệu game có thể đổi giữa các phiên bản.
 */
function checkFloorBiomes(data: GameData, state: Record<string, unknown>, issues: string[]): void {
  const { floorBiomeIds, highestFloor } = state
  if (!Array.isArray(floorBiomeIds)) {
    issues.push('floorBiomeIds phải là danh sách')
    return
  }
  if (typeof highestFloor === 'number' && floorBiomeIds.length !== highestFloor) {
    issues.push(
      `floorBiomeIds phải có đúng ${highestFloor} map (mỗi tầng đã mở một map), nhận ${floorBiomeIds.length}`
    )
  }
  floorBiomeIds.forEach((biomeId, i) => {
    if (typeof biomeId !== 'string' || !findBiome(data, biomeId)) {
      issues.push(`floorBiomeIds[${i}]: biome không tồn tại "${String(biomeId)}"`)
    }
  })
}

function checkTopLevel(state: Record<string, unknown>, issues: string[]): void {
  if (state.version !== SAVE_VERSION) issues.push(`version phải là ${SAVE_VERSION}`)
  issues.push(...checkInteger(state.highestFloor, 'highestFloor', 1))
  const location = asObject(state.location)
  if (location?.type === 'floor') {
    checkFloor(location.floor, state.highestFloor, 'location.floor', issues)
  } else if (location?.type !== 'town') {
    issues.push('location không hợp lệ')
  }
  issues.push(...checkInteger(state.rng, 'rng', 0))
  if (typeof state.rng === 'number' && state.rng >= RNG_STATES) {
    issues.push('rng phải là số nguyên 32-bit không dấu')
  }
  issues.push(...checkBig(state.money, 'money', 0))
  issues.push(...checkInteger(state.nextMonsterId, 'nextMonsterId', 1))
  if (typeof state.teraOrbCharged !== 'boolean') issues.push('teraOrbCharged phải là boolean')
}

/** Trả về id các quái trong trứng. */
/** Linh thạch đã đặt vào trứng: hệ có linh thạch, không quá maxInfusions. */
function checkInfusions(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách`)
    return
  }
  const max = data.config.egg.incubation.maxInfusions
  if (value.length > max) issues.push(`${path}: tối đa ${max} linh thạch`)
  value.forEach((elementId: unknown, i) => {
    if (typeof elementId !== 'string' || !(elementId in data.config.alchemy.elementStoneItemIds)) {
      issues.push(`${path}[${i}]: hệ không có linh thạch "${String(elementId)}"`)
    }
  })
}

/** Một trứng ở `path` (trong eggs, lô Đấu giá hành); trả về id trứng ('' nếu hỏng). */
function checkEgg(data: GameData, value: unknown, path: string, issues: string[]): string {
  const egg = asObject(value)
  if (!egg) {
    issues.push(`${path}: không hợp lệ`)
    return ''
  }
  checkMonster(data, egg.monster, { path: `${path}.monster`, ownership: 'owned' }, issues)
  if (asObject(egg.monster)?.imprint != null) {
    issues.push(`${path}.monster.imprint: quái chưa nở phải là null`)
  }
  if (egg.id !== asObject(egg.monster)?.id) issues.push(`${path}.id phải bằng id quái bên trong`)
  // 0 = đã tới lúc nở nhưng đội / kho hết chỗ (docs/rules/capacity.md).
  issues.push(...checkInteger(egg.battlesLeft, `${path}.battlesLeft`, 0))
  checkInfusions(data, egg.infusions, `${path}.infusions`, issues)
  return String(egg.id)
}

function checkEggs(data: GameData, eggs: unknown, issues: string[]): string[] {
  if (!Array.isArray(eggs)) {
    issues.push('eggs phải là danh sách')
    return []
  }
  return eggs.map((value, i) => checkEgg(data, value, `eggs[${i}]`, issues))
}

function checkStages(stages: unknown, issues: string[]): void {
  const byMonster = asObject(stages)
  if (!byMonster) {
    issues.push('battle.stages không hợp lệ')
    return
  }
  for (const [monsterId, value] of Object.entries(byMonster)) {
    const monsterStages = asObject(value) ?? {}
    for (const [stat, step] of Object.entries(monsterStages)) {
      if (!(STAGE_STATS as readonly string[]).includes(stat)) {
        issues.push(`battle.stages.${monsterId}.${stat}: không phải chỉ số có bậc trận`)
      }
      issues.push(...checkInteger(step, `battle.stages.${monsterId}.${stat}`))
    }
  }
}

/** Trait đã hút skill và đang tăng sát thương (kiểu Flash Fire). */
function checkAbsorbBoosts(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path} phải là danh sách không rỗng`)
    return
  }
  value.forEach((traitId, i) => {
    if (typeof traitId !== 'string' || !(traitId in data.traits)) {
      issues.push(`${path}[${i}]: trait không tồn tại "${String(traitId)}"`)
    } else if (value.indexOf(traitId) !== i) {
      issues.push(`${path}[${i}]: trait bị lặp "${traitId}"`)
    }
  })
}

/**
 * Trạng thái tạm (mục "Skill" ở battle.md): chỉ của quái đang trên sân; firstTurn nguyên ≥ 1,
 * perishTurns nguyên ≥ 1 (nếu có), substituteHp số lớn > 0 (nếu có), knockouts nguyên ≥ 1 (nếu có),
 * absorbBoosts danh sách id trait tồn tại, không rỗng, không lặp (nếu có).
 */
function checkVolatiles(
  data: GameData,
  value: unknown,
  onField: readonly unknown[],
  issues: string[]
): void {
  const byMonster = asObject(value)
  if (!byMonster) {
    issues.push('battle.volatiles không hợp lệ')
    return
  }
  for (const [monsterId, entry] of Object.entries(byMonster)) {
    const path = `battle.volatiles.${monsterId}`
    if (!onField.includes(monsterId)) issues.push(`${path}: quái không ở trên sân`)
    const volatile = asObject(entry) ?? {}
    issues.push(...checkInteger(volatile.firstTurn, `${path}.firstTurn`, 1))
    if (volatile.perishTurns !== undefined) {
      issues.push(...checkInteger(volatile.perishTurns, `${path}.perishTurns`, 1))
    }
    if (volatile.knockouts !== undefined) {
      issues.push(...checkInteger(volatile.knockouts, `${path}.knockouts`, 1))
    }
    if (volatile.resonance !== undefined) {
      issues.push(...checkInteger(volatile.resonance, `${path}.resonance`, 1))
    }
    if (volatile.absorbBoosts !== undefined) {
      checkAbsorbBoosts(data, volatile.absorbBoosts, `${path}.absorbBoosts`, issues)
    }
    checkVolatileExtras(data, volatile, path, issues)
    if (volatile.substituteHp !== undefined) {
      const problems = checkBig(volatile.substituteHp, `${path}.substituteHp`)
      issues.push(...problems)
      if (problems.length === 0 && (volatile.substituteHp as Decimal).lte(0)) {
        issues.push(`${path}.substituteHp phải lớn hơn 0`)
      }
    }
  }
}

/**
 * Hiệu ứng trait một lần mỗi trận đã dùng (mục "Trait sống sót"): theo id quái trong trận, danh
 * sách hiệu ứng hợp lệ, không lặp.
 */
function checkUsedOnce(value: unknown, known: readonly string[], issues: string[]): void {
  const byMonster = asObject(value)
  if (!byMonster) {
    issues.push('battle.usedOnce không hợp lệ')
    return
  }
  for (const [monsterId, effects] of Object.entries(byMonster)) {
    const path = `battle.usedOnce.${monsterId}`
    if (!known.includes(monsterId)) issues.push(`${path}: quái không có trong trận`)
    if (
      !Array.isArray(effects) ||
      !effects.every((effect) =>
        (ONCE_PER_BATTLE_EFFECTS as readonly unknown[]).includes(effect)
      ) ||
      new Set(effects).size !== effects.length
    ) {
      issues.push(`${path} phải là danh sách không lặp: ${ONCE_PER_BATTLE_EFFECTS.join(', ')}`)
    }
  }
}

/**
 * Môi trường của trận (mục "Môi trường"): mỗi lớp toàn sân một môi trường tồn tại, đúng lớp;
 * turnsLeft nguyên ≥ 1 hoặc null (cả trận); hiệu ứng theo phe của mỗi phe (checkSideFields);
 * room (checkRooms).
 */
function checkBattleField(data: GameData, value: unknown, issues: string[]): void {
  const field = asObject(value)
  if (!field) {
    issues.push('battle.field không hợp lệ')
    return
  }
  for (const layer of GLOBAL_FIELD_LAYERS) {
    const path = `battle.field.${layer}`
    const active = asObject(field[layer])
    const fieldId = active?.id
    if (typeof fieldId !== 'string' || !Object.hasOwn(data.fieldEffects, fieldId)) {
      issues.push(`${path}: môi trường không tồn tại "${String(fieldId)}"`)
    } else if (data.fieldEffects[fieldId].layer !== layer) {
      issues.push(`${path}: "${fieldId}" không thuộc lớp ${layer}`)
    }
    if (active?.turnsLeft !== null) {
      issues.push(...checkInteger(active?.turnsLeft, `${path}.turnsLeft`, 1))
    }
  }
  checkSideFields(data, field.sides, issues)
  checkRooms(data, field.rooms, issues)
}

/** Room: danh sách; id tồn tại, thuộc lớp room, không lặp; turnsLeft nguyên ≥ 1 (luôn có hạn). */
function checkRooms(data: GameData, value: unknown, issues: string[]): void {
  const path = 'battle.field.rooms'
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách`)
    return
  }
  const seen = new Set<string>()
  value.forEach((entry, i) => {
    const active = asObject(entry)
    const fieldId = active?.id
    const at = `${path}[${i}]`
    if (typeof fieldId !== 'string' || !Object.hasOwn(data.fieldEffects, fieldId)) {
      issues.push(`${at}: môi trường không tồn tại "${String(fieldId)}"`)
    } else if (data.fieldEffects[fieldId].layer !== 'room') {
      issues.push(`${at}: "${fieldId}" không thuộc lớp room`)
    } else {
      if (seen.has(fieldId)) issues.push(`${path}: "${fieldId}" bị lặp`)
      seen.add(fieldId)
    }
    issues.push(...checkInteger(active?.turnsLeft, `${at}.turnsLeft`, 1))
  })
}

/**
 * Hiệu ứng theo phe: mỗi phe một danh sách; id tồn tại, thuộc lớp side, không lặp trong phe;
 * turnsLeft nguyên ≥ 1 hoặc null; layers nguyên từ 1 tới maxLayers (bỏ trống = 1).
 */
function checkSideFields(data: GameData, value: unknown, issues: string[]): void {
  const sides = asObject(value)
  if (!sides) {
    issues.push('battle.field.sides không hợp lệ')
    return
  }
  for (const side of ['player', 'enemy'] as const) {
    const path = `battle.field.sides.${side}`
    const list: unknown = sides[side]
    if (!Array.isArray(list)) {
      issues.push(`${path} phải là danh sách`)
      continue
    }
    const seen = new Set<string>()
    list.forEach((entry, i) => {
      const active = asObject(entry)
      const fieldId = active?.id
      const at = `${path}[${i}]`
      let maxLayers = 1
      if (typeof fieldId !== 'string' || !Object.hasOwn(data.fieldEffects, fieldId)) {
        issues.push(`${at}: môi trường không tồn tại "${String(fieldId)}"`)
      } else if (data.fieldEffects[fieldId].layer !== 'side') {
        issues.push(`${at}: "${fieldId}" không thuộc lớp side`)
      } else {
        if (seen.has(fieldId)) issues.push(`${path}: "${fieldId}" bị lặp`)
        seen.add(fieldId)
        maxLayers = data.fieldEffects[fieldId].maxLayers ?? 1
      }
      if (active?.turnsLeft !== null) {
        issues.push(...checkInteger(active?.turnsLeft, `${at}.turnsLeft`, 1))
      }
      const layers = active?.layers
      if (
        !Number.isSafeInteger(layers) ||
        (layers as number) < 1 ||
        (layers as number) > maxLayers
      ) {
        issues.push(`${at}.layers phải là số nguyên từ 1 tới ${maxLayers}, nhận ${String(layers)}`)
      }
    })
  }
}

/** Trận đang diễn ra (nếu có). Trả về id quái hoang và quái đã bắt. */
function checkBattle(
  data: GameData,
  state: Record<string, unknown>,
  partyIds: string[],
  issues: string[]
): string[] {
  if (state.battle === null) return []
  const battle = asObject(state.battle)
  if (!battle) {
    issues.push('battle: trận đấu đang diễn ra không hợp lệ')
    return []
  }
  // Trận bí cảnh / tháp / hiểm địa đánh ở tầng sức mạnh riêng, có thể cao hơn tầng đã mở (trials.md,
  // zones.md).
  // Boss thế giới giữ tầng lúc xuất hiện, có thể cao hơn tầng đang mở sau khi phi thăng.
  const specialKind = asObject(battle.special)?.kind
  const ownFloor = battle.trial || specialKind === 'zone' || specialKind === 'worldBoss'
  checkFloor(battle.floor, ownFloor ? undefined : state.highestFloor, 'battle.floor', issues)
  if (!BATTLE_PHASES.includes(String(battle.phase))) issues.push('battle.phase không hợp lệ')
  issues.push(...checkInteger(battle.turn, 'battle.turn', 1))
  checkStages(battle.stages, issues)
  checkBattleField(data, battle.field, issues)
  const onField = [battle.playerSlots, battle.enemySlots].flatMap((s) =>
    Array.isArray(s) ? s : []
  )
  checkVolatiles(data, battle.volatiles, onField, issues)
  checkDelayedAttacks(data, battle.delayedAttacks, issues)
  const enemyIds = checkMonsterList(
    data,
    battle.enemies,
    { path: 'battle.enemies', ownership: battle.trainer ? 'npc' : 'wild' },
    issues
  )
  const capturedIds = checkMonsterList(
    data,
    battle.captured ?? [],
    { path: 'battle.captured', ownership: 'owned' },
    issues
  )
  const known = [...partyIds, ...enemyIds]
  checkUsedOnce(battle.usedOnce, known, issues)
  checkRecords(data, battle.records, known, issues)
  checkItemLedger(battle.itemLedger, known, issues)
  checkCounters(data, battle.counters, issues)
  checkTransformsUsed(battle.transformsUsed, issues)
  checkZMoveUsed(battle.zMoveUsed, issues)
  checkPlannedTransform(data, battle.plannedTransform, enemyIds, issues)
  checkBattleTamers(data, battle.tamers, issues)
  checkTeamBonuses(
    data,
    battle.teamBonuses,
    { hasTrainer: asObject(battle.trainer) !== null },
    issues
  )
  checkTribulation(state, battle, issues)
  checkBattleTrainer(data, battle, state, issues)
  checkBattleTrial(data, battle, state, issues)
  checkBattleInstability(data, battle, issues)
  checkBattleSpecial(data, battle, state, issues)
  const slots = [battle.playerSlots, battle.enemySlots].flatMap((s) => (Array.isArray(s) ? s : []))
  for (const id of slots) {
    if (id !== null && !known.includes(String(id))) {
      issues.push(`battle: ô trên sân trỏ tới quái không tồn tại "${String(id)}"`)
    }
  }
  checkLargeSlots(data, state, battle, issues)
  return [...enemyIds, ...capturedIds]
}

/**
 * Một quái ở nhiều ô sân của phe chỉ khi là quái lớn hoặc thực thể hợp thể và chiếm mọi ô; hai loại
 * này luôn chiếm mọi ô (docs/rules/monster-size.md, battle-merge.md). Quái phụ đang hợp thể không ở
 * trên sân.
 */
function checkLargeSlots(
  data: GameData,
  state: Record<string, unknown>,
  battle: Record<string, unknown>,
  issues: string[]
): void {
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
  const monsters = [...list(state.party), ...list(battle.enemies)].flatMap((value) => {
    const m = asObject(value)
    return m && typeof m.speciesId === 'string' && typeof m.baseSpeciesId === 'string'
      ? [
          {
            id: m.id,
            speciesId: m.speciesId,
            baseSpeciesId: m.baseSpeciesId,
            transform: asObject(m.battleTransform)
          }
        ]
      : []
  })
  for (const slots of [list(battle.playerSlots), list(battle.enemySlots)]) {
    for (const id of new Set(slots)) {
      const monster = monsters.find((m) => m.id === id)
      if (id === null || !monster) continue
      const fillsAll = slots.every((other) => other === id)
      const transform = monster.transform
      const active = transform !== null && transform.ended !== true
      if (active && transform.mergedIntoId !== undefined) {
        issues.push(`battle: quái "${String(id)}" đang hợp vào quái khác, không được ở trên sân`)
        continue
      }
      const merged = active && transform.mergePartner !== undefined
      if ((isLargeMonster(data, monster) || merged) !== fillsAll) {
        issues.push(
          `battle: quái "${String(id)}" ${fillsAll ? 'thường không chiếm' : 'lớn / hợp thể phải chiếm'} mọi ô sân`
        )
      }
    }
  }
}

/**
 * Trận độ kiếp (docs/rules/awakening.md): null, hoặc quái trong đội đang lên đúng tầng kế tiếp; trận
 * độ kiếp không có ngự thú sư, không phối hợp đội, không phải trận boss.
 */
function checkTribulation(
  state: Record<string, unknown>,
  battle: Record<string, unknown>,
  issues: string[]
): void {
  if (battle.tribulation === null) return
  const tribulation = asObject(battle.tribulation)
  if (!tribulation) {
    issues.push('battle.tribulation phải là null hoặc { monsterId, tier }')
    return
  }
  issues.push(...checkInteger(tribulation.tier, 'battle.tribulation.tier', 1))
  // Trận đã xong thì quái đã lên tầng hoặc đã chết hẳn: chỉ kiểm tra khi trận còn diễn ra.
  if (battle.phase !== 'ended') {
    const party = Array.isArray(state.party) ? state.party : []
    const monster = asObject(party.find((m) => asObject(m)?.id === tribulation.monsterId))
    if (!monster) {
      issues.push(`battle.tribulation: quái "${String(tribulation.monsterId)}" không có trong đội`)
    } else if (tribulation.tier !== Number(monster.awakening) + 1) {
      issues.push(
        `battle.tribulation.tier phải là tầng kế tiếp của quái (${String(monster.awakening)} + 1)`
      )
    }
  }
  if (battle.isBoss !== false) issues.push('battle.tribulation: trận độ kiếp không phải trận boss')
  if (asObject(battle.tamers)?.player !== null) {
    issues.push('battle.tribulation: trận độ kiếp không có ngự thú sư')
  }
  const player = asObject(battle.teamBonuses)?.player
  if (Array.isArray(player) && player.length > 0) {
    issues.push('battle.tribulation: trận độ kiếp không có phối hợp đội')
  }
}

/** Z-Move mỗi phe đã dùng chưa (docs/rules/z-moves.md): true / false cho từng phe. */
function checkZMoveUsed(value: unknown, issues: string[]): void {
  const used = asObject(value)
  if (!used || typeof used.player !== 'boolean' || typeof used.enemy !== 'boolean') {
    issues.push('battle.zMoveUsed phải là { player: boolean, enemy: boolean }')
  }
}

/** Loại biến hình mỗi phe đã dùng: danh sách không lặp các loại hợp lệ. */
function checkTransformsUsed(value: unknown, issues: string[]): void {
  const used = asObject(value)
  if (!used) {
    issues.push('battle.transformsUsed không hợp lệ')
    return
  }
  for (const side of ['player', 'enemy'] as const) {
    const list = used[side]
    const valid =
      Array.isArray(list) &&
      list.every((kind) => TRANSFORM_KINDS.some((known) => known === kind)) &&
      new Set(list).size === list.length
    if (!valid) {
      issues.push(
        `battle.transformsUsed.${side} phải là danh sách không lặp: ${TRANSFORM_KINDS.join(', ')}`
      )
    }
  }
}

/** Biến hình boss sẽ dùng: null, hoặc quái địch + loại hợp lệ (+ dạng tồn tại). */
function checkPlannedTransform(
  data: GameData,
  value: unknown,
  enemyIds: readonly string[],
  issues: string[]
): void {
  if (value === null) return
  const plan = asObject(value)
  const path = 'battle.plannedTransform'
  if (!plan) {
    issues.push(`${path} không hợp lệ`)
    return
  }
  if (!enemyIds.includes(String(plan.monsterId))) issues.push(`${path}: quái địch không tồn tại`)
  if (!TRANSFORM_KINDS.some((kind) => kind === plan.kind)) issues.push(`${path}.kind không hợp lệ`)
  const form = plan.formSpeciesId
  if (form !== undefined && (typeof form !== 'string' || !(form in data.species))) {
    issues.push(`${path}.formSpeciesId: loài không tồn tại "${String(form)}"`)
  }
}

/** Id quái không trùng; nextMonsterId lớn hơn mọi id dạng "m<số>". */
function checkIds(ids: string[], nextMonsterId: unknown, issues: string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) issues.push(`id quái bị trùng "${id}"`)
    seen.add(id)
  }
  const maxId = ids.reduce((max, id) => {
    const match = /^m(\d+)$/.exec(id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  if (typeof nextMonsterId === 'number' && nextMonsterId <= maxId) {
    issues.push(`nextMonsterId phải lớn hơn mọi id quái (hiện có m${maxId})`)
  }
}

/** Kiểm tra toàn bộ một GameState (đã migrate) so với dữ liệu game. Trả về danh sách lỗi. */
export function validateGameState(data: GameData, value: unknown): string[] {
  const state = asObject(value)
  if (!state) return ['save không chứa state hợp lệ']
  const issues: string[] = []
  checkTopLevel(state, issues)
  checkFloorBiomes(data, state, issues)

  const partyIds = checkMonsterList(
    data,
    state.party,
    { path: 'party', ownership: 'owned' },
    issues
  )
  const party = (state as unknown as GameState).party
  // Quái lớn chiếm nhiều ô đội (docs/rules/monster-size.md); quái hỏng đã báo ở checkMonsterList.
  const valid = Array.isArray(party) ? party.filter((m) => asObject(m) !== null) : []
  // Đội trống chỉ khi đã thua game Nuzlocke (docs/rules/challenge-modes.md).
  const minParty = isGameOverSave(state) ? 0 : 1
  if (
    Array.isArray(party) &&
    (party.length < minParty || partySlotsUsed(data, valid) > data.config.partySize)
  ) {
    issues.push(`party phải có từ ${minParty} quái, chiếm tối đa ${data.config.partySize} ô`)
  }
  const storageIds = checkMonsterList(
    data,
    state.storage,
    { path: 'storage', ownership: 'owned' },
    issues
  )
  const eggIds = checkEggs(data, state.eggs, issues)
  issues.push(...validateInventory(data, state.inventory))
  const souls = validateSouls(data, asObject(state.inventory)?.souls)
  issues.push(...souls.issues)
  issues.push(...validateShop(data, state.shop))
  issues.push(...validateMarket(state.market))
  const battleIds = checkBattle(data, state, partyIds, issues)
  const safariIds = validateSafariState(data, state, {
    checkWild: (monster, path) => checkMonster(data, monster, { path, ownership: 'wild' }, issues),
    issues
  })
  const tradeIds = validateTradeState(data, state, {
    checkWild: (monster, path) => checkMonster(data, monster, { path, ownership: 'wild' }, issues),
    issues
  })
  const auctionEggIds = validateAuctionState(data, state, {
    checkEgg: (egg, path) => checkEgg(data, egg, path, issues),
    issues
  })

  // Hồn phách giữ id của quái đã chết: không trùng quái đang sống, cùng bộ đếm nextMonsterId.
  checkIds(
    [
      ...partyIds,
      ...storageIds,
      ...eggIds,
      ...battleIds,
      ...safariIds,
      ...tradeIds,
      ...auctionEggIds,
      ...souls.ids
    ],
    state.nextMonsterId,
    issues
  )
  issues.push(...validateEquipmentState(data, state))
  issues.push(...validateTimeState(state))
  issues.push(...validateChallengeState(state))
  issues.push(...validateAscensionState(data, state))
  issues.push(...validateGameLog(state))
  issues.push(...validateTamer(data, state.tamer))
  issues.push(...validateBondState(state))
  issues.push(...validateFormationState(data, state.formations))
  issues.push(...validateAlchemyState(data, state.alchemy))
  issues.push(...validateSmithingState(data, state.smithing))
  issues.push(...validateCookingState(data, state.cooking))
  issues.push(...validateDwellingState(data, state))
  issues.push(...validateQuestState(data, state.quests))
  issues.push(...validateSectState(data, state))
  checkTypelessMonsters(data, state, issues)
  issues.push(...validateTeamPresetState(data, state.teamPresets))
  issues.push(
    ...validateTrainerState(data, state.trainers, {
      highestFloor: state.highestFloor,
      inTown: asObject(state.location)?.type === 'town'
    })
  )
  issues.push(
    ...validateTrialState(data, state, { inTown: asObject(state.location)?.type === 'town' })
  )
  issues.push(...validateInstabilityState(data, state))
  issues.push(...validateDeityState(state))
  issues.push(...validateEventState(data, state))
  issues.push(...validateZoneState(data, state))
  issues.push(...validateHatcheryState(data, state))
  issues.push(...validateEssenceState(data, state))
  issues.push(...validateWorldBossState(data, state))
  issues.push(...validateSpiritState(data, state))
  issues.push(...validateLabState(data, state.lab))
  issues.push(...validateCapacityState(data, state))
  issues.push(...validateRecruitState(data, state))
  issues.push(...validateDexState(data, state.dex))
  issues.push(...validateResearchState(data, state.research))
  issues.push(...validateAchievementState(data, state))
  issues.push(
    ...validateExpeditionState(data, state.expeditions, {
      storage: state.storage,
      party: state.party
    })
  )
  return issues
}
