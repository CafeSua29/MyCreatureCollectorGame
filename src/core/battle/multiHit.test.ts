import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { createRng, nextInt, toBig, type RngState } from '../shared'
import { gameReducer } from '../game'
import { defined, makeBattleState, makeData, makeMonster, makeRawData } from '../testing'
import { expectedHitCount, rollHitCount } from './multiHit'
import type { BattleEvent, GameData, GameState, Monster, Skill } from '../model'

// Quái mẫu level 1, mọi chỉ số 50: skill power 20 (không STAB) gây 0,3 × 0,2 × 50 = 3 mỗi đòn.
const data = makeData()
const config = data.config.battle

const skillOf = (id: string, gameData: GameData = data): Skill => defined(gameData.skills[id])

/** Tung nhiều lần, đếm số lần ra mỗi số đòn. */
function countHits(skill: Skill, times: number): Record<number, number> {
  const counts: Record<number, number> = {}
  let rng: RngState = createRng(99)
  for (let i = 0; i < times; i++) {
    let hits: number
    ;[hits, rng] = rollHitCount(config, skill, rng)
    counts[hits] = (counts[hits] ?? 0) + 1
  }
  return counts
}

describe('rollHitCount', () => {
  it('skill không có hits: 1 đòn, không tốn RNG', () => {
    const rng = createRng(1)
    expect(rollHitCount(config, skillOf('strike'), rng)).toEqual([1, rng])
  })

  it('số đòn cố định (min = max): không tốn RNG, cả biên 1 và số lớn', () => {
    const rng = createRng(1)
    expect(rollHitCount(config, skillOf('twinFang'), rng)).toEqual([2, rng])
    const one = { ...skillOf('strike'), hits: { min: 1, max: 1 } }
    expect(rollHitCount(config, one, rng)).toEqual([1, rng])
    const many = { ...skillOf('strike'), hits: { min: 1000, max: 1000 } }
    expect(rollHitCount(config, many, rng)).toEqual([1000, rng])
  })

  it('cùng seed cho cùng số đòn', () => {
    const rng = createRng(7)
    expect(rollHitCount(config, skillOf('flurry'), rng)).toEqual(
      rollHitCount(config, skillOf('flurry'), rng)
    )
  })

  it('2–5 theo bảng hitCountWeights (35 / 35 / 15 / 15)', () => {
    const counts = countHits(skillOf('flurry'), 20000)
    expect(Object.keys(counts).map(Number).sort()).toEqual([2, 3, 4, 5])
    expect(counts[2] / 20000).toBeCloseTo(0.35, 1)
    expect(counts[3] / 20000).toBeCloseTo(0.35, 1)
    expect(counts[4] / 20000).toBeCloseTo(0.15, 1)
    expect(counts[5] / 20000).toBeCloseTo(0.15, 1)
  })

  it('khoảng không có trong bảng: chia đều (dùng nextInt)', () => {
    const rng = createRng(5)
    const [expected, after] = nextInt(rng, 2, 4)
    expect(rollHitCount(config, skillOf('barrage'), rng)).toEqual([expected, after])
    const counts = countHits(skillOf('barrage'), 30000)
    for (const hits of [2, 3, 4]) expect(counts[hits] / 30000).toBeCloseTo(1 / 3, 1)
  })
})

describe('số đòn tối thiểu cộng thêm (thuần thục skill)', () => {
  it('tung như cũ (cùng RNG) rồi nâng lên mức tối thiểu mới, không vượt max', () => {
    const rng = createRng(3)
    const [plain, after] = rollHitCount(config, skillOf('flurry'), rng)
    const [raised, afterRaised] = rollHitCount(config, skillOf('flurry'), rng, 1)
    expect(raised).toBe(Math.max(plain, 3))
    expect(afterRaised).toBe(after)
    expect(rollHitCount(config, skillOf('flurry'), rng, 100)[0]).toBe(5)
    // Số đòn cố định và skill một đòn không đổi.
    expect(rollHitCount(config, skillOf('twinFang'), rng, 1)).toEqual([2, rng])
    expect(rollHitCount(config, skillOf('strike'), rng, 1)).toEqual([1, rng])
  })

  it('số đòn kỳ vọng theo đúng phân bố đã nâng', () => {
    // 2–5 theo trọng số 35 / 35 / 15 / 15: 2 thành 3 → (3 × 70 + 4 × 15 + 5 × 15) / 100.
    expect(expectedHitCount(config, skillOf('flurry'), 1)).toBeCloseTo(3.45)
    expect(expectedHitCount(config, skillOf('flurry'))).toBeCloseTo(3.1)
    // 2–4 chia đều: (3 + 3 + 4) / 3.
    expect(expectedHitCount(config, skillOf('barrage'), 1)).toBeCloseTo(10 / 3)
    expect(expectedHitCount(config, skillOf('barrage'))).toBe(3)
    expect(expectedHitCount(config, skillOf('flurry'), 100)).toBe(5)
  })
})

describe('skill đánh nhiều lần trong trận', () => {
  const run = (state: GameState, skillId: string, gameData: GameData = data): GameState =>
    gameReducer(gameData, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
    })

  const ally = (skillId: string, overrides: Parameters<typeof makeMonster>[0] = {}): Monster =>
    makeMonster({ id: 'a', skillIds: [skillId], ...overrides })
  const foe = (overrides: Parameters<typeof makeMonster>[0] = {}): Monster =>
    makeMonster({ id: 'e', skillIds: ['idle'], ...overrides })

  const eventsOf = <T extends BattleEvent['type']>(
    state: GameState,
    type: T
  ): Extract<BattleEvent, { type: T }>[] =>
    (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

  it('mỗi đòn một sự kiện damage, thêm sự kiện tổng số đòn', () => {
    const next = run(makeBattleState([ally('scaleShot')], [foe()]), 'scaleShot')
    const damage = eventsOf(next, 'damage')
    expect(damage.map((e) => e.amount.toNumber())).toEqual([3, 3, 3])
    expect(eventsOf(next, 'hitCount')).toEqual([
      { type: 'hitCount', monsterId: 'a', targetId: 'e', hits: 3 }
    ])
    expect(defined(next.battle).enemies[0].damageTaken.toNumber()).toBe(9)
  })

  it('statStage chạy một lần sau đòn cuối', () => {
    const next = run(makeBattleState([ally('scaleShot')], [foe()]), 'scaleShot')
    expect(eventsOf(next, 'stage')).toEqual([
      { type: 'stage', monsterId: 'a', stat: 'attack', delta: 1 }
    ])
    const log = defined(next.battle).log.map((e) => e.type)
    expect(log.indexOf('stage')).toBeGreaterThan(log.lastIndexOf('damage'))
  })

  it('drain hồi máu theo từng đòn (làm tròn lên mỗi đòn)', () => {
    // Mỗi đòn 3 sát thương, hồi 50% = 1,5 → 2; hai đòn hồi 4.
    const next = run(makeBattleState([ally('twinFang', { damageTaken: 10 })], [foe()]), 'twinFang')
    expect(eventsOf(next, 'heal').map((e) => e.amount.toNumber())).toEqual([2, 2])
    expect(next.party[0].damageTaken.toNumber()).toBe(6)
  })

  it('mục tiêu gục giữa chừng thì dừng, không chuyển sang địch còn lại', () => {
    // Địch e còn 4 HP: đòn 1 còn 1, đòn 2 gục; địch f không bị đánh.
    const state = makeBattleState([ally('scaleShot')], [foe({ damageTaken: 46 }), foe({ id: 'f' })])
    const next = run(state, 'scaleShot')
    expect(eventsOf(next, 'damage').map((e) => e.targetId)).toEqual(['e', 'e'])
    expect(eventsOf(next, 'hitCount')[0].hits).toBe(2)
    expect(defined(next.battle).enemies[1].damageTaken.toNumber()).toBe(0)
  })

  it('trượt thì không có đòn nào, không ghi tổng số đòn', () => {
    const missData = createGameData(
      (() => {
        const raw = makeRawData()
        const shot = defined(raw.skills.find((s) => s.id === 'scaleShot'))
        shot.accuracy = 1
        return raw
      })()
    )
    // Seed 1234 của makeBattleState tung trượt với accuracy 1%.
    const next = run(makeBattleState([ally('scaleShot')], [foe()]), 'scaleShot', missData)
    expect(eventsOf(next, 'miss')).toHaveLength(1)
    expect(eventsOf(next, 'damage')).toEqual([])
    expect(eventsOf(next, 'hitCount')).toEqual([])
    expect(eventsOf(next, 'stage')).toEqual([])
  })

  it('mục tiêu miễn nhiễm: dừng sau đòn đầu (1 sự kiện sát thương 0)', () => {
    const next = run(
      makeBattleState([ally('scaleShot')], [foe({ elementIds: ['ghost'] })]),
      'scaleShot'
    )
    const damage = eventsOf(next, 'damage')
    expect(damage).toHaveLength(1)
    expect(damage[0].amount.toNumber()).toBe(0)
    expect(eventsOf(next, 'hitCount')[0].hits).toBe(1)
  })

  it('sát thương cực lớn: mỗi đòn giới hạn bởi HP còn lại, gục ở đòn đầu', () => {
    const huge = toBig('1e300')
    const next = run(
      makeBattleState(
        [
          ally('scaleShot', {
            genes: { hp: 1, attack: huge, defense: 1, spAttack: 1, spDefense: 1, speed: 1 }
          })
        ],
        [foe()]
      ),
      'scaleShot'
    )
    const damage = eventsOf(next, 'damage')
    expect(damage).toHaveLength(1)
    expect(eventsOf(next, 'faint')).toEqual([{ type: 'faint', monsterId: 'e' }])
    expect(eventsOf(next, 'hitCount')[0].hits).toBe(1)
  })

  it('skill 2–5 đòn: số sự kiện damage bằng số đòn tung được', () => {
    const next = run(makeBattleState([ally('flurry')], [foe()]), 'flurry')
    const hits = eventsOf(next, 'hitCount')[0].hits
    expect(hits).toBeGreaterThanOrEqual(2)
    expect(hits).toBeLessThanOrEqual(5)
    expect(eventsOf(next, 'damage')).toHaveLength(hits)
  })

  it('skill thường không ghi sự kiện tổng số đòn', () => {
    const next = run(makeBattleState([ally('strike')], [foe()]), 'strike')
    expect(eventsOf(next, 'damage')).toHaveLength(1)
    expect(eventsOf(next, 'hitCount')).toEqual([])
  })
})
