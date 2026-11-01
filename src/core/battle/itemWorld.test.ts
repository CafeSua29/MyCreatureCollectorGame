// Khí giới bí cảnh (docs/rules/artifact-spirits.md): vào bằng món trong túi, tầng sức mạnh theo món,
// mỗi tầng thắng món + 1 cấp / + 1 tầng, gặp và thu phục dã linh, boss mỗi 10 tầng (thưởng), rời ở
// mốc / bằng Phá Giới Phù, thua không mất món, chặn việc khác khi đang đi, save và migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { depthOf, getItemCount, spiritsOf } from '../inventory'
import { expForLevel } from '../monster'
import { toBig } from '../shared'
import { itemWorldBossTier, itemWorldPowerFloor } from '../world'
import {
  FIXTURE_BREAK_TALISMAN_ID as TALISMAN,
  FIXTURE_SPIRIT_IDS,
  defined,
  equipped,
  expectActionError,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster,
  uniformStats
} from '../testing'
import type {
  ArtifactSpirit,
  BattleEvent,
  EquipmentInstance,
  GameData,
  GameState,
  ItemWorldRun,
  Monster
} from '../model'
import { suggestBattleCommands } from './ai'
import { suggestReplacements } from './battleActions'

const data = makeEquipmentData()
const [SWORD] = FIXTURE_SPIRIT_IDS

/** Dữ liệu luôn gặp dã linh ở mỗi tầng. */
const spiritData = makeEquipmentData((raw) => {
  raw.config.artifactSpirits.itemWorld.spiritChance = 100
})

const hero = (id = 'h'): Monster =>
  makeMonster({
    id,
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

const weakling = (): Monster => makeMonster({ id: 'w', genes: uniformStats(1) })

function townState(
  equipment: EquipmentInstance[] = [makeEquipment()],
  party: Monster[] = [hero()]
): GameState {
  return {
    ...makeGameState({ seed: 11, party, highestFloor: 3 }),
    nextItemId: 100,
    money: toBig(1e6),
    inventory: makeInventory({}, [], equipment)
  }
}

/** State đang đi Khí giới bí cảnh bằng món cho trước. */
const inItemWorld = (instance: EquipmentInstance, cleared = 0, party?: Monster[]): GameState => ({
  ...townState([], party),
  trial: { kind: 'itemWorld', instance, cleared }
})

function fightToEnd(state: GameState, gameData: GameData): GameState {
  let current = state
  for (let i = 0; i < 300 && current.battle?.phase !== 'ended'; i++) {
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

const fightFloor = (state: GameState, gameData: GameData = data): GameState =>
  fightToEnd(gameReducer(gameData, state, { type: 'challengeItemWorld' }), gameData)

const leave = (state: GameState, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, { type: 'leaveBattle' })

const runOf = (state: GameState): ItemWorldRun => {
  const run = state.trial
  if (run?.kind !== 'itemWorld') throw new Error('không trong Khí giới bí cảnh')
  return run
}

const logOf = (state: GameState): BattleEvent[] => defined(state.battle, 'trận').log

describe('tầng sức mạnh và boss', () => {
  it('theo bậc + tầng + cấp món, không theo tầng thế giới', () => {
    expect(itemWorldPowerFloor(data, makeEquipment(), 1)).toBe(2)
    expect(itemWorldPowerFloor(data, makeEquipment({ rarity: 'epic', level: 9 }), 10)).toBe(17)
    expect(itemWorldPowerFloor(data, makeEquipment(), 1e12)).toBe(1 + 5e11)
  })

  it('Khí Tướng mỗi 10 tầng, Khí Vương tầng chia hết 30 (bậc sau thắng bậc trước)', () => {
    expect(itemWorldBossTier(data, 9)).toBeNull()
    expect(itemWorldBossTier(data, 10)?.id).toBe('general')
    expect(itemWorldBossTier(data, 30)?.id).toBe('king')
    expect(itemWorldBossTier(data, 60)?.id).toBe('king')
    expect(itemWorldBossTier(data, 70)?.id).toBe('general')
  })
})

describe('vào và rời', () => {
  it('vào: món rời túi vào lượt đi, chưa mở trận; save hợp lệ', () => {
    const next = gameReducer(data, townState(), { type: 'enterItemWorld', instanceId: 'e1' })
    expect(next.inventory.equipment).toEqual([])
    expect(runOf(next)).toEqual({ kind: 'itemWorld', instance: makeEquipment(), cleared: 0 })
    expect(next.battle).toBeNull()
    expect(validateGameState(data, next)).toEqual([])
  })

  it('lỗi vào: món đang lắp, không có món, đang đi bí cảnh, ngoài thị trấn', () => {
    const sword = makeEquipment()
    const wearing = townState([], [makeMonster({ id: 'a', equipment: [equipped(sword)] })])
    const enter = (state: GameState, instanceId = 'e1'): GameState =>
      gameReducer(data, state, { type: 'enterItemWorld', instanceId })
    expectActionError(() => enter(wearing), 'equipmentEquipped', { monsterId: 'a' })
    expectActionError(() => enter(townState(), 'e9'), 'equipmentNotFound')
    expectActionError(() => enter(inItemWorld(makeEquipment({ id: 'e2' }))), 'trialInProgress')
    expectActionError(
      () => enter({ ...townState(), location: { type: 'floor', floor: 1 } }),
      'notInTown'
    )
  })

  it('rời: chưa qua tầng nào hoặc ở mốc 10 tầng thì miễn phí, món về túi giữ cấp / tầng', () => {
    const item = makeEquipment({ level: 11, depth: 10 })
    const left = gameReducer(data, inItemWorld(item, 3), { type: 'leaveItemWorld' })
    expect(left.trial).toBeNull()
    expect(left.inventory.equipment).toEqual([item])
    const fresh = gameReducer(data, inItemWorld(makeEquipment({ depth: 4 })), {
      type: 'leaveItemWorld'
    })
    expect(fresh.trial).toBeNull()
    // Ở mốc thì không tốn Phá Giới Phù dù có gửi useTalisman.
    const withTalisman = { ...inItemWorld(item, 3), inventory: makeInventory({ [TALISMAN]: 1 }) }
    const kept = gameReducer(data, withTalisman, { type: 'leaveItemWorld', useTalisman: true })
    expect(getItemCount(kept.inventory, TALISMAN)).toBe(1)
  })

  it('rời giữa mốc: phải dùng Phá Giới Phù', () => {
    const state = inItemWorld(makeEquipment({ depth: 4 }), 2)
    expectActionError(
      () => gameReducer(data, state, { type: 'leaveItemWorld' }),
      'itemWorldLeaveLocked',
      { depth: 4, leaveEvery: 10 }
    )
    expectActionError(
      () => gameReducer(data, state, { type: 'leaveItemWorld', useTalisman: true }),
      'notEnoughItem',
      { itemId: TALISMAN }
    )
    const withTalisman = {
      ...state,
      inventory: makeInventory({ [TALISMAN]: 1 })
    }
    const left = gameReducer(data, withTalisman, { type: 'leaveItemWorld', useTalisman: true })
    expect(left.trial).toBeNull()
    expect(getItemCount(left.inventory, TALISMAN)).toBe(0)
    expect(left.inventory.equipment).toHaveLength(1)
  })

  it('lỗi rời / đánh khi không đi Khí giới bí cảnh', () => {
    expectActionError(
      () => gameReducer(data, townState(), { type: 'leaveItemWorld' }),
      'noItemWorld'
    )
    expectActionError(
      () => gameReducer(data, townState(), { type: 'challengeItemWorld' }),
      'noItemWorld'
    )
  })

  it('đang đi: không nghỉ / rời thị trấn / vào bí cảnh khác', () => {
    const state = inItemWorld(makeEquipment())
    expectActionError(
      () => gameReducer(data, state, { type: 'travel', to: { type: 'floor', floor: 1 } }),
      'trialInProgress'
    )
    expectActionError(() => gameReducer(data, state, { type: 'challengeTower' }), 'trialInProgress')
  })
})

describe('đánh tầng', () => {
  it('thắng: món + 1 cấp, + 1 tầng, thưởng tầng, lượt đi tiếp tục', () => {
    const state = inItemWorld(makeEquipment())
    const opened = gameReducer(data, state, { type: 'challengeItemWorld' })
    const trial = defined(opened.battle, 'trận').trial
    expect(trial).toMatchObject({ kind: 'itemWorld', depth: 1, bossTierId: null, spirit: null })
    expect(defined(opened.battle, 'trận').floor).toBe(itemWorldPowerFloor(data, makeEquipment(), 1))
    expect(validateGameState(data, opened)).toEqual([])
    const ended = fightToEnd(opened, data)
    expect(logOf(ended)).toContainEqual({ type: 'itemWorldFloorCleared', depth: 1, level: 2 })
    const after = leave(ended)
    expect(runOf(after).instance).toMatchObject({ level: 2, depth: 1 })
    expect(runOf(after).cleared).toBe(1)
    expect(logOf(ended)).toContainEqual({ type: 'itemRewarded', itemId: 'potion', count: 1 })
    expect(validateGameState(data, after)).toEqual([])
  })

  it('tầng 10 là Khí Tướng: thêm dòng phụ hoặc + value mọi khí linh', () => {
    const spirits: ArtifactSpirit[] = [{ typeIds: [SWORD], value: 3, subdued: true }]
    const item = makeEquipment({ rarity: 'rare', depth: 9, spirits })
    const opened = gameReducer(data, inItemWorld(item), { type: 'challengeItemWorld' })
    expect(defined(opened.battle, 'trận').isBoss).toBe(true)
    const ended = fightToEnd(opened, data)
    const bonus = logOf(ended).find((event) => event.type === 'itemWorldBonus')
    const after = runOf(leave(ended)).instance
    if (bonus?.type === 'itemWorldBonus' && bonus.bonus === 'affix') {
      expect(after.rolls.length).toBe(item.rolls.length + 1)
    } else {
      expect(spiritsOf(after)[0].value).toBe(
        3 + data.config.artifactSpirits.itemWorld.bonus.spiritValue
      )
    }
    expect(depthOf(after)).toBe(10)
  })

  it('dã linh: gặp khí linh mới (gắn lên món, chưa thu phục), hạ quái mang nó thì thu phục', () => {
    const opened = gameReducer(spiritData, inItemWorld(makeEquipment()), {
      type: 'challengeItemWorld'
    })
    const trial = defined(opened.battle, 'trận').trial
    if (trial?.kind !== 'itemWorld') throw new Error('phải là trận Khí giới bí cảnh')
    const spirit = defined(trial.spirit, 'dã linh')
    expect(spirit.index).toBe(0)
    expect(defined(opened.battle, 'trận').enemies.map((m) => m.id)).toContain(spirit.carrierId)
    expect(spiritsOf(runOf(opened).instance)[0].subdued).toBe(false)
    expect(validateGameState(spiritData, opened)).toEqual([])
    const ended = fightToEnd(opened, spiritData)
    expect(logOf(ended).some((event) => event.type === 'spiritSubdued')).toBe(true)
    expect(spiritsOf(runOf(leave(ended, spiritData)).instance)[0].subdued).toBe(true)
  })

  it('dã linh có sẵn trên món được gặp trước; món hết ô và không còn dã linh thì không gặp', () => {
    const wild: ArtifactSpirit = { typeIds: [SWORD], value: 4, subdued: false }
    const opened = gameReducer(spiritData, inItemWorld(makeEquipment({ spirits: [wild] })), {
      type: 'challengeItemWorld'
    })
    const trial = defined(opened.battle, 'trận').trial
    expect(trial?.kind === 'itemWorld' && trial.spirit?.index).toBe(0)
    const tame: ArtifactSpirit = { ...wild, subdued: true }
    const full = gameReducer(spiritData, inItemWorld(makeEquipment({ spirits: [tame] })), {
      type: 'challengeItemWorld'
    })
    const fullTrial = defined(full.battle, 'trận').trial
    expect(fullTrial?.kind === 'itemWorld' && fullTrial.spirit).toBeNull()
  })

  it('thua: ra ngoài, món về túi, không mất cấp / tầng / tiền', () => {
    const item = makeEquipment({ level: 5, depth: 3 })
    const state = inItemWorld(item, 0, [weakling()])
    const ended = fightFloor(state)
    expect(logOf(ended)).toContainEqual({ type: 'itemWorldFailed' })
    const after = leave(ended)
    expect(after.trial).toBeNull()
    expect(after.inventory.equipment).toEqual([item])
    expect(after.money.eq(state.money)).toBe(true)
    expect(validateGameState(data, after)).toEqual([])
  })

  it('không bắt, không chạy trong trận', () => {
    const opened = gameReducer(data, inItemWorld(makeEquipment()), { type: 'challengeItemWorld' })
    expectActionError(() => gameReducer(data, opened, { type: 'flee' }), 'trialRestricted', {
      command: 'flee'
    })
  })
})

describe('save', () => {
  it('báo lỗi lượt đi sai, tầng trận không khớp món', () => {
    const bad = { ...inItemWorld(makeEquipment()), trial: { kind: 'itemWorld', cleared: -1 } }
    const issues = validateGameState(data, bad)
    expect(issues.some((issue) => issue.startsWith('trial.instance'))).toBe(true)
    expect(issues.some((issue) => issue.startsWith('trial.cleared'))).toBe(true)
    const opened = gameReducer(data, inItemWorld(makeEquipment()), { type: 'challengeItemWorld' })
    const battle = defined(opened.battle, 'trận')
    const trial = defined(battle.trial, 'trận Khí giới')
    const wrong = { ...opened, battle: { ...battle, trial: { ...trial, depth: 5 } } }
    expect(validateGameState(data, wrong).some((issue) => issue.includes('tầng kế tiếp'))).toBe(
      true
    )
  })

  it('id món đang đi Khí giới bí cảnh không được trùng món trong túi', () => {
    const state = {
      ...inItemWorld(makeEquipment()),
      inventory: makeInventory({}, [], [makeEquipment()])
    }
    expect(validateGameState(data, state)).toContain('id món trang bị bị trùng "e1"')
  })

  it('migrate v84: kho khí linh rỗng, Linh trì trống, bí cảnh mang loại realm', () => {
    const current = serializeState(townState()) as Record<string, unknown>
    const realm = { floor: 1, biomeId: 'field', rules: [], battleCount: 3, cleared: 0 }
    const inventory = { ...(current.inventory as Record<string, unknown>) }
    delete inventory.spirits
    const { spiritPools: _pools, ...rest } = current
    const old = { ...rest, version: 84, inventory, trial: realm }
    const migrated = migrateState(old, data)
    expect(migrated.inventory.spirits).toEqual([])
    expect(migrated.spiritPools).toEqual([])
    expect(migrated.trial).toEqual({ kind: 'realm', ...realm })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
