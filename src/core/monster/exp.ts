// EXP và level. Tổng EXP để đạt mỗi level theo nhóm tăng trưởng của loài (growthRates.ts).

import { getBaseSpecies } from './validateMonster'
import { shinyFactor } from './shiny'
import { offerSkills } from './skills'
import { maxBig, toBig, type BigValue, type Decimal } from '../shared'
import { levelFromExp, monsterGrowthRate } from './growthRates'
import type { BattleEvent, GameData, Monster } from '../model'

/** Hệ số thưởng của quái địch: × hệ số shiny × bossMultiplier. */
function rewardFactor(data: GameData, enemy: Monster): Decimal {
  return shinyFactor(data, enemy).times(enemy.bossMultiplier)
}

/** EXP gốc của quái địch theo level, chưa nhân hệ số thưởng: expFactor × level². */
function baseExpForLevel(data: GameData, level: BigValue): Decimal {
  return toBig(data.config.rewards.expFactor).times(toBig(level).pow(2))
}

/**
 * EXP nhận được khi hạ (hoặc bắt) một quái địch; shiny và boss cho thêm theo hệ số. Tối thiểu
 * minExp: quái level 1 cho ⌊0,5 × 1²⌋ = 0 EXP nếu không có mức sàn.
 */
export function expReward(data: GameData, enemy: Monster): Decimal {
  return maxBig(
    data.config.rewards.minExp,
    baseExpForLevel(data, enemy.level).times(rewardFactor(data, enemy)).floor()
  )
}

/**
 * Level giữa khoảng level quái thường của tầng: levelPerFloor × (tầng − 0,5), đúng bằng trung
 * điểm của floorLevelRange (world/floors.ts; monster không import world nên tính lại ở đây).
 */
const floorMidLevel = (data: GameData, floor: number): Decimal =>
  toBig(floor).minus(0.5).times(data.config.floors.levelPerFloor)

/**
 * Hệ số EXP của kẹo EXP theo tầng cao nhất từng đạt (mục "Kẹo EXP và Kẹo Hiếm"): EXP quái hoang
 * ở level giữa tầng đó / ở level giữa tầng 1, để mỗi loại kẹo luôn bằng khoảng cùng số trận.
 */
export function expCandyScale(data: GameData, highestFloor: number): Decimal {
  const base = baseExpForLevel(data, floorMidLevel(data, 1))
  // expFactor = 0 thì quái hoang không cho EXP: kẹo giữ nguyên số ghi trên kẹo.
  if (base.lte(0)) return toBig(1)
  return baseExpForLevel(data, floorMidLevel(data, highestFloor)).div(base)
}

/** Tiền nhận được khi hạ một quái địch; shiny và boss cho thêm theo hệ số. */
export function moneyReward(data: GameData, enemy: Monster): Decimal {
  return toBig(data.config.rewards.moneyPerLevel)
    .times(enemy.level)
    .times(rewardFactor(data, enemy))
    .floor()
}

/**
 * Cộng EXP, lên level và học skill mới theo learnset của loài gốc.
 * Còn ô skill thì tự học; đủ ô thì skill vào danh sách chờ học (xem offerSkills).
 */
export function gainExp(
  data: GameData,
  monster: Monster,
  amount: Decimal
): { monster: Monster; events: BattleEvent[] } {
  const events: BattleEvent[] = [{ type: 'expGain', monsterId: monster.id, amount }]
  const exp = monster.exp.plus(amount)
  const level = Math.max(monster.level, levelFromExp(exp, monsterGrowthRate(data, monster)))
  // maxLevelReached chỉ tăng: thọ nguyên tính theo nó (mục "Tuổi và thọ nguyên").
  const maxLevelReached = Math.max(monster.maxLevelReached, level)
  let updated: Monster = { ...monster, exp, level, maxLevelReached }

  if (level > monster.level) {
    events.push({ type: 'levelUp', monsterId: monster.id, level })
    const learnset = getBaseSpecies(data, monster)?.learnset ?? []
    const newSkills = learnset
      .filter((entry) => entry.level > monster.level && entry.level <= level)
      .sort((a, b) => a.level - b.level)
      .map((entry) => entry.skillId)
    const offered = offerSkills(data, updated, newSkills)
    updated = offered.monster
    events.push(...offered.events)
  }

  return { monster: updated, events }
}
