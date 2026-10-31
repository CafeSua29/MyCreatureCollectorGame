// Ô quái khởi đầu (docs/rules/starters.md): loài nào được làm khởi đầu, điều kiện của từng ô theo
// registry, danh sách loài của một ô. Thêm loại điều kiện = thêm vào STARTER_CONDITION_KINDS + một
// handler (mapped type báo lỗi nếu thiếu).

import { evolutionLineOf, formsOf, preEvolutionsOf } from '../inventory'
import {
  BATTLE_FORM_KINDS,
  FORM_KINDS,
  type GameData,
  type NormalSpecies,
  type StarterCondition,
  type StarterSlot
} from '../model'
import { hasBloodline } from './bloodlines'
import { checkIdList } from './paramChecks'
import { speciesRankIndex, speciesRankOf } from './speciesRank'

type ConditionOf<K extends StarterCondition['kind']> = Extract<StarterCondition, { kind: K }>

interface StarterConditionHandler<K extends StarterCondition['kind']> {
  /** Trường của điều kiện ngoài `kind`. */
  fields: readonly string[]
  validate(condition: ConditionOf<K>, data: GameData): string[]
  matches(condition: ConditionOf<K>, species: NormalSpecies, data: GameData): boolean
}

// Loài làm khởi đầu là dạng đầu nên cả chuỗi tiến hóa (evolutionLineOf) là chính nó và các dạng sau.
export const STARTER_CONDITIONS: {
  [K in StarterCondition['kind']]: StarterConditionHandler<K>
} = {
  lineHasForm: {
    fields: ['formKinds'],
    validate: (condition) =>
      checkIdList(
        condition.formKinds,
        'formKinds',
        Object.fromEntries(FORM_KINDS.map((kind) => [kind, true])),
        { label: 'loại dạng' }
      ),
    matches: (condition, species, data) =>
      evolutionLineOf(data, species.id).some((id) =>
        condition.formKinds.some((kind) => formsOf(data, id, kind).length > 0)
      )
  },
  evolvesToRank: {
    fields: ['rankId'],
    validate: (condition, data) =>
      speciesRankIndex(data, condition.rankId) < 0
        ? [`rankId: phẩm cấp loài không tồn tại "${String(condition.rankId)}"`]
        : [],
    matches(condition, species, data) {
      const min = speciesRankIndex(data, condition.rankId)
      return evolutionLineOf(data, species.id).some((id) => {
        const later = data.species[id]
        return (
          later?.kind === 'normal' && speciesRankIndex(data, speciesRankOf(data, later).id) >= min
        )
      })
    }
  },
  species: {
    fields: ['speciesIds'],
    validate(condition, data) {
      const issues = checkIdList(condition.speciesIds, 'speciesIds', data.species, {
        label: 'loài'
      })
      if (issues.length > 0) return issues
      return condition.speciesIds
        .filter((id) => !isStarterEligible(data, id))
        .map((id) => `speciesIds: "${id}" không phải loài dạng đầu có tiến hóa`)
    },
    matches: (condition, species) => condition.speciesIds.includes(species.id)
  },
  bloodline: {
    fields: [],
    validate: () => [],
    matches: (_condition, species, data) => hasBloodline(data, species.id)
  }
}

/**
 * Loài làm khởi đầu được: loài thường dạng đầu (không có dạng trước), có tiến hóa, không phải dạng
 * chỉ có trong trận (Mega, gmax, battleOnly). Dạng vùng miền / dạng khác vẫn được.
 */
export function isStarterEligible(data: GameData, speciesId: string): boolean {
  const species = data.species[speciesId]
  return (
    species?.kind === 'normal' &&
    species.evolutions.length > 0 &&
    !BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate') &&
    preEvolutionsOf(data, speciesId).length === 0
  )
}

/** Loài thỏa một điều kiện ô khởi đầu (điều kiện đã qua kiểm tra dữ liệu). */
function matchesCondition(
  data: GameData,
  condition: StarterCondition,
  species: NormalSpecies
): boolean {
  // Ép kiểu: handler lấy theo đúng `kind` của điều kiện nên nhận đúng loại điều kiện.
  const handler = STARTER_CONDITIONS[condition.kind] as StarterConditionHandler<
    StarterCondition['kind']
  >
  return handler.matches(condition as never, species, data)
}

/** Mọi loài làm khởi đầu được (thứ tự dữ liệu); cache theo bộ dữ liệu. */
const eligibleCache = new WeakMap<GameData['species'], NormalSpecies[]>()

function eligibleStarters(data: GameData): NormalSpecies[] {
  const cached = eligibleCache.get(data.species)
  if (cached) return cached
  const result = Object.values(data.species).filter((species): species is NormalSpecies =>
    isStarterEligible(data, species.id)
  )
  eligibleCache.set(data.species, result)
  return result
}

/** Id các loài của một ô khởi đầu (thứ tự dữ liệu): loài hợp lệ thỏa mọi điều kiện của ô. */
export function starterSlotPool(data: GameData, slot: StarterSlot): string[] {
  return eligibleStarters(data)
    .filter((species) => slot.conditions.every((c) => matchesCondition(data, c, species)))
    .map((species) => species.id)
}
