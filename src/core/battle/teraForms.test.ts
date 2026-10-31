// Dạng theo loài khi biến hình (transformation.md, battle-forms.md): dạng Tera (Ogerpon, Terapagos)
// đổi dạng hẳn và ability theo dạng (Embody Aspect), hệ Tera cố định theo loài, dạng Mega / gmax chỉ
// của một dạng (fromSpeciesIds), ability theo dạng trong trận.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { createGameData } from '../gameData'
import { formsOf } from '../inventory'
import { abilityTraitId, validateMonster } from '../monster'
import { changeTeraElement } from '../roster'
import { createRng, toBig } from '../shared'
import { rollBossTransformTraits, rollMonster } from '../world'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeGameState,
  makeInventory,
  makeMonster,
  makeTransformRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type { BattleCommand, GameState, Monster, NormalSpecies } from '../model'

const form = (id: string, extra: Partial<NormalSpecies>): NormalSpecies => ({
  kind: 'normal',
  id,
  raceId: 'neutral',
  elementIds: ['grass'],
  baseStats: uniformStats(30),
  evolutions: [],
  learnset: [{ level: 1, skillId: 'strike' }],
  catchRate: 45,
  formOf: 'weakling',
  ...extra
})

const raw = makeTransformRawData()
raw.traits.push(
  {
    id: 'plainAbility',
    kind: 'positive',
    hooks: [{ type: 'statModifier', params: { percent: { hp: 1 } } }]
  },
  {
    id: 'aspect',
    kind: 'positive',
    hooks: [
      {
        type: 'trigger',
        params: {
          on: 'transformed',
          scope: 'self',
          effects: [{ do: 'stage', to: 'self', stats: ['speed'], delta: 1 }],
          when: [{ if: 'transformed', who: 'self', kinds: ['tera'] }]
        }
      }
    ]
  }
)
raw.species = raw.species.map((species) =>
  species.kind === 'normal' && species.id === 'weakling'
    ? {
        ...species,
        abilities: ['plainAbility'],
        teraElementId: 'water',
        teraFormId: 'weaklingTera'
      }
    : species
)
raw.species.push(
  form('weaklingTera', { formKind: 'battleOnly', abilities: ['aspect'], elementIds: ['fire'] }),
  form('weaklingAlt', { formKind: 'alternate', lifespan: 50 }),
  form('weaklingAltMega', {
    formKind: 'mega',
    baseStats: uniformStats(60),
    fromSpeciesIds: ['weaklingAlt']
  })
)
const data = createGameData(withFixtureText(raw))

const ally = (fields: Partial<Monster> = {}): Monster =>
  makeMonster({
    id: 'a',
    speciesId: 'weakling',
    baseSpeciesId: 'weakling',
    elementIds: ['grass'],
    teraElementId: 'water',
    skillIds: ['idle'],
    ...fields
  })
const foe = (): Monster =>
  makeMonster({
    id: 'x',
    skillIds: ['idle'],
    teraElementId: 'water',
    genes: { ...uniformStats(1000), speed: 1 }
  })
const teraTurn = (state: GameState): GameState =>
  gameReducer(data, state, {
    type: 'submitTurn',
    commands: [
      { slot: 0, kind: 'skill', skillId: 'idle', target: 0, transform: 'tera' } as BattleCommand
    ]
  })
const inBattle = (monster: Monster): GameState => ({
  ...makeBattleState([monster], [foe()]),
  inventory: makeInventory({ teraOrb: 1 })
})

describe('dạng Tera theo loài', () => {
  it('Tera đổi sang dạng Tera, ability theo dạng chạy ngay khi biến hình', () => {
    const after = teraTurn(inBattle(ally()))
    const monster = defined(after.party[0])
    expect(monster.battleForm?.speciesId).toBe('weaklingTera')
    // Đang Tera: phòng thủ vẫn là hệ Tera.
    expect(monster.elementIds).toEqual(['water'])
    expect(abilityTraitId(data, monster)).toBe('aspect')
    expect(defined(after.battle).stages.a?.speed).toBe(1)
  })

  it('ability theo dạng trong trận có ability riêng; dạng không có ability thì theo loài', () => {
    const plain = ally()
    expect(abilityTraitId(data, plain)).toBe('plainAbility')
    const formed = ally({
      battleForm: { speciesId: 'weaklingTera', originalElementIds: ['grass'] }
    })
    expect(abilityTraitId(data, formed)).toBe('aspect')
  })
})

describe('hệ Tera cố định', () => {
  it('quái mới / boss luôn mang hệ cố định', () => {
    const spec = {
      encounters: [{ speciesId: 'weakling', weight: 1 }],
      levelMin: 5,
      levelMax: 5,
      geneMultiplier: toBig(1),
      shinyChance: 0,
      aging: false
    }
    const [wild] = rollMonster(data, createRng(5), spec, 'w')
    expect(wild.teraElementId).toBe('water')
    const [boss] = rollBossTransformTraits(data, createRng(9), { floor: 999, boss: ally() })
    expect(boss.teraElementId).toBe('water')
  })

  it('không đổi được ở NPC; save sai hệ bị chặn', () => {
    const state = {
      ...makeGameState({ seed: 1, party: [ally()] }),
      inventory: makeInventory({ fireTeraShard: 99 })
    }
    expectActionError(() => changeTeraElement(data, state, 'a', 'fire'), 'teraElementFixed')
    expect(validateMonster(data, ally({ teraElementId: 'fire' })).join('\n')).toContain(
      'hệ Tera cố định'
    )
  })
})

describe('fromSpeciesIds', () => {
  it('dạng Mega chỉ của một dạng: chỉ dạng đó biến được', () => {
    expect(formsOf(data, 'weaklingAlt', 'mega').map((s) => s.id)).toEqual(['weaklingAltMega'])
    expect(formsOf(data, 'weakling', 'mega').map((s) => s.id)).not.toContain('weaklingAltMega')
  })
})

describe('kiểm tra dữ liệu', () => {
  it('fromSpeciesIds / teraFormId / teraElementId sai', () => {
    const issues = dataIssuesAfter((r) => {
      r.species.push(
        form('badMega', { formKind: 'mega', fromSpeciesIds: ['strongling'] }),
        form('badAlt', { formKind: 'alternate', fromSpeciesIds: ['weakling'], lifespan: 5 }),
        form('badTera', { formKind: 'alternate', teraFormId: 'strongling', lifespan: 5 }),
        form('badElement', { formKind: 'alternate', teraElementId: 'nope', lifespan: 5 })
      )
    }).join('\n')
    expect(issues).toContain('không phải loài cùng gốc "weakling"')
    expect(issues).toContain('fromSpeciesIds chỉ dùng cho dạng mega / gmax')
    expect(issues).toContain('không phải dạng trong trận cùng gốc')
    expect(issues).toContain('teraElementId không hợp lệ')
  })
})
