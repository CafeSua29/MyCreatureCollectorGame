import { describe, expect, it } from 'vitest'
import { createGameData, toBig, type GameState } from '@core'
import {
  FIXTURE_DEITY_ID,
  FIXTURE_DEITY_TOKEN_ID,
  FIXTURE_INCENSE_ID,
  atFloor,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText
} from '@core/testing'
import { highestFavorRank, isDeityCurrency, runDeities } from './deities'
import { newEconomyCount } from './economy'

/** Fixture: map tầng 1 (field) do thần lửa cai quản, Hương nến bán ở cửa hàng. */
function deityData(): ReturnType<typeof createGameData> {
  const raw = makeRawData()
  raw.biomes[0].deityId = FIXTURE_DEITY_ID
  return createGameData(withFixtureText(raw))
}

const data = deityData()

const town = (stacks: Record<string, number>, money = 0): GameState => ({
  ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
  money: toBig(money),
  inventory: makeInventory(stacks)
})

describe('runDeities', () => {
  it('mua hương ở Miếu trong ngân sách (20% tiền), dâng hết cho thần của tầng cao nhất', () => {
    // Giá 100 × tầng 1; 20% của 1.250 = 250 → mua 2, cộng 1 nén sẵn có.
    const count = newEconomyCount()
    const next = runDeities(data, town({ [FIXTURE_INCENSE_ID]: 1 }, 1250), count)
    expect(count.incense).toBe(3)
    expect(next.favor[FIXTURE_DEITY_ID]?.toNumber()).toBe(600)
    expect(next.money.toNumber()).toBe(1050)
    expect(highestFavorRank(data, next)).toBe(7)
  })

  it('đổi tín vật lấy món đắt nhất đã mở bậc, tới khi hết đổi được', () => {
    const count = newEconomyCount()
    // Bậc 2 (40 ân sủng): mở bóng thần (5 tín vật) và thuốc (2); 12 tín vật → 2 bóng + 1 thuốc.
    const state = {
      ...town({ [FIXTURE_DEITY_TOKEN_ID]: 12 }),
      favor: { [FIXTURE_DEITY_ID]: toBig(40) }
    }
    const next = runDeities(data, state, count)
    expect(count.deityBuys).toBe(3)
    expect(next.inventory.stacks.masterBall).toBe(2)
    expect(next.inventory.stacks.potion).toBe(1)
    expect(next.inventory.stacks[FIXTURE_DEITY_TOKEN_ID]).toBeUndefined()
  })

  it('không làm gì ngoài thị trấn / không có hương, tín vật; tầng cao nhất không có thần thì giữ hương', () => {
    const count = newEconomyCount()
    const away = atFloor(town({ [FIXTURE_INCENSE_ID]: 1 }), 1)
    expect(runDeities(data, away, count)).toBe(away)
    const noGod = {
      ...town({ [FIXTURE_INCENSE_ID]: 1 }),
      highestFloor: 2,
      floorBiomeIds: ['field', 'lair']
    }
    expect(runDeities(data, noGod, count).inventory.stacks[FIXTURE_INCENSE_ID]).toBe(1)
    expect(count).toEqual(newEconomyCount())
    expect(highestFavorRank(data, town({}))).toBe(0)
  })

  it('hương và tín vật là tiền của Miếu (không bán như nguyên liệu dư)', () => {
    expect(isDeityCurrency(data, FIXTURE_INCENSE_ID)).toBe(true)
    expect(isDeityCurrency(data, FIXTURE_DEITY_TOKEN_ID)).toBe(true)
    expect(isDeityCurrency(data, 'potion')).toBe(false)
  })
})
