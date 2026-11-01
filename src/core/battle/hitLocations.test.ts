// Tầm chiêu và vị trí ra đòn (docs/rules/hit-locations.md): cận chiến không với tới quái đang bay
// (quái lớn, quái bay sà xuống, bị hạ xuống đất, skill trúng trên không thì với tới), nhắm bộ phận
// (accuracy, sát thương, điểm yếu, hiệu ứng khi trúng, phá bộ phận, đòn hạ gục làm vỡ yêu đan), lệnh
// sai, AI, đồ rơi, kiểm tra dữ liệu, save.

import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, deserializeState, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { createGameData } from '../gameData'
import { getItemCount } from '../inventory'
import { getMaxHp } from '../monster'
import { monsterBodyPlan, revealedBodyParts } from '../registries'
import { dexEntry } from '../roster'
import { toBig } from '../shared'
import {
  FIXTURE_GYM_LEADER_ID,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster,
  NormalSpecies,
  RawGameData,
  Skill
} from '../model'
import { suggestBattleCommands } from './ai'
import { cloneDraft, recordOf } from './draft'
import { isSkillBlocked } from './executeSkill'
import {
  aimAccuracyFactor,
  aimDamageFactor,
  aimedPartOn,
  brokenPartDropMultiplier,
  chooseAim,
  afterAimedStrike,
  knockoutCoreMultiplier,
  offBalanceCritStage,
  recordPartHit,
  usesBrokenPart
} from './hitLocations'
import { canReach, skillReach } from './reach'

const base = { elementId: 'normal', priority: 0, accuracy: 100, target: 'enemy' as const }

/**
 * claw: cận chiến (tiếp xúc); arrow: tầm xa vật lý; uppercut: cận chiến trúng được trên không;
 * kick: ghi thẳng reach melee (không tiếp xúc); sureHit: cận chiến luôn trúng; wildSwing: gần như luôn
 * trượt (accuracy 1); stomp: ra chiêu bằng chân; idle: không làm gì.
 */
const TEST_SKILLS: Skill[] = [
  { ...base, id: 'claw', category: 'physical', power: 60, contact: true, effects: [] },
  { ...base, id: 'arrow', category: 'physical', power: 60, effects: [] },
  {
    ...base,
    id: 'uppercut',
    category: 'physical',
    power: 60,
    contact: true,
    hitsInvulnerable: [{ kind: 'air' }],
    effects: []
  },
  { ...base, id: 'kick', category: 'physical', power: 60, reach: 'melee', effects: [] },
  { ...base, id: 'sureHit', category: 'physical', power: 60, alwaysHits: true, effects: [] },
  { ...base, id: 'wildSwing', category: 'physical', power: 60, accuracy: 1, effects: [] },
  { ...base, id: 'stomp', category: 'physical', power: 60, bodyPart: 'legs', effects: [] }
]

const species = (raw: RawGameData, id: string): NormalSpecies =>
  raw.species.find((s): s is NormalSpecies => s.kind === 'normal' && s.id === id) as NormalSpecies

/**
 * Dữ liệu test: thêm skill; weakling có điểm yếu ở thân; brawler có cánh (điểm yếu cánh); oak nặng
 * 5000 kg (quái lớn); trạng thái knocked kiểu Smack Down; yêu đan của quái hệ cỏ (coreFire) rơi 100%.
 */
function testRawData(): RawGameData {
  const raw = makeRawData()
  raw.skills.push(...TEST_SKILLS)
  species(raw, 'weakling').weakPoints = ['torso']
  species(raw, 'brawler').bodyParts = ['head', 'torso', 'wings']
  species(raw, 'brawler').weakPoints = ['wings']
  species(raw, 'oak').weightKg = 5000
  raw.statuses.push({
    id: 'knocked',
    kind: 'debuff',
    battleOnly: true,
    hooks: [],
    traitHooks: [{ type: 'grounded', params: {} }]
  })
  const wings = defined(raw.bodyParts.find((part) => part.id === 'wings'))
  wings.hitEffects = [{ type: 'applyStatus', params: { statusId: 'knocked', chance: 30 } }]
  wings.breakEffects = [{ type: 'applyStatus', params: { statusId: 'knocked' } }]
  raw.config.ai.statusWeights = { ...raw.config.ai.statusWeights, knocked: 0.05 }
  raw.config.treasures.demonCoreItemIds = { grass: 'coreFire' }
  raw.config.treasures.demonCoreWildChance = 100
  return raw
}

const data = createGameData(withFixtureText(testRawData()))

const run = (state: GameState, commands: BattleCommand[], gameData: GameData = data): GameState =>
  gameReducer(gameData, state, { type: 'submitTurn', commands })

const skills = ['claw', 'arrow', 'sureHit', 'idle']
const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', skillIds: skills, level: 20, ...overrides })
/** Quái hoang chỉ biết idle (không làm lệch RNG / máu của test). */
const foe = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id: 'e',
    skillIds: ['idle'],
    level: 20,
    genes: { ...uniformStats(10), hp: 2000 },
    ...overrides
  })
/** Quái hoang chỉ còn 1 máu (đòn nào trúng cũng hạ gục). */
const nearlyDown = (): Monster => {
  const target = foe()
  return { ...target, damageTaken: getMaxHp(data, target).minus(1) }
}
const flyer = (overrides: MonsterOverrides = {}): Monster =>
  foe({ elementIds: ['flying'], ...overrides })

const order = (skillId: string, extra: Partial<BattleCommand> = {}): BattleCommand =>
  ({ slot: 0, kind: 'skill', skillId, target: 0, ...extra }) as BattleCommand

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)
const battleOf = (state: GameState): BattleState => defined(state.battle)
const damageTo = (state: GameState, id: string): number =>
  eventsOf(state, 'damage')
    .filter((event) => event.targetId === id)
    .reduce((sum, event) => sum + event.amount.toNumber(), 0)

describe('tầm chiêu', () => {
  it('reach mặc định: tiếp xúc là cận chiến, còn lại tầm xa; ghi reach thì theo đó', () => {
    expect(skillReach(data.skills.claw)).toBe('melee')
    expect(skillReach(data.skills.arrow)).toBe('ranged')
    expect(skillReach(data.skills.kick)).toBe('melee')
  })

  it('cận chiến của quái đứng trên đất không với tới quái đang bay: outOfReach, không sát thương', () => {
    for (const skillId of ['claw', 'kick']) {
      const after = run(makeBattleState([hero({ skillIds: [skillId] })], [flyer()]), [
        order(skillId)
      ])
      expect(eventsOf(after, 'outOfReach')).toEqual([
        { type: 'outOfReach', monsterId: 'a', targetId: 'e' }
      ])
      expect(damageTo(after, 'e')).toBe(0)
    }
  })

  it('tầm xa, skill trúng trên không (uppercut) với tới quái đang bay', () => {
    for (const skillId of ['arrow', 'uppercut']) {
      const after = run(makeBattleState([hero({ skillIds: [skillId] })], [flyer()]), [
        order(skillId)
      ])
      expect(eventsOf(after, 'outOfReach')).toEqual([])
      expect(damageTo(after, 'e')).toBeGreaterThan(0)
    }
  })

  it('quái dùng đang bay, hoặc quái lớn (dùng / mục tiêu) với tới; quái bị hạ xuống đất thì với tới', () => {
    const cases: [Monster, Monster][] = [
      [hero({ elementIds: ['flying'] }), flyer()],
      [hero({ speciesId: 'oak', baseSpeciesId: 'oak' }), flyer()],
      [hero(), flyer({ speciesId: 'oak', baseSpeciesId: 'oak' })],
      [hero(), flyer({ statuses: [{ statusId: 'knocked', turnsLeft: null }] })]
    ]
    for (const [user, target] of cases) {
      const d = cloneDraft(makeBattleState([user], [target]))
      expect(canReach(data, d, { user, skill: data.skills.claw, target })).toBe(true)
    }
  })

  it('quái bay đánh cận chiến xuống quái đứng trên đất thì sà xuống: quái đất với tới tới hết lượt sau', () => {
    // Quái bay của người chơi đánh xuống quái hoang đứng trên đất.
    const bird = hero({ elementIds: ['flying'] })
    const swooped = run(makeBattleState([bird], [foe()]), [order('claw')])
    expect(eventsOf(swooped, 'swooped')).toEqual([
      { type: 'swooped', monsterId: 'a', untilTurn: 2 }
    ])
    expect(battleOf(swooped).volatiles.a.swoopedUntilTurn).toBe(2)
    const d = cloneDraft(swooped)
    const ground = defined(battleOf(swooped).enemies[0])
    expect(battleOf(swooped).turn).toBe(2)
    expect(canReach(data, d, { user: ground, skill: data.skills.claw, target: bird })).toBe(true)
    d.battle.turn = 3
    expect(canReach(data, d, { user: ground, skill: data.skills.claw, target: bird })).toBe(false)
    // Tầm xa không sà xuống; đánh quái cũng đang bay không sà xuống.
    expect(eventsOf(run(makeBattleState([bird], [foe()]), [order('arrow')]), 'swooped')).toEqual([])
    expect(eventsOf(run(makeBattleState([bird], [flyer()]), [order('claw')]), 'swooped')).toEqual(
      []
    )
  })

  it('AI không chọn đòn cận chiến không với tới', () => {
    const state = makeBattleState([hero({ skillIds: ['claw', 'arrow'] })], [flyer()])
    for (let seed = 1; seed <= 20; seed++) {
      const [command] = suggestBattleCommands(data, { ...state, rng: seed })
      expect(command).toMatchObject({ kind: 'skill', skillId: 'arrow' })
    }
  })
})

describe('nhắm bộ phận: lệnh', () => {
  const state = makeBattleState([hero()], [foe()])

  it('bộ phận không tồn tại, skill không nhắm được: malformedAction; state giữ nguyên', () => {
    expectActionError(() => run(state, [order('claw', { aim: 'antenna' })]), 'malformedAction')
    expectActionError(() => run(state, [order('idle', { aim: 'head' })]), 'malformedAction')
    expect(state.battle?.log).toEqual([])
  })

  it('quái ở ô mục tiêu không có bộ phận đó: bodyPartMissing', () => {
    expectActionError(() => run(state, [order('claw', { aim: 'wings' })]), 'bodyPartMissing', {
      monsterId: 'e',
      partId: 'wings'
    })
  })

  it('nhắm hợp lệ: log aimedHit kèm điểm yếu', () => {
    const after = run(state, [order('sureHit', { aim: 'torso' })])
    expect(eventsOf(after, 'aimedHit')).toEqual([
      { type: 'aimedHit', monsterId: 'a', targetId: 'e', partId: 'torso', weakPoint: true }
    ])
  })
})

describe('nhắm bộ phận: hệ số', () => {
  it('bộ phận / điểm yếu theo loài, race, config (fixture race không ghi: mặc định)', () => {
    expect(monsterBodyPlan(data, foe())).toEqual({
      parts: ['head', 'torso', 'legs'],
      weakPoints: ['torso']
    })
    expect(monsterBodyPlan(data, foe({ speciesId: 'brawler', baseSpeciesId: 'brawler' }))).toEqual({
      parts: ['head', 'torso', 'wings'],
      weakPoints: ['wings']
    })
  })

  it('accuracy theo bộ phận; skill luôn trúng không bị trừ', () => {
    const head = aimedPartOn(data, { skill: data.skills.claw, target: foe(), aim: 'head' })
    expect(aimAccuracyFactor(data.skills.claw, head)).toBe(0.75)
    expect(aimAccuracyFactor(data.skills.sureHit, head)).toBe(1)
    expect(aimAccuracyFactor(data.skills.claw, null)).toBe(1)
  })

  it('sát thương: bộ phận × điểm yếu (+50%)', () => {
    const legs = aimedPartOn(data, { skill: data.skills.claw, target: foe(), aim: 'legs' })
    const torso = aimedPartOn(data, { skill: data.skills.claw, target: foe(), aim: 'torso' })
    expect(aimDamageFactor(data, legs)).toBeCloseTo(0.9)
    expect(aimDamageFactor(data, torso)).toBeCloseTo(1.5)
  })

  it('đòn thật: trúng điểm yếu gây ×1,5 sát thương so với không nhắm (cùng seed)', () => {
    const state = makeBattleState([hero()], [foe()])
    const plain = damageTo(run(state, [order('sureHit')]), 'e')
    const weak = damageTo(run(state, [order('sureHit', { aim: 'torso' })]), 'e')
    expect(weak / plain).toBeCloseTo(1.5, 1)
  })

  it('AI phe người chơi: nhắm điểm yếu đã biết; biết hết mà không có điểm yếu thì không nhắm', () => {
    const knowing = (state: GameState, hitParts: Record<string, string[]>): GameState => ({
      ...state,
      dex: { ...state.dex, hitParts }
    })
    const weakFoe = makeBattleState([hero({ skillIds: ['claw'] })], [foe()])
    expect(
      suggestBattleCommands(data, knowing(weakFoe, { weakling: ['head', 'torso', 'legs'] }))[0]
    ).toMatchObject({ aim: 'torso' })
    const plain = makeBattleState(
      [hero({ skillIds: ['claw'] })],
      [foe({ speciesId: 'strongling', baseSpeciesId: 'strongling' })]
    )
    expect(
      suggestBattleCommands(data, knowing(plain, { strongling: ['head', 'torso', 'legs'] }))[0]
    ).not.toHaveProperty('aim')
    // Chưa biết gì: thử bộ phận chưa biết (lạc quan, aiUnknownWeakPercent 100) để khám phá.
    expect(suggestBattleCommands(data, plain)[0]).toMatchObject({ aim: 'torso' })
  })

  it('quái hoang đánh theo bản năng không nhắm; ngự thú sư NPC nhắm điểm yếu của quái người chơi', () => {
    // Quái người chơi weakling (điểm yếu thân) chỉ đứng yên; quái địch chỉ biết claw.
    // Quái người chơi nhiều máu: không gục (thua trận đạo quán cần đạo quán thật).
    const state = makeBattleState(
      [hero({ skillIds: ['idle'], genes: { ...uniformStats(10), hp: 2000 } })],
      [foe({ skillIds: ['claw'], speciesId: 'strongling', baseSpeciesId: 'strongling' })]
    )
    const aimsOf = (game: GameState): number => {
      let aims = 0
      for (let seed = 1; seed <= 10; seed++) {
        const after = run({ ...game, rng: seed }, [order('idle')])
        aims += eventsOf(after, 'aimedHit').length + eventsOf(after, 'miss').length
      }
      return aims
    }
    expect(aimsOf(state)).toBe(0)
    const battle = battleOf(state)
    const trainer = { classId: FIXTURE_GYM_LEADER_ID, mode: 'gymLeader', elementId: null }
    const npc = {
      ...state,
      battle: { ...battle, trainer: { ...trainer, rewardMultiplier: 1 } }
    } as GameState
    expect(aimsOf(npc)).toBeGreaterThan(0)
  })

  it('chooseAim: bộ phận chưa biết chấm theo kỳ vọng aiUnknownWeakPercent', () => {
    const target = foe({ speciesId: 'strongling', baseSpeciesId: 'strongling' })
    const pick = (gameData: GameData, revealed: readonly string[] | null): string | undefined =>
      chooseAim(gameData, {
        skill: gameData.skills.claw,
        target,
        damage: toBig(10),
        remaining: toBig(100),
        keepCore: false,
        revealed
      }).aim
    // Biết hết (phe địch / đã khám phá): strongling không có điểm yếu → không nhắm.
    expect(pick(data, null)).toBeUndefined()
    expect(pick(data, ['head', 'torso', 'legs'])).toBeUndefined()
    // Chưa biết: lạc quan → thử thân (không mất accuracy, hơn đầu / chân); tỉ lệ 0 → coi như bộ phận thường.
    expect(pick(data, [])).toBe('torso')
    const raw = testRawData()
    raw.config.hitLocations.aiUnknownWeakPercent = 0
    expect(pick(createGameData(withFixtureText(raw)), [])).toBeUndefined()
  })

  it('AI phe người chơi không nhắm đầu khi đòn dự kiến hạ gục (giữ yêu đan)', () => {
    const raw = testRawData()
    species(raw, 'weakling').weakPoints = ['head']
    const headData = createGameData(withFixtureText(raw))
    const target = foe()
    const pick = (damage: number, keepCore: boolean): string | undefined =>
      chooseAim(headData, {
        skill: headData.skills.sureHit,
        target,
        damage: toBig(damage),
        remaining: toBig(100),
        keepCore,
        revealed: null
      }).aim
    // Đòn thường chưa hạ được: nhắm đầu (điểm yếu); sắp hạ gục thì người chơi giữ yêu đan.
    expect(pick(40, true)).toBe('head')
    expect(pick(80, false)).toBe('head')
    expect(pick(80, true)).toBeUndefined()
  })

  it('AI không nhắm khi đòn thường đã đủ hạ gục (sát thương thừa không có giá trị)', () => {
    const target = foe()
    const pick = (damage: number): string | undefined =>
      chooseAim(data, {
        skill: data.skills.claw,
        target,
        damage: toBig(damage),
        remaining: toBig(100),
        keepCore: false,
        revealed: null
      }).aim
    expect(pick(40)).toBe('torso')
    expect(pick(150)).toBeUndefined()
    // Máu còn lại 0 (đã dự kiến gục): không nhắm; số cực lớn không ra NaN.
    expect(
      chooseAim(data, {
        skill: data.skills.claw,
        target,
        damage: toBig('1e500'),
        remaining: toBig(0),
        keepCore: false,
        revealed: null
      }).aim
    ).toBeUndefined()
    expect(
      chooseAim(data, {
        skill: data.skills.claw,
        target,
        damage: toBig('1e500'),
        remaining: toBig('1e600'),
        keepCore: false,
        revealed: null
      }).aim
    ).toBe('torso')
  })
})

describe('trúng bộ phận, phá bộ phận, đòn hạ gục', () => {
  it('trúng cánh (điểm yếu: tỉ lệ ×2) có thể hạ quái bay xuống đất', () => {
    const bird = flyer({ speciesId: 'brawler', baseSpeciesId: 'brawler' })
    let knocked = 0
    for (let seed = 1; seed <= 40; seed++) {
      const after = run({ ...makeBattleState([hero()], [bird]), rng: seed }, [
        order('sureHit', { aim: 'wings' })
      ])
      const target = defined(battleOf(after).enemies[0])
      if (target.statuses.some((status) => status.statusId === 'knocked')) knocked++
    }
    // 30% × 2 = 60%: trong 40 lần phải có cả trúng lẫn không.
    expect(knocked).toBeGreaterThan(10)
    expect(knocked).toBeLessThan(40)
  })

  it('sát thương dồn đủ ngưỡng thì phá bộ phận một lần, chạy hiệu ứng phá (chân: −2 tốc độ)', () => {
    const state = makeBattleState([hero()], [foe({ genes: uniformStats(10) })])
    const d = cloneDraft(state)
    const target = d.battle.enemies[0]
    const user = d.party[0]
    const legs = aimedPartOn(data, { skill: data.skills.claw, target, aim: 'legs' })
    const maxHp = 100
    const hit = (amount: number): void =>
      recordPartHit(data, d, {
        user,
        target,
        skill: data.skills.claw,
        aimed: legs,
        dealt: toBig(amount).times(maxHp).div(100)
      })
    const percentOf = (): number => defined(d.battle.records.e.partDamagePercent).legs
    // Ngưỡng tính theo max HP thật của quái: dùng tỉ lệ nhỏ để chưa phá.
    hit(0)
    expect(d.battle.records.e.brokenParts).toBeUndefined()
    recordPartHit(data, d, {
      user,
      target,
      skill: data.skills.claw,
      aimed: legs,
      dealt: toBig(1e300)
    })
    expect(percentOf()).toBeGreaterThan(30)
    expect(Number.isFinite(percentOf())).toBe(true)
    expect(d.battle.records.e.brokenParts).toEqual(['legs'])
    expect(d.battle.stages.e?.speed).toBe(-2)
    expect(d.battle.log.filter((e) => e.type === 'partBroken')).toHaveLength(1)
    // Phá rồi thì không phá lại.
    recordPartHit(data, d, {
      user,
      target,
      skill: data.skills.claw,
      aimed: legs,
      dealt: toBig(1e300)
    })
    expect(d.battle.log.filter((e) => e.type === 'partBroken')).toHaveLength(1)
    expect(d.battle.stages.e?.speed).toBe(-2)
  })

  it('đòn hạ gục nhắm đầu: nhớ bộ phận; tỉ lệ yêu đan × 0,5; bộ phận bị phá tăng đồ rơi', () => {
    const state = makeBattleState([hero()], [nearlyDown()])
    const after = run(state, [order('sureHit', { aim: 'head' })])
    expect(eventsOf(after, 'won')).toHaveLength(1)
    expect(after.battle?.records.e?.knockoutPart).toBe('head')
    expect(knockoutCoreMultiplier(data, { knockoutPart: 'head' } as never)).toBe(0.5)
    expect(knockoutCoreMultiplier(data, { knockoutPart: 'torso' } as never)).toBe(1)
    expect(knockoutCoreMultiplier(data, undefined)).toBe(1)
    expect(brokenPartDropMultiplier(data, { brokenParts: ['head', 'tail'] } as never)).toBe(1.75)
    expect(brokenPartDropMultiplier(data, undefined)).toBe(1)
  })

  it('đầu làm vỡ hẳn yêu đan (−100%): hạ gục bằng đòn vào đầu không rơi, vào thân thì rơi', () => {
    const raw = testRawData()
    defined(raw.bodyParts.find((part) => part.id === 'head')).knockoutCorePercent = -100
    const coreData = createGameData(withFixtureText(raw))
    const state = makeBattleState([hero()], [nearlyDown()])
    const cores = (aim: string): number => {
      const after = run(state, [order('sureHit', { aim })], coreData)
      return getItemCount(after.inventory, 'coreFire')
    }
    expect(cores('head')).toBe(0)
    expect(cores('torso')).toBe(1)
  })
})

describe('phá bộ phận: chặn skill', () => {
  it('chân bị phá: skill ra chiêu bằng chân bị chặn (cả AI lẫn lúc đánh), skill khác vẫn dùng', () => {
    const d = cloneDraft(makeBattleState([hero({ skillIds: ['stomp', 'claw'] })], [foe()]))
    const user = d.party[0]
    expect(isSkillBlocked(data, d, { user, skill: data.skills.stomp })).toBe(false)
    recordOf(d, 'a').brokenParts = ['legs']
    expect(isSkillBlocked(data, d, { user, skill: data.skills.stomp })).toBe(true)
    expect(isSkillBlocked(data, d, { user, skill: data.skills.claw })).toBe(false)
    expect(usesBrokenPart(d, user, data.skills.claw)).toBe(false)
    const broken = { ...d } as GameState
    for (let seed = 1; seed <= 10; seed++) {
      const [command] = suggestBattleCommands(data, { ...broken, rng: seed })
      expect(command).toMatchObject({ skillId: 'claw' })
    }
    const after = run(broken, [order('stomp')])
    expect(eventsOf(after, 'skillBlocked')).toEqual([
      { type: 'skillBlocked', monsterId: 'a', skillId: 'stomp' }
    ])
  })
})

describe('khám phá điểm yếu (Dex)', () => {
  it('đòn nhắm trúng ghi bộ phận vào Dex một lần; mục Dex chỉ hiện điểm yếu đã biết', () => {
    const state = makeBattleState([hero()], [foe()])
    expect(dexEntry(data, state, 'weakling', 'vi')).toMatchObject({
      bodyParts: ['head', 'torso', 'legs'],
      revealedParts: [],
      knownWeakPoints: []
    })
    const torso = run(state, [order('sureHit', { aim: 'torso' })])
    expect(torso.dex.hitParts).toEqual({ weakling: ['torso'] })
    expect(eventsOf(torso, 'partRevealed')).toEqual([
      { type: 'partRevealed', speciesId: 'weakling', partId: 'torso', weakPoint: true }
    ])
    // Trúng lại bộ phận đã biết: không log thêm; trúng đầu (không phải điểm yếu) thì biết là thường.
    const again = run(torso, [order('sureHit', { aim: 'torso' })])
    expect(eventsOf(again, 'partRevealed')).toHaveLength(1)
    const head = run(again, [order('sureHit', { aim: 'head' })])
    expect(head.dex.hitParts).toEqual({ weakling: ['torso', 'head'] })
    expect(dexEntry(data, head, 'weakling', 'vi')).toMatchObject({
      revealedParts: ['head', 'torso'],
      knownWeakPoints: ['torso']
    })
    expect(revealedBodyParts(data, head, foe())).toEqual(['head', 'torso'])
  })

  it('trượt hoặc không nhắm thì không khám phá', () => {
    const state = makeBattleState([hero({ skillIds: ['wildSwing', 'sureHit'] })], [foe()])
    expect(run(state, [order('wildSwing', { aim: 'torso' })]).dex.hitParts).toEqual({})
    expect(run(state, [order('sureHit')]).dex.hitParts).toEqual({})
  })
})

describe('mất thế', () => {
  it('trúng điểm yếu: mục tiêu mất thế tới hết lượt sau; trúng bộ phận thường thì không', () => {
    const state = makeBattleState([hero()], [foe()])
    const weak = run(state, [order('sureHit', { aim: 'torso' })])
    expect(eventsOf(weak, 'offBalance')).toEqual([
      { type: 'offBalance', monsterId: 'e', untilTurn: 2, cause: 'weakPoint' }
    ])
    expect(battleOf(weak).volatiles.e.offBalanceUntilTurn).toBe(2)
    expect(eventsOf(run(state, [order('sureHit', { aim: 'head' })]), 'offBalance')).toEqual([])
    expect(eventsOf(run(state, [order('sureHit')]), 'offBalance')).toEqual([])
  })

  it('nhắm mà trượt: quái dùng mất thế; không nhắm mà trượt thì không', () => {
    const state = makeBattleState([hero({ skillIds: ['wildSwing'] })], [foe()])
    const missed = run(state, [order('wildSwing', { aim: 'head' })])
    expect(eventsOf(missed, 'miss')).toHaveLength(1)
    expect(eventsOf(missed, 'offBalance')).toEqual([
      { type: 'offBalance', monsterId: 'a', untilTurn: 2, cause: 'missed' }
    ])
    expect(eventsOf(run(state, [order('wildSwing')]), 'offBalance')).toEqual([])
  })

  it('bị kháng hệ: quái dùng mất thế; chí mạng +1 bậc tới hết hạn; đánh quái cùng phe không tính', () => {
    const d = cloneDraft(makeBattleState([hero()], [foe()]))
    const user = d.party[0]
    const target = d.battle.enemies[0]
    const torso = defined(aimedPartOn(data, { skill: data.skills.claw, target, aim: 'torso' }))
    afterAimedStrike(data, d, { user, target, aimed: torso, dealt: toBig(5), resisted: true })
    expect(d.battle.volatiles.a.offBalanceUntilTurn).toBe(2)
    expect(d.battle.volatiles.e.offBalanceUntilTurn).toBe(2)
    expect(offBalanceCritStage(data, d, user)).toBe(1)
    d.battle.turn = 3
    expect(offBalanceCritStage(data, d, user)).toBe(0)
    // Sát thương 0 (thế thân nhận thay) không làm mục tiêu mất thế; đánh quái cùng phe không tính.
    const fresh = cloneDraft(makeBattleState([hero()], [foe()]))
    const [ally, enemy] = [fresh.party[0], fresh.battle.enemies[0]]
    const zero = { aimed: torso, dealt: toBig(0), resisted: false }
    afterAimedStrike(data, fresh, { user: ally, target: enemy, ...zero })
    const own = { aimed: torso, dealt: toBig(5), resisted: true }
    afterAimedStrike(data, fresh, { user: ally, target: ally, ...own })
    expect(fresh.battle.log.filter((e) => e.type === 'offBalance')).toEqual([])
  })

  it('đòn vào quái đang mất thế dễ chí mạng hơn (cùng seed, nhiều lần)', () => {
    let plainCrits = 0
    let offCrits = 0
    const crits = (state: GameState): number =>
      eventsOf(run(state, [order('sureHit')]), 'damage').filter((e) => e.critical).length
    for (let seed = 1; seed <= 200; seed++) {
      const state = { ...makeBattleState([hero()], [foe()]), rng: seed }
      const battle = battleOf(state)
      const volatiles = {
        ...battle.volatiles,
        e: { ...battle.volatiles.e, offBalanceUntilTurn: 1 }
      }
      plainCrits += crits(state)
      offCrits += crits({ ...state, battle: { ...battle, volatiles } })
    }
    expect(offCrits).toBeGreaterThan(plainCrits)
  })
})

describe('kiểm tra dữ liệu', () => {
  it('dữ liệu fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })

  it('bộ phận lạ, quá nhiều điểm yếu, điểm yếu ngoài bộ phận, hiệu ứng cả chiêu, reach sai', () => {
    const issues = dataIssuesAfter((raw) => {
      const race = raw.races[0]
      race.bodyParts = ['head', 'antenna']
      species(raw, 'weakling').weakPoints = ['head', 'torso', 'legs']
      species(raw, 'brawler').bodyParts = ['head']
      species(raw, 'brawler').weakPoints = ['torso']
      raw.bodyParts[0].hitEffects = [{ type: 'setField', params: { fieldId: 'rain' } }]
      raw.bodyParts[1].critStage = -1
      raw.skills[0].reach = 'far' as never
      raw.skills[1].bodyPart = 'antenna'
      raw.config.hitLocations.defaultBodyParts = []
    }).join('\n')
    expect(issues).toMatch(/bộ phận không tồn tại "antenna"/)
    expect(issues).toMatch(/weakPoints tối đa 2/)
    expect(issues).toMatch(/"torso" không phải bộ phận của nó/)
    expect(issues).toMatch(/hook "setField"/)
    expect(issues).toMatch(/critStage/)
    expect(issues).toMatch(/reach phải là melee \/ ranged/)
    expect(issues).toMatch(/defaultBodyParts/)
    expect(issues).toMatch(/bodyPart không tồn tại "antenna"/)
  })
})

describe('save', () => {
  const withRecord = (record: Record<string, unknown>): GameState => {
    const state = makeBattleState([hero()], [foe()])
    const battle = battleOf(state)
    return {
      ...state,
      battle: {
        ...battle,
        volatiles: { ...battle.volatiles, a: { firstTurn: 1, swoopedUntilTurn: 2 } },
        records: {
          e: {
            turnsTaken: 0,
            attacks: 0,
            casts: 0,
            timesDamaged: 0,
            defends: 0,
            provokes: 0,
            deaths: 0,
            revivals: 0,
            damageTaken: toBig(0),
            damageDealt: toBig(0),
            healingReceived: toBig(0),
            lastAction: null,
            traitsGained: 0,
            usedTriggers: [],
            catchMisses: 0,
            ...record
          }
        }
      }
    } as GameState
  }
  const valid = { partDamagePercent: { head: 12.5 }, brokenParts: ['legs'], knockoutPart: 'head' }

  it('trường vị trí ra đòn hợp lệ / sai', () => {
    expect(validateGameState(data, withRecord(valid))).toEqual([])
    const errorsOf = (record: Record<string, unknown>): string =>
      validateGameState(data, withRecord({ ...valid, ...record })).join('\n')
    expect(errorsOf({ partDamagePercent: { antenna: 1 } })).toMatch(/không tồn tại "antenna"/)
    expect(errorsOf({ partDamagePercent: { head: -1 } })).toMatch(/partDamagePercent\.head/)
    expect(errorsOf({ brokenParts: ['legs', 'legs'] })).toMatch(/brokenParts/)
    expect(errorsOf({ knockoutPart: 'antenna' })).toMatch(/knockoutPart/)
  })

  it('dex.hitParts, offBalanceUntilTurn hợp lệ / sai', () => {
    const state = withRecord(valid)
    const battle = battleOf(state)
    const withExtras = (hitParts: unknown, offBalanceUntilTurn: unknown): GameState =>
      ({
        ...state,
        dex: { ...state.dex, hitParts },
        battle: {
          ...battle,
          volatiles: { ...battle.volatiles, e: { firstTurn: 1, offBalanceUntilTurn } }
        }
      }) as GameState
    expect(validateGameState(data, withExtras({ weakling: ['torso', 'head'] }, 2))).toEqual([])
    const errorsOf = (hitParts: unknown, turn: unknown = 2): string =>
      validateGameState(data, withExtras(hitParts, turn)).join('\n')
    expect(errorsOf({ nope: ['head'] })).toMatch(/dex\.hitParts\.nope/)
    expect(errorsOf({ weakling: ['antenna'] })).toMatch(/không tồn tại "antenna"/)
    expect(errorsOf({ weakling: ['head', 'head'] })).toMatch(/bị trùng "head"/)
    expect(errorsOf([])).toMatch(/dex\.hitParts phải là object/)
    expect(errorsOf({}, 0)).toMatch(/offBalanceUntilTurn/)
  })

  it('migrate v70 → hiện tại: Dex thêm hitParts rỗng', () => {
    const state = makeBattleState([hero()], [foe()])
    const { hitParts: _hitParts, ...oldDex } = state.dex
    const raw = JSON.parse(JSON.stringify(serializeState({ ...state, dex: oldDex } as GameState)))
    raw.version = 70
    const migrated = migrateState(deserializeState(raw), data)
    expect(migrated.dex.hitParts).toEqual({})
    expect(validateGameState(data, migrated)).toEqual([])
  })

  it('migrate v68 → hiện tại giữ nguyên bản ghi và trạng thái tạm', () => {
    const state = withRecord(valid)
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    raw.version = 68
    const migrated = migrateState(deserializeState(raw), data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(battleOf(migrated).records).toEqual(battleOf(state).records)
    expect(battleOf(migrated).volatiles).toEqual(battleOf(state).volatiles)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
