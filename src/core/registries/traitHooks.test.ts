import { describe, expect, it } from 'vitest'
import { forEachTraitHook, raceTraitIds } from './traitHooks'
import { makeMonster, makeRaceTraitData, NEUTRAL_RACE_TRAIT_IDS } from '../testing'

const data = makeRaceTraitData()

describe('forEachTraitHook — trait race', () => {
  it('raceTraitIds suy ra từ raceId của quái', () => {
    expect(raceTraitIds(data, makeMonster())).toEqual(NEUTRAL_RACE_TRAIT_IDS)
    expect(raceTraitIds(data, makeMonster({ raceId: 'brute' }))).toEqual(['raceMark'])
  })

  it('chạy trait đang lưu trước, rồi trait race luôn ở cấp 1 (scale 1)', () => {
    const scales: number[] = []
    const damageTaken: number[] = []
    const monster = makeMonster({ traits: [{ id: 'thickSkin', level: 6 }] })
    forEachTraitHook(data, monster, (handler, params, scale) => {
      scales.push(scale)
      const multiplier = handler.modifyDamageTaken?.(params, scale, {
        data,
        attacker: monster,
        defender: monster,
        skill: data.skills.strike,
        effectiveness: 1,
        power: 40,
        attackerHpRatio: 1,
        defenderHpRatio: 1
      })
      if (multiplier !== undefined) damageTaken.push(multiplier)
    })
    // thickSkin cấp 6: scale 2; neutralMight, neutralHide: scale 1.
    expect(scales).toEqual([2, 1, 1])
    // thickSkin −50% × 2 = −100% → 0; neutralHide −50% → 0,5.
    expect(damageTaken).toEqual([0, 0.5])
  })

  it('quái không lưu trait vẫn có trait race', () => {
    let count = 0
    forEachTraitHook(data, makeMonster(), () => count++)
    expect(count).toBe(NEUTRAL_RACE_TRAIT_IDS.length)
  })
})
