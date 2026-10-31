import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import {
  makeBattleState,
  makeField,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import { evolutionPlace, evolutionScene } from './evolutionPlace'

// Map field (tầng 1 của fixture) có thời tiết tự nhiên mưa / bão, không ghi địa hình nên là địa
// hình mặc định.
const raw = makeRawData()
const field = raw.biomes.find((biome) => biome.id === 'field')
if (field) {
  field.weather = [
    { fieldId: 'rain', weight: 3 },
    { fieldId: 'storm', weight: 1 }
  ]
  delete field.terrain
}
const data = createGameData(withFixtureText(raw))

describe('evolutionPlace', () => {
  it('thị trấn: không có nơi', () => {
    expect(evolutionPlace(data, makeGameState({ seed: 1 }))).toBeNull()
  })

  it('ngoài trận trên tầng: map của tầng, mọi môi trường tự nhiên hoặc mặc định', () => {
    const state = makeGameState({ seed: 1, location: { type: 'floor', floor: 1 } })
    expect(evolutionPlace(data, state)).toEqual({
      biomeId: 'field',
      weatherIds: ['rain', 'storm'],
      terrainIds: ['none']
    })
  })

  it('trong trận: map của tầng trận và đúng môi trường đang có; tầng mốc tư chất', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })], {
      field: makeField({ weather: 'storm', terrain: 'grassy' })
    })
    const state = { ...battle, highestFloor: 3 }
    expect(evolutionScene(data, state)).toEqual({
      party: state.party,
      place: { biomeId: 'field', weatherIds: ['storm'], terrainIds: ['grassy'] },
      aptitudeFloor: 3,
      time: state.time
    })
  })
})
