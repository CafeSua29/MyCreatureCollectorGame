// Luật kiểm tra dữ liệu vật phẩm theo category (mục Dữ liệu). Mỗi category khai báo các trường
// riêng được phép (ngoài id, category; trường lạ báo lỗi, kể cả name: chữ nằm ở src/data/i18n) và hàm kiểm tra giá trị.
// Thêm category mới = thêm interface vào union Item (model/content.ts) + một mục ở đây; TypeScript
// báo lỗi nếu thiếu mục.

import {
  BALL_BONUSES,
  CHARM_EFFECT_RULES,
  FUSION_AID_EFFECTS,
  ITEM_EFFECTS,
  SKILL_EFFECTS,
  TRAIT_HOOKS,
  checkIdList,
  raceRefIds
} from '../registries'
import {
  GAME_OPTION_FLAGS,
  CHARM_EFFECT_TYPES,
  ITEM_CATEGORIES,
  STELLAR,
  ITEM_TARGETS,
  ITEM_USES,
  isBattleOnlyMove,
  type CharmEffectType,
  type EffectDef,
  type GameData,
  type Item,
  type ItemCategory
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { isTeraElement } from './checks'
import { checkEffectTargets, checkEffects, checkKnownFields } from './checks'
import { checkEquipmentItem } from './validateEquipment'

/** Trường chung của mọi item. */
const COMMON_ITEM_FIELDS: readonly string[] = ['id', 'category']

/** Item đọc từ JSON, chưa kiểm tra: đọc trường dạng unknown. */
type RawItem = Readonly<Record<string, unknown>>

interface ItemCategoryRule {
  /** Trường riêng của category. */
  fields: readonly string[]
  /** Category chưa làm: tên mục lộ trình sẽ làm. Dữ liệu dùng category này báo lỗi. */
  pendingFeature?: string
  /** Kiểm tra giá trị các trường riêng; không có thì category không có trường cần kiểm tra. */
  check?(item: RawItem, where: string, data: GameData, issues: string[]): void
}

/**
 * Trường chung của item có giá: giá, có bán ở cửa hàng không, trọng số trong danh sách hàng,
 * giá cố định (không nhân tầng).
 */
const PRICED_FIELDS: readonly string[] = [
  'price',
  'shop',
  'shopWeight',
  'fixedPrice',
  'requiresKeyItemId',
  'requiresOption'
]

/**
 * `price` ≥ 0; `shop` chỉ ghi `true`, khi đó bắt buộc `shopWeight` > 0; `fixedPrice` chỉ ghi
 * `true` (mục "Cửa hàng").
 */
function checkPrice(item: RawItem, where: string, issues: string[]): void {
  issues.push(...checkNumber(item.price, `${where}: price`, 0))
  const option = item.requiresOption
  if (option !== undefined && !GAME_OPTION_FLAGS.some((flag) => flag === option)) {
    issues.push(`${where}: requiresOption phải là một trong ${GAME_OPTION_FLAGS.join(', ')}`)
  }
  if (item.fixedPrice !== undefined && item.fixedPrice !== true) {
    issues.push(`${where}: fixedPrice chỉ được ghi true (bỏ trống = giá nhân tầng)`)
  }
  if (item.shop === undefined) {
    if (item.shopWeight !== undefined) issues.push(`${where}: shopWeight chỉ dùng khi shop: true`)
    return
  }
  if (item.shop !== true) issues.push(`${where}: shop chỉ được ghi true (bỏ trống = không bán)`)
  issues.push(...checkNumber(item.shopWeight, `${where}: shopWeight`, Number.MIN_VALUE))
}

/** Khẩu vị (docs/rules/treasures.md, recruit.md): danh sách id race / hệ tồn tại, không rỗng. */
function checkFavorites(item: RawItem, where: string, data: GameData, issues: string[]): void {
  if (item.favoriteRaceIds !== undefined) {
    issues.push(
      ...checkIdList(item.favoriteRaceIds, `${where}: favoriteRaceIds`, raceRefIds(data), {
        label: 'race'
      })
    )
  }
  if (item.favoriteElementIds !== undefined) {
    issues.push(
      ...checkIdList(item.favoriteElementIds, `${where}: favoriteElementIds`, data.elements, {
        label: 'hệ'
      })
    )
  }
}

/** Mồi dụ (docs/rules/recruit.md): % thu phục > 0, số trận nguyên ≥ 1, khẩu vị. */
function checkBait(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  issues.push(...checkNumber(item.recruitPercent, `${where}: recruitPercent`, Number.MIN_VALUE))
  issues.push(...checkInteger(item.battles, `${where}: battles`, 1))
  checkFavorites(item, where, data, issues)
}

function checkConsumable(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  if (!ITEM_USES.some((use) => use === item.use)) {
    issues.push(`${where}: use phải là "field", "battle" hoặc "both"`)
  }
  if (!ITEM_TARGETS.some((target) => target === item.target)) {
    issues.push(`${where}: target phải là "ally" hoặc "enemy"`)
  }
  // Vật phẩm ném chỉ dùng trong trận và chạy hiệu ứng như skill trúng quái hoang.
  const thrown = item.target === 'enemy'
  if (thrown && item.use !== 'battle') {
    issues.push(`${where}: vật phẩm ném (target "enemy") phải có use "battle"`)
  }
  // Ép kiểu vì checkEffects tự kiểm tra là danh sách và từng hook.
  const effects = item.effects as EffectDef[] | undefined
  checkEffects(thrown ? SKILL_EFFECTS : ITEM_EFFECTS, effects, where, data, issues)
  if (thrown) checkEffectTargets(effects, 'enemy', where, issues)
  checkFavorites(item, where, data, issues)
  // Rút về cần ô sân của quái dùng skill: vật phẩm ném không dùng được.
  for (const effect of thrown && Array.isArray(effects) ? effects : []) {
    if (SKILL_EFFECTS[effect.type]?.switchesUserOut) {
      issues.push(
        `${where}: hiệu ứng "${effect.type}" chỉ dùng cho skill, không dùng cho vật phẩm ném`
      )
    }
  }
}

function checkBall(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  issues.push(...checkNumber(item.catchMultiplier, `${where}: catchMultiplier`, Number.MIN_VALUE))
  // Thân mật khởi đầu của quái bắt bằng bóng này (docs/rules/affinity.md).
  if (item.startAffinity !== undefined) {
    issues.push(...checkInteger(item.startAffinity, `${where}: startAffinity`, 0))
    const max = data.config.affinity?.max
    if (
      typeof item.startAffinity === 'number' &&
      typeof max === 'number' &&
      item.startAffinity > max
    ) {
      issues.push(`${where}: startAffinity tối đa ${max}, nhận ${item.startAffinity}`)
    }
  }
  // Điều kiện của bóng (registry BALL_BONUSES, mục "Bắt quái" ở battle.md).
  // Ép kiểu vì checkEffects tự kiểm tra là danh sách và từng điều kiện.
  if (item.bonuses !== undefined) {
    checkEffects(BALL_BONUSES, item.bonuses as EffectDef[], `${where}: bonuses`, data, issues)
  }
  for (const flag of ['alwaysCatch', 'healOnCatch'] as const) {
    if (item[flag] !== undefined && item[flag] !== true)
      issues.push(`${where}: ${flag} chỉ được là true`)
  }
}

/** Bùa fuse: ít nhất một hiệu ứng, mọi hiệu ứng cùng một ô (tăng tỉ lệ / hộ mệnh). */
function checkFusionAid(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  // Ép kiểu vì checkEffects tự kiểm tra là danh sách và từng hook.
  const effects = item.effects as EffectDef[] | undefined
  checkEffects(FUSION_AID_EFFECTS, effects, where, data, issues)
  if (!Array.isArray(effects)) return
  if (effects.length === 0) issues.push(`${where}: cần ít nhất một hiệu ứng`)
  // Hook lạ đã được checkEffects báo; chỉ xét ô của hook có trong registry.
  const slots = new Set(
    effects.flatMap((effect) => {
      const handler = FUSION_AID_EFFECTS[effect.type]
      return handler ? [handler.slot] : []
    })
  )
  if (slots.size > 1) {
    issues.push(`${where}: mọi hiệu ứng của một bùa phải cùng ô, đang có ${[...slots].join(', ')}`)
  }
}

/** Bùa: ≥ 1 hiệu ứng, loại thuộc CHARM_EFFECT_TYPES, không trùng loại, giá trị theo luật của loại. */
function checkCharm(item: RawItem, where: string, _data: GameData, issues: string[]): void {
  if (!Array.isArray(item.effects) || item.effects.length === 0) {
    issues.push(`${where}: effects phải là danh sách không rỗng`)
    return
  }
  const seen = new Set<string>()
  for (const raw of item.effects) {
    const effect = asObject(raw)
    const type = effect?.type
    if (!effect || typeof type !== 'string' || !isCharmEffectType(type)) {
      issues.push(`${where}: hiệu ứng bùa phải có type là ${CHARM_EFFECT_TYPES.join(', ')}`)
      continue
    }
    if (seen.has(type)) issues.push(`${where}: hiệu ứng "${type}" bị trùng`)
    seen.add(type)
    const rule = CHARM_EFFECT_RULES[type]
    if (typeof effect.value !== 'number' || !rule.isValid(effect.value)) {
      issues.push(`${where}: "${type}".value phải là ${rule.describe}`)
    }
  }
}

const isCharmEffectType = (type: string): type is CharmEffectType =>
  CHARM_EFFECT_TYPES.some((known) => known === type)

/**
 * Đồ cầm: giá, hook trait hợp lệ (mọi hook: hook có `heldUse` tiêu hao đồ lúc kích hoạt, hook không
 * có thì tác dụng liên tục khi còn cầm), nhãn là chuỗi khác rỗng, `speciesIds` là loài thường tồn
 * tại, không trùng.
 */
function checkHeld(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  // Ép kiểu vì checkEffects tự kiểm tra là danh sách và từng hook.
  const hooks = item.hooks as EffectDef[] | undefined
  checkEffects(TRAIT_HOOKS, hooks, where, data, issues)
  checkHeldSpecies(item, where, data, issues)
  if (item.flingPower !== undefined)
    issues.push(...checkNumber(item.flingPower, `${where}: flingPower`, 1))
  if (
    item.flingStatusId !== undefined &&
    !Object.hasOwn(data.statuses, item.flingStatusId as string)
  ) {
    issues.push(`${where}: flingStatusId: trạng thái không tồn tại "${String(item.flingStatusId)}"`)
  }
  if (item.naturalGift !== undefined) {
    const gift = asObject(item.naturalGift)
    issues.push(...checkNumber(gift?.power, `${where}: naturalGift.power`, 1))
    if (typeof gift?.elementId !== 'string' || !Object.hasOwn(data.elements, gift.elementId)) {
      issues.push(`${where}: naturalGift.elementId: hệ không tồn tại "${String(gift?.elementId)}"`)
    }
  }
  if (item.skillElement !== undefined) {
    const rule = asObject(item.skillElement)
    const ids = rule?.skillIds
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.some((id) => !Object.hasOwn(data.skills, id))
    ) {
      issues.push(`${where}: skillElement.skillIds phải là danh sách skill tồn tại`)
    }
    if (typeof rule?.elementId !== 'string' || !Object.hasOwn(data.elements, rule.elementId)) {
      issues.push(`${where}: skillElement.elementId: hệ không tồn tại "${String(rule?.elementId)}"`)
    }
  }
  if (item.persistent !== undefined && item.persistent !== true) {
    issues.push(`${where}: persistent chỉ được là true`)
  }
  const tags = item.tags
  if (
    tags !== undefined &&
    (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string' || t === ''))
  ) {
    issues.push(`${where}: tags phải là danh sách chuỗi khác rỗng`)
  }
}

/** speciesIds của đồ cầm: danh sách khác rỗng các loài thường tồn tại, không trùng. */
function checkHeldSpecies(item: RawItem, where: string, data: GameData, issues: string[]): void {
  const ids = item.speciesIds
  if (ids === undefined) return
  if (!Array.isArray(ids) || ids.length === 0) {
    issues.push(`${where}: speciesIds phải là danh sách khác rỗng`)
    return
  }
  if (new Set(ids).size !== ids.length) issues.push(`${where}: speciesIds có loài trùng`)
  for (const id of ids) {
    const species =
      typeof id === 'string' && Object.hasOwn(data.species, id) ? data.species[id] : null
    if (species?.kind !== 'normal')
      issues.push(`${where}: speciesIds có loài không tồn tại "${String(id)}"`)
  }
}

/** Trang bị gốc: giá + dòng (validateEquipment.ts). */
function checkEquipment(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  checkEquipmentItem(item, where, data, issues)
  if (item.hooks !== undefined) {
    // Ép kiểu vì checkEffects tự kiểm tra là danh sách và từng hook.
    checkEffects(TRAIT_HOOKS, item.hooks as EffectDef[], `${where}.hooks`, data, issues)
  }
}

function checkPriceOnly(item: RawItem, where: string, _data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
}

/** Đá Mega: giá, formId là loài dạng Mega, auto (kiểu Primal) chỉ ghi true. */
function checkMegaStone(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  const form = typeof item.formId === 'string' ? data.species[item.formId] : undefined
  if (form?.kind !== 'normal' || form.formKind !== 'mega') {
    issues.push(`${where}: formId phải là loài dạng Mega, nhận "${String(item.formId)}"`)
  }
  if (item.auto !== undefined && item.auto !== true) issues.push(`${where}: auto chỉ được ghi true`)
}

/** Mảnh Tera: giá, elementId là hệ hoặc Stellar. */
function checkTeraShard(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  if (!isTeraElement(data, item.elementId)) {
    issues.push(
      `${where}: elementId phải là hệ hoặc "${STELLAR}", nhận "${String(item.elementId)}"`
    )
  }
}

/**
 * Z-Crystal (docs/rules/z-moves.md): giá; crystal hệ (`elementId` có Z-Move theo hệ) hoặc crystal
 * loài (`baseSkillId` skill học được, `zSkillId` Z-Move riêng, `speciesIds` loài dùng được).
 */
function checkZCrystal(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  if (item.elementId !== undefined) {
    const signatureFields = ['baseSkillId', 'zSkillId', 'speciesIds'].filter((f) => f in item)
    if (signatureFields.length > 0) {
      issues.push(`${where}: crystal hệ không có ${signatureFields.join(', ')}`)
    }
    const elementId = String(item.elementId)
    const hasZMove = Object.values(data.skills).some(
      (skill) => skill.zMove === 'z' && skill.elementId === elementId
    )
    if (!(elementId in data.elements) || !hasZMove) {
      issues.push(`${where}: elementId phải là hệ có Z-Move (zMove "z"), nhận "${elementId}"`)
    }
    return
  }
  const base = typeof item.baseSkillId === 'string' ? data.skills[item.baseSkillId] : undefined
  if (!base || isBattleOnlyMove(base)) {
    issues.push(`${where}: baseSkillId phải là skill học được, nhận "${String(item.baseSkillId)}"`)
  }
  const zSkill = typeof item.zSkillId === 'string' ? data.skills[item.zSkillId] : undefined
  if (zSkill?.zMove !== 'signature') {
    issues.push(`${where}: zSkillId phải là Z-Move riêng (zMove "signature")`)
  }
  issues.push(
    ...checkIdList(item.speciesIds, `${where}: speciesIds`, data.species, { label: 'loài' })
  )
  if (item.ultraBurst !== undefined) checkUltraBurst(item.ultraBurst, where, data, issues)
}

/** Ultra Burst của crystal: loài nguồn tồn tại, dạng là loài dạng `battleOnly`. */
function checkUltraBurst(value: unknown, where: string, data: GameData, issues: string[]): void {
  const burst = asObject(value)
  if (!burst) {
    issues.push(`${where}: ultraBurst phải là object`)
    return
  }
  issues.push(
    ...checkIdList(burst.fromSpeciesIds, `${where}: ultraBurst.fromSpeciesIds`, data.species, {
      label: 'loài'
    })
  )
  const form = typeof burst.formId === 'string' ? data.species[burst.formId] : undefined
  if (form?.kind !== 'normal' || form.formKind !== 'battleOnly') {
    issues.push(`${where}: ultraBurst.formId phải là loài dạng trong trận`)
  }
}

/** Trận đồ: giá, formationId là trận pháp. */
/** Đan phương (docs/rules/alchemy.md): trỏ tới công thức cần đan phương. */
function checkRecipeScroll(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  const recipe = typeof item.recipeId === 'string' ? data.recipes[item.recipeId] : undefined
  if (!recipe?.scroll) {
    issues.push(
      `${where}: recipeId phải là công thức cần đan phương, nhận "${String(item.recipeId)}"`
    )
  }
}

/** Hồn tinh: giá, số điểm nguyên ≥ 1. */
function checkSoulCrystal(item: RawItem, where: string, _data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  issues.push(...checkInteger(item.points, `${where}: points`, 1))
}

/** Hạt giống: số ngày nguyên ≥ 1, thu hoạch là danh sách { itemId tồn tại, 0 ≤ min ≤ max }. */
function checkSeed(item: RawItem, where: string, data: GameData, issues: string[]): void {
  checkPrice(item, where, issues)
  issues.push(...checkInteger(item.growDays, `${where}: growDays`, 1))
  if (!Array.isArray(item.harvest) || item.harvest.length === 0) {
    issues.push(`${where}: harvest phải là danh sách không rỗng`)
    return
  }
  item.harvest.forEach((entry: unknown, i: number) => {
    const at = `${where}: harvest[${i}]`
    const harvest = asObject(entry)
    const itemId = harvest?.itemId
    if (typeof itemId !== 'string' || !(itemId in data.items)) {
      issues.push(`${at}.itemId: vật phẩm không tồn tại "${String(itemId)}"`)
    }
    issues.push(...checkInteger(harvest?.min, `${at}.min`, 0))
    issues.push(...checkInteger(harvest?.max, `${at}.max`, 0))
    const { min, max } = harvest ?? {}
    if (typeof min === 'number' && typeof max === 'number' && max < min) {
      issues.push(`${at}: max phải ≥ min`)
    }
  })
}

function checkFormationScroll(
  item: RawItem,
  where: string,
  data: GameData,
  issues: string[]
): void {
  checkPrice(item, where, issues)
  const formationId = item.formationId
  if (typeof formationId !== 'string' || !(formationId in data.formations)) {
    issues.push(`${where}: formationId phải là trận pháp, nhận "${String(formationId)}"`)
  }
}

/** requiresKeyItemId (món có giá) trỏ tới vật phẩm chìa khóa. */
function checkRequiredKeyItem(
  item: RawItem,
  where: string,
  data: GameData,
  issues: string[]
): void {
  const keyItemId = item.requiresKeyItemId
  if (keyItemId === undefined) return
  const keyItem = typeof keyItemId === 'string' ? data.items[keyItemId] : undefined
  if (keyItem?.category !== 'keyItem') {
    issues.push(
      `${where}: requiresKeyItemId phải là vật phẩm chìa khóa, nhận "${String(keyItemId)}"`
    )
  }
}

const ITEM_CATEGORY_RULES: Readonly<Record<ItemCategory, ItemCategoryRule>> = {
  consumable: {
    fields: [...PRICED_FIELDS, 'use', 'target', 'effects', 'favoriteRaceIds', 'favoriteElementIds'],
    check: checkConsumable
  },
  ball: {
    fields: [
      ...PRICED_FIELDS,
      'catchMultiplier',
      'startAffinity',
      'bonuses',
      'alwaysCatch',
      'healOnCatch'
    ],
    check: checkBall
  },
  evolutionStone: { fields: PRICED_FIELDS, check: checkPriceOnly },
  // Giá tinh thể tính theo trait và cấp (mục "Extract / inject trait"), nên không có price.
  traitCrystal: { fields: [] },
  held: {
    fields: [
      ...PRICED_FIELDS,
      'hooks',
      'tags',
      'persistent',
      'speciesIds',
      'flingPower',
      'naturalGift',
      'flingStatusId',
      'skillElement'
    ],
    check: checkHeld
  },
  equipment: {
    fields: [...PRICED_FIELDS, 'mainLine', 'hooks', 'unique', 'soulRelicStat'],
    check: checkEquipment
  },
  fusionAid: { fields: [...PRICED_FIELDS, 'effects'], check: checkFusionAid },
  // Vật phẩm chìa khóa không có giá (không bán / mua / vứt), không có trường riêng.
  keyItem: { fields: [] },
  // Bùa (docs/rules/dex.md): không có giá, hiệu ứng theo CHARM_EFFECT_RULES.
  charm: { fields: ['effects'], check: checkCharm },
  megaStone: { fields: [...PRICED_FIELDS, 'formId', 'auto'], check: checkMegaStone },
  teraShard: { fields: [...PRICED_FIELDS, 'elementId'], check: checkTeraShard },
  zCrystal: {
    fields: [...PRICED_FIELDS, 'elementId', 'baseSkillId', 'zSkillId', 'speciesIds', 'ultraBurst'],
    check: checkZCrystal
  },
  // Nguyên liệu: chỉ có giá, tiêu hao trong action dùng nó (đột phá cảnh giới...).
  material: { fields: PRICED_FIELDS, check: checkPriceOnly },
  // Trận đồ (docs/rules/team.md): tiêu trong action learnFormation.
  formationScroll: { fields: [...PRICED_FIELDS, 'formationId'], check: checkFormationScroll },
  recipeScroll: { fields: [...PRICED_FIELDS, 'recipeId'], check: checkRecipeScroll },
  seed: { fields: [...PRICED_FIELDS, 'growDays', 'harvest'], check: checkSeed },
  // Giá sách tính theo skill (docs/rules/skill-books.md), nên không có price.
  skillBook: { fields: [] },
  // Hồn tinh (docs/rules/soul-levels.md): số điểm mỗi viên.
  soulCrystal: { fields: [...PRICED_FIELDS, 'points'], check: checkSoulCrystal },
  // Mồi dụ (docs/rules/recruit.md): dùng qua action useBait.
  bait: {
    fields: [
      ...PRICED_FIELDS,
      'recruitPercent',
      'battles',
      'favoriteRaceIds',
      'favoriteElementIds'
    ],
    check: checkBait
  }
}

/** Kiểm tra một item theo luật category của nó. */
function checkItem(item: Item, data: GameData, issues: string[]): void {
  const where = `Vật phẩm "${item.id}"`
  if (!ITEM_CATEGORIES.includes(item.category)) {
    issues.push(`${where}: category phải là một trong ${ITEM_CATEGORIES.join(', ')}`)
    return
  }
  const rule = ITEM_CATEGORY_RULES[item.category]
  if (rule.pendingFeature) {
    issues.push(
      `${where}: category "${item.category}" chưa hỗ trợ (làm ở "${rule.pendingFeature}")`
    )
    return
  }
  // Ép kiểu vì dữ liệu JSON chưa được kiểm tra: đọc từng trường dạng unknown.
  const raw = item as unknown as RawItem
  const allowed = [...COMMON_ITEM_FIELDS, ...rule.fields]
  checkKnownFields(raw, allowed, where, `category "${item.category}"`, issues)
  rule.check?.(raw, where, data, issues)
  checkRequiredKeyItem(raw, where, data, issues)
}

/**
 * Category có tham số ở từng chồng trong túi (tinh thể theo trait + cấp, sách theo skill + loại):
 * một định nghĩa chung duy nhất.
 */
const SHARED_DEFINITION_CATEGORIES: readonly ItemCategory[] = ['traitCrystal', 'skillBook']

/** Kiểm tra mọi vật phẩm; tinh thể trait và sách kỹ năng phải có đúng một định nghĩa chung. */
export function checkItems(data: GameData, issues: string[]): void {
  const items = Object.values(data.items)
  for (const item of items) checkItem(item, data, issues)
  for (const category of SHARED_DEFINITION_CATEGORIES) {
    const defs = items.filter((item) => item.category === category).length
    if (defs !== 1) {
      issues.push(`Vật phẩm: cần đúng một vật phẩm category "${category}", có ${defs}`)
    }
  }
  checkTeraShardCoverage(data, issues)
}

/** Mỗi hệ và Stellar có đúng một Mảnh Tera (đổi hệ Tera, rơi từ boss theo hệ Tera). */
function checkTeraShardCoverage(data: GameData, issues: string[]): void {
  for (const elementId of [...Object.keys(data.elements), STELLAR]) {
    const count = Object.values(data.items).filter(
      (item) => item.category === 'teraShard' && item.elementId === elementId
    ).length
    if (count !== 1) issues.push(`Mảnh Tera: hệ "${elementId}" cần đúng một mảnh, có ${count}`)
  }
}
