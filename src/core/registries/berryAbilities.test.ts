// Ripen / Gluttony đổi params hook của berry (registries/berryAbilities.ts, abilities.md mục "Berry").

import { describe, expect, it } from 'vitest'
import type { TraitHookDef } from '../model'
import { adjustBerryHook } from './berryAbilities'

const sitrus: TraitHookDef = {
  type: 'trigger',
  params: {
    on: 'damaged',
    scope: 'self',
    when: [{ if: 'hpBelow', who: 'self', percent: 25 }],
    effects: [
      { do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 25 } },
      { do: 'stage', to: 'self', stats: ['attack'], delta: 1 },
      { do: 'cure', to: 'self', kind: 'debuff' }
    ]
  }
}
const resist: TraitHookDef = {
  type: 'effectivenessModifier',
  params: { side: 'taken', when: 'superEffective', percent: -50 }
}
const custap: TraitHookDef = {
  type: 'actFirstChance',
  params: { chance: 100, hpBelowPercent: 25 }
}

describe('adjustBerryHook', () => {
  it('không có ability: trả lại chính hook', () => {
    expect(adjustBerryHook(sitrus, { ripe: false, early: false })).toBe(sitrus)
  })

  it('Ripen: hồi máu, bậc gấp đôi; berry kháng hệ ×¼; hiệu ứng khác giữ nguyên', () => {
    const ripe = adjustBerryHook(sitrus, { ripe: true, early: false }).params as {
      effects: unknown[]
      when: unknown[]
    }
    expect(ripe.effects).toEqual([
      { do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 50 } },
      { do: 'stage', to: 'self', stats: ['attack'], delta: 2 },
      { do: 'cure', to: 'self', kind: 'debuff' }
    ])
    expect(ripe.when).toEqual([{ if: 'hpBelow', who: 'self', percent: 25 }])
    const resisted = adjustBerryHook(resist, { ripe: true, early: false }).params
    expect(resisted).toMatchObject({ percent: -75 })
    expect(adjustBerryHook(custap, { ripe: true, early: false })).toBe(custap)
  })

  it('Gluttony: ngưỡng 25% thành 50% (trigger và đi trước); ngưỡng khác giữ nguyên', () => {
    const early = adjustBerryHook(sitrus, { ripe: false, early: true }).params as {
      when: unknown[]
    }
    expect(early.when).toEqual([{ if: 'hpBelow', who: 'self', percent: 50 }])
    expect(adjustBerryHook(custap, { ripe: false, early: true }).params).toMatchObject({
      hpBelowPercent: 50
    })
    const half: TraitHookDef = {
      type: 'actFirstChance',
      params: { chance: 100, hpBelowPercent: 50 }
    }
    expect(adjustBerryHook(half, { ripe: false, early: true }).params).toMatchObject({
      hpBelowPercent: 50
    })
  })
})
