// Bí cảnh và tháp thí luyện (docs/rules/trials.md): luật (registry, tung luật), vào bí cảnh bằng
// lệnh, chuỗi trận và hồi máu giữa trận, rương, thua / bỏ cuộc, chặn việc khác khi đang đi bí cảnh,
// từng luật trong trận, tháp tất định theo tầng và thưởng, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { addItems, getItemCount } from '../inventory'
import { expForLevel, getMaxHp, isFainted } from '../monster'
import {
  hasTrialRule,
  rollTrialRules,
  trialEnemyMultiplier,
  trialFighters,
  trialFixedField
} from '../registries'
import { createRng, toBig } from '../shared'
import { towerFloorPlan } from '../world'
import {
  FIXTURE_TRIAL_TOKEN_ID,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type {
  BattleEvent,
  GameData,
  GameState,
  Monster,
  RawGameData,
  SecretRealm,
  TrialRule
} from '../model'
import { suggestBattleCommands } from './ai'
import { suggestReplacements } from './battleActions'
import { transformBlocker } from './transform'
import type { Draft } from './draft'

function makeTrialData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeTrialData()

/** Quái ta rất mạnh: thắng mọi trận ở tầng thấp. */
const hero = (id = 'h', speciesId = 'weakling'): Monster =>
  makeMonster({
    id,
    speciesId,
    baseSpeciesId: speciesId,
    elementIds: speciesId === 'cinder' ? ['fire'] : ['grass'],
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

/** Quái ta rất yếu: thua mọi trận. */
const weakling = (): Monster => makeMonster({ id: 'w', genes: uniformStats(1) })

const rule = (ruleId: string, elementId: string | null = null): TrialRule => ({ ruleId, elementId })

function townState(party: Monster[] = [hero()], tokens = 1): GameState {
  const state = makeGameState({ seed: 7, party, highestFloor: 2, money: 1000 })
  if (tokens === 0) return state
  return { ...state, inventory: addItems(state.inventory, FIXTURE_TRIAL_TOKEN_ID, tokens) }
}

/** State đang đi bí cảnh với luật cho trước (bỏ qua bước tung). */
function inRealm(rules: TrialRule[] = [], overrides: Partial<SecretRealm> = {}): GameState {
  const trial: SecretRealm = {
    kind: 'realm',
    floor: 3,
    biomeId: 'field',
    rules,
    battleCount: 3,
    cleared: 0,
    ...overrides
  }
  return { ...townState(), trial }
}

/** Đánh tới khi trận kết thúc bằng AI cho phe người chơi (cả chọn quái thay). */
function fightToEnd(state: GameState, gameData: GameData = data): GameState {
  let current = state
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

/** Đánh trận kế tiếp của bí cảnh tới hết rồi rời trận. */
function playRealmBattle(state: GameState, gameData: GameData = data): GameState {
  const ended = fightToEnd(gameReducer(gameData, state, { type: 'challengeTrial' }), gameData)
  return gameReducer(gameData, ended, { type: 'leaveBattle' })
}

const logOf = (state: GameState): BattleEvent[] => defined(state.battle, 'trận').log

describe('luật bí cảnh (registry)', () => {
  it('tra luật: có loại, môi trường cố định, hệ số địch (nhân dồn), quái một hệ', () => {
    const rules = [rule('rainField'), rule('enemyDouble'), rule('monoElement', 'fire')]
    expect(hasTrialRule(data, rules, 'fixedField')).toBe(true)
    expect(hasTrialRule(data, rules, 'noItems')).toBe(false)
    expect(hasTrialRule(data, undefined, 'noItems')).toBe(false)
    expect(trialFixedField(data, rules)).toEqual({ weather: 'rain' })
    expect(trialEnemyMultiplier(data, [rule('enemyDouble'), rule('enemyDouble')])).toBe(4)
    expect(trialEnemyMultiplier(data, [])).toBe(1)
    const party = [hero('a'), hero('b', 'cinder')]
    expect(trialFighters(data, party, rules).map((m) => m.id)).toEqual(['b'])
    expect(trialFighters(data, party, []).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('tung luật: đúng số, không trùng loại, tất định; tháp không có luật một hệ', () => {
    const count = { min: 8, max: 8 }
    const [rules] = rollTrialRules(data, createRng(1), {
      count,
      inTower: false,
      elementIds: ['fire']
    })
    expect(rules).toHaveLength(8)
    const types = rules.map((r) => data.trialRules[r.ruleId].type)
    expect(new Set(types).size).toBe(8)
    expect(rules.find((r) => r.ruleId === 'monoElement')?.elementId).toBe('fire')
    expect(
      rollTrialRules(data, createRng(1), { count, inTower: false, elementIds: ['fire'] })[0]
    ).toEqual(rules)
    const [tower] = rollTrialRules(data, createRng(1), { count, inTower: true, elementIds: [] })
    expect(tower).toHaveLength(7)
    expect(tower.some((r) => r.ruleId === 'monoElement')).toBe(false)
    // Không có hệ để chọn: bỏ luật một hệ.
    const [noElement] = rollTrialRules(data, createRng(1), {
      count,
      inTower: false,
      elementIds: []
    })
    expect(noElement.some((r) => r.ruleId === 'monoElement')).toBe(false)
    expect(
      rollTrialRules(data, createRng(1), {
        count: { min: 0, max: 0 },
        inTower: false,
        elementIds: []
      })[0]
    ).toEqual([])
  })
})

describe('vào bí cảnh', () => {
  it('tiêu một lệnh, tầng sức mạnh = tầng cao nhất + floorOffset, chưa mở trận', () => {
    const state = townState(undefined, 2)
    const next = gameReducer(data, state, { type: 'enterTrial' })
    const trial = defined(next.trial, 'bí cảnh')
    if (trial.kind !== 'realm') throw new Error('phải là bí cảnh')
    expect(trial.floor).toBe(3)
    expect(trial.battleCount).toBe(3)
    expect(trial.cleared).toBe(0)
    expect(Object.keys(data.biomes)).toContain(trial.biomeId)
    expect(getItemCount(next.inventory, FIXTURE_TRIAL_TOKEN_ID)).toBe(1)
    expect(next.battle).toBeNull()
    expect(validateGameState(data, next)).toEqual([])
  })

  it('báo lỗi: không có lệnh, không ở thị trấn, đang đi bí cảnh, đang dự giải', () => {
    const noToken = townState(undefined, 0)
    expectActionError(() => gameReducer(data, noToken, { type: 'enterTrial' }), 'notEnoughItem', {
      itemId: FIXTURE_TRIAL_TOKEN_ID,
      have: 0
    })
    const onFloor: GameState = { ...townState(), location: { type: 'floor', floor: 1 } }
    expectActionError(() => gameReducer(data, onFloor, { type: 'enterTrial' }), 'notInTown')
    expectActionError(() => gameReducer(data, inRealm(), { type: 'enterTrial' }), 'trialInProgress')
    const inTournament: GameState = {
      ...townState(),
      trainers: { ...townState().trainers, tournament: { lastPeriod: 0, round: 0 } }
    }
    expectActionError(
      () => gameReducer(data, inTournament, { type: 'enterTrial' }),
      'tournamentInProgress'
    )
  })
})

describe('chuỗi trận bí cảnh', () => {
  it('trận bí cảnh: map chủ đề, tầng sức mạnh vượt tầng đã mở, save hợp lệ; trận cuối là boss', () => {
    const state = inRealm()
    const battle = defined(gameReducer(data, state, { type: 'challengeTrial' }).battle, 'trận')
    expect(battle.trial).toEqual({ kind: 'realm', biomeId: 'field', rules: [] })
    expect(battle.floor).toBe(3)
    expect(battle.isBoss).toBe(false)
    expect(validateGameState(data, gameReducer(data, state, { type: 'challengeTrial' }))).toEqual(
      []
    )
    const last = gameReducer(data, inRealm([], { cleared: 2 }), { type: 'challengeTrial' })
    const lastBattle = defined(last.battle, 'trận')
    expect(lastBattle.isBoss).toBe(true)
    expect(lastBattle.enemies[0].speciesId).toBe(data.biomes.field.floorBossSpeciesId)
  })

  it('thắng: tiến độ + hồi máu giữa trận; xong mọi trận: rương, bí cảnh kết thúc, không mở tầng', () => {
    const hurt = { ...hero(), damageTaken: toBig(0) }
    let state: GameState = { ...inRealm(), party: [hurt] }
    state = playRealmBattle(state)
    expect(state.trial?.cleared).toBe(1)
    // Hồi máu sau trận (healPercent 50): quái đã mất máu được hồi.
    const wounded: GameState = {
      ...state,
      party: state.party.map((m) => ({ ...m, damageTaken: getMaxHp(data, m).minus(10) }))
    }
    const after = fightToEnd(gameReducer(data, wounded, { type: 'challengeTrial' }))
    expect(logOf(after)).toContainEqual({ type: 'trialProgress', cleared: 2, total: 3 })
    const healed = after.party[0]
    expect(healed.damageTaken.lt(getMaxHp(data, healed).minus(10))).toBe(true)
    const last = fightToEnd(
      gameReducer(data, gameReducer(data, after, { type: 'leaveBattle' }), {
        type: 'challengeTrial'
      })
    )
    expect(last.battle?.outcome).toBe('won')
    expect(logOf(last)).toContainEqual({ type: 'trialCompleted' })
    expect(logOf(last)).toContainEqual({ type: 'itemRewarded', itemId: 'potion', count: 2 })
    expect(last.trial).toBeNull()
    expect(last.highestFloor).toBe(2)
    expect(validateGameState(data, last)).toEqual([])
  })

  it('hồi máu giữa trận đỡ cả quái đã gục dậy (healPercent % max HP)', () => {
    const fainted = { ...hero('f'), damageTaken: getMaxHp(data, hero('f')) }
    const play = (rules: TrialRule[]): Monster => {
      const state = { ...inRealm(rules), party: [hero(), fainted] }
      const won = fightToEnd(gameReducer(data, state, { type: 'challengeTrial' }))
      return defined(
        won.party.find((m) => m.id === 'f'),
        'quái f'
      )
    }
    // Cùng trận, cùng RNG; luật noHealing cho máu trước khi hồi.
    const before = play([rule('noHealing')])
    const revived = play([])
    const maxHp = getMaxHp(data, revived)
    expect(revived.damageTaken.eq(before.damageTaken.minus(maxHp.times(50).div(100).ceil()))).toBe(
      true
    )
    expect(isFainted(data, revived)).toBe(false)
  })

  it('luật noHealing: không hồi máu sau trận, không dùng vật phẩm ngoài trận', () => {
    const state = inRealm([rule('noHealing')])
    const wounded: GameState = {
      ...state,
      party: state.party.map((m) => ({ ...m, damageTaken: getMaxHp(data, m).minus(10) }))
    }
    const won = fightToEnd(gameReducer(data, wounded, { type: 'challengeTrial' }))
    expect(logOf(won).some((e) => e.type === 'heal' && e.monsterId === 'h')).toBe(false)
    const withPotion = { ...won, battle: null, inventory: addItems(won.inventory, 'potion', 1) }
    expectActionError(
      () => gameReducer(data, withPotion, { type: 'useItem', itemId: 'potion', monsterId: 'h' }),
      'trialRestricted',
      { command: 'item' }
    )
  })

  it('thua: bí cảnh kết thúc, không mất tiền, log trialFailed', () => {
    const state: GameState = { ...inRealm([], { floor: 30 }), party: [weakling()] }
    const lost = fightToEnd(gameReducer(data, state, { type: 'challengeTrial' }))
    expect(lost.battle?.outcome).toBe('lost')
    expect(lost.trial).toBeNull()
    expect(lost.money.eq(state.money)).toBe(true)
    expect(logOf(lost)).toContainEqual({ type: 'trialFailed' })
  })

  it('bỏ cuộc giữa hai trận; báo lỗi khi không trong bí cảnh / đang trong trận', () => {
    expect(gameReducer(data, inRealm(), { type: 'abandonTrial' }).trial).toBeNull()
    expectActionError(() => gameReducer(data, townState(), { type: 'abandonTrial' }), 'noTrial')
    const fighting = gameReducer(data, inRealm(), { type: 'challengeTrial' })
    expectActionError(() => gameReducer(data, fighting, { type: 'abandonTrial' }), 'inBattle')
    expectActionError(() => gameReducer(data, townState(), { type: 'challengeTrial' }), 'noTrial')
  })

  it('đang đi bí cảnh: không nghỉ, không hồi máu ở thị trấn, không rời thị trấn, không vào trận khác', () => {
    const state = inRealm()
    const hurt: GameState = {
      ...state,
      party: state.party.map((m) => ({ ...m, damageTaken: toBig(5) }))
    }
    for (const action of [
      { type: 'rest' },
      { type: 'healParty' },
      { type: 'travel', to: { type: 'floor', floor: 1 } },
      { type: 'challengeArena' },
      { type: 'challengeTower' },
      { type: 'startTribulation', monsterId: 'h' }
    ] as const) {
      expectActionError(() => gameReducer(data, hurt, action), 'trialInProgress')
    }
  })

  it('trong trận bí cảnh: không ném bóng, không chạy trốn', () => {
    const fighting = gameReducer(data, inRealm(), { type: 'challengeTrial' })
    const enemyId = defined(fighting.battle, 'trận').enemies[0].id
    const withBall = { ...fighting, inventory: addItems(fighting.inventory, 'masterBall', 1) }
    expectActionError(
      () =>
        gameReducer(data, withBall, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'item', itemId: 'masterBall', targetId: enemyId }]
        }),
      'trialRestricted',
      { command: 'ball' }
    )
    expectActionError(() => gameReducer(data, fighting, { type: 'flee' }), 'trialRestricted', {
      command: 'flee'
    })
  })
})

describe('luật trong trận', () => {
  it('noItems: không dùng vật phẩm trong trận', () => {
    const fighting = gameReducer(data, inRealm([rule('noItems')]), { type: 'challengeTrial' })
    const withPotion = { ...fighting, inventory: addItems(fighting.inventory, 'potion', 1) }
    expectActionError(
      () =>
        gameReducer(data, withPotion, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'item', itemId: 'potion', targetId: 'h' }]
        }),
      'trialRestricted',
      { command: 'item' }
    )
  })

  it('monoElement: chỉ quái mang hệ vào trận; không còn quái hợp lệ thì báo lỗi', () => {
    const party = [hero('a'), hero('b', 'cinder')]
    const state: GameState = { ...inRealm([rule('monoElement', 'fire')]), party }
    const battle = defined(gameReducer(data, state, { type: 'challengeTrial' }).battle, 'trận')
    expect(battle.playerSlots).toEqual(['b', null])
    const onlyGrass: GameState = { ...state, party: [hero('a')] }
    expectActionError(
      () => gameReducer(data, onlyGrass, { type: 'challengeTrial' }),
      'noEligibleFighter',
      { elementIds: ['fire'] }
    )
  })

  it('fixedField, enemyMultiplier, bossOnly, noTransforms', () => {
    const rules = [rule('rainField'), rule('enemyDouble'), rule('bossOnly'), rule('noTransforms')]
    const fighting = gameReducer(data, inRealm(rules), { type: 'challengeTrial' })
    const battle = defined(fighting.battle, 'trận')
    expect(battle.field.weather.id).toBe('rain')
    expect(battle.log).toContainEqual({
      type: 'fieldChanged',
      layer: 'weather',
      fieldId: 'rain',
      source: 'trial'
    })
    expect(battle.log).toContainEqual({ type: 'trialRules', ruleIds: rules.map((r) => r.ruleId) })
    expect(battle.isBoss).toBe(true)
    // Boss của map field nhân bossMultiplier của biome (mặc định config) rồi × 2 của luật.
    const plain = defined(
      gameReducer(data, inRealm([rule('bossOnly')]), { type: 'challengeTrial' }).battle,
      'trận'
    )
    expect(battle.enemies[0].bossMultiplier).toBe(plain.enemies[0].bossMultiplier * 2)
    const d = fighting as Draft
    expect(transformBlocker(data, d, { side: 'player', monster: d.party[0], kind: 'tera' })).toBe(
      'trialRule'
    )
    expect(validateGameState(data, fighting)).toEqual([])
  })

  it('noTamerSkills: trận NPC không phe nào có ngự thú sư, save vẫn hợp lệ', () => {
    const npcData = makeTrialData((raw) => {
      raw.config.trials.realm.trainerChance = 100
    })
    const fighting = gameReducer(npcData, inRealm([rule('noTamerSkills')]), {
      type: 'challengeTrial'
    })
    const battle = defined(fighting.battle, 'trận')
    expect(battle.trainer?.mode).toBe('trial')
    expect(battle.tamers).toEqual({ player: null, enemy: null })
    expect(validateGameState(npcData, fighting)).toEqual([])
  })
})

describe('tháp thí luyện', () => {
  const enemiesOf = (state: GameState): string[] =>
    defined(state.battle, 'trận').enemies.map(
      (e) => `${e.speciesId}:${e.level}:${e.genes.hp.toString()}`
    )

  it('tầng tháp tất định theo số tầng (khác seed save vẫn cùng đội); trận NPC lớp thường', () => {
    const a = gameReducer(data, townState(), { type: 'challengeTower' })
    const other = { ...townState(), rng: createRng(999) }
    const b = gameReducer(data, other, { type: 'challengeTower' })
    expect(enemiesOf(a)).toEqual(enemiesOf(b))
    const battle = defined(a.battle, 'trận')
    expect(battle.trial).toMatchObject({ kind: 'tower', towerFloor: 1 })
    expect(battle.trainer?.mode).toBe('trial')
    expect(battle.floor).toBe(1)
    expect(towerFloorPlan(data, a, 1)).toEqual(towerFloorPlan(data, other, 1))
    expect(validateGameState(data, a)).toEqual([])
  })

  it('thắng: lên tầng, thưởng mỗi tầng, mốc mỗi milestoneEvery tầng; mỗi bossEvery tầng là boss', () => {
    const won = fightToEnd(gameReducer(data, townState(), { type: 'challengeTower' }))
    expect(won.battle?.outcome).toBe('won')
    expect(won.tower.highest).toBe(1)
    expect(logOf(won)).toContainEqual({ type: 'towerFloorCleared', floor: 1 })
    expect(logOf(won)).toContainEqual({ type: 'itemRewarded', itemId: 'potion', count: 1 })
    expect(validateGameState(data, won)).toEqual([])
    const atNine: GameState = { ...townState(), tower: { highest: 9 } }
    const milestone = fightToEnd(gameReducer(data, atNine, { type: 'challengeTower' }))
    expect(milestone.tower.highest).toBe(10)
    expect(logOf(milestone)).toContainEqual({ type: 'itemRewarded', itemId: 'potion', count: 5 })
    const atFour: GameState = { ...townState(), tower: { highest: 4 } }
    expect(gameReducer(data, atFour, { type: 'challengeTower' }).battle?.isBoss).toBe(true)
  })

  it('thua không mất gì; báo lỗi ngoài thị trấn / đội gục hết', () => {
    const state: GameState = { ...townState([weakling()]), tower: { highest: 40 } }
    const lost = fightToEnd(gameReducer(data, state, { type: 'challengeTower' }))
    expect(lost.battle?.outcome).toBe('lost')
    expect(lost.tower.highest).toBe(40)
    expect(lost.money.eq(state.money)).toBe(true)
    const onFloor: GameState = { ...townState(), location: { type: 'floor', floor: 1 } }
    expectActionError(() => gameReducer(data, onFloor, { type: 'challengeTower' }), 'notInTown')
    const fainted: GameState = {
      ...townState(),
      party: townState().party.map((m) => ({ ...m, damageTaken: getMaxHp(data, m) }))
    }
    expect(isFainted(data, fainted.party[0])).toBe(true)
    expectActionError(
      () => gameReducer(data, fainted, { type: 'challengeTower' }),
      'noHealthyMonster'
    )
  })
})

describe('Bí Cảnh Lệnh rơi từ boss', () => {
  it('tokenBossDrops 100%: hạ boss nhận lệnh', () => {
    const dropData = makeTrialData((raw) => {
      raw.config.trials.tokenBossDrops = [{ itemId: FIXTURE_TRIAL_TOKEN_ID, chance: 100 }]
    })
    const state: GameState = { ...townState(), location: { type: 'floor', floor: 1 } }
    const won = fightToEnd(gameReducer(dropData, state, { type: 'challengeBoss' }), dropData)
    expect(won.battle?.outcome).toBe('won')
    expect(getItemCount(won.inventory, FIXTURE_TRIAL_TOKEN_ID)).toBe(
      getItemCount(state.inventory, FIXTURE_TRIAL_TOKEN_ID) + 1
    )
  })
})

describe('kiểm tra dữ liệu', () => {
  it('luật sai loại / params, config sai', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.trialRules.push(
          // Ép kiểu: dữ liệu JSON sai loại để kiểm tra luật kiểm tra dữ liệu.
          { id: 'bad', type: 'nope' as 'noItems', params: {}, weight: 1 },
          { id: 'emptyField', type: 'fixedField', params: {}, weight: 1 },
          { id: 'wrongLayer', type: 'fixedField', params: { weather: 'grassy' }, weight: 1 },
          { id: 'weak', type: 'enemyMultiplier', params: { value: 0.5 }, weight: 1 },
          { id: 'extra', type: 'noItems', params: { level: 3 }, weight: -1 }
        )
        raw.config.trials.tokenItemId = 'missing'
        raw.config.trials.realm.battleCount = { min: 3, max: 1 }
        raw.config.trials.realm.chest.equipmentRarityWeights = { unique: 1 } as never
      },
      { regenerateText: true }
    ).join('\n')
    expect(issues).toContain('Luật bí cảnh "bad": type phải là')
    expect(issues).toContain('"emptyField": cần ít nhất một lớp')
    expect(issues).toContain('"wrongLayer"')
    expect(issues).toContain('"weak": value')
    expect(issues).toContain('"extra": params: trường "level"')
    expect(issues).toContain('"extra": weight')
    expect(issues).toContain('config.trials.tokenItemId')
    expect(issues).toContain('config.trials.realm.battleCount: max phải ≥ min')
    expect(issues).toContain('bậc lạ "unique"')
  })

  it('dữ liệu fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })
})

describe('save', () => {
  it('kiểm tra bí cảnh / tháp trong save', () => {
    const state: GameState = {
      ...inRealm([rule('monoElement'), rule('ghost')], { cleared: 3, biomeId: 'nowhere' }),
      location: { type: 'floor', floor: 1 },
      tower: { highest: -1 }
    }
    const issues = validateGameState(data, state).join('\n')
    expect(issues).toContain('trial.cleared phải < battleCount')
    expect(issues).toContain('trial.biomeId: map không tồn tại "nowhere"')
    expect(issues).toContain('trial.rules[0].elementId: hệ không tồn tại')
    expect(issues).toContain('luật bí cảnh không tồn tại "ghost"')
    expect(issues).toContain('trial: đang đi phó bản thì phải ở thị trấn')
    expect(issues).toContain('tower.highest')
  })

  it('trận tháp phải là tầng kế tiếp; lưu giữa hai trận bí cảnh được', () => {
    const fighting = gameReducer(data, townState(), { type: 'challengeTower' })
    const skipped: GameState = { ...fighting, tower: { highest: 5 } }
    expect(validateGameState(data, skipped).join('\n')).toContain('tầng tháp kế tiếp (6)')
    const between = playRealmBattle(inRealm())
    expect(between.trial?.cleared).toBe(1)
    expect(migrateState(serializeState(between), data)).toEqual(between)
  })

  it('migrate v45 → v46: không trong bí cảnh, tháp tầng 0', () => {
    const raw = serializeState(townState()) as Record<string, unknown>
    const { trial: _trial, tower: _tower, ...old } = raw
    const migrated = migrateState({ ...old, version: 45 }, data)
    expect(migrated.trial).toBeNull()
    expect(migrated.tower).toEqual({ highest: 0 })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
