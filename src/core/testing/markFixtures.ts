// Dữ liệu dấu ấn cho test (docs/rules/marks.md): đủ năm loại trên bộ phận / trạng thái / môi trường
// của fixture, tỉ lệ 0 (test tự bật tỉ lệ cần đo).

import { createGameData } from '../gameData'
import type { GameData, MarkConfig, MarkDef, RawGameData } from '../model'
import { makeRawData, withFixtureText } from './fixtures'

/** Mục dấu ấn của fixture. */
export const FIXTURE_MARKS: MarkDef[] = [
  {
    id: 'blindEye',
    kind: 'scar',
    partId: 'head',
    weight: 1,
    hooks: [{ type: 'accuracyModifier', params: { percent: -10 } }],
    hardensInto: 'warScarHead'
  },
  {
    id: 'chestWound',
    kind: 'scar',
    partId: 'torso',
    weight: 1,
    hooks: [{ type: 'statModifier', params: { percent: { defense: -10 } } }]
  },
  {
    id: 'deepBurn',
    kind: 'scar',
    partId: 'torso',
    weight: 1,
    statusIds: ['burn'],
    hooks: [{ type: 'statModifier', params: { percent: { defense: -20 } } }]
  },
  {
    id: 'limp',
    kind: 'scar',
    partId: 'legs',
    weight: 1,
    hooks: [{ type: 'statModifier', params: { percent: { speed: -10 } } }]
  },
  {
    id: 'tornWing',
    kind: 'scar',
    partId: 'wings',
    weight: 1,
    hooks: [{ type: 'statModifier', params: { percent: { speed: -10 } } }]
  },
  {
    id: 'stoneHorn',
    kind: 'mutation',
    partId: 'head',
    weight: 1,
    hooks: [{ type: 'statModifier', params: { percent: { defense: 10 } } }]
  },
  {
    id: 'thirdEye',
    kind: 'mutation',
    partId: 'head',
    weight: 1,
    maxLevel: 2,
    hooks: [{ type: 'accuracyModifier', params: { percent: 10 } }]
  },
  {
    id: 'springLegs',
    kind: 'mutation',
    partId: 'legs',
    weight: 1,
    inheritPercent: 100,
    hooks: [{ type: 'statModifier', params: { percent: { speed: 20, defense: -10 } } }]
  },
  {
    id: 'batWings',
    kind: 'mutation',
    partId: 'wings',
    weight: 1,
    traitId: 'fast',
    hooks: []
  },
  {
    id: 'elementAdapted',
    kind: 'adaptation',
    target: 'element',
    threshold: 2,
    maxLevel: 3,
    hooks: [{ type: 'elementDamageTaken', params: { elementIds: ['$target'], percent: -10 } }]
  },
  {
    id: 'statusAdapted',
    kind: 'adaptation',
    target: 'status',
    threshold: 1,
    hooks: [{ type: 'debuffResist', params: { chance: 10, statusIds: ['$target'] } }]
  },
  {
    id: 'weatherAdapted',
    kind: 'adaptation',
    target: 'weather',
    threshold: 1,
    hooks: [
      {
        type: 'statModifierInWeather',
        params: { weatherIds: ['$target'], percent: { attack: 10 } }
      }
    ]
  },
  {
    id: 'fearSpecies',
    kind: 'trauma',
    target: 'species',
    resolveInto: 'conquerSpecies',
    hooks: [
      {
        type: 'damageDealtModifier',
        params: {
          percent: -50,
          when: [{ if: 'species', who: 'other', speciesIds: ['$target'] }]
        }
      }
    ]
  },
  {
    id: 'conquerSpecies',
    kind: 'trophy',
    trigger: 'resolve',
    target: 'species',
    hooks: [
      {
        type: 'damageDealtModifier',
        params: { percent: 50, when: [{ if: 'species', who: 'other', speciesIds: ['$target'] }] }
      }
    ]
  },
  {
    id: 'bossSlayer',
    kind: 'trophy',
    trigger: 'bossKill',
    hooks: [{ type: 'statModifier', params: { percent: { attack: 5 } } }]
  },
  {
    id: 'worldBossVeteran',
    kind: 'trophy',
    trigger: 'worldBoss',
    hooks: [{ type: 'statModifier', params: { percent: { attack: 5 } } }]
  },
  {
    id: 'raceSlayer',
    kind: 'trophy',
    trigger: 'raceKills',
    target: 'race',
    threshold: 2,
    hooks: [{ type: 'damageVsRace', params: { raceIds: ['$target'], percent: 10 } }]
  },
  {
    id: 'tribulationSurvivor',
    kind: 'trophy',
    trigger: 'tribulation',
    hooks: [{ type: 'statModifier', params: { percent: { hp: 5 } } }]
  },
  {
    id: 'warScarHead',
    kind: 'trophy',
    trigger: 'hardened',
    partId: 'head',
    hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }]
  }
]

/** Dữ liệu fixture có dấu ấn; `config` ghi đè số của config.marks, `edit` sửa thêm raw. */
export function makeMarkData(
  config: Partial<MarkConfig> = {},
  edit: (raw: RawGameData) => void = () => {}
): GameData {
  const raw = makeRawData()
  raw.marks = FIXTURE_MARKS.map((def) => structuredClone(def))
  raw.config.marks = { ...raw.config.marks, ...config }
  edit(raw)
  return createGameData(withFixtureText(raw))
}
