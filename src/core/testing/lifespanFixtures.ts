// Fixture cho test tuổi và thọ nguyên (mục "Tuổi và thọ nguyên" ở lifespan.md): trait Trường thọ /
// Đoản mệnh, Thọ Nguyên Đan (một món bán ở cửa hàng, một món chỉ rơi từ boss tầng), có trang bị.

import { createGameData } from '../gameData'
import { ageDaysAtPercent } from '../registries'
import type { GameData, GameState, Item, Monster, RawGameData, TraitDef } from '../model'
import { withEquipmentFixtures } from './equipmentFixtures'
import {
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText,
  type GameStateOptions
} from './fixtures'

export const LIFESPAN_TEST_TRAITS: TraitDef[] = [
  {
    id: 'longevity',
    kind: 'positive',
    exclusiveGroup: 'lifespan',
    hooks: [{ type: 'lifespanPercent', params: { percent: 20 } }]
  },
  {
    id: 'shortLived',
    kind: 'negative',
    exclusiveGroup: 'lifespan',
    hooks: [{ type: 'lifespanPercent', params: { percent: -20 } }]
  }
]

/** Đan: smallPill bán ở cửa hàng (+5 năm), bigPill chỉ rơi từ boss tầng (+100 năm). */
export const LIFESPAN_TEST_ITEMS: Item[] = [
  {
    id: 'smallPill',
    category: 'consumable',
    price: 300,
    shop: true,
    shopWeight: 1000,
    requiresOption: 'lifespanEnabled',
    use: 'field',
    target: 'ally',
    effects: [{ type: 'addLifespan', params: { years: 5 } }]
  },
  {
    id: 'bigPill',
    category: 'consumable',
    price: 15000,
    requiresOption: 'lifespanEnabled',
    use: 'field',
    target: 'ally',
    effects: [{ type: 'addLifespan', params: { years: 100 } }]
  }
]

/** Dữ liệu fixture có trang bị và nội dung thọ nguyên; `edit` sửa raw trước khi kiểm tra. */
export function makeLifespanData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = withEquipmentFixtures(makeRawData())
  raw.traits.push(...LIFESPAN_TEST_TRAITS)
  raw.items.push(...LIFESPAN_TEST_ITEMS)
  raw.config.lifespan.bossDrops = [{ itemId: 'smallPill', chance: 100 }]
  raw.config.lifespan.floorBossDrops = [{ itemId: 'bigPill', chance: 100 }]
  edit(raw)
  return createGameData(withFixtureText(raw))
}

/** Quái fixture đang già đi, tuổi = `percent` % thọ nguyên của nó. */
export function agingMonster(
  data: GameData,
  percent: number,
  overrides: Parameters<typeof makeMonster>[0] = {}
): Monster {
  const monster = makeMonster({ ...overrides, aging: true })
  return { ...monster, ageDays: ageDaysAtPercent(data, monster, percent) }
}

/** State test bật thọ nguyên (quái truyền vào phải có aging true). */
export const lifespanState = (options: GameStateOptions): GameState =>
  makeGameState({ ...options, lifespanEnabled: true })
