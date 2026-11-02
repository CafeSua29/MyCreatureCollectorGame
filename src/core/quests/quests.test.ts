// Bảng nhiệm vụ (docs/rules/quests.md): bảng đủ 5, nhận tối đa 3, hủy, tiến độ chỉ sau khi nhận,
// từng loại nhiệm vụ, nhận thưởng ở thị trấn, thưởng theo tầng, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import { getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { ActiveQuest, GameData, GameState, QuestEvent, RawGameData } from '../model'
import { QUEST_TYPES, recordQuestEvent, refillQuestBoard } from './quests'

function makeQuestData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.quests.push(
    {
      id: 'hunt',
      type: 'defeat',
      params: { floorOffset: 1 },
      countMin: 2,
      countMax: 2,
      weight: 1,
      reward: { moneyPerFloor: 100, items: [{ itemId: 'potion', count: 2 }] }
    },
    {
      id: 'catchFire',
      type: 'catchElement',
      params: {},
      countMin: 1,
      countMax: 3,
      weight: 1,
      reward: { moneyPerFloor: 50, items: [] }
    }
  )
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeQuestData()

const town = (highestFloor = 1): GameState =>
  refillQuestBoard(
    data,
    makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })], highestFloor })
  )
const accept = (state: GameState, index = 0): GameState =>
  gameReducer(data, state, { type: 'acceptQuest', questId: defined(state.quests.board[index]).id })

/** Nhiệm vụ đang nhận đã xong (tiến độ = target). */
const finished = (state: GameState): GameState => ({
  ...state,
  quests: {
    ...state.quests,
    active: state.quests.active.map((q): ActiveQuest => ({ ...q, progress: q.target }))
  }
})

describe('bảng', () => {
  it('đủ 5 nhiệm vụ id tăng dần; thưởng tiền × tầng cao nhất lúc ra nhiệm vụ', () => {
    const state = town(4)
    expect(state.quests.board.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5'])
    expect(state.quests.nextQuestId).toBe(6)
    const hunt = state.quests.board.find((q) => q.templateId === 'hunt')
    if (hunt) {
      expect(hunt.reward.money.toString()).toBe('400')
      expect(hunt.objective).toEqual({ type: 'defeat', minFloor: 3 })
    }
    expect(validateGameState(data, state)).toEqual([])
  })

  it('không có mẫu nào thì bảng rỗng; game mới có sẵn bảng', () => {
    const empty = makeQuestData((raw) => (raw.quests = []))
    expect(refillQuestBoard(empty, makeGameState({ seed: 1 })).quests.board).toEqual([])
  })

  it('vào thị trấn bổ sung bảng', () => {
    const onFloor = atFloor(makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] }), 1)
    const back = gameReducer(data, onFloor, { type: 'travel', to: { type: 'town' } })
    expect(back.quests.board).toHaveLength(5)
  })
})

describe('nhận / hủy / nhận thưởng', () => {
  it('nhận: rời bảng vào danh sách đang nhận (tiến độ 0), bảng bổ sung lại đủ 5', () => {
    const state = town()
    const next = accept(state)
    expect(next.quests.active).toEqual([{ ...defined(state.quests.board[0]), progress: 0 }])
    expect(next.quests.board).toHaveLength(5)
    expect(next.quests.board.some((q) => q.id === 'q6')).toBe(true)
  })

  it('nhận tối đa 3; nhận ngoài thị trấn / id lạ báo lỗi', () => {
    const three = accept(accept(accept(town())))
    expectActionError(() => accept(three), 'tooManyQuests', { maxActive: 3 })
    expectActionError(() => accept(atFloor(town(), 1)), 'notInTown')
    expectActionError(
      () => gameReducer(data, town(), { type: 'acceptQuest', questId: 'q99' }),
      'questNotFound'
    )
  })

  it('hủy: không mất gì, ở đâu cũng được', () => {
    const state = atFloor(accept(town()), 1)
    const questId = defined(state.quests.active[0]).id
    const next = gameReducer(data, state, { type: 'abandonQuest', questId })
    expect(next.quests.active).toEqual([])
    expect(next.money.toString()).toBe(state.money.toString())
  })

  it('nhận thưởng khi xong, ở thị trấn: tiền + vật phẩm; chưa xong / ngoài thị trấn báo lỗi', () => {
    const state = accept(town(2))
    const quest = defined(state.quests.active[0])
    const claim = (s: GameState): GameState =>
      gameReducer(data, s, { type: 'claimQuest', questId: quest.id })
    expectActionError(() => claim(state), 'questNotComplete', {
      questId: quest.id,
      progress: 0,
      target: quest.target
    })
    expectActionError(() => claim(atFloor(finished(state), 1)), 'notInTown')
    const claimed = claim(finished(state))
    expect(claimed.money.minus(state.money).toString()).toBe(quest.reward.money.toString())
    for (const item of quest.reward.items) {
      expect(getItemCount(claimed.inventory, item.itemId)).toBe(item.count)
    }
    expect(claimed.quests.active).toEqual([])
    // Bộ đếm nhiệm vụ hoàn thành (điểm thiên phú ngự thú sư, docs/rules/tamer-talents.md); lỗi thì
    // không đếm.
    expect(claimed.stats.questsCompleted).toBe(state.stats.questsCompleted + 1)
  })
})

describe('tiến độ', () => {
  const activeWith = (objective: ActiveQuest['objective'], target = 2): GameState['quests'] => ({
    board: [],
    active: [
      {
        id: 'q1',
        templateId: 'hunt',
        objective,
        target,
        progress: 0,
        reward: { money: toBig(1), items: [] }
      }
    ],
    sect: [],
    nextQuestId: 2
  })
  const after = (objective: ActiveQuest['objective'], events: QuestEvent[]): number =>
    defined(
      events.reduce((quests, event) => recordQuestEvent(data, quests, event), activeWith(objective))
        .active[0]
    ).progress

  it('từng loại: khớp đúng sự kiện, không vượt target', () => {
    expect(after({ type: 'defeat', minFloor: 3 }, [{ type: 'defeated', floor: 2 }])).toBe(0)
    expect(
      after({ type: 'defeat', minFloor: 3 }, [
        { type: 'defeated', floor: 3 },
        { type: 'defeated', floor: 9 },
        { type: 'defeated', floor: 9 }
      ])
    ).toBe(2)
    const caught = (raceId: string, elementIds: string[]): QuestEvent => ({
      type: 'caught',
      raceId,
      elementIds
    })
    expect(after({ type: 'catchElement', elementId: 'fire' }, [caught('neutral', ['grass'])])).toBe(
      0
    )
    expect(
      after({ type: 'catchElement', elementId: 'fire' }, [caught('x', ['grass', 'fire'])])
    ).toBe(1)
    expect(after({ type: 'catchRace', raceId: 'brute' }, [caught('brute', [])])).toBe(1)
    for (const [type, event] of [
      ['defeatFloorBoss', { type: 'floorBossDefeated', floor: 1 }],
      ['hatch', { type: 'hatched' }],
      ['fuse', { type: 'fused' }],
      ['breed', { type: 'bred' }]
    ] as const) {
      expect(after({ type }, [event]), type).toBe(1)
      expect(after({ type }, [{ type: 'defeated', floor: 1 }]), type).toBe(0)
    }
  })

  it('trong trận: hạ quái và bắt quái ghi tiến độ của nhiệm vụ đã nhận', () => {
    const prey = makeMonster({ id: 'e', skillIds: ['idle'] })
    const dying = { ...prey, damageTaken: getMaxHp(data, prey).minus(1) }
    const battle = {
      ...makeBattleState([makeMonster({ id: 'a' })], [dying]),
      quests: activeWith({ type: 'defeat', minFloor: 1 })
    }
    const won = gameReducer(data, battle, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
    })
    expect(defined(won.quests.active[0]).progress).toBe(1)
  })

  it('mọi loại trong registry tung được mục tiêu hợp lệ', () => {
    for (const [type, handler] of Object.entries(QUEST_TYPES)) {
      const params = type === 'defeat' ? { floorOffset: 0 } : {}
      expect(handler.validateParams(params, data), type).toEqual([])
      const [objective] = handler.rollObjective(params, { data, rng: 1, highestFloor: 2 })
      expect(objective.type).toBe(type)
    }
  })
})

describe('dữ liệu và save', () => {
  it('mẫu sai: loại lạ, params sai, count / weight / thưởng sai; config sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.quests.push(
          {
            id: 'bad',
            type: 'nope',
            params: {},
            countMin: 3,
            countMax: 1,
            weight: 0,
            reward: { moneyPerFloor: -1, items: [{ itemId: 'ghost', count: 0 }] }
          },
          {
            id: 'bad2',
            type: 'defeat',
            params: { floorOffset: -1 },
            countMin: 1,
            countMax: 1,
            weight: 1,
            reward: { moneyPerFloor: 1, items: [] }
          }
        )
        raw.config.quests = { boardSize: 0, maxActive: 3 }
      },
      { regenerateText: true }
    )
    const text = issues.join('\n')
    for (const fragment of [
      'chưa có trong registry',
      'countMax',
      'weight',
      'moneyPerFloor',
      'reward.items[0]',
      'floorOffset',
      'config.quests.boardSize'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save: tiến độ vượt target, quá số nhận, id trùng / ≥ nextQuestId', () => {
    const state = accept(town())
    const quest = defined(state.quests.active[0])
    const issues = validateGameState(data, {
      ...state,
      quests: {
        ...state.quests,
        active: [{ ...quest, progress: quest.target + 1 }, quest, quest, quest],
        nextQuestId: 2
      }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('progress không được vượt target'),
        'quests.active: tối đa 3 nhiệm vụ',
        'quests: id nhiệm vụ bị trùng',
        'quests.nextQuestId phải lớn hơn mọi id nhiệm vụ'
      ])
    )
  })

  it('migrate v41 → v42: chưa có nhiệm vụ; state hợp lệ; tiền thưởng đọc lại thành Decimal', () => {
    const raw = serializeState(makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }))
    const { quests: _quests, ...old } = raw as Record<string, unknown>
    const migrated = migrateState({ ...old, version: 41 }, data)
    expect(migrated.quests).toEqual({ board: [], active: [], sect: [], nextQuestId: 1 })
    expect(validateGameState(data, migrated)).toEqual([])
    const withBoard = migrateState(serializeState(town(3)), data)
    expect(defined(withBoard.quests.board[0]).reward.money.toString()).toBe(
      defined(town(3).quests.board[0]).reward.money.toString()
    )
  })
})
