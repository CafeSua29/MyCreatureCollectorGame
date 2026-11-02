// Kiểm tra dữ liệu tông môn (docs/rules/sects.md): config.sects, sects.json, sectRanks.json,
// npcNames.json.

import { isBookableSkill } from '../inventory'
import type { GameData, SectDef } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkItemRewards, checkKnownFields, checkStackItemId } from './checks'
import { checkTamerBonusEffects } from './validateTamerTalents'

const CONFIG_FIELDS = [
  'rejoinCooldownDays',
  'rankBase',
  'rankPower',
  'memberCount',
  'memberRankWeights',
  'memberDailyContribution',
  'masterRankLead',
  'missions',
  'duel',
  'promotion',
  'war'
]
const SECT_FIELDS = ['id', 'minRealm', 'rankBonuses', 'trainerClassIds', 'shop', 'rivalSectIds']

/** Mọi trường `fields` của `obj` là số nguyên ≥ min; trường ngoài `fields` và `extra` là trường lạ. */
function checkIntegers(
  obj: Record<string, unknown> | null,
  {
    at,
    fields,
    extra = [],
    min = 0
  }: { at: string; fields: readonly string[]; extra?: readonly string[]; min?: number },
  issues: string[]
): void {
  if (!obj) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(obj, [...fields, ...extra], at, 'config', issues)
  for (const field of fields) issues.push(...checkInteger(obj[field], `${at}.${field}`, min))
}

function checkWar(data: GameData, value: unknown, issues: string[]): void {
  const at = 'config.sects.war'
  const war = asObject(value)
  if (!war) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(
    war,
    ['everyDays', 'rounds', 'championContribution', 'championTalentPoints', 'championRewards'],
    at,
    'config',
    issues
  )
  issues.push(...checkInteger(war.everyDays, `${at}.everyDays`, 1))
  issues.push(...checkInteger(war.championContribution, `${at}.championContribution`, 0))
  issues.push(...checkInteger(war.championTalentPoints, `${at}.championTalentPoints`, 0))
  checkItemRewards(data, war.championRewards, `${at}.championRewards`, issues)
  if (!Array.isArray(war.rounds) || war.rounds.length === 0) {
    issues.push(`${at}.rounds phải là danh sách không rỗng`)
    return
  }
  war.rounds.forEach((round: unknown, i) => {
    const where = `${at}.rounds[${i}]`
    const obj = asObject(round)
    if (!obj) {
      issues.push(`${where} phải là object`)
      return
    }
    checkKnownFields(
      obj,
      ['levelOffset', 'rewardMultiplier', 'contribution'],
      where,
      'config',
      issues
    )
    issues.push(...checkInteger(obj.levelOffset, `${where}.levelOffset`, 0))
    issues.push(...checkNumber(obj.rewardMultiplier, `${where}.rewardMultiplier`, 0))
    issues.push(...checkInteger(obj.contribution, `${where}.contribution`, 0))
  })
}

function checkConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.sects)
  if (!config) {
    issues.push('config.sects phải là object')
    return
  }
  const at = (field: string): string => `config.sects.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.sects', 'config', issues)
  issues.push(...checkInteger(config.rejoinCooldownDays, at('rejoinCooldownDays'), 0))
  issues.push(...checkNumber(config.rankBase, at('rankBase'), 1))
  issues.push(...checkNumber(config.rankPower, at('rankPower'), 1))
  issues.push(...checkInteger(config.memberCount, at('memberCount'), 1))
  issues.push(...checkInteger(config.masterRankLead, at('masterRankLead'), 0))
  const weights = config.memberRankWeights
  if (
    !Array.isArray(weights) ||
    weights.length === 0 ||
    weights.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w < 0) ||
    !weights.some((w) => typeof w === 'number' && w > 0)
  ) {
    issues.push(`${at('memberRankWeights')} phải là danh sách số ≥ 0, có ít nhất một số > 0`)
  }
  const daily = asObject(config.memberDailyContribution)
  checkIntegers(daily, { at: at('memberDailyContribution'), fields: ['min', 'max'] }, issues)
  if (daily && typeof daily.min === 'number' && typeof daily.max === 'number') {
    if (daily.min > daily.max) issues.push(`${at('memberDailyContribution')}: min > max`)
  }
  const missions = asObject(config.missions)
  checkIntegers(
    missions,
    {
      at: at('missions'),
      fields: ['count', 'refreshDays', 'contributionPerCount'],
      extra: ['talentPointChance']
    },
    issues
  )
  if (missions) {
    issues.push(
      ...checkNumber(missions.talentPointChance, at('missions.talentPointChance'), 0, 100)
    )
  }
  checkIntegers(
    asObject(config.duel),
    { at: at('duel'), fields: ['perDay', 'levelPerRank', 'contribution'] },
    issues
  )
  checkIntegers(
    asObject(config.promotion),
    { at: at('promotion'), fields: ['levelOffset', 'levelPerRank', 'talentPoints'] },
    issues
  )
  checkWar(data, config.war, issues)
}

function checkSect(data: GameData, sect: SectDef, issues: string[]): void {
  const where = `Tông môn "${sect.id}"`
  checkKnownFields(sect, SECT_FIELDS, where, 'tông môn', issues)
  issues.push(...checkInteger(sect.minRealm, `${where}: minRealm`, 0))
  checkTamerBonusEffects(sect.rankBonuses, where, issues)
  if (!Array.isArray(sect.trainerClassIds) || sect.trainerClassIds.length === 0) {
    issues.push(`${where}: trainerClassIds phải là danh sách không rỗng`)
  } else {
    for (const classId of sect.trainerClassIds) {
      if (data.trainers[classId]?.kind !== 'regular') {
        issues.push(`${where}: lớp NPC thường không tồn tại "${String(classId)}"`)
      }
    }
  }
  if (!Array.isArray(sect.rivalSectIds) || sect.rivalSectIds.length === 0) {
    issues.push(`${where}: rivalSectIds phải là danh sách không rỗng`)
  } else {
    for (const rivalId of sect.rivalSectIds) {
      if (rivalId === sect.id || !Object.hasOwn(data.sects, rivalId)) {
        issues.push(
          `${where}: tông đối địch không tồn tại hoặc trùng chính tông "${String(rivalId)}"`
        )
      }
    }
  }
  if (!Array.isArray(sect.shop)) {
    issues.push(`${where}: shop phải là danh sách`)
    return
  }
  const seen = new Set<string>()
  sect.shop.forEach((entry: unknown, i) => {
    const at = `${where}: shop[${i}]`
    const obj = asObject(entry)
    if (!obj) {
      issues.push(`${at} phải là object`)
      return
    }
    // Vật phẩm gộp chồng hoặc sách kỹ năng (Bí kíp / Chân kinh).
    const isBook = 'skillId' in obj
    const fields = isBook
      ? ['skillId', 'reusable', 'cost', 'minRank']
      : ['itemId', 'cost', 'minRank']
    checkKnownFields(obj, fields, at, 'món', issues)
    const key = isBook ? `book:${String(obj.skillId)}:${String(obj.reusable)}` : String(obj.itemId)
    if (isBook) {
      const skill = Object.hasOwn(data.skills, String(obj.skillId))
        ? data.skills[String(obj.skillId)]
        : undefined
      if (!skill || !isBookableSkill(data, skill)) {
        issues.push(`${at}: skill không có sách "${String(obj.skillId)}"`)
      }
      if (typeof obj.reusable !== 'boolean') issues.push(`${at}.reusable phải là boolean`)
    } else {
      issues.push(...checkStackItemId(data, String(obj.itemId), at, 'vật phẩm Tàng Bảo Các'))
    }
    if (seen.has(key)) issues.push(`${at}: trùng món "${key}"`)
    seen.add(key)
    issues.push(...checkInteger(obj.cost, `${at}.cost`, 1))
    issues.push(...checkInteger(obj.minRank, `${at}.minRank`, 0))
  })
}

/** Kiểm tra mọi dữ liệu tông môn. */
export function checkSectData(data: GameData, issues: string[]): void {
  checkConfig(data, issues)
  for (const sect of Object.values(data.sects)) checkSect(data, sect, issues)
  if (Object.keys(data.sectRanks).length === 0)
    issues.push('sectRanks.json phải có ít nhất 1 chức vị')
  if (Object.keys(data.npcNames).length === 0) issues.push('npcNames.json phải có ít nhất 1 tên')
  for (const rank of Object.values(data.sectRanks)) {
    checkKnownFields(rank, ['id'], `Chức vị "${rank.id}"`, 'chức vị', issues)
  }
  for (const name of Object.values(data.npcNames)) {
    checkKnownFields(name, ['id'], `Tên NPC "${name.id}"`, 'tên NPC', issues)
  }
}
