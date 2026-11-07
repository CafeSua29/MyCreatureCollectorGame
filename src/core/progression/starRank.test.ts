// Bậc sao ở NPC fusing (docs/rules/star-rank.md): công thức số bản / sao, điều kiện cùng chuỗi tiến
// hóa, lên một / nhiều bậc, bản thừa giữ làm tiến độ, nguyên liệu có sao, giá, đồ về túi, chỉ số,
// fuse / breeding / tiến hóa, thành tựu, kiểm tra save, migrate, số cực lớn.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount, soulCrystalPoints } from '../inventory'
import { changeSpecies, computeStats, getMaxHp, validateMonster } from '../monster'
import { ACHIEVEMENT_CONDITIONS, copiesForStars, starsFromCopies, starUpCost } from '../registries'
import { getMonsterView } from '../roster'
import { createRng, toBig } from '../shared'
import {
  atFloor,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { GameState, Monster, NormalSpecies, StarRankConfig } from '../model'
import { makeOffspring } from './breeding'
import { fuseMonsters } from './fusion'
import { canStarFeed, previewStarUp } from './starRank'

const data = makeData()
const config = data.config.stars

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 10, ...overrides })
const copy = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, level: 5, ...overrides })
const pebble = (id: string): Monster =>
  makeMonster({
    id,
    speciesId: 'pebble',
    baseSpeciesId: 'pebble',
    gender: 'none',
    elementIds: ['normal']
  })

function townState(party: Monster[], storage: Monster[] = [], money = 1e6): GameState {
  return { ...makeGameState({ seed: 1, party }), storage, money: toBig(money) }
}

const feed = (state: GameState, feedIds: readonly string[], monsterId = 'a'): GameState =>
  gameReducer(data, state, { type: 'starUp', monsterId, feedIds })
const heroOf = (state: GameState): Monster =>
  defined([...state.party, ...state.storage].find((m) => m.id === 'a'))
const starsOfHero = (state: GameState): number => starsFromCopies(config, heroOf(state).starCopies)

describe('công thức bậc sao', () => {
  it('lên s → s + 1 cần 1 + s bản: 1, 3, 6, 10 bản cho 1–4 sao; bản thừa không làm lên sao', () => {
    expect([1, 2, 3, 4].map((s) => copiesForStars(config, s))).toEqual([1, 3, 6, 10])
    const stars = [0, 1, 2, 3, 5, 6, 9, 10].map((copies) => starsFromCopies(config, copies))
    expect(stars).toEqual([0, 1, 1, 2, 2, 3, 3, 4])
  })

  it('copiesPerStar 0 thì mỗi sao cùng giá; copiesBase lớn', () => {
    const flat: StarRankConfig = { ...config, copiesBase: 3, copiesPerStar: 0 }
    expect([0, 2, 3, 8, 9].map((copies) => starsFromCopies(flat, copies))).toEqual([0, 0, 1, 2, 3])
    const steep: StarRankConfig = { ...config, copiesBase: 2, copiesPerStar: 3 }
    for (let s = 0; s < 50; s++) {
      expect(starsFromCopies(steep, copiesForStars(steep, s))).toBe(s)
      if (s > 0) expect(starsFromCopies(steep, copiesForStars(steep, s) - 1)).toBe(s - 1)
    }
  })

  it('biên: số bản tới MAX_SAFE_INTEGER vẫn ra số sao đúng (C(s) ≤ n < C(s + 1))', () => {
    const max = Number.MAX_SAFE_INTEGER
    const stars = starsFromCopies(config, max)
    expect(copiesForStars(config, stars)).toBeLessThanOrEqual(max)
    expect(copiesForStars(config, stars + 1)).toBeGreaterThan(max)
  })

  it('giá: costPerStar × (s + 1) mỗi bậc, cộng dồn; Decimal không tràn', () => {
    expect(starUpCost(config, 0, 1)).toEqual(toBig(1000))
    // 1000 × (1 + 2 + 3).
    expect(starUpCost(config, 0, 3)).toEqual(toBig(6000))
    expect(starUpCost(config, 2, 2)).toEqual(toBig(0))
    expect(starUpCost(config, 0, 1e9).gt(toBig(1e20))).toBe(true)
  })
})

describe('điều kiện nguyên liệu', () => {
  it('cùng chuỗi tiến hóa (dạng nào cũng được), không fuse; quái chính fuse so theo loài gốc', () => {
    const strong = copy('b', { speciesId: 'strongling', baseSpeciesId: 'strongling' })
    expect(canStarFeed(data, hero(), copy('b'))).toBe(true)
    expect(canStarFeed(data, hero(), strong)).toBe(true)
    expect(
      canStarFeed(data, hero({ speciesId: 'strongling', baseSpeciesId: 'strongling' }), copy('b'))
    ).toBe(true)
    expect(canStarFeed(data, hero(), pebble('p'))).toBe(false)
    expect(canStarFeed(data, hero(), copy('f', { fused: true, lineage: ['pebble'] }))).toBe(false)
    const fusedHero = hero({ speciesId: 'fused', fused: true, lineage: ['pebble'] })
    expect(canStarFeed(data, fusedHero, copy('b'))).toBe(true)
    expect(canStarFeed(data, fusedHero, pebble('p'))).toBe(false)
  })
})

describe('ghép sao', () => {
  it('một bản: lên 1 sao, quái nguyên liệu mất, trả giá, ghi mốc lý lịch', () => {
    const next = feed(townState([hero(), copy('b')]), ['b'])
    expect(next.party.map((m) => m.id)).toEqual(['a'])
    expect(heroOf(next).starCopies).toBe(1)
    expect(starsOfHero(next)).toBe(1)
    expect(next.money.toNumber()).toBe(1e6 - 1000)
    expect(heroOf(next).history?.milestones.at(-1)).toMatchObject({
      kind: 'starredUp',
      from: 0,
      to: 1
    })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('nhiều bậc trong một action; số bản cần tăng dần; bản thừa giữ làm tiến độ, chưa trả giá', () => {
    const feeds = ['b', 'c', 'd', 'e']
    const state = townState(
      [hero(), copy('b')],
      feeds.slice(1).map((id) => copy(id))
    )
    const next = feed(state, feeds)
    // 4 bản: 0 → 2 sao (cần 1 + 2), thừa 1 bản tới sao 3 (cần thêm 2).
    expect(heroOf(next).starCopies).toBe(4)
    expect(starsOfHero(next)).toBe(2)
    expect(next.money.toNumber()).toBe(1e6 - 3000)
    expect(heroOf(next).history?.milestones.at(-1)).toMatchObject({ from: 0, to: 2 })
    const view = defined(getMonsterView(data, next, 'a')).stars
    expect(view).toEqual({
      stars: 2,
      copies: 4,
      copiesToNext: 2,
      statPercent: 10,
      nextCost: toBig(3000)
    })
    // Ghép thêm 1 bản chưa đủ sao 3: không lên sao, không tốn tiền, không ghi mốc.
    const partial = feed({ ...next, storage: [copy('f')] }, ['f'])
    expect(heroOf(partial).starCopies).toBe(5)
    expect(partial.money).toEqual(next.money)
    expect(heroOf(partial).history?.milestones).toEqual(heroOf(next).history?.milestones)
  })

  it('nguyên liệu có sao tính 1 + số bản đã ghép vào nó; shiny / boss vẫn chỉ +1', () => {
    const state = townState([
      hero({ starCopies: 1 }),
      copy('b', { starCopies: 6 }),
      copy('c', { shinyStacks: 2, bossMultiplier: 3 })
    ])
    expect(heroOf(feed(state, ['b'])).starCopies).toBe(8)
    expect(heroOf(feed(state, ['c'])).starCopies).toBe(2)
    expect(previewStarUp(data, hero({ starCopies: 1 }), [copy('b', { starCopies: 6 })])).toEqual({
      fromStars: 1,
      toStars: 3,
      copies: 8,
      cost: toBig(5000)
    })
  })

  it('quái chính trong kho được; đồ của nguyên liệu về túi, hoàn hồn tinh như fuse', () => {
    const sub = copy('b', {
      equipment: [{ storage: 'stack', itemId: 'everstone' }],
      soulLevels: { hp: 0, attack: 3, defense: 0, spAttack: 0, spDefense: 0, speed: 2 }
    })
    const next = feed(townState([pebble('k'), sub], [hero()]), ['b'])
    expect(heroOf(next).starCopies).toBe(1)
    expect(next.party.map((m) => m.id)).toEqual(['k'])
    expect(getItemCount(next.inventory, 'everstone')).toBe(1)
    expect(soulCrystalPoints(data, next.inventory)).toBe(4)
  })

  it('lỗi: khác chuỗi / fuse, trùng quái chính, id trùng / rỗng, bản mệnh, khóa, đang làm việc', () => {
    const state = townState(
      [
        hero(),
        copy('b'),
        pebble('p'),
        copy('fused', { fused: true, lineage: ['pebble'] }),
        copy('bond', { bond: true }),
        copy('locked', { locked: true })
      ],
      [copy('busy', { assignment: { kind: 'expedition', id: 'e1' } })]
    )
    expectActionError(() => feed(state, ['b', 'p']), 'starFeedMismatch', { feedId: 'p' })
    expectActionError(() => feed(state, ['fused']), 'starFeedMismatch', { feedId: 'fused' })
    expectActionError(() => feed(state, ['a']), 'starFeedSameMonster')
    expectActionError(() => feed(state, ['b', 'b']), 'malformedAction')
    expectActionError(() => feed(state, []), 'malformedAction')
    expectActionError(() => feed(state, ['bond']), 'isBondBeast')
    expectActionError(() => feed(state, ['locked']), 'monsterLocked')
    expectActionError(() => feed(state, ['busy']), 'monsterBusy')
    expectActionError(() => feed(state, ['ghost']), 'monsterNotOwned')
    expectActionError(() => feed(state, ['b'], 'ghost'), 'monsterNotOwned')
  })

  it('lỗi: đội trống, thiếu tiền, ngoài thị trấn, trong trận; state giữ nguyên', () => {
    expectActionError(() => feed(townState([copy('b')], [hero()]), ['b']), 'partyWouldBeEmpty')
    const state = townState([hero(), copy('b')])
    expectActionError(() => feed({ ...state, money: toBig(999) }, ['b']), 'notEnoughMoney')
    expectActionError(() => feed(atFloor(state, 1), ['b']), 'notInTown')
    const inBattle = {
      ...makeBattleState(state.party, [makeMonster({ id: 'w' })]),
      money: state.money
    }
    expectActionError(() => feed(inBattle, ['b']), 'inBattle')
    expect(heroOf(state).starCopies).toBe(0)
  })

  it('biên: số bản cực lớn vượt số nguyên an toàn thì báo lỗi', () => {
    const max = Number.MAX_SAFE_INTEGER
    const state = townState([hero({ starCopies: max - 1 }), copy('b'), copy('c')], [], 1e300)
    expect(heroOf(feed(state, ['b'])).starCopies).toBe(max)
    expectActionError(() => feed(state, ['b', 'c']), 'starCopiesLimit', { max })
  })
})

describe('hiệu quả và truyền sao', () => {
  it('mỗi sao +5% mọi chỉ số kể cả max HP, nguồn % stars', () => {
    const plain = hero()
    const starred = hero({ starCopies: copiesForStars(config, 4) })
    expect(computeStats(data, plain).percentBySource.stars).toMatchObject({ hp: 0, speed: 0 })
    expect(computeStats(data, starred).percentBySource.stars).toMatchObject({
      hp: 20,
      attack: 20,
      speed: 20
    })
    expect(getMaxHp(data, starred).gt(getMaxHp(data, plain))).toBe(true)
  })

  it('fuse: quái gốc giữ sao của mình, quái phụ mất sao; breeding: con 0; tiến hóa giữ', () => {
    const base = hero({ starCopies: 3 })
    const sub = copy('b', { speciesId: 'strongling', baseSpeciesId: 'strongling', starCopies: 10 })
    const [fused] = fuseMonsters(data, createRng(1), base, sub)
    expect(fused.starCopies).toBe(3)
    const father = makeMonster({ id: 'f', gender: 'male', starCopies: 9 })
    const mother = makeMonster({ id: 'm', gender: 'female', starCopies: 9 })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'kid')
    expect(child.starCopies).toBe(0)
    // Ép kiểu: fixture strongling là loài thường.
    const target = data.species.strongling as NormalSpecies
    expect(changeSpecies(data, base, { target, rng: createRng(1) }).monster.starCopies).toBe(3)
  })

  it('thành tựu monsterStars: số sao cao nhất của quái đang sở hữu', () => {
    const scope = townState([hero({ starCopies: 3 })], [copy('b', { starCopies: 10 })])
    expect(ACHIEVEMENT_CONDITIONS.monsterStars.progress({}, scope, data)).toBe(4)
    expect(ACHIEVEMENT_CONDITIONS.monsterStars.progress({}, townState([hero()]), data)).toBe(0)
  })

  it('kiểm tra quái: starCopies phải nguyên ≥ 0', () => {
    const bad = (starCopies: unknown): string =>
      validateMonster(data, { ...hero(), starCopies } as Monster).join()
    expect(bad(-1)).toMatch(/starCopies/)
    expect(bad(1.5)).toMatch(/starCopies/)
    expect(bad(undefined)).toMatch(/starCopies/)
    expect(validateMonster(data, hero({ starCopies: 0 }))).toEqual([])
  })

  it('migrate v114 → v115: mọi quái 0 bản', () => {
    const state = makeGameState({ seed: 1, party: [hero({ starCopies: 4 })] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { starCopies: _copies, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const old = { ...raw, version: 114, party: (raw.party as unknown[]).map(strip) }
    const migrated = migrateState(old, data)
    expect(migrated.party[0].starCopies).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
