// Chiêu Pokémon cần luồng trận riêng (docs/rules/pokemon-moves.md): Bide, Sky Drop, Pursuit, Pollen
// Puff, Round, Echoed Voice (đếm chung cả sân), Struggle, đòn không hệ, Ultra Burst.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getMaxHp } from '../monster'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeSideFieldRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type { Decimal } from '../shared'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameState,
  Monster,
  NormalSpecies,
  Skill
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

const raw = makeSideFieldRawData()
raw.skills.push(
  attack('hit'),
  attack('bide2', {
    power: 1,
    priority: 1,
    typeless: true,
    bide: { turns: 2 },
    fixedDamage: { kind: 'stored', multiplier: 2 }
  }),
  attack('lift', {
    charge: { invulnerable: 'air' },
    carriesTarget: { maxWeightKg: 200 }
  }),
  attack('chase', { pursuit: { damagePercent: 200 } }),
  attack('puff', {
    category: 'special',
    onAlly: [{ type: 'heal', params: { percent: 50, who: 'target' } }]
  }),
  attack('chorus', { category: 'special', pullsAllySameSkill: true }),
  attack('echo', {
    category: 'special',
    powerFormula: {
      type: 'linear',
      value: { of: 'counter', counter: { of: 'fieldStreak' } },
      times: 40,
      max: 200
    }
  }),
  attack('flail2', { typeless: true, selfDamagePercent: 25, contact: true }),
  attack('beam', {
    category: 'special',
    elementId: 'normal',
    formOverrides: [{ speciesIds: ['weaklingUltra'], power: 200 }]
  })
)
raw.species.push({
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
} satisfies NormalSpecies)
raw.config.battle.struggleSkillId = 'flail2'
// Leech Seed: trạng thái hút máu về quái gieo; hệ lửa (mẫu) miễn chiêu bột.
raw.statuses.push({
  id: 'seeded2',
  kind: 'debuff',
  battleOnly: true,
  endsOnLeave: true,
  drainsToSource: true,
  hooks: [{ type: 'turnEndDamage', params: { percent: 12.5 } }]
})
raw.skills.push(
  attack('seed2', {
    category: 'status',
    power: 0,
    effects: [{ type: 'applyStatus', params: { statusId: 'seeded2' } }]
  }),
  attack('spore2', {
    category: 'status',
    power: 0,
    moveFlags: ['powder'],
    effects: [{ type: 'applyStatus', params: { statusId: 'sleep' } }]
  })
)
raw.elements = raw.elements.map((e) =>
  e.id === 'fire' ? { ...e, immuneMoveFlags: ['powder'] } : e
)
raw.config.ai.statusWeights.seeded2 = 0.3
raw.statuses.push({ id: 'tiny', kind: 'buff', battleOnly: true, marker: true, hooks: [] })
raw.config.ai.statusWeights.tiny = 0.05
raw.skills.push(attack('stompy', { accuracy: 1, alwaysHitsVsStatusIds: ['tiny'] }))
const data = createGameData(withFixtureText(raw))

const fighter = (id: string, skillIds: string[], fields: Partial<Monster> = {}): Monster =>
  makeMonster({
    id,
    skillIds,
    genes: toBigStats({ ...uniformStats(20), hp: '1e6' }),
    ...fields
  })

function submit(
  state: GameState,
  commands: BattleCommand[]
): { state: GameState; log: BattleEvent[] } {
  const next = gameReducer(data, state, { type: 'submitTurn', commands })
  return { state: next, log: defined(next.battle).log.slice(defined(state.battle).log.length) }
}
const skillCmd = (skillId: string, extra: Partial<BattleCommand> = {}): BattleCommand =>
  ({ slot: 0, kind: 'skill', skillId, target: 0, ...extra }) as BattleCommand
const single = (
  party: Monster[],
  enemies: Monster[],
  overrides: Partial<BattleState> = {}
): GameState =>
  makeBattleState(party, enemies, {
    playerSlots: [party[0].id, null],
    enemySlots: [enemies[0].id, null],
    ...overrides
  })
const damageTo = (log: BattleEvent[], id: string): number =>
  log.reduce(
    (sum, e) => (e.type === 'damage' && e.targetId === id ? sum + Number(e.amount) : sum),
    0
  )

describe('Bide', () => {
  it('tích 2 lượt (bị ép dùng lại) rồi trả ×2 sát thương đã nhận, không hệ', () => {
    let state = single([fighter('a', ['bide2', 'idle'])], [fighter('e', ['hit'])])
    let taken = 0
    for (let i = 0; i < 2; i++) {
      const turn = submit(state, [skillCmd('bide2')])
      expect(damageTo(turn.log, 'e')).toBe(0)
      taken += damageTo(turn.log, 'a')
      state = turn.state
    }
    // Lượt 3: lệnh khác vẫn bị ép thành Bide; đòn trả đi trước (priority +1).
    const release = submit(state, [skillCmd('idle')])
    expect(damageTo(release.log, 'e')).toBe(taken * 2)
    expect(defined(release.state.battle).volatiles.a?.bide).toBeUndefined()
  })

  it('save giữ lượng tích (Decimal) qua lưu / đọc', () => {
    const state = single([fighter('a', ['bide2'])], [fighter('e', ['hit'])])
    const stored = submit(state, [skillCmd('bide2')]).state
    const loaded = migrateState(JSON.parse(JSON.stringify(serializeState(stored))), data)
    expect(validateGameState(data, loaded)).toEqual([])
    const damage = defined(defined(loaded.battle).volatiles.a?.bide).damage
    expect(damage.gt(0)).toBe(true)
  })

  it('không nhận sát thương nào thì thất bại', () => {
    let state = single([fighter('a', ['bide2'])], [fighter('e', ['idle'])])
    for (let i = 0; i < 2; i++) state = submit(state, [skillCmd('bide2')]).state
    const release = submit(state, [skillCmd('bide2')])
    expect(release.log.some((e) => e.type === 'skillFailed')).toBe(true)
    expect(damageTo(release.log, 'e')).toBe(0)
  })
})

describe('Sky Drop', () => {
  it('nhấc mục tiêu: nó mất lượt và bán vô hình, lượt sau bị đánh xuống', () => {
    const state = single([fighter('a', ['lift'])], [fighter('e', ['hit'])])
    const first = submit(state, [skillCmd('lift')])
    expect(defined(first.state.battle).volatiles.e?.carriedBy).toBe('a')
    expect(first.log.some((e) => e.type === 'useSkill' && e.monsterId === 'e')).toBe(false)
    const second = submit(first.state, [skillCmd('lift')])
    expect(damageTo(second.log, 'e')).toBeGreaterThan(0)
    expect(defined(second.state.battle).volatiles.e?.carriedBy).toBeUndefined()
  })

  it('mục tiêu quá nặng thì thất bại', () => {
    const heavy = fighter('e', ['idle'], { speciesId: 'strongling', baseSpeciesId: 'strongling' })
    const heavyData = createGameData(
      withFixtureText({
        ...raw,
        species: raw.species.map((s) => (s.id === 'strongling' ? { ...s, weightKg: 250 } : s))
      })
    )
    const next = gameReducer(heavyData, single([fighter('a', ['lift'])], [heavy]), {
      type: 'submitTurn',
      commands: [skillCmd('lift')]
    })
    expect(defined(next.battle).volatiles.e?.carriedBy).toBeUndefined()
    expect(defined(next.battle).log.some((e) => e.type === 'skillFailed')).toBe(true)
  })
})

describe('Pursuit', () => {
  it('địch rút về thì bị đánh trước khi rời sân với ×2 sát thương', () => {
    const plain = submit(single([fighter('a', ['chase'])], [fighter('e', ['idle'])]), [
      skillCmd('chase')
    ]).log
    // Phe địch là NPC có dự bị để AI đổi quái được: dùng phe người chơi rút về.
    const state = makeBattleState(
      [fighter('p', ['idle']), fighter('q', ['idle'])],
      [fighter('e', ['chase'])],
      { playerSlots: ['p', null], enemySlots: ['e', null] }
    )
    const switched = submit(state, [{ slot: 0, kind: 'switch', monsterId: 'q' }])
    const hitOnP = damageTo(switched.log, 'p')
    expect(hitOnP).toBeGreaterThan(0)
    expect(damageTo(switched.log, 'q')).toBe(0)
    expect(hitOnP).toBeCloseTo(damageTo(plain, 'e') * 2, -1)
  })

  it('chỉ đánh quái rút về nếu là mục tiêu đã chọn; không thì đánh mục tiêu như thường', () => {
    // AI phe địch nhắm q (sắp gục); p rút về thì không bị Pursuit.
    const weak = fighter('q', ['idle'], {
      genes: toBigStats(uniformStats(20)),
      damageTaken: toBigOf(1)
    })
    const state = makeBattleState(
      [fighter('p', ['idle']), weak, fighter('r', ['idle'])],
      [fighter('e', ['chase'])],
      { playerSlots: ['p', 'q'], enemySlots: ['e', null] }
    )
    const { log } = submit(state, [
      { slot: 0, kind: 'switch', monsterId: 'r' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ])
    expect(damageTo(log, 'p')).toBe(0)
    expect(damageTo(log, 'q')).toBeGreaterThan(0)
  })
})

describe('Pollen Puff', () => {
  it('nhắm đồng đội: hồi 50% max HP, không gây sát thương', () => {
    const ally = fighter('b', ['idle'], { damageTaken: toBigOf(1000) })
    const state = makeBattleState([fighter('a', ['puff']), ally], [fighter('e', ['idle'])])
    const { log } = submit(state, [
      skillCmd('puff', { targetAlly: true }),
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ])
    expect(log.some((e) => e.type === 'heal' && e.monsterId === 'b')).toBe(true)
    expect(damageTo(log, 'b')).toBe(0)
  })

  it('targetAlly với skill không có onAlly là lệnh sai', () => {
    const state = makeBattleState(
      [fighter('a', ['hit']), fighter('b', ['idle'])],
      [fighter('e', ['idle'])]
    )
    expect(() =>
      submit(state, [
        skillCmd('hit', { targetAlly: true }),
        { slot: 1, kind: 'skill', skillId: 'idle' }
      ])
    ).toThrow()
  })
})

describe('Round / Echoed Voice', () => {
  it('Round: đồng đội đang chờ dùng cùng skill đi ngay sau', () => {
    const state = makeBattleState(
      [
        fighter('a', ['chorus'], {
          genes: toBigStats({ ...uniformStats(20), hp: '1e6', speed: 100 })
        }),
        fighter('b', ['chorus'], {
          genes: toBigStats({ ...uniformStats(20), hp: '1e6', speed: 1 })
        })
      ],
      [
        fighter('e', ['idle'], { genes: toBigStats({ ...uniformStats(20), hp: '1e6', speed: 50 }) })
      ],
      { playerSlots: ['a', 'b'], enemySlots: ['e', null] }
    )
    const { log } = submit(state, [
      skillCmd('chorus'),
      { slot: 1, kind: 'skill', skillId: 'chorus', target: 0 }
    ])
    const order = log.filter((e) => e.type === 'useSkill').map((e) => e.monsterId)
    expect(order).toEqual(['a', 'b', 'e'])
  })

  it('Echoed Voice: chuỗi chung cả sân, tăng mỗi lượt liên tiếp có quái dùng', () => {
    let state = single([fighter('a', ['echo'])], [fighter('e', ['echo'])])
    const damage: number[] = []
    for (let i = 0; i < 3; i++) {
      const turn = submit(state, [skillCmd('echo')])
      damage.push(damageTo(turn.log, 'e'))
      state = turn.state
    }
    // Hai quái cùng dùng: lượt 1 power 40 (chuỗi 1), lượt 2 power 80, lượt 3 power 120.
    expect(damage[1]).toBeGreaterThan(damage[0] * 1.5)
    expect(damage[2]).toBeGreaterThan(damage[1])
    expect(defined(state.battle).counters.fieldStreaks?.echo).toMatchObject({ count: 3 })
  })
})

describe('Struggle / không hệ', () => {
  it('không còn skill nào dùng được thì dùng Struggle (mất 25% max HP)', () => {
    const user = fighter('a', ['hit'])
    const state = single([user], [fighter('e', ['idle'])], {
      volatiles: { a: { firstTurn: 1, disabledSkill: { skillId: 'hit', untilTurn: 5 } } }
    })
    const { log, state: next } = submit(state, [skillCmd('hit')])
    expect(log.some((e) => e.type === 'useSkill' && e.skillId === 'flail2')).toBe(true)
    const self = defined(next.party.find((m) => m.id === 'a'))
    expect(self.damageTaken.toNumber()).toBe(getMaxHp(data, user).times(0.25).ceil().toNumber())
  })

  it('đòn không hệ trúng cả hệ miễn nhiễm', () => {
    const immuneData = createGameData(
      withFixtureText({
        ...raw,
        elements: raw.elements.map((e) =>
          e.id === 'normal' ? { ...e, effectiveness: { ...e.effectiveness, grass: 0 } } : e
        )
      })
    )
    const run = (skillId: string): number =>
      damageTo(
        defined(
          gameReducer(immuneData, single([fighter('a', [skillId])], [fighter('e', ['idle'])]), {
            type: 'submitTurn',
            commands: [skillCmd(skillId)]
          }).battle
        ).log,
        'e'
      )
    expect(run('hit')).toBe(0)
    expect(run('flail2')).toBeGreaterThan(0)
  })
})

describe('Leech Seed / miễn chiêu bột', () => {
  it('trạng thái drainsToSource: máu mất cuối lượt hồi cho quái gieo', () => {
    const user = fighter('a', ['seed2'], { damageTaken: toBigOf(1) })
    const { log } = submit(single([user], [fighter('e', ['idle'])]), [skillCmd('seed2')])
    const lost = log.find((e) => e.type === 'statusDamage' && e.monsterId === 'e')
    const healed = log.find((e) => e.type === 'heal' && e.monsterId === 'a')
    expect(lost).toBeDefined()
    expect(healed).toBeDefined()
  })

  it('hệ có immuneMoveFlags miễn skill mang cờ đó', () => {
    const target = fighter('e', ['idle'], { elementIds: ['fire'] })
    const { log, state } = submit(single([fighter('a', ['spore2'])], [target]), [
      skillCmd('spore2')
    ])
    expect(log.some((e) => e.type === 'skillFailed')).toBe(true)
    expect(defined(state.battle).enemies[0]?.statuses).toEqual([])
  })
})

describe('Minimize', () => {
  it('alwaysHitsVsStatusIds: luôn trúng mục tiêu mang trạng thái đánh dấu', () => {
    const tiny = fighter('e', ['idle'], { statuses: [{ statusId: 'tiny', turnsLeft: null }] })
    for (let seed = 1; seed <= 5; seed++) {
      const state = { ...single([fighter('a', ['stompy'])], [tiny]), rng: seed }
      expect(damageTo(submit(state, [skillCmd('stompy')]).log, 'e')).toBeGreaterThan(0)
    }
  })
})

describe('kiểm tra dữ liệu', () => {
  it('bide cần fixedDamage stored; onAlly chỉ cho skill nhắm enemy / self; formOverrides cần thay đổi', () => {
    const issues = dataIssuesAfter((r) => {
      r.skills.push(
        attack('badBide', { bide: { turns: 2 } }),
        attack('badAlly', { target: 'allAllies', category: 'status', power: 0, onAlly: [] }),
        attack('badForm', { formOverrides: [{ speciesIds: ['weakling'] }] })
      )
    }).join('\n')
    expect(issues).toContain('bide cần fixedDamage kiểu stored')
    expect(issues).toContain('onAlly chỉ cho skill nhắm enemy / self')
    expect(issues).toContain('cần ít nhất một trong')
  })
})

function toBigOf(value: number): Decimal {
  return toBigStats({ ...uniformStats(value) }).hp
}
