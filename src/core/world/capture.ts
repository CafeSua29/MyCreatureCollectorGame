// Tỉ lệ bắt quái (%), kẹp trong [0, 100] (mục "Bắt quái" ở battle.md):
//   catchRate(loài) × hệ số bóng × điều kiện bóng × hệ số HP × hệ số trạng thái × hệ số trait
//   × hệ số người chơi ÷ bossMultiplier; bóng alwaysCatch (Master Ball) = 100.
// Hệ số HP tuyến tính có sàn: sàn + (1 − sàn) × (1 − hp / maxHp)
//   → đầy máu = sàn (mặc định 10%), càng ít máu càng gần 1.
// Bắt trượt (mục "Bắt trượt" ở battle.md): cộng thẳng pityPercentPerMiss × số lần trượt vào tỉ lệ
// cuối, sau mọi hệ số, kẹp 100.
// Lắc bóng / bắt chí mạng (rollCapture): shakeChecks lần kiểm, mỗi lần qua với xác suất
// tỉ lệ ^ (1 / shakeChecks); chí mạng chỉ cần qua một lần.

import { getBaseSpecies, getCurrentHp, getMaxHp } from '../monster'
import { forEachTraitHook } from '../registries'
import { bigToNumber, rollPercent, type RngState } from '../shared'
import type { BallItem, GameData, Monster } from '../model'

export function hpCatchFactor(data: GameData, monster: Monster): number {
  const floor = data.config.capture.hpFloorPercent / 100
  // Tỉ lệ máu nằm trong [0, 1] nên đổi sang number an toàn dù HP lớn vô hạn.
  const hpRatio = bigToNumber(getCurrentHp(data, monster).div(getMaxHp(data, monster)))
  return floor + (1 - floor) * (1 - hpRatio)
}

/** Hệ số trạng thái bất thường: số lớn nhất trong các trạng thái quái mang (không có = 1). */
export function statusCatchFactor(data: GameData, monster: Monster): number {
  return monster.statuses.reduce(
    (best, { statusId }) => Math.max(best, data.statuses[statusId]?.catchMultiplier ?? 1),
    1
  )
}

function traitCatchMultiplier(data: GameData, monster: Monster): number {
  let multiplier = 1
  forEachTraitHook(data, monster, (handler, params, scale) => {
    if (handler.modifyCatchRate) {
      multiplier *= handler.modifyCatchRate(params, scale, { data, monster })
    }
  })
  return multiplier
}

/**
 * Tỉ lệ bắt (%) khi ném bóng ball vào quái hoang target, chưa tính bắt trượt. `playerMultiplier`:
 * hệ số từ phía người chơi (kỹ năng đồng hành); `bonusMultiplier`: điều kiện của bóng đã tính sẵn
 * (`ballBonusMultiplier`); `catchRateBonus`: điểm cộng vào catchRate (`ballCatchRateBonus`, Heavy
 * Ball). Bóng Bảo Tồn của khu bảo tồn chỉ có hệ số.
 */
export function catchChance(
  data: GameData,
  target: Monster,
  ball: Pick<BallItem, 'catchMultiplier' | 'alwaysCatch'>,
  {
    playerMultiplier = 1,
    bonusMultiplier = 1,
    catchRateBonus = 0
  }: { playerMultiplier?: number; bonusMultiplier?: number; catchRateBonus?: number } = {}
): number {
  if (ball.alwaysCatch) return 100
  const species = getBaseSpecies(data, target)
  if (!species) return 0
  // Heavy Ball cộng thẳng vào catchRate, tối thiểu 1 (như Pokémon).
  const catchRate =
    catchRateBonus === 0 ? species.catchRate : Math.max(1, species.catchRate + catchRateBonus)
  const chance =
    (catchRate *
      ball.catchMultiplier *
      bonusMultiplier *
      hpCatchFactor(data, target) *
      statusCatchFactor(data, target) *
      traitCatchMultiplier(data, target) *
      playerMultiplier) /
    target.bossMultiplier
  return Math.min(100, Math.max(0, chance))
}

/** Tỉ lệ bắt (%) sau khi cộng bắt trượt: `misses` lần trượt vào đúng quái này, kẹp 0–100. */
export function withCatchPity(data: GameData, chance: number, misses: number): number {
  return Math.min(100, Math.max(0, chance + misses * data.config.capture.pityPercentPerMiss))
}

/** Kết quả một lần ném: bắt được không, chí mạng không, số lần lắc trước khi thoát / bắt (0–3). */
export interface CaptureRoll {
  caught: boolean
  critical: boolean
  shakes: number
  rng: RngState
}

/**
 * Tung một lần ném với tỉ lệ `chance` (%): chí mạng (tỉ lệ × `criticalMultiplier` / criticalDivisor %,
 * hệ số theo Dex: criticalCaptureMultiplier) chỉ kiểm một lần, không
 * thì kiểm shakeChecks lần, mỗi lần qua với xác suất (tỉ lệ / 100) ^ (1 / shakeChecks). Tỉ lệ 0 / 100
 * không tốn RNG. `shakes`: số lần lắc UI hiện (Pokémon: tối đa 3, bắt chí mạng 1).
 */
export function rollCapture(
  data: GameData,
  rng: RngState,
  { chance, criticalMultiplier }: { chance: number; criticalMultiplier: number }
): CaptureRoll {
  const { shakeChecks, criticalDivisor } = data.config.capture
  let critical: boolean
  ;[critical, rng] = rollPercent(rng, (chance * criticalMultiplier) / criticalDivisor)
  const checks = critical ? 1 : shakeChecks
  const perCheck = 100 * (Math.min(100, Math.max(0, chance)) / 100) ** (1 / shakeChecks)
  let passed = 0
  while (passed < checks) {
    let ok: boolean
    ;[ok, rng] = rollPercent(rng, perCheck)
    if (!ok) break
    passed++
  }
  const caught = passed === checks
  // Pokémon lắc 3 lần rồi bắt (4 lần kiểm); số lắc = lần kiểm đã qua, tối đa 3 (chí mạng: 1).
  const shakes = Math.min(caught ? checks : passed, critical ? 1 : 3)
  return { caught, critical, shakes, rng }
}
