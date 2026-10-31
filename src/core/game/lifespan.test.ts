// Luồng game của tuổi và thọ nguyên (mục "Tuổi và thọ nguyên" ở lifespan.md): giờ theo action,
// breed, fuse, Thọ Nguyên Đan, cửa hàng / đồ rơi theo tùy chọn, EXP theo tuổi, tuổi khi xuất hiện,
// game mới, MonsterView, kiểm tra save, migrate v23 → v24, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createRng, toBig } from '../shared'
import { getMaxHp } from '../monster'
import { ageDaysAtPercent, lifespanYears } from '../registries'
import { breedBlocker, fuseMonsters, makeOffspring } from '../progression'
import { rollShopStock } from '../shop'
import { generateFloorBoss, generateWildMonster } from '../world'
import { getMonsterView } from '../roster'
import type { GameAction, GameState, Monster } from '../model'
import {
  agingMonster,
  dataIssuesAfter,
  defined,
  fixtureSite,
  lifespanState,
  makeBattleState,
  makeInventory,
  makeLifespanData,
  makeMonster
} from '../testing'
import { gameReducer, SAVE_VERSION } from './reducer'
import { createNewGame } from './newGame'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'

const data = makeLifespanData()
const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

describe('thời gian theo action', () => {
  const ended = (isBoss: boolean): GameState =>
    makeBattleState([makeMonster()], [makeMonster({ id: 'w1' })], {
      phase: 'ended',
      outcome: 'won',
      isBoss
    })

  it('rời trận: quái hoang 2 giờ, boss 4 giờ; trận chưa xong thì lỗi, giờ giữ nguyên', () => {
    expect(run(ended(false), { type: 'leaveBattle' }).time).toBe(2)
    expect(run(ended(true), { type: 'leaveBattle' }).time).toBe(4)
    const ongoing = makeBattleState([makeMonster()], [makeMonster({ id: 'w1' })])
    expect(() => run(ongoing, { type: 'leaveBattle' })).toThrow()
  })

  it('đi lại 1 giờ (đứng yên ở thị trấn thì không), hồi máu 1 giờ, nghỉ ngủ tới sáng', () => {
    const town = lifespanState({ seed: 1, party: [agingMonster(data, 50)], money: 1000 })
    expect(run(town, { type: 'travel', to: { type: 'floor', floor: 1 } }).time).toBe(1)
    expect(run(town, { type: 'travel', to: { type: 'town' } })).toBe(town)
    const hurt = { ...town, party: [{ ...town.party[0], damageTaken: toBig(5) }] }
    expect(run(hurt, { type: 'healParty' }).time).toBe(1)
    const night = { ...hurt, time: 23 }
    const rested = run(night, { type: 'rest' })
    expect(rested.time).toBe(24 + 6)
    // Qua nửa đêm: quái già thêm một ngày.
    expect(rested.party[0].ageDays).toBe(hurt.party[0].ageDays + 1)
  })

  it('setGameOption thọ nguyên qua reducer', () => {
    const state = lifespanState({ seed: 1, party: [agingMonster(data, 50)] })
    const off = run(state, { type: 'setGameOption', option: 'lifespanEnabled', enabled: false })
    expect(off.options.lifespanEnabled).toBe(false)
    expect(validateGameState(data, off)).toEqual([])
  })
})

describe('breed và fuse theo tuổi', () => {
  const pair = (fatherPercent: number): [Monster, Monster] => [
    agingMonster(data, fatherPercent, { id: 'f', gender: 'male' }),
    agingMonster(data, 50, { id: 'm', gender: 'female' })
  ]

  it('bố / mẹ ấu niên không breed được; tắt thọ nguyên thì không xét tuổi', () => {
    expect(breedBlocker(data, ...pair(5))).toBe('tooYoungToBreed')
    expect(breedBlocker(data, ...pair(10))).toBeNull()
    expect(breedBlocker(data, ...pair(95))).toBeNull()
    const [father, mother] = pair(5)
    expect(breedBlocker(data, { ...father, aging: false }, { ...mother, aging: false })).toBeNull()
  })

  it('con breeding: tuổi 0, level cao nhất 1, cờ aging theo mẹ', () => {
    const [father, mother] = pair(50)
    const [child] = makeOffspring(data, createRng(1), father, mother, 'm9')
    expect(child).toMatchObject({ ageDays: 0, aging: true, maxLevelReached: 1, itemUseCounts: {} })
    expect(child.lifespanBonusYears.eq(0)).toBe(true)
  })

  it('fuse: quái gốc giữ tuổi, hấp thu 25% số năm còn lại của quái phụ; tắt thì không', () => {
    const base = agingMonster(data, 30, { id: 'b' })
    const sub = agingMonster(data, 50, {
      id: 's',
      speciesId: 'twig',
      baseSpeciesId: 'twig'
    })
    const [fused] = fuseMonsters(data, createRng(1), base, sub)
    expect(fused.ageDays).toBe(base.ageDays)
    // Quái phụ thọ 101 năm, đã sống 50,5 năm: còn 50,5 năm → 25% = 12,625.
    expect(fused.lifespanBonusYears.toNumber()).toBe(12.625)
    const [off] = fuseMonsters(data, createRng(1), { ...base, aging: false }, sub)
    expect(off.lifespanBonusYears.toNumber()).toBe(0)
  })
})

describe('Thọ Nguyên Đan', () => {
  const withPills = (lifespanEnabled: boolean): GameState => ({
    ...lifespanState({ seed: 1, party: [agingMonster(data, 50, { aging: lifespanEnabled })] }),
    options: { lifespanEnabled, permadeathEnabled: false },
    inventory: makeInventory({ smallPill: 3 })
  })
  const use: GameAction = { type: 'useItem', itemId: 'smallPill', monsterId: 'm1' }

  it('cộng năm, kháng đan × 0,8 mỗi lần đã dùng đúng loại đan đó', () => {
    const once = run(withPills(true), use)
    expect(once.party[0].lifespanBonusYears.toNumber()).toBe(5)
    expect(once.party[0].itemUseCounts).toEqual({ smallPill: 1 })
    const twice = run(once, use)
    expect(twice.party[0].lifespanBonusYears.toNumber()).toBe(9)
    expect(twice.party[0].itemUseCounts).toEqual({ smallPill: 2 })
    expect(twice.inventory.stacks).toEqual({ smallPill: 1 })
    expect(validateGameState(data, twice)).toEqual([])
  })

  it('tắt thọ nguyên vẫn dùng được (để dành năm cho lúc bật lại)', () => {
    expect(run(withPills(false), use).party[0].lifespanBonusYears.toNumber()).toBe(5)
  })

  it('cửa hàng chỉ bán đan khi bật thọ nguyên', () => {
    const roll = (lifespanEnabled: boolean, seed: number): string[] =>
      rollShopStock(data, createRng(seed), {
        highestFloor: 1,
        nextItemId: 1,
        inventory: makeInventory(),
        options: { lifespanEnabled, permadeathEnabled: false }
      }).stock.flatMap((entry) => (entry.storage === 'stack' ? [entry.itemId] : []))
    const seeds = [1, 2, 3, 4, 5]
    expect(seeds.some((seed) => roll(true, seed).includes('smallPill'))).toBe(true)
    expect(seeds.every((seed) => !roll(false, seed).includes('smallPill'))).toBe(true)
  })

  it('boss rơi đan (boss tầng thêm đan lớn) chỉ khi bật thọ nguyên', () => {
    const boss = makeMonster({
      id: 'boss',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire'],
      level: 4,
      bossMultiplier: 3,
      skillIds: ['idle']
    })
    const hurtBoss = { ...boss, damageTaken: getMaxHp(data, boss).minus(1) }
    const battle = (lifespanEnabled: boolean): GameState => {
      const state = makeBattleState(
        [agingMonster(data, 50, { id: 'a', aging: lifespanEnabled })],
        [hurtBoss],
        {
          floor: 2,
          isBoss: true
        }
      )
      return { ...state, options: { lifespanEnabled, permadeathEnabled: false } }
    }
    const strike = { slot: 0, kind: 'skill', skillId: 'strike' } as const
    const on = run(battle(true), { type: 'submitTurn', commands: [strike] })
    expect(defined(on.battle).outcome).toBe('won')
    expect(on.inventory.stacks).toMatchObject({ smallPill: 1, bigPill: 1 })
    const off = run(battle(false), { type: 'submitTurn', commands: [strike] })
    expect(off.inventory.stacks.smallPill).toBeUndefined()
    expect(off.inventory.stacks.bigPill).toBeUndefined()
  })
})

describe('EXP theo giai đoạn tuổi', () => {
  it('ấu niên +50%, lão niên −30%, thành niên / tắt thọ nguyên như cũ', () => {
    const enemy = makeMonster({ id: 'w1', level: 10, skillIds: ['idle'] })
    const hurtEnemy = { ...enemy, damageTaken: getMaxHp(data, enemy).minus(1) }
    const strike = { slot: 0, kind: 'skill', skillId: 'strike' } as const
    const gained = (monster: Monster): number => {
      const state = {
        ...makeBattleState([{ ...monster, id: 'a' }], [hurtEnemy]),
        options: { lifespanEnabled: monster.aging, permadeathEnabled: false }
      }
      const next = run(state, { type: 'submitTurn', commands: [strike] })
      return next.party[0].exp.minus(monster.exp).toNumber()
    }
    // 0,5 × 10² = 50 EXP.
    expect(gained(makeMonster())).toBe(50)
    expect(gained(agingMonster(data, 50))).toBe(50)
    expect(gained(agingMonster(data, 5))).toBe(75)
    expect(gained(agingMonster(data, 80))).toBe(35)
  })
})

describe('tuổi khi xuất hiện', () => {
  it('quái hoang 10–40%, boss 30–80% thọ nguyên (thọ nguyên boss × bossMultiplier)', () => {
    const site = { ...fixtureSite(data, 2), aging: true }
    let rng = createRng(7)
    for (let i = 0; i < 20; i++) {
      let wild: Monster
      ;[wild, rng] = generateWildMonster(data, rng, { ...fixtureSite(data, 1), aging: true }, 'w')
      expect(wild.aging).toBe(true)
      expect(wild.ageDays).toBeGreaterThanOrEqual(ageDaysAtPercent(data, wild, 10))
      expect(wild.ageDays).toBeLessThanOrEqual(ageDaysAtPercent(data, wild, 40))
      let boss: Monster
      ;[boss, rng] = generateFloorBoss(data, rng, site, 'b')
      expect(boss.ageDays).toBeGreaterThanOrEqual(ageDaysAtPercent(data, boss, 30))
      expect(boss.ageDays).toBeLessThanOrEqual(ageDaysAtPercent(data, boss, 80))
      expect(
        lifespanYears(data, boss).gt(lifespanYears(data, { ...boss, bossMultiplier: 1 }))
      ).toBe(true)
    }
  })

  it('tắt thọ nguyên: giữa khoảng, không tốn thêm RNG', () => {
    const site = fixtureSite(data, 1)
    const [off, rngOff] = generateWildMonster(data, createRng(3), site, 'w')
    const [on, rngOn] = generateWildMonster(data, createRng(3), { ...site, aging: true }, 'w')
    const middle = Math.floor(
      (ageDaysAtPercent(data, off, 10) + ageDaysAtPercent(data, off, 40)) / 2
    )
    expect(off.ageDays).toBe(middle)
    expect({ ...on, ageDays: 0, aging: false }).toEqual({ ...off, ageDays: 0 })
    expect(rngOn).not.toEqual(rngOff)
  })

  it('game mới: chọn bật thọ nguyên thì quái khởi đầu thành niên (10%); mặc định tắt', () => {
    const options = {
      seed: 5,
      starterSpeciesId: 'weakling',
      gender: 'female',
      nickname: null
    } as const
    const game = createNewGame(data, { ...options, lifespanEnabled: true })
    const starter = game.party[0]
    expect(starter.aging).toBe(true)
    expect(starter.ageDays).toBe(ageDaysAtPercent(data, starter, 10))
    expect(game.time).toBe(6)
    expect(game.options).toEqual({ lifespanEnabled: true, permadeathEnabled: false })
    expect(getMonsterView(data, game, starter.id)?.life?.stage).toBe('adult')
    expect(validateGameState(data, game)).toEqual([])
    const off = createNewGame(data, options)
    expect(off.options).toEqual({ lifespanEnabled: false, permadeathEnabled: false })
    expect(off.party[0].aging).toBe(false)
    expect(getMonsterView(data, off, starter.id)?.life).toBeNull()
    expect(validateGameState(data, off)).toEqual([])
  })
})

describe('MonsterView: phần tuổi', () => {
  it('tuổi, thọ nguyên, % đã sống, giai đoạn, số năm còn lại, cảnh báo', () => {
    const monster = { ...agingMonster(data, 0), ageDays: 925 }
    const state = lifespanState({ seed: 1, party: [monster] })
    const life = defined(getMonsterView(data, state, 'm1')?.life)
    expect(life.ageYears.toNumber()).toBe(92)
    expect(life.lifespanYears.toNumber()).toBe(101)
    expect(life.percentLived).toBeCloseTo(91.58, 1)
    expect(life.stage).toBe('old')
    expect(life.yearsLeft.toNumber()).toBe(8.5)
    expect(life.nearingEnd).toBe(true)
  })
})

describe('kiểm tra save', () => {
  const base = (): GameState => lifespanState({ seed: 1, party: [agingMonster(data, 50)] })
  const issues = (edit: (state: Record<string, unknown> & GameState) => void): string => {
    const state = structuredCloneState(base())
    edit(state)
    return validateGameState(data, state).join('\n')
  }

  it('state hợp lệ', () => expect(issues(() => {})).toBe(''))

  it('trường tuổi của quái sai', () => {
    const text = issues((s) => {
      const bad = s.party[0] as unknown as Record<string, unknown>
      bad.ageDays = -1
      bad.maxLevelReached = 0
      bad.lifespanBonusYears = toBig(-1)
      bad.itemUseCounts = { ghost: 1, potion: 0 }
    })
    expect(text).toMatch(/party\[0\]\.ageDays/)
    expect(text).toMatch(/party\[0\]\.maxLevelReached/)
    expect(text).toMatch(/party\[0\]\.lifespanBonusYears/)
    expect(text).toMatch(/itemUseCounts: vật phẩm lạ "ghost"/)
    expect(text).toMatch(/itemUseCounts\.potion/)
    expect(issues((s) => ((s.party[0] as unknown as Record<string, unknown>).aging = 'x'))).toMatch(
      /party\[0\]\.aging phải là boolean/
    )
  })

  it('đồng hồ, tùy chọn, sự kiện, cờ aging lệch tùy chọn', () => {
    expect(issues((s) => (s.time = -1))).toMatch(/time phải là số nguyên ≥ 0/)
    expect(issues((s) => ((s as Record<string, unknown>).options = { foo: true }))).toMatch(
      /options: tùy chọn lạ "foo"[\s\S]*options\.lifespanEnabled phải là boolean/
    )
    expect(issues((s) => ((s as Record<string, unknown>).dayEvents = [{ type: 'boom' }]))).toMatch(
      /dayEvents\[0\]: loại sự kiện lạ "boom"/
    )
    expect(
      issues((s) => ((s as Record<string, unknown>).dayEvents = [{ type: 'monsterAutoJoined' }]))
    ).toMatch(/dayEvents\[0\]: thiếu monsterId/)
    expect(
      issues((s) => (s.options = { lifespanEnabled: false, permadeathEnabled: false }))
    ).toMatch(/party\[0\]\.aging phải bằng options\.lifespanEnabled \(false\)/)
  })
})

/** Bản sao sâu giữ Decimal (state để sửa trong test). */
function structuredCloneState(state: GameState): Record<string, unknown> & GameState {
  return migrateState(JSON.parse(JSON.stringify(serializeState(state))), data) as Record<
    string,
    unknown
  > &
    GameState
}

describe('migrate v23 → v24', () => {
  it('quái thành niên (20% thọ nguyên), trứng tuổi 0, giờ bắt đầu, bật thọ nguyên; hợp lệ', () => {
    const egg = { id: 'm5', monster: agingMonster(data, 0, { id: 'm5' }), battlesLeft: 2 }
    const current = {
      ...lifespanState({
        seed: 1,
        party: [agingMonster(data, 50, { level: 7 })],
        nextMonsterId: 6
      }),
      eggs: [egg]
    }
    const strip = (monster: Record<string, unknown>): Record<string, unknown> => {
      const {
        ageDays: _ageDays,
        aging: _aging,
        maxLevelReached: _max,
        lifespanBonusYears: _bonus,
        itemUseCounts: _counts,
        ...rest
      } = monster
      return rest
    }
    const raw = JSON.parse(JSON.stringify(serializeState(current)))
    const { time: _time, options: _options, dayEvents: _events, ...rest } = raw
    const v23 = {
      ...rest,
      version: 23,
      party: raw.party.map(strip),
      eggs: raw.eggs.map((e: { monster: Record<string, unknown> }) => ({
        ...e,
        monster: strip(e.monster)
      }))
    }
    const migrated = migrateState(v23, data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.time).toBe(6)
    expect(migrated.options).toEqual({ lifespanEnabled: true, permadeathEnabled: false })
    expect(migrated.dayEvents).toEqual([])
    const monster = migrated.party[0]
    expect(monster.maxLevelReached).toBe(7)
    expect(monster.ageDays).toBe(ageDaysAtPercent(data, monster, 20))
    expect(migrated.eggs[0].monster.ageDays).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('kiểm tra dữ liệu', () => {
  it('lifespan bắt buộc với loài thường, cấm với dạng Mega; nguyên ≥ 1', () => {
    const text = dataIssuesAfter((raw) => {
      const [weakling, strongling] = raw.species
      if (weakling.kind === 'normal') delete weakling.lifespan
      if (strongling.kind === 'normal') strongling.lifespan = 0.5
      const mega = raw.species.find((s) => s.id === 'megaWeakling')
      if (mega?.kind === 'normal') mega.lifespan = 10
    }).join('\n')
    expect(text).toMatch(/Loài "weakling": lifespan phải là số nguyên ≥ 1/)
    expect(text).toMatch(/Loài "strongling": lifespan phải là số nguyên ≥ 1/)
    expect(text).toMatch(/Loài "megaWeakling": dạng mega không có lifespan/)
  })

  it('config.clock / config.lifespan và requiresOption của item', () => {
    const text = dataIssuesAfter((raw) => {
      raw.config.clock.wakeHour = 24
      raw.config.clock.hours.travel = -1
      raw.config.lifespan.daysPerYear = 0
      raw.config.lifespan.oldFromPercent = 100
      raw.config.lifespan.spawnAgePercent.wild = { min: 50, max: 10 }
      raw.config.lifespan.pillResistance = 2
      raw.config.lifespan.bossDrops = [{ itemId: 'ghost', chance: 10 }]
      const potion = raw.items.find((item) => item.id === 'potion')
      if (potion?.category === 'consumable') {
        ;(potion as { requiresOption?: unknown }).requiresOption = 'nuzlocke'
      }
    }).join('\n')
    expect(text).toMatch(/config\.clock\.wakeHour phải là giờ nguyên 0–23/)
    expect(text).toMatch(/config\.clock\.hours\.travel/)
    expect(text).toMatch(/config\.lifespan\.daysPerYear/)
    expect(text).toMatch(/config\.lifespan\.oldFromPercent/)
    expect(text).toMatch(/config\.lifespan\.spawnAgePercent\.wild\.max/)
    expect(text).toMatch(/config\.lifespan\.pillResistance/)
    expect(text).toMatch(/config\.lifespan\.bossDrops: vật phẩm rơi không tồn tại "ghost"/)
    expect(text).toMatch(/"potion": requiresOption phải là một trong lifespanEnabled/)
  })

  it('dữ liệu fixture thọ nguyên hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })
})
