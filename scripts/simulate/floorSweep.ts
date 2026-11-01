// Quét theo tầng: mỗi đội mẫu × mỗi tầng đánh N trận quái hoang và M trận boss tầng, trận nào
// cũng bắt đầu đầy máu với cùng một đội (dựng một lần cho mỗi tầng). Map của tầng: tung ngẫu
// nhiên mỗi trận như game thật (rollFloorBiome), hoặc cố định một map (quét theo map). Có thể
// dừng sớm khi tỉ lệ thắng đã đủ chắc (earlyStop.ts).

import {
  bloodlineGroupsOf,
  BIG_ZERO,
  calendarAt,
  createGameState,
  createRng,
  equipmentSlotCount,
  getItemCount,
  grantKeyItems,
  pickZCrystalFor,
  rollFloorBiome,
  rollInstabilityLevels,
  type GameState,
  type BattleSide,
  type Decimal,
  type GameData,
  type Monster,
  type Pole,
  type Tactic
} from '@core'
import {
  addHitLocationCounts,
  addSkillUsage,
  emptyHitLocationCounts,
  emptySkillUsage,
  runBattle,
  type BattleKind,
  type HitLocationCounts,
  type SkillUsage
} from './battleRunner'
import { shouldStopEarly } from './earlyStop'
import type { EarlyStopSpec, TeamSpec } from './scenarios'
import { assumedTamerRealm } from './tamer'
import { withAssumedAffinity } from './affinity'
import { withAssumedEffort } from './effort'
import { teamMastery, withAssumedMastery, type AssumedMasterySpec } from './mastery'
import { buildTeam, deriveSeed } from './team'
import { weakestGearSlot } from './economy'
import type { TeamSnapshot } from './progression'

export interface FloorResult {
  variantId: string
  teamId: string
  floor: number
  /** Map cố định (quét theo map); null = mỗi trận tung map như game thật. */
  biomeId: string | null
  kind: BattleKind
  /** Số trận định đánh. */
  battles: number
  /** Số trận thực đánh (ít hơn battles khi dừng sớm). */
  played: number
  won: number
  lost: number
  timeout: number
  /** Tổng số lượt mọi trận đã đánh. */
  totalTurns: number
  /** Trung bình trên mọi trận đã đánh (kể cả thua). */
  avgMoney: Decimal
  avgExp: Decimal
  /** Giá gốc trung bình của đồ rơi mỗi trận. */
  avgDropValue: Decimal
  skillUses: SkillUsage
  /** Trận boss tầng theo bossMultiplier (khóa = hệ số); trận quái hoang để trống. */
  byBossMultiplier: Record<string, { played: number; won: number }>
  /**
   * Theo hoàn cảnh tự nhiên (khóa "lớp:id"): môi trường tự nhiên của biome ("weather:rain"), thời
   * khắc ("dayPhase:night") và mùa ("season:winter") lúc vào trận; mỗi trận được đếm một lần ở mỗi
   * lớp.
   */
  byNaturalField: Record<string, { played: number; won: number }>
  /** Trận gặp ngự thú sư NPC thay quái hoang (trainers.md), theo lớp NPC. */
  byTrainer: Record<string, { played: number; won: number }>
  /** Tổng số quái cuồng bạo mọi trận theo phe (docs/rules/frenzy.md). */
  frenzies: Record<BattleSide, number>
  /** Số trận có quái địch lớn (docs/rules/monster-size.md). */
  largeEnemyBattles: number
  /** Số trận phe người chơi song thú hợp thể (docs/rules/battle-merge.md). */
  mergedBattles: number
  /** Số trận phe người chơi dùng Z-Move (docs/rules/z-moves.md). */
  zMoveBattles: number
  /** Tổng số đếm vị trí ra đòn / tầm chiêu mọi trận (docs/rules/hit-locations.md). */
  hitLocations: HitLocationCounts
}

/**
 * Giả định người chơi có Vòng Z thì quái đầu đội cầm Z-Crystal hợp skill của nó (pickZCrystalFor);
 * hết ô thì thay món trang bị kém nhất (docs/rules/z-moves.md, simulation-features.md).
 */
export function withLeadZCrystal(data: GameData, state: GameState): GameState {
  if (getItemCount(state.inventory, data.config.transform.zMove.keyItemId) === 0) return state
  const [lead, ...rest] = state.party
  const crystal = lead && pickZCrystalFor(data, lead)
  if (!lead || !crystal) return state
  const slot =
    lead.equipment.length >= equipmentSlotCount(data, state) ? weakestGearSlot(lead) : null
  const kept = slot === null ? lead.equipment : lead.equipment.filter((_, i) => i !== slot)
  const equipment = [...kept, { storage: 'stack' as const, itemId: crystal.id }]
  return { ...state, party: [{ ...lead, equipment }, ...rest] }
}

export interface FloorSweepOptions {
  variantId: string
  team: TeamSpec
  floor: number
  /** Map cố định; null = mỗi trận tung map như game thật. */
  biomeId: string | null
  kind: BattleKind
  battles: number
  maxTurns: number
  seed: number
  /** null = đánh đủ battles trận. */
  earlyStop: EarlyStopSpec | null
  /** Thuần thục giả định theo tầng (mastery.ts); null = mọi skill cấp 1. */
  assumedMastery: AssumedMasterySpec | null
  /** Đội thật của chơi liên tục (bỏ qua team.members và mọi giả định); bỏ trống = dựng đội mẫu. */
  snapshot?: TeamSnapshot
  /** Chiến thuật của đội mẫu (biến thể theo chiến thuật; docs/rules/auto-battle.md). */
  tactic?: Tactic
  /** Đội chưa khế ước (biến thể `uncontracted`); không ghi = đã khế ước như createGameState. */
  uncontracted?: boolean
  /** Cảnh giới ngự thú sư của biến thể; null / không ghi = giả định theo tầng. */
  tamerRealm?: number | null
  /** Độ thuần giả định của đội mẫu (biến thể `assumedPurity`); null / không ghi = như tung. */
  assumedPurity?: number | null
  /** Cực giả định của đội mẫu (biến thể `assumedPolarity`); null / không ghi = như tung. */
  assumedPolarity?: Pole | null
  /** Mức độ bất ổn của biến thể (`instabilityLevel`); 0 / không ghi = tắt. */
  instabilityLevel?: number
}

/**
 * Độ bất ổn mức `level` cho một trận quét tầng (docs/rules/instability.md): thuộc tính tung bằng
 * RNG riêng theo seed của trận (không đổi RNG của trận), đều đã lộ; bỏ qua mức tối đa theo tầng.
 */
export function sweepInstability(
  data: GameData,
  { level, seed }: { level: number; seed: number }
): GameState['instability'] {
  const [instability] = rollInstabilityLevels(data, createRng(seed), {
    kept: [],
    fromLevel: 0,
    toLevel: level
  })
  const properties = instability.properties.map((property) => ({ ...property, hidden: false }))
  return { level, properties }
}

/** Mỗi quái mang huyết mạch chính là nhóm đầu của loài với độ thuần `purity` (bloodline.md). */
export function withAssumedPurity(data: GameData, party: Monster[], purity: number): Monster[] {
  return party.map((monster) => {
    const [groupId] = bloodlineGroupsOf(data, monster.baseSpeciesId)
    return groupId === undefined ? monster : { ...monster, bloodlines: [{ groupId, purity }] }
  })
}

/**
 * Túi như người chơi đã mở tới tầng cao nhất và thắng mọi đạo quán đã qua: có vật phẩm chìa khóa
 * (biến hình, docs/rules/trainers.md).
 */
export function inventoryWithKeyItems(
  data: GameData,
  state: Pick<GameState, 'highestFloor' | 'inventory'>
): GameState['inventory'] {
  const { every } = data.config.trainers.gym
  const gymFloors = Array.from(
    { length: Math.floor(state.highestFloor / every) },
    (_, i) => (i + 1) * every
  )
  return grantKeyItems(data, state.inventory, gymFloors).inventory
}

/** Mỗi quái mang cực `pole` với trait cực tính đầu pool của cực (polarity.md). */
export function withAssumedPolarity(data: GameData, party: Monster[], pole: Pole): Monster[] {
  const polarity = { pole, traitId: data.config.polarity.traitIds[pole][0] }
  return party.map((monster) => ({ ...monster, polarity }))
}

/** Đội của lần quét: snapshot của chơi liên tục, hoặc đội mẫu dựng theo tầng kèm các giả định. */
function sweepParty(data: GameData, options: FloorSweepOptions): Monster[] {
  const { team, floor, seed, snapshot } = options
  if (snapshot) return [...snapshot.party]
  const rolled = buildTeam(data, team, floor, deriveSeed(seed, 'team', team.id, floor))
  const blooded =
    options.assumedPurity == null ? rolled : withAssumedPurity(data, rolled, options.assumedPurity)
  const built =
    options.assumedPolarity == null
      ? blooded
      : withAssumedPolarity(data, blooded, options.assumedPolarity)
  return withAssumedGrowth(data, built, { team, floor, mastery: options.assumedMastery })
}

/**
 * Thân mật, điểm nỗ lực và thuần thục giả định theo tầng (mục "Thân mật", "Điểm nỗ lực", "Thuần thục
 * skill" ở simulation-features.md) cho đội mẫu vừa dựng.
 */
export function withAssumedGrowth(
  data: GameData,
  party: Monster[],
  { team, floor, mastery }: { team: TeamSpec; floor: number; mastery: AssumedMasterySpec | null }
): Monster[] {
  return withAssumedMastery(
    data,
    withAssumedEffort(data, withAssumedAffinity(data, party, floor), floor),
    floor,
    teamMastery(team, mastery)
  )
}

/**
 * Map của các tầng 1..floor cho một trận: map cố định, hoặc tung bằng rollFloorBiome với seed của
 * trận. Các tầng thấp hơn dùng cùng map (trận chỉ đánh ở tầng `floor`).
 */
export function floorMapsFor(
  data: GameData,
  { floor, biomeId, seed }: { floor: number; biomeId: string | null; seed: number }
): string[] {
  const id = biomeId ?? rollFloorBiome(data, createRng(seed))[0]
  return Array.from({ length: floor }, () => id)
}

/**
 * Giờ game của trận thứ i khi quét (docs/rules/calendar.md): mỗi trận lùi thêm 13 giờ (nguyên tố
 * cùng nhau với 24) để các trận trải đều mọi giờ trong ngày và mọi ngày trong năm, như người chơi
 * đánh ở mọi lúc; trận đầu ở giờ bắt đầu game.
 */
const sweepTime = (data: GameData, battleIndex: number): number =>
  data.config.clock.startHour + battleIndex * SWEEP_HOURS_STEP

const SWEEP_HOURS_STEP = 13

/** Đánh `battles` trận cùng loại ở một tầng với một đội mẫu, gom kết quả. */
export function sweepFloor(data: GameData, options: FloorSweepOptions): FloorResult {
  const { team, floor, kind, seed } = options
  // Seed của đội không phụ thuộc biến thể: các biến thể so trên cùng một đội.
  const party = sweepParty(data, options).map((m) => ({ ...m, tactic: options.tactic ?? m.tactic }))
  const result: FloorResult = {
    variantId: options.variantId,
    teamId: team.id,
    floor,
    biomeId: options.biomeId,
    kind,
    battles: options.battles,
    played: 0,
    won: 0,
    lost: 0,
    timeout: 0,
    totalTurns: 0,
    avgMoney: BIG_ZERO,
    avgExp: BIG_ZERO,
    avgDropValue: BIG_ZERO,
    skillUses: emptySkillUsage(),
    byBossMultiplier: {},
    byNaturalField: {},
    byTrainer: {},
    frenzies: { player: 0, enemy: 0 },
    largeEnemyBattles: 0,
    mergedBattles: 0,
    zMoveBattles: 0,
    hitLocations: emptyHitLocationCounts()
  }
  let totalMoney = BIG_ZERO
  let totalExp = BIG_ZERO
  let totalDropValue = BIG_ZERO
  // Bộ phận đã khám phá (Dex) mang qua các trận của lượt quét, như người chơi đánh liên tục ở tầng
  // (hit-locations.md mục "Khám phá điểm yếu").
  let hitParts: GameState['dex']['hitParts'] = {}
  for (let i = 0; i < options.battles; i++) {
    if (shouldStopEarly(result.won, result.played, options.earlyStop)) break
    const fresh = createGameState({
      // Mô phỏng đo với thọ nguyên bật (game mới mặc định tắt, docs/rules/options.md).
      lifespanEnabled: true,
      seed: deriveSeed(seed, 'battle', team.id, floor, kind, i),
      party,
      location: { type: 'floor', floor },
      floorBiomeIds: floorMapsFor(data, {
        floor,
        biomeId: options.biomeId,
        seed: deriveSeed(seed, 'map', team.id, floor, kind, i)
      }),
      // Ngự thú sư ở cảnh giới thật (snapshot) hoặc giả định của tầng (cộng hưởng, linh lực, kỹ năng).
      tamerRealm: options.snapshot?.tamerRealm ?? options.tamerRealm ?? assumedTamerRealm(floor)
    })
    const keyed = {
      ...fresh,
      dex: { ...fresh.dex, hitParts },
      instability: sweepInstability(data, {
        level: options.instabilityLevel ?? 0,
        seed: deriveSeed(seed, 'instability', team.id, floor, kind, i)
      }),
      time: sweepTime(data, i),
      party: options.uncontracted
        ? fresh.party.map((m) => ({ ...m, contractRealm: null }))
        : fresh.party,
      inventory: inventoryWithKeyItems(data, fresh)
    }
    // Có Vòng Z thì quái đầu đội cầm Z-Crystal hợp skill của nó (như người chơi; z-moves.md).
    const state = withLeadZCrystal(data, keyed)
    const { state: after, stats } = runBattle(data, state, { kind, maxTurns: options.maxTurns })
    hitParts = after.dex.hitParts
    if (stats.outcome === 'won') result.won++
    else if (stats.outcome === 'lost') result.lost++
    else if (stats.outcome === 'timeout') result.timeout++
    result.played++
    result.totalTurns += stats.turns
    totalMoney = totalMoney.plus(stats.money)
    totalExp = totalExp.plus(stats.exp)
    totalDropValue = totalDropValue.plus(stats.dropValue)
    addSkillUsage(result.skillUses, stats.skillUses)
    result.frenzies.player += stats.frenzies.player
    result.frenzies.enemy += stats.frenzies.enemy
    if (stats.largeEnemy) result.largeEnemyBattles++
    if (stats.playerMerged) result.mergedBattles++
    if (stats.playerZMove) result.zMoveBattles++
    addHitLocationCounts(result.hitLocations, stats.hitLocations)
    const { dayPhase, season } = calendarAt(data, keyed.time)
    const circumstances = { ...stats.naturalField, dayPhase, season }
    for (const [layer, fieldId] of Object.entries(circumstances)) {
      const bucket = (result.byNaturalField[`${layer}:${fieldId}`] ??= { played: 0, won: 0 })
      bucket.played++
      if (stats.outcome === 'won') bucket.won++
    }
    if (stats.trainerClassId !== null) {
      const bucket = (result.byTrainer[stats.trainerClassId] ??= { played: 0, won: 0 })
      bucket.played++
      if (stats.outcome === 'won') bucket.won++
    }
    if (kind === 'boss') {
      const bucket = (result.byBossMultiplier[stats.bossMultiplier] ??= { played: 0, won: 0 })
      bucket.played++
      if (stats.outcome === 'won') bucket.won++
    }
  }
  if (result.played > 0) {
    result.avgMoney = totalMoney.div(result.played)
    result.avgExp = totalExp.div(result.played)
    result.avgDropValue = totalDropValue.div(result.played)
  }
  return result
}
