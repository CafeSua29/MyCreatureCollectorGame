// Môi trường trong trận (mục "Môi trường" ở battle-environment.md): thời tiết / địa hình tự nhiên của biome,
// đặt môi trường (skill, trait khi vào sân), quái vào sân (bẫy rồi trait), accuracy theo môi
// trường, cuối lượt (sát thương / hồi máu rồi giảm thời hạn). Hiệu ứng theo phe ở sideFields.ts,
// hiệu ứng toàn sân đặc biệt (room) ở rooms.ts.

import { findBiomeBoss } from '../world'
import {
  accuracyStageFactor,
  getMaxHp,
  isFainted,
  masteredAccuracy,
  percentOfMaxHp,
  skillMasteryBonus
} from '../monster'
import {
  activeSkillFieldModifiers,
  fieldAccuracyMultiplier,
  fieldIdsCountedAs,
  fieldMonsterContext,
  forEachFieldHook,
  forEachTraitHook,
  hasTraitFlag,
  seasonWeatherMultiplier,
  skillInField,
  stageTraitEffects,
  traitAccuracyFactor,
  stickerSkillBonus
} from '../registries'
import { BIG_ZERO, maxBig, nextFloat, pickWeighted, rollPercent } from '../shared'
import {
  GLOBAL_FIELD_LAYERS,
  type BattleField,
  type BattleStages,
  type BattleSide,
  type Biome,
  type BossField,
  type FieldPlacement,
  type FieldSource,
  type GameData,
  type GlobalFieldLayer,
  type Monster,
  type MonsterBattleContext,
  type Skill
} from '../model'
import {
  Draft,
  aliveOnField,
  battleStats,
  entryFirstTurn,
  findMonster,
  heldFieldTurns,
  log,
  monsterBattleContext,
  putOnField,
  slotsOf,
  displacedBy,
  effectiveField
} from './draft'
import { heal, loseHp } from './hpChanges'
import { cureOnLeave, healOnLeave } from './turnEndTraits'
import { canInflictStatus, hazardDamageFactor, inflictStatus } from './statuses'
import { applyEntryHazards, longerTurns, tickSideFields } from './sideFields'
import { compareSpeed, tickRooms } from './rooms'
import { ohkoAccuracy } from './fixedDamage'
import { autoTransformOnEntry } from './transform'
import { triggerStageTraits } from './stageChanges'
import { emitTraitEvent } from './eventQueue'
import { passivesOnEntry } from './passiveSkills'

/**
 * Mọi lớp toàn sân ở môi trường mặc định (trời quang, không địa hình) kéo dài cả trận; chưa có
 * hiệu ứng theo phe hay room.
 */
export function defaultField(data: GameData): BattleField {
  const weather = { id: data.config.field.defaults.weather, turnsLeft: null }
  const terrain = { id: data.config.field.defaults.terrain, turnsLeft: null }
  return { weather, terrain, sides: { player: [], enemy: [] }, rooms: [] }
}

/**
 * Vào trận: tung thời tiết rồi địa hình tự nhiên của map theo trọng số, giữ cả trận; trọng số thời
 * tiết nhân hệ số theo mùa (docs/rules/calendar.md). Map bỏ trống một lớp thì lớp đó là môi trường
 * mặc định, không tốn RNG. Trận boss có đấu trường (`bossField`
 * của boss) thì lớp có ghi lấy cố định, không tốn RNG.
 */
export function rollNaturalField(data: GameData, d: Draft, biome: Biome): void {
  const bossField = battleBossField(d, biome)
  for (const layer of GLOBAL_FIELD_LAYERS) {
    const entries = biome[layer] ?? []
    let fieldId = data.config.field.defaults[layer]
    const fixed = bossField?.[layer]
    if (fixed !== undefined) {
      fieldId = fixed
    } else if (entries.length > 0) {
      let entry: (typeof entries)[number]
      const seasonFactor = (fieldId: string): number =>
        layer === 'weather' ? seasonWeatherMultiplier(data, fieldId, d.time) : 1
      ;[entry, d.rng] = pickWeighted(
        d.rng,
        entries,
        (candidate) => candidate.weight * seasonFactor(candidate.fieldId)
      )
      fieldId = entry.fieldId
    }
    d.battle.field[layer] = { id: fieldId, turnsLeft: null }
    log(d, { type: 'fieldChanged', layer, fieldId, source: 'biome' })
  }
}

/**
 * Trận độ kiếp (docs/rules/awakening.md): thời tiết và địa hình cố định của config, giữ cả trận như
 * môi trường tự nhiên (skill vẫn đổi được), không tốn RNG.
 */
export function placeTribulationField(data: GameData, d: Draft): void {
  const fixed = data.config.awakening.tribulation
  for (const layer of GLOBAL_FIELD_LAYERS) {
    d.battle.field[layer] = { id: fixed[layer], turnsLeft: null }
    log(d, { type: 'fieldChanged', layer, fieldId: fixed[layer], source: 'tribulation' })
  }
}

/** Đấu trường của trận boss (boss đánh một mình, mục boss cùng loài của map); không có = undefined. */
function battleBossField(d: Draft, biome: Biome): BossField | undefined {
  if (!d.battle.isBoss) return undefined
  const [boss] = d.battle.enemies
  return boss ? findBiomeBoss(biome, boss.speciesId)?.bossField : undefined
}

/**
 * Đặt môi trường (skill, trait vào sân): thay môi trường đang có ở lớp đó; đặt lại đúng môi
 * trường đang có thì chỉ làm mới thời hạn, lấy thời hạn dài hơn (môi trường tự nhiên cả trận giữ
 * nguyên cả trận). Lớp đang là thời tiết nguyên thủy thì chỉ môi trường primal khác thay được
 * (log `fieldFailed`); môi trường primal kéo dài tới khi quái đặt nó rời sân (`turnsLeft: null`).
 * Đồ cầm kiểu Damp Rock của quái đặt kéo dài số lượt mặc định.
 */
export function placeField(
  data: GameData,
  d: Draft,
  { layer, fieldId, turns }: FieldPlacement,
  { source, monsterId }: { source: FieldSource; monsterId: string }
): void {
  const current = d.battle.field[layer]
  const effect = data.fieldEffects[fieldId]
  if (data.fieldEffects[current.id].primal && !effect.primal) {
    log(d, { type: 'fieldFailed', layer, fieldId, monsterId })
    return
  }
  // Kiểm tra dữ liệu đảm bảo có turns hoặc duration, trừ môi trường primal (checkSetFieldParams).
  const placed = effect.primal
    ? null
    : (turns ?? heldFieldTurns(data, d, { monsterId, fieldId }) ?? (effect.duration as number))
  const turnsLeft = current.id === fieldId ? longerTurns(current.turnsLeft, placed) : placed
  d.battle.field[layer] = { id: fieldId, turnsLeft }
  log(d, { type: 'fieldChanged', layer, fieldId, source, monsterId })
  if (current.id !== fieldId) emitFieldChanged(data, d)
}

/**
 * Thời tiết nguyên thủy (primal) mất khi không còn quái nào còn sống trên sân mang trait đặt nó
 * khi vào sân (như Pokémon: Primal Kyogre rời sân thì Heavy Rain tan). Gọi sau khi quái rời sân
 * (đổi quái, gục, rút về) và cuối lượt.
 */
export function endUnsustainedPrimalFields(data: GameData, d: Draft): void {
  for (const layer of GLOBAL_FIELD_LAYERS) {
    const { id } = d.battle.field[layer]
    if (!data.fieldEffects[id].primal) continue
    const sustained = (['player', 'enemy'] as const).some((side) =>
      aliveOnField(data, d, side).some(({ monster }) => setsFieldOnEntry(data, d, monster, id))
    )
    if (sustained) continue
    log(d, { type: 'fieldEnded', layer, fieldId: id })
    d.battle.field[layer] = { id: data.config.field.defaults[layer], turnsLeft: null }
    emitFieldChanged(data, d)
  }
}

/** Quái mang trait đặt môi trường `fieldId` khi vào sân (Primordial Sea: Heavy Rain). */
const setsFieldOnEntry = (data: GameData, d: Draft, monster: Monster, fieldId: string): boolean =>
  hasTraitFlag(
    data,
    monster,
    (handler, params) => handler.fieldOnEntry?.(params).fieldId === fieldId,
    monsterBattleContext(data, d, monster)
  )

/**
 * Thời tiết / địa hình đổi: sự kiện `fieldChanged` cho mọi quái còn sống trên sân (Forecast, Flower
 * Gift, Ice Face đổi dạng theo môi trường mới).
 */
function emitFieldChanged(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      emitTraitEvent(d, { type: 'fieldChanged', subjectId: monster.id })
    }
  }
}

/**
 * Dọn một lớp toàn sân về môi trường mặc định (skill kiểu Defog, Ice Spinner); lớp đang là mặc
 * định thì không làm gì. Dọn cả môi trường tự nhiên của map (như Pokémon).
 */
export function clearGlobalField(
  data: GameData,
  d: Draft,
  layer: GlobalFieldLayer,
  user: Monster
): void {
  const fieldId = d.battle.field[layer].id
  const defaultId = data.config.field.defaults[layer]
  if (fieldId === defaultId) return
  d.battle.field[layer] = { id: defaultId, turnsLeft: null }
  log(d, { type: 'fieldRemoved', layer, fieldId, monsterId: user.id })
  emitFieldChanged(data, d)
}

/**
 * Accuracy của skill lên một mục tiêu: fieldModifiers luôn trúng → 100; không thì accuracy thay
 * thế (nếu có), cộng thuần thục skill của `user`, × hệ số accuracy của môi trường (theo hệ đã đổi) × hệ số trait (accuracy của
 * `user`, né của `target`, trait của `foes` (quái địch trên sân của `user`) đổi accuracy của nó) ×
 * hệ số bậc chính xác / né (`stages`, như Pokémon), tối đa 100. Dùng chung cho đánh thật và AI. `user` bỏ trống = bỏ các mục fieldModifiers cần
 * đứng trên đất và trait; `target` bỏ trống = không tính né.
 */
export function skillAccuracy(
  data: GameData,
  field: BattleField,
  skill: Skill,
  {
    user,
    target,
    userCtx,
    targetCtx,
    stages
  }: {
    user?: Monster
    target?: Monster
    userCtx?: MonsterBattleContext
    targetCtx?: MonsterBattleContext
    /** Bậc trận (chính xác của quái dùng, né của mục tiêu); bỏ trống = không tính bậc. */
    stages?: Readonly<Record<string, BattleStages>>
  } = {}
): number {
  // Chiêu không kiểm tra chính xác (accuracy "—" của Pokémon: Swift, Aerial Ace...) bỏ qua cả
  // bậc né, hệ số môi trường và trait chính xác.
  if (skill.alwaysHits) return 100
  // Lock-On / Mind Reader (quái dùng), Telekinesis (mục tiêu): trúng chắc.
  if (user && hasTraitFlag(data, user, (h, p) => h.hitsSurely?.(p), userCtx)) return 100
  if (target && hasTraitFlag(data, target, (h, p) => h.surelyHit?.(p), targetCtx)) return 100
  // Hạ gục một đòn: accuracy theo chênh lệch level (Fissure, Sheer Cold), không theo bậc / môi trường.
  const ohko = user && target ? ohkoAccuracy(skill, user, target) : undefined
  if (ohko !== undefined) return ohko
  const modifiers = activeSkillFieldModifiers(data, field, skill, user)
  // Luôn trúng (kiểu Blizzard trong mưa đá) thì bỏ qua cả né đòn của mục tiêu, như Pokémon.
  if (modifiers.some((modifier) => modifier.hitsAlways)) return 100
  const fieldBase =
    modifiers.find((modifier) => modifier.accuracy !== undefined)?.accuracy ?? skill.accuracy
  // Thuần thục skill cộng vào accuracy gốc (kẹp 100) trước các hệ số (docs/rules/skill-mastery.md).
  const base = user ? masteredAccuracy(fieldBase, skillMasteryBonus(data, user, skill)) : fieldBase
  const resolved = skillInField(data, field, skill, user)
  const traitFactor = user ? traitAccuracyFactor(data, { user, target, userCtx, targetCtx }) : 1
  const stageFactor =
    user && target && stages
      ? accuracyStageFactor(data.config, {
          accuracy: stages[user.id]?.accuracy,
          // Sacred Sword / Chip Away bỏ qua bậc né của mục tiêu.
          evasion:
            skill.ignoresTargetStages ||
            hasTraitFlag(data, target, (h, p) => h.evasionIgnored?.(p), targetCtx)
              ? undefined
              : stages[target.id]?.evasion
        })
      : 1
  // Sticker Accuracy nhân tỉ lệ trúng như gốc (docs/rules/skill-stickers.md).
  const stickerFactor = user ? 1 + stickerSkillBonus(data, user, skill.id).accuracyPercent / 100 : 1
  return Math.min(
    100,
    base *
      fieldAccuracyMultiplier(data, field, resolved) *
      traitFactor *
      stageFactor *
      stickerFactor
  )
}

/**
 * Các môi trường quái đặt khi vào sân (setFieldOnEntry), kể cả hook theo phe của bối cảnh trận
 * (cộng hưởng, trận pháp, luật, ân huệ bí cảnh).
 */
function entryPlacements(data: GameData, d: Draft, monster: Monster): FieldPlacement[] {
  const placements: FieldPlacement[] = []
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      const placement = handler.fieldOnEntry?.(params)
      if (placement) placements.push(placement)
    },
    monsterBattleContext(data, d, monster)
  )
  return placements
}

/**
 * Trait vào sân của các quái vừa ra sân: tốc độ cao chạy trước (Trick Room: thấp trước), nên môi
 * trường của quái đặt sau thắng; hòa tốc độ thì tung RNG (chỉ khi có từ 2 quái mang trait như
 * vậy). Mỗi quái đặt môi trường (setFieldOnEntry) rồi đổi bậc (stageOnEntry, kiểu Intimidate).
 * Trước hết quái cầm đá tự kích hoạt (kiểu Primal) biến Mega.
 */
export function triggerEntryEffects(data: GameData, d: Draft, monsters: readonly Monster[]): void {
  autoTransformOnEntry(data, d, monsters)
  const entrants = monsters.flatMap((monster) => {
    const placements = entryPlacements(data, d, monster)
    const ctx = monsterBattleContext(data, d, monster)
    const changesStages = stageTraitEffects(data, monster, 'entry', ctx).length > 0
    return placements.length > 0 || changesStages ? [{ monster, placements }] : []
  })
  const ordered = entrants.map((entrant) => {
    let tiebreak = 0
    if (entrants.length > 1) [tiebreak, d.rng] = nextFloat(d.rng)
    return { ...entrant, speed: battleStats(data, d, entrant.monster).speed, tiebreak }
  })
  const bySpeed = compareSpeed(data, d.battle.field)
  ordered.sort((a, b) => bySpeed(a.speed, b.speed) || a.tiebreak - b.tiebreak)
  for (const { monster, placements } of ordered) {
    for (const placement of placements) {
      placeField(data, d, placement, { source: 'trait', monsterId: monster.id })
    }
    triggerStageTraits(data, d, monster, 'entry')
  }
  // Skill bị động (Camouflage, Spring-Load): sau trait vào sân, trước sự kiện "đầu trận".
  passivesOnEntry(data, d, monsters)
  // Sự kiện vào sân cho trait Siralim ("đầu trận"): mọi quái vừa vào, theo thứ tự truyền vào.
  for (const monster of monsters) emitTraitEvent(d, { type: 'entry', subjectId: monster.id })
}

/**
 * Đưa các quái ra sân giữa trận cùng lúc (thay quái gục: nhiều ô một lần): ra sân hết, bẫy của
 * phe lên từng quái theo thứ tự, rồi trait vào sân của các quái còn sống (tốc độ cao trước).
 */
export function enterFieldTogether(
  data: GameData,
  d: Draft,
  side: BattleSide,
  entrants: readonly { slot: number; monster: Monster }[]
): void {
  const firstTurn = entryFirstTurn(d)
  for (const { slot, monster } of entrants) {
    // Quái rời ô này (đổi quái, rút về; quái lớn vào đẩy mọi quái của phe): trait kiểu Natural
    // Cure chữa trạng thái.
    const displaced = displacedBy(data, slotsOf(d.battle, side), { slot, monster })
    for (const outgoing of displaced) {
      cureOnLeave(data, d, findMonster(d, outgoing))
      healOnLeave(data, d, findMonster(d, outgoing))
      emitTraitEvent(d, { type: 'leave', subjectId: outgoing })
    }
    // Z-Memento / Z-Parting Shot (docs/rules/z-moves.md): quái vào thay được hồi đầy máu.
    const healsEntrant = displaced.some((id) => d.battle.volatiles[id]?.healsReplacement)
    putOnField(data, d, { side, slot, monsterId: monster.id, firstTurn })
    if (healsEntrant && !isFainted(data, monster)) {
      monster.damageTaken = BIG_ZERO
      log(d, { type: 'replacementHealed', monsterId: monster.id })
    }
  }
  for (const { monster } of entrants) applyEntryHazards(data, d, monster)
  const alive = entrants.filter(({ monster }) => !isFainted(data, monster))
  triggerEntryEffects(
    data,
    d,
    alive.map(({ monster }) => monster)
  )
}

/** Đưa một quái ra sân giữa trận (đổi quái, rút về): bẫy của phe rồi trait vào sân. */
export function enterField(
  data: GameData,
  d: Draft,
  { side, slot, monster }: { side: BattleSide; slot: number; monster: Monster }
): void {
  enterFieldTogether(data, d, side, [{ slot, monster }])
}

/**
 * Tác động cuối lượt của môi trường lên một quái, theo thứ tự hook: sát thương (tối thiểu 1, như
 * trạng thái; gục thì dừng), hồi máu, tỉ lệ dính trạng thái (chỉ tung khi quái dính mới được).
 */
function applyFieldTurnEnd(
  data: GameData,
  d: Draft,
  { side, monster }: { side: BattleSide; monster: Monster }
): void {
  const factor = hazardDamageFactor(data, d, side)
  const field = effectiveField(data, d)
  const ctx = fieldMonsterContext(data, monster, field)
  const effects: {
    fieldId: string
    damage: number
    heal: number
    status: { statusId: string; chance: number } | null
  }[] = []
  forEachFieldHook(
    data,
    field,
    (handler, params, fieldId) => {
      effects.push({
        fieldId,
        damage: handler.turnEndDamagePercent?.(params, ctx) ?? 0,
        heal: handler.turnEndHealPercent?.(params, ctx) ?? 0,
        status: handler.turnEndStatusChance?.(params, ctx) ?? null
      })
    },
    side
  )
  for (const effect of effects) {
    if (effect.damage > 0 && !immuneToFieldDamageOf(data, monster, effect.fieldId)) {
      const amount = maxBig(1, percentOfMaxHp(getMaxHp(data, monster).times(factor), effect.damage))
      loseHp(
        data,
        d,
        monster,
        amount,
        (dealt) => ({
          type: 'fieldDamage',
          monsterId: monster.id,
          fieldId: effect.fieldId,
          amount: dealt
        }),
        { kind: 'indirect' }
      )
      if (isFainted(data, monster)) return
    }
    if (effect.heal > 0)
      heal(data, d, monster, percentOfMaxHp(getMaxHp(data, monster), effect.heal))
    if (effect.status) rollFieldStatus(data, d, monster, effect.status)
  }
}

/** Trait chỉ miễn sát thương của riêng môi trường `fieldId` (Sand Veil: bão cát). */
const immuneToFieldDamageOf = (data: GameData, monster: Monster, fieldId: string): boolean =>
  fieldIdsCountedAs(data, fieldId).some((id) =>
    hasTraitFlag(data, monster, (handler, params) => handler.immuneToFieldDamage?.(params, id))
  )

/** Tung tỉ lệ dính trạng thái của môi trường; quái không dính mới được thì không tung. */
function rollFieldStatus(
  data: GameData,
  d: Draft,
  monster: Monster,
  { statusId, chance }: { statusId: string; chance: number }
): void {
  if (!canInflictStatus(data, d, monster, statusId)) return
  let inflicted: boolean
  ;[inflicted, d.rng] = rollPercent(d.rng, chance)
  if (inflicted) inflictStatus(data, d, monster, statusId)
}

/** Giảm thời hạn môi trường toàn sân do skill / trait đặt; về 0 thì lớp đó về môi trường mặc định. */
function tickField(data: GameData, d: Draft): void {
  for (const layer of GLOBAL_FIELD_LAYERS) {
    const { id, turnsLeft } = d.battle.field[layer]
    if (turnsLeft === null) continue
    if (turnsLeft > 1) {
      d.battle.field[layer] = { id, turnsLeft: turnsLeft - 1 }
      continue
    }
    log(d, { type: 'fieldEnded', layer, fieldId: id })
    d.battle.field[layer] = { id: data.config.field.defaults[layer], turnsLeft: null }
    emitFieldChanged(data, d)
  }
}

/**
 * Cuối lượt (sau hook trait, trước trạng thái bất thường): sát thương / hồi máu của môi trường
 * (toàn sân và theo phe) cho mọi quái còn sống trên sân (boss hoang nhận ít sát thương hơn), rồi
 * giảm thời hạn môi trường toàn sân, room và hiệu ứng theo phe.
 */
export function fieldAtTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      applyFieldTurnEnd(data, d, { side, monster })
    }
  }
  tickField(data, d)
  tickRooms(d)
  tickSideFields(d)
}
