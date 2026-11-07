// Fusion Power (docs/rules/fusion-power.md, Fusion Power của Cassette Beasts): chiêu riêng của thực thể
// hợp thể. Chiêu thật sinh theo cặp loài theo thứ tự hợp thể (quái chính, quái phụ), cố định cho mỗi
// cặp như bảng của gốc: hệ (tiền tố) là hệ của một trong hai quái; hậu tố quyết định một địch / cả
// phe, cận chiến / tầm xa, kèm buff lên mình hay debuff lên địch; power theo loại.

import { mergePartnerOf, type GameData, type Monster, type Skill } from '../model'
import { activeTransform } from '../monster'
import { hashToUnit } from '../shared'

/** Phần tử thứ ⌊unit × độ dài⌋ (unit trong [0, 1)); danh sách rỗng thì undefined. */
function pickByUnit<T>(unit: number, items: readonly T[]): T | undefined {
  return items[Math.min(items.length - 1, Math.floor(unit * items.length))]
}

/** Lựa chọn cố định của cặp (hai loài theo thứ tự) cho một phần của chiêu. */
const pairUnit = (lead: Monster, partner: Monster, part: string): number =>
  hashToUnit('fusionPower', lead.speciesId, partner.speciesId, part)

/**
 * Chiêu Fusion Power thật của thực thể hợp thể `user` (skill gốc `base` có cờ `fusionPower`); không
 * phải thực thể hợp thể thì trả skill gốc.
 */
export function fusionPowerSkill(data: GameData, user: Monster, base: Skill): Skill {
  const partner = mergePartnerOf(user)
  const transform = activeTransform(user)
  if (!partner || !transform) return base
  const config = data.config.fusionPower
  const elements = [transform.originalElementIds[0], partner.elementIds[0]].filter(
    (id): id is string => id !== undefined
  )
  const elementId = pickByUnit(pairUnit(user, partner, 'prefix'), elements) ?? base.elementId
  const team = pairUnit(user, partner, 'target') < 0.5
  const ranged = pairUnit(user, partner, 'reach') < 0.5
  const buff = pairUnit(user, partner, 'kind') < 0.5
  const contact = config.contactStatusByElement[elementId]
  const pool = buff
    ? [...config.buffStatusIds, ...(contact ? [contact] : [])]
    : config.debuffStatusIds
  const statusId = pickByUnit(pairUnit(user, partner, 'status'), pool)
  const power = team
    ? buff
      ? config.power.teamBuff
      : config.power.teamDebuff
    : config.power.single
  const { contact: _contact, ...rest } = base
  return {
    ...rest,
    elementId,
    category: ranged ? 'special' : 'physical',
    reach: ranged ? 'ranged' : 'melee',
    ...(ranged ? {} : { contact: true }),
    target: team ? 'allEnemies' : 'enemy',
    // Power cả phe của gốc đã thấp hơn: không giảm thêm khi đánh nhiều mục tiêu.
    ...(team ? { fullSpread: true } : {}),
    power,
    effects: statusId
      ? [
          {
            type: 'applyStatus',
            params: {
              statusId,
              turns: config.shortStatusTurns[statusId] ?? config.statusTurns,
              ...(buff ? { self: true } : {})
            }
          }
        ]
      : []
  }
}
