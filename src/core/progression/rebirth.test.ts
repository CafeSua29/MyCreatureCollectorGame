// Luân hồi quái ở NPC thị trấn (docs/rules/rebirth.md): điều kiện, giá, reset / giữ, phần nhận (%,
// gen, điểm thiên phú, trẻ lại), fuse ½ / breeding 0, đồ rơi boss tầng, kiểm tra dữ liệu / save,
// migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { createGameData } from '../gameData'
import { getItemCount } from '../inventory'
import { computeStats, expForLevel, getMaxHp, monsterGrowthRate, validateMonster } from '../monster'
import { talentPointsEarned } from '../registries'
import { getMonsterView } from '../roster'
import { createRng, toBig } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  fixtureFloorBiomeIds,
  makeRawData,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { GameState, Monster, RawGameData } from '../model'
import { fuseMonsters } from './fusion'
import { makeOffspring } from './breeding'
import { rebirthRequirements } from './rebirth'

const data = makeData()

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 100, ...overrides })

function townState(party: Monster[], storage: Monster[] = [], pills = 10, money = 1e9): GameState {
  return {
    ...makeGameState({ seed: 1, party }),
    storage,
    money: toBig(money),
    inventory: makeInventory({ rebirthPill: pills })
  }
}

const reborn = (state: GameState, monsterId = 'a'): GameState =>
  gameReducer(data, state, { type: 'rebirthMonster', monsterId })
const heroOf = (state: GameState): Monster =>
  defined([...state.party, ...state.storage].find((m) => m.id === 'a'))

describe('điều kiện luân hồi', () => {
  it('lần thứ n: level 100 × n, tiền 10.000 × n², n viên Luân Hồi Đan', () => {
    const config = data.config.rebirth
    expect(rebirthRequirements(config, 0)).toEqual({
      count: 1,
      level: 100,
      money: toBig(10000),
      pills: 1
    })
    const third = rebirthRequirements(config, 2)
    expect([third.level, third.money.toNumber(), third.pills]).toEqual([300, 90000, 3])
    // Biên: số lần rất lớn vẫn ra số hữu hạn (tiền là Decimal).
    const huge = rebirthRequirements(config, 1e9)
    expect(huge.money.isFinite()).toBe(true)
    expect(huge.money.gt(1e22)).toBe(true)
  })
})

describe('luân hồi', () => {
  it('về level 1, trả tiền và đan, +1 lần, gen +10%, tuổi 0, hồi đầy máu, ghi mốc', () => {
    const before = hero({
      genes: { hp: 100, attack: 5, defense: 10, spAttack: 10, spDefense: 10, speed: 1 },
      ageDays: 900,
      damageTaken: 5,
      statuses: [{ statusId: 'poison', turnsLeft: null }]
    })
    const next = reborn(townState([before]))
    const after = heroOf(next)
    expect(after.level).toBe(1)
    expect(after.exp.eq(expForLevel(1, monsterGrowthRate(data, after)))).toBe(true)
    expect(after.rebirths).toBe(1)
    // +10% làm tròn xuống, ít nhất +1.
    expect(after.genes.hp.toNumber()).toBe(110)
    expect(after.genes.attack.toNumber()).toBe(6)
    expect(after.genes.speed.toNumber()).toBe(2)
    expect(after.ageDays).toBe(0)
    expect(after.damageTaken.toNumber()).toBe(0)
    expect(after.statuses).toEqual([])
    expect(after.maxLevelReached).toBe(100)
    expect(next.money.toNumber()).toBe(1e9 - 10000)
    expect(getItemCount(next.inventory, 'rebirthPill')).toBe(9)
    expect(after.history?.milestones.at(-1)).toMatchObject({ kind: 'reborn', count: 1 })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('giữ loài và mọi thuộc tính khác (skill, trait, thức tỉnh, hiến tế, bản mệnh...)', () => {
    const before = hero({
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      awakening: 2,
      sacrificeStacks: 7,
      bond: true,
      affinity: 200,
      polarity: null
    })
    const after = heroOf(reborn(townState([before])))
    const changed = ['level', 'exp', 'rebirths', 'genes', 'ageDays', 'history']
    const keep = (m: Monster): Record<string, unknown> =>
      Object.fromEntries(Object.entries(m).filter(([key]) => !changed.includes(key)))
    expect(keep(after)).toEqual(keep(before))
  })

  it('quái trong kho được; lần 2 cần level 200, 2 đan, 40.000 tiền', () => {
    const state = townState([makeMonster({ id: 'b' })], [hero({ rebirths: 1, level: 200 })])
    const next = reborn(state)
    expect(heroOf(next).rebirths).toBe(2)
    expect(getItemCount(next.inventory, 'rebirthPill')).toBe(8)
    expect(next.money.toNumber()).toBe(1e9 - 40000)
  })

  it('lần sau xét level hiện tại, không theo level cao nhất từng đạt', () => {
    const state = townState([hero({ rebirths: 1, level: 150, maxLevelReached: 500 })])
    expectActionError(() => reborn(state), 'levelTooLowForRebirth', { need: 200, have: 150 })
  })

  it('lỗi: level thấp, thiếu đan, thiếu tiền, không sở hữu, đang làm việc; state giữ nguyên', () => {
    const state = townState(
      [hero(), hero({ id: 'low', level: 99 })],
      [hero({ id: 'busy', assignment: { kind: 'expedition', id: 'e1' } })]
    )
    expectActionError(() => reborn(state, 'low'), 'levelTooLowForRebirth', { need: 100, have: 99 })
    expectActionError(() => reborn(state, 'busy'), 'monsterBusy')
    expectActionError(() => reborn(state, 'ghost'), 'monsterNotOwned')
    expectActionError(() => reborn(townState([hero()], [], 0)), 'notEnoughItem', {
      itemId: 'rebirthPill',
      have: 0,
      need: 1
    })
    expectActionError(() => reborn(townState([hero()], [], 1, 9999)), 'notEnoughMoney')
    expect(heroOf(state).level).toBe(100)
    expect(getItemCount(state.inventory, 'rebirthPill')).toBe(10)
  })

  it('lỗi: ngoài thị trấn, trong trận', () => {
    const state = townState([hero()])
    expectActionError(() => reborn(atFloor(state, 1)), 'notInTown')
    const inBattle = {
      ...makeBattleState(state.party, [makeMonster({ id: 'w' })]),
      money: state.money,
      inventory: state.inventory
    }
    expectActionError(() => reborn(inBattle), 'inBattle')
  })

  it('thọ nguyên tắt vẫn đặt tuổi 0; bật thì quái trẻ lại cũng 0', () => {
    const off = heroOf(reborn(townState([hero({ ageDays: 400, aging: false })])))
    expect(off.ageDays).toBe(0)
    const onState = {
      ...townState([hero({ ageDays: 400, aging: true })]),
      options: { ...townState([]).options, lifespanEnabled: true }
    }
    expect(heroOf(reborn(onState)).ageDays).toBe(0)
  })

  it('đan = 0 mỗi lần thì không cần đan', () => {
    const rebirth = { ...data.config.rebirth, pillsPerRebirth: 0 }
    const free = { ...data, config: { ...data.config, rebirth } }
    const next = gameReducer(free, townState([hero()], [], 0), {
      type: 'rebirthMonster',
      monsterId: 'a'
    })
    expect(heroOf(next).rebirths).toBe(1)
  })
})

describe('hiệu lực luân hồi', () => {
  it('+10% mọi chỉ số mỗi lần (tuyến tính), cộng vào tổng % ở bước áp trait; MonsterView', () => {
    const plain = hero()
    const twice = hero({ rebirths: 2 })
    expect(computeStats(data, plain).percentBySource.rebirth).toMatchObject({ hp: 0, speed: 0 })
    expect(computeStats(data, twice).percentBySource.rebirth).toMatchObject({
      hp: 20,
      attack: 20,
      speed: 20
    })
    expect(getMaxHp(data, twice).gt(getMaxHp(data, plain))).toBe(true)
    const view = defined(getMonsterView(data, makeGameState({ seed: 1, party: [twice] }), 'a'))
    expect(view.rebirth).toEqual({
      count: 2,
      statPercent: 20,
      next: rebirthRequirements(data.config.rebirth, 2)
    })
  })

  it('điểm thiên phú + rebirths × pointsPerRebirth (3); maxLevelReached không tụt', () => {
    const before = hero()
    const after = heroOf(reborn(townState([before])))
    expect(talentPointsEarned(data, after)).toBe(talentPointsEarned(data, before) + 3)
  })

  it('fuse: quái gốc giữ của mình + ½ của quái phụ (làm tròn xuống); breeding: con 0', () => {
    const base = hero({ rebirths: 2 })
    const sub = makeMonster({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      rebirths: 5
    })
    const [fused] = fuseMonsters(data, createRng(1), base, sub)
    expect(fused.rebirths).toBe(4)
    const father = makeMonster({ id: 'f', gender: 'male', rebirths: 3 })
    const mother = makeMonster({ id: 'm', gender: 'female', rebirths: 3 })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'kid')
    expect(child.rebirths).toBe(0)
  })

  it('kiểm tra quái: rebirths nguyên ≥ 0', () => {
    const bad = (rebirths: unknown): string =>
      validateMonster(data, { ...hero(), rebirths } as Monster).join()
    expect(bad(-1)).toMatch(/rebirths/)
    expect(bad(0.5)).toMatch(/rebirths/)
    expect(bad(undefined)).toMatch(/rebirths/)
    expect(validateMonster(data, hero({ rebirths: 1e9 }))).toEqual([])
  })

  it('migrate v79 → v80: mọi quái 0 lần', () => {
    const state = makeGameState({ seed: 1, party: [hero({ rebirths: 4 })] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { rebirths: _rebirths, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const old = { ...raw, version: 79, party: (raw.party as unknown[]).map(strip) }
    const migrated = migrateState(old, data)
    expect(migrated.party[0].rebirths).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('Luân Hồi Đan rơi từ boss tầng', () => {
  const dropData = createGameData(
    (() => {
      const raw = makeRawData()
      raw.config.rebirth.floorBossDrops = [{ itemId: 'rebirthPill', chance: 100 }]
      return raw
    })()
  )

  /** Hạ boss loài speciesId (còn 1 máu) ở tầng 2 (boss tầng của fixture là strongling). */
  function pillsAfterBoss(speciesId: string, isBoss = true): number {
    const base = makeMonster({ id: 'boss', speciesId, baseSpeciesId: speciesId, level: 4, exp: 64 })
    const boss = { ...base, skillIds: ['idle'], damageTaken: getMaxHp(dropData, base).minus(1) }
    const state: GameState = {
      ...makeBattleState([makeMonster({ id: 'a' })], [boss], { floor: 2, isBoss }),
      highestFloor: 2,
      floorBiomeIds: fixtureFloorBiomeIds(2)
    }
    const strike = { slot: 0, kind: 'skill', skillId: 'strike' } as const
    const next = gameReducer(dropData, state, { type: 'submitTurn', commands: [strike] })
    return getItemCount(next.inventory, 'rebirthPill')
  }

  it('chỉ boss tầng của map rơi, trận thường / boss khác loài thì không', () => {
    expect(pillsAfterBoss('strongling')).toBe(1)
    expect(pillsAfterBoss('twig')).toBe(0)
    expect(pillsAfterBoss('strongling', false)).toBe(0)
  })
})

describe('kiểm tra config.rebirth', () => {
  const issues = (edit: (raw: RawGameData) => void): string => dataIssuesAfter(edit).join('\n')

  it('fixture hợp lệ; số âm / lẻ, đan không phải material, đồ rơi sai, trường lạ thì báo lỗi', () => {
    expect(issues(() => {})).toBe('')
    expect(issues((raw) => (raw.config.rebirth.minLevelBase = 0))).toMatch(/minLevelBase/)
    expect(issues((raw) => (raw.config.rebirth.pillsPerRebirth = 1.5))).toMatch(/pillsPerRebirth/)
    expect(issues((raw) => (raw.config.rebirth.costBase = -1))).toMatch(/costBase/)
    expect(issues((raw) => (raw.config.rebirth.pillItemId = 'potion'))).toMatch(
      /config\.rebirth\.pillItemId phải là vật phẩm category "material"/
    )
    expect(
      issues((raw) => (raw.config.rebirth.floorBossDrops = [{ itemId: 'ghost', chance: 1 }]))
    ).toMatch(/config\.rebirth\.floorBossDrops: vật phẩm rơi không tồn tại "ghost"/)
    expect(issues((raw) => Object.assign(raw.config.rebirth, { extra: 1 }))).toMatch(
      /trường "extra" không thuộc config/
    )
    expect(issues((raw) => (raw.config.talents.pointsPerRebirth = -1))).toMatch(/pointsPerRebirth/)
  })
})
