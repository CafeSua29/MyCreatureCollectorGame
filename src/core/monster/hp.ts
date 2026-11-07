// HP hiện tại suy ra từ max HP (tính lại bằng computeStats) và damageTaken đã lưu.

import { computeStats } from './stats'
import { isValidBig, maxBig, memoInReadOnlyScope, type Decimal } from '../shared'
import { mergePartnerOf, type GameData, type Monster } from '../model'

/**
 * Lượng HP ứng với % max HP, làm tròn lên. Dùng chung cho mọi hồi máu / mất máu theo % max HP
 * (skill, trait, môi trường, vật phẩm).
 */
export const percentOfMaxHp = (maxHp: Decimal, percent: number): Decimal =>
  maxHp.times(percent).div(100).ceil()

/** Một phần của chữ ký max HP: giá trị nguyên thủy hoặc Decimal (so bằng `.eq`). */
type MaxHpPart = string | number | boolean | null | undefined | Decimal

/**
 * Mọi thứ quyết định max HP của quái (max HP không phụ thuộc bối cảnh trận, mục "Trait Siralim"):
 * cùng chữ ký thì cùng max HP. Gửi từng phần qua `emit` thay vì dựng chuỗi: hàm rất nóng (mỗi lần
 * kiểm tra gục), dựng chuỗi + `Decimal.toString` chiếm ~10% thời gian trận (đo 2026-11-07).
 * `statuses` thay trạng thái của quái (quái phụ hợp thể dùng trạng thái của quái chính).
 */
function emitMaxHpParts(
  monster: Monster,
  emit: (part: MaxHpPart) => void,
  statuses: Monster['statuses'] = monster.statuses
): void {
  emit(monster.baseSpeciesId)
  emit(monster.level)
  emit(monster.raceId)
  emit(monster.bossMultiplier)
  emit(monster.genes.hp)
  emit(monster.fusingBonusStats.hp)
  emit(monster.traits.length)
  for (const trait of monster.traits) {
    emit(trait.id)
    emit(trait.level)
  }
  emit(statuses.length)
  for (const status of statuses) {
    emit(status.statusId)
    emit(status.potency ?? 100)
  }
  emit(monster.battleMaxHpDelta)
  // Giai đoạn tuổi đổi mọi chỉ số kể cả max HP (mục "Tuổi và thọ nguyên").
  emit(monster.aging)
  emit(monster.ageDays)
  emit(monster.maxLevelReached)
  emit(monster.lifespanBonusYears)
  // Cộng hưởng khế ước đổi mọi chỉ số kể cả max HP (docs/rules/tamer.md).
  emit(monster.contractRealm)
  // Mức thân mật có thể mang hook đổi chỉ số (docs/rules/affinity.md).
  emit(monster.affinity)
  // Điểm nỗ lực HP cộng % max HP (docs/rules/effort-values.md).
  emit(monster.effortValues.hp)
  // Dưỡng dục đã xong cộng % mọi chỉ số (docs/rules/imprinting.md).
  const imprintDone = monster.imprint?.phase === 'done' ? monster.imprint : undefined
  emit(imprintDone?.completed)
  emit(imprintDone?.total)
  // Cực và trait cực tính có thể đổi max HP (docs/rules/polarity.md).
  emit(monster.polarity?.pole)
  emit(monster.polarity?.traitId)
  // Biến hình đổi max HP (Dynamax) hoặc chỉ số gốc (Mega).
  const transform = monster.battleTransform
  emit(transform?.kind)
  emit(transform?.formSpeciesId)
  emit(transform?.ended)
  emit(transform ? monster.dynamaxLevel : undefined)
  // Dạng trong trận đổi chỉ số gốc (Power Construct đổi cả max HP; battle-forms.md).
  emit(monster.battleForm?.speciesId)
  // Sticker skill: thuộc tính chỉ số bị động (Max HP, theo ô trống) đổi max HP (skill-stickers.md).
  // (mỗi sticker một id riêng, không sửa tại chỗ: id đủ để nhận ra sticker đổi).
  for (const sticker of Object.values(monster.skillStickers)) emit(sticker.id)
  emit(monster.skillIds.length)
  // Hợp thể: max HP gồm max HP của quái phụ (docs/rules/battle-merge.md).
  const partner = mergePartnerOf(monster)
  emit(partner?.id)
  if (partner) emitMaxHpParts(partner, emit, statuses)
}

function maxHpSignature(monster: Monster): MaxHpPart[] {
  const parts: MaxHpPart[] = []
  emitMaxHpParts(monster, (part) => parts.push(part))
  return parts
}

const isSamePart = (a: MaxHpPart, b: MaxHpPart): boolean =>
  a === b || (isValidBig(a) && isValidBig(b) && a.eq(b))

/** Chữ ký hiện tại của quái có khớp chữ ký đã lưu không (không tạo mảng / chuỗi mới). */
function matchesSignature(monster: Monster, signature: readonly MaxHpPart[]): boolean {
  let index = 0
  let isMatch = true
  emitMaxHpParts(monster, (part) => {
    if (isMatch && !(index < signature.length && isSamePart(part, signature[index])))
      isMatch = false
    index++
  })
  return isMatch && index === signature.length
}

/**
 * Cache max HP theo object quái (WeakMap: không giữ quái, không vào state). Vẫn so chữ ký vì bản
 * nháp trong trận sửa quái tại chỗ (cùng object, khác trường).
 */
const maxHpCache = new WeakMap<
  Monster,
  { data: GameData; signature: readonly MaxHpPart[]; hp: Decimal }
>()

export function getMaxHp(data: GameData, monster: Monster): Decimal {
  // Trong phạm vi chỉ đọc quái không đổi nên khỏi so chữ ký (hàm rất nóng: aliveOnField).
  return memoInReadOnlyScope(MAX_HP_TABLE, [data, monster], () => cachedMaxHp(data, monster))
}

const MAX_HP_TABLE = {}

function cachedMaxHp(data: GameData, monster: Monster): Decimal {
  const cached = maxHpCache.get(monster)
  if (cached && cached.data === data && matchesSignature(monster, cached.signature)) {
    return cached.hp
  }
  const hp = computeStats(data, monster).final.hp
  maxHpCache.set(monster, { data, signature: maxHpSignature(monster), hp })
  return hp
}

export function getCurrentHp(data: GameData, monster: Monster): Decimal {
  return maxBig(0, getMaxHp(data, monster).minus(monster.damageTaken))
}

export function isFainted(data: GameData, monster: Monster): boolean {
  // Như getCurrentHp ≤ 0 nhưng không tạo Decimal mới (hàm rất nóng).
  return monster.damageTaken.gte(getMaxHp(data, monster))
}

/**
 * Max HP vừa giảm (tuổi, tắt / bật thọ nguyên): quái còn sống trước đó vẫn còn ít nhất 1 máu, không
 * gục vì max HP tụt.
 */
export function keepAlive(data: GameData, wasAlive: boolean, monster: Monster): Monster {
  if (!wasAlive) return monster
  const maxHp = getMaxHp(data, monster)
  return monster.damageTaken.gte(maxHp) ? { ...monster, damageTaken: maxHp.minus(1) } : monster
}
