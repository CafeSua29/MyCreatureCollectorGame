// Kiểm tra elementReactions.json (docs/rules/element-reactions.md) và dựng chỉ mục theo cặp hệ.

import { SKILL_EFFECTS, elementReactionKey } from '../registries'
import type { ElementReactionDef, ElementReactionPair, GameData } from '../model'
import { checkEffects, checkKnownFields, fieldList } from './checks'

const REACTION_FIELDS = fieldList<ElementReactionDef>({ id: true, pairs: true, effects: true })
const PAIR_FIELDS = fieldList<ElementReactionPair>({
  attackElementId: true,
  defenderElementId: true
})

/** Phản ứng theo cặp hệ; cặp sai kiểu bỏ qua (checkElementReactions báo). */
export function indexElementReactions(
  reactions: readonly ElementReactionDef[]
): Record<string, ElementReactionDef> {
  const index: Record<string, ElementReactionDef> = {}
  for (const reaction of reactions) {
    for (const pair of Array.isArray(reaction.pairs) ? reaction.pairs : []) {
      index[elementReactionKey(pair.attackElementId, pair.defenderElementId)] ??= reaction
    }
  }
  return index
}

function checkPair(
  data: GameData,
  pair: ElementReactionPair,
  where: string,
  issues: string[]
): void {
  checkKnownFields(pair, PAIR_FIELDS, where, 'cặp hệ', issues)
  for (const id of [pair.attackElementId, pair.defenderElementId]) {
    if (typeof id !== 'string' || !Object.hasOwn(data.elements, id)) {
      issues.push(`${where}: hệ không tồn tại "${String(id)}"`)
    }
  }
}

/** Hiệu ứng phản ứng chạy lên mục tiêu một lần mỗi skill: chỉ timing afterHits, không lên quái dùng. */
function checkReactionEffects(
  data: GameData,
  reaction: ElementReactionDef,
  where: string,
  issues: string[]
): void {
  checkEffects(SKILL_EFFECTS, reaction.effects, `${where}.effects`, data, issues)
  for (const effect of Array.isArray(reaction.effects) ? reaction.effects : []) {
    const handler = SKILL_EFFECTS[effect.type]
    if (!handler) continue
    if (handler.timing !== 'afterHits') {
      issues.push(`${where}.effects: hook "${effect.type}" phải có timing afterHits`)
    }
    if (handler.userOnly?.(effect.params)) {
      issues.push(`${where}.effects: hook "${effect.type}" phải chạy lên mục tiêu`)
    }
  }
  if (Array.isArray(reaction.effects) && reaction.effects.length === 0) {
    issues.push(`${where}.effects: cần ít nhất 1 hiệu ứng`)
  }
}

/** Trường, hệ, cặp trùng, hiệu ứng của mọi phản ứng hệ. */
export function checkElementReactions(data: GameData, issues: string[]): void {
  const owners = new Map<string, string>()
  for (const reaction of Object.values(data.elementReactions)) {
    const where = `Phản ứng hệ "${reaction.id}"`
    checkKnownFields(reaction, REACTION_FIELDS, where, 'phản ứng hệ', issues)
    if (!Array.isArray(reaction.pairs) || reaction.pairs.length === 0) {
      issues.push(`${where}: cần ít nhất 1 cặp hệ`)
    }
    for (const pair of Array.isArray(reaction.pairs) ? reaction.pairs : []) {
      checkPair(data, pair, `${where}.pairs`, issues)
      const key = elementReactionKey(pair.attackElementId, pair.defenderElementId)
      const owner = owners.get(key)
      if (owner !== undefined) issues.push(`${where}: cặp "${key}" trùng với phản ứng "${owner}"`)
      owners.set(key, reaction.id)
    }
    checkReactionEffects(data, reaction, where, issues)
  }
}
