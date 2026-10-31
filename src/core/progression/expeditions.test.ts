// Phái quái đi thám hiểm (docs/rules/expeditions.md): điều kiện phái đi, ô theo cảnh giới, khóa quái,
// thân mật mỗi ngày, về theo ngày (độ thành công, thưởng, EXP, trọng thương), gọi về, làm mới bảng,
// kỹ năng đồng hành, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import {
  HOURS_PER_DAY,
  STAT_NAMES,
  type GameData,
  type GameState,
  type Monster,
  type RawGameData
} from '../model'
import { toBig } from '../shared'
import { computeStats } from '../monster'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import { expeditionSlots, expeditionSuccess, rollExpeditionBoard } from './expeditions'
import { advanceTime } from './time'

function makeExpeditionData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.items.push({ id: 'ore', category: 'material', price: 1 })
  raw.expeditions.push(
    {
      id: 'mine',
      kind: 'mining',
      durationDays: 2,
      requirements: [{ type: 'teamSize', min: 1, max: 2 }],
      powerPerFloor: 100,
      moneyPerFloor: 100,
      drops: [{ itemId: 'ore', chance: 100, min: 2, max: 2 }],
      eggChance: 0
    },
    {
      id: 'fireTrial',
      kind: 'exploring',
      durationDays: 1,
      requirements: [
        { type: 'element', elementId: 'fire' },
        { type: 'minLevel', level: 5 }
      ],
      powerPerFloor: 100,
      moneyPerFloor: 0,
      drops: [],
      eggChance: 0
    }
  )
  raw.config.expeditions = { ...raw.config.expeditions, injuryChance: 0 }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeExpeditionData()

const worker = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, level: 10, ...overrides })

function townState(storage: Monster[], realm = 0): GameState {
  const base = makeGameState({ seed: 5, party: [makeMonster({ id: 'p' })], tamerRealm: realm })
  return {
    ...base,
    storage,
    inventory: makeInventory({}),
    expeditions: { board: ['mine', 'fireTrial'], refreshDay: 7, active: [], nextId: 1 }
  }
}

const start = (
  state: GameState,
  monsterIds: string[],
  expeditionId = 'mine',
  gameData = data
): GameState => gameReducer(gameData, state, { type: 'startExpedition', expeditionId, monsterIds })
const days = (state: GameState, count: number, gameData = data): GameState =>
  advanceTime(gameData, state, count * HOURS_PER_DAY)
const storageOf = (state: GameState, id: string): Monster =>
  defined(state.storage.find((m) => m.id === id))

describe('phái đi', () => {
  it('quái trong kho nhận việc, đội đi tới ngày về', () => {
    const next = start(townState([worker('a'), worker('b')]), ['a', 'b'])
    expect(next.expeditions.active).toEqual([
      { id: 'x1', expeditionId: 'mine', monsterIds: ['a', 'b'], endDay: 2 }
    ])
    expect(storageOf(next, 'a').assignment).toEqual({ kind: 'expedition', id: 'x1' })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('lỗi: quái trong đội / bận / gục / trọng thương, không có trên bảng, yêu cầu, ô, nơi', () => {
    const state = townState([worker('a'), worker('b', { level: 1 })])
    expectActionError(() => start(state, ['p']), 'monsterNotInStorage', { monsterId: 'p' })
    const busy = start(state, ['a'])
    expectActionError(() => start(busy, ['a']), 'expeditionSlotsFull', { slots: 1 })
    expectActionError(
      () =>
        start(townState([worker('a', { assignment: { kind: 'expedition', id: 'x9' } })]), ['a']),
      'monsterBusy'
    )
    expectActionError(
      () => start(townState([worker('a', { damageTaken: toBig('1e9') })]), ['a']),
      'monsterFainted'
    )
    expectActionError(
      () => start(townState([worker('a', { injuryBattlesLeft: 1 })]), ['a']),
      'injured'
    )
    expectActionError(() => start(state, ['a'], 'nope'), 'expeditionNotOffered')
    expectActionError(() => start(state, ['b'], 'fireTrial'), 'expeditionRequirementUnmet', {
      expeditionId: 'fireTrial',
      requirement: 'element'
    })
    const fire = townState([worker('f', { elementIds: ['fire'], level: 4 })])
    expectActionError(() => start(fire, ['f'], 'fireTrial'), 'expeditionRequirementUnmet', {
      expeditionId: 'fireTrial',
      requirement: 'minLevel'
    })
    expectActionError(
      () => start(townState([worker('a'), worker('b'), worker('c')]), ['a', 'b', 'c']),
      'expeditionRequirementUnmet'
    )
    expectActionError(
      () => start({ ...state, location: { type: 'floor', floor: 1 } }, ['a']),
      'notInTown'
    )
    expectActionError(() => start(state, []), 'malformedAction')
    expectActionError(() => start(state, ['a', 'a']), 'malformedAction')
  })

  it('ô thám hiểm = 1 + ⌊cảnh giới / 2⌋', () => {
    expect(expeditionSlots(townState([], 0))).toBe(1)
    expect(expeditionSlots(townState([], 3))).toBe(2)
    expect(expeditionSlots(townState([], 4))).toBe(3)
  })
})

describe('khóa quái', () => {
  const busy = start(townState([worker('a'), worker('b')]), ['a'])

  it('không vào đội, không thả, không fuse / breed, không dùng kẹo', () => {
    expectActionError(
      () => gameReducer(data, busy, { type: 'moveToParty', monsterId: 'a' }),
      'monsterBusy'
    )
    expectActionError(
      () =>
        gameReducer(data, busy, {
          type: 'swapWithStorage',
          partyMonsterId: 'p',
          storageMonsterId: 'a'
        }),
      'monsterBusy'
    )
    expectActionError(
      () => gameReducer(data, busy, { type: 'releaseMonster', monsterId: 'a' }),
      'monsterBusy'
    )
    expectActionError(
      () =>
        gameReducer(
          data,
          { ...busy, money: toBig(1e6) },
          { type: 'fuse', baseId: 'b', subId: 'a' }
        ),
      'monsterBusy'
    )
    const withCandy = { ...busy, inventory: makeInventory({ rareCandy: 1 }) }
    if (data.items.rareCandy) {
      expectActionError(
        () =>
          gameReducer(data, withCandy, { type: 'useItem', itemId: 'rareCandy', monsterId: 'a' }),
        'monsterBusy'
      )
    }
  })
})

describe('về theo ngày', () => {
  it('thân mật +1 mỗi ngày đang đi; tới ngày về: thưởng × độ thành công, EXP, gỡ việc, sự kiện', () => {
    const state = start(townState([worker('a', { genes: uniformStats(1000) })]), ['a'])
    const day1 = days(state, 1)
    expect(storageOf(day1, 'a').affinity).toBe(1)
    expect(day1.expeditions.active).toHaveLength(1)
    const back = days(day1, 1)
    expect(back.expeditions.active).toEqual([])
    const a = storageOf(back, 'a')
    expect(a.assignment).toBeNull()
    expect(a.exp.gt(worker('a').exp)).toBe(true)
    const event = defined(back.dayEvents.find((e) => e.type === 'expeditionReturned'))
    // Đội rất mạnh: độ thành công kẹp 150%.
    expect(event).toEqual({
      type: 'expeditionReturned',
      activeId: 'x1',
      expeditionId: 'mine',
      successPercent: 150,
      injuredIds: [],
      eggId: null
    })
    expect(getItemCount(back.inventory, 'ore')).toBe(3)
    expect(back.money.minus(state.money).toString()).toBe('150')
    expect(validateGameState(data, back)).toEqual([])
  })

  it('trứng hiếm: eggChance × độ thành công; loài boss (dạng đầu) của map tầng cao nhất, lý lịch', () => {
    const eggData = makeExpeditionData((raw) => {
      raw.expeditions[0].eggChance = 100
    })
    const state = start(
      townState([worker('a', { genes: uniformStats(1000) })]),
      ['a'],
      'mine',
      eggData
    )
    const back = days(state, 2, eggData)
    const event = defined(back.dayEvents.find((e) => e.type === 'expeditionReturned'))
    const egg = defined(back.eggs[0], 'trứng')
    expect(event).toMatchObject({ eggId: egg.id })
    expect(egg.id).toBe(`m${state.nextMonsterId}`)
    expect(back.nextMonsterId).toBe(state.nextMonsterId + 1)
    // Tầng 1 = map field, boss strongling → dạng đầu weakling.
    expect(egg.monster.speciesId).toBe('weakling')
    expect(egg.monster.level).toBe(1)
    expect(egg.monster.history?.origin).toEqual({ kind: 'expeditionEgg', expeditionId: 'mine' })
    expect(egg.monster.traits.some((t) => t.id === eggData.config.boss.traitId)).toBe(false)
    expect(validateGameState(eggData, back)).toEqual([])
  })

  it('độ thành công: tổng chỉ số ÷ sức chuẩn theo tầng, kẹp 0,5–1,5; kỹ năng đồng hành nhân trước khi kẹp', () => {
    const team = [makeMonster({ id: 'w' })]
    const { final } = computeStats(data, defined(team[0]))
    const power = STAT_NAMES.reduce((sum, stat) => sum + final[stat].toNumber(), 0)
    const def = { ...data.expeditions.mine, powerPerFloor: power }
    const state = townState([])
    expect(expeditionSuccess(data, state, { def, team })).toBe(1)
    expect(
      expeditionSuccess(data, state, { def: { ...def, powerPerFloor: power * 4 }, team })
    ).toBe(0.5)
    expect(
      expeditionSuccess(data, state, { def: { ...def, powerPerFloor: power / 4 }, team })
    ).toBe(1.5)
    const partnerData = makeExpeditionData((raw) => {
      raw.partnerSkills.push({
        id: 'scout',
        effects: [{ type: 'expeditionPowerPercent', params: { percent: 20 } }]
      })
      raw.races[0].partnerSkillId = 'scout'
    })
    expect(expeditionSuccess(partnerData, state, { def, team })).toBeCloseTo(1.2)
  })

  it('rủi ro trọng thương (100%), không chết', () => {
    const risky = makeExpeditionData(
      (raw) => (raw.config.expeditions = { ...raw.config.expeditions, injuryChance: 100 })
    )
    const back = days(start(townState([worker('a')]), ['a'], 'mine', risky), 2, risky)
    expect(storageOf(back, 'a').injuryBattlesLeft).toBe(risky.config.awakening.injuryBattles)
  })

  it('gọi về sớm: không thưởng, gỡ việc; id lạ báo lỗi', () => {
    const state = start(townState([worker('a')]), ['a'])
    const recalled = gameReducer(data, state, {
      type: 'recallExpedition',
      expeditionActiveId: 'x1'
    })
    expect(recalled.expeditions.active).toEqual([])
    expect(storageOf(recalled, 'a').assignment).toBeNull()
    expect(recalled.inventory).toEqual(state.inventory)
    expectActionError(
      () => gameReducer(data, state, { type: 'recallExpedition', expeditionActiveId: 'x5' }),
      'expeditionNotFound'
    )
    const inBattle = {
      ...makeBattleState([makeMonster({ id: 'p' })], [makeMonster({ id: 'e' })]),
      expeditions: state.expeditions
    }
    expectActionError(
      () => gameReducer(data, inBattle, { type: 'recallExpedition', expeditionActiveId: 'x1' }),
      'inBattle'
    )
  })

  it('làm mới bảng đúng ngày, 3–5 mẫu không lặp (tối đa số mẫu có)', () => {
    const state = townState([])
    const refreshed = days(state, 7)
    expect(refreshed.expeditions.refreshDay).toBe(14)
    const [board] = rollExpeditionBoard(data, 1)
    expect(new Set(board).size).toBe(board.length)
    expect(board.length).toBe(2)
  })
})

describe('dữ liệu và save', () => {
  it('mẫu sai, yêu cầu lạ, đồ sai, config sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.expeditions.push({
          id: 'bad',
          kind: 'fishing' as 'mining',
          durationDays: 0,
          requirements: [{ type: 'nope' }, { type: 'teamSize', min: 3, max: 1 }],
          powerPerFloor: -1,
          moneyPerFloor: 1,
          drops: [{ itemId: 'ghost', chance: 101, min: 2, max: 1 }],
          eggChance: 150
        })
        raw.config.expeditions = { ...raw.config.expeditions, boardMin: 6, boardMax: 3 }
      },
      { regenerateText: true }
    )
    const text = issues.join('\n')
    for (const fragment of [
      'kind',
      'durationDays',
      'chưa có trong registry',
      'max phải ≥ min',
      'powerPerFloor',
      'drops[0]',
      'eggChance',
      'boardMax'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save: việc của quái không có đội, quái trong đội có việc, đội trỏ quái sai việc', () => {
    const state = start(townState([worker('a'), worker('b')]), ['a'])
    const issues = validateGameState(data, {
      ...state,
      storage: state.storage.map((m) =>
        m.id === 'b' ? { ...m, assignment: { kind: 'expedition' as const, id: 'x7' } } : m
      ),
      party: state.party.map((m) => ({
        ...m,
        assignment: { kind: 'expedition' as const, id: 'x1' }
      }))
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'quái "b" mang việc "x7" không có đội nào',
        'quái "p" trong đội không được có việc'
      ])
    )
    const dwelling = validateGameState(data, {
      ...state,
      storage: state.storage.map((m) =>
        m.id === 'b' ? { ...m, assignment: { kind: 'dwelling' as const, id: 'd1' } } : m
      )
    })
    expect(dwelling.join('\n')).toContain('chưa hỗ trợ')
  })

  it('migrate v42 → v43: mọi quái rảnh, chưa có đội; state hợp lệ', () => {
    const raw = serializeState(townState([worker('a')])) as Record<string, unknown>
    const strip = (m: unknown): unknown => {
      const { assignment: _assignment, ...rest } = m as Record<string, unknown>
      return rest
    }
    const { expeditions: _expeditions, ...old } = raw
    const migrated = migrateState(
      {
        ...old,
        version: 42,
        party: (raw.party as unknown[]).map(strip),
        storage: (raw.storage as unknown[]).map(strip)
      },
      data
    )
    expect(storageOf(migrated, 'a').assignment).toBeNull()
    expect(migrated.expeditions).toEqual({ board: [], refreshDay: 0, active: [], nextId: 1 })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
