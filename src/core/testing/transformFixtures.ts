// Dữ liệu mẫu cho test biến hình trong trận (Mega, Dynamax / Gigantamax, Tera): dạng Mega / gmax của
// loài fixture, đá Mega (cả đá tự kích hoạt kiểu Primal), chiêu G-Max.

import { createGameData } from '../gameData'
import type { GameData, NormalSpecies, RawGameData } from '../model'
import { makeRawData, uniformStats, withFixtureText } from './fixtures'

/** Một dạng của loài fixture: race neutral, chỉ số 60 mọi mặt (cao hơn loài gốc 30). */
function form(
  id: string,
  formOf: string,
  formKind: 'mega' | 'gmax',
  extra: Partial<NormalSpecies> = {}
): NormalSpecies {
  return {
    kind: 'normal',
    id,
    raceId: 'neutral',
    elementIds: ['fire'],
    baseStats: uniformStats(60),
    evolutions: [],
    learnset: [{ level: 1, skillId: 'strike' }],
    catchRate: 45,
    formOf,
    formKind,
    ...extra
  }
}

/**
 * weakling (hệ cỏ, chỉ số 30): Mega X (lửa, đá weaklingite), Mega Y (nước, đá weaklingiteY), Mega Z
 * (không cần đá, cần biết "blast", kiểu Rayquaza), gmax (chiêu G-Max hệ cỏ gmaxBloom: −2 tốc độ phe
 * địch). strongling: dạng Primal (nước) tự biến khi cầm blueOrb.
 */
export function makeTransformRawData(): RawGameData {
  const raw = makeRawData()
  raw.species.push(
    form('weaklingMega', 'weakling', 'mega'),
    form('weaklingMegaY', 'weakling', 'mega', { elementIds: ['water'] }),
    form('weaklingMegaZ', 'weakling', 'mega', { elementIds: ['ghost'], megaSkillId: 'blast' }),
    form('weaklingGmax', 'weakling', 'gmax', { elementIds: ['grass'], gmaxSkillId: 'gmaxBloom' }),
    form('stronglingPrimal', 'strongling', 'mega', { elementIds: ['water'] })
  )
  raw.skills.push({
    id: 'gmaxBloom',
    elementId: 'grass',
    category: 'physical',
    power: 100,
    accuracy: 100,
    priority: 0,
    target: 'enemy',
    maxMove: 'gmax',
    effects: [{ type: 'sideStatStage', params: { side: 'foe', stats: ['speed'], delta: -2 } }]
  })
  raw.items.push(
    { id: 'weaklingite', category: 'megaStone', price: 100, formId: 'weaklingMega' },
    { id: 'weaklingiteY', category: 'megaStone', price: 100, formId: 'weaklingMegaY' },
    { id: 'blueOrb', category: 'megaStone', price: 100, formId: 'stronglingPrimal', auto: true }
  )
  return withFixtureText(raw)
}

export function makeTransformData(): GameData {
  return createGameData(makeTransformRawData())
}
