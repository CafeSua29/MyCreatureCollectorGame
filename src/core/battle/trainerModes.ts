// Việc sau trận ngự thú sư NPC theo chế độ (docs/rules/trainers.md): tiến độ đạo quán, huy hiệu, vòng
// giải đấu, bậc đấu trường, phần thưởng cố định. Thêm chế độ mới = thêm một mục vào TRAINER_MODE_RULES.

import { addItems, grantKeyItems } from '../inventory'
import { pick, rollPercent } from '../shared'
import { addBonusTalentPoints, addSectContribution, bumpStat } from '../registries'
import type { BattleState, GameData, Gym, TrainerMode } from '../model'
import { Draft, log } from './draft'
import { grantItemRewards } from './rewards'

interface TrainerModeRule {
  /**
   * Trận diễn ra trong map của tầng / bí cảnh (ân sủng, chúc phúc của thần cai quản map;
   * docs/rules/deities.md): giải đấu, đấu trường ở thị trấn thì không.
   */
  inMap: boolean
  /** Thắng trận (sau phần thưởng chung, trước khi kết thúc trận). */
  onWin(data: GameData, d: Draft): void
  /** Thua trận. */
  onLoss(data: GameData, d: Draft): void
}

/** Đạo quán của tầng đang đánh (trận đạo quán luôn có). */
function gymOf(d: Draft): Gym {
  const gym = d.trainers.gyms.find((entry) => entry.floor === d.battle.floor)
  if (!gym) throw new Error(`Tầng ${d.battle.floor} không có đạo quán`)
  return gym
}

/** Ghi lại đạo quán đã đổi (state draft giữ bản mới). */
function updateGym(d: Draft, gym: Gym): void {
  d.trainers = {
    ...d.trainers,
    gyms: d.trainers.gyms.map((entry) => (entry.floor === gym.floor ? gym : entry))
  }
}

/** Lần đầu thắng quán chủ: vật phẩm chìa khóa của tầng đó, một món thưởng lần đầu (đều nhau). */
function firstGymClear(data: GameData, d: Draft, floor: number): void {
  log(d, { type: 'gymCleared', floor, first: true })
  const cleared = d.trainers.gyms.filter((gym) => gym.wins > 0).map((gym) => gym.floor)
  const granted = grantKeyItems(data, d.inventory, cleared)
  d.inventory = granted.inventory
  for (const event of granted.events) log(d, event)
  const { firstClearItemIds } = data.config.trainers.gym
  if (firstClearItemIds.length === 0) return
  let itemId: string
  ;[itemId, d.rng] = pick(d.rng, firstClearItemIds)
  grantItemRewards(d, [{ itemId, count: 1 }])
}

const resetGymProgress = (_data: GameData, d: Draft): void => {
  updateGym(d, { ...gymOf(d), progress: 0 })
}

const noop = (): void => {}

/** + cống hiến tông môn trong trận, kèm log. */
function gainContribution(d: Draft, amount: number): void {
  if (amount <= 0) return
  d.sect = addSectContribution(d.sect, amount)
  log(d, { type: 'sectContributionGained', amount })
}

/** + điểm thiên phú ngự thú sư thưởng trong trận, kèm log. */
function gainTalentPoints(d: Draft, amount: number): void {
  if (amount <= 0) return
  d.tamer = addBonusTalentPoints(d.tamer, amount)
  log(d, { type: 'tamerTalentPointsGained', amount })
}

/** Rời tông chiến (vô địch, bị loại). */
function endSectWar(d: Draft): void {
  d.sect = { ...d.sect, war: { ...d.sect.war, round: null, rivalSectId: null } }
}

export const TRAINER_MODE_RULES: Record<TrainerMode, TrainerModeRule> = {
  floor: { inMap: true, onWin: noop, onLoss: noop },
  // Trận NPC trong bí cảnh / tháp: việc sau trận theo bí cảnh / tháp (trialOutcome.ts).
  trial: { inMap: true, onWin: noop, onLoss: noop },
  // Trận NPC do event mở (Kẻ lạ thách đấu): việc sau trận theo kết quả event (docs/rules/events.md).
  event: { inMap: true, onWin: noop, onLoss: noop },
  gym: {
    inMap: true,
    onWin(_data, d) {
      const gym = gymOf(d)
      const progress = gym.progress + 1
      updateGym(d, { ...gym, progress })
      log(d, { type: 'gymProgress', floor: gym.floor, progress, total: gym.trainerCount })
    },
    onLoss: resetGymProgress
  },
  gymLeader: {
    inMap: true,
    onWin(data, d) {
      const gym = gymOf(d)
      updateGym(d, { ...gym, progress: 0, wins: gym.wins + 1 })
      if (gym.wins === 0) firstGymClear(data, d, gym.floor)
      else log(d, { type: 'gymCleared', floor: gym.floor, first: false })
    },
    onLoss: resetGymProgress
  },
  tournament: {
    inMap: false,
    onWin(data, d) {
      const round = d.trainers.tournament.round ?? 0
      log(d, { type: 'tournamentRoundWon', round })
      const { rounds, championRewards } = data.config.trainers.tournament
      const champion = round + 1 >= rounds.length
      d.trainers = {
        ...d.trainers,
        tournament: { ...d.trainers.tournament, round: champion ? null : round + 1 }
      }
      if (!champion) return
      log(d, { type: 'tournamentWon' })
      d.stats = bumpStat(d.stats, 'tournamentsWon')
      grantItemRewards(d, championRewards)
    },
    onLoss(_data, d) {
      log(d, { type: 'tournamentEliminated', round: d.trainers.tournament.round ?? 0 })
      d.trainers = { ...d.trainers, tournament: { ...d.trainers.tournament, round: null } }
    }
  },
  arena: {
    inMap: false,
    onWin(data, d) {
      const rank = d.trainers.arenaRank + 1
      d.trainers = { ...d.trainers, arenaRank: rank }
      log(d, { type: 'arenaRankUp', rank })
      const { milestoneEvery, milestoneRewards } = data.config.trainers.arena
      if (rank % milestoneEvery === 0) grantItemRewards(d, milestoneRewards)
    },
    onLoss: noop
  },
  // Tông môn (docs/rules/sects.md): trận ở Diễn võ trường trong thị trấn.
  sectDuel: {
    inMap: false,
    onWin(data, d) {
      const member = d.sect.members.find((m) => m.id === d.battle.trainer?.memberId)
      gainContribution(d, data.config.sects.duel.contribution * ((member?.rank ?? 0) + 1))
    },
    onLoss: noop
  },
  sectPromotion: {
    inMap: false,
    onWin(data, d) {
      const rank = d.sect.rank + 1
      d.sect = { ...d.sect, rank }
      log(d, { type: 'sectPromoted', rank })
      gainTalentPoints(d, data.config.sects.promotion.talentPoints)
    },
    onLoss: noop
  },
  sectWar: {
    inMap: false,
    onWin(data, d) {
      const round = d.sect.war.round ?? 0
      const { rounds, championContribution, championTalentPoints, championRewards } =
        data.config.sects.war
      log(d, { type: 'sectWarRoundWon', round })
      gainContribution(d, rounds[round]?.contribution ?? 0)
      if (round + 1 < rounds.length) {
        d.sect = { ...d.sect, war: { ...d.sect.war, round: round + 1 } }
        return
      }
      endSectWar(d)
      log(d, { type: 'sectWarWon' })
      gainContribution(d, championContribution)
      gainTalentPoints(d, championTalentPoints)
      grantItemRewards(d, championRewards)
    },
    onLoss(_data, d) {
      log(d, { type: 'sectWarEliminated', round: d.sect.war.round ?? 0 })
      endSectWar(d)
    }
  }
}

/** Hệ số tiền thưởng của trận NPC: của lớp × của chế độ; trận khác 1. */
export function trainerMoneyMultiplier(data: GameData, battle: BattleState): number {
  const trainer = battle.trainer
  if (!trainer) return 1
  return data.trainers[trainer.classId].rewardMultiplier * trainer.rewardMultiplier
}

/**
 * Đồ thưởng chung của trận NPC thắng (thay cho đồ rơi của từng quái): mỗi món tung một lần, nhân hệ
 * số rơi (trait kiểu Pickup, kỹ năng đồng hành).
 */
export function dropTrainerRewards(data: GameData, d: Draft, dropMultiplier: number): void {
  for (const drop of data.config.trainers.rewardDrops) {
    let dropped: boolean
    ;[dropped, d.rng] = rollPercent(d.rng, Math.min(100, drop.chance * dropMultiplier))
    if (!dropped) continue
    d.inventory = addItems(d.inventory, drop.itemId, 1)
    log(d, { type: 'drop', itemId: drop.itemId })
  }
}
