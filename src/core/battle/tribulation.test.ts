// Độ kiếp (docs/rules/awakening.md): điều kiện bắt đầu, trừ nguyên liệu, trận một mình với Thiên
// Kiếp, lệnh bị cấm, thắng (lên tầng, phần thưởng mốc), thua (1 HP, trọng thương, chết hẳn), hết
// lượt, save, migrate, điều kiện tiến hóa, đồ rơi.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getCurrentHp, getMaxHp, isFainted } from '../monster'
import { getItemCount } from '../inventory'
import { isEvolutionConditionMet } from '../registries'
import { createRng, toBig } from '../shared'
import { fuseMonsters, makeOffspring } from '../progression'
import {
  atFloor,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster,
  RawGameData
} from '../model'

/**
 * Thiên Kiếp mặc định là "calm" (chỉ đứng yên) để trận dài tùy ý; thua thì đổi sang loài đánh
 * mạnh. Thần thông: hệ cỏ (quái fixture) là sap rồi strike... strike là hệ thường nên dùng blast.
 */
function makeTribData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.species.push({
    kind: 'normal',
    id: 'calm',
    raceId: 'neutral',
    elementIds: ['grass'],
    baseStats: uniformStats(10),
    evolutions: [],
    learnset: [{ level: 1, skillId: 'idle' }],
    catchRate: 0,
    lifespan: 100
  })
  raw.config.awakening.tribulation.speciesId = 'calm'
  raw.config.awakening.divineSkills = { grass: ['sap'] }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeTribData()
/** Thiên Kiếp đánh mạnh: level + 40, hệ số 20, biết strike / wave. */
const deadly = makeTribData((raw) => {
  raw.config.awakening.tribulation = {
    ...raw.config.awakening.tribulation,
    speciesId: 'strongling',
    levelOffset: 40,
    multiplierBase: 20
  }
})

const PILL = 'breakthroughPill'

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 50, skillIds: ['strike', 'idle'], ...overrides })

function townState(party: Monster[], pills = 10, money: number | string = 1e6): GameState {
  return {
    ...makeGameState({ seed: 7, party }),
    money: toBig(money),
    inventory: makeInventory({ [PILL]: pills, potion: 3, ball: 3 })
  }
}

const start = (state: GameState, gameData = data, monsterId = 'a'): GameState =>
  gameReducer(gameData, state, { type: 'startTribulation', monsterId })
const command = (skillId: string): BattleCommand => ({ slot: 0, kind: 'skill', skillId, target: 0 })
const turn = (state: GameState, commands: BattleCommand[], gameData = data): GameState =>
  gameReducer(gameData, state, { type: 'submitTurn', commands })
const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

/** Đánh tới khi trận kết thúc (tối đa 60 lượt). */
function fightOut(state: GameState, skillId: string, gameData = data): GameState {
  let current = state
  for (let i = 0; i < 60 && battleOf(current).phase !== 'ended'; i++) {
    current = turn(current, [command(skillId)], gameData)
  }
  return current
}
const leave = (state: GameState): GameState => gameReducer(data, state, { type: 'leaveBattle' })
const monsterIn = (state: GameState, id = 'a'): Monster =>
  defined(state.party.find((m) => m.id === id))

describe('bắt đầu độ kiếp', () => {
  it('trừ tiền và đan, mở trận một mình với Thiên Kiếp', () => {
    const state = townState([hero({ awakening: 2, level: 150 }), makeMonster({ id: 'b' })])
    const next = start(state)
    const battle = battleOf(next)
    // Tầng 3: tiền 1000 × 9, 3 viên.
    expect(state.money.minus(next.money).toString()).toBe('9000')
    expect(getItemCount(next.inventory, PILL)).toBe(7)
    expect(battle.tribulation).toEqual({ monsterId: 'a', tier: 3 })
    expect(battle.isBoss).toBe(false)
    expect(battle.playerSlots).toEqual(['a', null])
    expect(battle.tamers.player).toBeNull()
    expect(battle.teamBonuses).toEqual({ player: [], enemy: [] })
    const [enemy] = battle.enemies
    expect(enemy.speciesId).toBe('calm')
    expect(enemy.level).toBe(150)
    // Hệ số 2 + 0,25 × tầng hiện tại 2.
    expect(enemy.bossMultiplier).toBe(2.5)
    expect(enemy.shinyStacks).toBe(0)
    expect(eventsOf(next, 'fieldChanged').map((e) => e.source)).toEqual([
      'tribulation',
      'tribulation'
    ])
    expect(validateGameState(data, next)).toEqual([])
  })

  it('điều kiện: trong trận, ngoài thị trấn, không trong đội, gục, trọng thương, level', () => {
    const base = townState([hero()])
    expectActionError(() => start(base, data, 'zz'), 'monsterNotInParty', { monsterId: 'zz' })
    expectActionError(() => start(atFloor(base, 1)), 'notInTown')
    const inBattle = makeBattleState([hero()], [makeMonster({ id: 'e' })])
    expectActionError(() => start(inBattle), 'inBattle')
    const fainted = townState([hero({ damageTaken: toBig('1e9') })])
    expectActionError(() => start(fainted), 'monsterFainted', { monsterId: 'a' })
    const injured = townState([hero({ injuryBattlesLeft: 2 })])
    expectActionError(() => start(injured), 'injured', { monsterId: 'a', battlesLeft: 2 })
    // Biên: level 49 thiếu, level 50 đủ cho tầng 1.
    expectActionError(() => start(townState([hero({ level: 49 })])), 'levelTooLowForAwakening', {
      need: 50,
      have: 49
    })
    expect(start(townState([hero({ level: 50 })])).battle).not.toBeNull()
  })

  it('thiếu tiền / đan: báo lỗi, state giữ nguyên', () => {
    const poor = townState([hero()], 10, 999)
    expectActionError(() => start(poor), 'notEnoughMoney')
    const noPill = townState([hero()], 0)
    expectActionError(() => start(noPill), 'notEnoughAwakeningPills', {
      monsterId: 'a',
      have: 0,
      need: 1
    })
    expect(noPill.money.toString()).toBe('1000000')
  })

  it('Thức tỉnh đan phải cùng hệ với quái: hệ nào của quái cũng được, chồng nhiều trước', () => {
    const elemental = makeTribData((raw) => {
      raw.items.push(
        { id: 'pillFire', category: 'material', price: 10 },
        { id: 'pillWater', category: 'material', price: 10 }
      )
      raw.config.awakening.pillItemIds = { fire: 'pillFire', water: 'pillWater' }
    })
    const fire = hero({ elementIds: ['fire'] })
    const wrong = { ...townState([fire], 0), inventory: makeInventory({ pillWater: 5 }) }
    expectActionError(() => start(wrong, elemental), 'notEnoughAwakeningPills', {
      monsterId: 'a',
      have: 0,
      need: 1
    })
    const right = { ...wrong, inventory: makeInventory({ pillFire: 1, pillWater: 5 }) }
    expect(getItemCount(start(right, elemental).inventory, 'pillFire')).toBe(0)
    const dual = hero({ elementIds: ['fire', 'water'] })
    const both = {
      ...townState([dual], 0),
      inventory: makeInventory({ pillFire: 1, pillWater: 2 })
    }
    const started = start(both, elemental)
    expect(getItemCount(started.inventory, 'pillWater')).toBe(1)
    expect(getItemCount(started.inventory, 'pillFire')).toBe(1)
    // Quái không có hệ nào có đan: luôn thiếu (trừ khi pillsPerTier = 0).
    const plain = {
      ...townState([hero({ elementIds: ['normal'] })], 0),
      inventory: makeInventory({ pillFire: 9 })
    }
    expectActionError(() => start(plain, elemental), 'notEnoughAwakeningPills')
  })

  it('lần này thua là chết mà là quái duy nhất trong đội: chặn', () => {
    const last = townState([hero({ tribulationFailures: 5 })])
    expectActionError(() => start(last), 'partyWouldBeEmpty')
    const withOther = townState([hero({ tribulationFailures: 5 }), makeMonster({ id: 'b' })])
    expect(start(withOther).battle).not.toBeNull()
  })
})

describe('luật trận độ kiếp', () => {
  const state = start(townState([hero(), makeMonster({ id: 'b', skillIds: ['strike'] })]))

  it('không vật phẩm, không chạy, không đổi quái', () => {
    expectActionError(
      () => turn(state, [{ slot: 0, kind: 'item', itemId: 'potion', targetId: 'a' }]),
      'tribulationRestricted',
      { command: 'item' }
    )
    expectActionError(
      () => turn(state, [{ slot: 0, kind: 'item', itemId: 'ball', targetId: 'm1' }]),
      'tribulationRestricted',
      { command: 'item' }
    )
    expectActionError(() => gameReducer(data, state, { type: 'flee' }), 'tribulationRestricted', {
      command: 'flee'
    })
    expectActionError(
      () => turn(state, [{ slot: 0, kind: 'switch', monsterId: 'b' }]),
      'tribulationRestricted',
      { command: 'switch' }
    )
  })

  it('không kỹ năng ngự thú sư, không biến hình', () => {
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'submitTurn',
          commands: [command('idle')],
          tamer: { skillId: 'mend', targetId: 'a' }
        }),
      'tamerSkillUnavailable'
    )
    expectActionError(
      () => turn(state, [{ slot: 0, kind: 'skill', skillId: 'idle', transform: 'tera' }]),
      'transformUnavailable',
      { kind: 'tera', reason: 'tribulation' }
    )
  })

  it('hết maxTurns lượt chưa phân thắng thua là thua', () => {
    const short = makeTribData((raw) => (raw.config.awakening.tribulation.maxTurns = 2))
    const begun = start(townState([hero()]), short)
    const after1 = turn(begun, [command('idle')], short)
    expect(battleOf(after1).phase).toBe('chooseActions')
    const after2 = turn(after1, [command('idle')], short)
    expect(battleOf(after2).outcome).toBe('lost')
    expect(eventsOf(after2, 'tribulationFailed')).toHaveLength(1)
  })
})

describe('thắng', () => {
  it('lên tầng, reset thất bại, thần thông tầng 1 (ngoài learnset), không tiền / EXP / đồ', () => {
    const state = start(townState([hero({ tribulationFailures: 3 }), makeMonster({ id: 'b' })]))
    const ended = fightOut(state, 'strike')
    expect(battleOf(ended).outcome).toBe('won')
    const a = monsterIn(ended)
    expect(a.awakening).toBe(1)
    expect(a.tribulationFailures).toBe(0)
    expect(a.skillIds).toContain('sap')
    expect(a.extraSkillIds).toContain('sap')
    expect(a.exp.toString()).toBe(hero().exp.toString())
    expect(ended.money.toString()).toBe(state.money.toString())
    expect(ended.inventory).toEqual(state.inventory)
    expect(eventsOf(ended, 'awakened')).toEqual([{ type: 'awakened', monsterId: 'a', tier: 1 }])
    // Bộ đếm thành tựu: + độ kiếp thành công, Thiên Kiếp không tính là boss (achievements.md).
    expect(ended.stats).toMatchObject({ tribulationsPassed: 1, bossesDefeated: 0 })
    expect(defined(a.history).milestones.at(-1)).toEqual({ day: 0, kind: 'awakened', tier: 1 })
    expect(ended.party.map((m) => m.id)).toEqual(['a', 'b'])
    expect(validateGameState(data, ended)).toEqual([])
    expect(leave(ended).battle).toBeNull()
  })

  it('tầng 3: +1 ô trait (trần riêng cũng tăng)', () => {
    const before = hero({ awakening: 2, level: 150 })
    const ended = fightOut(start(townState([before])), 'strike')
    const a = monsterIn(ended)
    expect(a.awakening).toBe(3)
    expect(a.traitSlots).toBe(before.traitSlots + 1)
    expect(validateGameState(data, leave(ended))).toEqual([])
  })

  it('đủ skill thì thần thông vào skill chờ học', () => {
    const full = hero({ skillIds: ['strike', 'idle', 'growl', 'blast'] })
    const ended = fightOut(start(townState([full])), 'strike')
    expect(monsterIn(ended).pendingSkillIds).toEqual(['sap'])
  })
})

describe('thua', () => {
  it('thêm một lần thất bại, còn 1 HP, trọng thương 5 trận, không mất tiền', () => {
    const state = start(townState([hero(), makeMonster({ id: 'b' })]), deadly)
    const ended = fightOut(state, 'idle', deadly)
    expect(battleOf(ended).outcome).toBe('lost')
    const a = monsterIn(ended)
    expect(a.tribulationFailures).toBe(1)
    expect(a.injuryBattlesLeft).toBe(5)
    expect(isFainted(deadly, a)).toBe(false)
    expect(getCurrentHp(deadly, a).toString()).toBe('1')
    expect(a.awakening).toBe(0)
    expect(ended.money.toString()).toBe(state.money.toString())
    expect(eventsOf(ended, 'tribulationFailed')).toEqual([
      { type: 'tribulationFailed', monsterId: 'a', tier: 1, failures: 1 }
    ])
    expect(validateGameState(deadly, ended)).toEqual([])
  })

  it('trọng thương giảm 1 mỗi trận thắng có quái trong đội; hết thì độ kiếp lại được', () => {
    const prey = makeMonster({
      id: 'e1',
      level: 4,
      exp: toBig(64),
      damageTaken: toBig(60),
      skillIds: ['idle']
    })
    const injured = hero({ injuryBattlesLeft: 1 })
    const battle = makeBattleState([injured], [prey])
    const won = turn(battle, [command('strike')])
    expect(battleOf(won).outcome).toBe('won')
    expect(monsterIn(won).injuryBattlesLeft).toBe(0)
    expect(getMaxHp(data, monsterIn(won)).gt(getMaxHp(data, injured))).toBe(true)
  })

  it('thua lần thứ 6 liên tiếp: chết hẳn, đồ về túi, để lại hồn phách, trận vẫn hợp lệ', () => {
    const equipped = hero({
      tribulationFailures: 5,
      equipment: [{ storage: 'stack', itemId: 'everstone' }]
    })
    const state = start(townState([equipped, makeMonster({ id: 'b' })]), deadly)
    const ended = fightOut(state, 'idle', deadly)
    expect(ended.party.map((m) => m.id)).toEqual(['b'])
    expect(eventsOf(ended, 'diedInTribulation')).toEqual([
      { type: 'diedInTribulation', monsterId: 'a' }
    ])
    expect(getItemCount(ended.inventory, 'everstone')).toBe(1)
    const [soul] = ended.inventory.souls
    expect(soul.id).toBe('a')
    expect(soul.history?.milestones.at(-1)).toMatchObject({ kind: 'died', cause: 'tribulation' })
    expect(validateGameState(deadly, ended)).toEqual([])
    expect(validateGameState(deadly, leave(ended))).toEqual([])
  })
})

describe('save', () => {
  it('battle.tribulation sai: quái không trong đội, tầng sai, có ngự thú sư / boss', () => {
    const state = start(townState([hero()]))
    const battle = battleOf(state)
    const issues = validateGameState(data, {
      ...state,
      battle: {
        ...battle,
        isBoss: true,
        tribulation: { monsterId: 'a', tier: 2 },
        tamers: {
          player: { realm: 0, mana: 1, cooldowns: {}, uses: {}, skillIds: null },
          enemy: null
        }
      }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'battle.tribulation.tier phải là tầng kế tiếp của quái (0 + 1)',
        'battle.tribulation: trận độ kiếp không phải trận boss',
        'battle.tribulation: trận độ kiếp không có ngự thú sư'
      ])
    )
    const ghost = validateGameState(data, {
      ...state,
      battle: { ...battle, tribulation: { monsterId: 'zz', tier: 1 } }
    })
    expect(ghost).toContain('battle.tribulation: quái "zz" không có trong đội')
  })

  it('migrate v38 → v39: mọi quái 0, trận dở là trận thường; state hợp lệ', () => {
    const battle = makeBattleState([hero()], [makeMonster({ id: 'e' })])
    const raw = serializeState(battle) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const {
        awakening: _a,
        tribulationFailures: _f,
        injuryBattlesLeft: _i,
        ...rest
      } = monster as Record<string, unknown>
      return rest
    }
    const rawBattle = raw.battle as Record<string, unknown>
    const { tribulation: _tribulation, ...oldBattle } = rawBattle
    const old = {
      ...raw,
      version: 38,
      party: (raw.party as unknown[]).map(strip),
      battle: { ...oldBattle, enemies: (rawBattle.enemies as unknown[]).map(strip) }
    }
    const migrated = migrateState(old, data)
    expect(monsterIn(migrated).awakening).toBe(0)
    expect(defined(migrated.battle).enemies[0].injuryBattlesLeft).toBe(0)
    expect(defined(migrated.battle).tribulation).toBeNull()
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('liên quan', () => {
  it('điều kiện tiến hóa awakening { min }', () => {
    const check = (awakening: number): boolean =>
      isEvolutionConditionMet(
        data,
        hero({ awakening }),
        { type: 'awakening', params: { min: 2 } },
        { scene: { party: [], place: null, aptitudeFloor: 1, time: 0 } }
      )
    expect([check(1), check(2), check(3)]).toEqual([false, true, true])
  })

  it('con breeding không thừa hưởng; fuse giữ của quái gốc, mất của quái phụ', () => {
    const mother = makeMonster({ id: 'm', gender: 'female', awakening: 4, injuryBattlesLeft: 2 })
    const father = makeMonster({ id: 'd', gender: 'male', awakening: 9, tribulationFailures: 3 })
    const [child] = makeOffspring(data, createRng(1), father, mother, 'egg')
    expect([child.awakening, child.tribulationFailures, child.injuryBattlesLeft]).toEqual([0, 0, 0])
    const base = makeMonster({
      id: 'a',
      awakening: 3,
      tribulationFailures: 1,
      injuryBattlesLeft: 2
    })
    const sub = makeMonster({
      id: 'b',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      awakening: 9
    })
    const [fused] = fuseMonsters(data, createRng(1), base, sub)
    expect([fused.awakening, fused.tribulationFailures, fused.injuryBattlesLeft]).toEqual([3, 1, 2])
  })

  it('Thức tỉnh đan của hệ đầu rơi từ boss theo bossPillChance (0: không rơi)', () => {
    const drops = makeTribData((raw) => {
      raw.items.push({ id: 'pillFire', category: 'material', price: 10 })
      raw.config.awakening.pillItemIds = { fire: 'pillFire', grass: PILL }
      raw.config.awakening.bossPillChance = 100
    })
    const boss = {
      ...makeMonster({ id: 'boss', skillIds: ['idle'], elementIds: ['fire', 'grass'] }),
      bossMultiplier: 3
    }
    const dying = { ...boss, damageTaken: getMaxHp(drops, boss).minus(1) }
    const state = makeBattleState([hero()], [dying], { isBoss: true })
    const won = turn(state, [command('strike')], drops)
    expect(getItemCount(won.inventory, 'pillFire')).toBe(1)
    expect(getItemCount(won.inventory, PILL)).toBe(0)
    const none = turn(state, [command('strike')], data)
    expect(getItemCount(none.inventory, 'pillFire')).toBe(0)
  })
})
