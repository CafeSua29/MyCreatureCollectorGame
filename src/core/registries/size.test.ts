import { describe, expect, it } from 'vitest'
import { createGameData, tryCreateGameData } from '../gameData'
import { computeStats } from '../monster'
import { defined, makeMonster, makeRawData } from '../testing'
import type { GameData, Monster, NormalSpecies, StatName } from '../model'
import {
  hasPartyRoom,
  isLargeMonster,
  monsterSize,
  partyAfterJoining,
  partySlotsUsed,
  speciesSize
} from './size'

type RawData = ReturnType<typeof makeRawData>

function dataWith(edit: (raw: RawData) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(raw)
}

const setWeight = (raw: RawData, speciesId: string, weightKg: number): void => {
  const species = defined(raw.species.find((s) => s.id === speciesId))
  if (species.kind === 'normal') species.weightKg = weightKg
}

// oak: quái lớn đúng ngưỡng (1000 kg); weakling: thường.
const data = dataWith((raw) => setWeight(raw, 'oak', 1000))
const oak = (id = 'L'): Monster => makeMonster({ id, speciesId: 'oak', baseSpeciesId: 'oak' })
const small = (id: string): Monster => makeMonster({ id })

describe('kích cỡ quái theo cân nặng', () => {
  it('cân nặng ≥ largeWeightKg là quái lớn, dưới ngưỡng là thường', () => {
    expect(speciesSize(data, data.species.oak as NormalSpecies)).toBe('large')
    expect(monsterSize(data, oak())).toBe('large')
    expect(monsterSize(data, small('a'))).toBe('normal')
    const below = dataWith((raw) => setWeight(raw, 'oak', 999.99))
    expect(isLargeMonster(below, oak())).toBe(false)
  })

  it('cân nặng cực lớn vẫn là quái lớn; loài không tồn tại coi là thường', () => {
    const huge = dataWith((raw) => setWeight(raw, 'oak', 1e300))
    expect(isLargeMonster(huge, oak())).toBe(true)
    expect(monsterSize(data, { speciesId: 'nope', baseSpeciesId: 'nope' })).toBe('normal')
  })

  it('quái fuse theo loài gốc', () => {
    const fused = { ...oak(), speciesId: data.config.fusedSpeciesId }
    expect(isLargeMonster(data, fused)).toBe(true)
  })

  it('chỉ số quái lớn × statMultipliers (mặc định chỉ hp ×2), chỉ số không ghi giữ nguyên', () => {
    const normal = dataWith((raw) => setWeight(raw, 'oak', 1))
    const large = computeStats(data, oak()).final
    const plain = computeStats(normal, oak()).final
    expect(large.hp.toNumber()).toBe(plain.hp.toNumber() * 2)
    expect(large.attack.toNumber()).toBe(plain.attack.toNumber())
    const tough = dataWith((raw) => {
      setWeight(raw, 'oak', 1000)
      raw.config.size.statMultipliers = { hp: 3, defense: 1.5 }
    })
    const toughStats = computeStats(tough, oak()).final
    expect(toughStats.hp.toNumber()).toBe(plain.hp.toNumber() * 3)
    expect(toughStats.defense.toNumber()).toBe(Math.floor(plain.defense.toNumber() * 1.5))
    expect(toughStats.speed.toNumber()).toBe(plain.speed.toNumber())
  })
})

describe('ô đội', () => {
  it('quái lớn chiếm largePartySlots ô; đội tối đa partySize ô', () => {
    expect(partySlotsUsed(data, [oak(), small('a')])).toBe(3)
    expect(partySlotsUsed(data, [])).toBe(0)
    const five = [oak('L1'), oak('L2'), small('a')]
    expect(hasPartyRoom(data, five, small('b'))).toBe(true)
    expect(hasPartyRoom(data, five, oak('L3'))).toBe(false)
    expect(hasPartyRoom(data, [oak('L1'), oak('L2')], oak('L3'))).toBe(true)
  })

  it('quái mới vào lần lượt: quái lớn không đủ ô về kho, quái sau vẫn vào được', () => {
    const party = [oak('L1'), oak('L2'), small('a')]
    const joined = partyAfterJoining(data, party, [oak('L3'), small('b')])
    expect(joined.map((m) => m.id)).toEqual(['L1', 'L2', 'a', 'b'])
  })

  it('kiểm tra dữ liệu: số size hợp lệ', () => {
    const issues = (edit: (raw: RawData) => void): string => {
      const raw = makeRawData()
      edit(raw)
      const result = tryCreateGameData(raw)
      return result.ok ? '' : result.issues.join('\n')
    }
    expect(issues(() => undefined)).toBe('')
    expect(issues((raw) => (raw.config.size.largePartySlots = 7))).toMatch(
      /largePartySlots không được lớn hơn partySize/
    )
    expect(issues((raw) => (raw.config.size.statMultipliers = { hp: 0 }))).toMatch(
      /size.statMultipliers.hp/
    )
    // Dữ liệu JSON có thể ghi chỉ số lạ: ép kiểu để giả lập JSON sai.
    const unknownStat = { luck: 2 } as unknown as Partial<Record<StatName, number>>
    expect(issues((raw) => (raw.config.size.statMultipliers = unknownStat))).toMatch(
      /chỉ số lạ "luck"/
    )
    expect(issues((raw) => (raw.config.size.damageMultiplier = 0))).toMatch(/size.damageMultiplier/)
    expect(issues((raw) => (raw.config.size.largeWeightKg = 0))).toMatch(/size.largeWeightKg/)
  })
})
