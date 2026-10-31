// Đồ cầm tiêu hao (mục "Trang bị và đồ cầm" ở equipment.md): mỗi lúc kích hoạt (`heldUse`) dùng
// một lần rồi mất khỏi ô; chưa kích hoạt thì giữ; Magic Room tắt; kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { getMaxHp } from '../monster'
import {
  dataIssues,
  defined,
  expectActionError,
  held,
  makeBattleState,
  makeEquipmentData,
  makeField,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withEquipmentFixtures,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster
} from '../model'

const data = makeEquipmentData((raw) => {
  raw.fieldEffects.push({
    id: 'magicRoom',
    layer: 'room',
    duration: 5,
    hooks: [{ type: 'disableHeldItems', params: {} }]
  })
  raw.skills.push({
    id: 'teatime',
    elementId: 'normal',
    category: 'status',
    power: 0,
    accuracy: 100,
    priority: 0,
    target: 'self',
    effects: [{ type: 'consumeHeldItems', params: { tags: ['berry'] } }]
  })
})

const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], ...overrides })
const idler = (id: string, overrides: MonsterOverrides = {}): Monster =>
  fighter(id, { skillIds: ['idle'], ...overrides })

const command = (skillId: string): BattleCommand => ({ slot: 0, kind: 'skill', skillId, target: 0 })
const run = (state: GameState, skillId = 'strike', gameData: GameData = data): GameState =>
  gameReducer(gameData, state, { type: 'submitTurn', commands: [command(skillId)] })

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)
const enemyOf = (state: GameState, id = 'e1'): Monster =>
  defined(
    battleOf(state).enemies.find((m) => m.id === id),
    id
  )
const damageTo = (state: GameState, id: string): number =>
  eventsOf(state, 'damage')
    .filter((e) => e.targetId === id)
    .reduce((sum, e) => sum + e.amount.toNumber(), 0)

/** Quái máu còn đúng `hp`. */
function withHp(monster: Monster, hp: number): Monster {
  return { ...monster, damageTaken: getMaxHp(data, monster).minus(hp) }
}

describe('đồ cầm: lắp và kiểm tra dữ liệu', () => {
  it('lắp đồ cầm từ túi (chồng theo id), tháo về túi', () => {
    const state = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
      inventory: makeInventory({ sitrusBerry: 2 })
    }
    const worn = gameReducer(data, state, {
      type: 'equipItem',
      monsterId: 'a',
      item: { storage: 'stack', itemId: 'sitrusBerry' }
    })
    expect(worn.party[0].equipment).toEqual([held('sitrusBerry')])
    expect(worn.inventory.stacks).toEqual({ sitrusBerry: 1 })
    const back = gameReducer(data, worn, { type: 'unequipItem', monsterId: 'a', slotIndex: 0 })
    expect(back.inventory.stacks).toEqual({ sitrusBerry: 2 })
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'equipItem',
          monsterId: 'a',
          item: { storage: 'stack', itemId: 'potion' }
        }),
      'notEquippable'
    )
  })

  it('hook tác dụng liên tục hợp lệ cả khi không persistent; nhãn sai báo lỗi; hook rỗng hợp lệ', () => {
    const raw = withEquipmentFixtures(makeRawData())
    raw.items.push(
      {
        id: 'choiceBand',
        category: 'held',
        price: 1,
        hooks: [{ type: 'statModifier', params: { percent: { attack: 50 } } }]
      },
      { id: 'emptyBerry', category: 'held', price: 1, hooks: [], tags: [''] }
    )
    const text = dataIssues(withFixtureText(raw)).join('\n')
    expect(text).not.toMatch(/"choiceBand"/)
    expect(text).not.toMatch(/"emptyBerry": cần ít nhất một hook/)
    expect(text).toMatch(/"emptyBerry": tags phải là danh sách chuỗi khác rỗng/)
  })
})

describe('đồ cầm trong trận: dùng một lần', () => {
  it('Sitrus Berry (trigger): bị đánh còn ≤ 50% thì hồi 25%, mất khỏi ô; lần sau không hồi', () => {
    // Max HP 50, strike gây 7: còn 12 máu → 5 (≤ 50%) thì hồi 25% = 13 (làm tròn lên).
    const holder = withHp(idler('e1', { equipment: [held('sitrusBerry')] }), 12)
    const next = run(makeBattleState([fighter('a')], [holder]))
    expect(eventsOf(next, 'heldItemConsumed')).toEqual([
      { type: 'heldItemConsumed', monsterId: 'e1', itemId: 'sitrusBerry' }
    ])
    expect(eventsOf(next, 'traitTriggered')).toContainEqual({
      type: 'traitTriggered',
      monsterId: 'e1',
      traitId: 'sitrusBerry',
      source: 'held'
    })
    const after = enemyOf(next)
    expect(after.equipment).toEqual([])
    expect(after.damageTaken.toNumber()).toBe(50 - 5 - 13)
  })

  it('chưa đủ điều kiện thì giữ đồ qua lượt (và trên quái ta qua các trận)', () => {
    const holder = idler('a', { equipment: [held('sitrusBerry')] })
    const state = makeBattleState([holder], [fighter('e1', { skillIds: ['strike'] })])
    const next = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
    })
    expect(next.party[0].equipment).toEqual([held('sitrusBerry')])
  })

  it('Focus Sash: đầy máu trước đòn đủ hạ gục thì còn 1 máu, mất đồ; lần sau không trụ', () => {
    const sash = idler('e1', { equipment: [held('focusSash')] })
    const huge = fighter('a', {
      genes: { hp: 10, attack: 1000, defense: 10, spAttack: 10, spDefense: 10, speed: 10 }
    })
    const next = run(makeBattleState([huge], [sash]))
    const after = enemyOf(next)
    expect(getMaxHp(data, after).minus(after.damageTaken).toNumber()).toBe(1)
    expect(after.equipment).toEqual([])
    expect(eventsOf(next, 'heldItemConsumed')).toHaveLength(1)
  })

  it('Gem: đòn đầu cùng hệ +30% rồi mất; đòn sau bình thường', () => {
    const plain = run(makeBattleState([fighter('a')], [idler('e1')]))
    const gem = run(
      makeBattleState([fighter('a', { equipment: [held('normalGem')] })], [idler('e1')])
    )
    expect(damageTo(gem, 'e1')).toBeGreaterThan(damageTo(plain, 'e1'))
    expect(gem.party[0].equipment).toEqual([])
    const second = run(gem)
    expect(damageTo(second, 'e1') - damageTo(gem, 'e1')).toBe(damageTo(plain, 'e1'))
  })

  it('berry kháng hệ: chỉ khi trúng đòn hệ đó khắc hệ; đòn khác không làm mất berry', () => {
    const berry = (id: string): Monster => idler(id, { equipment: [held('occaBerry')] })
    const caster = fighter('a', { skillIds: ['blast', 'strike'] })
    const normalHit = run(makeBattleState([caster], [berry('e1')]))
    expect(enemyOf(normalHit).equipment).toEqual([held('occaBerry')])
    const plainFire = run(makeBattleState([caster], [idler('e1')]), 'blast')
    const fire = run(makeBattleState([caster], [berry('e1')]), 'blast')
    expect(damageTo(fire, 'e1')).toBeLessThan(damageTo(plainFire, 'e1'))
    expect(enemyOf(fire).equipment).toEqual([])
  })

  it('Custap Berry: máu ≤ 25% thì đi trước quái nhanh hơn, mất đồ', () => {
    const fast = fighter('e1', {
      skillIds: ['idle'],
      genes: { hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 100 }
    })
    const holder = withHp(fighter('a', { equipment: [held('custapBerry')] }), 10)
    const next = run(makeBattleState([holder], [fast]))
    expect(eventsOf(next, 'useSkill')[0].monsterId).toBe('a')
    expect(next.party[0].equipment).toEqual([])
  })

  it('Air Balloon: bay (không đứng trên đất) tới khi bị đánh trúng thì mất', () => {
    const balloon = idler('e1', { equipment: [held('airBalloon')] })
    const next = run(makeBattleState([fighter('a')], [balloon]))
    expect(enemyOf(next).equipment).toEqual([])
    expect(eventsOf(next, 'heldItemConsumed')).toEqual([
      { type: 'heldItemConsumed', monsterId: 'e1', itemId: 'airBalloon' }
    ])
  })

  it('Magic Room: đồ cầm không kích hoạt, không mất', () => {
    const holder = withHp(idler('e1', { equipment: [held('sitrusBerry')] }), 12)
    const state = makeBattleState([fighter('a')], [holder], {
      field: makeField({ rooms: [{ id: 'magicRoom', turnsLeft: 5 }] })
    })
    const next = run(state)
    expect(eventsOf(next, 'heldItemConsumed')).toEqual([])
    expect(enemyOf(next).equipment).toEqual([held('sitrusBerry')])
    expect(enemyOf(next).damageTaken.toNumber()).toBe(50 - 12 + 7)
  })

  it('Teatime: mọi quái trên sân ăn ngay berry (bỏ qua điều kiện); món không phải berry giữ nguyên', () => {
    const user = fighter('a', { skillIds: ['teatime'], equipment: [held('sitrusBerry')] })
    const foe = withHp(idler('e1', { equipment: [held('sitrusBerry'), held('focusSash')] }), 20)
    const wounded = withHp(user, 30)
    const next = run(makeBattleState([wounded], [foe]), 'teatime')
    expect(next.party[0].equipment).toEqual([])
    expect(next.party[0].damageTaken.toNumber()).toBe(50 - 30 - 13)
    expect(enemyOf(next).equipment).toEqual([held('focusSash')])
    expect(eventsOf(next, 'heldItemConsumed')).toHaveLength(2)
  })
})

describe('đồ cầm không tiêu hao (persistent)', () => {
  // Bậc chí mạng 3 = 100% (fixture: bậc 0 = 0%), để thấy món có tác dụng hay không.
  const persistentData = makeEquipmentData((raw) => {
    raw.skills.push({
      id: 'teatime',
      elementId: 'normal',
      category: 'status',
      power: 0,
      accuracy: 100,
      priority: 0,
      target: 'self',
      effects: [{ type: 'consumeHeldItems', params: {} }]
    })
    raw.items.push(
      {
        id: 'sharpClaw',
        category: 'held',
        price: 1,
        hooks: [{ type: 'critStage', params: { stages: 3 } }],
        persistent: true
      },
      {
        // Đồ cầm thường (không persistent) chỉ có hook liên tục: tác dụng mãi, không mất.
        id: 'plainBoost',
        category: 'held',
        price: 1,
        hooks: [{ type: 'damageVsLowHp', params: { hpBelowPercent: 100, percent: 50 } }]
      },
      {
        id: 'strongLeek',
        category: 'held',
        price: 1,
        hooks: [{ type: 'critStage', params: { stages: 3 } }],
        persistent: true,
        speciesIds: ['strongling']
      },
      {
        id: 'everBerry',
        category: 'held',
        price: 1,
        tags: ['berry'],
        hooks: [
          {
            type: 'trigger',
            params: {
              on: 'damaged',
              scope: 'self',
              effects: [{ do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 10 } }]
            }
          }
        ],
        persistent: true
      }
    )
  })
  const critOf = (state: GameState): boolean[] =>
    eventsOf(state, 'damage')
      .filter((e) => e.targetId === 'e1')
      .map((e) => e.critical)

  it('hook liên tục (bậc chí mạng) tác dụng mọi đòn, món không mất', () => {
    const user = fighter('a', { equipment: [held('sharpClaw')] })
    const next = run(makeBattleState([user], [idler('e1')]), 'strike', persistentData)
    expect(critOf(next)).toEqual([true])
    expect(next.party[0].equipment).toEqual([held('sharpClaw')])
    expect(eventsOf(next, 'heldItemConsumed')).toEqual([])
  })

  it('đồ cầm thường chỉ có hook liên tục: sát thương tăng, món không mất (hook không có heldUse)', () => {
    const damageOf = (state: GameState): string =>
      eventsOf(state, 'damage')
        .filter((e) => e.targetId === 'e1')
        .map((e) => e.amount.toString())
        .join()
    const plain = run(makeBattleState([fighter('a')], [idler('e1')]), 'strike', persistentData)
    const user = fighter('a', { equipment: [held('plainBoost')] })
    const boosted = run(makeBattleState([user], [idler('e1')]), 'strike', persistentData)
    expect(Number(damageOf(boosted))).toBeGreaterThan(Number(damageOf(plain)))
    expect(boosted.party[0].equipment).toEqual([held('plainBoost')])
    expect(eventsOf(boosted, 'heldItemConsumed')).toEqual([])
  })

  it('speciesIds: chỉ loài gốc trong danh sách được hưởng (Leek), loài khác cầm không có tác dụng', () => {
    const other = fighter('a', { equipment: [held('strongLeek')] })
    expect(critOf(run(makeBattleState([other], [idler('e1')]), 'strike', persistentData))).toEqual([
      false
    ])
    const owner = fighter('a', {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      equipment: [held('strongLeek')]
    })
    expect(critOf(run(makeBattleState([owner], [idler('e1')]), 'strike', persistentData))).toEqual([
      true
    ])
  })

  it('trigger của món không tiêu hao chạy mỗi lần, không mất; Teatime không ăn được', () => {
    const base = idler('e1', { equipment: [held('everBerry')] })
    const holder = { ...base, damageTaken: getMaxHp(persistentData, base).minus(30) }
    const next = run(makeBattleState([fighter('a')], [holder]), 'strike', persistentData)
    expect(eventsOf(next, 'traitTriggered').some((e) => e.traitId === 'everBerry')).toBe(true)
    expect(enemyOf(next).equipment).toEqual([held('everBerry')])
    const eater = fighter('a', { skillIds: ['teatime'], equipment: [held('everBerry')] })
    const ate = run(makeBattleState([eater], [idler('e1')]), 'teatime', persistentData)
    expect(ate.party[0].equipment).toEqual([held('everBerry')])
  })

  it('kiểm tra dữ liệu: persistent cho phép hook liên tục; persistent sai kiểu, speciesIds sai báo lỗi', () => {
    const raw = withEquipmentFixtures(makeRawData())
    raw.items.push(
      {
        id: 'band',
        category: 'held',
        price: 1,
        hooks: [{ type: 'statModifier', params: { percent: { attack: 50 } } }],
        persistent: true
      },
      {
        id: 'badFlag',
        category: 'held',
        price: 1,
        hooks: [],
        persistent: false as unknown as true
      },
      { id: 'noSpecies', category: 'held', price: 1, hooks: [], speciesIds: [] },
      {
        id: 'ghostSpecies',
        category: 'held',
        price: 1,
        hooks: [],
        speciesIds: ['nobody', 'twig', 'twig']
      }
    )
    const text = dataIssues(withFixtureText(raw)).join('\n')
    expect(text).not.toMatch(/"band"/)
    expect(text).toMatch(/"badFlag": persistent chỉ được là true/)
    expect(text).toMatch(/"noSpecies": speciesIds phải là danh sách khác rỗng/)
    expect(text).toMatch(/"ghostSpecies": speciesIds có loài trùng/)
    expect(text).toMatch(/"ghostSpecies": speciesIds có loài không tồn tại "nobody"/)
  })
})
