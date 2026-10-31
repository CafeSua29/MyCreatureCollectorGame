import { describe, expect, it } from 'vitest'
import {
  addItems,
  createGameData,
  expForLevel,
  getItemCount,
  getMaxHp,
  type GameState,
  type Monster
} from '@core'
import {
  makeBattleState,
  makeGameState,
  makeMonster,
  makeTeamData,
  defined,
  makeTeamRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '@core/testing'
import {
  breedWhenPossible,
  captureCommand,
  fuseWhenPossible,
  healWithItems,
  newGrowthCount,
  promoteChildren,
  releaseStaleFodder,
  applyFormations,
  intimidateCommand,
  recruitDecision,
  applyBaitWhenNeeded
} from './growth'

const data = makeTeamData()

const member = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id: 'h',
    level: 20,
    exp: expForLevel(20, 'mediumFast'),
    genes: uniformStats(50),
    skillIds: ['strike'],
    ...overrides
  })

/** Quái hoang loài khác cùng race (fuse được với weakling). */
const fodder = (id = 'f', damageTaken = 0): Monster =>
  makeMonster({
    id,
    speciesId: 'strongling',
    baseSpeciesId: 'strongling',
    elementIds: ['fire'],
    damageTaken
  })

/** Quái đã bắt về (lý lịch quái hoang). */
const caught = (monster: Monster): Monster => ({
  ...monster,
  history: {
    origin: { kind: 'wild', ballItemId: 'ball' },
    metDay: 0,
    metFloor: 1,
    metLevel: monster.level,
    milestones: []
  }
})

const town = (party: Monster[], storage: Monster[] = [], money = 1_000_000): GameState => ({
  ...makeGameState({ seed: 3, party, money }),
  storage
})

describe('growth: bắt quái làm nguyên liệu fuse', () => {
  it('ném bóng vào quái loài mới cùng race khi có bóng; không có bóng / đủ nguyên liệu thì không', () => {
    // Quái địch gần hết máu: tỉ lệ bắt cao (đầy máu thì thấp, phải đánh yếu trước).
    const weak = fodder('e1')
    const base = makeBattleState(
      [member()],
      [{ ...weak, damageTaken: getMaxHp(data, weak).minus(1) }]
    )
    // Có nhiều loại bóng: chọn bóng có tỉ lệ cao nhất.
    const withBall = {
      ...base,
      inventory: addItems(addItems(base.inventory, 'ball', 3), 'masterBall', 1)
    }
    expect(captureCommand(data, withBall, new Set(['h']))).toEqual({
      slot: 0,
      kind: 'item',
      itemId: 'masterBall',
      targetId: 'e1'
    })
    expect(captureCommand(data, base, new Set(['h']))).toBeNull()
    // Quái đầy máu, bóng thường ~2% (< ngưỡng minCatchChance): không ném.
    const healthy = makeBattleState([member()], [fodder('e1')])
    const weakChance = { ...healthy, inventory: addItems(healthy.inventory, 'ball', 3) }
    expect(captureCommand(data, weakChance, new Set(['h']))).toBeNull()
    const full = { ...withBall, storage: [1, 2, 3, 4].map((i) => caught(fodder(`s${i}`))) }
    expect(captureCommand(data, full, new Set(['h']))).toBeNull()
    // Cùng loài với quái đội mẫu: không có loài mới để fuse.
    const same = makeBattleState([member()], [makeMonster({ id: 'e2' })])
    const sameWithBall = { ...same, inventory: addItems(same.inventory, 'masterBall', 3) }
    expect(captureCommand(data, sameWithBall, new Set(['h']))).toBeNull()
  })
})

describe('growth: thả nguyên liệu không còn dùng được', () => {
  it('quái bắt về không fuse được cho ai thì thả; còn dùng được hoặc là con breeding thì giữ', () => {
    const useless = caught(makeMonster({ id: 'u' }))
    const useful = caught(fodder('f'))
    const after = releaseStaleFodder(data, town([member()], [useless, useful]), new Set(['h']))
    expect(after.storage.map((m) => m.id)).toEqual(['f'])
  })
})

describe('growth: fuse', () => {
  it('fuse quái đội mẫu với nguyên liệu trong kho (thành công hoặc thất bại, quái phụ mất)', () => {
    const count = newGrowthCount()
    const teamIds = new Set(['h'])
    const ally = member({ id: 'b' })
    const after = fuseWhenPossible(data, town([member(), ally], [fodder()]), teamIds, count)
    expect(count.fuses + count.fuseFails).toBe(1)
    expect(after.storage.some((m) => m.id === 'f')).toBe(false)
    if (count.fuses === 1) expect(after.party[0].lineage).toContain('strongling')
  })

  it('đội chỉ có quái gốc và không có Bùa Hộ Mệnh: không fuse (thất bại sẽ trống đội)', () => {
    const count = newGrowthCount()
    const after = fuseWhenPossible(data, town([member()], [fodder()]), new Set(['h']), count)
    // Fixture tỉ lệ < 100 khi khác loài: bỏ qua; = 100 thì fuse an toàn.
    expect(count.fuseFails).toBe(0)
    expect(after.party).toHaveLength(1)
  })

  it('không đủ tiền thì không fuse', () => {
    const count = newGrowthCount()
    const after = fuseWhenPossible(data, town([member()], [fodder()], 0), new Set(['h']), count)
    expect(count).toEqual({ ...newGrowthCount(), fuseSkips: { money: 1 } })
    expect(after.storage).toHaveLength(1)
  })
})

describe('growth: breeding và đưa con vào đội', () => {
  it('breed cặp đực / cái tốt nhất, tối đa một lần mỗi breedEveryDays ngày', () => {
    const count = newGrowthCount()
    const father = member({ id: 'm', gender: 'male' })
    const mother = member({ id: 'w', gender: 'female' })
    const state = town([father, mother])
    const first = breedWhenPossible(data, state, { lastBreedDay: -Infinity, count })
    expect(first.bred).toBe(true)
    expect(first.state.eggs).toHaveLength(1)
    expect(breedWhenPossible(data, first.state, { lastBreedDay: 0, count }).bred).toBe(false)
    expect(count.breeds).toBe(1)
  })

  it('con breeding trong kho mạnh hơn quái yếu nhất của đội mẫu thì thay vào đội', () => {
    const count = newGrowthCount()
    const teamIds = new Set(['h'])
    const child: Monster = {
      ...member({
        id: 'c',
        genes: uniformStats(500),
        level: 30,
        exp: expForLevel(30, 'mediumFast')
      }),
      history: {
        origin: { kind: 'egg', fatherSpeciesId: 'weakling', motherSpeciesId: 'weakling' },
        metDay: 0,
        metFloor: null,
        metLevel: 1,
        milestones: []
      }
    }
    const after = promoteChildren(data, town([member()], [child]), teamIds, count)
    expect(after.party.map((m) => m.id)).toEqual(['c'])
    expect([...teamIds]).toEqual(['c'])
    expect(count.promotions).toBe(1)
  })
})

describe('growth: trận pháp, hồi máu bằng vật phẩm', () => {
  it('học trận đồ trong túi và chọn trận pháp đội đủ yêu cầu', () => {
    const party = [
      member(),
      member({
        id: 'g',
        speciesId: 'strongling',
        baseSpeciesId: 'strongling',
        elementIds: ['fire']
      })
    ]
    const base = town(party)
    const state = { ...base, inventory: addItems(base.inventory, 'dualityScroll', 1) }
    const after = applyFormations(data, state)
    expect(after.formations.known).toContain('duality')
    expect(after.formations.active).toBe('duality')
  })

  it('quái dưới ngưỡng máu dùng thuốc trong túi; đủ máu thì giữ thuốc', () => {
    const maxHp = getMaxHp(data, member())
    const low = { ...member(), damageTaken: maxHp.times(0.8).floor() }
    const base = town([low])
    const state = { ...base, inventory: addItems(base.inventory, 'potion', 2) }
    const healed = healWithItems(data, state)
    expect(getItemCount(healed.inventory, 'potion')).toBeLessThan(2)
    expect(healed.party[0].damageTaken.lt(low.damageTaken)).toBe(true)
    const full = { ...state, party: [member()] }
    expect(getItemCount(healWithItems(data, full).inventory, 'potion')).toBe(2)
  })
})

describe('growth: thu phục (Thị Uy, xin theo, mồi dụ)', () => {
  const raw = makeTeamRawData()
  raw.tamerSkills.push({
    id: 'intimidate',
    unlockRealm: 0,
    manaCost: 10,
    cooldown: 0,
    usesPerBattle: 1,
    target: 'wildFoe'
  })
  raw.items.push({
    id: 'lure',
    category: 'bait',
    price: 1,
    shop: true,
    shopWeight: 1,
    recruitPercent: 50,
    battles: 3
  })
  const recruitData = createGameData(withFixtureText(raw))
  const team = new Set(['h'])

  it('Thị Uy lượt đầu vào quái làm nguyên liệu khi tỉ lệ đủ cao; lượt sau / quái mạnh thì không', () => {
    const state = makeBattleState([member(), member({ id: 'h2' })], [fodder('e1')])
    expect(intimidateCommand(recruitData, state, team)).toEqual({
      skillId: 'intimidate',
      targetId: 'e1'
    })
    const later = { ...state, battle: { ...defined(state.battle), turn: 2 } }
    expect(intimidateCommand(recruitData, later, team)).toBeNull()
    const strong = makeBattleState([member({ level: 1 })], [{ ...fodder('e1'), level: 30 }])
    expect(intimidateCommand(recruitData, strong, team)).toBeNull()
  })

  it('xin theo: nhận quái làm nguyên liệu được, từ chối quái không dùng được', () => {
    const base = makeBattleState([member()], [fodder('e1'), member({ id: 'e2' })])
    const ended = (offerId: string): GameState => ({
      ...base,
      battle: { ...defined(base.battle), phase: 'ended', outcome: 'won', recruitOfferId: offerId }
    })
    expect(recruitDecision(recruitData, ended('e1'), team)).toEqual({ type: 'acceptRecruit' })
    expect(recruitDecision(recruitData, ended('e2'), team)).toEqual({ type: 'declineRecruit' })
    expect(recruitDecision(recruitData, base, team)).toBeNull()
  })

  it('mồi dụ: mua mồi rẻ nhất cửa hàng rồi dùng khi chưa có mồi; đang có mồi thì thôi', () => {
    const shop = { stock: [{ storage: 'stack', itemId: 'lure' } as const] }
    const used = applyBaitWhenNeeded(recruitData, { ...town([member()]), shop }, team)
    expect(used.used).toBe(1)
    expect(used.state.recruit.bait).toEqual({ itemId: 'lure', battlesLeft: 3 })
    expect(applyBaitWhenNeeded(recruitData, used.state, team).used).toBe(0)
  })
})
