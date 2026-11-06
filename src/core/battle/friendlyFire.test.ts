// Mục tiêu trúng cả phe mình (battle.md mục "Mục tiêu"): `allOthers` (mọi quái khác), `all` (cả sân),
// `foesOrAlly` + lệnh `targetAlly`, đòn đơn nhắm đồng đội bằng lệnh, `fullSpread`, AI trừ điểm phần lên
// phe mình; cơ chế trait Temtem: đảo priority (Deceit Aura), đẩy đòn sang đồng đội (Puppet Master), trạng
// thái tắt ability (Intimidator), Individualist, Spreader, Voodoo, Transmog (`keepStages`, `nextClockwise`).

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { createGameData } from '../gameData'
import { isReducedSpread } from '../model'
import { getMaxHp, validateMonster } from '../monster'
import { skillPriority } from '../registries'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { BattleCommand, GameState, Monster, Skill, StatusDef, TraitDef } from '../model'
import { suggestBattleCommands } from './ai'
import { battleStats, cloneDraft, monsterBattleContext } from './draft'
import { inflictStatus } from './statuses'
import { applyStageChange } from './stageChanges'
import { runTraitEffects } from './traitEffects'

const raw = makeRawData()
const base = { elementId: 'normal', priority: 0, accuracy: 100, effects: [] }
const skill = (fields: Partial<Skill> & { id: string }): Skill =>
  ({ ...base, category: 'physical', power: 60, target: 'enemy', ...fields }) as Skill
raw.skills.push(
  skill({
    id: 'chainZap',
    category: 'special',
    chain: { steps: 3, damagePercents: [100, 70, 60] }
  }),
  skill({
    id: 'chainMend',
    category: 'status',
    power: 0,
    target: 'ally',
    chain: { steps: 3 },
    spell: {
      onTarget: [
        { do: 'heal', to: 'subject', amount: { hp: 'max', of: 'target', percent: 10 } },
        {
          do: 'heal',
          to: 'subject',
          amount: { hp: 'max', of: 'target', percent: 10 },
          if: [{ if: 'chainStep', step: 0, maxSize: 2 }]
        }
      ]
    }
  }),
  skill({ id: 'quake', target: 'allOthers' }),
  skill({ id: 'quakeFull', target: 'allOthers', fullSpread: true }),
  skill({ id: 'waveT', target: 'foesOrAlly' }),
  skill({ id: 'jab' }),
  skill({ id: 'slowJab', priority: -2 }),
  skill({ id: 'spec', category: 'special' }),
  skill({
    id: 'lullabyAll',
    category: 'status',
    power: 0,
    target: 'all',
    spell: { onTarget: [{ do: 'status', to: 'subject', statusId: 'markT', turns: 2 }] }
  })
)
const statuses: StatusDef[] = [
  { id: 'markT', kind: 'debuff', duration: { min: 2, max: 2 }, hooks: [], marker: true },
  { id: 'inhibitedT', kind: 'debuff', hooks: [], battleOnly: true, suppressesAbility: true },
  {
    id: 'fearT',
    kind: 'debuff',
    duration: { min: 3, max: 3 },
    hooks: [],
    battleOnly: true,
    suppressesAbility: true,
    endsWhenSourceLeaves: true
  },
  {
    id: 'noAbilityT',
    kind: 'debuff',
    duration: { min: 3, max: 3 },
    hooks: [],
    suppressesAbility: true
  }
]
raw.statuses.push(...statuses)
Object.assign(raw.config.ai.statusWeights, {
  markT: 0.1,
  noAbilityT: 0.1,
  inhibitedT: 0.1,
  fearT: 0.1
})
const trait = (id: string, hooks: TraitDef['hooks']): TraitDef => ({ id, kind: 'positive', hooks })
raw.traits.push(
  trait('deceit', [{ type: 'invertsPriority', params: { exceptAtLeast: 3 } }]),
  trait('puppet', [{ type: 'redirectToAlly', params: {} }]),
  trait('individualist', [{ type: 'abilityFlag', params: { flag: 'sparesAllies' } }]),
  trait('spreader', [
    { type: 'spreadsSingleTarget', params: { categories: ['special'], powerPercent: 85 } }
  ]),
  trait('voodoo', [{ type: 'abilityFlag', params: { flag: 'spreadsDebuffsToPartner' } }]),
  trait('fastT', [{ type: 'conditionalPriority', params: { amount: 1 } }]),
  trait('dodgeAll', [{ type: 'dodge', params: { percent: 100 } }]),
  trait('inhibiter', [
    {
      type: 'trigger',
      params: {
        on: 'damaged',
        scope: 'foes',
        oncePerBattle: true,
        when: [{ if: 'isSelf', who: 'other' }],
        effects: [{ do: 'status', to: 'subject', statusId: 'inhibitedT' }]
      }
    }
  ])
)
const data = createGameData(withFixtureText(raw))

const mon = (id: string, fields: Partial<Monster> = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], level: 50, ...fields })
const withTraits = (...ids: string[]): Pick<Monster, 'traits'> => ({
  traits: ids.map((id) => ({ id, level: 1 }))
})
const submit = (state: GameState, commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })
const idleCommand: BattleCommand = { slot: 1, kind: 'skill', skillId: 'idle' }
const damagedIds = (state: GameState): string[] =>
  defined(state.battle)
    .log.filter((e) => e.type === 'damage')
    .map((e) => (e.type === 'damage' ? e.targetId : ''))
const damageTo = (state: GameState, id: string): number => {
  const event = defined(state.battle).log.find((e) => e.type === 'damage' && e.targetId === id)
  return event?.type === 'damage' ? event.amount.toNumber() : 0
}

/** Đội 2 quái (a dùng skill, b đứng yên) đánh 2 địch đứng yên. */
function duel(
  skillId: string,
  user: Partial<Monster> = {},
  extra: Partial<BattleCommand> = {}
): GameState {
  const state = makeBattleState(
    [mon('a', { skillIds: [skillId], ...user }), mon('b')],
    [mon('e1'), mon('e2')]
  )
  return submit(state, [
    { slot: 0, kind: 'skill', skillId, target: 0, ...extra } as BattleCommand,
    idleCommand
  ])
}

describe('mục tiêu trúng cả phe mình', () => {
  it('allOthers trúng hai địch và đồng đội, không trúng chính quái dùng', () => {
    expect(damagedIds(duel('quake')).sort()).toEqual(['b', 'e1', 'e2'])
  })

  it('all trúng cả sân kể cả quái dùng', () => {
    const after = duel('lullabyAll')
    for (const monster of [...after.party, ...defined(after.battle).enemies]) {
      expect(monster.statuses.map((s) => s.statusId)).toContain('markT')
    }
  })

  it('foesOrAlly: mặc định đánh đội địch, lệnh targetAlly đánh đồng đội', () => {
    expect(damagedIds(duel('waveT')).sort()).toEqual(['e1', 'e2'])
    expect(damagedIds(duel('waveT', {}, { targetAlly: true }))).toEqual(['b'])
  })

  it('đòn đơn nhắm địch dùng lệnh targetAlly đánh đồng đội; skill nhắm phe mình thì báo lỗi', () => {
    expect(damagedIds(duel('jab', {}, { targetAlly: true }))).toEqual(['b'])
    const state = makeBattleState([mon('a'), mon('b')], [mon('e1')])
    expectActionError(
      () =>
        gameReducer(data, state, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'skill', skillId: 'idle', targetAlly: true }, idleCommand]
        }),
      'malformedAction'
    )
  })

  it('đòn lan giảm sát thương trừ khi fullSpread; một mục tiêu không giảm', () => {
    expect(damageTo(duel('quakeFull'), 'e1')).toBeGreaterThan(damageTo(duel('quake'), 'e1'))
    expect(isReducedSpread(data.skills.quake, 1)).toBe(false)
    expect(isReducedSpread(data.skills.quakeFull, 3)).toBe(false)
    expect(isReducedSpread(data.skills.quake, 3)).toBe(true)
  })

  it('AI trừ điểm phần đánh trúng đồng đội: chọn đòn đơn thay vì đòn trúng cả đồng đội', () => {
    const state = makeBattleState(
      [mon('a', { skillIds: ['quake', 'jab'] }), mon('b', { level: 1 })],
      [mon('e1', { level: 60 })]
    )
    for (let rng = 1; rng <= 10; rng++) {
      const [command] = suggestBattleCommands(data, { ...state, rng })
      expect(command.kind === 'skill' && command.skillId).toBe('jab')
    }
  })
})

describe('cơ chế trait Temtem', () => {
  it('Deceit Aura: có quái mang trên sân thì priority đảo dấu, trừ mức từ 3', () => {
    const d = cloneDraft(makeBattleState([mon('a', withTraits('deceit'))], [mon('e1')]))
    const [user] = d.party
    const ctx = monsterBattleContext(data, d, user)
    expect(skillPriority(data, user, data.skills.slowJab, ctx)).toBe(2)
    expect(skillPriority(data, user, { ...data.skills.jab, priority: 4 }, ctx)).toBe(4)
    expect(skillPriority(data, user, data.skills.slowJab)).toBe(-2)
  })

  it('Puppet Master: đòn đơn nhắm quái mang chuyển sang đồng đội của nó', () => {
    const state = makeBattleState(
      [mon('a', { skillIds: ['jab'] })],
      [mon('e1', withTraits('puppet')), mon('e2')]
    )
    const after = submit(state, [{ slot: 0, kind: 'skill', skillId: 'jab', target: 0 }])
    expect(damagedIds(after)).toEqual(['e2'])
  })

  it('trạng thái suppressesAbility tắt ability của quái mang (Intimidator), hết thì có lại', () => {
    const d = cloneDraft(makeBattleState([mon('a')], [mon('e1')]))
    const [user] = d.party
    expect(monsterBattleContext(data, d, user)?.abilitySuppressed).toBe(false)
    inflictStatus(data, d, user, 'noAbilityT')
    expect(monsterBattleContext(data, d, user)?.abilitySuppressed).toBe(true)
  })

  it('Inhibiter: đòn đầu tiên gây trạng thái không thời hạn, còn sau khi rút về; chỉ một lần mỗi trận', () => {
    const state = makeBattleState(
      [mon('a', { skillIds: ['jab'], ...withTraits('inhibiter') })],
      [mon('e1'), mon('e2'), mon('e3')]
    )
    let after = submit(state, [{ slot: 0, kind: 'skill', skillId: 'jab', target: 0 }])
    const inhibited = (s: GameState): string[] =>
      [...defined(s.battle).enemies]
        .filter((m) => m.statuses.some((x) => x.statusId === 'inhibitedT'))
        .map((m) => m.id)
    expect(inhibited(after)).toEqual(['e1'])
    after = submit(after, [{ slot: 0, kind: 'skill', skillId: 'jab', target: 1 }])
    expect(inhibited(after)).toEqual(['e1'])
  })

  it('trạng thái Inhibited còn sau khi rút về rồi vào lại, ability vẫn tắt', () => {
    const inhibited = [{ statusId: 'inhibitedT', turnsLeft: null }]
    let state = makeBattleState(
      [mon('a', { statuses: inhibited }), mon('x'), mon('c')],
      [mon('e1')]
    )
    state = submit(state, [
      { slot: 0, kind: 'switch', monsterId: 'c' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ])
    state = submit(state, [
      { slot: 0, kind: 'switch', monsterId: 'a' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ])
    const d = cloneDraft(state)
    const a = defined(d.party.find((m) => m.id === 'a'))
    expect(d.battle.playerSlots).toContain('a')
    expect(a.statuses.map((x) => x.statusId)).toContain('inhibitedT')
    expect(monsterBattleContext(data, d, a)?.abilitySuppressed).toBe(true)
  })

  it('trạng thái endsWhenSourceLeaves (Intimidator) hết khi quái gây ra rời sân', () => {
    const feared = [{ statusId: 'fearT', turnsLeft: 3, sourceId: 'a' }]
    const state = makeBattleState([mon('a'), mon('x'), mon('c')], [mon('e1', { statuses: feared })])
    const after = submit(state, [
      { slot: 0, kind: 'switch', monsterId: 'c' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ])
    expect(defined(after.battle).enemies[0].statuses.map((x) => x.statusId)).not.toContain('fearT')
    const stayed = submit(state, [
      { slot: 0, kind: 'skill', skillId: 'idle' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ])
    expect(defined(stayed.battle).enemies[0].statuses.map((x) => x.statusId)).toContain('fearT')
  })

  it('Individualist: đòn trúng mọi quái khác bỏ đồng đội', () => {
    expect(damagedIds(duel('quake', withTraits('individualist'))).sort()).toEqual(['e1', 'e2'])
  })

  it('Spreader: đòn đặc biệt đơn đánh mọi địch, power 85% khi có 2 địch', () => {
    const spread = duel('spec', withTraits('spreader'))
    expect(damagedIds(spread).sort()).toEqual(['e1', 'e2'])
    expect(damageTo(spread, 'e1')).toBeLessThan(damageTo(duel('spec'), 'e1'))
    // Đòn vật lý không đổi.
    expect(damagedIds(duel('jab', withTraits('spreader')))).toEqual(['e1'])
  })

  it('Voodoo: debuff / hạ bậc lên địch lan sang đồng đội của nó, một lần', () => {
    const d = cloneDraft(makeBattleState([mon('a', withTraits('voodoo'))], [mon('e1'), mon('e2')]))
    const [e1, e2] = d.battle.enemies
    inflictStatus(data, d, e1, 'markT', { source: d.party[0] })
    expect(e2.statuses.map((s) => s.statusId)).toEqual(['markT'])
    applyStageChange(data, d, {
      targetId: e1.id,
      stat: 'attack',
      delta: -1,
      cause: 'foe',
      sourceId: 'a'
    })
    expect(d.battle.stages.e2?.attack).toBe(-1)
    expect(d.battle.stages.e1?.attack).toBe(-1)
  })
})

describe('chuỗi (Chain Lightning / Chain Heal)', () => {
  it('nảy theo chiều kim đồng hồ từ mục tiêu được chọn, kể cả quái dùng, 100 / 70 / 60%', () => {
    const state = makeBattleState([mon('a', { skillIds: ['chainZap'] })], [mon('e1'), mon('e2')])
    const after = submit(state, [{ slot: 0, kind: 'skill', skillId: 'chainZap', target: 0 }])
    // Vòng tính từ phe của e1: e1 → e2 → (phe ta ngược thứ tự) a.
    expect(damagedIds(after)).toEqual(['e1', 'e2', 'a'])
    expect(damageTo(after, 'e2')).toBeLessThan(damageTo(after, 'e1'))
  })

  it('quái chặn được đòn thì chuỗi dừng', () => {
    // e1 né chắc chắn: không trúng e2 / a.
    const state = makeBattleState(
      [mon('a', { skillIds: ['chainZap'] })],
      [mon('e1', withTraits('dodgeAll')), mon('e2')]
    )
    const after = submit(state, [{ slot: 0, kind: 'skill', skillId: 'chainZap', target: 0 }])
    expect(damagedIds(after)).toEqual([])
  })

  it('Chain Heal: mục tiêu đầu rồi 2 quái kế; chỉ có 2 quái thì mục tiêu đầu (chính nó) hồi gấp đôi', () => {
    const hurt = (id: string): Monster => {
      const monster = mon(id, { skillIds: ['chainMend', 'idle'] })
      monster.damageTaken = getMaxHp(data, monster).times(0.8).floor()
      return monster
    }
    const healedIds = (state: GameState): string[] =>
      defined(state.battle)
        .log.filter((e) => e.type === 'heal')
        .map((e) => (e.type === 'heal' ? e.monsterId : ''))
    const three = submit(makeBattleState([hurt('a'), hurt('b')], [hurt('e1')]), [
      { slot: 0, kind: 'skill', skillId: 'chainMend' },
      idleCommand
    ])
    expect(healedIds(three)).toEqual(['b', 'e1', 'a'])
    const two = submit(makeBattleState([hurt('a')], [hurt('e1')]), [
      { slot: 0, kind: 'skill', skillId: 'chainMend' }
    ])
    expect(healedIds(two)).toEqual(['a', 'a', 'e1'])
  })
})

describe('Transmog', () => {
  it('nextClockwise: biến thành quái kế tiếp khác loài, giữ bậc trận của mình (keepStages)', () => {
    const d = cloneDraft(
      makeBattleState(
        [
          mon('a', { speciesId: 'weakling', baseSpeciesId: 'weakling' }),
          mon('b', { speciesId: 'weakling', baseSpeciesId: 'weakling' })
        ],
        [mon('e1', { speciesId: 'strongling', baseSpeciesId: 'strongling', skillIds: ['jab'] })]
      )
    )
    const [user] = d.party
    d.battle.stages.a = { attack: 2 }
    d.battle.stages.e1 = { attack: -3 }
    runTraitEffects(data, d, { owner: user, scale: 1 }, [
      { do: 'transformInto', to: 'self', from: 'nextClockwise', keepStages: true }
    ])
    expect(d.battle.log).toContainEqual({ type: 'transformedInto', monsterId: 'a', otherId: 'e1' })
    expect(d.battle.stages.a?.attack).toBe(2)
    expect(d.battle.volatiles.a?.tempSkillIds).toContain('jab')
  })

  it('baseStats: chép chỉ số gốc của loài nguồn theo level của mình, giữ tới hết trận', () => {
    const d = cloneDraft(
      makeBattleState(
        [mon('a', { speciesId: 'weakling', baseSpeciesId: 'weakling', level: 10 })],
        [mon('e1', { speciesId: 'strongling', baseSpeciesId: 'strongling', level: 90 })]
      )
    )
    const [user] = d.party
    const before = battleStats(data, d, user).attack
    runTraitEffects(data, d, { owner: user, scale: 1 }, [
      { do: 'transformInto', to: 'self', from: 'nextClockwise', keepStages: true, baseStats: true }
    ])
    expect(user.battleForm).toMatchObject({ speciesId: 'strongling', copied: true })
    const copied = battleStats(data, d, user).attack
    expect(copied.gt(before)).toBe(true)
    // Level của mình (10), không phải chỉ số của quái nguồn (level 90).
    expect(copied.lt(battleStats(data, d, d.battle.enemies[0]).attack)).toBe(true)
  })

  it('không có quái khác loài thì không biến hình', () => {
    const d = cloneDraft(
      makeBattleState(
        [mon('a', { speciesId: 'weakling', baseSpeciesId: 'weakling' })],
        [mon('e1', { speciesId: 'weakling', baseSpeciesId: 'weakling' })]
      )
    )
    runTraitEffects(data, d, { owner: d.party[0], scale: 1 }, [
      { do: 'transformInto', to: 'self', from: 'nextClockwise', keepStages: true }
    ])
    expect(d.battle.log.some((e) => e.type === 'transformedInto')).toBe(false)
  })
})

describe('kiểm tra save', () => {
  it('BattleForm.copied: chỉ true, loài phải tồn tại; không copied thì phải là dạng trong trận', () => {
    const issues = (form: object): string =>
      validateMonster(data, { ...mon('a'), battleForm: form as never }).join('\n')
    expect(issues({ speciesId: 'strongling', originalElementIds: ['normal'], copied: true })).toBe(
      ''
    )
    expect(issues({ speciesId: 'nope', originalElementIds: ['normal'], copied: true })).toContain(
      'loài không tồn tại'
    )
    expect(
      issues({ speciesId: 'strongling', originalElementIds: ['normal'], copied: 1 })
    ).toContain('copied chỉ được là true')
    expect(issues({ speciesId: 'strongling', originalElementIds: ['normal'] })).toContain(
      'không phải dạng trong trận'
    )
  })
})

describe('kiểm tra dữ liệu', () => {
  it('báo lỗi params sai của hook mới, fullSpread lạ', () => {
    const issues = dataIssuesAfter((rawData) => {
      rawData.traits.push(
        trait('badInvert', [{ type: 'invertsPriority', params: { exceptAtLeast: 0 } }]),
        trait('badSpread', [
          { type: 'spreadsSingleTarget', params: { categories: ['x'], powerPercent: 0 } }
        ])
      )
      rawData.skills.push(
        skill({ id: 'badFull', fullSpread: 'yes' as never }),
        skill({ id: 'badChainTarget', target: 'allEnemies', chain: { steps: 3 } }),
        skill({ id: 'badChainSteps', chain: { steps: 1, damagePercents: [100, 50] } }),
        skill({
          id: 'badChainStep',
          spell: {
            onTarget: [
              {
                do: 'heal',
                to: 'subject',
                amount: { flat: 1 },
                if: [{ if: 'chainStep', step: -1 }]
              }
            ]
          }
        })
      )
    }).join('\n')
    expect(issues).toContain('exceptAtLeast')
    expect(issues).toContain('categories')
    expect(issues).toContain('powerPercent')
    expect(issues).toContain('fullSpread chỉ được là true')
    expect(issues).toContain('chain chỉ dùng cho skill nhắm enemy / ally')
    expect(issues).toContain('chain.steps')
    expect(issues).toContain('chain.damagePercents phải có đúng chain.steps số')
    expect(issues).toContain('.step')
  })
})
