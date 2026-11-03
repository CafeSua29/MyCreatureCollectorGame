// Kiểm tra boss thế giới trong save (docs/rules/world-boss.md): GameState.worldBoss và trận boss thế
// giới (BattleState.special kind 'worldBoss'). Gọi từ validateGameState / checkBattleSpecial.

import type { GameData } from '../model'
import { asObject, checkBig, checkInteger } from '../shared'

type Raw = Record<string, unknown>

/** Loài boss: loài thường tồn tại (dữ liệu có thể đổi giữa các phiên bản nên không xét danh sách). */
function checkSpecies(data: GameData, value: unknown, at: string, issues: string[]): void {
  if (typeof value !== 'string' || data.species[value]?.kind !== 'normal') {
    issues.push(`${at}: loài không tồn tại "${String(value)}"`)
  }
}

/** Tầng cao nhất từng đạt: boss xuất hiện trước khi phi thăng vẫn còn sau đó (docs/rules/ascension.md). */
function bestFloorOf(state: Raw): unknown {
  const best = asObject(state.ascension)?.bestFloor
  if (typeof best !== 'number' || typeof state.highestFloor !== 'number') return undefined
  return Math.max(best, state.highestFloor)
}

/** Phần chung của lần xuất hiện và thưởng chờ: loài, tầng từng mở, level, kỷ lục. */
function checkSource(
  data: GameData,
  { value, at, bestFloor }: { value: Raw; at: string; bestFloor: unknown },
  issues: string[]
): void {
  checkSpecies(data, value.speciesId, `${at}.speciesId`, issues)
  issues.push(...checkInteger(value.floor, `${at}.floor`, 1))
  if (typeof bestFloor === 'number' && Number(value.floor) > bestFloor) {
    issues.push(`${at}.floor: tầng ${String(value.floor)} chưa mở`)
  }
  issues.push(...checkInteger(value.level, `${at}.level`, 1))
  issues.push(...checkBig(value.bestDamage, `${at}.bestDamage`, 0))
}

function checkCurrent(data: GameData, value: unknown, state: Raw, issues: string[]): void {
  if (value === null) return
  const at = 'worldBoss.current'
  const current = asObject(value)
  if (!current) {
    issues.push(`${at} phải là null hoặc lần xuất hiện`)
    return
  }
  checkSource(data, { value: current, at, bestFloor: bestFloorOf(state) }, issues)
  issues.push(...checkInteger(current.cycle, `${at}.cycle`, 0))
  issues.push(...checkInteger(current.endDay, `${at}.endDay`, 0))
  issues.push(...checkInteger(current.seed, `${at}.seed`, 0))
  issues.push(...checkBig(current.hpUnit, `${at}.hpUnit`, 1))
  const last = current.lastChallengeDay
  if (last !== null) issues.push(...checkInteger(last, `${at}.lastChallengeDay`, 0))
}

function checkRewards(data: GameData, value: unknown, state: Raw, issues: string[]): void {
  const at = 'worldBoss.rewards'
  if (!Array.isArray(value)) {
    issues.push(`${at} phải là danh sách`)
    return
  }
  const tierIds = data.config.worldBoss.tiers.map((tier) => tier.id)
  value.forEach((raw: unknown, i) => {
    const reward = asObject(raw) ?? {}
    const where = `${at}[${i}]`
    checkSource(data, { value: reward, at: where, bestFloor: bestFloorOf(state) }, issues)
    if (!tierIds.includes(String(reward.tierId))) {
      issues.push(`${where}.tierId: bậc thưởng không tồn tại "${String(reward.tierId)}"`)
    }
  })
}

/** worldBoss: { current: null | lần xuất hiện, rewards: thưởng chờ nhận }. */
export function validateWorldBossState(data: GameData, state: Raw): string[] {
  const issues: string[] = []
  const worldBoss = asObject(state.worldBoss)
  if (!worldBoss) return ['worldBoss phải là object { current, rewards }']
  checkCurrent(data, worldBoss.current, state, issues)
  checkRewards(data, worldBoss.rewards, state, issues)
  return issues
}

/** battle.special kind 'worldBoss': trận chưa kết thúc thì boss thế giới đang xuất hiện. */
export function checkWorldBossBattle(battle: Raw, state: Raw, issues: string[]): void {
  if (battle.phase === 'ended') return
  if (asObject(asObject(state.worldBoss)?.current) === null) {
    issues.push('battle.special: trận boss thế giới nhưng không có boss đang xuất hiện')
  }
}
