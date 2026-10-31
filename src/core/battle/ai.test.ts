// AI trận đấu (mục "AI trận đấu" ở battle.md): chấm điểm (skill, mục tiêu) rồi tung theo trọng số
// = điểm. Test hành vi theo tần suất qua nhiều seed (vẫn tất định) và các trường hợp điểm 0.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { SKILL_EFFECTS } from '../registries'
import { cloneData, createRng, toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeField,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import { chooseAiCommands, suggestBattleCommands } from './ai'
import { expectedDamage } from './damage'
import { expectedHitCount } from './multiHit'
import { cloneDraft } from './draft'
import type { BattleCommand, BattleSide, BattleStages, GameData, Monster } from '../model'

// Quái mẫu level 1, gen 10, hệ cỏ: mọi chỉ số 50, HP 50; strike gây 7,5 sát thương kỳ vọng.
const data = makeData()
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1)

const player = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['strike'], ...overrides })

const wild = (id: string, skillIds: string[], overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds, ...overrides })

interface Scene {
  party: Monster[]
  enemies: Monster[]
  stages?: Record<string, BattleStages>
  side?: BattleSide
  gameData?: GameData
}

function choose(scene: Scene, seed: number): BattleCommand[] {
  const d = cloneDraft(makeBattleState(scene.party, scene.enemies, { stages: scene.stages ?? {} }))
  d.rng = createRng(seed)
  return chooseAiCommands(scene.gameData ?? data, d, scene.side ?? 'enemy')
}

/** Đếm lựa chọn "skillId@ô" của quái ở ô 0 qua nhiều seed. */
function tally(scene: Scene): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const seed of SEEDS) {
    const command = choose(scene, seed)[0]
    if (command.kind !== 'skill') throw new Error('AI chỉ được ra lệnh skill')
    const key = `${command.skillId}@${command.target ?? '-'}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

describe('chooseAiCommands', () => {
  it('ra đúng một lệnh skill cho mỗi quái còn sống trên sân, skill quái đã biết', () => {
    const scene = {
      party: [player('a'), player('b')],
      enemies: [wild('x', ['strike', 'growl']), wild('y', ['blast', 'wave'])]
    }
    const commands = choose(scene, 1)
    expect(commands.map((c) => c.slot)).toEqual([0, 1])
    expect(['strike', 'growl']).toContain(commands[0].kind === 'skill' && commands[0].skillId)
    expect(['blast', 'wave']).toContain(commands[1].kind === 'skill' && commands[1].skillId)
    // Quái gục thì không ra lệnh.
    const fainted = {
      ...scene,
      enemies: [scene.enemies[0], wild('y', ['blast'], { damageTaken: 50 })]
    }
    expect(choose(fainted, 1).map((c) => c.slot)).toEqual([0])
  })

  it('không chọn lựa chọn điểm 0 khi có lựa chọn điểm > 0', () => {
    const counts = tally({ party: [player('a')], enemies: [wild('x', ['strike', 'idle'])] })
    expect(counts).toEqual({ 'strike@0': SEEDS.length })
  })

  it('skill bị miễn nhiễm được 0 điểm', () => {
    const ghost = player('a', { elementIds: ['ghost'] })
    const counts = tally({ party: [ghost], enemies: [wild('x', ['strike', 'blast'])] })
    expect(counts).toEqual({ 'blast@0': SEEDS.length })
  })

  it('tung theo trọng số: skill khắc hệ ra nhiều hơn nhưng skill yếu vẫn có cơ hội', () => {
    // Mục tiêu hệ cỏ: blast (lửa ×2) kỳ vọng 15, strike 7,5.
    const counts = tally({ party: [player('a')], enemies: [wild('x', ['strike', 'blast'])] })
    expect(counts['blast@0']).toBeGreaterThan(defined(counts['strike@0']))
    expect(counts['strike@0']).toBeGreaterThan(0)
  })

  it('ưu tiên địch hạ được ngay và máu thấp, nhưng vẫn có lúc đánh con còn lại', () => {
    const counts = tally({
      party: [player('a'), player('b', { damageTaken: 45 })],
      enemies: [wild('x', ['strike'])]
    })
    expect(counts['strike@1']).toBeGreaterThan(defined(counts['strike@0']) * 3)
    expect(counts['strike@0']).toBeGreaterThan(0)
  })

  it('phối hợp: con trước dự kiến hạ một địch thì con sau không đánh thêm vào địch đó', () => {
    const scene = {
      party: [player('a', { damageTaken: 45 }), player('b')],
      enemies: [wild('x', ['strike']), wild('y', ['strike'])]
    }
    let firstOnLowHp = 0
    for (const seed of SEEDS) {
      const [first, second] = choose(scene, seed)
      if (first.kind !== 'skill' || second.kind !== 'skill') throw new Error('cần lệnh skill')
      if (first.target === 0) {
        firstOnLowHp++
        expect(second.target).toBe(1)
      }
    }
    expect(firstOnLowHp).toBeGreaterThan(0)
  })

  it('buff bản thân có giá trị, hết giá trị khi bậc đã chạm trần', () => {
    const enemies = [wild('x', ['pumpUp', 'idle'])]
    expect(tally({ party: [player('a')], enemies })).toEqual({ 'pumpUp@-': SEEDS.length })
    // Trần +6: cả hai lựa chọn 0 điểm → chọn đều, cả hai đều ra.
    const capped = tally({ party: [player('a')], enemies, stages: { x: { attack: 6 } } })
    expect(Object.keys(capped).sort()).toEqual(['idle@-', 'pumpUp@-'])
    // +5: chỉ còn đổi được 1 bậc nhưng vẫn > 0.
    const almost = tally({ party: [player('a')], enemies, stages: { x: { attack: 5 } } })
    expect(almost).toEqual({ 'pumpUp@-': SEEDS.length })
  })

  it('debuff địch có giá trị, hết giá trị khi địch đã chạm sàn', () => {
    const enemies = [wild('x', ['growl', 'idle'])]
    expect(tally({ party: [player('a')], enemies })).toEqual({ 'growl@-': SEEDS.length })
    const floored = tally({ party: [player('a')], enemies, stages: { a: { attack: -6 } } })
    expect(Object.keys(floored).sort()).toEqual(['growl@-', 'idle@-'])
  })

  it('skill nhắm đồng đội: bỏ khi không có đồng đội, dùng khi có', () => {
    const solo = tally({ party: [player('a')], enemies: [wild('x', ['cheer', 'idle'])] })
    expect(solo).toEqual({ 'idle@-': SEEDS.length })
    const pair = tally({
      party: [player('a')],
      enemies: [wild('x', ['cheer', 'idle']), wild('y', ['strike'])]
    })
    expect(pair).toEqual({ 'cheer@-': SEEDS.length })
  })

  it('không có lựa chọn nào dùng được: vẫn ra skill đầu tiên (lúc xử lý ghi noTarget)', () => {
    const commands = choose({ party: [player('a')], enemies: [wild('x', ['cheer'])] }, 1)
    expect(commands).toEqual([{ slot: 0, kind: 'skill', skillId: 'cheer', target: undefined }])
  })

  it('tất định theo seed và có tiêu RNG', () => {
    const state = makeBattleState([player('a'), player('b')], [wild('x', ['strike', 'blast'])])
    const run = (): [BattleCommand[], number] => {
      const d = cloneDraft(state)
      const commands = chooseAiCommands(data, d, 'enemy')
      return [commands, d.rng]
    }
    const [commands, rngAfter] = run()
    expect(run()).toEqual([commands, rngAfter])
    expect(rngAfter).not.toBe(state.rng)
  })

  it('chọn cho phe người chơi cũng được (side player)', () => {
    const counts = tally({
      party: [wild('a', ['strike', 'idle'])],
      enemies: [player('x')],
      side: 'player'
    })
    expect(counts).toEqual({ 'strike@0': SEEDS.length })
  })

  it('số cực lớn: chỉ số và HP 1e30+ không ra NaN, vẫn chấm điểm đúng', () => {
    const huge = {
      genes: {
        hp: '1e30',
        attack: '1e30',
        defense: '1e30',
        spAttack: '1e30',
        spDefense: '1e30',
        speed: '1e30'
      }
    }
    const scene = {
      party: [player('a', { ...huge, damageTaken: toBig('1e30') })],
      enemies: [wild('x', ['strike', 'idle'], huge)]
    }
    expect(tally(scene)).toEqual({ 'strike@0': SEEDS.length })
  })
})

describe('aiValue của hiệu ứng skill', () => {
  const user = makeMonster({ id: 'u' })
  const target = makeMonster({ id: 't' })
  const base = {
    data,
    user,
    target,
    targetIsAlly: false,
    stages: {},
    expectedDamage: toBig(0),
    field: makeField(),
    side: 'player' as const,
    allies: [user],
    foes: [target],
    allyReserves: [],
    foeReserves: []
  }

  it('drain: theo máu thật hồi được / max HP; đầy máu = 0', () => {
    const drain = { percent: 50 }
    expect(SKILL_EFFECTS.drain.aiValue(drain, { ...base, expectedDamage: toBig(20) })).toBe(0)
    const hurt = makeMonster({ id: 'u', damageTaken: 25 })
    // Hồi 10 / 50 max HP × healWeight 1.
    expect(
      SKILL_EFFECTS.drain.aiValue(drain, { ...base, user: hurt, expectedDamage: toBig(20) })
    ).toBeCloseTo(0.2)
    // Chỉ hồi được phần đã mất (5).
    const scratched = makeMonster({ id: 'u', damageTaken: 5 })
    expect(
      SKILL_EFFECTS.drain.aiValue(drain, { ...base, user: scratched, expectedDamage: toBig(20) })
    ).toBeCloseTo(0.1)
  })

  it('statStage: buff phe mình dương, buff phe địch âm, nhân chance', () => {
    const buffTarget = { who: 'target', stat: 'attack', delta: 2 }
    expect(
      SKILL_EFFECTS.statStage.aiValue(buffTarget, { ...base, targetIsAlly: true })
    ).toBeCloseTo(0.3)
    expect(SKILL_EFFECTS.statStage.aiValue(buffTarget, base)).toBeCloseTo(-0.3)
    const chancy = { who: 'self', stat: 'speed', delta: 1, chance: 50 }
    expect(SKILL_EFFECTS.statStage.aiValue(chancy, base)).toBeCloseTo(0.075)
  })
})

describe('expectedDamage / expectedHitCount', () => {
  const attacker = makeMonster({ id: 'a' })
  const defender = makeMonster({ id: 'd' })
  const input = { data, attacker, defender, spread: false }

  it('kỳ vọng không làm tròn: strike 7,5; khắc hệ ×2; miễn nhiễm và skill status = 0', () => {
    expect(expectedDamage({ ...input, skill: data.skills.strike }).toNumber()).toBe(7.5)
    expect(expectedDamage({ ...input, skill: data.skills.blast }).toNumber()).toBe(15)
    const ghost = makeMonster({ id: 'g', elementIds: ['ghost'] })
    expect(
      expectedDamage({ ...input, defender: ghost, skill: data.skills.strike }).toNumber()
    ).toBe(0)
    expect(expectedDamage({ ...input, skill: data.skills.growl }).toNumber()).toBe(0)
  })

  it('tính chí mạng kỳ vọng và dao động trung bình', () => {
    const raw = makeRawData()
    raw.config.battle = { ...raw.config.battle, critChance: 50, critMultiplier: 2, randomMin: 0.5 }
    const tuned = createGameData(raw)
    // 7,5 × (1 + 0,5 × 1) × 0,75
    const result = expectedDamage({ ...input, data: tuned, skill: tuned.skills.strike })
    expect(result.toNumber()).toBeCloseTo(8.4375)
  })

  it('skill đánh nhiều lần nhân số đòn kỳ vọng; mỗi đòn tối thiểu 1', () => {
    // flurry power 20: 3 mỗi đòn × 3,1 đòn.
    expect(expectedDamage({ ...input, skill: data.skills.flurry }).toNumber()).toBeCloseTo(9.3)
    const wall = makeMonster({
      id: 'w',
      genes: { hp: 10, attack: 10, defense: 1e6, spAttack: 10, spDefense: 10, speed: 10 }
    })
    expect(
      expectedDamage({ ...input, defender: wall, skill: data.skills.twinFang }).toNumber()
    ).toBe(2)
  })

  it('expectedHitCount theo đúng phân bố của rollHitCount', () => {
    const config = data.config.battle
    expect(expectedHitCount(config, data.skills.strike)).toBe(1)
    expect(expectedHitCount(config, data.skills.flurry)).toBeCloseTo(3.1) // 2–5: 35/35/15/15
    expect(expectedHitCount(config, data.skills.barrage)).toBe(3) // 2–4 chia đều
    expect(expectedHitCount(config, data.skills.scaleShot)).toBe(3) // cố định
  })
})

describe('suggestBattleCommands', () => {
  const state = makeBattleState(
    [wild('a', ['strike', 'idle']), wild('b', ['strike', 'idle'])],
    [player('x'), player('y')]
  )

  it('không đổi state, tất định, lệnh hợp lệ cho submitTurn', () => {
    const before = cloneData(state)
    const commands = suggestBattleCommands(data, state)
    expect(state).toEqual(before)
    expect(suggestBattleCommands(data, state)).toEqual(commands)
    expect(commands.map((c) => c.kind === 'skill' && c.skillId)).toEqual(['strike', 'strike'])
    const next = gameReducer(data, state, { type: 'submitTurn', commands })
    expect(defined(next.battle).turn).toBe(2)
  })

  it('báo lỗi khi không trong trận hoặc sai giai đoạn', () => {
    expectActionError(() => suggestBattleCommands(data, { ...state, battle: null }), 'noBattle')
    const ended = { ...state, battle: { ...defined(state.battle), phase: 'ended' as const } }
    expectActionError(() => suggestBattleCommands(data, ended), 'wrongBattlePhase')
  })
})

describe('quái địch dùng AI trong lượt đấu', () => {
  it('quái hoang và boss đều không chọn skill vô ích', () => {
    for (const isBoss of [false, true]) {
      const state = makeBattleState(
        [player('a', { level: 50, exp: 125000, skillIds: ['idle'] })],
        [wild('x', ['strike', 'idle'])],
        {
          isBoss
        }
      )
      for (const seed of SEEDS.slice(0, 30)) {
        const next = gameReducer(
          data,
          { ...state, rng: createRng(seed) },
          {
            type: 'submitTurn',
            commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
          }
        )
        const used = defined(next.battle).log.filter(
          (event) => event.type === 'useSkill' && event.monsterId === 'x'
        )
        expect(used).toEqual([{ type: 'useSkill', monsterId: 'x', skillId: 'strike' }])
      }
    }
  })
})

describe('Illusion lừa AI', () => {
  const raw = makeRawData()
  raw.skills.push({
    id: 'soak2',
    elementId: 'water',
    category: 'special',
    power: 40,
    accuracy: 100,
    priority: 0,
    target: 'enemy',
    effects: []
  })
  const illusionData = createGameData(withFixtureText(raw))
  /** Số lần AI phe người chơi chọn mỗi skill lên địch hệ cỏ (có / không giả làm loài hệ lửa). */
  function picks(illusionSpeciesId?: string): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const seed of SEEDS) {
      const state = makeBattleState(
        [player('a', { skillIds: ['blast', 'soak2'] })],
        [wild('e', ['idle'])]
      )
      const d = cloneDraft(state)
      d.rng = createRng(seed)
      if (illusionSpeciesId) {
        d.battle.volatiles.e = { ...d.battle.volatiles.e, illusionSpeciesId }
      }
      const command = chooseAiCommands(illusionData, d, 'player')[0]
      if (command.kind === 'skill') counts[command.skillId] = (counts[command.skillId] ?? 0) + 1
    }
    return counts
  }

  it('địch giả loài hệ lửa: AI tưởng nước khắc chế, hệ thật (cỏ) bị bỏ qua', () => {
    const honest = picks()
    expect(honest.blast ?? 0).toBeGreaterThan(honest.soak2 ?? 0)
    const fooled = picks('strongling')
    expect(fooled.soak2 ?? 0).toBeGreaterThan(fooled.blast ?? 0)
  })
})
