// Kiểm tra dữ liệu độ khó và chế độ thử thách (docs/rules/challenge-modes.md): config.challenge.

import { describe, expect, it } from 'vitest'
import { dataIssuesAfter } from '../testing'

describe('config.challenge', () => {
  it('fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('báo lỗi: thiếu mức, trường lạ, số sai, bậc Randomizer < 1', () => {
    const issues = dataIssuesAfter((raw) => {
      const { difficulties } = raw.config.challenge
      const { hard: _hard, ...rest } = difficulties
      raw.config.challenge = {
        difficulties: {
          ...rest,
          easy: { ...difficulties.easy, geneMultiplier: 0, rewardPercent: -150 },
          normal: { ...difficulties.normal, levelPercent: -150, expPercent: Number.NaN }
        } as typeof difficulties,
        randomizer: { tierSize: 0 }
      }
      Object.assign(raw.config.challenge.difficulties.normal, { extra: 1 })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('config.challenge.difficulties.hard phải là object'),
        expect.stringContaining('config.challenge.difficulties.easy.geneMultiplier'),
        expect.stringContaining('config.challenge.difficulties.easy.rewardPercent'),
        expect.stringContaining('config.challenge.difficulties.normal.levelPercent'),
        expect.stringContaining('config.challenge.difficulties.normal.expPercent'),
        expect.stringContaining('extra'),
        expect.stringContaining('config.challenge.randomizer.tierSize')
      ])
    )
  })

  it('thành tựu challengeFloor: độ khó / chế độ lạ báo lỗi', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.achievements.push({
        id: 'badChallenge',
        condition: { type: 'challengeFloor', difficulty: 'insane', modes: ['speedrun'] },
        tiers: [{ value: 1, rewards: {} }]
      })
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('độ khó lạ "insane"'),
        expect.stringContaining('modes phải là danh sách')
      ])
    )
  })
})
