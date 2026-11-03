// Nghiên cứu loài (docs/rules/species-research.md): đếm nhiệm vụ trong trận / ngoài trận, lợi ích
// (tỉ lệ bắt, EXP, shiny, mở thông tin, điểm yếu), nhận thưởng cấp, thành tựu, save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { achievementProgress, revealedBodyParts } from '../registries'
import { battleCatchChance } from '../battle'
import { rollMonster } from '../world'
import { getMaxHp } from '../monster'
import { createRng, toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type { BallItem, BattleCommand, Egg, GameAction, GameState, ResearchState } from '../model'
import { dexEntry } from './dex'
import { claimResearchReward, researchLevelUps, researchStatus } from './research'

const data = makeData()

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  run(state, { type: 'submitTurn', commands })

const skill = (slot: number, skillId: string): BattleCommand => ({ slot, kind: 'skill', skillId })

const throwBall = (slot: number, itemId: string, targetId: string): BattleCommand => ({
  slot,
  kind: 'item',
  itemId,
  targetId
})

/** Nghiên cứu weakling với bộ đếm cho trước. */
const weaklingResearch = (
  counters: ResearchState[string]['counters'],
  claimedLevel = 0
): ResearchState => ({ weakling: { counters, claimedLevel } })

/** 60 điểm = cấp 5; 90 điểm = cấp 7 (đủ +20% EXP); 130 = Hoàn thành. */
const LEVEL5 = { caught: 25, defeated: 5 }
const LEVEL7 = { caught: 25, defeated: 50, mainElementSkillSeen: 5 }
const COMPLETE = { caught: 25, defeated: 100, mainElementSkillSeen: 20, caughtWithStatus: 5 }

const town = (research: ResearchState = {}): GameState => ({
  ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
  research
})

describe('đếm trong trận', () => {
  it('bắt bằng bóng: + bắt; đang có trạng thái bất thường: + bắt khi có trạng thái', () => {
    const state = {
      ...makeBattleState(
        [makeMonster({ id: 'a', skillIds: ['idle'] })],
        [makeMonster({ id: 'e1', statuses: [{ statusId: 'poison', turnsLeft: 3 }] })]
      ),
      inventory: makeInventory({ masterBall: 1 })
    }
    const next = turn(state, throwBall(0, 'masterBall', 'e1'))
    expect(defined(next.battle).phase).toBe('ended')
    expect(next.research.weakling.counters).toEqual({ caught: 1, caughtWithStatus: 1 })
  })

  it('thắng: quái địch gục + hạ; quái dùng skill hệ chính của loài nó + thấy dùng', () => {
    // weakling hệ cỏ dùng sap (cỏ) hạ strongling còn 1 máu.
    const foe = makeMonster({ id: 'e1', speciesId: 'strongling', baseSpeciesId: 'strongling' })
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['sap'] })],
      [{ ...foe, damageTaken: getMaxHp(data, foe).minus(1) }]
    )
    const next = turn(state, skill(0, 'sap'))
    expect(defined(next.battle).outcome).toBe('won')
    expect(next.research.strongling.counters).toEqual({ defeated: 1 })
    expect(next.research.weakling.counters).toEqual({ mainElementSkillSeen: 1 })
  })

  it('skill khác hệ chính không tính', () => {
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['strike'] })],
      [makeMonster({ id: 'e1', damageTaken: toBig(49) })]
    )
    const next = turn(state, skill(0, 'strike'))
    expect(next.research.weakling.counters).toEqual({ defeated: 1 })
  })

  it('trứng nở sau trận thắng: + nở từ trứng', () => {
    const egg: Egg = { id: 'x', battlesLeft: 1, infusions: [], monster: makeMonster({ id: 'x' }) }
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['strike'] })],
      [makeMonster({ id: 'e1', speciesId: 'strongling', baseSpeciesId: 'strongling' })]
    )
    const foe = defined(state.battle).enemies[0]
    const won = turn(
      {
        ...state,
        eggs: [egg],
        battle: {
          ...defined(state.battle),
          enemies: [{ ...foe, damageTaken: getMaxHp(data, foe).minus(1) }]
        }
      },
      skill(0, 'strike')
    )
    expect(won.storage.concat(won.party).some((m) => m.id === 'x')).toBe(true)
    expect(won.research.weakling.counters).toEqual({ hatched: 1 })
  })
})

describe('đếm ngoài trận', () => {
  it('đá tiến hóa: + tiến hóa ra cho loài mới', () => {
    const state = {
      ...makeGameState({
        seed: 1,
        party: [
          makeMonster({
            id: 't',
            speciesId: 'twig',
            baseSpeciesId: 'twig',
            level: 3,
            exp: toBig(27)
          })
        ]
      }),
      inventory: makeInventory({ fireStone: 1 })
    }
    const next = run(state, { type: 'useItem', itemId: 'fireStone', monsterId: 't' })
    expect(next.party[0].speciesId).toBe('cinder')
    expect(next.research.cinder.counters).toEqual({ evolvedInto: 1 })
  })
})

describe('log lên cấp (docs/rules/game-log.md)', () => {
  it('chỉ loài có cấp tăng; mục không đổi bỏ qua; nhảy nhiều cấp ghi cấp mới', () => {
    const before = weaklingResearch(LEVEL5)
    expect(researchLevelUps(data, before, before)).toEqual([])
    expect(researchLevelUps(data, before, weaklingResearch({ ...LEVEL5, defeated: 6 }))).toEqual([])
    expect(researchLevelUps(data, {}, weaklingResearch(COMPLETE))).toEqual([
      { type: 'researchLevelUp', speciesId: 'weakling', level: 10 }
    ])
    // Số cực lớn: mỗi nhiệm vụ chỉ tính tới mốc cuối (bắt 25 lần → cấp 4).
    const huge = weaklingResearch({ caught: Number.MAX_SAFE_INTEGER })
    expect(researchLevelUps(data, {}, huge)).toEqual([
      { type: 'researchLevelUp', speciesId: 'weakling', level: 4 }
    ])
  })

  it('gameReducer ghi sau action ngoài trận (tiến hóa bằng đá), save hợp lệ', () => {
    const state = {
      ...makeGameState({
        seed: 1,
        party: [
          makeMonster({
            id: 't',
            speciesId: 'twig',
            baseSpeciesId: 'twig',
            level: 3,
            exp: toBig(27)
          })
        ]
      }),
      inventory: makeInventory({ fireStone: 1 })
    }
    const next = run(state, { type: 'useItem', itemId: 'fireStone', monsterId: 't' })
    // Tiến hóa ra 1 lần = 20 điểm = cấp 2 của cinder.
    expect(next.log).toContainEqual({ type: 'researchLevelUp', speciesId: 'cinder', level: 2 })
    expect(validateGameState(data, next)).toEqual([])
  })
})

describe('lợi ích', () => {
  const ball = data.items.ball as BallItem

  it('tỉ lệ bắt +10% từ cấp 5, chỉ loài đó', () => {
    const state = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e1' })])
    const battle = { ...state, battle: defined(state.battle) }
    const user = battle.party[0]
    const target = battle.battle.enemies[0]
    const base = battleCatchChance(data, battle, { ball, target, user })
    const researched = { ...battle, research: weaklingResearch(LEVEL5) }
    expect(battleCatchChance(data, researched, { ball, target, user })).toBeCloseTo(base * 1.1)
    const other = { ...battle, research: { strongling: weaklingResearch(LEVEL5).weakling } }
    expect(battleCatchChance(data, other, { ball, target, user })).toBeCloseTo(base)
  })

  it('EXP khi hạ loài đó +20% từ cấp 7', () => {
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['strike'] })],
      [makeMonster({ id: 'e1', level: 4, exp: toBig(64), damageTaken: toBig(64) })]
    )
    const plain = turn(state, skill(0, 'strike'))
    const boosted = turn({ ...state, research: weaklingResearch(LEVEL7) }, skill(0, 'strike'))
    const gained = (next: GameState): number => next.party[0].exp.minus(1).toNumber()
    expect(gained(plain)).toBe(8)
    expect(gained(boosted)).toBe(Math.floor(8 * 1.2))
  })

  it('tỉ lệ shiny của loài nhân hệ số theo loài vừa tung', () => {
    const spec = {
      encounters: [{ speciesId: 'weakling', weight: 1 }],
      levelMin: 1,
      levelMax: 1,
      geneMultiplier: toBig(1),
      shinyChance: 50,
      aging: false
    }
    const doubled = { ...spec, speciesShinyMultiplier: () => 2 }
    for (let seed = 0; seed < 20; seed++) {
      expect(rollMonster(data, createRng(seed), doubled, 'w')[0].shinyStacks).toBe(1)
    }
    const none = { ...spec, shinyChance: 0, speciesShinyMultiplier: () => 2 }
    expect(rollMonster(data, createRng(1), none, 'w')[0].shinyStacks).toBe(0)
  })

  it('mở thông tin trang Dex và điểm yếu theo cấp', () => {
    const fresh = dexEntry(data, town(), 'weakling', 'vi')
    expect(fresh).toMatchObject({
      profileRevealed: false,
      learnsetRevealed: false,
      knownWeakPoints: []
    })
    expect(defined(fresh).research).toMatchObject({ level: 0, points: 0, nextLevelPoints: 10 })
    const done = defined(dexEntry(data, town(weaklingResearch(COMPLETE)), 'weakling', 'vi'))
    expect(done).toMatchObject({ profileRevealed: true, learnsetRevealed: true })
    expect(done.revealedParts).toEqual(done.bodyParts)
    expect(done.research).toMatchObject({ level: 10, maxLevel: 10, nextLevelPoints: null })
    expect(revealedBodyParts(data, town(weaklingResearch(COMPLETE)), makeMonster())).toEqual(
      done.bodyParts
    )
  })
})

describe('claimResearchReward', () => {
  it('nhận mọi thưởng cấp đã đạt một lần', () => {
    const state = town(weaklingResearch(COMPLETE))
    expect(defined(researchStatus(data, state.research, 'weakling')).hasUnclaimedReward).toBe(true)
    const next = run(state, { type: 'claimResearchReward', speciesId: 'weakling' })
    // Cấp 5 (potion 2) + cấp 10 (potion 5).
    expect(next.inventory.stacks.potion).toBe(7)
    expect(next.research.weakling.claimedLevel).toBe(10)
    expect(defined(researchStatus(data, next.research, 'weakling')).hasUnclaimedReward).toBe(false)
    expectActionError(
      () => run(next, { type: 'claimResearchReward', speciesId: 'weakling' }),
      'researchNoReward',
      { speciesId: 'weakling', level: 10 }
    )
  })

  it('đã nhận tới cấp 5 thì chỉ nhận cấp 10', () => {
    const state = town(weaklingResearch(COMPLETE, 5))
    expect(claimResearchReward(data, state, 'weakling').inventory.stacks.potion).toBe(5)
  })

  it('báo lỗi: chưa đạt cấp có thưởng, loài ngoài Dex, đang trong trận', () => {
    expectActionError(
      () =>
        run(town(weaklingResearch({ caught: 1 })), {
          type: 'claimResearchReward',
          speciesId: 'weakling'
        }),
      'researchNoReward',
      { level: 1 }
    )
    expectActionError(
      () => run(town(), { type: 'claimResearchReward', speciesId: 'megaWeakling' }),
      'researchSpeciesNotFound'
    )
    const inBattle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e1' })])
    expectActionError(
      () => run(inBattle, { type: 'claimResearchReward', speciesId: 'weakling' }),
      'inBattle'
    )
  })
})

describe('thành tựu', () => {
  it('researchCompleted đếm loài đã Hoàn thành', () => {
    const research = {
      ...weaklingResearch(COMPLETE),
      strongling: { counters: LEVEL5, claimedLevel: 0 }
    }
    const achievement = { id: 'r', condition: { type: 'researchCompleted' as const }, tiers: [] }
    expect(achievementProgress(data, town(research), achievement)).toBe(1)
  })
})

describe('save', () => {
  it('kiểm tra: loài ngoài Dex, bộ đếm lạ / âm, cấp đã nhận vượt tối đa', () => {
    expect(validateGameState(data, town(weaklingResearch(COMPLETE, 10)))).toEqual([])
    const bad = town({
      megaWeakling: { counters: {}, claimedLevel: 0 },
      // Ép kiểu: cố ý đưa bộ đếm lạ / sai để kiểm tra save.
      weakling: {
        counters: { flown: 1, caught: -1 } as ResearchState[string]['counters'],
        claimedLevel: 11
      }
    })
    expect(validateGameState(data, bad)).toEqual([
      'research.megaWeakling: không phải loài thuộc Dex',
      'research.weakling.counters: trường "flown" không thuộc bộ đếm nghiên cứu',
      'research.weakling.counters.caught phải là số nguyên ≥ 0, nhận -1',
      'research.weakling.claimedLevel vượt cấp tối đa 10'
    ])
  })

  it('lưu / đọc giữ nguyên; migrate v86 → v87: loài đã sở hữu tính như đã bắt 1 lần', () => {
    const state = town(weaklingResearch(LEVEL5, 5))
    expect(migrateState(serializeState(state), data)).toEqual(state)
    const old = serializeState({
      ...town(),
      dex: { ...town().dex, owned: ['weakling'], seen: ['weakling'] }
    })
    const { research: _research, ...rest } = old as Record<string, unknown>
    const migrated = migrateState({ ...rest, version: 86 }, data)
    expect(migrated.research).toEqual(weaklingResearch({ caught: 1 }))
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
