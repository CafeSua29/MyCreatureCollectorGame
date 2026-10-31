// Dữ liệu mẫu cho test chiêu "hiệu ứng sân" kiểu Pokémon (mục "Skill" và "Môi trường" ở
// battle.md): nhắm cả phe mình, chữa trạng thái, Haze, dọn / đổi môi trường, đổi bậc theo hệ,
// room làm mới / đổi hệ / chặn đổi quái, hiệu ứng theo phe chặn chí mạng / skill / nhân tiền,
// Perish Song, thế thân, truyền khi rút về, skill chỉ dùng ở lượt đầu. Thêm vào fixture hiệu ứng
// theo phe (makeSideFieldRawData) và tách riêng để test cũ không đổi.

import { createGameData } from '../gameData'
import { cloneData } from '../shared'
import type { FieldEffectDef, GameData, RawGameData, Skill } from '../model'
import { makeSideFieldRawData } from './environmentFixtures'
import { withFixtureText } from './fixtures'

const status = (
  id: string,
  effects: Skill['effects'],
  target: Skill['target'] = 'self'
): Skill => ({
  id,
  elementId: 'normal',
  category: 'status',
  power: 0,
  accuracy: 100,
  priority: 0,
  target,
  effects
})

const effect = (type: string, params: Record<string, unknown> = {}): Skill['effects'][number] => ({
  type,
  params
})

const FIELD_MOVE_EFFECTS: FieldEffectDef[] = [
  {
    // Kiểu Mud Sport: hệ thường × 1/3, đặt lại thì làm mới.
    id: 'mudSport',
    layer: 'room',
    duration: 5,
    onReuse: 'refresh',
    hooks: [
      { type: 'elementDamageMultiplier', params: { elementIds: ['normal'], multiplier: 0.5 } }
    ]
  },
  {
    // Kiểu Ion Deluge: hệ thường thành hệ lửa trong lượt dùng.
    id: 'ionDeluge',
    layer: 'room',
    duration: 1,
    hooks: [{ type: 'convertElement', params: { fromElementIds: ['normal'], elementId: 'fire' } }]
  },
  { id: 'fairyLock', layer: 'room', duration: 2, hooks: [{ type: 'preventEscape', params: {} }] },
  { id: 'luckyChant', layer: 'side', duration: 5, hooks: [{ type: 'blockCritical', params: {} }] },
  {
    id: 'wideGuard',
    layer: 'side',
    duration: 1,
    hooks: [{ type: 'protectFrom', params: { targets: ['allEnemies'] } }]
  },
  {
    id: 'quickGuard',
    layer: 'side',
    duration: 1,
    hooks: [{ type: 'protectFrom', params: { minPriority: 1 } }]
  },
  {
    id: 'happyHour',
    layer: 'side',
    hooks: [{ type: 'moneyMultiplier', params: { multiplier: 2 } }]
  }
]

const FIELD_MOVE_SKILLS: Skill[] = [
  status('howl', [effect('statStage', { who: 'target', stat: 'attack', delta: 1 })], 'allAllies'),
  status(
    'jungleHealing',
    [effect('heal', { percent: 25, who: 'target' }), effect('cureStatus')],
    'allAllies'
  ),
  status('healBell', [effect('cureTeamStatus')]),
  status('haze', [effect('resetStages')]),
  status('defog', [
    effect('clearSideFields', { side: 'foe' }),
    effect('clearSideFields', { side: 'own', hazardsOnly: true }),
    effect('clearField', { layer: 'terrain' })
  ]),
  {
    ...status('rapidSpin', [effect('clearSideFields', { side: 'own', hazardsOnly: true })]),
    category: 'physical',
    power: 20,
    target: 'enemy'
  },
  status('courtChange', [effect('swapSideFields')]),
  status('flowerShield', [
    effect('fieldStatStage', { stats: ['defense'], delta: 1, elementIds: ['grass'] })
  ]),
  status('mudSportMove', [effect('setRoom', { fieldId: 'mudSport' })]),
  { ...status('ionDelugeMove', [effect('setRoom', { fieldId: 'ionDeluge' })]), priority: 1 },
  status('fairyLockMove', [effect('setRoom', { fieldId: 'fairyLock' })]),
  status('luckyChantMove', [effect('setSideField', { side: 'own', fieldId: 'luckyChant' })]),
  {
    ...status('wideGuardMove', [effect('setSideField', { side: 'own', fieldId: 'wideGuard' })]),
    priority: 3
  },
  {
    ...status('quickGuardMove', [effect('setSideField', { side: 'own', fieldId: 'quickGuard' })]),
    priority: 3
  },
  status('happyHourMove', [effect('setSideField', { side: 'own', fieldId: 'happyHour' })]),
  status('perishSong', [effect('perishSong', { turns: 3 })]),
  status('substitute', [effect('substitute', { hpCostPercent: 25 })]),
  status('shedTail', [
    effect('substitute', { hpCostPercent: 50 }),
    effect('switchOut', { passOn: 'substitute' })
  ]),
  status('batonPass', [effect('switchOut', { passOn: 'all' })]),
  {
    ...status('openingStrike', []),
    category: 'physical',
    power: 40,
    target: 'enemy',
    priority: 3,
    firstTurnOnly: true
  }
]

/** Fixture hiệu ứng theo phe + room / hiệu ứng theo phe / skill của chiêu sân. */
export function makeFieldMoveRawData(): RawGameData {
  const raw = makeSideFieldRawData()
  // Sao chép để test sửa dữ liệu không làm hỏng hằng số dùng chung.
  raw.fieldEffects.push(...cloneData(FIELD_MOVE_EFFECTS))
  raw.skills.push(...cloneData(FIELD_MOVE_SKILLS))
  return withFixtureText(raw)
}

export function makeFieldMoveData(): GameData {
  return createGameData(makeFieldMoveRawData())
}
