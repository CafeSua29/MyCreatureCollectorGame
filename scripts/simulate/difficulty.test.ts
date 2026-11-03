import { describe, expect, it } from 'vitest'
import { emptyBattleTotals } from './battleRunner'
import { difficultyTable } from './difficulty'
import { newEventTally } from './events'
import { newLifespanTracker } from './lifespan'
import type { ProgressionResult } from './progression'

const run = (overrides: Partial<ProgressionResult>): ProgressionResult => ({
  teamId: 'duo',
  usePills: true,
  growth: true,
  difficulty: 'normal',
  battleMoney: '100',
  snapshots: [],
  lifespan: newLifespanTracker(),
  unlocks: [],
  totalBattles: 10,
  stuckAtFloor: null,
  stuckReason: null,
  finalMargin: 0,
  finalMarginLimit: null,
  battleTotals: emptyBattleTotals(),
  eventTotals: newEventTally(),
  ...overrides
})

describe('difficultyTable', () => {
  it('chỉ đội có lần chơi khác Thường, kèm lần Thường cùng chế độ; tiền mỗi trận', () => {
    const table = difficultyTable([
      run({}),
      run({ growth: false }),
      run({ teamId: 'solo' }),
      run({
        difficulty: 'nightmare',
        battleMoney: '300',
        totalBattles: 20,
        stuckAtFloor: 2,
        stuckReason: 'maxBattles'
      })
    ])
    expect(table.rows.map((row) => [row[0], row[1], row[3], row[10], row[11]])).toEqual([
      ['duo', 'normal', '', '100', '10'],
      ['duo', 'nightmare', '2', '300', '15']
    ])
    expect(table.rows[1].at(-1)).toContain('kẹt')
    expect(table.rows[0]).toHaveLength(table.headers.length)
  })

  it('không có lần chơi khác Thường: bảng rỗng', () => {
    expect(difficultyTable([run({})]).rows).toEqual([])
  })
})
