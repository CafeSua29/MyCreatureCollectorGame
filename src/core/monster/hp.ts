// HP hiện tại suy ra từ max HP (tính lại bằng computeStats) và damageTaken đã lưu.

import { computeStats } from './stats'
import { maxBig, memoInReadOnlyScope, type Decimal } from '../shared'
import { mergePartnerOf, type GameData, type Monster } from '../model'

/**
 * Lượng HP ứng với % max HP, làm tròn lên. Dùng chung cho mọi hồi máu / mất máu theo % max HP
 * (skill, trait, môi trường, vật phẩm).
 */
export const percentOfMaxHp = (maxHp: Decimal, percent: number): Decimal =>
  maxHp.times(percent).div(100).ceil()

/**
 * Mọi thứ quyết định max HP của quái (max HP không phụ thuộc bối cảnh trận, mục "Trait Siralim"):
 * cùng chữ ký thì cùng max HP.
 */
function maxHpSignature(monster: Monster): string {
  return [
    monster.baseSpeciesId,
    monster.level,
    monster.raceId,
    monster.bossMultiplier,
    monster.genes.hp.toString(),
    monster.fusingBonusStats.hp.toString(),
    monster.traits.map((t) => `${t.id}:${t.level}`).join(','),
    monster.statuses.map((s) => `${s.statusId}:${s.potency ?? 100}`).join(','),
    monster.battleMaxHpDelta?.toString() ?? '',
    // Giai đoạn tuổi đổi mọi chỉ số kể cả max HP (mục "Tuổi và thọ nguyên").
    `${monster.aging}:${monster.ageDays}:${monster.maxLevelReached}:${monster.lifespanBonusYears}`,
    // Cộng hưởng khế ước đổi mọi chỉ số kể cả max HP (docs/rules/tamer.md).
    monster.contractRealm ?? '',
    // Mức thân mật có thể mang hook đổi chỉ số (docs/rules/affinity.md).
    monster.affinity,
    // Điểm nỗ lực HP cộng % max HP (docs/rules/effort-values.md).
    monster.effortValues.hp,
    // Dưỡng dục đã xong cộng % mọi chỉ số (docs/rules/imprinting.md).
    monster.imprint?.phase === 'done'
      ? `${monster.imprint.completed}/${monster.imprint.total}`
      : '',
    // Biến hình đổi max HP (Dynamax) hoặc chỉ số gốc (Mega).
    monster.battleTransform
      ? `${monster.battleTransform.kind}:${monster.battleTransform.formSpeciesId ?? ''}:${monster.battleTransform.ended ?? ''}:${monster.dynamaxLevel}`
      : '',
    // Dạng trong trận đổi chỉ số gốc (Power Construct đổi cả max HP; battle-forms.md).
    monster.battleForm?.speciesId ?? '',
    // Hợp thể: max HP gồm max HP của quái phụ (docs/rules/battle-merge.md).
    mergeSignature(monster)
  ].join('|')
}

function mergeSignature(monster: Monster): string {
  const partner = mergePartnerOf(monster)
  return partner
    ? `${partner.id}<${maxHpSignature({ ...partner, statuses: monster.statuses })}>`
    : ''
}

/** Cache max HP theo object quái (WeakMap: không giữ quái, không vào state). */
const maxHpCache = new WeakMap<Monster, { data: GameData; signature: string; hp: Decimal }>()

export function getMaxHp(data: GameData, monster: Monster): Decimal {
  // Trong phạm vi chỉ đọc quái không đổi nên khỏi dựng lại chữ ký (hàm rất nóng: aliveOnField).
  return memoInReadOnlyScope(MAX_HP_TABLE, [data, monster], () => cachedMaxHp(data, monster))
}

const MAX_HP_TABLE = {}

function cachedMaxHp(data: GameData, monster: Monster): Decimal {
  const signature = maxHpSignature(monster)
  const cached = maxHpCache.get(monster)
  if (cached && cached.data === data && cached.signature === signature) return cached.hp
  const hp = computeStats(data, monster).final.hp
  maxHpCache.set(monster, { data, signature, hp })
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
