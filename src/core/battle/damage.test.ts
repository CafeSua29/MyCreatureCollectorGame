import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { computeDamage, elementEffectiveness, type DamageInput } from './damage'
import { createRng } from '../shared'
import { uniformBigStats } from '../monster'
import { makeData, makeMonster, makeRawData, uniformStats } from '../testing'
import type { GameData } from '../model'

const data = makeData()

// Quái mẫu: mọi chỉ số = 30 + 10 × 2 = 50.
// strike (thường, vật lý, power 50), công = thủ = 50: 0,3 × 0,5 × 50 × 1 = 7,5 → 7.
function input(overrides: Partial<DamageInput> = {}, gameData: GameData = data): DamageInput {
  return {
    data: gameData,
    attacker: makeMonster({ id: 'atk' }),
    defender: makeMonster({ id: 'def' }),
    skill: gameData.skills.strike,
    spread: false,
    rng: createRng(1),
    ...overrides
  }
}

function dataWith(edit: (raw: ReturnType<typeof makeRawData>) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(raw)
}

describe('elementEffectiveness', () => {
  it('nhân dồn qua mọi hệ của bên phòng thủ, hệ không khai báo = 1', () => {
    expect(elementEffectiveness(data, 'fire', ['grass'])).toEqual(2)
    expect(elementEffectiveness(data, 'fire', ['grass', 'grass'])).toEqual(4)
    expect(elementEffectiveness(data, 'fire', ['fire'])).toEqual(1)
    expect(elementEffectiveness(data, 'normal', ['ghost'])).toEqual(0)
  })
})

describe('computeDamage', () => {
  it('công thức cơ bản: K × power/100 × công × (công / thủ)', () => {
    expect(computeDamage(input()).damage).toEqual(7)
  })

  it('dùng attack/defense cho skill vật lý, spAttack/spDefense cho skill đặc biệt', () => {
    const attacker = makeMonster({ genes: { ...uniformStats(10), spAttack: 35 } }) // spAttack 100
    expect(computeDamage(input({ attacker })).damage).toEqual(7)
    // blast (lửa, đặc biệt) vào hệ cỏ: 0,15 × 100 × 2 × 2 = 60
    expect(computeDamage(input({ attacker, skill: data.skills.blast })).damage).toEqual(60)
  })

  it('STAB và khắc chế hệ', () => {
    const attacker = makeMonster({
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire']
    }) // mọi chỉ số 80
    // 0,15 × 80 × (80 / 50) × 2 (khắc chế) × 1,5 (STAB) = 57,6
    expect(computeDamage(input({ attacker, skill: data.skills.blast })).damage).toEqual(57)
  })

  it('miễn nhiễm (hệ số 0) thì sát thương 0', () => {
    const result = computeDamage(input({ defender: makeMonster({ elementIds: ['ghost'] }) }))
    expect(result.damage).toEqual(0)
    expect(result.effectiveness).toEqual(0)
  })

  it('bên mạnh gấp 10 lần gây sát thương gấp 100 lần (tỉ lệ, không phải hiệu)', () => {
    const strong = makeMonster({ genes: uniformStats(235) }) // 30 + 470 = 500
    const result = computeDamage(input({ attacker: strong }))
    expect(result.damage).toEqual(750) // 0,15 × 500 × 10
  })

  it('hai quái cùng sức mất cùng tỉ lệ HP mỗi đòn ở mọi level', () => {
    for (const level of [1, 101, 10001]) {
      const attacker = makeMonster({ level })
      const defender = makeMonster({ level })
      const hp = 50 * (1 + (level - 1) * 0.1)
      const ratio = computeDamage(input({ attacker, defender })).damage.toNumber() / hp
      expect(ratio).toBeGreaterThan(0.13)
      expect(ratio).toBeLessThanOrEqual(0.15)
    }
  })

  it('áp bậc trận của cả hai bên', () => {
    expect(computeDamage(input({ attackerStages: { attack: 2 } })).damage).toEqual(30) // 0,15 × 100 × 2
    expect(computeDamage(input({ defenderStages: { defense: 2 } })).damage).toEqual(3) // 7,5 / 2
  })

  it('chí mạng, dao động và spread', () => {
    const crit = dataWith((raw) => (raw.config.battle.critChance = 100))
    const critResult = computeDamage(input({}, crit))
    expect(critResult.critical).toBe(true)
    expect(critResult.damage).toEqual(11) // 7,5 × 1,5

    const low = dataWith((raw) => {
      raw.config.battle.randomMin = 0.5
      raw.config.battle.randomMax = 0.5
    })
    expect(computeDamage(input({}, low)).damage).toEqual(3) // 7,5 × 0,5

    expect(computeDamage(input({ spread: true })).damage).toEqual(5) // 7,5 × 0,75
  })

  it('trait gây sát thương theo race và trait giảm sát thương nhận', () => {
    const slayer = makeMonster({ traits: [{ id: 'bruteSlayer', level: 1 }] })
    const brute = makeMonster({ raceId: 'brute' })
    expect(computeDamage(input({ attacker: slayer, defender: brute })).damage).toEqual(11) // × 1,5
    expect(computeDamage(input({ attacker: slayer })).damage).toEqual(7) // không phải brute

    const skin = makeMonster({ traits: [{ id: 'thickSkin', level: 1 }] })
    expect(computeDamage(input({ defender: skin })).damage).toEqual(3) // × 0,5
    // Trait cấp 2 (tuyến tính): −50% × 1,2 = −60% → 7,5 × 0,4 = 3
    const skin2 = makeMonster({ traits: [{ id: 'thickSkin', level: 2 }] })
    expect(computeDamage(input({ defender: skin2 })).damage).toEqual(3)
    // Cấp 3: −50% × 1,4 = −70% → 7,5 × 0,3 = 2,25 → 2
    const skin3 = makeMonster({ traits: [{ id: 'thickSkin', level: 3 }] })
    expect(computeDamage(input({ defender: skin3 })).damage).toEqual(2)
  })

  it('tối thiểu 1 sát thương khi không miễn nhiễm', () => {
    const wall = makeMonster({ genes: uniformStats(1_000_000) })
    expect(computeDamage(input({ defender: wall })).damage).toEqual(1)
  })

  it('cùng đầu vào cho cùng kết quả, và tiến RNG khi có ngẫu nhiên', () => {
    const random = dataWith((raw) => {
      raw.config.battle.critChance = 50
      raw.config.battle.randomMin = 0.85
    })
    const a = computeDamage(input({ rng: createRng(9) }, random))
    expect(computeDamage(input({ rng: createRng(9) }, random))).toEqual(a)
    expect(a.rng).not.toBe(createRng(9))
  })
})

describe('computeDamage — số cực lớn (Decimal)', () => {
  it('hai quái cùng sức gen 1e1000: cùng tỉ lệ HP mỗi đòn như quái thường', () => {
    const strong = { genes: uniformBigStats('1e1000') }
    const attacker = makeMonster({ id: 'atk', ...strong })
    const defender = makeMonster({ id: 'def', ...strong })
    const { damage } = computeDamage(input({ attacker, defender }))
    // Chỉ số ≈ 2e1000; sát thương = 0,3 × 0,5 × 2e1000 = 3e999 → tỉ lệ 0,15 HP như quái thường.
    expect(damage.isFinite()).toBe(true)
    expect(damage.eq('3e999')).toBe(true)
  })

  it('quái mạnh gấp 10 lần (cùng công / thủ) gây sát thương gấp 100 lần, kể cả số rất lớn', () => {
    const weak = makeMonster({ id: 'w', genes: uniformBigStats('1e500') })
    const strong = makeMonster({ id: 's', genes: uniformBigStats('1e501') })
    const weakHit = computeDamage(input({ attacker: weak, defender: weak })).damage
    const strongHit = computeDamage(input({ attacker: strong, defender: weak })).damage
    expect(strongHit.div(weakHit).toNumber()).toBeCloseTo(100)
  })

  it('đòn yếu vào quái cực trâu vẫn tối thiểu 1 sát thương', () => {
    const tank = makeMonster({ id: 'tank', genes: uniformBigStats('1e1000') })
    expect(computeDamage(input({ defender: tank })).damage).toEqual(1)
  })
})
