// Thiên phú quái (docs/rules/monster-talents.md): điểm theo level cao nhất / thức tỉnh, nâng nút (giá
// tăng, yêu cầu, cấp tối đa, nhánh race, không trần), hook theo cấp, tẩy bằng Vong Ưu Thủy, fuse /
// breed / tiến hóa, đồ rơi, kiểm tra dữ liệu / quái, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { computeStats, getMaxHp, talentView, validateMonster } from '../monster'
import { getItemCount } from '../inventory'
import { autoEvolve, fuseMonsters, makeOffspring } from '../progression'
import {
  talentBlocker,
  talentPointsAvailable,
  talentPointsEarned,
  talentPointsSpent,
  talentRankCost
} from '../registries'
import { createRng } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, GameState, Monster, RawGameData, TalentNodeDef } from '../model'
import { getMonsterView } from './roster'

const data = makeData()

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 20, maxLevelReached: 20, skillIds: ['strike'], ...overrides })

const stateWith = (party: Monster[], stacks: Record<string, number> = {}): GameState => ({
  ...makeGameState({ seed: 3, party }),
  inventory: makeInventory(stacks)
})

const allocate = (state: GameState, nodeId = 'might', monsterId = 'a'): GameState =>
  gameReducer(data, state, { type: 'allocateTalent', monsterId, nodeId })

const partyOf = (state: GameState, id = 'a'): Monster =>
  defined(state.party.find((m) => m.id === id))

describe('điểm thiên phú', () => {
  it('+1 mỗi 5 level theo maxLevelReached, +1 mỗi tầng thức tỉnh', () => {
    expect(talentPointsEarned(data, hero({ level: 1, maxLevelReached: 1 }))).toBe(0)
    expect(talentPointsEarned(data, hero({ level: 4, maxLevelReached: 4 }))).toBe(0)
    expect(talentPointsEarned(data, hero({ level: 5, maxLevelReached: 5 }))).toBe(1)
    expect(talentPointsEarned(data, hero())).toBe(4)
    expect(talentPointsEarned(data, hero({ awakening: 3 }))).toBe(7)
  })

  it('level bị reset nhưng maxLevelReached giữ: không mất điểm', () => {
    expect(talentPointsEarned(data, hero({ level: 1, maxLevelReached: 50 }))).toBe(10)
  })

  it('số cực lớn: không trần, không tràn', () => {
    const huge = hero({ level: 1e12, maxLevelReached: 1e12 })
    expect(talentPointsEarned(data, huge)).toBe(2e11)
    expect(talentRankCost(data.talents.might, 1e6)).toBe(1e6 + 1)
    const ranked = hero({ talentRanks: { might: 1e5 } })
    expect(talentPointsSpent(data, ranked)).toBe((1e5 * (1e5 + 1)) / 2)
    expect(computeStats(data, ranked).final.attack.isFinite()).toBe(true)
  })

  it('điểm còn lại = nhận − đã dùng (cấp n tốn costPerRank × (1 + … + n))', () => {
    const monster = hero({ talentRanks: { might: 2, keenEye: 1 } })
    // might: 1 + 2 = 3; keenEye: 2 × 1 = 2.
    expect(talentPointsSpent(data, monster)).toBe(5)
    expect(talentPointsAvailable(data, monster)).toBe(-1)
  })
})

describe('allocateTalent', () => {
  it('nâng nút: cấp n → n + 1 tốn costPerRank × (n + 1), quái trong kho cũng được', () => {
    const once = allocate(stateWith([hero()]))
    expect(partyOf(once).talentRanks).toEqual({ might: 1 })
    const twice = allocate(once)
    expect(partyOf(twice).talentRanks).toEqual({ might: 2 })
    // Đã dùng 3 / 4 điểm: cấp 3 cần 3.
    expectActionError(() => allocate(twice), 'notEnoughTalentPoints', { need: 3, have: 1 })
    const stored: GameState = { ...stateWith([hero()]), storage: [hero({ id: 's' })] }
    expect(defined(allocate(stored, 'might', 's').storage[0]).talentRanks).toEqual({ might: 1 })
  })

  it('nút yêu cầu và cấp tối đa', () => {
    const rich = hero({ level: 100, maxLevelReached: 100 })
    const state = stateWith([rich])
    expectActionError(() => allocate(state, 'keenEye'), 'talentRequires', {
      nodeId: 'keenEye',
      requiredId: 'might',
      rank: 2
    })
    const ready = allocate(allocate(state))
    const maxed = allocate(allocate(ready, 'keenEye'), 'keenEye')
    expect(partyOf(maxed).talentRanks).toEqual({ might: 2, keenEye: 2 })
    expectActionError(() => allocate(maxed, 'keenEye'), 'talentMaxRank', {
      nodeId: 'keenEye',
      maxRank: 2
    })
  })

  it('nhánh race chỉ mở cho race khớp', () => {
    const state = stateWith([hero()])
    expectActionError(() => allocate(state, 'bruteRage'), 'talentBranchClosed', {
      nodeId: 'bruteRage',
      raceId: 'neutral'
    })
    const brute = stateWith([hero({ raceId: 'brute' })])
    expect(partyOf(allocate(brute, 'bruteRage')).talentRanks).toEqual({ bruteRage: 1 })
  })

  it('lỗi: nút lạ, trong trận, không sở hữu, 0 điểm; state giữ nguyên', () => {
    const state = stateWith([hero()])
    expectActionError(() => allocate(state, 'nope'), 'unknownTalent', { nodeId: 'nope' })
    expectActionError(() => allocate(state, 'might', 'zzz'), 'monsterNotOwned')
    const battle = makeBattleState([hero()], [makeMonster({ id: 'w' })])
    expectActionError(() => allocate(battle), 'inBattle')
    const fresh = stateWith([hero({ level: 1, maxLevelReached: 1 })])
    expectActionError(() => allocate(fresh), 'notEnoughTalentPoints', { need: 1, have: 0 })
    expect(partyOf(fresh).talentRanks).toEqual({})
  })

  it('quái đang thám hiểm vẫn nâng được (không khóa)', () => {
    const busy = stateWith([hero({ assignment: { kind: 'expedition', id: 'x1' } })])
    expect(partyOf(allocate(busy)).talentRanks).toEqual({ might: 1 })
  })
})

describe('hiệu ứng', () => {
  it('hook nhân theo cấp, % chỉ số vào nguồn talent', () => {
    const { percentBySource } = computeStats(data, hero({ talentRanks: { might: 3 } }))
    expect(percentBySource.talent.attack).toBe(30)
    expect(computeStats(data, hero()).percentBySource.talent.attack ?? 0).toBe(0)
  })

  it('nút ở nhánh race không khớp (đổi race) không có tác dụng', () => {
    const neutral = hero({ talentRanks: { bruteRage: 2 } })
    expect(computeStats(data, neutral).percentBySource.talent.attack ?? 0).toBe(0)
    const brute = hero({ raceId: 'brute', talentRanks: { bruteRage: 2 } })
    expect(computeStats(data, brute).percentBySource.talent.attack).toBe(10)
  })

  it('MonsterView: điểm, cấp, giá tiếp theo, lý do chưa nâng được; nhánh đóng bị ẩn', () => {
    const state = stateWith([hero({ talentRanks: { might: 1 } })])
    const view = defined(getMonsterView(data, state, 'a')).talents
    expect([view.earned, view.spent, view.available]).toEqual([4, 1, 3])
    expect(view.nodes.map((node) => node.nodeId)).toEqual(['might', 'keenEye'])
    expect(view.nodes[0]).toEqual({ nodeId: 'might', rank: 1, nextCost: 2, blocker: null })
    expect(view.nodes[1].blocker).toEqual({ kind: 'requires', nodeId: 'might', rank: 2 })
    expect(talentView(data, hero({ raceId: 'brute' })).nodes).toHaveLength(3)
  })

  it('talentBlocker trả null khi nâng được', () => {
    expect(talentBlocker(data, hero(), 'might')).toBeNull()
  })
})

describe('Vong Ưu Thủy', () => {
  const useWater = { type: 'useItem', itemId: 'forgetWater', monsterId: 'a' } as const

  it('xóa mọi cấp, hoàn đủ điểm, tốn 1 vật phẩm', () => {
    const state = stateWith([hero({ talentRanks: { might: 2 } })], { forgetWater: 2 })
    const used = gameReducer(data, state, useWater)
    expect(partyOf(used).talentRanks).toEqual({})
    expect(talentPointsAvailable(data, partyOf(used))).toBe(4)
    expect(getItemCount(used.inventory, 'forgetWater')).toBe(1)
  })

  it('chưa nâng nút nào: không có tác dụng, không mất vật phẩm', () => {
    const state = stateWith([hero()], { forgetWater: 1 })
    expectActionError(() => gameReducer(data, state, useWater), 'itemNoEffect')
  })
})

describe('fuse / breed / tiến hóa', () => {
  it('fuse: quái gốc giữ cấp của mình, phần của quái phụ mất', () => {
    const base = hero({ talentRanks: { might: 1 } })
    const sub = hero({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      talentRanks: { might: 2 }
    })
    const [fused] = fuseMonsters(data, createRng(1), base, sub)
    expect(fused.talentRanks).toEqual({ might: 1 })
  })

  it('con breeding 0, tiến hóa giữ', () => {
    const father = hero({ id: 'f', gender: 'male', talentRanks: { might: 2 } })
    const mother = hero({ id: 'm', gender: 'female', talentRanks: { might: 1 } })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'egg')
    expect(child.talentRanks).toEqual({})
    expect(talentPointsEarned(data, child)).toBe(0)
    const before = makeMonster({ level: 10, exp: 1000, talentRanks: { might: 1 } })
    const scene = { party: [], place: null, aptitudeFloor: 1, time: 0 }
    const { monster } = autoEvolve(data, before, { rng: createRng(1), day: 0, scene })
    expect(monster.speciesId).toBe('strongling')
    expect(monster.talentRanks).toEqual({ might: 1 })
  })
})

describe('đồ rơi', () => {
  it('boss rơi Vong Ưu Thủy theo config', () => {
    const raw = makeRawData()
    raw.config.talents.bossDrops = [{ itemId: 'forgetWater', chance: 100 }]
    const drops = createGameData(raw)
    const boss = { ...makeMonster({ id: 'boss', skillIds: ['idle'] }), bossMultiplier: 3 }
    const dying = { ...boss, damageTaken: getMaxHp(drops, boss).minus(1) }
    const state = makeBattleState([hero({ level: 50 })], [dying], { isBoss: true })
    const command: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
    const won = gameReducer(drops, state, { type: 'submitTurn', commands: [command] })
    expect(getItemCount(won.inventory, 'forgetWater')).toBe(1)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesAfter = (edit: (raw: RawGameData) => void): string => dataIssuesAfter(edit).join('\n')
  const node = (raw: RawGameData, id: string): TalentNodeDef =>
    defined(raw.talents.find((n) => n.id === id))

  it('dữ liệu fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => undefined)).toEqual([])
  })

  it('config: levelsPerPoint nguyên ≥ 1, pointsPerAwakening nguyên ≥ 0, bossDrops hợp lệ', () => {
    expect(
      issuesAfter((raw) => {
        raw.config.talents.levelsPerPoint = 0
      })
    ).toMatch(/levelsPerPoint/)
    expect(
      issuesAfter((raw) => {
        raw.config.talents.pointsPerAwakening = -1
      })
    ).toMatch(/pointsPerAwakening/)
    expect(
      issuesAfter((raw) => {
        raw.config.talents.bossDrops = [{ itemId: 'nope', chance: 10 }]
      })
    ).toMatch(/nope/)
  })

  it('nhánh: race tham chiếu phải tồn tại, không có trường lạ', () => {
    expect(
      issuesAfter((raw) => {
        raw.talentBranches[1].raceIds = ['ghost']
      })
    ).toMatch(/ghost/)
    expect(
      issuesAfter((raw) => {
        Object.assign(raw.talentBranches[0], { color: 'red' })
      })
    ).toMatch(/color/)
  })

  it('nút: nhánh tồn tại, costPerRank / maxRank nguyên ≥ 1, hook hợp lệ', () => {
    expect(issuesAfter((raw) => void (node(raw, 'might').branchId = 'nope'))).toMatch(/nhánh/)
    expect(issuesAfter((raw) => void (node(raw, 'might').costPerRank = 0))).toMatch(/costPerRank/)
    expect(issuesAfter((raw) => void (node(raw, 'keenEye').maxRank = 0))).toMatch(/maxRank/)
    expect(
      issuesAfter((raw) => void (node(raw, 'might').hooks = [{ type: 'nope', params: {} }]))
    ).toMatch(/nope/)
  })

  it('yêu cầu: nút tồn tại, không thành vòng, không vượt maxRank, không ở nhánh race khác', () => {
    expect(issuesAfter((raw) => void (node(raw, 'might').requires = { nope: 1 }))).toMatch(
      /requires\.nope/
    )
    expect(issuesAfter((raw) => void (node(raw, 'might').requires = { keenEye: 1 }))).toMatch(
      /vòng/
    )
    expect(issuesAfter((raw) => void (node(raw, 'might').requires = { keenEye: 3 }))).toMatch(
      /cấp tối đa/
    )
    expect(issuesAfter((raw) => void (node(raw, 'might').requires = { bruteRage: 1 }))).toMatch(
      /cùng nhánh/
    )
  })
})

describe('kiểm tra quái / migrate', () => {
  it('cấp: nút tồn tại, nguyên ≥ 1, không quá maxRank; không xét điểm', () => {
    expect(validateMonster(data, hero({ talentRanks: { nope: 1 } })).join()).toMatch(
      /talentRanks\.nope/
    )
    expect(validateMonster(data, hero({ talentRanks: { might: 0 } })).join()).toMatch(
      /talentRanks\.might/
    )
    expect(validateMonster(data, hero({ talentRanks: { keenEye: 3 } })).join()).toMatch(/tối đa 2/)
    expect(validateMonster(data, hero({ talentRanks: { might: 1e9 } }))).toEqual([])
  })

  it('migrate v57 → v58: mọi quái chưa nâng nút nào', () => {
    const state = makeGameState({ seed: 1, party: [hero({ talentRanks: { might: 1 } })] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { talentRanks: _talentRanks, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const old = { ...raw, version: 57, party: (raw.party as unknown[]).map(strip) }
    const migrated = migrateState(old, data)
    expect(partyOf(migrated).talentRanks).toEqual({})
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
