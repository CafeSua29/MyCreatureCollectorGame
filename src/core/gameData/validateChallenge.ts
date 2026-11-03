// Kiểm tra dữ liệu độ khó và chế độ thử thách (docs/rules/challenge-modes.md): config.challenge.

import { DIFFICULTIES, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const DIFFICULTY_FIELDS = [
  'levelPercent',
  'geneMultiplier',
  'frenzyThresholdPercent',
  'frenzyExtraActionPercent',
  'rewardPercent',
  'expPercent'
]

/** Số của một mức độ khó: % level ≥ −100, hệ số gen > 0, % thưởng / EXP ≥ −100 (không âm). */
function checkDifficulty(value: unknown, path: string, issues: string[]): void {
  const numbers = asObject(value)
  if (!numbers) {
    issues.push(`${path} phải là object`)
    return
  }
  checkKnownFields(numbers, DIFFICULTY_FIELDS, path, 'config', issues)
  issues.push(...checkNumber(numbers.levelPercent, `${path}.levelPercent`, -100))
  issues.push(...checkNumber(numbers.geneMultiplier, `${path}.geneMultiplier`, 0))
  if (numbers.geneMultiplier === 0) issues.push(`${path}.geneMultiplier phải > 0`)
  issues.push(...checkNumber(numbers.frenzyThresholdPercent, `${path}.frenzyThresholdPercent`))
  issues.push(...checkNumber(numbers.frenzyExtraActionPercent, `${path}.frenzyExtraActionPercent`))
  issues.push(...checkNumber(numbers.rewardPercent, `${path}.rewardPercent`, -100))
  issues.push(...checkNumber(numbers.expPercent, `${path}.expPercent`, -100))
}

/** Kiểm tra config.challenge: đủ mọi mức độ khó, bậc Randomizer ≥ 1 loài. */
export function checkChallengeData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.challenge)
  if (!config) {
    issues.push('config.challenge phải là object')
    return
  }
  checkKnownFields(config, ['difficulties', 'randomizer'], 'config.challenge', 'config', issues)
  const difficulties = asObject(config.difficulties)
  if (!difficulties) issues.push('config.challenge.difficulties phải là object')
  else {
    const path = 'config.challenge.difficulties'
    checkKnownFields(difficulties, [...DIFFICULTIES], path, 'config', issues)
    for (const difficulty of DIFFICULTIES) {
      checkDifficulty(difficulties[difficulty], `${path}.${difficulty}`, issues)
    }
  }
  const randomizer = asObject(config.randomizer)
  if (!randomizer) {
    issues.push('config.challenge.randomizer phải là object')
    return
  }
  checkKnownFields(randomizer, ['tierSize'], 'config.challenge.randomizer', 'config', issues)
  issues.push(...checkInteger(randomizer.tierSize, 'config.challenge.randomizer.tierSize', 1))
}
