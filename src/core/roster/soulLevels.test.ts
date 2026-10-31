// Hồn tinh (docs/rules/soul-levels.md): % chỉ số theo cấp, nâng cấp ở Tượng Lực (điểm hồn tinh, đập
// viên lớn trả dư, tiền, số cực lớn), hoàn ½ khi fuse, breed / tiến hóa, đồ rơi, kiểm tra dữ liệu /
// quái, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { computeStats, getMaxHp, soulLevelCost, soulPointsSpent, validateMonster } from '../monster'
import {
  addSoulCrystalPoints,
  getItemCount,
  soulCrystalPoints,
  spendSoulCrystalPoints
} from '../inventory'
import { autoEvolve, fuseMonsters, makeOffspring } from '../progression'
import { createRng, toBig } from '../shared'
import {
  FIXTURE_SOUL_LARGE_ID as LARGE,
  FIXTURE_SOUL_SMALL_ID as SMALL,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, GameState, Monster, StatName, Stats } from '../model'
import { getMonsterView } from './roster'

const data = makeData()

const levels = (partial: Partial<Stats>): Stats => ({
  hp: 0,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
  ...partial
})

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 20, skillIds: ['strike'], ...overrides })

function townState(party: Monster[], crystals: Record<string, number>, money = 1e6): GameState {
  return {
    ...makeGameState({ seed: 3, party }),
    money: toBig(money),
    inventory: makeInventory(crystals)
  }
}

const upgrade = (state: GameState, stat: StatName = 'attack', monsterId = 'a'): GameState =>
  gameReducer(data, state, { type: 'upgradeSoulLevel', monsterId, stat })
const partyOf = (state: GameState, id = 'a'): Monster =>
  defined(state.party.find((m) => m.id === id))

describe('% chỉ số theo cấp hồn tinh', () => {
  it('mỗi cấp +3% đúng chỉ số đó, kể cả max HP; cấp 0 không cộng', () => {
    const { percentBySource } = computeStats(
      data,
      hero({ soulLevels: levels({ attack: 2, hp: 1 }) })
    )
    expect(percentBySource.soulLevel).toEqual({
      hp: 3,
      attack: 6,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0
    })
    expect(computeStats(data, hero()).percentBySource.soulLevel.attack).toBe(0)
  })

  it('cộng vào chỉ số cuối cùng', () => {
    const plain = computeStats(data, hero()).final.attack
    const boosted = computeStats(data, hero({ soulLevels: levels({ attack: 10 }) })).final.attack
    expect(boosted.gt(plain)).toBe(true)
  })

  it('MonsterView có cấp, % và giá cấp tiếp theo', () => {
    const state = townState([hero({ soulLevels: levels({ speed: 4 }) })], {})
    const view = defined(getMonsterView(data, state, 'a'))
    expect(view.soulLevels.speed.level).toBe(4)
    expect(view.soulLevels.speed.percent).toBe(12)
    expect(view.soulLevels.speed.next.points).toBe(5)
    expect(view.soulLevels.speed.next.money.toString()).toBe('2500')
    expect(view.statPercents.soulLevel.speed).toBe(12)
  })
})

describe('upgradeSoulLevel', () => {
  it('cấp 0 → 1: 1 điểm + 100 tiền', () => {
    const state = townState([hero()], { [SMALL]: 3 })
    const next = upgrade(state)
    expect(partyOf(next).soulLevels.attack).toBe(1)
    expect(getItemCount(next.inventory, SMALL)).toBe(2)
    expect(state.money.minus(next.money).toString()).toBe('100')
  })

  it('cấp n → n + 1 tốn n + 1 điểm và 100 × (n + 1)² tiền, quái trong kho cũng được', () => {
    const stored = hero({ id: 's', soulLevels: levels({ defense: 4 }) })
    const state = { ...townState([hero()], { [SMALL]: 5 }), storage: [stored] }
    const next = upgrade(state, 'defense', 's')
    expect(defined(next.storage[0]).soulLevels.defense).toBe(5)
    expect(getItemCount(next.inventory, SMALL)).toBe(0)
    expect(state.money.minus(next.money).toString()).toBe('2500')
  })

  it('thiếu viên nhỏ thì đập viên lớn, trả dư bằng viên nhỏ', () => {
    const state = townState([hero({ soulLevels: levels({ attack: 2 }) })], {
      [SMALL]: 1,
      [LARGE]: 1
    })
    const next = upgrade(state)
    // Cần 3 điểm: 1 viên nhỏ + đập 1 viên lớn (5) còn thiếu 2, trả lại 3 viên nhỏ.
    expect(getItemCount(next.inventory, LARGE)).toBe(0)
    expect(getItemCount(next.inventory, SMALL)).toBe(3)
  })

  it('đủ viên nhỏ thì giữ viên lớn', () => {
    const state = townState([hero({ soulLevels: levels({ attack: 2 }) })], {
      [SMALL]: 3,
      [LARGE]: 1
    })
    const next = upgrade(state)
    expect(getItemCount(next.inventory, LARGE)).toBe(1)
    expect(getItemCount(next.inventory, SMALL)).toBe(0)
  })

  it('thiếu điểm hồn tinh hoặc tiền: báo lỗi, state giữ nguyên', () => {
    const state = townState([hero({ soulLevels: levels({ attack: 5 }) })], { [SMALL]: 5 })
    expectActionError(() => upgrade(state), 'notEnoughSoulCrystals', { need: 6, have: 5 })
    const poor = townState([hero()], { [SMALL]: 1 }, 99)
    expectActionError(() => upgrade(poor), 'notEnoughMoney')
    expect(getItemCount(poor.inventory, SMALL)).toBe(1)
  })

  it('chỉ ở thị trấn, ngoài trận, quái của mình, chỉ số hợp lệ, quái không đang thám hiểm', () => {
    const state = townState([hero()], { [SMALL]: 5 })
    const away: GameState = { ...state, location: { type: 'floor', floor: 1 } }
    expectActionError(() => upgrade(away), 'notInTown')
    const battle = {
      ...makeBattleState([hero()], [makeMonster({ id: 'w' })]),
      inventory: state.inventory
    }
    expectActionError(() => upgrade(battle), 'inBattle')
    expectActionError(() => upgrade(state, 'attack', 'zzz'), 'monsterNotOwned')
    expectActionError(() => upgrade(state, 'luck' as StatName), 'malformedAction')
    const busy = townState([hero({ assignment: { kind: 'expedition', id: 'x1' } })], { [SMALL]: 5 })
    expectActionError(() => upgrade(busy), 'monsterBusy')
  })

  it('cấp cực lớn: giá Decimal không tràn', () => {
    const cost = soulLevelCost(data, 1e9)
    expect(cost.points).toBe(1e9 + 1)
    expect(cost.money.toString()).toBe(
      toBig(1e9 + 1)
        .pow(2)
        .times(100)
        .toString()
    )
    const huge = hero({ soulLevels: levels({ attack: 1e6 }) })
    expect(computeStats(data, huge).final.attack.isFinite()).toBe(true)
  })
})

describe('điểm hồn tinh trong túi', () => {
  it('cộng điểm theo viên to trước, trừ điểm có biên 0 và đúng bằng tổng', () => {
    const bag = addSoulCrystalPoints(data, makeInventory({}), 12)
    expect([getItemCount(bag, LARGE), getItemCount(bag, SMALL)]).toEqual([2, 2])
    expect(soulCrystalPoints(data, bag)).toBe(12)
    expect(spendSoulCrystalPoints(data, bag, 0)).toEqual(bag)
    expect(soulCrystalPoints(data, spendSoulCrystalPoints(data, bag, 12))).toBe(0)
    expect(addSoulCrystalPoints(data, bag, 0)).toEqual(bag)
  })
})

describe('fuse / breed / tiến hóa', () => {
  const sub = (): Monster =>
    hero({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      soulLevels: levels({ attack: 3, speed: 2 })
    })

  it('quái gốc giữ cấp của mình', () => {
    const base = hero({ soulLevels: levels({ hp: 2 }) })
    const [fused] = fuseMonsters(data, createRng(1), base, sub())
    expect(fused.soulLevels).toEqual(levels({ hp: 2 }))
  })

  it('quái phụ hoàn lại ½ điểm đã dùng (làm tròn xuống) vào túi', () => {
    // Quái phụ đã dùng 6 + 3 = 9 điểm → hoàn 4.
    expect(soulPointsSpent(sub())).toBe(9)
    const state = townState([hero(), sub(), hero({ id: 'k' })], {})
    const next = gameReducer(data, state, { type: 'fuse', baseId: 'a', subId: 'b' })
    expect(soulCrystalPoints(data, next.inventory)).toBe(4)
  })

  it('con breeding cấp 0, tiến hóa giữ cấp', () => {
    const father = hero({ id: 'f', gender: 'male', soulLevels: levels({ attack: 5 }) })
    const mother = hero({ id: 'm', gender: 'female', soulLevels: levels({ speed: 5 }) })
    expect(makeOffspring(data, createRng(1), father, mother, 'egg')[0].soulLevels).toEqual(
      levels({})
    )
    const before = makeMonster({ level: 10, exp: 1000, soulLevels: levels({ speed: 7 }) })
    const scene = { party: [], place: null, aptitudeFloor: 1, time: 0 }
    const { monster } = autoEvolve(data, before, { rng: createRng(1), day: 0, scene })
    expect(monster.speciesId).toBe('strongling')
    expect(monster.soulLevels.speed).toBe(7)
  })

  it('fuse thất bại không hộ mệnh: hoàn cả phần của quái gốc', () => {
    const fail = createGameData(
      (() => {
        const raw = makeRawData()
        raw.config.fuseChance.raceChances = { same: 0, breedable: 0, other: 0 }
        return raw
      })()
    )
    const base = hero({ soulLevels: levels({ hp: 2 }) })
    const keeper = hero({ id: 'k' })
    const state = townState([base, sub(), keeper], {})
    const next = gameReducer(fail, state, { type: 'fuse', baseId: 'a', subId: 'b' })
    expect(next.party.map((m) => m.id)).toEqual(['k'])
    // 9 điểm của quái phụ → 4, 3 điểm của quái gốc → 1.
    expect(soulCrystalPoints(fail, next.inventory)).toBe(5)
  })
})

describe('đồ rơi', () => {
  it('boss rơi hồn tinh theo config', () => {
    const raw = makeRawData()
    raw.config.soulLevels.bossDrops = [{ itemId: LARGE, chance: 100 }]
    const drops = createGameData(raw)
    const boss = { ...makeMonster({ id: 'boss', skillIds: ['idle'] }), bossMultiplier: 3 }
    const dying = { ...boss, damageTaken: getMaxHp(drops, boss).minus(1) }
    const state = makeBattleState([hero({ level: 50 })], [dying], { isBoss: true })
    const command: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
    const won = gameReducer(drops, state, { type: 'submitTurn', commands: [command] })
    expect(getItemCount(won.inventory, LARGE)).toBe(1)
  })
})

describe('kiểm tra dữ liệu / quái / migrate', () => {
  it('points phải nguyên ≥ 1; có hồn tinh thì phải có loại 1 điểm', () => {
    const setPoints = (id: string, points: number) => (raw: ReturnType<typeof makeRawData>) => {
      const item = raw.items.find((entry) => entry.id === id)
      if (item?.category === 'soulCrystal') item.points = points
    }
    expect(dataIssuesAfter(setPoints(LARGE, 0)).join('\n')).toMatch(/points/)
    expect(dataIssuesAfter(setPoints(LARGE, 1.5)).join('\n')).toMatch(/points/)
    expect(dataIssuesAfter(setPoints(SMALL, 2)).join('\n')).toMatch(/loại 1 điểm/)
    expect(
      dataIssuesAfter((raw) => {
        raw.config.soulLevels.fuseRefundPercent = 150
      }).join('\n')
    ).toMatch(/fuseRefundPercent/)
  })

  it('cấp âm / lẻ / thiếu chỉ số bị báo lỗi', () => {
    expect(validateMonster(data, hero({ soulLevels: levels({ attack: -1 }) })).join()).toMatch(
      /soulLevels\.attack/
    )
    expect(validateMonster(data, hero({ soulLevels: levels({ hp: 0.5 }) })).join()).toMatch(
      /soulLevels\.hp/
    )
    const missing = { ...hero(), soulLevels: { hp: 0 } as Stats }
    expect(validateMonster(data, missing).join()).toMatch(/soulLevels\.speed/)
    expect(validateMonster(data, hero({ soulLevels: levels({ attack: 1e9 }) }))).toEqual([])
  })

  it('migrate v46 → v47: mọi quái cấp 0', () => {
    const state = makeGameState({ seed: 1, party: [hero()] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { soulLevels: _soulLevels, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const old = { ...raw, version: 46, party: (raw.party as unknown[]).map(strip) }
    const migrated = migrateState(old, data)
    expect(partyOf(migrated).soulLevels).toEqual(levels({}))
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
