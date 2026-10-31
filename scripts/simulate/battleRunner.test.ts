import { describe, expect, it } from 'vitest'
import { createGameData, toBig, validateGameState, type GameState } from '@core'
import { makeData, makeMonster, makeGameState, makeRawData, withFixtureText } from '@core/testing'
import { addSkillUsage, backToFloor, emptySkillUsage, runBattle, skillGroup } from './battleRunner'

// Fixture: tầng 3 (biome "pairs") luôn gặp 2 quái hoang level 5 (quái level 1 cho 0 EXP).
const data = makeData()

const stateWith = (overrides: Parameters<typeof makeMonster>[0]): GameState =>
  makeGameState({
    seed: 5,
    party: [makeMonster({ id: 'm1', skillIds: ['strike', 'growl'], ...overrides })],
    location: { type: 'floor', floor: 3 }
  })

describe('skillGroup', () => {
  it('ghép loại sát thương / status với các loại hiệu ứng (không trùng, theo thứ tự chữ)', () => {
    expect(skillGroup(data.skills.strike)).toBe('damage')
    expect(skillGroup(data.skills.idle)).toBe('status')
    expect(skillGroup(data.skills.growl)).toBe('status+statStage')
    expect(skillGroup(data.skills.sap)).toBe('damage+drain')
    expect(skillGroup({ ...data.skills.strike, spell: { ignoreDefensePercent: 10 } })).toBe(
      'damage+spell'
    )
  })
})

describe('runBattle', () => {
  it('đánh tới khi kết thúc bằng action thật, rời trận, state hợp lệ; chạy lại ra cùng kết quả', () => {
    const strong = stateWith({ level: 30, exp: 27000 })
    const run = runBattle(data, strong, { kind: 'wild', maxTurns: 100 })
    expect(run.stats.outcome).toBe('won')
    expect(run.stats.turns).toBeGreaterThan(0)
    expect(run.stats.money.gt(0)).toBe(true)
    expect(run.stats.exp.gt(0)).toBe(true)
    expect(run.state.battle).toBeNull()
    expect(validateGameState(data, run.state)).toEqual([])
    expect(run.stats.skillUses.player.damage ?? 0).toBeGreaterThan(0)
    expect(runBattle(data, strong, { kind: 'wild', maxTurns: 100 })).toEqual(run)
  })

  it('lệnh có thế mạnh / thế nhanh đếm nhóm riêng (move-styles.md)', () => {
    const raw = makeRawData()
    raw.skills = raw.skills.map((s) => (s.id === 'strike' ? { ...s, styles: true as const } : s))
    const styled = createGameData(withFixtureText(raw))
    const state = stateWith({
      level: 30,
      exp: 27000,
      skillIds: ['strike'],
      skillMastery: { strike: { level: 10, exp: toBig(0) } }
    })
    const groups = new Set<string>()
    for (let seed = 1; seed <= 10; seed++) {
      const run = runBattle(styled, { ...state, rng: seed }, { kind: 'wild', maxTurns: 100 })
      for (const group of Object.keys(run.stats.skillUses.player)) groups.add(group)
    }
    expect([...groups].some((group) => /^damage@(strong|agile)$/.test(group))).toBe(true)
  })

  it('đếm quái cuồng bạo theo phe (docs/rules/frenzy.md)', () => {
    // Fixture không cuồng bạo (ngưỡng 0); bật ngưỡng 100% cho quái hoang: địch sắp thua thì cuồng bạo.
    const raw = makeRawData()
    raw.config.frenzy.roles.wild.hpThresholdPercent = 100
    const frenzyData = createGameData(withFixtureText(raw))
    const strong = stateWith({ level: 30, exp: 27000 })
    const run = runBattle(frenzyData, strong, { kind: 'wild', maxTurns: 100 })
    expect(run.stats.frenzies.player).toBe(0)
    expect(run.stats.frenzies.enemy).toBeGreaterThan(0)
    expect(runBattle(data, strong, { kind: 'wild', maxTurns: 100 }).stats.frenzies).toEqual({
      player: 0,
      enemy: 0
    })
  })

  it('thua: không tiền, không EXP; người chơi về thị trấn', () => {
    const weak = stateWith({ damageTaken: 49 })
    const run = runBattle(data, weak, { kind: 'boss', maxTurns: 100 })
    expect(run.stats.outcome).toBe('lost')
    expect(run.stats.money).toEqual(0)
    expect(run.stats.exp).toEqual(0)
    expect(run.state.location).toEqual({ type: 'town' })
  })

  it('chạm trần số lượt: "timeout", bỏ trận như chưa đánh nhưng giữ RNG đã dùng', () => {
    // Quái chỉ biết idle (không gây sát thương) gặp quái hoang: không ai hạ được ai bằng skill ta.
    const passive = stateWith({ skillIds: ['idle'], level: 30, exp: 27000 })
    const run = runBattle(data, passive, { kind: 'wild', maxTurns: 1 })
    expect(run.stats.outcome).toBe('timeout')
    expect(run.stats.turns).toBe(1)
    expect(run.stats.money).toEqual(0)
    expect(run.state).toEqual({ ...passive, rng: run.state.rng })
    expect(run.state.rng).not.toBe(passive.rng)
  })

  it('thay quái gục bằng quái dự bị rồi đánh tiếp', () => {
    // Hai quái đầu sắp gục và không gây sát thương: chỉ thắng được nếu m3 (dự bị) được đưa ra sân.
    const almostFainted = { skillIds: ['idle'], damageTaken: 49 }
    const state = makeGameState({
      seed: 3,
      party: [
        makeMonster({ id: 'm1', ...almostFainted }),
        makeMonster({ id: 'm2', ...almostFainted }),
        makeMonster({ id: 'm3', skillIds: ['strike'], level: 30, exp: 27000 })
      ],
      location: { type: 'floor', floor: 3 }
    })
    const run = runBattle(data, state, { kind: 'wild', maxTurns: 100 })
    expect(run.stats.outcome).toBe('won')
    expect(run.state.party[2].exp.gt(27000)).toBe(true)
  })
})

describe('addSkillUsage', () => {
  it('cộng dồn theo phe và nhóm', () => {
    const total = emptySkillUsage()
    addSkillUsage(total, { player: { damage: 2 }, enemy: { status: 1 } })
    addSkillUsage(total, { player: { damage: 3, status: 1 }, enemy: {} })
    expect(total).toEqual({ player: { damage: 5, status: 1 }, enemy: { status: 1 } })
  })
})

describe('backToFloor (sau trận event trước trận đo)', () => {
  const data = makeData()
  const onFloor = (damageTaken: number): GameState => ({
    ...makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a', damageTaken })],
      location: { type: 'floor', floor: 1 }
    }),
    money: toBig(1e6)
  })

  it('event thắng mà cả đội gục, vẫn ở tầng: về thị trấn hồi máu rồi quay lại tầng', () => {
    const before = onFloor(0)
    const after = backToFloor(data, onFloor(999), before)
    expect(after.location).toEqual({ type: 'floor', floor: 1 })
    expect(after.party[0].damageTaken.toNumber()).toBe(0)
  })

  it('còn ở tầng và không bị thương: giữ nguyên', () => {
    const state = onFloor(0)
    expect(backToFloor(data, state, state)).toBe(state)
  })
})
