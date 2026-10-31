// Đánh một trận tới khi kết thúc chỉ bằng action thật của gameReducer: AI chung cho cả hai phe
// (phe người chơi: suggestBattleCommands + suggestTamerCommand → submitTurn), thay quái gục bằng
// suggestReplacements,
// rời trận bằng leaveBattle. Không ném bóng, không dùng vật phẩm, không chạy trốn (trừ khi nơi gọi
// truyền lệnh bắt quái / Thị Uy / quyết định thu phục). Event khám phá
// gặp thay cho trận được giải quyết (events.ts) rồi gặp lại tới khi ra trận.

import {
  isFainted,
  isLargeMonster,
  BIG_ZERO,
  itemBasePrice,
  suggestBattleCommands,
  suggestReplacements,
  suggestTamerCommand,
  type BattleCommand,
  type BattleOutcome,
  type BattleSide,
  type BattleState,
  type Decimal,
  type GameAction,
  type GameData,
  type GameState,
  type GlobalFieldLayer,
  type Monster,
  type Skill,
  type TamerCommand
} from '@core'
import { settleEvents, simAct } from './events'

export type BattleKind = 'wild' | 'boss'

/** Số lần gặp event liên tiếp tối đa trước khi coi là lỗi (giả định của mô phỏng). */
const MAX_EVENT_RETRIES = 50

/** Kết quả trận; "timeout" = chạm trần số lượt (không tính thắng hay thua). */
export type SimOutcome = BattleOutcome | 'timeout'

/** Số lần dùng skill theo nhóm (skillGroup) của từng phe. */
export type SkillUsage = Record<BattleSide, Record<string, number>>

export interface BattleStats {
  outcome: SimOutcome
  turns: number
  /** Tiền thưởng khi thắng (0 nếu không thắng). */
  money: Decimal
  /** EXP mỗi quái tham chiến nhận (mọi quái nhận như nhau, 0 nếu không thắng). */
  exp: Decimal
  skillUses: SkillUsage
  /** bossMultiplier lớn nhất trong các quái địch (1 = không có boss). */
  bossMultiplier: number
  /** Môi trường tự nhiên của biome tung lúc vào trận, theo lớp (thời tiết, địa hình). */
  naturalField: Partial<Record<GlobalFieldLayer, string>>
  /** Tổng giá gốc của đồ rơi trong trận (để so đồ rơi giữa các map). */
  dropValue: Decimal
  /** Số sách kỹ năng rơi trong trận (skill-books.md). */
  booksDropped: number
  /** Lớp ngự thú sư NPC của trận (trainers.md); null = quái hoang / boss. */
  trainerClassId: string | null
  /** Số quái bắt được / số lần ném bóng trong trận (chỉ khi có `capture`, growth.ts). */
  captures: number
  ballsThrown: number
  /** Số quái cuồng bạo trong trận theo phe (docs/rules/frenzy.md). */
  frenzies: Record<BattleSide, number>
  /** Trận có quái địch lớn (docs/rules/monster-size.md). */
  largeEnemy: boolean
  /** Phe người chơi đã song thú hợp thể trong trận (docs/rules/battle-merge.md). */
  playerMerged: boolean
  /** Phe người chơi đã dùng Z-Move trong trận (docs/rules/z-moves.md). */
  playerZMove: boolean
  /**
   * Thu phục (docs/rules/recruit.md): lần quái xin theo / quái thu phục được (Thị Uy + nhận lời
   * xin theo), lần Thị Uy / Thị Uy thành công.
   */
  recruitOffers: number
  recruits: number
  intimidates: number
  intimidateWins: number
  /** Vị trí ra đòn / tầm chiêu trong trận (docs/rules/hit-locations.md). */
  hitLocations: HitLocationCounts
  /**
   * Quái ta đã ra sân mà gục lúc trận kết thúc: số quái sẽ chết hẳn nếu bật chết thật
   * (docs/rules/options.md; mô phỏng chạy với chết thật tắt).
   */
  playerFallen: number
}

/**
 * Số lần trong trận (docs/rules/hit-locations.md): đòn nhắm bộ phận / trúng điểm yếu của phe người
 * chơi, skill cận chiến không với tới theo phe, bộ phận của quái địch bị phá.
 */
export interface HitLocationCounts {
  aimed: number
  weak: number
  outOfReach: Record<BattleSide, number>
  broken: number
  /** Số lần quái của mỗi phe mất thế. */
  offBalance: Record<BattleSide, number>
  /** Bộ phận người chơi khám phá lần đầu (ghi Dex). */
  revealed: number
}

export const emptyHitLocationCounts = (): HitLocationCounts => ({
  aimed: 0,
  weak: 0,
  outOfReach: { player: 0, enemy: 0 },
  broken: 0,
  offBalance: { player: 0, enemy: 0 },
  revealed: 0
})

/** Cộng số đếm vị trí ra đòn của một trận vào target. */
export function addHitLocationCounts(target: HitLocationCounts, add: HitLocationCounts): void {
  target.aimed += add.aimed
  target.weak += add.weak
  target.outOfReach.player += add.outOfReach.player
  target.outOfReach.enemy += add.outOfReach.enemy
  target.broken += add.broken
  target.offBalance.player += add.offBalance.player
  target.offBalance.enemy += add.offBalance.enemy
  target.revealed += add.revealed
}

export interface BattleRun {
  /**
   * State sau trận (đã rời trận). Trận "timeout" bị bỏ như chưa đánh: state trước trận, chỉ giữ
   * RNG đã dùng để lần sau không lặp lại đúng trận đó.
   */
  state: GameState
  stats: BattleStats
}

export const emptySkillUsage = (): SkillUsage => ({ player: {}, enemy: {} })

/** Tổng số trận / lượt / trận hết lượt của một loại trận (để in tóm tắt lần chạy). */
export interface BattleTotals {
  battles: number
  turns: number
  timeouts: number
}

export type BattleTotalsByKind = Record<BattleKind, BattleTotals>

export const emptyBattleTotals = (): BattleTotalsByKind => ({
  wild: { battles: 0, turns: 0, timeouts: 0 },
  boss: { battles: 0, turns: 0, timeouts: 0 }
})

/** Cộng một trận vào tổng của loại trận đó. */
export function addBattleTotals(
  totals: BattleTotalsByKind,
  kind: BattleKind,
  stats: Pick<BattleStats, 'outcome' | 'turns'>
): void {
  totals[kind].battles++
  totals[kind].turns += stats.turns
  if (stats.outcome === 'timeout') totals[kind].timeouts++
}

/** Cộng tổng của nhiều trận (cùng loại) vào tổng của loại trận đó. */
export function mergeBattleTotals(
  totals: BattleTotalsByKind,
  kind: BattleKind,
  source: BattleTotals
): void {
  totals[kind].battles += source.battles
  totals[kind].turns += source.turns
  totals[kind].timeouts += source.timeouts
}

/**
 * Nhóm skill để thống kê: "damage" (power > 0) hoặc "status", nối thêm loại hiệu ứng, ví dụ
 * "damage+drain", "status+statStage", và "spell" nếu có phần spell Siralim. Tự ra nhóm mới khi
 * thêm hiệu ứng mới.
 */
export function skillGroup(skill: Skill): string {
  const effectTypes = [...new Set(skill.effects.map((effect) => effect.type))].sort()
  return [
    skill.power > 0 ? 'damage' : 'status',
    ...effectTypes,
    ...(skill.spell ? ['spell'] : [])
  ].join('+')
}

/**
 * Đánh một trận từ state ngoài trận đang đứng ở một tầng. `start`: action mở trận khác (độ kiếp ở
 * thị trấn); bỏ trống = theo `kind`.
 */
export function runBattle(
  data: GameData,
  before: GameState,
  options: {
    kind: BattleKind
    maxTurns: number
    start?: GameAction
    /** Lệnh ném bóng thay lệnh AI của một ô ở lượt này (bắt quái, growth.ts); null = không ném. */
    capture?: (state: GameState) => BattleCommand | null
    /** Lệnh ngự thú sư thay gợi ý của AI ở lượt này (Thị Uy, growth.ts); null = theo AI. */
    tamer?: (state: GameState) => TamerCommand | null
    /** Trận thắng có quái xin theo: action nhận / từ chối (growth.ts); null = rời trận (từ chối). */
    recruit?: (state: GameState) => GameAction | null
  }
): BattleRun {
  const run = (state: GameState, action: GameAction): GameState => simAct(data, state, action)
  const start: GameAction = options.start ?? {
    type: options.kind === 'wild' ? 'startWildBattle' : 'challengeBoss'
  }
  let state = run(before, start)
  for (let i = 0; i < MAX_EVENT_RETRIES && !state.battle; i++) {
    state = run(backToFloor(data, settleEvents(data, state), before), start)
  }
  let turns = 0
  for (;;) {
    const battle = currentBattle(state)
    if (battle.phase === 'ended') break
    if (battle.phase === 'chooseReplacement') {
      state = run(state, { type: 'replaceFainted', replacements: suggestReplacements(data, state) })
      continue
    }
    if (turns >= options.maxTurns) {
      // Hết lượt: về state trước trận, giữ RNG và bộ phận đã khám phá (Dex) trong trận.
      return {
        state: { ...before, rng: state.rng, dex: { ...before.dex, hitParts: state.dex.hitParts } },
        stats: timeoutStats(data, battle, turns, state.party)
      }
    }
    // Kỹ năng ngự thú sư theo AI gợi ý (null = không dùng lượt này), trừ khi "người chơi" tự ra lệnh.
    const tamer = options.tamer?.(state) ?? suggestTamerCommand(data, state) ?? undefined
    const suggested = suggestBattleCommands(data, state)
    // Hợp kích kỹ cần lệnh của cả hai ô: lượt đó không ném bóng.
    const throwBall = suggested.some((command) => command.kind === 'combo')
      ? null
      : (options.capture?.(state) ?? null)
    const commands = suggested.map((command) =>
      throwBall && command.slot === throwBall.slot ? throwBall : command
    )
    state = run(state, { type: 'submitTurn', commands, tamer })
    turns++
  }
  const decision = options.recruit?.(state) ?? null
  const decided = decision ? run(state, decision) : state
  const battle = currentBattle(decided)
  return {
    state: run(decided, { type: 'leaveBattle' }),
    stats: collectStats(data, battle, turns, decided.party)
  }
}

/**
 * Trận event thua đưa về thị trấn: hồi máu rồi quay lại tầng trước trận để gặp lại (như người chơi
 * thật). Vẫn ở tầng thì giữ nguyên.
 */
function backToFloor(data: GameData, state: GameState, before: GameState): GameState {
  if (before.location.type !== 'floor' || state.location.type === 'floor') return state
  const hurt = state.party.some((m) => m.damageTaken.gt(0) || m.statuses.length > 0)
  const healed = hurt ? simAct(data, state, { type: 'healParty' }) : state
  return simAct(data, healed, { type: 'travel', to: before.location })
}

function currentBattle(state: GameState): BattleState {
  if (!state.battle) throw new Error('Mô phỏng: trận đã mất trước khi kết thúc')
  return state.battle
}

function timeoutStats(
  data: GameData,
  battle: BattleState,
  turns: number,
  party: readonly Monster[]
): BattleStats {
  return {
    ...collectStats(data, battle, turns, party),
    // Trận hết lượt bị bỏ như chưa đánh.
    playerFallen: 0,
    outcome: 'timeout',
    money: BIG_ZERO,
    exp: BIG_ZERO,
    dropValue: BIG_ZERO,
    booksDropped: 0,
    recruitOffers: 0,
    recruits: 0
  }
}

function collectStats(
  data: GameData,
  battle: BattleState,
  turns: number,
  party: readonly Monster[]
): BattleStats {
  const enemyIds = new Set(battle.enemies.map((m) => m.id))
  const skillUses = emptySkillUsage()
  let money = BIG_ZERO
  let dropValue = BIG_ZERO
  let booksDropped = 0
  const frenzies: Record<BattleSide, number> = { player: 0, enemy: 0 }
  const recruit = { recruitOffers: 0, recruits: 0, intimidates: 0, intimidateWins: 0 }
  let exp: Decimal | null = null
  const naturalField: BattleStats['naturalField'] = {}
  const hitLocations = emptyHitLocationCounts()
  for (const event of battle.log) {
    if (event.type === 'fieldChanged' && event.source === 'biome') {
      naturalField[event.layer] = event.fieldId
    } else if (event.type === 'useSkill') {
      const side: BattleSide = enemyIds.has(event.monsterId) ? 'enemy' : 'player'
      // Thế mạnh / thế nhanh tách nhóm riêng (move-styles.md): "damage+statStage@strong".
      const group = skillGroup(data.skills[event.skillId]) + (event.style ? `@${event.style}` : '')
      skillUses[side][group] = (skillUses[side][group] ?? 0) + 1
    } else if (event.type === 'tamerSkill') {
      // Kỹ năng ngự thú sư đếm chung bảng nhóm skill, nhóm "tamer:<id>".
      const group = `tamer:${event.skillId}`
      skillUses[event.side][group] = (skillUses[event.side][group] ?? 0) + 1
    } else if (event.type === 'drop') {
      // Giá theo tầng của trận (coi như tầng cao nhất đã mở là tầng đang đánh).
      const ref = { storage: 'stack', itemId: event.itemId } as const
      dropValue = dropValue.plus(itemBasePrice(data, ref, battle.floor))
    } else if (event.type === 'skillBookDropped') {
      booksDropped++
    } else if (event.type === 'recruitOffered') {
      recruit.recruitOffers++
    } else if (event.type === 'recruited') {
      recruit.recruits++
    } else if (event.type === 'intimidate') {
      recruit.intimidates++
      if (event.success) recruit.intimidateWins++
    } else if (event.type === 'frenzy') {
      frenzies[enemyIds.has(event.monsterId) ? 'enemy' : 'player']++
    } else if (event.type === 'aimedHit') {
      if (!enemyIds.has(event.monsterId)) hitLocations.aimed++
      if (!enemyIds.has(event.monsterId) && event.weakPoint) hitLocations.weak++
    } else if (event.type === 'outOfReach') {
      hitLocations.outOfReach[enemyIds.has(event.monsterId) ? 'enemy' : 'player']++
    } else if (event.type === 'partBroken') {
      if (enemyIds.has(event.monsterId)) hitLocations.broken++
    } else if (event.type === 'offBalance') {
      hitLocations.offBalance[enemyIds.has(event.monsterId) ? 'enemy' : 'player']++
    } else if (event.type === 'partRevealed') {
      hitLocations.revealed++
    } else if (event.type === 'won') {
      money = event.money
    } else if (event.type === 'expGain') {
      exp ??= event.amount
    }
  }
  // Ép kiểu: trận đã kết thúc (phase "ended") luôn có outcome.
  const outcome = battle.outcome as BattleOutcome
  // Quái bắt được rời danh sách địch: tính cả quái đã bắt (bắt hết thì danh sách địch rỗng).
  const bossMultiplier = Math.max(
    1,
    ...[...battle.enemies, ...battle.captured].map((m) => m.bossMultiplier)
  )
  return {
    outcome,
    turns,
    money,
    exp: exp ?? BIG_ZERO,
    skillUses,
    bossMultiplier,
    naturalField,
    dropValue,
    booksDropped,
    trainerClassId: battle.trainer?.classId ?? null,
    // Quái bắt bằng bóng (quái Thị Uy cũng nằm trong battle.captured nhưng đếm ở recruits).
    captures: battle.log.filter((event) => event.type === 'caught').length,
    ballsThrown: battle.log.filter((event) => event.type === 'throwBall').length,
    frenzies,
    largeEnemy: [...battle.enemies, ...battle.captured].some((m) => isLargeMonster(data, m)),
    playerFallen: party.filter((m) => battle.participants.includes(m.id) && isFainted(data, m))
      .length,
    playerMerged: battle.log.some((event) => event.type === 'merged' && event.side === 'player'),
    playerZMove: battle.log.some(
      (event) => event.type === 'zMoveUsed' && !enemyIds.has(event.monsterId)
    ),
    ...recruit,
    hitLocations
  }
}

/** Cộng dồn số lần dùng skill của nhiều trận vào target. */
export function addSkillUsage(target: SkillUsage, source: SkillUsage): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const [group, count] of Object.entries(source[side])) {
      target[side][group] = (target[side][group] ?? 0) + count
    }
  }
}
