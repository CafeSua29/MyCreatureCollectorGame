// Trang bị trong trận (mục "Trang bị và đồ cầm" ở equipment.md): boss mang món unique, rơi trang
// bị khi thắng, đi trước kiểu Quick Claw, gậy kéo dài trạng thái, gợi ý AI, Magic Room.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  atFloor,
  defined,
  equipped,
  makeBattleState,
  makeData,
  makeEquipment,
  makeEquipmentData,
  makeField,
  makeGameState,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  EquipmentInstance,
  GameData,
  GameState,
  Monster,
  RawGameData
} from '../model'
import { suggestBattleCommands } from './ai'
import { battleStats, type Draft } from './draft'

/** Dữ liệu có trang bị; tỉ lệ rơi đặt theo `rates` (mặc định không rơi gì). */
function gearData(
  rates: Partial<RawGameData['config']['equipment']> = {},
  edit: (raw: RawGameData) => void = () => {}
): GameData {
  return makeEquipmentData((raw) => {
    raw.config.equipment = {
      ...raw.config.equipment,
      dropChance: 0,
      bossDropChance: 0,
      uniqueCarriedDropChance: 0,
      uniquePoolDropChance: 0,
      ...rates
    }
    edit(raw)
  })
}

const data = gearData()

const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], ...overrides })

/** Quái hoang sắp gục (một đòn strike là hạ). */
const prey = (id: string, overrides: MonsterOverrides = {}): Monster =>
  fighter(id, {
    level: 4,
    exp: toBig(64),
    damageTaken: toBig(60),
    skillIds: ['idle'],
    ...overrides
  })

const strike: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
const run = (
  gameData: GameData,
  state: GameState,
  commands: BattleCommand[] = [strike]
): GameState => gameReducer(gameData, state, { type: 'submitTurn', commands })

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const crown = (id = 'e1'): EquipmentInstance =>
  makeEquipment({
    id,
    baseItemId: 'stronglingCrown',
    rarity: 'unique',
    rolls: [
      { lineId: 'main', value: 10 },
      { lineId: 'crownSpeed', value: 25 }
    ]
  })

describe('boss mang món unique', () => {
  const bossState = (): GameState =>
    atFloor(makeGameState({ seed: 3, party: [fighter('a')], highestFloor: 2 }), 2)

  it('boss có pool: mang đúng 1 món unique trong pool, id từ nextItemId', () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = { ...bossState(), rng: seed + 1, nextItemId: 7 }
      const next = gameReducer(data, state, { type: 'startWildBattle' })
      const [boss] = battleOf(next).enemies
      expect(battleOf(next).isBoss).toBe(true)
      expect(boss.equipment).toHaveLength(1)
      const [entry] = boss.equipment
      if (entry.storage !== 'instance') throw new Error('phải là món trang bị')
      expect(entry.instance.id).toBe('e7')
      expect(entry.instance.rarity).toBe('unique')
      expect(['stronglingCrown', 'stronglingRing']).toContain(entry.instance.baseItemId)
      expect(next.nextItemId).toBe(8)
    }
  })

  it('không có pool (dữ liệu không có trang bị): boss không mang gì, id không tăng', () => {
    const plain = makeData()
    const next = gameReducer(plain, bossState(), { type: 'startWildBattle' })
    expect(battleOf(next).enemies[0].equipment).toEqual([])
    expect(next.nextItemId).toBe(1)
  })

  it('món của boss có tác dụng trong trận (vương miện +25% tốc độ)', () => {
    const state = makeBattleState(
      [fighter('a')],
      [fighter('e1', { equipment: [equipped(crown())] })],
      {
        isBoss: true
      }
    )
    const d = { ...state, battle: battleOf(state) } as Draft
    const boss = battleOf(state).enemies[0]
    expect(battleStats(data, d, boss).speed.toNumber()).toBe(Math.floor(50 * 1.25))
  })
})

describe('rơi trang bị khi thắng', () => {
  it('quái hoang bị hạ: tỉ lệ rơi một món trong danh sách của map, vào túi, ghi log', () => {
    const always = gearData({ dropChance: 100 })
    const won = run(always, makeBattleState([fighter('a')], [prey('e1')]))
    expect(battleOf(won).outcome).toBe('won')
    expect(won.inventory.equipment).toHaveLength(1)
    const [sword] = won.inventory.equipment
    expect(sword).toMatchObject({ id: 'e1', baseItemId: 'sword', level: 1 })
    expect(eventsOf(won, 'equipmentDropped')).toEqual([
      { type: 'equipmentDropped', instanceId: 'e1', itemId: 'sword', rarity: sword.rarity }
    ])
    expect(won.nextItemId).toBe(2)
  })

  it('tỉ lệ 0 hoặc map không có danh sách: không rơi, không tốn RNG', () => {
    const never = run(data, makeBattleState([fighter('a')], [prey('e1')]))
    expect(never.inventory.equipment).toEqual([])
    const noList = gearData({ dropChance: 100 }, (raw) => {
      for (const biome of raw.biomes) delete biome.equipmentDrops
    })
    const state = makeBattleState([fighter('a')], [prey('e1')])
    const plain = run(noList, state)
    expect(plain.inventory.equipment).toEqual([])
    expect(plain.rng).toBe(run(makeData(), state).rng)
  })

  it('hạ boss: rơi món đang mang (giữ id, rời boss) và 1 món khác trong pool', () => {
    const rich = gearData({ uniqueCarriedDropChance: 100, uniquePoolDropChance: 100 })
    const wearer = prey('e1', {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      equipment: [equipped(crown('e3'))]
    })
    // Còn 1 máu (max HP đã gồm +10% của vương miện): một đòn là hạ.
    const boss = { ...wearer, damageTaken: getMaxHp(rich, wearer).minus(1) }
    const state = { ...makeBattleState([fighter('a')], [boss], { isBoss: true }), nextItemId: 4 }
    const won = run(rich, state)
    expect(won.inventory.equipment.map((item) => [item.id, item.baseItemId])).toEqual([
      ['e3', 'stronglingCrown'],
      ['e4', 'stronglingRing']
    ])
    expect(won.inventory.equipment[1].rarity).toBe('unique')
    expect(battleOf(won).enemies[0].equipment).toEqual([])
    expect(eventsOf(won, 'equipmentDropped')).toHaveLength(2)
  })

  it('bắt boss: quái bắt về giữ nguyên món đang mang, không tung pool', () => {
    const rich = gearData({ uniquePoolDropChance: 100 }, (raw) => {
      raw.config.battle = { ...raw.config.battle }
    })
    const boss = prey('e1', {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      equipment: [equipped(crown('e3'))]
    })
    const state = {
      ...makeBattleState([fighter('a')], [boss], { isBoss: true }),
      inventory: {
        stacks: { masterBall: 1 },
        crystals: [],
        books: [],
        equipment: [],
        souls: [],
        spirits: [],
        stickers: []
      },
      nextItemId: 4
    }
    const caught = run(rich, state, [
      { slot: 0, kind: 'item', itemId: 'masterBall', targetId: 'e1' }
    ])
    const captured = defined(
      caught.party.find((m) => m.id === 'e1'),
      'quái đã bắt'
    )
    expect(captured.equipment).toEqual([equipped(crown('e3'))])
    expect(caught.inventory.equipment).toEqual([])
  })
})

describe('hook trang bị trong trận', () => {
  it('Quick Claw 100%: đi trước quái nhanh hơn cùng mức priority, ghi log nguồn trang bị', () => {
    const claw = makeEquipment({
      id: 'e1',
      baseItemId: 'quickClaw',
      rolls: [{ lineId: 'main', value: 100 }]
    })
    const slow = fighter('a', { equipment: [equipped(claw)] })
    const fast = fighter('e1', {
      skillIds: ['strike'],
      genes: { hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 100 }
    })
    const next = run(data, makeBattleState([slow], [fast]))
    expect(eventsOf(next, 'useSkill').map((e) => e.monsterId)[0]).toBe('a')
    expect(eventsOf(next, 'traitTriggered')).toContainEqual({
      type: 'traitTriggered',
      monsterId: 'a',
      traitId: 'quickClaw',
      source: 'equipment'
    })
    const without = run(data, makeBattleState([fighter('a')], [fast]))
    expect(eventsOf(without, 'useSkill').map((e) => e.monsterId)[0]).toBe('e1')
  })

  it('actFirstChance có ngưỡng máu (kiểu Custap Berry): chỉ đi trước khi máu ≤ ngưỡng', () => {
    const custap = gearData({}, (raw) => {
      raw.traits.push({
        id: 'custap',
        kind: 'positive',
        hooks: [{ type: 'actFirstChance', params: { chance: 100, hpBelowPercent: 25 } }]
      })
    })
    const fast = fighter('e1', {
      skillIds: ['idle'],
      genes: { hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 100 }
    })
    const holder = fighter('a', { traits: [{ id: 'custap', level: 1 }] })
    const firstMover = (state: GameState): string =>
      eventsOf(run(custap, state), 'useSkill')[0].monsterId
    expect(firstMover(makeBattleState([holder], [fast]))).toBe('e1')
    const low = { ...holder, damageTaken: getMaxHp(custap, holder).times(0.8).floor() }
    expect(firstMover(makeBattleState([low], [fast]))).toBe('a')
  })

  it('gậy: trạng thái do quái mang gây ra +x lượt (độc 4 → 5 lượt)', () => {
    const staff = makeEquipment({
      id: 'e1',
      baseItemId: 'staff',
      rolls: [{ lineId: 'main', value: 1 }]
    })
    const caster = fighter('a', { skillIds: ['toxin'], equipment: [equipped(staff)] })
    const toxin: BattleCommand = { slot: 0, kind: 'skill', skillId: 'toxin', target: 0 }
    // Mục tiêu hệ nước (quái mẫu hệ cỏ miễn độc).
    const target = fighter('e1', { skillIds: ['idle'], elementIds: ['water'] })
    const next = run(data, makeBattleState([caster], [target]), [toxin])
    expect(eventsOf(next, 'statusApplied')).toContainEqual({
      type: 'statusApplied',
      monsterId: 'e1',
      statusId: 'poison',
      turns: 5
    })
  })

  it('gợi ý AI của món unique: skill gây trạng thái được chọn nhiều hơn hẳn', () => {
    const count = (equipment: Monster['equipment']): number => {
      let toxins = 0
      for (let seed = 1; seed <= 60; seed++) {
        const user = fighter('a', { skillIds: ['strike', 'toxin'], equipment })
        const foe = fighter('e1', { elementIds: ['water'] })
        const state = { ...makeBattleState([user], [foe]), rng: seed }
        const [command] = suggestBattleCommands(data, state)
        if (command.kind === 'skill' && command.skillId === 'toxin') toxins++
      }
      return toxins
    }
    expect(count([equipped(crown())])).toBeGreaterThan(count([]) + 20)
  })

  it('Magic Room: món trên quái trên sân không tác dụng', () => {
    const roomData = gearData({}, (raw) => {
      raw.fieldEffects.push({
        id: 'magicRoom',
        layer: 'room',
        duration: 5,
        hooks: [{ type: 'disableHeldItems', params: {} }]
      })
    })
    const wearer = fighter('a', { equipment: [equipped(makeEquipment())] })
    const plain = makeBattleState([wearer], [fighter('e1')])
    const room = makeBattleState([wearer], [fighter('e1')], {
      field: makeField({ rooms: [{ id: 'magicRoom', turnsLeft: 5 }] })
    })
    const attackIn = (state: GameState): number =>
      battleStats(roomData, { ...state, battle: battleOf(state) }, wearer).attack.toNumber()
    expect(attackIn(plain)).toBe(55)
    expect(attackIn(room)).toBe(50)
  })
})
