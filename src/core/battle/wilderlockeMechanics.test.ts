// Cơ chế thêm cho WILDERLOCKE (content-sources-real.md, shiny-boss.md, battle.md): giới hạn lần dùng, kẹp sát
// thương, đổi theo lần dùng, nạp theo lần dùng, bộ đếm mới, lợi thế boss, do thám, xem trước sát thương.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState } from '../game'
import { createGameData } from '../gameData'
import {
  checkAllConditions,
  counterValue,
  type CounterSpec,
  type DslCondition
} from '../registries'
import { toBig } from '../shared'
import { generateTrainerTeam } from '../world'
import {
  dataIssuesAfter,
  defined,
  FIXTURE_TRAINER_ID,
  atFloor,
  fixtureSite,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeSiralimRawData,
  withFixtureText
} from '../testing'
import type { BattleCommand, GameData, GameState, Monster, RawGameData, Skill } from '../model'
import { bossScoutPrice, bossScoutReport, rollBossAdvantages, scoutBoss } from './bossScout'
import { previewSkillDamage } from './damagePreview'
import { withHitsByHp } from './multiHit'
import { getMaxHp } from '../monster'

const skill = (id: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...extra
})

function buildData(skills: Skill[], edit?: (raw: RawGameData) => void): GameData {
  const raw = makeSiralimRawData()
  raw.skills.push(...skills)
  edit?.(raw)
  return createGameData(withFixtureText(raw))
}

const mon = (id: string, skillIds: string[], extra: Partial<Monster> = {}): Monster =>
  makeMonster({ id, skillIds, ...extra })
const command = (skillId: string, target = 0): BattleCommand => ({
  slot: 0,
  kind: 'skill',
  skillId,
  target
})
const damageOn = (state: GameState, id: string): number =>
  defined(defined(state.battle).enemies.find((enemy) => enemy.id === id)).damageTaken.toNumber()

describe('Giới hạn lần dùng (maxUsesPerBattle)', () => {
  const data = buildData([skill('once', { maxUsesPerBattle: 1 }), skill('plain')])

  it('dùng đủ số lần thì skill bị chặn, skill khác vẫn dùng được', () => {
    const start = makeBattleState([mon('a', ['once', 'plain'])], [mon('e', ['idle'])])
    const first = gameReducer(data, start, { type: 'submitTurn', commands: [command('once')] })
    expect(damageOn(first, 'e')).toBeGreaterThan(0)
    const second = gameReducer(data, first, { type: 'submitTurn', commands: [command('once')] })
    expect(damageOn(second, 'e')).toBe(damageOn(first, 'e'))
  })

  it('kiểm tra dữ liệu: số lần < 1 và kẹp ngoài 0–100 bị báo lỗi', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.skills.push(skill('badUses', { maxUsesPerBattle: 0 }))
      raw.skills.push(skill('badCap', { damageCapPercent: 150 }))
      raw.skills.push(skill('badAlt', { alternateUse: {} }))
    }).join('\n')
    expect(issues).toContain('maxUsesPerBattle')
    expect(issues).toContain('damageCapPercent')
    expect(issues).toContain('alternateUse')
  })
})

describe('Kẹp sát thương theo % max HP', () => {
  const data = buildData([
    skill('floored', { power: 1, damageFloorPercent: 50 }),
    skill('capped', { power: 250, damageCapPercent: 1 }),
    skill('fixedPercent', { fixedDamage: { kind: 'maxHpPercent', percent: 16 } })
  ])
  const hpOf = (state: GameState): number =>
    previewSkillDamage(data, state, {
      userId: 'a',
      skillId: 'fixedPercent',
      targetId: 'e'
    }).min.toNumber()

  it('sàn và trần áp theo max HP mục tiêu, cả với chỉ số cực lớn', () => {
    const big = mon('e', ['idle'], { level: 1000 })
    const state = makeBattleState([mon('a', ['floored', 'capped', 'fixedPercent'])], [big])
    const percent16 = hpOf(state)
    expect(percent16).toBeGreaterThan(0)
    const floor = previewSkillDamage(data, state, {
      userId: 'a',
      skillId: 'floored',
      targetId: 'e'
    })
    expect(floor.min.toNumber()).toBeGreaterThanOrEqual(Math.floor((percent16 / 16) * 50))
    const cap = previewSkillDamage(data, state, { userId: 'a', skillId: 'capped', targetId: 'e' })
    expect(cap.max.toNumber()).toBeLessThanOrEqual(Math.ceil(percent16 / 16))
  })
})

describe('Đổi theo lần dùng và nạp theo lần dùng', () => {
  const data = buildData([
    skill('alternating', { alternateUse: { category: 'special' } }),
    skill('chargeFirst', { charge: { rule: 'firstUse' } }),
    skill('chargeLater', { charge: { rule: 'afterFirstUse' } })
  ])
  const hit = (state: GameState, id: string): GameState =>
    gameReducer(data, state, { type: 'submitTurn', commands: [command(id)] })

  it('firstUse: lần đầu nạp, lần sau đánh ngay', () => {
    const start = makeBattleState([mon('a', ['chargeFirst'])], [mon('e', ['idle'])])
    const charged = hit(start, 'chargeFirst')
    expect(damageOn(charged, 'e')).toBe(0)
    const fired = hit(charged, 'chargeFirst')
    expect(damageOn(fired, 'e')).toBeGreaterThan(0)
    const again = hit(fired, 'chargeFirst')
    expect(damageOn(again, 'e')).toBeGreaterThan(damageOn(fired, 'e'))
  })

  it('afterFirstUse: lần đầu đánh ngay, lần sau phải nạp', () => {
    const start = makeBattleState([mon('a', ['chargeLater'])], [mon('e', ['idle'])])
    const first = hit(start, 'chargeLater')
    expect(damageOn(first, 'e')).toBeGreaterThan(0)
    const second = hit(first, 'chargeLater')
    expect(damageOn(second, 'e')).toBe(damageOn(first, 'e'))
  })

  it('alternateUse: bản ghi đếm đúng theo skill gốc qua các lần dùng', () => {
    const start = makeBattleState([mon('a', ['alternating'])], [mon('e', ['idle'])])
    const once = hit(start, 'alternating')
    const twice = hit(once, 'alternating')
    expect(defined(twice.battle).records.a.skillUses?.alternating).toBe(2)
    expect(defined(twice.battle).records.a.lastSkillCategory).toBe('special')
  })
})

describe('Bộ đếm và điều kiện mới', () => {
  const data = buildData([
    skill('fireHit', { elementId: 'fire' }),
    skill('fireTwo', { elementId: 'fire' }),
    skill('plain')
  ])
  const view = (monster: Monster, target?: Monster): unknown => ({
    data,
    self: monster,
    selfCtx: { record: { elementUses: { fire: 3 }, skillTargetUses: { 'plain|e': 2 } } },
    ...(target ? { target } : {}),
    skill: data.skills.plain
  })
  const count = (spec: CounterSpec, monster: Monster, target?: Monster): number =>
    counterValue(view(monster, target) as never, spec)

  it('đếm skill đã biết theo hệ, skill đã dùng theo hệ, theo mục tiêu', () => {
    const a = mon('a', ['fireHit', 'fireTwo', 'plain'])
    const e = mon('e', ['idle'])
    expect(count({ of: 'knownSkillsOfElement', elementIds: ['fire'] }, a)).toBe(2)
    expect(count({ of: 'skillUsesOfElement', elementIds: ['fire'] }, a)).toBe(3)
    expect(count({ of: 'skillUsesOnTarget' }, a, e)).toBe(2)
    expect(count({ of: 'skillUsesOnTarget' }, a)).toBe(0)
  })

  it('counterMultipleOf: đúng bội số, không tính 0', () => {
    const a = mon('a', ['plain'])
    const of3 = (bonus: number): DslCondition => ({
      if: 'counterMultipleOf',
      counter: { of: 'skillUsesOfElement', elementIds: ['fire'], bonus },
      every: 3
    })
    expect(checkAllConditions(view(a) as never, [of3(0)])).toBe(true)
    expect(checkAllConditions(view(a) as never, [of3(1)])).toBe(false)
    const zero: DslCondition = {
      if: 'counterMultipleOf',
      counter: { of: 'skillUsesOfElement', elementIds: ['water'] },
      every: 3
    }
    expect(checkAllConditions(view(a) as never, [zero])).toBe(false)
  })
})

describe('Lợi thế boss và do thám', () => {
  const data = buildData([], (raw) => {
    raw.traits.push(
      { id: 'advA', kind: 'boss', hooks: [{ type: 'regen', params: { percent: 3 } }] },
      { id: 'advB', kind: 'boss', hooks: [{ type: 'regen', params: { percent: 4 } }] }
    )
    raw.config.boss.advantages = {
      randomChance: 100,
      countWeights: [1, 1, 1],
      entries: [
        { traitId: 'advA', weight: 1 },
        { traitId: 'advB', weight: 1 }
      ]
    }
    raw.config.boss.scoutPricePerFloor = 100
  })
  const onFloor = (money: number): GameState => {
    const base = makeBattleState([mon('a', ['strike'])], [mon('e', ['idle'])])
    return {
      ...base,
      battle: null,
      money: toBig(money),
      location: { type: 'floor', floor: 1 },
      scoutedBosses: []
    } as GameState
  }

  it('tung ngẫu nhiên: số lợi thế theo trọng số, không trùng, tất định theo seed, ra đủ mọi tổ hợp', () => {
    const seen = new Set<string>()
    let rng = onFloor(0).rng
    for (let i = 0; i < 200; i++) {
      let ids: string[]
      ;[ids, rng] = rollBossAdvantages(data, rng)
      expect(ids.length).toBeGreaterThanOrEqual(1)
      expect(ids.length).toBeLessThanOrEqual(2)
      expect(new Set(ids).size).toBe(ids.length)
      seen.add([...ids].sort().join('+'))
    }
    expect([...seen].sort()).toEqual(['advA', 'advA+advB', 'advB'])
    const start = onFloor(0).rng
    expect(rollBossAdvantages(data, start)).toEqual(rollBossAdvantages(data, start))
  })

  it('không có cấu hình thì không tốn RNG; tỉ lệ 0 thì không có lợi thế', () => {
    const rng = onFloor(0).rng
    expect(rollBossAdvantages(buildData([]), rng)).toEqual([[], rng])
    const never = buildData([], (raw) => {
      raw.traits.push({
        id: 'advA',
        kind: 'boss',
        hooks: [{ type: 'regen', params: { percent: 3 } }]
      })
      raw.config.boss.advantages = {
        randomChance: 0,
        countWeights: [1],
        entries: [{ traitId: 'advA', weight: 1 }]
      }
    })
    expect(rollBossAdvantages(never, rng)[0]).toEqual([])
  })

  it('do thám trừ tiền đúng một lần và mở báo cáo', () => {
    const state = onFloor(1000)
    expect(bossScoutReport(data, state)).toBeUndefined()
    const scouted = scoutBoss(data, state)
    expect(scouted.money.toNumber()).toBe(1000 - bossScoutPrice(data, 1).toNumber())
    const report = defined(bossScoutReport(data, scouted))
    expect(report.floor).toBe(1)
    expect(report.advantageTraitIds.length).toBeGreaterThan(0)
    expect(report.advantageTraitIds.every((id) => ['advA', 'advB'].includes(id))).toBe(true)
    expect(scoutBoss(data, scouted)).toBe(scouted)
  })

  it('thiếu tiền, đang trong trận, không ở tầng thì báo lỗi, state giữ nguyên', () => {
    expect(() => scoutBoss(data, onFloor(0))).toThrow()
    const inBattle = makeBattleState([mon('a', ['strike'])], [mon('e', ['idle'])])
    expect(() => scoutBoss(data, inBattle)).toThrow()
    expect(() =>
      scoutBoss(data, { ...onFloor(1000), location: { type: 'town' } } as GameState)
    ).toThrow()
  })

  it('giá do thám không tràn số ở tầng cực cao', () => {
    expect(bossScoutPrice(data, 1e300).isFinite()).toBe(true)
  })

  it('kiểm tra dữ liệu: lợi thế phải là trait kind boss', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.boss.advantages = {
        randomChance: 50,
        countWeights: [0],
        entries: [{ traitId: 'nope', weight: 1 }]
      }
    }).join('\n')
    expect(issues).toContain('boss.advantages')
    expect(issues).toContain('countWeights')
  })

  it('save cũ bỏ danh sách tầng cũ, thêm danh sách do thám rỗng', () => {
    const legacy = { ...onFloor(1000), version: 105, scoutedBossFloors: [1, 2] } as Record<
      string,
      unknown
    >
    delete legacy.scoutedBosses
    const migrated = migrateState(legacy, data)
    expect(migrated.scoutedBosses).toEqual([])
    expect('scoutedBossFloors' in migrated).toBe(false)
  })
})

describe('Xem trước sát thương', () => {
  const data = buildData([
    skill('multi', { hits: { min: 2, max: 3 } }),
    skill('statusOnly', { power: 0, category: 'status' })
  ])

  it('cho khoảng min ≤ max ≤ chí mạng, nhân số đòn, không đổi state', () => {
    const state = makeBattleState([mon('a', ['multi', 'statusOnly'])], [mon('e', ['idle'])])
    const before = JSON.stringify(state.rng)
    const preview = previewSkillDamage(data, state, {
      userId: 'a',
      skillId: 'multi',
      targetId: 'e'
    })
    expect(preview.min.gt(0)).toBe(true)
    expect(preview.max.gte(preview.min)).toBe(true)
    expect(preview.critMax.gte(preview.max.div(3).floor())).toBe(true)
    expect(preview.hitPercent).toBeGreaterThan(0)
    expect(JSON.stringify(state.rng)).toBe(before)
  })

  it('skill trạng thái cho 0; ngoài trận và skill lạ báo lỗi', () => {
    const state = makeBattleState([mon('a', ['statusOnly'])], [mon('e', ['idle'])])
    const none = previewSkillDamage(data, state, {
      userId: 'a',
      skillId: 'statusOnly',
      targetId: 'e'
    })
    expect(none.max.toNumber()).toBe(0)
    expect(none.knocksOutAtMax).toBe(false)
    expect(() =>
      previewSkillDamage(
        data,
        { ...state, battle: null },
        { userId: 'a', skillId: 'statusOnly', targetId: 'e' }
      )
    ).toThrow()
    expect(() =>
      previewSkillDamage(data, state, { userId: 'a', skillId: 'noSuch', targetId: 'e' })
    ).toThrow()
  })
})

describe('Lợi thế boss trong trận', () => {
  const data = buildData([], (raw) => {
    raw.traits.push({
      id: 'advA',
      kind: 'boss',
      hooks: [{ type: 'regen', params: { percent: 3 } }]
    })
    raw.config.boss.advantages = {
      randomChance: 100,
      countWeights: [1],
      entries: [{ traitId: 'advA', weight: 1 }]
    }
  })
  const start = (gameData: GameData): GameState =>
    gameReducer(
      gameData,
      atFloor(makeGameState({ seed: 7, party: [mon('a', ['strike'])], nextMonsterId: 10 }), 1),
      { type: 'challengeBoss' }
    )

  it('boss tầng nhận lợi thế làm trait tạm, không thành trait thật của quái', () => {
    const battle = defined(start(data).battle)
    const boss = battle.enemies[0]
    expect(battle.volatiles[boss.id]?.gainedTraits?.map((t) => t.id)).toEqual(['advA'])
    expect(boss.traits.map((t) => t.id)).not.toContain('advA')
  })

  it('không cấu hình thì boss không có lợi thế', () => {
    const battle = defined(start(buildData([])).battle)
    expect(battle.volatiles[battle.enemies[0].id]?.gainedTraits ?? []).toEqual([])
  })
})

describe('Do thám rồi đánh boss tầng', () => {
  const data = buildData([], (raw) => {
    for (const id of ['advA', 'advB', 'advC']) {
      raw.traits.push({ id, kind: 'boss', hooks: [{ type: 'regen', params: { percent: 3 } }] })
    }
    raw.config.boss.advantages = {
      randomChance: 100,
      countWeights: [1, 1, 1],
      entries: ['advA', 'advB', 'advC'].map((traitId) => ({ traitId, weight: 1 }))
    }
  })

  it('trận dùng lợi thế đã do thám rồi bỏ khỏi danh sách', () => {
    const base = makeGameState({ seed: 7, party: [mon('a', ['strike'])], nextMonsterId: 10 })
    const scouted = scoutBoss(data, atFloor({ ...base, money: toBig(1e9) }, 1))
    const expected = defined(bossScoutReport(data, scouted)).advantageTraitIds
    const fought = gameReducer(data, scouted, { type: 'challengeBoss' })
    const battle = defined(fought.battle)
    expect(battle.volatiles[battle.enemies[0].id]?.gainedTraits?.map((t) => t.id)).toEqual(expected)
    expect(fought.scoutedBosses).toEqual([])
  })
})

describe('Đội cố định của lớp NPC', () => {
  const data = buildData([], (raw) => {
    const trainer = defined(raw.trainers.find((t) => t.id === FIXTURE_TRAINER_ID))
    const speciesId = raw.species.find((s) => s.kind === 'normal')?.id ?? ''
    trainer.fixedTeams = [
      [
        { speciesId, skillIds: ['strike'] },
        { speciesId, skillIds: ['idle'] }
      ]
    ]
  })
  const spec = (elementIds?: string[]): Parameters<typeof generateTrainerTeam>[2] => ({
    site: fixtureSite(data, 3),
    trainerClass: data.trainers[FIXTURE_TRAINER_ID],
    realm: 1,
    extraLevels: 0,
    nextMonsterId: 10,
    nextItemId: 1,
    ...(elementIds ? { elementIds } : {})
  })

  it('sinh đúng loài và skill của đội, không phụ thuộc số ô tung được', () => {
    const team = generateTrainerTeam(data, 7, spec())
    expect(team.enemies.map((m) => m.skillIds)).toEqual([['strike'], ['idle']])
  })

  it('kiểm tra dữ liệu: loài / skill lạ, đội rỗng bị báo lỗi', () => {
    const issues = dataIssuesAfter((raw) => {
      const trainer = defined(raw.trainers.find((t) => t.id === FIXTURE_TRAINER_ID))
      trainer.fixedTeams = [[{ speciesId: 'noSpecies', skillIds: ['noSkill'] }], []]
    }).join(' | ')
    expect(issues).toContain('noSpecies')
    expect(issues).toContain('noSkill')
    expect(issues).toContain('đội rỗng')
  })
})

describe('Số đòn theo máu, rút về có điều kiện, hiệu ứng cho quái vào thay, đối diện', () => {
  const data = buildData([
    skill('pummelLike', {
      power: 20,
      hitsByHp: [
        { atOrBelowPercent: 25, hits: 4 },
        { atOrBelowPercent: 50, hits: 3 },
        { atOrBelowPercent: 75, hits: 2 }
      ]
    }),
    skill('grassFlip', {
      elementId: 'grass',
      effects: [{ type: 'switchOut', params: { onlyIfResisted: true } }]
    }),
    skill('magnetLike', {
      category: 'status',
      power: 0,
      target: 'self',
      effects: [
        {
          type: 'switchOut',
          params: { incomingEffects: [{ do: 'stage', to: 'self', stats: ['spAttack'], delta: 2 }] }
        }
      ]
    }),
    skill('hornLike', {
      spell: { powerBonus: [{ percent: 50, when: [{ if: 'facing', who: 'target' }] }] }
    })
  ])
  const hitsOf = (state: GameState): number[] =>
    defined(state.battle).log.flatMap((e) => (e.type === 'hitCount' ? [e.hits] : []))

  it('withHitsByHp chọn mốc thấp nhất khớp, trên mọi mốc thì 1 đòn; skill khác giữ nguyên', () => {
    const pummel = data.skills.pummelLike
    expect(withHitsByHp(pummel, 100).hits).toEqual({ min: 1, max: 1 })
    expect(withHitsByHp(pummel, 75).hits).toEqual({ min: 2, max: 2 })
    expect(withHitsByHp(pummel, 50).hits).toEqual({ min: 3, max: 3 })
    expect(withHitsByHp(pummel, 0.001).hits).toEqual({ min: 4, max: 4 })
    expect(withHitsByHp(data.skills.hornLike, 1)).toBe(data.skills.hornLike)
  })

  it('máu thấp thì đánh nhiều đòn hơn trong trận', () => {
    const fresh = mon('a', ['pummelLike'])
    const maxHp = getMaxHp(data, fresh)
    const hurt = { ...fresh, damageTaken: maxHp.times(0.8).floor() }
    const full = gameReducer(data, makeBattleState([fresh], [mon('e', ['idle'])]), {
      type: 'submitTurn',
      commands: [command('pummelLike')]
    })
    const low = gameReducer(data, makeBattleState([hurt], [mon('e', ['idle'])]), {
      type: 'submitTurn',
      commands: [command('pummelLike')]
    })
    expect(hitsOf(full)).toEqual([1])
    expect(hitsOf(low)).toEqual([4])
    expect(data.skills.pummelLike.hits).toBeUndefined()
  })

  it('rút về chỉ khi bị kháng', () => {
    const party = [mon('a', ['grassFlip']), mon('b', ['idle']), mon('c', ['idle'])]
    const resisted = gameReducer(
      data,
      makeBattleState(party, [mon('e', ['idle'], { elementIds: ['fire'] })]),
      {
        type: 'submitTurn',
        commands: [command('grassFlip'), { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }]
      }
    )
    expect(defined(resisted.battle).playerSlots[0]).toBe('c')
    const neutral = gameReducer(data, makeBattleState(party, [mon('e', ['idle'])]), {
      type: 'submitTurn',
      commands: [command('grassFlip'), { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }]
    })
    expect(defined(neutral.battle).playerSlots[0]).toBe('a')
  })

  it('quái vào thay nhận hiệu ứng; không có dự bị thì ở lại, không lỗi', () => {
    const party = [mon('a', ['magnetLike']), mon('b', ['idle']), mon('c', ['idle'])]
    const after = gameReducer(data, makeBattleState(party, [mon('e', ['idle'])]), {
      type: 'submitTurn',
      commands: [command('magnetLike'), { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }]
    })
    const battle = defined(after.battle)
    expect(battle.playerSlots[0]).toBe('c')
    expect(battle.stages.c?.spAttack).toBe(2)
    const alone = gameReducer(
      data,
      makeBattleState([mon('a', ['magnetLike'])], [mon('e', ['idle'])]),
      { type: 'submitTurn', commands: [command('magnetLike')] }
    )
    expect(defined(alone.battle).playerSlots[0]).toBe('a')
  })

  it('kiểm tra dữ liệu: onlyIfResisted sai kiểu, hiệu ứng lạ, mốc số đòn sai bị báo lỗi', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.skills.push(
        skill('badSwitch', {
          effects: [
            {
              type: 'switchOut',
              params: { onlyIfResisted: false, incomingEffects: [{ do: 'nope' }] }
            }
          ]
        }),
        skill('badHits', { hitsByHp: [{ atOrBelowPercent: 120, hits: 0 }] })
      )
    }).join(' | ')
    expect(issues).toContain('onlyIfResisted')
    expect(issues).toContain('incomingEffects')
    expect(issues).toContain('hitsByHp')
  })

  it('đòn vào quái đứng đối diện mạnh hơn quái ô kia', () => {
    const state = makeBattleState(
      [mon('a', ['hornLike'])],
      [mon('e', ['idle']), mon('f', ['idle'])]
    )
    const facing = previewSkillDamage(data, state, {
      userId: 'a',
      skillId: 'hornLike',
      targetId: 'e'
    })
    const other = previewSkillDamage(data, state, {
      userId: 'a',
      skillId: 'hornLike',
      targetId: 'f'
    })
    expect(facing.min.gt(other.max)).toBe(true)
  })
})

describe('Lượng theo `other` ở sự kiện không có bên kia', () => {
  const data = buildData([skill('plain')], (raw) => {
    raw.traits.push({
      id: 'endTurnFoeHit',
      kind: 'positive',
      hooks: [
        {
          type: 'trigger',
          params: {
            on: 'turnEnd',
            scope: 'self',
            effects: [{ do: 'damage', to: 'foes', amount: { hp: 'max', of: 'other', percent: 10 } }]
          }
        }
      ]
    })
  })

  it('cuối lượt không có bên kia: tính theo từng mục tiêu, không mất tác dụng', () => {
    const start = makeBattleState(
      [mon('a', ['idle'], { traits: [{ id: 'endTurnFoeHit', level: 1 }] })],
      [mon('e', ['idle'])]
    )
    const after = gameReducer(data, start, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'idle', target: 0 }]
    })
    const enemy = defined(defined(after.battle).enemies.find((m) => m.id === 'e'))
    expect(enemy.damageTaken.toNumber()).toBeCloseTo(getMaxHp(data, enemy).toNumber() * 0.1, 0)
  })
})
