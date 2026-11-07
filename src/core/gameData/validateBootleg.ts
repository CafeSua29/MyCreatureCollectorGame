// Kiểm tra config.bootleg (docs/rules/bootleg.md): tỉ lệ 0–100, hệ số thưởng ≥ 0, tỉ lệ sticker.

import type { GameData } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkKnownFields } from './checks'
import { checkRarityChances } from './validateStickers'

const WHERE = 'config.bootleg'

/** Kiểm tra config.bootleg. */
export function checkBootlegConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.bootleg)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(
    config,
    [
      'wildChance',
      'staticChance',
      'inheritPercent',
      'rewardMultiplier',
      'beastTideMultiplier',
      'instabilityPercentPerLevel',
      'stickerRarityChances'
    ],
    WHERE,
    'config Bootleg',
    issues
  )
  issues.push(...checkNumber(config.wildChance, `${WHERE}.wildChance`, 0, 100))
  issues.push(...checkNumber(config.staticChance, `${WHERE}.staticChance`, 0, 100))
  issues.push(...checkNumber(config.inheritPercent, `${WHERE}.inheritPercent`, 0, 100))
  issues.push(...checkNumber(config.rewardMultiplier, `${WHERE}.rewardMultiplier`, 0))
  issues.push(...checkNumber(config.beastTideMultiplier, `${WHERE}.beastTideMultiplier`, 0))
  issues.push(
    ...checkNumber(config.instabilityPercentPerLevel, `${WHERE}.instabilityPercentPerLevel`, 0)
  )
  issues.push(...checkRarityChances(config.stickerRarityChances, `${WHERE}.stickerRarityChances`))
}
