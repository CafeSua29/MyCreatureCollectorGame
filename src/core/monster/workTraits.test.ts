// Trait làm việc và tốc độ làm việc (docs/rules/dwelling.md mục "Trait làm việc"): tung cho quái mới
// (số trait theo trọng số, không trùng nhóm, shiny có Lucky), con breeding thừa hưởng / đột biến,
// tốc độ / sức theo trait và loài, cô đặc (hiến tế), % chỉ số, Phù cấy, MonsterView, kiểm tra dữ
// liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { makeOffspring } from '../progression'
import { rollMonster } from '../world'
import { getMonsterView } from '../roster'
import { speciesWorkStats, workSpeedPercent, workStats, workerPower } from '../registries'
import type { GameData, GameState, Monster, RawGameData } from '../model'
import { createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import { computeStats } from './stats'
import { rollChildWorkTraits, rollWorkTraits } from './workTraits'

function makeWorkData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.workTraits.push(
    { id: 'artisan', weight: 1, effects: [{ type: 'workSpeed', percent: 50 }] },
    { id: 'serious', weight: 1, group: 'diligence', effects: [{ type: 'workSpeed', percent: 20 }] },
    {
      id: 'slacker',
      weight: 1,
      group: 'diligence',
      effects: [{ type: 'workSpeed', percent: -95 }]
    },
    {
      id: 'workSlave',
      weight: 1,
      effects: [
        { type: 'workSpeed', percent: 30 },
        { type: 'statPercent', stats: { attack: -30 } }
      ]
    },
    {
      id: 'kilnForeman',
      weight: 1,
      effects: [{ type: 'workTypeSpeed', workType: 'kindling', percent: 25 }]
    },
    { id: 'lucky', weight: 0, effects: [{ type: 'workSpeed', percent: 15 }] }
  )
  raw.items.push({
    id: 'purge',
    category: 'consumable',
    price: 1,
    use: 'field',
    target: 'ally',
    effects: [{ type: 'clearWorkTraits', params: {} }]
  })
  raw.items.push({
    id: 'implantArtisan',
    category: 'consumable',
    price: 1,
    use: 'field',
    target: 'ally',
    effects: [{ type: 'addWorkTrait', params: { traitId: 'artisan' } }]
  })
  raw.config.dwelling = {
    ...raw.config.dwelling,
    workTraits: {
      countWeights: [0, 0, 1],
      inheritChance: 50,
      mutationChance: 0,
      shinyTraitId: 'lucky'
    }
  }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeWorkData()

/** Quái lửa level 16 (luyện bậc 2, level^0,5 = 4). */
const fire = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 16, elementIds: ['fire'], ...overrides })

describe('tung trait làm việc', () => {
  it('quái mới: đúng số trait theo trọng số, không trùng, không trùng nhóm; tất định theo seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const [traits] = rollWorkTraits(data, createRng(seed), { shinyStacks: 0 })
      expect(traits).toHaveLength(2)
      expect(new Set(traits).size).toBe(2)
      expect(traits.includes('serious') && traits.includes('slacker')).toBe(false)
      // Trọng số 0 (lucky) không bao giờ ra khi không shiny.
      expect(traits).not.toContain('lucky')
      expect(rollWorkTraits(data, createRng(seed), { shinyStacks: 0 })[0]).toEqual(traits)
    }
  })

  it('shiny luôn có trait shiny (thay trait cuối khi đủ chỗ); một lựa chọn số trait không tốn RNG', () => {
    const [traits] = rollWorkTraits(data, createRng(3), { shinyStacks: 1 })
    expect(traits).toHaveLength(2)
    expect(traits).toContain('lucky')
    const none = makeWorkData((raw) => {
      raw.config.dwelling.workTraits.countWeights = [1]
    })
    const rng = createRng(9)
    expect(rollWorkTraits(none, rng, { shinyStacks: 0 })).toEqual([[], rng])
  })

  it('rollMonster gắn trait làm việc; fixture (chỉ trọng số 0 trait) không có trait', () => {
    const spec = {
      encounters: [{ speciesId: 'weakling', weight: 1 }],
      levelMin: 1,
      levelMax: 1,
      geneMultiplier: toBig(1),
      shinyChance: 0,
      aging: false
    }
    expect(rollMonster(data, createRng(1), spec, 'w')[0].workTraits).toHaveLength(2)
    expect(
      rollMonster(createGameData(withFixtureText(makeRawData())), createRng(1), spec, 'w')[0]
        .workTraits
    ).toEqual([])
  })

  it('con breeding: 100% thừa hưởng thì nhận đủ (bỏ trait trùng nhóm, không quá tối đa); 0% thì không', () => {
    const all = makeWorkData((raw) => {
      raw.config.dwelling.workTraits.inheritChance = 100
    })
    const parents = [
      fire({ workTraits: ['serious', 'artisan'] }),
      fire({ id: 'b', workTraits: ['slacker', 'workSlave'] })
    ]
    const [traits] = rollChildWorkTraits(all, createRng(1), { parents, shinyStacks: 0 })
    expect(traits).toEqual(['serious', 'artisan'])
    const never = makeWorkData((raw) => {
      raw.config.dwelling.workTraits.inheritChance = 0
      raw.config.dwelling.workTraits.mutationChance = 100
    })
    const [mutated] = rollChildWorkTraits(never, createRng(1), { parents, shinyStacks: 0 })
    expect(mutated).toHaveLength(1)
  })

  it('makeOffspring gắn trait làm việc của con', () => {
    const father = makeMonster({ id: 'f', gender: 'male', workTraits: ['artisan'] })
    const mother = makeMonster({ id: 'm', workTraits: ['artisan'] })
    const all = makeWorkData((raw) => {
      raw.config.dwelling.workTraits.inheritChance = 100
    })
    const [child] = makeOffspring(all, createRng(1), father, mother, 'c')
    expect(child.workTraits).toEqual(['artisan'])
  })
})

describe('tốc độ và sức làm việc', () => {
  it('tốc độ = gốc × (1 + Σ %); trait theo loại việc chỉ tính đúng loại; không dưới minWorkSpeed', () => {
    expect(workSpeedPercent(data, fire(), 'kindling')).toBe(100)
    const worker = fire({ workTraits: ['artisan', 'kilnForeman'] })
    expect(workSpeedPercent(data, worker, 'kindling')).toBe(175)
    expect(workSpeedPercent(data, worker, 'mining')).toBe(150)
    expect(workSpeedPercent(data, fire({ workTraits: ['slacker'] }), 'mining')).toBe(10)
    // Sức = 200 / 100 × 4 × 1,75.
    expect(workerPower(data, worker, 'kindling')).toBe(14)
  })

  it('loài ghi `workSpeed`; hiến tế đủ 4 stack thì mọi chỉ số làm việc đang có + 50% chỉ số gốc TB', () => {
    const fast = makeWorkData((raw) => {
      const species = defined(raw.species.find((s) => s.id === 'weakling'))
      if (species.kind === 'normal') species.workSpeed = 70
    })
    expect(workSpeedPercent(fast, fire(), 'kindling')).toBe(70)
    // Chỉ số gốc TB của weakling 30: lửa 100% = 30, cô đặc + 50% = 15.
    expect(workStats(data, fire({ sacrificeStacks: 3 }))).toEqual({ kindling: 30 })
    expect(workStats(data, fire({ sacrificeStacks: 4 }))).toEqual({ kindling: 45 })
  })

  it('trait có % chỉ số đi vào nguồn workTraits của computeStats', () => {
    const slave = computeStats(data, fire({ workTraits: ['workSlave'] }))
    const plain = computeStats(data, fire())
    expect(slave.final.attack.lt(plain.final.attack)).toBe(true)
    expect(slave.final.defense.eq(plain.final.defense)).toBe(true)
  })

  it('MonsterView: trait và từng loại việc (bậc, tốc độ, sức)', () => {
    const view = defined(
      getMonsterView(
        data,
        makeGameState({ seed: 1, party: [fire({ workTraits: ['artisan'] })] }),
        'a'
      )
    )
    expect(view.work.traitIds).toEqual(['artisan'])
    expect(view.work.types.kindling).toEqual({ stat: 30, speedPercent: 150, power: 12 })
    expect(view.work).toMatchObject({ fullness: 100, sanity: 100, conditionPercent: 100 })
    expect(view.work.types.mining.stat).toBe(0)
    expect(view.soulLevels.workSpeed).toMatchObject({ level: 0, percent: 0 })
  })
})

describe('chỉ số làm việc theo loài', () => {
  it('% trong bảng × chỉ số gốc trung bình của loài (cùng cỡ với công / thủ), làm tròn', () => {
    const scaled = makeWorkData((raw) => {
      raw.config.dwelling = {
        ...raw.config.dwelling,
        workStatPercents: {
          ...raw.config.dwelling.workStatPercents,
          races: { neutral: { mining: 150 } }
        }
      }
    })
    // weakling: tổng chỉ số gốc 180 → TB 30 → 150% = 45; hệ cỏ không có trong bảng fixture.
    expect(speciesWorkStats(scaled, 'weakling')).toEqual({ mining: 45 })
    expect(speciesWorkStats(scaled, 'nope')).toEqual({})
    // Quái dùng hệ / race hiện tại: hệ lửa thêm kindling 100% = 30.
    expect(workStats(scaled, fire())).toEqual({ mining: 45, kindling: 30 })
    // Loài chỉ số gốc gấp 10 thì chỉ số làm việc gấp 10.
    const strong = makeWorkData((raw) => {
      const species = raw.species.find((s) => s.id === 'weakling')
      if (species?.kind === 'normal') {
        species.baseStats = Object.fromEntries(
          Object.entries(species.baseStats).map(([stat, value]) => [stat, value * 10])
        ) as typeof species.baseStats
      }
    })
    expect(workStats(strong, fire()).kindling).toBe(300)
  })

  it('điểm sách làm việc: + % chỉ số gốc TB (loại chưa có cũng được); số cực lớn không lỗi', () => {
    expect(workStats(data, fire({ workPoints: { kindling: 50, mining: 100 } }))).toEqual({
      kindling: 45,
      mining: 30
    })
    const huge = fire({ workPoints: { kindling: Number.MAX_SAFE_INTEGER } })
    expect(Number.isFinite(workerPower(data, huge, 'kindling'))).toBe(true)
  })

  it('hồn tinh tốc độ làm việc: + soulWorkSpeedPercentPerLevel % mỗi cấp', () => {
    expect(workSpeedPercent(data, fire({ workSoulLevel: 5 }), 'mining')).toBeCloseTo(115)
  })
})

describe('Sách làm việc và Tượng Lực', () => {
  const manualData = makeWorkData((raw) => {
    raw.items.push({
      id: 'manualKiln',
      category: 'consumable',
      price: 1,
      use: 'field',
      target: 'ally',
      effects: [{ type: 'addWorkPoints', params: { workType: 'kindling', percent: 100 } }]
    })
  })

  it('Sách làm việc: + điểm đúng loại việc, tiêu một cuốn; save hợp lệ', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [fire()] }),
      inventory: makeInventory({ manualKiln: 2 })
    }
    const next = gameReducer(manualData, state, {
      type: 'useItem',
      itemId: 'manualKiln',
      monsterId: 'a'
    })
    expect(next.party[0].workPoints).toEqual({ kindling: 100 })
    expect(workStats(manualData, next.party[0]).kindling).toBe(60)
    expect(next.inventory.stacks.manualKiln).toBe(1)
    expect(validateGameState(manualData, next)).toEqual([])
  })

  it('Tượng Lực nâng tốc độ làm việc như một chỉ số: tốn điểm hồn tinh; mục lạ báo lỗi', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [fire()], money: 1_000_000 }),
      inventory: makeInventory({ soulSmall: 10 })
    }
    const next = gameReducer(manualData, state, {
      type: 'upgradeSoulLevel',
      monsterId: 'a',
      stat: 'workSpeed'
    })
    expect(next.party[0].workSoulLevel).toBe(1)
    expect(next.inventory.stacks.soulSmall).toBe(9)
    expect(validateGameState(manualData, next)).toEqual([])
    expectActionError(
      () =>
        gameReducer(manualData, state, {
          type: 'upgradeSoulLevel',
          monsterId: 'a',
          stat: 'luck' as 'workSpeed'
        }),
      'malformedAction'
    )
  })
})

describe('Phù cấy trait làm việc', () => {
  const use = (state: GameState): GameState =>
    gameReducer(data, state, { type: 'useItem', itemId: 'implantArtisan', monsterId: 'a' })
  const withMonster = (monster: Monster): GameState => ({
    ...makeGameState({ seed: 1, party: [monster] }),
    inventory: makeInventory({ implantArtisan: 2 })
  })

  it('thêm trait còn chỗ; đã có hoặc đủ chỗ (không trùng nhóm) thì không tác dụng, không mất phù', () => {
    const next = use(withMonster(fire()))
    expect(next.party[0].workTraits).toEqual(['artisan'])
    expect(next.inventory.stacks.implantArtisan).toBe(1)
    expect(validateGameState(data, next)).toEqual([])
    expectActionError(() => use(next), 'itemNoEffect')
    expectActionError(
      () => use(withMonster(fire({ workTraits: ['serious', 'workSlave'] }))),
      'itemNoEffect'
    )
  })
})

describe('Phù tẩy tâm', () => {
  it('xóa mọi trait làm việc; chưa có trait thì không tác dụng, không mất phù', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [fire({ workTraits: ['workSlave', 'artisan'] })] }),
      inventory: makeInventory({ purge: 1 })
    }
    const use = (s: GameState): GameState =>
      gameReducer(data, s, { type: 'useItem', itemId: 'purge', monsterId: 'a' })
    const next = use(state)
    expect(next.party[0].workTraits).toEqual([])
    expect(next.inventory.stacks.purge).toBeUndefined()
    expectActionError(
      () => use({ ...next, inventory: makeInventory({ purge: 1 }) }),
      'itemNoEffect'
    )
  })
})

describe('kiểm tra dữ liệu / save, migrate', () => {
  it('dữ liệu sai: hiệu ứng lạ, loại việc lạ, config, shinyTraitId, workSpeed của loài', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        raw.workTraits.push({
          id: 'bad',
          weight: -1,
          effects: [
            { type: 'teleport' } as unknown as RawGameData['workTraits'][number]['effects'][number],
            { type: 'workTypeSpeed', workType: 'digging' as 'mining', percent: 5 }
          ]
        })
        raw.config.dwelling = {
          ...raw.config.dwelling,
          workTraits: {
            countWeights: [0],
            inheritChance: 120,
            mutationChance: 0,
            shinyTraitId: 'ghost'
          },
          condenseStacks: 0
        }
        const species = defined(raw.species.find((s) => s.id === 'weakling'))
        if (species.kind === 'normal') species.workSpeed = -5
      },
      { regenerateText: true }
    )
    const text = issues.join('\n')
    for (const fragment of [
      'Trait làm việc "bad": weight',
      'effects[0].type',
      'effects[1].workType',
      'countWeights',
      'inheritChance',
      'shinyTraitId',
      'condenseStacks',
      'Loài "weakling".workSpeed'
    ]) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save sai: trait lạ / lặp / quá số tối đa / trùng nhóm', () => {
    const state = makeGameState({
      seed: 1,
      party: [fire({ workTraits: ['ghost', 'serious', 'slacker', 'serious'] })]
    })
    const text = validateGameState(data, state).join('\n')
    for (const fragment of ['không tồn tại "ghost"', 'bị lặp', 'tối đa 2', 'cùng nhóm']) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('save sai: điểm sách làm việc / cấp hồn tinh tốc độ không hợp lệ', () => {
    const state = makeGameState({
      seed: 1,
      party: [fire({ workPoints: { kindling: -1, flying: 5 } as never, workSoulLevel: 1.5 })]
    })
    const text = validateGameState(data, state).join(' | ')
    for (const fragment of ['workPoints.kindling', 'loại việc lạ "flying"', 'workSoulLevel']) {
      expect(text, fragment).toContain(fragment)
    }
  })

  it('migrate v89 → v90: mọi quái chưa có điểm sách làm việc, hồn tinh tốc độ cấp 0', () => {
    const state = makeGameState({ seed: 1, party: [fire({ workSoulLevel: 3 })] })
    const raw = serializeState(state) as Record<string, unknown>
    const party = (raw.party as Record<string, unknown>[]).map(
      ({ workPoints: _points, workSoulLevel: _soul, ...rest }) => rest
    )
    const migrated = migrateState({ ...raw, version: 89, party }, data)
    expect(migrated.party[0]).toMatchObject({ workPoints: {}, workSoulLevel: 0 })
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('migrate v88 → v89: mọi quái (kể cả trứng) chưa có trait làm việc', () => {
    const state = makeGameState({ seed: 1, party: [fire({ workTraits: ['artisan'] })] })
    const raw = serializeState(state) as Record<string, unknown>
    const party = (raw.party as Record<string, unknown>[]).map(
      ({ workTraits: _workTraits, workPoints: _points, workSoulLevel: _soul, ...rest }) => rest
    )
    const migrated = migrateState({ ...raw, version: 88, party }, data)
    expect(migrated.party[0].workTraits).toEqual([])
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
