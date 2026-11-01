// Kiểm tra phần thời gian và tùy chọn của state khi load (mục "Tuổi và thọ nguyên" ở lifespan.md):
// đồng hồ, tùy chọn luật chơi, sự kiện của lần trôi thời gian gần nhất, cờ aging của mọi quái khớp
// với tùy chọn thọ nguyên.

import { asObject, checkBig, checkInteger } from '../shared'
import { GAME_OPTION_FLAGS, type DayEvent } from '../model'

/** Trường của từng loại sự kiện (Record theo loại: thêm loại mà thiếu mục thì TypeScript báo). */
const DAY_EVENT_FIELDS: { readonly [T in DayEvent['type']]: readonly string[] } = {
  diedOfOldAge: ['monsterId', 'speciesId', 'nickname'],
  legacyEggHatched: ['monsterId'],
  monsterAutoJoined: ['monsterId'],
  nearingLifespanEnd: ['monsterId', 'yearsLeft'],
  imprintRequest: ['monsterId', 'request'],
  imprintFinished: ['monsterId', 'percent'],
  cropRipe: ['plotIndex', 'seedItemId'],
  expeditionReturned: ['activeId', 'expeditionId', 'successPercent', 'injuredIds', 'eggId'],
  bondBroken: ['monsterId', 'woundUntilDay'],
  beastTideWarning: ['day'],
  beastTideArrived: ['waves'],
  worldBossAppeared: ['speciesId', 'endDay'],
  worldBossLeft: ['speciesId', 'tierId']
}

function checkOptions(value: unknown, issues: string[]): boolean | undefined {
  const options = asObject(value)
  if (!options) {
    issues.push('options phải là object')
    return undefined
  }
  for (const key of Object.keys(options)) {
    if (!GAME_OPTION_FLAGS.some((flag) => flag === key))
      issues.push(`options: tùy chọn lạ "${key}"`)
  }
  for (const flag of GAME_OPTION_FLAGS) {
    if (typeof options[flag] !== 'boolean') issues.push(`options.${flag} phải là boolean`)
  }
  return typeof options.lifespanEnabled === 'boolean' ? options.lifespanEnabled : undefined
}

function checkDayEvents(value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push('dayEvents phải là danh sách')
    return
  }
  value.forEach((entry, i) => {
    const event = asObject(entry)
    const type = String(event?.type)
    const at = `dayEvents[${i}]`
    if (!event || !Object.hasOwn(DAY_EVENT_FIELDS, type)) {
      issues.push(`${at}: loại sự kiện lạ "${type}"`)
      return
    }
    // Ép kiểu vì đã kiểm tra type là một loại sự kiện.
    for (const field of DAY_EVENT_FIELDS[type as DayEvent['type']]) {
      if (!(field in event)) issues.push(`${at}: thiếu ${field}`)
    }
    if (type === 'nearingLifespanEnd') issues.push(...checkBig(event.yearsLeft, `${at}.yearsLeft`))
  })
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

/** Kiểm tra time, options, dayEvents và cờ aging của mọi quái. */
export function validateTimeState(state: Record<string, unknown>): string[] {
  const issues = [...checkInteger(state.time, 'time', 0)]
  const lifespanEnabled = checkOptions(state.options, issues)
  checkDayEvents(state.dayEvents, issues)
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
