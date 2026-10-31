// Hồn phách và hồn khí (docs/rules/soul-relics.md): ở NPC luyện đan, hồn phách ấp thành trứng truyền
// thừa (miễn phí) hoặc luyện thành hồn khí (tốn tiền theo level): trang bị bậc theo tư chất, dòng
// chính tăng một chỉ số random theo trọng số chỉ số gốc của loài, dòng hồn là một trait random của
// quái (giữ cấp).

import {
  SOUL_LINE_ID,
  addEquipment,
  equipmentInstanceId,
  rollEquipment,
  soulRelicBaseItem,
  takeSoul
} from '../inventory'
import { pick, pickWeighted, spendMoney, toBig, type Decimal, type RngState } from '../shared'
import {
  STAT_NAMES,
  dayOf,
  type Egg,
  type EquipmentInstance,
  type GameData,
  type GameState,
  type SoulRemnant,
  type StatName,
  type TraitInstance
} from '../model'
import { requireTown } from './alchemy'
import { createLegacyEgg } from './eggs'

/**
 * Lấy hồn phách khỏi túi và tạo trứng truyền thừa (id quái mới); trả state đã trừ hồn phách cùng
 * trứng, chưa thêm trứng vào danh sách (ấp ở NPC thì thêm, đội trống thì nở ngay).
 */
export function soulToEgg(
  data: GameData,
  state: GameState,
  soulId: string
): { state: GameState; egg: Egg } {
  const [soul, inventory] = takeSoul(state.inventory, soulId)
  const [egg, rng] = createLegacyEgg(data, state.rng, {
    soul,
    id: `m${state.nextMonsterId}`,
    day: dayOf(state.time),
    aging: state.options.lifespanEnabled
  })
  return { state: { ...state, rng, inventory, nextMonsterId: state.nextMonsterId + 1 }, egg }
}

/** Ấp hồn phách thành trứng truyền thừa ở NPC luyện đan (miễn phí, nở theo luật trứng). */
export function incubateSoul(data: GameData, state: GameState, soulId: string): GameState {
  requireTown(state)
  const { state: next, egg } = soulToEgg(data, state, soulId)
  return { ...next, eggs: [...next.eggs, egg] }
}

/** Giá luyện hồn khí từ một hồn phách: forgeCostPerLevel × level của quái lúc chết. */
export const soulRelicCost = (data: GameData, soul: Pick<SoulRemnant, 'level'>): Decimal =>
  toBig(data.config.soulRelic.forgeCostPerLevel).times(soul.level)

/**
 * Chỉ số của dòng chính hồn khí: random theo trọng số chỉ số gốc của loài gốc (chỉ số càng cao càng
 * dễ ra, chỉ số nào cũng có cơ hội; dữ liệu bảo đảm chỉ số gốc > 0).
 */
export function rollSoulRelicStat(
  data: GameData,
  rng: RngState,
  soul: Pick<SoulRemnant, 'baseSpeciesId'>
): [StatName, RngState] {
  const species = data.species[soul.baseSpeciesId]
  if (species?.kind !== 'normal') throw new Error(`Loài gốc không hợp lệ "${soul.baseSpeciesId}"`)
  return pickWeighted(rng, STAT_NAMES, (stat) => species.baseStats[stat])
}

/**
 * Tung món hồn khí từ hồn phách: chỉ số dòng chính (rollSoulRelicStat), bậc theo tư chất lúc chết, các
 * dòng như trang bị thường cùng bậc rồi thêm dòng hồn (trait random của quái, giữ cấp; quái không có
 * trait chiếm ô thì không có dòng hồn).
 */
export function rollSoulRelic(
  data: GameData,
  rng: RngState,
  { soul, id }: { soul: SoulRemnant; id: string }
): [EquipmentInstance, RngState] {
  let stat: StatName
  ;[stat, rng] = rollSoulRelicStat(data, rng, soul)
  const base = soulRelicBaseItem(data, stat)
  if (!base) throw new Error(`Không có món gốc hồn khí cho chỉ số "${stat}"`)
  const rarity = data.config.soulRelic.rarityByAptitude[soul.aptitudeTierId]
  if (!rarity) throw new Error(`Không có bậc hồn khí cho tư chất "${soul.aptitudeTierId}"`)
  let instance: EquipmentInstance
  ;[instance, rng] = rollEquipment(data, rng, { itemId: base.id, rarity, id })
  let trait: TraitInstance | null = null
  if (soul.traits.length > 0) [trait, rng] = pick(rng, soul.traits)
  const rolls = trait
    ? [...instance.rolls, { lineId: SOUL_LINE_ID, value: trait.level }]
    : instance.rolls
  const { speciesId, raceId, nickname, history } = soul
  return [
    {
      ...instance,
      rolls,
      soul: { speciesId, raceId, nickname, traitId: trait?.id ?? null, history }
    },
    rng
  ]
}

/** Luyện hồn phách thành hồn khí (trả tiền theo level), món vào túi trang bị. */
export function forgeSoulRelic(data: GameData, state: GameState, soulId: string): GameState {
  requireTown(state)
  const [soul, inventory] = takeSoul(state.inventory, soulId)
  const paid = spendMoney(state, soulRelicCost(data, soul))
  const [instance, rng] = rollSoulRelic(data, state.rng, {
    soul,
    id: equipmentInstanceId(state.nextItemId)
  })
  return {
    ...paid,
    rng,
    inventory: addEquipment(inventory, instance),
    nextItemId: state.nextItemId + 1
  }
}
