import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { rawGameData } from '@data'
import { createGameData } from './gameData'
import { validateMonster } from '../monster'
import { generateWildMonster, rollMonster, skillsAtLevel } from '../world'
import { toBig } from '../shared'
import { createRng } from '../shared'
import { computeStats, isGenderlessSpecies } from '../monster'
import { dataIssues, defined, makeData, makeMonster, makeRawData, uniformStats } from '../testing'
import type { ConsumableItem, Monster, RawGameData } from '../model'

const issuesOf = dataIssues

/** Vật phẩm tiêu hao trong dữ liệu thô của fixture (thu hẹp kiểu để sửa trường). */
function consumable(raw: RawGameData, id: string): ConsumableItem {
  const item = raw.items.find((entry) => entry.id === id)
  if (item?.category !== 'consumable') throw new Error(`fixture: "${id}" không phải consumable`)
  return item
}

/**
 * Test duyệt mọi loài / biome của dữ liệu thật: hơn 15.000 loài nên chậm hơn mặc định 5 giây của
 * vitest khi chạy song song cả bộ test.
 */
const REAL_DATA_TIMEOUT_MS = 60_000

describe('dữ liệu thật trong src/data', () => {
  // Dựng một lần cho cả nhóm (mỗi lần dựng tốn vài giây với dữ liệu thật).
  let cached: ReturnType<typeof createGameData> | undefined
  const realData = (): ReturnType<typeof createGameData> => (cached ??= createGameData(rawGameData))

  it(
    'hợp lệ',
    () => {
      expect(() => realData()).not.toThrow()
    },
    REAL_DATA_TIMEOUT_MS
  )

  it(
    'tính được chỉ số cho mọi loài thường',
    () => {
      const data = realData()
      for (const species of Object.values(data.species)) {
        if (species.kind !== 'normal') continue
        const monster = makeMonster({
          speciesId: species.id,
          baseSpeciesId: species.id,
          // Loài không giới tính phải có gender 'none' (kiểm tra trong computeStats).
          gender: isGenderlessSpecies(data, species.id) ? 'none' : 'female',
          raceId: species.raceId,
          elementIds: species.elementIds,
          skillIds: skillsAtLevel(data, species, 1),
          // Loài có hệ Tera cố định (Ogerpon, Terapagos) phải mang đúng hệ đó.
          ...(species.teraElementId ? { teraElementId: species.teraElementId } : {})
        })
        expect(Object.values(computeStats(data, monster).final).every((v) => v.gte(1))).toBe(true)
      }
    },
    REAL_DATA_TIMEOUT_MS
  )

  it(
    'sinh được quái hợp lệ cho mọi loài thường (kể cả loài không giới tính, dạng)',
    () => {
      const data = realData()
      let rng = createRng(77)
      for (const species of Object.values(data.species)) {
        if (species.kind !== 'normal') continue
        let monster: Monster
        ;[monster, rng] = rollMonster(
          data,
          rng,
          {
            encounters: [{ speciesId: species.id, weight: 1 }],
            levelMin: 50,
            levelMax: 50,
            geneMultiplier: toBig(1),
            shinyChance: 0,
            aging: true
          },
          'm1'
        )
        expect(validateMonster(data, monster)).toEqual([])
      }
    },
    REAL_DATA_TIMEOUT_MS
  )

  it(
    'mọi biome sinh ra quái hoang hợp lệ (tầng thấp và tầng cao)',
    () => {
      const data = realData()
      let rng = createRng(2024)
      for (const biome of Object.values(data.biomes)) {
        for (const floor of [1, 37]) {
          for (let i = 0; i < 10; i++) {
            let monster: Monster
            ;[monster, rng] = generateWildMonster(
              data,
              rng,
              { floor, biome, aging: true, time: 0 },
              `m${i}`
            )
            expect(validateMonster(data, monster)).toEqual([])
          }
        }
      }
    },
    REAL_DATA_TIMEOUT_MS
  )
})

describe('createGameData', () => {
  it('chấp nhận dữ liệu fixture', () => {
    expect(issuesOf(makeRawData())).toEqual([])
  })

  it('config.rewards.minExp: số nguyên ≥ 0', () => {
    for (const bad of [-1, 0.5, Infinity, undefined]) {
      const raw = makeRawData()
      // Ép kiểu: cố ý gán giá trị sai kiểu để kiểm tra luật kiểm tra dữ liệu.
      raw.config.rewards.minExp = bad as number
      expect(issuesOf(raw).join()).toMatch(/rewards\.minExp/)
    }
    const raw = makeRawData()
    raw.config.rewards.minExp = 0
    expect(issuesOf(raw)).toEqual([])
  })

  it('báo id trùng', () => {
    const raw = makeRawData()
    raw.races.push({ ...raw.races[0] })
    expect(issuesOf(raw).join()).toMatch(/"neutral" bị trùng/)
  })

  it('báo tham chiếu hỏng: race, hệ, tiến hóa', () => {
    const raw = makeRawData()
    const species = raw.species[0]
    if (species.kind !== 'normal') throw new Error('fixture sai')
    species.raceId = 'ghost'
    species.elementIds = ['void']
    species.evolutions = [{ speciesId: 'missing', level: 5 }]
    const issues = issuesOf(raw).join('\n')
    expect(issues).toMatch(/race không tồn tại "ghost"/)
    expect(issues).toMatch(/hệ không tồn tại "void"/)
    expect(issues).toMatch(/tiến hóa thành loài không tồn tại "missing"/)
  })

  it('chấp nhận tiến hóa đổi race (giống game gốc)', () => {
    const raw = makeRawData()
    const oak = raw.species.find((species) => species.id === 'oak')
    if (oak?.kind !== 'normal') throw new Error('fixture sai')
    oak.raceId = 'brute'
    expect(issuesOf(raw)).toEqual([])
  })

  it('báo loài thiếu chỉ số gốc', () => {
    const raw = makeRawData()
    const species = raw.species[0]
    if (species.kind !== 'normal') throw new Error('fixture sai')
    species.baseStats = { ...uniformStats(30), speed: undefined as unknown as number }
    expect(issuesOf(raw).join()).toMatch(/baseStats\.speed/)
  })

  it('báo hook chưa có trong registry và params sai', () => {
    const raw = makeRawData()
    raw.traits[0].hooks = [{ type: 'noSuchHook', params: {} }]
    raw.traits[1].hooks = [{ type: 'statModifier', params: { percent: { luck: 5 } } }]
    const issues = issuesOf(raw).join('\n')
    expect(issues).toMatch(/hook "noSuchHook" chưa có trong registry/)
    expect(issues).toMatch(/percent\.luck không phải chỉ số hợp lệ/)
  })

  it('báo nhóm loại trừ chỉ có một trait', () => {
    const raw = makeRawData()
    raw.traits[2].exclusiveGroup = 'lonely'
    expect(issuesOf(raw).join()).toMatch(/Nhóm loại trừ "lonely" chỉ có một trait/)
  })

  it('báo fusedSpeciesId không trỏ tới loài kind "fused"', () => {
    const raw = makeRawData()
    raw.config.fusedSpeciesId = 'weakling'
    expect(issuesOf(raw).join()).toMatch(/fusedSpeciesId/)
  })
  it('báo lỗi skill, vật phẩm, biome và learnset', () => {
    const raw = makeRawData()
    raw.skills[0].elementId = 'void'
    raw.skills[1].effects = [{ type: 'statStage', params: { who: 'self', stat: 'hp', delta: 1 } }]
    raw.skills.push({ ...raw.skills[0], id: 'badStatus', category: 'status', power: 10 })
    consumable(raw, 'potion').effects = [{ type: 'teleport', params: {} }]
    raw.biomes[0].encounters = [{ speciesId: 'fused', weight: 1 }]
    raw.biomes[0].drops = [{ itemId: 'ghostItem', chance: 10 }]
    const species = raw.species[1]
    if (species.kind !== 'normal') throw new Error('fixture sai')
    species.learnset = [{ level: 3, skillId: 'strike' }]
    const issues = issuesOf(raw).join('\n')
    expect(issues).toMatch(/Skill "strike": hệ không tồn tại "void"/)
    expect(issues).toMatch(/stat phải là chỉ số có bậc trận/)
    expect(issues).toMatch(/skill status phải có power = 0/)
    expect(issues).toMatch(/hook "teleport" chưa có trong registry/)
    expect(issues).toMatch(/Biome "field": loài không tồn tại "fused"/)
    expect(issues).toMatch(/vật phẩm rơi không tồn tại "ghostItem"/)
    expect(issues).toMatch(/learnset cần ít nhất một skill ở level 1/)
  })

  it('báo lỗi bóng, use của vật phẩm, catchRate và config bắt quái', () => {
    const raw = makeRawData()
    const ball = defined(raw.items.find((item) => item.id === 'ball'))
    // Gán trường không thuộc category bóng (dữ liệu JSON sai) để kiểm tra báo lỗi.
    Object.assign(ball, { use: 'both', effects: [] })
    consumable(raw, 'potion').use = 'everywhere' as never
    const species = raw.species[0]
    if (species.kind !== 'normal') throw new Error('fixture sai')
    species.catchRate = 150
    raw.config.capture.hpFloorPercent = -5
    const issues = issuesOf(raw).join('\n')
    expect(issues).toMatch(/Vật phẩm "ball": trường "use" không thuộc category "ball"/)
    expect(issues).toMatch(/Vật phẩm "ball": trường "effects" không thuộc category "ball"/)
    expect(issues).toMatch(/use phải là "field", "battle" hoặc "both"/)
    expect(issues).toMatch(/catchRate/)
    expect(issues).toMatch(/capture\.hpFloorPercent/)
  })

  it('báo trait battle tham chiếu race không tồn tại', () => {
    const raw = makeRawData()
    raw.traits.push({
      id: 'ghostSlayer',
      kind: 'rare',
      hooks: [{ type: 'damageVsRace', params: { raceIds: ['ghost'], percent: 10 } }]
    })
    expect(issuesOf(raw).join()).toMatch(/race không tồn tại "ghost"/)
  })
})

describe('validateMonster', () => {
  const data = makeData()
  const check = (overrides: MonsterOverrides): string =>
    validateMonster(data, makeMonster(overrides)).join('\n')

  it('quái mẫu hợp lệ', () => {
    expect(validateMonster(data, makeMonster())).toEqual([])
  })

  it('quái thường tối đa 3 ô trait, trait shiny và boss không tính', () => {
    const three = [
      { id: 'fast', level: 1 },
      { id: 'armored', level: 1 },
      { id: 'mighty', level: 1 }
    ]
    expect(
      check({
        shinyStacks: 2,
        traits: [...three, { id: 'shiny', level: 2 }, { id: 'bossBlood', level: 1 }]
      })
    ).toBe('')
    expect(check({ traits: [...three, { id: 'cursed', level: 1 }] })).toMatch(
      /dùng 4 ô trait, tối đa 3/
    )
  })

  it('quái fuse tối đa 6 ô trait', () => {
    const fused: MonsterOverrides = {
      traitSlots: 6,
      speciesId: 'fused',
      baseSpeciesId: 'weakling',
      fused: true,
      lineage: ['strongling']
    }
    const four = [
      { id: 'fast', level: 1 },
      { id: 'armored', level: 1 },
      { id: 'mighty', level: 1 },
      { id: 'cursed', level: 1 }
    ]
    expect(check({ ...fused, traits: four })).toBe('')
  })

  it('báo cặp trait loại trừ và trait lặp', () => {
    expect(
      check({
        traits: [
          { id: 'fast', level: 1 },
          { id: 'slow', level: 1 }
        ]
      })
    ).toMatch(/loại trừ nhau/)
    expect(
      check({
        traits: [
          { id: 'fast', level: 1 },
          { id: 'fast', level: 1 }
        ]
      })
    ).toMatch(/bị lặp/)
  })

  it('báo gen nhỏ hơn 1, level và shinyStacks sai', () => {
    expect(check({ genes: { ...uniformStats(10), hp: toBig(0.5) } })).toMatch(/genes\.hp/)
    expect(check({ level: 0 })).toMatch(/level/)
    expect(check({ shinyStacks: 1.5 })).toMatch(/shinyStacks/)
    expect(check({ bossMultiplier: 0.5 })).toMatch(/bossMultiplier/)
  })

  it('kiểm tra quy tắc loài của quái fuse và quái thường', () => {
    expect(check({ baseSpeciesId: 'strongling' })).toMatch(/baseSpeciesId bằng speciesId/)
    expect(check({ lineage: ['strongling'] })).toMatch(/không được có lineage/)
    expect(check({ speciesId: 'fused', baseSpeciesId: 'fused' })).toMatch(
      /không được dùng loài "fused"/
    )
    expect(check({ fused: true, speciesId: 'weakling' })).toMatch(
      /quái fuse phải có speciesId "fused"/
    )
    expect(check({ fused: true, speciesId: 'fused', baseSpeciesId: 'fused' })).toMatch(
      /baseSpeciesId "fused" phải là loài thường/
    )
  })
})

describe('validateMonster — skill và HP', () => {
  const data = makeData()
  const check = (overrides: MonsterOverrides): string =>
    validateMonster(data, makeMonster(overrides)).join('\n')

  it('báo skill sai và damageTaken âm', () => {
    expect(check({ skillIds: [] })).toMatch(/cần từ 1 đến 4 skill/)
    expect(check({ skillIds: ['strike', 'blast', 'growl', 'sap', 'quick'] })).toMatch(/cần từ 1/)
    expect(check({ skillIds: ['strike', 'strike'] })).toMatch(/skill bị lặp/)
    expect(check({ skillIds: ['nope'] })).toMatch(/skill không tồn tại/)
    expect(check({ damageTaken: toBig(-1) })).toMatch(/damageTaken/)
    expect(check({ id: '' })).toMatch(/thiếu id/)
  })
})
