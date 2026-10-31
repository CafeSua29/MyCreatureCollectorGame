// Khế ước (docs/rules/tamer.md mục "Khế ước"): bước riêng sau khi có quái (bắt, thu phục, trứng...
// không tự khế ước). Công thức tỉ lệ, số quái đang khế ước, nâng khế ước khi đột phá. Action khế ước /
// giải trừ ở roster/contractActions.ts. Cảnh giới khế ước không bao giờ hạ khi còn khế ước.

import { monsterSpeciesRankOf, speciesRankIndex } from '../registries'
import type { DayEvent, GameData, GameState, Monster } from '../model'
import { contractLevelLimit } from './realm'

/** Khế ước quái với ngự thú sư cảnh giới `realm`: cảnh giới khế ước = max(đang có, realm). */
export function bindContract(monster: Monster, realm: number): Monster {
  const contractRealm = Math.max(monster.contractRealm ?? 0, realm)
  return contractRealm === monster.contractRealm ? monster : { ...monster, contractRealm }
}

/** Quái đã khế ước với người chơi (cảnh giới khế ước khác null). */
export const isContracted = (monster: Pick<Monster, 'contractRealm'>): boolean =>
  monster.contractRealm !== null

/** Số quái đang khế ước (đội, kho, trong trứng). */
export function contractedCount(state: Pick<GameState, 'party' | 'storage' | 'eggs'>): number {
  const owned = [...state.party, ...state.storage, ...state.eggs.map((egg) => egg.monster)]
  return owned.filter(isContracted).length
}

/**
 * Nâng cảnh giới khế ước của mọi quái **đã khế ước** (đội, kho, trong trứng) lên ít nhất `realm`;
 * quái chưa khế ước giữ nguyên. Chỉ gọi ngoài trận (đột phá ở thị trấn).
 */
export function raiseOwnedContracts(state: GameState, realm: number): GameState {
  const bind = (monster: Monster): Monster =>
    isContracted(monster) ? bindContract(monster, realm) : monster
  return {
    ...state,
    party: state.party.map(bind),
    storage: state.storage.map(bind),
    eggs: state.eggs.map((egg) => ({ ...egg, monster: bind(egg.monster) }))
  }
}

/**
 * % khế ước thành công quái `monster` ở cảnh giới `realm` (chưa kiểm tra giới hạn level / số ô):
 * kẹp(base − levelPenalty × level / giới hạn level − rankPenalty × thứ hạng phẩm cấp loài −
 * bossPenalty (quái mang hệ số boss) + affinityBonus × thân mật / thân mật tối đa, min, max).
 */
export function contractChance(data: GameData, monster: Monster, realm: number): number {
  const { chance } = data.config.tamer.contract
  const levelRatio = Math.min(1, monster.level / contractLevelLimit(data, realm))
  const rank = Math.max(0, speciesRankIndex(data, monsterSpeciesRankOf(data, monster).id))
  const raw =
    chance.base -
    chance.levelPenalty * levelRatio -
    chance.rankPenalty * rank -
    (monster.bossMultiplier > 1 ? chance.bossPenalty : 0) +
    (chance.affinityBonus * monster.affinity) / data.config.affinity.max
  return Math.min(chance.max, Math.max(chance.min, raw))
}

/** % quái bỏ trốn khi khế ước thất bại = escapeChance × (1 − thân mật / thân mật tối đa). */
export function contractEscapeChance(data: GameData, monster: Monster): number {
  const { escapeChance } = data.config.tamer.contract.failure
  const trust = Math.min(1, Math.max(0, monster.affinity / data.config.affinity.max))
  return escapeChance * (1 - trust)
}

/**
 * % quái của người chơi **chưa khế ước** không nghe lệnh skill ở cảnh giới `realm` (0 nếu đã khế ước):
 * nhỏ khi level trong giới hạn khế ước, tăng nhanh khi vượt, giảm theo thân mật (như Pokémon đổi
 * về khi chưa đủ huy hiệu).
 */
export function disobeyChance(data: GameData, monster: Monster, realm: number): number {
  if (isContracted(monster)) return 0
  const { base, levelScale, overLimitScale, max, affinityReduction } =
    data.config.tamer.contract.disobey
  const ratio = monster.level / contractLevelLimit(data, realm)
  const raw = base + levelScale * Math.min(ratio, 1) + overLimitScale * Math.max(0, ratio - 1)
  const trust = Math.min(1, Math.max(0, monster.affinity / data.config.affinity.max))
  return Math.min(max, raw) * (1 - affinityReduction * trust)
}

/** Việc theo ngày (DAILY_TASKS): quái đã khế ước ở đội / kho thêm một ngày khế ước. */
export function soulLinkDailyTask(
  _data: GameData,
  state: GameState,
  _events: DayEvent[],
  _day: number
): GameState {
  const tick = (monster: Monster): Monster =>
    isContracted(monster) ? { ...monster, contractDays: monster.contractDays + 1 } : monster
  return { ...state, party: state.party.map(tick), storage: state.storage.map(tick) }
}
