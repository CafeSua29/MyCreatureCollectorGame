// Thợ rèn (docs/rules/equipment-forge.md): cường hóa (giá, món đang lắp, số cực lớn), tẩy luyện
// (dòng khóa, dòng không tẩy được), phân giải (hoàn đá, hồn khí ra hồn tinh, unique, hàng loạt, món
// đang lắp bị chặn), đồ rơi boss, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, validateGameState } from '../game'
import { getMaxHp } from '../monster'
import {
  enhanceCost,
  enhanceStonesUsed,
  getItemCount,
  rerollCost,
  salvageYield,
  soulCrystalPoints
} from '../inventory'
import { toBig } from '../shared'
import {
  FIXTURE_ENHANCE_STONE_ID as ENHANCE,
  FIXTURE_REFINING_STONE_ID as REFINING,
  dataIssuesAfter,
  defined,
  equipped,
  expectActionError,
  makeBattleState,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  soulRelicItemId
} from '../testing'
import type {
  BattleCommand,
  EquipmentInstance,
  EquipmentRoll,
  GameAction,
  GameState,
  Monster
} from '../model'

const data = makeEquipmentData((raw) => {
  // Thêm dòng phụ thứ ba để tẩy luyện có chỗ đổi loại dòng.
  raw.equipmentAffixes.push({
    id: 'affixHp',
    weight: 1,
    hook: { type: 'statModifier', params: {} },
    valueParam: 'percent.hp',
    ranges: { rare: { min: 1, max: 99 }, epic: { min: 1, max: 99 }, unique: { min: 1, max: 99 } }
  })
})

const epic = (overrides: Partial<EquipmentInstance> = {}): EquipmentInstance =>
  makeEquipment({
    rarity: 'epic',
    rolls: [
      { lineId: 'main', value: 40 },
      { lineId: 'affixDefense', value: 40 },
      { lineId: 'affixSpeed', value: 40 }
    ],
    ...overrides
  })

function townState({
  stacks = {},
  equipment = [],
  party = [makeMonster({ id: 'a' })],
  money = 1e9
}: {
  stacks?: Record<string, number>
  equipment?: EquipmentInstance[]
  party?: Monster[]
  money?: number
} = {}): GameState {
  return {
    ...makeGameState({ seed: 7, party }),
    nextItemId: 100,
    money: toBig(money),
    inventory: makeInventory(stacks, [], equipment)
  }
}

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)
const bagItem = (state: GameState, id = 'e1'): EquipmentInstance =>
  defined(state.inventory.equipment.find((entry) => entry.id === id))
const lineIds = (rolls: readonly EquipmentRoll[]): string[] => rolls.map((roll) => roll.lineId)

describe('cường hóa', () => {
  it('giá cấp n → n + 1: enhanceBase × hệ số bậc × n² tiền + n đá', () => {
    expect(enhanceCost(data, makeEquipment({ level: 1 }))).toEqual({
      money: toBig(50),
      stones: 1,
      cores: 0
    })
    const cost = enhanceCost(data, epic({ level: 3 }))
    expect(cost.money.eq(50 * 10 * 9)).toBe(true)
    expect(cost.stones).toBe(3)
  })

  it('món trong túi lên 1 cấp, trừ tiền và đá', () => {
    const state = townState({ stacks: { [ENHANCE]: 5 }, equipment: [makeEquipment()], money: 100 })
    const next = act(state, { type: 'enhanceEquipment', instanceId: 'e1' })
    expect(bagItem(next).level).toBe(2)
    expect(getItemCount(next.inventory, ENHANCE)).toBe(4)
    expect(next.money.eq(50)).toBe(true)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('món đang lắp trên quái ở kho cũng cường hóa được, vẫn nằm trên quái', () => {
    const wearer = makeMonster({ id: 'b', equipment: [equipped(makeEquipment())] })
    const state = { ...townState({ stacks: { [ENHANCE]: 1 } }), storage: [wearer] }
    const next = act(state, { type: 'enhanceEquipment', instanceId: 'e1' })
    const entry = defined(next.storage[0].equipment[0])
    expect(entry.storage === 'instance' && entry.instance.level).toBe(2)
  })

  it('cấp cực lớn: giá Decimal, không Infinity / NaN', () => {
    const cost = enhanceCost(data, makeEquipment({ rarity: 'unique', level: 1e15 }))
    expect(cost.money.eq(toBig(50).times(50).times(1e30))).toBe(true)
    expect(cost.stones).toBe(1e15)
  })

  it('lỗi: thiếu đá / tiền, không có món, ngoài thị trấn, trong trận (state giữ nguyên)', () => {
    const state = townState({ stacks: { [ENHANCE]: 1 }, equipment: [makeEquipment()], money: 10 })
    const enhance = (s: GameState, instanceId = 'e1'): GameState =>
      act(s, { type: 'enhanceEquipment', instanceId })
    expectActionError(() => enhance(state), 'notEnoughMoney')
    expectActionError(() => enhance({ ...state, inventory: makeInventory() }), 'equipmentNotFound')
    expectActionError(
      () => enhance({ ...state, money: toBig(1e9), inventory: makeInventory({}, [], [epic()]) }),
      'notEnoughItem',
      { itemId: ENHANCE, need: 1 }
    )
    expectActionError(() => enhance(state, 'e9'), 'equipmentNotFound', { instanceId: 'e9' })
    expectActionError(
      () => enhance({ ...state, location: { type: 'floor', floor: 1 } }),
      'notInTown'
    )
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'x' })])
    expectActionError(() => enhance(battle), 'inBattle')
  })
})

describe('tẩy luyện', () => {
  it('giá: (1 + số dòng khóa) × hệ số bậc', () => {
    expect(rerollCost(data, epic(), 0)).toBe(3)
    expect(rerollCost(data, epic(), 1)).toBe(6)
  })

  it('tung lại mọi dòng phụ: dòng chính giữ nguyên, không trùng dòng, tốn đá', () => {
    const state = townState({ stacks: { [REFINING]: 10 }, equipment: [epic()] })
    const next = act(state, { type: 'rerollEquipmentAffixes', instanceId: 'e1' })
    const rolls = bagItem(next).rolls
    expect(rolls[0]).toEqual({ lineId: 'main', value: 40 })
    expect(rolls).toHaveLength(3)
    expect(new Set(lineIds(rolls)).size).toBe(3)
    expect(getItemCount(next.inventory, REFINING)).toBe(7)
    expect(next.rng).not.toEqual(state.rng)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('dòng khóa giữ nguyên, dòng còn lại không trùng dòng khóa; giá tăng theo số khóa', () => {
    let state = townState({ stacks: { [REFINING]: 600 }, equipment: [epic()] })
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      state = act(state, {
        type: 'rerollEquipmentAffixes',
        instanceId: 'e1',
        lockedLineIndexes: [1]
      })
      const rolls = bagItem(state).rolls
      expect(rolls[1]).toEqual({ lineId: 'affixDefense', value: 40 })
      expect(rolls[2].lineId).not.toBe('affixDefense')
      seen.add(rolls[2].lineId)
    }
    // Ngẫu nhiên tối đa: mọi dòng hợp lệ đều có cơ hội ra.
    expect([...seen].sort()).toEqual(['affixHp', 'affixSpeed'])
    expect(getItemCount(state.inventory, REFINING)).toBe(0)
  })

  it('món đang lắp tẩy luyện được', () => {
    const wearer = makeMonster({ id: 'a', equipment: [equipped(epic())] })
    const state = townState({ stacks: { [REFINING]: 3 }, party: [wearer] })
    const next = act(state, { type: 'rerollEquipmentAffixes', instanceId: 'e1' })
    expect(getItemCount(next.inventory, REFINING)).toBe(0)
    expect(next.party[0].equipment).toHaveLength(1)
  })

  it('lỗi: khóa dòng chính / dòng unique / dòng hồn, khóa hết, không có dòng phụ, dòng sai, thiếu đá', () => {
    const state = townState({ stacks: { [REFINING]: 100 }, equipment: [epic()] })
    const reroll = (s: GameState, lockedLineIndexes?: unknown): GameState =>
      gameReducer(data, s, {
        type: 'rerollEquipmentAffixes',
        instanceId: 'e1',
        // Cố ý gửi dữ liệu sai dạng như renderer có thể gửi.
        lockedLineIndexes: lockedLineIndexes as number[]
      })
    expectActionError(() => reroll(state, [0]), 'lineNotRerollable', { lineIndex: 0 })
    expectActionError(() => reroll(state, [1, 2]), 'nothingToReroll', { instanceId: 'e1' })
    expectActionError(() => reroll(state, [3]), 'malformedAction')
    expectActionError(() => reroll(state, [1, 1]), 'malformedAction')
    expectActionError(() => reroll(state, 'x'), 'malformedAction')
    const plain = { ...state, inventory: makeInventory({ [REFINING]: 9 }, [], [makeEquipment()]) }
    expectActionError(() => reroll(plain), 'nothingToReroll')
    const crown = makeEquipment({
      baseItemId: 'stronglingCrown',
      rarity: 'unique',
      rolls: [
        { lineId: 'main', value: 10 },
        { lineId: 'crownSpeed', value: 25 },
        { lineId: 'affixDefense', value: 60 }
      ]
    })
    const withCrown = { ...state, inventory: makeInventory({ [REFINING]: 100 }, [], [crown]) }
    expectActionError(() => reroll(withCrown, [1]), 'lineNotRerollable', { lineIndex: 1 })
    expect(bagItem(reroll(withCrown)).rolls.slice(0, 2)).toEqual(crown.rolls.slice(0, 2))
    const poor = { ...state, inventory: makeInventory({ [REFINING]: 2 }, [], [epic()]) }
    expectActionError(() => reroll(poor), 'notEnoughItem', { itemId: REFINING, need: 3 })
  })
})

describe('phân giải', () => {
  it('đá theo bậc + hoàn 50% đá đã cường hóa; hồn khí thêm hồn tinh', () => {
    expect(enhanceStonesUsed(1)).toBe(0)
    expect(enhanceStonesUsed(5)).toBe(10)
    expect(salvageYield(data, makeEquipment({ level: 5 }))).toEqual({
      enhanceStones: 1 + 5,
      refiningChance: 2,
      soulPoints: 0
    })
    const relic = makeEquipment({
      baseItemId: soulRelicItemId('attack'),
      rarity: 'epic',
      soul: {
        speciesId: 'weakling',
        raceId: 'neutral',
        nickname: null,
        traitId: null,
        history: null
      }
    })
    expect(salvageYield(data, relic).soulPoints).toBe(5)
    // Cấp cực lớn: số đá kẹp ở số nguyên an toàn.
    expect(salvageYield(data, makeEquipment({ level: 1e12 })).enhanceStones).toBe(
      Number.MAX_SAFE_INTEGER
    )
  })

  it('hàng loạt: món mất khỏi túi, nhận đá; unique luôn ra Tẩy luyện thạch; hồn khí ra hồn tinh', () => {
    const relic = makeEquipment({
      id: 'e3',
      baseItemId: soulRelicItemId('attack'),
      rarity: 'legendary',
      soul: {
        speciesId: 'weakling',
        raceId: 'neutral',
        nickname: null,
        traitId: null,
        history: null
      }
    })
    const crown = makeEquipment({
      id: 'e2',
      baseItemId: 'stronglingCrown',
      rarity: 'unique',
      rolls: [
        { lineId: 'main', value: 10 },
        { lineId: 'crownSpeed', value: 25 }
      ]
    })
    const keep = makeEquipment({ id: 'e4' })
    const state = townState({ equipment: [makeEquipment({ level: 3 }), crown, relic, keep] })
    const next = act(state, { type: 'salvageEquipment', instanceIds: ['e1', 'e2', 'e3'] })
    expect(next.inventory.equipment.map((entry) => entry.id)).toEqual(['e4'])
    // common cấp 3: 1 + ⌊3 × 50%⌋ = 2; unique 30; legendary 16.
    expect(getItemCount(next.inventory, ENHANCE)).toBe(2 + 30 + 16)
    expect(getItemCount(next.inventory, REFINING)).toBeGreaterThanOrEqual(1)
    expect(soulCrystalPoints(data, next.inventory)).toBe(8)
    // Log ngoài trận: tổng thứ nhận được của cả lần (docs/rules/game-log.md).
    expect(next.log).toEqual([
      {
        type: 'equipmentSalvaged',
        instanceIds: ['e1', 'e2', 'e3'],
        enhanceStones: 48,
        refiningStones: getItemCount(next.inventory, REFINING),
        soulPoints: 8,
        spirits: 0
      }
    ])
    expect(validateGameState(data, next)).toEqual([])
  })

  it('lỗi: món đang lắp, không có món, danh sách rỗng / trùng / sai dạng, ngoài thị trấn', () => {
    const wearer = makeMonster({ id: 'a', equipment: [equipped(makeEquipment({ id: 'e2' }))] })
    const state = townState({ equipment: [makeEquipment()], party: [wearer] })
    const salvage = (s: GameState, instanceIds: unknown): GameState =>
      // Cố ý gửi dữ liệu sai dạng như renderer có thể gửi.
      gameReducer(data, s, { type: 'salvageEquipment', instanceIds: instanceIds as string[] })
    expectActionError(() => salvage(state, ['e1', 'e2']), 'equipmentEquipped', {
      instanceId: 'e2',
      monsterId: 'a'
    })
    expectActionError(() => salvage(state, ['e9']), 'equipmentNotFound')
    expectActionError(() => salvage(state, []), 'malformedAction')
    expectActionError(() => salvage(state, ['e1', 'e1']), 'malformedAction')
    expectActionError(() => salvage(state, [1]), 'malformedAction')
    expectActionError(
      () => salvage({ ...state, location: { type: 'floor', floor: 1 } }, ['e1']),
      'notInTown'
    )
  })
})

describe('đồ rơi', () => {
  it('boss rơi đá theo config.forge.bossDrops; quái thường thì không', () => {
    const raw = makeRawData()
    raw.config.forge.bossDrops = [{ itemId: ENHANCE, chance: 100 }]
    const drops = createGameData(raw)
    const fight = (isBoss: boolean): GameState => {
      const enemy = makeMonster({ id: 'boss', skillIds: ['idle'] })
      const dying = { ...enemy, damageTaken: getMaxHp(drops, enemy).minus(1) }
      const hero = makeMonster({ id: 'a', level: 50, skillIds: ['strike'] })
      const state = makeBattleState([hero], [dying], { isBoss })
      const command: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
      return gameReducer(drops, state, { type: 'submitTurn', commands: [command] })
    }
    expect(getItemCount(fight(true).inventory, ENHANCE)).toBe(1)
    expect(getItemCount(fight(false).inventory, ENHANCE)).toBe(0)
  })
})

describe('kiểm tra dữ liệu config.forge', () => {
  it('dữ liệu fixture hợp lệ; đá không tồn tại, bảng thiếu bậc, tỉ lệ sai, trường lạ thì báo lỗi', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
    const issues = dataIssuesAfter((raw) => {
      const forge = raw.config.forge
      raw.config.forge = {
        ...forge,
        enhanceStoneItemId: 'nope',
        rerollCost: { ...forge.rerollCost, unique: -1 },
        salvageRefiningChance: { ...forge.salvageRefiningChance, epic: 101 },
        bossDrops: [{ itemId: 'nope', chance: 5 }],
        // Trường lạ để kiểm tra checkKnownFields.
        ...({ extra: 1 } as object)
      }
    })
    expect(issues.some((issue) => issue.includes('config.forge.enhanceStoneItemId'))).toBe(true)
    expect(issues.some((issue) => issue.includes('config.forge.rerollCost.unique'))).toBe(true)
    expect(issues.some((issue) => issue.includes('salvageRefiningChance.epic'))).toBe(true)
    expect(issues.some((issue) => issue.includes('config.forge.bossDrops'))).toBe(true)
    expect(issues.some((issue) => issue.includes('extra'))).toBe(true)
  })
})
