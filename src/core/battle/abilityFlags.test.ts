// Hook ability Pokémon đợt 2 (docs/rules/abilities.md): cờ abilityFlag (Mold Breaker, Magic Bounce,
// Sticky Hold, Skill Link, Shield Dust, Unseen Fist, Stalwart, Unaware, Infiltrator), Scrappy
// (hitsImmune), nhóm -ate (convertSkillElement), placeField, consumedItem, identity.elementFromSkill.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { TRAIT_HOOKS, checkAllConditions } from '../registries'
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
import type { BattleEvent, GameState, Monster, NormalSpecies, Skill, TraitDef } from '../model'
import { emptyRecord } from './draft'

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
const trait = (id: string, type: string, params: unknown = {}): TraitDef => ({
  id,
  kind: 'positive',
  hooks: [{ type, params }]
})
const flagTrait = (id: string, flag: string): TraitDef => trait(id, 'abilityFlag', { flag })

const SKILLS: Skill[] = [
  attack('hit', { contact: true }),
  attack('multi', { hits: { min: 2, max: 5 } }),
  attack('scald', {
    effects: [{ type: 'applyStatus', params: { statusId: 'burn', chance: 50 } }]
  }),
  attack('growl3', {
    category: 'status',
    power: 0,
    reflectable: true,
    effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }]
  }),
  attack('guard3', {
    category: 'status',
    power: 0,
    target: 'self',
    priority: 4,
    effects: [{ type: 'protect', params: { consecutiveChanceDivisor: 3 } }]
  }),
  attack('boom', { selfFaint: 'always' }),
  attack('leech', { effects: [{ type: 'drain', params: { percent: 50 } }] }),
  attack('quickJab', { priority: 1 }),
  attack('wing', { elementId: 'flying' }),
  attack('song2', { category: 'special', moveFlags: ['sound'] }),
  attack('heavySlam2', {
    powerFormula: { type: 'linear', value: { of: 'weight', who: 'self' }, times: 1 }
  }),
  attack('steal', { spell: { after: [{ do: 'takeItems', from: 'other', to: 'self' }] } }),
  attack('lure2', {
    category: 'status',
    power: 0,
    target: 'self',
    priority: 2,
    spell: { after: [{ do: 'provoke', to: 'self' }] }
  })
]
const TRAITS: TraitDef[] = [
  flagTrait('bounce', 'bouncesStatusMoves'),
  flagTrait('sticky', 'keepsItems'),
  flagTrait('link', 'maxHits'),
  flagTrait('dust', 'blocksSecondaryEffects'),
  flagTrait('fist', 'contactIgnoresProtect'),
  flagTrait('stalwart2', 'ignoresRedirect'),
  flagTrait('unaware2', 'ignoresOpponentStages'),
  flagTrait('infiltrate', 'ignoresScreens'),
  trait('scrappy2', 'hitsImmune', { elementIds: ['normal'] }),
  flagTrait('damp2', 'blocksSelfFaint'),
  flagTrait('ooze', 'drainHurts'),
  flagTrait('wonder', 'halvesStatusAccuracy'),
  trait('cleaner', 'trigger', { on: 'entry', scope: 'self', effects: [{ do: 'clearScreens' }] }),
  flagTrait('majesty', 'blocksPriorityMoves'),
  flagTrait('gas', 'suppressesAbilities'),
  trait('gale', 'conditionalPriority', { amount: 1, elementIds: ['flying'], fullHp: true }),
  trait('regen2', 'healOnLeave', { percent: 50 }),
  flagTrait('gold', 'blocksStatusMoves'),
  trait('voice', 'convertSkillElement', { moveFlags: ['sound'], toElementId: 'fire', percent: 0 }),
  trait('heavy', 'weightMultiplier', { multiplier: 2 }),
  trait('magnet', 'aura', {
    scope: 'foes',
    hooks: [{ type: 'trapped', params: { elementIds: ['fire'] } }]
  }),
  trait('pixie', 'convertSkillElement', {
    fromElementIds: ['normal'],
    toElementId: 'fire',
    percent: 20
  }),
  trait('spit', 'trigger', {
    on: 'damaged',
    scope: 'self',
    effects: [{ do: 'placeField', fieldId: 'rain' }]
  }),
  trait('protean2', 'trigger', {
    on: 'attack',
    scope: 'self',
    effects: [{ do: 'identity', to: 'self', elementFromSkill: true }]
  })
]

const raw = makeSideFieldRawData()
raw.skills.push(...SKILLS)
raw.traits.push(...TRAITS)
raw.items.push({ id: 'trinket', category: 'held', price: 10, hooks: [] })
for (const [speciesId, ability] of [
  ['brawler', 'scrappy2'],
  ['pebble', 'gas']
] as const) {
  const index = raw.species.findIndex((s) => s.id === speciesId)
  raw.species[index] = { ...(raw.species[index] as NormalSpecies), abilities: [ability] }
}
const data = createGameData(withFixtureText(raw))

const fighter = (
  id: string,
  skillIds: string[],
  speed: number,
  fields: Partial<Monster> = {}
): Monster =>
  makeMonster({
    id,
    skillIds,
    genes: toBigStats({ ...uniformStats(20), hp: '1e6', speed }),
    ...fields
  })
const withTraits = (ids: string[]): Partial<Monster> => ({
  traits: ids.map((id) => ({ id, level: 1 }))
})

function turn(state: GameState, skillId: string): { state: GameState; log: BattleEvent[] } {
  const next = gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })
  return { state: next, log: defined(next.battle).log.slice(defined(state.battle).log.length) }
}
const damageTo = (log: BattleEvent[], id: string): number =>
  log.reduce(
    (sum, e) => (e.type === 'damage' && e.targetId === id ? sum + Number(e.amount) : sum),
    0
  )
const run = (
  user: Monster,
  enemies: Monster[],
  skillId: string,
  fields = {}
): ReturnType<typeof turn> => turn(makeBattleState([user], enemies, fields), skillId)

describe('abilityFlag', () => {
  it('Magic Bounce phản skill reflectable', () => {
    const { state } = run(
      fighter('a', ['growl3'], 100),
      [fighter('e', ['idle'], 1, withTraits(['bounce']))],
      'growl3'
    )
    expect(defined(state.battle).stages.a?.attack).toBe(-1)
    expect(defined(state.battle).stages.e?.attack).toBeUndefined()
  })

  it('Sticky Hold: món không bị lấy', () => {
    const holder = (traits: string[]): Monster =>
      fighter('e', ['idle'], 1, { equipment: [held('trinket')], ...withTraits(traits) })
    const kept = run(fighter('a', ['steal'], 100), [holder(['sticky'])], 'steal').state
    expect(defined(defined(kept.battle).enemies[0]).equipment).toHaveLength(1)
    const taken = run(fighter('a', ['steal'], 100), [holder([])], 'steal').state
    expect(defined(defined(taken.battle).enemies[0]).equipment).toHaveLength(0)
  })

  it('Skill Link: đòn nhiều lần luôn tối đa', () => {
    const { log } = run(
      fighter('a', ['multi'], 100, withTraits(['link'])),
      [fighter('e', ['idle'], 1)],
      'multi'
    )
    expect(log.find((e) => e.type === 'hitCount')).toMatchObject({ hits: 5 })
  })

  it('Shield Dust: miễn hiệu ứng phụ', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = {
        ...makeBattleState(
          [fighter('a', ['scald'], 100)],
          [fighter('e', ['idle'], 1, withTraits(['dust']))]
        ),
        rng: seed
      }
      const after = turn(state, 'scald').state
      expect(defined(defined(after.battle).enemies[0]).statuses).toEqual([])
    }
  })

  it('Unseen Fist: đòn tiếp xúc xuyên bảo vệ', () => {
    const blocked = run(fighter('a', ['hit'], 1), [fighter('e', ['guard3'], 100)], 'hit').log
    expect(damageTo(blocked, 'e')).toBe(0)
    const pierced = run(
      fighter('a', ['hit'], 1, withTraits(['fist'])),
      [fighter('e', ['guard3'], 100)],
      'hit'
    ).log
    expect(damageTo(pierced, 'e')).toBeGreaterThan(0)
  })

  it('Stalwart: không bị nhử đòn', () => {
    const enemies = (): Monster[] => [fighter('e', ['idle'], 1), fighter('f', ['lure2'], 100)]
    expect(damageTo(run(fighter('a', ['hit'], 1), enemies(), 'hit').log, 'f')).toBeGreaterThan(0)
    const log = run(fighter('a', ['hit'], 1, withTraits(['stalwart2'])), enemies(), 'hit').log
    expect(damageTo(log, 'e')).toBeGreaterThan(0)
  })

  it('Unaware: bỏ qua bậc thủ của mục tiêu', () => {
    const fields = { stages: { e: { defense: 6 } } }
    const plain = damageTo(
      run(fighter('a', ['hit'], 100), [fighter('e', ['idle'], 1)], 'hit', fields).log,
      'e'
    )
    const unaware = damageTo(
      run(
        fighter('a', ['hit'], 100, withTraits(['unaware2'])),
        [fighter('e', ['idle'], 1)],
        'hit',
        fields
      ).log,
      'e'
    )
    expect(unaware).toBeGreaterThan(plain * 2)
  })

  it('Infiltrator: bỏ qua màn chắn', () => {
    const fields = {
      field: makeField({ sides: { enemy: [{ id: 'reflect', turnsLeft: 5, layers: 1 }] } })
    }
    const plain = damageTo(
      run(fighter('a', ['hit'], 100), [fighter('e', ['idle'], 1)], 'hit', fields).log,
      'e'
    )
    const through = damageTo(
      run(
        fighter('a', ['hit'], 100, withTraits(['infiltrate'])),
        [fighter('e', ['idle'], 1)],
        'hit',
        fields
      ).log,
      'e'
    )
    expect(through).toBeGreaterThan(plain)
  })
})

describe('đổi hệ / khắc hệ, môi trường, Protean', () => {
  it('Scrappy: skill hệ Thường trúng hệ Ma', () => {
    const ghost = (): Monster => fighter('e', ['idle'], 1, { elementIds: ['ghost'] })
    expect(damageTo(run(fighter('a', ['hit'], 100), [ghost()], 'hit').log, 'e')).toBe(0)
    expect(
      damageTo(run(fighter('a', ['hit'], 100, withTraits(['scrappy2'])), [ghost()], 'hit').log, 'e')
    ).toBeGreaterThan(0)
  })

  it('convertSkillElement: Thường → Lửa +20% (khắc hệ Cỏ)', () => {
    const grass = (): Monster => fighter('e', ['idle'], 1, { elementIds: ['grass'] })
    const plain = damageTo(run(fighter('a', ['hit'], 100), [grass()], 'hit').log, 'e')
    const converted = damageTo(
      run(fighter('a', ['hit'], 100, withTraits(['pixie'])), [grass()], 'hit').log,
      'e'
    )
    expect(converted).toBeGreaterThan(plain * 2)
  })

  it('placeField: trúng đòn thì đặt thời tiết', () => {
    const { state } = run(
      fighter('a', ['hit'], 100),
      [fighter('e', ['idle'], 1, withTraits(['spit']))],
      'hit'
    )
    expect(defined(state.battle).field.weather.id).toBe('rain')
  })

  it('identity.elementFromSkill: đổi hệ theo skill vừa dùng', () => {
    const user = fighter('a', ['hit'], 100, { ...withTraits(['protean2']), elementIds: ['fire'] })
    const { state } = run(user, [fighter('e', ['idle'], 1)], 'hit')
    expect(defined(state.party[0]).elementIds).toEqual(['normal'])
  })

  it('consumedItem: đã tiêu hao đồ cầm và đang không cầm gì', () => {
    const view = (monster: Monster, lastConsumedItemId?: string): boolean =>
      checkAllConditions(
        {
          data,
          self: monster,
          selfCtx: makeBattleContext({ record: { ...emptyRecord(), lastConsumedItemId } })
        },
        [{ if: 'consumedItem', who: 'self' }]
      )
    expect(view(makeMonster(), 'sitrusBerry')).toBe(true)
    expect(view(makeMonster())).toBe(false)
    expect(view(makeMonster({ equipment: [held('trinket')] }), 'sitrusBerry')).toBe(false)
  })
})

describe('đợt 3', () => {
  it('Regenerator: rút về còn sống thì hồi % max HP', () => {
    const hurt = fighter('a', ['idle'], 100, {
      ...withTraits(['regen2']),
      damageTaken: toBigStats(uniformStats(0)).hp.plus('6e5')
    })
    const state = makeBattleState(
      [hurt, fighter('b', ['idle'], 1), fighter('c', ['idle'], 1)],
      [fighter('e', ['idle'], 1)]
    )
    const next = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'switch', monsterId: 'c' },
        { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
      ]
    })
    const benched = defined(next.party.find((m) => m.id === 'a'))
    expect(benched.damageTaken.lt('6e5')).toBe(true)
  })

  it('Liquid Ooze: hút máu của quái mang thì mất máu', () => {
    const hurt = (): Monster =>
      fighter('a', ['leech'], 100, { damageTaken: toBigStats(uniformStats(0)).hp.plus(1000) })
    const healed = run(hurt(), [fighter('e', ['idle'], 1)], 'leech').state
    expect(defined(healed.party[0]).damageTaken.lt(1000)).toBe(true)
    const hurtMore = run(hurt(), [fighter('e', ['idle'], 1, withTraits(['ooze']))], 'leech').state
    expect(defined(hurtMore.party[0]).damageTaken.gt(1000)).toBe(true)
  })

  it('Wonder Skin: skill trạng thái nhắm nó tối đa 50% chính xác', () => {
    let missed = 0
    for (let seed = 1; seed <= 20; seed++) {
      const state = {
        ...makeBattleState(
          [fighter('a', ['growl3'], 100)],
          [fighter('e', ['idle'], 1, withTraits(['wonder']))]
        ),
        rng: seed
      }
      if (turn(state, 'growl3').log.some((e) => e.type === 'miss')) missed++
    }
    expect(missed).toBeGreaterThan(3)
    expect(missed).toBeLessThan(17)
  })

  it('Screen Cleaner: vào sân dọn màn chắn hai phe', () => {
    const state = makeBattleState(
      [
        fighter('a', ['idle'], 100),
        fighter('b', ['idle'], 1),
        fighter('c', ['idle'], 1, withTraits(['cleaner']))
      ],
      [fighter('e', ['idle'], 1)],
      { field: makeField({ sides: { enemy: [{ id: 'reflect', turnsLeft: 5, layers: 1 }] } }) }
    )
    const next = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'switch', monsterId: 'c' },
        { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
      ]
    })
    expect(defined(next.battle).field.sides.enemy).toEqual([])
  })

  it('Damp chặn chiêu tự gục của mọi quái trên sân', () => {
    const { log } = run(
      fighter('a', ['boom'], 100),
      [fighter('e', ['idle'], 1, withTraits(['damp2']))],
      'boom'
    )
    expect(log.some((e) => e.type === 'skillFailed')).toBe(true)
    expect(damageTo(log, 'e')).toBe(0)
  })

  it('Good as Gold miễn skill trạng thái của quái khác', () => {
    const { state } = run(
      fighter('a', ['growl3'], 100),
      [fighter('e', ['idle'], 1, withTraits(['gold']))],
      'growl3'
    )
    expect(defined(state.battle).stages.e?.attack).toBeUndefined()
  })

  it('Liquid Voice: chiêu âm thanh đổi hệ', () => {
    const grass = (): Monster => fighter('e', ['idle'], 1, { elementIds: ['grass'] })
    const plain = damageTo(run(fighter('a', ['song2'], 100), [grass()], 'song2').log, 'e')
    const voiced = damageTo(
      run(fighter('a', ['song2'], 100, withTraits(['voice'])), [grass()], 'song2').log,
      'e'
    )
    expect(voiced).toBeGreaterThan(plain * 1.8)
  })

  it('weightMultiplier nhân cân nặng trong công thức power', () => {
    const plain = damageTo(
      run(fighter('a', ['heavySlam2'], 100), [fighter('e', ['idle'], 1)], 'heavySlam2').log,
      'e'
    )
    const heavy = damageTo(
      run(
        fighter('a', ['heavySlam2'], 100, withTraits(['heavy'])),
        [fighter('e', ['idle'], 1)],
        'heavySlam2'
      ).log,
      'e'
    )
    expect(heavy).toBeGreaterThan(plain)
  })

  it('Magnet Pull: chỉ giữ chân địch đúng hệ', () => {
    const state = makeBattleState(
      [
        fighter('a', ['idle'], 100, { elementIds: ['fire'] }),
        fighter('b', ['idle'], 1),
        fighter('c', ['idle'], 1)
      ],
      [fighter('e', ['idle'], 1, withTraits(['magnet']))]
    )
    expect(() =>
      gameReducer(data, state, {
        type: 'submitTurn',
        commands: [
          { slot: 0, kind: 'switch', monsterId: 'c' },
          { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
        ]
      })
    ).toThrow()
  })

  it('noBattleEffect cho phép hooks rỗng; thiếu cờ thì báo lỗi', () => {
    const issues = (noBattleEffect?: true): string =>
      dataIssuesAfter(
        (r) => {
          r.traits.push({
            id: 'infoOnly',
            kind: 'positive',
            hooks: [],
            ...(noBattleEffect ? { noBattleEffect } : {})
          })
        },
        { regenerateText: true }
      ).join('\n')
    expect(issues(true)).not.toContain('infoOnly')
    expect(issues()).toContain('cần ít nhất một hook')
  })
})

describe('đợt 4', () => {
  it('Gale Wings: skill hệ Bay +1 priority khi đầy máu', () => {
    const first = (fields: Partial<Monster>): string | undefined => {
      const { log } = run(
        fighter('a', ['wing'], 1, { ...withTraits(['gale']), ...fields }),
        [fighter('e', ['hit'], 100)],
        'wing'
      )
      const use = log.find((e) => e.type === 'useSkill')
      return use?.type === 'useSkill' ? use.monsterId : undefined
    }
    expect(first({})).toBe('a')
    expect(first({ damageTaken: toBigStats(uniformStats(0)).hp.plus(1) })).toBe('e')
  })

  it('Queenly Majesty: chặn skill priority > 0 của địch', () => {
    const { log } = run(
      fighter('a', ['quick'], 100),
      [fighter('e', ['idle'], 1, withTraits(['majesty']))],
      'quick'
    )
    expect(damageTo(log, 'e')).toBe(0)
  })

  it('Neutralizing Gas: ability theo loài của quái khác không tác dụng', () => {
    // Ability Scrappy theo loài brawler, Neutralizing Gas theo loài pebble.
    const scrappy = fighter('a', ['hit'], 100, { speciesId: 'brawler', baseSpeciesId: 'brawler' })
    const ghost = (speciesId: string): Monster =>
      fighter('e', ['idle'], 1, {
        elementIds: ['ghost'],
        speciesId,
        baseSpeciesId: speciesId,
        gender: 'none'
      })
    const plainGhost = fighter('e', ['idle'], 1, { elementIds: ['ghost'] })
    expect(damageTo(run(scrappy, [plainGhost], 'hit').log, 'e')).toBeGreaterThan(0)
    expect(damageTo(run(scrappy, [ghost('pebble')], 'hit').log, 'e')).toBe(0)
  })
})

describe('highestStatBoost', () => {
  it('chỉ số gốc cao nhất của loài + %, tốc độ dùng speedPercent; điều kiện sai thì không có', () => {
    const species = data.species.weakling
    if (species.kind !== 'normal') throw new Error('fixture')
    const stats = ['attack', 'defense', 'spAttack', 'spDefense', 'speed'] as const
    const highest = stats.reduce((best, stat) =>
      species.baseStats[stat] > species.baseStats[best] ? stat : best
    )
    const view = { data, self: makeMonster({ speciesId: 'weakling', baseSpeciesId: 'weakling' }) }
    const handler = TRAIT_HOOKS.highestStatBoost
    const boost = handler.contextStatPercent?.({ percent: 30, speedPercent: 50 }, 1, view)
    expect(boost).toEqual({ [highest]: highest === 'speed' ? 50 : 30 })
    const off = handler.contextStatPercent?.(
      { percent: 30, speedPercent: 50, when: [{ if: 'bossBattle', value: true }] },
      1,
      view
    )
    expect(off).toEqual({})
  })
})

describe('kiểm tra dữ liệu', () => {
  it('params sai', () => {
    const issues = dataIssuesAfter(
      (r) => {
        r.traits.push(
          flagTrait('badFlag', 'flying'),
          trait('badConvert', 'convertSkillElement', {
            fromElementIds: ['lava'],
            toElementId: 'x',
            percent: -1
          }),
          trait('badField', 'trigger', {
            on: 'damaged',
            scope: 'self',
            effects: [{ do: 'placeField', fieldId: 'reflect' }]
          })
        )
      },
      { regenerateText: true }
    ).join('\n')
    for (const fragment of [
      'flag phải là',
      'lava',
      'toElementId',
      'percent',
      'thời tiết / địa hình'
    ]) {
      expect(issues).toContain(fragment)
    }
  })
})
