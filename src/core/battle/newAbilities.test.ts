// Ability Pokémon đợt 3 (docs/rules/abilities.md): tắt thời tiết (Cloud Nine), coi như nắng (Mega
// Sol), Long Reach, Piercing Drill, berry (Unnerve, Ripen, Gluttony, Cheek Pouch, Cud Chew,
// Symbiosis), Mirror Armor, Opportunist, Wimp Out, Perish Body, Commander, Illusion, Corrosion,
// Tera Shell, hào quang có điều kiện quái nhận, điều kiện / sự kiện mới của ngôn ngữ trait.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getMaxHp } from '../monster'
import { TRAIT_HOOKS, checkAllConditions, type DslView } from '../registries'
import {
  dataIssuesAfter,
  defined,
  held,
  makeBattleContext,
  makeBattleState,
  makeField,
  makeMonster,
  makeSideFieldRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import { toBig, type Decimal } from '../shared'
import type {
  BattleEvent,
  BattleState,
  GameState,
  Item,
  Monster,
  NormalSpecies,
  Skill,
  TraitDef,
  TraitHookDef
} from '../model'

const attack = (id: string, fields: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...fields
})
const status = (id: string, fields: Partial<Skill>): Skill =>
  attack(id, { category: 'status', power: 0, ...fields })
const trait = (id: string, hooks: TraitHookDef[]): TraitDef => ({ id, kind: 'positive', hooks })
const flagTrait = (id: string, flag: string): TraitDef =>
  trait(id, [{ type: 'abilityFlag', params: { flag } }])
const onEvent = (
  on: string,
  effects: unknown[],
  extra: Record<string, unknown> = {}
): TraitHookDef => ({
  type: 'trigger',
  params: { on, scope: 'self', effects, ...extra }
})
const berry = (id: string, percent: number, threshold = 50): Item => ({
  id,
  category: 'held',
  price: 10,
  tags: ['berry'],
  hooks: [
    onEvent('damaged', [{ do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent } }], {
      when: [{ if: 'hpBelow', who: 'self', percent: threshold }]
    })
  ]
})

const raw = makeSideFieldRawData()
raw.skills.push(
  attack('hit', { contact: true }),
  attack('water', { elementId: 'water', category: 'special' }),
  attack('flame', { elementId: 'fire', category: 'special' }),
  attack('smash', { power: 400 }),
  status('growl4', {
    effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }]
  }),
  status('pump', {
    target: 'self',
    effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 2 } }]
  }),
  status('spiky', {
    target: 'self',
    priority: 4,
    effects: [
      {
        type: 'protect',
        params: {
          consecutiveChanceDivisor: 3,
          onContact: [{ do: 'stage', to: 'other', stats: ['attack'], delta: -1 }]
        }
      }
    ]
  }),
  status('toxin4', {
    effects: [{ type: 'applyStatus', params: { statusId: 'poison', chance: 100 } }]
  })
)
raw.items.push(berry('healBerry', 10), berry('pinchBerry', 10, 25), {
  id: 'trinket',
  category: 'held',
  price: 10,
  hooks: []
})
raw.traits.push(
  flagTrait('cloud', 'suppressesWeather'),
  flagTrait('sol', 'actsInSun'),
  flagTrait('reach', 'noContact'),
  flagTrait('drill', 'contactPiercesProtect'),
  flagTrait('nerve', 'blocksFoeBerries'),
  flagTrait('ripe', 'ripensBerries'),
  flagTrait('glutton', 'eatsBerriesEarly'),
  flagTrait('symbiote', 'passesItemToAlly'),
  flagTrait('mirror', 'reflectsStatDrops'),
  flagTrait('opportune', 'copiesFoeBoosts'),
  flagTrait('corrode', 'ignoresElementStatusImmunity'),
  trait('pouch', [
    onEvent('berryEaten', [
      { do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 30 } }
    ])
  ]),
  trait('chew', [onEvent('berryEaten', [{ do: 'markVolatile', mark: 'cudChew' }])]),
  trait('wimp', [
    onEvent('damagedAny', [{ do: 'retreat', to: 'self' }], {
      when: [{ if: 'hpFellBelow', who: 'self', percent: 50 }]
    })
  ]),
  trait('perishing', [
    onEvent(
      'attacked',
      [
        { do: 'perish', to: 'self', turns: 3 },
        { do: 'perish', to: 'other', turns: 3 }
      ],
      { when: [{ if: 'moveFlag', flags: ['contact'] }] }
    )
  ]),
  trait('commander2', [
    {
      type: 'trigger',
      params: {
        on: 'turnEnd',
        scope: 'self',
        effects: [{ do: 'command', partnerSpeciesIds: ['strongling'], stages: 2 }]
      }
    }
  ]),
  trait('illusion2', [
    onEvent('turnEnd', [{ do: 'illusion' }], { oncePerBattle: true }),
    onEvent('damaged', [{ do: 'illusion', end: true }])
  ]),
  trait('veil', [
    {
      type: 'aura',
      params: {
        scope: 'side',
        receiverWhen: [{ if: 'element', who: 'self', elementIds: ['fire'] }],
        hooks: [{ type: 'statusImmunity', params: { statusIds: ['poison'] } }]
      }
    }
  ])
)
// Cờ đọc ở cấp cả sân (Cloud Nine, Mega Sol, Unnerve) và cờ đổi berry (Ripen, Gluttony) chỉ xét
// ability (như Pokémon): loài mẫu mang ability đó.
for (const [id, ability] of [
  ['cloudling', 'cloud'],
  ['solling', 'sol'],
  ['nerveling', 'nerve'],
  ['ripeling', 'ripe'],
  ['gluttonling', 'glutton']
] as const) {
  const base = raw.species.find((s) => s.id === 'weakling') as NormalSpecies
  raw.species.push({ ...base, id, evolutions: [], abilities: [ability] })
}
// Order Up: chỉ số tăng theo loài của quái đang chỉ huy.
raw.skills.push({
  id: 'order2',
  elementId: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  spell: {
    after: [
      ['weakling', 'attack'],
      ['strongling', 'defense']
    ].map(([speciesId, stat]) => ({
      do: 'stage',
      to: 'self',
      stats: [stat],
      delta: 1,
      if: [{ if: 'commanded', who: 'self', speciesIds: [speciesId] }]
    }))
  }
})
const data = createGameData(withFixtureText(raw))
const ofSpecies = (speciesId: string): Partial<Monster> => ({ speciesId, baseSpeciesId: speciesId })

const fighter = (id: string, skillIds: string[], fields: Partial<Monster> = {}): Monster =>
  makeMonster({
    id,
    skillIds,
    genes: toBigStats({ ...uniformStats(20), hp: '1e6' }),
    ...fields
  })
const withTraits = (...ids: string[]): Partial<Monster> => ({
  traits: ids.map((id) => ({ id, level: 1 }))
})
/** Quái còn vừa trên nửa máu: đòn nhỏ đẩy máu xuống dưới 50% (berry, Wimp Out). */
function frail(id: string, skillIds: string[], fields: Partial<Monster> = {}): Monster {
  const monster = fighter(id, skillIds, fields)
  return { ...monster, damageTaken: getMaxHp(data, monster).div(2).floor().minus(1) }
}

function submit(
  state: GameState,
  commands: { skillId: string; slot?: number }[]
): { state: GameState; log: BattleEvent[] } {
  const next = gameReducer(data, state, {
    type: 'submitTurn',
    commands: commands.map(({ skillId, slot = 0 }) => ({ slot, kind: 'skill', skillId, target: 0 }))
  })
  return { state: next, log: defined(next.battle).log.slice(defined(state.battle).log.length) }
}
const run = (
  party: Monster[],
  enemies: Monster[],
  skillId: string,
  overrides: Partial<BattleState> = {}
): { state: GameState; log: BattleEvent[] } =>
  submit(makeBattleState(party, enemies, { playerSlots: [party[0].id, null], ...overrides }), [
    { skillId }
  ])
const damageTo = (log: BattleEvent[], id: string): number =>
  log.reduce(
    (sum, e) => (e.type === 'damage' && e.targetId === id ? sum + Number(e.amount) : sum),
    0
  )
const enemy = (state: GameState, i = 0): Monster => defined(defined(state.battle).enemies[i])

describe('môi trường theo ability', () => {
  it('Cloud Nine: thời tiết vẫn còn nhưng không có tác dụng', () => {
    const rain = { field: makeField({ weather: 'rain' }) }
    const plain = damageTo(
      run([fighter('a', ['water'])], [fighter('e', ['idle'])], 'water').log,
      'e'
    )
    const rainy = damageTo(
      run([fighter('a', ['water'])], [fighter('e', ['idle'])], 'water', rain).log,
      'e'
    )
    const suppressed = run(
      [fighter('a', ['water'])],
      [fighter('e', ['idle'], ofSpecies('cloudling'))],
      'water',
      rain
    )
    expect(rainy).toBeGreaterThan(plain)
    expect(damageTo(suppressed.log, 'e')).toBe(plain)
    expect(defined(suppressed.state.battle).field.weather.id).toBe('rain')
  })

  it('Mega Sol: skill của quái mang coi như trời nắng', () => {
    const sun = { field: makeField({ weather: 'sun' }) }
    const sunny = damageTo(
      run([fighter('a', ['flame'])], [fighter('e', ['idle'])], 'flame', sun).log,
      'e'
    )
    const sol = damageTo(
      run([fighter('a', ['flame'], ofSpecies('solling'))], [fighter('e', ['idle'])], 'flame').log,
      'e'
    )
    expect(sol).toBe(sunny)
  })
})

describe('tiếp xúc và bảo vệ', () => {
  it('Long Reach: đòn tiếp xúc thành không tiếp xúc (không dính phạt tiếp xúc của bảo vệ)', () => {
    const plain = run([fighter('a', ['hit'])], [fighter('e', ['spiky'])], 'hit', {})
    expect(defined(plain.state.battle).stages.a?.attack).toBe(-1)
    const reach = run(
      [fighter('a', ['hit'], withTraits('reach'))],
      [fighter('e', ['spiky'])],
      'hit'
    )
    expect(defined(reach.state.battle).stages.a?.attack).toBeUndefined()
  })

  it('Piercing Drill: đòn tiếp xúc xuyên bảo vệ, chỉ một phần sát thương', () => {
    const open = damageTo(run([fighter('a', ['hit'])], [fighter('e', ['idle'])], 'hit').log, 'e')
    const pierced = run(
      [fighter('a', ['hit'], withTraits('drill'))],
      [fighter('e', ['spiky'])],
      'hit'
    ).log
    expect(pierced.some((e) => e.type === 'protectPierced')).toBe(true)
    expect(damageTo(pierced, 'e')).toBeGreaterThan(0)
    expect(damageTo(pierced, 'e')).toBeLessThan(open)
  })
})

describe('berry', () => {
  const heals = (log: BattleEvent[], id: string): number =>
    log.reduce(
      (sum, e) => (e.type === 'heal' && e.monsterId === id ? sum + Number(e.amount) : sum),
      0
    )
  const eater = (traits: string[], itemId = 'healBerry', speciesId = 'weakling'): Monster =>
    frail('e', ['idle'], {
      equipment: [held(itemId)],
      ...withTraits(...traits),
      ...ofSpecies(speciesId)
    })

  it('Unnerve: berry của địch không tác dụng', () => {
    const eaten = run([fighter('a', ['hit'])], [eater([])], 'hit').log
    expect(eaten.some((e) => e.type === 'heldItemConsumed')).toBe(true)
    const blocked = run([fighter('a', ['hit'], ofSpecies('nerveling'))], [eater([])], 'hit')
    expect(blocked.log.some((e) => e.type === 'heldItemConsumed')).toBe(false)
    expect(enemy(blocked.state).equipment).toHaveLength(1)
  })

  it('Ripen: hồi máu của berry gấp đôi; Cheek Pouch hồi thêm khi ăn berry', () => {
    const base = heals(run([fighter('a', ['hit'])], [eater([])], 'hit').log, 'e')
    const ripe = heals(
      run([fighter('a', ['hit'])], [eater([], 'healBerry', 'ripeling')], 'hit').log,
      'e'
    )
    const pouch = heals(run([fighter('a', ['hit'])], [eater(['pouch'])], 'hit').log, 'e')
    expect(base).toBeGreaterThan(0)
    expect(ripe).toBeCloseTo(base * 2, -1)
    expect(pouch).toBeGreaterThan(base)
  })

  it('Gluttony: berry lúc nguy (25%) ăn ở 50%', () => {
    // Máu đã mất sẵn 40%: đòn nhỏ đẩy xuống dưới 50% nhưng chưa tới 25%.
    const target = (speciesId: string): Monster =>
      frail('e', ['idle'], { equipment: [held('pinchBerry')], ...ofSpecies(speciesId) })
    const plain = run([fighter('a', ['hit'])], [target('weakling')], 'hit').log
    expect(plain.some((e) => e.type === 'heldItemConsumed')).toBe(false)
    const glutton = run([fighter('a', ['hit'])], [target('gluttonling')], 'hit').log
    expect(glutton.some((e) => e.type === 'heldItemConsumed')).toBe(true)
  })

  it('Cud Chew: cuối lượt sau ăn lại berry vừa ăn', () => {
    const first = run([fighter('a', ['hit', 'idle'])], [eater(['chew'])], 'hit')
    expect(defined(first.state.battle).volatiles.e?.cudChewTurn).toBe(1)
    const second = submit(first.state, [{ skillId: 'idle' }])
    expect(heals(second.log, 'e')).toBeGreaterThan(0)
    expect(defined(second.state.battle).volatiles.e?.cudChewTurn).toBeUndefined()
  })

  it('Symbiosis: đồng đội chuyền đồ cầm cho quái vừa ăn hết berry', () => {
    const state = makeBattleState(
      [fighter('a', ['hit'])],
      [
        eater([]),
        fighter('f', ['idle'], { equipment: [held('trinket')], ...withTraits('symbiote') })
      ]
    )
    const after = submit(state, [{ skillId: 'hit' }]).state
    expect(enemy(after, 0).equipment).toEqual([held('trinket')])
    expect(enemy(after, 1).equipment).toEqual([])
  })
})

describe('bậc trận', () => {
  it('Mirror Armor: hạ bậc của địch phản lại lên quái gây ra', () => {
    const { state, log } = run(
      [fighter('a', ['growl4'])],
      [fighter('e', ['idle'], withTraits('mirror'))],
      'growl4'
    )
    expect(defined(state.battle).stages.e?.attack).toBeUndefined()
    expect(defined(state.battle).stages.a?.attack).toBe(-1)
    expect(log.some((e) => e.type === 'stageReflected')).toBe(true)
  })

  it('Opportunist: địch tăng bậc thì quái mang tăng y như vậy (không chép lại lần chép)', () => {
    const { state } = run(
      [fighter('a', ['pump'])],
      [fighter('e', ['idle'], withTraits('opportune'))],
      'pump'
    )
    expect(defined(state.battle).stages.a?.attack).toBe(2)
    expect(defined(state.battle).stages.e?.attack).toBe(2)
  })
})

describe('rời sân / đếm ngược / Commander / Illusion', () => {
  it('Wimp Out: quái hoang tụt xuống dưới nửa máu thì bỏ chạy', () => {
    const { log } = run(
      [fighter('a', ['hit'])],
      [frail('e', ['idle'], withTraits('wimp')), fighter('f', ['idle'])],
      'hit'
    )
    expect(log.some((e) => e.type === 'wildFled' && e.monsterId === 'e')).toBe(true)
  })

  it('Perish Body: bị đòn tiếp xúc thì cả hai bắt đầu đếm ngược', () => {
    const { state } = run(
      [fighter('a', ['hit'])],
      [fighter('e', ['idle'], withTraits('perishing'))],
      'hit'
    )
    // Đếm 3, cuối lượt đã giảm một.
    expect(defined(state.battle).volatiles.a?.perishTurns).toBe(2)
    expect(defined(state.battle).volatiles.e?.perishTurns).toBe(2)
  })

  it('Commander: vào miệng đồng đội đúng loài, đồng đội +2 mọi chỉ số, không hành động', () => {
    const partner = fighter('b', ['idle'], { speciesId: 'strongling', baseSpeciesId: 'strongling' })
    const state = makeBattleState(
      [fighter('a', ['hit'], withTraits('commander2')), partner],
      [fighter('e', ['idle'])]
    )
    const first = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'hit', target: 0 },
        { slot: 1, kind: 'skill', skillId: 'idle' }
      ]
    })
    const battle = defined(first.battle)
    expect(battle.volatiles.a?.commanding).toBe('b')
    expect(battle.volatiles.b?.commandedBy).toBe('a')
    expect(battle.stages.b).toMatchObject({ attack: 2, defense: 2, speed: 2 })
    const second = gameReducer(data, first, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'hit', target: 0 },
        { slot: 1, kind: 'skill', skillId: 'idle' }
      ]
    })
    const log = defined(second.battle).log.slice(battle.log.length)
    expect(log.some((e) => e.type === 'useSkill' && e.monsterId === 'a')).toBe(false)
  })

  it('Order Up: chỉ số tăng theo loài của quái chỉ huy', () => {
    const partner = fighter('b', ['order2'], {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling'
    })
    const state = makeBattleState(
      [fighter('a', ['hit'], withTraits('commander2')), partner],
      [fighter('e', ['idle'])]
    )
    const commands = [
      { slot: 0, kind: 'skill', skillId: 'hit', target: 0 },
      { slot: 1, kind: 'skill', skillId: 'order2', target: 0 }
    ] as const
    const first = gameReducer(data, state, { type: 'submitTurn', commands: [...commands] })
    const second = gameReducer(data, first, { type: 'submitTurn', commands: [...commands] })
    // Chỉ huy là weakling: +1 công (thêm vào +2 của Commander), thủ giữ +2.
    expect(defined(second.battle).stages.b).toMatchObject({ attack: 3, defense: 2 })
  })

  it('Illusion: hiện như quái còn sống cuối đội, lộ khi trúng đòn', () => {
    const state = makeBattleState(
      [fighter('a', ['idle', 'hit']), fighter('b', ['idle'])],
      [
        fighter('e', ['idle'], withTraits('illusion2')),
        fighter('f', ['idle'], { speciesId: 'strongling', baseSpeciesId: 'strongling' })
      ],
      { playerSlots: ['a', null], enemySlots: ['e', null] }
    )
    const first = submit(state, [{ skillId: 'idle' }]).state
    expect(defined(first.battle).volatiles.e?.illusionSpeciesId).toBe('strongling')
    const hit = submit(first, [{ skillId: 'hit' }])
    expect(defined(hit.state.battle).volatiles.e?.illusionSpeciesId).toBeUndefined()
    expect(hit.log.some((e) => e.type === 'illusionEnded')).toBe(true)
  })
})

describe('trạng thái', () => {
  it('Corrosion: gây độc được quái hệ miễn độc', () => {
    // Loài mặc định (weakling) hệ Cỏ, fixture cho hệ Cỏ miễn độc.
    const plain = run([fighter('a', ['toxin4'])], [fighter('e', ['idle'])], 'toxin4')
    expect(enemy(plain.state).statuses).toEqual([])
    const corroded = run(
      [fighter('a', ['toxin4'], withTraits('corrode'))],
      [fighter('e', ['idle'])],
      'toxin4'
    )
    expect(enemy(corroded.state).statuses.map((s) => s.statusId)).toEqual(['poison'])
  })

  it('hào quang receiverWhen: chỉ quái nhận thỏa điều kiện mới được (Flower Veil)', () => {
    const fireAlly = fighter('f', ['idle'], { elementIds: ['fire'] })
    const state = makeBattleState(
      [fighter('a', ['toxin4']), fighter('b', ['idle'])],
      [
        fighter('e', ['idle'], { ...withTraits('veil'), ...withTraits('veil', 'corrode') }),
        fireAlly
      ]
    )
    const after = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'toxin4', target: 1 },
        { slot: 1, kind: 'skill', skillId: 'idle' }
      ]
    })
    expect(enemy(after, 1).statuses).toEqual([])
  })

  it('Tera Shell: đầy máu thì đòn trung tính / khắc chỉ còn ×0,5', () => {
    const handler = TRAIT_HOOKS.effectivenessCapAtFullHp
    type DamageCtx = Parameters<NonNullable<typeof handler.modifyDamageTaken>>[2]
    // Ép kiểu: hook chỉ đọc hai trường này của bối cảnh sát thương.
    const ctx = (effectiveness: number, defenderHpRatio: number): DamageCtx =>
      ({ effectiveness, defenderHpRatio }) as DamageCtx
    const take = (eff: number, ratio: number): number | undefined =>
      handler.modifyDamageTaken?.({ cap: 0.5 }, 1, ctx(eff, ratio))
    expect(take(2, 1)).toBe(0.25)
    expect(take(1, 1)).toBe(0.5)
    expect(take(0.5, 1)).toBe(1)
    expect(take(2, 0.9)).toBe(1)
    expect(handler.validateParams({ cap: 0 }, data)).not.toEqual([])
  })
})

describe('điều kiện mới', () => {
  const view = (self: Monster, foes: Monster[], fields = {}): DslView => ({
    data,
    self,
    selfCtx: makeBattleContext({ foes, ...fields })
  })

  it('foeStatSumLower (Download), levelAtLeast (Schooling), abilityOnField (Aura Break)', () => {
    const foe = makeMonster({ id: 'e' })
    const readStat = (_monster: Monster, stat: string): Decimal =>
      toBig(stat === 'defense' ? 10 : 20)
    expect(
      checkAllConditions(
        view(makeMonster(), [foe]),
        [{ if: 'foeStatSumLower', stat: 'defense', than: 'spDefense' }],
        readStat
      )
    ).toBe(true)
    expect(
      checkAllConditions(view(makeMonster({ level: 20 }), []), [
        { if: 'levelAtLeast', who: 'self', level: 20 }
      ])
    ).toBe(true)
    expect(
      checkAllConditions(view(makeMonster({ level: 19 }), []), [
        { if: 'levelAtLeast', who: 'self', level: 20 }
      ])
    ).toBe(false)
    const holder = makeMonster({ id: 'h', traits: [] })
    expect(
      checkAllConditions(view(makeMonster(), [holder]), [
        { if: 'abilityOnField', abilityIds: ['cloud'] }
      ])
    ).toBe(false)
  })

  it('dữ liệu sai: điều kiện / hiệu ứng mới báo lỗi', () => {
    const issues = dataIssuesAfter((r) => {
      r.traits.push(
        trait('bad1', [onEvent('entry', [{ do: 'perish', to: 'self', turns: 0 }])]),
        trait('bad2', [
          onEvent('entry', [{ do: 'command', partnerSpeciesIds: ['nope'], stages: 2 }])
        ]),
        trait('bad3', [
          onEvent('entry', [selfStageEffect()], {
            when: [{ if: 'levelAtLeast', who: 'self', level: 0 }]
          })
        ]),
        trait('bad4', [onEvent('entry', [{ do: 'clearFields', layers: ['sky'] }])])
      )
    }).join('\n')
    expect(issues).toContain('turns')
    expect(issues).toContain('loài không tồn tại "nope"')
    expect(issues).toContain('level')
    expect(issues).toContain('layers')
  })
})

function selfStageEffect(): unknown {
  return { do: 'stage', to: 'self', stats: ['attack'], delta: 1 }
}
