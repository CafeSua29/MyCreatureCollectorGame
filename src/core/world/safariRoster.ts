// Danh sách loài của khu bảo tồn (docs/rules/safari-zone.md): đổi mỗi rotationDays ngày, random
// từ loài của các map đã mở, ưu tiên loài hiếm (catchRate thấp, phẩm cấp loài cao hiếm hơn), mỗi ô
// có tỉ lệ nhỏ lấy loài không gán vào map nào. Mọi loài hợp lệ đều có cơ hội (trọng số > 0).

import { speciesRankIndex, speciesRankOf } from '../registries'
import { pickWeighted, rollPercent, type RngState } from '../shared'
import {
  BATTLE_FORM_KINDS,
  type DayEvent,
  type GameData,
  type GameState,
  type NormalSpecies
} from '../model'

/** Loài vào khu được: loài thường, không phải dạng chỉ có trong trận (Mega, gmax, battleOnly). */
const isSafariSpecies = (species: NormalSpecies): boolean =>
  species.formKind === undefined || !BATTLE_FORM_KINDS.includes(species.formKind)

function normalSpecies(data: GameData, speciesId: string): NormalSpecies | null {
  const species = data.species[speciesId]
  return species?.kind === 'normal' && isSafariSpecies(species) ? species : null
}

/** Một loài trong nhóm tung của khu kèm trọng số (tính sẵn, chỉ phụ thuộc dữ liệu). */
interface WeightedSpecies {
  readonly id: string
  readonly weight: number
}

/** Hai nhóm tung: loài quái thường của map (không trùng, theo thứ tự map) và loài không gán map. */
interface SafariPools {
  readonly mapped: readonly WeightedSpecies[]
  readonly unmapped: readonly WeightedSpecies[]
}

/**
 * Nhóm tung tính một lần mỗi bộ dữ liệu: mỗi lần làm mới danh sách mà tính lại trọng số mọi loài
 * thì rất chậm khi có nhiều loài (đo 2026-11-07: ~24% thời gian quét tầng của mô phỏng).
 */
const poolsCache = new WeakMap<GameData, SafariPools>()

function safariPools(data: GameData): SafariPools {
  const cached = poolsCache.get(data)
  if (cached) return cached
  const mappedIds = new Set<string>()
  for (const biome of Object.values(data.biomes)) {
    for (const entry of biome.encounters) mappedIds.add(entry.speciesId)
  }
  const weighted = (ids: Iterable<string>): WeightedSpecies[] =>
    [...ids].flatMap((id) => {
      const species = normalSpecies(data, id)
      return species ? [{ id, weight: safariSpeciesWeight(data, species) }] : []
    })
  const pools: SafariPools = {
    mapped: weighted(mappedIds),
    unmapped: weighted(Object.keys(data.species).filter((id) => !mappedIds.has(id)))
  }
  poolsCache.set(data, pools)
  return pools
}

/**
 * Trọng số loài: (rarityWeightBase + 100 − catchRate) ^ rarityExponent × rankFalloff ^ thứ hạng
 * phẩm cấp loài.
 */
export function safariSpeciesWeight(data: GameData, species: NormalSpecies): number {
  const { rarityWeightBase, rarityExponent, rankFalloff } = data.config.safari
  const rank = Math.max(0, speciesRankIndex(data, speciesRankOf(data, species).id))
  const rarity = Math.max(0, rarityWeightBase + 100 - species.catchRate) ** rarityExponent
  return rarity * rankFalloff ** rank
}

/**
 * Tung danh sách loài mới: rosterSize ô không trùng, mỗi ô tung unmappedChance lấy loài không gán
 * vào map nào (một nhóm hết loài thì lấy nhóm kia), rồi chọn theo trọng số trong nhóm.
 */
export function rollSafariRoster(data: GameData, rng: RngState): [string[], RngState] {
  const { rosterSize, unmappedChance } = data.config.safari
  const pools = safariPools(data)
  // Bản sao bớt dần loài đã chọn (giữ thứ tự nên kết quả như lọc lại mỗi ô, nhưng không lọc lại
  // cả nhóm hàng chục nghìn loài mỗi ô). Hai nhóm không trùng loài nên chỉ bớt ở nhóm vừa chọn.
  const mappedLeft = [...pools.mapped]
  const unmappedLeft = [...pools.unmapped]
  const chosen: string[] = []
  for (let i = 0; i < rosterSize; i++) {
    if (mappedLeft.length === 0 && unmappedLeft.length === 0) break
    let useUnmapped = mappedLeft.length === 0
    if (mappedLeft.length > 0 && unmappedLeft.length > 0) {
      ;[useUnmapped, rng] = rollPercent(rng, unmappedChance)
    }
    const group = useUnmapped ? unmappedLeft : mappedLeft
    let entry: WeightedSpecies
    ;[entry, rng] = pickWeighted(rng, group, (e) => e.weight)
    group.splice(group.indexOf(entry), 1)
    chosen.push(entry.id)
  }
  return [chosen, rng]
}

/** Khu bảo tồn lúc bắt đầu: chưa có danh sách (tung lúc vào khu lần đầu hoặc qua ngày đầu tiên). */
export const newSafariState = (): GameState['safari'] => ({
  roster: [],
  refreshDay: 0,
  visit: null
})

/** Tới ngày làm mới (`day` ≥ refreshDay) thì tung danh sách mới, làm mới tiếp sau rotationDays. */
export function refreshSafariRoster(data: GameData, state: GameState, day: number): GameState {
  if (day < state.safari.refreshDay) return state
  const [roster, rng] = rollSafariRoster(data, state.rng)
  const refreshDay = day + data.config.safari.rotationDays
  return { ...state, rng, safari: { ...state.safari, roster, refreshDay } }
}

/** Việc theo ngày (DAILY_TASKS): làm mới danh sách loài khi tới ngày. */
export const safariDailyTask = (
  data: GameData,
  state: GameState,
  _events: DayEvent[],
  day: number
): GameState => refreshSafariRoster(data, state, day)
