// Tường (Wall của Cassette Beasts, docs/rules/cassette-mechanics.md): tường là trạng thái có hệ riêng
// (`StatusDef.wall`), lượt chặn còn lại ở `StatusInstance.amount`, thời hạn theo lượt như mọi trạng
// thái (mất khi rời sân, bị gỡ như buff). Chặn trọn đòn gây sát thương của phe địch; đòn khắc hệ của
// tường phá tường ngay rồi trúng như thường; Window, Ricochet, chiêu phá tường đi xuyên.

import {
  getMaxHp,
  isFainted,
  percentOfMaxHp,
  statusTurnsLeft,
  wallStatusesOf,
  type WallStatus
} from '../monster'
import { elementEffectiveness, forEachTraitHook, stickerSkillBonus } from '../registries'
import { BIG_ZERO, maxBig, pick, pickWeighted, rollPercent, toBig } from '../shared'
import type { GameData, Monster, Skill } from '../model'
import {
  Draft,
  aliveOnField,
  battleStats,
  findMonster,
  log,
  monsterBattleContext,
  opponentOf,
  sideOf,
  slotsOf
} from './draft'
import { statDamage } from './damage'
import { loseHp, removeStatus } from './hpChanges'
import { inflictStatus } from './statuses'
import { skillReach } from './reach'
import { changeStamina } from './stamina'
import { executeSkill } from './executeSkill'
import { runSkillEffects } from './skillResults'

/**
 * Dựng tường cho quái: `hpCostPercent`: quái dùng mất % max HP (chỉ khi là skill). Tường đặc biệt gỡ
 * tường thường đang có; tường thường thay nhau (nhóm loại trừ) và không gỡ tường đặc biệt, như gốc.
 */
export function raiseWall(
  data: GameData,
  d: Draft,
  {
    user,
    monsterId,
    statusId,
    turns,
    hpCostPercent,
    skillId
  }: {
    user: Monster
    monsterId: string
    statusId: string
    turns?: number
    hpCostPercent?: number
    /** Skill dựng tường (log mất máu); null = không phải skill. */
    skillId: string | null
  }
): void {
  const monster = findMonster(d, monsterId)
  if (isFainted(data, monster)) return
  if (hpCostPercent && skillId !== null && !isFainted(data, user)) {
    loseHp(data, d, user, percentOfMaxHp(getMaxHp(data, user), hpCostPercent), (amount) => ({
      type: 'selfDamage',
      monsterId: user.id,
      skillId,
      amount,
      reason: 'cost'
    }))
  }
  const wall = data.statuses[statusId].wall
  if (!wall) return
  if (wall.special) {
    for (const { statusId: other, def } of wallStatusesOf(data, monster)) {
      if (!def.special) removeStatus(d, monster, other)
    }
  }
  inflictStatus(data, d, monster, statusId, {
    source: user,
    amount: toBig(wall.hits),
    ...(turns ? { turns } : {})
  })
  if (monster.statuses.some((status) => status.statusId === statusId)) {
    log(d, { type: 'wallRaised', monsterId, statusId })
  }
}

/** Hệ thật của đòn để xét khắc tường; đòn không hệ không khắc gì. */
function attackElementOf(user: Monster, skill: Skill): string | null {
  if (skill.typeless) return null
  if (skill.elementFromUser === 'first') return user.elementIds[0] ?? null
  if (skill.elementFromUser === 'last') return user.elementIds.at(-1) ?? null
  return skill.elementId
}

/** % đòn tầm xa của quái đi xuyên tường (Ricochet); tung một lần mỗi đòn. */
function rollsPastWall(data: GameData, d: Draft, user: Monster, skill: Skill): boolean {
  if (skillReach(skill) !== 'ranged') return false
  let chance = 0
  forEachTraitHook(
    data,
    user,
    (handler, params) => {
      chance = Math.max(chance, handler.wallIgnoreChance?.(params) ?? 0)
    },
    monsterBattleContext(data, d, user)
  )
  if (chance <= 0) return false
  let passed: boolean
  ;[passed, d.rng] = rollPercent(d.rng, chance)
  return passed
}

/** Gỡ mọi tường của quái (Hurricane, Crumble); `userId`: quái phá tường. */
function breakWalls(data: GameData, d: Draft, monster: Monster, userId?: string): void {
  for (const { statusId } of wallStatusesOf(data, monster)) {
    removeStatus(d, monster, statusId)
    log(d, { type: 'wallBroken', monsterId: monster.id, ...(userId ? { userId } : {}) })
  }
}

/**
 * Một đòn gặp tường (tường mới nhất nhận đòn): khắc hệ của tường thì phá tường, đòn trúng như thường
 * (`false`); không thì tường chặn trọn đòn, mất một lượt chặn (`true`). Đòn của đồng đội, skill không
 * gây sát thương, miễn nhiễm, Window + tầm xa, Ricochet: không đụng tường (`false`).
 */
export function wallAbsorbs(
  data: GameData,
  d: Draft,
  {
    user,
    target,
    skill,
    effectiveness
  }: { user: Monster; target: Monster; skill: Skill; effectiveness: number }
): boolean {
  if (effectiveness === 0 || skill.power <= 0) return false
  if (sideOf(d, user.id) === sideOf(d, target.id)) return false
  const walls = wallStatusesOf(data, target)
  const wall = walls.at(-1)
  if (!wall) return false
  // Sticker Destroys Walls / Ignores Walls (docs/rules/skill-stickers.md).
  const sticker = stickerSkillBonus(data, user, skill.id)
  if (skill.destroysWalls || sticker.destroysWalls) {
    breakWalls(data, d, target, user.id)
    return false
  }
  if (sticker.ignoresWalls) return false
  const exposed = target.statuses.some((status) => data.statuses[status.statusId]?.seeThroughWall)
  if (exposed && skillReach(skill) === 'ranged') return false
  if (rollsPastWall(data, d, user, skill)) return false
  const elementId = attackElementOf(user, skill)
  if (elementId && elementEffectiveness(data, elementId, [wall.def.elementId]) > 1) {
    removeStatus(d, target, wall.statusId)
    log(d, { type: 'wallBroken', monsterId: target.id, userId: user.id })
    return false
  }
  blockWithWall(d, target, wall, user.id)
  runWallBlockEffects(data, d, { owner: target, attacker: user, def: wall.def })
  return true
}

/** Tường có kết quả khi chặn (Apple Tree): tung một kết quả theo trọng số, chạy lên kẻ đánh. */
function runWallBlockEffects(
  data: GameData,
  d: Draft,
  { owner, attacker, def }: { owner: Monster; attacker: Monster; def: WallStatus['def'] }
): void {
  if (!def.onBlocked || def.onBlocked.length === 0 || isFainted(data, attacker)) return
  let outcome: (typeof def.onBlocked)[number]
  ;[outcome, d.rng] = pickWeighted(d.rng, def.onBlocked, (entry) => entry.weight)
  runSkillEffects(
    data,
    d,
    { user: owner, target: attacker, damageDealt: BIG_ZERO, skillId: null, shielded: false },
    outcome.effects
  )
}

/** Tường chặn một đòn: bớt một lượt chặn, hết thì vỡ. */
function blockWithWall(d: Draft, target: Monster, wall: WallStatus, userId: string): void {
  const hitsLeft = wall.hitsLeft - 1
  log(d, { type: 'wallBlocked', monsterId: target.id, userId, hitsLeft })
  if (hitsLeft <= 0) {
    removeStatus(d, target, wall.statusId)
    log(d, { type: 'wallBroken', monsterId: target.id })
    return
  }
  target.statuses = target.statuses.map((status) =>
    status.statusId === wall.statusId ? { ...status, amount: toBig(hitsLeft) } : status
  )
}

/** Revolving Door: tường mới nhất của `fromId` chuyển sang `toId`, giữ lượt chặn và thời hạn. */
export function stealWall(
  data: GameData,
  d: Draft,
  { fromId, toId }: { fromId: string; toId: string }
): void {
  if (fromId === toId) return
  const from = findMonster(d, fromId)
  const to = findMonster(d, toId)
  const wall = wallStatusesOf(data, from).at(-1)
  if (!wall || isFainted(data, to)) return
  const instance = from.statuses.find((status) => status.statusId === wall.statusId)
  if (!instance) return
  removeStatus(d, from, wall.statusId)
  // Cùng luật thay thế như dựng tường: tường thường thay nhau, tường đặc biệt gỡ tường thường.
  for (const { statusId, def } of wallStatusesOf(data, to)) {
    if (!def.special) removeStatus(d, to, statusId)
  }
  to.statuses = [...to.statuses.filter((s) => s.statusId !== wall.statusId), instance]
  log(d, { type: 'wallStolen', monsterId: toId, fromId })
}

/** Phá tường của quái, trả về số lượt tường còn lại (null = không có tường). Recycle, Throw. */
export function consumeWall(data: GameData, d: Draft, monster: Monster): number | null {
  const wall = wallStatusesOf(data, monster).at(-1)
  if (!wall) return null
  const turnsLeft = statusTurnsLeft(monster, wall.statusId)
  removeStatus(d, monster, wall.statusId)
  log(d, { type: 'wallBroken', monsterId: monster.id })
  return turnsLeft ?? 1
}

/** Recycle: phá tường của quái, hồi thể lực theo lượt còn lại của tường (gốc: 1 AP mỗi lượt). */
export function recycleWall(
  data: GameData,
  d: Draft,
  { monsterId, staminaPerTurn }: { monsterId: string; staminaPerTurn: number }
): boolean {
  const monster = findMonster(d, monsterId)
  const turns = consumeWall(data, d, monster)
  if (turns === null) return false
  changeStamina(data, d, monster, turns * staminaPerTurn)
  return true
}

/**
 * Crumble: phá mọi tường trên sân; mỗi quái có tường mất máu theo đòn `power` × lượt tường còn lại
 * của quái dùng (đặc công / đặc thủ, khắc hệ theo hệ `elementId`).
 */
export function crumbleWalls(
  data: GameData,
  d: Draft,
  { user, power, elementId }: { user: Monster; power: number; elementId: string }
): void {
  const attack = battleStats(data, d, user).spAttack
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      const walls = wallStatusesOf(data, monster)
      if (walls.length === 0) continue
      const turns = walls.reduce(
        (sum, { statusId }) => sum + (statusTurnsLeft(monster, statusId) ?? 1),
        0
      )
      breakWalls(data, d, monster, user.id)
      const raw = statDamage(data, {
        attackStat: attack,
        defense: battleStats(data, d, monster).spDefense,
        power: power * turns
      }).times(elementEffectiveness(data, elementId, monster.elementIds))
      if (raw.lte(0)) continue
      loseHp(
        data,
        d,
        monster,
        maxBig(1, raw.ceil()),
        (amount) => ({ type: 'traitDamage', monsterId: monster.id, amount }),
        { kind: 'indirect', source: user }
      )
    }
  }
}

/** Đầu lượt của quái: tường có đòn riêng (Abramacabra) đánh một địch ngẫu nhiên. */
export function wallAttacksOnAction(data: GameData, d: Draft, user: Monster): void {
  for (const { def } of wallStatusesOf(data, user)) {
    if (!def.attackSkillId || isFainted(data, user)) continue
    const side = sideOf(d, user.id)
    const foes = aliveOnField(data, d, opponentOf(side))
    if (foes.length === 0) return
    let chosen: (typeof foes)[number]
    ;[chosen, d.rng] = pick(d.rng, foes)
    executeSkill(data, d, {
      side,
      slot: slotsOf(d.battle, side).indexOf(user.id),
      user,
      skill: data.skills[def.attackSkillId],
      targetId: chosen.monster.id,
      reactive: true
    })
  }
}
