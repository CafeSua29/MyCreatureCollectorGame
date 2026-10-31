// Hóa hình (docs/rules/human-form.md): điều kiện hóa hình, đổi dạng, % chỉ số nhân hình, thọ nguyên,
// ô skill thứ 5, Hiện nguyên hình (trận thường / độ kiếp), Mega / Dynamax về bản thể, Tera giữ nhân
// hình, breed / fuse, kiểm tra dữ liệu / quái, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import {
  computeStats,
  lockedSkillIds,
  offerSkills,
  skillCapacity,
  validateMonster
} from '../monster'
import { getItemCount } from '../inventory'
import { fuseMonsters, inheritableSkillIds, makeOffspring } from '../progression'
import { lifespanYears } from '../registries'
import { createRng, toBig } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, GameState, Monster } from '../model'
import { getMonsterView } from './roster'

const data = makeData()
const PILL = 'breakthroughPill'

const hero = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id: 'a', level: 50, awakening: 1, skillIds: ['strike', 'idle'], ...overrides })

function townState(party: Monster[], pills = 1, money = 1e6): GameState {
  return {
    ...makeGameState({ seed: 3, party }),
    money: toBig(money),
    inventory: makeInventory({ [PILL]: pills })
  }
}

const take = (state: GameState, monsterId = 'a'): GameState =>
  gameReducer(data, state, { type: 'takeHumanForm', monsterId })
const setForm = (state: GameState, form: 'beast' | 'human', monsterId = 'a'): GameState =>
  gameReducer(data, state, { type: 'setHumanForm', monsterId, form })
const partyOf = (state: GameState, id = 'a'): Monster =>
  defined(state.party.find((m) => m.id === id))

describe('hóa hình', () => {
  it('trừ 1 đan và 200 × level tiền, thành nhân hình, ghi mốc lý lịch', () => {
    const state = townState([hero()])
    const next = take(state)
    const a = partyOf(next)
    expect(a.humanForm).toBe('human')
    expect(state.money.minus(next.money).toString()).toBe('10000')
    expect(getItemCount(next.inventory, PILL)).toBe(0)
    expect(defined(a.history).milestones.at(-1)).toEqual({ day: 0, kind: 'humanFormed' })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('quái trong kho cũng hóa hình được', () => {
    const state = { ...townState([makeMonster({ id: 'b' })]), storage: [hero()] }
    expect(defined(take(state).storage[0]).humanForm).toBe('human')
  })

  it('điều kiện: race, thức tỉnh, đã hóa hình, nơi, trận, gục, trọng thương, đan, tiền', () => {
    const reason = (monster: Monster, why: 'race' | 'awakeningTooLow' | 'alreadyTaken'): void =>
      expectActionError(() => take(townState([monster])), 'cannotTakeHumanForm', {
        monsterId: 'a',
        reason: why
      })
    reason(hero({ raceId: 'brute' }), 'race')
    reason(hero({ awakening: 0 }), 'awakeningTooLow')
    reason(hero({ humanForm: 'beast' }), 'alreadyTaken')
    expectActionError(() => take(atFloor(townState([hero()]), 1)), 'notInTown')
    expectActionError(() => take(makeBattleState([hero()], [makeMonster({ id: 'e' })])), 'inBattle')
    expectActionError(
      () => take(townState([hero({ damageTaken: toBig('1e9') })])),
      'monsterFainted'
    )
    expectActionError(() => take(townState([hero({ injuryBattlesLeft: 1 })])), 'injured')
    expectActionError(() => take(townState([hero()], 0)), 'notEnoughItem')
    expectActionError(() => take(townState([hero()], 1, 9999)), 'notEnoughMoney')
    expectActionError(() => take(townState([hero()]), 'zz'), 'monsterNotOwned')
  })
})

describe('đổi dạng', () => {
  it('nhân hình ↔ bản thể, ở đâu cũng được; đúng dạng đang có hoặc chưa hóa hình thì báo lỗi', () => {
    const human = atFloor(townState([hero({ humanForm: 'human' })]), 1)
    const beast = setForm(human, 'beast')
    expect(partyOf(beast).humanForm).toBe('beast')
    expect(partyOf(setForm(beast, 'human')).humanForm).toBe('human')
    expectActionError(() => setForm(human, 'human'), 'humanFormUnchanged', {
      monsterId: 'a',
      form: 'human'
    })
    expectActionError(() => setForm(townState([hero()]), 'beast'), 'humanFormNotTaken')
    expectActionError(
      () =>
        gameReducer(data, human, {
          type: 'setHumanForm',
          monsterId: 'a',
          form: 'dragon' as 'beast'
        }),
      'malformedAction'
    )
  })

  it('race không có nhân hình (sau phản tổ): chỉ về được bản thể', () => {
    const state = townState([hero({ raceId: 'brute', humanForm: 'beast' })])
    expectActionError(() => setForm(state, 'human'), 'humanFormNotTaken')
  })
})

describe('trên quái', () => {
  it('% chỉ số nhân hình cộng ở bước áp trait (nguồn humanForm); bản thể không có', () => {
    const human = computeStats(data, hero({ humanForm: 'human' }))
    expect(human.percentBySource.humanForm).toEqual({
      hp: -10,
      attack: -5,
      defense: -10,
      spAttack: 15,
      spDefense: 10,
      speed: 15
    })
    expect(computeStats(data, hero({ humanForm: 'beast' })).percentBySource.humanForm.speed).toBe(0)
  })

  it('thọ nguyên × 1,5 khi đã hóa hình (cả bản thể)', () => {
    const base = lifespanYears(data, hero())
    expect(lifespanYears(data, hero({ humanForm: 'beast' })).toString()).toBe(
      base.times(1.5).toString()
    )
  })

  it('ô skill thứ 5: đã hóa hình giữ được 5 skill, ô cuối khóa khi ở bản thể', () => {
    const five = ['strike', 'idle', 'growl', 'blast', 'sap']
    const human = hero({ humanForm: 'human', skillIds: five })
    expect(skillCapacity(data, human)).toBe(5)
    expect(skillCapacity(data, hero())).toBe(4)
    expect(lockedSkillIds(data, human)).toEqual([])
    expect(lockedSkillIds(data, { ...human, humanForm: 'beast' })).toEqual(['sap'])
    expect(validateMonster(data, human)).toEqual([])
    expect(validateMonster(data, { ...human, humanForm: 'locked' }).join()).toContain('skill')
    // Học skill mới vào ô thứ 5 khi đã hóa hình.
    const four = hero({ humanForm: 'beast', skillIds: five.slice(0, 4) })
    expect(offerSkills(data, four, ['sap']).monster.skillIds).toEqual(five)
  })

  it('kiểm tra quái: giá trị lạ, nhân hình ở race không có nhân hình', () => {
    expect(validateMonster(data, hero({ humanForm: 'x' as 'human' })).join()).toContain('humanForm')
    expect(validateMonster(data, hero({ raceId: 'brute', humanForm: 'human' })).join()).toContain(
      'nhân hình'
    )
  })

  it('breed: con chưa hóa hình; fuse: giữ của quái gốc, skill ô khóa của quái phụ không kế thừa', () => {
    const mother = makeMonster({ id: 'm', gender: 'female', humanForm: 'human' })
    const father = makeMonster({ id: 'd', gender: 'male', humanForm: 'beast' })
    expect(makeOffspring(data, createRng(1), father, mother, 'egg')[0].humanForm).toBe('locked')
    const base = makeMonster({ id: 'x', humanForm: 'human' })
    const sub = makeMonster({
      id: 'y',
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      humanForm: 'beast',
      skillIds: ['strike', 'wave', 'growl', 'blast', 'sap']
    })
    expect(fuseMonsters(data, createRng(1), base, sub)[0].humanForm).toBe('human')
    expect(inheritableSkillIds(data, base, sub)).not.toContain('sap')
    expect(inheritableSkillIds(data, base, { ...sub, humanForm: 'human' })).toContain('sap')
  })

  it('MonsterView', () => {
    const view = defined(getMonsterView(data, townState([hero({ awakening: 2 })]), 'a')).humanForm
    expect(view.state).toBe('locked')
    expect(view.raceAllows).toBe(true)
    expect(view.blocker).toBeNull()
    expect(view.cost.toString()).toBe('10000')
    expect(view.trueFormPercent).toBe(30)
    expect(view.skillCapacity).toBe(4)
  })
})

describe('Hiện nguyên hình', () => {
  const command = (transform?: 'trueForm' | 'mega' | 'tera'): BattleCommand => ({
    slot: 0,
    kind: 'skill',
    skillId: 'idle',
    ...(transform ? { transform } : {})
  })
  const turn = (state: GameState, commands: BattleCommand[]): GameState =>
    gameReducer(data, state, { type: 'submitTurn', commands })
  const battle = (monster: Monster): GameState =>
    makeBattleState([monster], [makeMonster({ id: 'e', skillIds: ['idle'] })])

  it('quái nhân hình: về bản thể, mọi chỉ số trừ HP + 20% + 5% mỗi tầng (nguồn trueForm)', () => {
    const next = turn(battle(hero({ humanForm: 'human', awakening: 2 })), [command('trueForm')])
    const a = partyOf(next)
    expect(a.battleTransform?.kind).toBe('trueForm')
    const { percentBySource } = computeStats(data, a)
    expect(percentBySource.trueForm.attack).toBe(30)
    expect(percentBySource.trueForm.hp).toBe(0)
    expect(percentBySource.humanForm.speed).toBe(0)
    // Mỗi quái một biến hình mỗi trận.
    expectActionError(() => turn(next, [command('trueForm')]), 'transformUnavailable')
  })

  it('bản thể / chưa hóa hình thì không dùng được', () => {
    expectActionError(
      () => turn(battle(hero({ humanForm: 'beast' })), [command('trueForm')]),
      'transformUnavailable',
      { kind: 'trueForm', reason: 'notEligible' }
    )
  })

  it('ô skill nhân hình khóa sau khi về bản thể: lệnh dùng skill đó báo lỗi', () => {
    const five = ['strike', 'idle', 'growl', 'blast', 'sap']
    const state = battle(hero({ humanForm: 'human', skillIds: five }))
    const sapTurn = (s: GameState): GameState =>
      turn(s, [{ slot: 0, kind: 'skill', skillId: 'sap', target: 0 }])
    expect(sapTurn(state).battle).not.toBeNull()
    const reverted = turn(state, [command('trueForm')])
    expectActionError(() => sapTurn(reverted), 'humanFormSkillLocked', {
      monsterId: 'a',
      skillId: 'sap'
    })
  })

  it('dùng được trong trận độ kiếp (Mega / Dynamax / Tera thì không)', () => {
    const state = gameReducer(
      data,
      townState([hero({ humanForm: 'human', level: 100 }), makeMonster({ id: 'b' })], 5),
      { type: 'startTribulation', monsterId: 'a' }
    )
    const next = turn(state, [command('trueForm')])
    // Trận có thể kết thúc ngay lượt đó (biến hình trả lại khi hết trận): xét theo log.
    expect(defined(next.battle).log).toContainEqual(
      expect.objectContaining({ type: 'transformed', kind: 'trueForm', monsterId: 'a' })
    )
  })

  it('Tera giữ nhân hình (nguồn humanForm còn tác dụng)', () => {
    const tera = { ...hero({ humanForm: 'human' }) }
    const withTera: Monster = {
      ...tera,
      battleTransform: { kind: 'tera', teraElementId: 'grass', originalElementIds: ['grass'] }
    }
    expect(computeStats(data, withTera).percentBySource.humanForm.speed).toBe(15)
    const withMega: Monster = {
      ...tera,
      battleTransform: { kind: 'mega', originalElementIds: ['grass'], ended: true }
    }
    expect(computeStats(data, withMega).percentBySource.humanForm.speed).toBe(0)
  })
})

describe('dữ liệu và save', () => {
  it('race thiếu humanForm, config sai', () => {
    const issues = dataIssuesAfter((raw) => {
      // Race thiếu trường thì lấy của nhóm: xóa cả hai mới thành thiếu.
      delete (raw.races[0] as { humanForm?: boolean }).humanForm
      delete (defined(raw.raceGroups[0], 'nhóm neutral') as { humanForm?: boolean }).humanForm
      raw.config.humanForm = { ...raw.config.humanForm, pillItemId: 'potion', costPerLevel: -1 }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'Race "neutral": humanForm phải là true / false',
        expect.stringContaining('config.humanForm.pillItemId'),
        expect.stringContaining('config.humanForm.costPerLevel')
      ])
    )
  })

  it('migrate v39 → v40: mọi quái chưa hóa hình; state hợp lệ', () => {
    const battleState = makeBattleState([hero()], [makeMonster({ id: 'e' })])
    const raw = serializeState(battleState) as Record<string, unknown>
    const strip = (monster: unknown): unknown => {
      const { humanForm: _humanForm, ...rest } = monster as Record<string, unknown>
      return rest
    }
    const rawBattle = raw.battle as Record<string, unknown>
    const old = {
      ...raw,
      version: 39,
      party: (raw.party as unknown[]).map(strip),
      battle: { ...rawBattle, enemies: (rawBattle.enemies as unknown[]).map(strip) }
    }
    const migrated = migrateState(old, data)
    expect(partyOf(migrated).humanForm).toBe('locked')
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
