// Kiểm tra độ khó và chế độ thử thách trong save (docs/rules/challenge-modes.md): lựa chọn trong
// options, tiến độ Nuzlocke / thua game, độ khó và lượt gặp Nuzlocke của trận đang dở.

import { asObject, checkInteger } from '../shared'
import { DIFFICULTIES, type Difficulty } from '../model'
import { checkKnownFields } from '../gameData'
import { difficultyRank } from '../registries'

const isDifficulty = (value: unknown): value is Difficulty =>
  DIFFICULTIES.some((difficulty) => difficulty === value)

/** Nuzlocke: null hoặc { dupesClause: boolean }. */
function checkNuzlocke(value: unknown, issues: string[]): void {
  if (value === null) return
  const nuzlocke = asObject(value)
  if (!nuzlocke || typeof nuzlocke.dupesClause !== 'boolean') {
    issues.push('options.nuzlocke phải là null hoặc { dupesClause: boolean }')
    return
  }
  checkKnownFields(nuzlocke, ['dupesClause'], 'options.nuzlocke', 'Nuzlocke', issues)
}

/** Randomizer: null hoặc { seed: số nguyên 32-bit không dấu, learnsets: boolean }. */
function checkRandomizer(value: unknown, issues: string[]): void {
  if (value === null) return
  const randomizer = asObject(value)
  if (!randomizer) {
    issues.push('options.randomizer phải là null hoặc { seed, learnsets }')
    return
  }
  checkKnownFields(randomizer, ['seed', 'learnsets'], 'options.randomizer', 'Randomizer', issues)
  if (typeof randomizer.learnsets !== 'boolean') {
    issues.push('options.randomizer.learnsets phải là boolean')
  }
  issues.push(...checkInteger(randomizer.seed, 'options.randomizer.seed', 0))
  if (typeof randomizer.seed === 'number' && randomizer.seed > 0xffffffff) {
    issues.push('options.randomizer.seed phải là số nguyên 32-bit không dấu')
  }
}

/** Lựa chọn trong options (khóa lạ đã báo ở validateTimeState). */
function checkChallengeOptions(options: Record<string, unknown>, issues: string[]): void {
  const { difficulty, lowestDifficulty } = options
  if (!isDifficulty(difficulty))
    issues.push(`options.difficulty phải là ${DIFFICULTIES.join(', ')}`)
  if (!isDifficulty(lowestDifficulty)) {
    issues.push(`options.lowestDifficulty phải là ${DIFFICULTIES.join(', ')}`)
  }
  if (
    isDifficulty(difficulty) &&
    isDifficulty(lowestDifficulty) &&
    difficultyRank(lowestDifficulty) > difficultyRank(difficulty)
  ) {
    issues.push('options.lowestDifficulty không được khó hơn options.difficulty')
  }
  checkNuzlocke(options.nuzlocke, issues)
  if (options.nuzlocke && options.permadeathEnabled !== true) {
    issues.push('options.permadeathEnabled phải bật khi chơi Nuzlocke')
  }
  if (typeof options.hardcore !== 'boolean') issues.push('options.hardcore phải là boolean')
  checkRandomizer(options.randomizer, issues)
}

const AREA = /^(floor:[1-9]\d*|zone:.+)$/

/** Tiến độ: khu Nuzlocke không trùng, đúng dạng; thua game chỉ khi Nuzlocke, đội và kho trống. */
function checkChallengeProgress(
  state: Record<string, unknown>,
  isNuzlocke: boolean,
  issues: string[]
): void {
  const challenge = asObject(state.challenge)
  if (!challenge) {
    issues.push('challenge phải là object')
    return
  }
  checkKnownFields(challenge, ['nuzlockeAreas', 'gameOver'], 'challenge', 'thử thách', issues)
  const areas = challenge.nuzlockeAreas
  if (!Array.isArray(areas) || areas.some((area) => typeof area !== 'string' || !AREA.test(area))) {
    issues.push('challenge.nuzlockeAreas phải là danh sách "floor:<tầng>" / "zone:<id>"')
  } else if (new Set(areas).size !== areas.length) {
    issues.push('challenge.nuzlockeAreas không được trùng')
  }
  if (typeof challenge.gameOver !== 'boolean') {
    issues.push('challenge.gameOver phải là boolean')
    return
  }
  if (!challenge.gameOver) return
  if (!isNuzlocke) issues.push('challenge.gameOver chỉ có khi chơi Nuzlocke')
  const isEmpty = (list: unknown): boolean => Array.isArray(list) && list.length === 0
  if (!isEmpty(state.party) || !isEmpty(state.storage)) {
    issues.push('challenge.gameOver: đội và kho phải trống')
  }
}

/** Trận đang dở: độ khó hợp lệ, lượt gặp Nuzlocke chỉ khi chơi Nuzlocke. */
function checkBattleChallenge(battleValue: unknown, isNuzlocke: boolean, issues: string[]): void {
  const battle = asObject(battleValue)
  if (!battle) return
  if (!isDifficulty(battle.difficulty)) {
    issues.push(`battle.difficulty phải là ${DIFFICULTIES.join(', ')}`)
  }
  if (typeof battle.nuzlockeEncounter !== 'boolean') {
    issues.push('battle.nuzlockeEncounter phải là boolean')
  } else if (battle.nuzlockeEncounter && !isNuzlocke) {
    issues.push('battle.nuzlockeEncounter chỉ có khi chơi Nuzlocke')
  }
}

/** Kiểm tra options (phần thử thách), challenge và trường thử thách của trận. */
export function validateChallengeState(state: Record<string, unknown>): string[] {
  const issues: string[] = []
  const options = asObject(state.options)
  // options không phải object đã báo ở validateTimeState.
  if (!options) return issues
  checkChallengeOptions(options, issues)
  const isNuzlocke = asObject(options.nuzlocke) !== null
  checkChallengeProgress(state, isNuzlocke, issues)
  checkBattleChallenge(state.battle, isNuzlocke, issues)
  return issues
}

/** Đã thua game Nuzlocke (đội trống là hợp lệ). */
export const isGameOverSave = (state: Record<string, unknown>): boolean =>
  asObject(state.challenge)?.gameOver === true
