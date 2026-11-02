// Tông môn (docs/rules/sects.md): gia nhập / rời / thời gian chờ, đồng môn NPC, nhiệm vụ tông và làm
// mới, Tàng Bảo Các, buff chức vị, luận võ, thi thăng chức, tông chiến, điểm thiên phú thưởng, kiểm
// tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { expForLevel } from '../monster'
import { getBookCount, getItemCount } from '../inventory'
import {
  sectRankForContribution,
  sectRankThreshold,
  sectRankTitle,
  tamerBonusAmount,
  tamerTalentPointsEarned
} from '../registries'
import { suggestBattleCommands, suggestReplacements } from '../battle'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeRawData,
  withFixtureText,
  makeGameState,
  makeMonster,
  uniformStats
} from '../testing'
import { createGameData } from '../gameData'
import { recordQuestEvent } from '../quests'
import type {
  BattleEvent,
  GameAction,
  GameData,
  GameState,
  ItemRef,
  Monster,
  RawGameData
} from '../model'
import { advanceTime } from './time'
import { sectRanking } from './sects'

/** Fixture + một mẫu nhiệm vụ (hạ 2 quái) để có nhiệm vụ tông. */
function makeSectData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.quests.push({
    id: 'hunt',
    type: 'defeat',
    params: { floorOffset: 0 },
    countMin: 2,
    countMax: 2,
    weight: 1,
    reward: { moneyPerFloor: 100, items: [{ itemId: 'potion', count: 2 }] }
  })
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeSectData()
const DAY = 24

/** Quái ta rất mạnh: thắng mọi trận NPC ở tầng thấp. */
const hero = (id = 'h'): Monster =>
  makeMonster({
    id,
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

const town = (party: Monster[] = [hero()], realm = 0): GameState =>
  makeGameState({ seed: 5, party, tamerRealm: realm })

const act = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)
const join = (state: GameState, sectId = 'sword'): GameState =>
  act(state, { type: 'joinSect', sectId })

/** Đánh tới khi trận kết thúc bằng AI cho phe người chơi, rồi rời trận. */
function fight(state: GameState): { state: GameState; log: BattleEvent[]; won: boolean } {
  let current = state
  for (let i = 0; i < 200 && current.battle?.phase !== 'ended'; i++) {
    current =
      defined(current.battle).phase === 'chooseReplacement'
        ? act(current, { type: 'replaceFainted', replacements: suggestReplacements(data, current) })
        : act(current, {
            type: 'submitTurn',
            commands: suggestBattleCommands(data, current, { transforms: false })
          })
  }
  const battle = defined(current.battle)
  return {
    state: act(current, { type: 'leaveBattle' }),
    log: battle.log,
    won: battle.outcome === 'won'
  }
}

const withSect = (state: GameState, patch: Partial<GameState['sect']>): GameState => ({
  ...state,
  sect: { ...state.sect, ...patch }
})

describe('chức vị', () => {
  it('ngưỡng = rankBase × r²; chức vị theo cống hiến đúng ở biên; tên vượt danh sách thì + n', () => {
    expect([0, 1, 2, 3].map((r) => sectRankThreshold(data, r))).toEqual([0, 100, 400, 900])
    expect(sectRankForContribution(data, 0)).toBe(0)
    expect(sectRankForContribution(data, 99)).toBe(0)
    expect(sectRankForContribution(data, 100)).toBe(1)
    expect(sectRankForContribution(data, 899)).toBe(2)
    expect(sectRankForContribution(data, 900)).toBe(3)
    expect(sectRankForContribution(data, 1e14)).toBe(1e6)
    expect(sectRankTitle(data, 1)).toEqual({ rankId: 'inner', plus: 0 })
    expect(sectRankTitle(data, 5)).toEqual({ rankId: 'elder', plus: 3 })
    // Số cực lớn: kẹp, không Infinity.
    expect(sectRankThreshold(data, 1e300)).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('gia nhập / rời tông', () => {
  it('gia nhập: đồng môn NPC (tông chủ đứng đầu), nhiệm vụ tông, buff theo chức vị', () => {
    const joined = join(town())
    expect(joined.sect.sectId).toBe('sword')
    expect(joined.sect.members).toHaveLength(4)
    const master = defined(joined.sect.members.find((m) => m.isMaster))
    const top = Math.max(...joined.sect.members.filter((m) => !m.isMaster).map((m) => m.rank))
    expect(master.rank).toBe(top + 2)
    expect(joined.quests.sect).toHaveLength(2)
    expect(joined.quests.sect.every((q) => q.progress === 0 && q.reward.items.length === 0)).toBe(
      true
    )
    expect(tamerBonusAmount(data, joined, 'expPercent')).toBe(10)
    expect(tamerBonusAmount(data, withSect(joined, { rank: 2 }), 'expPercent')).toBe(30)
    expect(validateGameState(data, joined)).toEqual([])
    // Save có nhiệm vụ tông (tiền thưởng Decimal) ghi / đọc lại đúng.
    const loaded = migrateState(JSON.parse(JSON.stringify(serializeState(joined))), data)
    expect(validateGameState(data, loaded)).toEqual([])
  })

  it('lỗi: tông lạ, thiếu cảnh giới, đã ở tông, ngoài thị trấn; state giữ nguyên', () => {
    expectActionError(() => join(town(), 'nope'), 'sectNotFound', { sectId: 'nope' })
    expectActionError(() => join(town(), 'beast'), 'sectRealmTooLow', { minRealm: 2 })
    expect(join(town([hero()], 2), 'beast').sect.sectId).toBe('beast')
    expectActionError(() => join(join(town())), 'alreadyInSect', { sectId: 'sword' })
    const onFloor = { ...town(), location: { type: 'floor', floor: 1 } as const }
    expectActionError(() => join(onFloor), 'notInTown')
  })

  it('rời tông: mất cống hiến / chức vị / đồng môn / nhiệm vụ tông, chờ 30 ngày; điểm thưởng giữ', () => {
    const joined = withSect(join(town()), { contribution: 50, totalContribution: 500, rank: 2 })
    const rewarded = { ...joined, tamer: { ...joined.tamer, bonusTalentPoints: 3 } }
    const left = act(rewarded, { type: 'leaveSect' })
    expect(left.sect).toMatchObject({ sectId: null, contribution: 0, rank: 0, members: [] })
    expect(left.quests.sect).toEqual([])
    expect(left.tamer.bonusTalentPoints).toBe(3)
    expect(validateGameState(data, left)).toEqual([])
    expectActionError(() => join(left), 'sectRejoinCooldown', { untilDay: 30 })
    expect(join({ ...left, time: 30 * DAY }).sect.sectId).toBe('sword')
    expectActionError(() => act(town(), { type: 'leaveSect' }), 'notInSect')
  })
})

describe('đồng môn NPC', () => {
  it('mọi chức vị trong memberRankWeights đều có thể ra (trọng số > 0)', () => {
    const wide = makeSectData((raw) => {
      raw.config.sects.memberRankWeights = [1, 1, 1]
      raw.config.sects.memberCount = 60
    })
    const joined = gameReducer(wide, town(), { type: 'joinSect', sectId: 'sword' })
    const ranks = new Set(joined.sect.members.filter((m) => !m.isMaster).map((m) => m.rank))
    expect([...ranks].sort()).toEqual([0, 1, 2])
  })
})

describe('nhiệm vụ tông', () => {
  it('tiến độ tính ngay, nộp nhận cống hiến = 10 × số lần; chưa xong / id lạ báo lỗi', () => {
    const joined = join(town())
    const mission = defined(joined.quests.sect[0])
    expectActionError(
      () => act(joined, { type: 'claimSectMission', questId: mission.id }),
      'questNotComplete'
    )
    // Sự kiện nhiệm vụ tính cả nhiệm vụ tông (không cần nhận).
    const progressed = recordQuestEvent(data, joined.quests, { type: 'defeated', floor: 1 })
    expect(progressed.sect.every((q) => q.progress === 1)).toBe(true)
    expectActionError(
      () => act(joined, { type: 'claimSectMission', questId: 'q999' }),
      'questNotFound'
    )
    const done = {
      ...joined,
      quests: {
        ...joined.quests,
        sect: joined.quests.sect.map((q) =>
          q.id === mission.id ? { ...q, progress: q.target } : q
        )
      }
    }
    const claimed = act(done, { type: 'claimSectMission', questId: mission.id })
    expect(claimed.sect.contribution).toBe(10 * mission.target)
    expect(claimed.sect.totalContribution).toBe(10 * mission.target)
    expect(claimed.quests.sect).toHaveLength(1)
    // Không tính vào bộ đếm nhiệm vụ thường; tỉ lệ điểm thiên phú của fixture = 0.
    expect(claimed.stats.questsCompleted).toBe(0)
    expect(claimed.tamer.bonusTalentPoints).toBe(0)
  })

  it('tỉ lệ điểm thiên phú 100%: +1 điểm thưởng, cộng vào điểm thiên phú ngự thú sư', () => {
    const lucky = makeSectData((raw) => (raw.config.sects.missions.talentPointChance = 100))
    const joined = gameReducer(lucky, town(), { type: 'joinSect', sectId: 'sword' })
    const mission = defined(joined.quests.sect[0])
    const done = {
      ...joined,
      quests: { ...joined.quests, sect: [{ ...mission, progress: mission.target }] }
    }
    const claimed = gameReducer(lucky, done, { type: 'claimSectMission', questId: mission.id })
    expect(claimed.tamer.bonusTalentPoints).toBe(1)
    expect(tamerTalentPointsEarned(lucky, claimed)).toBe(tamerTalentPointsEarned(lucky, done) + 1)
  })

  it('sau 7 ngày nhiệm vụ tông làm mới; đồng môn tích cống hiến mỗi ngày', () => {
    const joined = join(town())
    const before = joined.quests.sect.map((q) => q.id)
    const disciple = defined(joined.sect.members.find((m) => !m.isMaster))
    const later = advanceTime(data, joined, 7 * DAY)
    expect(later.quests.sect.map((q) => q.id)).not.toEqual(before)
    expect(later.sect.missionDay).toBe(7)
    const grown = defined(later.sect.members.find((m) => m.id === disciple.id))
    expect(grown.contribution).toBeGreaterThan(disciple.contribution)
    expect(validateGameState(data, later)).toEqual([])
    const ranking = sectRanking(later)
    expect(ranking).toHaveLength(5)
    expect(ranking[0].contribution).toBeGreaterThanOrEqual(ranking[4].contribution)
  })
})

describe('Tàng Bảo Các', () => {
  const stack = (itemId: string): ItemRef => ({ storage: 'stack', itemId })
  const book = (reusable: boolean): ItemRef => ({ storage: 'book', skillId: 'strike', reusable })

  it('bán Bí kíp / Chân kinh: vào kho sách, Chân kinh cần chức vị cao; sách không bán thì báo lỗi', () => {
    const rich = withSect(join(town()), { contribution: 400, totalContribution: 400 })
    const bought = act(rich, { type: 'buySectItem', item: book(false), count: 2 })
    expect(getBookCount(bought.inventory, { skillId: 'strike', reusable: false })).toBe(2)
    expect(bought.sect.contribution).toBe(320)
    expectActionError(
      () => act(rich, { type: 'buySectItem', item: book(true), count: 1 }),
      'sectRankTooLow',
      {
        itemId: 'strike',
        minRank: 2
      }
    )
    const elder = withSect(rich, { rank: 2 })
    const scripture = act(elder, { type: 'buySectItem', item: book(true), count: 1 })
    expect(getBookCount(scripture.inventory, { skillId: 'strike', reusable: true })).toBe(1)
    expect(scripture.sect.contribution).toBe(100)
    expectActionError(
      () =>
        act(rich, {
          type: 'buySectItem',
          item: { storage: 'book', skillId: 'idle', reusable: false },
          count: 1
        }),
      'notInSectShop',
      { itemId: 'idle' }
    )
  })

  it('mua bằng cống hiến, đủ chức vị; thiếu cống hiến / chức vị / món lạ báo lỗi', () => {
    const rich = withSect(join(town()), { contribution: 60, totalContribution: 60 })
    const bought = act(rich, { type: 'buySectItem', item: stack('potion'), count: 3 })
    expect(getItemCount(bought.inventory, 'potion')).toBe(3)
    expect(bought.sect).toMatchObject({ contribution: 30, totalContribution: 60 })
    expectActionError(
      () => act(rich, { type: 'buySectItem', item: stack('potion'), count: 7 }),
      'notEnoughContribution',
      { need: 70, have: 60 }
    )
    expectActionError(
      () => act(rich, { type: 'buySectItem', item: stack('rareCandy'), count: 1 }),
      'sectRankTooLow',
      { minRank: 1 }
    )
    expectActionError(
      () => act(rich, { type: 'buySectItem', item: stack('revive'), count: 1 }),
      'notInSectShop'
    )
  })
})

describe('trận tông môn', () => {
  it('luận võ: thắng + 20 × (chức vị đối thủ + 1) cống hiến; tối đa 2 trận mỗi ngày', () => {
    let state = join(town())
    const member = defined(state.sect.members.find((m) => !m.isMaster))
    const started = act(state, { type: 'challengeSectMember', memberId: member.id })
    expect(defined(started.battle).trainer).toMatchObject({ mode: 'sectDuel', memberId: member.id })
    expect(validateGameState(data, started)).toEqual([])
    const result = fight(started)
    expect(result.won).toBe(true)
    const amount = 20 * (member.rank + 1)
    expect(result.log).toContainEqual({ type: 'sectContributionGained', amount })
    expect(result.state.sect.contribution).toBe(amount)
    state = fight(act(result.state, { type: 'challengeSectMember', memberId: member.id })).state
    expectActionError(
      () => act(state, { type: 'challengeSectMember', memberId: member.id }),
      'sectDuelLimit',
      { perDay: 2 }
    )
    expectActionError(
      () =>
        act({ ...state, time: state.time + DAY }, { type: 'challengeSectMember', memberId: 'm99' }),
      'sectMemberNotFound'
    )
  })

  it('thi thăng chức: đủ cống hiến tổng thì đấu giám khảo, thắng lên chức + 1 điểm thiên phú', () => {
    const joined = join(town())
    expectActionError(() => act(joined, { type: 'challengePromotion' }), 'promotionNotReady', {
      need: 100,
      have: 0
    })
    const ready = withSect(joined, { totalContribution: 100 })
    const result = fight(act(ready, { type: 'challengePromotion' }))
    expect(result.log).toContainEqual({ type: 'sectPromoted', rank: 1 })
    expect(result.log).toContainEqual({ type: 'tamerTalentPointsGained', amount: 1 })
    expect(result.state.sect.rank).toBe(1)
    expect(result.state.tamer.bonusTalentPoints).toBe(1)
    expectActionError(() => act(town(), { type: 'challengePromotion' }), 'notInSect')
  })

  it('tông chiến: mỗi 60 ngày một kỳ, thắng hết vòng vô địch (cống hiến, điểm, vật phẩm)', () => {
    let state = act(join(town()), { type: 'enterSectWar' })
    expect(state.sect.war).toEqual({ lastPeriod: 0, round: 0, rivalSectId: 'beast' })
    expectActionError(() => act(state, { type: 'rest' }), 'sectWarInProgress')
    expectActionError(() => act(state, { type: 'challengeArena' }), 'sectWarInProgress')
    expectActionError(() => act(state, { type: 'leaveSect' }), 'sectWarInProgress')
    const battle = act(state, { type: 'challengeSectWar' })
    expect(defined(defined(battle.battle).trainer).npcNameId).toBeDefined()
    expect(validateGameState(data, battle)).toEqual([])
    for (let round = 0; round < 2; round++) {
      const result = fight(act(state, { type: 'challengeSectWar' }))
      expect(result.log).toContainEqual({ type: 'sectWarRoundWon', round })
      state = result.state
    }
    expect(state.sect.war.round).toBeNull()
    expect(state.sect.contribution).toBe(30 + 50 + 100)
    expect(state.tamer.bonusTalentPoints).toBe(2)
    expect(getItemCount(state.inventory, 'rareCandy')).toBe(1)
    expectActionError(() => act(state, { type: 'enterSectWar' }), 'sectWarNotOpen', { nextDay: 60 })
    expectActionError(() => act(state, { type: 'challengeSectWar' }), 'noSectWar')
    expect(act({ ...state, time: 60 * DAY }, { type: 'enterSectWar' }).sect.war.lastPeriod).toBe(1)
  })

  it('tông chiến thua thì bị loại; bỏ tông chiến được', () => {
    const weak = makeMonster({ id: 'w', skillIds: ['idle'] })
    const entered = act(join(town([weak])), { type: 'enterSectWar' })
    const result = fight(act(entered, { type: 'challengeSectWar' }))
    expect(result.won).toBe(false)
    expect(result.log).toContainEqual({ type: 'sectWarEliminated', round: 0 })
    expect(result.state.sect.war.round).toBeNull()
    expect(act(entered, { type: 'forfeitSectWar' }).sect.war.round).toBeNull()
  })
})

describe('kiểm tra dữ liệu / save', () => {
  it('dữ liệu: lớp NPC lạ, tông đối địch lạ / trùng, món không gộp chồng, kênh lạ, config sai', () => {
    expect(
      dataIssuesAfter((raw) => {
        raw.sects[0].trainerClassIds = ['nope']
        raw.sects[0].rivalSectIds = ['sword']
        raw.sects[0].shop[0] = { itemId: 'nope', cost: 1, minRank: 0 }
        raw.sects[0].shop[1] = { skillId: 'nope', reusable: false, cost: 1, minRank: 0 }
        raw.sects[1].rankBonuses = [{ type: 'flying' as 'expPercent', params: {} }]
        raw.config.sects.memberRankWeights = [0]
        raw.config.sects.war.rounds = []
      })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('lớp NPC thường không tồn tại "nope"'),
        expect.stringContaining('tông đối địch không tồn tại hoặc trùng chính tông "sword"'),
        expect.stringContaining('shop[0]'),
        expect.stringContaining('skill không có sách "nope"'),
        expect.stringContaining('loại hiệu ứng lạ "flying"'),
        expect.stringContaining('memberRankWeights'),
        expect.stringContaining('rounds')
      ])
    )
  })

  it('save: cống hiến vượt tổng, tông lạ, thiếu tông chủ, chưa vào tông mà có đồng môn', () => {
    const joined = join(town())
    expect(validateGameState(data, withSect(joined, { contribution: 5 }))).toHaveLength(1)
    expect(validateGameState(data, withSect(joined, { sectId: 'nope' })).length).toBeGreaterThan(0)
    const noMaster = withSect(joined, { members: joined.sect.members.filter((m) => !m.isMaster) })
    expect(validateGameState(data, noMaster)).toEqual(['sect.members: phải có đúng một tông chủ'])
    const stray = withSect(town(), { members: joined.sect.members, nextMemberId: 9 })
    expect(validateGameState(data, stray)).toEqual(['sect.members: chưa gia nhập tông thì rỗng'])
  })

  it('migrate v93 → v94: chưa vào tông, chưa có nhiệm vụ tông, chưa có điểm thưởng', () => {
    const raw = serializeState(town()) as Record<string, unknown>
    const { sect: _sect, ...rest } = raw
    const { sect: _missions, ...quests } = raw.quests as Record<string, unknown>
    const { bonusTalentPoints: _points, ...tamer } = raw.tamer as Record<string, unknown>
    const migrated = migrateState({ ...rest, version: 93, quests, tamer }, data)
    expect(migrated.sect.sectId).toBeNull()
    expect(migrated.quests.sect).toEqual([])
    expect(migrated.tamer.bonusTalentPoints).toBe(0)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
