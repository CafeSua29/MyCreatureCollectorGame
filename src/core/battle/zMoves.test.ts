// Z-Move (docs/rules/z-moves.md): power (bảng, đòn thay đổi, zPower), skill thật (crystal hệ / loài),
// điều kiện và mã lỗi, dùng trong trận (log, một lần mỗi phe, priority, luôn trúng, Z-Power, xuyên
// Max Guard, hồi quái vào thay), AI, crystal NPC, đồ rơi boss, save.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount, pickZCrystalFor, zCrystalFor } from '../inventory'
import { getMaxHp } from '../monster'
import { toBig } from '../shared'
import { createGameData } from '../gameData'
import {
  FIXTURE_GYM_LEADER_ID,
  dataIssuesAfter,
  defined,
  expectActionError,
  fixtureSite,
  makeBattleState,
  makeInventory,
  makeMonster,
  makeZMoveData,
  makeZMoveRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, BattleEvent, GameData, GameState, Monster, Skill } from '../model'
import { generateTrainerTeam } from '../world'
import { cloneDraft } from './draft'
import { suggestBattleCommands } from './ai'
import { zMoveBlocker, zMoveFor, zMovePower } from './zMoves'

const data = makeZMoveData()
const RING = { zRing: 1, dynamaxBand: 1 }

const holding = (...itemIds: string[]): MonsterOverrides => ({
  equipment: itemIds.map((itemId) => ({ storage: 'stack' as const, itemId }))
})

/** Quái ta: weakling hệ cỏ, mọi chỉ số 50. */
const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    speciesId: 'weakling',
    baseSpeciesId: 'weakling',
    elementIds: ['grass'],
    skillIds: ['strike', 'quick', 'zPumpUp', 'gigaSwing'],
    ...overrides
  })

/** Quái địch rất nhiều máu (thủ như quái ta, sát thương không chạm mức tối thiểu), chậm, chỉ biết `idle`. */
const foe = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['normal'],
    skillIds: ['idle'],
    genes: { ...uniformStats(1), hp: 100000 },
    ...overrides
  })

function battle(
  party: Monster[],
  enemies: Monster[],
  options: { stacks?: Record<string, number>; isBoss?: boolean } = {}
): GameState {
  const state = makeBattleState(party, enemies, { isBoss: options.isBoss ?? false })
  return { ...state, inventory: makeInventory(options.stacks ?? RING) }
}

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const use = (skillId: string, extra: Partial<BattleCommand> = {}, slot = 0): BattleCommand =>
  ({ slot, kind: 'skill', skillId, target: 0, ...extra }) as BattleCommand

const events = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  defined(state.battle, 'trận').log.filter(
    (event): event is Extract<BattleEvent, { type: T }> => event.type === type
  )

const enemy = (state: GameState, id: string): Monster =>
  defined(
    defined(state.battle, 'trận').enemies.find((m) => m.id === id),
    id
  )

const skill = (id: string, source: GameData = data): Skill => source.skills[id]

describe('power Z-Move', () => {
  it('bảng như Pokémon: biên các bậc, power 0, số cực lớn', () => {
    const power = (value: number): number => zMovePower(data, { ...skill('strike'), power: value })
    expect([0, 59, 60, 69, 75, 89, 95, 100, 115, 125, 139].map(power)).toEqual([
      100, 100, 120, 120, 140, 160, 175, 180, 185, 190, 195
    ])
    expect(power(140)).toBe(200)
    expect(power(1e12)).toBe(200)
  })

  it('đánh nhiều lần số đòn thay đổi: power × 3 rồi tra bảng; số đòn cố định thì không', () => {
    expect(zMovePower(data, skill('flurry'))).toBe(120)
    expect(zMovePower(data, skill('twinFang'))).toBe(100)
  })

  it('zPower của skill thay cho bảng', () => {
    expect(zMovePower(data, skill('gigaSwing'))).toBe(200)
  })
})

describe('skill thật khi dùng Z-Move', () => {
  it('không cầm crystal hợp skill: null', () => {
    expect(zMoveFor(data, ally('a'), skill('strike'))).toBeNull()
    expect(zMoveFor(data, ally('a', holding('fireZCrystal')), skill('strike'))).toBeNull()
  })

  it('crystal hệ: skill gây sát thương thành Z-Move của hệ, cùng loại, một mục tiêu', () => {
    const user = ally('a', holding('fireZCrystal', 'normalZCrystal'))
    const blast = defined(zMoveFor(data, user, skill('blast')), 'Z-Move lửa')
    expect(blast).toMatchObject({
      id: 'infernoOverdrive',
      category: 'special',
      power: 100,
      target: 'enemy',
      zMove: 'z'
    })
    const wave = defined(zMoveFor(data, user, skill('wave')), 'Z-Move thường')
    expect(wave).toMatchObject({ id: 'breakneckBlitz', target: 'enemy', category: 'special' })
  })

  it('crystal hệ: skill trạng thái giữ nguyên (Z-Power chạy riêng)', () => {
    const user = ally('a', holding('normalZCrystal'))
    expect(zMoveFor(data, user, skill('zPumpUp'))).toBe(skill('zPumpUp'))
  })

  it('crystal loài xét trước crystal hệ; cần đúng loài, quái không fuse', () => {
    const user = ally('a', holding('normalZCrystal', 'weaklingZCrystal'))
    expect(zMoveFor(data, user, skill('strike'))?.id).toBe('weaklingCrash')
    expect(zMoveFor(data, user, skill('quick'))?.id).toBe('breakneckBlitz')
    const other = ally('b', { ...holding('weaklingZCrystal'), speciesId: 'strongling' })
    expect(zMoveFor(data, other, skill('strike'))).toBeNull()
    const fused = { ...ally('c', holding('weaklingZCrystal')), fused: true }
    expect(zMoveFor(data, fused, skill('strike'))).toBeNull()
  })

  it('chiêu Max / Z-Move không thành Z-Move', () => {
    const user = ally('a', holding('normalZCrystal'))
    expect(zCrystalFor(data, user, skill('maxStrike'))).toBeUndefined()
    expect(zCrystalFor(data, user, skill('breakneckBlitz'))).toBeUndefined()
  })
})

describe('điều kiện và mã lỗi', () => {
  const holder = (): Monster => ally('a', holding('normalZCrystal'))

  it('thiếu Vòng Z: zMoveUnavailable noKeyItem, state giữ nguyên', () => {
    const state = battle([holder()], [foe('x')], { stacks: {} })
    expectActionError(() => turn(state, use('strike', { zMove: true })), 'zMoveUnavailable', {
      monsterId: 'a',
      skillId: 'strike',
      reason: 'noKeyItem'
    })
    expect(defined(state.battle, 'trận').zMoveUsed).toEqual({ player: false, enemy: false })
  })

  it('không cầm crystal hợp skill: noCrystal', () => {
    const state = battle(
      [ally('a', { ...holding('normalZCrystal'), skillIds: ['blast'] })],
      [foe('x')]
    )
    expectActionError(() => turn(state, use('blast', { zMove: true })), 'zMoveUnavailable', {
      reason: 'noCrystal'
    })
  })

  it('hai quái cùng xin trong một lượt, hoặc phe đã dùng: alreadyUsedBySide', () => {
    const state = battle([holder(), ally('b', holding('normalZCrystal'))], [foe('x'), foe('y')])
    expectActionError(
      () => turn(state, use('strike', { zMove: true }), use('strike', { zMove: true }, 1)),
      'zMoveUnavailable',
      { monsterId: 'b', reason: 'alreadyUsedBySide' }
    )
    const after = turn(state, use('strike', { zMove: true }), use('strike', {}, 1))
    expect(defined(after.battle, 'trận').zMoveUsed.player).toBe(true)
    expectActionError(
      () => turn(after, use('strike'), use('strike', { zMove: true }, 1)),
      'zMoveUnavailable',
      { reason: 'alreadyUsedBySide' }
    )
  })

  it('quái xin Dynamax cùng lượt (hoặc đang Dynamax): dynamaxed', () => {
    const state = battle([holder()], [foe('x')], { isBoss: true })
    expectActionError(
      () => turn(state, use('strike', { zMove: true, transform: 'dynamax' })),
      'zMoveUnavailable',
      { reason: 'dynamaxed' }
    )
    const dynamaxed = turn(state, use('strike', { transform: 'dynamax' }))
    expectActionError(() => turn(dynamaxed, use('strike', { zMove: true })), 'zMoveUnavailable', {
      reason: 'dynamaxed'
    })
  })

  it('trận độ kiếp: tribulation; zMove khác true hoặc kèm thế: malformedAction', () => {
    const state = battle([holder()], [foe('x')])
    const tribulation: GameState = {
      ...state,
      battle: { ...defined(state.battle, 'trận'), tribulation: { monsterId: 'a', tier: 1 } }
    }
    expect(
      zMoveBlocker(data, cloneDraft(tribulation), {
        side: 'player',
        monster: holder(),
        skill: skill('strike')
      })
    ).toBe('tribulation')
    const bad = { ...use('strike'), zMove: false } as unknown as BattleCommand
    expectActionError(() => turn(state, bad), 'malformedAction')
    expectActionError(
      () => turn(state, use('strike', { zMove: true, style: 'strong' })),
      'malformedAction'
    )
  })

  it('quái hoang / boss không có Vòng Z', () => {
    const d = cloneDraft(battle([ally('a')], [foe('x', holding('normalZCrystal'))]))
    expect(
      zMoveBlocker(data, d, { side: 'enemy', monster: d.battle.enemies[0], skill: skill('idle') })
    ).toBe('noKeyItem')
  })
})

describe('dùng Z-Move trong trận', () => {
  it('log zMoveUsed, phe hết lượt Z-Move, sát thương lớn hơn skill gốc', () => {
    const state = battle([ally('a', holding('normalZCrystal'))], [foe('x')])
    const normal = turn(state, use('strike'))
    const z = turn(state, use('strike', { zMove: true }))
    expect(events(z, 'zMoveUsed')).toEqual([
      { type: 'zMoveUsed', monsterId: 'a', skillId: 'strike', zSkillId: 'breakneckBlitz' }
    ])
    expect(events(normal, 'zMoveUsed')).toEqual([])
    expect(enemy(z, 'x').damageTaken.gt(enemy(normal, 'x').damageTaken)).toBe(true)
    expect(defined(z.battle, 'trận').zMoveUsed).toEqual({ player: true, enemy: false })
  })

  it('Z-Move riêng của loài dùng số cố định của nó', () => {
    const state = battle([ally('a', holding('normalZCrystal', 'weaklingZCrystal'))], [foe('x')])
    const z = turn(state, use('strike', { zMove: true }))
    expect(events(z, 'zMoveUsed')[0]?.zSkillId).toBe('weaklingCrash')
    const blitz = turn(
      battle([ally('a', holding('normalZCrystal'))], [foe('x')]),
      use('strike', { zMove: true })
    )
    expect(enemy(z, 'x').damageTaken.gt(enemy(blitz, 'x').damageTaken)).toBe(true)
  })

  it('luôn trúng: skill accuracy 50 thành Z-Move không trượt ở mọi seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const shaky = ally('a', { ...holding('normalZCrystal'), skillIds: ['shaky'] })
      const state = { ...battle([shaky], [foe('x')]), rng: seed }
      const z = turn(state, use('shaky', { zMove: true }))
      expect(events(z, 'miss')).toEqual([])
      expect(enemy(z, 'x').damageTaken.gt(0)).toBe(true)
    }
  })

  it('Z-Move gây sát thương có priority 0 (mất priority của skill gốc)', () => {
    const fast = foe('x', { genes: { ...uniformStats(1), hp: 100000, speed: 1000 } })
    const state = battle([ally('a', holding('normalZCrystal'))], [fast])
    const order = (s: GameState): string[] => events(s, 'useSkill').map((event) => event.monsterId)
    expect(order(turn(state, use('quick')))).toEqual(['a', 'x'])
    expect(order(turn(state, use('quick', { zMove: true })))).toEqual(['x', 'a'])
  })

  it('skill trạng thái: skill gốc chạy kèm Z-Power lên chính quái dùng', () => {
    const state = battle([ally('a', holding('normalZCrystal'))], [foe('x')])
    const z = turn(state, use('zPumpUp', { zMove: true }))
    expect(defined(z.battle, 'trận').stages.a).toEqual({ attack: 2, speed: 1 })
    expect(events(z, 'zMoveUsed')[0]).toMatchObject({ skillId: 'zPumpUp', zSkillId: 'zPumpUp' })
    const plain = turn(state, use('zPumpUp'))
    expect(defined(plain.battle, 'trận').stages.a).toEqual({ attack: 2 })
  })

  it('xuyên Max Guard: chỉ gây 25% sát thương; skill thường vẫn bị chặn', () => {
    const base = battle([ally('a', holding('normalZCrystal'))], [foe('x')])
    const guarded = (state: GameState): GameState => {
      const battleState = defined(state.battle, 'trận')
      return {
        ...state,
        battle: {
          ...battleState,
          volatiles: {
            ...battleState.volatiles,
            x: { firstTurn: 1, protect: { turn: 1, streak: 0 } }
          }
        }
      }
    }
    const open = turn(base, use('gigaSwing', { zMove: true }))
    const pierced = turn(guarded(base), use('gigaSwing', { zMove: true }))
    expect(events(pierced, 'protectPierced')).toEqual([
      { type: 'protectPierced', monsterId: 'x', userId: 'a' }
    ])
    const full = enemy(open, 'x').damageTaken.toNumber()
    const quarter = enemy(pierced, 'x').damageTaken.toNumber()
    expect(quarter).toBeGreaterThan(0)
    expect(Math.abs(quarter - full / 4)).toBeLessThanOrEqual(1)
    const blocked = turn(guarded(base), use('gigaSwing'))
    expect(events(blocked, 'protected')).toHaveLength(1)
    expect(enemy(blocked, 'x').damageTaken.eq(0)).toBe(true)
  })

  it('Z-Power hồi quái vào thay: rút về bằng skill, quái dự bị vào đầy máu', () => {
    const reserve = ally('r', { damageTaken: toBig(30) })
    const state = battle(
      [ally('a', { ...holding('normalZCrystal'), skillIds: ['farewell'] }), ally('b'), reserve],
      [foe('x'), foe('y')]
    )
    const z = turn(state, use('farewell', { zMove: true, switchTo: 'r' }), use('strike', {}, 1))
    expect(events(z, 'replacementHealed')).toEqual([{ type: 'replacementHealed', monsterId: 'r' }])
    const healed = defined(
      z.party.find((m) => m.id === 'r'),
      'r'
    )
    expect(healed.damageTaken.eq(0)).toBe(true)
    const plain = turn(state, use('farewell', { switchTo: 'r' }), use('strike', {}, 1))
    expect(events(plain, 'replacementHealed')).toEqual([])
  })

  it('trait lặp skill (kiểu Multicast) và đòn thêm (kiểu Parental Bond) không áp lên Z-Move', () => {
    const repeater = ally('a', {
      ...holding('normalZCrystal'),
      traits: [{ id: 'echoCast', level: 1 }]
    })
    const uses = (s: GameState): number =>
      events(s, 'useSkill').filter((e) => e.monsterId === 'a').length
    expect(uses(turn(battle([repeater], [foe('x')]), use('strike')))).toBe(2)
    expect(uses(turn(battle([repeater], [foe('x')]), use('strike', { zMove: true })))).toBe(1)
    expect(uses(turn(battle([repeater], [foe('x')]), use('zPumpUp', { zMove: true })))).toBe(1)
    const twin = ally('a', {
      ...holding('normalZCrystal'),
      traits: [{ id: 'twinStrike', level: 1 }]
    })
    const hits = (s: GameState): number =>
      events(s, 'damage').filter((e) => e.targetId === 'x').length
    expect(hits(turn(battle([twin], [foe('x')]), use('strike')))).toBe(2)
    expect(hits(turn(battle([twin], [foe('x')]), use('strike', { zMove: true })))).toBe(1)
  })

  it('hết trận vẫn giữ crystal (không tiêu hao)', () => {
    const state = battle([ally('a', holding('normalZCrystal'))], [foe('x')])
    const z = turn(state, use('strike', { zMove: true }))
    expect(z.party[0]?.equipment).toEqual([{ storage: 'stack', itemId: 'normalZCrystal' }])
  })
})

describe('AI', () => {
  it('gợi ý có Z-Move ở một số seed, mọi gợi ý hợp lệ; phe đã dùng thì không gợi ý nữa', () => {
    let suggested = 0
    for (let seed = 1; seed <= 30; seed++) {
      const state = {
        ...battle(
          [ally('a', holding('normalZCrystal')), ally('b', holding('normalZCrystal'))],
          [foe('x'), foe('y')]
        ),
        rng: seed
      }
      const commands = suggestBattleCommands(data, state)
      const zCount = commands.filter((c) => c.kind === 'skill' && c.zMove).length
      expect(zCount).toBeLessThanOrEqual(1)
      suggested += zCount
      const after = turn(state, ...commands)
      if (defined(after.battle, 'trận').phase !== 'chooseActions') continue
      const again = suggestBattleCommands(data, after)
      if (defined(after.battle, 'trận').zMoveUsed.player) {
        expect(again.some((c) => c.kind === 'skill' && c.zMove)).toBe(false)
      }
    }
    expect(suggested).toBeGreaterThan(0)
  })

  it('không có Vòng Z thì không gợi ý Z-Move', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = {
        ...battle([ally('a', holding('normalZCrystal'))], [foe('x')], { stacks: {} }),
        rng: seed
      }
      expect(suggestBattleCommands(data, state).some((c) => c.kind === 'skill' && c.zMove)).toBe(
        false
      )
    }
  })
})

describe('crystal của NPC, đồ rơi boss', () => {
  it('chọn crystal: loài nếu biết skill gốc; không thì hệ ưu tiên; không thì skill mạnh nhất; chỉ crystal có sẵn', () => {
    const weakling = ally('a', { skillIds: ['strike', 'blast'] })
    expect(pickZCrystalFor(data, weakling)?.id).toBe('weaklingZCrystal')
    const inBag = (crystal: { id: string }): boolean => crystal.id !== 'weaklingZCrystal'
    expect(pickZCrystalFor(data, weakling, { isAvailable: inBag })?.id).toBe('normalZCrystal')
    const other = ally('b', { speciesId: 'strongling', skillIds: ['strike', 'blast'] })
    expect(pickZCrystalFor(data, other, { preferredElementId: 'normal' })?.id).toBe(
      'normalZCrystal'
    )
    expect(pickZCrystalFor(data, other)?.id).toBe('normalZCrystal')
    const fireOnly = ally('c', { speciesId: 'strongling', skillIds: ['blast', 'idle'] })
    expect(pickZCrystalFor(data, fireOnly, { preferredElementId: 'water' })?.id).toBe(
      'fireZCrystal'
    )
    const statusOnly = ally('d', { speciesId: 'strongling', skillIds: ['idle'] })
    expect(pickZCrystalFor(data, statusOnly)).toBeUndefined()
  })

  it('NPC biến hình được: quái cuối đội cầm crystal, NPC thường không; có Vòng Z', () => {
    const leader = data.trainers[FIXTURE_GYM_LEADER_ID]
    const withRing: GameData = {
      ...data,
      trainers: { ...data.trainers, [leader.id]: { ...leader, transforms: true } }
    }
    const spec = {
      site: fixtureSite(withRing, 3),
      extraLevels: 0,
      realm: 0,
      nextMonsterId: 10,
      nextItemId: 1,
      elementIds: ['normal']
    }
    // Lớp biến hình được tung thêm trường biến hình như boss nên chỉ so phần crystal.
    const plain = generateTrainerTeam(data, 7, { ...spec, trainerClass: leader })
    const ringed = generateTrainerTeam(withRing, 7, {
      ...spec,
      trainerClass: withRing.trainers[leader.id]
    })
    const isCrystal = (entry: Monster['equipment'][number]): boolean =>
      entry.storage === 'stack' && entry.itemId.endsWith('ZCrystal')
    expect(plain.enemies.some((m) => m.equipment.some(isCrystal))).toBe(false)
    const ace = defined(ringed.enemies.at(-1), 'quái cuối')
    const crystal = pickZCrystalFor(withRing, ace, { preferredElementId: 'normal' })
    expect(crystal).toBeDefined()
    expect(ace.equipment.at(-1)).toEqual({ storage: 'stack', itemId: crystal?.id })
    expect(ringed.enemies.slice(0, -1).some((m) => m.equipment.some(isCrystal))).toBe(false)
    const state = battle([ally('a')], ringed.enemies.slice(-1))
    const d = cloneDraft({
      ...state,
      battle: {
        ...defined(state.battle, 'trận'),
        trainer: { classId: leader.id, mode: 'gymLeader', elementId: 'normal', rewardMultiplier: 1 }
      }
    })
    const enemyAce = d.battle.enemies[0]
    const zSkill = enemyAce.skillIds
      .map((id) => skill(id))
      .find((s) => zMoveFor(withRing, enemyAce, s))
    expect(
      zMoveBlocker(withRing, d, {
        side: 'enemy',
        monster: enemyAce,
        skill: defined(zSkill, 'skill')
      })
    ).toBeNull()
  })

  it('hạ boss: crystalDropChance 100 thì rơi một crystal (loài hoặc hệ của boss)', () => {
    const dropData: GameData = {
      ...data,
      config: {
        ...data.config,
        transform: {
          ...data.config.transform,
          zMove: { ...data.config.transform.zMove, crystalDropChance: 100 }
        }
      }
    }
    const boss = makeMonster({
      id: 'x',
      speciesId: 'weakling',
      baseSpeciesId: 'weakling',
      elementIds: ['normal'],
      skillIds: ['idle'],
      bossMultiplier: 2
    })
    const state = battle([ally('a', { genes: uniformStats(1000) })], [boss], { isBoss: true })
    const weakened = {
      ...state,
      battle: {
        ...defined(state.battle, 'trận'),
        enemies: [{ ...boss, damageTaken: getMaxHp(data, boss).minus(1) }]
      }
    }
    const won = gameReducer(dropData, weakened, { type: 'submitTurn', commands: [use('strike')] })
    const crystals = ['weaklingZCrystal', 'normalZCrystal'].map((id) =>
      getItemCount(won.inventory, id)
    )
    expect(crystals[0] + crystals[1]).toBe(1)
  })
})

describe('save', () => {
  it('migrate v60 → v61: trận đang diễn ra chưa phe nào dùng Z-Move; state hợp lệ', () => {
    const state = battle([ally('a')], [foe('x')])
    const raw = serializeState(state) as Record<string, unknown>
    const { zMoveUsed: _used, ...oldBattle } = raw.battle as Record<string, unknown>
    const migrated = migrateState({ ...raw, battle: oldBattle, version: 60 }, data)
    expect(defined(migrated.battle, 'trận').zMoveUsed).toEqual({ player: false, enemy: false })
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('zMoveUsed sai kiểu, healsReplacement khác true: báo lỗi', () => {
    const state = battle([ally('a')], [foe('x')])
    const battleState = defined(state.battle, 'trận')
    const broken = {
      ...state,
      battle: {
        ...battleState,
        zMoveUsed: { player: 1, enemy: false },
        volatiles: { ...battleState.volatiles, a: { firstTurn: 1, healsReplacement: 1 } }
      }
    } as unknown as GameState
    const issues = validateGameState(data, broken)
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('battle.zMoveUsed'),
        expect.stringContaining('healsReplacement')
      ])
    )
  })
})

describe('seed RNG không đổi khi không dùng Z-Move', () => {
  it('cầm crystal mà không xin Z-Move: kết quả như không cầm', () => {
    const plain = turn(battle([ally('a')], [foe('x')]), use('strike'))
    const holder = turn(battle([ally('a', holding('normalZCrystal'))], [foe('x')]), use('strike'))
    expect(holder.rng).toBe(plain.rng)
    expect(enemy(holder, 'x').damageTaken.eq(enemy(plain, 'x').damageTaken)).toBe(true)
  })
})

describe('Ultra Burst', () => {
  // Crystal loài có ultraBurst: weakling cầm thì biến thành dạng weaklingUltra (như Necrozma Dusk
  // Mane → Ultra Necrozma), Z-Move riêng của crystal dùng được ở dạng đó.
  const burstRaw = makeZMoveRawData()
  burstRaw.species.push({
    kind: 'normal',
    id: 'weaklingUltra',
    raceId: 'neutral',
    elementIds: ['fire'],
    baseStats: uniformStats(90),
    evolutions: [],
    learnset: [{ level: 1, skillId: 'strike' }],
    catchRate: 50,
    formOf: 'weakling',
    formKind: 'battleOnly'
  })
  burstRaw.items.push({
    id: 'burstCrystal',
    category: 'zCrystal',
    price: 100,
    baseSkillId: 'strike',
    zSkillId: 'weaklingCrash',
    speciesIds: ['weaklingUltra'],
    ultraBurst: { fromSpeciesIds: ['weakling'], formId: 'weaklingUltra' }
  })
  const burstData = createGameData(withFixtureText(burstRaw))
  const holder = (): Monster => ally('a', holding('burstCrystal'))

  it('biến hình bằng lệnh: dạng mới (chỉ số, hệ), Z-Move của crystal dùng được ở dạng đó', () => {
    const state = battle([holder()], [foe('x')])
    const next = gameReducer(burstData, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike', target: 0, transform: 'ultraBurst' }]
    })
    const burst = defined(next.party.find((m) => m.id === 'a'))
    expect(burst.battleTransform).toMatchObject({
      kind: 'ultraBurst',
      formSpeciesId: 'weaklingUltra'
    })
    expect(burst.elementIds).toEqual(['fire'])
    expect(zMoveFor(burstData, burst, defined(burstData.skills.strike))?.id).toBe('weaklingCrash')
    // Chưa Ultra Burst thì crystal không hợp loài (như Pokémon).
    expect(zMoveFor(burstData, holder(), defined(burstData.skills.strike))).toBeNull()
  })

  it('không cầm crystal / sai loài thì không biến được (notEligible)', () => {
    const state = battle([ally('a')], [foe('x')])
    expectActionError(
      () =>
        gameReducer(burstData, state, {
          type: 'submitTurn',
          commands: [
            { slot: 0, kind: 'skill', skillId: 'strike', target: 0, transform: 'ultraBurst' }
          ]
        }),
      'transformUnavailable',
      { kind: 'ultraBurst', reason: 'notEligible' }
    )
  })

  it('kiểm tra dữ liệu: dạng Ultra Burst phải là dạng trong trận', () => {
    const issues = dataIssuesAfter((r) => {
      r.items.push({
        id: 'badBurst',
        category: 'zCrystal',
        price: 100,
        baseSkillId: 'strike',
        zSkillId: 'weaklingCrash',
        speciesIds: ['weakling'],
        ultraBurst: { fromSpeciesIds: ['weakling'], formId: 'strongling' }
      } as never)
    }).join('\n')
    expect(issues).toContain('ultraBurst.formId')
  })
})
