// Biến thể Bootleg (docs/rules/bootleg.md): tỉ lệ, hệ khác hệ loài, tung sau cùng (không đổi quái cũ),
// tiến hóa giữ, breeding truyền, fuse giữ quái gốc, thưởng EXP, Dex ghi, Bí kíp thành sticker, save.
// Fixture: weakling (cỏ) → strongling (lửa) ở level 10.

import { describe, expect, it } from 'vitest'
import { gameReducer, rollStarters, validateGameState } from '../game'
import { requireBattleStart } from '../battle'
import { createGameData } from '../gameData'
import { evolveMonster, fuseMonsters, makeOffspring } from '../progression'
import { syncDex } from '../roster'
import { floorSite, generateWildMonster, rollMonster } from '../world'
import { createRng, toBig, type RngState } from '../shared'
import {
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { BootlegConfig, GameData, Monster, NormalSpecies } from '../model'
import { bootlegElementChoices, rollBootleg, speciesElementsFor } from './bootleg'
import { expReward } from './exp'
import { validateMonster } from './validateMonster'

function dataWith(edit: Partial<BootlegConfig> = {}): GameData {
  const raw = makeRawData()
  raw.config.bootleg = { ...raw.config.bootleg, ...edit }
  return createGameData(withFixtureText(raw))
}

const data = makeData()
/** Loài thường của fixture (loài fuse chung không có hệ riêng). */
function normalSpecies(id: string): NormalSpecies {
  const species = data.species[id]
  if (species.kind !== 'normal') throw new Error(`"${id}" không phải loài thường`)
  return species
}
const species = normalSpecies('weakling')
const bootleg = (overrides: Partial<Monster> = {}): Monster =>
  makeMonster({ bootlegElementId: 'water', elementIds: ['water'], ...overrides })

describe('tung Bootleg', () => {
  it('tỉ lệ 0 không tốn RNG; 100 luôn ra hệ khác hệ loài', () => {
    const rng = createRng(1)
    expect(rollBootleg(data, rng, { species, chance: 0 })).toEqual([null, rng])
    const choices = bootlegElementChoices(data, species)
    expect(choices).not.toContain('grass')
    let state: RngState = createRng(2)
    for (let i = 0; i < 50; i++) {
      let elementId: string | null
      ;[elementId, state] = rollBootleg(data, state, { species, chance: 100 })
      expect(choices).toContain(elementId)
    }
  })

  it('quái hoang: tung sau cùng nên mọi thứ khác giữ nguyên, quái mang đúng một hệ Bootleg', () => {
    const spec = {
      encounters: [{ speciesId: 'weakling', weight: 1 }],
      levelMin: 5,
      levelMax: 5,
      geneMultiplier: toBig(1),
      shinyChance: 0,
      aging: false
    }
    const [plain] = rollMonster(data, createRng(3), { ...spec, bootlegChance: 0 }, 'm1')
    const [rare] = rollMonster(data, createRng(3), { ...spec, bootlegChance: 100 }, 'm1')
    expect(plain.bootlegElementId).toBeNull()
    expect(rare.bootlegElementId).not.toBeNull()
    expect(rare.elementIds).toEqual([rare.bootlegElementId])
    const { bootlegElementId: _a, elementIds: _b, ...rest } = rare
    const { bootlegElementId: _c, elementIds: _d, ...plainRest } = plain
    expect(rest).toEqual(plainRest)
  })
})

describe('tỉ lệ theo hoàn cảnh', () => {
  it('độ bất ổn: +10% mỗi mức; thú triều ×5; quái khởi đầu không bao giờ Bootleg', () => {
    const base = makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a' })],
      location: { type: 'floor', floor: 1 }
    })
    const unstable = { ...base, instability: { ...base.instability, level: 3 } }
    expect(requireBattleStart(data, unstable).odds?.bootlegMultiplier).toBeCloseTo(1.3)
    // 20% × 5 = 100%: luôn Bootleg.
    const tide = dataWith({ wildChance: 20 })
    const site = {
      ...floorSite(tide, base, 1),
      odds: { shinyMultiplier: 1, bossChanceMultiplier: 1, bootlegMultiplier: 5 }
    }
    expect(generateWildMonster(tide, createRng(4), site, 'm9')[0].bootlegElementId).not.toBeNull()
    const always = dataWith({ wildChance: 100 })
    expect(rollStarters(always, 1).candidates.every((m) => m.bootlegElementId === null)).toBe(true)
  })
})

describe('giữ và truyền', () => {
  it('tiến hóa giữ hệ Bootleg; quái thường theo hệ loài mới', () => {
    const evolve = (monster: Monster): Monster =>
      evolveMonster(data, monster, { toSpeciesId: 'strongling', rng: createRng(1), day: 0 }).monster
    expect(evolve(bootleg({ level: 10 })).elementIds).toEqual(['water'])
    expect(evolve(makeMonster({ level: 10 })).elementIds).toEqual(['fire'])
    expect(speciesElementsFor(normalSpecies('strongling'), { bootlegElementId: null })).toEqual([
      'fire'
    ])
  })

  it('fuse: quái gốc giữ Bootleg của mình', () => {
    const sub = makeMonster({ id: 'sub', speciesId: 'brawler', baseSpeciesId: 'brawler' })
    const [fused] = fuseMonsters(data, createRng(1), bootleg(), sub)
    expect(fused.bootlegElementId).toBe('water')
  })

  it('breeding: inheritPercent 100 thì con nhận hệ Bootleg của mẹ', () => {
    const always = dataWith({ inheritPercent: 100 })
    const father = makeMonster({ id: 'f', gender: 'male' })
    const mother = bootleg({ id: 'g' })
    const [child] = makeOffspring(always, createRng(1), father, mother, 'c')
    expect(child.bootlegElementId).toBe('water')
    expect(child.elementIds).toEqual(['water'])
    const never = dataWith({ inheritPercent: 0, wildChance: 0 })
    expect(makeOffspring(never, createRng(1), father, mother, 'c')[0].bootlegElementId).toBeNull()
  })
})

describe('thưởng, Dex, sticker', () => {
  it('EXP × rewardMultiplier', () => {
    const plain = expReward(data, makeMonster({ level: 20 }))
    const rare = expReward(data, bootleg({ level: 20 }))
    expect(rare.div(plain).toNumber()).toBeCloseTo(1.5, 1)
  })

  it('Dex ghi Bootleg đã sở hữu theo loài + hệ; thành tựu đếm', () => {
    const state = syncDex(data, makeGameState({ seed: 1, party: [bootleg({ id: 'a' })] }))
    expect(state.dex.bootlegOwned).toEqual(['weakling:water'])
    expect(state.dex.bootlegSeen).toEqual(['weakling:water'])
    expect(validateGameState(data, state)).toEqual([])
  })

  it('Bí kíp thường lên quái Bootleg: tỉ lệ 100% uncommon thì thành sticker dán luôn', () => {
    const sure = dataWith({ stickerRarityChances: { uncommon: 100, rare: 0 } })
    const base = makeGameState({ seed: 1, party: [bootleg({ id: 'a' })] })
    const state = {
      ...base,
      nextItemId: 9,
      inventory: makeInventory({}, [], [], [{ skillId: 'flurry', reusable: false, count: 1 }])
    }
    const after = gameReducer(sure, state, {
      type: 'useSkillBook',
      monsterId: 'a',
      item: { storage: 'book', skillId: 'flurry', reusable: false }
    })
    expect(after.party[0].skillIds).toContain('flurry')
    expect(after.party[0].skillStickers.flurry?.id).toBe('s9')
    expect(after.inventory.books).toEqual([])
    expect(after.inventory.stickers).toEqual([])
  })
})

describe('kiểm tra save', () => {
  it('hệ Bootleg lạ báo lỗi', () => {
    const issues = validateMonster(data, bootleg({ bootlegElementId: 'ghostType' }), 'party[0]')
    expect(issues.join()).toContain('bootlegElementId')
  })

  it('khóa Dex Bootleg sai dạng báo lỗi', () => {
    const base = makeGameState({ seed: 1 })
    const state = { ...base, dex: { ...base.dex, bootlegSeen: ['nope'], bootlegOwned: [] } }
    expect(validateGameState(data, state).join()).toContain('dex.bootlegSeen')
  })
})
