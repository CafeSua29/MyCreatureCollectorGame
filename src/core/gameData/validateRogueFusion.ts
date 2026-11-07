// Kiểm tra config.rogueFusion (docs/rules/rogue-fusion.md): tỉ lệ, trọng số biến thể, id vật phẩm /
// trạng thái / hệ tồn tại, số thưởng, hàng đổi Fused Material.

import { ROGUE_FUSION_VARIANTS, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const WHERE = 'config.rogueFusion'

const FIELDS = [
  'chance',
  'variantWeights',
  'orbUnlockFloor',
  'floodElementIds',
  'seenSpeciesChance',
  'remasterChance',
  'swarmRemasterChance',
  'bootlegChances',
  'swarmSize',
  'swarmFusionAfter',
  'orbStatusId',
  'orbBarrierPercent',
  'flinchStatusId',
  'fusedMaterial',
  'cyberChances',
  'bossFusedMaterial',
  'fusedMaterialItemId',
  'cyberMaterialItemId',
  'hackingGloveItemId',
  'ritualCandleItemId',
  'candleSpeciesPercent',
  'exchange',
  'houseGiftLevel',
  'questGiftQuests'
]

/** Bảng theo biến thể: đủ mọi biến thể, mỗi giá trị kiểm tra bằng `check`. */
function checkVariantTable(
  value: unknown,
  field: string,
  check: (entry: unknown, where: string) => string[]
): string[] {
  const table = asObject(value)
  return ROGUE_FUSION_VARIANTS.flatMap((variant) =>
    check(table?.[variant], `${WHERE}.${field}.${variant}`)
  )
}

/** Kiểm tra config.rogueFusion. */
export function checkRogueFusionConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.rogueFusion)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, FIELDS, WHERE, 'config Rogue Fusion', issues)
  const percent = (entry: unknown, where: string): string[] => checkNumber(entry, where, 0, 100)
  for (const field of [
    'chance',
    'seenSpeciesChance',
    'remasterChance',
    'swarmRemasterChance',
    'candleSpeciesPercent'
  ]) {
    issues.push(...percent(config[field], `${WHERE}.${field}`))
  }
  issues.push(
    ...checkVariantTable(config.variantWeights, 'variantWeights', (e, w) => checkNumber(e, w, 0))
  )
  issues.push(...checkVariantTable(config.bootlegChances, 'bootlegChances', percent))
  issues.push(...checkVariantTable(config.cyberChances, 'cyberChances', percent))
  issues.push(
    ...checkVariantTable(config.fusedMaterial, 'fusedMaterial', (e, w) => checkInteger(e, w, 0))
  )
  issues.push(...checkInteger(config.orbUnlockFloor, `${WHERE}.orbUnlockFloor`, 1))
  issues.push(...checkInteger(config.swarmSize, `${WHERE}.swarmSize`, 1))
  issues.push(...checkInteger(config.swarmFusionAfter, `${WHERE}.swarmFusionAfter`, 1))
  if (
    typeof config.swarmSize === 'number' &&
    typeof config.swarmFusionAfter === 'number' &&
    config.swarmFusionAfter > config.swarmSize
  ) {
    issues.push(`${WHERE}.swarmFusionAfter phải ≤ swarmSize`)
  }
  issues.push(...checkNumber(config.orbBarrierPercent, `${WHERE}.orbBarrierPercent`, 0))
  issues.push(...checkInteger(config.bossFusedMaterial, `${WHERE}.bossFusedMaterial`, 0))
  issues.push(...checkInteger(config.houseGiftLevel, `${WHERE}.houseGiftLevel`, 1))
  issues.push(...checkInteger(config.questGiftQuests, `${WHERE}.questGiftQuests`, 0))
  for (const field of ['orbStatusId', 'flinchStatusId']) {
    const id = config[field]
    if (typeof id !== 'string' || !Object.hasOwn(data.statuses, id)) {
      issues.push(`${WHERE}.${field}: trạng thái không tồn tại "${String(id)}"`)
    }
  }
  for (const field of [
    'fusedMaterialItemId',
    'cyberMaterialItemId',
    'hackingGloveItemId',
    'ritualCandleItemId'
  ]) {
    const id = config[field]
    if (typeof id !== 'string' || !Object.hasOwn(data.items, id)) {
      issues.push(`${WHERE}.${field}: vật phẩm không tồn tại "${String(id)}"`)
    }
  }
  const elements = config.floodElementIds
  if (
    !Array.isArray(elements) ||
    elements.some((id) => typeof id !== 'string' || !Object.hasOwn(data.elements, id))
  ) {
    issues.push(`${WHERE}.floodElementIds phải là danh sách id hệ tồn tại`)
  }
  checkExchange(data, config.exchange, issues)
}

/** Hàng đổi: vật phẩm tồn tại, gộp chồng, giá nguyên ≥ 1, không trùng. */
function checkExchange(data: GameData, value: unknown, issues: string[]): void {
  const where = `${WHERE}.exchange`
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  const seen = new Set<unknown>()
  value.forEach((raw: unknown, i) => {
    const entry = asObject(raw)
    checkKnownFields(entry, ['itemId', 'cost'], `${where}[${i}]`, 'hàng đổi', issues)
    const itemId = entry?.itemId
    if (typeof itemId !== 'string' || !Object.hasOwn(data.items, itemId)) {
      issues.push(`${where}[${i}].itemId: vật phẩm không tồn tại "${String(itemId)}"`)
    }
    if (seen.has(itemId)) issues.push(`${where}[${i}].itemId trùng`)
    seen.add(itemId)
    issues.push(...checkInteger(entry?.cost, `${where}[${i}].cost`, 1))
  })
}
