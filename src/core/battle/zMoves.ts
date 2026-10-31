// Z-Move (docs/rules/z-moves.md): quái cầm Z-Crystal dùng skill hợp crystal thành Z-Move, mỗi phe một
// lần mỗi trận, cần Vòng Z (NPC biến hình được thì coi như có). Skill gây sát thương thành Z-Move của
// hệ (cùng loại, power theo bảng / zPower, một mục tiêu, luôn trúng, xuyên protect một phần) hoặc
// Z-Move riêng của loài; skill trạng thái giữ nguyên và chạy thêm Z-Power trước skill.

import { hasItem, zCrystalFor } from '../inventory'
import { zPowerEffects } from '../registries'
import { ActionError, malformedAction } from '../shared'
import type { BattleCommand, BattleSide, GameData, Monster, Skill, ZMoveFailReason } from '../model'
import { Draft, findMonster, log, slotsOf } from './draft'
import { maxMovePower } from './maxMoves'
import { isDynamaxed, trainerCanTransform } from './transform'
import { runTraitEffects } from './traitEffects'

/** Z-Move theo hệ, tính một lần cho mỗi bộ dữ liệu. */
const zMoveCache = new WeakMap<GameData['skills'], Map<string, Skill>>()

function elementZMove(data: GameData, elementId: string): Skill | undefined {
  let index = zMoveCache.get(data.skills)
  if (!index) {
    index = new Map()
    for (const skill of Object.values(data.skills)) {
      if (skill.zMove === 'z') index.set(skill.elementId, skill)
    }
    zMoveCache.set(data.skills, index)
  }
  return index.get(elementId)
}

/**
 * Power Z-Move của skill gây sát thương: `zPower` của skill nếu có (số riêng như Pokémon), không thì
 * bảng theo power; skill đánh nhiều lần với số đòn thay đổi nhân power trước khi tra bảng.
 */
export function zMovePower(data: GameData, skill: Skill): number {
  if (skill.zPower !== undefined) return skill.zPower
  const config = data.config.transform.zMove
  const variableHits = skill.hits !== undefined && skill.hits.min !== skill.hits.max
  const power = variableHits ? skill.power * config.variableHitsPowerFactor : skill.power
  return maxMovePower(config.powerTable, power)
}

/**
 * Skill thật khi quái dùng `skill` thành Z-Move; null nếu quái không cầm crystal hợp skill. Crystal
 * loài: Z-Move riêng (số cố định của nó). Crystal hệ: skill gây sát thương thành Z-Move của hệ gốc
 * của skill (cùng loại, power zMovePower, một mục tiêu; mất hiệu ứng / thế / synergy của skill gốc),
 * skill trạng thái giữ nguyên (Z-Power chạy ở startZMove).
 */
export function zMoveFor(data: GameData, user: Monster, skill: Skill): Skill | null {
  const crystal = zCrystalFor(data, user, skill)
  if (!crystal) return null
  if (crystal.zSkillId !== undefined) return data.skills[crystal.zSkillId]
  if (skill.power <= 0) return skill
  const zMove = elementZMove(data, skill.elementId)
  if (!zMove) throw new Error(`Thiếu Z-Move của hệ "${skill.elementId}"`)
  return { ...zMove, category: skill.category, power: zMovePower(data, skill), target: 'enemy' }
}

/**
 * Lý do quái không dùng Z-Move từ `skill` được (null = được): trận độ kiếp, thiếu Vòng Z (quái hoang /
 * boss không có túi đồ; NPC biến hình được thì có), phe đã dùng Z-Move, quái đang / sắp Dynamax
 * (`dynamaxing`: lệnh cùng lượt xin Dynamax), không cầm crystal hợp skill.
 */
export function zMoveBlocker(
  data: GameData,
  d: Draft,
  {
    side,
    monster,
    skill,
    dynamaxing = false
  }: { side: BattleSide; monster: Monster; skill: Skill; dynamaxing?: boolean }
): ZMoveFailReason | null {
  if (d.battle.tribulation) return 'tribulation'
  const hasRing =
    side === 'enemy'
      ? trainerCanTransform(data, d)
      : hasItem(d.inventory, data.config.transform.zMove.keyItemId)
  if (!hasRing) return 'noKeyItem'
  if (d.battle.zMoveUsed[side]) return 'alreadyUsedBySide'
  if (dynamaxing || isDynamaxed(monster)) return 'dynamaxed'
  return zCrystalFor(data, monster, skill) ? null : 'noCrystal'
}

/**
 * Kiểm tra lệnh Z-Move của người chơi trong lượt (trước khi đụng state): `zMove` chỉ ghi true, không
 * kèm thế, đủ điều kiện, mỗi lượt tối đa một quái (mỗi phe một lần mỗi trận).
 */
export function validateZMoveCommands(
  data: GameData,
  d: Draft,
  commands: readonly BattleCommand[]
): void {
  let requested = false
  for (const command of commands) {
    if (command.kind !== 'skill' || command.zMove === undefined) continue
    if (command.zMove !== true) throw malformedAction('zMove chỉ được ghi true')
    if (command.style !== undefined) throw malformedAction('Z-Move không dùng thế')
    const monster = findMonster(d, slotsOf(d.battle, 'player')[command.slot] as string)
    const fail = (reason: ZMoveFailReason): ActionError =>
      new ActionError('zMoveUnavailable', {
        monsterId: monster.id,
        skillId: command.skillId,
        reason
      })
    if (requested) throw fail('alreadyUsedBySide')
    const reason = zMoveBlocker(data, d, {
      side: 'player',
      monster,
      skill: data.skills[command.skillId],
      dynamaxing: command.transform === 'dynamax'
    })
    if (reason) throw fail(reason)
    requested = true
  }
}

/**
 * Quái bắt đầu dùng Z-Move (lúc tới lượt, sau khi không mất lượt): phe hết lượt Z-Move, log, Z-Power
 * của skill trạng thái lên chính nó. Trả về skill thật; null nếu lúc này không dùng được nữa (skill
 * thường).
 */
export function startZMove(
  data: GameData,
  d: Draft,
  { side, user, skill }: { side: BattleSide; user: Monster; skill: Skill }
): Skill | null {
  if (zMoveBlocker(data, d, { side, monster: user, skill })) return null
  const zSkill = zMoveFor(data, user, skill)
  if (!zSkill) return null
  d.battle.zMoveUsed[side] = true
  log(d, { type: 'zMoveUsed', monsterId: user.id, skillId: skill.id, zSkillId: zSkill.id })
  runTraitEffects(data, d, { owner: user, scale: 1 }, zPowerEffects(zSkill))
  return zSkill
}
