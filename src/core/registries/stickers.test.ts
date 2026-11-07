// Sticker skill (docs/rules/skill-stickers.md): tung độ hiếm, số thuộc tính theo độ hiếm, `requires` /
// hệ lọc thuộc tính, không trùng, nhận Bí kíp (sticker / sách thường / túi đầy / Chân kinh / số cực
// lớn), hiệu lực chỉ áp đúng skill, "per empty slot", ô Extra Slots, hook trait lên quái.
// Fixture: thuộc tính mẫu ở fixtures.ts (stickerAttributes); strike (gây sát thương), toxin (gây độc),
// idle (trạng thái lên mình, không gây sát thương).

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { computeStats, emptySkillSlots, skillCapacity } from '../monster'
import { createRng, type RngState } from '../shared'
import { makeGameState, makeMonster, makeRawData } from '../testing'
import type { GameData, StickerConfig, StickerInstance, StickerRarity, StickerRoll } from '../model'
import {
  isAttributeCompatible,
  receiveBooks,
  rollSticker,
  rollStickerRarity,
  stickerIdNumber,
  stickerInstanceId,
  stickerSkillBonus,
  stickerTraitHooks
} from './stickers'
import { capacityOf } from './capacity'

function dataWith(edit: Partial<StickerConfig> = {}): GameData {
  const raw = makeRawData()
  raw.config.stickers = { ...raw.config.stickers, ...edit }
  return createGameData(raw)
}

const data = dataWith()

const sticker = (skillId: string, rolls: StickerRoll[], id = 's1'): StickerInstance => ({
  id,
  skillId,
  rarity: 'rare',
  rolls
})

describe('id sticker', () => {
  it('dạng s<số>, đọc ngược được; id khác dạng thì null', () => {
    expect(stickerInstanceId(12)).toBe('s12')
    expect(stickerIdNumber('s12')).toBe(12)
    expect(stickerIdNumber('e12')).toBeNull()
  })
})

describe('tung độ hiếm', () => {
  it('tỉ lệ 0 không ra sticker, không tốn RNG', () => {
    const rng = createRng(1)
    expect(rollStickerRarity(data, rng)).toEqual([null, rng])
  })

  it('rare 100% luôn rare; chỉ uncommon 100% thì uncommon', () => {
    expect(
      rollStickerRarity(dataWith({ rarityChances: { uncommon: 0, rare: 100 } }), createRng(1))[0]
    ).toBe('rare')
    expect(
      rollStickerRarity(dataWith({ rarityChances: { uncommon: 100, rare: 0 } }), createRng(1))[0]
    ).toBe('uncommon')
  })

  /** Tỉ lệ ra từng độ hiếm sau `total` lần tung. */
  function rates(
    chances: Record<StickerRarity, number>,
    total: number
  ): Record<'uncommon' | 'rare' | 'none', number> {
    const real = dataWith({ rarityChances: chances })
    let rng: RngState = createRng(7)
    const counts = { uncommon: 0, rare: 0, none: 0 }
    for (let i = 0; i < total; i++) {
      let rarity: StickerRarity | null
      ;[rarity, rng] = rollStickerRarity(real, rng)
      counts[rarity ?? 'none']++
    }
    return {
      uncommon: counts.uncommon / total,
      rare: counts.rare / total,
      none: counts.none / total
    }
  }

  it('tỉ lệ tuyệt đối như gốc (5% uncommon, 1,25% rare) trong sai số', () => {
    const result = rates({ uncommon: 5, rare: 1.25 }, 40_000)
    expect(result.rare).toBeCloseTo(0.0125, 2)
    expect(result.uncommon).toBeCloseTo(0.05, 2)
  })

  it('tỉ lệ Bootleg (66,6% / 16,7%): còn lại 16,7% Bí kíp thường', () => {
    const result = rates({ uncommon: 66.6, rare: 16.7 }, 20_000)
    expect(result.uncommon).toBeCloseTo(0.666, 1)
    expect(result.rare).toBeCloseTo(0.167, 1)
    expect(result.none).toBeCloseTo(0.167, 1)
  })

  it('tổng 100: luôn ra sticker', () => {
    expect(rates({ uncommon: 50, rare: 50 }, 1000).none).toBe(0)
  })
})

describe('tung thuộc tính', () => {
  const rarityOf = (roll: StickerRoll): string => data.stickerAttributes[roll.attributeId].rarity

  it('uncommon: 1–2 thuộc tính uncommon, hợp với skill, không trùng', () => {
    let rng: RngState = createRng(3)
    const sizes = new Set<number>()
    for (let i = 0; i < 200; i++) {
      let result: StickerInstance
      ;[result, rng] = rollSticker(data, rng, { id: 's1', skillId: 'strike', rarity: 'uncommon' })
      sizes.add(result.rolls.length)
      expect(result.rolls.every((roll) => rarityOf(roll) === 'uncommon')).toBe(true)
      const ids = result.rolls.map((roll) => roll.attributeId)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) {
        expect(isAttributeCompatible(data.stickerAttributes[id], data.skills.strike)).toBe(true)
      }
    }
    expect([...sizes].sort()).toEqual([1, 2])
  })

  it('rare: 1–2 uncommon + đúng 1 rare, tối đa 3', () => {
    let rng: RngState = createRng(5)
    for (let i = 0; i < 100; i++) {
      let result: StickerInstance
      ;[result, rng] = rollSticker(data, rng, { id: 's1', skillId: 'strike', rarity: 'rare' })
      expect(result.rolls.filter((roll) => rarityOf(roll) === 'rare')).toHaveLength(1)
      expect(result.rolls.length).toBeGreaterThanOrEqual(2)
      expect(result.rolls.length).toBeLessThanOrEqual(3)
    }
  })

  it('maxAttributes cắt số thuộc tính', () => {
    const capped = dataWith({ maxAttributes: 1 })
    const [result] = rollSticker(capped, createRng(1), {
      id: 's1',
      skillId: 'strike',
      rarity: 'rare'
    })
    expect(result.rolls).toHaveLength(1)
  })

  it('requires lọc theo skill: skill không gây sát thương không ra thuộc tính cần damaging', () => {
    let rng: RngState = createRng(9)
    for (let i = 0; i < 100; i++) {
      let result: StickerInstance
      ;[result, rng] = rollSticker(data, rng, { id: 's1', skillId: 'idle', rarity: 'rare' })
      for (const roll of result.rolls) {
        expect(data.stickerAttributes[roll.attributeId].requires ?? []).not.toContain('damaging')
      }
    }
    expect(isAttributeCompatible(data.stickerAttributes.statusDuration, data.skills.toxin)).toBe(
      true
    )
    expect(isAttributeCompatible(data.stickerAttributes.statusDuration, data.skills.strike)).toBe(
      false
    )
  })

  it('elementIds chỉ cho skill đúng hệ', () => {
    const attribute = { ...data.stickerAttributes.heal, elementIds: ['fire'] }
    expect(isAttributeCompatible(attribute, data.skills.blast)).toBe(true)
    expect(isAttributeCompatible(attribute, data.skills.strike)).toBe(false)
  })

  it('cùng RNG cho cùng sticker', () => {
    const input = { id: 's1', skillId: 'strike', rarity: 'rare' } as const
    expect(rollSticker(data, createRng(4), input)).toEqual(rollSticker(data, createRng(4), input))
  })
})

describe('nhận Bí kíp', () => {
  const always = dataWith({ rarityChances: { uncommon: 0, rare: 100 } })
  const state = makeGameState({ seed: 1 })

  it('Bí kíp thành sticker riêng trong túi, id từ nextItemId', () => {
    const received = receiveBooks(always, state, { skillId: 'strike', reusable: false }, 2)
    expect(received.stickers.map((entry) => entry.id)).toEqual([
      stickerInstanceId(state.nextItemId),
      stickerInstanceId(state.nextItemId + 1)
    ])
    expect(received.inventory.stickers).toEqual(received.stickers)
    expect(received.inventory.books).toEqual([])
    expect(received.nextItemId).toBe(state.nextItemId + 2)
  })

  it('Chân kinh không tung, vẫn là sách', () => {
    const received = receiveBooks(always, state, { skillId: 'strike', reusable: true }, 1)
    expect(received.stickers).toEqual([])
    expect(received.rng).toEqual(state.rng)
    expect(received.inventory.books).toEqual([{ skillId: 'strike', reusable: true, count: 1 }])
  })

  it('túi đầy: sách thường, không tốn RNG', () => {
    const full = { ...state, capacity: { ...state.capacity, bag: 0 } }
    const capacity = capacityOf(always, full, 'bag')
    const filled = {
      ...full,
      inventory: {
        ...full.inventory,
        stickers: Array.from({ length: capacity }, (_, i) => sticker('strike', [], `s${i + 100}`))
      }
    }
    const received = receiveBooks(always, filled, { skillId: 'strike', reusable: false }, 3)
    expect(received.stickers).toEqual([])
    expect(received.rng).toEqual(filled.rng)
    expect(received.inventory.books).toEqual([{ skillId: 'strike', reusable: false, count: 3 }])
  })

  it('số cực lớn: tỉ lệ 0 không lặp từng cuốn; tỉ lệ > 0 dừng khi túi đầy', () => {
    const huge = Number.MAX_SAFE_INTEGER
    const plain = receiveBooks(data, state, { skillId: 'strike', reusable: false }, huge)
    expect(plain.inventory.books[0].count).toBe(huge)
    const rolled = receiveBooks(always, state, { skillId: 'strike', reusable: false }, huge)
    expect(rolled.stickers).toHaveLength(capacityOf(always, state, 'bag'))
    expect(rolled.inventory.books[0].count).toBe(huge - rolled.stickers.length)
  })
})

describe('hiệu lực lên skill', () => {
  const holder = makeMonster({
    skillIds: ['strike', 'toxin'],
    skillStickers: {
      strike: sticker('strike', [
        { attributeId: 'damage', value: 15 },
        { attributeId: 'damagePerSlot', value: 5 },
        { attributeId: 'extraHit' }
      ])
    }
  })

  it('chỉ áp cho đúng skill mang sticker', () => {
    const bonus = stickerSkillBonus(data, holder, 'strike')
    // 2 ô trống (4 ô, biết 2 skill): 15 + 5 × 2.
    expect(emptySkillSlots(data, holder)).toBe(2)
    expect(bonus.powerPercent).toBe(25)
    expect(bonus.extraHits).toBe(1)
    expect(stickerSkillBonus(data, holder, 'toxin').powerPercent).toBe(0)
  })

  it('per empty slot = 0 khi đủ ô', () => {
    const full = { ...holder, skillIds: ['strike', 'toxin', 'idle', 'blast'] }
    expect(stickerSkillBonus(data, full, 'strike').powerPercent).toBe(15)
  })

  it('Extra Slots +1 ô, kẹp trần maxSkillSlots', () => {
    const slotted = makeMonster({
      skillIds: ['strike', 'toxin'],
      skillStickers: {
        strike: sticker('strike', [{ attributeId: 'extraSlot' }]),
        toxin: sticker('toxin', [{ attributeId: 'extraSlot' }], 's2')
      }
    })
    expect(skillCapacity(data, slotted)).toBe(6)
    expect(skillCapacity(dataWith({ maxSkillSlots: 5 }), slotted)).toBe(5)
  })

  it('hook trait lên quái: chỉ số bị động tăng tốc độ', () => {
    const plain = makeMonster({ skillIds: ['strike'] })
    const passive = {
      ...plain,
      skillStickers: { strike: sticker('strike', [{ attributeId: 'passiveSpeed', value: 10 }]) }
    }
    expect(stickerTraitHooks(data, passive)).toEqual([
      { hook: { type: 'statModifier', params: { percent: { speed: 10 } } }, stickerId: 's1' }
    ])
    const fast = computeStats(data, passive).final.speed
    expect(fast.gt(computeStats(data, plain).final.speed)).toBe(true)
  })

  it('thay chỗ giữ $skill trong hook', () => {
    const starter = {
      ...makeMonster({ skillIds: ['strike'] }),
      skillStickers: { strike: sticker('strike', [{ attributeId: 'useAtRoundEnd', value: 100 }]) }
    }
    const [entry] = stickerTraitHooks(data, starter)
    expect(JSON.stringify(entry.hook)).toContain('"skillId":"strike"')
    expect(JSON.stringify(entry.hook)).toContain('"chance":100')
  })
})
