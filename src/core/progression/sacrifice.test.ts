// Hiến tế ở NPC fusing (docs/rules/sacrifice.md): điều kiện cùng race + cùng lineage, stack cộng
// dồn, giá, hàng loạt, huyết mạch, đồ / hồn tinh về túi, chỉ số, fuse / breeding, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount, soulCrystalPoints } from '../inventory'
import { computeStats, getMaxHp, validateMonster } from '../monster'
import { getMonsterView } from '../roster'
import { createRng, toBig } from '../shared'
import {
  atFloor,
  defined,
  expectActionError,
  makeBattleState,
  makeBloodlineData,
  makeData,
  makeGameState,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { GameData, GameState, Monster } from '../model'
import { fuseMonsters } from './fusion'
import { makeOffspring } from './breeding'
import { canSacrificeTo, sacrificeCost } from './sacrifice'

const data = makeData()

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 10, ...overrides })
const fodder = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, level: 5, ...overrides })

function townState(party: Monster[], storage: Monster[] = [], money = 1e6): GameState {
  return { ...makeGameState({ seed: 1, party }), storage, money: toBig(money) }
}

const offer = (
  state: GameState,
  subIds: readonly string[],
  baseId = 'a',
  gameData: GameData = data
): GameState => gameReducer(gameData, state, { type: 'sacrifice', baseId, subIds })
const heroOf = (state: GameState): Monster =>
  defined([...state.party, ...state.storage].find((m) => m.id === 'a'))

describe('điều kiện hiến tế', () => {
  it('cùng race và lineage y hệt (so như tập hợp); quái thường cùng race luôn được', () => {
    expect(canSacrificeTo(hero(), fodder('b', { speciesId: 'strongling' }))).toBe(true)
    expect(canSacrificeTo(hero(), fodder('b', { raceId: 'beast' }))).toBe(false)
    const fused = { fused: true, lineage: ['x', 'y'] }
    expect(canSacrificeTo(hero(fused), fodder('b', { fused: true, lineage: ['y', 'x'] }))).toBe(
      true
    )
    expect(canSacrificeTo(hero(fused), fodder('b', { fused: true, lineage: ['x'] }))).toBe(false)
    expect(canSacrificeTo(hero(fused), fodder('b'))).toBe(false)
    expect(canSacrificeTo(hero(), fodder('b', fused))).toBe(false)
  })
})

describe('hiến tế', () => {
  it('quái phụ mất, quái chính +1 stack, trả giá theo tổng level, ghi mốc lý lịch', () => {
    const state = townState([hero(), fodder('b')], [fodder('c')])
    const next = offer(state, ['b'])
    expect(next.party.map((m) => m.id)).toEqual(['a'])
    expect(heroOf(next).sacrificeStacks).toBe(1)
    // 20 × (10 + 5).
    expect(next.money.toNumber()).toBe(1e6 - 300)
    expect(heroOf(next).history?.milestones.at(-1)).toMatchObject({ kind: 'sacrificed', count: 1 })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('quái phụ đã được hiến tế truyền stack của nó + 1; shiny / boss vẫn chỉ +1', () => {
    const state = townState([
      hero({ sacrificeStacks: 2 }),
      fodder('b', { sacrificeStacks: 4 }),
      fodder('c', { shinyStacks: 3, bossMultiplier: 4 })
    ])
    expect(heroOf(offer(state, ['b'])).sacrificeStacks).toBe(7)
    expect(heroOf(offer(state, ['c'])).sacrificeStacks).toBe(3)
  })

  it('hàng loạt: nhiều quái phụ (đội và kho) trong một action, stack và giá cộng dồn', () => {
    const state = townState([hero(), fodder('b')], [fodder('c', { level: 1 }), fodder('d')])
    const next = offer(state, ['b', 'c', 'd'])
    expect(heroOf(next).sacrificeStacks).toBe(3)
    expect(next.storage).toEqual([])
    // 20 × ((10 + 5) + (10 + 1) + (10 + 5)).
    expect(
      sacrificeCost(data, hero(), [fodder('b'), fodder('c', { level: 1 }), fodder('d')])
    ).toEqual(toBig(820))
    expect(next.money.toNumber()).toBe(1e6 - 820)
    expect(heroOf(next).history?.milestones.at(-1)).toMatchObject({ count: 3 })
  })

  it('quái chính trong kho được; đồ của quái phụ về túi, hoàn hồn tinh như fuse', () => {
    const sub = fodder('b', {
      equipment: [{ storage: 'stack', itemId: 'everstone' }],
      soulLevels: { hp: 0, attack: 3, defense: 0, spAttack: 0, spDefense: 0, speed: 2 }
    })
    const state = townState([makeMonster({ id: 'k' }), sub], [hero()])
    const next = offer(state, ['b'])
    expect(heroOf(next).sacrificeStacks).toBe(1)
    expect(getItemCount(next.inventory, 'everstone')).toBe(1)
    // Đã dùng 6 + 3 = 9 điểm → hoàn 50% làm tròn xuống.
    expect(soulCrystalPoints(data, next.inventory)).toBe(4)
  })

  it('huyết mạch: +25% độ thuần quái phụ, không vượt độ thuần cao hơn của hai quái', () => {
    const bloodData = makeBloodlineData()
    const pebble = (id: string, purity: number): Monster =>
      makeMonster({
        id,
        level: id === 'a' ? 10 : 5,
        speciesId: 'pebble',
        baseSpeciesId: 'pebble',
        gender: 'none',
        elementIds: ['normal'],
        bloodlines: [{ groupId: 'stone', purity }]
      })
    const purityAfter = (base: number, sub: number): unknown => {
      const state = townState([pebble('a', base), pebble('b', sub)])
      return heroOf(offer(state, ['b'], 'a', bloodData)).bloodlines
    }
    expect(purityAfter(10, 20)).toEqual([{ groupId: 'stone', purity: 15 }])
    // Kẹp ở độ thuần của quái phụ; quái phụ thuần kém hơn thì không cộng gì.
    expect(purityAfter(18, 20)).toEqual([{ groupId: 'stone', purity: 20 }])
    expect(purityAfter(20, 10)).toEqual([{ groupId: 'stone', purity: 20 }])
  })

  it('lỗi: khác race / lineage, trùng quái chính, id trùng / rỗng, bản mệnh, đang làm việc', () => {
    const state = townState(
      [hero(), fodder('b'), fodder('x', { raceId: 'beast' }), fodder('bond', { bond: true })],
      [fodder('busy', { assignment: { kind: 'expedition', id: 'e1' } })]
    )
    expectActionError(() => offer(state, ['b', 'x']), 'sacrificeMismatch', { subId: 'x' })
    expectActionError(() => offer(state, ['a']), 'sacrificeSameMonster')
    expectActionError(() => offer(state, ['b', 'b']), 'malformedAction')
    expectActionError(() => offer(state, []), 'malformedAction')
    expectActionError(() => offer(state, ['bond']), 'isBondBeast')
    expectActionError(() => offer(state, ['busy']), 'monsterBusy')
    expectActionError(() => offer(state, ['ghost']), 'monsterNotOwned')
    expectActionError(() => offer(state, ['b'], 'ghost'), 'monsterNotOwned')
  })

  it('lỗi: đội trống sau khi mất quái phụ, thiếu tiền, ngoài thị trấn, trong trận', () => {
    const lonely = townState([fodder('b')], [hero()])
    expectActionError(() => offer(lonely, ['b']), 'partyWouldBeEmpty')
    const state = townState([hero(), fodder('b')])
    expectActionError(() => offer({ ...state, money: toBig(299) }, ['b']), 'notEnoughMoney')
    expectActionError(() => offer(atFloor(state, 1), ['b']), 'notInTown')
    const inBattle = {
      ...makeBattleState(state.party, [makeMonster({ id: 'w' })]),
      money: state.money
    }
    expectActionError(() => offer(inBattle, ['b']), 'inBattle')
  })

  it('biên: stack cực lớn cộng vượt số nguyên an toàn thì báo lỗi, state giữ nguyên', () => {
    const max = Number.MAX_SAFE_INTEGER
    const state = townState([hero({ sacrificeStacks: max - 1 }), fodder('b'), fodder('c')])
    expect(heroOf(offer(state, ['b'])).sacrificeStacks).toBe(max)
    expectActionError(() => offer(state, ['b', 'c']), 'sacrificeStackLimit', { max })
    expect(heroOf(state).sacrificeStacks).toBe(max - 1)
  })
})

describe('stack hiến tế', () => {
  it('mỗi stack +1% mọi chỉ số tuyến tính, cộng vào tổng % ở bước áp trait', () => {
    const plain = hero()
    const stacked = hero({ sacrificeStacks: 100 })
    expect(computeStats(data, plain).percentBySource.sacrifice).toMatchObject({ hp: 0, speed: 0 })
    const percents = computeStats(data, stacked).percentBySource.sacrifice
    expect(percents).toMatchObject({ hp: 100, attack: 100, speed: 100 })
    expect(getMaxHp(data, stacked).gt(getMaxHp(data, plain))).toBe(true)
    const view = defined(getMonsterView(data, makeGameState({ seed: 1, party: [stacked] }), 'a'))
    expect(view.sacrifice).toEqual({ stacks: 100, statPercent: 100 })
  })

  it('fuse: quái gốc giữ stack + stack quái phụ (không +1); breeding: con 0 stack', () => {
    const base = hero({ sacrificeStacks: 3 })
    const sub = fodder('b', {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      sacrificeStacks: 5
    })
    const [fused] = fuseMonsters(data, createRng(1), base, sub)
    expect(fused.sacrificeStacks).toBe(8)
    const father = makeMonster({ id: 'f', gender: 'male', sacrificeStacks: 9 })
    const mother = makeMonster({ id: 'm', gender: 'female', sacrificeStacks: 9 })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'kid')
    expect(child.sacrificeStacks).toBe(0)
  })

  it('kiểm tra quái: stack phải nguyên ≥ 0', () => {
    const bad = (sacrificeStacks: unknown): string =>
      validateMonster(data, { ...hero(), sacrificeStacks } as Monster).join()
    expect(bad(-1)).toMatch(/sacrificeStacks/)
    expect(bad(1.5)).toMatch(/sacrificeStacks/)
    expect(bad(undefined)).toMatch(/sacrificeStacks/)
    expect(validateMonster(data, hero({ sacrificeStacks: 0 }))).toEqual([])
  })

  it('migrate v74 → v75: mọi quái 0 stack', () => {
    const state = makeGameState({ seed: 1, party: [hero({ sacrificeStacks: 4 })] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { sacrificeStacks: _stacks, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const old = { ...raw, version: 74, party: (raw.party as unknown[]).map(strip) }
    const migrated = migrateState(old, data)
    expect(migrated.party[0].sacrificeStacks).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
