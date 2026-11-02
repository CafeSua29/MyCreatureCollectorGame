// Cây thiên phú ngự thú sư (docs/rules/tamer-talents.md): điểm theo cảnh giới / nhiệm vụ / bậc thành
// tựu, nâng nút (giá tăng, yêu cầu, trần, không trần), tẩy bằng Hoàn Nguyên Đan, kênh thưởng ở từng
// nơi dùng (chỉ số đội, linh lực, hồi chiêu, giới hạn khế ước, giá cửa hàng), kiểm tra dữ liệu / save,
// migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount } from '../inventory'
import {
  tamerBonusAmount,
  tamerBonusMultiplier,
  tamerTalentPointsAvailable,
  tamerTalentPointsEarned
} from '../registries'
import { assertCanContract } from '../roster'
import { shopBuyPrice } from '../shop'
import { tempShopPrice } from '../events'
import { battleStats, cloneDraft } from '../battle/draft'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  atFloor
} from '../testing'
import type { BattleTamer, GameState, Monster } from '../model'
import { contractLevelLimit, realmToContract } from './realm'
import { playerContractLevelLimit } from './contract'
import { tamerTalentView } from './talents'

const data = makeData()

const town = (realm = 0, stacks: Record<string, number> = {}): GameState => ({
  ...makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })], tamerRealm: realm }),
  inventory: makeInventory(stacks)
})

const withRanks = <S extends GameState>(state: S, talentRanks: Record<string, number>): S => ({
  ...state,
  tamer: { ...state.tamer, talentRanks }
})

const allocate = (state: GameState, nodeId: string): GameState =>
  gameReducer(data, state, { type: 'allocateTamerTalent', nodeId })

const reset = (state: GameState): GameState =>
  gameReducer(data, state, { type: 'resetTamerTalents' })

describe('điểm thiên phú ngự thú sư', () => {
  it('game mới 0 điểm; +2 mỗi cảnh giới, +1 mỗi nhiệm vụ hoàn thành, +1 mỗi bậc thành tựu đã nhận', () => {
    expect(tamerTalentPointsEarned(data, town())).toBe(0)
    expect(tamerTalentPointsEarned(data, town(3))).toBe(6)
    const state = {
      ...town(1),
      stats: { ...town().stats, questsCompleted: 4 },
      achievements: { claimedTiers: { veteranAchievement: 2, other: 3 } }
    }
    expect(tamerTalentPointsEarned(data, state)).toBe(2 + 4 + 5)
  })

  it('số cực lớn: không ra Infinity / NaN', () => {
    const huge = { ...town(1e12), stats: { ...town().stats, questsCompleted: 1e12 } }
    expect(tamerTalentPointsEarned(data, huge)).toBe(3e12)
  })

  it('điểm còn có thể âm khi dữ liệu tăng giá sau khi đã nâng: không mất cấp, save vẫn hợp lệ', () => {
    const over = withRanks(town(0), { drill: 3 })
    expect(tamerTalentPointsAvailable(data, over)).toBe(-6)
    expect(validateGameState(data, over)).toEqual([])
    expectActionError(() => allocate(over, 'focus'), 'notEnoughTalentPoints', {
      need: 1,
      have: -6
    })
  })
})

describe('nâng nút', () => {
  it('cấp n → n + 1 tốn costPerRank × (n + 1); hết điểm thì báo lỗi, state giữ nguyên', () => {
    let state = town(3)
    for (const rank of [1, 2, 3]) {
      state = allocate(state, 'drill')
      expect(state.tamer.talentRanks).toEqual({ drill: rank })
    }
    expect(tamerTalentPointsAvailable(data, state)).toBe(0)
    expectActionError(() => allocate(state, 'drill'), 'notEnoughTalentPoints', {
      need: 4,
      have: 0
    })
  })

  it('nút lạ, yêu cầu, cấp tối đa, trong trận: báo lỗi', () => {
    const state = town(20)
    expectActionError(() => allocate(state, 'nope'), 'unknownTalent', { nodeId: 'nope' })
    expectActionError(() => allocate(state, 'haste'), 'talentRequires', {
      nodeId: 'haste',
      requiredId: 'focus',
      rank: 1
    })
    const maxed = withRanks(state, { focus: 3 })
    expectActionError(() => allocate(maxed, 'focus'), 'talentMaxRank', {
      nodeId: 'focus',
      maxRank: 3
    })
    expect(allocate(maxed, 'haste').tamer.talentRanks).toEqual({ focus: 3, haste: 1 })
    const fighting = withRanks(
      makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })]),
      {}
    )
    expectActionError(() => allocate(fighting, 'drill'), 'inBattle')
    expectActionError(
      () =>
        gameReducer(data, state, { type: 'allocateTamerTalent', nodeId: 1 as unknown as string }),
      'malformedAction'
    )
  })

  it('nút không trần: nâng tiếp ở cấp rất cao', () => {
    const state = withRanks({ ...town(1e7) }, { drill: 999 })
    expect(allocate(state, 'drill').tamer.talentRanks.drill).toBe(1000)
  })

  it('tamerTalentView: điểm, mọi nút theo thứ tự dữ liệu, giá và lý do chưa nâng được', () => {
    const view = tamerTalentView(data, withRanks(town(2), { focus: 1 }))
    expect(view).toMatchObject({ earned: 4, spent: 1, available: 3 })
    expect(view.nodes.map((node) => node.nodeId)).toEqual([
      'drill',
      'focus',
      'haste',
      'charm',
      'trade'
    ])
    expect(view.nodes[1]).toEqual({
      nodeId: 'focus',
      branchId: 'taming',
      rank: 1,
      nextCost: 2,
      blocker: null
    })
    expect(view.nodes[2].blocker).toBeNull()
  })
})

describe('tẩy thiên phú', () => {
  it('tiêu 1 Hoàn Nguyên Đan, xóa mọi cấp nên hoàn đủ điểm', () => {
    const state = withRanks(town(3, { restorationPill: 2 }), { drill: 2, focus: 1 })
    const after = reset(state)
    expect(after.tamer.talentRanks).toEqual({})
    expect(getItemCount(after.inventory, 'restorationPill')).toBe(1)
    expect(tamerTalentPointsAvailable(data, after)).toBe(6)
  })

  it('chưa nâng nút nào / thiếu vật phẩm / trong trận: báo lỗi, không mất vật phẩm', () => {
    expectActionError(() => reset(town(3, { restorationPill: 1 })), 'tamerTalentsEmpty')
    expectActionError(() => reset(withRanks(town(3), { drill: 1 })), 'notEnoughItem', {
      itemId: 'restorationPill',
      have: 0,
      need: 1
    })
    const fighting = withRanks(
      makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })]),
      {
        drill: 1
      }
    )
    expectActionError(() => reset(fighting), 'inBattle')
  })
})

describe('kênh thưởng ngự thú sư', () => {
  it('cộng danh hiệu đang đeo với nút × cấp; nút không còn trong dữ liệu bỏ qua', () => {
    const state = {
      ...withRanks(town(), { trade: 3, removed: 5 }),
      titles: { owned: ['lucky'], active: 'lucky' }
    }
    expect(tamerBonusAmount(data, state, 'moneyPercent')).toBe(100 + 30)
    expect(tamerBonusAmount(data, state, 'expPercent')).toBe(30)
    expect(tamerBonusMultiplier(data, state, 'shopPricePercent')).toBeCloseTo(0.7)
    // Hệ số không dưới 0 dù tổng % ≤ −100.
    expect(tamerBonusMultiplier(data, withRanks(town(), { trade: 20 }), 'shopPricePercent')).toBe(0)
    expect(tamerBonusAmount(data, town(), 'tamerSkillCooldown')).toBe(0)
  })

  it('teamStatPercent: mọi chỉ số quái ta trong trận + %, quái địch không', () => {
    const party = [makeMonster({ id: 'a' })]
    const enemies = [makeMonster({ id: 'e' })]
    const plain = cloneDraft(makeBattleState(party, enemies))
    const drilled = cloneDraft(withRanks(makeBattleState(party, enemies), { drill: 2 }))
    const attack = (d: typeof plain, id: string): number =>
      battleStats(
        data,
        d,
        defined([...d.party, ...d.battle.enemies].find((m) => m.id === id))
      ).attack.toNumber()
    expect(attack(drilled, 'a')).toBeCloseTo(attack(plain, 'a') * 1.2)
    expect(attack(drilled, 'e')).toBe(attack(plain, 'e'))
  })

  it('manaPercent: linh lực đầu trận của người chơi × (1 + %)', () => {
    const start = (state: GameState): BattleTamer =>
      defined(
        defined(gameReducer(data, atFloor(state, 1), { type: 'startWildBattle' }).battle).tamers
          .player
      )
    expect(start(town(0)).mana).toBe(50)
    expect(start(withRanks(town(0), { focus: 2 })).mana).toBe(100)
  })

  it('tamerSkillCooldown: hồi chiêu kỹ năng của người chơi giảm theo lượt, không dưới 0', () => {
    const party: Monster[] = [makeMonster({ id: 'a', damageTaken: 30, skillIds: ['idle'] })]
    const enemies = [makeMonster({ id: 'e', skillIds: ['idle'] })]
    const cooldownsAfter = (ranks: Record<string, number>): Record<string, number> => {
      const state = withRanks(makeBattleState(party, enemies), ranks)
      const after = gameReducer(data, state, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }],
        tamer: { skillId: 'mend', targetId: 'a' }
      })
      return defined(defined(after.battle).tamers.player).cooldowns
    }
    // mend hồi chiêu 2: còn 2 sau cuối lượt dùng; giảm 1 → còn 1; giảm 2 → không hồi chiêu.
    expect(cooldownsAfter({})).toEqual({ mend: 2 })
    expect(cooldownsAfter({ focus: 1, haste: 1 })).toEqual({ mend: 1 })
    expect(cooldownsAfter({ focus: 1, haste: 2 })).toEqual({})
  })

  it('contractLevelPercent: giới hạn level khế ước × (1 + %), cảnh giới cần tính theo %', () => {
    expect(playerContractLevelLimit(data, town(0))).toBe(100)
    const charmed = withRanks(town(0), { charm: 1 })
    expect(playerContractLevelLimit(data, charmed)).toBe(150)
    expect(realmToContract(data, 150, 50)).toBe(0)
    expect(realmToContract(data, 151, 50)).toBe(1)
    expect(realmToContract(data, 450, 50)).toBe(2)
    expect(realmToContract(data, 451, 50)).toBe(3)
    // Hệ số ≤ 0: không cảnh giới nào khế ước được quái trên level 0.
    expect(contractLevelLimit(data, 5, -100)).toBe(0)
    expect(realmToContract(data, 1, -100)).toBe(Number.MAX_SAFE_INTEGER)
    const monster = makeMonster({ id: 'a', level: 150, contractRealm: null })
    expectActionError(() => assertCanContract(data, town(0), monster), 'tamerRealmTooLow', {
      needRealm: 1
    })
    expect(() => assertCanContract(data, charmed, monster)).not.toThrow()
  })

  it('shopPricePercent: giá cửa hàng thị trấn và cửa hàng tạm giảm, làm tròn xuống', () => {
    const entry = { storage: 'stack', itemId: 'potion' } as const
    const plain = shopBuyPrice(data, town(), entry)
    const cheap = shopBuyPrice(data, withRanks(town(), { trade: 1 }), entry)
    expect(cheap.toString()).toBe(plain.times(0.9).floor().toString())
    const temp = tempShopPrice(data, withRanks(town(), { trade: 1 }), { entry, priceMultiplier: 2 })
    expect(temp.toString()).toBe(plain.times(1.8).floor().toString())
  })
})

describe('kiểm tra dữ liệu / save', () => {
  it('dữ liệu: nhánh lạ, yêu cầu vòng / lạ, kênh lạ, params sai, config sai', () => {
    expect(
      dataIssuesAfter((raw) => {
        raw.tamerTalents[0].branchId = 'nope'
        raw.tamerTalents[1].requires = { haste: 1 }
        raw.tamerTalents[3].effects = [{ type: 'flying' as 'expPercent', params: {} }]
        raw.tamerTalents[4].effects[0].params = { percent: 0 }
        raw.tamerTalents[2].effects[0].params = { turns: 0 }
        raw.tamerTalents[0].costPerRank = 0
        raw.config.tamerTalents.resetItemId = 'nope'
        raw.config.tamerTalents.pointsPerQuest = -1
      })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('nhánh không tồn tại "nope"'),
        expect.stringContaining('yêu cầu thành vòng'),
        expect.stringContaining('loại hiệu ứng lạ "flying"'),
        expect.stringContaining('percent phải khác 0'),
        expect.stringContaining('turns'),
        expect.stringContaining('costPerRank'),
        expect.stringContaining('resetItemId'),
        expect.stringContaining('pointsPerQuest')
      ])
    )
  })

  it('save: nút lạ, cấp không nguyên / < 1 / quá maxRank báo lỗi', () => {
    const issues = (ranks: Record<string, number>): string[] =>
      validateGameState(data, withRanks(town(), ranks))
    expect(issues({ drill: 1e9 })).toEqual([])
    expect(issues({ nope: 1 })).toHaveLength(1)
    expect(issues({ drill: 0 })).toHaveLength(1)
    expect(issues({ drill: 1.5 })).toHaveLength(1)
    expect(issues({ focus: 4 })).toHaveLength(1)
  })

  it('migrate v92 → v93: chưa nâng nút nào, bộ đếm nhiệm vụ 0, điểm có sẵn theo cảnh giới', () => {
    const raw = serializeState(town(4)) as Record<string, unknown>
    const { talentRanks: _ranks, ...tamer } = raw.tamer as Record<string, unknown>
    const { questsCompleted: _quests, ...stats } = raw.stats as Record<string, unknown>
    const migrated = migrateState({ ...raw, version: 92, tamer, stats }, data)
    expect(migrated.tamer.talentRanks).toEqual({})
    expect(migrated.stats.questsCompleted).toBe(0)
    expect(tamerTalentPointsEarned(data, migrated)).toBe(8)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
