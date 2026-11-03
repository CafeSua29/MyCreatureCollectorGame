// Kiểm tra phần thời gian và tùy chọn của state khi load (mục "Tuổi và thọ nguyên" ở lifespan.md):
// đồng hồ, tùy chọn luật chơi, cờ aging của mọi quái khớp với tùy chọn thọ nguyên. Sự kiện khi thời
// gian trôi nằm trong log ngoài trận (validateGameLog.ts).

import { asObject, checkInteger } from '../shared'
import { CHALLENGE_OPTION_KEYS, GAME_OPTION_FLAGS } from '../model'

function checkOptions(value: unknown, issues: string[]): boolean | undefined {
  const options = asObject(value)
  if (!options) {
    issues.push('options phải là object')
    return undefined
  }
  // Khóa độ khó / chế độ thử thách kiểm tra ở validateChallengeState.
  const known: readonly string[] = [...GAME_OPTION_FLAGS, ...CHALLENGE_OPTION_KEYS]
  for (const key of Object.keys(options)) {
    if (!known.includes(key)) issues.push(`options: tùy chọn lạ "${key}"`)
  }
  for (const flag of GAME_OPTION_FLAGS) {
    if (typeof options[flag] !== 'boolean') issues.push(`options.${flag} phải là boolean`)
  }
  return typeof options.lifespanEnabled === 'boolean' ? options.lifespanEnabled : undefined
}

/** Mọi quái trong state (đội, kho, trứng, trận) kèm đường dẫn, để kiểm tra cờ aging. */
function monstersWithPaths(state: Record<string, unknown>): [unknown, string][] {
  const listOf = (value: unknown, path: string): [unknown, string][] =>
    Array.isArray(value) ? value.map((monster, i) => [monster, `${path}[${i}]`]) : []
  const battle = asObject(state.battle)
  const eggs = Array.isArray(state.eggs) ? state.eggs : []
  return [
    ...listOf(state.party, 'party'),
    ...listOf(state.storage, 'storage'),
    ...eggs.map((egg, i): [unknown, string] => [asObject(egg)?.monster, `eggs[${i}].monster`]),
    ...listOf(battle?.enemies, 'battle.enemies'),
    ...listOf(battle?.captured, 'battle.captured')
  ]
}

/** Kiểm tra time, options và cờ aging của mọi quái. */
export function validateTimeState(state: Record<string, unknown>): string[] {
  const issues = [...checkInteger(state.time, 'time', 0)]
  const lifespanEnabled = checkOptions(state.options, issues)
  if (lifespanEnabled === undefined) return issues
  for (const [monster, path] of monstersWithPaths(state)) {
    const aging = asObject(monster)?.aging
    // Kiểu sai đã được validateMonster báo.
    if (typeof aging === 'boolean' && aging !== lifespanEnabled) {
      issues.push(`${path}.aging phải bằng options.lifespanEnabled (${lifespanEnabled})`)
    }
  }
  return issues
}
