// Độ thân mật (docs/rules/affinity.md): tăng / giảm theo sự kiện, kẹp 0–255, vật phẩm, bóng, chuông
// nhân lượng tăng, hiệu ứng theo mức, breed / fuse, MonsterView, kiểm tra save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { computeStats, getMaxHp, validateMonster } from '../monster'
import { affinityGain, affinityTierOf, changeAffinity, traitExpMultiplier } from '../registries'
import { fuseMonsters } from '../progression'
import { buildMonsterView } from '../roster'
import { createRng, toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { EquipmentInstance, GameData, GameState, Item, Monster } from '../model'
import { gameReducer } from './reducer'
import { migrateState } from './migrate'
import { serializeState } from './save'
import { validateGameState } from './validateGameState'

/** Fixture + vật phẩm thân mật: kẹo thân mật, Hữu Nghị Cầu, Chuông An Thần. */
function affinityData(): GameData {
  const raw = makeRawData()
  const items: Item[] = [
    {
      id: 'treat',
      category: 'consumable',
      price: 10,
      use: 'field',
      target: 'ally',
      effects: [{ type: 'addAffinity', params: { amount: 20 } }]
    },
    { id: 'friendBall', category: 'ball', price: 10, catchMultiplier: 1000, startAffinity: 150 },
    {
      id: 'bell',
      category: 'equipment',
      price: 10,
      mainLine: {
        hook: { type: 'affinityGainPercent', params: {} },
        valueParam: ['percent'],
        ranges: {
          common: { min: 20, max: 20 },
          uncommon: { min: 30, max: 30 },
          rare: { min: 50, max: 50 },
          epic: { min: 80, max: 80 },
          legendary: { min: 100, max: 100 }
        }
      }
    }
  ]
  raw.items.push(...items)
  return createGameData(withFixtureText(raw))
}

const data = affinityData()

const bell = (value: number): EquipmentInstance => ({
  id: 'e1',
  baseItemId: 'bell',
  rarity: 'legendary',
  level: 1,
  rolls: [{ lineId: 'main', value }]
})

const withBell = (overrides: MonsterOverrides = {}, value = 100): Monster =>
  makeMonster({ equipment: [{ storage: 'instance', instance: bell(value) }], ...overrides })

const run = (state: GameState, action: Parameters<typeof gameReducer>[2]): GameState =>
  gameReducer(data, state, action)

describe('changeAffinity', () => {
  it('kẹp 0–255; giảm không nhân chuông, tăng nhân chuông (làm tròn)', () => {
    expect(changeAffinity(data, makeMonster({ affinity: 250 }), 20).affinity).toBe(255)
    expect(changeAffinity(data, makeMonster({ affinity: 1 }), -5).affinity).toBe(0)
    // Chuông +100%: +5 → +10; +20% với +1 làm tròn còn +1.
    expect(changeAffinity(data, withBell({ affinity: 0 }), 5).affinity).toBe(10)
    expect(affinityGain(data, withBell({}, 20), 1)).toBe(1)
    expect(changeAffinity(data, withBell({ affinity: 10 }), -1).affinity).toBe(9)
    const full = makeMonster({ affinity: 255 })
    expect(changeAffinity(data, full, 1)).toBe(full)
  })

  it('mức theo điểm: lấy mức cao nhất đã đạt', () => {
    expect(affinityTierOf(data, 0)?.id).toBe('stranger')
    expect(affinityTierOf(data, 99)?.id).toBe('stranger')
    expect(affinityTierOf(data, 100)?.id).toBe('familiar')
    expect(affinityTierOf(data, 255)?.id).toBe('bonded')
  })
})

describe('hiệu ứng theo mức (nguồn hook affinity)', () => {
  it('EXP: mức familiar +10%, mức bonded +20% (không chồng)', () => {
    expect(traitExpMultiplier(data, makeMonster({ affinity: 0 }))).toBe(1)
    expect(traitExpMultiplier(data, makeMonster({ affinity: 120 }))).toBeCloseTo(1.1)
    expect(traitExpMultiplier(data, makeMonster({ affinity: 200 }))).toBeCloseTo(1.2)
  })

  it('trụ 1 HP khi bị đòn hạ (không áp khi đầy máu), một lần mỗi trận', () => {
    const fragile = (overrides: MonsterOverrides): Monster =>
      makeMonster({ id: 'a', affinity: 200, skillIds: ['idle'], ...overrides })
    const foe = makeMonster({ id: 'e', level: 30, skillIds: ['strike'] })
    const hurt = makeBattleState([fragile({ damageTaken: 10 })], [foe])
    const afterHurt = run(hurt, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
    })
    const a = defined(afterHurt.party.find((m) => m.id === 'a'))
    expect(getMaxHp(data, a).minus(a.damageTaken).toNumber()).toBe(1)
    // Đầy máu bị một đòn hạ ngay: không trụ.
    const fresh = makeBattleState([fragile({})], [foe])
    const afterFresh = run(fresh, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
    })
    const b = defined(afterFresh.party.find((m) => m.id === 'a'))
    expect(b.damageTaken.gte(getMaxHp(data, b))).toBe(true)
  })
})

describe('tăng / giảm theo sự kiện', () => {
  it('thắng trận: quái ra sân +2, quái không ra sân +1, quái trong kho không đổi', () => {
    const fighter = makeMonster({ id: 'a', affinity: 10, skillIds: ['strike'] })
    const bench = makeMonster({ id: 'c', affinity: 10 })
    const base = makeBattleState([fighter], [makeMonster({ id: 'e', damageTaken: 49 })])
    const state = {
      ...base,
      party: [fighter, bench],
      storage: [makeMonster({ id: 's', affinity: 10 })]
    }
    const won = run(state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0 }]
    })
    expect(defined(won.battle).outcome).toBe('won')
    expect(won.party.map((m) => m.affinity)).toEqual([12, 11])
    expect(won.storage[0].affinity).toBe(10)
  })

  it('quái ta gục: −1 (không xuống dưới 0)', () => {
    const state = makeBattleState(
      [makeMonster({ id: 'a', affinity: 5, damageTaken: 49, skillIds: ['idle'] })],
      [makeMonster({ id: 'e', skillIds: ['strike'] })]
    )
    const after = run(state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
    })
    expect(after.party[0].affinity).toBe(4)
  })

  it('nghỉ và NPC hồi máu: mọi quái trong đội +1', () => {
    const state = makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a', affinity: 7, damageTaken: 10 })],
      money: 10_000
    })
    expect(run(state, { type: 'healParty' }).party[0].affinity).toBe(8)
    expect(run(state, { type: 'rest' }).party[0].affinity).toBe(8)
  })

  it('thuốc hồi máu thật +2; kẹo +1 mỗi viên', () => {
    const state = {
      ...makeGameState({
        seed: 1,
        party: [makeMonster({ id: 'a', affinity: 0, damageTaken: 10 })]
      }),
      inventory: makeInventory({ potion: 1, expCandyS: 3 })
    }
    expect(
      run(state, { type: 'useItem', itemId: 'potion', monsterId: 'a' }).party[0].affinity
    ).toBe(2)
    const fed = run(state, { type: 'useItem', itemId: 'expCandyS', monsterId: 'a', count: 3 })
    expect(fed.party[0].affinity).toBe(3)
  })

  it('addAffinity: +20; đã 255 thì không có tác dụng, không mất vật phẩm', () => {
    const state = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a', affinity: 240 })] }),
      inventory: makeInventory({ treat: 1 })
    }
    const fed = run(state, { type: 'useItem', itemId: 'treat', monsterId: 'a' })
    expect(fed.party[0].affinity).toBe(255)
    expect(fed.inventory.stacks.treat).toBeUndefined()
    const full = { ...fed, inventory: makeInventory({ treat: 1 }) }
    expectActionError(
      () => run(full, { type: 'useItem', itemId: 'treat', monsterId: 'a' }),
      'itemNoEffect'
    )
  })
})

describe('thân mật khởi đầu', () => {
  const capture = (itemId: string): Monster => {
    const state = {
      ...makeBattleState(
        [makeMonster({ id: 'a' })],
        [makeMonster({ id: 'w', skillIds: ['idle'] })]
      ),
      inventory: makeInventory({ [itemId]: 1 })
    }
    const after = run(state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'item', itemId, targetId: 'w' }]
    })
    return defined(
      [...after.party, ...after.storage].find((m) => m.id === 'w'),
      'quái bắt'
    )
  }

  it('bắt bằng bóng thường 50, Hữu Nghị Cầu 150', () => {
    expect(capture('masterBall').affinity).toBe(50)
    expect(capture('friendBall').affinity).toBe(150)
  })

  it('trứng breeding 120; fuse lấy cao hơn của hai quái', () => {
    const state = {
      ...makeGameState({
        seed: 3,
        party: [makeMonster({ id: 'f', gender: 'male', affinity: 0 })],
        money: 1000,
        nextMonsterId: 50
      }),
      storage: [makeMonster({ id: 'm', gender: 'female', affinity: 0 })]
    }
    const bred = run(state, { type: 'breed', fatherId: 'f', motherId: 'm' })
    expect(bred.eggs[0].monster.affinity).toBe(120)
    const base = makeMonster({ id: 'a', affinity: 30 })
    const sub = makeMonster({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      affinity: 90
    })
    expect(fuseMonsters(data, createRng(1), base, sub)[0].affinity).toBe(90)
  })
})

describe('MonsterView, kiểm tra quái, save', () => {
  it('MonsterView có điểm và mức thân mật', () => {
    const view = buildMonsterView(data, makeMonster({ affinity: 150 }), {
      location: 'party',
      index: 0,
      equipmentSlots: 3,
      scene: { party: [], place: null, aptitudeFloor: 1, time: 0 }
    })
    expect(view).toMatchObject({ affinity: 150, affinityTierId: 'familiar' })
  })

  it('thân mật ngoài 0–255 hoặc lẻ: báo lỗi', () => {
    expect(validateMonster(data, makeMonster({ affinity: 256 }))).toEqual([
      'affinity tối đa 255, nhận 256'
    ])
    expect(validateMonster(data, makeMonster({ affinity: -1 }))).toHaveLength(1)
    expect(validateMonster(data, makeMonster({ affinity: 1.5 }))).toHaveLength(1)
  })

  it('migrate v27 → v28: quái người chơi 70, quái hoang 0, state hợp lệ', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const raw = serializeState(battle) as Record<string, unknown>
    const strip = (m: Record<string, unknown>): Record<string, unknown> => {
      const { affinity: _affinity, ...rest } = m
      return rest
    }
    const rawBattle = raw.battle as Record<string, unknown>
    const v27 = {
      ...raw,
      version: 27,
      party: (raw.party as Record<string, unknown>[]).map(strip),
      battle: { ...rawBattle, enemies: (rawBattle.enemies as Record<string, unknown>[]).map(strip) }
    }
    const migrated = migrateState(v27, data)
    expect(migrated.party[0].affinity).toBe(70)
    expect(defined(migrated.battle).enemies[0].affinity).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('thân mật cao không đổi chỉ số (mức chỉ có hook EXP / trụ lại)', () => {
    expect(computeStats(data, makeMonster({ affinity: 255 })).final.hp).toEqual(toBig(50))
  })
})
