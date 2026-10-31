import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { fuseMonsters, makeOffspring } from '../progression'
import { BIG_ONE, createRng } from '../shared'
import { generateFloorBoss, rollMonster } from '../world'
import {
  fixtureSite,
  makeBloodlineData,
  makeBloodlineRawData,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { BloodlinePurity, GameData, Monster, RawGameData } from '../model'
import {
  applyPurityGains,
  bossKillPurityGains,
  fuseBloodlines,
  rollAncestorBirth,
  rollChildBloodlines,
  rollWildBloodlines,
  validateBloodlines
} from './bloodline'
import { validateMonster } from './validateMonster'

const data = makeBloodlineData()

/** Dữ liệu huyết mạch với config.bloodline chỉnh lại. */
function withConfig(edit: (config: RawGameData['config']['bloodline']) => void): GameData {
  const raw = makeBloodlineRawData()
  edit(raw.config.bloodline)
  return createGameData(raw)
}

const nymph = (bloodlines: BloodlinePurity[], overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    speciesId: 'nymph',
    baseSpeciesId: 'nymph',
    elementIds: ['grass'],
    bloodlines,
    ...overrides
  })

describe('quái hoang', () => {
  it('mỗi nhóm của loài tung độ thuần theo trọng số; tất định theo seed', () => {
    const fixed = withConfig((config) => {
      config.wildPurityWeights = [{ min: 12, max: 12, weight: 1 }]
    })
    expect(rollWildBloodlines(fixed, createRng(1), 'nymph')[0]).toEqual([
      { groupId: 'wyrm', purity: 12 },
      { groupId: 'stone', purity: 12 }
    ])
    expect(rollWildBloodlines(data, createRng(5), 'nymph')).toEqual(
      rollWildBloodlines(data, createRng(5), 'nymph')
    )
  })

  it('độ thuần 0 không ghi; loài không thuộc nhóm không tốn RNG', () => {
    const zero = withConfig((config) => {
      config.wildPurityWeights = [{ min: 0, max: 0, weight: 1 }]
    })
    expect(rollWildBloodlines(zero, createRng(1), 'nymph')[0]).toEqual([])
    const rng = createRng(3)
    expect(rollWildBloodlines(data, rng, 'weakling')).toEqual([[], rng])
  })

  it('rollMonster có huyết mạch hợp lệ; boss cộng bossPurityBonus', () => {
    const fixed = withConfig((config) => {
      config.wildPurityWeights = [{ min: 90, max: 90, weight: 1 }]
    })
    const [wild] = rollMonster(
      fixed,
      createRng(2),
      {
        encounters: [{ speciesId: 'pebble', weight: 1 }],
        levelMin: 5,
        levelMax: 5,
        geneMultiplier: BIG_ONE,
        shinyChance: 0,
        aging: false
      },
      'm9'
    )
    expect(wild.bloodlines).toEqual([{ groupId: 'stone', purity: 90 }])
    expect(validateMonster(fixed, wild)).toEqual([])

    const raw = makeBloodlineRawData()
    raw.config.bloodline.wildPurityWeights = [{ min: 90, max: 90, weight: 1 }]
    raw.biomes[0].floorBossSpeciesId = 'pebble'
    raw.biomes[0].bosses = [...raw.biomes[0].bosses, { speciesId: 'pebble', drops: [] }]
    const bossData = createGameData(raw)
    const [boss] = generateFloorBoss(bossData, createRng(4), fixtureSite(bossData, 1), 'm9')
    // 90 + 20, kẹp 100.
    expect(boss.bloodlines).toEqual([{ groupId: 'stone', purity: 100 }])
  })
})

describe('breeding', () => {
  const father = nymph([{ groupId: 'wyrm', purity: 40 }], { id: 'f', gender: 'male' })
  const mother = nymph(
    [
      { groupId: 'wyrm', purity: 20 },
      { groupId: 'stone', purity: 9 }
    ],
    { id: 'm', gender: 'female' }
  )

  it('trung bình bố mẹ ± độ lệch nguyên, nhóm cả hai 0 thì không có', () => {
    const exact = withConfig((config) => {
      config.breedDownPoints = 0
      config.breedUpPoints = 0
      config.atavismMutationChance = 0
    })
    const [child] = rollChildBloodlines(exact, createRng(1), { speciesId: 'nymph', father, mother })
    expect(child).toEqual([
      { groupId: 'wyrm', purity: 30 },
      { groupId: 'stone', purity: 4.5 }
    ])
    const [none] = rollChildBloodlines(exact, createRng(1), {
      speciesId: 'nymph',
      father: nymph([]),
      mother: nymph([])
    })
    expect(none).toEqual([])
    for (let seed = 1; seed <= 30; seed++) {
      const [rolled] = rollChildBloodlines(data, createRng(seed), {
        speciesId: 'nymph',
        father,
        mother
      })
      const wyrm = rolled.find((entry) => entry.groupId === 'wyrm')?.purity ?? 0
      // 30 − 5 .. 30 + 8, hoặc +30 nếu đột biến.
      expect(wyrm >= 25 && (wyrm <= 38 || wyrm >= 55)).toBe(true)
    }
  })

  it('đột biến phản tổ cộng vào huyết mạch chính, kẹp 100', () => {
    const always = withConfig((config) => {
      config.breedDownPoints = 0
      config.breedUpPoints = 0
      config.atavismMutationChance = 100
    })
    const [child] = rollChildBloodlines(always, createRng(1), {
      speciesId: 'nymph',
      father: nymph([{ groupId: 'wyrm', purity: 90 }]),
      mother: nymph([{ groupId: 'wyrm', purity: 90 }])
    })
    expect(child).toEqual([{ groupId: 'wyrm', purity: 100 }])
  })

  it('sinh loài tổ khi mẹ đủ độ thuần; mẹ fuse / thiếu độ thuần thì không, không tốn RNG', () => {
    const always = withConfig((config) => {
      config.ancestorBirthChance = 100
    })
    const strong = nymph([{ groupId: 'wyrm', purity: 50 }], { gender: 'female' })
    expect(rollAncestorBirth(always, createRng(1), strong)[0]).toBe('elderWyrm')
    const rng = createRng(1)
    expect(rollAncestorBirth(always, rng, nymph([{ groupId: 'wyrm', purity: 49.9 }]))).toEqual([
      undefined,
      rng
    ])
    const [child] = makeOffspring(
      always,
      createRng(7),
      nymph([], { id: 'f', gender: 'male' }),
      strong,
      'm9'
    )
    expect(child.speciesId).toBe('elderWyrm')
    expect(child.raceId).toBe('neutral')
    expect(child.elementIds).toEqual(['fire'])
    // Loài tổ không thuộc nhóm của chính nó.
    expect(child.bloodlines).toEqual([])
    expect(validateMonster(always, child)).toEqual([])
  })
})

describe('fuse', () => {
  it('quái gốc nhận 50% độ thuần quái phụ ở nhóm mình thuộc; nhóm khác mất', () => {
    const base = makeMonster({
      id: 'base',
      speciesId: 'pebble',
      baseSpeciesId: 'pebble',
      elementIds: ['normal'],
      gender: 'none',
      bloodlines: [{ groupId: 'stone', purity: 10 }]
    })
    const sub = nymph(
      [
        { groupId: 'wyrm', purity: 80 },
        { groupId: 'stone', purity: 15 }
      ],
      { id: 'sub' }
    )
    expect(fuseBloodlines(data, base, sub)).toEqual([{ groupId: 'stone', purity: 17.5 }])
    const [fused] = fuseMonsters(data, createRng(1), base, sub)
    expect(fused.bloodlines).toEqual([{ groupId: 'stone', purity: 17.5 }])
  })
})

describe('thắng trận boss', () => {
  it('địch cùng nhóm +bossKillPurity, địch là loài tổ +ancestorKillPurity (lấy mức cao hơn)', () => {
    const pebbleBoss = makeMonster({ speciesId: 'pebble', baseSpeciesId: 'pebble', gender: 'none' })
    const titan = makeMonster({
      speciesId: 'titanStone',
      baseSpeciesId: 'titanStone',
      gender: 'none'
    })
    expect([...bossKillPurityGains(data, [pebbleBoss])]).toEqual([['stone', 1]])
    expect([...bossKillPurityGains(data, [pebbleBoss, titan])]).toEqual([['stone', 3]])
    const gained = applyPurityGains(data, nymph([]), new Map([['stone', 3]]))
    expect(gained.bloodlines).toEqual([{ groupId: 'stone', purity: 3 }])
    const weakling = makeMonster()
    expect(applyPurityGains(data, weakling, new Map([['stone', 3]]))).toBe(weakling)
  })
})

describe('validateBloodlines', () => {
  it('hợp lệ / sai nhóm / sai độ thuần / lặp, sai thứ tự / trường lạ', () => {
    expect(validateBloodlines(data, nymph([{ groupId: 'wyrm', purity: 0.1 }]), 'b')).toEqual([])
    const issues = (bloodlines: unknown): string[] =>
      validateBloodlines(data, nymph(bloodlines as BloodlinePurity[]), 'b')
    expect(issues('x')).toEqual(['b phải là danh sách'])
    expect(issues([{ groupId: 'nope', purity: 1 }])).toEqual([
      'b[0]: loài "nymph" không thuộc nhóm "nope"'
    ])
    expect(issues([{ groupId: 'wyrm', purity: 0 }])).toEqual([
      'b[0].purity phải trong (0, 100], tối đa 1 chữ số thập phân'
    ])
    expect(issues([{ groupId: 'wyrm', purity: 1.25 }])).toHaveLength(1)
    expect(
      issues([
        { groupId: 'stone', purity: 1 },
        { groupId: 'wyrm', purity: 1 }
      ])
    ).toEqual(['b[1]: nhóm lặp hoặc sai thứ tự'])
    expect(issues([{ groupId: 'wyrm', purity: 1, x: 1 }])).toEqual(['b[0]: trường lạ "x"'])
    expect(issues([1])).toEqual(['b[0] phải là object'])
  })

  it('validateMonster báo nhóm loài không thuộc', () => {
    const weakling = makeMonster({ bloodlines: [{ groupId: 'wyrm', purity: 5 }] })
    expect(validateMonster(data, weakling)).toEqual([
      'bloodlines[0]: loài "weakling" không thuộc nhóm "wyrm"'
    ])
  })
})
