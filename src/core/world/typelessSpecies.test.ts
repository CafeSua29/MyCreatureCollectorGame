// Loài không hệ (docs/rules/data.md mục "Loài không hệ"): dữ liệu hợp lệ, quái sinh ra / breed / boss
// có hệ Tera tung trong mọi hệ, trao đổi đòi đúng loài, save chấp nhận quái không hệ của loài đó,
// trong trận khắc hệ trung tính.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { validateGameState } from '../game'
import { TRADE_WANTS, makeOffspring } from '../progression'
import { elementEffectiveness, isTypelessSpecies } from '../registries'
import { createRng, toBig } from '../shared'
import {
  dataIssuesAfter,
  makeGameState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { NormalSpecies } from '../model'
import { rollBossTransformTraits, rollMonster } from './encounter'

const raw = makeRawData()
const weakling = raw.species.find((s): s is NormalSpecies => s.id === 'weakling')
if (!weakling) throw new Error('fixture thiếu weakling')
raw.species.push({ ...weakling, id: 'angel', elementIds: [], evolutions: [] })
const data = createGameData(withFixtureText(raw))
const angel = (fields: Parameters<typeof makeMonster>[0] = {}): ReturnType<typeof makeMonster> =>
  makeMonster({
    speciesId: 'angel',
    baseSpeciesId: 'angel',
    elementIds: [],
    teraElementId: 'fire',
    ...fields
  })

describe('loài không hệ', () => {
  it('dữ liệu: loài được không hệ; nội dung khác vẫn cần ít nhất một hệ', () => {
    expect(isTypelessSpecies(data, 'angel')).toBe(true)
    expect(isTypelessSpecies(data, 'weakling')).toBe(false)
    expect(isTypelessSpecies(data, 'khôngCó')).toBe(false)
    const issues = dataIssuesAfter((rawData) => {
      rawData.species.push({ ...weakling, id: 'badAngel', elementIds: ['khôngCó'], evolutions: [] })
    }).join('\n')
    expect(issues).toContain('hệ không tồn tại "khôngCó"')
  })

  it('quái hoang / boss: hệ rỗng, hệ Tera tung trong mọi hệ của game', () => {
    const spec = {
      encounters: [{ speciesId: 'angel', weight: 1 }],
      levelMin: 5,
      levelMax: 5,
      geneMultiplier: toBig(1),
      shinyChance: 0,
      aging: false
    }
    const teras = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const [wild] = rollMonster(data, createRng(seed), spec, 'w')
      expect(wild.elementIds).toEqual([])
      expect(Object.hasOwn(data.elements, wild.teraElementId)).toBe(true)
      teras.add(wild.teraElementId)
      const [boss] = rollBossTransformTraits(data, createRng(seed), { floor: 1, boss: wild })
      expect(boss.teraElementId.length).toBeGreaterThan(0)
    }
    expect(teras.size).toBeGreaterThan(1)
  })

  it('breed: con không hệ, có hệ Tera', () => {
    const mother = angel({ id: 'm', gender: 'female' })
    const father = angel({ id: 'd', gender: 'male' })
    const [child] = makeOffspring(data, createRng(3), father, mother, 'egg')
    expect(child.elementIds).toEqual([])
    expect(Object.hasOwn(data.elements, child.teraElementId)).toBe(true)
  })

  it('trao đổi: yêu cầu theo hệ với loài không hệ thành yêu cầu đúng loài', () => {
    const species = data.species.angel
    if (species.kind !== 'normal') throw new Error('angel phải là loài thường')
    const [want] = TRADE_WANTS.element.roll({ species, minLevel: 3, rng: createRng(1) })
    expect(want).toEqual({ kind: 'species', speciesId: 'angel', minLevel: 3 })
  })

  it('save: quái không hệ hợp lệ khi loài không hệ, loài có hệ thì vẫn bị chặn', () => {
    const ok = makeGameState({ seed: 1, party: [angel({ id: 'a' })] })
    expect(validateGameState(data, ok)).toEqual([])
    const bad = makeGameState({ seed: 1, party: [makeMonster({ id: 'b', elementIds: [] })] })
    expect(validateGameState(data, bad).join('\n')).toContain('chỉ trong trận mới được không hệ')
  })

  it('trận: mọi hệ đánh trung tính (STAB theo hệ của quái nên không có)', () => {
    for (const elementId of Object.keys(data.elements)) {
      expect(elementEffectiveness(data, elementId, angel().elementIds)).toBe(1)
    }
  })
})
