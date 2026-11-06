// Chọn mục tiêu của skill (mục "Skill" và "Buff và debuff" ở battle.md): mục tiêu đã gục thì chuyển
// sang địch còn lại; địch tàng hình (Invisible) không bị nhắm đơn mục tiêu (trừ khi mọi địch đều
// tàng hình hoặc quái dùng nhìn thấy); địch đang khiêu khích kéo đòn đơn mục tiêu; đồng đội của
// mục tiêu có trait chặn đòn nhận thay; Blind / trait mục tiêu ngẫu nhiên đổi sang địch ngẫu nhiên;
// Confused đánh nhầm đồng đội. Đổi mục tiêu thì log `redirected`.

import { isFainted } from '../monster'
import {
  forEachTraitHook,
  hasAbilityFlag,
  hasStatusFlag,
  findStatusHook,
  hasTraitFlag
} from '../registries'
import { pick, rollPercent } from '../shared'
import {
  isOffensiveTarget,
  type BattleSide,
  type GameData,
  type Monster,
  type Skill
} from '../model'
import {
  Draft,
  aliveOnField,
  clockwiseFrom,
  log,
  monsterBattleContext,
  opponentOf,
  sideOf
} from './draft'
import { emitTraitEvent } from './eventQueue'

export interface TargetRequest {
  side: BattleSide
  slot: number
  user: Monster
  skill: Skill
  targetSlot?: number
  /** Mục tiêu chỉ định theo id (đòn / spell do trait). */
  targetId?: string
}

const isUntargetable = (data: GameData, monster: Monster): boolean =>
  hasStatusFlag(data, monster, (handler, params) => handler.untargetable?.(params))

/** Chọn ngẫu nhiên một phần tử (danh sách không rỗng). */
function pickOne<T>(d: Draft, items: readonly T[]): T {
  let chosen: T
  ;[chosen, d.rng] = pick(d.rng, items)
  return chosen
}

/** Địch nhắm được: bỏ địch tàng hình trừ khi quái dùng nhìn thấy hoặc mọi địch đều tàng hình. */
function targetableFoes(
  data: GameData,
  d: Draft,
  user: Monster,
  foes: readonly Monster[]
): Monster[] {
  const sees = hasTraitFlag(
    data,
    user,
    (handler, params) => handler.seesInvisible?.(params),
    monsterBattleContext(data, d, user)
  )
  if (sees) return [...foes]
  const visible = foes.filter((foe) => !isUntargetable(data, foe))
  return visible.length > 0 ? visible : [...foes]
}

/** Đồng đội của `target` chặn đòn nhắm nó (trait intercept), theo thứ tự ô; null = không ai. */
function interceptor(data: GameData, d: Draft, user: Monster, target: Monster): Monster | null {
  for (const { monster: ally } of aliveOnField(data, d, sideOf(d, target.id))) {
    if (ally.id === target.id) continue
    const ctx = monsterBattleContext(data, d, ally)
    const view = { data, self: ally, selfCtx: ctx, subject: target, other: user }
    let chance = 0
    forEachTraitHook(
      data,
      ally,
      (handler, params, scale) => {
        chance = Math.max(chance, handler.interceptChance?.(params, scale, view) ?? 0)
      },
      ctx
    )
    if (chance <= 0) continue
    let hit: boolean
    ;[hit, d.rng] = rollPercent(d.rng, chance)
    if (hit) return ally
  }
  return null
}

/**
 * Mục tiêu đẩy đòn đơn nhắm nó sang đồng đội (hook `redirectToAlly`: Puppet Master, Shared Pain của
 * Temtem); null = không đẩy hoặc không có đồng đội còn sống.
 */
function redirectedToAlly(
  data: GameData,
  d: Draft,
  user: Monster,
  target: Monster
): Monster | null {
  const ally = aliveOnField(data, d, sideOf(d, target.id)).find(
    (entry) => entry.monster.id !== target.id
  )?.monster
  if (!ally) return null
  const ctx = monsterBattleContext(data, d, target)
  const view = { data, self: target, selfCtx: ctx, other: user }
  const redirects = hasTraitFlag(
    data,
    target,
    (handler, params) => handler.redirectsToAlly?.(params, view),
    ctx
  )
  return redirects ? ally : null
}

/** % đòn đơn mục tiêu của quái dùng đổi sang mục tiêu ngẫu nhiên (trait / hào quang). */
function randomTargetChance(data: GameData, d: Draft, user: Monster): number {
  let miss = 1
  forEachTraitHook(
    data,
    user,
    (handler, params, scale) => {
      miss *= 1 - Math.min(100, handler.randomTargetChance?.(params, scale) ?? 0) / 100
    },
    monsterBattleContext(data, d, user)
  )
  return (1 - miss) * 100
}

const rolls = (d: Draft, chance: number): boolean => {
  if (chance <= 0) return false
  let hit: boolean
  ;[hit, d.rng] = rollPercent(d.rng, chance)
  return hit
}

/** Mục tiêu đơn trên phe địch sau mọi luật đổi mục tiêu. */
function singleFoeTarget(data: GameData, d: Draft, req: TargetRequest): Monster | undefined {
  const { side, user } = req
  const opponents = aliveOnField(data, d, opponentOf(side))
  if (opponents.length === 0) return undefined
  const explicit = opponents.find((entry) => entry.monster.id === req.targetId)
  if (explicit) return explicit.monster
  const foes = targetableFoes(
    data,
    d,
    user,
    opponents.map((entry) => entry.monster)
  )
  const preferred = opponents.find((entry) => entry.slot === (req.targetSlot ?? 0))?.monster
  let chosen = preferred && foes.includes(preferred) ? preferred : foes[0]
  const original = chosen
  const provoker =
    req.skill.ignoresRedirect || hasAbilityFlag(data, user, 'ignoresRedirect')
      ? undefined
      : foes.find((foe) => d.battle.volatiles[foe.id]?.provoking === d.battle.turn)
  if (provoker && provoker.id !== chosen.id) chosen = provoker
  const guardian = interceptor(data, d, user, chosen)
  if (guardian) chosen = guardian
  const pushed = guardian ? null : redirectedToAlly(data, d, user, chosen)
  if (pushed) chosen = pushed
  const blind = hasStatusFlag(data, user, (handler, params) => handler.randomizesTarget?.(params))
  if (blind || rolls(d, randomTargetChance(data, d, user))) chosen = pickOne(d, foes)
  if (chosen.id !== original.id)
    log(d, { type: 'redirected', monsterId: chosen.id, fromId: original.id })
  return chosen
}

/** Confused: skill gây hại đơn mục tiêu nhắm sang một đồng đội (nếu có) theo tỉ lệ. */
function confusedTarget(data: GameData, d: Draft, req: TargetRequest): Monster | undefined {
  const confusion = findStatusHook(data, req.user, (handler, params) =>
    handler.confusionChance?.(params)
  )
  if (!confusion || !rolls(d, confusion.value)) return undefined
  const allies = aliveOnField(data, d, req.side)
    .map((entry) => entry.monster)
    .filter((ally) => ally.id !== req.user.id)
  return allies.length > 0 ? pickOne(d, allies) : undefined
}

/** Mục tiêu thật của lần dùng skill (sau mọi luật đổi mục tiêu, Individualist). */
export function resolveTargets(data: GameData, d: Draft, req: TargetRequest): Monster[] {
  const targets = chainedTargets(data, d, req, rawTargets(data, d, req))
  // Individualist của Temtem: đòn gây hại của quái mang không trúng đồng đội.
  const harmful = req.skill.power > 0 || isOffensiveTarget(req.skill.target)
  if (!harmful || !hasAbilityFlag(data, req.user, 'sparesAllies')) return targets
  return targets.filter(
    (target) => target.id === req.user.id || sideOf(d, target.id) !== sideOf(d, req.user.id)
  )
}

/** Chuỗi (`Skill.chain`): sau mục tiêu đầu, các quái kế tiếp theo chiều kim đồng hồ (kể cả quái dùng). */
function chainedTargets(
  data: GameData,
  d: Draft,
  req: TargetRequest,
  targets: Monster[]
): Monster[] {
  const chain = req.skill.chain
  if (!chain) return targets
  // Chuỗi nhắm đồng đội mà không có đồng đội: bắt đầu từ chính quái dùng (Chain Heal khi đứng một mình).
  const first = targets[0] ?? (req.skill.target === 'ally' ? req.user : undefined)
  if (!first || targets.length > 1) return targets
  return [first, ...clockwiseFrom(data, d, first.id).slice(0, chain.steps - 1)]
}

function rawTargets(data: GameData, d: Draft, req: TargetRequest): Monster[] {
  const { side, user, skill } = req
  switch (skill.target) {
    case 'self':
      return [user]
    case 'ally': {
      // Quái lớn chiếm cả hai ô nên không có đồng đội (docs/rules/monster-size.md).
      const ally = aliveOnField(data, d, side).find((entry) => entry.monster.id !== user.id)
      return ally ? [ally.monster] : []
    }
    case 'allAllies': {
      const ally = aliveOnField(data, d, side).find((entry) => entry.monster.id !== user.id)
      return ally ? [user, ally.monster] : [user]
    }
    case 'enemy': {
      const confused = confusedTarget(data, d, req)
      if (confused) {
        log(d, { type: 'redirected', monsterId: confused.id, fromId: user.id })
        return [confused]
      }
      const target = singleFoeTarget(data, d, req)
      if (!target || isFainted(data, target)) return []
      if (skill.category !== 'physical') {
        emitTraitEvent(d, {
          type: 'spellTargeted',
          subjectId: target.id,
          otherId: user.id,
          skillId: skill.id
        })
      }
      return [target]
    }
    case 'allEnemies':
    case 'foesOrAlly':
      return aliveOnField(data, d, opponentOf(side)).map((entry) => entry.monster)
    case 'allOthers':
    case 'all': {
      // Địch trước, rồi đồng đội, rồi chính quái dùng (all) như thứ tự trúng đòn của gốc.
      const foes = aliveOnField(data, d, opponentOf(side)).map((entry) => entry.monster)
      const own = aliveOnField(data, d, side).map((entry) => entry.monster)
      const allies = own.filter((monster) => monster.id !== user.id)
      return skill.target === 'all' ? [...foes, ...allies, user] : [...foes, ...allies]
    }
  }
}
