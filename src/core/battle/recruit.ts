// Thu phục (docs/rules/recruit.md): sau trận thắng một quái bị hạ xin theo (boss: quy phục), Thị Uy
// ở lượt đầu trận quái hoang thường, mồi dụ đếm theo trận. Quái thu phục: HP đầy, thân mật khởi đầu
// recruit, lý lịch `recruit`; không khế ước, không giới hạn level (khế ước là bước riêng, tamer.md).

import { recordQuestEvent } from '../quests'
import { getBaseSpecies, mergeTraitLevel, startHistory } from '../monster'
import {
  blessingPercent,
  monsterSpeciesRankOf,
  speciesRankIndex,
  hasPartyRoom,
  partyAfterJoining,
  capacityOf,
  hasRosterRoom
} from '../registries'
import {
  ActionError,
  BIG_ZERO,
  bigToNumber,
  cloneData,
  malformedAction,
  pickWeighted,
  rollPercent,
  type Decimal
} from '../shared'
import { partnerAmount } from '../tamer'
import { baitRecruitPercent, tickBait } from '../world'
import { battleDeityId, gainFavor } from './deities'
import {
  STAT_NAMES,
  dayOf,
  type ActiveBait,
  type BattleSide,
  type BattleState,
  type GameData,
  type GameState,
  type Monster,
  type RecruitMethod
} from '../model'
import {
  Draft,
  aliveOnField,
  battleStats,
  clearOnFieldState,
  log,
  removeFromField,
  requireBattle
} from './draft'
import { applyStageChange } from './stageChanges'
import { enemyTarget } from './battleItems'
import { isDynamaxed } from './transform'
import { specialRule } from './specialBattles'

/**
 * Trận có thể thu phục: quái hoang / boss trên tầng, kể cả câu cá / khai thác (không NPC, bí cảnh,
 * event, thú triều, hiểm địa, độ kiếp; luật theo loại ở SPECIAL_BATTLE_RULES).
 */
export const isRecruitBattle = (battle: BattleState): boolean =>
  !battle.trainer &&
  !battle.trial &&
  (!battle.special || specialRule(battle.special).canRecruit) &&
  !battle.tribulation

/** Tổng % thu phục cho quái này: kỹ năng đồng hành + mồi dụ (khẩu vị theo quái). */
function recruitBonusPercent(
  data: GameData,
  state: Pick<GameState, 'party' | 'recruit'>,
  { monster, blessingBonus }: { monster: Monster; blessingBonus: number }
): number {
  return (
    partnerAmount(data, state.party, 'recruitPercent') +
    baitRecruitPercent(data, state.recruit.bait, monster) +
    blessingBonus
  )
}

/** % thu phục của chúc phúc thần cai quản map của trận (docs/rules/deities.md). */
const battleRecruitBlessing = (data: GameData, d: Draft): number =>
  blessingPercent(data, d.favor, {
    deityId: battleDeityId(data, d, d.battle),
    channel: 'recruitPercent'
  })

const bonusMultiplier = (percent: number): number => Math.max(0, 1 + percent / 100)

/**
 * % một quái bị hạ xin theo sau trận thắng (boss: quy phục), kẹp 0–100. Quái hoang thường:
 * baseChance × catchRate / 100 × (1 + % thu phục) × rankFalloff^bậc phẩm cấp loài; boss:
 * bossChance × (1 + % thu phục).
 */
export function recruitChance(
  data: GameData,
  state: Pick<GameState, 'party' | 'storage' | 'recruit' | 'capacity' | 'tamer'>,
  {
    enemy,
    isBoss,
    blessingBonus = 0
  }: {
    enemy: Monster
    isBoss: boolean
    /** % thu phục của chúc phúc thần cai quản map của trận (docs/rules/deities.md). */
    blessingBonus?: number
  }
): number {
  const species = getBaseSpecies(data, enemy)
  if (!species) return 0
  // Đội đủ và kho đầy: không xin theo / quy phục (docs/rules/capacity.md).
  if (!hasRosterRoom(data, state, { newcomer: enemy })) return 0
  const config = data.config.recruit
  const bonus = bonusMultiplier(recruitBonusPercent(data, state, { monster: enemy, blessingBonus }))
  const rank = Math.max(0, speciesRankIndex(data, monsterSpeciesRankOf(data, enemy).id))
  const chance = isBoss
    ? config.bossChance * bonus
    : ((config.baseChance * species.catchRate) / 100) * bonus * config.rankFalloff ** rank
  return Math.min(100, Math.max(0, chance))
}

/**
 * Quái hoang thành quái của người chơi: HP đầy, hết trạng thái, thân mật khởi đầu recruit, boss nhận
 * trait "Huyết thống boss" (giữ bossMultiplier như bắt boss), lý lịch.
 */
function recruitedMonster(
  data: GameData,
  d: Draft,
  { enemy, method }: { enemy: Monster; method: RecruitMethod }
): Monster {
  const { battleMaxHpDelta: _battleMaxHpDelta, ...rest } = cloneData(enemy)
  const healed: Monster = {
    ...rest,
    damageTaken: BIG_ZERO,
    statuses: [],
    affinity: data.config.affinity.start.recruit
  }
  const withBoss = d.battle.isBoss ? mergeTraitLevel(healed, data.config.boss.traitId, 1) : healed
  const met = { day: dayOf(d.time), floor: d.battle.floor, level: enemy.level }
  return startHistory(withBoss, { kind: 'recruit', method }, met)
}

/** Nhiệm vụ bắt quái tính cả quái thu phục (docs/rules/quests.md). */
function recordRecruitQuest(data: GameData, d: Draft, monster: Monster): void {
  d.quests = recordQuestEvent(data, d.quests, {
    type: 'caught',
    raceId: monster.raceId,
    elementIds: monster.elementIds
  })
}

/**
 * Sau trận thắng (đã finish): tung một lần cho trận, tỉ lệ = 1 − Π(1 − tỉ lệ từng quái bị hạ); trúng
 * thì một quái xin theo, chọn theo trọng số tỉ lệ của nó. Mọi tỉ lệ 0 thì không tốn RNG. `bait`: mồi
 * dụ lúc trận diễn ra (finish đã bớt trận này).
 */
export function rollRecruitOffer(data: GameData, d: Draft, bait: ActiveBait | null): void {
  if (!isRecruitBattle(d.battle)) return
  const isBoss = d.battle.isBoss
  const state = { ...d, recruit: { ...d.recruit, bait } }
  const blessingBonus = battleRecruitBlessing(data, d)
  const candidates = d.battle.enemies
    .map((enemy) => ({
      enemy,
      chance: recruitChance(data, state, { enemy, isBoss, blessingBonus })
    }))
    .filter((candidate) => candidate.chance > 0)
  if (candidates.length === 0) return
  const missAll = candidates.reduce((product, { chance }) => product * (1 - chance / 100), 1)
  let offered: boolean
  ;[offered, d.rng] = rollPercent(d.rng, (1 - missAll) * 100)
  if (!offered) return
  let chosen: (typeof candidates)[number]
  ;[chosen, d.rng] = pickWeighted(d.rng, candidates, (candidate) => candidate.chance)
  d.battle.recruitOfferId = chosen.enemy.id
  const method: RecruitMethod = isBoss ? 'bossSubmit' : 'afterBattle'
  log(d, { type: 'recruitOffered', monsterId: chosen.enemy.id, method })
}

/** Trận có thể thu phục kết thúc (thắng, thua, chạy): mồi dụ bớt một trận. */
export function tickRecruitBait(d: Draft): void {
  if (!isRecruitBattle(d.battle) || !d.recruit.bait) return
  d.recruit = { ...d.recruit, bait: tickBait(d.recruit.bait) }
}

function requireOffer(state: GameState): { battle: BattleState; offerId: string } {
  const battle = requireBattle(state, 'ended')
  if (battle.recruitOfferId === null) throw new ActionError('noRecruitOffer')
  return { battle, offerId: battle.recruitOfferId }
}

/** Nhận quái đang xin theo: vào đội (còn chỗ) hoặc kho, rời danh sách quái địch của trận. */
export function acceptRecruit(data: GameData, state: GameState): GameState {
  const { battle, offerId } = requireOffer(state)
  const d: Draft = { ...state, battle: { ...battle, log: [...battle.log] } }
  const enemy = battle.enemies.find((m) => m.id === offerId)
  if (!enemy) throw new Error(`Quái xin theo "${offerId}" không có trong trận`)
  const method: RecruitMethod = battle.isBoss ? 'bossSubmit' : 'afterBattle'
  const monster = recruitedMonster(data, d, { enemy, method })
  if (!hasRosterRoom(data, state, { newcomer: monster })) {
    throw new ActionError('rosterFull', { capacity: capacityOf(data, state, 'storage') })
  }
  const destination = hasPartyRoom(data, state.party, monster) ? 'party' : 'storage'
  d.party = destination === 'party' ? [...state.party, monster] : state.party
  d.storage = destination === 'storage' ? [...state.storage, monster] : state.storage
  d.battle.enemies = battle.enemies.filter((m) => m.id !== offerId)
  d.battle.recruitOfferId = null
  log(d, { type: 'recruited', monsterId: monster.id, method, destination })
  recordRecruitQuest(data, d, monster)
  // Thu phục trong map có thần: ân sủng như bắt quái (docs/rules/deities.md).
  const deityId = battleDeityId(data, d, d.battle)
  if (deityId !== null) gainFavor(data, d, { deityId, amount: data.config.deities.favorPerCapture })
  return d
}

/** Từ chối quái đang xin theo (rời trận mà chưa chọn cũng là từ chối). */
export function declineRecruit(state: GameState): GameState {
  const { battle } = requireOffer(state)
  return { ...state, battle: { ...battle, recruitOfferId: null } }
}

// ---------- Thị Uy ----------

/** Lý do trận này không Thị Uy được (chỉ lượt đầu trận quái hoang thường); null = được. */
export function intimidateBlocker(battle: BattleState): 'notWildBattle' | 'notFirstTurn' | null {
  if (!isRecruitBattle(battle) || battle.isBoss) return 'notWildBattle'
  return battle.turn === 1 ? null : 'notFirstTurn'
}

const statTotal = (data: GameData, d: Draft, monster: Monster): Decimal =>
  STAT_NAMES.reduce((sum, stat) => sum.plus(battleStats(data, d, monster)[stat]), BIG_ZERO)

/** Tổng chỉ số trong trận của mọi quái còn sống trên sân của một phe. */
const sideStatTotal = (data: GameData, d: Draft, side: BattleSide): Decimal =>
  aliveOnField(data, d, side).reduce(
    (sum, { monster }) => sum.plus(statTotal(data, d, monster)),
    BIG_ZERO
  )

/**
 * Tỉ lệ (0–1) Thị Uy thành công lên quái hoang `target`: kẹp((slope × tổng chỉ số trong trận của quái
 * ta còn sống trên sân / tổng chỉ số của quái hoang còn sống trên sân + offset) × (1 + % thu phục của
 * target), 0, maxChance). Hai phe ngang sức → 0,25; mạnh gấp đôi → 0,75.
 */
function intimidateChanceAgainst(data: GameData, d: Draft, target: Monster): number {
  const { slope, offset, maxChance } = data.config.recruit.intimidate
  const ours = sideStatTotal(data, d, 'player')
  const theirs = sideStatTotal(data, d, 'enemy')
  // Tỉ lệ kẹp trong [0, maxChance] ngay sau đó nên đổi sang number an toàn dù chỉ số lớn vô hạn.
  const ratio = theirs.lte(0) ? Number.MAX_SAFE_INTEGER : bigToNumber(ours.div(theirs))
  const bonus = recruitBonusPercent(data, d, {
    monster: target,
    blessingBonus: battleRecruitBlessing(data, d)
  })
  const raw = (slope * ratio + offset) * bonusMultiplier(bonus)
  return Math.min(maxChance, Math.max(0, raw))
}

/** Kiểm tra mục tiêu Thị Uy của lệnh: quái hoang còn sống trên sân, không Dynamax. */
export function validateIntimidateTarget(
  data: GameData,
  d: Draft,
  targetId: string | undefined
): void {
  const found = typeof targetId === 'string' ? enemyTarget(data, d.battle, targetId) : null
  if (!found || isDynamaxed(found.target)) {
    throw malformedAction('mục tiêu Thị Uy phải là quái hoang còn sống trên sân, không Dynamax')
  }
  // Như ném bóng: đội đủ và kho đầy thì báo lỗi ngay (docs/rules/capacity.md).
  if (!hasRosterRoom(data, d, { pending: d.battle.captured, newcomer: found.target })) {
    throw new ActionError('rosterFull', { capacity: capacityOf(data, d, 'storage') })
  }
}

/**
 * Tỉ lệ (0–1) Thị Uy thành công lên quái hoang `targetId` ở trận đang diễn ra (UI, script mô phỏng);
 * 0 nếu không Thị Uy được (trận / lượt / mục tiêu không hợp lệ).
 */
export function intimidateChance(data: GameData, state: GameState, targetId: string): number {
  if (!state.battle || intimidateBlocker(state.battle) !== null) return 0
  const d: Draft = { ...state, battle: state.battle }
  const found = enemyTarget(data, d.battle, targetId)
  if (!found || isDynamaxed(found.target)) return 0
  return intimidateChanceAgainst(data, d, found.target)
}

/**
 * Chạy Thị Uy lên `targetId`; false = không có tác dụng (mục tiêu đã gục / rời sân trong lượt).
 * Thành công: quái hoang theo về ngay (vào battle.captured như bắt bóng); thất bại: nó tăng bậc.
 */
export function runIntimidate(data: GameData, d: Draft, targetId: string | undefined): boolean {
  const found = typeof targetId === 'string' ? enemyTarget(data, d.battle, targetId) : null
  if (!found || isDynamaxed(found.target)) return false
  const { target } = found
  if (!hasRosterRoom(data, d, { pending: d.battle.captured, newcomer: target })) {
    log(d, { type: 'rosterFull', monsterId: target.id })
    return false
  }
  const chance = intimidateChanceAgainst(data, d, target)
  let success: boolean
  ;[success, d.rng] = rollPercent(d.rng, chance * 100)
  log(d, { type: 'intimidate', targetId: target.id, chance, success })
  if (!success) {
    const { failStages } = data.config.recruit.intimidate
    for (const [stat, delta] of Object.entries(failStages)) {
      // Khóa của failStages đã kiểm tra là attack / spAttack khi nạp dữ liệu.
      const statName = stat as keyof typeof failStages
      applyStageChange(data, d, { targetId: target.id, stat: statName, delta, cause: 'self' })
    }
    return true
  }
  // Rời sân trước khi rời danh sách địch để hệ / race bị đổi trong trận được trả lại.
  clearOnFieldState(data, d, target.id)
  d.battle.enemies = d.battle.enemies.filter((m) => m.id !== target.id)
  removeFromField(d, 'enemy', target.id)
  const monster = recruitedMonster(data, d, { enemy: target, method: 'intimidate' })
  // Đội không đổi trong trận, nên biết trước quái sẽ vào đội hay vào kho.
  const destination = hasPartyRoom(
    data,
    partyAfterJoining(data, d.party, d.battle.captured),
    monster
  )
    ? 'party'
    : 'storage'
  d.battle.captured.push(monster)
  log(d, { type: 'recruited', monsterId: monster.id, method: 'intimidate', destination })
  recordRecruitQuest(data, d, monster)
  return true
}
