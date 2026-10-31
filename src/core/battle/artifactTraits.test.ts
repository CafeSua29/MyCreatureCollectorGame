// Thuộc tính Artifact Siralim trên trang bị (mục "Trait Artifact Siralim" ở trait-dsl.md): ô spell và
// trait tác động ô spell, hệ số dòng theo nhãn, chia % chỉ số trang bị, trait của món, sức mạnh theo hệ.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { computeStats } from '../monster'
import {
  defined,
  equipped,
  makeBattleState,
  makeEquipment,
  makeEquipmentData,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type {
  BattleEvent,
  BattleState,
  EquipmentRoll,
  GameState,
  Item,
  Monster,
  TraitDef,
  TraitInstance
} from '../model'
import { battleStats, type Draft } from './draft'

const fixed = (value: number): Record<string, { min: number; max: number }> =>
  Object.fromEntries(
    ['common', 'uncommon', 'rare', 'epic', 'legendary'].map((r) => [r, { min: value, max: value }])
  )

const ITEMS: Item[] = [
  {
    id: 'blastGem',
    category: 'equipment',
    price: 1,
    mainLine: {
      hook: { type: 'spellSlot', params: { skillId: 'blast' } },
      valueParam: 'chance',
      ranges: fixed(100),
      tags: ['spell']
    }
  },
  {
    id: 'weakGem',
    category: 'equipment',
    price: 1,
    mainLine: {
      hook: { type: 'spellSlot', params: { skillId: 'blast' } },
      valueParam: 'chance',
      ranges: fixed(1),
      tags: ['spell']
    }
  },
  {
    id: 'hpHelm',
    category: 'equipment',
    price: 1,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: ['percent.hp', 'percent.attack'],
      ranges: fixed(10),
      tags: ['stat']
    }
  },
  {
    id: 'fireBane',
    category: 'equipment',
    price: 1,
    mainLine: {
      hook: { type: 'damageVsElement', params: { elementIds: ['water'] } },
      valueParam: 'percent',
      ranges: fixed(50),
      tags: ['elementStrengthDealt']
    }
  },
  {
    id: 'sigil',
    category: 'equipment',
    price: 1,
    mainLine: {
      hook: { type: 'equipmentTrait', params: { traitId: 'sharp' } },
      valueParam: 'level',
      ranges: fixed(1),
      tags: ['trait']
    }
  }
]

const trait = (
  id: string,
  hooks: TraitDef['hooks'],
  kind: TraitDef['kind'] = 'positive'
): TraitDef => ({
  id,
  kind,
  hooks
})
const aura = (scope: string, hooks: unknown[]): { type: string; params: unknown } => ({
  type: 'aura',
  params: { scope, hooks }
})
const TRAITS: TraitDef[] = [
  trait('sharp', [{ type: 'statModifier', params: { percent: { attack: 10 } } }]),
  trait('battleBorn', [aura('side', [{ type: 'spellSlotChanceBonus', params: { points: 99 } }])]),
  trait('celebrate', [aura('side', [{ type: 'spellSlotExtraCasts', params: { count: 1 } }])]),
  trait('overcome', [{ type: 'extraSpellSlotRoll', params: { chance: 100 } }]),
  trait('warcraft', [{ type: 'equipmentLinePotency', params: { tags: ['stat'], percent: 100 } }]),
  trait('reticence', [
    aura('foes', [
      {
        type: 'equipmentLinePotency',
        params: { tags: ['stat'], percent: -50, excludeHpLines: true }
      }
    ])
  ]),
  trait('honed', [
    aura('allies', [
      { type: 'equipmentShare', params: { percent: 50, stats: ['attack'], as: 'stats' } }
    ])
  ]),
  trait('bruteOnly', [
    aura('allies', [
      {
        type: 'equipmentShare',
        params: { percent: 50, stats: ['attack'], as: 'stats', raceIds: ['brute'] }
      }
    ])
  ]),
  trait('smiths', [
    {
      type: 'trigger',
      params: {
        on: 'entry',
        scope: 'self',
        when: [{ if: 'partyAllRace' }],
        effects: [{ do: 'shareEquipmentTraits', to: 'leftAlly' }]
      }
    }
  ]),
  trait('salvo', [
    {
      type: 'trigger',
      params: {
        on: 'faint',
        scope: 'self',
        effects: [
          {
            do: 'damage',
            to: 'foes',
            amount: {
              flat: 1,
              per: { of: 'equipmentStatLines', stat: 'attack' }
            }
          }
        ]
      }
    }
  ])
]

const data = makeEquipmentData((raw) => {
  raw.items.push(...ITEMS)
  raw.traits.push(...TRAITS)
  raw.skills.push({
    id: 'goldenStout',
    elementId: 'normal',
    category: 'status',
    power: 0,
    accuracy: 100,
    priority: 0,
    target: 'self',
    effects: [],
    spell: { after: [{ do: 'castSpellSlot', to: 'self' }] }
  })
})

const gear = (
  baseItemId: string,
  value: number,
  id = `e${baseItemId.length}`
): Monster['equipment'][number] => {
  const rolls: EquipmentRoll[] = [{ lineId: 'main', value }]
  return equipped(makeEquipment({ id, baseItemId, rolls }))
}
const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike', 'idle'], elementIds: ['water'], ...overrides })
const withTraits = (ids: string[]): TraitInstance[] => ids.map((id) => ({ id, level: 1 }))
const run = (state: GameState, skillId = 'strike'): GameState =>
  gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })
const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)
const slotCasts = (state: GameState): number => eventsOf(state, 'spellSlotCast').length
const idleFoe = (): Monster => fighter('e1', { skillIds: ['idle'], damageTaken: 0 })

describe('ô spell', () => {
  it('sau khi tấn công bằng lệnh của quái: tung tỉ lệ, trúng thì tự dùng spell trong ô', () => {
    const user = fighter('a', { equipment: [gear('blastGem', 100)] })
    const next = run(makeBattleState([user], [idleFoe()]))
    expect(eventsOf(next, 'spellSlotCast')).toEqual([
      { type: 'spellSlotCast', monsterId: 'a', skillId: 'blast' }
    ])
    // Không tấn công (skill trạng thái) thì không kích hoạt.
    expect(slotCasts(run(makeBattleState([user], [idleFoe()]), 'idle'))).toBe(0)
  })

  it('Battle Born (+điểm), Celebrate Decline (+1 lần), Overcome (lần tung thêm)', () => {
    const weak = fighter('a', { equipment: [gear('weakGem', 1)] })
    const boosted = { ...weak, traits: withTraits(['battleBorn']) }
    expect(slotCasts(run(makeBattleState([boosted], [idleFoe()])))).toBe(1)
    const twice = fighter('a', {
      equipment: [gear('blastGem', 100)],
      traits: withTraits(['celebrate'])
    })
    expect(slotCasts(run(makeBattleState([twice], [idleFoe()])))).toBe(2)
    const overcome = fighter('a', {
      equipment: [gear('weakGem', 1)],
      traits: withTraits(['overcome'])
    })
    expect(slotCasts(run(makeBattleState([overcome], [idleFoe()])))).toBeGreaterThanOrEqual(1)
  })

  it('castSpellSlot (Golden Stout): quái dùng spell trong ô của chính nó', () => {
    const user = fighter('a', { skillIds: ['goldenStout'], equipment: [gear('weakGem', 1)] })
    const next = run(makeBattleState([user], [idleFoe()]), 'goldenStout')
    expect(slotCasts(next)).toBe(1)
  })
})

describe('hệ số dòng, chia chỉ số, trait của món, sức mạnh theo hệ', () => {
  it('Warcraft: dòng nhãn stat của chính quái mạnh thêm %', () => {
    const plain = makeMonster({ equipment: [gear('hpHelm', 10)] })
    const warcraft = { ...plain, traits: withTraits(['warcraft']) }
    expect(computeStats(data, plain).withTraits.attack.toNumber()).toBeCloseTo(55)
    expect(computeStats(data, warcraft).withTraits.attack.toNumber()).toBeCloseTo(60)
  })

  it('Reticence: dòng chỉ số của địch yếu đi, trừ dòng có HP', () => {
    const foe = fighter('e1', { equipment: [gear('sword', 10)] })
    const helmFoe = fighter('e1', { equipment: [gear('hpHelm', 10)] })
    const caster = fighter('a', { traits: withTraits(['reticence']) })
    const attackOf = (state: GameState): number =>
      battleStats(
        data,
        { ...state, battle: battleOf(state) } as Draft,
        battleOf(state).enemies[0]
      ).attack.toNumber()
    expect(attackOf(makeBattleState([caster], [foe]))).toBe(Math.floor(50 * 1.05))
    expect(attackOf(makeBattleState([caster], [helmFoe]))).toBe(Math.floor(50 * 1.1))
  })

  it('equipmentShare: đồng đội nhận % chỉ số trang bị của quái phát; lọc race', () => {
    const owner = fighter('a', {
      traits: withTraits(['honed']),
      equipment: [gear('sword', 20)]
    })
    const ally = fighter('b')
    const state = makeBattleState([owner, ally], [idleFoe()])
    const d = { ...state, battle: battleOf(state) } as Draft
    expect(battleStats(data, d, ally).attack.toNumber()).toBe(Math.floor(50 * 1.1))
    const picky = { ...owner, traits: withTraits(['bruteOnly']) }
    const state2 = makeBattleState([picky, ally], [idleFoe()])
    const d2 = { ...state2, battle: battleOf(state2) } as Draft
    expect(battleStats(data, d2, ally).attack.toNumber()).toBe(50)
  })

  it('equipmentTrait: món cho thêm trait (chạy hook của trait đó)', () => {
    const wearer = makeMonster({ equipment: [gear('sigil', 1)] })
    // sharp: +10% công.
    expect(computeStats(data, wearer).withTraits.attack.toNumber()).toBeCloseTo(55)
  })

  it('Master of Smiths: cả đội cùng race thì chia trait của món cho quái bên trái', () => {
    const left = fighter('a')
    const smith = fighter('b', { traits: withTraits(['smiths']), equipment: [gear('sigil', 1)] })
    const next = gameReducer(
      data,
      { ...makeBattleState([left, smith], [idleFoe()]), battle: null },
      {
        type: 'travel',
        to: { type: 'floor', floor: 1 }
      }
    )
    const started = gameReducer(data, next, { type: 'startWildBattle' })
    expect(battleOf(started).volatiles.a?.gainedTraits).toEqual([{ id: 'sharp', level: 1 }])
  })

  it('damageVsElement: thêm sát thương lên quái mang hệ đó', () => {
    const plain = run(makeBattleState([fighter('a')], [idleFoe()]))
    const bane = run(
      makeBattleState([fighter('a', { equipment: [gear('fireBane', 50)] })], [idleFoe()])
    )
    const dealt = (state: GameState): number =>
      eventsOf(state, 'damage')
        .find((e) => e.targetId === 'e1')
        ?.amount.toNumber() ?? 0
    expect(dealt(bane)).toBeGreaterThan(dealt(plain))
  })

  it('bộ đếm equipmentStatLines: số dòng chỉ số có tăng công (Perishing Salvo)', () => {
    const dying = fighter('e1', {
      skillIds: ['idle'],
      traits: withTraits(['salvo']),
      equipment: [gear('hpHelm', 10, 'e1'), gear('sword', 10, 'e2')],
      damageTaken: 49
    })
    const next = run(makeBattleState([fighter('a')], [dying]))
    // Hai dòng tăng công (mũ HP + công, kiếm) × 1.
    expect(eventsOf(next, 'traitDamage').map((e) => [e.monsterId, e.amount.toNumber()])).toEqual([
      ['a', 2]
    ])
  })
})
