import { describe, expect, it } from 'vitest'
import { validateMonster } from './validateMonster'
import { FIXTURE_RACE_TRAIT_ID, makeData, makeMonster } from '../testing'

const data = makeData()

describe('validateMonster — trait race', () => {
  it('quái không lưu trait race là hợp lệ', () => {
    expect(validateMonster(data, makeMonster())).toEqual([])
  })

  it('trait race lưu trên quái thì báo lỗi (trait race luôn suy ra từ race)', () => {
    const monster = makeMonster({ traits: [{ id: FIXTURE_RACE_TRAIT_ID, level: 1 }] })
    expect(validateMonster(data, monster, 'party[0]')).toContain(
      `party[0]: trait "${FIXTURE_RACE_TRAIT_ID}" loại "race" không được lưu trong traits`
    )
  })

  it('trait race không tính vào ô trait', () => {
    const monster = makeMonster({
      traitSlots: 3,
      traits: [
        { id: 'fast', level: 1 },
        { id: 'armored', level: 1 },
        { id: 'mighty', level: 1 }
      ]
    })
    expect(validateMonster(data, monster)).toEqual([])
  })
})
