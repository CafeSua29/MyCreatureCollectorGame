// Độ bất ổn tầng (docs/rules/instability.md): mức tối đa theo tầng, đặt / đổi thuộc tính ở đền,
// ẩn / hiện, phạm vi trận áp dụng, từng loại thuộc tính, thưởng cộng, kiểm tra dữ liệu / save,
// migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { expForLevel } from '../monster'
import {
  battleRules,
  instabilityRewardPercent,
  rollInstabilityRules,
  TRIAL_RULES
} from '../registries'
import { createRng, toBig } from '../shared'
import { maxInstabilityLevel, type Encounter } from '../world'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  fixtureSite,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type { GameData, GameState, InstabilityState, Monster, RawGameData } from '../model'
import { suggestBattleCommands } from './ai'
import {
  applyEnemyRules,
  battleInstabilityFor,
  foreignEncounterSite,
  ruleTeamBonuses
} from './instability'

function makeInstabilityData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeInstabilityData()

/** Quái ta rất mạnh: thắng mọi trận ở tầng thấp. */
const hero = (id = 'h'): Monster =>
  makeMonster({
    id,
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

/** Thị trấn, tầng cao nhất `highestFloor`, có tiền. */
const townState = (highestFloor = 30, money = 1000): GameState =>
  makeGameState({ seed: 7, party: [hero()], highestFloor, money })

const withInstability = (state: GameState, instability: InstabilityState): GameState => ({
  ...state,
  instability
})

const visible = (ruleId: string): { ruleId: string; hidden: boolean } => ({ ruleId, hidden: false })

const setLevel = (state: GameState, level: number, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, { type: 'setInstability', level })

/** Đánh tới khi trận kết thúc bằng AI cho phe người chơi. */
function fightToEnd(state: GameState): GameState {
  let current = state
  for (let i = 0; i < 200 && current.battle?.phase !== 'ended'; i++) {
    current = gameReducer(data, current, {
      type: 'submitTurn',
      commands: suggestBattleCommands(data, current, { transforms: false })
    })
  }
  return current
}

describe('mức bất ổn tối đa', () => {
  it('⌊tầng cao nhất / 10⌋, không trần', () => {
    expect(maxInstabilityLevel(data, { highestFloor: 9, ascension: { bestFloor: 1 } })).toBe(0)
    expect(maxInstabilityLevel(data, { highestFloor: 10, ascension: { bestFloor: 1 } })).toBe(1)
    expect(maxInstabilityLevel(data, { highestFloor: 25, ascension: { bestFloor: 1 } })).toBe(2)
    expect(maxInstabilityLevel(data, { highestFloor: 1e12, ascension: { bestFloor: 1 } })).toBe(
      1e11
    )
  })
})

describe('đặt mức (setInstability)', () => {
  it('mỗi mức 1 thuộc tính hiện + 1 ẩn; tăng mức giữ thuộc tính cũ, giảm mức bỏ mức trên', () => {
    const one = setLevel(townState(), 1)
    expect(one.instability.level).toBe(1)
    expect(one.instability.properties.map((p) => p.hidden)).toEqual([false, true])
    const three = setLevel(one, 3)
    expect(three.instability.properties).toHaveLength(6)
    expect(three.instability.properties.slice(0, 2)).toEqual(one.instability.properties)
    expect(three.instability.properties.map((p) => p.hidden)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true
    ])
    const back = setLevel(three, 1)
    expect(back.instability).toEqual(one.instability)
    expect(setLevel(back, 0).instability).toEqual({ level: 0, properties: [] })
    expect(validateGameState(data, three)).toEqual([])
  })

  it('loại không stackable không trùng, kể cả ở mức rất cao', () => {
    const high = setLevel(townState(1000), 100)
    expect(high.instability.properties).toHaveLength(200)
    const types = high.instability.properties.map((p) => data.trialRules[p.ruleId].type)
    const single = types.filter((type) => !TRIAL_RULES[type].stackable)
    expect(new Set(single).size).toBe(single.length)
    expect(validateGameState(data, high)).toEqual([])
  })

  it('hết thuộc tính hợp lệ thì mức có ít thuộc tính hơn', () => {
    const onlyFlags = makeInstabilityData((raw) => {
      for (const rule of raw.trialRules) {
        if (rule.id !== 'noItems' && rule.id !== 'rainField') delete rule.instability
      }
    })
    const state = setLevel(townState(), 2, onlyFlags)
    expect(state.instability.properties.map((p) => p.ruleId).sort()).toEqual([
      'noItems',
      'rainField'
    ])
    const [none] = rollInstabilityRules(onlyFlags, createRng(1), {
      count: 3,
      existing: ['noItems', 'rainField']
    })
    expect(none).toEqual([])
  })

  it('lỗi: vượt mức tối đa, không đổi, sai dạng, không ở thị trấn, đang trong trận', () => {
    const state = townState(19)
    expectActionError(() => setLevel(state, 2), 'instabilityLevelTooHigh', { level: 2, max: 1 })
    expectActionError(() => setLevel(state, 0), 'instabilityUnchanged', { level: 0 })
    expectActionError(() => setLevel(state, -1), 'malformedAction')
    expectActionError(() => setLevel(state, 1.5), 'malformedAction')
    expectActionError(() => setLevel(atFloor(state, 1), 1), 'notInTown')
    const fighting = gameReducer(data, atFloor(state, 1), { type: 'startWildBattle' })
    expectActionError(() => setLevel(fighting, 1), 'inBattle')
  })
})

describe('đổi thuộc tính (rerollInstability)', () => {
  it('tốn 100 × mức tiền, tung lại toàn bộ (ẩn lại)', () => {
    const set = setLevel(townState(30, 1000), 3)
    const rerolled = gameReducer(data, set, { type: 'rerollInstability' })
    expect(rerolled.money.eq(700)).toBe(true)
    expect(rerolled.instability.level).toBe(3)
    expect(rerolled.instability.properties).toHaveLength(6)
    expect(rerolled.instability.properties.map((p) => p.hidden)).toEqual(
      set.instability.properties.map((p) => p.hidden)
    )
    expect(rerolled.rng).not.toBe(set.rng)
  })

  it('lỗi: chưa bật, thiếu tiền (state giữ nguyên)', () => {
    expectActionError(
      () => gameReducer(data, townState(), { type: 'rerollInstability' }),
      'instabilityOff'
    )
    const poor = setLevel(townState(30, 50), 1)
    expectActionError(
      () => gameReducer(data, poor, { type: 'rerollInstability' }),
      'notEnoughMoney',
      {
        need: toBig(100),
        have: toBig(50)
      }
    )
  })
})

describe('thuộc tính ẩn', () => {
  it('lộ ra khi rời thị trấn ra tầng', () => {
    const set = setLevel(townState(), 2)
    const out = gameReducer(data, set, { type: 'travel', to: { type: 'floor', floor: 1 } })
    expect(out.instability.properties.every((p) => !p.hidden)).toBe(true)
    expect(out.instability.properties.map((p) => p.ruleId)).toEqual(
      set.instability.properties.map((p) => p.ruleId)
    )
  })
})

describe('phạm vi trận', () => {
  const on = withInstability(townState(), { level: 1, properties: [visible('rainField')] })
  const floorBattle = { trial: null, tribulation: null, special: null, trainer: null }

  it('trận quái hoang / boss trên tầng và bí cảnh có; NPC, tháp, độ kiếp, thú triều không', () => {
    expect(battleInstabilityFor(on, floorBattle)).toEqual({ level: 1, ruleIds: ['rainField'] })
    expect(battleInstabilityFor(townState(), floorBattle)).toBeNull()
    const trainer = { classId: 'rookie', mode: 'floor' as const, rewardMultiplier: 1 }
    expect(battleInstabilityFor(on, { ...floorBattle, trainer } as never)).toBeNull()
    // Bí cảnh nhận độ bất ổn (docs/rules/trial-boons.md: khó hơn đổi lấy ân huệ hiếm hơn); tháp không.
    const trial = { kind: 'realm' as const, biomeId: 'field', rules: [] }
    expect(battleInstabilityFor(on, { ...floorBattle, trial })).toEqual({
      level: 1,
      ruleIds: ['rainField']
    })
    const tower = { kind: 'tower' as const, biomeId: 'field', rules: [], towerFloor: 1 }
    expect(battleInstabilityFor(on, { ...floorBattle, trial: tower })).toBeNull()
    const tribulation = { monsterId: 'h', tier: 1 }
    expect(battleInstabilityFor(on, { ...floorBattle, tribulation })).toBeNull()
    const tide = { kind: 'beastTide' as const, king: false }
    expect(battleInstabilityFor(on, { ...floorBattle, special: tide } as never)).toBeNull()
    const gathering = { kind: 'gathering' as const, method: 'fishing' as const, ambush: false }
    expect(battleInstabilityFor(on, { ...floorBattle, special: gathering } as never)).toEqual({
      level: 1,
      ruleIds: ['rainField']
    })
  })

  it('startWildBattle / challengeBoss: chụp độ bất ổn vào trận, log, áp luật', () => {
    const state = atFloor(on, 1)
    for (const type of ['startWildBattle', 'challengeBoss'] as const) {
      const battle = defined(gameReducer(data, state, { type }).battle, 'trận')
      expect(battle.instability).toEqual({ level: 1, ruleIds: ['rainField'] })
      expect(battle.log).toContainEqual({ type: 'instability', level: 1, ruleIds: ['rainField'] })
      expect(battle.field.weather?.id).toBe('rain')
    }
    const off = defined(
      gameReducer(data, atFloor(townState(), 1), { type: 'startWildBattle' }).battle
    )
    expect(off.instability).toBeNull()
  })
})

describe('từng thuộc tính', () => {
  const fight = (ruleIds: string[]): GameState =>
    gameReducer(
      data,
      atFloor(withInstability(townState(), { level: 1, properties: ruleIds.map(visible) }), 1),
      { type: 'startWildBattle' }
    )

  it('noItems: không dùng vật phẩm trong trận', () => {
    const fighting = fight(['noItems'])
    expectActionError(
      () =>
        gameReducer(data, fighting, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'item', itemId: 'potion', targetId: 'h' }]
        }),
      'trialRestricted',
      { command: 'item' }
    )
  })

  it('enemyMultiplier: chỉ số quái hoang × value, nhiều lần nhân dồn', () => {
    const enemy = defined(fight(['enemyDouble', 'enemyDouble']).battle).enemies[0]
    expect(enemy.bossMultiplier).toBe(4)
  })

  it('sideHooks: hook theo phe thành mục phối hợp đội, luật trùng gộp thành count', () => {
    const battle = defined(fight(['enemyRegen', 'enemyRegen', 'playerSlow']).battle)
    expect(battle.teamBonuses.enemy).toEqual([{ kind: 'rule', id: 'enemyRegen', count: 2 }])
    expect(battle.teamBonuses.player).toContainEqual({ kind: 'rule', id: 'playerSlow', count: 1 })
    expect(ruleTeamBonuses(data, [], 'player')).toEqual([])
  })

  it('sideHooks: hồi máu cuối lượt (regen) cho quái hoang', () => {
    // Hai bên đều sống qua lượt đầu: quái hoang trâu, quái ta đủ trâu để không gục.
    const enemy = makeMonster({ id: 'e', genes: uniformStats(2000), skillIds: ['strike'] })
    const weak = makeMonster({ id: 'h', genes: uniformStats(2000), skillIds: ['strike'] })
    const regen = makeBattleState([weak], [{ ...enemy, damageTaken: toBig(100) }], {
      instability: { level: 1, ruleIds: ['enemyRegen'] },
      teamBonuses: { player: [], enemy: [{ kind: 'rule', id: 'enemyRegen', count: 1 }] }
    })
    const plain = makeBattleState([weak], [{ ...enemy, damageTaken: toBig(100) }])
    const after = (state: GameState): number =>
      Number(
        defined(
          gameReducer(data, state, {
            type: 'submitTurn',
            commands: suggestBattleCommands(data, state, { transforms: false })
          }).battle
        ).enemies[0].damageTaken.toString()
      )
    expect(after(regen)).toBeLessThan(after(plain))
  })

  it('extraEnemyTraits: quái địch thêm trait và ô trait (không vượt trần)', () => {
    const rules = battleRules({ trial: null, instability: { level: 1, ruleIds: ['extraTrait'] } })
    const enemy = makeMonster({ id: 'e', traits: [], traitSlots: 1 })
    const encounter: Encounter = {
      enemies: [enemy],
      isBoss: false,
      rng: createRng(3),
      nextMonsterId: 9
    }
    const site = fixtureSite(data, 1)
    const ruled = applyEnemyRules(data, encounter, { site, rules })
    expect(ruled.enemies[0].traits).toHaveLength(1)
    expect(ruled.enemies[0].traitSlots).toBe(1)
    const twice = applyEnemyRules(data, encounter, { site, rules: [...rules, ...rules] })
    expect(twice.enemies[0].traits).toHaveLength(2)
    expect(twice.enemies[0].traitSlots).toBe(2)
    const capped = applyEnemyRules(
      data,
      { ...encounter, enemies: [{ ...enemy, traitSlots: data.config.traitSlots.max }] },
      { site, rules: Array.from({ length: 50 }, () => rules[0]) }
    )
    expect(capped.enemies[0].traits.length).toBeLessThanOrEqual(data.config.traitSlots.max)
    expect(applyEnemyRules(data, encounter, { site, rules: [] })).toBe(encounter)
  })

  it('fusedEnemies: quái hoang thường fuse với quái khác loài của map; boss thì không', () => {
    const mixed = makeInstabilityData((raw) => {
      const field = defined(raw.biomes.find((biome) => biome.id === 'field'))
      field.encounters = [...field.encounters, { speciesId: 'strongling', weight: 1 }]
    })
    const rules = [{ ruleId: 'fusedWild', elementId: null }]
    const enemy = makeMonster({ id: 'e' })
    const encounter: Encounter = {
      enemies: [enemy],
      isBoss: false,
      rng: createRng(3),
      nextMonsterId: 9
    }
    const site = fixtureSite(mixed, 1)
    const ruled = applyEnemyRules(mixed, encounter, { site, rules })
    expect(ruled.enemies[0].fused).toBe(true)
    expect(ruled.enemies[0].lineage).toEqual(['strongling'])
    expect(ruled.nextMonsterId).toBe(10)
    const boss = applyEnemyRules(mixed, { ...encounter, isBoss: true }, { site, rules })
    expect(boss.enemies[0].fused).toBe(false)
    // Map chỉ có một loài: không có quái khác loài để fuse.
    const lone = applyEnemyRules(data, encounter, { site: fixtureSite(data, 1), rules })
    expect(lone.enemies[0].fused).toBe(false)
  })

  it('foreignSpecies: bảng gặp của map khác, giữ boss / đồ rơi của map', () => {
    const foreign = makeInstabilityData((raw) => {
      for (const biome of raw.biomes) {
        if (biome.id !== 'field') biome.encounters = [{ speciesId: 'strongling', weight: 1 }]
      }
    })
    const site = fixtureSite(foreign, 1)
    const rules = [{ ruleId: 'foreignWild', elementId: null }]
    const [moved] = foreignEncounterSite(foreign, createRng(1), { site, rules })
    expect(moved.biome.id).toBe('field')
    expect(moved.biome.drops).toEqual(site.biome.drops)
    expect(moved.biome.encounters).not.toEqual(site.biome.encounters)
    const rng = createRng(1)
    expect(foreignEncounterSite(foreign, rng, { site, rules: [] })).toEqual([site, rng])
  })
})

describe('thưởng', () => {
  it('% thưởng = mức × 25 + rewardPercent của thuộc tính (cộng)', () => {
    expect(instabilityRewardPercent(data, null)).toBe(0)
    expect(instabilityRewardPercent(data, { level: 2, ruleIds: ['noItems', 'enemyDouble'] })).toBe(
      75
    )
    expect(instabilityRewardPercent(data, { level: 1e9, ruleIds: [] })).toBe(25e9)
  })

  it('tiền thắng trận × (1 + %)', () => {
    const enemy = makeMonster({ id: 'e', genes: uniformStats(1), level: 10 })
    const won = (state: GameState): number => {
      const ended = fightToEnd(state)
      const event = defined(ended.battle).log.find((entry) => entry.type === 'won')
      return event?.type === 'won' ? Number(event.money.toString()) : 0
    }
    const plain = won(makeBattleState([hero()], [enemy]))
    const boosted = won(
      makeBattleState([hero()], [enemy], { instability: { level: 2, ruleIds: ['rainField'] } })
    )
    expect(plain).toBeGreaterThan(0)
    expect(boosted).toBe(Math.floor(plain * 1.5))
  })
})

describe('kiểm tra dữ liệu', () => {
  it('khối instability sai, loại chỉ dành cho độ bất ổn có weight, config sai', () => {
    const issues = dataIssuesAfter((raw) => {
      for (const rule of raw.trialRules) {
        if (rule.id === 'monoElement') rule.instability = { weight: 1, rewardPercent: 0 }
        if (rule.id === 'foreignWild') rule.weight = 1
        if (rule.id === 'noItems') rule.instability = { weight: -1, rewardPercent: 0 }
        if (rule.id === 'playerSlow') rule.params = { side: 'both', hooks: [] }
      }
      raw.config.instability.floorsPerLevel = 0
    }).join('\n')
    expect(issues).toContain(
      '"monoElement": loại monoElement không dùng được làm thuộc tính bất ổn'
    )
    expect(issues).toContain('"foreignWild": loại foreignSpecies chỉ dành cho độ bất ổn')
    expect(issues).toContain('"noItems": instability.weight')
    expect(issues).toContain('"playerSlow": side phải là')
    expect(issues).toContain('"playerSlow": hooks phải là danh sách không rỗng')
    expect(issues).toContain('config.instability.floorsPerLevel')
  })
})

describe('save', () => {
  it('kiểm tra độ bất ổn trong save', () => {
    const bad = withInstability(townState(19), {
      level: 2,
      properties: [
        visible('noItems'),
        visible('noItems'),
        visible('ghost'),
        { ruleId: 'monoElement', hidden: 'no' as unknown as boolean },
        visible('rainField')
      ]
    })
    const issues = validateGameState(data, bad).join('\n')
    expect(issues).toContain('instability.level 2 vượt mức tối đa')
    expect(issues).toContain('quá số thuộc tính của mức 2')
    expect(issues).toContain('loại noItems chỉ có một lần')
    expect(issues).toContain('thuộc tính bất ổn không tồn tại "ghost"')
    expect(issues).toContain('properties[3].hidden phải là boolean')
    expect(issues).toContain('thuộc tính bất ổn không tồn tại "monoElement"')
  })

  it('độ bất ổn chỉ ở trận quái hoang / boss trên tầng; lưu / đọc giữ nguyên', () => {
    const fighting = gameReducer(
      data,
      atFloor(withInstability(townState(), { level: 1, properties: [visible('rainField')] }), 1),
      { type: 'startWildBattle' }
    )
    expect(validateGameState(data, fighting)).toEqual([])
    expect(migrateState(serializeState(fighting), data)).toEqual(fighting)
    const battle = defined(fighting.battle)
    const tribulation = {
      ...fighting,
      battle: { ...battle, tribulation: { monsterId: 'h', tier: 1 } }
    }
    expect(validateGameState(data, tribulation).join('\n')).toContain(
      'battle.instability: chỉ có ở trận quái hoang / boss trên tầng'
    )
  })

  it('migrate v81 → v82: độ bất ổn tắt, trận dở không có độ bất ổn', () => {
    const fighting = gameReducer(data, atFloor(townState(), 1), { type: 'startWildBattle' })
    const raw = serializeState(fighting) as Record<string, unknown>
    const { instability: _instability, ...old } = raw
    const { instability: _battleInstability, ...oldBattle } = raw.battle as Record<string, unknown>
    const migrated = migrateState({ ...old, battle: oldBattle, version: 81 }, data)
    expect(migrated.instability).toEqual({ level: 0, properties: [] })
    expect(migrated.battle?.instability).toBeNull()
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
