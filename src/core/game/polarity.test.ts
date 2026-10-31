// Âm / Dương hóa (docs/rules/polarity.md): % chỉ số theo cực, trait cực tính (không chiếm ô, cấp 1),
// tương khắc trong sát thương, đá chuyển cực, quái hoang / boss theo tầng mở khóa, đá rơi từ boss,
// breeding / trứng boss / fuse / tiến hóa, MonsterView, kiểm tra dữ liệu / quái, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'
import { computeDamage } from '../battle'
import { getItemCount } from '../inventory'
import {
  changePolarity,
  childPolarity,
  computeStats,
  getMaxHp,
  isStatusImmune,
  rollSpawnPolarity,
  validateMonster
} from '../monster'
import { createBossEgg, evolveMonster, fuseMonsters, makeOffspring } from '../progression'
import { polarityDamageMultiplier } from '../registries'
import { getMonsterView } from '../roster'
import { createRng } from '../shared'
import { generateBoss, generateFloorBoss, generateWildMonster } from '../world'
import {
  FIXTURE_POLARITY_STONE_IDS,
  FIXTURE_YANG_TRAIT_IDS,
  FIXTURE_YIN_TRAIT_IDS,
  dataIssuesAfter,
  defined,
  expectActionError,
  fixtureSite,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  uniformStats,
  type MonsterOverrides
} from '../testing'
import type {
  GameAction,
  GameData,
  GameState,
  Monster,
  MonsterPolarity,
  PolarityConfig
} from '../model'

const data = makeData()

/** Dữ liệu với config.polarity đổi một phần (fixture mặc định tỉ lệ 0, không đồ rơi). */
const withPolarity = (patch: Partial<PolarityConfig>): GameData => ({
  ...data,
  config: { ...data.config, polarity: { ...data.config.polarity, ...patch } }
})

const yin = (traitId = FIXTURE_YIN_TRAIT_IDS[0]): MonsterPolarity => ({ pole: 'yin', traitId })
const yang = (traitId = FIXTURE_YANG_TRAIT_IDS[0]): MonsterPolarity => ({ pole: 'yang', traitId })

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 20, skillIds: ['strike'], ...overrides })

describe('hiệu ứng chỉ số', () => {
  it('Dương: +10% công / đặc công, +5% tốc độ; Âm: +10% thủ / thủ đặc biệt, +5% HP', () => {
    expect(computeStats(data, hero({ polarity: yang() })).percentBySource.polarity).toEqual({
      hp: 0,
      attack: 10,
      defense: 0,
      spAttack: 10,
      spDefense: 0,
      speed: 5
    })
    expect(computeStats(data, hero({ polarity: yin() })).percentBySource.polarity).toEqual({
      hp: 5,
      attack: 0,
      defense: 10,
      spAttack: 0,
      spDefense: 10,
      speed: 0
    })
    const none = computeStats(data, hero()).percentBySource.polarity
    expect(Object.values(none).every((percent) => percent === 0)).toBe(true)
  })

  it('Âm tăng max HP; số cực lớn vẫn hữu hạn', () => {
    const plain = hero({ genes: uniformStats(1e300) })
    const shifted = { ...plain, polarity: yin() }
    expect(getMaxHp(data, shifted).gt(getMaxHp(data, plain))).toBe(true)
    expect(getMaxHp(data, shifted).isFinite()).toBe(true)
  })
})

describe('trait cực tính', () => {
  it('tác dụng như trait (nhóm % traits), luôn cấp 1, không chiếm ô', () => {
    const monster = hero({ polarity: yin(FIXTURE_YIN_TRAIT_IDS[1]) })
    // yinShell: +20% HP qua hook, nhóm traits; cực Âm +5% HP ở nguồn polarity.
    const breakdown = computeStats(data, monster)
    expect(breakdown.percentBySource.traits.hp).toBe(20)
    expect(breakdown.percentBySource.polarity.hp).toBe(5)
    expect(isStatusImmune(data, hero({ polarity: yin() }), 'sleep')).toBe(true)
    expect(isStatusImmune(data, hero(), 'sleep')).toBe(false)
    // Đủ ô trait thường vẫn hợp lệ: trait cực tính không tính ô.
    const full = hero({
      traitSlots: 3,
      traits: [
        { id: 'fast', level: 1 },
        { id: 'armored', level: 1 },
        { id: 'mighty', level: 1 }
      ],
      polarity: yang()
    })
    expect(validateMonster(data, full)).toEqual([])
  })

  it('không được lưu trong traits', () => {
    const stored = hero({ traits: [{ id: FIXTURE_YIN_TRAIT_IDS[0], level: 1 }] })
    expect(validateMonster(data, stored).join()).toMatch(/không được lưu trong traits/)
  })
})

describe('âm dương tương khắc', () => {
  const strong = (polarity: MonsterPolarity | null, id: string): Monster =>
    makeMonster({ id, genes: uniformStats(1e6), polarity })
  const damageWith = (gameData: GameData, attacker: Monster, defender: Monster): number =>
    computeDamage({
      data: gameData,
      attacker,
      defender,
      skill: gameData.skills.strike,
      spread: false,
      rng: createRng(1)
    }).damage.toNumber()

  it('khác cực +opposeBonus %; cùng cực / không cực thì 1', () => {
    expect(polarityDamageMultiplier(data, { polarity: yin() }, { polarity: yang() })).toBe(1.1)
    expect(polarityDamageMultiplier(data, { polarity: yang() }, { polarity: yin() })).toBe(1.1)
    expect(polarityDamageMultiplier(data, { polarity: yin() }, { polarity: yin() })).toBe(1)
    expect(polarityDamageMultiplier(data, { polarity: null }, { polarity: yang() })).toBe(1)
    expect(polarityDamageMultiplier(data, { polarity: yin() }, { polarity: null })).toBe(1)
  })

  it('trong công thức sát thương', () => {
    const attacker = strong(yin(), 'atk')
    const defender = strong(yang(), 'def')
    const noBonus = withPolarity({ opposeBonus: 0 })
    const base = damageWith(noBonus, attacker, defender)
    expect(base).toBeGreaterThan(1e5)
    expect(damageWith(data, attacker, defender) / base).toBeCloseTo(1.1, 4)
    const sameSide = strong(yin(), 'def')
    expect(damageWith(data, attacker, sameSide)).toBe(damageWith(noBonus, attacker, sameSide))
  })
})

describe('đá chuyển cực', () => {
  const stateWith = (polarity: MonsterPolarity | null, itemId: string): GameState => ({
    ...makeGameState({ seed: 3, party: [hero({ polarity })] }),
    inventory: makeInventory({ [itemId]: 2 })
  })
  const use = (itemId: string): GameAction => ({ type: 'useItem', itemId, monsterId: 'a' })
  const stones = FIXTURE_POLARITY_STONE_IDS

  it('Âm / Dương Thạch: quái không cực nhận cực, trait trong pool của cực, tiêu một đá', () => {
    const toYin = gameReducer(data, stateWith(null, stones.yin), use(stones.yin))
    const polarity = defined(toYin.party[0].polarity)
    expect(polarity.pole).toBe('yin')
    expect(FIXTURE_YIN_TRAIT_IDS).toContain(polarity.traitId)
    expect(getItemCount(toYin.inventory, stones.yin)).toBe(1)
    const toYang = gameReducer(data, stateWith(null, stones.yang), use(stones.yang))
    expect(toYang.party[0].polarity).toEqual(yang())
    // Tất định theo seed.
    expect(gameReducer(data, stateWith(null, stones.yin), use(stones.yin)).party).toEqual(
      toYin.party
    )
  })

  it('Hoán Cực Thạch đảo cực (trait random lại); Quy Nguyên Thạch về không cực', () => {
    const swapped = gameReducer(data, stateWith(yin(), stones.swap), use(stones.swap))
    expect(swapped.party[0].polarity).toEqual(yang())
    const back = gameReducer(data, stateWith(yang(), stones.swap), use(stones.swap))
    expect(defined(back.party[0].polarity).pole).toBe('yin')
    const cleared = gameReducer(data, stateWith(yin(), stones.clear), use(stones.clear))
    expect(cleared.party[0].polarity).toBeNull()
  })

  it('lỗi không có tác dụng (không mất đá, state giữ nguyên)', () => {
    const cases: [MonsterPolarity | null, string][] = [
      [yin(), stones.yin],
      [yang(), stones.yin],
      [yin(), stones.yang],
      [null, stones.swap],
      [null, stones.clear]
    ]
    for (const [polarity, itemId] of cases) {
      const state = stateWith(polarity, itemId)
      expectActionError(() => gameReducer(data, state, use(itemId)), 'itemNoEffect', {
        itemId,
        monsterId: 'a'
      })
      expect(getItemCount(state.inventory, itemId)).toBe(2)
    }
  })

  it('không đổi được thì không tốn RNG', () => {
    const rng = createRng(9)
    expect(changePolarity(data, rng, hero({ polarity: yin() }), 'yang')).toEqual([null, rng])
    expect(changePolarity(data, rng, hero(), 'clear')).toEqual([null, rng])
  })
})

describe('quái hoang / boss có sẵn cực', () => {
  const always = withPolarity({ wildChance: 100, bossChance: 100 })

  it('dưới tầng mở khóa hoặc tỉ lệ 0: không cực, không tốn RNG', () => {
    const rng = createRng(4)
    const monster = hero()
    expect(rollSpawnPolarity(always, rng, monster, { floor: 29, chance: 100 })).toEqual([
      monster,
      rng
    ])
    expect(rollSpawnPolarity(always, rng, monster, { floor: 30, chance: 0 })).toEqual([
      monster,
      rng
    ])
  })

  it('từ tầng mở khóa: quái hoang theo wildChance, boss / boss tầng theo bossChance', () => {
    const below = generateWildMonster(always, createRng(2), fixtureSite(always, 29), 'w')[0]
    expect(below.polarity).toBeNull()
    const wild = generateWildMonster(always, createRng(2), fixtureSite(always, 30), 'w')[0]
    const polarity = defined(wild.polarity)
    expect([...FIXTURE_YIN_TRAIT_IDS, ...FIXTURE_YANG_TRAIT_IDS]).toContain(polarity.traitId)
    expect(validateMonster(always, wild)).toEqual([])
    // Boss: chỉ tỉ lệ boss có tác dụng.
    const bossOnly = withPolarity({ wildChance: 0, bossChance: 100 })
    const lairSite = fixtureSite(bossOnly, 30, ['lair'])
    expect(generateWildMonster(bossOnly, createRng(2), lairSite, 'w')[0].polarity).toBeNull()
    expect(generateFloorBoss(bossOnly, createRng(2), lairSite, 'b')[0].polarity).not.toBeNull()
    if (lairSite.biome.bosses.some((boss) => boss.weight !== undefined)) {
      expect(generateBoss(bossOnly, createRng(2), lairSite, 'b')[0].polarity).not.toBeNull()
    }
  })

  it('cả Âm lẫn Dương đều ra được', () => {
    const poles = new Set(
      Array.from({ length: 20 }, (_, seed) => {
        const [monster] = rollSpawnPolarity(always, createRng(seed), hero(), {
          floor: 30,
          chance: 100
        })
        return monster.polarity?.pole
      })
    )
    expect(poles).toEqual(new Set(['yin', 'yang']))
  })
})

describe('đá rơi từ boss', () => {
  const drops = withPolarity({
    bossDrops: [{ itemId: FIXTURE_POLARITY_STONE_IDS.yin, chance: 100 }]
  })
  const winAt = (floor: number, isBoss: boolean): GameState => {
    const enemy = makeMonster({ id: 'e', skillIds: ['idle'] })
    const dying = { ...enemy, damageTaken: getMaxHp(drops, enemy).minus(1) }
    const state = makeBattleState([hero({ level: 50 })], [dying], { isBoss, floor })
    return gameReducer(drops, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
    })
  }

  it('boss từ tầng mở khóa rơi đá; tầng thấp hơn / trận thường thì không', () => {
    const won = winAt(30, true)
    expect(won.battle?.outcome).toBe('won')
    expect(getItemCount(won.inventory, FIXTURE_POLARITY_STONE_IDS.yin)).toBe(1)
    expect(getItemCount(winAt(29, true).inventory, FIXTURE_POLARITY_STONE_IDS.yin)).toBe(0)
    expect(getItemCount(winAt(30, false).inventory, FIXTURE_POLARITY_STONE_IDS.yin)).toBe(0)
  })
})

describe('breeding / trứng boss / fuse / tiến hóa', () => {
  const father = (polarity: MonsterPolarity | null): Monster =>
    hero({ id: 'f', gender: 'male', polarity })
  const mother = (polarity: MonsterPolarity | null): Monster =>
    hero({ id: 'm', gender: 'female', polarity })

  it('bố mẹ cùng cực: con cùng cực, trait trong pool; khác cực / một bên không cực: không cực', () => {
    const [child] = makeOffspring(data, createRng(1), father(yin()), mother(yin()), 'egg')
    expect(defined(child.polarity).pole).toBe('yin')
    expect(FIXTURE_YIN_TRAIT_IDS).toContain(defined(child.polarity).traitId)
    expect(
      makeOffspring(data, createRng(1), father(yin()), mother(yang()), 'egg')[0].polarity
    ).toBe(null)
    expect(makeOffspring(data, createRng(1), father(null), mother(yang()), 'egg')[0].polarity).toBe(
      null
    )
    const rng = createRng(2)
    expect(childPolarity(data, rng, [father(null), mother(null)])).toEqual([null, rng])
  })

  it('trứng boss theo cực của boss', () => {
    const egg = (polarity: MonsterPolarity | null): Monster =>
      createBossEgg(data, createRng(1), {
        boss: makeMonster({ id: 'boss', polarity }),
        id: 'egg',
        floor: 30,
        aging: false,
        day: 0
      })[0].monster
    expect(egg(yang()).polarity).toEqual(yang())
    expect(egg(null).polarity).toBeNull()
  })

  it('fuse: quái gốc giữ cực và trait cực tính; tiến hóa giữ', () => {
    const sub = makeMonster({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      polarity: yang()
    })
    const base = hero({ polarity: yin(FIXTURE_YIN_TRAIT_IDS[1]) })
    expect(fuseMonsters(data, createRng(1), base, sub)[0].polarity).toEqual(base.polarity)
    expect(fuseMonsters(data, createRng(1), hero(), sub)[0].polarity).toBeNull()
    const { monster: evolved } = evolveMonster(data, hero({ level: 10, polarity: yang() }), {
      toSpeciesId: 'strongling',
      rng: createRng(1),
      day: 0
    })
    expect(evolved.polarity).toEqual(yang())
  })

  it('MonsterView: cực, trait, % đang cộng; không cực thì null', () => {
    const state = makeGameState({ seed: 1, party: [hero({ polarity: yang() })] })
    expect(defined(getMonsterView(data, state, 'a')).polarity).toEqual({
      ...yang(),
      statPercents: { attack: 10, spAttack: 10, speed: 5 }
    })
    const plain = makeGameState({ seed: 1, party: [hero()] })
    expect(defined(getMonsterView(data, plain, 'a')).polarity).toBeNull()
  })
})

describe('kiểm tra dữ liệu / quái / migrate', () => {
  const issues = (edit: (raw: ReturnType<typeof makeRawData>) => void): string =>
    dataIssuesAfter(edit).join('\n')
  const config = (raw: ReturnType<typeof makeRawData>): Record<string, unknown> =>
    raw.config.polarity as unknown as Record<string, unknown>

  it('fixture hợp lệ; config sai bị báo lỗi', () => {
    expect(issues(() => undefined)).toBe('')
    expect(issues((raw) => (config(raw).wildChance = 101))).toMatch(/wildChance/)
    expect(issues((raw) => (config(raw).unlockFloor = 0))).toMatch(/unlockFloor/)
    expect(issues((raw) => (config(raw).opposeBonus = -1))).toMatch(/opposeBonus/)
    expect(issues((raw) => (config(raw).extra = 1))).toMatch(/extra/)
    expect(
      issues((raw) => (config(raw).statPercents = { yin: { luck: 1 }, yang: {}, chaos: {} }))
    ).toMatch(/chaos[\s\S]*luck/)
    expect(issues((raw) => (config(raw).traitIds = { yin: [], yang: ['swift'] }))).toMatch(
      /traitIds\.yin[\s\S]*swift/
    )
    expect(issues((raw) => (config(raw).bossDrops = [{ itemId: 'nothing', chance: 1 }]))).toMatch(
      /nothing/
    )
  })

  it('trait cực tính không nằm trong pool / có exclusiveGroup bị báo lỗi', () => {
    expect(
      issues((raw) => {
        const polarity = raw.config.polarity
        polarity.traitIds = { ...polarity.traitIds, yin: [FIXTURE_YIN_TRAIT_IDS[0]] }
      })
    ).toMatch(new RegExp(`${FIXTURE_YIN_TRAIT_IDS[1]}.*traitIds`))
    expect(
      issues((raw) => {
        const trait = defined(raw.traits.find((t) => t.id === FIXTURE_YANG_TRAIT_IDS[0]))
        trait.exclusiveGroup = 'x'
      })
    ).toMatch(/exclusiveGroup/)
    expect(
      issues((raw) => {
        const stone = defined(raw.items.find((i) => i.id === FIXTURE_POLARITY_STONE_IDS.yin))
        if (stone.category === 'consumable') stone.effects = [{ type: 'setPolarity', params: {} }]
      })
    ).toMatch(/change/)
  })

  it('polarity trên quái sai bị báo lỗi', () => {
    const bad = (polarity: unknown): string =>
      validateMonster(data, { ...hero(), polarity } as Monster).join()
    expect(bad({ pole: 'chaos', traitId: FIXTURE_YIN_TRAIT_IDS[0] })).toMatch(/polarity\.pole/)
    expect(bad({ pole: 'yin', traitId: 'swift' })).toMatch(/polarity\.traitId/)
    expect(bad({ pole: 'yin' })).toMatch(/polarity/)
    expect(bad(undefined)).toMatch(/polarity/)
  })

  it('migrate v73 → v74: mọi quái không cực', () => {
    const state = makeGameState({ seed: 1, party: [hero({ polarity: yin() })] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { polarity: _polarity, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const old = { ...raw, version: 73, party: (raw.party as unknown[]).map(strip) }
    const migrated = migrateState(old, data)
    expect(migrated.party[0].polarity).toBeNull()
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
