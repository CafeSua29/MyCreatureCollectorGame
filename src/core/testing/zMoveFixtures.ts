// Dữ liệu mẫu cho test Z-Move (docs/rules/z-moves.md): trên nền dữ liệu biến hình (có Dynamax), thêm
// Z-Move theo hệ thường / lửa, Z-Move riêng của weakling, skill có zPower / zEffects, Z-Crystal.

import { createGameData } from '../gameData'
import type { GameData, RawGameData, Skill } from '../model'
import { withFixtureText } from './fixtures'
import { makeTransformRawData } from './transformFixtures'

const attack = (id: string, elementId: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  elementId,
  category: 'physical',
  power: 100,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...extra
})

/**
 * Z-Move: breakneckBlitz (thường), infernoOverdrive (lửa); Z-Move riêng của weakling từ "strike":
 * weaklingCrash (power 210). Skill: gigaSwing (power 90, zPower 200), zPumpUp (+2 công, Z-Power
 * +1 tốc độ), farewell (rút về, Z-Power hồi đầy quái vào thay). Crystal: normalZCrystal,
 * fireZCrystal, weaklingZCrystal (loài weakling, skill strike). Trait: echoCast (lặp skill kiểu
 * Multicast), twinStrike (đòn thêm 50% kiểu Parental Bond).
 */
export function makeZMoveRawData(): RawGameData {
  const raw = makeTransformRawData()
  raw.skills.push(
    attack('breakneckBlitz', 'normal', { zMove: 'z' }),
    attack('infernoOverdrive', 'fire', { zMove: 'z' }),
    attack('weaklingCrash', 'normal', { power: 210, zMove: 'signature' }),
    attack('gigaSwing', 'normal', { power: 90, zPower: 200 }),
    {
      ...attack('zPumpUp', 'normal', { category: 'status', power: 0, target: 'self' }),
      effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 2 } }],
      zEffects: [{ do: 'stage', to: 'self', stats: ['speed'], delta: 1 }]
    },
    {
      ...attack('farewell', 'normal', { category: 'status', power: 0, target: 'self' }),
      effects: [{ type: 'switchOut', params: {} }],
      zEffects: [{ do: 'healReplacement', to: 'self' }]
    }
  )
  raw.traits.push(
    {
      id: 'echoCast',
      kind: 'positive',
      hooks: [
        {
          type: 'repeatSkill',
          params: { extra: 1, categories: ['physical', 'special', 'status'] }
        }
      ]
    },
    {
      id: 'twinStrike',
      kind: 'positive',
      hooks: [{ type: 'extraHits', params: { count: 1, damagePercent: 50 } }]
    }
  )
  raw.items.push(
    { id: 'normalZCrystal', category: 'zCrystal', price: 100, elementId: 'normal' },
    { id: 'fireZCrystal', category: 'zCrystal', price: 100, elementId: 'fire' },
    {
      id: 'weaklingZCrystal',
      category: 'zCrystal',
      price: 100,
      baseSkillId: 'strike',
      zSkillId: 'weaklingCrash',
      speciesIds: ['weakling']
    }
  )
  return withFixtureText(raw)
}

export function makeZMoveData(): GameData {
  return createGameData(makeZMoveRawData())
}
