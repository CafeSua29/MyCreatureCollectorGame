// Hồn phách và hồn khí (docs/rules/soul-relics.md): tạo hồn phách khi chết hẳn, trứng truyền thừa từ
// hồn phách, ấp ở NPC, luyện hồn khí (bậc theo tư chất, dòng hồn), giới hạn lắp, kiểm tra save,
// migrate v50 → v51.

import { describe, expect, it } from 'vitest'
import { createSoul, dieForever } from '../monster'
import { equipmentTraitInstances } from '../registries'
import { gameReducer, migrateState, validateGameState } from '../game'
import { createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  equipped,
  expectActionError,
  makeData,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  soulRelicItemId,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import { createGameData } from '../gameData'
import {
  STAT_NAMES,
  type GameState,
  type RawGameData,
  type SoulRemnant,
  type StatName
} from '../model'
import { createLegacyEgg } from './eggs'
import {
  forgeSoulRelic,
  incubateSoul,
  rollSoulRelic,
  rollSoulRelicStat,
  soulRelicCost
} from './soulRelics'

const data = makeData()
const DEATH = { aptitudeFloor: 1, day: 3, cause: 'oldAge' as const }
const hugeGenes = Object.fromEntries(STAT_NAMES.map((stat) => [stat, '1e400'])) as Record<
  StatName,
  string
>

/** Hồn phách của một quái fixture (gen mặc định 10 = tư chất Tinh ở tầng 1 → epic). */
const soulOf = (overrides: MonsterOverrides = {}): SoulRemnant =>
  createSoul(data, makeMonster({ id: 'm1', ...overrides }), DEATH)

/** State ở thị trấn có sẵn hồn phách trong túi. */
const withSouls = (souls: SoulRemnant[], money = 0): GameState => {
  const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'm2' })], money })
  return { ...state, nextMonsterId: 5, inventory: { ...state.inventory, souls } }
}

describe('createSoul / dieForever', () => {
  it('ảnh chụp lúc chết: loài, gen, trait chiếm ô (bỏ shiny / boss), tư chất, mốc died', () => {
    const monster = makeMonster({
      id: 'm1',
      nickname: 'Cún',
      level: 30,
      traits: [
        { id: 'fast', level: 3 },
        { id: 'bossBlood', level: 2 }
      ],
      shinyStacks: 2,
      contractRealm: 4
    })
    const soul = createSoul(data, monster, DEATH)
    expect(soul).toMatchObject({
      id: 'm1',
      speciesId: 'weakling',
      baseSpeciesId: 'weakling',
      raceId: 'neutral',
      nickname: 'Cún',
      level: 30,
      traits: [{ id: 'fast', level: 3 }],
      shinyStacks: 2,
      contractRealm: 4,
      aptitudeTierId: 'refined'
    })
    expect(soul.genes.attack.eq(10)).toBe(true)
    expect(soul.history?.milestones.at(-1)).toEqual({ day: 3, kind: 'died', cause: 'oldAge' })
    // Quái không có lý lịch: hồn phách cũng không có.
    expect(createSoul(data, { ...monster, history: null }, DEATH).history).toBeNull()
  })

  it('tư chất lúc chết: gen cực lớn là Thần, gen thấp là Phàm', () => {
    expect(soulOf({ genes: hugeGenes }).aptitudeTierId).toBe('divine')
    expect(soulOf({ genes: uniformStats(2) }).aptitudeTierId).toBe('mortal')
  })

  it('dieForever: đồ đang lắp về túi, hồn phách vào cuối túi', () => {
    const sword = makeEquipment({ id: 'e3' })
    const monster = makeMonster({ id: 'm1', equipment: [equipped(sword)] })
    const before = { ...makeInventory(), souls: [soulOf({ id: 'm0' })] }
    const after = dieForever(data, before, monster, DEATH)
    expect(after.equipment).toEqual([sword])
    expect(after.souls.map((soul) => soul.id)).toEqual(['m0', 'm1'])
    expect(before.souls).toHaveLength(1)
  })
})

describe('createLegacyEgg (từ hồn phách)', () => {
  const parent = (): SoulRemnant =>
    createSoul(
      data,
      makeMonster({
        id: 'm1',
        speciesId: 'strongling',
        baseSpeciesId: 'strongling',
        level: 30,
        genes: { ...uniformStats(100), hp: 10 },
        traits: [
          { id: 'fast', level: 3 },
          { id: 'bossBlood', level: 2 }
        ],
        shinyStacks: 2,
        bossMultiplier: 3
      }),
      DEATH
    )

  it('dạng gốc, level 1, gen 50% (sàn geneMin), 1 trait giữ cấp, shiny ×1, aging theo tham số', () => {
    const options = { soul: parent(), id: 'm9', day: 0, aging: true }
    const [egg] = createLegacyEgg(data, createRng(1), options)
    const child = egg.monster
    expect(egg.id).toBe('m9')
    expect(child.speciesId).toBe('weakling')
    expect(child.level).toBe(1)
    expect(child.ageDays).toBe(0)
    expect(child.aging).toBe(true)
    expect(child.bossMultiplier).toBe(1)
    expect(child.genes.attack.toNumber()).toBe(50)
    expect(child.genes.hp.toNumber()).toBe(data.config.wild.geneMin)
    expect(child.shinyStacks).toBe(1)
    expect(child.traits).toEqual([
      { id: 'fast', level: 3 },
      { id: 'shiny', level: 1 }
    ])
    expect(child.history?.origin).toEqual({ kind: 'legacy', parentSpeciesId: 'strongling' })
    expect(createLegacyEgg(data, createRng(1), options)).toEqual([egg, expect.anything()])
  })

  it('không trait chiếm ô: con không trait; gen cực lớn: 50% vẫn đúng, không Infinity / NaN', () => {
    const soul = { ...soulOf(), traits: [], genes: { ...soulOf().genes, attack: toBig('1e400') } }
    const [egg] = createLegacyEgg(data, createRng(1), { soul, id: 'm9', day: 0, aging: false })
    expect(egg.monster.traits).toEqual([])
    expect(egg.monster.genes.attack.eq(toBig('5e399'))).toBe(true)
  })
})

describe('incubateSoul', () => {
  it('ở thị trấn: hồn phách thành trứng truyền thừa, miễn phí; state hợp lệ', () => {
    const state = withSouls([soulOf({ id: 'm1' }), soulOf({ id: 'm3' })])
    const next = gameReducer(data, state, { type: 'incubateSoul', soulId: 'm1' })
    expect(next.inventory.souls.map((soul) => soul.id)).toEqual(['m3'])
    expect(next.eggs.map((egg) => egg.id)).toEqual(['m5'])
    expect(next.nextMonsterId).toBe(6)
    expect(next.money.eq(0)).toBe(true)
    // Cờ già đi theo tùy chọn của game (fixture tắt thọ nguyên).
    expect(next.eggs[0].monster.aging).toBe(false)
    expect(validateGameState(data, next)).toEqual([])
  })

  it('lỗi: không có hồn phách, ngoài thị trấn, trong trận; state giữ nguyên', () => {
    const state = withSouls([soulOf()])
    expectActionError(
      () => gameReducer(data, state, { type: 'incubateSoul', soulId: 'm9' }),
      'soulNotFound',
      { soulId: 'm9' }
    )
    const away = { ...state, location: { type: 'floor' as const, floor: 1 } }
    expectActionError(() => incubateSoul(data, away, 'm1'), 'notInTown')
    expect(state.inventory.souls).toHaveLength(1)
  })
})

describe('rollSoulRelicStat', () => {
  it('random theo trọng số chỉ số gốc: chỉ số cao ra nhiều hơn, chỉ số nào cũng có cơ hội', () => {
    const raw = makeRawData()
    const weakling = defined(
      raw.species.find((species) => species.id === 'weakling'),
      'weakling'
    )
    // Tốc gấp 5 lần mỗi chỉ số khác: kỳ vọng Tốc 50%, mỗi chỉ số khác 10%.
    if (weakling.kind === 'normal') weakling.baseStats = { ...uniformStats(20), speed: 100 }
    const skewed = createGameData(withFixtureText(raw))
    const counts = Object.fromEntries(STAT_NAMES.map((stat) => [stat, 0])) as Record<
      StatName,
      number
    >
    let rng = createRng(7)
    const rolls = 6000
    for (let i = 0; i < rolls; i++) {
      let stat: StatName
      ;[stat, rng] = rollSoulRelicStat(skewed, rng, { baseSpeciesId: 'weakling' })
      counts[stat]++
    }
    expect(counts.speed / rolls).toBeCloseTo(0.5, 1)
    for (const stat of STAT_NAMES.filter((entry) => entry !== 'speed')) {
      expect(counts[stat] / rolls).toBeGreaterThan(0.07)
      expect(counts[stat] / rolls).toBeLessThan(0.13)
    }
  })

  it('cùng RNG cùng kết quả; loài gốc không phải loài thường là lỗi lập trình', () => {
    const soul = { baseSpeciesId: 'weakling' }
    expect(rollSoulRelicStat(data, createRng(3), soul)).toEqual(
      rollSoulRelicStat(data, createRng(3), soul)
    )
    expect(() => rollSoulRelicStat(data, createRng(3), { baseSpeciesId: 'fused' })).toThrow()
  })
})

describe('forgeSoulRelic', () => {
  it('tốn forgeCostPerLevel × level; món gốc theo chỉ số tung được, bậc theo tư chất, dòng hồn', () => {
    const soul = soulOf({ level: 12, nickname: 'Cún', traits: [{ id: 'fast', level: 4 }] })
    const state = withSouls([soul], 1000)
    const next = gameReducer(
      data,
      { ...state, nextItemId: 7 },
      { type: 'forgeSoulRelic', soulId: 'm1' }
    )
    expect(next.money.eq(1000 - 10 * 12)).toBe(true)
    expect(next.inventory.souls).toEqual([])
    expect(next.nextItemId).toBe(8)
    const [relic] = next.inventory.equipment
    const [stat] = rollSoulRelicStat(data, state.rng, soul)
    expect(relic).toMatchObject({
      id: 'e7',
      baseItemId: soulRelicItemId(stat),
      rarity: 'epic',
      level: 1,
      soul: { speciesId: 'weakling', raceId: 'neutral', nickname: 'Cún', traitId: 'fast' }
    })
    expect(relic.soul?.history).toEqual(soul.history)
    expect(relic.rolls[0]).toEqual({ lineId: 'main', value: 20 })
    expect(relic.rolls.at(-1)).toEqual({ lineId: 'soul', value: 4 })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('bậc theo mọi bậc tư chất (Phàm → common … Thần → unique); không trait thì không dòng hồn', () => {
    const rarityOf = (genes: MonsterOverrides['genes']): string =>
      rollSoulRelic(data, createRng(1), { soul: soulOf({ genes }), id: 'e1' })[0].rarity
    expect(rarityOf(uniformStats(2))).toBe('common')
    expect(rarityOf(uniformStats(4))).toBe('uncommon')
    expect(rarityOf(uniformStats(7))).toBe('rare')
    expect(rarityOf(uniformStats(10))).toBe('epic')
    expect(rarityOf(uniformStats(13))).toBe('legendary')
    expect(rarityOf(hugeGenes)).toBe('unique')
    const [plain] = rollSoulRelic(data, createRng(1), { soul: soulOf(), id: 'e1' })
    expect(plain.soul?.traitId).toBeNull()
    expect(plain.rolls.some((roll) => roll.lineId === 'soul')).toBe(false)
  })

  it('dòng hồn chạy như trait của món (giữ cấp); chỉ quái cùng race lắp được', () => {
    const soul = soulOf({ traits: [{ id: 'fast', level: 4 }] })
    const forged = forgeSoulRelic(data, withSouls([soul], 1000), 'm1')
    const [relic] = forged.inventory.equipment
    const wearer = makeMonster({ equipment: [equipped(relic)] })
    expect(equipmentTraitInstances(data, wearer)).toEqual([{ id: 'fast', level: 4 }])
    const brute = makeMonster({
      id: 'm3',
      speciesId: 'brawler',
      baseSpeciesId: 'brawler',
      raceId: 'brute'
    })
    const state = { ...forged, party: [...forged.party, brute] }
    const item = { storage: 'instance' as const, instanceId: relic.id }
    expectActionError(
      () => gameReducer(data, state, { type: 'equipItem', monsterId: 'm3', item }),
      'equipmentRaceLocked',
      { itemId: relic.baseItemId, raceId: 'neutral' }
    )
    const worn = gameReducer(data, state, { type: 'equipItem', monsterId: 'm2', item })
    expect(worn.party[0].equipment).toHaveLength(1)
  })

  it('level cực lớn: giá Decimal; lỗi thiếu tiền / không có hồn phách, state giữ nguyên', () => {
    const huge = soulOf({ level: Number.MAX_SAFE_INTEGER })
    expect(soulRelicCost(data, huge).eq(toBig(10).times(Number.MAX_SAFE_INTEGER))).toBe(true)
    const poor = withSouls([soulOf({ level: 5 })], 49)
    expectActionError(() => forgeSoulRelic(data, poor, 'm1'), 'notEnoughMoney')
    expectActionError(() => forgeSoulRelic(data, poor, 'mx'), 'soulNotFound', { soulId: 'mx' })
    expect(poor.inventory.souls).toHaveLength(1)
    expect(poor.money.eq(49)).toBe(true)
  })
})

describe('dữ liệu hồn khí', () => {
  /** Món gốc hồn khí của chỉ số trong raw (để sửa). */
  const baseIn = (raw: RawGameData, stat: StatName): Record<string, unknown> =>
    defined(
      raw.items.find((item) => item.id === soulRelicItemId(stat)),
      stat
    ) as unknown as Record<string, unknown>

  it('fixture hợp lệ; mỗi chỉ số đúng một món gốc', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
    const issues = dataIssuesAfter((raw) => {
      raw.items = raw.items.filter((item) => item.id !== soulRelicItemId('speed'))
      baseIn(raw, 'hp').soulRelicStat = 'attack'
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Hồn khí: cần đúng một món gốc có soulRelicStat "hp" (đang có 0)',
        'Hồn khí: cần đúng một món gốc có soulRelicStat "attack" (đang có 2)',
        'Hồn khí: cần đúng một món gốc có soulRelicStat "speed" (đang có 0)'
      ])
    )
  })

  it('món gốc: chỉ số sai, thiếu bậc, có unique / shop; không được nằm trong bảng rơi của map', () => {
    const issues = dataIssuesAfter((raw) => {
      const attack = baseIn(raw, 'attack')
      attack.shop = true
      attack.unique = { bossSpeciesId: 'strongling', lines: [] }
      const mainLine = attack.mainLine as { ranges: Record<string, unknown> }
      delete mainLine.ranges.unique
      raw.biomes[0].equipmentDrops = [{ itemId: soulRelicItemId('hp'), weight: 1 }]
    })
    const where = `Vật phẩm "${soulRelicItemId('attack')}"`
    expect(issues).toEqual(
      expect.arrayContaining([
        `${where}.mainLine.ranges thiếu bậc "unique"`,
        `${where}: món gốc hồn khí không có phần unique`,
        `${where}: món gốc hồn khí không bán ở cửa hàng`,
        `Biome "field": equipmentDrops: món gốc hồn khí "${soulRelicItemId('hp')}" chỉ có khi luyện hồn khí`
      ])
    )
  })

  it('config.soulRelic: giá âm, thiếu bậc tư chất, bậc lạ, bậc trang bị sai', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.soulRelic = {
        forgeCostPerLevel: -1,
        rarityByAptitude: { mortal: 'common', ghost: 'rare', good: 'mythic' as 'rare' }
      }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'config.soulRelic.forgeCostPerLevel phải là số hữu hạn ≥ 0, nhận -1',
        'config.soulRelic.rarityByAptitude thiếu bậc "divine"',
        'config.soulRelic.rarityByAptitude: bậc tư chất không tồn tại "ghost"',
        'config.soulRelic.rarityByAptitude.good: bậc trang bị không hợp lệ "mythic"'
      ])
    )
  })
})

describe('save', () => {
  it('hồn phách sai: trường sai / lạ, trait không chiếm ô, id trùng quái, vượt nextMonsterId', () => {
    const soul = soulOf({ id: 'm2' })
    const bad = {
      ...soulOf({ id: 'm7' }),
      raceId: 'ghost',
      baseSpeciesId: 'fused',
      aptitudeTierId: 'cosmic',
      traits: [{ id: 'bossBlood', level: 1 }],
      extra: 1
    }
    const state = withSouls([soul, bad as unknown as SoulRemnant])
    expect(validateGameState(data, state)).toEqual(
      expect.arrayContaining([
        'id quái bị trùng "m2"',
        'nextMonsterId phải lớn hơn mọi id quái (hiện có m7)',
        'inventory.souls[1].raceId: race không tồn tại "ghost"',
        'inventory.souls[1].baseSpeciesId: không phải loài thường "fused"',
        'inventory.souls[1].aptitudeTierId: bậc tư chất không tồn tại "cosmic"',
        'inventory.souls[1].traits[0]: trait loại "boss" không chiếm ô',
        'inventory.souls[1]: trường lạ "extra"'
      ])
    )
  })

  it('hồn khí sai: món gốc hồn khí thiếu phần hồn, món thường có phần hồn, dòng hồn không trait', () => {
    const imprint = { speciesId: 'weakling', raceId: 'neutral', nickname: null, history: null }
    const base = makeGameState({ seed: 1, party: [makeMonster()] })
    const state = {
      ...base,
      nextItemId: 9,
      inventory: makeInventory(
        {},
        [],
        [
          makeEquipment({ id: 'e1', baseItemId: soulRelicItemId('hp'), rarity: 'unique' }),
          makeEquipment({ id: 'e2', soul: { ...imprint, traitId: 'fast' } }),
          makeEquipment({
            id: 'e3',
            baseItemId: soulRelicItemId('hp'),
            rolls: [{ lineId: 'soul', value: 2 }],
            soul: { ...imprint, traitId: null }
          })
        ]
      )
    }
    expect(validateGameState(makeEquipmentData(), state)).toEqual([
      'inventory.equipment[0].soul: chỉ hồn khí (món gốc hồn khí) mới có và luôn có phần hồn',
      'inventory.equipment[1].soul: chỉ hồn khí (món gốc hồn khí) mới có và luôn có phần hồn',
      'inventory.equipment[2].rolls[0].lineId: dòng không tồn tại "soul"'
    ])
  })

  it('migrate v50 → v51: túi thêm souls rỗng, bỏ sự kiện legacyEggCreated', () => {
    const current = withSouls([])
    const { souls: _souls, ...inventory } = current.inventory
    const old = {
      ...current,
      version: 50,
      inventory,
      dayEvents: [
        { type: 'legacyEggCreated', eggId: 'm3', fromMonsterId: 'm1' },
        { type: 'monsterAutoJoined', monsterId: 'm2' }
      ]
    }
    const migrated = migrateState(JSON.parse(JSON.stringify(old)), data)
    // Migrate chạy tiếp tới version hiện tại; chỉ kiểm tra phần của bước v50 → v51.
    expect(migrated).toMatchObject({
      inventory: { souls: [] },
      dayEvents: [{ type: 'monsterAutoJoined', monsterId: 'm2' }]
    })
  })
})
