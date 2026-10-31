// Bộ sưu tập (docs/rules/dex.md): ghi đã gặp / đã sở hữu sau action, mốc thưởng, thưởng sưu tập
// trong trận, bắt chí mạng theo Dex, kiểm tra save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, validateGameState } from '../game'
import { createGameData } from '../gameData'
import {
  collectionStatPercent,
  criticalCaptureMultiplier,
  dexNumber,
  dexOwnedPercent,
  dexTotal,
  regionalDexProgress,
  regionalDexSpecies
} from '../registries'
import { cloneData, toBig } from '../shared'
import {
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { DexState, GameData, GameState } from '../model'
import { claimDexReward, claimRegionalDexReward, dexEntry, newDexState, syncDex } from './dex'

const data = makeData()

/** Fixture có hai mốc thưởng và mốc chí mạng như Pokémon. */
function dexData(): GameData {
  const raw = makeRawData()
  raw.config.dex = {
    ...raw.config.dex,
    milestones: [
      { id: 'd10', percent: 10, moneyPerFloor: 100, items: { ball: 2 } },
      { id: 'd50', percent: 50, moneyPerFloor: 500, items: {} }
    ]
  }
  raw.config.capture = {
    ...raw.config.capture,
    criticalTiers: [
      { ownedPercent: 10, multiplier: 1 },
      { ownedPercent: 50, multiplier: 2.5 }
    ]
  }
  return createGameData(raw)
}

const withDex = (state: GameState, dex: Partial<DexState>): GameState => ({
  ...state,
  dex: { ...newDexState(), ...dex }
})

describe('ghi Bộ sưu tập', () => {
  it('đội / kho là đã sở hữu và đã gặp; quái fuse tính loài gốc; dạng Mega không tính', () => {
    const state = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
      storage: [
        makeMonster({ id: 'b', speciesId: 'strongling', baseSpeciesId: 'weakling' }),
        makeMonster({ id: 'c', speciesId: 'megaWeakling', baseSpeciesId: 'weakling' })
      ]
    }
    const synced = syncDex(data, state)
    expect(synced.dex.owned).toEqual(['weakling', 'strongling'])
    expect(synced.dex.seen).toEqual(['weakling', 'strongling'])
    // Không có gì mới: trả state cũ.
    expect(syncDex(data, synced)).toBe(synced)
  })

  it('quái địch trong trận là đã gặp (chưa sở hữu)', () => {
    const state = makeBattleState(
      [makeMonster({ id: 'a' })],
      [makeMonster({ id: 'e1', speciesId: 'twig', baseSpeciesId: 'twig' })]
    )
    const synced = syncDex(data, state)
    expect(synced.dex.seen).toContain('twig')
    expect(synced.dex.owned).not.toContain('twig')
  })

  it('reducer ghi sau action; action không đổi gì giữ nguyên state', () => {
    const town = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    const moved = gameReducer(data, town, { type: 'travel', to: { type: 'floor', floor: 1 } })
    expect(moved.dex.owned).toEqual(['weakling'])
    expect(gameReducer(data, town, { type: 'travel', to: { type: 'town' } })).toBe(town)
  })
})

describe('mốc thưởng', () => {
  const rich = dexData()
  const total = dexTotal(rich)
  const owned = (count: number): string[] =>
    Object.values(rich.species)
      .filter((s) => s.kind === 'normal' && s.formKind === undefined)
      .slice(0, count)
      .map((s) => s.id)

  it('đủ %: nhận tiền × highestFloor, vật phẩm; chỉ một lần', () => {
    const need = Math.ceil(total * 0.1)
    const state = withDex(
      { ...makeGameState({ seed: 1, party: [makeMonster()], highestFloor: 3 }), money: toBig(0) },
      { owned: owned(need), seen: owned(need) }
    )
    const after = claimDexReward(rich, state, 'd10')
    expect(after.money).toEqual(toBig(300))
    expect(after.inventory.stacks.ball).toBe(2)
    expect(after.dex.claimedMilestones).toEqual(['d10'])
    expectActionError(() => claimDexReward(rich, after, 'd10'), 'dexRewardClaimed')
  })

  it('báo lỗi: chưa đủ %, mốc lạ, đang đánh', () => {
    const state = withDex(makeGameState({ seed: 1, party: [makeMonster()] }), {})
    expectActionError(() => claimDexReward(rich, state, 'd50'), 'dexMilestoneNotReached', {
      milestoneId: 'd50',
      need: 50
    })
    expectActionError(() => claimDexReward(rich, state, 'zz'), 'dexMilestoneNotFound')
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e1' })])
    expectActionError(() => claimDexReward(rich, battle, 'd10'), 'inBattle')
  })

  it('% sở hữu và hệ số bắt chí mạng theo mốc (0 khi chưa đạt mốc nào)', () => {
    expect(dexOwnedPercent(rich, { owned: [] })).toBe(0)
    expect(criticalCaptureMultiplier(rich, { owned: [] })).toBe(0)
    const half = owned(Math.ceil(total / 2))
    expect(criticalCaptureMultiplier(rich, { owned: half })).toBe(2.5)
    expect(criticalCaptureMultiplier(rich, { owned: owned(Math.ceil(total * 0.1)) })).toBe(1)
  })
})

describe('thưởng sưu tập', () => {
  const many = (count: number): string[] => Array.from({ length: count }, (_, i) => `s${i}`)

  it('mỗi 100 loài đã sở hữu +1% mọi chỉ số, không trần (đếm bằng số lượng)', () => {
    expect(collectionStatPercent(data, { owned: many(99) })).toBe(0)
    expect(collectionStatPercent(data, { owned: many(100) })).toBe(1)
    expect(collectionStatPercent(data, { owned: many(1050) })).toBe(10)
  })
})

describe('save Bộ sưu tập', () => {
  it('kiểm tra: loài lạ / trùng, đã sở hữu chưa gặp, mốc lạ', () => {
    const base = syncDex(data, makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }))
    expect(validateGameState(data, base)).toEqual([])
    const bad = withDex(base, {
      seen: ['weakling', 'weakling', 'megaWeakling'],
      owned: ['twig'],
      claimedMilestones: ['zz']
    })
    expect(validateGameState(data, bad)).toEqual([
      'dex.seen[1]: loài bị trùng "weakling"',
      'dex.seen[2]: loài không thuộc Bộ sưu tập "megaWeakling"',
      'dex.owned: loài "twig" chưa có trong dex.seen',
      'dex.claimedMilestones[0]: id không tồn tại "zz"'
    ])
  })

  it('migrate v55 → v56: điền từ đội và kho, trứng không tính', () => {
    const current = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
      storage: [makeMonster({ id: 'b', speciesId: 'strongling', baseSpeciesId: 'strongling' })]
    }
    const { dex: _dex, ...rest } = cloneData(current)
    const migrated = migrateState(JSON.parse(JSON.stringify({ ...rest, version: 55 })), data)
    expect(migrated.dex).toEqual({
      seen: ['weakling', 'strongling'],
      owned: ['weakling', 'strongling'],
      shinyOwned: [],
      claimedMilestones: [],
      claimedRegions: [],
      hitParts: {}
    })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('số Dex', () => {
  it('đánh theo thứ tự loài gốc; dạng vùng dùng số loài gốc; dạng trong trận / loài lạ = null', () => {
    const raw = makeRawData()
    const weakling = raw.species.find((s) => s.id === 'weakling')
    if (weakling?.kind !== 'normal') throw new Error('fixture sai')
    raw.species.push({
      ...weakling,
      id: 'weaklingRegional',
      formOf: 'weakling',
      formKind: 'regional',
      evolutions: []
    })
    const formData = createGameData(withFixtureText(raw))
    const numbered = Object.keys(formData.species)
      .map((id) => dexNumber(formData, id))
      .filter((n): n is number => n !== null)
    const unique = [...new Set(numbered)].sort((a, b) => a - b)
    expect(unique[0]).toBe(1)
    expect(unique.at(-1)).toBe(unique.length)
    expect(dexNumber(formData, 'weaklingRegional')).toBe(dexNumber(formData, 'weakling'))
    expect(dexNumber(formData, 'megaWeakling')).toBeNull()
    expect(dexNumber(formData, 'fused')).toBeNull()
    expect(dexNumber(formData, 'nope')).toBeNull()
  })
})

describe('Dex theo map', () => {
  it('loài gặp + boss của map kèm cả chuỗi tiến hóa; map lạ rỗng', () => {
    expect([...regionalDexSpecies(data, 'field')].sort()).toEqual(['strongling', 'weakling'])
    expect(regionalDexSpecies(data, 'nope')).toEqual([])
    expect(regionalDexProgress(data, { owned: ['weakling', 'twig'] }, 'field')).toEqual({
      owned: 1,
      total: 2
    })
  })

  it('đủ loài: nhận tiền × highestFloor, một lần; báo lỗi chưa đủ, map lạ, đã nhận, đang đánh', () => {
    const state = makeGameState({ seed: 1, highestFloor: 3, party: [makeMonster({ id: 'a' })] })
    const full = withDex(state, {
      seen: ['weakling', 'strongling'],
      owned: ['weakling', 'strongling']
    })
    const claimed = gameReducer(data, full, { type: 'claimRegionalDexReward', biomeId: 'field' })
    expect(claimed.money.minus(full.money).eq(toBig(300))).toBe(true)
    expect(claimed.dex.claimedRegions).toEqual(['field'])
    expect(validateGameState(data, claimed)).toEqual([])
    expectActionError(() => claimRegionalDexReward(data, claimed, 'field'), 'dexRegionClaimed', {
      biomeId: 'field'
    })
    const half = withDex(state, { seen: ['weakling'], owned: ['weakling'] })
    expectActionError(() => claimRegionalDexReward(data, half, 'field'), 'dexRegionIncomplete', {
      biomeId: 'field',
      owned: 1,
      total: 2
    })
    expectActionError(() => claimRegionalDexReward(data, full, 'nope'), 'dexRegionNotFound', {
      biomeId: 'nope'
    })
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expectActionError(
      () => claimRegionalDexReward(data, withDex(battle, full.dex), 'field'),
      'inBattle'
    )
  })
})

describe('shiny đã sở hữu', () => {
  it('quái shiny trong đội / kho ghi vào shinyOwned; save sai báo lỗi', () => {
    const state = makeGameState({
      seed: 1,
      party: [
        makeMonster({ id: 'a', shinyStacks: 1 }),
        makeMonster({ id: 'b', speciesId: 'strongling', baseSpeciesId: 'strongling' })
      ]
    })
    const synced = syncDex(data, state)
    expect(synced.dex.shinyOwned).toEqual(['weakling'])
    expect(validateGameState(data, synced)).toEqual([])
    const bad = withDex(synced, {
      shinyOwned: ['twig'],
      claimedRegions: ['nope', 'field', 'field']
    })
    expect(validateGameState(data, bad)).toEqual([
      'dex.shinyOwned: loài "twig" chưa có trong dex.owned',
      'dex.claimedRegions[0]: id không tồn tại "nope"',
      'dex.claimedRegions[2]: id bị trùng "field"'
    ])
  })

  it('migrate v56 → v57: shiny từ quái shiny đang có, chưa nhận thưởng map', () => {
    const current = syncDex(
      data,
      makeGameState({ seed: 1, party: [makeMonster({ id: 'a', shinyStacks: 2 })] })
    )
    const { shinyOwned: _shiny, claimedRegions: _regions, ...oldDex } = current.dex
    const saved = JSON.parse(JSON.stringify({ ...cloneData(current), dex: oldDex, version: 56 }))
    const migrated = migrateState(saved, data)
    expect(migrated.dex.shinyOwned).toEqual(['weakling'])
    expect(migrated.dex.claimedRegions).toEqual([])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('mục Dex', () => {
  it('số, đã gặp / sở hữu / shiny, cân nặng; chưa có chữ = null; loài ngoài Dex = null', () => {
    const dex = {
      ...newDexState(),
      seen: ['weakling', 'strongling'],
      owned: ['weakling'],
      shinyOwned: ['weakling']
    }
    const entry = dexEntry(data, dex, 'weakling', 'vi')
    expect(entry).toMatchObject({
      speciesId: 'weakling',
      number: dexNumber(data, 'weakling'),
      seen: true,
      owned: true,
      shinyOwned: true,
      category: null,
      flavor: null,
      heightM: null
    })
    expect(entry?.weightKg).toBeGreaterThan(0)
    expect(dexEntry(data, dex, 'strongling', 'vi')).toMatchObject({ seen: true, owned: false })
    expect(dexEntry(data, dex, 'megaWeakling', 'vi')).toBeNull()
    expect(dexEntry(data, dex, 'nope', 'vi')).toBeNull()
  })
})
