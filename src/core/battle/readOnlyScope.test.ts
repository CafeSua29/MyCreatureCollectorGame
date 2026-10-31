// Phạm vi chỉ đọc khi AI chấm điểm (docs/rules/core-map.md mục "Bộ nhớ tạm khi chỉ đọc"): hook đã
// gom, bối cảnh trận, max HP nhớ theo object nhưng cho đúng kết quả như tính lại; AI không sửa draft.

import { describe, expect, it } from 'vitest'
import { getMaxHp, isFainted } from '../monster'
import { forEachTraitHook } from '../registries'
import { runReadOnlyScope, toBig } from '../shared'
import { defined, makeBattleState, makeMonster, makeSiralimData } from '../testing'
import type { Monster, MonsterBattleContext } from '../model'
import { aiStatsMemo, suggestBattleCommands } from './ai'
import { cloneDraft, monsterBattleContext, type Draft } from './draft'

const data = makeSiralimData()

const mon = (id: string, traitIds: string[], damageTaken = 0): Monster =>
  makeMonster({
    id,
    traits: traitIds.map((traitId) => ({ id: traitId, level: 1 })),
    skillIds: ['strike', 'idle'],
    damageTaken: toBig(damageTaken)
  })

/** Hai quái ta (hào quang cả phe, hào quang theo máu đang kích hoạt), một địch (hào quang lên địch). */
function draft(): Draft {
  return cloneDraft(
    makeBattleState([mon('a', ['vigor']), mon('b', ['rage'], 30)], [mon('e', ['crimson'])])
  )
}

/** Dãy hook (id nguồn, hệ số, loại nguồn) có tác dụng lên quái theo đúng thứ tự gọi. */
function hookCalls(monster: Monster, ctx: MonsterBattleContext | undefined): string[] {
  const calls: string[] = []
  forEachTraitHook(
    data,
    monster,
    (_handler, _params, scale, sourceId, source) =>
      calls.push(`${sourceId}:${scale}:${source.kind}:${source.ownerId}`),
    ctx
  )
  return calls
}

describe('phạm vi chỉ đọc', () => {
  it('hook đã gom (kể cả hào quang của đồng đội / địch) như khi tính lại, gọi lại vẫn đủ', () => {
    const d = draft()
    const receivers = [...d.party, ...d.battle.enemies]
    const outside = receivers.map((m) => hookCalls(m, monsterBattleContext(data, d, m)))
    expect(outside[0]).toContain('vigor:1:aura:a')
    expect(outside[0]).toContain('rage:1:aura:b')
    // crimson phát lên phe địch của e (quái ta), không lên chính e.
    expect(outside[0]).toContain('crimson:1:aura:e')
    expect(outside[2]).not.toContain('crimson:1:aura:e')
    runReadOnlyScope(() => {
      for (const round of [1, 2]) {
        const inside = receivers.map((m) => hookCalls(m, monsterBattleContext(data, d, m)))
        expect(inside, `lượt ${round}`).toEqual(outside)
      }
    })
  })

  it('cùng object bối cảnh trong phạm vi, object mới mỗi lần ngoài phạm vi', () => {
    const d = draft()
    const a = defined(d.party[0])
    expect(monsterBattleContext(data, d, a)).not.toBe(monsterBattleContext(data, d, a))
    runReadOnlyScope(() => {
      expect(monsterBattleContext(data, d, a)).toBe(monsterBattleContext(data, d, a))
      // Draft khác (bản giả định) có bối cảnh riêng.
      expect(monsterBattleContext(data, { ...d }, a)).not.toBe(monsterBattleContext(data, d, a))
    })
  })

  it('ngoài phạm vi vẫn thấy quái đổi tại chỗ (giải lượt sửa draft)', () => {
    const d = draft()
    const b = defined(d.party[1])
    const maxHp = getMaxHp(data, b)
    expect(isFainted(data, b)).toBe(false)
    b.damageTaken = maxHp.minus(1)
    expect(isFainted(data, b)).toBe(false)
    b.damageTaken = maxHp
    expect(isFainted(data, b)).toBe(true)
    // Bối cảnh tính lại: đồng đội gục không còn trên sân.
    expect(defined(monsterBattleContext(data, d, defined(d.party[0]))).allies).toEqual([])
  })

  it('isFainted ở biên: damageTaken = max HP − 1 / = max HP / số cực lớn', () => {
    const fresh = mon('x', [])
    const maxHp = getMaxHp(data, fresh)
    expect(isFainted(data, { ...fresh, damageTaken: maxHp.minus(1) })).toBe(false)
    expect(isFainted(data, { ...fresh, damageTaken: maxHp })).toBe(true)
    expect(isFainted(data, { ...fresh, damageTaken: toBig('1e500') })).toBe(true)
    expect(isFainted(data, { ...fresh, damageTaken: toBig(0) })).toBe(false)
  })

  it('gợi ý lệnh (AI trong phạm vi) không đổi state và tất định', () => {
    const state = makeBattleState([mon('a', ['vigor']), mon('b', ['rage'], 30)], [mon('e', [])])
    const before = JSON.stringify(state)
    const commands = suggestBattleCommands(data, state)
    expect(suggestBattleCommands(data, state)).toEqual(commands)
    expect(JSON.stringify(state)).toBe(before)
  })

  it('bộ nhớ chỉ số của AI dùng chung trên cùng draft trong phạm vi, riêng cho draft khác / ngoài phạm vi', () => {
    const d = draft()
    expect(aiStatsMemo(data, d)).not.toBe(aiStatsMemo(data, d))
    runReadOnlyScope(() => {
      expect(aiStatsMemo(data, d)).toBe(aiStatsMemo(data, d))
      expect(aiStatsMemo(data, { ...d })).not.toBe(aiStatsMemo(data, d))
    })
  })
})
