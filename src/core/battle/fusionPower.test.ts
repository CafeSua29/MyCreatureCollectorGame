// Fusion Power (docs/rules/fusion-power.md): thực thể hợp thể có thêm Fusion Power, chiêu thật cố định
// theo cặp loài (thứ tự), power theo loại như gốc, buff lên mình / debuff lên địch, dùng trong trận tốn
// 100 thể lực, không có sách, Orb Fusion đầy máu ưu tiên dùng.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { isBookableSkill } from '../inventory'
import { defined, makeBattleState, makeMonster, makeRawData, withFixtureText } from '../testing'
import {
  battleSkillIds,
  FUSION_POWER_SKILL_ID,
  type GameData,
  type GameState,
  type Monster,
  type Skill
} from '../model'
import { cloneDraft, findMonster } from './draft'
import { fusionPowerSkill } from './fusionPower'
import { chooseAiCommands } from './ai'

const MERGE = 'twin'

function mergeData(): GameData {
  const raw = makeRawData()
  raw.tamerSkills.push({
    id: MERGE,
    unlockRealm: 0,
    manaCost: 30,
    cooldown: 0,
    usesPerBattle: 1,
    target: 'merge'
  })
  return createGameData(withFixtureText(raw))
}

const data = mergeData()

const pal = (id: string, overrides: Partial<Monster> = {}): Monster =>
  makeMonster({ id, affinity: 200, skillIds: ['idle', 'strike'], ...overrides })
const lead = (): Monster =>
  pal('a', { speciesId: 'strongling', baseSpeciesId: 'strongling', elementIds: ['fire'] })
const partner = (): Monster => pal('b')

/** Trận đã hợp thể a + b (lượt đầu chỉ hợp thể, hai quái đứng yên). */
function mergedState(): GameState {
  const state = makeBattleState([lead(), partner()], [makeMonster({ id: 'e', skillIds: ['idle'] })])
  return gameReducer(data, state, {
    type: 'submitTurn',
    commands: [
      { slot: 0, kind: 'skill', skillId: 'idle' },
      { slot: 1, kind: 'skill', skillId: 'idle' }
    ],
    tamer: { skillId: MERGE }
  })
}

const base = (): Skill => data.skills[FUSION_POWER_SKILL_ID]

describe('chiêu theo cặp', () => {
  it('thực thể hợp thể có Fusion Power; chiêu cố định theo cặp, power theo loại như gốc', () => {
    const d = cloneDraft(mergedState())
    const entity = findMonster(d, 'a')
    expect(battleSkillIds(entity)).toContain(FUSION_POWER_SKILL_ID)
    const skill = fusionPowerSkill(data, entity, base())
    expect(fusionPowerSkill(data, entity, base())).toEqual(skill)
    expect(['fire', 'grass']).toContain(skill.elementId)
    const team = skill.target === 'allEnemies'
    const status = skill.effects[0]
    const buff = asParams(status?.params).self === true
    const expected = team ? (buff ? 150 : 112) : 200
    expect(skill.power).toBe(expected)
    expect(status?.type).toBe('applyStatus')
    expect(skill.category).toBe(skill.reach === 'ranged' ? 'special' : 'physical')
  })

  it('không phải thực thể hợp thể: trả skill gốc; không có sách', () => {
    expect(fusionPowerSkill(data, lead(), base())).toBe(base())
    expect(isBookableSkill(data, base())).toBe(false)
  })

  it('đủ các tổ hợp hậu tố khi đổi cặp loài', () => {
    const d = cloneDraft(mergedState())
    const entity = findMonster(d, 'a')
    const snapshot = defined(entity.battleTransform?.mergePartner)
    const kinds = new Set<string>()
    for (const speciesId of Object.keys(data.species)) {
      const other = {
        ...entity,
        battleTransform: {
          ...defined(entity.battleTransform),
          mergePartner: { ...snapshot, monster: { ...snapshot.monster, speciesId } }
        }
      }
      const skill = fusionPowerSkill(data, other, base())
      kinds.add(
        `${skill.target}|${skill.reach}|${asParams(skill.effects[0]?.params).self === true}`
      )
    }
    expect(kinds.size).toBeGreaterThan(1)
  })
})

describe('trong trận', () => {
  it('dùng Fusion Power: đòn trúng địch, tốn 100 thể lực', () => {
    const state = mergedState()
    const after = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: FUSION_POWER_SKILL_ID, target: 0 },
        { slot: 1, kind: 'skill', skillId: 'idle' }
      ]
    })
    const log = defined(after.battle).log
    expect(log).toContainEqual({ type: 'useSkill', monsterId: 'a', skillId: FUSION_POWER_SKILL_ID })
    expect(log.some((event) => event.type === 'damage' && event.targetId === 'e')).toBe(true)
    expect(defined(after.battle).records.a?.staminaUsed).toBeGreaterThanOrEqual(100)
  })
})

describe('Orb Fusion', () => {
  it('đầy máu và có quả cầu: AI phe địch dùng Fusion Power', () => {
    const raw = makeRawData()
    raw.config.rogueFusion = {
      ...raw.config.rogueFusion,
      chance: 100,
      variantWeights: { standard: 0, flood: 0, swarm: 0, orb: 1 }
    }
    const orbData = createGameData(withFixtureText(raw))
    const hero = makeMonster({ id: 'h', level: 50, skillIds: ['strike'] })
    const opened = gameReducer(
      orbData,
      {
        ...makeBattleState([hero], []),
        battle: null,
        location: { type: 'floor', floor: 1 }
      },
      { type: 'startWildBattle' }
    )
    const commands = chooseAiCommands(orbData, cloneDraft(opened), 'enemy')
    expect(commands.some((c) => c.kind === 'skill' && c.skillId === FUSION_POWER_SKILL_ID)).toBe(
      true
    )
  })
})

/** Params của hiệu ứng dưới dạng object (đọc trường tùy chọn). */
function asParams(params: unknown): Record<string, unknown> {
  return typeof params === 'object' && params !== null ? { ...params } : {}
}
