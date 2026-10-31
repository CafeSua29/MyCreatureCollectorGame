// Đồ cầm kéo dài môi trường theo lớp / hiệu ứng theo phe và phản ứng khi đặt room (mục "Đồ cầm theo
// môi trường" ở battle-environment.md): Terrain Extender, Light Clay, Room Service.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import {
  defined,
  held,
  makeBattleState,
  makeField,
  makeMonster,
  makeRoomRawData,
  makeSideFieldRawData,
  withFixtureText
} from '../testing'
import type { BattleCommand, BattleEvent, GameData, GameState, RawGameData } from '../model'

/**
 * Thêm skill đặt địa hình theo duration và các đồ cầm mẫu `itemIds` (mỗi fixture chỉ có môi
 * trường mà món của nó cần) vào dữ liệu gốc.
 */
function withFieldItems(raw: RawGameData, itemIds: readonly string[]): GameData {
  raw.skills.push({
    id: 'calmDefault',
    elementId: 'normal',
    category: 'status',
    power: 0,
    accuracy: 100,
    priority: 0,
    target: 'self',
    effects: [{ type: 'setField', params: { layer: 'terrain', fieldId: 'calm' } }]
  })
  const items: RawGameData['items'] = [
    {
      id: 'extender',
      category: 'held',
      price: 10,
      persistent: true,
      hooks: [{ type: 'fieldDuration', params: { layer: 'terrain', turns: 8 } }]
    },
    {
      id: 'clay',
      category: 'held',
      price: 10,
      persistent: true,
      hooks: [{ type: 'fieldDuration', params: { fieldIds: ['reflect'], turns: 8 } }]
    },
    {
      id: 'service',
      category: 'held',
      price: 10,
      hooks: [
        {
          type: 'trigger',
          params: {
            on: 'roomSet',
            scope: 'self',
            when: [{ if: 'roomActive', fieldIds: ['trickRoom'] }],
            effects: [{ do: 'stage', to: 'self', stats: ['speed'], delta: -1 }]
          }
        }
      ]
    }
  ]
  raw.items.push(...items.filter((item) => itemIds.includes(item.id)))
  return createGameData(withFixtureText(raw))
}

const skill = (slot: number, skillId: string): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target: 0
})

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

describe('fieldDuration theo lớp và theo phe', () => {
  it('Terrain Extender: mọi địa hình quái cầm đặt (không ghi turns) kéo dài 8 lượt', () => {
    const data = withFieldItems(makeRoomRawData(), ['extender'])
    const play = (equipment: ReturnType<typeof held>[]): GameState =>
      gameReducer(
        data,
        makeBattleState(
          [makeMonster({ id: 'a', skillIds: ['idle', 'calmDefault'], equipment })],
          [makeMonster({ id: 'x', skillIds: ['idle'] })],
          { field: makeField() }
        ),
        { type: 'submitTurn', commands: [skill(0, 'calmDefault')] }
      )
    const duration = defined(data.fieldEffects.calm.duration, 'duration của calm')
    // Cuối lượt đặt đã giảm 1 lượt.
    expect(defined(play([held('extender')]).battle).field.terrain.turnsLeft).toBe(7)
    expect(defined(play([]).battle).field.terrain.turnsLeft).toBe(duration - 1)
  })

  it('Light Clay: màn chắn quái cầm đặt kéo dài 8 lượt', () => {
    const data = withFieldItems(makeSideFieldRawData(), ['clay'])
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['idle', 'reflectMove'], equipment: [held('clay')] })],
      [makeMonster({ id: 'x', skillIds: ['idle'] })]
    )
    const next = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [skill(0, 'reflectMove')]
    })
    expect(eventsOf(next, 'sideFieldSet')[0]?.turnsLeft).toBe(8)
  })
})

describe('Room Service (sự kiện roomSet, điều kiện roomActive)', () => {
  it('Trick Room được đặt: quái cầm −1 tốc và mất đồ; room khác thì không', () => {
    const data = withFieldItems(makeRoomRawData(), ['service'])
    const play = (skillId: string): GameState =>
      gameReducer(
        data,
        makeBattleState(
          [
            makeMonster({ id: 'a', skillIds: ['idle', skillId] }),
            makeMonster({ id: 'b', skillIds: ['idle'], equipment: [held('service')] })
          ],
          [makeMonster({ id: 'x', skillIds: ['idle'] })]
        ),
        { type: 'submitTurn', commands: [skill(0, skillId), skill(1, 'idle')] }
      )
    const trick = play('trickRoomMove')
    expect(eventsOf(trick, 'stage')).toContainEqual({
      type: 'stage',
      monsterId: 'b',
      stat: 'speed',
      delta: -1
    })
    expect(eventsOf(trick, 'heldItemConsumed').map((e) => e.itemId)).toEqual(['service'])
    expect(eventsOf(play('wonderRoomMove'), 'heldItemConsumed')).toHaveLength(0)
  })
})
