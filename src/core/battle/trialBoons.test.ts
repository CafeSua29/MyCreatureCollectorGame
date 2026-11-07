// Ân huệ trong lượt bí cảnh (docs/rules/trial-boons.md): tung lựa chọn (không trùng, max cấp / vô
// tác dụng / bậc trọng số 0 không tung, luật noBoons / boonChoices), tung sau trận thắng trừ trận
// cuối, chọn / bỏ / lỗi, chặn trận kế, cộng cấp, hook trong trận, thưởng / hồi máu / rương, hết
// lượt thì mất, tháp không có, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { addItems, getItemCount } from '../inventory'
import { computeStats, expForLevel, getMaxHp } from '../monster'
import {
  rollTrialBoonChoices,
  trialBoonBossWeakenPercent,
  trialBoonChestRolls,
  trialBoonRarityWeight,
  trialBoonHealPercent,
  trialBoonRewardPercent
} from '../registries'
import { createRng } from '../shared'
import {
  FIXTURE_TRIAL_TOKEN_ID,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type {
  BattleEvent,
  GameData,
  GameLogEntry,
  GameState,
  Monster,
  RawGameData,
  SecretRealm,
  TrialBoonDef,
  TrialBoonStack,
  TrialRule
} from '../model'
import { suggestBattleCommands } from './ai'
import { suggestReplacements } from './battleActions'
import { monsterBattleContext, type Draft } from './draft'
import { battleTrialBoons, trialBoonSkipMoney } from './trialBoons'

const BOONS: TrialBoonDef[] = [
  {
    id: 'atk',
    rarity: 'common',
    effects: [
      { type: 'hooks', hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }] }
    ]
  },
  { id: 'heal', rarity: 'common', maxStacks: 2, effects: [{ type: 'heal', percent: 20 }] },
  { id: 'gold', rarity: 'rare', effects: [{ type: 'reward', channel: 'reward', percent: 50 }] },
  { id: 'wise', rarity: 'rare', effects: [{ type: 'reward', channel: 'exp', percent: 50 }] },
  { id: 'chest', rarity: 'epic', effects: [{ type: 'chest', rolls: 2 }] },
  { id: 'slayer', rarity: 'rare', effects: [{ type: 'bossWeaken', percent: 30 }] },
  {
    id: 'rainAltar',
    rarity: 'rare',
    maxStacks: 1,
    effects: [
      {
        type: 'hooks',
        hooks: [
          { type: 'setFieldOnEntry', params: { layer: 'weather', fieldId: 'rain' } },
          { type: 'stageOnEntry', params: { target: 'allEnemies', stat: 'attack', stages: -1 } },
          { type: 'stageOnEntry', params: { target: 'self', stat: 'speed', stages: 1 } }
        ]
      }
    ]
  },
  {
    id: 'once',
    rarity: 'epic',
    maxStacks: 1,
    effects: [{ type: 'hooks', hooks: [{ type: 'critStage', params: { stages: 1 } }] }]
  }
]

function makeBoonData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.trialBoons = BOONS.map((boon) => ({ ...boon }))
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeBoonData()

const hero = (overrides: Partial<Monster> = {}): Monster =>
  makeMonster({
    id: 'h',
    elementIds: ['grass'],
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike'],
    ...overrides
  })

const rule = (ruleId: string): TrialRule => ({ ruleId, elementId: null })

const realmOf = (overrides: Partial<SecretRealm> = {}): SecretRealm => ({
  kind: 'realm',
  floor: 3,
  biomeId: 'field',
  rules: [],
  battleCount: 3,
  cleared: 0,
  boons: [],
  boonChoices: [],
  ...overrides
})

function inRealm(overrides: Partial<SecretRealm> = {}, party: Monster[] = [hero()]): GameState {
  const state = makeGameState({ seed: 7, party, highestFloor: 2, money: 1000 })
  return { ...state, trial: realmOf(overrides) }
}

/** Đánh trận kế của bí cảnh tới hết (chưa rời trận). */
function fightRealm(state: GameState, gameData: GameData = data): GameState {
  let current = gameReducer(gameData, state, { type: 'challengeTrial' })
  for (let i = 0; i < 200 && current.battle?.phase !== 'ended'; i++) {
    const phase = defined(current.battle, 'trận').phase
    current =
      phase === 'chooseReplacement'
        ? gameReducer(gameData, current, {
            type: 'replaceFainted',
            replacements: suggestReplacements(gameData, current)
          })
        : gameReducer(gameData, current, {
            type: 'submitTurn',
            commands: suggestBattleCommands(gameData, current, { transforms: false })
          })
  }
  return current
}

const leave = (state: GameState, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, { type: 'leaveBattle' })

const realmState = (state: GameState): SecretRealm => {
  if (state.trial?.kind !== 'realm') throw new Error('không trong bí cảnh')
  return state.trial
}

const battleLog = (state: GameState): BattleEvent[] => defined(state.battle, 'trận').log

const lastLog = (state: GameState): GameLogEntry | undefined => state.log[state.log.length - 1]

const roll = (
  realm: SecretRealm,
  gameData: GameData = data,
  seed = 1,
  instabilityLevel = 0
): string[] => rollTrialBoonChoices(gameData, createRng(seed), { realm, instabilityLevel })[0]

describe('tung lựa chọn ân huệ', () => {
  it('choiceCount ân huệ khác nhau, tất định theo RNG', () => {
    const choices = roll(realmOf())
    expect(choices).toHaveLength(3)
    expect(new Set(choices).size).toBe(3)
    for (const id of choices) expect(Object.keys(data.trialBoons)).toContain(id)
    expect(roll(realmOf())).toEqual(choices)
  })

  it('ân huệ đã max cấp không tung; hết ân huệ thì ít hơn choiceCount', () => {
    const many = makeBoonData((raw) => {
      raw.config.trials.boons.choiceCount = 10
    })
    const maxed: TrialBoonStack[] = [
      { boonId: 'once', stacks: 1 },
      { boonId: 'heal', stacks: 2 },
      { boonId: 'atk', stacks: 99 }
    ]
    const choices = roll(realmOf({ boons: maxed }), many)
    expect([...choices].sort()).toEqual(['atk', 'chest', 'gold', 'rainAltar', 'slayer', 'wise'])
    // heal cấp 1 < maxStacks 2 thì vẫn tung.
    expect(roll(realmOf({ boons: [{ boonId: 'heal', stacks: 1 }] }), many)).toContain('heal')
  })

  it('luật noHealing: ân huệ hồi máu không tung; trọng số bậc 0 không tung', () => {
    const many = makeBoonData((raw) => {
      raw.config.trials.boons.choiceCount = 10
      raw.config.trials.boons.rarityWeights.epic = 0
    })
    const choices = roll(realmOf({ rules: [rule('noHealing')] }), many)
    expect([...choices].sort()).toEqual(['atk', 'gold', 'rainAltar', 'slayer', 'wise'])
  })

  it('luật noBoons: không tung, không tốn RNG; luật boonChoices: thêm count lựa chọn', () => {
    const rng = createRng(4)
    const noBoons = realmOf({ rules: [rule('noBoons')] })
    expect(rollTrialBoonChoices(data, rng, { realm: noBoons, instabilityLevel: 0 })).toEqual([
      [],
      rng
    ])
    expect(roll(realmOf({ rules: [rule('boonBounty')] }))).toHaveLength(5)
  })

  it('choiceCount 0 hoặc không có ân huệ: không tung', () => {
    const off = makeBoonData((raw) => {
      raw.config.trials.boons.choiceCount = 0
    })
    expect(roll(realmOf(), off)).toEqual([])
    expect(
      roll(
        realmOf(),
        makeBoonData((raw) => (raw.trialBoons = []))
      )
    ).toEqual([])
  })
})

describe('độ bất ổn tầng trong bí cảnh', () => {
  it('trọng số bậc = gốc × (1 + mức × instabilityRarityPercent / 100); mức cực lớn vẫn hữu hạn', () => {
    expect(trialBoonRarityWeight(data, 'common', 0)).toBe(60)
    expect(trialBoonRarityWeight(data, 'common', 9)).toBe(60)
    expect(trialBoonRarityWeight(data, 'rare', 4)).toBe(60)
    expect(trialBoonRarityWeight(data, 'epic', 4)).toBe(30)
    expect(Number.isFinite(trialBoonRarityWeight(data, 'epic', 1e12))).toBe(true)
  })

  it('mức bất ổn cao: ân huệ epic ra nhiều hơn', () => {
    const epicCount = (level: number): number => {
      let count = 0
      for (let seed = 1; seed <= 200; seed++) {
        const choices = roll(realmOf(), data, seed, level)
        count += choices.filter((id) => data.trialBoons[id].rarity === 'epic').length
      }
      return count
    }
    expect(epicCount(20)).toBeGreaterThan(epicCount(0) * 2)
  })

  it('vào bí cảnh lộ thuộc tính ẩn; trận quái hoang / boss bí cảnh nhận độ bất ổn, tháp không', () => {
    const base = makeGameState({ seed: 7, party: [hero()], highestFloor: 10 })
    const unstable: GameState = {
      ...base,
      inventory: addItems(base.inventory, FIXTURE_TRIAL_TOKEN_ID, 1),
      instability: { level: 1, properties: [{ ruleId: 'playerSlow', hidden: true }] }
    }
    const entered = gameReducer(data, unstable, { type: 'enterTrial' })
    expect(entered.instability.properties).toEqual([{ ruleId: 'playerSlow', hidden: false }])
    const fighting = gameReducer(data, entered, { type: 'challengeTrial' })
    const battle = defined(fighting.battle)
    expect(battle.instability).toEqual({ level: 1, ruleIds: ['playerSlow'] })
    expect(battle.teamBonuses.player).toContainEqual({ kind: 'rule', id: 'playerSlow', count: 1 })
    expect(validateGameState(data, fighting)).toEqual([])
    const tower = gameReducer(data, unstable, { type: 'challengeTower' })
    expect(defined(tower.battle).instability).toBeNull()
  })
})

describe('ân huệ trong chuỗi trận bí cảnh', () => {
  it('thắng trận (trừ trận cuối): tung lựa chọn, log trialBoonOffered, chặn trận kế', () => {
    const won = fightRealm(inRealm())
    const realm = realmState(won)
    expect(realm.cleared).toBe(1)
    expect(realm.boonChoices).toHaveLength(3)
    expect(battleLog(won)).toContainEqual({ type: 'trialBoonOffered', boonIds: realm.boonChoices })
    const after = leave(won)
    expect(validateGameState(data, after)).toEqual([])
    expectActionError(
      () => gameReducer(data, after, { type: 'challengeTrial' }),
      'trialBoonPending'
    )
  })

  it('thắng trận cuối: không tung, bí cảnh kết thúc (ân huệ mất)', () => {
    const won = fightRealm(inRealm({ cleared: 2, boons: [{ boonId: 'atk', stacks: 3 }] }))
    expect(won.trial).toBeNull()
    expect(battleLog(won).some((event) => event.type === 'trialBoonOffered')).toBe(false)
  })

  it('chọn: cấp 1, xóa lựa chọn, log; chọn lại ân huệ đã có thì + 1 cấp; đánh tiếp được', () => {
    const after = leave(fightRealm(inRealm()))
    const [first] = realmState(after).boonChoices
    const chosen = gameReducer(data, after, { type: 'chooseTrialBoon', boonId: first })
    expect(realmState(chosen).boons).toEqual([{ boonId: first, stacks: 1 }])
    expect(realmState(chosen).boonChoices).toEqual([])
    expect(lastLog(chosen)).toEqual({ type: 'trialBoonChosen', boonId: first, stacks: 1 })
    expect(gameReducer(data, chosen, { type: 'challengeTrial' }).battle).not.toBeNull()

    const again = inRealm({
      boons: [
        { boonId: 'gold', stacks: 1 },
        { boonId: 'atk', stacks: 4 }
      ],
      boonChoices: ['atk', 'wise']
    })
    const stacked = gameReducer(data, again, { type: 'chooseTrialBoon', boonId: 'atk' })
    expect(realmState(stacked).boons).toEqual([
      { boonId: 'gold', stacks: 1 },
      { boonId: 'atk', stacks: 5 }
    ])
  })

  it('bỏ lựa chọn: nhận tiền theo tầng sức mạnh, log; số tiền theo công thức', () => {
    const state = inRealm({ boonChoices: ['atk', 'gold'] })
    const skipped = gameReducer(data, state, { type: 'skipTrialBoon' })
    const money = trialBoonSkipMoney(data, 3)
    expect(money.gt(0)).toBe(true)
    expect(skipped.money.eq(state.money.plus(money))).toBe(true)
    expect(realmState(skipped).boonChoices).toEqual([])
    expect(realmState(skipped).boons).toEqual([])
    expect(lastLog(skipped)).toEqual({ type: 'trialBoonSkipped', money })
    // Tầng cực lớn: tiền vẫn hữu hạn.
    expect(trialBoonSkipMoney(data, 1e9).isFinite()).toBe(true)
  })

  it('báo lỗi: không trong bí cảnh, không có lựa chọn, ân huệ ngoài lựa chọn, đang trong trận', () => {
    const town = makeGameState({ seed: 7, party: [hero()] })
    expectActionError(() => gameReducer(data, town, { type: 'skipTrialBoon' }), 'noTrial')
    expectActionError(
      () => gameReducer(data, inRealm(), { type: 'chooseTrialBoon', boonId: 'atk' }),
      'noTrialBoonChoice'
    )
    const pending = inRealm({ boonChoices: ['atk'] })
    expectActionError(
      () => gameReducer(data, pending, { type: 'chooseTrialBoon', boonId: 'gold' }),
      'notTrialBoonChoice',
      { boonId: 'gold' }
    )
    const fighting = gameReducer(data, inRealm(), { type: 'challengeTrial' })
    const pendingInBattle: GameState = {
      ...fighting,
      trial: realmOf({ boonChoices: ['atk'] })
    }
    expectActionError(
      () => gameReducer(data, pendingInBattle, { type: 'skipTrialBoon' }),
      'inBattle'
    )
  })

  it('thua hoặc bỏ cuộc: hết lượt, mất ân huệ', () => {
    const weak = makeMonster({ id: 'w', genes: uniformStats(1) })
    const boons = [{ boonId: 'atk', stacks: 2 }]
    expect(fightRealm(inRealm({ boons }, [weak])).trial).toBeNull()
    expect(gameReducer(data, inRealm({ boons }), { type: 'abandonTrial' }).trial).toBeNull()
  })
})

describe('ân huệ trong trận', () => {
  it('hook theo phe người chơi, hệ số = cấp (nguồn % boons); phe địch không có', () => {
    const fighting = gameReducer(data, inRealm({ boons: [{ boonId: 'atk', stacks: 2 }] }), {
      type: 'challengeTrial'
    })
    const battle = defined(fighting.battle)
    expect(battle.teamBonuses.player).toContainEqual({ kind: 'boon', id: 'atk', stacks: 2 })
    expect(battle.teamBonuses.enemy.some((bonus) => bonus.kind === 'boon')).toBe(false)
    expect(validateGameState(data, fighting)).toEqual([])
    // Ép kiểu: state đang trong trận dùng như Draft chỉ để đọc bối cảnh.
    const d = fighting as Draft
    const monster = d.party[0]
    const { percentBySource } = computeStats(data, monster, {
      battle: defined(monsterBattleContext(data, d, monster))
    })
    expect(percentBySource.boons.attack).toBe(20)
  })

  it('hook vào sân theo phe (đặt môi trường, đổi bậc) cũng chạy, như trait của quái', () => {
    const state = inRealm({ boons: [{ boonId: 'rainAltar', stacks: 1 }] })
    const battle = defined(gameReducer(data, state, { type: 'challengeTrial' }).battle)
    expect(battle.field.weather.id).toBe('rain')
    expect(battle.stages.h?.speed).toBe(1)
    for (const enemy of battle.enemies) expect(battle.stages[enemy.id]?.attack).toBe(-1)
  })

  it('chỉ trận bí cảnh có ân huệ: tháp / Khí giới bí cảnh không', () => {
    const state = inRealm({ boons: [{ boonId: 'atk', stacks: 1 }] })
    expect(battleTrialBoons(state, { kind: 'realm' })).toHaveLength(1)
    expect(battleTrialBoons(state, { kind: 'tower' })).toEqual([])
    expect(battleTrialBoons(state, { kind: 'itemWorld' })).toEqual([])
    expect(battleTrialBoons(state, null)).toEqual([])
  })

  it('ân huệ thưởng: nhân tiền / EXP của trận bí cảnh', () => {
    const money = (boons: TrialBoonStack[]): number => {
      const state = inRealm({ boons })
      return Number(leave(fightRealm(state)).money.minus(state.money).toString())
    }
    const plain = money([])
    expect(plain).toBeGreaterThan(0)
    expect(money([{ boonId: 'gold', stacks: 2 }])).toBeGreaterThan(plain)
    const exp = (boons: TrialBoonStack[]): number =>
      Number(leave(fightRealm(inRealm({ boons }))).party[0].exp.toString())
    expect(exp([{ boonId: 'wise', stacks: 1 }])).toBeGreaterThan(exp([]))
  })

  it('ân huệ hồi máu: cộng healPercent (kẹp 100); luật noHealing tắt', () => {
    const damaged = (state: GameState): GameState => {
      const monster = state.party[0]
      const lost = getMaxHp(data, monster).times(0.9).floor()
      return { ...state, party: [{ ...monster, damageTaken: lost }] }
    }
    const left = (overrides: Partial<SecretRealm>): number =>
      Number(leave(fightRealm(damaged(inRealm(overrides)))).party[0].damageTaken.toString())
    const plain = left({})
    const healed = left({ boons: [{ boonId: 'heal', stacks: 2 }] })
    expect(healed).toBeLessThan(plain)
    expect(healed).toBe(0)
    const blocked = left({ rules: [rule('noHealing')], boons: [{ boonId: 'heal', stacks: 2 }] })
    expect(blocked).toBeGreaterThan(plain)
  })

  it('ân huệ rương: thêm lượt tung món của rương bí cảnh', () => {
    const potions = (boons: TrialBoonStack[]): number => {
      const state = inRealm({ cleared: 2, boons })
      return getItemCount(fightRealm(state).inventory, 'potion')
    }
    // Rương fixture: mỗi lượt 2 Potion; ân huệ rương 2 lượt × cấp 1 = thêm 4 Potion.
    expect(potions([{ boonId: 'chest', stacks: 1 }]) - potions([])).toBe(4)
  })

  it('bossWeaken: boss của trận bí cảnh mất % max HP đầu trận, kẹp bossWeakenCapPercent', () => {
    const bossLoss = (boons: TrialBoonStack[], cleared = 2): string[] => {
      const battle = defined(
        gameReducer(data, inRealm({ cleared, boons }), { type: 'challengeTrial' }).battle
      )
      return battle.enemies.map((enemy) => {
        const lost = enemy.damageTaken.div(getMaxHp(data, enemy)).times(100).floor()
        return lost.toString()
      })
    }
    expect(bossLoss([{ boonId: 'slayer', stacks: 1 }])).toEqual(['30'])
    expect(bossLoss([{ boonId: 'slayer', stacks: 3 }])).toEqual(['50'])
    expect(bossLoss([])).toEqual(['0'])
    // Trận thường (không phải boss) không bị ảnh hưởng.
    expect(bossLoss([{ boonId: 'slayer', stacks: 1 }], 0).every((lost) => lost === '0')).toBe(true)
    const fighting = gameReducer(
      data,
      inRealm({ cleared: 2, boons: [{ boonId: 'slayer', stacks: 1 }] }),
      {
        type: 'challengeTrial'
      }
    )
    const boss = defined(fighting.battle).enemies[0]
    expect(battleLog(fighting)).toContainEqual({
      type: 'bossWeakened',
      monsterId: boss.id,
      amount: boss.damageTaken
    })
    expect(validateGameState(data, fighting)).toEqual([])
    expect(migrateState(serializeState(fighting), data)).toEqual(fighting)
    expect(trialBoonBossWeakenPercent(data, [{ boonId: 'slayer', stacks: 1e12 }])).toBe(50)
  })

  it('tra tổng hiệu ứng theo cấp; số cực lớn vẫn hữu hạn', () => {
    const boons: TrialBoonStack[] = [
      { boonId: 'gold', stacks: 3 },
      { boonId: 'wise', stacks: 1 },
      { boonId: 'heal', stacks: 2 },
      { boonId: 'chest', stacks: 2 }
    ]
    expect(trialBoonRewardPercent(data, boons, 'reward')).toBe(150)
    expect(trialBoonRewardPercent(data, boons, 'exp')).toBe(50)
    expect(trialBoonHealPercent(data, boons)).toBe(40)
    expect(trialBoonChestRolls(data, boons)).toBe(4)
    expect(trialBoonRewardPercent(data, [], 'reward')).toBe(0)
    const huge = trialBoonRewardPercent(data, [{ boonId: 'gold', stacks: 1e12 }], 'reward')
    expect(Number.isFinite(huge)).toBe(true)
  })
})

describe('kiểm tra dữ liệu ân huệ', () => {
  it('ân huệ sai bậc / hiệu ứng / trường, config sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.trialBoons = [
          // Ép kiểu: dữ liệu JSON sai để kiểm tra luật kiểm tra dữ liệu.
          {
            id: 'badRarity',
            rarity: 'mythic' as 'common',
            effects: [{ type: 'heal', percent: 5 }]
          },
          { id: 'noEffects', rarity: 'common', effects: [] },
          { id: 'badMax', rarity: 'common', maxStacks: 0, effects: [{ type: 'chest', rolls: 1 }] },
          {
            id: 'badEffect',
            rarity: 'rare',
            effects: [
              { type: 'nope' as 'heal', percent: 1 },
              { type: 'reward', channel: 'luck' as 'exp', percent: -1 },
              { type: 'heal', percent: 5, extra: 1 } as never,
              { type: 'hooks', hooks: [{ type: 'missingHook', params: {} }] }
            ]
          }
        ]
        raw.config.trials.boons.choiceCount = -1
        raw.config.trials.boons.rarityWeights = { common: 1 } as never
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('Ân huệ "badRarity": rarity phải là')
    expect(issues).toContain('Ân huệ "noEffects": effects phải là danh sách không rỗng')
    expect(issues).toContain('Ân huệ "badMax": maxStacks')
    expect(issues).toContain('effects[0]: type phải là một trong')
    expect(issues).toContain('effects[1]: channel phải là reward / exp')
    expect(issues).toContain('effects[1]: percent')
    expect(issues).toContain('effects[2]: trường "extra"')
    expect(issues).toContain('hook "missingHook" chưa có trong registry')
    expect(issues).toContain('config.trials.boons.choiceCount')
    expect(issues).toContain('config.trials.boons.rarityWeights.rare')
  })

  it('luật boonChoices cần count nguyên ≥ 1', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.trialRules.push({ id: 'zero', type: 'boonChoices', params: { count: 0 }, weight: 1 })
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('Luật bí cảnh "zero": count')
  })

  it('dữ liệu fixture có ân huệ hợp lệ', () => {
    expect(dataIssuesAfter((raw) => (raw.trialBoons = BOONS), { regenerateText: true })).toEqual([])
  })
})

describe('save', () => {
  it('kiểm tra ân huệ của bí cảnh và mục phối hợp đội', () => {
    const state = inRealm({
      boons: [
        { boonId: 'ghost', stacks: 1 },
        { boonId: 'once', stacks: 2 },
        { boonId: 'atk', stacks: 0 },
        { boonId: 'atk', stacks: 1 }
      ],
      boonChoices: ['ghost', 'gold', 'gold']
    })
    const issues = validateGameState(data, state).join('\n')
    expect(issues).toContain('trial.boons[0].boonId: ân huệ không tồn tại "ghost"')
    expect(issues).toContain('trial.boons[1].stacks 2 vượt maxStacks 1')
    expect(issues).toContain('trial.boons[2].stacks')
    expect(issues).toContain('trial.boons bị lặp')
    expect(issues).toContain('trial.boonChoices: ân huệ không tồn tại "ghost"')
    expect(issues).toContain('trial.boonChoices bị lặp')

    const enemy = makeMonster({ id: 'e' })
    const battle = makeBattleState([hero()], [enemy], {
      teamBonuses: {
        player: [{ kind: 'boon', id: 'ghost', stacks: 1 }],
        enemy: [{ kind: 'boon', id: 'atk', stacks: 1 }]
      }
    })
    const battleIssues = validateGameState(data, battle).join('\n')
    expect(battleIssues).toContain('ân huệ không tồn tại "ghost"')
    expect(battleIssues).toContain('ân huệ chỉ có ở phe người chơi')
  })

  it('lưu giữa hai trận khi đang chờ chọn; migrate v116 → v117: bí cảnh đang đi chưa có ân huệ', () => {
    const between = leave(fightRealm(inRealm({ boons: [{ boonId: 'atk', stacks: 1 }] })))
    expect(migrateState(serializeState(between), data)).toEqual(between)

    const raw = serializeState(inRealm()) as Record<string, unknown>
    const { boons: _boons, boonChoices: _choices, ...oldTrial } = realmOf()
    const migrated = migrateState({ ...raw, trial: oldTrial, version: 116 }, data)
    expect(migrated.trial).toEqual(realmOf())
    expect(validateGameState(data, migrated)).toEqual([])
    const noTrial = migrateState({ ...raw, trial: null, version: 116 }, data)
    expect(noTrial.trial).toBeNull()
  })
})
