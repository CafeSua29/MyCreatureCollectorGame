import { describe, expect, it } from 'vitest'
import type { SaveSummary } from '@core'
import { makeData } from '@core/testing'
import {
  monsterNameOf,
  nameOf,
  summaryLeaderLabel,
  summaryLeaderName,
  summaryLocationLabel
} from './contentText'

const data = makeData()

const summary = (overrides: Partial<SaveSummary> = {}): SaveSummary => ({
  leaderNickname: null,
  leaderSpeciesId: 'weakling',
  highestLevel: 5,
  partySize: 1,
  totalMonsters: 1,
  money: '500',
  location: { type: 'town' },
  inBattle: false,
  challenge: {
    difficulty: 'normal',
    nuzlocke: false,
    hardcore: false,
    randomizer: false,
    gameOver: false
  },
  ...overrides
})

describe('contentText', () => {
  it('tra tên theo ngôn ngữ mặc định của dữ liệu', () => {
    expect(nameOf(data, 'species', 'twig')).toBe('twig')
    expect(monsterNameOf(data, { nickname: null, speciesId: 'twig' })).toBe('twig')
    expect(monsterNameOf(data, { nickname: 'Bé', speciesId: 'twig' })).toBe('Bé')
  })

  it('tên quái đầu đội trong tóm tắt save', () => {
    expect(summaryLeaderName(data, summary())).toBe('weakling')
    expect(summaryLeaderLabel(data, summary({ leaderNickname: 'Bé' }))).toBe('Bé · weakling')
    expect(summaryLeaderLabel(data, summary({ leaderSpeciesId: null }))).toBe('?')
  })

  it('vị trí trong tóm tắt save: thị trấn hoặc tầng kèm tên biome', () => {
    expect(summaryLocationLabel(data, summary())).toBe('Thị trấn')
    const floor = summary({ location: { type: 'floor', floor: 12, biomeId: 'lair' } })
    expect(summaryLocationLabel(data, floor)).toBe('Tầng 12 · lair')
  })
})
