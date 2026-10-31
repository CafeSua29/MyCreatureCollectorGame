import { describe, expect, it } from 'vitest'
import { cloneData, toBig } from '../shared'
import {
  defined,
  fixtureFloorBiomeIds,
  makeBattleState,
  makeData,
  makeInventory,
  makeMonster,
  makeSideFieldData,
  toBigStats,
  uniformStats
} from '../testing'
import type { GameState } from '../model'
import { createNewGame } from './newGame'
import { parseSave, serializeSave } from './save'
import { validateGameState } from './validateGameState'

const data = makeData()

function newGame(): GameState {
  return createNewGame(data, {
    seed: 5,
    starterSpeciesId: 'weakling',
    gender: 'female',
    nickname: null
  })
}

/** Lỗi của state sau khi áp `edit` lên một game mới (dữ liệu "từ file" nên không theo kiểu). */
function issuesAfter(edit: (state: Record<string, unknown> & GameState) => void): string {
  const state = cloneData(newGame()) as Record<string, unknown> & GameState
  edit(state)
  return validateGameState(data, state).join('\n')
}

/** Ép giá trị sai kiểu (number, null, chuỗi...) vào một trường, như save đọc từ file hỏng. */
const bad = <T>(value: unknown): T => value as T

describe('validateGameState: state hợp lệ', () => {
  it('game mới và state giữa trận hợp lệ', () => {
    expect(validateGameState(data, newGame())).toEqual([])
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expect(validateGameState(data, battle)).toEqual([])
  })

  it('chấp nhận số lớn hợp lệ: tiền 1e1000, gen 1e300, máu đã mất 1e1000000', () => {
    expect(
      issuesAfter((s) => {
        s.money = toBig('1e1000')
        s.party[0].genes = toBigStats(uniformStats(1e300))
        s.party[0].fusingBonusStats = toBigStats(uniformStats(0.5))
        s.party[0].exp = toBig('1e1000')
      })
    ).toBe('')
  })
})

describe('validateGameState: số không hợp lệ, báo đúng đường dẫn trường', () => {
  it.each([
    ['Decimal Infinity', toBig(Infinity)],
    ['Decimal -Infinity', toBig(-Infinity)],
    ['Decimal NaN', toBig(NaN)],
    ['Decimal âm', toBig(-1)],
    ['number Infinity', Infinity],
    ['number 100 (chưa đổi sang Decimal)', 100],
    ['null', null],
    ['chuỗi "100"', '100']
  ])('money = %s', (_, value) => {
    expect(issuesAfter((s) => (s.money = bad(value)))).toMatch(/^money phải là số hữu hạn/m)
  })

  it('gen Infinity (ví dụ 1e400 đọc từ JSON), level 2^53, damageTaken âm', () => {
    const text = issuesAfter((s) => {
      s.party[0].genes = { ...s.party[0].genes, attack: toBig(Infinity) }
      s.party[0].level = 2 ** 53
      s.party[0].damageTaken = toBig(-1)
    })
    expect(text).toMatch(/party\[0\]\.genes\.attack phải là số hữu hạn/)
    expect(text).toMatch(/party\[0\]\.level phải là số nguyên/)
    expect(text).toMatch(/party\[0\]\.damageTaken phải là số hữu hạn ≥ 0/)
  })

  it('lỗi nằm sâu trong kho, trứng, quái hoang và quái đã bắt trong trận', () => {
    const storage = issuesAfter((s) => {
      s.storage = [makeMonster({ id: 'm5', genes: { ...uniformStats(10), hp: NaN } })]
      s.nextMonsterId = 6
    })
    expect(storage).toMatch(/storage\[0\]\.genes\.hp phải là số hữu hạn/)

    const egg = issuesAfter((s) => {
      s.eggs = [
        { id: 'm5', monster: makeMonster({ id: 'm5', exp: Infinity }), battlesLeft: bad(null) }
      ]
      s.nextMonsterId = 6
    })
    expect(egg).toMatch(/eggs\[0\]\.monster\.exp phải là số hữu hạn/)
    expect(egg).toMatch(/eggs\[0\]\.battlesLeft phải là số nguyên/)

    const battle = makeBattleState(
      [makeMonster({ id: 'a' })],
      [makeMonster({ id: 'e', damageTaken: -5 })],
      {
        captured: [
          makeMonster({ id: 'c', fusingBonusStats: { ...uniformStats(0), speed: Infinity } })
        ]
      }
    )
    battle.battle = battle.battle && {
      ...battle.battle,
      turn: 0,
      stages: { a: { attack: bad(NaN) } }
    }
    const text = validateGameState(data, battle).join('\n')
    expect(text).toMatch(/battle\.enemies\[0\]\.damageTaken phải là số hữu hạn ≥ 0/)
    expect(text).toMatch(/battle\.captured\[0\]\.fusingBonusStats\.speed phải là số hữu hạn/)
    expect(text).toMatch(/battle\.turn phải là số nguyên ≥ 1/)
    expect(text).toMatch(/battle\.stages\.a\.attack phải là số nguyên/)
  })

  it('số ở cấp state: rng, nextMonsterId, số lượng vật phẩm', () => {
    const text = issuesAfter((s) => {
      s.rng = 2 ** 32
      s.nextMonsterId = bad(Infinity)
      s.inventory = makeInventory({ ball: 1.5 })
    })
    expect(text).toMatch(/rng phải là số nguyên 32-bit/)
    expect(text).toMatch(/nextMonsterId phải là số nguyên/)
    expect(text).toMatch(/inventory\.stacks\.ball phải là số nguyên ≥ 1/)
  })

  it('id trùng, nextMonsterId quá nhỏ, đội rỗng, quái thiếu trường', () => {
    const state = newGame()
    const dup = { ...state, storage: [{ ...state.party[0] }] }
    expect(validateGameState(data, dup).join()).toMatch(/id quái bị trùng "m1"/)
    expect(validateGameState(data, { ...state, nextMonsterId: 1 }).join()).toMatch(/nextMonsterId/)
    expect(validateGameState(data, { ...state, party: [] }).join()).toMatch(
      /party phải có từ 1 quái, chiếm tối đa 6 ô/
    )
    const missing = { ...state, party: [{ id: 'm1' }] }
    expect(validateGameState(data, missing).join()).toMatch(/party\[0\]/)
  })
})

describe('parseSave: số lớn trong file save (Decimal lưu bằng chuỗi)', () => {
  const fileText = (state: GameState = newGame()): string =>
    serializeSave(data, {
      gameId: 'g-test',
      kind: 'auto',
      savedAt: '2026-10-18T10:00:00.000Z',
      state
    })
  /** Thay giá trị state.money trong file bằng đoạn JSON thô `json` (summary cũng có "money"). */
  const withMoney = (json: string): string => {
    const text = fileText()
    const stateStart = text.indexOf('"state":')
    const tail = text.slice(stateStart).replace(/"money": "[^"]*"/, `"money": ${json}`)
    return text.slice(0, stateStart) + tail
  }

  it('Decimal lưu thành chuỗi; lưu rồi đọc lại ra đúng giá trị, kể cả số cực lớn', () => {
    const state = newGame()
    const rich: GameState = {
      ...state,
      money: toBig('1e1000000'),
      party: [{ ...state.party[0], exp: toBig('1e1000'), genes: toBigStats(uniformStats(1e50)) }]
    }
    const text = fileText(rich)
    expect(text).toContain('"money": "1e+1000000"')
    const parsed = parseSave(data, text)
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'))
    expect(parsed.save.state.money.eq('1e1000000')).toBe(true)
    expect(parsed.save.state.party[0].exp.eq('1e1000')).toBe(true)
    expect(parsed.save.state).toEqual(rich)
  })

  it.each([
    ['"1e1000"', '"1e1000"'],
    ['"1e1000000"', '"1e1000000"'],
    ['"123.5"', '"123.5"']
  ])('chấp nhận money = %s', (_, json) => {
    expect(parseSave(data, withMoney(json)).ok).toBe(true)
  })

  it.each([
    ['"NaN"', '"NaN"'],
    ['"Infinity"', '"Infinity"'],
    ['"abc"', '"abc"'],
    ['"-5" (âm)', '"-5"'],
    ['null (JSON.stringify(Infinity) ra null)', 'null'],
    ['1e400 (number tràn thành Infinity)', '1e400'],
    ['100 (number, save v7 phải là chuỗi)', '100']
  ])('từ chối money = %s, báo đúng trường, không crash', (_, json) => {
    const parsed = parseSave(data, withMoney(json))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.issues.join('\n')).toMatch(/^money phải là số hữu hạn/m)
  })

  it('trường sâu: gen 1e400 trong JSON báo đúng đường dẫn', () => {
    const text = fileText().replace(/"attack": "[^"]*"/, '"attack": 1e400')
    const parsed = parseSave(data, text)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.issues.join()).toMatch(/party\[0\]\.genes\.attack/)
  })
})

describe('validateGameState: tầng', () => {
  it('chấp nhận tầng đã mở và tầng rất cao', () => {
    expect(
      issuesAfter((s) => {
        s.highestFloor = 1_000_000
        s.floorBiomeIds = fixtureFloorBiomeIds(1_000_000)
        s.location = { type: 'floor', floor: 1_000_000 }
      })
    ).toBe('')
  })

  it('floorBiomeIds: danh sách, đúng một map mỗi tầng đã mở, biome tồn tại', () => {
    expect(issuesAfter((s) => (s.floorBiomeIds = bad('field')))).toMatch(
      /floorBiomeIds phải là danh sách/
    )
    expect(issuesAfter((s) => (s.floorBiomeIds = []))).toMatch(/phải có đúng 1 map/)
    expect(issuesAfter((s) => (s.floorBiomeIds = ['field', 'lair']))).toMatch(/phải có đúng 1 map/)
    expect(issuesAfter((s) => (s.floorBiomeIds = ['ghost']))).toMatch(
      /floorBiomeIds\[0\]: biome không tồn tại "ghost"/
    )
    expect(issuesAfter((s) => (s.floorBiomeIds = bad([7])))).toMatch(/floorBiomeIds\[0\]/)
    expect(issuesAfter((s) => (s.floorBiomeIds = ['toString']))).toMatch(/không tồn tại/)
    expect(
      issuesAfter((s) => {
        s.highestFloor = 3
        s.floorBiomeIds = ['pairs', 'pairs', 'pairs']
      })
    ).toBe('')
  })

  it('highestFloor phải là số nguyên ≥ 1', () => {
    for (const value of [0, -1, 1.5, null, '2', Infinity]) {
      expect(issuesAfter((s) => (s.highestFloor = bad(value)))).toMatch(/highestFloor/)
    }
  })

  it('location.floor: phải là số nguyên ≥ 1 và không quá highestFloor; vị trí kiểu cũ bị từ chối', () => {
    expect(issuesAfter((s) => (s.location = { type: 'floor', floor: 2 }))).toMatch(
      /location\.floor: tầng 2 chưa mở \(highestFloor 1\)/
    )
    expect(issuesAfter((s) => (s.location = { type: 'floor', floor: bad(0) }))).toMatch(
      /location\.floor phải là số nguyên ≥ 1/
    )
    expect(issuesAfter((s) => (s.location = bad({ type: 'zone', zoneId: 'meadow' })))).toMatch(
      /location không hợp lệ/
    )
  })

  it('battle.floor: phải hợp lệ và đã mở', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const issuesOf = (edit: (state: GameState) => GameState): string =>
      validateGameState(data, edit(battle)).join('\n')
    expect(issuesOf((s) => s)).toBe('')
    expect(issuesOf((s) => ({ ...s, battle: { ...defined(s.battle), floor: 5 } }))).toMatch(
      /battle\.floor: tầng 5 chưa mở/
    )
    expect(
      issuesOf((s) => ({ ...s, battle: { ...defined(s.battle), floor: bad<number>('1') } }))
    ).toMatch(/battle\.floor phải là số nguyên/)
  })
})

describe('validateGameState: trạng thái bất thường', () => {
  it('quái còn sống có trạng thái hợp lệ (đội, kho, trứng)', () => {
    expect(
      issuesAfter((s) => {
        s.party[0].statuses = [{ statusId: 'poison', turnsLeft: 2 }]
        // Game mới tắt thọ nguyên: quái trong kho cũng không già đi (aging khớp options).
        s.storage = [
          makeMonster({ id: 'm90', aging: false, statuses: [{ statusId: 'sleep', turnsLeft: 1 }] })
        ]
        s.nextMonsterId = 91
      })
    ).toBe('')
  })

  it('báo lỗi trạng thái sai, thiếu danh sách; quái đã gục không được có trạng thái', () => {
    expect(
      issuesAfter((s) => (s.party[0].statuses = [{ statusId: 'curse', turnsLeft: 1 }]))
    ).toMatch(/party\[0\]\.statuses\[0\]: trạng thái không tồn tại "curse"/)
    expect(issuesAfter((s) => (s.party[0].statuses = bad(undefined)))).toMatch(
      /party\[0\]\.statuses phải là danh sách/
    )
    expect(
      issuesAfter((s) => {
        s.party[0].damageTaken = toBig('1e9')
        s.party[0].statuses = [{ statusId: 'burn', turnsLeft: 1 }]
      })
    ).toMatch(/party\[0\]\.statuses: quái đã gục không được có trạng thái/)
  })
})

describe('validateGameState: cửa hàng', () => {
  it('game mới có hàng hợp lệ', () => {
    expect(newGame().shop.stock.length).toBeGreaterThan(0)
    expect(issuesAfter(() => {})).toBe('')
  })

  it('thiếu cửa hàng hoặc món hỏng: báo đúng đường dẫn', () => {
    expect(issuesAfter((state) => delete bad<Record<string, unknown>>(state).shop)).toMatch(
      /shop không hợp lệ/
    )
    const text = issuesAfter((state) => {
      state.shop = bad({ stock: [{ storage: 'stack', itemId: 'ghost' }] })
    })
    expect(text).toMatch(/shop\.stock\[0\]: vật phẩm không tồn tại "ghost"/)
  })
})

describe('validateGameState: môi trường trong trận', () => {
  const battleWithField = (field: unknown): string => {
    const state = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    // Ép kiểu vì thử dữ liệu sai từ file.
    const edited = { ...state, battle: { ...defined(state.battle), field } } as unknown as GameState
    return validateGameState(data, edited).join('\n')
  }

  it('hợp lệ: môi trường cả trận hoặc còn số lượt nguyên ≥ 1', () => {
    expect(
      battleWithField({
        weather: { id: 'rain', turnsLeft: 3 },
        terrain: { id: 'none', turnsLeft: null },
        sides: { player: [], enemy: [] },
        rooms: []
      })
    ).toBe('')
  })

  it('id lạ, sai lớp, turnsLeft sai, thiếu field', () => {
    const text = battleWithField({
      weather: { id: 'grassy', turnsLeft: 0 },
      terrain: { id: 'lava', turnsLeft: 1.5 }
    })
    expect(text).toMatch(/battle\.field\.weather: "grassy" không thuộc lớp weather/)
    expect(text).toMatch(/battle\.field\.weather\.turnsLeft phải là số nguyên/)
    expect(text).toMatch(/battle\.field\.terrain: môi trường không tồn tại "lava"/)
    expect(text).toMatch(/battle\.field\.terrain\.turnsLeft phải là số nguyên/)
    expect(battleWithField(undefined)).toMatch(/battle\.field không hợp lệ/)
  })
})

describe('validateGameState: hiệu ứng theo phe', () => {
  const sideData = makeSideFieldData()
  const withSides = (sides: unknown): string => {
    const state = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    const battle = defined(state.battle)
    // Ép kiểu vì thử dữ liệu sai từ file.
    const edited = {
      ...state,
      battle: { ...battle, field: { ...battle.field, sides } }
    } as unknown as GameState
    return validateGameState(sideData, edited).join('\n')
  }

  it('hợp lệ: cả trận hoặc còn lượt, tầng trong giới hạn', () => {
    expect(
      withSides({
        player: [{ id: 'reflect', turnsLeft: 3, layers: 1 }],
        enemy: [{ id: 'spikes', turnsLeft: null, layers: 3 }]
      })
    ).toBe('')
  })

  it('id lạ, sai lớp, lặp, turnsLeft sai, tầng ngoài giới hạn, thiếu danh sách', () => {
    const text = withSides({
      player: [
        { id: 'rain', turnsLeft: 1, layers: 1 },
        { id: 'lava', turnsLeft: 1, layers: 1 },
        { id: 'reflect', turnsLeft: 0, layers: 1 },
        { id: 'reflect', turnsLeft: 1, layers: 2 }
      ],
      enemy: [{ id: 'spikes', turnsLeft: null, layers: 4 }]
    })
    expect(text).toMatch(/battle\.field\.sides\.player\[0\]: "rain" không thuộc lớp side/)
    expect(text).toMatch(/battle\.field\.sides\.player\[1\]: môi trường không tồn tại "lava"/)
    expect(text).toMatch(/battle\.field\.sides\.player\[2\]\.turnsLeft phải là số nguyên/)
    expect(text).toMatch(/battle\.field\.sides\.player: "reflect" bị lặp/)
    expect(text).toMatch(/battle\.field\.sides\.player\[3\]\.layers phải là số nguyên từ 1 tới 1/)
    expect(text).toMatch(/battle\.field\.sides\.enemy\[0\]\.layers phải là số nguyên từ 1 tới 3/)
    expect(withSides({ player: [] })).toMatch(/battle\.field\.sides\.enemy phải là danh sách/)
    expect(withSides(undefined)).toMatch(/battle\.field\.sides không hợp lệ/)
  })
})
