// Sticker skill trong trận (docs/rules/skill-stickers.md): power, chính xác, đòn thêm, hồi máu sau khi
// dùng, dùng lại, chí mạng khi khắc hệ, tự dùng skill cuối lượt (hook trait), chỉ áp đúng skill mang
// sticker, hợp kích kỹ không áp, Status Duration Boost.
// Fixture: thuộc tính mẫu ở fixtures.ts (stickerAttributes); strike (thường, 50 power), shaky (50%
// chính xác), blast (lửa), toxin (gây độc), idle (không làm gì).

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { getMaxHp } from '../monster'
import { toBig } from '../shared'
import {
  defined,
  makeBattleState,
  makeData,
  makeField,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import { createGameData } from '../gameData'
import type { BattleEvent, GameState, Monster, StickerInstance, StickerRoll } from '../model'
import { expectedDamage } from './damage'
import { skillAccuracy } from './environment'

const data = makeData()

const sticker = (skillId: string, rolls: StickerRoll[]): StickerInstance => ({
  id: 's1',
  skillId,
  rarity: 'rare',
  rolls
})

const user = (skillId: string, rolls: StickerRoll[], skillIds = [skillId]): Monster =>
  makeMonster({ id: 'a', skillIds, skillStickers: { [skillId]: sticker(skillId, rolls) } })

const idleEnemy = (): Monster => makeMonster({ id: 'e', skillIds: ['idle'] })

function castSkill(state: GameState, skillId: string): GameState {
  return gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })
}

const logOf = (state: GameState): BattleEvent[] => defined(state.battle).log

describe('công thức', () => {
  const defender = makeMonster({ id: 'e' })
  const input = { data, defender, skill: data.skills.strike, spread: false }

  it('Damage +20%: sát thương × 1,2; skill khác của quái không đổi', () => {
    // Đủ ô (4 skill) để thuộc tính theo ô trống không lẫn vào.
    const skills = ['strike', 'toxin', 'idle', 'blast']
    const base = expectedDamage({ ...input, attacker: makeMonster({ id: 'a', skillIds: skills }) })
    const boosted = expectedDamage({
      ...input,
      attacker: user('strike', [{ attributeId: 'damage', value: 20 }], skills)
    })
    expect(boosted.div(base).toNumber()).toBeCloseTo(1.2, 2)
    const other = { ...input, skill: data.skills.blast }
    expect(
      expectedDamage({
        ...other,
        attacker: user('strike', [{ attributeId: 'damage', value: 20 }], skills)
      }).eq(expectedDamage({ ...other, attacker: makeMonster({ id: 'a', skillIds: skills }) }))
    ).toBe(true)
  })

  it('Extra Hit: số đòn kỳ vọng +1', () => {
    const base = expectedDamage({ ...input, attacker: makeMonster({ id: 'a' }) })
    const twice = expectedDamage({
      ...input,
      attacker: user('strike', [{ attributeId: 'extraHit' }])
    })
    expect(twice.div(base).toNumber()).toBeCloseTo(2, 2)
  })

  it('hợp kích kỹ không áp sticker', () => {
    const partner = { monster: makeMonster({ id: 'b' }) }
    const combo = { ...input, partner }
    expect(
      expectedDamage({
        ...combo,
        attacker: user('strike', [{ attributeId: 'damage', value: 20 }])
      }).eq(expectedDamage({ ...combo, attacker: makeMonster({ id: 'a' }) }))
    ).toBe(true)
  })

  it('Accuracy +10%: 50% thành 55%', () => {
    const field = makeField()
    const holder = user('shaky', [{ attributeId: 'accuracy', value: 10 }])
    expect(skillAccuracy(data, field, data.skills.shaky, { user: holder })).toBeCloseTo(55, 5)
  })
})

describe('trong lượt', () => {
  it('Extra Hit: đánh 2 đòn, log hitCount', () => {
    const state = makeBattleState([user('strike', [{ attributeId: 'extraHit' }])], [idleEnemy()])
    const after = castSkill(state, 'strike')
    expect(logOf(after)).toContainEqual({
      type: 'hitCount',
      monsterId: 'a',
      targetId: 'e',
      hits: 2
    })
  })

  it('Heal: hồi % max HP sau khi dùng', () => {
    const holder = user('strike', [{ attributeId: 'heal', value: 10 }])
    const hurt = { ...holder, damageTaken: getMaxHp(data, holder).div(2).floor() }
    const after = castSkill(makeBattleState([hurt], [idleEnemy()]), 'strike')
    expect(after.party[0].damageTaken.lt(hurt.damageTaken)).toBe(true)
  })

  it('Use Again 100%: dùng skill hai lần, log stickerTriggered', () => {
    const state = makeBattleState(
      [user('strike', [{ attributeId: 'useAgain', value: 100 }])],
      [idleEnemy()]
    )
    const after = castSkill(state, 'strike')
    const damages = logOf(after).filter(
      (event) => event.type === 'damage' && event.targetId === 'e'
    )
    expect(damages).toHaveLength(2)
    expect(logOf(after)).toContainEqual({
      type: 'stickerTriggered',
      monsterId: 'a',
      skillId: 'strike',
      effect: 'repeat'
    })
  })

  it('Type Advantage Crit: đòn khắc hệ luôn chí mạng', () => {
    // blast (lửa) khắc quái cỏ.
    const holder = user('blast', [{ attributeId: 'typeAdvantageCrit' }])
    const grass = { ...idleEnemy(), elementIds: ['grass'] }
    const after = castSkill(makeBattleState([holder], [grass]), 'blast')
    const hit = logOf(after).find((event) => event.type === 'damage' && event.targetId === 'e')
    expect(hit).toMatchObject({ critical: true })
  })

  it('Use at Round Ending (hook trait): cuối lượt tự dùng skill mang sticker', () => {
    const holder = user('strike', [{ attributeId: 'useAtRoundEnd', value: 100 }])
    const after = castSkill(makeBattleState([holder], [idleEnemy()]), 'strike')
    const uses = logOf(after).filter(
      (event) => event.type === 'useSkill' && event.monsterId === 'a' && event.skillId === 'strike'
    )
    expect(uses).toHaveLength(2)
  })

  it('Status Duration Boost: trạng thái skill gây lâu hơn 1 lượt', () => {
    const raw = makeRawData()
    raw.skills.push({
      id: 'hex',
      elementId: 'normal',
      category: 'status',
      power: 0,
      accuracy: 100,
      priority: 0,
      target: 'enemy',
      effects: [{ type: 'applyStatus', params: { statusId: 'poison', turns: 3 } }]
    })
    const hexData = createGameData(withFixtureText(raw))
    const turnsOf = (holder: Monster): number | null | undefined => {
      // Quái hệ thường (quái cỏ của fixture miễn độc).
      const target = { ...idleEnemy(), elementIds: ['normal'] }
      const after = gameReducer(hexData, makeBattleState([holder], [target]), {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'skill', skillId: 'hex', target: 0 }]
      })
      return defined(after.battle).enemies[0].statuses.find(
        (status) => status.statusId === 'poison'
      )?.turnsLeft
    }
    const plain = defined(turnsOf(makeMonster({ id: 'a', skillIds: ['hex'] })))
    expect(turnsOf(user('hex', [{ attributeId: 'statusDuration' }]))).toBe(plain + 1)
  })
})

describe('bộ đếm EXP theo chiêu', () => {
  /** EXP quái a nhận khi hạ quái địch yếu bằng `skillId`, sticker Exp +50% dán trên `stickerOn`. */
  function expGained(skillId: string, stickerOn: string | null): string {
    // Quái địch level 30 (EXP đủ lớn để thấy +50%), còn 1 HP nên một đòn là hạ.
    const enemy = { ...idleEnemy(), level: 30 }
    const weak = { ...enemy, damageTaken: getMaxHp(data, enemy).minus(1) }
    const holder = stickerOn
      ? user(stickerOn, [{ attributeId: 'exp', value: 50 }], ['strike', 'toxin'])
      : makeMonster({ id: 'a', skillIds: ['strike', 'toxin'] })
    const after = castSkill(makeBattleState([holder], [weak]), skillId)
    expect(defined(after.battle).outcome).toBe('won')
    return after.party[0].exp.minus(holder.exp).toString()
  }

  it('skill mang sticker Exp đã dùng trong trận: +50% EXP; chưa dùng thì không', () => {
    const plain = Number(expGained('strike', null))
    expect(plain).toBeGreaterThan(1)
    expect(Number(expGained('strike', 'strike'))).toBe(Math.floor(plain * 1.5))
    expect(Number(expGained('strike', 'toxin'))).toBe(plain)
  })

  it('bản ghi trận đếm mọi lần dùng skill', () => {
    const after = castSkill(makeBattleState([makeMonster({ id: 'a' })], [idleEnemy()]), 'strike')
    expect(defined(after.battle).records.a?.activatedSkills).toEqual({ strike: 1 })
  })
})

describe('số cực lớn', () => {
  it('sticker không làm sát thương ra Infinity / NaN', () => {
    const defender = makeMonster({
      id: 'e',
      genes: { hp: '1e300', attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 }
    })
    const attacker = {
      ...user('strike', [{ attributeId: 'damage', value: 20 }]),
      genes: { ...makeMonster().genes, attack: toBig('1e300') }
    }
    const damage = expectedDamage({
      data,
      defender,
      attacker,
      skill: data.skills.strike,
      spread: false
    })
    expect(damage.isFinite()).toBe(true)
  })
})
