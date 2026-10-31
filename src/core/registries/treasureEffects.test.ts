// Thiên tài địa bảo (docs/rules/treasures.md): tăng gen theo tầng, kháng theo số lần ăn, khẩu vị
// race / hệ, yêu đan theo chỉ số gốc cao nhất, exp thuần thục cho skill chọn lúc dùng, cấp trait
// ngẫu nhiên, đồ rơi, kiểm tra dữ liệu, số cực lớn.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getMaxHp, masteryOf } from '../monster'
import { getItemCount } from '../inventory'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
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
import type { ConsumableItem, GameData, GameState, Monster, RawGameData } from '../model'
import { floorGeneMultiplier } from './aptitude'

const item = (
  id: string,
  effects: ConsumableItem['effects'],
  extra: Partial<ConsumableItem> = {}
): ConsumableItem => ({
  id,
  category: 'consumable',
  price: 100,
  use: 'field',
  target: 'ally',
  effects,
  ...extra
})

function makeTreasureData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.items.push(
    item('hpFruit', [{ type: 'addGenes', params: { stat: 'hp', amount: 10 } }]),
    item('allFruit', [{ type: 'addGenesAll', params: { amount: 10 } }], {
      favoriteRaceIds: ['neutral']
    }),
    item('fireCore', [{ type: 'addGenesTopStat', params: { amount: 10 } }], {
      favoriteElementIds: ['fire']
    }),
    item('tea', [{ type: 'addMasteryExp', params: { amount: 100 } }]),
    item('marrow', [{ type: 'traitLevelUp', params: { count: 2 } }])
  )
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeTreasureData()

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', raceId: 'brute', skillIds: ['strike', 'idle'], ...overrides })

const stateWith = (monster: Monster, highestFloor = 1): GameState => ({
  ...makeGameState({ seed: 4, party: [monster], highestFloor }),
  inventory: makeInventory({ hpFruit: 5, allFruit: 5, fireCore: 5, tea: 5, marrow: 5 })
})

const use = (
  state: GameState,
  itemId: string,
  extra: { skillId?: string } = {},
  gameData = data
): GameState => gameReducer(gameData, state, { type: 'useItem', itemId, monsterId: 'a', ...extra })
const partyOf = (state: GameState): Monster => defined(state.party[0])

describe('tăng gen', () => {
  it('một chỉ số: amount × hệ số gen của tầng cao nhất, làm tròn xuống', () => {
    const next = use(stateWith(hero(), 5), 'hpFruit')
    const gain = toBig(10).times(floorGeneMultiplier(data, 5)).floor()
    expect(partyOf(next).genes.hp.toString()).toBe(gain.plus(10).toString())
    expect(partyOf(next).genes.attack.toString()).toBe('10')
    expect(getItemCount(next.inventory, 'hpFruit')).toBe(4)
  })

  it('kháng: × 0,9 mỗi lần đã ăn đúng món (đếm itemUseCounts)', () => {
    const once = use(stateWith(hero()), 'hpFruit')
    const twice = use(once, 'hpFruit')
    // 10, rồi ⌊10 × 0,9⌋ = 9.
    expect(partyOf(twice).genes.hp.toString()).toBe('29')
    expect(partyOf(twice).itemUseCounts.hpFruit).toBe(2)
  })

  it('khẩu vị race: ×2 và + thân mật', () => {
    const next = use(stateWith(hero({ raceId: 'neutral' })), 'allFruit')
    expect(partyOf(next).genes.speed.toString()).toBe('30')
    expect(partyOf(next).affinity).toBe(5)
    const plain = use(stateWith(hero()), 'allFruit')
    expect(partyOf(plain).genes.speed.toString()).toBe('20')
    expect(partyOf(plain).affinity).toBe(0)
  })

  it('yêu đan: chỉ số gốc cao nhất của loài (hòa: chỉ số đầu), khẩu vị theo hệ', () => {
    const fire = use(stateWith(hero({ elementIds: ['fire'] })), 'fireCore')
    expect(partyOf(fire).genes.hp.toString()).toBe('30')
    const grass = use(stateWith(hero()), 'fireCore')
    expect(partyOf(grass).genes.hp.toString()).toBe('20')
  })

  it('gen rất lớn vẫn chính xác (Decimal)', () => {
    const big = hero({
      genes: { hp: '1e30', attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 }
    })
    expect(partyOf(use(stateWith(big), 'hpFruit')).genes.hp.toString()).toBe(
      toBig('1e30').plus(10).toString()
    )
  })

  it('hiệu quả về 0 (kháng quá nhiều lần) thì không có tác dụng, không mất vật phẩm', () => {
    const tired = hero({ itemUseCounts: { hpFruit: 100 } })
    expectActionError(() => use(stateWith(tired), 'hpFruit'), 'itemNoEffect')
  })
})

describe('Ngộ Đạo Trà', () => {
  it('exp thuần thục cho skill chọn lúc dùng', () => {
    const next = use(stateWith(hero()), 'tea', { skillId: 'strike' })
    expect(masteryOf(partyOf(next), 'strike').exp.toString()).toBe('100')
  })

  it('thiếu skillId / skill không biết / item không cần skill mà gửi skillId: báo lỗi', () => {
    expectActionError(() => use(stateWith(hero()), 'tea'), 'malformedAction')
    expectActionError(() => use(stateWith(hero()), 'tea', { skillId: 'blast' }), 'skillNotKnown')
    expectActionError(
      () => use(stateWith(hero()), 'hpFruit', { skillId: 'strike' }),
      'malformedAction'
    )
  })
})

describe('Tẩy Tủy Đan', () => {
  it('+count cấp cho một trait ngẫu nhiên (không shiny / boss), tất định theo seed', () => {
    const monster = hero({
      traits: [
        { id: 'mighty', level: 1 },
        { id: 'shiny', level: 1 }
      ],
      shinyStacks: 1
    })
    const next = use(stateWith(monster), 'marrow')
    expect(partyOf(next).traits).toEqual([
      { id: 'mighty', level: 3 },
      { id: 'shiny', level: 1 }
    ])
    expect(next.rng).not.toBe(stateWith(monster).rng)
  })

  it('không có trait nâng được thì không có tác dụng', () => {
    expectActionError(() => use(stateWith(hero()), 'marrow'), 'itemNoEffect')
  })
})

describe('đồ rơi', () => {
  it('quái hoang rơi wildDrops; boss rơi thêm bossDrops và yêu đan theo hệ đầu', () => {
    const drops = makeTreasureData((raw) => {
      raw.config.treasures = {
        ...raw.config.treasures,
        wildDrops: [{ itemId: 'hpFruit', chance: 100 }],
        bossDrops: [{ itemId: 'tea', chance: 100 }],
        demonCoreItemIds: { fire: 'fireCore' },
        demonCoreChance: 100
      }
    })
    const enemy = (id: string): Monster => {
      const monster = makeMonster({ id, skillIds: ['idle'], elementIds: ['fire'] })
      return { ...monster, damageTaken: getMaxHp(drops, monster).minus(1) }
    }
    const strike = { slot: 0, kind: 'skill' as const, skillId: 'strike', target: 0 }
    const wild = gameReducer(drops, makeBattleState([hero()], [enemy('e')]), {
      type: 'submitTurn',
      commands: [strike]
    })
    expect(getItemCount(wild.inventory, 'hpFruit')).toBe(1)
    expect(getItemCount(wild.inventory, 'fireCore')).toBe(0)
    const boss = { ...enemy('b'), bossMultiplier: 2 }
    const bossDying = { ...boss, damageTaken: getMaxHp(drops, boss).minus(1) }
    const won = gameReducer(drops, makeBattleState([hero()], [bossDying], { isBoss: true }), {
      type: 'submitTurn',
      commands: [strike]
    })
    expect(getItemCount(won.inventory, 'tea')).toBe(1)
    expect(getItemCount(won.inventory, 'fireCore')).toBe(1)
  })

  it('quái hoang rơi yêu đan của hệ đầu theo demonCoreWildChance (0: không rơi)', () => {
    const drops = makeTreasureData((raw) => {
      raw.config.treasures = {
        ...raw.config.treasures,
        demonCoreItemIds: { fire: 'fireCore' },
        demonCoreChance: 0,
        demonCoreWildChance: 100
      }
    })
    const monster = makeMonster({ id: 'e', skillIds: ['idle'], elementIds: ['fire'] })
    const dying = { ...monster, damageTaken: getMaxHp(drops, monster).minus(1) }
    const strike = { slot: 0, kind: 'skill' as const, skillId: 'strike', target: 0 }
    const wild = gameReducer(drops, makeBattleState([hero()], [dying]), {
      type: 'submitTurn',
      commands: [strike]
    })
    expect(getItemCount(wild.inventory, 'fireCore')).toBe(1)
    const boss = { ...dying, bossMultiplier: 2 }
    const bossDying = { ...boss, damageTaken: getMaxHp(drops, boss).minus(1) }
    const won = gameReducer(drops, makeBattleState([hero()], [bossDying], { isBoss: true }), {
      type: 'submitTurn',
      commands: [strike]
    })
    expect(getItemCount(won.inventory, 'fireCore')).toBe(0)
  })
})

describe('kiểm tra dữ liệu', () => {
  it('params sai, khẩu vị sai id, config sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.items.push(
          item('bad1', [{ type: 'addGenes', params: { stat: 'luck', amount: 1 } }]),
          item('bad2', [{ type: 'addGenesAll', params: { amount: 0 } }], {
            favoriteRaceIds: ['ghost']
          }),
          item('bad3', [{ type: 'traitLevelUp', params: { count: 0 } }], {
            favoriteElementIds: ['void']
          })
        )
        raw.config.treasures = { ...raw.config.treasures, resistance: 2, demonCoreChance: 101 }
      },
      { regenerateText: true }
    )
    const text = issues.join('\n')
    for (const fragment of [
      'stat',
      'amount',
      'favoriteRaceIds',
      'count',
      'favoriteElementIds',
      'config.treasures.resistance',
      'config.treasures.demonCoreChance'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })
})
