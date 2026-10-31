// AI chọn quái thay và đổi quái (docs/rules/trainers.md, mục "AI trận đấu" ở battle.md): quái dự bị
// được chấm bằng điểm lựa chọn tốt nhất của nó nếu đứng ở ô đó (cùng thang điểm lệnh của AI chung,
// nên đã tính khắc hệ, sát thương dự kiến, hiệu ứng). Không tốn RNG.

import { escapeBlockingRoom, isLargeMonster } from '../registries'
import { isTrapped } from './trapping'
import type { BattleCommand, BattleSide, GameData, Monster } from '../model'
import { Draft, aliveOnField, canEnterSlot, reservesOnSide, slotsOf } from './draft'
import { bestCandidateScore } from './ai'

/** Quái dự bị còn sống của phe, xếp theo điểm ở ô `slot` giảm dần (bằng điểm thì giữ thứ tự đội). */
function rankedReserves(
  data: GameData,
  d: Draft,
  { side, slot, exclude }: { side: BattleSide; slot: number; exclude: ReadonlySet<string> }
): { monster: Monster; score: number }[] {
  return reservesOnSide(data, d, side)
    .filter((monster) => !exclude.has(monster.id))
    .map((monster) => ({
      monster,
      score: bestCandidateScore(data, d, { side, slot, user: monster })
    }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Quái thay cho các ô trống `slots` (theo thứ tự ô): mỗi ô lấy quái dự bị điểm cao nhất chưa được
 * chọn mà vào được ô đó; quái lớn (docs/rules/monster-size.md) chỉ khi mọi ô còn trống, điểm × số ô
 * (hành động mỗi ô) và lấy hết ô. Không còn quái vào được thì ô để trống.
 */
export function chooseReplacements(
  data: GameData,
  d: Draft,
  side: BattleSide,
  slots: readonly number[]
): { slot: number; monster: Monster }[] {
  const chosen = new Set<string>()
  const current = [...slotsOf(d.battle, side)]
  const result: { slot: number; monster: Monster }[] = []
  for (const slot of slots) {
    if (current[slot] !== null) continue
    const [best] = rankedReserves(data, d, { side, slot, exclude: chosen }).filter(({ monster }) =>
      canEnterSlot(data, current, { slot, monster })
    )
    if (!best) continue
    chosen.add(best.monster.id)
    if (isLargeMonster(data, best.monster)) current.fill(best.monster.id)
    else current[slot] = best.monster.id
    result.push({ slot, monster: best.monster })
  }
  return result
}

/**
 * NPC hồ sơ `switcher` đổi quái khi bất lợi nặng: quái trên sân (đã ở sân từ lượt trước) có điểm
 * lựa chọn tốt nhất < switchRatio × điểm quái dự bị tốt nhất (≥ switchMinScore) thì lệnh của nó đổi
 * thành đổi sang quái đó. Room chặn đổi quái thì không đổi. Lệnh hợp kích giữ nguyên.
 */
export function withAiSwitches(
  data: GameData,
  d: Draft,
  side: BattleSide,
  commands: readonly BattleCommand[]
): BattleCommand[] {
  const trainer = d.battle.trainer
  if (side !== 'enemy' || !trainer) return [...commands]
  if (data.trainers[trainer.classId].aiProfile !== 'switcher') return [...commands]
  if (escapeBlockingRoom(data, d.battle.field) !== null) return [...commands]
  if (commands.some((command) => command.kind === 'combo')) return [...commands]
  const { switchRatio, switchMinScore } = data.config.trainers.ai
  const claimed = new Set<string>()
  const result = [...commands]
  for (const { slot, monster } of aliveOnField(data, d, side)) {
    if ((d.battle.volatiles[monster.id]?.firstTurn ?? 0) >= d.battle.turn) continue
    // Quái lớn không đổi ra, quái lớn dự bị không đổi vào (cần cả hai ô cùng rút;
    // docs/rules/monster-size.md).
    if (isLargeMonster(data, monster)) continue
    // Bị giữ chân (Bind, Mean Look) thì không đổi ra được.
    if (isTrapped(data, d, monster)) continue
    const [best] = rankedReserves(data, d, { side, slot, exclude: claimed }).filter(
      (entry) => !isLargeMonster(data, entry.monster)
    )
    if (!best || best.score < switchMinScore) continue
    const current = bestCandidateScore(data, d, { side, slot, user: monster })
    if (current >= switchRatio * best.score) continue
    claimed.add(best.monster.id)
    const index = result.findIndex((command) => command.slot === slot)
    const command: BattleCommand = { slot, kind: 'switch', monsterId: best.monster.id }
    if (index >= 0) result[index] = command
    else result.push(command)
  }
  return result
}
