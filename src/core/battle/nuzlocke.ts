// Nuzlocke trong trận (docs/rules/challenge-modes.md): mỗi khu (tầng / hiểm địa) chỉ trận có quái
// hợp lệ đầu tiên là lượt gặp, trong trận đó bắt / thu phục được một con. Khu bảo tồn tính riêng
// (world/safari.ts).

import { ActionError } from '../shared'
import { isNuzlockeDupe } from '../registries'
import type { BattleState, GameData, GameState, Monster } from '../model'
import { log, type Draft } from './draft'
import { specialRule } from './specialBattles'

/**
 * Khu Nuzlocke của trận: hiểm địa theo id, trận trên tầng theo tầng; null = trận không có lượt gặp
 * (ngự thú sư NPC, độ kiếp, bí cảnh / tháp, trận không bắt được quái).
 */
export function nuzlockeAreaOf(
  battle: Pick<BattleState, 'floor' | 'trainer' | 'tribulation' | 'trial' | 'special'>
): string | null {
  if (battle.trainer || battle.tribulation || battle.trial) return null
  const { special } = battle
  if (special && !specialRule(special).canCapture(special)) return null
  if (special?.kind === 'zone') return `zone:${special.zoneId}`
  return `floor:${battle.floor}`
}

/**
 * Lúc mở trận: khu chưa dùng lượt gặp mà trận có quái hợp lệ (không trùng theo dupes clause) thì trận
 * này là lượt gặp của khu, khu thành đã dùng (bắt được hay không).
 */
export function claimNuzlockeEncounter(data: GameData, d: Draft): void {
  if (!d.options.nuzlocke) return
  const area = nuzlockeAreaOf(d.battle)
  if (area === null || d.challenge.nuzlockeAreas.includes(area)) return
  if (d.battle.enemies.every((enemy) => isNuzlockeDupe(data, d, enemy))) return
  d.challenge = { ...d.challenge, nuzlockeAreas: [...d.challenge.nuzlockeAreas, area] }
  d.battle.nuzlockeEncounter = true
  log(d, { type: 'nuzlockeEncounter', area })
}

/** Lỗi Nuzlocke khi bắt / thu phục `target` trong trận đang diễn ra; null = được. */
export function nuzlockeCaptureError(
  data: GameData,
  state: Pick<GameState, 'options' | 'dex'> & { battle: BattleState },
  target: Pick<Monster, 'baseSpeciesId'>
): ActionError | null {
  if (!state.options.nuzlocke) return null
  if (!state.battle.nuzlockeEncounter) {
    return new ActionError('nuzlockeAreaUsed', { area: nuzlockeAreaOf(state.battle) })
  }
  if (isNuzlockeDupe(data, state, target)) {
    return new ActionError('nuzlockeDupe', { speciesId: target.baseSpeciesId })
  }
  return null
}

/** Đã bắt / thu phục được con của lượt gặp: trận này không bắt thêm được. */
export function spendNuzlockeEncounter(d: Pick<Draft, 'battle'>): void {
  d.battle.nuzlockeEncounter = false
}
