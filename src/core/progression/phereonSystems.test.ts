// Các hệ thống lấy từ Portals of Phereon: luyện thể (body-refinement.md), phòng ấp (hatchery.md), chọn
// trait / gen khi fuse (fusing.md), tinh chất (essences.md). Cổng thế giới ở battle/portals.test.ts.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { computeStats, uniformBigStats, validateMonster } from '../monster'
import { activeRefinementBonuses } from '../registries'
import { getItemCount, soulCrystalPoints } from '../inventory'
import { createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeData,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type {
  Egg,
  EssenceState,
  GameData,
  GameState,
  HatcheryRoom,
  Monster,
  RawGameData
} from '../model'
import { makeOffspring } from './breeding'
import {
  applyEssenceGrowth,
  essenceEggBonus,
  essenceFusionTraitChoices,
  grantEssenceOffer,
  rollEssenceOffer
} from './essences'
import { fuseMonsters, previewFusion } from './fusion'
import { keptTraitCapacity, parseFusionChoices } from './fusionChoices'
import {
  eggRoomBonus,
  eggTypeOf,
  hatchFromRoom,
  hatcherPower,
  hatcheryDailyTask,
  roomHabitatId,
  roomSteps,
  settleRoomHatch,
  type RoomHatch
} from './hatchery'
import { incubateEggs } from './incubation'

const data = makeData()
const NO_ESSENCES: EssenceState = { owned: [], offer: null }
const withEssences = (...owned: string[]): EssenceState => ({ owned, offer: null })

const dataWith = (edit: (raw: RawGameData) => void): GameData => {
  const raw = makeRawData()
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const town = (party: Monster[], money = 100_000): GameState =>
  makeGameState({ seed: 3, party, highestFloor: 1, money })

describe('luyện thể', () => {
  const hero = (level = 10): Monster => makeMonster({ id: 'a', level, exp: level ** 3 })
  const refine = (state: GameState, refinementId: string, gameData = data): GameState =>
    gameReducer(gameData, state, { type: 'refineBody', monsterId: 'a', refinementId })

  it('lắp kiểu của bộ phận quái có: trừ tiền theo level × hệ số giá, cộng chỉ số', () => {
    const state = town([hero(10)])
    const refined = refine(state, 'lavaLegs')
    const monster = defined(refined.party[0], 'quái')
    expect(monster.refinements).toEqual({ legs: 'lavaLegs' })
    // costPerLevel 10 × level 10 × hệ số 2.
    expect(refined.money.toNumber()).toBe(state.money.toNumber() - 200)
    expect(computeStats(data, monster).final.speed.toNumber()).toBeGreaterThan(
      computeStats(data, hero(10)).final.speed.toNumber()
    )
    expect(validateMonster(data, monster)).toEqual([])
  })

  it('đổi kiểu cùng bộ phận thì thay kiểu cũ; lắp lại đúng kiểu đang có thì báo lỗi', () => {
    const once = refine(town([hero()]), 'lavaArms')
    const swapped = refine(once, 'clawArms')
    expect(defined(swapped.party[0], 'quái').refinements).toEqual({ torso: 'clawArms' })
    expectActionError(() => refine(once, 'lavaArms'), 'refinementAlreadyApplied')
  })

  it('kiểu lạ, bộ phận quái không có, thiếu tiền, ngoài thị trấn: báo lỗi, state giữ nguyên', () => {
    expectActionError(() => refine(town([hero()]), 'nope'), 'unknownRefinement')
    const noLegs = dataWith((raw) => {
      raw.config.hitLocations.defaultBodyParts = ['head', 'torso']
    })
    expectActionError(() => refine(town([hero()]), 'lavaLegs', noLegs), 'noSuchBodyPart')
    expectActionError(() => refine(town([hero()], 0), 'lavaLegs'), 'notEnoughMoney')
    const away: GameState = { ...town([hero()]), location: { type: 'floor', floor: 1 } }
    expectActionError(() => refine(away, 'lavaLegs'), 'notInTown')
  })

  it('thưởng bộ theo nhãn lấy bậc cao nhất đạt được, không cộng dồn các bậc', () => {
    const one = makeMonster({ id: 'a', refinements: { legs: 'lavaLegs' } })
    expect(activeRefinementBonuses(data, one)).toEqual([])
    const two = makeMonster({ id: 'a', refinements: { legs: 'lavaLegs', torso: 'lavaArms' } })
    const bonuses = activeRefinementBonuses(data, two)
    expect(bonuses.map((bonus) => bonus.count)).toEqual([2])
    // Kiểu +5% tốc, +5% công; bộ 2 nhãn +10% công.
    const withBonus = computeStats(data, two).final.attack.toNumber()
    const plain = computeStats(data, makeMonster({ id: 'a' })).final.attack.toNumber()
    expect(withBonus).toBeGreaterThanOrEqual(Math.floor(plain * 1.15) - 1)
  })

  it('gỡ kiểu: trả % giá, bộ phận trống; bộ phận chưa lắp thì báo lỗi', () => {
    const refined = refine(town([hero(10)]), 'lavaLegs')
    const removed = gameReducer(data, refined, {
      type: 'removeRefinement',
      monsterId: 'a',
      partId: 'legs'
    })
    expect(defined(removed.party[0], 'quái').refinements).toEqual({})
    expect(removed.money.toNumber()).toBe(refined.money.toNumber() - 100)
    expectActionError(
      () =>
        gameReducer(data, removed, { type: 'removeRefinement', monsterId: 'a', partId: 'legs' }),
      'noRefinement'
    )
  })

  it('fuse giữ luyện thể của quái gốc, breeding không truyền', () => {
    const base = makeMonster({ id: 'a', refinements: { legs: 'lavaLegs' } })
    const sub = makeMonster({ id: 'b', speciesId: 'strongling', baseSpeciesId: 'strongling' })
    expect(fuseMonsters(data, createRng(1), base, sub)[0].refinements).toEqual({
      legs: 'lavaLegs'
    })
    const father = makeMonster({ id: 'f', gender: 'male', refinements: { legs: 'lavaLegs' } })
    const [child] = makeOffspring(data, createRng(1), father, base, 'c')
    expect(child.refinements).toEqual({})
  })

  it('kiểm tra save: kiểu lạ, kiểu sai bộ phận; kiểm tra dữ liệu: bộ phận lạ, nhãn thưởng không ai mang', () => {
    expect(validateMonster(data, makeMonster({ refinements: { legs: 'nope' } })).join()).toMatch(
      /kiểu luyện thể lạ/
    )
    expect(
      validateMonster(data, makeMonster({ refinements: { head: 'lavaLegs' } })).join()
    ).toMatch(/thuộc bộ phận/)
    expect(
      dataIssuesAfter((raw) => {
        defined(raw.bodyRefinements[0], 'kiểu').partId = 'nope'
      }).join()
    ).toMatch(/partId lạ/)
    expect(
      dataIssuesAfter((raw) => {
        defined(raw.config.bodyRefinement.tagBonuses[0], 'thưởng').tag = 'nope'
      }).join()
    ).toMatch(/không kiểu luyện thể nào/)
  })
})

describe('phòng ấp', () => {
  // weakling hệ grass (trứng floral), strongling hệ fire (trứng lava).
  const egg = (id: string, speciesId: string, roomIndex?: number, battlesLeft = 5): Egg => ({
    id,
    monster: makeMonster({
      id,
      speciesId,
      baseSpeciesId: speciesId,
      elementIds: speciesId === 'strongling' ? ['fire'] : ['grass']
    }),
    battlesLeft,
    infusions: [],
    ...(roomIndex === undefined ? {} : { roomIndex })
  })
  const room = (habitatId: string, upgrades: string[] = []): HatcheryRoom => ({
    habitatId,
    upgrades,
    hatcherId: null
  })
  const hatchedMonster = (result: RoomHatch): Monster => {
    if (result.outcome !== 'hatched') throw new Error(`không nở: ${result.outcome}`)
    return result.monster
  }
  const view = (eggs: Egg[], habitatId = 'basic'): GameState => ({
    ...town([makeMonster({ id: 'a' })]),
    eggs,
    hatchery: { rooms: [room(habitatId), room('basic')] }
  })

  it('loại trứng theo loài ghi eggType, không thì theo hệ, không có trong bảng thì mặc định', () => {
    expect(eggTypeOf(data, egg('e', 'strongling').monster)).toBe('lava')
    const noTable = makeMonster({ elementIds: ['normal'] })
    expect(eggTypeOf(data, noTable)).toBe('normal')
    const custom = dataWith((raw) => {
      const species = defined(raw.species[0], 'loài')
      if (species.kind === 'normal') species.eggType = 'ice'
    })
    expect(eggTypeOf(custom, egg('e', 'weakling').monster)).toBe('ice')
  })

  it('luật môi trường: trứng lava ngoài phòng lava mất ổn định, trong phòng lava thì không', () => {
    const inBasic = egg('e', 'strongling', 0)
    expect(eggRoomBonus(data, view([inBasic]), inBasic)).toEqual({ growth: 25, stability: 65 })
    expect(eggRoomBonus(data, view([inBasic], 'lava'), inBasic)).toEqual({
      growth: 25,
      stability: 100
    })
  })

  it('trứng cùng phòng ảnh hưởng nhau; trứng khác phòng và trứng mang theo thì không', () => {
    const first = egg('e1', 'weakling', 0)
    const second = egg('e2', 'weakling', 0)
    const otherRoom = egg('e3', 'weakling', 1)
    expect(eggRoomBonus(data, view([first, second, otherRoom]), first)).toEqual({
      growth: 10,
      stability: 120
    })
    const carried = egg('e4', 'weakling')
    expect(eggRoomBonus(data, view([carried]), carried)).toEqual({ growth: 0, stability: 0 })
  })

  it('hook gen và tinh chất cộng sức lớn / ổn định', () => {
    const custom = dataWith((raw) => {
      raw.traits.push({
        id: 'quickHatch',
        kind: 'positive',
        hooks: [
          { type: 'eggGrowthPercent', params: { percent: 25 } },
          { type: 'eggStabilityPercent', params: { percent: -20 } }
        ]
      })
    })
    const carrying: Egg = {
      ...egg('e', 'weakling', 0),
      monster: makeMonster({ id: 'e', traits: [{ id: 'quickHatch', level: 1 }] })
    }
    const state = { ...view([carrying]), essences: withEssences('eggWarmth') }
    expect(eggRoomBonus(custom, state, carrying)).toEqual({ growth: 45, stability: 100 })
  })

  it('bước tiến: nhân theo sức lớn, phần lẻ tung; sức lớn −100 trở xuống không tiến; mang theo không tốn RNG', () => {
    const rng = createRng(1)
    const carried = egg('e', 'weakling')
    expect(roomSteps(data, rng, { state: view([carried]), egg: carried, steps: 2 })).toEqual([
      2,
      rng
    ])
    const lava = egg('e', 'strongling', 0)
    // +25%: 2 bước → 2,5: tiến 2 hoặc 3.
    const [steps] = roomSteps(data, rng, { state: view([lava]), egg: lava, steps: 2 })
    expect([2, 3]).toContain(steps)
    const frozen = dataWith((raw) => {
      raw.config.hatchery.rules = [{ growth: -100 }]
    })
    const plain = egg('e', 'weakling', 0)
    expect(roomSteps(frozen, rng, { state: view([plain]), egg: plain, steps: 3 })[0]).toBe(0)
  })

  it('incubateEggs dùng sức lớn của phòng; không có phòng thì như cũ', () => {
    const biome = Object.values(data.biomes)[0]
    const fast = dataWith((raw) => {
      raw.config.hatchery.rules = [{ growth: 100 }]
    })
    const inRoom = egg('e', 'weakling', 0, 5)
    const result = incubateEggs(fast, createRng(1), {
      eggs: [inRoom],
      steps: 1,
      biome,
      room: view([inRoom])
    })
    expect(defined(result.eggs[0], 'trứng').battlesLeft).toBe(3)
    const old = incubateEggs(data, createRng(1), { eggs: [inRoom], steps: 1, biome })
    expect(defined(old.eggs[0], 'trứng').battlesLeft).toBe(4)
  })

  it('nở: mang theo luôn nở; ổn định thấp có thể hỏng (kẹp minHatchChance); trên 100 thì tăng gen', () => {
    const rng = createRng(1)
    const carried = egg('e', 'weakling')
    expect(hatchFromRoom(data, rng, { state: view([carried]), egg: carried })[0]).toEqual({
      outcome: 'hatched',
      monster: carried.monster
    })
    const doomed = dataWith((raw) => {
      raw.config.hatchery.baseStability = -1000
      raw.config.hatchery.minHatchChance = 0.0001
    })
    const inRoom = egg('e', 'weakling', 0)
    expect(hatchFromRoom(doomed, rng, { state: view([inRoom]), egg: inRoom })[0]).toEqual({
      outcome: 'lost'
    })
    const steady = dataWith((raw) => {
      raw.config.hatchery.baseStability = 200
      raw.config.hatchery.genePercentPerExcessStability = 1
    })
    const hatched = hatchedMonster(
      hatchFromRoom(steady, rng, { state: view([inRoom]), egg: inRoom })[0]
    )
    expect(hatched.genes.hp.toNumber()).toBe(inRoom.monster.genes.hp.toNumber() * 2)
  })

  it('gen cực lớn không ra Infinity / NaN khi ổn định dư', () => {
    const steady = dataWith((raw) => {
      raw.config.hatchery.baseStability = 300
    })
    const huge: Egg = {
      ...egg('e', 'weakling', 0),
      monster: { ...makeMonster({ id: 'e' }), genes: uniformBigStats('1e300') }
    }
    const hatched = hatchedMonster(
      hatchFromRoom(steady, createRng(1), { state: view([huge]), egg: huge })[0]
    )
    expect(hatched.genes.hp.gt(toBig('1e300'))).toBe(true)
    expect(hatched.genes.hp.isFinite()).toBe(true)
  })

  it('đặt / lấy trứng: phòng đầy, phòng lạ, trứng lạ báo lỗi', () => {
    const state = view([egg('e1', 'weakling'), egg('e2', 'weakling'), egg('e3', 'weakling')])
    const place = (current: GameState, eggId: string, roomIndex: number | null): GameState =>
      gameReducer(data, current, { type: 'placeEgg', eggId, roomIndex })
    const two = place(place(state, 'e1', 0), 'e2', 0)
    expect(two.eggs.map((e) => e.roomIndex)).toEqual([0, 0, undefined])
    expectActionError(() => place(two, 'e3', 0), 'roomFull', { max: 2 })
    expectActionError(() => place(two, 'e3', 9), 'roomNotFound')
    expectActionError(() => place(two, 'nope', 1), 'eggNotFound')
    const taken = place(two, 'e1', null)
    expect('roomIndex' in defined(taken.eggs[0], 'trứng')).toBe(false)
    expect(validateGameState(data, two)).toEqual([])
  })

  it('dựng môi trường: trả tiền, phòng chưa dựng là mặc định; trùng / lạ / ngoài thị trấn báo lỗi', () => {
    const state = town([makeMonster({ id: 'a' })], 500)
    expect(roomHabitatId(data, state, 1)).toBe('basic')
    const built = gameReducer(data, state, {
      type: 'buildHatcheryHabitat',
      roomIndex: 1,
      habitatId: 'lava'
    })
    expect(built.hatchery.rooms).toEqual([room('basic'), room('lava')])
    expect(built.money.toNumber()).toBe(400)
    const build = (current: GameState, habitatId: string, roomIndex = 1): GameState =>
      gameReducer(data, current, { type: 'buildHatcheryHabitat', roomIndex, habitatId })
    expectActionError(() => build(built, 'lava'), 'habitatAlreadyBuilt')
    expectActionError(() => build(built, 'nope'), 'unknownHabitat')
    expectActionError(() => build(built, 'ice', 5), 'roomNotFound')
    expectActionError(() => build(town([makeMonster({ id: 'a' })], 0), 'lava'), 'notEnoughMoney')
    expectActionError(
      () => build({ ...built, location: { type: 'floor', floor: 1 } }, 'ice'),
      'notInTown'
    )
  })

  it('mỗi ngày trứng trong phòng tiến bước nhưng dừng ở 1; trứng mang theo đứng yên', () => {
    const state = view([
      egg('e1', 'weakling', 0, 2),
      egg('e2', 'weakling', 0, 1),
      egg('e3', 'weakling')
    ])
    const next = hatcheryDailyTask(data, state)
    expect(next.eggs.map((e) => e.battlesLeft)).toEqual([1, 1, 5])
    const empty = view([egg('e3', 'weakling')])
    expect(hatcheryDailyTask(data, empty)).toBe(empty)
  })

  it('kiểm tra save: môi trường lạ, phòng lạ, quá sức chứa; kiểm tra dữ liệu: mặc định lạ, loại trứng lạ', () => {
    const issuesOf = (state: GameState): string => validateGameState(data, state).join(' | ')
    expect(issuesOf({ ...view([]), hatchery: { rooms: [room('nope')] } })).toMatch(/habitatId lạ/)
    expect(issuesOf(view([egg('e', 'weakling', 9)]))).toMatch(/roomIndex không hợp lệ/)
    expect(
      issuesOf(view([egg('e1', 'weakling', 0), egg('e2', 'weakling', 0), egg('e3', 'weakling', 0)]))
    ).toMatch(/quá 2 trứng/)
    expect(
      dataIssuesAfter((raw) => {
        raw.config.hatchery.defaultHabitatId = 'nope'
      }).join()
    ).toMatch(/defaultHabitatId lạ/)
    expect(
      dataIssuesAfter((raw) => {
        raw.config.hatchery.rules = [{ eggTypes: ['nope'], growth: 1 }]
      }).join()
    ).toMatch(/id lạ/)
    expect(
      dataIssuesAfter((raw) => {
        raw.config.hatchery.rules = [{ eggTypes: ['lava'] }]
      }).join()
    ).toMatch(/cần growth hoặc stability/)
  })
})

describe('fuse: chọn trait và gen', () => {
  const base = (traits: string[]): Monster =>
    makeMonster({ id: 'a', traits: traits.map((id) => ({ id, level: 1 })) })
  const sub = (traits: string[], genes = 10): Monster =>
    makeMonster({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      genes: uniformStats(genes),
      traits: traits.map((id) => ({ id, level: 1 }))
    })
  const parse = (
    a: Monster,
    b: Monster,
    order: { keepTraitIds?: unknown; geneSources?: unknown },
    essences = NO_ESSENCES
  ): ReturnType<typeof parseFusionChoices> =>
    parseFusionChoices(data, { essences, base: a, sub: b }, order)

  it('sức chứa: một nửa số trait làm tròn lên, tinh chất cộng thêm, không vượt số trait', () => {
    expect(keptTraitCapacity(data, NO_ESSENCES, base([]))).toBe(0)
    expect(keptTraitCapacity(data, NO_ESSENCES, base(['fast']))).toBe(1)
    expect(keptTraitCapacity(data, NO_ESSENCES, base(['fast', 'armored', 'mighty']))).toBe(2)
    expect(
      keptTraitCapacity(data, withEssences('fusionMastery'), base(['fast', 'armored', 'mighty']))
    ).toBe(3)
    expect(keptTraitCapacity(data, withEssences('fusionMastery'), base(['fast']))).toBe(1)
    expect(
      previewFusion(data, base(['fast']), sub(['armored', 'mighty'])).keptTraitCapacity
    ).toEqual({
      base: 1,
      sub: 1
    })
  })

  it('trait chọn giữ luôn còn ở mọi seed; ô còn lại vẫn tung', () => {
    const a = base(['fast'])
    const b = sub(['armored', 'mighty'])
    const choices = parse(a, b, { keepTraitIds: ['mighty'] })
    for (let seed = 1; seed <= 30; seed++) {
      const [fused] = fuseMonsters(data, createRng(seed), { ...a, traitSlots: 1 }, b, { choices })
      expect(fused.traits.map((t) => t.id)).toContain('mighty')
    }
  })

  it('trait giữ không bị bỏ khi trait bốc ra loại trừ với nó (trait kia bị bỏ qua)', () => {
    const a = base(['fast'])
    const b = sub(['slow'])
    const choices = parse(a, b, { keepTraitIds: ['slow'] })
    for (let seed = 1; seed <= 10; seed++) {
      const [fused] = fuseMonsters(data, createRng(seed), a, b, { choices })
      expect(fused.traits.map((t) => t.id)).toEqual(['slow'])
    }
  })

  it('trait có ở cả hai bên gộp cấp khi giữ', () => {
    const a = base(['mighty'])
    const b = sub(['mighty'])
    const choices = parse(a, b, { keepTraitIds: ['mighty'] })
    const [fused] = fuseMonsters(data, createRng(1), a, b, { choices })
    expect(fused.traits).toEqual([{ id: 'mighty', level: 2 }])
  })

  it('giữ trait: lạ, quá sức chứa, loại trừ nhau, sai dạng báo lỗi', () => {
    const a = base(['fast'])
    const b = sub(['slow', 'armored'])
    expectActionError(() => parse(a, b, { keepTraitIds: ['nope'] }), 'cannotKeepTrait', {
      traitId: 'nope'
    })
    expectActionError(
      () => parse(a, b, { keepTraitIds: ['slow', 'armored'] }),
      'tooManyKeptTraits',
      {
        monsterId: 'b',
        max: 1
      }
    )
    expectActionError(() => parse(a, b, { keepTraitIds: ['fast', 'slow'] }), 'keptTraitsExclusive')
    expectActionError(() => parse(a, b, { keepTraitIds: 'fast' }), 'malformedAction')
    expectActionError(() => parse(a, b, { keepTraitIds: ['fast', 'fast'] }), 'malformedAction')
  })

  it('gen: mặc định giữ của quái gốc, chỉ số chọn sub lấy của quái phụ, kể cả số cực lớn', () => {
    const a = base([])
    const b = sub([], 77)
    expect(fuseMonsters(data, createRng(1), a, b)[0].genes.attack.toNumber()).toBe(
      a.genes.attack.toNumber()
    )
    const choices = parse(a, b, { geneSources: { attack: 'sub', hp: 'base' } })
    const [fused] = fuseMonsters(data, createRng(1), a, b, { choices })
    expect(fused.genes.attack.toNumber()).toBe(77)
    expect(fused.genes.hp.toNumber()).toBe(a.genes.hp.toNumber())
    const giant = { ...b, genes: uniformBigStats('1e400') }
    const big = fuseMonsters(data, createRng(1), a, giant, { choices })[0]
    expect(big.genes.attack.eq(toBig('1e400'))).toBe(true)
  })

  it('gen sai dạng báo lỗi', () => {
    const a = base([])
    const b = sub([])
    for (const geneSources of ['sub', ['attack'], { luck: 'sub' }, { attack: 'both' }]) {
      expectActionError(() => parse(a, b, { geneSources }), 'malformedAction')
    }
  })

  it('action fuse: lựa chọn sai thì state giữ nguyên; đúng thì áp vào quái gốc', () => {
    const a = base(['fast'])
    const b = sub(['armored'], 88)
    const state: GameState = { ...town([a, makeMonster({ id: 'c' })]), storage: [b] }
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'fuse',
          baseId: 'a',
          subId: 'b',
          keepTraitIds: ['nope']
        }),
      'cannotKeepTrait'
    )
    const fused = gameReducer(data, state, {
      type: 'fuse',
      baseId: 'a',
      subId: 'b',
      keepTraitIds: ['armored'],
      geneSources: { speed: 'sub' }
    })
    const monster = defined(fused.party[0], 'quái')
    expect(monster.traits.map((t) => t.id)).toContain('armored')
    expect(monster.genes.speed.toNumber()).toBe(88)
    expect(fused.storage).toEqual([])
  })

  it('tinh chất tăng trưởng cộng gen cho quái vừa fuse', () => {
    const a = base([])
    const [fused] = fuseMonsters(data, createRng(1), a, sub([]), {
      essences: withEssences('hpSpark')
    })
    expect(fused.genes.hp.toNumber()).toBe(Math.floor(a.genes.hp.toNumber() * 1.5))
    expect(fused.genes.attack.toNumber()).toBe(a.genes.attack.toNumber())
  })

  it('breeding: hook traitInheritBonus truyền thêm trait; không có hook thì tối đa 2 như cũ', () => {
    const custom = dataWith((raw) => {
      raw.traits.push({
        id: 'mutating',
        kind: 'positive',
        hooks: [{ type: 'traitInheritBonus', params: { percent: 100 } }]
      })
    })
    const traits = ['mutating', 'armored', 'mighty'].map((id) => ({ id, level: 1 }))
    const mother = makeMonster({ id: 'm', traits })
    const father = makeMonster({ id: 'f', gender: 'male' })
    const [child] = makeOffspring(custom, createRng(1), father, mother, 'c')
    expect(child.traits.length).toBe(2)
    const plain = makeMonster({ id: 'm', traits: traits.slice(1) })
    const [normal] = makeOffspring(custom, createRng(1), father, plain, 'c')
    expect(normal.traits.length).toBe(1)
  })
})

describe('tinh chất', () => {
  it('lựa chọn: đúng số ô, không trùng, không gồm tinh chất đã có; hết tinh chất thì rỗng', () => {
    const [offer] = rollEssenceOffer(data, createRng(1), ['balance'])
    expect(offer).toHaveLength(2)
    expect(new Set(offer).size).toBe(2)
    expect(offer).not.toContain('balance')
    const all = Object.keys(data.essences)
    expect(rollEssenceOffer(data, createRng(1), all)[0]).toEqual([])
  })

  it('mọi tinh chất đều có cơ hội xuất hiện trong lựa chọn', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 200; seed++) {
      for (const id of rollEssenceOffer(data, createRng(seed), [])[0]) seen.add(id)
    }
    expect([...seen].sort()).toEqual(Object.keys(data.essences).sort())
  })

  it('cho lựa chọn: đang chờ thì giữ lựa chọn cũ; hết tinh chất thì không có lựa chọn', () => {
    const holder = { essences: NO_ESSENCES, rng: createRng(1) }
    const offered = grantEssenceOffer(data, holder)
    expect(offered.essences.offer).toHaveLength(2)
    expect(grantEssenceOffer(data, offered)).toBe(offered)
    const full = { essences: withEssences(...Object.keys(data.essences)), rng: createRng(1) }
    expect(grantEssenceOffer(data, full).essences.offer).toBeNull()
  })

  it('chọn tinh chất: phải đang có lựa chọn và thuộc lựa chọn', () => {
    const state = town([makeMonster({ id: 'a' })])
    const choose = (current: GameState, essenceId: string): GameState =>
      gameReducer(data, current, { type: 'chooseEssence', essenceId })
    expectActionError(() => choose(state, 'balance'), 'noEssenceOffer')
    const offered: GameState = { ...state, essences: { owned: [], offer: ['balance', 'hpSpark'] } }
    expectActionError(() => choose(offered, 'fusionMastery'), 'essenceNotOffered')
    expect(choose(offered, 'balance').essences).toEqual({ owned: ['balance'], offer: null })
  })

  it('growth: theo chỉ số thấp nhất, lọc race / nhóm race, ít nhất +1, số cực lớn không hỏng', () => {
    const monster = makeMonster({ genes: { ...uniformStats(10), speed: 1 } })
    const boosted = applyEssenceGrowth(data, withEssences('balance'), monster)
    expect(boosted.genes.speed.toNumber()).toBe(2)
    expect(boosted.genes.hp.toNumber()).toBe(10)
    const custom = dataWith((raw) => {
      raw.essences.push({
        id: 'otherRace',
        rarity: 'common',
        effect: { kind: 'growth', stats: ['hp'], percent: 100, raceIds: ['brute'] }
      })
    })
    expect(applyEssenceGrowth(custom, withEssences('otherRace'), monster)).toBe(monster)
    const huge = { ...makeMonster(), genes: uniformBigStats('1e500') }
    const big = applyEssenceGrowth(data, withEssences('hpSpark'), huge)
    expect(big.genes.hp.gt(toBig('1e500'))).toBe(true)
  })

  it('cộng dồn nhiều tinh chất cùng loại', () => {
    const custom = dataWith((raw) => {
      raw.essences.push(
        { id: 'moreEggs', rarity: 'common', effect: { kind: 'egg', growth: 5, stability: 1 } },
        { id: 'moreFusion', rarity: 'mythic', effect: { kind: 'fusionTraitChoices', extra: 2 } }
      )
    })
    expect(essenceEggBonus(custom, withEssences('eggWarmth', 'moreEggs'))).toEqual({
      growth: 25,
      stability: 21
    })
    expect(essenceFusionTraitChoices(custom, withEssences('fusionMastery', 'moreFusion'))).toBe(3)
  })

  it('kiểm tra dữ liệu: loại hiệu ứng lạ, trường lạ, trait lạ, độ hiếm lạ', () => {
    const issues = (edit: (raw: RawGameData) => void): string => dataIssuesAfter(edit).join(' | ')
    expect(
      issues((raw) => {
        raw.essences.push({
          id: 'bad',
          rarity: 'common',
          // Ép kiểu: cố ý sai để kiểm tra dữ liệu báo lỗi.
          effect: { kind: 'nope' } as unknown as RawGameData['essences'][number]['effect']
        })
      })
    ).toMatch(/kind không hợp lệ/)
    expect(
      issues((raw) => {
        raw.essences.push({
          id: 'bad',
          rarity: 'common',
          effect: { kind: 'battleTrait', traitId: 'nope' }
        })
      })
    ).toMatch(/trait/)
    expect(
      issues((raw) => {
        defined(raw.essences[0], 'tinh chất').rarity = 'nope' as 'common'
      })
    ).toMatch(/rarity không hợp lệ/)
  })

  it('kiểm tra save: tinh chất lạ, trùng', () => {
    const state = town([makeMonster({ id: 'a' })])
    const issuesOf = (essences: EssenceState): string =>
      validateGameState(data, { ...state, essences }).join(' | ')
    expect(issuesOf({ owned: ['nope'], offer: null })).toMatch(/tinh chất lạ/)
    expect(issuesOf({ owned: ['balance', 'balance'], offer: null })).toMatch(/bị trùng/)
    expect(issuesOf({ owned: [], offer: ['nope'] })).toMatch(/tinh chất lạ/)
    expect(issuesOf({ owned: ['balance'], offer: ['hpSpark'] })).toBe('')
  })
})

describe('save v107', () => {
  it('migrate v106 → v107: quái, trứng chưa luyện thể; phòng ấp, tinh chất, cổng rỗng', () => {
    const state: GameState = {
      ...town([makeMonster({ id: 'a' })]),
      eggs: [{ id: 'e', monster: makeMonster({ id: 'e' }), battlesLeft: 3, infusions: [] }]
    }
    const raw = JSON.parse(JSON.stringify(serializeState(state))) as Record<string, unknown>
    const { hatchery: _h, essences: _e, ...old } = raw
    const party = (old.party as Record<string, unknown>[]).map((monster) => {
      const { refinements: _r, ...rest } = monster
      return rest
    })
    const zones = old.zones as Record<string, unknown>
    const { portals: _p, nextPortalId: _n, ...oldZones } = zones
    const migrated = migrateState({ ...old, party, zones: oldZones, version: 106 }, data)
    expect(defined(migrated.party[0], 'quái').refinements).toEqual({})
    expect(defined(migrated.eggs[0], 'trứng').monster.refinements).toEqual({})
    expect(migrated.hatchery).toEqual({ rooms: [] })
    expect(migrated.essences).toEqual({ owned: [], offer: null })
    expect(migrated.zones).toMatchObject({ portals: [], nextPortalId: 1 })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('tinh chất trong trận', () => {
  const custom = dataWith((raw) => {
    raw.traits.push({
      id: 'essenceBoost',
      kind: 'rare',
      hooks: [{ type: 'statModifier', params: { percent: { attack: 50 } } }]
    })
    raw.essences.push({
      id: 'boostEssence',
      rarity: 'rare',
      effect: { kind: 'battleTrait', traitId: 'essenceBoost' }
    })
  })

  it('quái của người chơi nhận trait tạm khi vào trận, địch không nhận', () => {
    const party = [makeMonster({ id: 'a' })]
    const base = makeGameState({ seed: 3, party, highestFloor: 1, money: 100 })
    const onFloor: GameState = {
      ...base,
      location: { type: 'floor', floor: 1 },
      essences: withEssences('boostEssence')
    }
    const fighting = gameReducer(custom, onFloor, { type: 'startWildBattle' })
    const battle = defined(fighting.battle, 'trận')
    expect(battle.volatiles.a?.gainedTraits?.map((trait) => trait.id)).toEqual(['essenceBoost'])
    for (const enemy of battle.enemies) {
      expect(battle.volatiles[enemy.id]?.gainedTraits ?? []).toEqual([])
    }
    // Trait tạm: không ghi vào quái.
    expect(defined(fighting.party[0], 'quái').traits).toEqual([])
  })

  it('không có tinh chất trong trận thì không có trait tạm', () => {
    const party = [makeMonster({ id: 'a' })]
    const base = makeGameState({ seed: 3, party, highestFloor: 1, money: 100 })
    const onFloor: GameState = { ...base, location: { type: 'floor', floor: 1 } }
    const fighting = gameReducer(custom, onFloor, { type: 'startWildBattle' })
    expect(defined(fighting.battle, 'trận').volatiles.a?.gainedTraits ?? []).toEqual([])
  })
})

describe('phòng ấp: người ấp, nâng cấp', () => {
  const egg = (id: string, overrides: Partial<Egg> = {}): Egg => ({
    id,
    monster: makeMonster({ id, elementIds: ['grass'] }),
    battlesLeft: 5,
    infusions: [],
    roomIndex: 0,
    ...overrides
  })
  const room = (
    upgrades: string[] = [],
    habitatId = 'basic',
    hatcherId: string | null = null
  ): HatcheryRoom => ({
    habitatId,
    upgrades,
    hatcherId
  })
  const state = (rooms: HatcheryRoom[], eggs: Egg[] = [], storage: Monster[] = []): GameState => ({
    ...town([makeMonster({ id: 'a' })]),
    hatchery: { rooms },
    eggs,
    storage
  })

  it('sức ấp theo công đặc biệt gốc, giảm dần sau mỗi 10 điểm; hook gấp đôi', () => {
    // Loài fixture spAttack 30 / 10 = 3 điểm.
    expect(hatcherPower(data, makeMonster())).toBe(3)
    const strong = dataWith((raw) => {
      const species = defined(raw.species[0], 'loài')
      if (species.kind === 'normal') species.baseStats = uniformStats(150)
    })
    // 15 điểm: 10 + 5 × 0,75 = 13,75.
    expect(hatcherPower(strong, makeMonster())).toBe(14)
    const doubled = dataWith((raw) => {
      raw.traits.push({
        id: 'incubating',
        kind: 'positive',
        hooks: [{ type: 'hatcherBonus', params: { percent: 100 } }]
      })
    })
    expect(hatcherPower(doubled, makeMonster({ traits: [{ id: 'incubating', level: 1 }] }))).toBe(6)
  })

  it('người ấp cộng sức lớn: sức ấp, cùng loại trứng, hợp môi trường; không ở kho thì không tính', () => {
    const hatcher = makeMonster({
      id: 'h',
      elementIds: ['fire'],
      assignment: { kind: 'hatchery', id: 'room-0' }
    })
    const lavaEgg = egg('e', { monster: makeMonster({ id: 'e', elementIds: ['fire'] }) })
    const inLava = state([room([], 'lava', 'h')], [lavaEgg], [hatcher])
    // Trứng lava +25; sức ấp 3, cùng loại +10, hợp môi trường +10.
    expect(eggRoomBonus(data, inLava, lavaEgg).growth).toBe(48)
    const noHatcher = state([room([], 'lava', 'h')], [lavaEgg], [])
    expect(eggRoomBonus(data, noHatcher, lavaEgg).growth).toBe(25)
  })

  it('đặt người ấp: quái kho, khóa quái; đổi người thì thả người cũ; lỗi khi ở đội / đang bận', () => {
    const first = makeMonster({ id: 'h1' })
    const second = makeMonster({ id: 'h2' })
    const start = state([], [], [first, second])
    const set = (current: GameState, monsterId: string | null): GameState =>
      gameReducer(data, current, { type: 'setHatcher', roomIndex: 0, monsterId })
    const one = set(start, 'h1')
    expect(one.storage[0]?.assignment).toEqual({ kind: 'hatchery', id: 'room-0' })
    expect(validateGameState(data, one)).toEqual([])
    const two = set(one, 'h2')
    expect(two.storage[0]?.assignment).toBeNull()
    expect(two.hatchery.rooms[0]?.hatcherId).toBe('h2')
    expect(set(two, null).storage[1]?.assignment).toBeNull()
    expectActionError(() => set(start, 'a'), 'hatcherNotInStorage')
    expectActionError(() => set(one, 'h1'), 'monsterBusy')
  })

  it('mua nâng cấp: trừ tiền, hết ô, trùng, sai môi trường, lạ báo lỗi; đổi môi trường mất nâng cấp không hợp', () => {
    const buy = (current: GameState, upgradeId: string): GameState =>
      gameReducer(data, current, { type: 'buyHatcheryUpgrade', roomIndex: 0, upgradeId })
    const start = state([room([], 'lava')])
    const one = buy(start, 'farm')
    expect(one.hatchery.rooms[0]?.upgrades).toEqual(['farm'])
    expect(one.money.toNumber()).toBe(start.money.toNumber() - 100)
    expectActionError(() => buy(one, 'farm'), 'hatcheryUpgradeOwned')
    expectActionError(() => buy(state([room()]), 'farm'), 'hatcheryUpgradeWrongHabitat')
    expectActionError(() => buy(one, 'nope'), 'unknownHatcheryUpgrade')
    const full = buy(one, 'growth')
    expectActionError(() => buy(full, 'stability'), 'hatcheryUpgradeCap', { max: 2 })
    const moved = gameReducer(data, full, {
      type: 'buildHatcheryHabitat',
      roomIndex: 0,
      habitatId: 'ice'
    })
    expect(moved.hatchery.rooms[0]?.upgrades).toEqual(['growth'])
  })

  it('nâng cấp cộng sức lớn / ổn định, theo trứng cùng loài và trứng sắp nở', () => {
    const first = egg('e1')
    const second = egg('e2', { battlesLeft: 1 })
    const current = state([room(['growth', 'stability'])], [first])
    expect(eggRoomBonus(data, current, first)).toEqual({ growth: 10, stability: 110 })
    const same = state([room(['symbiotic', 'supporting'])], [first, second])
    // floral cạnh floral +10 / +20; cùng loài +10; trứng kia sắp nở +10.
    expect(eggRoomBonus(data, same, first)).toEqual({ growth: 20, stability: 130 })
  })

  it('Delayed: phần bước gốc giảm một nửa; quái nở lên thêm level', () => {
    const current = state([room(['delayed'])], [egg('e')])
    const [steps] = roomSteps(data, createRng(1), { state: current, egg: egg('e'), steps: 2 })
    expect(steps).toBe(1)
    const [result] = hatchFromRoom(data, createRng(1), { state: current, egg: egg('e') })
    expect(result.outcome === 'hatched' && result.monster.level).toBe(10)
  })

  it('nở hỏng: Continuous lùi trứng, không có thì mất; Consuming chia bước; SoulCollector cho điểm hồn tinh', () => {
    const doomed = dataWith((raw) => {
      raw.config.hatchery.baseStability = -1000
      raw.config.hatchery.minHatchChance = 0.0001
    })
    const failing = egg('e', { battlesLeft: 0 })
    expect(
      hatchFromRoom(doomed, createRng(1), {
        state: state([room(['continuous'])], [failing]),
        egg: failing
      })[0]
    ).toEqual({ outcome: 'retry', battlesLeft: 3 })
    const other = egg('o', { battlesLeft: 5 })
    const settled = settleRoomHatch(data, state([room(['consuming', 'soulCollector'])], [other]), {
      egg: failing,
      succeeded: false
    })
    expect(settled.eggs[0]?.battlesLeft).toBe(3)
    expect(soulCrystalPoints(data, settled.inventory)).toBeGreaterThan(0)
  })

  it('nở thành công: Boosting tiến trứng khác nhưng dừng ở 1; vật phẩm theo loại trứng', () => {
    const lavaEgg = egg('e', { monster: makeMonster({ id: 'e', elementIds: ['fire'] }) })
    const near = egg('o', { battlesLeft: 2 })
    const settled = settleRoomHatch(data, state([room(['boosting', 'farm'], 'lava')], [near]), {
      egg: lavaEgg,
      succeeded: true
    })
    expect(settled.eggs[0]?.battlesLeft).toBe(1)
    expect(getItemCount(settled.inventory, 'potion')).toBeGreaterThan(0)
    const plain = settleRoomHatch(data, state([room(['farm'], 'lava')], []), {
      egg: egg('g'),
      succeeded: true
    })
    expect(getItemCount(plain.inventory, 'potion')).toBe(
      getItemCount(state([]).inventory, 'potion')
    )
  })

  it('quái nở: Potential tăng gen, Energizing đầy nhu cầu, Mutating thêm trait, trait theo nâng cấp và môi trường', () => {
    const steady = dataWith((raw) => {
      raw.config.hatchery.habitats = raw.config.hatchery.habitats.map((habitat) =>
        habitat.id === 'ice' ? { ...habitat, hatchTraitId: 'fast' } : habitat
      )
      raw.config.hatchery.upgradeCap = 5
    })
    const inRoom = egg('e', {
      monster: { ...makeMonster({ id: 'e', fullness: 1, sanity: 1 }), traitSlots: 6 }
    })
    const hatch = (rooms: HatcheryRoom[]): Monster => {
      const [result] = hatchFromRoom(steady, createRng(1), {
        state: state(rooms, [inRoom]),
        egg: inRoom
      })
      if (result.outcome !== 'hatched') throw new Error('phải nở')
      return result.monster
    }
    expect(hatch([room(['potential'])]).genes.hp.toNumber()).toBe(
      Math.floor(inRoom.monster.genes.hp.toNumber() * 1.2)
    )
    expect(hatch([room(['energizing'])]).fullness).toBe(steady.config.dwelling.needs.max)
    expect(hatch([room(['embiggening'])]).traits.map((t) => t.id)).toEqual(['armored'])
    expect(hatch([room([], 'ice')]).traits.map((t) => t.id)).toEqual(['fast'])
    expect(hatch([room(['mutating'], 'lava')]).traits).toHaveLength(1)
  })

  it('Focusing / Equalizing: phần ổn định dư chỉ vào gen cao nhất / thấp nhất, gấp đôi', () => {
    const steady = dataWith((raw) => {
      raw.config.hatchery.baseStability = 200
      raw.config.hatchery.genePercentPerExcessStability = 1
    })
    const genes = { ...uniformStats(10), attack: 50, speed: 2 }
    const inRoom = egg('e', { monster: makeMonster({ id: 'e', genes }) })
    const hatch = (upgrade: string): Monster => {
      const [result] = hatchFromRoom(steady, createRng(1), {
        state: state([room([upgrade])], [inRoom]),
        egg: inRoom
      })
      if (result.outcome !== 'hatched') throw new Error('phải nở')
      return result.monster
    }
    const focused = hatch('focusing')
    expect(focused.genes.attack.toNumber()).toBe(150)
    expect(focused.genes.hp.toNumber()).toBe(10)
    const equalized = hatch('equalizing')
    expect(equalized.genes.speed.toNumber()).toBe(6)
    expect(equalized.genes.attack.toNumber()).toBe(50)
  })

  it('mỗi ngày: nâng cấp cho vật phẩm theo trứng trong phòng', () => {
    const current = state([room(['fruiting'])], [egg('e')])
    const next = hatcheryDailyTask(data, current)
    expect(getItemCount(next.inventory, 'potion')).toBe(
      getItemCount(current.inventory, 'potion') + 1
    )
  })

  it('kiểm tra save: nâng cấp lạ, trùng, quá trần, người ấp không đúng; dữ liệu: hiệu ứng lạ, item lạ', () => {
    const issues = (current: GameState): string => validateGameState(data, current).join(' | ')
    expect(issues(state([room(['nope'])]))).toMatch(/nâng cấp lạ/)
    expect(issues(state([room(['growth', 'growth'])]))).toMatch(/bị trùng/)
    expect(issues(state([room(['growth', 'stability', 'symbiotic'])]))).toMatch(/tối đa 2/)
    expect(issues(state([room([], 'basic', 'h')], [], [makeMonster({ id: 'h' })]))).toMatch(
      /không phải người ấp/
    )
    // Người ấp đã mất (tọa hóa...): không phải save hỏng.
    expect(issues(state([room([], 'basic', 'gone')]))).toBe('')
    const dataIssues = (edit: (raw: RawGameData) => void): string =>
      dataIssuesAfter(edit).join(' | ')
    expect(
      dataIssues((raw) => {
        raw.config.hatchery.upgrades.push({
          id: 'bad',
          price: 1,
          // Ép kiểu: cố ý sai để kiểm tra dữ liệu báo lỗi.
          effects: [
            {
              kind: 'nope'
            } as unknown as RawGameData['config']['hatchery']['upgrades'][number]['effects'][number]
          ]
        })
      })
    ).toMatch(/kind lạ/)
    expect(
      dataIssues((raw) => {
        raw.config.hatchery.upgrades.push({
          id: 'bad',
          price: 1,
          effects: [{ kind: 'dailyItem', eggTypes: ['lava'], itemId: 'nope', count: 1 }]
        })
      })
    ).toMatch(/itemId lạ/)
  })
})
