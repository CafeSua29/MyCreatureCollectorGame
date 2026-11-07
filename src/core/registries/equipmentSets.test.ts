import { describe, expect, it } from 'vitest'
import { computeStats } from '../monster'
import {
  equipped,
  held,
  makeEquipment,
  makeEquipmentSetData,
  makeMonster,
  makeSetEquipment
} from '../testing'
import type { EquippedItem } from '../model'
import {
  equipmentSetHooks,
  equipmentSetStates,
  hasActiveSealSet,
  setsSealedFor
} from './equipmentSets'
import { forEachTraitHook } from './traitHooks'

const data = makeEquipmentSetData()

/** n món bộ ngẫu nhiên `setId` (id khác nhau). */
const rolled = (setId: string, n: number, from = 1): EquippedItem[] =>
  Array.from({ length: n }, (_, i) => equipped(makeSetEquipment(setId, { id: `e${from + i}` })))

/** Món bộ đặt tên theo món gốc. */
const piece = (baseItemId: string, id: string, setId: string): EquippedItem =>
  equipped(makeEquipment({ id, baseItemId, setId, rarity: 'rare', rolls: [] }))

const knight = (...baseItemIds: string[]): EquippedItem[] =>
  baseItemIds.map((baseItemId, i) => piece(baseItemId, `k${i}`, 'knight'))

const signet = equipped(makeEquipment({ id: 's1', baseItemId: 'signet', rolls: [] }))

const stateOf = (equipment: EquippedItem[], setId: string): unknown =>
  equipmentSetStates(data, equipment).find((state) => state.setId === setId)

describe('equipmentSetStates: bộ ngẫu nhiên', () => {
  it('bộ 2 món: 1 món chưa kích hoạt, 2 món 1 lần, 5 món 2 lần (mỗi bộ đủ món đều tính)', () => {
    expect(stateOf(rolled('guard', 1), 'guard')).toMatchObject({ count: 1, activeBonuses: 0 })
    expect(stateOf(rolled('guard', 2), 'guard')).toMatchObject({ count: 2, activeBonuses: 1 })
    expect(stateOf(rolled('guard', 5), 'guard')).toMatchObject({ count: 5, activeBonuses: 2 })
  })

  it('bộ 4 món: 3 món chưa kích hoạt, 4 món 1 lần, 8 món 2 lần', () => {
    expect(stateOf(rolled('fatal', 3), 'fatal')).toMatchObject({ activeBonuses: 0 })
    expect(stateOf(rolled('fatal', 4), 'fatal')).toMatchObject({ activeBonuses: 1 })
    expect(stateOf(rolled('fatal', 8), 'fatal')).toMatchObject({ activeBonuses: 2 })
  })

  it('hook nhân theo số lần kích hoạt; quái không có món bộ thì rỗng', () => {
    const hooks = equipmentSetHooks(data, rolled('guard', 4))
    expect(hooks).toEqual([
      {
        hook: { type: 'statModifier', params: { percent: { defense: 15 } } },
        scale: 2,
        setId: 'guard'
      }
    ])
    expect(equipmentSetStates(data, [equipped(makeEquipment())])).toEqual([])
  })

  it('đồ cầm không có bộ; món thiếu setId (món cũ) không thuộc bộ', () => {
    const equipment = [held('sitrusBerry'), equipped(makeEquipment()), ...rolled('guard', 1, 5)]
    expect(stateOf(equipment, 'guard')).toMatchObject({ count: 1, activeBonuses: 0 })
  })

  it('số món cực lớn (1000 món) vẫn đếm đúng', () => {
    expect(stateOf(rolled('guard', 1000), 'guard')).toMatchObject({ activeBonuses: 500 })
  })
})

describe('equipmentSetStates: món vô hình (Intangible)', () => {
  it('bù đúng một món cho bộ còn thiếu một món', () => {
    const equipment = [...rolled('fatal', 3), ...rolled('wild', 1, 10)]
    expect(stateOf(equipment, 'fatal')).toMatchObject({ count: 4, activeBonuses: 1 })
    expect(stateOf(equipment, 'wild')).toBeUndefined()
  })

  it('tối đa một món vô hình có tác dụng', () => {
    const equipment = [...rolled('fatal', 2), ...rolled('wild', 2, 10)]
    expect(stateOf(equipment, 'fatal')).toMatchObject({ count: 2, activeBonuses: 0 })
  })

  it('không bộ nào thiếu đúng một món thì không bù', () => {
    const equipment = [...rolled('guard', 2), ...rolled('wild', 1, 10)]
    expect(stateOf(equipment, 'guard')).toMatchObject({ count: 2, activeBonuses: 1 })
  })
})

describe('equipmentSetStates: bộ đặt tên', () => {
  it('thưởng cộng dồn: 1 món không có, 2 món mốc 2, 3 món cả mốc 2 lẫn 3', () => {
    expect(stateOf(knight('knightHelm'), 'knight')).toMatchObject({ count: 1, activeBonuses: 0 })
    expect(stateOf(knight('knightHelm', 'knightPlate'), 'knight')).toMatchObject({
      activeBonuses: 1
    })
    const full = knight('knightHelm', 'knightPlate', 'knightBlade')
    expect(stateOf(full, 'knight')).toMatchObject({ count: 3, activeBonuses: 2 })
    expect(equipmentSetHooks(data, full).map((entry) => entry.hook.params)).toEqual([
      { percent: { attack: 10 } },
      { percent: { speed: 20 } }
    ])
  })

  it('món trùng chỉ tính một (Diablo II)', () => {
    expect(stateOf(knight('knightHelm', 'knightHelm', 'knightHelm'), 'knight')).toMatchObject({
      count: 1,
      activeBonuses: 0
    })
  })

  it('giảm số món cần: bộ ≥ 3 món được +1, không vượt số món của bộ', () => {
    expect(stateOf([...knight('knightHelm'), signet], 'knight')).toMatchObject({
      count: 2,
      activeBonuses: 1
    })
    const full = [...knight('knightHelm', 'knightPlate', 'knightBlade'), signet]
    expect(stateOf(full, 'knight')).toMatchObject({ count: 3, activeBonuses: 2 })
  })

  it('giảm số món cần: bộ < 3 món không áp, chưa đeo món nào không áp, nhiều món giảm không cộng', () => {
    const twin = piece('twinLeft', 't1', 'twins')
    expect(stateOf([twin, signet], 'twins')).toMatchObject({ count: 1, activeBonuses: 0 })
    expect(stateOf([signet], 'knight')).toBeUndefined()
    const twoSignets = [
      ...knight('knightHelm'),
      signet,
      equipped(makeEquipment({ id: 's2', baseItemId: 'signet', rolls: [] }))
    ]
    expect(stateOf(twoSignets, 'knight')).toMatchObject({ count: 2 })
  })

  it('bộ unique: món unique của boss gom đủ bộ', () => {
    const crown = [
      equipped(
        makeEquipment({
          id: 'u1',
          baseItemId: 'stronglingCrown',
          rarity: 'unique',
          setId: 'crown',
          rolls: []
        })
      ),
      equipped(
        makeEquipment({
          id: 'u2',
          baseItemId: 'stronglingRing',
          rarity: 'unique',
          setId: 'crown',
          rolls: []
        })
      )
    ]
    expect(stateOf(crown, 'crown')).toMatchObject({ count: 2, activeBonuses: 1 })
  })
})

describe('Seal', () => {
  const vampire = rolled('vampire', 2)
  const seal = rolled('seal', 2, 20)

  it('bị Seal: bỏ bộ sealable, giữ bộ khác', () => {
    const equipment = [...vampire, ...rolled('guard', 2, 30)]
    const sealedIds = equipmentSetHooks(data, equipment, { setsSealed: true }).map((h) => h.setId)
    expect(sealedIds).toEqual(['guard'])
    expect(equipmentSetHooks(data, equipment).map((h) => h.setId)).toEqual(['guard', 'vampire'])
  })

  it('địch có Seal kích hoạt mà phe mình không có thì bị Seal; hai bên cùng có thì không', () => {
    const foe = makeMonster({ id: 'foe', equipment: seal })
    const me = makeMonster({ id: 'me', equipment: vampire })
    const myAlly = makeMonster({ id: 'ally', equipment: rolled('seal', 2, 40) })
    expect(hasActiveSealSet(data, seal)).toBe(true)
    expect(hasActiveSealSet(data, rolled('seal', 1, 50))).toBe(false)
    expect(setsSealedFor(data, { foes: [foe], allies: [me] })).toBe(true)
    expect(setsSealedFor(data, { foes: [foe], allies: [me, myAlly] })).toBe(false)
    expect(setsSealedFor(data, { foes: [], allies: [me] })).toBe(false)
  })
})

describe('thưởng bộ trong chỉ số và hook trait', () => {
  it('bộ % chỉ số cộng vào nguồn equipment khi tính chỉ số', () => {
    const plain = computeStats(data, makeMonster({ level: 10, equipment: rolled('guard', 1) }))
    const withSet = computeStats(data, makeMonster({ level: 10, equipment: rolled('guard', 2) }))
    const guardMain = 10
    expect(plain.percentBySource.equipment.defense).toBe(0)
    expect(withSet.percentBySource.equipment.defense).toBe(15)
    // Dòng chính của kiếm (+10% công mỗi món) vẫn tính như cũ.
    expect(withSet.percentBySource.equipment.attack).toBe(2 * guardMain)
  })

  it('hook thưởng bộ có nguồn equipmentSet, id nguồn là id bộ', () => {
    const sources: string[] = []
    forEachTraitHook(
      data,
      makeMonster({ equipment: rolled('vampire', 2) }),
      (_h, _p, scale, id, source) => {
        if (source.kind === 'equipmentSet') sources.push(`${id}×${scale}`)
      }
    )
    expect(sources).toEqual(['vampire×1'])
  })
})
