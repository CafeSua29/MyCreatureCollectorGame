// Bệnh và chấn thương (docs/rules/dwelling.md mục "Bệnh và chấn thương"): mắc khi tinh thần thấp /
// đói lả (tỉ lệ theo tinh thần), giảm sức, nghỉ đủ ngày thì khỏi, chữa bằng thuốc bậc đủ, kiểm tra
// dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { workConditionPercent } from '../registries'
import { computeStats } from '../monster'
import {
  HOURS_PER_DAY,
  type GameData,
  type GameState,
  type Monster,
  type RawGameData
} from '../model'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import { newDwellingState } from './dwelling'
import { advanceTime } from './time'

function makeAilmentData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.ailments.push(
    { id: 'sprain', weight: 1, causes: ['work'], workPercent: 70, cureTier: 1 },
    { id: 'fracture', weight: 0, causes: ['work'], workPercent: 30, cureTier: 2 }
  )
  raw.buildings.push({
    id: 'forge',
    workType: 'kindling',
    startLevel: 0,
    slotsPerLevel: 2,
    cost: { money: 100, moneyGrowth: 2, items: [] },
    effect: { type: 'produce', drops: [{ itemId: 'potion', perDay: 0 }] }
  })
  raw.items.push(
    {
      id: 'medLow',
      category: 'consumable',
      price: 1,
      use: 'field',
      target: 'ally',
      effects: [{ type: 'cureAilment', params: { tier: 1 } }]
    },
    {
      id: 'medHigh',
      category: 'consumable',
      price: 1,
      use: 'field',
      target: 'ally',
      effects: [{ type: 'cureAilment', params: { tier: 2 } }]
    }
  )
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeAilmentData()

const worker = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, level: 16, elementIds: ['fire'], ...overrides })

function working(monster: Monster, gameData = data): GameState {
  const base: GameState = {
    ...makeGameState({ seed: 3, party: [makeMonster({ id: 'p' })] }),
    storage: [monster],
    money: toBig(100000),
    inventory: makeInventory({ medLow: 1, medHigh: 1 }),
    dwelling: newDwellingState(gameData)
  }
  const built = gameReducer(gameData, base, { type: 'upgradeBuilding', buildingId: 'forge' })
  return gameReducer(gameData, built, {
    type: 'assignWorker',
    buildingId: 'forge',
    monsterId: monster.id
  })
}

const days = (state: GameState, count: number, gameData = data): GameState =>
  advanceTime(gameData, state, count * HOURS_PER_DAY)
const storageOf = (state: GameState, id: string): Monster =>
  defined(state.storage.find((m) => m.id === id))

describe('mắc bệnh', () => {
  it('tinh thần ≥ sickSanity: không mắc, không tốn RNG; tinh thần thấp + đói lả thì có thể mắc', () => {
    const healthy = working(worker('a', { sanity: 100 }))
    const next = days(healthy, 1)
    expect(storageOf(next, 'a').ailment).toBeNull()
    // Tinh thần 0 sau ngày làm việc → 20% + đói lả 10% = 30% mỗi ngày: qua nhiều seed phải có ca mắc.
    let sick = 0
    for (let seed = 1; seed <= 30; seed++) {
      const state = { ...working(worker('a', { sanity: 5, fullness: 0 })), rng: seed }
      const after = storageOf(days(state, 1), 'a')
      if (after.ailment) {
        sick++
        // fracture có trọng số 0: chỉ ra sprain.
        expect(after.ailment).toEqual({ id: 'sprain', restDays: 0 })
      }
    }
    expect(sick).toBeGreaterThan(0)
    expect(sick).toBeLessThan(30)
  })

  it('bệnh giảm sức theo workPercent; quái đã bệnh không mắc thêm', () => {
    expect(
      workConditionPercent(data, worker('a', { ailment: { id: 'sprain', restDays: 0 } }))
    ).toBe(70)
    const state = working(worker('a', { sanity: 1, ailment: { id: 'fracture', restDays: 0 } }))
    expect(storageOf(days(state, 1), 'a').ailment).toEqual({ id: 'fracture', restDays: 0 })
  })

  it('không có bệnh nào trong dữ liệu: không mắc', () => {
    const none = makeAilmentData((raw) => {
      raw.ailments.length = 0
    })
    const state = working(worker('a', { sanity: 1, fullness: 0 }), none)
    expect(storageOf(days(state, 3, none), 'a').ailment).toBeNull()
  })
})

describe('khỏi bệnh', () => {
  it('nghỉ (không làm ở động phủ) đủ idleCureDays ngày thì tự khỏi', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'p' })] }),
      storage: [worker('a', { ailment: { id: 'sprain', restDays: 0 } })],
      dwelling: newDwellingState(data)
    }
    expect(storageOf(days(state, 6), 'a').ailment).toEqual({ id: 'sprain', restDays: 6 })
    expect(storageOf(days(state, 7), 'a').ailment).toBeNull()
  })

  it('thuốc bậc ≥ cureTier chữa khỏi; thuốc yếu hoặc quái khỏe thì không tác dụng, không mất thuốc', () => {
    const state = working(worker('a', { ailment: { id: 'fracture', restDays: 0 } }))
    const use = (s: GameState, itemId: string): GameState =>
      gameReducer(data, s, { type: 'useItem', itemId, monsterId: 'a' })
    expectActionError(() => use(state, 'medLow'), 'itemNoEffect')
    const cured = use(state, 'medHigh')
    expect(storageOf(cured, 'a').ailment).toBeNull()
    expect(cured.inventory.stacks.medHigh).toBeUndefined()
    expect(validateGameState(data, cured)).toEqual([])
    expectActionError(() => use(cured, 'medLow'), 'itemNoEffect')
  })
})

describe('chấn thương trận và ảnh hưởng trong trận', () => {
  const battleData = makeAilmentData((raw) => {
    raw.ailments.push({
      id: 'broken',
      weight: 1,
      causes: ['battle'],
      workPercent: 30,
      statPercents: { attack: -20, speed: -30 },
      cureTier: 2
    })
    raw.config.dwelling = {
      ...raw.config.dwelling,
      needs: { ...raw.config.dwelling.needs, faintAilmentChance: 100 }
    }
  })
  const lose = (gameData: GameData): GameState => {
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['idle'], damageTaken: toBig(45) })],
      [makeMonster({ id: 'e1' })]
    )
    return gameReducer(gameData, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
    })
  }

  it('quái ta còn gục khi trận kết thúc: mắc chấn thương nguồn trận (log ailmentGained)', () => {
    const next = lose(battleData)
    expect(defined(next.battle).outcome).toBe('lost')
    expect(next.party[0].ailment).toEqual({ id: 'broken', restDays: 0 })
    expect(defined(next.battle).log).toContainEqual({
      type: 'ailmentGained',
      monsterId: 'a',
      ailmentId: 'broken'
    })
    expect(validateGameState(battleData, next)).toEqual([])
    // Không có bệnh nguồn trận (fixture chỉ có bệnh nguồn làm việc): không mắc, không tốn RNG.
    expect(lose(data).party[0].ailment).toBeNull()
  })

  it('bệnh giảm chỉ số trong trận qua nguồn % `ailment`', () => {
    const hurt = computeStats(battleData, worker('a', { ailment: { id: 'broken', restDays: 0 } }))
    const plain = computeStats(battleData, worker('a'))
    expect(hurt.percentBySource.ailment).toMatchObject({ attack: -20, speed: -30 })
    expect(hurt.final.attack.lt(plain.final.attack)).toBe(true)
    expect(hurt.final.defense.eq(plain.final.defense)).toBe(true)
  })
})

describe('kiểm tra dữ liệu / save, migrate', () => {
  it('dữ liệu sai: workPercent / cureTier / trọng số, config bệnh', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.ailments.push({
          id: 'bad',
          weight: -1,
          causes: ['magic' as 'work'],
          workPercent: 150,
          statPercents: { luck: 5 } as never,
          cureTier: 0
        })
        raw.config.dwelling = {
          ...raw.config.dwelling,
          needs: {
            ...raw.config.dwelling.needs,
            sickChanceMax: 120,
            idleCureDays: 0,
            sickSanity: 500
          }
        }
      },
      { regenerateText: true }
    )
    const text = issues.join(' | ')
    for (const fragment of [
      'Bệnh "bad": weight',
      'Bệnh "bad": workPercent',
      'Bệnh "bad": cureTier',
      'needs.sickChanceMax',
      'needs.idleCureDays',
      'needs.sickSanity phải ≤ max'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save sai: bệnh lạ, số ngày nghỉ quá idleCureDays', () => {
    const state = makeGameState({
      seed: 1,
      party: [worker('a', { ailment: { id: 'ghost', restDays: 9 } })]
    })
    const text = validateGameState(data, state).join(' | ')
    expect(text).toContain('ailment.id: bệnh không tồn tại "ghost"')
    expect(text).toContain('ailment.restDays phải nhỏ hơn 7')
  })

  it('migrate v91 → v92: mọi quái khỏe', () => {
    const state = makeGameState({ seed: 1, party: [worker('a')] })
    const raw = serializeState(state) as Record<string, unknown>
    const party = (raw.party as Record<string, unknown>[]).map(({ ailment: _a, ...rest }) => rest)
    const migrated = migrateState({ ...raw, version: 91, party }, data)
    expect(migrated.party[0].ailment).toBeNull()
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
