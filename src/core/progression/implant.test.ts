// Phòng Thí Nghiệm: cấy ghép (docs/rules/implant.md): danh sách hàng (bậc, chỉ số, scale theo tầng,
// đổi hàng theo ngày), cấy thành công / thất bại, mất quái ở lần thất bại cuối, chỉ số, tương tác
// fuse / breeding, kiểm tra save, migrate.

import { describe, expect, it } from 'vitest'
import {
  createNewGame,
  gameReducer,
  migrateState,
  serializeState,
  validateGameState
} from '../game'
import { computeStats, getMaxHp, validateMonster } from '../monster'
import { getMonsterView } from '../roster'
import { BIG_ZERO, createRng, toBig, type Decimal } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { FlatStatSerumTier, GameData, GameState, Monster, Serum } from '../model'
import { fuseMonsters } from './fusion'
import { makeOffspring } from './breeding'
import { advanceTime } from './time'
import { implantCost, restockLab, rollLabStock, rollSerum } from './implant'
import { implantChance } from '../monster'

const data = makeData()

/** Dữ liệu với tỉ lệ cấy cố định (100 = luôn thành công, 0 = luôn thất bại). */
const withChance = (baseChance: number, gameData: GameData = data): GameData => ({
  ...gameData,
  config: { ...gameData.config, implant: { ...gameData.config.implant, baseChance } }
})
const sure = withChance(100)
const doomed = withChance(0)

const rare: Serum = {
  tierId: 'rare',
  effects: [
    { kind: 'flatStat', stat: 'attack', amount: toBig(25) },
    { kind: 'flatStat', stat: 'speed', amount: toBig(20) }
  ]
}
const mutagen: Serum = {
  tierId: 'mutagen',
  effects: [{ kind: 'hookEffect', effectId: 'hardening', levels: 1 }]
}

/** Lượng cộng chỉ số của huyết thanh (bỏ hiệu ứng hook). */
const flatAmounts = (serum: Serum): Decimal[] =>
  serum.effects.flatMap((effect) => (effect.kind === 'flatStat' ? [effect.amount] : []))
const flatTier = (tierId: string): FlatStatSerumTier => {
  const tier = defined(data.config.implant.tiers.find((t) => t.id === tierId))
  if (tier.kind !== 'flatStat') throw new Error(`bậc ${tierId} không cộng chỉ số`)
  return tier
}

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 10, ...overrides })

function labState(party: Monster[], storage: Monster[] = [], money = 1e6): GameState {
  return {
    ...makeGameState({ seed: 1, party }),
    storage,
    money: toBig(money),
    lab: { stock: [rare], restockDay: 10 }
  }
}

const implant = (
  gameData: GameData,
  state: GameState,
  monsterId = 'a',
  serumIndex = 0
): GameState => gameReducer(gameData, state, { type: 'implant', monsterId, serumIndex })
const heroOf = (state: GameState): Monster =>
  defined([...state.party, ...state.storage].find((m) => m.id === 'a'))
const bonus = (monster: Monster): Record<string, number> =>
  Object.fromEntries(
    Object.entries(monster.implantBonusStats).map(([stat, value]) => [
      stat,
      (value as Decimal).toNumber()
    ])
  )

describe('huyết thanh', () => {
  it('bậc cộng chỉ số: đúng số chỉ số không trùng, nguyên trong khoảng ở tầng 1; bậc hiệu ứng: 1 hiệu ứng', () => {
    let rng = createRng(7)
    for (let i = 0; i < 200; i++) {
      let serum: Serum
      ;[serum, rng] = rollSerum(data, rng, 1)
      const tier = defined(data.config.implant.tiers.find((t) => t.id === serum.tierId))
      if (tier.kind === 'hookEffect') {
        expect(serum.effects).toEqual([
          { kind: 'hookEffect', effectId: expect.any(String), levels: tier.levels }
        ])
        continue
      }
      const stats = serum.effects.map((effect) => (effect.kind === 'flatStat' ? effect.stat : ''))
      expect(new Set(stats).size).toBe(tier.statCount)
      for (const value of flatAmounts(serum)) {
        expect(value.isInteger()).toBe(true)
        expect(value.gte(tier.min) && value.lte(tier.max)).toBe(true)
      }
    }
  })

  it('mọi bậc đều xuất hiện; danh sách hàng 5–10 huyết thanh', () => {
    const seen = new Set<string>()
    let rng = createRng(3)
    for (let i = 0; i < 100; i++) {
      let stock: Serum[]
      ;[stock, rng] = rollLabStock(data, rng, 1)
      expect(stock.length).toBeGreaterThanOrEqual(5)
      expect(stock.length).toBeLessThanOrEqual(10)
      for (const serum of stock) seen.add(serum.tierId)
    }
    expect([...seen].sort()).toEqual(
      ['common', 'epic', 'greaterMutagen', 'mutagen', 'rare', 'uncommon'].sort()
    )
  })

  it('scale theo tầng: khoảng × geneGrowthPerFloor^(tầng − 1), số cực lớn vẫn nguyên', () => {
    const growth = {
      ...data,
      config: { ...data.config, floors: { ...data.config.floors, geneGrowthPerFloor: 1.5 } }
    }
    const onlyEpic = {
      ...growth,
      config: {
        ...growth.config,
        implant: { ...growth.config.implant, tiers: [flatTier('epic')] }
      }
    }
    const [serum] = rollSerum(onlyEpic, createRng(1), 3)
    const tier = flatTier('epic')
    for (const value of flatAmounts(serum)) {
      expect(value.gte(Math.floor(tier.min * 2.25))).toBe(true)
      expect(value.lte(Math.floor(tier.max * 2.25))).toBe(true)
    }
    const [huge] = rollSerum(onlyEpic, createRng(1), 2000)
    for (const value of flatAmounts(huge)) {
      expect(value.isInteger() && value.gt(1e300)).toBe(true)
    }
  })

  it('đổi hàng: tới ngày thì random lại, đổi tiếp sau restockDays; chưa tới thì giữ', () => {
    const state = labState([hero()])
    expect(restockLab(data, state, 9)).toBe(state)
    const restocked = restockLab(data, state, 10)
    expect(restocked.lab.restockDay).toBe(20)
    expect(restocked.lab.stock).not.toEqual(state.lab.stock)
    // Việc theo ngày: qua ngày 10 thì đổi hàng.
    const later = advanceTime(data, { ...state, time: 9 * 24 }, 24)
    expect(later.lab.restockDay).toBe(20)
  })

  it('game mới có hàng ngay, hợp lệ', () => {
    const state = createNewGame(data, {
      seed: 99,
      starterSpeciesId: 'twig',
      gender: 'male',
      nickname: null
    })
    expect(state.lab.stock.length).toBeGreaterThanOrEqual(5)
    expect(state.lab.restockDay).toBeGreaterThan(0)
    expect(validateGameState(data, state)).toEqual([])
  })
})

describe('cấy ghép', () => {
  it('thành công: cộng mọi chỉ số của huyết thanh, +1 lần cấy, trả giá × highestFloor', () => {
    const state = { ...labState([hero()]), highestFloor: 1 }
    const next = implant(sure, state)
    const monster = heroOf(next)
    expect(bonus(monster)).toMatchObject({ attack: 25, speed: 20, hp: 0 })
    expect(monster.implantAttempts).toBe(1)
    expect(monster.implantFails).toBe(0)
    expect(next.money.toNumber()).toBe(1e6 - 2000)
    expect(monster.history?.milestones.at(-1)).toMatchObject({ kind: 'implanted', tierId: 'rare' })
    // Huyết thanh dùng không giới hạn số lần.
    expect(next.lab.stock).toEqual(state.lab.stock)
    expect(bonus(heroOf(implant(sure, next)))).toMatchObject({ attack: 50, speed: 40 })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('giá nhân tầng cao nhất, không tăng theo số lần đã cấy', () => {
    expect(implantCost(data, 7, rare).toNumber()).toBe(14000)
    const state = {
      ...atFloor(labState([hero({ implantAttempts: 5 })]), 7),
      location: { type: 'town' as const }
    }
    expect(implant(sure, state).money.toNumber()).toBe(1e6 - 14000)
  })

  it('thất bại: trừ đúng lượng định cộng, +1 thất bại, vẫn mất tiền', () => {
    const next = implant(doomed, labState([hero()]))
    const monster = heroOf(next)
    expect(bonus(monster)).toMatchObject({ attack: -25, speed: -20, hp: 0 })
    expect(monster.implantAttempts).toBe(1)
    expect(monster.implantFails).toBe(1)
    expect(next.money.toNumber()).toBe(1e6 - 2000)
    expect(monster.history?.milestones.at(-1)).toMatchObject({
      kind: 'implantFailed',
      tierId: 'rare',
      fails: 1
    })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('thất bại lần thứ 3: quái chết hẳn, để lại hồn phách cause implant, đồ về túi', () => {
    const state = labState([
      hero({ implantFails: 2, implantAttempts: 4 }),
      makeMonster({ id: 'b' })
    ])
    const next = implant(doomed, state)
    expect(next.party.map((m) => m.id)).toEqual(['b'])
    const soul = defined(next.inventory.souls.at(-1))
    expect(soul.id).toBe('a')
    expect(soul.history?.milestones.at(-1)).toMatchObject({ kind: 'died', cause: 'implant' })
    expect(soul.history?.milestones.at(-2)).toMatchObject({ kind: 'implantFailed', fails: 3 })
    expect(next.tamer.woundUntilDay).toBeNull()
    expect(validateGameState(data, next)).toEqual([])
  })

  it('bản mệnh chết vì cấy ghép: ngự thú sư bị đạo thương', () => {
    const state = labState(
      [hero({ implantFails: 2, implantAttempts: 2, bond: true }), makeMonster({ id: 'b' })],
      []
    )
    const next = implant(doomed, { ...state, tamer: { ...state.tamer, bondDay: 0 } })
    expect(next.tamer.woundUntilDay).toBe(data.config.bond.woundDays - 1)
  })

  it('quái trong kho cấy được; quái cuối cùng của đội không được liều mạng', () => {
    const stored = labState(
      [makeMonster({ id: 'b' })],
      [hero({ implantFails: 2, implantAttempts: 2 })]
    )
    expect(implant(doomed, stored).storage).toEqual([])
    const alone = labState([hero({ implantFails: 2, implantAttempts: 2 })])
    expectActionError(() => implant(doomed, alone), 'partyWouldBeEmpty')
    // Quái khóa không được liều mạng (docs/rules/roster.md); còn thất bại được thì vẫn cấy.
    const locked = labState(
      [makeMonster({ id: 'b' })],
      [hero({ implantFails: 2, implantAttempts: 2, locked: true })]
    )
    expectActionError(() => implant(doomed, locked), 'monsterLocked')
    const safe = labState(
      [makeMonster({ id: 'b' })],
      [hero({ implantFails: 1, implantAttempts: 1, locked: true })]
    )
    expect(implant(doomed, safe).storage).toHaveLength(1)
    // Chưa tới lần thất bại cuối thì quái duy nhất vẫn cấy được.
    expect(
      heroOf(implant(doomed, labState([hero({ implantFails: 1, implantAttempts: 1 })])))
        .implantFails
    ).toBe(2)
  })

  it('tỉ lệ: 90 × 0,9^(số lần đã cấy), cùng mọi bậc; hiện ở MonsterView', () => {
    expect(implantChance(data, hero())).toBeCloseTo(90)
    expect(implantChance(data, hero({ implantAttempts: 4 }))).toBeCloseTo(90 * 0.9 ** 4)
    expect(implantChance(data, hero({ implantAttempts: 1e6 }))).toBe(0)
    const monster = hero({
      implantAttempts: 2,
      implantFails: 1,
      implantBonusStats: { hp: 0, attack: 5, defense: 0, spAttack: 0, spDefense: 0, speed: -3 }
    })
    const view = defined(getMonsterView(data, makeGameState({ seed: 1, party: [monster] }), 'a'))
    expect(view.implant).toMatchObject({ attempts: 2, fails: 1, maxFails: 3 })
    expect(view.implant.nextChance).toBeCloseTo(72.9)
    expect(view.implant.bonusStats.speed.toNumber()).toBe(-3)
  })

  it('báo lỗi, state giữ nguyên: sai huyết thanh, không có quái, bận, thiếu tiền, ngoài thị trấn', () => {
    const state = labState([hero()], [], 100)
    expectActionError(() => implant(sure, labState([hero()]), 'a', 1), 'serumNotFound', {
      serumIndex: 1
    })
    expectActionError(() => implant(sure, labState([hero()]), 'a', -1), 'serumNotFound')
    expectActionError(() => implant(sure, labState([hero()]), 'a', 0.5), 'malformedAction')
    expectActionError(() => implant(sure, labState([hero()]), 'zz'), 'monsterNotOwned')
    const busy = labState([
      hero({ assignment: { kind: 'expedition', id: 'x1' } }),
      makeMonster({ id: 'b' })
    ])
    expectActionError(() => implant(sure, busy), 'monsterBusy')
    expectActionError(() => implant(sure, state), 'notEnoughMoney')
    expect(heroOf(state).implantAttempts).toBe(0)
    expectActionError(() => implant(sure, atFloor(labState([hero()]), 1)), 'notInTown')
    const inBattle = {
      ...makeBattleState([hero()], [makeMonster({ id: 'w' })]),
      lab: { stock: [rare], restockDay: 10 }
    }
    expectActionError(() => implant(sure, inBattle), 'inBattle')
  })
})

describe('huyết thanh hiệu ứng', () => {
  const effectState = (monster: Monster): GameState => ({
    ...labState([monster]),
    lab: { stock: [mutagen], restockDay: 10 }
  })

  it('thành công +cấp, thất bại −cấp (hiệu ứng ngược), về 0 thì bỏ khỏi quái', () => {
    const up = heroOf(implant(sure, effectState(hero())))
    expect(up.implantEffects).toEqual({ hardening: 1 })
    expect(bonus(up)).toMatchObject({ hp: 0, attack: 0 })
    expect(up.history?.milestones.at(-1)).toMatchObject({ kind: 'implanted', tierId: 'mutagen' })
    const down = heroOf(implant(doomed, effectState(hero())))
    expect(down.implantEffects).toEqual({ hardening: -1 })
    expect(down.implantFails).toBe(1)
    const cancelled = heroOf(
      implant(doomed, effectState(hero({ implantEffects: { hardening: 1 } })))
    )
    expect(cancelled.implantEffects).toEqual({})
    // Chung bộ đếm lần cấy với huyết thanh cộng chỉ số.
    expect(cancelled.implantAttempts).toBe(1)
    expect(validateGameState(data, implant(doomed, effectState(hero())))).toEqual([])
  })

  it('MonsterView hiện cấp hiệu ứng; fuse giữ của quái gốc; breeding không truyền', () => {
    const monster = hero({ implantEffects: { regeneration: 2, hardening: -1 } })
    const view = defined(getMonsterView(data, makeGameState({ seed: 1, party: [monster] }), 'a'))
    expect(view.implant.effects).toEqual({ regeneration: 2, hardening: -1 })
    const sub = makeMonster({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      implantEffects: { hardening: 5 }
    })
    const [fused] = fuseMonsters(data, createRng(1), monster, sub)
    expect(fused.implantEffects).toEqual({ regeneration: 2, hardening: -1 })
    const father = makeMonster({ id: 'f', gender: 'male', implantEffects: { regeneration: 3 } })
    const mother = makeMonster({ id: 'm', gender: 'female' })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'kid')
    expect(child.implantEffects).toEqual({})
  })
})

describe('cấy ghép trong chỉ số', () => {
  it('cộng cùng chỗ với gen, không nhân geneWeight, trước race / level', () => {
    const plain = hero()
    const implanted = hero({
      implantBonusStats: { hp: 0, attack: 7, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }
    })
    const geneEquivalent = hero({
      genes: {
        hp: 10,
        attack: 10 + 7 / data.config.geneWeight,
        defense: 10,
        spAttack: 10,
        spDefense: 10,
        speed: 10
      }
    })
    const attack = (monster: Monster): number => computeStats(data, monster).final.attack.toNumber()
    expect(attack(implanted)).toBeGreaterThan(attack(plain))
    expect(attack(implanted)).toBe(attack(geneEquivalent))
  })

  it('âm cực lớn: bước gốc tối thiểu 1, không ra NaN / âm', () => {
    const crushed = hero({
      implantBonusStats: {
        hp: -1e300,
        attack: -1e300,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0
      }
    })
    const stats = computeStats(data, crushed)
    expect(stats.base.attack.toNumber()).toBe(data.races[crushed.raceId].statBias.attack)
    expect(getMaxHp(data, crushed).gte(1)).toBe(true)
  })

  it('fuse: quái gốc giữ cấy ghép của mình; breeding: con không có', () => {
    const base = hero({
      implantAttempts: 3,
      implantFails: 1,
      implantBonusStats: { hp: 4, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }
    })
    const sub = makeMonster({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      implantAttempts: 2,
      implantFails: 2,
      implantBonusStats: { hp: 0, attack: 50, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }
    })
    const [fused] = fuseMonsters(data, createRng(1), base, sub)
    expect(fused.implantAttempts).toBe(3)
    expect(fused.implantFails).toBe(1)
    expect(bonus(fused)).toMatchObject({ hp: 4, attack: 0 })
    const father = makeMonster({ id: 'f', gender: 'male', implantAttempts: 2, implantFails: 1 })
    const mother = makeMonster({
      id: 'm',
      gender: 'female',
      implantBonusStats: { hp: 9, attack: 9, defense: 9, spAttack: 9, spDefense: 9, speed: 9 }
    })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'kid')
    expect(child.implantAttempts).toBe(0)
    expect(child.implantFails).toBe(0)
    expect(Object.values(child.implantBonusStats).every((v) => v.eq(BIG_ZERO))).toBe(true)
  })
})

describe('save', () => {
  it('kiểm tra quái: số lần nguyên ≥ 0, thất bại ≤ số lần và < maxFails, chỉ số hữu hạn', () => {
    const issues = (overrides: MonsterOverrides): string =>
      validateMonster(data, hero(overrides)).join()
    expect(issues({ implantAttempts: -1 })).toMatch(/implantAttempts/)
    expect(issues({ implantAttempts: 1, implantFails: 2 })).toMatch(/implantFails/)
    expect(issues({ implantAttempts: 5, implantFails: 3 })).toMatch(/implantFails/)
    expect(
      validateMonster(data, {
        ...hero(),
        implantBonusStats: { ...hero().implantBonusStats, hp: toBig(NaN) }
      }).join()
    ).toMatch(/implantBonusStats/)
    expect(validateMonster(data, hero({ implantAttempts: 9, implantFails: 2 }))).toEqual([])
  })

  it('kiểm tra Phòng Thí Nghiệm: bậc tồn tại, hiệu ứng đúng loại / số lượng / khoảng của bậc', () => {
    const check = (stock: unknown[]): string =>
      validateGameState(data, { ...labState([hero()]), lab: { stock, restockDay: 0 } }).join()
    const flat = (stat: string, amount: number): unknown => ({
      kind: 'flatStat',
      stat,
      amount: toBig(amount)
    })
    expect(check([rare, mutagen])).toBe('')
    expect(check([{ ...rare, tierId: 'mythic' }])).toMatch(/bậc huyết thanh/)
    expect(check([{ tierId: 'rare', effects: [flat('attack', 5)] }])).toMatch(/đúng 2 chỉ số/)
    expect(check([{ tierId: 'common', effects: [flat('attack', 0)] }])).toMatch(/nguyên ≥ 1/)
    expect(check([{ tierId: 'common', effects: [flat('luck', 5)] }])).toMatch(/luck/)
    expect(check([{ tierId: 'rare', effects: [flat('attack', 5), flat('attack', 6)] }])).toMatch(
      /bị trùng/
    )
    expect(check([{ tierId: 'common', effects: mutagen.effects }])).toMatch(/flatStat/)
    const effect = (effectId: string, levels: number): unknown => ({
      tierId: 'mutagen',
      effects: [{ kind: 'hookEffect', effectId, levels }]
    })
    expect(check([effect('nope', 1)])).toMatch(/hiệu ứng không tồn tại/)
    expect(check([effect('hardening', 2)])).toMatch(/levels phải bằng 1/)
  })

  it('kiểm tra quái: hiệu ứng cấy tồn tại, cấp nguyên khác 0', () => {
    const issues = (implantEffects: Record<string, number>): string =>
      validateMonster(data, hero({ implantEffects })).join()
    expect(issues({ hardening: -2, regeneration: 3 })).toBe('')
    expect(issues({ nope: 1 })).toMatch(/hiệu ứng không tồn tại/)
    expect(issues({ hardening: 0 })).toMatch(/khác 0/)
    expect(issues({ hardening: 1.5 })).toMatch(/khác 0/)
  })

  it('lưu / đọc giữ huyết thanh và cấy ghép (Decimal), migrate v75 → v76 đặt 0', () => {
    const state = implant(doomed, labState([hero()]))
    const reloaded = migrateState(serializeState(state), data)
    expect(bonus(heroOf(reloaded))).toMatchObject({ attack: -25 })
    expect(flatAmounts(reloaded.lab.stock[0])[0].toNumber()).toBe(25)
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const {
        implantBonusStats: _b,
        implantEffects: _e,
        implantAttempts: _a,
        implantFails: _f,
        ...rest
      } = monster as Record<string, unknown>
      return rest
    }
    const { lab: _lab, ...withoutLab } = raw
    const old = { ...withoutLab, version: 75, party: (raw.party as unknown[]).map(strip) }
    const migrated = migrateState(old, data)
    expect(migrated.party[0].implantAttempts).toBe(0)
    expect(migrated.party[0].implantEffects).toEqual({})
    expect(migrated.lab).toEqual({ stock: [], restockDay: 0 })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('dữ liệu', () => {
  it('kiểm tra config.implant: bậc theo loại, khoảng, số hàng, tỉ lệ', () => {
    const common = flatTier('common')
    expect(
      dataIssuesAfter((raw) => {
        raw.config.implant = {
          ...raw.config.implant,
          tiers: [
            { ...common, min: 10, max: 5 },
            { ...common, statCount: 7, weight: 0 },
            { id: 'odd', kind: 'mystery', weight: 1, price: 1 } as unknown as FlatStatSerumTier,
            { id: 'shot', kind: 'hookEffect', levels: 0, weight: 1, price: 1 },
            { ...common, id: 'extra', levels: 1 } as FlatStatSerumTier
          ],
          stockMin: 4,
          stockMax: 3,
          chanceFalloff: 1.5,
          maxFails: 0
        }
      })
    ).toEqual([
      'config.implant.tiers[0]: min (10) lớn hơn max (5)',
      `config.implant.tiers[1].id bị trùng "common"`,
      expect.stringContaining('config.implant.tiers[1].weight'),
      'config.implant.tiers[1].statCount không được vượt 6 chỉ số',
      'config.implant.tiers[2].kind không hợp lệ "mystery"',
      'config.implant.tiers[3].levels phải là số nguyên ≥ 1, nhận 0',
      expect.stringContaining('levels'),
      'config.implant: stockMin (4) lớn hơn stockMax (3)',
      expect.stringContaining('config.implant.chanceFalloff'),
      'config.implant.maxFails phải là số nguyên ≥ 1, nhận 0'
    ])
    expect(dataIssuesAfter((raw) => void (raw.config.implant.tiers = []))).toEqual([
      'config.implant.tiers phải là danh sách bậc khác rỗng'
    ])
  })

  it('kiểm tra serumEffects.json: trọng số > 0, hook / hook ngược khác rỗng và đúng tham số', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.serumEffects = [
          {
            id: 'a',
            weight: 0,
            hooks: [],
            failHooks: [{ type: 'regen', params: { percent: -1 } }]
          },
          { id: 'b', weight: 1, hooks: [{ type: 'regen', params: {} }], failHooks: [] }
        ]
      },
      { regenerateText: true }
    )
    expect(issues).toEqual([
      expect.stringContaining('"a": weight'),
      expect.stringContaining('"a": hooks phải là danh sách hook khác rỗng'),
      expect.stringContaining('"b" (hooks)'),
      expect.stringContaining('"b": failHooks phải là danh sách hook khác rỗng')
    ])
  })
})
