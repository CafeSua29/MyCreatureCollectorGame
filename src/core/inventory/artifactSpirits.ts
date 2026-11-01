// Khí linh trên trang bị (docs/rules/artifact-spirits.md): số ô theo bậc / cấp món, phẩm cấp và thức
// tỉnh theo value, hiệu lực (dã linh một nửa, softCap), tung khí linh mới, dã linh trên đồ rơi. Hàm
// thuần; action ở roster/spiritActions.ts, Khí giới bí cảnh ở battle/itemWorld.ts.

import { nextInt, pickWeighted, toBig, type Decimal, type RngState } from '../shared'
import type {
  ArtifactSpirit,
  EquipmentInstance,
  EquipmentRarity,
  GameData,
  TraitHookDef
} from '../model'

/** Khí linh trên món (trường tùy chọn: không có = chưa có khí linh nào). */
export const spiritsOf = (instance: EquipmentInstance): readonly ArtifactSpirit[] =>
  instance.spirits ?? []

/** Số tầng Khí giới bí cảnh món đã qua (trường tùy chọn: không có = 0). */
export const depthOf = (instance: EquipmentInstance): number => instance.depth ?? 0

/** Bản mới của món với danh sách khí linh `spirits` (rỗng thì bỏ trường để save gọn). */
export function withSpirits(
  instance: EquipmentInstance,
  spirits: readonly ArtifactSpirit[]
): EquipmentInstance {
  const { spirits: _old, ...rest } = instance
  return spirits.length === 0 ? rest : { ...rest, spirits: [...spirits] }
}

/**
 * Số ô khí linh của món: theo bậc (hồn khí: soulRelicSlots) + 1 mỗi levelsPerSlot cấp món (không
 * trần; cấp không giảm nên số ô không giảm).
 */
export function spiritSlotCount(data: GameData, instance: EquipmentInstance): number {
  const config = data.config.artifactSpirits
  const base = instance.soul ? config.soulRelicSlots : config.slots[instance.rarity]
  return base + Math.floor(instance.level / config.levelsPerSlot)
}

/**
 * Phẩm cấp theo value: 0 Phàm, 1 Linh, 2 Bảo, 3 Tiên, 4 Thần (số ngưỡng = gradeThresholds), sau đó
 * mỗi gradeStep value thêm một bậc ("Thần + n" = phẩm cấp − số ngưỡng). Không trần.
 */
export function spiritGrade(data: GameData, value: number): number {
  const { gradeThresholds, gradeStep } = data.config.artifactSpirits
  const grade = gradeThresholds.filter((threshold) => value >= threshold).length
  if (grade < gradeThresholds.length) return grade
  const top = gradeThresholds[gradeThresholds.length - 1]
  return grade + Math.floor((value - top) / gradeStep)
}

/** Khí linh đã thức tỉnh (phẩm cấp ≥ awakenGrade): thêm awakenedHooks của loại. */
export const isSpiritAwakened = (data: GameData, spirit: ArtifactSpirit): boolean =>
  spiritGrade(data, spirit.value) >= data.config.artifactSpirits.awakenGrade

/**
 * Value hiệu lực của một loại trên khí linh: value × wildPotencyPercent % nếu là dã linh; loại có
 * softCap thì giảm dần v × cap / (v + cap) (≈ v khi nhỏ, tiến tới cap khi v → ∞).
 */
export function spiritEffectValue(data: GameData, spirit: ArtifactSpirit, typeId: string): number {
  const potency = spirit.subdued ? 1 : data.config.artifactSpirits.wildPotencyPercent / 100
  const value = spirit.value * potency
  const softCap = data.artifactSpirits[typeId].softCap
  return softCap === undefined ? value : (value * softCap) / (value + softCap)
}

/** Hook của khí linh kèm hệ số (= value hiệu lực): mỗi loại của nó, thêm hook thức tỉnh nếu đủ phẩm. */
export function spiritHooks(
  data: GameData,
  spirit: ArtifactSpirit
): { hook: TraitHookDef; scale: number }[] {
  const awakened = isSpiritAwakened(data, spirit)
  return spirit.typeIds.flatMap((typeId) => {
    const def = data.artifactSpirits[typeId]
    const scale = spiritEffectValue(data, spirit, typeId)
    const hooks = awakened ? [...def.hooks, ...def.awakenedHooks] : def.hooks
    return hooks.map((hook) => ({ hook, scale }))
  })
}

/** Tung một loại khí linh theo trọng số. */
export function rollSpiritType(data: GameData, rng: RngState): [string, RngState] {
  const candidates = Object.values(data.artifactSpirits).filter((def) => def.weight > 0)
  const [def, next] = pickWeighted(rng, candidates, (entry) => entry.weight)
  return [def.id, next]
}

/**
 * Khí linh mới một loại: value đều trong valueRanges[bậc] × (1 + valuePercent / 100) (làm tròn
 * xuống, ít nhất 1).
 */
export function rollSpirit(
  data: GameData,
  rng: RngState,
  {
    rarity,
    subdued,
    valuePercent = 0
  }: { rarity: EquipmentRarity; subdued: boolean; valuePercent?: number }
): [ArtifactSpirit, RngState] {
  const [typeId, afterType] = rollSpiritType(data, rng)
  const range = data.config.artifactSpirits.valueRanges[rarity]
  const [rolled, next] = nextInt(afterType, range.min, range.max)
  const value = Math.max(1, Math.floor(rolled * (1 + valuePercent / 100)))
  return [{ typeIds: [typeId], value, subdued }, next]
}

/**
 * Dã linh có sẵn trên món rơi (không có ở cửa hàng / đúc, như Disgaea): số dã linh tung theo
 * dropSpiritWeights (chỉ một số có trọng số thì không tốn RNG), không quá số ô còn trống.
 */
export function rollWildSpirits(
  data: GameData,
  rng: RngState,
  instance: EquipmentInstance
): [EquipmentInstance, RngState] {
  const counts = data.config.artifactSpirits.dropSpiritWeights
    .map((weight, count) => ({ weight, count }))
    .filter((entry) => entry.weight > 0)
  if (counts.length === 0) return [instance, rng]
  let chosen = counts[0]
  if (counts.length > 1) [chosen, rng] = pickWeighted(rng, counts, (entry) => entry.weight)
  const { count } = chosen
  const room = spiritSlotCount(data, instance) - spiritsOf(instance).length
  const spirits = [...spiritsOf(instance)]
  for (let i = 0; i < Math.min(count, room); i++) {
    let spirit: ArtifactSpirit
    ;[spirit, rng] = rollSpirit(data, rng, { rarity: instance.rarity, subdued: false })
    spirits.push(spirit)
  }
  return [withSpirits(instance, spirits), rng]
}

/** Hai khí linh cùng loại (cùng tập loại, kể cả khí linh kép): gộp được. */
export function hasSameSpiritTypes(a: ArtifactSpirit, b: ArtifactSpirit): boolean {
  if (a.typeIds.length !== b.typeIds.length) return false
  return a.typeIds.every((typeId) => b.typeIds.includes(typeId))
}

/** Giá di dời: moveMoneyPerValue × value × tầng cao nhất. */
export const spiritMoveCost = (
  data: GameData,
  spirit: ArtifactSpirit,
  highestFloor: number
): Decimal =>
  toBig(data.config.artifactSpirits.moveMoneyPerValue).times(spirit.value).times(highestFloor)

/** Khí linh kép từ phối linh: hiệu ứng cả hai loại, value = trung bình (làm tròn xuống, ít nhất 1). */
export const breedSpiritPair = (first: ArtifactSpirit, second: ArtifactSpirit): ArtifactSpirit => ({
  typeIds: [...first.typeIds, ...second.typeIds],
  value: Math.max(1, Math.floor((first.value + second.value) / 2)),
  subdued: true
})
