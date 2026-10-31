// Nơi quái đang ở khi xét tiến hóa có điều kiện (mục "Tiến hóa có điều kiện" ở evolution-skills.md):
// như Pokémon, lên level / dùng đá ở đâu thì điều kiện map, thời tiết, địa hình xét ở đó.

import { type Biome, type GameData, type GameState, type GlobalFieldLayer } from '../model'
import {
  aptitudeFloor,
  fieldIdsCountedAs,
  type EvolutionPlace,
  type EvolutionScene
} from '../registries'
import { battleBiome, biomeOfFloor } from './floors'

/** Môi trường tự nhiên của map ở một lớp; map bỏ trống thì là mặc định. */
function naturalFieldIds(data: GameData, biome: Biome, layer: GlobalFieldLayer): string[] {
  const ids = (biome[layer] ?? []).map((entry) => entry.fieldId)
  return ids.length > 0 ? ids : [data.config.field.defaults[layer]]
}

/**
 * Nơi quái đang ở: trong trận là map của trận (`battleBiome`) và đúng môi trường đang có; ngoài trận trên
 * tầng là map của tầng và mọi môi trường tự nhiên của map (ngoài trận không có thời tiết đang diễn
 * ra); ở thị trấn là null.
 */
export function evolutionPlace(
  data: GameData,
  state: Pick<GameState, 'battle' | 'location' | 'floorBiomeIds'>
): EvolutionPlace | null {
  if (state.battle) {
    const { field } = state.battle
    return {
      biomeId: battleBiome(data, state, state.battle).id,
      weatherIds: [...fieldIdsCountedAs(data, field.weather.id)],
      terrainIds: [...fieldIdsCountedAs(data, field.terrain.id)]
    }
  }
  if (state.location.type !== 'floor') return null
  const biome = biomeOfFloor(data, state, state.location.floor)
  return {
    biomeId: biome.id,
    weatherIds: naturalFieldIds(data, biome, 'weather'),
    terrainIds: naturalFieldIds(data, biome, 'terrain')
  }
}

/** Hoàn cảnh xét tiến hóa từ state: đội của người chơi, nơi đang ở, tầng mốc tư chất, giờ game. */
export function evolutionScene(
  data: GameData,
  state: Pick<
    GameState,
    'battle' | 'location' | 'floorBiomeIds' | 'party' | 'highestFloor' | 'time'
  >
): EvolutionScene {
  return {
    party: state.party,
    place: evolutionPlace(data, state),
    aptitudeFloor: aptitudeFloor(state),
    time: state.time
  }
}
