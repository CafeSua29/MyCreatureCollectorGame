// Dấu ấn ngoài trận (docs/rules/marks.md): Thầy thuốc, luân hồi, cấy ghép hỏng, linh dịch khỏi bệnh,
// Dị Biến Dịch / Sinh Cơ Đan, event "ăn / uống thứ lạ", breeding, thành tựu, migrate v112 → v113.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { achievementProgress } from '../registries'
import { getMonsterView } from '../roster'
import { asObject, createRng, toBig } from '../shared'
import type { GameData, GameState, MarkInstance, Monster } from '../model'
import {
  defined,
  expectActionError,
  makeEventData,
  makeGameState,
  makeMarkData,
  makeMonster,
  withPendingEvent,
  FIXTURE_MARKS,
  type MonsterOverrides
} from '../testing'
import { advanceTime } from './time'
import { makeOffspring } from './breeding'
import { treatMarkCost } from './marks'

const data = makeMarkData()
const origin = { source: 'faint', floor: 2 } as const
const mark = (markId: string, extra: Partial<MarkInstance> = {}): MarkInstance => ({
  markId,
  level: 1,
  origin,
  ...extra
})
const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 10, ...overrides })
const town = (party: Monster[], money = 1e6): GameState => ({
  ...makeGameState({ seed: 1, party }),
  money: toBig(money)
})
const heroOf = (state: GameState): Monster =>
  defined([...state.party, ...state.storage].find((m) => m.id === 'a'))

describe('Thầy thuốc', () => {
  it('bỏ sẹo / đột biến / ám ảnh, giá theo cấp, log và lý lịch', () => {
    const state = town([hero({ marks: [mark('blindEye', { level: 3 })] })])
    const after = gameReducer(data, state, {
      type: 'treatMark',
      monsterId: 'a',
      markId: 'blindEye'
    })
    expect(heroOf(after).marks).toEqual([])
    expect(state.money.minus(after.money).eq(treatMarkCost(data, 3, state.highestFloor))).toBe(true)
    // Giá theo tầng cao nhất; số cực lớn vẫn hữu hạn.
    expect(treatMarkCost(data, 3, 1).eq(1500)).toBe(true)
    expect(treatMarkCost(data, 3, 10).eq(15000)).toBe(true)
    expect(treatMarkCost(data, 1e9, 1e9).isFinite()).toBe(true)
    expect(after.log).toContainEqual({
      type: 'markRemoved',
      monsterId: 'a',
      markId: 'blindEye',
      reason: 'treated'
    })
    expect(heroOf(after).history?.milestones.at(-1)).toMatchObject({
      kind: 'markRemoved',
      reason: 'treated'
    })
    // Bỏ ám ảnh bằng tiền: không nhận chiến tích vượt qua.
    const feared = town([hero({ marks: [mark('fearSpecies', { targetId: 'weakling' })] })])
    const calm = gameReducer(data, feared, {
      type: 'treatMark',
      monsterId: 'a',
      markId: 'fearSpecies',
      targetId: 'weakling'
    })
    expect(heroOf(calm).marks).toEqual([])
    expect(validateGameState(data, calm)).toEqual([])
  })

  it('lỗi: không có dấu, loại không bỏ được, thiếu tiền, ngoài thị trấn; state giữ nguyên', () => {
    const state = town([hero({ marks: [mark('bossSlayer'), mark('limp', { level: 2 })] })], 999)
    const act =
      (markId: string, s: GameState = state) =>
      () =>
        gameReducer(data, s, { type: 'treatMark', monsterId: 'a', markId })
    expectActionError(act('blindEye'), 'markNotFound')
    expectActionError(act('bossSlayer'), 'markNotTreatable')
    expectActionError(act('limp'), 'notEnoughMoney')
    const away: GameState = { ...state, location: { type: 'floor', floor: 1 } }
    expectActionError(act('limp', away), 'notInTown')
    expectActionError(
      () => gameReducer(data, state, { type: 'treatMark', monsterId: 'ghost', markId: 'limp' }),
      'monsterNotOwned'
    )
  })
})

describe('luân hồi', () => {
  it('xóa sẹo và ám ảnh, giữ phần còn lại, log ngoài trận', () => {
    const marks = [
      mark('blindEye'),
      mark('springLegs'),
      mark('fearSpecies', { targetId: 'weakling' })
    ]
    const base = town([hero({ level: 100, marks })])
    const state: GameState = {
      ...base,
      inventory: { ...base.inventory, stacks: { ...base.inventory.stacks, rebirthPill: 1 } }
    }
    const after = gameReducer(data, state, { type: 'rebirthMonster', monsterId: 'a' })
    expect(heroOf(after).marks.map((m) => m.markId)).toEqual(['springLegs'])
    expect(after.log.filter((entry) => entry.type === 'markRemoved')).toHaveLength(2)
    expect(validateGameState(data, after)).toEqual([])
  })
})

describe('cấy ghép hỏng', () => {
  it('còn sống thì tung sẹo ở bộ phận implantScarPartId', () => {
    const scarring = makeMarkData({ scarOnImplantFailPercent: 100 })
    const doomed: GameData = {
      ...scarring,
      config: { ...scarring.config, implant: { ...scarring.config.implant, baseChance: 0 } }
    }
    const serum = {
      tierId: 'mutagen',
      effects: [{ kind: 'hookEffect' as const, effectId: 'hardening', levels: 1 }]
    }
    const state: GameState = {
      ...town([hero(), makeMonster({ id: 'b' })]),
      lab: { stock: [serum], restockDay: 10 }
    }
    const after = gameReducer(doomed, state, { type: 'implant', monsterId: 'a', serumIndex: 0 })
    expect(heroOf(after).marks.map((m) => m.markId)).toEqual(['chestWound'])
    expect(heroOf(after).marks[0].origin).toEqual({ source: 'implant', floor: null })
  })
})

describe('linh dịch khỏi bệnh', () => {
  it('ngày quái chuyển sang miễn dịch thì tung đột biến', () => {
    const curing = makeMarkData({ mutationOnVirusCurePercent: 100 })
    const state = town([hero({ spiritVirus: { state: 'infected', daysLeft: 1 } })])
    const after = advanceTime(curing, state, 24)
    expect(heroOf(after).spiritVirus).toEqual({ state: 'immune' })
    expect(heroOf(after).marks).toHaveLength(1)
    expect(heroOf(after).marks[0].origin.source).toBe('virus')
    // Đã miễn dịch: không tung nữa.
    expect(heroOf(advanceTime(curing, after, 24)).marks).toHaveLength(1)
  })
})

describe('vật phẩm', () => {
  const withItems = (party: Monster[]): GameState => {
    const state = town(party)
    return {
      ...state,
      inventory: {
        ...state.inventory,
        stacks: { ...state.inventory.stacks, mutagenElixir: 2, regenerationPill: 2 }
      }
    }
  }
  const itemData = makeMarkData({}, (raw) => {
    raw.items.push(
      {
        id: 'mutagenElixir',
        category: 'consumable',
        price: 4000,
        use: 'field',
        target: 'ally',
        effects: [{ type: 'mutate', params: {} }]
      },
      {
        id: 'regenerationPill',
        category: 'consumable',
        price: 2500,
        use: 'field',
        target: 'ally',
        effects: [{ type: 'cureScar', params: {} }]
      }
    )
  })

  it('Dị Biến Dịch: một đột biến ngẫu nhiên; Sinh Cơ Đan: chữa sẹo cấp cao nhất', () => {
    const state = withItems([hero({ marks: [mark('limp'), mark('blindEye', { level: 2 })] })])
    const mutated = gameReducer(itemData, state, {
      type: 'useItem',
      itemId: 'mutagenElixir',
      monsterId: 'a'
    })
    const kinds = heroOf(mutated).marks.map((m) => itemData.marks[m.markId].kind)
    expect(kinds.filter((kind) => kind === 'mutation')).toHaveLength(1)
    expect(mutated.log.some((entry) => entry.type === 'markGained')).toBe(true)
    const cured = gameReducer(itemData, mutated, {
      type: 'useItem',
      itemId: 'regenerationPill',
      monsterId: 'a'
    })
    expect(heroOf(cured).marks.map((m) => m.markId)).not.toContain('blindEye')
    expect(heroOf(cured).marks.map((m) => m.markId)).toContain('limp')
    expect(validateGameState(itemData, cured)).toEqual([])
  })

  it('không sẹo thì Sinh Cơ Đan không có tác dụng, không mất đan', () => {
    const state = withItems([hero()])
    expectActionError(
      () =>
        gameReducer(itemData, state, {
          type: 'useItem',
          itemId: 'regenerationPill',
          monsterId: 'a'
        }),
      'itemNoEffect'
    )
  })
})

describe('event ăn / uống thứ lạ', () => {
  it('mutateParty: quái đầu đội tung đột biến, log event', () => {
    const eventData = makeEventData((raw) => {
      raw.marks = FIXTURE_MARKS.map((def) => structuredClone(def))
      raw.events.push({
        id: 'strangeFruit',
        group: 'explore',
        weight: 1,
        minFloor: 1,
        options: [
          {
            id: 'eat',
            outcomes: [
              { weight: 1, results: [{ type: 'mutateParty', params: { count: 1, chance: 100 } }] }
            ]
          }
        ]
      })
    })
    const state = withPendingEvent(town([hero(), makeMonster({ id: 'b' })]), 'strangeFruit', {
      floor: 1
    })
    const after = gameReducer(eventData, state, { type: 'chooseEventOption', optionId: 'eat' })
    expect(heroOf(after).marks).toHaveLength(1)
    expect(heroOf(after).marks[0].origin).toEqual({ source: 'event', floor: 1 })
    expect(defined(after.party.find((m) => m.id === 'b')).marks).toEqual([])
    expect(after.log.some((entry) => entry.type === 'markGained')).toBe(true)
  })
})

describe('breeding', () => {
  it('con nhận đột biến di truyền (springLegs 100%), không nhận sẹo', () => {
    const mother = makeMonster({
      id: 'm',
      gender: 'female',
      marks: [mark('springLegs', { level: 2 }), mark('blindEye')]
    })
    const father = makeMonster({ id: 'f', gender: 'male' })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'kid')
    expect(child.marks).toEqual([
      { markId: 'springLegs', level: 2, origin: { source: 'inherited', floor: null } }
    ])
  })
})

describe('thành tựu', () => {
  it('số loại dấu, số lần vượt nỗi sợ, cấp đột biến cao nhất', () => {
    const state = town([
      hero({
        marks: [
          mark('springLegs', { level: 4 }),
          mark('conquerSpecies', { targetId: 'weakling' }),
          mark('limp')
        ]
      })
    ])
    const progress = (condition: Record<string, unknown>): number =>
      achievementProgress(data, state, {
        id: 'x',
        // Ép kiểu: điều kiện thử trực tiếp.
        condition: condition as never,
        tiers: [{ value: 1, rewards: {} }]
      })
    expect(progress({ type: 'markIds' })).toBe(3)
    expect(progress({ type: 'markIds', kind: 'scar' })).toBe(1)
    expect(progress({ type: 'resolvedFears' })).toBe(1)
    expect(progress({ type: 'markLevel', kind: 'mutation' })).toBe(4)
  })
})

describe('migrate v112 → v113', () => {
  it('mọi quái chưa có dấu, bộ đếm rỗng', () => {
    const current = asObject(
      serializeState(makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }))
    )
    const party = (Array.isArray(current?.party) ? current.party : []).map((monster: unknown) => {
      const { marks: _marks, markCounters: _counters, ...rest } = asObject(monster) ?? {}
      return rest
    })
    const migrated = migrateState({ ...current, version: 112, party }, data)
    expect(migrated.party[0].marks).toEqual([])
    expect(migrated.party[0].markCounters).toEqual({})
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('MonsterView', () => {
  it('liệt kê dấu kèm loại, bộ phận, tác dụng, tiến độ, giá chữa', () => {
    const state = town([
      hero({
        marks: [
          mark('blindEye', { winBattles: 4 }),
          mark('batWings'),
          mark('fearSpecies', { targetId: 'weakling', resolveCount: 1 }),
          mark('bossSlayer', { level: 2 })
        ]
      })
    ])
    const view = defined(getMonsterView(data, state, 'a'))
    expect(view.marks.map((each) => [each.markId, each.kind, each.partId, each.active])).toEqual([
      ['blindEye', 'scar', 'head', true],
      ['batWings', 'mutation', 'wings', false],
      ['fearSpecies', 'trauma', undefined, true],
      ['bossSlayer', 'trophy', undefined, true]
    ])
    expect(view.marks[0].harden).toEqual({ battles: 4, need: 100 })
    expect(view.marks[2].resolve).toEqual({ count: 1, need: 3 })
    expect(view.marks[3].treatCost).toBeNull()
    expect(view.marks[0].treatCost?.eq(500)).toBe(true)
  })
})
