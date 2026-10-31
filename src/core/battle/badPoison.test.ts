// Độc nặng (mục "Trạng thái bất thường" ở battle-statuses.md): sát thương tăng dần theo số lượt đã dính,
// nhóm loại trừ với độc thường (đang có một thì không dính cái kia), kiểm tra save và dữ liệu.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { conflictingStatus, validateStatuses } from '../monster'
import {
  dataIssues,
  defined,
  makeBattleState,
  makeMonster,
  makeSideFieldData,
  makeSideFieldRawData
} from '../testing'
import type { BattleCommand, BattleEvent, GameState, Monster } from '../model'

const data = makeSideFieldData()

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const skillCommand = (skillId: string): BattleCommand => ({
  slot: 0,
  kind: 'skill',
  skillId,
  target: 0
})

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

/** Quái ta hệ ma; địch hệ thường (không miễn độc), HP 50, chỉ đứng im. */
const user = makeMonster({
  id: 'a',
  elementIds: ['ghost'],
  skillIds: ['idle', 'toxicMove', 'poisonMove']
})
const foe = (statuses: Monster['statuses'] = []): Monster =>
  makeMonster({ id: 'e1', elementIds: ['normal'], skillIds: ['idle'], statuses })

describe('độc nặng: sát thương tăng dần', () => {
  it('cuối lượt thứ n mất 6,25% × n max HP (làm tròn lên), hết sau 4 lượt', () => {
    let state = turn(makeBattleState([user], [foe()]), skillCommand('toxicMove'))
    for (let i = 0; i < 3; i++) state = turn(state, skillCommand('idle'))
    const amounts = eventsOf(state, 'statusDamage').map((e) => e.amount.toNumber())
    // 3,125 → 4; 6,25 → 7; 9,375 → 10; 12,5 → 13.
    expect(amounts).toEqual([4, 7, 10, 13])
    expect(eventsOf(state, 'statusEnded')).toEqual([
      { type: 'statusEnded', monsterId: 'e1', statusId: 'badPoison' }
    ])
  })
})

describe('nhóm loại trừ độc / độc nặng', () => {
  it('đang độc thì không dính độc nặng và ngược lại; dính lại đúng trạng thái đang có thì làm mới', () => {
    const poisoned = turn(
      makeBattleState([user], [foe([{ statusId: 'poison', turnsLeft: 2 }])]),
      skillCommand('toxicMove')
    )
    expect(eventsOf(poisoned, 'statusBlockedByStatus')).toEqual([
      {
        type: 'statusBlockedByStatus',
        monsterId: 'e1',
        statusId: 'badPoison',
        blockingStatusId: 'poison'
      }
    ])
    const badly = turn(
      makeBattleState([user], [foe([{ statusId: 'badPoison', turnsLeft: 2 }])]),
      skillCommand('poisonMove')
    )
    expect(eventsOf(badly, 'statusBlockedByStatus')[0]?.blockingStatusId).toBe('badPoison')
    const again = turn(
      makeBattleState([user], [foe([{ statusId: 'badPoison', turnsLeft: 2 }])]),
      skillCommand('toxicMove')
    )
    expect(eventsOf(again, 'statusApplied')).toHaveLength(1)
  })

  it('conflictingStatus: chỉ trạng thái khác cùng nhóm; trạng thái không nhóm thì không chặn', () => {
    const monster = foe([{ statusId: 'poison', turnsLeft: 2 }])
    expect(conflictingStatus(data, monster, 'badPoison')).toBe('poison')
    expect(conflictingStatus(data, monster, 'poison')).toBeNull()
    expect(conflictingStatus(data, monster, 'burn')).toBeNull()
  })

  it('save có hai trạng thái cùng nhóm thì báo lỗi', () => {
    const issues = validateStatuses(
      data,
      [
        { statusId: 'poison', turnsLeft: 1 },
        { statusId: 'badPoison', turnsLeft: 1 }
      ],
      'statuses'
    )
    expect(issues.join('\n')).toMatch(/"badPoison" và "poison" cùng nhóm loại trừ "poison"/)
  })
})

describe('kiểm tra dữ liệu trạng thái', () => {
  it('hook tăng dần cần thời hạn cố định; exclusiveGroup là chuỗi không rỗng; escalating chỉ true', () => {
    const raw = makeSideFieldRawData()
    const bad = defined(
      raw.statuses.find((s) => s.id === 'badPoison'),
      'badPoison'
    )
    bad.duration = { min: 2, max: 4 }
    bad.exclusiveGroup = ''
    raw.statuses.push({
      id: 'odd',
      kind: 'debuff',
      duration: { min: 1, max: 1 },
      hooks: [{ type: 'turnEndDamage', params: { percent: 5, escalating: 'yes' } }]
    })
    raw.config.ai.statusWeights.odd = 0.1
    const issues = dataIssues(raw).join('\n')
    expect(issues).toMatch(/"badPoison": hook tăng dần cần duration cố định/)
    expect(issues).toMatch(/"badPoison": exclusiveGroup phải là chuỗi không rỗng/)
    expect(issues).toMatch(/escalating chỉ được là true/)
  })

  it('dữ liệu mẫu hợp lệ', () => {
    expect(dataIssues(makeSideFieldRawData())).toEqual([])
  })
})
