// Phi thăng và thiên mệnh (docs/rules/ascension.md).

import { describe, expect, it } from 'vitest'
import { ActionError, toBig } from '../shared'
import {
  ascensionEssenceReward,
  ascensionKeptMoney,
  ascensionStartFloor,
  capacityOf,
  contractStatPercent,
  destinySlotCount,
  gameDataFor,
  tamerBonusAmount,
  tamerTalentPointsEarned
} from '../registries'
import { equipmentSlotCount, addItems } from '../inventory'
import { cloneDraft, monsterBattleContext } from '../battle/draft'
import { maxMana } from '../tamer'
import { maxInstabilityLevel } from '../world'
import {
  defined,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster,
  makeRawData
} from '../testing'
import {
  bestFloorReached,
  bestRealmReached,
  type GameAction,
  type GameState,
  type Monster,
  type MonsterBattleContext
} from '../model'
import { createGameData } from '../gameData'
import { gameReducer } from './reducer'
import { createNewGame, rollStarters } from './newGame'
import { chooseDestinies, rollNewGameDestinies } from './ascension'
import { validateGameState } from './validateGameState'
import { migrateState } from './migrate'
import { serializeState } from './save'

const data = makeData()
const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

/** Game đã mở `floors` tầng, đội một quái level 50, có tiền, đang ở thị trấn. */
function readyState(floors = 4, overrides: Partial<GameState> = {}): GameState {
  const state = makeGameState({
    seed: 3,
    party: [makeMonster({ id: 'a', level: 50, maxLevelReached: 50 })],
    nextMonsterId: 10
  })
  const biomeId = state.floorBiomeIds[0]
  return {
    ...state,
    highestFloor: floors,
    floorBiomeIds: Array.from({ length: floors }, () => biomeId),
    money: toBig(1000),
    ...overrides
  }
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(ActionError)
    expect((error as ActionError).code).toBe(code)
    return
  }
  throw new Error(`phải ném ${code}`)
}

describe('điều kiện phi thăng', () => {
  it('chưa đủ tầng, đang ở tầng hoặc đang trong trận thì lỗi, state giữ nguyên', () => {
    const low = readyState(3)
    expectCode(() => run(low, { type: 'ascend' }), 'ascensionLocked')
    const onFloor = readyState(4, { location: { type: 'floor', floor: 1 } })
    expectCode(() => run(onFloor, { type: 'ascend' }), 'notInTown')
  })

  it('đủ tầng (biên minFloor) thì phi thăng được', () => {
    expect(run(readyState(4), { type: 'ascend' }).ascension.count).toBe(1)
  })
})

describe('Tiên nguyên', () => {
  it('đường cong căn bậc hai theo tầng cao nhất, nhân theo tổng tầng thức tỉnh', () => {
    expect(ascensionEssenceReward(data, readyState(4)).toNumber()).toBe(10)
    expect(ascensionEssenceReward(data, readyState(16)).toNumber()).toBe(20)
    const awakened = readyState(4, {
      party: [makeMonster({ id: 'a', awakening: 100 })]
    })
    expect(ascensionEssenceReward(data, awakened).toNumber()).toBe(20)
  })

  it('không vượt thành tích thì không thêm; vượt thì chỉ nhận phần chênh', () => {
    const first = run(readyState(4), { type: 'ascend' })
    const chosen = run(first, { type: 'chooseDestinies', destinyIds: [] })
    expect(chosen.ascension.immortalEssence.toNumber()).toBe(10)
    const again = run(readyState(4, { ascension: chosen.ascension }), { type: 'ascend' })
    expect(again.ascension.immortalEssence.toNumber()).toBe(10)
    const further = readyState(16, { ascension: chosen.ascension })
    expect(ascensionEssenceReward(data, further).toNumber()).toBe(10)
  })

  it('tầng cực lớn vẫn hữu hạn', () => {
    const huge = readyState(4, { highestFloor: Number.MAX_SAFE_INTEGER })
    expect(ascensionEssenceReward(data, huge).isFinite()).toBe(true)
  })
})

describe('reset và giữ', () => {
  const before = readyState(8, {
    inventory: addItems(addItems(readyState().inventory, 'potion', 5), 'megaRing', 1),
    tamer: { ...readyState().tamer, realm: 3, exp: toBig(77), talentRanks: { drill: 1 } },
    tower: { highest: 9 },
    storage: [makeMonster({ id: 'b', level: 30, assignment: { kind: 'dwelling', id: 'x' } })],
    dex: readyState().dex
  })
  const after = run(before, { type: 'ascend' })

  it('tiến trình chính về đầu', () => {
    expect(after.highestFloor).toBe(1)
    expect(after.floorBiomeIds).toEqual([before.floorBiomeIds[0]])
    expect(after.location).toEqual({ type: 'town' })
    expect(after.money.toNumber()).toBe(0)
    expect(after.tamer.realm).toBe(0)
    expect(after.tamer.exp.toNumber()).toBe(0)
    expect(after.tower.highest).toBe(0)
    expect(after.inventory.stacks.potion).toBeUndefined()
    // Vật phẩm chìa khóa giữ qua phi thăng.
    expect(after.inventory.stacks.megaRing).toBe(1)
  })

  it('quái về level 1, hồi đầy, hết việc, giữ mọi thuộc tính khác và level cao nhất', () => {
    const [monster] = after.party
    expect(monster.level).toBe(1)
    expect(monster.maxLevelReached).toBe(50)
    expect(monster.genes).toEqual(before.party[0].genes)
    expect(after.storage[0].assignment).toBeNull()
  })

  it('giữ cấp thiên phú, không tụt điểm thiên phú theo cảnh giới', () => {
    expect(after.tamer.talentRanks).toEqual({ drill: 1 })
    expect(tamerTalentPointsEarned(data, after)).toBe(tamerTalentPointsEarned(data, before))
    expect(bestRealmReached(after)).toBe(3)
    expect(bestFloorReached(after)).toBe(8)
  })

  it('mở khóa vĩnh viễn không tụt', () => {
    expect(equipmentSlotCount(data, after)).toBe(equipmentSlotCount(data, before))
    expect(capacityOf(data, after, 'storage')).toBe(capacityOf(data, before, 'storage'))
    expect(maxInstabilityLevel(data, after)).toBe(maxInstabilityLevel(data, before))
  })

  it('state sau phi thăng và sau khi chọn thiên mệnh đều hợp lệ, không đổi state cũ', () => {
    expect(validateGameState(data, after)).toEqual([])
    const chosen = run(after, { type: 'chooseDestinies', destinyIds: [] })
    expect(validateGameState(data, chosen)).toEqual([])
    expect(before.highestFloor).toBe(8)
  })

  it('đồ ký gửi về túi, giá đã đặt bỏ', () => {
    const instance = {
      id: 'e1',
      baseItemId: 'ironBlade',
      rarity: 'common' as const,
      level: 1,
      rolls: []
    }
    const withAuction: GameState = {
      ...before,
      nextItemId: 5,
      auction: {
        ...before.auction,
        consignments: [
          {
            id: 'c1',
            entry: { storage: 'instance', instance },
            count: 1,
            reservePrice: toBig(1)
          }
        ]
      }
    }
    const done = run(withAuction, { type: 'ascend' })
    expect(done.auction.consignments).toEqual([])
    expect(done.inventory.equipment.map((item) => item.id)).toContain('e1')
  })
})

describe('Tiên giới', () => {
  it('mua cấp: trừ Tiên nguyên theo cấp, hiệu ứng vào kênh thưởng', () => {
    const rich = readyState(4)
    const state: GameState = {
      ...rich,
      ascension: { ...rich.ascension, immortalEssence: toBig(10) }
    }
    const one = run(state, { type: 'buyAscensionUpgrade', upgradeId: 'immortalMight' })
    expect(one.ascension.immortalEssence.toNumber()).toBe(8)
    const two = run(one, { type: 'buyAscensionUpgrade', upgradeId: 'immortalMight' })
    expect(two.ascension.immortalEssence.toNumber()).toBe(4)
    expect(tamerBonusAmount(data, two, 'teamStatPercent')).toBe(10)
  })

  it('id lạ, thiếu Tiên nguyên, đạt trần thì lỗi', () => {
    const state = readyState(4)
    expectCode(
      () => run(state, { type: 'buyAscensionUpgrade', upgradeId: 'x' }),
      'unknownAscensionUpgrade'
    )
    expectCode(
      () => run(state, { type: 'buyAscensionUpgrade', upgradeId: 'immortalMight' }),
      'notEnoughImmortalEssence'
    )
    const capped: GameState = {
      ...state,
      ascension: {
        ...state.ascension,
        immortalEssence: toBig(1e6),
        upgrades: { fateVessel: 2 }
      }
    }
    expectCode(
      () => run(capped, { type: 'buyAscensionUpgrade', upgradeId: 'fateVessel' }),
      'talentMaxRank'
    )
  })

  it('tầng khởi đầu theo % tầng cao nhất, có trần; map và đạo quán của các tầng đó có sẵn', () => {
    const base = readyState(20)
    const withRank = (rank: number): GameState => ({
      ...base,
      ascension: { ...base.ascension, upgrades: { shortcutPath: rank } }
    })
    expect(ascensionStartFloor(data, base)).toBe(1)
    expect(ascensionStartFloor(data, withRank(1))).toBe(5)
    // 20 cấp × 25% vượt trần 50%.
    expect(ascensionStartFloor(data, withRank(20))).toBe(10)
    const after = run(withRank(1), { type: 'ascend' })
    expect(after.highestFloor).toBe(5)
    expect(after.floorBiomeIds).toHaveLength(5)
    expect(validateGameState(data, after)).toEqual([])
  })

  it('bắt đầu cao hơn số tầng đang mở (thành tích cũ) thì tung thêm map', () => {
    const base = readyState(4)
    const state: GameState = {
      ...base,
      ascension: { ...base.ascension, bestFloor: 100, upgrades: { shortcutPath: 1 } }
    }
    const after = run(state, { type: 'ascend' })
    expect(after.highestFloor).toBe(25)
    expect(after.floorBiomeIds).toHaveLength(25)
    expect(validateGameState(data, after)).toEqual([])
  })

  it('giữ lại % tiền, có trần, làm tròn xuống', () => {
    const base = readyState(4, { money: toBig(1001) })
    const withRank = (rank: number): GameState => ({
      ...base,
      ascension: { ...base.ascension, upgrades: { hiddenTreasury: rank } }
    })
    expect(ascensionKeptMoney(data, withRank(1)).toNumber()).toBe(250)
    expect(ascensionKeptMoney(data, withRank(20)).toNumber()).toBe(500)
  })
})

describe('thiên mệnh', () => {
  it('lựa chọn lúc tạo game tất định theo seed, không đổi quái khởi đầu', () => {
    expect(rollNewGameDestinies(data, 5)).toEqual(rollNewGameDestinies(data, 5))
    expect(rollNewGameDestinies(data, 5)).toHaveLength(3)
    expect(new Set(rollNewGameDestinies(data, 5)).size).toBe(3)
    const { candidates } = rollStarters(data, 5)
    const speciesId = candidates[0].speciesId
    const options = {
      seed: 5,
      starterSpeciesId: speciesId,
      gender: candidates[0].gender,
      nickname: null
    }
    const plain = createNewGame(data, options)
    const destinyIds = [rollNewGameDestinies(data, 5)[0]]
    const chosen = createNewGame(data, { ...options, destinyIds })
    expect(chosen.destinies).toEqual(destinyIds)
    expect(plain.destinies).toEqual([])
    expect(chosen.party).toEqual(plain.party)
    expect(chosen.rng).toBe(plain.rng)
  })

  it('tạo game: id ngoài lựa chọn, quá số ô, trùng thì lỗi', () => {
    const { candidates } = rollStarters(data, 5)
    const options = {
      seed: 5,
      starterSpeciesId: candidates[0].speciesId,
      gender: candidates[0].gender,
      nickname: null
    }
    const offered = rollNewGameDestinies(data, 5)
    expectCode(() => createNewGame(data, { ...options, destinyIds: ['x'] }), 'notDestinyChoice')
    expectCode(() => createNewGame(data, { ...options, destinyIds: offered }), 'tooManyDestinies')
    expectCode(
      () => createNewGame(data, { ...options, destinyIds: [offered[0], offered[0]] }),
      'malformedAction'
    )
  })

  it('sau phi thăng phải chọn trước khi làm việc khác; mất thiên mệnh cũ', () => {
    const start = readyState(4, { destinies: ['killingStar'] })
    const after = run(start, { type: 'ascend' })
    expect(after.destinies).toEqual([])
    const choices = defined(after.ascension.destinyChoices, 'lựa chọn')
    expect(choices).toHaveLength(3)
    expectCode(() => run(after, { type: 'healParty' }), 'destinyChoicePending')
    const chosen = run(after, { type: 'chooseDestinies', destinyIds: [choices[0]] })
    expect(chosen.destinies).toEqual([choices[0]])
    expect(chosen.ascension.destinyChoices).toBeNull()
    expectCode(() => run(chosen, { type: 'chooseDestinies', destinyIds: [] }), 'noDestinyChoice')
  })

  it('Phàm nhân: chọn rỗng; quá số ô thì lỗi; nâng cấp thêm ô thì chọn được nhiều hơn', () => {
    const after = run(readyState(4), { type: 'ascend' })
    const choices = defined(after.ascension.destinyChoices, 'lựa chọn')
    expect(run(after, { type: 'chooseDestinies', destinyIds: [] }).destinies).toEqual([])
    expectCode(
      () => run(after, { type: 'chooseDestinies', destinyIds: choices.slice(0, 2) }),
      'tooManyDestinies'
    )
    const bigger: GameState = {
      ...after,
      ascension: { ...after.ascension, upgrades: { fateVessel: 1 } }
    }
    expect(destinySlotCount(data, bigger)).toBe(2)
    expect(
      run(bigger, { type: 'chooseDestinies', destinyIds: choices.slice(0, 2) }).destinies
    ).toHaveLength(2)
  })

  it('mọi thiên mệnh đều có cơ hội xuất hiện', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 300; seed++)
      rollNewGameDestinies(data, seed).forEach((id) => seen.add(id))
    expect(seen).toEqual(new Set(Object.keys(data.destinies)))
  })

  it('hiệu ứng qua kênh thưởng: có lợi kèm hại', () => {
    const state = readyState(4, { destinies: ['killingStar'] })
    expect(tamerBonusAmount(data, state, 'teamDamagePercent')).toBe(10)
    expect(tamerBonusAmount(data, state, 'catchRatePercent')).toBe(-20)
    // Id không còn trong dữ liệu thì bỏ qua.
    expect(tamerBonusAmount(data, { ...state, destinies: ['gone'] }, 'teamDamagePercent')).toBe(0)
  })

  it('Thiên Sát Cô Tinh: đội bớt ô, quái thừa về kho, giữ quái đầu đội', () => {
    const party = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeMonster({ id }))
    const base = readyState(4, { party })
    const pending: GameState = {
      ...base,
      ascension: { ...base.ascension, destinyChoices: ['lonelyStar'] }
    }
    const chosen = chooseDestinies(data, pending, ['lonelyStar'])
    const partySize = gameDataFor(data, chosen).config.partySize
    expect(partySize).toBe(data.config.partySize - 2)
    expect(chosen.party.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd'].slice(0, partySize))
    expect(chosen.storage).toHaveLength(party.length - partySize)
    // Gọi lại với dữ liệu đã đổi không trừ ô lần nữa.
    expect(gameDataFor(gameDataFor(data, chosen), chosen).config.partySize).toBe(partySize)
  })

  it('Thiên Sát Cô Tinh: kho không đủ chỗ thì lỗi, chọn cái khác được', () => {
    const party = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeMonster({ id }))
    const base = readyState(4, { party })
    const room = capacityOf(data, base, 'storage')
    const storage = Array.from({ length: room }, (_, i) => makeMonster({ id: `s${i}` }))
    const pending: GameState = {
      ...base,
      storage,
      ascension: { ...base.ascension, destinyChoices: ['lonelyStar', 'killingStar'] }
    }
    expectCode(() => chooseDestinies(data, pending, ['lonelyStar']), 'storageFullForParty')
    expect(chooseDestinies(data, pending, ['killingStar']).destinies).toEqual(['killingStar'])
  })

  it('Ngự Thú Thánh Thể: giá đột phá gấp đôi', () => {
    const inventory = addItems(readyState().inventory, 'breakthroughPill', 5)
    const state = (destinies: string[]): GameState =>
      readyState(4, {
        destinies,
        inventory,
        money: toBig(1e12),
        tamer: { ...readyState().tamer, exp: toBig(1e12) }
      })
    const paid = (s: GameState): number =>
      s.money.minus(run(s, { type: 'tamerBreakthrough' }).money).toNumber()
    expect(paid(state(['tamerSaintBody']))).toBe(paid(state([])) * 2)
  })
})

describe('kiểm tra dữ liệu và save', () => {
  it('dữ liệu sai: độ hiếm lạ, kênh lạ, trọng số 0', () => {
    const raw = makeRawData()
    const bad = {
      ...raw,
      destinies: [{ id: 'x', rarity: 'mythic', effects: [{ type: 'nope', params: {} }] }]
    }
    // Ép kiểu: test cố tình đưa dữ liệu sai vào hàm kiểm tra.
    expect(() => createGameData(bad as unknown as typeof raw)).toThrow(/độ hiếm lạ/)
    const zero = structuredClone(raw)
    zero.config.ascension.destiny.rarityWeights.epic = 0
    expect(() => createGameData(zero)).toThrow(/rarityWeights.epic/)
  })

  it('save: ascension / destinies sai thì báo lỗi', () => {
    const state = readyState(4)
    const issues = validateGameState(data, {
      ...state,
      destinies: ['gone'],
      ascension: { ...state.ascension, count: -1 }
    })
    expect(issues.join('\n')).toMatch(/thiên mệnh không tồn tại/)
    expect(issues.join('\n')).toMatch(/ascension.count/)
  })

  it('migrate save cũ: chưa phi thăng, Phàm nhân; Decimal đọc lại đúng', () => {
    const state = readyState(4)
    const {
      ascension: _ascension,
      destinies: _destinies,
      ...old
    } = serializeState(state) as Record<string, unknown>
    const migrated = migrateState({ ...old, version: 101 }, data)
    expect(migrated.destinies).toEqual([])
    expect(migrated.ascension.count).toBe(0)
    expect(migrated.ascension.immortalEssence.toNumber()).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
    const after = run(readyState(4), { type: 'ascend' })
    const loaded = migrateState(serializeState(after), data)
    expect(loaded.ascension.immortalEssence.eq(after.ascension.immortalEssence)).toBe(true)
  })
})

describe('hiệu ứng trong trận', () => {
  const contracted = (id: string): Monster => ({
    ...makeMonster({ id, level: 20 }),
    contractRealm: 10
  })
  const battle = (overrides: Partial<GameState>): GameState => ({
    ...makeBattleState([contracted('a')], [makeMonster({ id: 'x', level: 20 })]),
    ...overrides
  })
  const contextOf = (state: GameState): MonsterBattleContext =>
    defined(monsterBattleContext(data, cloneDraft(state), state.party[0]), 'bối cảnh trận')

  it('Sát Tinh tăng sát thương quái ta đúng 10%, không tăng của địch', () => {
    const state = battle({ destinies: ['killingStar'] })
    const draft = cloneDraft(state)
    expect(monsterBattleContext(data, draft, state.party[0])?.tamerBonusDamagePercent).toBe(10)
    expect(
      monsterBattleContext(data, draft, draft.battle.enemies[0])?.tamerBonusDamagePercent
    ).toBe(0)
    const dealt = (s: GameState): number => {
      const next = gameReducer(data, s, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: s.party[0].skillIds[0], target: 0 }]
      })
      return defined(next.battle).log.reduce(
        (sum, e) => (e.type === 'damage' && e.targetId === 'x' ? sum + Number(e.amount) : sum),
        0
      )
    }
    const plain = dealt(battle({}))
    expect(plain).toBeGreaterThan(0)
    expect(dealt(state) / plain).toBeCloseTo(1.1, 1)
  })

  it('nâng cấp và thiên mệnh % chỉ số cộng vào kênh chỉ số của phe người chơi', () => {
    const base = battle({})
    const withBoth = battle({
      destinies: ['lonelyStar'],
      ascension: { ...base.ascension, upgrades: { immortalMight: 2 } }
    })
    expect(contextOf(withBoth).tamerBonusStatPercent - contextOf(base).tamerBonusStatPercent).toBe(
      25
    )
  })

  it('Ngự Thú Thánh Thể tăng 50% phần cộng hưởng khế ước của quái', () => {
    const base = battle({})
    const resonance = contractStatPercent(data, base.party[0])
    expect(resonance).toBeGreaterThan(0)
    const holy = battle({ destinies: ['tamerSaintBody'] })
    expect(contextOf(holy).tamerBonusStatPercent).toBeCloseTo(resonance / 2)
  })

  it('kỹ năng mở theo cảnh giới cao nhất, linh lực theo cảnh giới hiện tại', () => {
    const base = readyState(4)
    const state = gameReducer(
      data,
      {
        ...base,
        location: { type: 'floor', floor: 1 },
        ascension: { ...base.ascension, bestRealm: 9 }
      },
      { type: 'startWildBattle' }
    )
    const tamer = defined(defined(state.battle).tamers.player, 'ngự thú sư')
    expect(tamer.realm).toBe(9)
    expect(tamer.mana).toBe(maxMana(data, 0))
  })
})
