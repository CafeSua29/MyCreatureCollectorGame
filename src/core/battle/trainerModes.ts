// Việc sau trận ngự thú sư NPC theo chế độ (docs/rules/trainers.md): tiến độ đạo quán, huy hiệu, vòng
// giải đấu, bậc đấu trường, phần thưởng cố định. Thêm chế độ mới = thêm một mục vào TRAINER_MODE_RULES.

import { addItems, grantKeyItems } from '../inventory'
import { pick, rollPercent } from '../shared'
import type { BattleState, GameData, Gym, TrainerMode } from '../model'
import { Draft, log } from './draft'
import { grantItemRewards } from './rewards'

interface TrainerModeRule {
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

export const TRAINER_MODE_RULES: Record<TrainerMode, TrainerModeRule> = {
  floor: { onWin: noop, onLoss: noop },
  // Trận NPC trong bí cảnh / tháp: việc sau trận theo bí cảnh / tháp (trialOutcome.ts).
  trial: { onWin: noop, onLoss: noop },
  // Trận NPC do event mở (Kẻ lạ thách đấu): việc sau trận theo kết quả event (docs/rules/events.md).
  event: { onWin: noop, onLoss: noop },
  gym: {
    onWin(_data, d) {
      const gym = gymOf(d)
      const progress = gym.progress + 1
      updateGym(d, { ...gym, progress })
      log(d, { type: 'gymProgress', floor: gym.floor, progress, total: gym.trainerCount })
    },
    onLoss: resetGymProgress
  },
  gymLeader: {
    onWin(data, d) {
      const gym = gymOf(d)
      updateGym(d, { ...gym, progress: 0, wins: gym.wins + 1 })
      if (gym.wins === 0) firstGymClear(data, d, gym.floor)
      else log(d, { type: 'gymCleared', floor: gym.floor, first: false })
    },
    onLoss: resetGymProgress
  },
  tournament: {
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
      grantItemRewards(d, championRewards)
    },
    onLoss(_data, d) {
      log(d, { type: 'tournamentEliminated', round: d.trainers.tournament.round ?? 0 })
      d.trainers = { ...d.trainers, tournament: { ...d.trainers.tournament, round: null } }
    }
  },
  arena: {
    onWin(data, d) {
      const rank = d.trainers.arenaRank + 1
      d.trainers = { ...d.trainers, arenaRank: rank }
      log(d, { type: 'arenaRankUp', rank })
      const { milestoneEvery, milestoneRewards } = data.config.trainers.arena
      if (rank % milestoneEvery === 0) grantItemRewards(d, milestoneRewards)
    },
    onLoss: noop
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
