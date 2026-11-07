// Kiểm tra dữ liệu, save, migrate và nguồn nhận của sticker skill (docs/rules/skill-stickers.md).

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { asObject } from '../shared'
import { createGameData } from './gameData'
import {
  dataIssuesAfter,
  makeData,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { GameState, StickerAttributeDef, StickerInstance } from '../model'

const attribute = (overrides: Partial<StickerAttributeDef>): StickerAttributeDef => ({
  id: 'bad',
  rarity: 'uncommon',
  weight: 1,
  effect: { type: 'power', params: {} },
  valueParam: 'value',
  range: { min: 1, max: 5 },
  ...overrides
})

const issuesWith = (def: StickerAttributeDef): string[] =>
  dataIssuesAfter((raw) => {
    raw.stickerAttributes.push(def)
  })

describe('kiểm tra dữ liệu', () => {
  it('fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('độ hiếm, loại hiệu ứng, khoảng, điều kiện, lựa chọn sai thì báo lỗi', () => {
    expect(issuesWith(attribute({ rarity: 'epic' as never })).join()).toContain('rarity')
    expect(
      issuesWith(attribute({ effect: { type: 'nope' as never, params: {} } })).join()
    ).toContain('effect.type')
    expect(issuesWith(attribute({ range: { min: 5, max: 1 } })).join()).toContain('min phải ≤ max')
    expect(issuesWith(attribute({ range: undefined })).join()).toContain('range lẫn valueParam')
    expect(issuesWith(attribute({ requires: ['flying' as never] })).join()).toContain('requires')
    expect(issuesWith(attribute({ choices: ['ghostStatus'] })).join()).toContain('ghostStatus')
  })

  it('hook trait của loại `trait` kiểm tra bằng TRAIT_HOOKS', () => {
    const issues = issuesWith(
      attribute({
        effect: { type: 'trait', params: { hooks: [{ type: 'noSuchHook', params: {} }] } },
        valueParam: undefined,
        range: undefined
      })
    )
    expect(issues.join()).toContain('noSuchHook')
  })

  it('config: tỉ lệ ngoài 0–100, trần ô nhỏ hơn số ô gốc', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.stickers = {
        ...raw.config.stickers,
        rarityChances: { uncommon: 120, rare: 1 },
        maxSkillSlots: 2
      }
    })
    expect(issues.join()).toContain('rarityChances.uncommon')
    expect(issues.join()).toContain('maxSkillSlots')
  })
})

const data = makeData()

const sticker = (id: string, skillId = 'strike'): StickerInstance => ({
  id,
  skillId,
  rarity: 'uncommon',
  rolls: [{ attributeId: 'damage', value: 12 }]
})

function savedWith(stickers: StickerInstance[], nextItemId = 10): GameState {
  const base = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
  return { ...base, nextItemId, inventory: { ...base.inventory, stickers } }
}

describe('kiểm tra save', () => {
  it('túi sticker hợp lệ', () => {
    expect(validateGameState(data, savedWith([sticker('s1')]))).toEqual([])
  })

  it('id trùng, nextItemId không lớn hơn id, skill lạ', () => {
    const issues = validateGameState(data, savedWith([sticker('s3'), sticker('s3')], 3))
    expect(issues).toContain('id món trang bị bị trùng "s3"')
    expect(issues).toContain('nextItemId phải lớn hơn mọi id món trang bị (hiện có s3)')
    expect(validateGameState(data, savedWith([sticker('s1', 'ghost')])).join()).toContain('ghost')
  })
})

describe('migrate v111 → v112', () => {
  it('túi sticker rỗng, quái chưa dán sticker', () => {
    const current = asObject(
      serializeState(makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }))
    )
    const { stickers: _stickers, ...inventory } = asObject(current?.inventory) ?? {}
    const party = (Array.isArray(current?.party) ? current.party : []).map((monster: unknown) => {
      const { skillStickers: _skillStickers, ...rest } = asObject(monster) ?? {}
      return rest
    })
    const old = { ...current, version: 111, inventory, party }
    const migrated = migrateState(old, data)
    expect(migrated.inventory.stickers).toEqual([])
    expect(migrated.party[0].skillStickers).toEqual({})
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('nguồn nhận', () => {
  it('mua Bí kíp ở cửa hàng: rare 100% thì thành sticker trong túi', () => {
    const raw = makeRawData()
    raw.config.stickers = { ...raw.config.stickers, rarityChances: { uncommon: 0, rare: 100 } }
    const always = createGameData(withFixtureText(raw))
    const book = { storage: 'book', skillId: 'strike', reusable: false } as const
    const state: GameState = {
      ...makeGameState({ seed: 1, money: 100_000, party: [makeMonster({ id: 'a' })] }),
      shop: { stock: [book] },
      nextItemId: 7
    }
    const after = gameReducer(always, state, { type: 'buyItem', item: book, count: 1 })
    expect(after.inventory.stickers.map((entry) => entry.id)).toEqual(['s7'])
    expect(after.inventory.books).toEqual([])
    expect(after.nextItemId).toBe(8)
    expect(validateGameState(always, after)).toEqual([])
  })
})
