// Dữ liệu mẫu cho phối hợp đội (docs/rules/team.md): cộng hưởng, trận pháp + trận đồ, hợp kích kỹ.
// Số tròn để tính tay; thêm vào fixture chung (makeRawData) nên test cũ không đổi.

import { createGameData } from '../gameData'
import type { GameData, RawGameData } from '../model'
import { makeRawData, withFixtureText } from './fixtures'

const percent = (stats: Record<string, number>): { type: string; params: unknown } => ({
  type: 'statModifier',
  params: { percent: stats }
})

/**
 * makeRawData + phối hợp đội:
 * - cộng hưởng `bruteKin` (race brute): 2 quái +10% công, 3 quái +20% công; `fireAttuned` (hệ lửa):
 *   2 quái +50% sát thương skill lửa.
 * - trận pháp `duality` (≥ 2 hệ khác nhau): mọi quái +10% thủ; `bruteGate` (≥ 2 quái race brute):
 *   chỉ quái brute +50% công; `fireGrass` (đủ hệ lửa và cỏ): miễn hạ bậc mọi chỉ số. Mỗi trận pháp
 *   một trận đồ `<id>Scroll`.
 * - hợp kích kỹ `comboBlaze` (một quái hệ lửa + một quái hệ cỏ; lửa, special, power 100, một mục
 *   tiêu), `comboTwin` (hai quái race brute; thường, physical, power 100, cả địch).
 */
export function makeTeamRawData(): RawGameData {
  const raw = makeRawData()
  raw.synergies = [
    {
      id: 'bruteKin',
      match: { type: 'race', raceId: 'brute' },
      tiers: [
        { count: 2, hooks: [percent({ attack: 10 })] },
        { count: 3, hooks: [percent({ attack: 20 })] }
      ]
    },
    {
      id: 'fireAttuned',
      match: { type: 'element', elementId: 'fire' },
      tiers: [
        {
          count: 2,
          hooks: [{ type: 'elementDamageDealt', params: { elementIds: ['fire'], percent: 50 } }]
        }
      ]
    }
  ]
  raw.formations = [
    {
      id: 'duality',
      requires: [{ type: 'distinctElements', count: 2 }],
      hooks: [percent({ defense: 10 })]
    },
    {
      id: 'bruteGate',
      requires: [{ type: 'race', raceId: 'brute', count: 2 }],
      match: { type: 'race', raceId: 'brute' },
      hooks: [percent({ attack: 50 })]
    },
    {
      id: 'fireGrass',
      requires: [{ type: 'elements', elementIds: ['fire', 'grass'] }],
      hooks: [{ type: 'statLowerImmunity', params: { stats: 'all' } }]
    }
  ]
  raw.items = [
    ...raw.items,
    ...raw.formations.map((formation) => ({
      id: `${formation.id}Scroll`,
      category: 'formationScroll' as const,
      price: 100,
      formationId: formation.id
    }))
  ]
  raw.comboSkills = [
    {
      id: 'comboBlaze',
      pair: [
        { type: 'element', elementId: 'fire' },
        { type: 'element', elementId: 'grass' }
      ],
      elementId: 'fire',
      category: 'special',
      power: 100,
      accuracy: 100,
      priority: 0,
      target: 'enemy',
      effects: []
    },
    {
      id: 'comboTwin',
      pair: [
        { type: 'race', raceId: 'brute' },
        { type: 'race', raceId: 'brute' }
      ],
      elementId: 'normal',
      category: 'physical',
      power: 100,
      accuracy: 100,
      priority: 0,
      target: 'allEnemies',
      effects: []
    }
  ]
  return withFixtureText(raw)
}

export function makeTeamData(): GameData {
  return createGameData(makeTeamRawData())
}
