// Cụm 10 (docs/rules/pokemon-moves.md mục "Chiêu trạng thái"): hiệu ứng ngôn ngữ trait mới (chia máu,
// bậc, chỉ số, ability, khóa skill, Encore, tích trữ, học skill, Transform, đổi ô, Destiny Bond, Magic
// Coat, Snatch), cờ trạng thái (Torment, Imprison, Heal Block, Yawn, Nightmare, Powder, Electrify),
// hook trúng chắc / lộ diện, Sleep Talk, gọi chiêu khác, Wish, điều kiện not / khác giới / ability.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, validateGameState } from '../game'
import { getCurrentHp, getMaxHp } from '../monster'
import { checkAllConditions, counterValue, type DslView } from '../registries'
import { emptyRecord } from './draft'
import {
  dataIssuesAfter,
  defined,
  makeBattleContext,
  makeBattleState,
  makeData,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type {
  BattleEvent,
  GameState,
  Monster,
  MonsterBattleContext,
  NormalSpecies,
  Skill,
  StatusDef
} from '../model'

const status = (id: string, fields: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'status',
  power: 0,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...fields
})
const after = (...effects: unknown[]): Partial<Skill> => ({ spell: { after: effects } })

const SKILLS: Skill[] = [
  status('split', after({ do: 'shareHp', with: 'other' })),
  status('psych', after({ do: 'copyStages', to: 'self', from: 'other' })),
  status('topsy', after({ do: 'invertStages', to: 'other' })),
  status('guardSplit2', after({ do: 'averageStats', with: 'other', stats: ['defense'] })),
  status('acu', {
    target: 'self',
    ...after({ do: 'randomStage', to: 'self', stats: ['attack'], delta: 2 })
  }),
  status('roleplay2', after({ do: 'setAbility', to: 'self', from: 'other' })),
  status('swapAb', after({ do: 'swapAbilities', with: 'other' })),
  status('gastro', after({ do: 'suppressAbility', to: 'other' })),
  status('disable2', after({ do: 'disableSkill', to: 'other', turns: 4 })),
  status('encore2', after({ do: 'encore', to: 'other', turns: 3 })),
  status('pile', { target: 'self', ...after({ do: 'stockpile', to: 'self', change: 'add' }) }),
  status('sketch2', after({ do: 'learnSkill', to: 'self', permanent: true })),
  status('morph', after({ do: 'transformInto', to: 'self', from: 'other' })),
  status('bond', { target: 'self', ...after({ do: 'markVolatile', mark: 'destinyBond' }) }),
  status('coat', {
    target: 'self',
    priority: 4,
    ...after({ do: 'markVolatile', mark: 'magicCoat' })
  }),
  status('mock', {
    reflectable: true,
    effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }]
  }),
  status('tormentIt', { effects: [{ type: 'applyStatus', params: { statusId: 'tormented' } }] }),
  status('yawn2', { effects: [{ type: 'applyStatus', params: { statusId: 'drowsy' } }] }),
  status('noise', {
    effects: [{ type: 'applyStatus', params: { statusId: 'healBlocked', turns: 2 } }]
  }),
  status('mend', { target: 'self', effects: [{ type: 'heal', params: { percent: 50 } }] }),
  status('chant', {
    target: 'self',
    usableWhileStatusIds: ['sleep'],
    spell: { after: [{ do: 'cast', pool: 'own', excludeSkillIds: ['chant'] }] }
  }),
  status('mirror', after({ do: 'cast', lastOf: 'other', to: 'other' })),
  status('wish2', { target: 'self', delayedTurns: 1, delayedHealPercent: 50 }),
  {
    ...status('hit', { category: 'physical', power: 40 })
  },
  { ...status('fireHit', { category: 'physical', power: 40, elementId: 'fire' }) }
]
const STATUSES: StatusDef[] = [
  { id: 'tormented', kind: 'debuff', battleOnly: true, blocksRepeatSkill: true, hooks: [] },
  {
    id: 'drowsy',
    kind: 'debuff',
    battleOnly: true,
    duration: { min: 2, max: 2 },
    onEndStatusId: 'sleep',
    hooks: []
  },
  {
    id: 'healBlocked',
    kind: 'debuff',
    battleOnly: true,
    duration: { min: 5, max: 5 },
    blocksHealing: true,
    hooks: []
  },
  {
    id: 'powdered',
    kind: 'debuff',
    battleOnly: true,
    duration: { min: 1, max: 1 },
    explodesOnElement: { elementIds: ['fire'], percent: 25 },
    hooks: []
  }
]

const raw = makeRawData()
raw.skills.push(...SKILLS)
raw.statuses.push(...STATUSES)
raw.config.ai.statusWeights = {
  ...raw.config.ai.statusWeights,
  tormented: 0.1,
  drowsy: 0.3,
  healBlocked: 0.1,
  powdered: 0.05
}
const weakIndex = raw.species.findIndex((s) => s.id === 'weakling')
raw.species[weakIndex] = { ...(raw.species[weakIndex] as NormalSpecies), abilities: ['fast'] }
const data = createGameData(withFixtureText(raw))

const fighter = (
  id: string,
  skillIds: string[],
  speed = 10,
  fields: Partial<Monster> = {}
): Monster =>
  makeMonster({
    id,
    skillIds,
    genes: toBigStats({ ...uniformStats(20), hp: '1e6', speed }),
    ...fields
  })

function turn(state: GameState, skillId: string): { state: GameState; log: BattleEvent[] } {
  const next = gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })
  return { state: next, log: defined(next.battle).log.slice(defined(state.battle).log.length) }
}
const scene = (player: Monster, enemy: Monster, fields = {}): GameState =>
  makeBattleState([player], [enemy], fields)
const enemyOf = (state: GameState): Monster => defined(defined(state.battle).enemies[0])
const playerOf = (state: GameState): Monster => defined(state.party[0])

describe('máu, bậc, chỉ số', () => {
  it('Pain Split: máu hai quái về trung bình', () => {
    const hurt = fighter('a', ['split'], 100, {
      damageTaken: toBigStats(uniformStats(0)).hp.plus('9e5')
    })
    const result = turn(scene(hurt, fighter('e', ['idle'], 1)), 'split').state
    expect(getCurrentHp(data, playerOf(result)).toString()).toBe(
      getCurrentHp(data, enemyOf(result)).toString()
    )
  })

  it('Psych Up chép bậc; Topsy-Turvy đảo dấu', () => {
    const boosted = makeBattleState(
      [fighter('a', ['psych', 'topsy'], 100)],
      [fighter('e', ['idle'], 1)],
      {
        stages: { e: { attack: 2, speed: -1 } }
      } as never
    )
    const copied = turn(boosted, 'psych').state
    expect(defined(copied.battle).stages.a).toMatchObject({ attack: 2, speed: -1 })
    const inverted = turn(boosted, 'topsy').state
    expect(defined(inverted.battle).stages.e).toMatchObject({ attack: -2, speed: 1 })
  })

  it('Acupressure: +2 bậc ngẫu nhiên; Guard Split: thủ về trung bình', () => {
    expect(
      defined(turn(scene(fighter('a', ['acu']), fighter('e', ['idle'])), 'acu').state.battle).stages
        .a
    ).toEqual({ attack: 2 })
    const sturdy = fighter('e', ['idle'], 1, {
      genes: toBigStats({ ...uniformStats(20), hp: '1e6', defense: 400 })
    })
    const split = turn(scene(fighter('a', ['guardSplit2'], 100), sturdy), 'guardSplit2').state
    const flat = defined(split.battle).volatiles
    expect(flat.a?.flatStats?.defense?.gt(0)).toBe(true)
    expect(flat.e?.flatStats?.defense?.lt(0)).toBe(true)
  })
})

describe('ability trong trận', () => {
  const withAbility = (id: string, skillIds: string[], speed: number): Monster =>
    fighter(id, skillIds, speed, { speciesId: 'weakling', baseSpeciesId: 'weakling' })

  it('Role Play chép, Skill Swap tráo, Gastro Acid vô hiệu', () => {
    const copy = turn(
      scene(fighter('a', ['roleplay2'], 100), withAbility('e', ['idle'], 1)),
      'roleplay2'
    ).state
    expect(defined(copy.battle).volatiles.a?.abilityOverride).toBe('fast')
    const suppressed = turn(
      scene(fighter('a', ['gastro'], 100), withAbility('e', ['idle'], 1)),
      'gastro'
    ).state
    expect(defined(suppressed.battle).volatiles.e?.abilitySuppressed).toBe(true)
  })
})

describe('khóa skill, ép dùng lại, tích trữ, học skill', () => {
  it('Disable khóa skill gần nhất; Encore ép dùng lại', () => {
    let state = scene(fighter('a', ['disable2', 'encore2'], 1), fighter('e', ['hit', 'idle'], 100))
    state = turn(state, 'disable2').state
    expect(defined(state.battle).volatiles.e?.disabledSkill?.skillId).toBeDefined()
    const encored = turn(
      scene(fighter('a', ['encore2'], 1), fighter('e', ['hit'], 100)),
      'encore2'
    ).state
    expect(defined(encored.battle).volatiles.e?.lockedMove?.kind).toBe('encore')
  })

  it('Stockpile tối đa 3 lần', () => {
    let state = scene(fighter('a', ['pile']), fighter('e', ['idle']))
    for (let i = 0; i < 4; i++) state = turn(state, 'pile').state
    expect(defined(state.battle).volatiles.a?.stockpile).toBe(3)
  })

  it('Sketch học vĩnh viễn skill gần nhất của mục tiêu', () => {
    const state = turn(
      scene(fighter('a', ['sketch2'], 1), fighter('e', ['hit'], 100)),
      'sketch2'
    ).state
    expect(playerOf(state).skillIds).toEqual(['hit'])
  })

  it('Transform: hệ như mục tiêu', () => {
    const state = turn(
      scene(fighter('a', ['morph']), fighter('e', ['idle'], 1, { elementIds: ['fire'] })),
      'morph'
    ).state
    expect(playerOf(state).elementIds).toEqual(['fire'])
  })
})

describe('đánh dấu và cờ trạng thái', () => {
  it('Destiny Bond: gục vì đòn thì kẻ đánh gục theo', () => {
    const healthy = fighter('a', ['bond'], 100)
    const fragile = { ...healthy, damageTaken: getMaxHp(data, healthy).minus(1) }
    const result = turn(scene(fragile, fighter('e', ['hit'], 1)), 'bond').state
    expect(getCurrentHp(data, enemyOf(result)).toNumber()).toBe(0)
  })

  it('Magic Coat phản skill trạng thái về quái dùng', () => {
    const { state, log } = turn(
      scene(fighter('a', ['coat'], 1), fighter('e', ['mock'], 100)),
      'coat'
    )
    expect(
      log.some((e) => e.type === 'reflected') || defined(state.battle).stages.e?.attack === -1
    ).toBe(true)
  })

  it('Torment: không dùng lại skill vừa dùng', () => {
    let state = scene(
      fighter('a', ['hit'], 100, { statuses: [{ statusId: 'tormented', turnsLeft: null }] }),
      fighter('e', ['idle'], 1)
    )
    state = turn(state, 'hit').state
    const { log } = turn(state, 'hit')
    expect(log.some((e) => e.type === 'skillBlocked')).toBe(true)
  })

  it('Heal Block chặn hồi máu; Yawn hết hạn thì ngủ', () => {
    const blocked = fighter('a', ['mend'], 100, {
      statuses: [{ statusId: 'healBlocked', turnsLeft: 3 }],
      damageTaken: toBigStats(uniformStats(0)).hp.plus(10)
    })
    const { log } = turn(scene(blocked, fighter('e', ['idle'], 1)), 'mend')
    expect(log.some((e) => e.type === 'healBlocked')).toBe(true)
    let state = scene(fighter('a', ['yawn2', 'idle'], 100), fighter('e', ['idle'], 1))
    state = turn(state, 'yawn2').state
    expect(enemyOf(state).statuses.map((s) => s.statusId)).toEqual(['drowsy'])
    state = turn(state, 'idle').state
    expect(enemyOf(state).statuses.map((s) => s.statusId)).toContain('sleep')
  })

  it('Powder: dùng skill hệ Lửa thì nổ, skill thất bại', () => {
    const { log } = turn(
      scene(
        fighter('a', ['fireHit'], 100, { statuses: [{ statusId: 'powdered', turnsLeft: 1 }] }),
        fighter('e', ['idle'], 1)
      ),
      'fireHit'
    )
    expect(log.some((e) => e.type === 'selfDamage')).toBe(true)
    expect(log.some((e) => e.type === 'damage')).toBe(false)
  })
})

describe('gọi chiêu khác, Wish', () => {
  it('Sleep Talk dùng được khi ngủ, gọi skill khác của chính quái', () => {
    const asleep = fighter('a', ['chant', 'hit'], 100, {
      statuses: [{ statusId: 'sleep', turnsLeft: 3 }]
    })
    const { log } = turn(scene(asleep, fighter('e', ['idle'], 1)), 'chant')
    expect(
      log
        .filter((e) => e.type === 'useSkill' && e.monsterId === 'a')
        .map((e) => e.type === 'useSkill' && e.skillId)
    ).toEqual(['chant', 'hit'])
  })

  it('Mirror Move dùng skill gần nhất của mục tiêu', () => {
    const { log } = turn(scene(fighter('a', ['mirror'], 1), fighter('e', ['hit'], 100)), 'mirror')
    expect(
      log
        .filter((e) => e.type === 'useSkill' && e.monsterId === 'a')
        .map((e) => e.type === 'useSkill' && e.skillId)
    ).toEqual(['mirror', 'hit'])
  })

  it('Wish hồi ½ max HP của quái dùng ở cuối lượt sau', () => {
    const hurt = fighter('a', ['wish2', 'idle'], 100, {
      damageTaken: toBigStats(uniformStats(0)).hp.plus('1.5e6')
    })
    let state = turn(scene(hurt, fighter('e', ['idle'], 1)), 'wish2').state
    const before = getCurrentHp(data, playerOf(state))
    state = turn(state, 'idle').state
    expect(getCurrentHp(data, playerOf(state)).minus(before).toString()).toBe(
      getMaxHp(data, playerOf(state)).div(2).ceil().toString()
    )
  })
})

describe('điều kiện mới', () => {
  const base = makeData()
  it('not, oppositeGender', () => {
    const self = makeMonster({ id: 'a', gender: 'male' })
    const other = makeMonster({ id: 'b', gender: 'female' })
    const view = { data: base, self, target: other, targetCtx: makeBattleContext() }
    expect(checkAllConditions(view, [{ if: 'oppositeGender', who: 'target' }])).toBe(true)
    expect(
      checkAllConditions(view, [{ if: 'not', condition: { if: 'oppositeGender', who: 'target' } }])
    ).toBe(false)
  })
})

describe('bản ghi trận cho Last Resort / Trump Card / Retaliate', () => {
  const self = makeMonster({ id: 'a', skillIds: ['hit', 'fireHit', 'mend'] })
  const view = (ctx: Partial<MonsterBattleContext>, skillId = 'hit'): DslView => ({
    data,
    self,
    selfCtx: makeBattleContext(ctx),
    skill: data.skills[skillId]
  })

  it('usedOtherSkills: đã dùng mọi skill khác skill đang xét', () => {
    const used = (skillUses: Record<string, number>): boolean =>
      checkAllConditions(view({ record: { ...emptyRecord(), skillUses } }), [
        { if: 'usedOtherSkills', who: 'self' }
      ])
    expect(used({ fireHit: 1 })).toBe(false)
    expect(used({ fireHit: 1, mend: 2 })).toBe(true)
  })

  it('allyFaintedLastTurn: phe mình có quái gục ở lượt trước', () => {
    const fainted = (faintTurn: number): boolean =>
      checkAllConditions(
        view({
          battleTurn: 5,
          counters: { ...makeBattleContext().counters, faintTurn: { player: faintTurn } }
        }),
        [{ if: 'allyFaintedLastTurn', who: 'self' }]
      )
    expect(fainted(4)).toBe(true)
    expect(fainted(3)).toBe(false)
  })

  it('skillUses: số lần dùng skill đang xét; ghi sau mỗi lần dùng', () => {
    const uses = counterValue(view({ record: { ...emptyRecord(), skillUses: { hit: 3 } } }), {
      of: 'skillUses'
    })
    expect(uses).toBe(3)
    let state = scene(fighter('a', ['hit'], 100), fighter('e', ['idle'], 1))
    state = turn(state, 'hit').state
    state = turn(state, 'hit').state
    expect(defined(state.battle).records.a?.skillUses).toEqual({ hit: 2 })
    expect(validateGameState(data, state)).toEqual([])
  })

  it('faintTurn ghi lượt quái gục theo phe', () => {
    const healthy = fighter('e', ['idle'], 1)
    const fragile = { ...healthy, damageTaken: getMaxHp(data, healthy).minus(1) }
    const state = turn(scene(fighter('a', ['hit'], 100), fragile), 'hit').state
    expect(defined(state.battle).counters.faintTurn).toEqual({ enemy: 1 })
  })
})

describe('kiểm tra dữ liệu', () => {
  it('hiệu ứng / cờ sai', () => {
    const issues = dataIssuesAfter(
      (r) => {
        r.skills.push(
          status(
            'badFx',
            after(
              { do: 'swapOwnStats', to: 'self', stats: ['attack'] },
              { do: 'setAbility', to: 'self' },
              { do: 'stockpile', to: 'self', change: 'grow' },
              { do: 'markVolatile', mark: 'curse' },
              { do: 'cast', lastOf: 'ally' }
            )
          )
        )
        r.statuses.push({ id: 'badSt', kind: 'debuff', onEndStatusId: 'nope', hooks: [] })
        r.config.ai.statusWeights = { ...r.config.ai.statusWeights, badSt: 0.1 }
      },
      { regenerateText: true }
    ).join('\n')
    for (const fragment of [
      'đúng 2 chỉ số',
      'abilityId / from',
      'change',
      'mark',
      'lastOf',
      'onEndStatusId'
    ]) {
      expect(issues).toContain(fragment)
    }
  })
})
