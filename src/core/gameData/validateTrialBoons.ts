// Kiểm tra dữ liệu ân huệ bí cảnh (docs/rules/trial-boons.md): trialBoons.json (hiệu ứng theo
// registry TRIAL_BOON_EFFECTS) và config.trials.boons.

import {
  TRIAL_BOON_EFFECT_TYPES,
  TRIAL_BOON_RARITIES,
  type GameData,
  type TrialBoonDef
} from '../model'
import { TRIAL_BOON_EFFECTS } from '../registries'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields, fieldList } from './checks'

const BOON_FIELDS = fieldList<TrialBoonDef>({
  id: true,
  rarity: true,
  effects: true,
  maxStacks: true
})

/** Một hiệu ứng: loại có trong registry, trường đúng loại, params hợp lệ. */
function checkBoonEffect(data: GameData, value: unknown, where: string, issues: string[]): void {
  const effect = asObject(value)
  const type = effect?.type
  if (!effect || !(TRIAL_BOON_EFFECT_TYPES as readonly unknown[]).includes(type)) {
    issues.push(`${where}: type phải là một trong ${TRIAL_BOON_EFFECT_TYPES.join(', ')}`)
    return
  }
  // Ép kiểu vì vừa kiểm tra type nằm trong danh sách loại.
  const handler = TRIAL_BOON_EFFECTS[type as (typeof TRIAL_BOON_EFFECT_TYPES)[number]]
  checkKnownFields(effect, ['type', ...handler.fields], where, `hiệu ứng ${String(type)}`, issues)
  for (const issue of handler.validate(effect, data)) issues.push(`${where}: ${issue}`)
}

function checkTrialBoon(data: GameData, boon: TrialBoonDef, issues: string[]): void {
  const where = `Ân huệ "${boon.id}"`
  checkKnownFields(boon, BOON_FIELDS, where, 'ân huệ', issues)
  if (!(TRIAL_BOON_RARITIES as readonly unknown[]).includes(boon.rarity)) {
    issues.push(`${where}: rarity phải là một trong ${TRIAL_BOON_RARITIES.join(', ')}`)
  }
  if (boon.maxStacks !== undefined) {
    issues.push(...checkInteger(boon.maxStacks, `${where}: maxStacks`, 1))
  }
  if (!Array.isArray(boon.effects) || boon.effects.length === 0) {
    issues.push(`${where}: effects phải là danh sách không rỗng`)
    return
  }
  boon.effects.forEach((effect, i) =>
    checkBoonEffect(data, effect, `${where}: effects[${i}]`, issues)
  )
}

/** config.trials.boons: số lựa chọn, trọng số theo bậc hiếm (đủ mọi bậc), % tiền khi bỏ. */
function checkBoonConfig(value: unknown, issues: string[]): void {
  const at = 'config.trials.boons'
  const config = asObject(value)
  if (!config) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(
    config,
    [
      'choiceCount',
      'rarityWeights',
      'instabilityRarityPercent',
      'bossWeakenCapPercent',
      'skipMoneyPercent'
    ],
    at,
    'config',
    issues
  )
  issues.push(...checkInteger(config.choiceCount, `${at}.choiceCount`, 0))
  issues.push(...checkNumber(config.skipMoneyPercent, `${at}.skipMoneyPercent`, 0))
  issues.push(...checkNumber(config.bossWeakenCapPercent, `${at}.bossWeakenCapPercent`, 0, 99))
  checkRarityNumbers(config.rarityWeights, `${at}.rarityWeights`, issues)
  checkRarityNumbers(config.instabilityRarityPercent, `${at}.instabilityRarityPercent`, issues)
}

/** Object bậc hiếm → số ≥ 0, đủ mọi bậc, không bậc lạ. */
function checkRarityNumbers(value: unknown, at: string, issues: string[]): void {
  const numbers = asObject(value)
  if (!numbers) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(numbers, TRIAL_BOON_RARITIES, at, 'bậc hiếm', issues)
  for (const rarity of TRIAL_BOON_RARITIES) {
    issues.push(...checkNumber(numbers[rarity], `${at}.${rarity}`, 0))
  }
}

/** Kiểm tra trialBoons.json và config.trials.boons. */
export function checkTrialBoons(data: GameData, issues: string[]): void {
  for (const boon of Object.values(data.trialBoons)) checkTrialBoon(data, boon, issues)
  checkBoonConfig(asObject(data.config.trials)?.boons, issues)
}
