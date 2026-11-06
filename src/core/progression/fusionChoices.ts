// Chọn trait giữ và chọn gen khi fuse (docs/rules/fusing.md mục "Chọn trait và gen", theo GeneSelection
// của Portals of Phereon). Mỗi bên chọn giữ tối đa `keptTraitPercent` % số trait chiếm ô của bên đó
// (làm tròn lên, cộng tinh chất fusionTraitChoices); trait giữ chắc chắn vào ô trước, ô còn lại tung
// như cũ. Gen: mỗi chỉ số chọn lấy của quái gốc (mặc định) hay của quái phụ.

import { ActionError, malformedAction } from '../shared'
import {
  usesTraitSlot,
  STAT_NAMES,
  type EssenceState,
  type GameData,
  type Monster,
  type StatName
} from '../model'
import { essenceFusionTraitChoices } from './essences'

export type GeneSource = 'base' | 'sub'

export interface FusionChoices {
  /** Trait chọn giữ (id; trait có ở cả hai bên tính cho quái gốc). */
  keepTraitIds: readonly string[]
  geneSources: Partial<Record<StatName, GeneSource>>
}

export const NO_FUSION_CHOICES: FusionChoices = { keepTraitIds: [], geneSources: {} }

const slotTraitIds = (data: GameData, monster: Monster): string[] =>
  monster.traits.filter((t) => usesTraitSlot(data.traits[t.id].kind)).map((t) => t.id)

/** Số trait một bên được chọn giữ: ⌈n × keptTraitPercent / 100⌉ + tinh chất, tối đa n. */
export function keptTraitCapacity(
  data: GameData,
  essences: EssenceState,
  monster: Monster
): number {
  const count = slotTraitIds(data, monster).length
  const base = Math.ceil((count * data.config.fusion.keptTraitPercent) / 100)
  return Math.min(count, base + essenceFusionTraitChoices(data, essences))
}

function parseKeepTraits(
  data: GameData,
  {
    essences,
    base,
    sub,
    value
  }: { essences: EssenceState; base: Monster; sub: Monster; value: unknown }
): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    throw malformedAction('keepTraitIds phải là danh sách id trait')
  }
  const ids = value as string[]
  if (new Set(ids).size !== ids.length) throw malformedAction('keepTraitIds bị trùng')
  const baseIds = slotTraitIds(data, base)
  const subIds = slotTraitIds(data, sub)
  for (const id of ids) {
    if (!baseIds.includes(id) && !subIds.includes(id)) {
      throw new ActionError('cannotKeepTrait', { traitId: id })
    }
  }
  for (const [owner, own] of [
    [base, ids.filter((id) => baseIds.includes(id))],
    [sub, ids.filter((id) => !baseIds.includes(id))]
  ] as const) {
    const max = keptTraitCapacity(data, essences, owner)
    if (own.length > max) throw new ActionError('tooManyKeptTraits', { monsterId: owner.id, max })
  }
  const groups = ids.map((id) => data.traits[id].exclusiveGroup).filter((g) => g !== undefined)
  if (new Set(groups).size !== groups.length) throw new ActionError('keptTraitsExclusive')
  return ids
}

function parseGeneSources(value: unknown): Partial<Record<StatName, GeneSource>> {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw malformedAction('geneSources phải là object chỉ số → base / sub')
  }
  const result: Partial<Record<StatName, GeneSource>> = {}
  for (const [stat, source] of Object.entries(value)) {
    const known = STAT_NAMES.find((name) => name === stat)
    if (!known || (source !== 'base' && source !== 'sub')) {
      throw malformedAction(`geneSources không hợp lệ ở "${stat}"`)
    }
    result[known] = source
  }
  return result
}

/** Kiểm tra lựa chọn của lệnh fuse (trước khi tung, lỗi thì state giữ nguyên). */
export function parseFusionChoices(
  data: GameData,
  { essences, base, sub }: { essences: EssenceState; base: Monster; sub: Monster },
  order: { keepTraitIds?: unknown; geneSources?: unknown }
): FusionChoices {
  return {
    keepTraitIds: parseKeepTraits(data, { essences, base, sub, value: order.keepTraitIds }),
    geneSources: parseGeneSources(order.geneSources)
  }
}

/** Gen của quái sau fuse: chỉ số chọn `sub` lấy gen của quái phụ, còn lại giữ của quái gốc. */
export function chosenGenes(
  base: Monster,
  sub: Monster,
  geneSources: FusionChoices['geneSources']
): Monster['genes'] {
  const genes = { ...base.genes }
  for (const stat of STAT_NAMES) if (geneSources[stat] === 'sub') genes[stat] = sub.genes[stat]
  return genes
}
