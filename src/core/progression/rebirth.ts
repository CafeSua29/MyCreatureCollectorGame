// Luân hồi quái (NPC luân hồi ở thị trấn, docs/rules/rebirth.md): quái level cao về level 1 để nhận
// % mọi chỉ số vĩnh viễn, gen, điểm thiên phú và trẻ lại. Mọi thuộc tính khác trên quái giữ nguyên
// (trường mới thêm vào Monster mặc định giữ, vì luân hồi chỉ đổi đúng các trường liệt kê ở đây).

import { ActionError, BIG_ONE, BIG_ZERO, maxBig, spendMoney, toBig, type Decimal } from '../shared'
import { removeItems } from '../inventory'
import {
  addMilestone,
  assertNotBusy,
  expForLevel,
  mapBigStats,
  monsterGrowthRate
} from '../monster'
import { dayOf, type GameData, type GameState, type Monster, type RebirthConfig } from '../model'

/** Điều kiện của lần luân hồi kế tiếp (lần thứ `count`). */
export interface RebirthRequirements {
  count: number
  level: number
  money: Decimal
  pills: number
}

/** Điều kiện lần luân hồi thứ n = rebirths + 1: level minLevelBase × n, tiền costBase × n², n đan. */
export function rebirthRequirements(config: RebirthConfig, rebirths: number): RebirthRequirements {
  const count = rebirths + 1
  return {
    count,
    level: config.minLevelBase * count,
    money: toBig(config.costBase).times(count).times(count),
    pills: config.pillsPerRebirth * count
  }
}

/**
 * Quái sau khi luân hồi (không kiểm tra điều kiện, không trả giá): level 1, rebirths + 1, gen +
 * genePercent % (làm tròn xuống, ít nhất +1), tuổi 0, hồi đầy máu và bỏ trạng thái (thân xác mới;
 * max HP tụt theo level nên giữ máu đã mất thì gục). maxLevelReached giữ nên thọ nguyên và điểm
 * thiên phú theo level không tụt.
 */
export function applyRebirth(data: GameData, monster: Monster, day: number): Monster {
  const { genePercent } = data.config.rebirth
  const genes = mapBigStats((stat) => {
    const gene = monster.genes[stat]
    return gene.plus(maxBig(BIG_ONE, gene.times(genePercent).div(100).floor()))
  })
  const rebirths = monster.rebirths + 1
  const reborn: Monster = {
    ...monster,
    level: 1,
    exp: expForLevel(1, monsterGrowthRate(data, monster)),
    rebirths,
    genes,
    ageDays: 0,
    damageTaken: BIG_ZERO,
    statuses: []
  }
  return addMilestone(data, reborn, { day, kind: 'reborn', count: rebirths })
}

/** NPC luân hồi ở thị trấn: quái ở đội hoặc kho, không đang làm việc, đủ level / tiền / đan. */
export function rebirthMonster(data: GameData, state: GameState, monsterId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const monster =
    state.party.find((m) => m.id === monsterId) ?? state.storage.find((m) => m.id === monsterId)
  if (!monster) throw new ActionError('monsterNotOwned', { monsterId })
  assertNotBusy(monster)
  const config = data.config.rebirth
  const need = rebirthRequirements(config, monster.rebirths)
  if (monster.level < need.level) {
    throw new ActionError('levelTooLowForRebirth', { need: need.level, have: monster.level })
  }
  const inventory =
    need.pills > 0 ? removeItems(state.inventory, config.pillItemId, need.pills) : state.inventory
  const paid = spendMoney({ ...state, inventory }, need.money)
  const reborn = applyRebirth(data, monster, dayOf(state.time))
  const update = (monsters: Monster[]): Monster[] =>
    monsters.map((m) => (m.id === monsterId ? reborn : m))
  return { ...paid, party: update(paid.party), storage: update(paid.storage) }
}
