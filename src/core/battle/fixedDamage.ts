// Sát thương cố định / theo máu / hạ gục một đòn của skill (docs/rules/pokemon-moves.md mục "Sát
// thương cố định"), như chiêu Pokémon: Dragon Rage, Night Shade, Psywave, Super Fang, Endeavor, Final
// Gambit, Fissure. Không qua công thức công / thủ, không chí mạng, không khắc hệ (miễn nhiễm vẫn
// chặn: công thức gọi sau khi xét hệ số khắc chế 0).

import { getCurrentHp, getMaxHp } from '../monster'
import {
  BIG_ZERO,
  assertNever,
  maxBig,
  nextFloat,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import type { FixedDamage, GameData, Monster, MonsterBattleContext, Skill } from '../model'

/** Loại sát thương cố định tính theo máu của mục tiêu. */
const HP_BASED_FIXED_DAMAGE: readonly FixedDamage['kind'][] = [
  'targetHpPercent',
  'hpDifference',
  'ohko'
]

/** Đầu vào: hai quái của đòn. */
export interface FixedDamageInput {
  data: GameData
  attacker: Monster
  defender: Monster
  skill: Skill
  /** Bối cảnh trận của quái dùng (đòn trả đọc nhật ký trong lượt); bỏ trống = ngoài trận. */
  attackerContext?: MonsterBattleContext
}

/**
 * Lượng sát thương cố định của đòn (đánh thật: tung dao động của Psywave bằng `rng`; AI: `rng`
 * bỏ trống thì lấy trung bình). Không cố định thì undefined.
 */
export function fixedDamageAmount(
  input: FixedDamageInput,
  rng?: RngState
): { amount: Decimal; rng?: RngState } | undefined {
  const spec = input.skill.fixedDamage
  if (!spec) return undefined
  return computeFixed(input, spec, rng)
}

function computeFixed(
  { data, attacker, defender, attackerContext }: FixedDamageInput,
  spec: FixedDamage,
  rng: RngState | undefined
): { amount: Decimal; rng?: RngState } {
  const targetHp = getCurrentHp(data, defender)
  // HP vô hạn (boss thế giới, docs/rules/world-boss.md): đòn theo máu mục tiêu không có tác dụng (như
  // Max Raid của Pokémon: hạ gục một đòn thất bại).
  if (defender.endlessHp && HP_BASED_FIXED_DAMAGE.includes(spec.kind))
    return { amount: BIG_ZERO, rng }
  switch (spec.kind) {
    case 'flat':
      return { amount: toBig(spec.amount), rng }
    case 'level': {
      const min = spec.minPercent ?? 100
      const max = spec.maxPercent ?? 100
      if (!rng || min === max) {
        return {
          amount: maxBig(
            1,
            toBig(attacker.level)
              .times((min + max) / 200)
              .floor()
          ),
          rng
        }
      }
      const [roll, next] = nextFloat(rng)
      const percent = Math.floor(min + roll * (max - min + 1))
      return { amount: maxBig(1, toBig(attacker.level).times(percent).div(100).floor()), rng: next }
    }
    case 'maxHpPercent':
      return {
        amount: maxBig(1, getMaxHp(data, defender).times(spec.percent).div(100).floor()),
        rng
      }
    case 'targetHpPercent':
      return { amount: maxBig(1, targetHp.times(spec.percent).div(100).floor()), rng }
    case 'hpDifference': {
      // Endeavor: máu mục tiêu về bằng máu quái dùng; mục tiêu ít máu hơn thì không có tác dụng.
      const userHp = getCurrentHp(data, attacker)
      return { amount: targetHp.gt(userHp) ? targetHp.minus(userHp) : BIG_ZERO, rng }
    }
    case 'userHp':
      return { amount: getCurrentHp(data, attacker), rng }
    case 'counter': {
      // Đòn cuối cùng mục tiêu gây cho quái dùng trong lượt, đúng loại (như Pokémon); không có thì 0.
      const log = attackerContext?.volatiles[attacker.id]?.turnLog
      const hits =
        log?.turn === attackerContext?.battleTurn
          ? (log?.hits ?? []).filter(
              (hit) =>
                hit.by === defender.id &&
                (!spec.categories || spec.categories.includes(hit.category))
            )
          : []
      const last = hits[hits.length - 1]
      return {
        amount: last ? maxBig(1, last.amount.times(spec.multiplier).floor()) : BIG_ZERO,
        rng
      }
    }
    case 'ohko':
      return { amount: targetHp, rng }
    case 'stored': {
      const stored = attackerContext?.volatiles[attacker.id]?.bide?.damage ?? BIG_ZERO
      return { amount: stored.times(spec.multiplier).floor(), rng }
    }
    default:
      return assertNever(spec, 'sát thương cố định')
  }
}

/**
 * Accuracy của đòn hạ gục một đòn (như Pokémon): accuracy gốc (hoặc `accuracyIfNotElement` khi quái
 * dùng không mang hệ đó, Sheer Cold) + (level quái dùng − level mục tiêu); mục tiêu level cao hơn
 * hoặc mang hệ miễn (`immuneElementIds`) hoặc HP vô hạn thì 0. Không phải hạ gục một đòn: undefined.
 */
export function ohkoAccuracy(skill: Skill, user: Monster, target: Monster): number | undefined {
  const spec = skill.fixedDamage
  if (spec?.kind !== 'ohko') return undefined
  if (target.level > user.level || target.endlessHp) return 0
  if (target.elementIds.some((id) => spec.immuneElementIds?.includes(id))) return 0
  const notElement = spec.accuracyIfNotElement
  const base =
    notElement && !user.elementIds.includes(notElement.elementId)
      ? notElement.accuracy
      : skill.accuracy
  return Math.min(100, Math.max(0, base + user.level - target.level))
}
