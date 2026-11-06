// Quy đổi chiêu Temtem (techniques.mjs) và số lần dùng → giá thể lực (staminaCost.mjs): đọc trạng thái / bậc
// chỉ số / hồi / giảm hold từ mô tả wiki, ai nhận hiệu ứng, synergy, mục tiêu; biên của công thức giá.

import { describe, expect, it } from 'vitest'
import { MAX_COST, PALWORLD_WINDOW, costFromUses } from '../staminaCost.mjs'
import { cleanText, convertTechnique, parseEffects } from './techniques.mjs'

const technique = (fields: Record<string, unknown>): Record<string, unknown> => ({
  name: 'Test',
  type: 'Neutral',
  class: 'Physical',
  damage: 80,
  staminaCost: 20,
  hold: 0,
  priority: 'normal',
  synergy: 'None',
  synergyEffects: [],
  targets: 'Single Other Target',
  effectText: '',
  wiki: null,
  ...fields
})

describe('đọc mô tả chiêu', () => {
  it('trạng thái với số lượt, bậc chỉ số, ai nhận', () => {
    const text = cleanText(
      '{{PAGENAME}} deals damage to a single other target and inflicts them with the {{condition|burn|25|1}} Condition for 2 turns, then gifts the user with {{statchange|+2|atk|14|1}}.',
      'Test'
    )
    expect(parseEffects(text)).toEqual([
      { kind: 'status', who: 'target', statusId: 'burnedTemtem', turns: 2 },
      { kind: 'stage', who: 'self', stat: 'attack', delta: 2 }
    ])
  })

  it('"the rival team or the user\'s ally" là địch; countdown; nhắc tới trạng thái để kiểm tra thì bỏ', () => {
    expect(
      parseEffects(
        "X inflicts the rival team or the user's ally with <sleep> Condition for 2 turns."
      )
    ).toEqual([{ kind: 'status', who: 'target', statusId: 'asleepTemtem', turns: 2 }])
    expect(
      parseEffects('X inflicts a single target with a 4 turn countdown of the <doom> Condition.')
    ).toEqual([{ kind: 'status', who: 'target', statusId: 'doomedTemtem', turns: 4 }])
    expect(parseEffects('X deals damage if they are afflicted with <poison>.')).toEqual([])
  })

  it('hồi máu / thể lực, mất máu, giảm hold', () => {
    expect(
      parseEffects(
        "X restores 35% of the user's maximum hp and causes them to lose 20% of their maximum sta."
      )
    ).toEqual([
      { kind: 'hp', who: 'self', percent: 35 },
      { kind: 'sta', who: 'target', percent: -20 }
    ])
    expect(
      parseEffects('X decreases the Hold of all the techniques of a single target by 1.')
    ).toEqual([{ kind: 'hold', who: 'target', turns: 1 }])
  })

  it('trạng thái lạ báo lỗi', () => {
    expect(() => parseEffects('X inflicts them with <weird> Condition.')).toThrow('weird')
  })
})

describe('chiêu → skill', () => {
  it('số theo gốc: power, giá, hold, ưu tiên, hệ, mục tiêu', () => {
    const skill = convertTechnique(
      technique({
        type: 'Fire',
        damage: 110,
        staminaCost: 33,
        hold: 2,
        priority: 'veryhigh',
        targets: 'Other Team or Ally'
      })
    )
    expect(skill).toMatchObject({
      elementId: 'fire',
      category: 'physical',
      power: 110,
      staminaCost: 33,
      hold: 2,
      priority: 2,
      target: 'foesOrAlly',
      fullSpread: true
    })
  })

  it('chiêu trạng thái tốt nhắm phe mình; synergy cộng power theo sát thương mới và hiệu ứng', () => {
    const buff = convertTechnique(
      technique({
        class: 'Status',
        damage: 0,
        targets: 'Single Team',
        effectText: 'X gifts a single team with [spd+2].'
      })
    )
    expect(buff.target).toBe('allAllies')
    const synergy = convertTechnique(
      technique({
        synergy: 'Earth',
        synergyEffects: [{ type: 'damage', damage: 100 }],
        effectText:
          'X deals damage to a single other target. If used with an earth ally, its damage increases to 100 and also inflicts the <seized> Condition for 3 turns.'
      })
    )
    expect(synergy.synergy).toEqual({
      partnerElementIds: ['ground'],
      powerBonusPercent: 25,
      effects: [{ type: 'applyStatus', params: { statusId: 'seizedTemtem', turns: 3 } }]
    })
  })
})

describe('số lần dùng → giá thể lực', () => {
  it('mốc 15 lần = 20, ít lần dùng đắt hơn, kẹp [1, MAX_COST] kể cả số cực lớn / cực nhỏ', () => {
    expect(costFromUses(15)).toBe(20)
    // Palworld: CT 8 giây ≈ 15 lần dùng.
    expect(costFromUses(PALWORLD_WINDOW / 8)).toBe(20)
    expect(costFromUses(5)).toBeGreaterThan(costFromUses(40))
    expect(costFromUses(1)).toBe(MAX_COST)
    expect(costFromUses(1e9)).toBe(1)
    expect(costFromUses(0.0001)).toBe(MAX_COST)
  })
})
