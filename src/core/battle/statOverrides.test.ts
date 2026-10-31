// Cơ chế chiêu cụm 3 (docs/rules/pokemon-moves.md): chỉ số công thay thế (Foul Play, Body Press), thủ
// thay thế (Psyshock), loại đòn lúc đánh (Photon Geyser, Shell Side Arm), bỏ qua bậc của mục tiêu
// (Sacred Sword), bỏ qua ability (Moongeist Beam, Gastro Acid), khắc hệ đặc biệt (Freeze-Dry, Flying
// Press, Thousand Arrows), bị hạ xuống đất (Smack Down), kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { computeStats, isGrounded } from '../monster'
import type { Decimal } from '../shared'
import {
  dataIssuesAfter,
  makeArena,
  makeBattleContext,
  makeMonster,
  makeRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type { BattleStages, Monster, NormalSpecies, Skill } from '../model'
import { expectedDamage } from './damage'

const base = (id: string, fields: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'physical',
  power: 50,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...fields
})

const raw = makeRawData()
raw.statuses.push({
  id: 'smackedDown',
  kind: 'debuff',
  battleOnly: true,
  hooks: [],
  traitHooks: [{ type: 'grounded', params: { removesImmunityFromElementIds: ['water'] } }]
})
raw.config.ai.statusWeights = { ...raw.config.ai.statusWeights, smackedDown: 0.05 }
// weakling có ability fast (+50% tốc độ).
const weaklingIndex = raw.species.findIndex((s) => s.id === 'weakling')
raw.species[weaklingIndex] = {
  ...(raw.species[weaklingIndex] as NormalSpecies),
  abilities: ['fast']
}
const data = createGameData(withFixtureText(raw))

const monster = (id: string, stats: Partial<Record<string, number>>, fields = {}): Monster =>
  makeMonster({
    id,
    genes: toBigStats({ ...uniformStats(100), hp: '1e12', ...stats }),
    ...fields
  })

const damage = (
  skill: Skill,
  attacker: Monster,
  defender: Monster,
  defenderStages?: BattleStages
): Decimal =>
  expectedDamage({
    data,
    attacker,
    defender,
    skill,
    spread: false,
    arena: makeArena(),
    defenderStages
  })

describe('chỉ số thay thế', () => {
  it('attackFrom: công của mục tiêu (Foul Play) / thủ của quái dùng (Body Press)', () => {
    const weak = monster('a', { attack: 10, defense: 1000 })
    const strongFoe = monster('d', { attack: 1000 })
    const plain = damage(base('plain'), weak, strongFoe)
    const foul = damage(
      base('foul', { attackFrom: { who: 'target', stat: 'attack' } }),
      weak,
      strongFoe
    )
    const press = damage(
      base('press', { attackFrom: { who: 'self', stat: 'defense' } }),
      weak,
      strongFoe
    )
    expect(foul.gt(plain.times(50))).toBe(true)
    expect(press.toNumber()).toBeCloseTo(foul.toNumber(), -1)
  })

  it('defenseStat: đòn đặc biệt đánh vào thủ vật lý (Psyshock)', () => {
    const attacker = monster('a', {})
    const wall = monster('d', { defense: 10, spDefense: 1000 })
    const special = base('special', { category: 'special' })
    const psyshock = base('psyshock', { category: 'special', defenseStat: 'defense' })
    expect(damage(psyshock, attacker, wall).gt(damage(special, attacker, wall).times(3))).toBe(true)
  })

  it('categoryRule: higherAttack theo công / đặc công; betterRatio theo tỉ lệ công / thủ', () => {
    const physicalUser = monster('a', { attack: 1000, spAttack: 10 })
    const target = monster('d', {})
    const geyser = base('geyser', { category: 'special', categoryRule: 'higherAttack' })
    expect(damage(geyser, physicalUser, target).toNumber()).toBeCloseTo(
      damage(base('phys'), physicalUser, target).toNumber(),
      -1
    )
    const sideArm = base('sideArm', { category: 'special', categoryRule: 'betterRatio' })
    const softDefense = monster('d', { defense: 1, spDefense: 1000 })
    const balanced = monster('a', {})
    expect(damage(sideArm, balanced, softDefense).toNumber()).toBeCloseTo(
      damage(base('phys'), balanced, softDefense).toNumber(),
      -1
    )
  })

  it('ignoresTargetStages: bậc thủ +6 của mục tiêu không có tác dụng', () => {
    const attacker = monster('a', {})
    const target = monster('d', {})
    const stages = { defense: 6 }
    const sword = base('sword', { ignoresTargetStages: true })
    expect(damage(sword, attacker, target, stages).toNumber()).toBeCloseTo(
      damage(sword, attacker, target).toNumber()
    )
    expect(
      damage(base('plain'), attacker, target, stages).lt(damage(sword, attacker, target, stages))
    ).toBe(true)
  })
})

describe('ability bị vô hiệu', () => {
  it('abilitySuppressed trong bối cảnh trận bỏ hook ability (Gastro Acid)', () => {
    const withAbility = makeMonster({ id: 'w', speciesId: 'weakling', baseSpeciesId: 'weakling' })
    const speed = (suppressed: boolean): number =>
      computeStats(data, withAbility, {
        battle: makeBattleContext({ abilitySuppressed: suppressed })
      }).final.speed.toNumber()
    expect(speed(false)).toBeGreaterThan(speed(true))
  })
})

describe('khắc hệ đặc biệt và hạ xuống đất', () => {
  const attacker = monster('a', {})
  it('against ghi đè (Freeze-Dry), extraElementIds nhân thêm (Flying Press)', () => {
    // Fixture: nước khắc lửa ×2; cỏ bị lửa ... dùng hệ nước đánh hệ cỏ (bảng nước không ghi cỏ = 1).
    const target = monster('d', {}, { elementIds: ['grass'] })
    const water = base('water', { elementId: 'water' })
    const dry = base('dry', { elementId: 'water', effectiveness: { against: { grass: 2 } } })
    expect(damage(dry, attacker, target).toNumber()).toBeCloseTo(
      damage(water, attacker, target).times(2).toNumber(),
      -1
    )
    const fireTarget = monster('d', {}, { elementIds: ['fire'] })
    const press = base('press', { effectiveness: { extraElementIds: ['water'] } })
    expect(damage(press, attacker, fireTarget).toNumber()).toBeCloseTo(
      damage(base('plain'), attacker, fireTarget).times(2).toNumber(),
      -1
    )
  })

  it('grounded (Smack Down): đứng trên mặt đất, mất miễn nhiễm hệ trong danh sách', () => {
    const flyer = monster('d', {}, { elementIds: ['flying'] })
    expect(isGrounded(data, flyer)).toBe(false)
    const downed: Monster = { ...flyer, statuses: [{ statusId: 'smackedDown', turnsLeft: null }] }
    expect(isGrounded(data, downed)).toBe(true)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesFor = (fields: Partial<Skill>): string =>
    dataIssuesAfter((r) => r.skills.push(base('bad', fields)), { regenerateText: true }).join('\n')

  it('trường sai', () => {
    expect(issuesFor({ attackFrom: { who: 'ally' as 'self', stat: 'attack' } })).toMatch(
      /attackFrom/
    )
    expect(issuesFor({ defenseStat: 'hp' as 'defense' })).toMatch(/defenseStat/)
    expect(issuesFor({ categoryRule: 'coin' as 'higherAttack' })).toMatch(/categoryRule/)
    expect(issuesFor({ ignoresAbility: false as unknown as true })).toMatch(/ignoresAbility/)
    expect(issuesFor({ effectiveness: { against: { lava: 2 } } })).toMatch(/lava/)
    expect(issuesFor({ effectiveness: { extraElementIds: [] } })).toMatch(/extraElementIds/)
    expect(issuesFor({ effectiveness: { against: { fire: -1 } } })).toMatch(/against\.fire/)
  })
})
