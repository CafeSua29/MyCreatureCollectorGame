// Dữ liệu test cho trait Siralim (mục "Trait Siralim", "Buff và debuff", "Minion" ở battle.md):
// buff / debuff và minion mẫu theo hiệu ứng gốc, trait mẫu dùng hào quang / bộ đếm / trigger.
// Không phụ thuộc dữ liệu thật (quy tắc 13).

import { createGameData } from '../gameData'
import type { GameData, MinionDef, RawGameData, Skill, StatusDef, TraitDef } from '../model'
import { makeRawData, withFixtureText } from './fixtures'

const D3 = { min: 3, max: 3 }
const D1 = { min: 1, max: 1 }

const hook = (type: string, params: unknown = {}): { type: string; params: unknown } => ({
  type,
  params
})

/** Buff / debuff mẫu (cùng hiệu ứng với dữ liệu thật). */
export const SIRALIM_TEST_STATUSES: StatusDef[] = [
  {
    id: 'vulnerable',
    kind: 'debuff',
    duration: D3,
    hooks: [],
    traitHooks: [hook('damageTakenModifier', { percent: 50 })],
    battleOnly: true
  },
  {
    id: 'barrierBuff',
    kind: 'buff',
    hooks: [hook('barrier', { capPercent: 200 })],
    battleOnly: true
  },
  { id: 'shelled', kind: 'buff', hooks: [hook('shell')], battleOnly: true },
  {
    id: 'mania',
    kind: 'debuff',
    duration: D1,
    hooks: [hook('amountDamage')],
    battleOnly: true,
    excludeFromRandom: true
  },
  {
    id: 'frozen',
    kind: 'debuff',
    hooks: [hook('skipTurn', { chance: 100 }), hook('thaw', { chance: 100 })],
    battleOnly: true
  },
  {
    id: 'bomb',
    kind: 'debuff',
    duration: D3,
    hooks: [hook('detonate', { percent: 25 })],
    battleOnly: true
  },
  {
    id: 'scorned',
    kind: 'debuff',
    duration: D1,
    hooks: [hook('blockCategories', { categories: ['physical'] })],
    exclusiveGroup: 'scornSilence',
    overwritesGroup: true,
    battleOnly: true
  },
  {
    id: 'silenced',
    kind: 'debuff',
    duration: D1,
    hooks: [hook('blockCategories', { categories: ['special', 'status'] })],
    exclusiveGroup: 'scornSilence',
    overwritesGroup: true,
    battleOnly: true
  },
  {
    id: 'invisible',
    kind: 'buff',
    hooks: [hook('untargetable'), hook('endsAfterAction')],
    battleOnly: true
  },
  {
    id: 'immune',
    kind: 'buff',
    duration: D1,
    hooks: [],
    traitHooks: [hook('debuffImmunity')],
    battleOnly: true
  }
]

/** Minion mẫu. */
export const SIRALIM_TEST_MINIONS: MinionDef[] = [
  {
    id: 'direWolves',
    maxStacks: 5,
    leaveChance: 0,
    hooks: [
      hook('trigger', {
        on: 'attack',
        scope: 'self',
        effects: [{ do: 'damage', to: 'other', amount: { flat: 2 } }]
      })
    ]
  },
  {
    id: 'fleeting',
    maxStacks: 1,
    leaveChance: 100,
    hooks: [hook('statModifier', { percent: { attack: 50 } })]
  }
]

const trait = (id: string, hooks: { type: string; params: unknown }[]): TraitDef => ({
  id,
  kind: 'rare',
  hooks
})

/** Trait mẫu: hào quang, bộ đếm, trigger. */
export const SIRALIM_TEST_TRAITS: TraitDef[] = [
  // Luôn có trạng thái, luân phiên (kiểu Inherit the Earth) và vẫn hành động (kiểu Frost Affinity).
  trait('inheritEarth', [
    hook('enforcedStatuses', { scope: 'any', statusIds: ['scorned', 'silenced'] })
  ]),
  trait('frostAffinity', [
    hook('enforcedStatuses', { scope: 'self', statusIds: ['frozen'] }),
    hook('actsThroughStatus', { statusIds: ['frozen'] })
  ]),
  trait('vigor', [
    hook('aura', { scope: 'side', hooks: [hook('damageTakenModifier', { percent: -50 })] })
  ]),
  // Hào quang có điều kiện theo máu của quái mang (kiểu Mad Man).
  trait('rage', [
    hook('aura', {
      scope: 'side',
      when: [{ if: 'hpBelow', who: 'self', percent: 50 }],
      hooks: [hook('statModifier', { percent: { attack: 50 } })]
    })
  ]),
  trait('crimson', [
    hook('aura', { scope: 'foes', hooks: [hook('statModifier', { percent: { attack: -50 } })] })
  ]),
  trait('harbinger', [
    hook('scaling', { per: { of: 'turnsOnField' }, effect: { damageDealt: 100 } })
  ]),
  trait('mementoMori', [
    hook('trigger', {
      on: 'attacked',
      scope: 'self',
      effects: [{ do: 'damage', to: 'other', amount: { flat: 5 } }]
    })
  ]),
  trait('paradigm', [
    hook('trigger', {
      on: 'attacked',
      scope: 'self',
      effects: [{ do: 'attack', to: 'other', damagePercent: 100 }]
    })
  ]),
  trait('haste', [
    hook('trigger', {
      on: 'attack',
      scope: 'self',
      oncePerTurn: true,
      when: [{ if: 'reactive', value: false }],
      effects: [{ do: 'extraTurn', to: 'self' }]
    })
  ]),
  trait('summoner', [
    hook('trigger', {
      on: 'entry',
      scope: 'self',
      effects: [{ do: 'minion', to: 'self', minionId: 'direWolves', stacks: 2 }]
    })
  ]),
  trait('giant', [
    hook('trigger', {
      on: 'entry',
      scope: 'self',
      effects: [{ do: 'maxHp', to: 'self', amount: { hp: 'max', of: 'self', percent: 100 } }]
    })
  ]),
  trait('reviver', [
    hook('trigger', {
      on: 'faint',
      scope: 'allies',
      effects: [{ do: 'revive', to: 'subject', hpPercent: 50 }]
    })
  ]),
  trait('reaper', [
    hook('trigger', { on: 'attack', scope: 'self', effects: [{ do: 'kill', to: 'other' }] })
  ]),
  trait('swarm', [
    hook('scaling', {
      per: { of: 'traitOnSide', traitId: 'swarm' },
      effect: { damageDealt: 100 }
    })
  ]),
  // Hạ ngay khi sát thương vượt % chỉ số thấp nhất của mục tiêu (kiểu Sword of Will).
  ...[
    ['executioner', 0],
    ['merciful', 1e9]
  ].map(([id, percent]) =>
    trait(String(id), [
      hook('trigger', {
        on: 'attack',
        scope: 'self',
        when: [{ if: 'damageAbove', percentOfLowestStat: percent, who: 'other' }],
        effects: [{ do: 'kill', to: 'other' }]
      })
    ])
  ),
  trait('calm', [
    hook('statWhen', {
      percent: { attack: 100 },
      when: [{ if: 'noGainedStats', stats: ['speed'] }]
    })
  ]),
  trait('breeder', [
    hook('trigger', {
      on: 'attack',
      scope: 'self',
      effects: [{ do: 'minion', to: 'self', stacks: 1, existing: true }]
    })
  ]),
  trait('stoic', [hook('debuffResist', { chance: 100, statusIds: ['scorned'] })]),
  ...['scorned', 'silenced'].map((statusId) =>
    trait(`${statusId}Strike`, [
      hook('trigger', {
        on: 'attack',
        scope: 'self',
        effects: [{ do: 'status', to: 'other', statusId }]
      })
    ])
  )
]

const spellSkill = (id: string, overrides: Partial<Skill>): Skill => ({
  id,
  elementId: 'normal',
  category: 'special',
  power: 50,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...overrides
})

/** Spell mẫu (mục "Spell Siralim"): hiệu ứng lên mục tiêu, sau chiêu, cộng sức mạnh. */
export const SIRALIM_TEST_SKILLS: Skill[] = [
  // Gây Vulnerable lên mục tiêu, sau chiêu quái dùng nhận 1 stack Dire Wolves.
  spellSkill('hex', {
    category: 'status',
    power: 0,
    spell: {
      onTarget: [{ do: 'status', to: 'subject', statusId: 'vulnerable' }],
      after: [{ do: 'minion', to: 'self', minionId: 'direWolves', stacks: 1 }]
    }
  }),
  // +200% sức mạnh nếu mục tiêu đang Vulnerable.
  spellSkill('punish', {
    spell: {
      powerBonus: [
        { percent: 200, when: [{ if: 'hasStatus', who: 'target', statusIds: ['vulnerable'] }] }
      ]
    }
  }),
  // Bỏ qua toàn bộ thủ của mục tiêu.
  spellSkill('pierce', { spell: { ignoreDefensePercent: 100 } }),
  // Tùy chọn của ngôn ngữ trait: chance, countPer, minion count, đổi hệ cố định, chỉ số ngẫu nhiên.
  spellSkill('neverHex', {
    category: 'status',
    power: 0,
    spell: { onTarget: [{ do: 'status', to: 'subject', statusId: 'vulnerable', chance: 0 }] }
  }),
  spellSkill('buffHex', {
    category: 'status',
    power: 0,
    spell: {
      onTarget: [
        {
          do: 'status',
          to: 'subject',
          statusId: 'vulnerable',
          countPer: { of: 'buffs', who: 'subject' }
        }
      ]
    }
  }),
  spellSkill('pack', {
    category: 'status',
    power: 0,
    target: 'self',
    spell: { after: [{ do: 'minion', to: 'self', pool: ['direWolves'], stacks: 1, count: 3 }] }
  }),
  spellSkill('paint', {
    category: 'status',
    power: 0,
    spell: { onTarget: [{ do: 'identity', to: 'subject', elementIds: ['fire'] }] }
  }),
  spellSkill('jumble', {
    category: 'status',
    power: 0,
    target: 'self',
    spell: { after: [{ do: 'stage', to: 'self', stats: 'random', delta: 1 }] }
  }),
  // Sát thương × (số stack minion / 2, làm tròn xuống).
  spellSkill('pairBlast', { spell: { powerTimes: { of: 'minionStacks', divisor: 2 } } })
]

/** Dữ liệu fixture + buff / debuff, minion, trait, spell Siralim mẫu. */
export function makeSiralimRawData(): RawGameData {
  const raw = makeRawData()
  raw.statuses.push(...SIRALIM_TEST_STATUSES)
  raw.minions.push(...SIRALIM_TEST_MINIONS)
  raw.traits.push(...SIRALIM_TEST_TRAITS)
  raw.skills.push(...SIRALIM_TEST_SKILLS)
  for (const status of SIRALIM_TEST_STATUSES) raw.config.ai.statusWeights[status.id] = 0.2
  return raw
}

export function makeSiralimData(): GameData {
  return createGameData(withFixtureText(makeSiralimRawData()))
}
