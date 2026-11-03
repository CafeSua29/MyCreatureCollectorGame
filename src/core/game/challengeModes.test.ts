// Độ khó và chế độ thử thách (docs/rules/challenge-modes.md): độ khó (đổi, mức thấp nhất, level /
// gen / cuồng bạo / thưởng), Nuzlocke (lượt gặp mỗi khu, dupes, chết thật khóa, thua game),
// Hardcore (seed, lưu tay, mở save), Randomizer (tất định, cùng bậc), migrate, kiểm tra save.

import { describe, expect, it } from 'vitest'
import {
  canLoadSave,
  canSaveManually,
  createNewGame,
  gameReducer,
  migrateState,
  parseSaveSummary,
  reseedState,
  rollStarters,
  serializeState,
  summarizeState,
  validateGameState,
  type SaveListing
} from '../game'
import { getMaxHp } from '../monster'
import {
  achievementProgress,
  difficultyNumbers,
  frenzyNumbers,
  gameDataFor,
  isDexSpecies,
  learnsetDonorId,
  isNuzlockeDupe,
  randomizedSpeciesId
} from '../registries'
import {
  floorSite,
  generateFloorBoss,
  generateTradeMonster,
  generateWildMonster,
  skillsAtLevel,
  type FloorSite
} from '../world'
import { cloneDraft } from '../battle/draft'
import { applyWin, finish } from '../battle/outcome'
import { toBig } from '../shared'
import {
  atFloor,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type {
  AchievementDef,
  BattleCommand,
  ChallengeOptions,
  GameAction,
  GameState,
  Monster
} from '../model'

const data = makeData()
const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const withChallenge = (state: GameState, challenge: Partial<ChallengeOptions>): GameState => ({
  ...state,
  options: {
    ...state.options,
    ...challenge,
    permadeathEnabled: challenge.nuzlocke ? true : state.options.permadeathEnabled
  }
})

const fallen = (id: string): Monster => {
  const monster = makeMonster({ id })
  return { ...monster, damageTaken: getMaxHp(data, monster) }
}

describe('độ khó: đổi ngoài trận, mức thấp nhất từng dùng', () => {
  const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })

  it('game mới / save mới: Thường, mức thấp nhất Thường', () => {
    expect(state.options).toMatchObject({ difficulty: 'normal', lowestDifficulty: 'normal' })
  })

  it('lên khó không đổi mức thấp nhất; xuống dễ thì ghi lại; lên lại vẫn giữ Dễ', () => {
    const hard = run(state, { type: 'setDifficulty', difficulty: 'nightmare' })
    expect(hard.options).toMatchObject({ difficulty: 'nightmare', lowestDifficulty: 'normal' })
    const easy = run(hard, { type: 'setDifficulty', difficulty: 'easy' })
    expect(easy.options).toMatchObject({ difficulty: 'easy', lowestDifficulty: 'easy' })
    const back = run(easy, { type: 'setDifficulty', difficulty: 'hard' })
    expect(back.options).toMatchObject({ difficulty: 'hard', lowestDifficulty: 'easy' })
    expect(validateGameState(data, back)).toEqual([])
  })

  it('lỗi: trong trận, đúng mức đang chơi, mức lạ', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'w1' })])
    expectActionError(() => run(battle, { type: 'setDifficulty', difficulty: 'hard' }), 'inBattle')
    expectActionError(
      () => run(state, { type: 'setDifficulty', difficulty: 'normal' }),
      'difficultyUnchanged'
    )
    const odd = { type: 'setDifficulty', difficulty: 'insane' } as unknown as GameAction
    expectActionError(() => run(state, odd), 'malformedAction')
  })
})

describe('độ khó: quái địch, cuồng bạo, thưởng', () => {
  const base = makeGameState({ seed: 7, party: [makeMonster({ id: 'a' })], highestFloor: 3 })
  const siteAt = (difficulty: ChallengeOptions['difficulty']): FloorSite =>
    floorSite(data, withChallenge(base, { difficulty }), 3)

  it('quái hoang: level × (1 + levelPercent %), gen × geneMultiplier (cùng RNG)', () => {
    const [normal] = generateWildMonster(data, base.rng, siteAt('normal'), 'm1')
    const [hard] = generateWildMonster(data, base.rng, siteAt('hard'), 'm1')
    const { levelPercent, geneMultiplier } = difficultyNumbers(data, 'hard')
    // Khoảng level nhân theo %, cùng RNG nên level nằm trong khoảng đã nhân.
    expect(hard.level).toBeGreaterThan(normal.level)
    expect(hard.level).toBeLessThanOrEqual(Math.round(normal.level * (1 + levelPercent / 100)) + 1)
    expect(hard.genes.attack.gte(normal.genes.attack)).toBe(true)
    expect(geneMultiplier).toBeGreaterThan(1)
  })

  it('level tối thiểu 1 ở Dễ; boss tầng cũng theo độ khó', () => {
    const lowSite = floorSite(data, withChallenge(base, { difficulty: 'easy' }), 1)
    const [easy] = generateWildMonster(data, base.rng, lowSite, 'm1')
    expect(easy.level).toBe(1)
    const [normalBoss] = generateFloorBoss(data, base.rng, siteAt('normal'), 'm1')
    const [hardBoss] = generateFloorBoss(data, base.rng, siteAt('nightmare'), 'm1')
    const { levelPercent } = difficultyNumbers(data, 'nightmare')
    expect(hardBoss.level).toBe(Math.round(normalBoss.level * (1 + levelPercent / 100)))
  })

  it('quái NPC trao đổi (quà) không theo độ khó', () => {
    const spec = {
      encounters: [{ speciesId: 'weakling', weight: 1 }],
      id: 'm1',
      levelOffset: 0,
      geneMultiplier: 1,
      shinyMultiplier: 1
    }
    const [normal] = generateTradeMonster(data, base.rng, { site: siteAt('normal'), ...spec })
    const [hard] = generateTradeMonster(data, base.rng, { site: siteAt('nightmare'), ...spec })
    expect(hard).toEqual(normal)
  })

  it('cuồng bạo: quái hoang / boss cộng ngưỡng và tỉ lệ, quái có chủ không đổi, kẹp 0–100', () => {
    const normal = frenzyNumbers(data, 'wild', 'normal')
    const hard = frenzyNumbers(data, 'wild', 'hard')
    expect(hard.hpThresholdPercent).toBe(normal.hpThresholdPercent + 10)
    expect(hard.extraActionChance).toBe(normal.extraActionChance + 5)
    expect(frenzyNumbers(data, 'tamed', 'nightmare')).toEqual(
      frenzyNumbers(data, 'tamed', 'normal')
    )
    const easy = frenzyNumbers(data, 'boss', 'easy')
    expect(easy.extraActionChance).toBeGreaterThanOrEqual(0)
    expect(easy.hpThresholdPercent).toBeGreaterThanOrEqual(0)
  })

  it('EXP theo expPercent (Khó −20% trong fixture), không theo rewardPercent', () => {
    const expAt = (difficulty: ChallengeOptions['difficulty']): number => {
      const state = makeBattleState([makeMonster({ id: 'a' })], [fallen('w1')], { difficulty })
      const d = cloneDraft(state)
      applyWin(data, d)
      return defined(d.party[0]).exp.minus(defined(state.party[0]).exp).toNumber()
    }
    const normal = expAt('normal')
    expect(normal).toBeGreaterThan(0)
    expect(expAt('hard')).toBeLessThan(normal)
    expect(expAt('easy')).toBe(normal)
  })

  it('thưởng tiền theo % của độ khó trận (Khó +20%, Dễ −20%)', () => {
    const moneyAt = (difficulty: ChallengeOptions['difficulty']): number => {
      const state = makeBattleState([makeMonster({ id: 'a' })], [fallen('w1')], { difficulty })
      const d = cloneDraft(state)
      applyWin(data, d)
      return d.money.minus(state.money).toNumber()
    }
    const normal = moneyAt('normal')
    expect(normal).toBeGreaterThan(0)
    expect(moneyAt('hard')).toBe(Math.floor(normal * 1.2))
    expect(moneyAt('easy')).toBe(Math.floor(normal * 0.8))
  })

  it('trận mở theo độ khó lúc mở', () => {
    const state = atFloor(withChallenge(base, { difficulty: 'hard' }), 1)
    const opened = run(state, { type: 'startWildBattle' })
    expect(defined(opened.battle).difficulty).toBe('hard')
  })
})

describe('Nuzlocke', () => {
  const nuzlocke = (dupesClause = false): GameState =>
    withChallenge(
      atFloor(
        {
          ...makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })], nextMonsterId: 10 }),
          inventory: makeInventory({ masterBall: 5 })
        },
        1
      ),
      { nuzlocke: { dupesClause } }
    )
  const ball = (targetId: string): BattleCommand => ({
    slot: 0,
    kind: 'item',
    itemId: 'masterBall',
    targetId
  })
  const fleeOut = (state: GameState): GameState => {
    const battle = defined(state.battle)
    return run(
      { ...state, battle: { ...battle, phase: 'ended', outcome: 'fled' } },
      {
        type: 'leaveBattle'
      }
    )
  }

  it('trận đầu tiên của tầng là lượt gặp: khu đã dùng, bắt được một con', () => {
    const opened = run(nuzlocke(), { type: 'startWildBattle' })
    const battle = defined(opened.battle)
    expect(battle.nuzlockeEncounter).toBe(true)
    expect(opened.challenge.nuzlockeAreas).toEqual(['floor:1'])
    expect(battle.log).toContainEqual({ type: 'nuzlockeEncounter', area: 'floor:1' })
    const target = defined(battle.enemies[0]).id
    const caught = run(opened, { type: 'submitTurn', commands: [ball(target)] })
    expect(defined(caught.battle).captured.map((m) => m.id)).toEqual([target])
    expect(defined(caught.battle).nuzlockeEncounter).toBe(false)
  })

  it('trận sau ở cùng tầng không bắt được (kể cả khi trận đầu không bắt); tầng khác được', () => {
    const first = fleeOut(run(nuzlocke(), { type: 'startWildBattle' }))
    const second = run(first, { type: 'startWildBattle' })
    const battle = defined(second.battle)
    expect(battle.nuzlockeEncounter).toBe(false)
    expectActionError(
      () => run(second, { type: 'submitTurn', commands: [ball(defined(battle.enemies[0]).id)] }),
      'nuzlockeAreaUsed',
      { area: 'floor:1' }
    )
    const floor2 = run(atFloor(first, 2), { type: 'startWildBattle' })
    expect(defined(floor2.battle).nuzlockeEncounter).toBe(true)
    expect(floor2.challenge.nuzlockeAreas).toEqual(['floor:1', 'floor:2'])
  })

  it('dupes clause: chuỗi tiến hóa đã sở hữu không tính lượt gặp; tắt thì vẫn tính', () => {
    const state = nuzlocke(true)
    const opened = run(state, { type: 'startWildBattle' })
    const speciesIds = defined(opened.battle).enemies.map((m) => m.baseSpeciesId)
    const owned = { ...state, dex: { ...state.dex, owned: [...speciesIds] } }
    expect(isNuzlockeDupe(data, owned, defined(defined(opened.battle).enemies[0]))).toBe(true)
    const dupe = run(owned, { type: 'startWildBattle' })
    expect(defined(dupe.battle).nuzlockeEncounter).toBe(false)
    expect(dupe.challenge.nuzlockeAreas).toEqual([])
    const noClause = withChallenge(owned, { nuzlocke: { dupesClause: false } })
    expect(isNuzlockeDupe(data, noClause, defined(defined(opened.battle).enemies[0]))).toBe(false)
  })

  it('không chơi Nuzlocke: không ghi khu, bắt bình thường', () => {
    const state = withChallenge(nuzlocke(), { nuzlocke: null })
    const opened = run(state, { type: 'startWildBattle' })
    expect(defined(opened.battle).nuzlockeEncounter).toBe(false)
    expect(opened.challenge.nuzlockeAreas).toEqual([])
  })

  it('ép bật chết thật, không tắt được', () => {
    const state = nuzlocke()
    expect(state.options.permadeathEnabled).toBe(true)
    expectActionError(
      () => run(state, { type: 'setGameOption', option: 'permadeathEnabled', enabled: false }),
      'nuzlockeLocked',
      { option: 'permadeathEnabled' }
    )
  })

  it('đội và kho trống sau trận: thua game, mọi action báo lỗi trừ rời trận; save hợp lệ', () => {
    const state = withChallenge(makeBattleState([fallen('a')], [makeMonster({ id: 'w1' })]), {
      nuzlocke: { dupesClause: true }
    })
    const d = cloneDraft(state)
    finish(data, d, 'lost')
    expect(d.party).toEqual([])
    expect(d.challenge.gameOver).toBe(true)
    expect(d.battle.log.at(-1)).toEqual({ type: 'gameOver' })
    expect(d.inventory.souls.map((soul) => soul.id)).toEqual(['a'])
    const left = run(d, { type: 'leaveBattle' })
    expect(validateGameState(data, left)).toEqual([])
    expectActionError(() => run(left, { type: 'healParty' }), 'gameOver')
    expectActionError(() => run(left, { type: 'setDifficulty', difficulty: 'easy' }), 'gameOver')
  })

  it('đội trống nhưng kho còn quái: quái trong kho vào đội như thường', () => {
    const state = {
      ...withChallenge(makeBattleState([fallen('a')], [makeMonster({ id: 'w1' })]), {
        nuzlocke: { dupesClause: true }
      }),
      storage: [makeMonster({ id: 's1' })]
    }
    const d = cloneDraft(state)
    finish(data, d, 'lost')
    expect(d.party.map((m) => m.id)).toEqual(['s1'])
    expect(d.challenge.gameOver).toBe(false)
  })
})

describe('Hardcore', () => {
  const state = withChallenge(makeGameState({ seed: 5, party: [makeMonster({ id: 'a' })] }), {
    hardcore: true
  })

  it('mở save không đổi seed (không reroll); game thường đổi seed', () => {
    expect(reseedState(state, 123)).toBe(state)
    const normal = withChallenge(state, { hardcore: false })
    expect(reseedState(normal, 123).rng).not.toBe(normal.rng)
  })

  it('tóm tắt save ghi chế độ; không lưu tay được; chỉ mở được save mới nhất', () => {
    const summary = summarizeState(data, state)
    expect(summary.challenge).toEqual({
      difficulty: 'normal',
      nuzlocke: false,
      hardcore: true,
      randomizer: false,
      gameOver: false
    })
    expect(parseSaveSummary(JSON.parse(JSON.stringify(summary)))).toEqual(summary)
    expect(parseSaveSummary({ ...summary, challenge: undefined })).toBeNull()
    expect(canSaveManually(summary)).toBe(false)
    expect(canSaveManually(summarizeState(data, withChallenge(state, { hardcore: false })))).toBe(
      true
    )
    expect(canSaveManually(null)).toBe(true)
    const listing = (id: string, savedAt: string, hardcore: boolean): SaveListing => ({
      id,
      gameId: id.split('/')[0],
      kind: 'auto',
      savedAt,
      summary: { ...summary, challenge: { ...summary.challenge, hardcore } }
    })
    const saves = [
      listing('g-h/auto-1.json', '2026-01-01T00:00:00Z', true),
      listing('g-h/auto-2.json', '2026-01-02T00:00:00Z', true),
      listing('g-n/auto-1.json', '2026-01-01T00:00:00Z', false),
      listing('g-n/auto-2.json', '2026-01-02T00:00:00Z', false)
    ]
    expect(canLoadSave(saves, 'g-h/auto-1.json')).toBe(false)
    expect(canLoadSave(saves, 'g-h/auto-2.json')).toBe(true)
    expect(canLoadSave(saves, 'g-n/auto-1.json')).toBe(true)
    expect(canLoadSave(saves, 'g-x/auto-1.json')).toBe(true)
  })
})

describe('Randomizer', () => {
  const randomizer = { seed: 42, learnsets: false }
  const normalIds = Object.keys(data.species).filter((id) => data.species[id]?.kind === 'normal')

  it('tất định, là hoán vị, giữ nguyên khi tắt', () => {
    const mapped = normalIds.map((id) => randomizedSpeciesId(data, randomizer, id))
    expect(normalIds.map((id) => randomizedSpeciesId(data, randomizer, id))).toEqual(mapped)
    expect(new Set(mapped).size).toBe(new Set(normalIds).size)
    expect(normalIds.map((id) => randomizedSpeciesId(data, null, id))).toEqual(normalIds)
    // Loài lạ / Thiên Kiếp giữ nguyên.
    expect(randomizedSpeciesId(data, randomizer, 'noSuchSpecies')).toBe('noSuchSpecies')
    const tribulation = data.config.awakening.tribulation.speciesId
    expect(randomizedSpeciesId(data, randomizer, tribulation)).toBe(tribulation)
  })

  it('chỉ đổi sang loài cùng bậc tổng chỉ số gốc (tierSize loài liền nhau)', () => {
    const total = (id: string): number => {
      const species = data.species[id]
      return species?.kind === 'normal'
        ? Object.values(species.baseStats).reduce((sum, value) => sum + value, 0)
        : 0
    }
    const { tierSize } = data.config.challenge.randomizer
    const tribulation = data.config.awakening.tribulation.speciesId
    const sorted = normalIds
      .filter((id) => id !== tribulation && isDexSpecies(data.species[id]))
      .sort((a, b) => total(a) - total(b) || (a < b ? -1 : 1))
    for (let seed = 0; seed < 5; seed++) {
      for (const id of normalIds) {
        const to = randomizedSpeciesId(data, { seed, learnsets: false }, id)
        if (to === id) continue
        const tierOf = (speciesId: string): number =>
          Math.floor(sorted.indexOf(speciesId) / tierSize)
        expect(tierOf(to)).toBe(tierOf(id))
      }
    }
  })

  it('quái hoang theo bảng; game mới bật Randomizer có seed riêng, tất định theo seed game', () => {
    const state = makeGameState({ seed: 9, party: [makeMonster({ id: 'a' })], highestFloor: 2 })
    const site = floorSite(data, withChallenge(state, { randomizer }), 2)
    const [plain] = generateWildMonster(data, state.rng, floorSite(data, state, 2), 'm1')
    const [mapped] = generateWildMonster(data, state.rng, site, 'm1')
    const choices = site.biome.encounters.map((entry) =>
      randomizedSpeciesId(data, randomizer, entry.speciesId)
    )
    expect(choices).toContain(mapped.speciesId)
    expect(plain.level).toBe(mapped.level)
    const seed = 11
    const starterSpeciesId = defined(rollStarters(data, seed, false).candidates[0]).speciesId
    const options = { seed, starterSpeciesId, gender: 'male' as const, nickname: null }
    const gameA = createNewGame(data, { ...options, randomizer: { learnsets: true } })
    const gameB = createNewGame(data, { ...options, randomizer: { learnsets: true } })
    expect(gameA.options.randomizer).toEqual(gameB.options.randomizer)
    expect(createNewGame(data, options).options.randomizer).toBeNull()
  })
})

describe('Randomizer xáo learnset', () => {
  const learnsetOf = (gameData: typeof data, id: string): unknown => {
    const species = gameData.species[id]
    return species?.kind === 'normal' ? species.learnset : undefined
  }
  /** State có cấu hình Randomizer đã cho. */
  const withRandomizer = (randomizer: GameState['options']['randomizer']): GameState => {
    const state = makeGameState({ seed: 1 })
    return { ...state, options: { ...state.options, randomizer } }
  }
  /** Seed đầu tiên mà ít nhất một loài đổi sang learnset khác (fixture ít loài). */
  const seed = defined(
    Array.from({ length: 50 }, (_, i) => i).find((candidate) => {
      const shuffled = gameDataFor(data, withRandomizer({ seed: candidate, learnsets: true }))
      return Object.keys(data.species).some(
        (id) => JSON.stringify(learnsetOf(shuffled, id)) !== JSON.stringify(learnsetOf(data, id))
      )
    }),
    'seed có xáo'
  )
  const on = { randomizer: { seed, learnsets: true } }
  const onState = withRandomizer(on.randomizer)

  it('tắt (hoặc không Randomizer) thì đúng dữ liệu gốc; bật thì tất định, nhớ cache', () => {
    expect(gameDataFor(data, withRandomizer(null))).toBe(data)
    expect(gameDataFor(data, withRandomizer({ seed, learnsets: false }))).toBe(data)
    expect(gameDataFor(data, onState)).toBe(gameDataFor(data, onState))
    expect(data.species).not.toBe(gameDataFor(data, onState).species)
  })

  it('mỗi loài học theo learnset của loài cho cùng bậc; phần khác của loài giữ nguyên', () => {
    const shuffled = gameDataFor(data, onState)
    for (const id of Object.keys(data.species)) {
      const donor = learnsetDonorId(data, seed, id)
      expect(learnsetOf(shuffled, id)).toEqual(learnsetOf(data, donor))
      const { learnset: _a, ...rest } = shuffled.species[id] as { learnset?: unknown }
      const { learnset: _b, ...original } = data.species[id] as { learnset?: unknown }
      expect(rest).toEqual(original)
    }
    // Bảng learnset khác bảng loài (seed trộn).
    const ids = Object.keys(data.species)
    const differs = Array.from({ length: 20 }, (_, s) => s).some((s) =>
      ids.some(
        (id) =>
          learnsetDonorId(data, s, id) !==
          randomizedSpeciesId(data, { seed: s, learnsets: true }, id)
      )
    )
    expect(differs).toBe(true)
  })

  it('reducer dùng learnset đã xáo: quái hoang sinh với skill theo learnset của loài cho', () => {
    const state = withChallenge(
      atFloor(makeGameState({ seed: 4, party: [makeMonster({ id: 'a' })], nextMonsterId: 10 }), 1),
      on
    )
    const shuffled = gameDataFor(data, onState)
    for (let i = 0; i < 10; i++) {
      const opened = run({ ...state, rng: state.rng + i }, { type: 'startWildBattle' })
      for (const enemy of defined(opened.battle).enemies) {
        const species = shuffled.species[enemy.speciesId]
        if (species?.kind !== 'normal') continue
        expect(enemy.skillIds).toEqual(skillsAtLevel(shuffled, species, enemy.level))
      }
    }
    expect(validateGameState(data, state)).toEqual([])
  })

  it('migrate v100 → v101: game Randomizer cũ không xáo learnset', () => {
    const state = withChallenge(makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }), {
      randomizer: { seed: 3, learnsets: true }
    })
    const raw = serializeState(state) as Record<string, unknown>
    const options = { ...(raw.options as Record<string, unknown>), randomizer: { seed: 3 } }
    const migrated = migrateState({ ...raw, version: 100, options }, data)
    expect(migrated.options.randomizer).toEqual({ seed: 3, learnsets: false })
    expect(validateGameState(data, migrated)).toEqual([])
    const bad = withChallenge(state, {
      randomizer: { seed: 3, learnsets: 'yes' as unknown as boolean }
    })
    expect(validateGameState(data, bad)).toContainEqual(
      expect.stringContaining('randomizer.learnsets')
    )
  })

  it('game mới: randomizer sai dạng là malformedAction', () => {
    const starterSpeciesId = defined(rollStarters(data, 11, false).candidates[0]).speciesId
    const odd = {
      seed: 11,
      starterSpeciesId,
      gender: 'male',
      nickname: null,
      randomizer: true
    } as unknown as Parameters<typeof createNewGame>[1]
    expectActionError(() => createNewGame(data, odd), 'malformedAction')
  })
})

describe('game mới và save', () => {
  const seed = 11
  const starterSpeciesId = defined(rollStarters(data, seed, false).candidates[0]).speciesId
  const options = { seed, starterSpeciesId, gender: 'male' as const, nickname: null }

  it('chọn độ khó / Nuzlocke / Hardcore lúc tạo game; Nuzlocke ép bật chết thật', () => {
    const game = createNewGame(data, {
      ...options,
      difficulty: 'nightmare',
      nuzlocke: { dupesClause: true },
      hardcore: true
    })
    expect(game.options).toMatchObject({
      difficulty: 'nightmare',
      lowestDifficulty: 'nightmare',
      nuzlocke: { dupesClause: true },
      hardcore: true,
      permadeathEnabled: true
    })
    expect(game.challenge).toEqual({ nuzlockeAreas: [], gameOver: false })
    expect(validateGameState(data, game)).toEqual([])
  })

  it('lựa chọn sai dạng: malformedAction', () => {
    const odd = { ...options, difficulty: 'insane' } as unknown as Parameters<
      typeof createNewGame
    >[1]
    expectActionError(() => createNewGame(data, odd), 'malformedAction')
    const badNuzlocke = { ...options, nuzlocke: {} } as unknown as Parameters<
      typeof createNewGame
    >[1]
    expectActionError(() => createNewGame(data, badNuzlocke), 'malformedAction')
  })

  it('migrate v99 → v100: Thường, tắt các chế độ, trận đang dở Thường', () => {
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'w1' })])
    const raw = serializeState(battle) as Record<string, unknown>
    const options = raw.options as Record<string, unknown>
    const legacyOptions = {
      lifespanEnabled: options.lifespanEnabled,
      permadeathEnabled: options.permadeathEnabled
    }
    const legacyBattle = { ...(raw.battle as Record<string, unknown>) }
    delete legacyBattle.difficulty
    delete legacyBattle.nuzlockeEncounter
    const { challenge: _challenge, ...rest } = raw
    const migrated = migrateState(
      { ...rest, version: 99, options: legacyOptions, battle: legacyBattle },
      data
    )
    expect(migrated.options).toMatchObject({
      difficulty: 'normal',
      lowestDifficulty: 'normal',
      nuzlocke: null,
      hardcore: false,
      randomizer: null
    })
    expect(migrated.challenge).toEqual({ nuzlockeAreas: [], gameOver: false })
    expect(defined(migrated.battle)).toMatchObject({
      difficulty: 'normal',
      nuzlockeEncounter: false
    })
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('kiểm tra save: báo lỗi khi sai', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    const issuesOf = (edit: (s: GameState) => GameState): string[] =>
      validateGameState(data, edit(state))
    expect(issuesOf((s) => withChallenge(s, { difficulty: 'easy' }))).toContainEqual(
      expect.stringContaining('lowestDifficulty')
    )
    expect(
      issuesOf((s) => ({ ...s, options: { ...s.options, nuzlocke: { dupesClause: true } } }))
    ).toContainEqual(expect.stringContaining('permadeathEnabled'))
    expect(issuesOf((s) => ({ ...s, challenge: { ...s.challenge, gameOver: true } }))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('chỉ có khi chơi Nuzlocke'),
        expect.stringContaining('đội và kho phải trống')
      ])
    )
    expect(
      issuesOf((s) => ({
        ...s,
        challenge: { nuzlockeAreas: ['floor:1', 'floor:1'], gameOver: false }
      }))
    ).toContainEqual(expect.stringContaining('không được trùng'))
    expect(
      issuesOf((s) => ({ ...s, challenge: { nuzlockeAreas: ['floor:0'], gameOver: false } }))
    ).toContainEqual(expect.stringContaining('nuzlockeAreas'))
    expect(
      issuesOf((s) => withChallenge(s, { randomizer: { seed: 2 ** 33, learnsets: false } }))
    ).toContainEqual(expect.stringContaining('randomizer.seed'))
    expect(issuesOf((s) => ({ ...s, party: [] }))).toContainEqual(
      expect.stringContaining('party phải có từ 1 quái')
    )
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'w1' })], {
      nuzlockeEncounter: true
    })
    expect(validateGameState(data, battle)).toContainEqual(
      expect.stringContaining('battle.nuzlockeEncounter')
    )
  })
})

describe('thành tựu theo độ khó / chế độ', () => {
  const def = (condition: AchievementDef['condition']): AchievementDef => ({
    id: 'x',
    condition,
    tiers: [{ value: 1, rewards: {} }]
  })
  const state = { ...makeGameState({ seed: 1, party: [makeMonster()] }), highestFloor: 30 }

  it('tầng cao nhất khi chưa từng chơi dễ hơn mức yêu cầu và đủ chế độ; không thì 0', () => {
    const hard = def({ type: 'challengeFloor', difficulty: 'hard' })
    const nuzlocke = def({ type: 'challengeFloor', modes: ['nuzlocke'] })
    expect(achievementProgress(data, state, hard)).toBe(0)
    const onHard = withChallenge(state, { difficulty: 'hard', lowestDifficulty: 'hard' })
    expect(achievementProgress(data, onHard, hard)).toBe(30)
    expect(achievementProgress(data, onHard, nuzlocke)).toBe(0)
    const run2 = withChallenge(state, { nuzlocke: { dupesClause: true } })
    expect(achievementProgress(data, run2, nuzlocke)).toBe(30)
    // Đã từng xuống Dễ: không tính nữa dù đang chơi Ác mộng.
    const fell = withChallenge(state, { difficulty: 'nightmare', lowestDifficulty: 'easy' })
    expect(achievementProgress(data, fell, hard)).toBe(0)
  })
})

describe('số lớn', () => {
  it('thưởng Ác mộng với tiền cực lớn vẫn hữu hạn', () => {
    const state = {
      ...makeBattleState([makeMonster({ id: 'a' })], [fallen('w1')], { difficulty: 'nightmare' }),
      money: toBig('1e1000')
    }
    const d = cloneDraft(state)
    applyWin(data, d)
    expect(d.money.isFinite()).toBe(true)
    expect(d.money.gte(state.money)).toBe(true)
  })
})
