// Ability theo loài (docs/rules/abilities.md): ability theo ô và loài hiện tại (tiến hóa, Mega, quái
// fuse), hook chạy như trait, tung ô quái hoang / con breeding, quái sinh ra, kiểm tra dữ liệu,
// kiểm tra save, migrate v64 → v65.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { migrateState, serializeState, validateGameState } from '../game'
import { rollMonster, type MonsterRollSpec } from '../world'
import { createRng, toBig, type RngState } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { AbilitySlot, GameData, Monster, NormalSpecies, RawGameData } from '../model'
import {
  abilityTraitId,
  changedAbilitySlot,
  rollAbilitySlot,
  rollChildAbilitySlot,
  speciesAbility
} from './abilities'
import { ITEM_EFFECTS } from '../registries'
import { computeStats } from './stats'
import { validateMonster } from './validateMonster'

/** weakling: ability fast / slow, ẩn armored; strongling: chỉ một ability fast; dạng Mega: armored. */
function abilityRaw(config: Partial<RawGameData['config']['abilities']> = {}): RawGameData {
  const raw = makeRawData()
  const edit = (id: string, fields: Partial<NormalSpecies>): void => {
    const index = raw.species.findIndex((entry) => entry.id === id)
    raw.species[index] = { ...(raw.species[index] as NormalSpecies), ...fields }
  }
  edit('weakling', { abilities: ['fast', 'slow'], hiddenAbility: 'armored' })
  edit('strongling', { abilities: ['fast'] })
  edit('megaWeakling', { abilities: ['armored'] })
  raw.config.abilities = { ...raw.config.abilities, ...config }
  return raw
}

const data = createGameData(withFixtureText(abilityRaw()))

const species = (id: string): NormalSpecies => data.species[id] as NormalSpecies
const monster = (speciesId: string, abilitySlot: AbilitySlot): Monster =>
  makeMonster({ id: 'm', speciesId, baseSpeciesId: speciesId, abilitySlot })

describe('ability theo ô', () => {
  it('hai ability thường, ẩn; một ability: ô thứ hai / ô ẩn về ability thứ nhất; không có: null', () => {
    expect(speciesAbility(species('weakling'), 'first')).toBe('fast')
    expect(speciesAbility(species('weakling'), 'second')).toBe('slow')
    expect(speciesAbility(species('weakling'), 'hidden')).toBe('armored')
    expect(speciesAbility(species('strongling'), 'second')).toBe('fast')
    expect(speciesAbility(species('strongling'), 'hidden')).toBe('fast')
    expect(speciesAbility(species('twig'), 'first')).toBeNull()
  })

  it('theo loài hiện tại (tiến hóa đổi ability theo ô); quái fuse theo loài gốc', () => {
    expect(abilityTraitId(data, monster('weakling', 'second'))).toBe('slow')
    // Tiến hóa: cùng ô, loài mới.
    const evolved = { ...monster('weakling', 'second'), speciesId: 'strongling' }
    expect(abilityTraitId(data, evolved)).toBe('fast')
    const fused = { ...monster('weakling', 'hidden'), speciesId: 'fused', fused: true }
    expect(abilityTraitId(data, fused)).toBe('armored')
    expect(abilityTraitId(data, monster('twig', 'first'))).toBeNull()
  })

  it('đang Mega: ability của dạng Mega; Mega đã kết thúc thì về loài', () => {
    const mega: Monster = {
      ...monster('weakling', 'first'),
      battleTransform: {
        kind: 'mega',
        formSpeciesId: 'megaWeakling',
        originalElementIds: ['grass']
      }
    }
    expect(abilityTraitId(data, mega)).toBe('armored')
    const ended: Monster = {
      ...mega,
      battleTransform: { ...defined(mega.battleTransform), ended: true }
    }
    expect(abilityTraitId(data, ended)).toBe('fast')
  })

  it('hook của ability chạy như trait (tốc độ +50% / −50%; ẩn armored không đổi tốc độ)', () => {
    const speedOf = (slot: AbilitySlot): number =>
      computeStats(data, monster('weakling', slot)).final.speed.toNumber()
    const base = speedOf('hidden')
    expect(base).toBeGreaterThan(0)
    expect(speedOf('first')).toBeGreaterThan(base)
    expect(speedOf('second')).toBeLessThan(base)
  })
})

describe('tung ô', () => {
  type Roll = (rng: RngState) => [AbilitySlot, RngState]
  const tally = (roll: Roll): Record<AbilitySlot, number> => {
    const counts: Record<AbilitySlot, number> = { first: 0, second: 0, hidden: 0 }
    let rng = createRng(7)
    for (let i = 0; i < 400; i++) {
      let slot: AbilitySlot
      ;[slot, rng] = roll(rng)
      counts[slot]++
    }
    return counts
  }
  const withConfig = (config: Partial<RawGameData['config']['abilities']>): GameData =>
    createGameData(withFixtureText(abilityRaw(config)))

  it('quái hoang: ô ẩn theo tỉ lệ (0 / 100), còn lại chia đều hai ô thường', () => {
    const none = tally((rng) => rollAbilitySlot(data, rng))
    expect(none.hidden).toBeGreaterThan(0)
    const noHidden = withConfig({ wildHiddenChance: 0 })
    const counts = tally((rng) => rollAbilitySlot(noHidden, rng))
    expect(counts.hidden).toBe(0)
    expect(counts.first).toBeGreaterThan(150)
    expect(counts.second).toBeGreaterThan(150)
    const allHidden = withConfig({ wildHiddenChance: 100 })
    expect(tally((rng) => rollAbilitySlot(allHidden, rng)).hidden).toBe(400)
  })

  it('con breeding: theo ô của mẹ (giữ / đổi ô thường, ô ẩn theo tỉ lệ riêng)', () => {
    const keep = withConfig({ inheritChance: 100, inheritHiddenChance: 100 })
    const lose = withConfig({ inheritChance: 0, inheritHiddenChance: 0 })
    const mother = (slot: AbilitySlot): Monster => monster('weakling', slot)
    const keepRoll =
      (slot: AbilitySlot): Roll =>
      (rng) =>
        rollChildAbilitySlot(keep, rng, mother(slot))
    const loseRoll =
      (slot: AbilitySlot): Roll =>
      (rng) =>
        rollChildAbilitySlot(lose, rng, mother(slot))
    expect(tally(keepRoll('second')).second).toBe(400)
    expect(tally(keepRoll('hidden')).hidden).toBe(400)
    expect(tally(loseRoll('second')).first).toBe(400)
    const fromHidden = tally(loseRoll('hidden'))
    expect(fromHidden.hidden).toBe(0)
    expect(fromHidden.first + fromHidden.second).toBe(400)
  })

  it('quái sinh ra: loài có ability tung ô; loài không có giữ ô thứ nhất và không tốn random', () => {
    const spec = (speciesId: string): MonsterRollSpec => ({
      encounters: [{ speciesId, weight: 1 }],
      levelMin: 5,
      levelMax: 5,
      geneMultiplier: toBig(1),
      shinyChance: 0,
      aging: false
    })
    const allHidden = withConfig({ wildHiddenChance: 100 })
    const [withAbility] = rollMonster(allHidden, createRng(3), spec('weakling'), 'w')
    expect(withAbility.abilitySlot).toBe('hidden')
    const [plain, afterPlain] = rollMonster(allHidden, createRng(3), spec('twig'), 'p')
    expect(plain.abilitySlot).toBe('first')
    const [, afterNoAbilityData] = rollMonster(data, createRng(3), spec('twig'), 'p')
    expect(afterPlain).toEqual(afterNoAbilityData)
  })
})

describe('kiểm tra', () => {
  it('dữ liệu: abilities 1–2 trait tồn tại không lặp, hiddenAbility cần abilities, config 0–100', () => {
    const issuesFor = (edit: (raw: RawGameData) => void): string =>
      dataIssuesAfter((raw) => {
        const base = abilityRaw()
        raw.species = base.species
        raw.config.abilities = base.config.abilities
        edit(raw)
      }).join('\n')
    expect(issuesFor(() => undefined)).toBe('')
    const editTwig = (fields: Partial<NormalSpecies>) => (raw: RawGameData) => {
      const index = raw.species.findIndex((entry) => entry.id === 'twig')
      raw.species[index] = { ...(raw.species[index] as NormalSpecies), ...fields }
    }
    expect(issuesFor(editTwig({ abilities: [] }))).toMatch(/abilities phải là danh sách 1–2/)
    expect(issuesFor(editTwig({ abilities: ['fast', 'slow', 'armored'] }))).toMatch(/1–2/)
    expect(issuesFor(editTwig({ abilities: ['nope'] }))).toMatch(/trait không tồn tại "nope"/)
    expect(issuesFor(editTwig({ abilities: ['fast', 'fast'] }))).toMatch(/abilities bị lặp/)
    expect(issuesFor(editTwig({ hiddenAbility: 'fast' }))).toMatch(/phải có abilities/)
    expect(issuesFor(editTwig({ abilities: ['fast'], hiddenAbility: 'nope' }))).toMatch(
      /hiddenAbility: trait không tồn tại/
    )
    expect(
      issuesFor((raw) => {
        raw.config.abilities = { ...raw.config.abilities, wildHiddenChance: 101 }
      })
    ).toMatch(/wildHiddenChance/)
  })

  it('save: abilitySlot phải là first / second / hidden', () => {
    const bad = { ...monster('weakling', 'first'), abilitySlot: 'third' as AbilitySlot }
    expect(validateMonster(data, bad).join()).toMatch(/abilitySlot/)
    expect(validateMonster(data, monster('weakling', 'hidden'))).toEqual([])
  })

  it('migrate v64 → v65: mọi quái ô thứ nhất, save hợp lệ', () => {
    const state = makeGameState({ seed: 1, party: [monster('weakling', 'second')] })
    const raw = serializeState(state) as Record<string, unknown>
    const strip = (entry: unknown): unknown => {
      const { abilitySlot: _abilitySlot, ...rest } = entry as Record<string, unknown>
      return rest
    }
    const migrated = migrateState(
      { ...raw, version: 64, party: (raw.party as unknown[]).map(strip) },
      data
    )
    expect(defined(migrated.party[0]).abilitySlot).toBe('first')
    expect(validateGameState(data, migrated)).toEqual([])
  })
})

describe('đổi ô ability (Ability Capsule / Patch)', () => {
  const at = (speciesId: string, abilitySlot: AbilitySlot): Monster =>
    makeMonster({ speciesId, baseSpeciesId: speciesId, abilitySlot })

  it('Capsule đổi hai ô thường; ô ẩn hoặc loài một ability thường thì không', () => {
    expect(changedAbilitySlot(data, at('weakling', 'first'), 'swapNormal')).toBe('second')
    expect(changedAbilitySlot(data, at('weakling', 'second'), 'swapNormal')).toBe('first')
    expect(changedAbilitySlot(data, at('weakling', 'hidden'), 'swapNormal')).toBeNull()
    expect(changedAbilitySlot(data, at('strongling', 'first'), 'swapNormal')).toBeNull()
  })

  it('Patch: thường → ẩn, ẩn → thường thứ nhất; loài không có ability ẩn thì không', () => {
    expect(changedAbilitySlot(data, at('weakling', 'second'), 'toggleHidden')).toBe('hidden')
    expect(changedAbilitySlot(data, at('weakling', 'hidden'), 'toggleHidden')).toBe('first')
    expect(changedAbilitySlot(data, at('strongling', 'first'), 'toggleHidden')).toBeNull()
  })

  it('hiệu ứng vật phẩm changeAbilitySlot', () => {
    const handler = ITEM_EFFECTS.changeAbilitySlot
    expect(handler.validateParams({ change: 'swapNormal' }, data)).toEqual([])
    expect(handler.validateParams({ change: 'other' }, data).join()).toContain('change')
    const monster = at('weakling', 'first')
    const ctx = {
      data,
      monster,
      maxHp: toBig(1),
      useCount: 0,
      highestFloor: 1,
      count: 1,
      rng: createRng(1),
      favorite: false
    }
    expect(handler.apply({ change: 'toggleHidden' }, ctx)?.abilitySlot).toBe('hidden')
    expect(
      handler.apply({ change: 'swapNormal' }, { ...ctx, monster: at('strongling', 'first') })
    ).toBeNull()
  })
})
