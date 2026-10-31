// Dữ liệu event thật (src/data/events.json): mọi lựa chọn của mọi event chọn được ở tầng thấp và tầng
// cao, trận event (nếu có) đánh được tới hết, state sau đó hợp lệ. Không phụ thuộc id / số lượng
// event cụ thể (quy tắc 13).

import { describe, expect, it } from 'vitest'
import { rawGameData } from '@data'
import { createGameData } from '../gameData'
import { createNewGame, gameReducer, rollStarters, validateGameState } from '../game'
import { addItems } from '../inventory'
import { suggestBattleCommands, suggestReplacements } from '../battle'
import { toBig } from '../shared'
import { withPendingEvent } from '../testing'
import type { GameState } from '../model'

const data = createGameData(rawGameData)

/** Game mới đứng ở tầng `floor` (map của mọi tầng là map đầu), nhiều tiền và thuốc. */
function startAt(floor: number): GameState {
  const starter = rollStarters(data, 5).candidates[0]
  const game = createNewGame(data, {
    seed: 5,
    starterSpeciesId: starter.speciesId,
    gender: starter.gender,
    nickname: null
  })
  const biomeId = game.floorBiomeIds[0]
  return {
    ...game,
    highestFloor: floor,
    floorBiomeIds: Array.from({ length: floor }, () => biomeId),
    location: { type: 'floor', floor },
    money: toBig('1e12'),
    inventory: addItems(game.inventory, 'potion', 10)
  }
}

function playOut(state: GameState): GameState {
  let current = state
  for (let i = 0; i < 300 && current.battle && current.battle.phase !== 'ended'; i++) {
    current =
      current.battle.phase === 'chooseReplacement'
        ? gameReducer(data, current, {
            type: 'replaceFainted',
            replacements: suggestReplacements(data, current)
          })
        : gameReducer(data, current, {
            type: 'submitTurn',
            commands: suggestBattleCommands(data, current, { transforms: false })
          })
  }
  return current.battle?.phase === 'ended'
    ? gameReducer(data, current, { type: 'leaveBattle' })
    : current
}

describe('event của dữ liệu thật', () => {
  for (const floor of [1, 40]) {
    it(`mọi lựa chọn chọn được ở tầng ${floor}, state sau đó hợp lệ`, () => {
      const base = startAt(floor)
      for (const event of Object.values(data.events)) {
        const at = event.group === 'town' ? null : floor
        const chainId = event.group === 'chain' ? 'test' : null
        const located: GameState = at === null ? { ...base, location: { type: 'town' } } : base
        for (const option of event.options) {
          const chosen = gameReducer(
            data,
            withPendingEvent(located, event.id, { floor: at, chainId }),
            {
              type: 'chooseEventOption',
              optionId: option.id
            }
          )
          const after = playOut(chosen)
          expect(validateGameState(data, after), `${event.id}.${option.id}`).toEqual([])
        }
      }
    })
  }
})
