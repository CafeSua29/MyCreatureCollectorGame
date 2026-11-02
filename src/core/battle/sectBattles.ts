// Trận của tông môn (docs/rules/sects.md): luận võ với đồng môn, thi thăng chức (đấu giám khảo), tông
// chiến (chuỗi vòng với NPC tông đối địch). Trận ở thị trấn (Diễn võ trường của tông), đội NPC theo
// tầng cao nhất + level của chế độ. Việc sau trận ở TRAINER_MODE_RULES (trainerModes.ts).

import { ActionError, pick } from '../shared'
import { currentSect } from '../progression'
import { sectRankThreshold } from '../registries'
import { assertNoTournament, floorSite } from '../world'
import { dayOf, type GameData, type GameState, type SectMember } from '../model'
import { assertReadyForBattle, openTrainerBattle, requireTown } from './trainerBattles'

/** Đồng môn chức vị cao nhất (không tính tông chủ nếu còn đệ tử): giám khảo thi thăng chức. */
export function promotionExaminer(state: Pick<GameState, 'sect'>): SectMember | null {
  const { members } = state.sect
  const disciples = members.filter((m) => !m.isMaster)
  const pool = disciples.length > 0 ? disciples : members
  return pool.reduce<SectMember | null>(
    (best, member) => (best === null || member.rank > best.rank ? member : best),
    null
  )
}

/** Điều kiện chung của trận tông ở thị trấn: sẵn sàng đánh, ở thị trấn, đang ở tông. */
function requireSectBattle(data: GameData, state: GameState): void {
  assertReadyForBattle(data, state)
  requireTown(state)
  currentSect(data, state)
}

/**
 * Luận võ với đồng môn `memberId`: tối đa duel.perDay trận mỗi ngày (tính lúc vào trận), đối thủ lớp
 * NPC của đồng môn, level theo tầng cao nhất + levelPerRank × chức vị đồng môn.
 */
export function challengeSectMember(data: GameData, state: GameState, memberId: string): GameState {
  requireSectBattle(data, state)
  assertNoTournament(state)
  const member = state.sect.members.find((m) => m.id === memberId)
  if (!member) throw new ActionError('sectMemberNotFound', { memberId: String(memberId) })
  const { perDay, levelPerRank } = data.config.sects.duel
  const day = dayOf(state.time)
  const count = state.sect.duels.day === day ? state.sect.duels.count : 0
  if (count >= perDay) throw new ActionError('sectDuelLimit', { perDay })
  const counted = { ...state, sect: { ...state.sect, duels: { day, count: count + 1 } } }
  return openTrainerBattle(data, counted, {
    site: floorSite(data, state, state.highestFloor),
    trainerClass: data.trainers[member.classId],
    mode: 'sectDuel',
    extraLevels: Math.floor(levelPerRank * member.rank),
    inTown: true,
    memberId: member.id
  })
}

/**
 * Thi thăng chức: cống hiến tổng đủ ngưỡng chức vị kế tiếp thì đấu giám khảo (promotionExaminer),
 * level theo tầng cao nhất + levelOffset + levelPerRank × chức vị mới.
 */
export function challengePromotion(data: GameData, state: GameState): GameState {
  requireSectBattle(data, state)
  assertNoTournament(state)
  const nextRank = state.sect.rank + 1
  const need = sectRankThreshold(data, nextRank)
  const have = state.sect.totalContribution
  if (have < need) throw new ActionError('promotionNotReady', { need, have })
  const examiner = promotionExaminer(state)
  if (!examiner) throw new ActionError('notInSect')
  const { levelOffset, levelPerRank } = data.config.sects.promotion
  return openTrainerBattle(data, state, {
    site: floorSite(data, state, state.highestFloor),
    trainerClass: data.trainers[examiner.classId],
    mode: 'sectPromotion',
    extraLevels: Math.floor(levelOffset + levelPerRank * nextRank),
    inTown: true,
    memberId: examiner.id
  })
}

/** Kỳ tông chiến của một ngày. */
export const sectWarPeriod = (data: GameData, day: number): number =>
  Math.floor(day / data.config.sects.war.everyDays)

/** Đăng ký tông chiến (mỗi kỳ everyDays ngày một lần): tung tông đối địch của kỳ trong rivalSectIds. */
export function enterSectWar(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  requireTown(state)
  assertNoTournament(state)
  const sect = currentSect(data, state)
  const period = sectWarPeriod(data, dayOf(state.time))
  const { lastPeriod } = state.sect.war
  if (period <= lastPeriod) {
    throw new ActionError('sectWarNotOpen', {
      nextDay: (lastPeriod + 1) * data.config.sects.war.everyDays
    })
  }
  const [rivalSectId, rng] = pick(state.rng, sect.rivalSectIds)
  return {
    ...state,
    rng,
    sect: { ...state.sect, war: { lastPeriod: period, round: 0, rivalSectId } }
  }
}

/** Đánh vòng kế tiếp của tông chiến: NPC lớp của tông đối địch, tên ngẫu nhiên, level của vòng. */
export function challengeSectWar(data: GameData, state: GameState): GameState {
  requireSectBattle(data, state)
  const { round, rivalSectId } = state.sect.war
  if (round === null || rivalSectId === null) throw new ActionError('noSectWar')
  const spec = data.config.sects.war.rounds[round]
  const [classId, afterClass] = pick(state.rng, data.sects[rivalSectId].trainerClassIds)
  const [npcNameId, rng] = pick(afterClass, Object.keys(data.npcNames))
  return openTrainerBattle(
    data,
    { ...state, rng },
    {
      site: floorSite(data, state, state.highestFloor),
      trainerClass: data.trainers[classId],
      mode: 'sectWar',
      extraLevels: spec.levelOffset,
      rewardMultiplier: spec.rewardMultiplier,
      inTown: true,
      npcNameId
    }
  )
}

/** Bỏ tông chiến đang dự (giữ cống hiến các vòng đã thắng). */
export function forfeitSectWar(state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.sect.war.round === null) throw new ActionError('noSectWar')
  return {
    ...state,
    sect: { ...state.sect, war: { ...state.sect.war, round: null, rivalSectId: null } }
  }
}
