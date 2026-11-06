// Trait quy đổi từ Portals of Phereon trên dữ liệu thật (content-sources-real.md): mỗi trait chạy được trong
// trận (không lỗi, không ra NaN / Infinity); lặp theo dữ liệu nên thêm / bớt trait không phải sửa test.

import { rawGameData } from '@data'
import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { createGameState, gameReducer } from '../game'
import { getMaxHp } from '../monster'
import { defined, makeMonster, uniformStats } from '../testing'
import { suggestBattleCommands } from './ai'
import { startWildBattle, suggestReplacements } from './battleActions'
import type { GameData, GameState, Monster } from '../model'

const data: GameData = createGameData(rawGameData)
const SPECIES_ID = Object.values(data.species).find(
  (species) => species.kind === 'normal' && species.source === 'portalsOfPhereon'
)?.id

const BIOME_ID = defined(Object.keys(data.biomes)[0], 'map')

function fighter(id: string, speciesId: string, traitId?: string): Monster {
  const species = defined(data.species[speciesId], 'loài')
  if (species.kind !== 'normal') throw new Error('loài phải là loài thường')
  const skillId = defined(species.learnset[0], 'skill').skillId
  return makeMonster({
    id,
    speciesId,
    baseSpeciesId: speciesId,
    raceId: species.raceId,
    elementIds: species.elementIds,
    level: 30,
    exp: 27000,
    genes: uniformStats(30),
    skillIds: [skillId],
    traits: traitId ? [{ id: traitId, level: 1 }] : []
  })
}

function playTurns(state: GameState, turns: number): GameState {
  let current = state
  for (let i = 0; i < turns && current.battle && current.battle.phase !== 'ended'; i++) {
    current =
      current.battle?.phase === 'chooseReplacement'
        ? gameReducer(data, current, {
            type: 'replaceFainted',
            replacements: suggestReplacements(data, current)
          })
        : gameReducer(data, current, {
            type: 'submitTurn',
            commands: suggestBattleCommands(data, current, { transforms: false })
          })
  }
  return current
}

/** Trận hoang 6 lượt trên dữ liệu thật; trả lỗi nếu máu không hữu hạn. */
function checkBattle(party: Monster[], essences: GameState['essences']): string | null {
  const onFloor: GameState = {
    ...createGameState({
      seed: 7,
      party,
      money: 1000,
      floorBiomeIds: [BIOME_ID],
      location: { type: 'floor', floor: 1 }
    }),
    essences
  }
  const after = playTurns(startWildBattle(data, onFloor), 6)
  const all = [...after.party, ...(after.battle?.enemies ?? [])]
  return all.every((m) => m.damageTaken.isFinite() && getMaxHp(data, m).isFinite())
    ? null
    : 'máu không hữu hạn'
}

describe('trait Portals of Phereon trên dữ liệu thật', () => {
  const NO_ESSENCES: GameState['essences'] = { owned: [], offer: null }
  const run = (id: string, build: () => string | null, failures: string[]): void => {
    try {
      const issue = build()
      if (issue) failures.push(`${id}: ${issue}`)
    } catch (error) {
      failures.push(`${id}: ${String(error)}`)
    }
  }

  it('mỗi trait chạy được trong trận, máu luôn là số hữu hạn', () => {
    if (!SPECIES_ID) return
    const traits = Object.values(data.traits).filter((trait) => trait.id.endsWith('Phereon'))
    expect(traits.length).toBeGreaterThan(0)
    const failures: string[] = []
    for (const trait of traits) {
      run(
        trait.id,
        () =>
          checkBattle([fighter('a', SPECIES_ID, trait.id), fighter('b', SPECIES_ID)], NO_ESSENCES),
        failures
      )
    }
    expect(failures).toEqual([])
  }, 600_000)

  it('mỗi skill chạy được trong trận', () => {
    if (!SPECIES_ID) return
    const skills = Object.values(data.skills).filter((skill) => skill.id.endsWith('Phereon'))
    expect(skills.length).toBeGreaterThan(0)
    const failures: string[] = []
    for (const skill of skills) {
      run(
        skill.id,
        () =>
          checkBattle(
            [
              { ...fighter('a', SPECIES_ID), skillIds: [skill.id] },
              { ...fighter('b', SPECIES_ID), skillIds: [skill.id] }
            ],
            NO_ESSENCES
          ),
        failures
      )
    }
    expect(failures).toEqual([])
  }, 600_000)

  it('mỗi tinh chất chạy được trong trận', () => {
    if (!SPECIES_ID) return
    const failures: string[] = []
    for (const essence of Object.values(data.essences)) {
      run(
        essence.id,
        () =>
          checkBattle([fighter('a', SPECIES_ID), fighter('b', SPECIES_ID)], {
            owned: [essence.id],
            offer: null
          }),
        failures
      )
    }
    expect(failures).toEqual([])
  }, 600_000)
})
