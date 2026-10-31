// Dữ liệu mẫu cho huyết mạch (docs/rules/bloodline.md). Fixture chung không có nhóm nào (RNG của test
// cũ không đổi); test huyết mạch dùng makeBloodlineRawData / makeBloodlineData.

import { createGameData } from '../gameData'
import type { GameData, NormalSpecies, RawGameData } from '../model'
import { makeRawData, withFixtureText } from './fixtures'

const ancestor = (
  id: string,
  fields: Pick<NormalSpecies, 'elementIds' | 'baseStats'> & Partial<NormalSpecies>
): NormalSpecies => ({
  kind: 'normal',
  raceId: 'neutral',
  evolutions: [],
  learnset: [
    { level: 1, skillId: 'strike' },
    { level: 3, skillId: 'blast' },
    { level: 50, skillId: 'quick' }
  ],
  catchRate: 3,
  lifespan: 1000,
  origin: 'myth',
  source: 'testLore',
  ...fields,
  id
})

const uniform = (value: number): NormalSpecies['baseStats'] => ({
  hp: value,
  attack: value,
  defense: value,
  spAttack: value,
  spDefense: value,
  speed: value
})

/**
 * makeRawData + hai nhóm huyết mạch:
 * - `wyrm` (Long mẫu): thành viên `nymph` (cả chuỗi nymph → husk), loài tổ `elderWyrm` (hệ lửa, mọi
 *   chỉ số gốc 100, thọ nguyên 1000), trait `wyrmBlood` (+10% công), Tinh huyết `wyrmEssence` (+5).
 * - `stone` (Thạch mẫu): hệ normal (pebble → boulder) và `nymph`, loài tổ `titanStone` (hệ normal,
 *   không giới tính, chỉ số gốc 200), trait `stoneBlood` (+10% thủ), Tinh huyết `stoneEssence` (+5).
 * nymph thuộc cả hai nhóm (wyrm đứng trước trong bloodlines nên thắng khi hòa độ thuần).
 * Phối hợp đội của wyrm: cộng hưởng `bloodlineWyrm` (2 quái: +10% công), trận pháp `wyrmClan` (≥ 2
 * quái: quái wyrm +20% công; trận đồ `wyrmClanScroll` là scrollItemId của nhóm), hợp kích
 * `comboWyrm` (hai quái wyrm độ thuần ≥ 25; hệ lửa, special 150).
 */
export function makeBloodlineRawData(): RawGameData {
  const raw = makeRawData()
  raw.species.push(
    ancestor('elderWyrm', { elementIds: ['fire'], baseStats: uniform(100) }),
    ancestor('titanStone', { elementIds: ['normal'], baseStats: uniform(200), genderless: true })
  )
  raw.traits.push(
    {
      id: 'wyrmBlood',
      kind: 'bloodline',
      hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }]
    },
    {
      id: 'stoneBlood',
      kind: 'bloodline',
      hooks: [{ type: 'statModifier', params: { percent: { defense: 10 } } }]
    }
  )
  for (const groupId of ['wyrm', 'stone']) {
    raw.items.push({
      id: `${groupId}Essence`,
      category: 'consumable',
      price: 2000,
      use: 'field',
      target: 'ally',
      effects: [{ type: 'addPurity', params: { groupId, amount: 5 } }]
    })
  }
  raw.items.push({
    id: 'wyrmClanScroll',
    category: 'formationScroll',
    price: 3000,
    fixedPrice: true,
    formationId: 'wyrmClan'
  })
  const wyrm = { type: 'bloodline', groupId: 'wyrm' }
  raw.synergies.push({
    id: 'bloodlineWyrm',
    match: wyrm,
    tiers: [{ count: 2, hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }] }]
  })
  raw.formations.push({
    id: 'wyrmClan',
    requires: [{ type: 'bloodline', groupId: 'wyrm', count: 2 }],
    match: wyrm,
    hooks: [{ type: 'statModifier', params: { percent: { attack: 20 } } }]
  })
  raw.comboSkills.push({
    id: 'comboWyrm',
    pair: [
      { ...wyrm, minPurity: 25 },
      { ...wyrm, minPurity: 25 }
    ],
    elementId: 'fire',
    category: 'special',
    power: 150,
    accuracy: 100,
    priority: 0,
    target: 'enemy',
    effects: []
  })
  raw.bloodlines = [
    {
      id: 'wyrm',
      ancestorSpeciesIds: ['elderWyrm'],
      speciesIds: ['nymph'],
      traitId: 'wyrmBlood',
      essenceItemId: 'wyrmEssence',
      scrollItemId: 'wyrmClanScroll'
    },
    {
      id: 'stone',
      ancestorSpeciesIds: ['titanStone'],
      elementIds: ['normal'],
      speciesIds: ['nymph'],
      traitId: 'stoneBlood',
      essenceItemId: 'stoneEssence'
    }
  ]
  return withFixtureText(raw)
}

export const makeBloodlineData = (): GameData => createGameData(makeBloodlineRawData())
