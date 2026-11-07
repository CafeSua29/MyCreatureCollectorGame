// Dán / bóc sticker (docs/rules/skill-stickers.md): dán lên skill đã biết thay sticker cũ, dán skill
// mới học như sách (tương thích, ô, quên skill trả sticker), Compatibility bỏ qua tương thích, bóc về
// túi, túi đầy, mất ô Extra Slots, quên skill khi học / học lại trả sticker, kiểm tra save.
// Fixture: quái a (weakling, cỏ) biết strike; blast (lửa) không tương thích với pine (cỏ, chuỗi
// twig → pine không học blast).

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { capacityOf } from '../registries'
import { toBig } from '../shared'
import {
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { GameAction, GameState, Monster, StickerInstance, StickerRoll } from '../model'
import { validateMonster } from './validateMonster'

const data = makeData()

const sticker = (skillId: string, id: string, rolls: StickerRoll[] = []): StickerInstance => ({
  id,
  skillId,
  rarity: 'uncommon',
  rolls
})

const monsterA = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', skillIds: ['strike'], ...overrides })

function stateWith(monster: Monster, stickers: StickerInstance[]): GameState {
  const base = makeGameState({ seed: 1, party: [monster] })
  return {
    ...base,
    money: toBig(100_000),
    nextItemId: 50,
    inventory: { ...base.inventory, stickers }
  }
}

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const owned = (state: GameState): Monster => state.party[0]

describe('dán sticker', () => {
  it('skill đã biết: dán lên, sticker cũ về túi', () => {
    const old = sticker('strike', 's1')
    const next = sticker('strike', 's2', [{ attributeId: 'damage', value: 10 }])
    const state = stateWith(monsterA({ skillStickers: { strike: old } }), [next])
    const after = act(state, { type: 'applySticker', monsterId: 'a', stickerId: 's2' })
    expect(owned(after).skillStickers.strike).toEqual(next)
    expect(after.inventory.stickers).toEqual([old])
    expect(owned(after).skillIds).toEqual(['strike'])
  })

  it('skill mới còn ô: học ngay, ghi skill ngoài learnset, rời danh sách chờ', () => {
    const state = stateWith(monsterA({ pendingSkillIds: ['flurry'] }), [sticker('flurry', 's1')])
    const after = act(state, { type: 'applySticker', monsterId: 'a', stickerId: 's1' })
    expect(owned(after).skillIds).toEqual(['strike', 'flurry'])
    expect(owned(after).extraSkillIds).toContain('flurry')
    expect(owned(after).pendingSkillIds).toEqual([])
    expect(after.inventory.stickers).toEqual([])
  })

  it('đủ ô: phải quên một skill, sticker trên skill đó về túi', () => {
    const forgotten = sticker('toxin', 's9')
    const full = monsterA({
      skillIds: ['strike', 'toxin', 'idle', 'sap'],
      skillStickers: { toxin: forgotten }
    })
    const state = stateWith(full, [sticker('flurry', 's1')])
    expectActionError(
      () => act(state, { type: 'applySticker', monsterId: 'a', stickerId: 's1' }),
      'mustForgetSkill'
    )
    const after = act(state, {
      type: 'applySticker',
      monsterId: 'a',
      stickerId: 's1',
      replaceSkillId: 'toxin'
    })
    expect(owned(after).skillIds).toEqual(['strike', 'flurry', 'idle', 'sap'])
    expect(Object.keys(owned(after).skillStickers)).toEqual(['flurry'])
    expect(after.inventory.stickers).toEqual([forgotten])
  })

  it('không tương thích: lỗi, state giữ nguyên; Compatibility thì dán được', () => {
    const pine = monsterA({ speciesId: 'pine', baseSpeciesId: 'pine' })
    const state = stateWith(pine, [sticker('blast', 's1')])
    expectActionError(
      () => act(state, { type: 'applySticker', monsterId: 'a', stickerId: 's1' }),
      'stickerIncompatible'
    )
    const any = stateWith(pine, [sticker('blast', 's1', [{ attributeId: 'compatibility' }])])
    const after = act(any, { type: 'applySticker', monsterId: 'a', stickerId: 's1' })
    expect(owned(after).skillIds).toContain('blast')
  })

  it('Extra Slots: dán lên skill mới khi đủ ô thì thêm ô, không phải quên', () => {
    const full = monsterA({ skillIds: ['strike', 'toxin', 'idle', 'sap'] })
    const state = stateWith(full, [sticker('flurry', 's1', [{ attributeId: 'extraSlot' }])])
    const after = act(state, { type: 'applySticker', monsterId: 'a', stickerId: 's1' })
    expect(owned(after).skillIds).toHaveLength(5)
  })

  it('lỗi: không có sticker, trong trận', () => {
    const state = stateWith(monsterA(), [])
    expectActionError(
      () => act(state, { type: 'applySticker', monsterId: 'a', stickerId: 's1' }),
      'stickerNotFound'
    )
    const battle = makeBattleState([monsterA()], [makeMonster({ id: 'wild' })])
    expectActionError(
      () => act(battle, { type: 'applySticker', monsterId: 'a', stickerId: 's1' }),
      'inBattle'
    )
  })
})

describe('bóc sticker', () => {
  it('sticker về túi, quái vẫn giữ skill', () => {
    const on = sticker('strike', 's1')
    const state = stateWith(monsterA({ skillStickers: { strike: on } }), [])
    const after = act(state, { type: 'peelSticker', monsterId: 'a', skillId: 'strike' })
    expect(owned(after).skillStickers).toEqual({})
    expect(owned(after).skillIds).toEqual(['strike'])
    expect(after.inventory.stickers).toEqual([on])
  })

  it('lỗi: skill không có sticker, túi đầy, mất ô Extra Slots đang dùng', () => {
    const on = sticker('strike', 's1', [{ attributeId: 'extraSlot' }])
    const plain = stateWith(monsterA(), [])
    expectActionError(
      () => act(plain, { type: 'peelSticker', monsterId: 'a', skillId: 'strike' }),
      'noSticker'
    )
    const base = stateWith(monsterA({ skillStickers: { strike: sticker('strike', 's1') } }), [])
    const filler = Array.from({ length: capacityOf(data, base, 'bag') }, (_, i) =>
      sticker('strike', `s${i + 100}`)
    )
    const full = { ...base, inventory: { ...base.inventory, stickers: filler } }
    expectActionError(
      () => act(full, { type: 'peelSticker', monsterId: 'a', skillId: 'strike' }),
      'bagFull'
    )
    const five = stateWith(
      monsterA({
        skillIds: ['strike', 'toxin', 'idle', 'sap', 'flurry'],
        skillStickers: { strike: on }
      }),
      []
    )
    expectActionError(
      () => act(five, { type: 'peelSticker', monsterId: 'a', skillId: 'strike' }),
      'stickerSlotInUse'
    )
  })
})

describe('quên skill', () => {
  it('học skill chờ thay skill có sticker: sticker về túi', () => {
    const on = sticker('toxin', 's1')
    const monster = monsterA({
      skillIds: ['strike', 'toxin', 'idle', 'sap'],
      pendingSkillIds: ['flurry'],
      skillStickers: { toxin: on }
    })
    const after = act(stateWith(monster, []), {
      type: 'learnPendingSkill',
      monsterId: 'a',
      skillId: 'flurry',
      forgetSkillId: 'toxin'
    })
    expect(owned(after).skillStickers).toEqual({})
    expect(after.inventory.stickers).toEqual([on])
  })
})

describe('mất quái', () => {
  it('thả quái: sticker về túi; túi không đủ chỗ thì cần xác nhận bagOverflow', () => {
    const on = sticker('strike', 's1')
    const other = makeMonster({ id: 'b' })
    const state = {
      ...stateWith(monsterA({ skillStickers: { strike: on } }), []),
      party: [monsterA({ skillStickers: { strike: on } }), other]
    }
    const after = act(state, { type: 'releaseMonster', monsterId: 'a' })
    expect(after.inventory.stickers).toEqual([on])
    const filler = Array.from({ length: capacityOf(data, state, 'bag') }, (_, i) =>
      sticker('strike', `s${i + 100}`)
    )
    const full = { ...state, inventory: { ...state.inventory, stickers: filler } }
    expectActionError(() => act(full, { type: 'releaseMonster', monsterId: 'a' }), 'bagOverflow')
    const confirmed = act(full, { type: 'releaseMonster', monsterId: 'a', discardOverflow: true })
    expect(confirmed.inventory.stickers).toEqual(filler)
  })
})

describe('kiểm tra save', () => {
  it('sticker trên skill quái không biết, sai skill, thuộc tính lạ thì báo lỗi', () => {
    const bad = monsterA({
      skillStickers: {
        toxin: sticker('toxin', 's1'),
        strike: sticker('toxin', 's2', [{ attributeId: 'nope' }])
      }
    })
    const issues = validateMonster(data, bad, 'party[0]')
    expect(issues.some((issue) => issue.includes('quái không biết skill này'))).toBe(true)
    expect(issues.some((issue) => issue.includes('skillId phải là "strike"'))).toBe(true)
    expect(issues.some((issue) => issue.includes('không tồn tại "nope"'))).toBe(true)
  })

  it('giá trị ngoài khoảng, thiếu lựa chọn, thuộc tính trùng', () => {
    const bad = monsterA({
      skillStickers: {
        strike: sticker('strike', 's1', [
          { attributeId: 'damage', value: 999 },
          { attributeId: 'damage', value: 10 }
        ])
      }
    })
    const issues = validateMonster(data, bad, 'party[0]')
    expect(issues.some((issue) => issue.includes('value phải nguyên trong [10, 20]'))).toBe(true)
    expect(issues.some((issue) => issue.includes('thuộc tính trùng'))).toBe(true)
  })

  it('quái hợp lệ có sticker Extra Slots giữ 5 skill', () => {
    const ok = monsterA({
      skillIds: ['strike', 'toxin', 'idle', 'sap', 'flurry'],
      skillStickers: { strike: sticker('strike', 's1', [{ attributeId: 'extraSlot' }]) }
    })
    expect(validateMonster(data, ok)).toEqual([])
  })
})
