import { describe, expect, it } from 'vitest'
import { fuseOutcome, previewFusion } from './fusion'
import { fuseRaceMatch, fuseSuccessChance } from './fusionChance'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { createInventory } from '../inventory'
import { cloneData, toBig } from '../shared'
import {
  dataIssuesAfter,
  FIXTURE_RACE_TRAIT_ID,
  FIXTURE_PARTNER_SKILL_ID,
  defined,
  expectActionError,
  makeData,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import {
  dayOf,
  type FusionAidItem,
  type GameData,
  type GameState,
  type Monster,
  type RawGameData
} from '../model'

// Fixture mặc định luôn fuse thành công; ở đây dựng dữ liệu với tỉ lệ thật (90 / 50 / 30, ×0,9 mỗi
// loài trong lineage), thêm race "alien" không tương thích với ai và trait "lucky" (+5 điểm %).
function chanceData(
  raceChances = { same: 90, breedable: 50, other: 30 },
  lineageFactor = 0.9
): GameData {
  const raw: RawGameData = makeRawData()
  raw.config.fuseChance = { raceChances, lineageFactor }
  raw.raceGroups.push({
    id: 'alienGroup',
    statBias: uniformStats(1),
    growth: uniformStats(0.1),
    traitIds: [],
    breedsWith: [],
    partnerSkillId: FIXTURE_PARTNER_SKILL_ID,
    humanForm: true
  })
  raw.races.push({
    id: 'alien',
    groupId: 'alienGroup',
    statBias: uniformStats(1),
    growth: uniformStats(0.1),
    breedsWith: [],
    traitIds: [FIXTURE_RACE_TRAIT_ID],
    partnerSkillId: FIXTURE_PARTNER_SKILL_ID,
    humanForm: true
  })
  raw.traits.push(
    { id: 'lucky', kind: 'rare', hooks: [{ type: 'fuseChanceBonus', params: { points: 5 } }] },
    { id: 'jinxed', kind: 'rare', hooks: [{ type: 'fuseChanceBonus', params: { points: -50 } }] }
  )
  return createGameData(withFixtureText(raw))
}

const data = chanceData()
const charm = (gameData: GameData, itemId: string): FusionAidItem => {
  const item = gameData.items[itemId]
  if (item.category !== 'fusionAid') throw new Error(`"${itemId}" không phải bùa fuse`)
  return item
}

const neutral = (id: string, overrides: Partial<Monster> = {}): Monster =>
  makeMonster({ id, ...overrides })
const brute = (id: string): Monster =>
  makeMonster({ id, speciesId: 'brawler', baseSpeciesId: 'brawler', raceId: 'brute' })
const alien = (id: string): Monster =>
  makeMonster({ id, speciesId: 'twig', baseSpeciesId: 'twig', raceId: 'alien' })
const twig = (id: string): Monster => makeMonster({ id, speciesId: 'twig', baseSpeciesId: 'twig' })

describe('fuseRaceMatch', () => {
  it('cùng race / breedsWith (xét cả hai chiều) / còn lại', () => {
    expect(fuseRaceMatch(data, neutral('a'), twig('b'))).toBe('same')
    // brute.breedsWith có neutral, neutral.breedsWith không có brute: một chiều cũng đủ.
    expect(fuseRaceMatch(data, neutral('a'), brute('b'))).toBe('breedable')
    expect(fuseRaceMatch(data, brute('a'), neutral('b'))).toBe('breedable')
    expect(fuseRaceMatch(data, neutral('a'), alien('b'))).toBe('other')
  })
})

describe('fuseSuccessChance', () => {
  it('quái gốc chưa fuse: theo độ hợp race', () => {
    expect(fuseSuccessChance(data, neutral('a'), twig('b'))).toBe(90)
    expect(fuseSuccessChance(data, neutral('a'), brute('b'))).toBe(50)
    expect(fuseSuccessChance(data, neutral('a'), alien('b'))).toBe(30)
  })

  it('nhân 0,9 mỗi loài trong lineage của quái gốc', () => {
    const lineage = ['twig', 'oak', 'strongling', 'brawler', 'cinder']
    const base = neutral('a', { speciesId: 'fused', fused: true, lineage })
    expect(fuseSuccessChance(data, base, alien('b'))).toBeCloseTo(30 * 0.9 ** 5)
    expect(fuseSuccessChance(data, neutral('a', { lineage: ['oak'] }), twig('b'))).toBeCloseTo(81)
  })

  it('lineage cực dài: giảm dần, không bao giờ âm hay NaN', () => {
    const lineage = Array.from({ length: 100_000 }, (_, i) => `s${i}`)
    const chance = fuseSuccessChance(data, neutral('a', { lineage }), twig('b'))
    expect(Number.isFinite(chance)).toBe(true)
    expect(chance).toBeGreaterThanOrEqual(0)
    // Điểm cộng vẫn có tác dụng khi phần nhân đã về rất nhỏ.
    const boosted = fuseSuccessChance(
      data,
      neutral('a', { lineage }),
      twig('b'),
      charm(data, 'fusionCharm')
    )
    expect(boosted).toBeCloseTo(10)
  })

  it('cộng điểm bùa và trait quái gốc (theo cấp trait); trait quái phụ không tính', () => {
    expect(fuseSuccessChance(data, neutral('a'), alien('b'), charm(data, 'fusionCharm'))).toBe(40)
    const lucky = neutral('a', { traits: [{ id: 'lucky', level: 1 }] })
    expect(fuseSuccessChance(data, lucky, alien('b'))).toBe(35)
    const lucky2 = neutral('a', { traits: [{ id: 'lucky', level: 2 }] })
    expect(fuseSuccessChance(data, lucky2, alien('b'))).toBeCloseTo(36) // 5 × 1,2
    const subLucky = { ...alien('b'), traits: [{ id: 'lucky', level: 1 }] }
    expect(fuseSuccessChance(data, neutral('a'), subLucky)).toBe(30)
  })

  it('kẹp [0, 100]', () => {
    const lucky = neutral('a', { traits: [{ id: 'lucky', level: 1 }] })
    expect(fuseSuccessChance(data, lucky, twig('b'), charm(data, 'fusionCharm'))).toBe(100)
    const jinxed = neutral('a', { traits: [{ id: 'jinxed', level: 1 }] })
    expect(fuseSuccessChance(data, jinxed, alien('b'))).toBe(0)
  })

  it('shiny và boss không ảnh hưởng', () => {
    const shinyBoss = neutral('a', { shinyStacks: 3, bossMultiplier: 5 })
    expect(fuseSuccessChance(data, shinyBoss, alien('b'))).toBe(30)
  })
})

// ---------- Action fuse: thất bại, bùa ----------

/** State ở thị trấn: đội [a (gốc), p], kho [b (phụ, khác loài)], túi có bùa. */
function fuseState(
  stacks: Record<string, number> = { fusionCharm: 1, fusionAmulet: 1 }
): GameState {
  return {
    ...makeGameState({
      seed: 3,
      party: [neutral('a', { level: 5 }), neutral('p')],
      money: toBig(10_000)
    }),
    storage: [alien('b')],
    inventory: createInventory(stacks)
  }
}

const always = { same: 100, breedable: 100, other: 100 }
const never = { same: 0, breedable: 0, other: 0 }
const fuseAction = { type: 'fuse', baseId: 'a', subId: 'b' } as const

describe('action fuse — thất bại', () => {
  const failData = chanceData(never, 1)

  it('thất bại: mất cả hai quái và tiền; tỉ lệ 0 không tốn RNG', () => {
    const state = fuseState()
    const next = gameReducer(failData, state, fuseAction)
    expect(next.party.map((m) => m.id)).toEqual(['p'])
    expect(next.storage).toEqual([])
    expect(next.money).toEqual(toBig(10_000 - 50 * 6))
    expect(next.rng).toEqual(state.rng)
    expect(next.inventory).toEqual(state.inventory) // không dùng bùa thì túi giữ nguyên
    expect(fuseOutcome(state, next, 'a')).toBe('failed')
  })

  it('Bùa Hộ Mệnh: quái gốc giữ nguyên, quái phụ và tiền vẫn mất, bùa mất', () => {
    const state = fuseState()
    const next = gameReducer(failData, state, { ...fuseAction, protectItemId: 'fusionAmulet' })
    // Quái gốc giữ nguyên, chỉ thêm mốc lý lịch fuse thất bại (mục "Lý lịch quái").
    const milestone = { day: dayOf(state.time), kind: 'fuseFailed', subSpeciesId: 'twig' }
    const base = defined(state.party[0].history, 'lý lịch')
    expect(next.party).toEqual([
      { ...state.party[0], history: { ...base, milestones: [milestone] } },
      state.party[1]
    ])
    expect(next.storage).toEqual([])
    expect(next.money).toEqual(toBig(10_000 - 50 * 6))
    expect(next.inventory.stacks).toEqual({ fusionCharm: 1 })
    expect(fuseOutcome(state, next, 'a')).toBe('protected')
  })

  it('bùa tăng tỉ lệ tiêu hao cả khi thất bại', () => {
    const next = gameReducer(failData, fuseState(), { ...fuseAction, boostItemId: 'fusionCharm' })
    expect(next.inventory.stacks).toEqual({ fusionAmulet: 1 })
  })

  it('quái gốc trong kho, quái phụ trong đội: thất bại thì mất cả hai ở đúng chỗ', () => {
    const state = fuseState()
    const next = gameReducer(failData, state, { type: 'fuse', baseId: 'b', subId: 'p' })
    expect(next.party.map((m) => m.id)).toEqual(['a'])
    expect(next.storage).toEqual([])
  })
})

describe('action fuse — thành công, tỉ lệ ngẫu nhiên', () => {
  it('thành công: quái fuse thay quái gốc; bùa vẫn tiêu hao', () => {
    const state = fuseState()
    const next = gameReducer(chanceData(always, 1), state, {
      ...fuseAction,
      boostItemId: 'fusionCharm',
      protectItemId: 'fusionAmulet'
    })
    expect(next.party[0].fused).toBe(true)
    expect(next.party[0].lineage).toEqual(['twig'])
    expect(next.inventory.stacks).toEqual({})
    expect(fuseOutcome(state, next, 'a')).toBe('success')
  })

  it('tỉ lệ 50%: khoảng một nửa số seed thành công, tất định theo seed', () => {
    const half = chanceData({ same: 50, breedable: 50, other: 50 }, 1)
    let successes = 0
    for (let seed = 1; seed <= 400; seed++) {
      const state = { ...fuseState(), rng: makeGameState({ seed }).rng }
      const next = gameReducer(half, state, fuseAction)
      expect(gameReducer(half, state, fuseAction)).toEqual(next)
      if (fuseOutcome(state, next, 'a') === 'success') successes++
    }
    expect(successes).toBeGreaterThan(160)
    expect(successes).toBeLessThan(240)
  })

  it('bùa đưa tỉ lệ 0 lên 10%: có tung RNG, có lần thành công', () => {
    const failData = chanceData(never, 1)
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 100; seed++) {
      const state = { ...fuseState(), rng: makeGameState({ seed }).rng }
      const next = gameReducer(failData, state, { ...fuseAction, boostItemId: 'fusionCharm' })
      expect(next.rng).not.toEqual(state.rng)
      outcomes.add(fuseOutcome(state, next, 'a'))
    }
    expect(outcomes).toEqual(new Set(['success', 'failed']))
  })
})

describe('action fuse — báo lỗi (state giữ nguyên)', () => {
  const state = fuseState({ potion: 1, fusionCharm: 1 })
  const before = cloneData(state)

  it('bùa không tồn tại, sai loại, sai ô, không có trong túi, sai dạng', () => {
    expectActionError(
      () => gameReducer(data, state, { ...fuseAction, boostItemId: 'zz' }),
      'unknownItem',
      {
        itemId: 'zz'
      }
    )
    expectActionError(
      () => gameReducer(data, state, { ...fuseAction, boostItemId: 'potion' }),
      'wrongFusionAid',
      { itemId: 'potion', slot: 'boost' }
    )
    expectActionError(
      () => gameReducer(data, state, { ...fuseAction, boostItemId: 'fusionAmulet' }),
      'wrongFusionAid',
      { itemId: 'fusionAmulet', slot: 'boost' }
    )
    expectActionError(
      () => gameReducer(data, state, { ...fuseAction, protectItemId: 'fusionCharm' }),
      'wrongFusionAid',
      { slot: 'protect' }
    )
    expectActionError(
      () => gameReducer(data, state, { ...fuseAction, protectItemId: 'fusionAmulet' }),
      'notEnoughItem',
      { itemId: 'fusionAmulet', have: 0, need: 1 }
    )
    // Ép kiểu để giả lập lệnh sai dạng từ renderer.
    const malformed = { ...fuseAction, boostItemId: 5 } as unknown as typeof fuseAction
    expectActionError(() => gameReducer(data, state, malformed), 'malformedAction')
    expect(state).toEqual(before)
  })

  it('đội trống nếu mất cả hai: báo lỗi; có Bùa Hộ Mệnh thì quái gốc chắc còn nên được', () => {
    const duo: GameState = {
      ...makeGameState({ seed: 1, party: [neutral('a'), twig('b')], money: toBig(10_000) }),
      inventory: createInventory({ fusionAmulet: 1 })
    }
    expectActionError(() => gameReducer(data, duo, fuseAction), 'partyWouldBeEmpty')
    const next = gameReducer(chanceData(never, 1), duo, {
      ...fuseAction,
      protectItemId: 'fusionAmulet'
    })
    expect(next.party.map((m) => m.id)).toEqual(['a'])
  })
})

describe('previewFusion — tỉ lệ', () => {
  it('trả tỉ lệ (đã cộng bùa) và mức hợp race', () => {
    expect(previewFusion(data, neutral('a'), alien('b'))).toMatchObject({
      successChance: 30,
      raceMatch: 'other'
    })
    expect(previewFusion(data, neutral('a'), brute('b'), 'fusionCharm')).toMatchObject({
      successChance: 60,
      raceMatch: 'breedable'
    })
    expectActionError(
      () => previewFusion(data, neutral('a'), brute('b'), 'potion'),
      'wrongFusionAid'
    )
  })
})

describe('kiểm tra dữ liệu: tỉ lệ fuse, hook trait', () => {
  it('fixture và dữ liệu tỉ lệ thật hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
    expect(defined(data.config.fuseChance)).toBeDefined()
  })

  it('config.fuseChance sai', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.fuseChance = {
        raceChances: { same: 120, breedable: -1, other: 30, extra: 5 } as never,
        lineageFactor: 0
      }
    }).join('\n')
    expect(issues).toMatch(/config\.fuseChance\.raceChances\.same/)
    expect(issues).toMatch(/config\.fuseChance\.raceChances\.breedable/)
    expect(issues).toMatch(/"extra" không phải mức hợp race/)
    expect(issues).toMatch(/config\.fuseChance\.lineageFactor/)
    const missing = dataIssuesAfter((raw) => {
      raw.config.fuseChance = undefined as never
    })
    expect(missing).toContain('config.fuseChance phải là object')
  })

  it('hook trait fuseChanceBonus thiếu points', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.traits.push({
          id: 'badLuck',
          kind: 'rare',
          hooks: [{ type: 'fuseChanceBonus', params: {} }]
        })
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toMatch(/"fuseChanceBonus": points/)
  })
})

describe('fuseOutcome', () => {
  it('quái gốc không có trước khi fuse: lỗi lập trình', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'p' })] })
    expect(() => fuseOutcome(state, state, 'a')).toThrow(/không có quái gốc/)
  })
})

// Fixture mặc định: dùng để chắc test fuse cũ không đổi (100%, không tốn RNG).
describe('fixture mặc định', () => {
  it('tỉ lệ luôn 100', () => {
    expect(fuseSuccessChance(makeData(), neutral('a', { lineage: ['oak'] }), alien('b'))).toBe(100)
  })
})
