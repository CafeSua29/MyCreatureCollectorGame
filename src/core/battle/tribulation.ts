// Độ kiếp (docs/rules/awakening.md): điều kiện bắt đầu, luật riêng của trận (một mình, không vật
// phẩm / chạy / bắt / đổi quái / biến hình / kỹ năng ngự thú sư, hết lượt là thua) và kết thúc
// (thắng lên tầng + phần thưởng mốc; thua 1 HP + trọng thương; thua quá maxFailures lần thì chết hẳn,
// để lại hồn phách).

import { grantTribulationTrophy } from './marks'
import { woundIfBondDied } from '../tamer'
import {
  addMilestone,
  awakeningPillIds,
  awakeningRequirements,
  awakeningRewardAt,
  countAwakeningRewards,
  dieForever,
  divineSkillId,
  getMaxHp,
  isFainted,
  offerSkills,
  withExtraSkill
} from '../monster'
import { anyOfItemCount, removeAnyOf } from '../inventory'
import { aptitudeFloor, bumpStat } from '../registries'
import { ActionError, BIG_ONE, spendMoney, type ActionErrorParams } from '../shared'
import { assertNoInstance } from '../world'
import { dayOf, type GameData, type GameState, type Monster } from '../model'
import { log, removeDeadFromBattle, type Draft } from './draft'

/** Lệnh bị cấm trong trận độ kiếp (mã lỗi `tribulationRestricted`). */
export type TribulationRestriction = ActionErrorParams['tribulationRestricted']['command']

/** Trận đang là trận độ kiếp thì lệnh `command` bị chặn. */
export function assertNotTribulation(
  battle: GameState['battle'],
  command: TribulationRestriction
): void {
  if (battle?.tribulation) throw new ActionError('tribulationRestricted', { command })
}

/**
 * Kiểm tra điều kiện độ kiếp của quái trong đội (state chưa đổi) rồi trừ tiền và Thức tỉnh đan.
 * Trả về state đã trừ cùng quái độ kiếp.
 */
export function payForTribulation(
  data: GameData,
  state: GameState,
  monsterId: string
): { state: GameState; monster: Monster } {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  assertNoInstance(state)
  const monster = state.party.find((m) => m.id === monsterId)
  if (!monster) throw new ActionError('monsterNotInParty', { monsterId })
  if (isFainted(data, monster)) throw new ActionError('monsterFainted', { monsterId })
  if (monster.injuryBattlesLeft > 0) {
    throw new ActionError('injured', { monsterId, battlesLeft: monster.injuryBattlesLeft })
  }
  const config = data.config.awakening
  const need = awakeningRequirements(config, monster.awakening)
  if (monster.level < need.level) {
    throw new ActionError('levelTooLowForAwakening', { need: need.level, have: monster.level })
  }
  // Lần này thua là chết: đội không được trống sau đó.
  if (monster.tribulationFailures >= config.maxFailures && state.party.length === 1) {
    throw new ActionError('partyWouldBeEmpty')
  }
  // Thức tỉnh đan cùng hệ với quái (hệ nào cũng được, chồng nhiều nhất trước).
  const pillIds = awakeningPillIds(config, monster)
  const inventory =
    need.pills > 0 ? removeAnyOf(state.inventory, pillIds, need.pills) : state.inventory
  if (!inventory) {
    const have = anyOfItemCount(state.inventory, pillIds)
    throw new ActionError('notEnoughAwakeningPills', { monsterId, have, need: need.pills })
  }
  const paid = spendMoney({ ...state, inventory }, need.money)
  return { state: paid, monster }
}

/** Trận độ kiếp quá số lượt tối đa (xét cuối lượt, trước khi sang lượt sau). */
export const isTribulationTimeUp = (data: GameData, d: Draft): boolean =>
  d.battle.tribulation !== null && d.battle.turn > data.config.awakening.tribulation.maxTurns

/** Phần thưởng của tầng mới đạt: thần thông vào skill (hoặc skill chờ học), hoặc +1 ô trait. */
function grantMilestone(data: GameData, d: Draft, monster: Monster, tier: number): Monster {
  const config = data.config.awakening
  const reward = awakeningRewardAt(config, tier)
  if (reward === 'traitSlot') return { ...monster, traitSlots: monster.traitSlots + 1 }
  if (reward !== 'skill') return monster
  const skillId = divineSkillId(data, monster, countAwakeningRewards(config, tier, 'skill'))
  if (skillId === null) return monster
  // Thần thông nằm ngoài learnset: ghi extraSkillIds để học lại ở NPC (skill-books.md).
  const offered = offerSkills(data, withExtraSkill(monster, skillId), [skillId])
  for (const event of offered.events) log(d, event)
  return offered.monster
}

function won(data: GameData, d: Draft, monster: Monster, tier: number): Monster {
  log(d, { type: 'awakened', monsterId: monster.id, tier })
  d.stats = bumpStat(d.stats, 'tribulationsPassed')
  const awakened = { ...monster, awakening: tier, tribulationFailures: 0 }
  return addMilestone(data, grantMilestone(data, d, awakened, tier), {
    day: dayOf(d.time),
    kind: 'awakened',
    tier
  })
}

/** Thua: thêm một lần thất bại, còn 1 HP, trọng thương; null = quá maxFailures lần, chết hẳn. */
function lost(data: GameData, d: Draft, monster: Monster, tier: number): Monster | null {
  const config = data.config.awakening
  const failures = monster.tribulationFailures + 1
  if (failures > config.maxFailures) {
    log(d, { type: 'diedInTribulation', monsterId: monster.id })
    // Để lại hồn phách (docs/rules/soul-relics.md).
    d.inventory = dieForever(data, d.inventory, monster, {
      aptitudeFloor: aptitudeFloor(d),
      day: dayOf(d.time),
      cause: 'tribulation'
    })
    // Bản mệnh chết hẳn: ngự thú sư bị đạo thương (docs/rules/tamer.md mục "Bản mệnh thú").
    const wound = woundIfBondDied(data, d, [monster])
    if (wound.bondId) {
      d.tamer = wound.tamer
      log(d, { type: 'bondBroken', monsterId: wound.bondId, woundUntilDay: wound.woundUntilDay })
    }
    return null
  }
  log(d, { type: 'tribulationFailed', monsterId: monster.id, tier, failures })
  const injured = {
    ...monster,
    tribulationFailures: failures,
    injuryBattlesLeft: config.injuryBattles,
    statuses: []
  }
  // Max HP tính với trọng thương: còn đúng 1 HP.
  const wounded = { ...injured, damageTaken: getMaxHp(data, injured).minus(BIG_ONE) }
  return addMilestone(data, wounded, {
    day: dayOf(d.time),
    kind: 'tribulationFailed',
    tier,
    failures
  })
}

/**
 * Kết thúc trận độ kiếp (gọi khi đã phân thắng thua, sau finish): không tiền / EXP / đồ rơi / thân
 * mật, không mất tiền khi thua; quái chết hẳn thì rời đội, đồ đang lắp về túi.
 */
export function settleTribulation(data: GameData, d: Draft, outcome: 'won' | 'lost'): void {
  const tribulation = d.battle.tribulation
  if (!tribulation) return
  const index = d.party.findIndex((m) => m.id === tribulation.monsterId)
  // Đã chết thật lúc kết thúc trận (gục khi bật chết thật, docs/rules/options.md).
  if (index < 0) return
  const monster = d.party[index]
  const result =
    outcome === 'won'
      ? won(data, d, monster, tribulation.tier)
      : lost(data, d, monster, tribulation.tier)
  if (result !== null) {
    d.party[index] = result
    // Độ kiếp thành công: chiến tích của quái độ kiếp (docs/rules/marks.md).
    if (outcome === 'won') grantTribulationTrophy(data, d, monster.id)
    return
  }
  // Chết hẳn: rời đội và mọi chỗ trận còn trỏ tới nó (trận đã kết thúc).
  removeDeadFromBattle(d, monster.id)
}
