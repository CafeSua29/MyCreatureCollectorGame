import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { validateMonster } from '../monster'
import { createRng, toBig } from '../shared'
import { autoEvolve, evolutionInfo, levelEvolutionOptions, stoneEvolution } from './evolution'
import { getMaxHp } from '../monster'
import { baseFormsOf, evolutionLineOf } from '../inventory'
import { createGameData } from '../gameData'
import { makeOffspring } from './breeding'
import { getMonsterView } from '../roster'
import { gameReducer } from '../game'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeData,
  makeMonster,
  makeRawData,
  makeInventory,
  expectActionError,
  makeGameState
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  GameAction,
  GameState,
  Monster,
  NormalSpecies
} from '../model'

// Fixture tiến hóa:
// - weakling → strongling ở level 10 (chỉ cần level, 1 hướng).
// - twig → oak / pine ở level 5 (2 hướng level, phải chọn); twig → cinder bằng fireStone từ level 3.
const data = makeData()
// Ngoài lúc thắng trận, không có đồng đội.
const scene = { party: [], place: null, aptitudeFloor: 1, time: 0 }

const stoneTarget = (monster: Monster, itemId: string): string | null =>
  stoneEvolution(data, monster, { itemId, scene })?.speciesId ?? null

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const twig = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, speciesId: 'twig', baseSpeciesId: 'twig', ...overrides })

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

describe('điều kiện tiến hóa', () => {
  it('hướng chỉ cần level: đủ level mới có', () => {
    expect(levelEvolutionOptions(data, makeMonster({ level: 9, exp: 729 }), scene)).toEqual([])
    expect(levelEvolutionOptions(data, makeMonster({ level: 10, exp: 1000 }), scene)).toEqual([
      'strongling'
    ])
    // Hướng cần đá không tính vào tự tiến hóa.
    expect(levelEvolutionOptions(data, twig('t', { level: 5, exp: toBig(125) }), scene)).toEqual([
      'oak',
      'pine'
    ])
  })

  it('hướng cần đá: đúng đá và đủ level', () => {
    expect(stoneTarget(twig('t', { level: 3, exp: toBig(27) }), 'fireStone')).toBe('cinder')
    expect(stoneTarget(twig('t', { level: 2, exp: toBig(8) }), 'fireStone')).toBeNull()
    expect(stoneTarget(twig('t', { level: 9, exp: toBig(729) }), 'potion')).toBeNull()
  })

  it('quái đã fuse không tiến hóa', () => {
    const fused = makeMonster({
      speciesId: 'fused',
      baseSpeciesId: 'weakling',
      fused: true,
      lineage: ['strongling'],
      level: 50,
      exp: 125000
    })
    expect(levelEvolutionOptions(data, fused, scene)).toEqual([])
    expect(evolutionInfo(data, fused, scene)).toEqual([])
  })

  it('evolutionInfo liệt kê mọi hướng cho UI', () => {
    expect(evolutionInfo(data, twig('t', { level: 4, exp: toBig(64) }), scene)).toEqual([
      { speciesId: 'oak', level: 5, levelReached: false, conditions: [] },
      { speciesId: 'pine', level: 5, levelReached: false, conditions: [] },
      {
        speciesId: 'cinder',
        level: 3,
        itemId: 'fireStone',
        levelReached: true,
        conditions: []
      }
    ])
  })
})

describe('autoEvolve', () => {
  it('một hướng: tiến hóa, đổi loài/race/hệ, giữ phần còn lại, HP tăng theo', () => {
    const before = makeMonster({
      level: 10,
      exp: 1000,
      nickname: 'Bé',
      damageTaken: 20,
      shinyStacks: 1,
      traits: [{ id: 'fast', level: 2 }],
      skillIds: ['strike', 'growl']
    })
    const { monster, events } = autoEvolve(data, before, { rng: createRng(1), day: 0, scene })
    expect(monster).toMatchObject({
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      raceId: 'neutral',
      elementIds: ['fire'],
      level: 10,
      exp: 1000,
      nickname: 'Bé',
      damageTaken: 20,
      shinyStacks: 1,
      traits: [
        { id: 'fast', level: 2 },
        { id: 'shiny', level: 1 }
      ],
      skillIds: ['strike', 'growl', 'wave'] // giữ cũ, học thêm của loài mới
    })
    expect(getMaxHp(data, monster).gt(getMaxHp(data, before))).toBe(true)
    expect(events[0]).toEqual({
      type: 'evolve',
      monsterId: 'm1',
      fromSpeciesId: 'weakling',
      toSpeciesId: 'strongling'
    })
    expect(validateMonster(data, monster)).toEqual([])
  })

  it('nhiều hướng level: đặt danh sách chờ chọn, chưa tiến hóa', () => {
    const rng = createRng(1)
    const { monster, events } = autoEvolve(data, twig('t', { level: 5, exp: toBig(125) }), {
      rng,
      day: 0,
      scene
    })
    expect(monster.speciesId).toBe('twig')
    expect(monster.pendingEvolutionIds).toEqual(['oak', 'pine'])
    expect(events).toEqual([{ type: 'evolutionChoice', monsterId: 't', options: ['oak', 'pine'] }])
    // Đang chờ chọn thì xét lại cũng giữ nguyên.
    expect(autoEvolve(data, monster, { rng, day: 0, scene })).toEqual({ monster, events: [], rng })
  })
})

describe('chooseEvolution', () => {
  const pending = twig('t', { level: 5, exp: toBig(125), pendingEvolutionIds: ['oak', 'pine'] })
  const state = makeGameState({ seed: 1, party: [pending] })

  // oak học ở level ≤ 5: strike (đã biết), growl, blast, pumpUp vào ô trống; sap vào danh sách
  // chờ học vì đã đủ 4 ô; quick (level 50) chưa tới.
  it('tiến hóa theo hướng đã chọn và xóa danh sách chờ; skill dư vào danh sách chờ học', () => {
    const next = run(state, { type: 'chooseEvolution', monsterId: 't', speciesId: 'oak' })
    const monster = next.party[0]
    expect(monster.speciesId).toBe('oak')
    expect(monster.pendingEvolutionIds).toEqual([])
    expect(monster.skillIds).toEqual(['strike', 'growl', 'blast', 'pumpUp'])
    expect(monster.pendingSkillIds).toEqual(['sap'])
  })

  it('báo lỗi hướng không nằm trong danh sách chờ, hoặc đang trong trận', () => {
    expectActionError(
      () => run(state, { type: 'chooseEvolution', monsterId: 't', speciesId: 'cinder' }),
      'notPendingEvolution'
    )
    const inBattle = { ...makeBattleState([pending], [makeMonster({ id: 'e' })]) }
    expectActionError(
      () => run(inBattle, { type: 'chooseEvolution', monsterId: 't', speciesId: 'oak' }),
      'inBattle'
    )
  })
})

describe('tự tiến hóa sau trận thắng', () => {
  it('mọi quái trong đội đủ điều kiện: kể cả không ra sân hoặc đã gục', () => {
    // a lên level 10 nhờ trận này; b (dự bị) đã đủ level từ trước; c đã gục; d cần chọn nhánh.
    const party = [
      makeMonster({ id: 'a', level: 9, exp: 729, skillIds: ['strike', 'idle'] }),
      makeMonster({ id: 'b', level: 12, exp: 1728 }),
      makeMonster({ id: 'c', level: 10, exp: 1000, damageTaken: 999 }),
      twig('d', { level: 6, exp: toBig(216) })
    ]
    // Địch level 24 cho 0,5 × 24² = 288 EXP: a lên 729 + 288 = 1017 → level 10.
    const enemy = makeMonster({
      id: 'e',
      level: 24,
      exp: 13824,
      damageTaken: 160,
      skillIds: ['idle']
    })
    const state = makeBattleState(party, [enemy], { playerSlots: ['a', null] })
    const strike: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike' }
    const next = run(state, { type: 'submitTurn', commands: [strike] })

    expect(defined(next.battle).outcome).toBe('won')
    const species = Object.fromEntries(next.party.map((m) => [m.id, m.speciesId]))
    expect(species).toEqual({ a: 'strongling', b: 'strongling', c: 'strongling', d: 'twig' })
    expect(next.party[3].pendingEvolutionIds).toEqual(['oak', 'pine'])
    expect(eventsOf(next, 'evolve').map((e) => e.monsterId)).toEqual(['a', 'b', 'c'])
    expect(eventsOf(next, 'evolutionChoice')).toEqual([
      { type: 'evolutionChoice', monsterId: 'd', options: ['oak', 'pine'] }
    ])
  })

  it('thua hoặc chạy thì không tiến hóa; quái trong kho không tự tiến hóa', () => {
    const state = {
      ...makeBattleState(
        // Level 10: max HP 95, mất 90 → còn 5, gục ngay đòn đầu của địch.
        [makeMonster({ id: 'a', level: 10, exp: 1000, damageTaken: 90 })],
        [makeMonster({ id: 'e', level: 10, exp: 1000 })]
      ),
      storage: [makeMonster({ id: 's', level: 10, exp: 1000 })]
    }
    const lost = run(state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
    })
    expect(defined(lost.battle).outcome).toBe('lost')
    expect(lost.party[0].speciesId).toBe('weakling')
    expect(lost.storage[0].speciesId).toBe('weakling')
  })
})

describe('tiến hóa bằng đá', () => {
  const state = {
    ...makeGameState({ seed: 1, party: [twig('t', { level: 3, exp: toBig(27) })] }),
    inventory: makeInventory({ fireStone: 2 })
  }

  it('dùng đá lên quái đủ level: tiến hóa và trừ đá', () => {
    const next = run(state, { type: 'useItem', itemId: 'fireStone', monsterId: 't' })
    expect(next.party[0]).toMatchObject({
      speciesId: 'cinder',
      raceId: 'neutral', // tiến hóa giữ race
      elementIds: ['fire'],
      skillIds: ['strike', 'blast']
    })
    expect(next.inventory.stacks).toEqual({ fireStone: 1 })
  })

  it('tiến hóa giữ nguyên trạng thái bất thường', () => {
    const statuses = [{ statusId: 'sleep', turnsLeft: 2 }]
    const sleepy = { ...state, party: [twig('t', { level: 3, exp: toBig(27), statuses })] }
    const next = run(sleepy, { type: 'useItem', itemId: 'fireStone', monsterId: 't' })
    expect(next.party[0].speciesId).toBe('cinder')
    expect(next.party[0].statuses).toEqual(statuses)
  })

  it('chưa đủ level, sai loài hoặc đã fuse: không có tác dụng, không mất đá', () => {
    const young = { ...state, party: [twig('t', { level: 2, exp: toBig(8) })] }
    expectActionError(
      () => run(young, { type: 'useItem', itemId: 'fireStone', monsterId: 't' }),
      'itemNoEffect'
    )
    const other = { ...state, party: [makeMonster({ id: 't', level: 50, exp: 125000 })] }
    expectActionError(
      () => run(other, { type: 'useItem', itemId: 'fireStone', monsterId: 't' }),
      'itemNoEffect'
    )
  })

  it('đá chỉ dùng ngoài trận', () => {
    const inBattle = {
      ...makeBattleState([twig('t', { level: 3, exp: toBig(27) })], [makeMonster({ id: 'e' })]),
      inventory: makeInventory({ fireStone: 1 })
    }
    expectActionError(
      () =>
        run(inBattle, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'item', itemId: 'fireStone', targetId: 't' }]
        }),
      'itemWrongContext',
      { context: 'battle' }
    )
  })
})

describe('dạng đầu, nhiều dạng trước, tiến hóa đổi race', () => {
  it('dạng đầu tiên chưa tiến hóa', () => {
    expect(baseFormsOf(data, 'strongling')).toEqual(['weakling'])
    expect(baseFormsOf(data, 'weakling')).toEqual(['weakling'])
    expect(baseFormsOf(data, 'cinder')).toEqual(['twig'])
  })

  /** Dữ liệu fixture đã sửa (makeData không nhận hàm sửa). */
  const dataWith = (edit: (raw: ReturnType<typeof makeRawData>) => void): typeof data => {
    const raw = makeRawData()
    edit(raw)
    return createGameData(raw)
  }
  /** Dữ liệu fixture: oak có thêm dạng trước strongling (cây tiến hóa kiểu Digimon). */
  const twoParents = (): ReturnType<typeof makeData> =>
    dataWith((raw) => {
      const strongling = raw.species.find((s) => s.id === 'strongling')
      if (strongling?.kind !== 'normal') throw new Error('fixture sai')
      strongling.evolutions = [{ speciesId: 'oak', level: 20 }]
    })

  it('loài nhiều dạng trước: mọi dạng đầu, chuỗi gồm mọi tổ tiên', () => {
    const multi = twoParents()
    expect([...baseFormsOf(multi, 'oak')].sort()).toEqual(['twig', 'weakling'])
    expect(evolutionLineOf(multi, 'oak')).toEqual(
      expect.arrayContaining(['oak', 'twig', 'strongling', 'weakling'])
    )
    expect(evolutionLineOf(multi, 'oak')).not.toContain('pine')
  })

  it('breeding loài nhiều dạng đầu: con ra mọi dạng đầu tùy RNG', () => {
    const multi = twoParents()
    const mother = makeMonster({ id: 'm', speciesId: 'oak', baseSpeciesId: 'oak' })
    const father = makeMonster({ id: 'f', gender: 'male' })
    const outcomes = new Set(
      Array.from(
        { length: 30 },
        (_, seed) => makeOffspring(multi, createRng(seed), father, mother, 'egg')[0].speciesId
      )
    )
    expect(outcomes).toEqual(new Set(['twig', 'weakling']))
  })

  it('tiến hóa sang loài khác race thì đổi race; nhân hình về bản thể nếu race mới không có', () => {
    const brute = dataWith((raw) => {
      const strongling = raw.species.find((s) => s.id === 'strongling')
      if (strongling?.kind !== 'normal') throw new Error('fixture sai')
      strongling.raceId = 'brute'
    })
    const before = makeMonster({ level: 10, exp: 1000, humanForm: 'human' })
    const { monster } = autoEvolve(brute, before, { rng: createRng(1), day: 0, scene })
    expect(monster).toMatchObject({ speciesId: 'strongling', raceId: 'brute', humanForm: 'beast' })
    expect(validateMonster(brute, monster)).toEqual([])
    const beast = makeMonster({ level: 10, exp: 1000, humanForm: 'beast' })
    expect(autoEvolve(brute, beast, { rng: createRng(1), day: 0, scene }).monster.humanForm).toBe(
      'beast'
    )
  })

  it('MonsterView có hướng tiến hóa và danh sách chờ', () => {
    const state = makeGameState({
      seed: 1,
      party: [twig('t', { level: 5, exp: toBig(125), pendingEvolutionIds: ['oak', 'pine'] })]
    })
    const view = defined(getMonsterView(data, state, 't'))
    expect(view.pendingEvolutionIds).toEqual(['oak', 'pine'])
    expect(view.evolutions).toHaveLength(3)
  })

  const issuesOf = (edit: (raw: ReturnType<typeof makeRawData>) => void): string =>
    dataIssuesAfter(edit).join('\n')

  const normal = (raw: ReturnType<typeof makeRawData>, id: string): NormalSpecies => {
    const species = raw.species.find((s) => s.id === id)
    if (species?.kind !== 'normal') throw new Error('fixture sai')
    return species
  }

  it('báo vòng lặp (kể cả vòng dài), đá sai, hai hướng chung đá; nhiều dạng trước thì được', () => {
    expect(
      issuesOf((raw) => {
        normal(raw, 'strongling').evolutions = [{ speciesId: 'weakling', level: 20 }]
      })
    ).toMatch(/vòng lặp/)
    expect(
      issuesOf((raw) => {
        normal(raw, 'oak').evolutions = [{ speciesId: 'strongling', level: 20 }]
      })
    ).toBe('')
    expect(
      issuesOf((raw) => {
        normal(raw, 'oak').evolutions = [{ speciesId: 'weakling', level: 20 }]
        normal(raw, 'strongling').evolutions = [{ speciesId: 'twig', level: 20 }]
      })
    ).toMatch(/vòng lặp/)
    expect(
      issuesOf((raw) => {
        normal(raw, 'twig').evolutions[2].itemId = 'potion'
      })
    ).toMatch(/evolutionStone/)
    expect(
      issuesOf((raw) => {
        normal(raw, 'twig').evolutions[1].itemId = 'fireStone'
      })
    ).toMatch(/dùng chung đá/)
  })

  it('validateMonster báo danh sách chờ không hợp lệ', () => {
    expect(
      validateMonster(data, twig('t', { pendingEvolutionIds: ['strongling'] })).join()
    ).toMatch(/tiến hóa chờ chọn/)
    expect(validateMonster(data, makeMonster({ pendingSkillIds: ['strike'] })).join()).toMatch(
      /đã biết/
    )
  })
})
