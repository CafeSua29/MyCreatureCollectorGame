// Bản nháp state trong trận và các thao tác nhỏ: tra cứu quái / ô sân, trừ máu (gục thì mất
// trạng thái), hồi máu, đổi bậc trận, đưa quái ra sân, ghi log. Quái lớn (docs/rules/monster-size.md)
// có id ở mọi ô sân của phe nhưng là một quái trên sân, ra lệnh ở ô đầu của nó.

import { ActionError, BIG_ZERO, cloneData, memoInReadOnlyScope } from '../shared'
import { computeStats, isFainted } from '../monster'
import {
  abilityHasFlag,
  areItemsDisabled,
  collectionStatPercent,
  mealStatPercent,
  blessingStatPercent,
  fieldIdMatches,
  forEachTraitHook,
  frenzyNumbers,
  frenzyRole,
  isLargeMonster,
  trialFighters,
  TRAIT_HOOKS,
  type AbilityFlag
} from '../registries'
import { transformOnLeave } from './transform'
import { battleFormOnLeave } from './battleForms'
import { pendingSkillOf, previousSkillThisTurn } from './actionQueue'
import { battleDeityId } from './deities'
import {
  isMergedAway,
  mergePartnerOf,
  type BattleField,
  type BattleRecord,
  type BigStats,
  type BattleEvent,
  type DamageArena,
  type BattlePhase,
  type BattleSide,
  type BattleState,
  type GameData,
  type GameState,
  type Monster,
  type MonsterBattleContext,
  type OncePerBattleEffect,
  type StageStat,
  type TurnLog
} from '../model'

/** State đang có trận; mọi hàm nội bộ sửa trực tiếp trên bản sao này. */
export type Draft = GameState & { battle: BattleState }

export const SLOT_COUNT = 2

/** Dùng vật phẩm đi sau đổi quái nhưng trước mọi skill. */
export const ITEM_PRIORITY = Number.MAX_SAFE_INTEGER

// ---------- Tra cứu ----------

export function requireBattle(state: GameState, phase: BattlePhase): BattleState {
  if (!state.battle) throw new ActionError('noBattle')
  if (state.battle.phase !== phase) {
    throw new ActionError('wrongBattlePhase', { phase: state.battle.phase, expected: phase })
  }
  return state.battle
}

export function cloneDraft(state: GameState): Draft {
  // Ép kiểu vì nơi gọi đã kiểm tra state.battle khác null (requireBattle).
  return cloneData(state) as Draft
}

export function findMonster(d: Draft, id: string): Monster {
  const monster = d.party.find((m) => m.id === id) ?? d.battle.enemies.find((m) => m.id === id)
  if (!monster) throw new Error(`Không tìm thấy quái "${id}" trong trận`)
  return monster
}

export function slotsOf(battle: BattleState, side: BattleSide): (string | null)[] {
  return side === 'player' ? battle.playerSlots : battle.enemySlots
}

export const opponentOf = (side: BattleSide): BattleSide => (side === 'player' ? 'enemy' : 'player')

/**
 * Quái còn sống đang trên sân của một bên, theo thứ tự ô; quái lớn tính một lần ở ô đầu của nó
 * (cũng là ô ra lệnh của nó).
 */
export function aliveOnField(
  data: GameData,
  d: Draft,
  side: BattleSide
): { slot: number; monster: Monster }[] {
  const slots = slotsOf(d.battle, side)
  const result: { slot: number; monster: Monster }[] = []
  slots.forEach((id, slot) => {
    if (id === null || slots.indexOf(id) !== slot) return
    const monster = findMonster(d, id)
    if (!isFainted(data, monster)) result.push({ slot, monster })
  })
  return result
}

/**
 * Ô ra lệnh của phe: ô đầu của mỗi quái trên sân (quái lớn chiếm nhiều ô vẫn một lệnh); thực thể hợp
 * thể (`mergedIds`, docs/rules/battle-merge.md) ra lệnh ở mọi ô của nó (hành động 2 lần mỗi lượt).
 */
export const commandSlotsOf = (
  slots: readonly (string | null)[],
  mergedIds: readonly string[] = []
): number[] =>
  slots.flatMap((id, slot) =>
    id !== null && (slots.indexOf(id) === slot || mergedIds.includes(id)) ? [slot] : []
  )

/** Ô hành động của phe (mỗi ô ra lệnh của quái còn sống, kèm quái): thực thể hợp thể có 2 ô. */
export function actingSlots(
  data: GameData,
  d: Draft,
  side: BattleSide
): { slot: number; monster: Monster }[] {
  return aliveOnField(data, d, side).flatMap((entry) => {
    if (!mergePartnerOf(entry.monster)) return [entry]
    const slots = slotsOf(d.battle, side)
    return slots.flatMap((id, slot) => (id === entry.monster.id ? [{ ...entry, slot }] : []))
  })
}

/** Id các quái đang ở ô sân (kể cả đã gục còn trong ô), mỗi quái một lần. */
export const occupantIds = (slots: readonly (string | null)[]): string[] =>
  [...new Set(slots)].filter((id): id is string => id !== null)

/**
 * Quái `monster` vào được ô `slot` không: quái thường luôn được (quái ở ô đó rời sân); quái lớn cần
 * mọi ô khác trống, thuộc chính quái đang ở ô `slot` (cùng rời sân) hoặc thuộc quái trong `vacating`
 * (cùng rút ra trong lượt đó / đã gục chờ thay).
 */
export function canEnterSlot(
  data: GameData,
  slots: readonly (string | null)[],
  { slot, monster, vacating = [] }: { slot: number; monster: Monster; vacating?: readonly string[] }
): boolean {
  if (!isLargeMonster(data, monster)) return true
  const leaving = slots[slot]
  return slots.every(
    (id, i) => i === slot || id === null || id === leaving || vacating.includes(id)
  )
}

/** Quái rời sân khi `monster` vào ô `slot`: quái lớn đẩy mọi quái của phe, quái thường chỉ ô đó. */
export function displacedBy(
  data: GameData,
  slots: readonly (string | null)[],
  { slot, monster }: { slot: number; monster: Monster }
): string[] {
  if (isLargeMonster(data, monster)) return occupantIds(slots)
  const outgoing = slots[slot]
  return outgoing === null ? [] : [outgoing]
}

/** Bỏ quái khỏi mọi ô của phe (bị bắt, bỏ chạy, rời sân); quái lớn rời thì cả các ô của nó trống. */
export function removeFromField(d: Draft, side: BattleSide, monsterId: string): void {
  const slots = slotsOf(d.battle, side)
  slots.forEach((id, slot) => {
    if (id === monsterId) slots[slot] = null
  })
}

/**
 * Quái ta chết hẳn sau trận đã kết thúc (độ kiếp, chết thật): bỏ khỏi đội và mọi chỗ trận còn trỏ
 * tới nó.
 */
export function removeDeadFromBattle(d: Draft, monsterId: string): void {
  d.party = d.party.filter((monster) => monster.id !== monsterId)
  const { battle } = d
  removeFromField(d, 'player', monsterId)
  battle.participants = battle.participants.filter((id) => id !== monsterId)
  delete battle.records[monsterId]
  delete battle.usedOnce[monsterId]
}

/**
 * Xếp quái vào ô lúc mở trận theo thứ tự: quái thường vào ô trống đầu tiên, quái lớn chỉ khi mọi ô
 * còn trống (lấy hết ô); không đủ chỗ thì bỏ qua, quái sau vẫn được xét.
 */
export function initialSlots(data: GameData, monsters: readonly Monster[]): (string | null)[] {
  const slots: (string | null)[] = Array.from({ length: SLOT_COUNT }, () => null)
  for (const monster of monsters) {
    if (!slots.includes(null)) break
    if (isLargeMonster(data, monster)) {
      if (!slots.some((id) => id !== null)) slots.fill(monster.id)
      continue
    }
    slots[slots.indexOf(null)] = monster.id
  }
  return slots
}

/**
 * Quái của người chơi tham gia trận: cả đội, riêng trận độ kiếp chỉ quái độ kiếp (đánh một mình;
 * docs/rules/awakening.md). Quái khác trong đội vẫn nằm trong `party` nhưng không vào sân.
 */
export function playerFighters(
  data: GameData,
  state: Pick<GameState, 'party' | 'battle'>
): Monster[] {
  const tribulation = state.battle?.tribulation
  if (tribulation) return state.party.filter((m) => m.id === tribulation.monsterId)
  // Bí cảnh / tháp (docs/rules/trials.md): luật một hệ chỉ cho quái mang hệ đó vào trận.
  const trial = state.battle?.trial
  return trial ? trialFighters(data, state.party, trial.rules) : state.party
}

/** Quái còn sống chưa ra sân của một bên (quái hoang: chưa ra sân, chưa bị bắt). */
export function reservesOnSide(data: GameData, d: Draft, side: BattleSide): Monster[] {
  if (side === 'player') return reservesOf(data, playerFighters(data, d), d.battle.playerSlots)
  return d.battle.enemies.filter(
    (m) => !d.battle.enemySlots.includes(m.id) && !isMergedAway(m) && !isFainted(data, m)
  )
}

/** Quái ta còn sống nhưng chưa ra sân (quái phụ đang hợp thể không tính: nó nằm trong thực thể). */
export function reservesOf(
  data: GameData,
  party: Monster[],
  playerSlots: (string | null)[]
): Monster[] {
  return party.filter((m) => !playerSlots.includes(m.id) && !isMergedAway(m) && !isFainted(data, m))
}

/**
 * Thay quái phe người chơi: `vacantSlots` = ô sân với ô gục coi như trống, `openSlots` = các ô
 * trống đó, quái dự bị được vào thay (mục Battle; quái lớn cần mọi ô trống).
 */
export function replacementOptions(
  data: GameData,
  state: GameState,
  battle: BattleState
): { openSlots: number[]; reserves: Monster[]; vacantSlots: (string | null)[] } {
  const vacantSlots = battle.playerSlots.map((id) => {
    const monster = state.party.find((m) => m.id === id)
    return monster && !isFainted(data, monster) ? id : null
  })
  const openSlots = vacantSlots.flatMap((id, slot) => (id === null ? [slot] : []))
  const reserves = reservesOf(data, playerFighters(data, state), battle.playerSlots)
  return { openSlots, reserves, vacantSlots }
}

/**
 * Ô trống (`slots`, ô gục coi như trống) đầu tiên mà một quái trong `reserves` vào được (quái lớn
 * cần mọi ô trống); null = không còn ô nào thay được.
 */
export function fillableSlot(
  data: GameData,
  slots: readonly (string | null)[],
  reserves: readonly Monster[]
): number | null {
  for (let slot = 0; slot < slots.length; slot++) {
    if (slots[slot] !== null) continue
    if (reserves.some((monster) => canEnterSlot(data, slots, { slot, monster }))) return slot
  }
  return null
}

/** Phe của quái trong trận: quái trong đội là phe người chơi, còn lại là quái hoang. */
export function sideOf(d: Draft, monsterId: string): BattleSide {
  return d.party.some((m) => m.id === monsterId) ? 'player' : 'enemy'
}

/** Bản ghi trận rỗng (quái chưa làm gì trong trận). */
export function emptyRecord(): BattleRecord {
  return {
    turnsTaken: 0,
    attacks: 0,
    casts: 0,
    timesDamaged: 0,
    defends: 0,
    provokes: 0,
    deaths: 0,
    revivals: 0,
    damageTaken: BIG_ZERO,
    damageDealt: BIG_ZERO,
    healingReceived: BIG_ZERO,
    lastAction: null,
    traitsGained: 0,
    usedTriggers: [],
    catchMisses: 0
  }
}

/** Bản ghi trận của quái (tạo mới nếu chưa có) để ghi thêm. */
export function recordOf(d: Draft, monsterId: string): BattleRecord {
  return (d.battle.records[monsterId] ??= emptyRecord())
}

/**
 * Mọi quái của một phe trong trận (cả dự bị); quái hoang đã bắt không còn tính, quái phụ đang hợp
 * thể không tính riêng (thực thể đã gồm máu / chỉ số của nó; docs/rules/battle-merge.md).
 */
export const teamOf = (data: GameData, d: Draft, side: BattleSide): Monster[] =>
  (side === 'player' ? playerFighters(data, d) : d.battle.enemies).filter((m) => !isMergedAway(m))

/** % công / đặc công do cuồng bạo (docs/rules/frenzy.md); 0 = không cuồng bạo. */
function frenzyStatPercent(
  data: GameData,
  d: Draft,
  { side, monster }: { side: BattleSide; monster: Monster }
): number {
  if (!hasUsedOnce(d, monster.id, 'frenzy')) return 0
  const role = frenzyRole(data, d.battle, { side, monster })
  return role === null ? 0 : frenzyNumbers(data, role).statPercent
}

/**
 * Bối cảnh trận của quái đang trên sân (trait theo lượt trên sân, đồng đội, hào quang, bản ghi
 * trận...); quái không ở trên sân thì undefined.
 */
export function monsterBattleContext(
  data: GameData,
  d: Draft,
  monster: Monster
): MonsterBattleContext | undefined {
  // Cùng một object bối cảnh trong phạm vi chỉ đọc (AI) để hook đã gom theo bối cảnh dùng lại được.
  return memoInReadOnlyScope(BATTLE_CONTEXT_TABLE, [data, d, monster], () =>
    buildBattleContext(data, d, monster)
  )
}

/**
 * Nhật ký lượt hiện tại của quái đang trên sân (sang lượt mới thì làm lại từ đầu); quái không trên
 * sân thì undefined. Ghi vào đây việc mà điều kiện chiêu cần (đã hành động, đổi bậc, bị trúng đòn).
 */
export function currentTurnLog(d: Draft, monsterId: string): TurnLog | undefined {
  const volatile = d.battle.volatiles[monsterId]
  if (!volatile) return undefined
  if (volatile.turnLog?.turn !== d.battle.turn) volatile.turnLog = { turn: d.battle.turn }
  return volatile.turnLog
}

const BATTLE_CONTEXT_TABLE = {}

/**
 * Số lượt mặc định do đồ cầm của quái đặt môi trường kéo dài (Damp Rock: mưa 8 lượt, Terrain
 * Extender: địa hình, Light Clay: màn chắn); nhiều món khớp lấy số lớn nhất, không có thì undefined.
 */
export function heldFieldTurns(
  data: GameData,
  d: Draft,
  { monsterId, fieldId }: { monsterId: string; fieldId: string }
): number | undefined {
  // Quái đặt có thể không thuộc hai đội (minion): không kéo dài.
  const owner = [...d.party, ...d.battle.enemies].find((monster) => monster.id === monsterId)
  if (!owner) return undefined
  const { layer } = data.fieldEffects[fieldId]
  let turns: number | undefined
  forEachTraitHook(
    data,
    owner,
    (handler, params) => {
      const extended = handler.fieldTurns?.(params, fieldId, layer)
      if (extended !== undefined) turns = Math.max(turns ?? 0, extended)
    },
    monsterBattleContext(data, d, owner)
  )
  return turns
}

/** Món của quái không tác dụng: Magic Room (cả sân), Embargo (trạng thái) hoặc ability Klutz. */
function itemsDisabledFor(data: GameData, d: Draft, monster: Monster): boolean {
  return (
    areItemsDisabled(data, d.battle.field) ||
    monster.statuses.some((status) => data.statuses[status.statusId]?.disablesItems) ||
    abilityHasFlag(data, monster, 'ignoresOwnItems')
  )
}

/**
 * Đồ cầm kiểu Utility Umbrella của quái che thời tiết đang có của `field` (mưa, nắng, kể cả qua
 * actsAs); món bị tắt (Magic Room) thì không che. Đọc thẳng ô đồ cầm (không qua bối cảnh trận) vì
 * bối cảnh trận dựng từ chính môi trường này.
 */
function shieldsWeather(data: GameData, d: Draft, monster: Monster, field: BattleField): boolean {
  const weatherId = field.weather.id
  if (weatherId === data.config.field.defaults.weather) return false
  const shields = monster.equipment.some((entry) => {
    if (entry.storage !== 'stack') return false
    const item = data.items[entry.itemId]
    return (
      item?.category === 'held' &&
      item.hooks.some((hook) => {
        const weatherIds = TRAIT_HOOKS[hook.type].shieldedWeatherIds?.(hook.params)
        return weatherIds !== undefined && fieldIdMatches(data, weatherId, weatherIds)
      })
    )
  })
  return shields && !itemsDisabledFor(data, d, monster)
}

/** `field` theo góc nhìn của quái cầm Utility Umbrella: thời tiết bị che coi như trời mặc định. */
function withWeatherShield(
  data: GameData,
  d: Draft,
  monster: Monster,
  field: BattleField
): BattleField {
  if (!shieldsWeather(data, d, monster, field)) return field
  return { ...field, weather: { id: data.config.field.defaults.weather, turnsLeft: null } }
}

/**
 * Môi trường theo góc nhìn của một quái: môi trường thực tế (effectiveField), quái cầm Utility
 * Umbrella thì mưa / nắng không tác dụng lên nó (trait, chỉ số, skill của nó; như Pokémon).
 */
export function monsterField(data: GameData, d: Draft, monster: Monster): BattleField {
  return withWeatherShield(data, d, monster, effectiveField(data, d))
}

function buildBattleContext(
  data: GameData,
  d: Draft,
  monster: Monster
): MonsterBattleContext | undefined {
  const volatile = d.battle.volatiles[monster.id]
  if (!volatile) return undefined
  const side = sideOf(d, monster.id)
  const foeSide = opponentOf(side)
  // Đếm gục / còn sống cả đội tốn kém (tính max HP từng quái) mà ít trait dùng: tính khi cần.
  const fainted = (team: Monster[]): number => team.filter((m) => isFainted(data, m)).length
  return {
    // Vào sân giữa lượt: firstTurn là lượt sau nên phần còn lại của lượt này tính 0.
    turnsOnField: d.battle.turn - volatile.firstTurn + 1,
    allies: aliveOnField(data, d, side)
      .map((entry) => entry.monster)
      .filter((ally) => ally.id !== monster.id),
    knockouts: volatile.knockouts ?? 0,
    absorbBoosts: volatile.absorbBoosts ?? [],
    side,
    battleTurn: d.battle.turn,
    stages: d.battle.stages[monster.id] ?? {},
    isBossBattle: d.battle.isBoss,
    foes: aliveOnField(data, d, foeSide).map((entry) => entry.monster),
    volatiles: d.battle.volatiles,
    record: d.battle.records[monster.id] ?? emptyRecord(),
    records: d.battle.records,
    teamIds: teamOf(data, d, side).map((m) => m.id),
    counters: d.battle.counters,
    itemsDisabled: itemsDisabledFor(data, d, monster),
    // Unnerve: địch trên sân làm berry của quái không tác dụng (như Pokémon: không ăn được).
    berriesBlocked: aliveOnField(data, d, foeSide).some(({ monster: foe }) =>
      battleAbilityHasFlag(data, d, foe, 'blocksFoeBerries')
    ),
    teamBonuses: d.battle.teamBonuses[side],
    frenzyStatPercent: frenzyStatPercent(data, d, { side, monster }),
    collectionStatPercent: side === 'player' ? collectionStatPercent(data, d.dex) : 0,
    mealStatPercent: side === 'player' ? mealStatPercent(data, d.cooking.meal) : {},
    blessingStatPercent:
      side === 'player'
        ? blessingStatPercent(data, d.favor, {
            deityId: battleDeityId(data, d, d.battle),
            monster
          })
        : {},
    field: monsterField(data, d, monster),
    // Gastro Acid... hoặc quái khác trên sân có Neutralizing Gas.
    abilitySuppressed:
      volatile.abilitySuppressed === true ||
      (['player', 'enemy'] as const).some((onSide) =>
        aliveOnField(data, d, onSide).some(
          ({ monster: other }) =>
            other.id !== monster.id && abilityHasFlag(data, other, 'suppressesAbilities')
        )
      ),
    pendingSkill: pendingSkillOf(d, monster.id),
    previousSkill: previousSkillThisTurn(d),
    get faintedAllies() {
      return fainted(teamOf(data, d, side))
    },
    get faintedFoes() {
      return fainted(teamOf(data, d, foeSide))
    },
    get livingAllies() {
      return teamOf(data, d, side).length - fainted(teamOf(data, d, side))
    },
    get livingFoes() {
      return teamOf(data, d, foeSide).length - fainted(teamOf(data, d, foeSide))
    }
  }
}

/**
 * Ability trong trận của quái (ability đổi bằng chiêu, kể cả Gastro Acid) có cờ `flag`: bản rẻ của
 * hasAbilityFlag (không dựng bối cảnh trận) cho việc tra cả sân nhiều lần (Cloud Nine).
 */
function battleAbilityHasFlag(
  data: GameData,
  d: Draft,
  monster: Monster,
  flag: AbilityFlag
): boolean {
  const volatile = d.battle.volatiles[monster.id]
  if (volatile?.abilitySuppressed) return false
  return abilityHasFlag(data, monster, flag, volatile?.abilityOverride)
}

/**
 * Môi trường thực tế của trận (battle-environment.md mục "Tắt thời tiết"): có quái còn sống trên
 * sân mang Cloud Nine / Air Lock thì thời tiết vẫn còn (vẫn đếm lượt) nhưng không có tác dụng, coi
 * như trời mặc định. Mọi chỗ tính hiệu ứng môi trường đọc qua đây; chỗ đặt / đếm lượt sửa
 * d.battle.field.
 */
export function effectiveField(data: GameData, d: Draft): BattleField {
  const { field } = d.battle
  const defaultWeather = data.config.field.defaults.weather
  if (field.weather.id === defaultWeather) return field
  const suppressed = (['player', 'enemy'] as const).some((side) =>
    aliveOnField(data, d, side).some(({ monster }) =>
      battleAbilityHasFlag(data, d, monster, 'suppressesWeather')
    )
  )
  return suppressed ? { ...field, weather: { id: defaultWeather, turnsLeft: null } } : field
}

/**
 * Môi trường theo góc nhìn skill của `user`: môi trường của quái (monsterField), quái có Mega Sol thì skill của nó
 * coi như trời nắng (đòn, power theo thời tiết, nạp, accuracy; như Pokémon).
 */
export function userField(data: GameData, d: Draft, user: Monster): BattleField {
  const field = monsterField(data, d, user)
  const sun = data.config.field.sunWeatherId
  if (!battleAbilityHasFlag(data, d, user, 'actsInSun') || field.weather.id === sun) return field
  return { ...field, weather: { id: sun, turnsLeft: null } }
}

/**
 * Chỉ số cuối của quái trong trận: tính cả bậc trận, môi trường (kể cả hiệu ứng theo phe) và bối
 * cảnh trận của trait (lượt trên sân, đồng đội).
 */
export function battleStats(data: GameData, d: Draft, monster: Monster): BigStats {
  return computeStats(data, monster, {
    stages: d.battle.stages[monster.id],
    field: monsterField(data, d, monster),
    side: sideOf(d, monster.id),
    battle: monsterBattleContext(data, d, monster)
  }).final
}

/**
 * Bối cảnh trận cho công thức sát thương: môi trường, phe hai bên, số quái còn sống trên sân của
 * phe bên nhận (màn chắn).
 */
export function damageArena(
  data: GameData,
  d: Draft,
  { attacker, defender }: { attacker: Monster; defender: Monster }
): DamageArena {
  const defenderSide = sideOf(d, defender.id)
  // Đếm quái (phải tính máu từng quái) chỉ khi phe bên nhận có hiệu ứng theo phe; không có thì
  // số này không được dùng.
  const hasSideFields = d.battle.field.sides[defenderSide].length > 0
  // Mega Sol: đòn của quái đánh coi như trời nắng.
  const field = userField(data, d, attacker)
  return {
    field,
    // Utility Umbrella của bên nhận: hệ số sát thương của mưa / nắng không áp lên nó.
    damageField: withWeatherShield(data, d, defender, field),
    attackerSide: sideOf(d, attacker.id),
    defenderSide,
    defenderSideCount: hasSideFields ? aliveOnField(data, d, defenderSide).length : 1,
    attackerFocusStages: d.battle.volatiles[attacker.id]?.focusStages ?? 0,
    attackerContext: monsterBattleContext(data, d, attacker),
    defenderContext: monsterBattleContext(data, d, defender)
  }
}

export const log = (d: Draft, event: BattleEvent): void => {
  d.battle.log.push(event)
}

// ---------- Thay đổi trong trận ----------

/** Quái đã dùng hiệu ứng trait một lần mỗi trận này chưa (mục "Trait sống sót"). */
export const hasUsedOnce = (d: Draft, monsterId: string, effect: OncePerBattleEffect): boolean =>
  d.battle.usedOnce[monsterId]?.includes(effect) ?? false

export function markUsedOnce(d: Draft, monsterId: string, effect: OncePerBattleEffect): void {
  ;(d.battle.usedOnce[monsterId] ??= []).push(effect)
}

export interface PutOnFieldInput {
  side: BattleSide
  slot: number
  monsterId: string
  firstTurn: number
}

/**
 * Đổi bậc trận, kẹp trong [min, max]; log ghi lượng thực đổi (0 = đã chạm giới hạn). Trả về
 * lượng thực đổi. Đổi bậc do quái / bẫy gây thì đi qua applyStageChange (stageChanges.ts).
 */
export function changeStage(
  data: GameData,
  d: Draft,
  monsterId: string,
  stat: StageStat,
  delta: number
): number {
  const { min, max } = data.config.battleStage
  const stages = (d.battle.stages[monsterId] ??= {})
  const current = stages[stat] ?? 0
  const next = Math.min(max, Math.max(min, current + delta))
  stages[stat] = next
  log(d, { type: 'stage', monsterId, stat, delta: next - current })
  return next - current
}

/** Trả hệ / race gốc cho quái bị đổi trong trận (trait Siralim) khi rời sân hoặc hết trận. */
export function restoreIdentity(d: Draft, monsterId: string): void {
  const original = d.battle.volatiles[monsterId]?.originalIdentity
  if (!original) return
  const monster =
    d.party.find((m) => m.id === monsterId) ?? d.battle.enemies.find((m) => m.id === monsterId)
  if (!monster) return
  monster.elementIds = [...original.elementIds]
  monster.raceId = original.raceId
}

/**
 * Quái rời sân (rút về, gục, bị bắt): mất bậc trận và trạng thái tạm (kể cả minion, trait tạm), trả
 * lại hệ / race gốc, biến hình hết khi rời sân (Dynamax) thì kết thúc.
 */
export function clearOnFieldState(data: GameData, d: Draft, monsterId: string): void {
  // Quái vừa bị bắt đã rời danh sách địch: biến hình của nó trả lại khi hết trận.
  const monster =
    d.party.find((m) => m.id === monsterId) ?? d.battle.enemies.find((m) => m.id === monsterId)
  if (monster) {
    transformOnLeave(data, d, monster)
    battleFormOnLeave(data, d, monster)
    // Trạng thái tạm kiểu Pokémon (lú lẫn) mất khi rời sân; độc nặng đếm lại từ đầu.
    monster.statuses = monster.statuses
      .filter((status) => !data.statuses[status.statusId]?.endsOnLeave)
      .map((status) => {
        if (!data.statuses[status.statusId]?.resetsOnLeave) return status
        const { turnsElapsed: _turnsElapsed, ...rest } = status
        return rest
      })
  }
  restoreIdentity(d, monsterId)
  delete d.battle.stages[monsterId]
  delete d.battle.volatiles[monsterId]
  // Sky Drop / Commander gắn với quái rời sân thì kết thúc ở quái kia.
  for (const volatile of Object.values(d.battle.volatiles)) {
    if (volatile.carriedBy === monsterId) delete volatile.carriedBy
    if (volatile.commanding === monsterId) delete volatile.commanding
    if (volatile.commandedBy === monsterId) delete volatile.commandedBy
  }
  releaseSourcedStatuses(data, d, monsterId)
}

/** Quái rời sân: trạng thái nó gây mà mất khi nó rời sân (Bind, Mean Look) bỏ khỏi quái khác. */
function releaseSourcedStatuses(data: GameData, d: Draft, sourceId: string): void {
  for (const monster of [...d.party, ...d.battle.enemies]) {
    const kept = monster.statuses.filter(
      (status) =>
        status.sourceId !== sourceId || !data.statuses[status.statusId]?.endsWhenSourceLeaves
    )
    if (kept.length === monster.statuses.length) continue
    for (const status of monster.statuses.filter((entry) => !kept.includes(entry))) {
      log(d, { type: 'statusEnded', monsterId: monster.id, statusId: status.statusId })
    }
    monster.statuses = kept
  }
}

/**
 * Lượt đầu tiên quái vào sân lúc này được chọn lệnh: thay quái gục (giữa hai lượt) thì lượt sắp
 * tới, vào giữa lượt (đổi quái, rút về) thì lượt sau.
 */
export const entryFirstTurn = (d: Draft): number =>
  d.battle.phase === 'chooseReplacement' ? d.battle.turn : d.battle.turn + 1

/**
 * Đưa quái ra ô `slot`; quái đang ở ô đó rời sân (quái lớn: ra mọi ô, mọi quái của phe rời sân;
 * quái lớn rời sân thì các ô khác của nó trống). `firstTurn`: xem VolatileState.
 */
export function putOnField(
  data: GameData,
  d: Draft,
  { side, slot, monsterId, firstTurn }: PutOnFieldInput
): void {
  const slots = slotsOf(d.battle, side)
  const monster = findMonster(d, monsterId)
  for (const outgoing of displacedBy(data, slots, { slot, monster })) {
    clearOnFieldState(data, d, outgoing)
    removeFromField(d, side, outgoing)
  }
  if (isLargeMonster(data, monster)) slots.fill(monsterId)
  else slots[slot] = monsterId
  d.battle.volatiles[monsterId] = { firstTurn }
  if (side === 'player' && !d.battle.participants.includes(monsterId)) {
    d.battle.participants.push(monsterId)
  }
  log(d, { type: 'enter', side, slot, monsterId })
}
