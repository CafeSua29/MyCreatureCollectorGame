// Cơ chế của trang bị kiểu Pokémon (mục "Trang bị và đồ cầm" ở equipment.md): hook cố định của món,
// khóa skill (Choice Band), tự mất máu (Life Orb), cấm skill trạng thái (Assault Vest), chỉ số khi
// còn tiến hóa (Eviolite), chùn bước (King's Rock), Weakness Policy, White Herb.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { computeStats, getMaxHp } from '../monster'
import {
  defined,
  equipped,
  held,
  makeBattleState,
  makeEquipment,
  makeEquipmentData,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, BattleEvent, BattleState, GameState, Item, Monster } from '../model'

const fixed = (value: number): { min: number; max: number } => ({ min: value, max: value })
const allRarities = (value: number): Record<string, { min: number; max: number }> => ({
  common: fixed(value),
  uncommon: fixed(value),
  rare: fixed(value),
  epic: fixed(value),
  legendary: fixed(value)
})

const ITEMS: Item[] = [
  {
    id: 'choiceBand',
    category: 'equipment',
    price: 100,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.attack',
      ranges: allRarities(50)
    },
    hooks: [{ type: 'choiceLock', params: {} }]
  },
  {
    id: 'lifeOrb',
    category: 'equipment',
    price: 100,
    mainLine: {
      hook: { type: 'elementDamageDealt', params: { elementIds: ['normal', 'fire'] } },
      valueParam: 'percent',
      ranges: allRarities(30)
    },
    hooks: [{ type: 'recoilOnAttack', params: { percent: 10 } }]
  },
  {
    id: 'assaultVest',
    category: 'equipment',
    price: 100,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.spDefense',
      ranges: allRarities(50)
    },
    hooks: [{ type: 'blockManual', params: { categories: ['status'] } }]
  },
  {
    id: 'eviolite',
    category: 'equipment',
    price: 100,
    mainLine: {
      hook: { type: 'statModifierIfCanEvolve', params: {} },
      valueParam: 'percent.defense',
      ranges: allRarities(50)
    }
  },
  {
    id: 'kingsRock',
    category: 'equipment',
    price: 100,
    mainLine: {
      hook: {
        type: 'onAttackApplyStatus',
        params: { category: 'any', statuses: [{ statusId: 'flinch', chance: 100 }] }
      },
      valueParam: 'statuses.0.chance',
      ranges: allRarities(100)
    }
  },
  {
    id: 'weaknessPolicy',
    category: 'held',
    price: 100,
    hooks: [
      {
        type: 'trigger',
        params: {
          on: 'damaged',
          scope: 'self',
          when: [{ if: 'superEffective' }],
          effects: [{ do: 'stage', to: 'self', stats: ['attack', 'spAttack'], delta: 2 }]
        }
      }
    ]
  },
  {
    id: 'whiteHerb',
    category: 'held',
    price: 100,
    hooks: [
      {
        type: 'trigger',
        params: { on: 'statLoss', scope: 'self', effects: [{ do: 'restoreStages', to: 'self' }] }
      }
    ]
  }
]

const data = makeEquipmentData((raw) => {
  // Chùn bước (flinch 1 lượt) đã có sẵn trong fixture chung (Rogue Fusion dùng).
  raw.items.push(...ITEMS)
})

const gear = (baseItemId: string, value: number): Monster['equipment'][number] =>
  equipped(
    makeEquipment({ id: `e${baseItemId.length}`, baseItemId, rolls: [{ lineId: 'main', value }] })
  )
const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], ...overrides })
const run = (state: GameState, skillId: string): GameState =>
  gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 } satisfies BattleCommand]
  })
const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)
const FAST = { hp: 10, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 100 }

describe('hook cố định của trang bị', () => {
  it('Choice Band: khóa skill dùng đầu tiên tới khi rời sân; skill khác bị chặn', () => {
    const banded = fighter('a', { equipment: [gear('choiceBand', 50)] })
    const first = run(makeBattleState([banded], [fighter('e1', { skillIds: ['idle'] })]), 'idle')
    expect(battleOf(first).volatiles.a.choiceLockSkillId).toBe('idle')
    const second = run(first, 'strike')
    expect(eventsOf(second, 'skillBlocked')).toContainEqual({
      type: 'skillBlocked',
      monsterId: 'a',
      skillId: 'strike'
    })
    // Chỉ số dòng chính vẫn tính theo cấp; hook cố định không đổi theo cấp.
    expect(computeStats(data, banded).withTraits.attack.toNumber()).toBe(75)
  })

  it('Life Orb: +30% sát thương, tự mất 10% max HP sau mỗi skill gây sát thương', () => {
    const orb = fighter('a', { equipment: [gear('lifeOrb', 30)] })
    const next = run(makeBattleState([orb], [fighter('e1', { skillIds: ['idle'] })]), 'strike')
    const user = defined(next.party.find((m) => m.id === 'a'))
    expect(user.damageTaken.toNumber()).toBe(Math.ceil(getMaxHp(data, user).toNumber() * 0.1))
    const idle = run(makeBattleState([orb], [fighter('e1', { skillIds: ['idle'] })]), 'idle')
    expect(defined(idle.party.find((m) => m.id === 'a')).damageTaken.toNumber()).toBe(0)
  })

  it('Assault Vest: skill trạng thái bị chặn, skill gây sát thương vẫn dùng được', () => {
    const vest = fighter('a', { equipment: [gear('assaultVest', 50)] })
    const state = makeBattleState([vest], [fighter('e1', { skillIds: ['idle'] })])
    expect(eventsOf(run(state, 'idle'), 'skillBlocked')).toHaveLength(1)
    expect(eventsOf(run(state, 'strike'), 'skillBlocked')).toHaveLength(0)
  })

  it('Eviolite: +% khi loài còn tiến hóa được; dạng cuối / quái fuse không có', () => {
    const young = makeMonster({ equipment: [gear('eviolite', 50)] })
    expect(computeStats(data, young).withTraits.defense.toNumber()).toBe(75)
    const final = makeMonster({
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      equipment: [gear('eviolite', 50)]
    })
    const plain = makeMonster({ speciesId: 'strongling', baseSpeciesId: 'strongling' })
    expect(computeStats(data, final).withTraits.defense).toEqual(
      computeStats(data, plain).withTraits.defense
    )
  })

  it("King's Rock: đòn trúng làm mục tiêu chùn bước, mất lượt nếu chưa hành động", () => {
    const fast = fighter('a', { genes: FAST, equipment: [gear('kingsRock', 100)] })
    const next = run(makeBattleState([fast], [fighter('e1', { skillIds: ['strike'] })]), 'strike')
    expect(eventsOf(next, 'statusApplied')).toContainEqual(
      expect.objectContaining({ monsterId: 'e1', statusId: 'flinch' })
    )
    expect(eventsOf(next, 'useSkill').map((e) => e.monsterId)).toEqual(['a'])
    // Chùn bước hết ở cuối lượt.
    expect(battleOf(next).enemies[0].statuses).toEqual([])
  })
})

describe('đồ cầm cần điều kiện mới', () => {
  it('Weakness Policy: chỉ kích hoạt khi trúng đòn khắc hệ (+2 công, công đặc biệt)', () => {
    const policy = fighter('e1', { skillIds: ['idle'], equipment: [held('weaknessPolicy')] })
    const caster = fighter('a', { skillIds: ['blast', 'strike'] })
    const normal = run(makeBattleState([caster], [policy]), 'strike')
    expect(battleOf(normal).enemies[0].equipment).toEqual([held('weaknessPolicy')])
    const fire = run(makeBattleState([caster], [policy]), 'blast')
    expect(battleOf(fire).enemies[0].equipment).toEqual([])
    expect(battleOf(fire).stages.e1).toEqual({ attack: 2, spAttack: 2 })
  })

  it('White Herb: bị hạ bậc thì bậc âm về 0, log stagesRestored', () => {
    const herb = fighter('e1', { skillIds: ['idle'], equipment: [held('whiteHerb')] })
    const growler = fighter('a', { skillIds: ['growl'] })
    const next = run(makeBattleState([growler], [herb]), 'growl')
    expect(battleOf(next).stages.e1?.attack ?? 0).toBe(0)
    expect(eventsOf(next, 'stagesRestored')).toEqual([
      { type: 'stagesRestored', monsterId: 'e1', stats: ['attack'] }
    ])
    expect(battleOf(next).enemies[0].equipment).toEqual([])
  })
})
