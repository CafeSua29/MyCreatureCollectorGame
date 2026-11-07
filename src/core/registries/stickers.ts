// Sticker skill (docs/rules/skill-stickers.md): điểm DUY NHẤT cho tung sticker (độ hiếm, thuộc tính
// hợp với skill), nhận Bí kíp (mọi nguồn gọi receiveBooks), hiệu lực của sticker lên đúng skill mang
// nó (stickerSkillBonus), hook trait lên quái (stickerTraitHooks), ô skill cộng thêm.

import { nextFloat, nextInt, pick, pickWeighted, type RngState } from '../shared'
import {
  STICKER_EFFECTS,
  NO_STICKER_BONUS,
  addBooks,
  addByRef,
  addSticker,
  lineParams,
  type BookKey
} from '../inventory'
import {
  STICKER_RARITIES,
  type GameData,
  type GameState,
  type Monster,
  type Skill,
  type StickerAttributeDef,
  type StickerInstance,
  type StickerRarity,
  type StickerRequirement,
  type StickerRoll,
  type StickerSkillBonus,
  type StickerTraitHook,
  type StackableItemRef,
  type TraitHookDef
} from '../model'
import { emptySkillSlots } from '../monster'
import { SKILL_EFFECTS } from './skillEffects'
import { hasSecondaryEffect } from './traitConditions'
import { hasBagRoom } from './capacity'

/** Tiền tố id sticker ("s<số>", chung bộ đếm nextItemId với trang bị). */
const STICKER_ID_PREFIX = 's'

/** Chỗ giữ trong hook của thuộc tính: skill mang sticker, lựa chọn đã tung. */
const SKILL_PLACEHOLDER = '$skill'
const CHOICE_PLACEHOLDER = '$choice'

/** Id sticker thứ `n` (từ GameState.nextItemId). */
export const stickerInstanceId = (n: number): string => `${STICKER_ID_PREFIX}${n}`

/** Số trong id sticker ("s12" → 12), null nếu không đúng dạng. */
export function stickerIdNumber(id: string): number | null {
  const match = /^s(\d+)$/.exec(id)
  return match ? Number(match[1]) : null
}

/** Skill thỏa điều kiện của thuộc tính (thiếu mục thì TypeScript báo lỗi). */
const REQUIREMENTS: Readonly<Record<StickerRequirement, (skill: Skill) => boolean>> = {
  damaging: (skill) => skill.power > 0,
  hasAccuracy: (skill) => skill.alwaysHits !== true,
  singleTarget: (skill) =>
    skill.target === 'enemy' || skill.target === 'ally' || skill.target === 'foesOrAlly',
  hasSecondary: hasSecondaryEffect,
  inflictsStatus: (skill) =>
    skill.effects.some((effect) => SKILL_EFFECTS[effect.type]?.inflictsStatus === true),
  costsStamina: (skill) => skill.staminaCost !== 0
}

/** Thuộc tính hợp với skill (đúng hệ nếu có `elementIds`, mọi điều kiện `requires` đúng). */
export const isAttributeCompatible = (attribute: StickerAttributeDef, skill: Skill): boolean =>
  (attribute.elementIds === undefined || attribute.elementIds.includes(skill.elementId)) &&
  (attribute.requires ?? []).every((requirement) => REQUIREMENTS[requirement](skill))

/** Thuộc tính theo id; null nếu không có. */
export function findStickerAttribute(
  data: GameData,
  attributeId: string
): StickerAttributeDef | null {
  return Object.hasOwn(data.stickerAttributes, attributeId)
    ? data.stickerAttributes[attributeId]
    : null
}

/**
 * Tung độ hiếm khi nhận một Bí kíp: một lần tung, mỗi độ hiếm đúng tỉ lệ tuyệt đối của nó như gốc
 * (`chances`, mặc định `stickers.rarityChances`: 5% uncommon, 1,25% rare; quái Bootleg dùng
 * `bootleg.stickerRarityChances`), còn lại null (Bí kíp thường). Tổng 0 không tốn RNG.
 */
export function rollStickerRarity(
  data: GameData,
  rng: RngState,
  chances: Readonly<Record<StickerRarity, number>> = data.config.stickers.rarityChances
): [StickerRarity | null, RngState] {
  const total = STICKER_RARITIES.reduce((sum, rarity) => sum + chances[rarity], 0)
  if (total <= 0) return [null, rng]
  const [roll, next] = nextFloat(rng)
  let edge = 0
  for (const rarity of [...STICKER_RARITIES].reverse()) {
    edge += chances[rarity]
    if (roll * 100 < edge) return [rarity, next]
  }
  return [null, next]
}

/** Tung một thuộc tính độ hiếm `rarity` hợp với skill, khác các thuộc tính đã có; hết thì null. */
function rollAttribute(
  data: GameData,
  rng: RngState,
  { skill, rarity, taken }: { skill: Skill; rarity: StickerRarity; taken: ReadonlySet<string> }
): [StickerRoll | null, RngState] {
  const candidates = Object.values(data.stickerAttributes).filter(
    (attribute) =>
      attribute.rarity === rarity &&
      attribute.weight > 0 &&
      !taken.has(attribute.id) &&
      isAttributeCompatible(attribute, skill)
  )
  if (candidates.length === 0) return [null, rng]
  const [attribute, afterPick] = pickWeighted(rng, candidates, (entry) => entry.weight)
  rng = afterPick
  const roll: StickerRoll = { attributeId: attribute.id }
  if (attribute.range) {
    ;[roll.value, rng] = nextInt(rng, attribute.range.min, attribute.range.max)
  }
  if (attribute.choices) {
    ;[roll.choice, rng] = pick(rng, attribute.choices)
  }
  return [roll, rng]
}

/** Số thuộc tính mỗi độ hiếm của sticker (uncommon theo trọng số, rare cố định). */
function rollAttributeCounts(
  data: GameData,
  rng: RngState,
  rarity: StickerRarity
): [Record<StickerRarity, number>, RngState] {
  const { uncommonCounts, rareCounts } = data.config.stickers
  const options = uncommonCounts[rarity]
  const [chosen, next] =
    options.length > 0
      ? pickWeighted(rng, options, (option) => option.weight)
      : [{ count: 0, weight: 0 }, rng]
  return [{ uncommon: chosen.count, rare: rareCounts[rarity] }, next]
}

/**
 * Tạo sticker mới: số thuộc tính uncommon / rare theo độ hiếm (gốc: uncommon 1–2 uncommon; rare 1–2
 * uncommon + 1 rare), tối đa `maxAttributes`, không trùng, hợp với skill; ít thuộc tính hợp hơn thì
 * lấy hết.
 */
export function rollSticker(
  data: GameData,
  rng: RngState,
  { id, skillId, rarity }: { id: string; skillId: string; rarity: StickerRarity }
): [StickerInstance, RngState] {
  const skill = data.skills[skillId]
  let counts: Record<StickerRarity, number>
  ;[counts, rng] = rollAttributeCounts(data, rng, rarity)
  const rolls: StickerRoll[] = []
  for (const attributeRarity of STICKER_RARITIES) {
    for (let i = 0; i < counts[attributeRarity]; i++) {
      if (rolls.length >= data.config.stickers.maxAttributes) break
      const taken = new Set(rolls.map((roll) => roll.attributeId))
      let roll: StickerRoll | null
      ;[roll, rng] = rollAttribute(data, rng, { skill, rarity: attributeRarity, taken })
      if (!roll) break
      rolls.push(roll)
    }
  }
  return [{ id, skillId, rarity, rolls }, rng]
}

/**
 * Tẩy luyện: tung lại thuộc tính ở các vị trí `indexes` theo thứ tự, mỗi vị trí giữ độ hiếm của thuộc
 * tính cũ (ô rare vẫn rare), hợp với skill, không trùng thuộc tính còn lại; giữ vị trí. Không còn
 * thuộc tính hợp thì giữ thuộc tính cũ.
 */
export function rerollStickerRolls(
  data: GameData,
  rng: RngState,
  sticker: StickerInstance,
  indexes: readonly number[]
): [StickerInstance, RngState] {
  const skill = data.skills[sticker.skillId]
  const rolls = [...sticker.rolls]
  for (const index of indexes) {
    const rarity = findStickerAttribute(data, rolls[index].attributeId)?.rarity ?? 'uncommon'
    const taken = new Set(rolls.filter((_, i) => i !== index).map((roll) => roll.attributeId))
    let roll: StickerRoll | null
    ;[roll, rng] = rollAttribute(data, rng, { skill, rarity, taken })
    if (roll) rolls[index] = roll
  }
  return [{ ...sticker, rolls }, rng]
}

/** Phần state nhận Bí kíp: túi, RNG, bộ đếm id, sức chứa túi. */
export type BookReceiver = Pick<
  GameState,
  'inventory' | 'rng' | 'nextItemId' | 'capacity' | 'tamer' | 'ascension'
>

/** Phần state đổi sau khi nhận Bí kíp, kèm các sticker vừa tạo (log). */
export type ReceivedBooks = Pick<GameState, 'inventory' | 'rng' | 'nextItemId'> & {
  stickers: StickerInstance[]
}

/**
 * Nhận `count` cuốn sách (mọi nguồn: rơi, mua, thưởng). Bí kíp: mỗi cuốn tung độ hiếm, uncommon /
 * rare thành sticker riêng trong túi (tính sức chứa túi trang bị); túi đầy thì vẫn là Bí kíp thường.
 * Chân kinh không tung (dùng mãi, không phải sticker).
 */
export function receiveBooks(
  data: GameData,
  holder: BookReceiver,
  book: BookKey,
  count: number
): ReceivedBooks {
  let { inventory, rng, nextItemId } = holder
  const stickers: StickerInstance[] = []
  const { uncommon, rare } = data.config.stickers.rarityChances
  // Chân kinh, tỉ lệ 0 hoặc túi đầy: mọi cuốn còn lại là sách thường (không lặp từng cuốn).
  const canRoll = !book.reusable && uncommon + rare > 0
  let rolled = 0
  while (canRoll && rolled < count && hasBagRoom(data, { ...holder, inventory })) {
    rolled++
    let rarity: StickerRarity | null
    ;[rarity, rng] = rollStickerRarity(data, rng)
    if (!rarity) continue
    let sticker: StickerInstance
    ;[sticker, rng] = rollSticker(data, rng, {
      id: stickerInstanceId(nextItemId++),
      skillId: book.skillId,
      rarity
    })
    stickers.push(sticker)
    inventory = addSticker(inventory, sticker)
  }
  const plain = count - stickers.length
  if (plain > 0) inventory = addBooks(inventory, book, plain)
  return { inventory, rng, nextItemId, stickers }
}

/**
 * Nhận item gộp chồng (mua, thưởng): sách đi qua receiveBooks (có thể thành sticker), item khác
 * vào túi như thường.
 */
export function receiveByRef(
  data: GameData,
  holder: BookReceiver,
  ref: StackableItemRef,
  count: number
): ReceivedBooks {
  if (ref.storage === 'book') return receiveBooks(data, holder, ref, count)
  const { rng, nextItemId } = holder
  return { inventory: addByRef(holder.inventory, ref, count), rng, nextItemId, stickers: [] }
}

/** Ô skill cộng thêm từ sticker (Extra Slots) trên mọi skill của quái, chưa kẹp trần. */
export function stickerExtraSlots(data: GameData, monster: Monster): number {
  let slots = 0
  for (const sticker of Object.values(monster.skillStickers)) {
    for (const roll of sticker.rolls) {
      const attribute = findStickerAttribute(data, roll.attributeId)
      if (attribute) slots += STICKER_EFFECTS[attribute.effect.type].extraSkillSlots ?? 0
    }
  }
  return slots
}

/** Thay chỗ giữ `$skill` / `$choice` trong params (chuỗi đúng bằng chỗ giữ). */
function fillPlaceholders(value: unknown, fill: { skillId: string; choice?: string }): unknown {
  if (value === SKILL_PLACEHOLDER) return fill.skillId
  if (value === CHOICE_PLACEHOLDER) return fill.choice ?? value
  if (Array.isArray(value)) return value.map((entry) => fillPlaceholders(entry, fill))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, fillPlaceholders(entry, fill)])
    )
  }
  return value
}

/**
 * Params hiệu ứng của một thuộc tính đã tung: giá trị (× `emptySlots` nếu `perEmptySlot`) ghi vào
 * `valueParam`, chỗ giữ thay bằng skill / lựa chọn.
 */
export function stickerEffectParams(
  attribute: StickerAttributeDef,
  roll: StickerRoll,
  { skillId, emptySlots }: { skillId: string; emptySlots: number }
): unknown {
  const value = (roll.value ?? 0) * (attribute.perEmptySlot ? emptySlots : 1)
  const params =
    attribute.valueParam === undefined
      ? attribute.effect.params
      : lineParams({ hook: attribute.effect, valueParam: attribute.valueParam }, value)
  return fillPlaceholders(params, { skillId, choice: roll.choice })
}

/** Mỗi thuộc tính của các sticker trên quái kèm params đã tính. */
function eachStickerEffect(
  data: GameData,
  monster: Monster,
  { emptySlots, onlySkillId }: { emptySlots: number; onlySkillId?: string },
  fn: (attribute: StickerAttributeDef, params: unknown, sticker: StickerInstance) => void
): void {
  for (const [skillId, sticker] of Object.entries(monster.skillStickers)) {
    if (onlySkillId !== undefined && skillId !== onlySkillId) continue
    for (const roll of sticker.rolls) {
      const attribute = findStickerAttribute(data, roll.attributeId)
      if (!attribute) continue
      fn(attribute, stickerEffectParams(attribute, roll, { skillId, emptySlots }), sticker)
    }
  }
}

/** Hiệu lực sticker lên skill quái đang dùng (chỉ sticker dán trên đúng skill đó). */
export function stickerSkillBonus(
  data: GameData,
  monster: Monster,
  skillId: string
): StickerSkillBonus {
  if (!Object.hasOwn(monster.skillStickers, skillId)) return NO_STICKER_BONUS
  let bonus = NO_STICKER_BONUS
  const emptySlots = emptySkillSlots(data, monster)
  eachStickerEffect(data, monster, { emptySlots, onlySkillId: skillId }, (attribute, params) => {
    bonus = STICKER_EFFECTS[attribute.effect.type].addTo?.(bonus, params) ?? bonus
  })
  return bonus
}

/**
 * % EXP từ thuộc tính sticker Exp (docs/rules/skill-stickers.md): chỉ sticker trên skill đã được dùng /
 * kích hoạt trong trận (`activated`: bộ đếm EXP theo chiêu của bản ghi trận), như gốc.
 */
export function stickerExpPercent(
  data: GameData,
  monster: Monster,
  activated: Readonly<Record<string, number>> | undefined
): number {
  let percent = 0
  for (const skillId of Object.keys(monster.skillStickers)) {
    if ((activated?.[skillId] ?? 0) > 0)
      percent += stickerSkillBonus(data, monster, skillId).expPercent
  }
  return percent
}

/** Hook trait lên quái từ mọi sticker đang dán (tự dùng skill, chỉ số bị động, EXP...). */
export function stickerTraitHooks(data: GameData, monster: Monster): StickerTraitHook[] {
  const result: StickerTraitHook[] = []
  if (Object.keys(monster.skillStickers).length === 0) return result
  const emptySlots = emptySkillSlots(data, monster)
  eachStickerEffect(data, monster, { emptySlots }, (attribute, params, sticker) => {
    for (const hook of STICKER_EFFECTS[attribute.effect.type].traitHooks?.(params) ?? []) {
      // Ép kiểu vì hook của thuộc tính đã kiểm tra là hook trait hợp lệ lúc khởi động.
      result.push({ hook: hook as TraitHookDef, stickerId: sticker.id })
    }
  })
  return result
}

/** Sticker dán được lên skill quái không tương thích (có thuộc tính Compatibility). */
export const stickerIgnoresCompatibility = (data: GameData, sticker: StickerInstance): boolean =>
  sticker.rolls.some((roll) => {
    const attribute = findStickerAttribute(data, roll.attributeId)
    return (
      attribute !== null && STICKER_EFFECTS[attribute.effect.type].ignoresCompatibility === true
    )
  })
