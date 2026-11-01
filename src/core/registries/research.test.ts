// Nghiên cứu loài (docs/rules/species-research.md): nhiệm vụ theo phạm vi, nhiệm vụ riêng, điểm / cấp,
// lợi ích theo cấp chỉ áp đúng loài, cộng bộ đếm (quái fuse, shiny, tiến hóa), dữ liệu sai.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { dataIssuesAfter, makeData, makeMonster, makeRawData } from '../testing'
import type { ResearchState } from '../model'
import {
  hasResearchReveal,
  isResearchComplete,
  recordCaughtResearch,
  recordEvolutionResearch,
  recordResearch,
  researchCompletedCount,
  researchLevel,
  researchMultiplier,
  researchPoints,
  researchTasksOf
} from './research'

const data = makeData()

const caught = (count: number): ResearchState => ({
  weakling: { counters: { caught: count }, claimedLevel: 0 }
})

/** 60 điểm = cấp 5. */
const level5: ResearchState = {
  weakling: { counters: { caught: 25, defeated: 5 }, claimedLevel: 0 }
}

describe('nhiệm vụ của loài', () => {
  it('"tiến hóa ra" chỉ cho loài có dạng trước; loài ngoài Dex không có nhiệm vụ', () => {
    const kinds = (id: string): string[] => researchTasksOf(data, id).map((task) => task.kind)
    expect(kinds('weakling')).not.toContain('evolvedInto')
    expect(kinds('strongling')).toContain('evolvedInto')
    expect(kinds('weakling')).toContain('caught')
    expect(kinds('megaWeakling')).toEqual([])
    expect(kinds('nope')).toEqual([])
  })

  it('nhiệm vụ riêng của loài thêm sau mẫu chung', () => {
    const raw = makeRawData()
    raw.config.research.speciesTasks = {
      weakling: [{ kind: 'defeated', thresholds: [1], points: 30 }]
    }
    const custom = createGameData(raw)
    const tasks = researchTasksOf(custom, 'weakling')
    expect(tasks.at(-1)).toEqual({ kind: 'defeated', thresholds: [1], points: 30 })
    // Hạ 1 lần: mẫu chung (mốc 5) chưa đạt, nhiệm vụ riêng cho 30 điểm.
    const research = { weakling: { counters: { defeated: 1 }, claimedLevel: 0 } }
    expect(researchPoints(custom, research, 'weakling')).toBe(30)
    expect(researchTasksOf(custom, 'strongling').some((t) => t.points === 30)).toBe(false)
  })
})

describe('điểm và cấp', () => {
  it('mỗi mốc đã đạt cho điểm; cấp theo levelPoints; 0 = chưa nghiên cứu', () => {
    expect(researchLevel(data, {}, 'weakling')).toBe(0)
    expect(researchPoints(data, caught(1), 'weakling')).toBe(10)
    expect(researchLevel(data, caught(1), 'weakling')).toBe(1)
    expect(researchLevel(data, caught(3), 'weakling')).toBe(2)
    // 50 điểm: cấp 4 (45 ≤ 50 < 60); thêm hạ 5 lần = 60 điểm: cấp 5.
    expect(researchLevel(data, caught(25), 'weakling')).toBe(4)
    expect(researchLevel(data, level5, 'weakling')).toBe(5)
  })

  it('số cực lớn: điểm dừng ở mốc cuối; đủ việc thì Hoàn thành (cấp 10)', () => {
    const big = Number.MAX_SAFE_INTEGER
    expect(researchPoints(data, caught(big), 'weakling')).toBe(50)
    const full: ResearchState = {
      weakling: {
        counters: { caught: big, defeated: big, mainElementSkillSeen: big, caughtWithStatus: big },
        claimedLevel: 0
      }
    }
    expect(researchLevel(data, full, 'weakling')).toBe(10)
    expect(isResearchComplete(data, full, 'weakling')).toBe(true)
    expect(researchCompletedCount(data, { ...full, strongling: caught(1).weakling })).toBe(1)
  })
})

describe('lợi ích theo cấp', () => {
  it('chỉ áp đúng loài và từ đúng cấp', () => {
    // Cấp 5: mở thông tin, learnset, +10% tỉ lệ bắt; chưa có EXP / shiny / điểm yếu.
    const research = level5
    expect(hasResearchReveal(data, research, 'weakling', 'revealProfile')).toBe(true)
    expect(hasResearchReveal(data, research, 'weakling', 'revealLearnset')).toBe(true)
    expect(hasResearchReveal(data, research, 'weakling', 'revealWeakPoints')).toBe(false)
    expect(researchMultiplier(data, research, 'weakling', 'catchRatePercent')).toBeCloseTo(1.1)
    expect(researchMultiplier(data, research, 'weakling', 'expPercent')).toBe(1)
    expect(researchMultiplier(data, research, 'strongling', 'catchRatePercent')).toBe(1)
    expect(researchMultiplier(data, caught(10), 'weakling', 'catchRatePercent')).toBe(1)
  })
})

describe('cộng bộ đếm', () => {
  it('0 hoặc loài ngoài Dex thì giữ state cũ; loài trùng tính một lần; dừng ở MAX_SAFE_INTEGER', () => {
    const research = caught(1)
    expect(
      recordResearch(data, research, { speciesIds: ['weakling'], kind: 'caught', amount: 0 })
    ).toBe(research)
    expect(recordResearch(data, research, { speciesIds: ['megaWeakling'], kind: 'caught' })).toBe(
      research
    )
    const twice = recordResearch(data, research, {
      speciesIds: ['weakling', 'weakling'],
      kind: 'caught'
    })
    expect(twice.weakling.counters.caught).toBe(2)
    const capped = recordResearch(data, caught(Number.MAX_SAFE_INTEGER), {
      speciesIds: ['weakling'],
      kind: 'caught'
    })
    expect(capped.weakling.counters.caught).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('quái fuse tính cả loài gốc; quái shiny thêm bắt shiny', () => {
    const fused = makeMonster({
      speciesId: 'strongling',
      baseSpeciesId: 'weakling',
      shinyStacks: 1
    })
    const research = recordCaughtResearch(data, {}, [fused])
    expect(research.weakling.counters).toEqual({ caught: 1, caughtShiny: 1 })
    expect(research.strongling.counters).toEqual({ caught: 1, caughtShiny: 1 })
    expect(recordCaughtResearch(data, {}, [makeMonster()]).weakling.counters).toEqual({ caught: 1 })
  })

  it('tiến hóa (cả dị biến) đếm "tiến hóa ra" cho loài mới; log khác bỏ qua', () => {
    const research = recordEvolutionResearch(data, {}, [
      { type: 'evolve', monsterId: 'a', fromSpeciesId: 'weakling', toSpeciesId: 'strongling' },
      {
        type: 'mutatedEvolution',
        monsterId: 'b',
        fromSpeciesId: 'weakling',
        toSpeciesId: 'strongling'
      },
      { type: 'evolutionChoice', monsterId: 'c', options: ['strongling'] }
    ])
    expect(research).toEqual({ strongling: { counters: { evolvedInto: 2 }, claimedLevel: 0 } })
  })
})

describe('kiểm tra dữ liệu', () => {
  it('báo loại việc / phạm vi / lợi ích lạ, mốc không tăng, cấp vượt tối đa, loài ngoài Dex', () => {
    const issues = dataIssuesAfter((raw) => {
      const research = raw.config.research
      research.tasks = [
        // Ép kiểu: cố ý đưa giá trị sai để kiểm tra dữ liệu.
        { kind: 'flown' as 'caught', thresholds: [3, 3], points: 0, scope: 'odd' as 'all' }
      ]
      research.speciesTasks = { megaWeakling: [] }
      research.benefits = [
        { level: 11, type: 'expPercent', percent: 0 },
        { level: 1, type: 'odd' as 'revealProfile' }
      ]
      research.levelRewards = [{ level: 0, items: [{ itemId: 'nope', count: 1 }] }]
    })
    const expected = [
      'config.research.tasks[0].kind: loại việc không hợp lệ "flown"',
      'config.research.tasks[0].thresholds[1] phải lớn hơn mốc trước',
      'config.research.tasks[0].points phải là số nguyên ≥ 1, nhận 0',
      'config.research.tasks[0].scope: phạm vi không hợp lệ "odd"',
      'config.research.speciesTasks: "megaWeakling" không phải loài thuộc Dex',
      'config.research.benefits[0].level vượt cấp tối đa 10',
      'config.research.benefits[0].percent phải khác 0',
      'config.research.benefits[1].type: loại lợi ích không hợp lệ "odd"',
      'config.research.levelRewards[0].level phải là số nguyên ≥ 1, nhận 0'
    ]
    for (const issue of expected) expect(issues).toContain(issue)
    expect(issues.some((issue) => issue.includes('config.research.levelRewards[0].items'))).toBe(
      true
    )
  })

  it('dữ liệu fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })
})
