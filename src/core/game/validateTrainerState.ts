// Kiểm tra phần ngự thú sư NPC trong save (docs/rules/trainers.md): GameState.trainers (đạo quán,
// đấu trường, giải đấu) và BattleState.trainer. Gọi từ validateGameState.

import { TRAINER_MODES, type GameData } from '../model'
import { checkSectBattle } from './validateSectState'
import { asObject, checkInteger, checkNumber } from '../shared'
import { battleHasNoTamers } from './validateTrialState'

/** Một đạo quán: tầng đạo quán đã mở, hệ tồn tại, tiến độ trong [0, trainerCount]. */
function checkGym(data: GameData, value: unknown, path: string, issues: string[]): void {
  const gym = asObject(value)
  if (!gym) {
    issues.push(`${path} phải là đạo quán { floor, elementId, trainerCount, progress, wins }`)
    return
  }
  issues.push(...checkInteger(gym.floor, `${path}.floor`, 1))
  if (typeof gym.elementId !== 'string' || !Object.hasOwn(data.elements, gym.elementId)) {
    issues.push(`${path}.elementId: hệ không tồn tại "${String(gym.elementId)}"`)
  }
  issues.push(...checkInteger(gym.trainerCount, `${path}.trainerCount`, 0))
  issues.push(...checkInteger(gym.progress, `${path}.progress`, 0))
  issues.push(...checkInteger(gym.wins, `${path}.wins`, 0))
  if (typeof gym.progress === 'number' && typeof gym.trainerCount === 'number') {
    if (gym.progress > gym.trainerCount) issues.push(`${path}.progress phải ≤ trainerCount`)
  }
}

/**
 * trainers: đạo quán ở tầng đạo quán (bội của gym.every) đã mở, mỗi tầng tối đa một (mở tầng thì
 * luôn tạo; save / test dựng tay có thể thiếu); bậc đấu trường nguyên ≥ 0; giải đấu: kỳ đã dự ≥ −1, vòng null hoặc trong số vòng của config
 * (đang dự giải thì phải ở thị trấn).
 */
export function validateTrainerState(
  data: GameData,
  value: unknown,
  { highestFloor, inTown }: { highestFloor: unknown; inTown: boolean }
): string[] {
  const trainers = asObject(value)
  if (!trainers) return ['trainers phải là object { gyms, arenaRank, tournament }']
  const issues: string[] = [...checkInteger(trainers.arenaRank, 'trainers.arenaRank', 0)]
  const gyms = trainers.gyms
  if (!Array.isArray(gyms)) issues.push('trainers.gyms phải là danh sách')
  else {
    gyms.forEach((gym, i) => checkGym(data, gym, `trainers.gyms[${i}]`, issues))
    const { every } = data.config.trainers.gym
    const highest = typeof highestFloor === 'number' ? highestFloor : 0
    const floors = gyms.map((gym) => asObject(gym)?.floor)
    for (const floor of floors) {
      if (typeof floor === 'number' && (floor % every !== 0 || floor > highest)) {
        issues.push(`trainers.gyms: tầng ${floor} không phải tầng đạo quán đã mở`)
      }
    }
    if (new Set(floors).size !== floors.length) issues.push('trainers.gyms: tầng bị lặp')
  }
  const tournament = asObject(trainers.tournament)
  if (!tournament) {
    issues.push('trainers.tournament phải là object { lastPeriod, round }')
    return issues
  }
  issues.push(...checkInteger(tournament.lastPeriod, 'trainers.tournament.lastPeriod', -1))
  if (tournament.round !== null) {
    const rounds = data.config.trainers.tournament.rounds.length
    issues.push(...checkInteger(tournament.round, 'trainers.tournament.round', 0))
    if (typeof tournament.round === 'number' && tournament.round >= rounds) {
      issues.push(`trainers.tournament.round phải < ${rounds}`)
    }
    if (!inTown) issues.push('trainers.tournament: đang dự giải thì phải ở thị trấn')
  }
  return issues
}

/**
 * battle.trainer: null hoặc { classId, mode, elementId, rewardMultiplier }. Trận NPC không phải trận
 * boss / độ kiếp, phe địch có ngự thú sư; đạo quán phải có ở tầng đang đánh; trận giải đấu chưa kết
 * thúc thì đang dự giải. Trận khác: phe địch không có ngự thú sư.
 */
export function checkBattleTrainer(
  data: GameData,
  battle: Record<string, unknown>,
  state: Record<string, unknown>,
  issues: string[]
): void {
  const enemyTamer = asObject(battle.tamers)?.enemy ?? null
  if (battle.trainer === null) {
    if (enemyTamer !== null) issues.push('battle.tamers.enemy: chỉ trận ngự thú sư NPC có')
    return
  }
  const trainer = asObject(battle.trainer)
  if (!trainer) {
    issues.push('battle.trainer phải là null hoặc { classId, mode, elementId, rewardMultiplier }')
    return
  }
  if (typeof trainer.classId !== 'string' || !Object.hasOwn(data.trainers, trainer.classId)) {
    issues.push(`battle.trainer.classId: ngự thú sư NPC không tồn tại "${String(trainer.classId)}"`)
  }
  if (!(TRAINER_MODES as readonly unknown[]).includes(trainer.mode)) {
    issues.push(`battle.trainer.mode phải là ${TRAINER_MODES.join(' / ')}`)
  }
  if (
    trainer.elementId !== null &&
    (typeof trainer.elementId !== 'string' || !Object.hasOwn(data.elements, trainer.elementId))
  ) {
    issues.push(`battle.trainer.elementId: hệ không tồn tại "${String(trainer.elementId)}"`)
  }
  issues.push(...checkNumber(trainer.rewardMultiplier, 'battle.trainer.rewardMultiplier', 0))
  if (battle.isBoss !== false)
    issues.push('battle.trainer: trận ngự thú sư NPC không phải trận boss')
  if (battle.tribulation !== null) issues.push('battle.trainer: không đồng thời là trận độ kiếp')
  // Luật noTamerSkills của bí cảnh / tháp: không phe nào có ngự thú sư (docs/rules/trials.md).
  if (enemyTamer === null && !battleHasNoTamers(data, battle)) {
    issues.push('battle.trainer: phe NPC phải có ngự thú sư')
  }
  const trainers = asObject(state.trainers)
  if (trainer.mode === 'gym' || trainer.mode === 'gymLeader') {
    const gyms = Array.isArray(trainers?.gyms) ? trainers.gyms : []
    if (!gyms.some((gym) => asObject(gym)?.floor === battle.floor)) {
      issues.push(`battle.trainer: tầng ${String(battle.floor)} không có đạo quán`)
    }
  }
  const round = asObject(trainers?.tournament)?.round
  if (trainer.mode === 'tournament' && battle.phase !== 'ended' && round === null) {
    issues.push('battle.trainer: trận giải đấu nhưng không đang dự giải')
  }
  checkSectBattle(data, { trainer, battle, state }, issues)
}
