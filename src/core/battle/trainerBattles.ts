// Trận với ngự thú sư NPC (docs/rules/trainers.md): gặp trên tầng, đạo quán, giải đấu, đấu trường
// xếp hạng. Mỗi action kiểm tra điều kiện trước khi đụng state rồi sinh đội NPC và mở trận.

import { ActionError, pick, rollPercent, type RngState } from '../shared'
import { isFainted } from '../monster'
import {
  assertNoTournament,
  assertNoInstance,
  floorSite,
  generateTrainerTeam,
  gymTrainerClasses,
  rollBiomeTrainerClass,
  rollRegularTrainerClass,
  type FloorSite
} from '../world'
import {
  dayOf,
  type GameData,
  type BattleTrial,
  type GameState,
  type Gym,
  type SpecialBattle,
  type TrainerClass,
  type TrainerMode
} from '../model'
import { openBattle } from './openBattle'

/** Không trong trận, còn quái đánh được (điều kiện chung để bắt đầu mọi trận). */
export function assertReadyForBattle(data: GameData, state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (!state.party.some((m) => !isFainted(data, m))) throw new ActionError('noHealthyMonster')
}

export interface TrainerBattleSpec {
  site: FloorSite
  trainerClass: TrainerClass
  mode: TrainerMode
  /** Hệ của đạo quán (đội lấy loài theo hệ này). */
  elementId?: string
  extraLevels?: number
  rewardMultiplier?: number
  /** Trận ở thị trấn (giải đấu, đấu trường): môi trường mặc định. */
  inTown?: boolean
  /**
   * RNG riêng để sinh đội (tầng tháp tất định theo số tầng, docs/rules/trials.md); bỏ trống = RNG
   * của save. Trận vẫn chạy bằng RNG của save.
   */
  teamRng?: RngState
  /** Trận trong bí cảnh / tháp. */
  trial?: BattleTrial
  /** Trận do event mở (docs/rules/events.md). */
  special?: SpecialBattle
  /** Đồng môn đang đấu / tên NPC đối thủ (tông môn, docs/rules/sects.md). */
  memberId?: string
  npcNameId?: string
}

/**
 * Sinh đội NPC (cảnh giới = cảnh giới người chơi + tamerRealmOffset, tối thiểu 0) và mở trận. RNG
 * lấy từ `state.rng` (trừ khi có `teamRng`).
 */
export function openTrainerBattle(
  data: GameData,
  state: GameState,
  spec: TrainerBattleSpec
): GameState {
  const { site, trainerClass, mode, elementId } = spec
  const realm = Math.max(0, state.tamer.realm + trainerClass.tamerRealmOffset)
  const team = generateTrainerTeam(data, spec.teamRng ?? state.rng, {
    site,
    trainerClass,
    ...(elementId === undefined ? {} : { elementIds: [elementId] }),
    extraLevels: spec.extraLevels ?? 0,
    realm,
    nextMonsterId: state.nextMonsterId,
    nextItemId: state.nextItemId
  })
  return openBattle(
    data,
    { ...state, nextItemId: team.nextItemId },
    {
      site,
      encounter: {
        enemies: team.enemies,
        isBoss: false,
        rng: spec.teamRng ? state.rng : team.rng,
        nextMonsterId: team.nextMonsterId
      },
      ...(spec.trial ? { trial: spec.trial } : {}),
      ...(spec.special ? { special: spec.special } : {}),
      trainer: {
        trainer: {
          classId: trainerClass.id,
          mode,
          elementId: elementId ?? null,
          rewardMultiplier: spec.rewardMultiplier ?? 1,
          ...(spec.memberId === undefined ? {} : { memberId: spec.memberId }),
          ...(spec.npcNameId === undefined ? {} : { npcNameId: spec.npcNameId })
        },
        realm,
        tamerSkillIds: trainerClass.tamerSkillIds,
        formationId: team.formationId,
        naturalField: !spec.inTown
      }
    }
  )
}

/**
 * Gặp ngự thú sư trên tầng (startWildBattle): tung encounterChance %, rồi lớp NPC của map. null =
 * không gặp (tỉ lệ 0 hoặc map không có lớp nào thì không tốn RNG cho bước đó).
 */
export function rollFloorTrainer(
  data: GameData,
  rng: RngState,
  site: FloorSite
): [TrainerClass | null, RngState] {
  let met: boolean
  ;[met, rng] = rollPercent(rng, data.config.trainers.encounterChance)
  if (!met) return [null, rng]
  return rollBiomeTrainerClass(data, rng, site.biome)
}

/** Đạo quán của tầng đang đứng. */
function currentGym(state: GameState): Gym {
  if (state.location.type !== 'floor') throw new ActionError('notOnFloor')
  const { floor } = state.location
  const gym = state.trainers.gyms.find((entry) => entry.floor === floor)
  if (!gym) throw new ActionError('noGym', { floor })
  return gym
}

/**
 * Thách đấu đạo quán của tầng đang đứng: NPC kế tiếp (lớp theo hệ đạo quán), đủ số NPC thì quán
 * chủ. Đạo quán đã có huy hiệu: tiền thưởng × repeatRewardPercent %.
 */
export function challengeGym(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  const gym = currentGym(state)
  const config = data.config.trainers.gym
  const rewardMultiplier = gym.wins > 0 ? config.repeatRewardPercent / 100 : 1
  const site = floorSite(data, state, gym.floor)
  const base = { site, elementId: gym.elementId, rewardMultiplier }
  if (gym.progress >= gym.trainerCount) {
    const trainerClass = data.trainers[config.leaderClassId]
    return openTrainerBattle(data, state, { ...base, trainerClass, mode: 'gymLeader' })
  }
  const [trainerClass, rng] = pick(state.rng, gymTrainerClasses(data, gym.elementId))
  return openTrainerBattle(data, { ...state, rng }, { ...base, trainerClass, mode: 'gym' })
}

/** Kỳ giải đấu của một ngày. */
const tournamentPeriod = (data: GameData, day: number): number =>
  Math.floor(day / data.config.trainers.tournament.everyDays)

/** Ở thị trấn và không đang đi bí cảnh (trận ở thị trấn: giải đấu, đấu trường, tháp). */
export function requireTown(state: GameState): void {
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  assertNoInstance(state)
}

/** Đăng ký giải đấu ở thị trấn: mỗi kỳ (everyDays ngày) một lần. */
export function enterTournament(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  requireTown(state)
  assertNoTournament(state)
  const period = tournamentPeriod(data, dayOf(state.time))
  if (period <= state.trainers.tournament.lastPeriod) {
    const nextDay =
      (state.trainers.tournament.lastPeriod + 1) * data.config.trainers.tournament.everyDays
    throw new ActionError('tournamentNotOpen', { nextDay })
  }
  return {
    ...state,
    trainers: { ...state.trainers, tournament: { lastPeriod: period, round: 0 } }
  }
}

/** Bỏ giải đấu đang tham gia (không thưởng thêm). */
export function forfeitTournament(state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.trainers.tournament.round === null) throw new ActionError('noTournament')
  return {
    ...state,
    trainers: { ...state.trainers, tournament: { ...state.trainers.tournament, round: null } }
  }
}

/** Đánh vòng kế tiếp của giải đấu: NPC lớp thường ngẫu nhiên theo tầng cao nhất + level của vòng. */
export function challengeTournament(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  requireTown(state)
  const round = state.trainers.tournament.round
  if (round === null) throw new ActionError('noTournament')
  const spec = data.config.trainers.tournament.rounds[round]
  const [trainerClass, rng] = rollRegularTrainerClass(data, state.rng)
  return openTrainerBattle(
    data,
    { ...state, rng },
    {
      site: floorSite(data, state, state.highestFloor),
      trainerClass,
      mode: 'tournament',
      extraLevels: spec.levelOffset,
      rewardMultiplier: spec.rewardMultiplier,
      inTown: true
    }
  )
}

/** Đấu trường xếp hạng ở thị trấn: đối thủ theo tầng cao nhất + ⌊bậc × levelPerRank⌋ level. */
export function challengeArena(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  requireTown(state)
  assertNoTournament(state)
  const [trainerClass, rng] = rollRegularTrainerClass(data, state.rng)
  const { levelPerRank } = data.config.trainers.arena
  return openTrainerBattle(
    data,
    { ...state, rng },
    {
      site: floorSite(data, state, state.highestFloor),
      trainerClass,
      mode: 'arena',
      extraLevels: Math.floor(state.trainers.arenaRank * levelPerRank),
      inTown: true
    }
  )
}
