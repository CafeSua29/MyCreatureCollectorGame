// Dữ liệu mẫu cho test hiệu ứng toàn sân đặc biệt (lớp room, mục "Môi trường" ở battle-environment.md): Trick
// Room, Wonder Room, Gravity như dữ liệu thật (5 lượt, accuracy × 5/3) và skill đặt chúng, thêm vào
// fixture môi trường. Hệ nước đánh hệ bay × 0 thay cho hệ đất (fixture không có hệ đất).

import { createGameData } from '../gameData'
import { cloneData } from '../shared'
import type { FieldEffectDef, GameData, RawGameData, Skill } from '../model'
import { makeEnvironmentRawData } from './environmentFixtures'
import { withFixtureText } from './fixtures'

const ROOM_EFFECTS: FieldEffectDef[] = [
  {
    id: 'trickRoom',
    layer: 'room',
    duration: 5,
    hooks: [{ type: 'reverseSpeedOrder', params: {} }]
  },
  {
    id: 'wonderRoom',
    layer: 'room',
    duration: 5,
    hooks: [{ type: 'swapDefenses', params: {} }]
  },
  {
    // Gỡ miễn nhiễm hệ nước (bảng hệ, quái hệ bay) và hệ thường (trait floater).
    id: 'gravity',
    layer: 'room',
    duration: 5,
    hooks: [
      { type: 'forceGrounded', params: { removesImmunityFromElementIds: ['water', 'normal'] } },
      { type: 'banSkills', params: { skillIds: ['tide'] } },
      { type: 'accuracyMultiplier', params: { multiplier: 5 / 3 } }
    ]
  }
]

const roomSkill = (id: string, fieldId: string, turns?: number): Skill => ({
  id,
  elementId: 'normal',
  category: 'status',
  power: 0,
  accuracy: 100,
  priority: 0,
  target: 'self',
  effects: [{ type: 'setRoom', params: turns === undefined ? { fieldId } : { fieldId, turns } }]
})

const ROOM_SKILLS: Skill[] = [
  roomSkill('trickRoomMove', 'trickRoom'),
  roomSkill('wonderRoomMove', 'wonderRoom'),
  roomSkill('gravityMove', 'gravity'),
  roomSkill('shortGravity', 'gravity', 2),
  // Hệ nước 50% trúng: Gravity × 5/3 → 83,3%.
  {
    id: 'tide',
    elementId: 'water',
    category: 'special',
    power: 50,
    accuracy: 50,
    priority: 0,
    target: 'enemy',
    effects: []
  }
]

/** Dữ liệu môi trường + room, skill đặt room; hệ nước không đánh được hệ bay. */
export function makeRoomRawData(): RawGameData {
  const raw = makeEnvironmentRawData()
  // Sao chép để test sửa dữ liệu không làm hỏng hằng số dùng chung.
  raw.fieldEffects.push(...cloneData(ROOM_EFFECTS))
  raw.skills.push(...cloneData(ROOM_SKILLS))
  for (const element of raw.elements) {
    if (element.id === 'water') element.effectiveness.flying = 0
  }
  return withFixtureText(raw)
}

export function makeRoomData(): GameData {
  return createGameData(makeRoomRawData())
}
