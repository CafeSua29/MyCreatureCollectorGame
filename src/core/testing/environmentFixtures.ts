// Dữ liệu mẫu cho test môi trường trong trận (mục "Môi trường" ở battle-environment.md): skill và trait tương
// tác với môi trường, thêm vào fixture chung. Tách riêng để fixture chung giữ nguyên số trait
// (trọng số tinh thể ở cửa hàng chia theo số trait) và test cũ không đổi kết quả random.

import { createGameData } from '../gameData'
import { cloneData } from '../shared'
import type { FieldEffectDef, GameData, RawGameData, Skill, StatusDef, TraitDef } from '../model'
import { makeRawData, withFixtureText } from './fixtures'

const skill = (overrides: Partial<Skill> & Pick<Skill, 'id'>): Skill => ({
  elementId: 'normal',
  category: 'special',
  power: 50,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...overrides
})

const ENVIRONMENT_SKILLS: Skill[] = [
  // Nước đặc biệt 50: chỉ đổi theo mưa.
  skill({ id: 'splash', elementId: 'water' }),
  // Cỏ đặc biệt 50: địa hình cỏ tăng khi quái đánh đứng trên đất.
  skill({ id: 'leaf', elementId: 'grass' }),
  // Đặt mưa theo duration (5) của môi trường.
  skill({
    id: 'rainDance',
    category: 'status',
    power: 0,
    target: 'self',
    effects: [{ type: 'setField', params: { layer: 'weather', fieldId: 'rain' } }]
  }),
  // Đánh cả hai địch rồi đặt bão 2 lượt: hiệu ứng cả chiêu chỉ chạy một lần.
  skill({
    id: 'squall',
    power: 10,
    target: 'allEnemies',
    effects: [{ type: 'setField', params: { layer: 'weather', fieldId: 'storm', turns: 2 } }]
  }),
  skill({
    id: 'calmField',
    category: 'status',
    power: 0,
    target: 'self',
    effects: [{ type: 'setField', params: { layer: 'terrain', fieldId: 'calm', turns: 3 } }]
  }),
  // Kiểu Solar Beam: sức mạnh thay thế theo môi trường (mưa: 50; bão: 100 rồi × 0,5).
  skill({
    id: 'solar',
    elementId: 'grass',
    power: 30,
    fieldModifiers: [
      { fieldId: 'rain', power: 50 },
      { fieldId: 'storm', power: 100, powerMultiplier: 0.5 }
    ]
  }),
  // Kiểu Thunder: 50% trúng; mưa luôn trúng, sương mù thay accuracy 100 (rồi × 0,5); nắng... không.
  skill({
    id: 'thunder',
    accuracy: 50,
    fieldModifiers: [
      { fieldId: 'rain', hitsAlways: true },
      { fieldId: 'fog', accuracy: 100 },
      { fieldId: 'storm', powerMultiplier: 2 }
    ]
  })
]

const trait = (id: string, hooks: TraitDef['hooks']): TraitDef => ({ id, kind: 'rare', hooks })

const ENVIRONMENT_TRAITS: TraitDef[] = [
  trait('rainCaller', [{ type: 'setFieldOnEntry', params: { layer: 'weather', fieldId: 'rain' } }]),
  trait('stormCaller', [
    { type: 'setFieldOnEntry', params: { layer: 'weather', fieldId: 'storm', turns: 3 } }
  ]),
  trait('hover', [{ type: 'airborne', params: {} }]),
  trait('coat', [{ type: 'fieldDamageImmunity', params: {} }]),
  trait('swimmer', [
    { type: 'statModifierInWeather', params: { weatherIds: ['rain'], percent: { speed: 100 } } }
  ]),
  trait('surfer', [
    { type: 'terrainStatModifier', params: { terrainIds: ['grassy'], percent: { speed: 100 } } }
  ]),
  trait('rainDish', [{ type: 'regenInWeather', params: { weatherIds: ['rain'], percent: 10 } }]),
  // Miễn nhiễm skill hệ thường (kiểu Levitate với hệ đất).
  trait('floater', [
    { type: 'elementDamageTaken', params: { elementIds: ['normal'], percent: -100 } }
  ]),
  trait('fatty', [{ type: 'elementDamageTaken', params: { elementIds: ['normal'], percent: -50 } }])
]

// Hiệu ứng theo phe mẫu, số như dữ liệu thật (Pokémon). Hệ lửa thay hệ đá (fixture không có hệ
// đá): lửa đánh cỏ × 2. Hệ cỏ (quái mẫu mặc định) hút chông độc như hệ độc ở dữ liệu thật.
const SIDE_FIELD_EFFECTS: FieldEffectDef[] = [
  {
    id: 'reflect',
    layer: 'side',
    duration: 5,
    hooks: [
      {
        type: 'damageTakenMultiplier',
        params: { categories: ['physical'], multiplier: 0.5, allyMultiplier: 0.75 }
      }
    ]
  },
  {
    id: 'veil',
    layer: 'side',
    duration: 5,
    hooks: [
      {
        type: 'damageTakenMultiplier',
        params: { categories: ['physical', 'special'], multiplier: 0.8, allyMultiplier: 0.8 }
      }
    ]
  },
  {
    id: 'tailwind',
    layer: 'side',
    duration: 4,
    hooks: [{ type: 'statMultiplier', params: { stat: 'speed', multiplier: 2 } }]
  },
  { id: 'safeguard', layer: 'side', duration: 5, hooks: [{ type: 'blockStatus', params: {} }] },
  { id: 'mist', layer: 'side', duration: 5, hooks: [{ type: 'blockStatLower', params: {} }] },
  {
    id: 'spikes',
    layer: 'side',
    maxLayers: 3,
    hooks: [{ type: 'entryDamage', params: { percentByLayer: [10, 20, 30], grounded: true } }]
  },
  {
    id: 'rocks',
    layer: 'side',
    hooks: [{ type: 'entryDamage', params: { percentByLayer: [10], elementId: 'fire' } }]
  },
  {
    id: 'toxicSpikes',
    layer: 'side',
    maxLayers: 2,
    hooks: [
      {
        type: 'entryStatus',
        params: {
          statusIdByLayer: ['poison', 'badPoison'],
          grounded: true,
          absorbedByElementIds: ['grass']
        }
      }
    ]
  },
  {
    id: 'web',
    layer: 'side',
    hooks: [{ type: 'entryStage', params: { stat: 'speed', delta: -1, grounded: true } }]
  }
]

/** Skill đặt hiệu ứng theo phe (nhắm self, luôn trúng). */
const sideSkill = (id: string, params: Record<string, unknown>): Skill =>
  skill({
    id,
    category: 'status',
    power: 0,
    target: 'self',
    effects: [{ type: 'setSideField', params }]
  })

const SIDE_FIELD_SKILLS: Skill[] = [
  sideSkill('reflectMove', { side: 'own', fieldId: 'reflect' }),
  // Kiểu Aurora Veil: chỉ đặt được khi đang có bão (thay tuyết).
  sideSkill('veilMove', { side: 'own', fieldId: 'veil', requiresFieldId: 'storm' }),
  sideSkill('tailwindMove', { side: 'own', fieldId: 'tailwind' }),
  sideSkill('safeguardMove', { side: 'own', fieldId: 'safeguard' }),
  sideSkill('mistMove', { side: 'own', fieldId: 'mist' }),
  sideSkill('spikesMove', { side: 'foe', fieldId: 'spikes' }),
  sideSkill('rocksMove', { side: 'foe', fieldId: 'rocks', turns: 2 }),
  sideSkill('toxicSpikesMove', { side: 'foe', fieldId: 'toxicSpikes' }),
  sideSkill('webMove', { side: 'foe', fieldId: 'web' }),
  // Tự hạ công của mình (kiểu Superpower): hiệu ứng theo phe không chặn.
  skill({
    id: 'selfDrop',
    category: 'status',
    power: 0,
    target: 'self',
    effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: -1 } }]
  }),
  skill({
    id: 'toxicMove',
    category: 'status',
    power: 0,
    effects: [{ type: 'applyStatus', params: { statusId: 'badPoison' } }]
  }),
  skill({
    id: 'poisonMove',
    category: 'status',
    power: 0,
    effects: [{ type: 'applyStatus', params: { statusId: 'poison' } }]
  })
]

/** Độc nặng như dữ liệu thật: 6,25% × số lượt đã qua, 4 lượt, cùng nhóm với độc. */
const BAD_POISON: StatusDef = {
  id: 'badPoison',
  kind: 'debuff',
  duration: { min: 4, max: 4 },
  exclusiveGroup: 'poison',
  hooks: [{ type: 'turnEndDamage', params: { percent: 6.25, escalating: true } }]
}

/** Dữ liệu môi trường + hiệu ứng theo phe, skill đặt chúng, độc nặng (độc thường cùng nhóm). */
export function makeSideFieldRawData(): RawGameData {
  const raw = makeEnvironmentRawData()
  // Sao chép để test sửa dữ liệu không làm hỏng hằng số dùng chung.
  raw.fieldEffects.push(...cloneData(SIDE_FIELD_EFFECTS))
  raw.skills.push(...cloneData(SIDE_FIELD_SKILLS))
  raw.statuses.push(cloneData(BAD_POISON))
  for (const status of raw.statuses) {
    if (status.id === 'poison') status.exclusiveGroup = 'poison'
  }
  raw.config.ai.statusWeights.badPoison = 0.45
  return withFixtureText(raw)
}

export function makeSideFieldData(): GameData {
  return createGameData(makeSideFieldRawData())
}

/** Fixture chung + skill / trait môi trường (chữ tạo lại cho mọi nội dung). */
export function makeEnvironmentRawData(): RawGameData {
  const raw = makeRawData()
  // Sao chép để test sửa dữ liệu không làm hỏng hằng số dùng chung.
  raw.skills.push(...cloneData(ENVIRONMENT_SKILLS))
  raw.traits.push(...cloneData(ENVIRONMENT_TRAITS))
  return withFixtureText(raw)
}

export function makeEnvironmentData(): GameData {
  return createGameData(makeEnvironmentRawData())
}
