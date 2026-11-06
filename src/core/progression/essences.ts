// Tinh chất (docs/rules/essences.md, theo Essence của Portals of Phereon): lợi ích lâu dài của cả save.
// Đóng một cổng thế giới thì được chọn một trong vài tinh chất tung ngẫu nhiên (độ hiếm theo trọng số,
// không trùng tinh chất đã có). Loại hiệu ứng là union theo `kind` (kiểm tra dữ liệu ở
// gameData/validateEssences.ts: thêm loại = thêm một mục ESSENCE_EFFECT_CHECKS).

import { ActionError, BIG_ONE, pick, pickWeighted, type RngState } from '../shared'
import {
  ESSENCE_RARITIES,
  STAT_NAMES,
  type EssenceDef,
  type EssenceEffect,
  type EssenceEffectKind,
  type EssenceRarity,
  type EssenceState,
  type GameData,
  type GameState,
  type Monster,
  type StatName
} from '../model'

type Effect<K extends EssenceEffectKind> = Extract<EssenceEffect, { kind: K }>

/** Hiệu ứng của mọi tinh chất đã có thuộc một loại. */
function ownedEffects<K extends EssenceEffectKind>(
  data: GameData,
  essences: EssenceState,
  kind: K
): Effect<K>[] {
  return essences.owned.flatMap((id) => {
    const effect = data.essences[id]?.effect
    // Ép kiểu: đã lọc đúng loại theo `kind`.
    return effect?.kind === kind ? [effect as Effect<K>] : []
  })
}

/** Tung một lựa chọn tinh chất: mỗi ô một độ hiếm theo trọng số (còn tinh chất chưa có), không trùng. */
export function rollEssenceOffer(
  data: GameData,
  rng: RngState,
  owned: readonly string[]
): [string[], RngState] {
  const { offerSize, rarityWeights } = data.config.essences
  const offer: string[] = []
  for (let i = 0; i < offerSize; i++) {
    const free = (rarity: EssenceRarity): EssenceDef[] =>
      Object.values(data.essences).filter(
        (essence) =>
          essence.rarity === rarity && !owned.includes(essence.id) && !offer.includes(essence.id)
      )
    const rarities = ESSENCE_RARITIES.filter((r) => rarityWeights[r] > 0 && free(r).length > 0)
    if (rarities.length === 0) break
    let rarity: EssenceRarity
    ;[rarity, rng] = pickWeighted(rng, rarities, (r) => rarityWeights[r])
    let chosen: EssenceDef
    ;[chosen, rng] = pick(rng, free(rarity))
    offer.push(chosen.id)
  }
  return [offer, rng]
}

/** Thêm một lựa chọn tinh chất (đang có lựa chọn chờ thì giữ lựa chọn cũ; hết tinh chất thì thôi). */
export function grantEssenceOffer<T extends Pick<GameState, 'essences' | 'rng'>>(
  data: GameData,
  holder: T
): T {
  if (holder.essences.offer !== null) return holder
  const [offer, rng] = rollEssenceOffer(data, holder.rng, holder.essences.owned)
  if (offer.length === 0) return { ...holder, rng }
  return { ...holder, rng, essences: { ...holder.essences, offer } }
}

/** Chọn một tinh chất trong lựa chọn đang chờ. */
export function chooseEssence(data: GameData, state: GameState, essenceId: string): GameState {
  const { offer, owned } = state.essences
  if (offer === null) throw new ActionError('noEssenceOffer')
  if (!offer.includes(essenceId) || !data.essences[essenceId]) {
    throw new ActionError('essenceNotOffered', { essenceId })
  }
  return { ...state, essences: { owned: [...owned, essenceId], offer: null } }
}

/** % gen theo chỉ số tinh chất cộng cho quái nở / fuse (theo race / nhóm race nếu có). */
export function essenceGrowthPercents(
  data: GameData,
  essences: EssenceState,
  monster: Monster
): Partial<Record<StatName, number>> {
  const groupId = data.races[monster.raceId]?.groupId
  const result: Partial<Record<StatName, number>> = {}
  for (const effect of ownedEffects(data, essences, 'growth')) {
    if (effect.raceIds && !effect.raceIds.includes(monster.raceId)) continue
    if (effect.raceGroupIds && (groupId === undefined || !effect.raceGroupIds.includes(groupId)))
      continue
    const stats =
      effect.stats === 'lowest'
        ? [
            STAT_NAMES.reduce((low, stat) =>
              monster.genes[stat].lt(monster.genes[low]) ? stat : low
            )
          ]
        : effect.stats
    for (const stat of stats) result[stat] = (result[stat] ?? 0) + effect.percent
  }
  return result
}

/** Áp tinh chất tăng trưởng lên quái vừa nở / fuse: gen × (1 + %), làm tròn xuống, ít nhất +1. */
export function applyEssenceGrowth(
  data: GameData,
  essences: EssenceState,
  monster: Monster
): Monster {
  const percents = essenceGrowthPercents(data, essences, monster)
  if (Object.keys(percents).length === 0) return monster
  const genes = { ...monster.genes }
  for (const [stat, percent] of Object.entries(percents) as [StatName, number][]) {
    const boosted = genes[stat].times(1 + percent / 100).floor()
    genes[stat] = boosted.gt(genes[stat]) ? boosted : genes[stat].plus(BIG_ONE)
  }
  return { ...monster, genes }
}

/** Số trait chọn thêm khi fuse. */
export function essenceFusionTraitChoices(data: GameData, essences: EssenceState): number {
  return ownedEffects(data, essences, 'fusionTraitChoices').reduce((sum, e) => sum + e.extra, 0)
}

/** Sức lớn / độ ổn định cộng cho trứng trong phòng ấp. */
export function essenceEggBonus(
  data: GameData,
  essences: EssenceState
): { growth: number; stability: number } {
  return ownedEffects(data, essences, 'egg').reduce(
    (sum, e) => ({ growth: sum.growth + e.growth, stability: sum.stability + e.stability }),
    { growth: 0, stability: 0 }
  )
}

/** Trait tạm quái của người chơi nhận khi vào trận. */
export function essenceBattleTraitIds(data: GameData, essences: EssenceState): string[] {
  return ownedEffects(data, essences, 'battleTrait').map((effect) => effect.traitId)
}
