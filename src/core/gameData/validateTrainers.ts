// Kiểm tra dữ liệu ngự thú sư NPC (docs/rules/trainers.md): trainers.json, trainerClassIds của map,
// config.trainers.

import {
  TRAINER_AI_PROFILES,
  TRAINER_KINDS,
  allMaps,
  type GameData,
  type TrainerClass
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import {
  checkDrops,
  checkIntRange,
  checkItemRewards,
  checkKnownFields,
  checkStackItemId,
  fieldList
} from './checks'

const FIELDS = fieldList<TrainerClass>({
  id: true,
  kind: true,
  elementIds: true,
  teamSize: true,
  levelOffset: true,
  rewardMultiplier: true,
  tamerRealmOffset: true,
  tamerSkillIds: true,
  aiProfile: true,
  equipmentSlots: true,
  transforms: true,
  formationIds: true
})

/** Danh sách id phải là mảng chuỗi, mỗi id có trong `known`. */
function checkIdList(
  value: unknown,
  known: Record<string, unknown>,
  { where, label }: { where: string; label: string },
  issues: string[]
): void {
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  for (const id of value) {
    if (typeof id !== 'string' || !Object.hasOwn(known, id)) {
      issues.push(`${where}: ${label} không tồn tại "${String(id)}"`)
    }
  }
}

function checkTrainerClass(data: GameData, trainer: TrainerClass, issues: string[]): void {
  const where = `Ngự thú sư NPC "${trainer.id}"`
  checkKnownFields(trainer, FIELDS, where, 'ngự thú sư NPC', issues)
  if (!(TRAINER_KINDS as readonly unknown[]).includes(trainer.kind)) {
    issues.push(`${where}: kind phải là ${TRAINER_KINDS.join(' / ')}`)
  }
  checkIdList(
    trainer.elementIds,
    data.elements,
    { where: `${where}: elementIds`, label: 'hệ' },
    issues
  )
  checkIntRange(trainer.teamSize, `${where}: teamSize`, 1, issues)
  issues.push(...checkInteger(trainer.levelOffset, `${where}: levelOffset`))
  issues.push(...checkNumber(trainer.rewardMultiplier, `${where}: rewardMultiplier`, 0))
  issues.push(...checkInteger(trainer.tamerRealmOffset, `${where}: tamerRealmOffset`))
  checkIdList(
    trainer.tamerSkillIds,
    data.tamerSkills,
    { where: `${where}: tamerSkillIds`, label: 'kỹ năng ngự thú sư' },
    issues
  )
  if (!(TRAINER_AI_PROFILES as readonly unknown[]).includes(trainer.aiProfile)) {
    issues.push(`${where}: aiProfile phải là ${TRAINER_AI_PROFILES.join(' / ')}`)
  }
  issues.push(...checkInteger(trainer.equipmentSlots, `${where}: equipmentSlots`, 0))
  if (typeof trainer.transforms !== 'boolean') issues.push(`${where}: transforms phải là boolean`)
  checkIdList(
    trainer.formationIds,
    data.formations,
    { where: `${where}: formationIds`, label: 'trận pháp' },
    issues
  )
}

const isRegular = (data: GameData, id: unknown): boolean =>
  typeof id === 'string' && data.trainers[id]?.kind === 'regular'

function checkGymConfig(data: GameData, gym: unknown, issues: string[]): void {
  const at = (field: string): string => `config.trainers.gym.${field}`
  const config = asObject(gym)
  if (!config) {
    issues.push('config.trainers.gym phải là object')
    return
  }
  checkKnownFields(
    config,
    [
      'every',
      'trainerCount',
      'leaderClassId',
      'repeatRewardPercent',
      'firstClearItemIds',
      'keyItemFloors'
    ],
    'config.trainers.gym',
    'config',
    issues
  )
  issues.push(...checkInteger(config.every, at('every'), 1))
  checkIntRange(config.trainerCount, at('trainerCount'), 0, issues)
  const leader =
    typeof config.leaderClassId === 'string' ? data.trainers[config.leaderClassId] : undefined
  if (leader?.kind !== 'gymLeader') {
    issues.push(`${at('leaderClassId')}: phải là ngự thú sư NPC kind gymLeader`)
  }
  issues.push(...checkNumber(config.repeatRewardPercent, at('repeatRewardPercent'), 0))
  if (!Array.isArray(config.firstClearItemIds))
    issues.push(`${at('firstClearItemIds')} phải là danh sách`)
  else {
    for (const itemId of config.firstClearItemIds) {
      issues.push(
        ...checkStackItemId(data, String(itemId), at('firstClearItemIds'), 'vật phẩm thưởng')
      )
    }
  }
  const floors = asObject(config.keyItemFloors)
  if (!floors) {
    issues.push(`${at('keyItemFloors')} phải là object id vật phẩm → tầng`)
    return
  }
  for (const [itemId, floor] of Object.entries(floors)) {
    if (data.items[itemId]?.category !== 'keyItem') {
      issues.push(`${at('keyItemFloors')}: "${itemId}" không phải vật phẩm chìa khóa`)
    }
    issues.push(...checkInteger(floor, `${at('keyItemFloors')}.${itemId}`, 1))
    const every = config.every
    if (
      typeof floor === 'number' &&
      typeof every === 'number' &&
      every > 0 &&
      floor % every !== 0
    ) {
      issues.push(
        `${at('keyItemFloors')}.${itemId}: tầng ${floor} không có đạo quán (mỗi ${every} tầng)`
      )
    }
  }
}

function checkTournamentConfig(data: GameData, value: unknown, issues: string[]): void {
  const at = (field: string): string => `config.trainers.tournament.${field}`
  const config = asObject(value)
  if (!config) {
    issues.push('config.trainers.tournament phải là object')
    return
  }
  checkKnownFields(
    config,
    ['everyDays', 'rounds', 'championRewards'],
    'config.trainers.tournament',
    'config',
    issues
  )
  issues.push(...checkInteger(config.everyDays, at('everyDays'), 1))
  if (!Array.isArray(config.rounds) || config.rounds.length === 0) {
    issues.push(`${at('rounds')}: cần ít nhất một vòng`)
  } else {
    config.rounds.forEach((round: unknown, i: number) => {
      const entry = asObject(round)
      checkKnownFields(
        entry ?? {},
        ['levelOffset', 'rewardMultiplier'],
        `${at('rounds')}[${i}]`,
        'vòng',
        issues
      )
      issues.push(...checkInteger(entry?.levelOffset, `${at('rounds')}[${i}].levelOffset`))
      issues.push(
        ...checkNumber(entry?.rewardMultiplier, `${at('rounds')}[${i}].rewardMultiplier`, 0)
      )
    })
  }
  checkItemRewards(data, config.championRewards, at('championRewards'), issues)
}

function checkArenaConfig(data: GameData, value: unknown, issues: string[]): void {
  const at = (field: string): string => `config.trainers.arena.${field}`
  const config = asObject(value)
  if (!config) {
    issues.push('config.trainers.arena phải là object')
    return
  }
  checkKnownFields(
    config,
    ['levelPerRank', 'milestoneEvery', 'milestoneRewards'],
    'config.trainers.arena',
    'config',
    issues
  )
  issues.push(...checkNumber(config.levelPerRank, at('levelPerRank'), 0))
  issues.push(...checkInteger(config.milestoneEvery, at('milestoneEvery'), 1))
  checkItemRewards(data, config.milestoneRewards, at('milestoneRewards'), issues)
}

/** Kiểm tra lớp NPC, trainerClassIds của map và config.trainers. */
export function checkTrainerData(data: GameData, issues: string[]): void {
  const classes = Object.values(data.trainers)
  for (const trainer of classes) checkTrainerClass(data, trainer, issues)
  if (!classes.some((trainer) => trainer.kind === 'regular')) {
    issues.push('trainers: cần ít nhất một ngự thú sư NPC kind regular (giải đấu, đấu trường)')
  }
  for (const biome of allMaps(data)) {
    if (biome.trainerClassIds === undefined) continue
    const where = `Biome "${biome.id}": trainerClassIds`
    if (!Array.isArray(biome.trainerClassIds) || biome.trainerClassIds.length === 0) {
      issues.push(`${where} phải là danh sách không rỗng (bỏ trống = theo hệ của map)`)
      continue
    }
    for (const id of biome.trainerClassIds) {
      if (!isRegular(data, id)) issues.push(`${where}: "${String(id)}" không phải NPC kind regular`)
    }
  }
  const config = asObject(data.config.trainers)
  if (!config) {
    issues.push('config.trainers phải là object')
    return
  }
  checkKnownFields(
    config,
    ['encounterChance', 'rewardDrops', 'ai', 'gym', 'tournament', 'arena'],
    'config.trainers',
    'config',
    issues
  )
  issues.push(...checkNumber(config.encounterChance, 'config.trainers.encounterChance', 0, 100))
  if (!Array.isArray(config.rewardDrops))
    issues.push('config.trainers.rewardDrops phải là danh sách')
  else checkDrops(data, config.rewardDrops, 'config.trainers.rewardDrops', issues)
  const ai = asObject(config.ai)
  checkKnownFields(
    ai ?? {},
    ['switchRatio', 'switchMinScore'],
    'config.trainers.ai',
    'config',
    issues
  )
  issues.push(...checkNumber(ai?.switchRatio, 'config.trainers.ai.switchRatio', 0))
  issues.push(...checkNumber(ai?.switchMinScore, 'config.trainers.ai.switchMinScore', 0))
  checkGymConfig(data, config.gym, issues)
  checkTournamentConfig(data, config.tournament, issues)
  checkArenaConfig(data, config.arena, issues)
}
