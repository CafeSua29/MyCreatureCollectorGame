// Tông môn ngoài trận (docs/rules/sects.md): gia nhập / rời, đồng môn NPC, nhiệm vụ tông, Tàng Bảo
// Các, việc theo ngày (đồng môn tích cống hiến và lên chức, làm mới nhiệm vụ). Trận luận võ, thi
// thăng chức, tông chiến ở battle/sectBattles.ts.

import { parseItemRef, requireItemCount } from '../inventory'
import { rollQuest } from '../quests'
import {
  addBonusTalentPoints,
  addSectContribution,
  receiveByRef,
  sectRankForContribution,
  sectRankThreshold
} from '../registries'
import {
  ActionError,
  BIG_ZERO,
  nextInt,
  pick,
  pickWeighted,
  rollPercent,
  shuffle,
  type RngState
} from '../shared'
import {
  bestRealmReached,
  dayOf,
  type ActiveQuest,
  type DayEvent,
  type GameData,
  type GameState,
  type ItemRef,
  type QuestInstance,
  type SectDef,
  type SectMember,
  type SectShopEntry,
  type SectState
} from '../model'
import { assertNoTournament } from '../world'

// Câu hỏi về chức vị cho UI / mô phỏng (core dùng thẳng registries).
export { sectRankForContribution, sectRankThreshold, sectRankTitle } from '../registries'

/** Chưa gia nhập tông nào (game mới, test). */
export const newSectState = (): SectState => ({
  sectId: null,
  contribution: 0,
  totalContribution: 0,
  rank: 0,
  joinedDay: null,
  leftDay: null,
  missionDay: 0,
  members: [],
  nextMemberId: 1,
  duels: { day: 0, count: 0 },
  war: { lastPeriod: -1, round: null, rivalSectId: null }
})

/** Ở thị trấn, ngoài trận, không đang dự giải / tông chiến. */
function requireTownIdle(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  assertNoTournament(state)
}

/** Tông đang ở (ném notInSect nếu chưa gia nhập). */
export function currentSect(data: GameData, state: Pick<GameState, 'sect'>): SectDef {
  const { sectId } = state.sect
  if (sectId === null || !Object.hasOwn(data.sects, sectId)) throw new ActionError('notInSect')
  return data.sects[sectId]
}

/**
 * Sinh đồng môn NPC lúc gia nhập: memberCount − 1 đệ tử (tên khác nhau khi đủ tên, lớp NPC của
 * tông, chức vị theo memberRankWeights, cống hiến = ngưỡng chức vị) + tông chủ đứng đầu.
 */
export function generateSectMembers(
  data: GameData,
  rng: RngState,
  { sect, nextMemberId }: { sect: SectDef; nextMemberId: number }
): { members: SectMember[]; rng: RngState; nextMemberId: number } {
  const { memberCount, memberRankWeights, masterRankLead } = data.config.sects
  let names: string[]
  ;[names, rng] = shuffle(rng, Object.keys(data.npcNames))
  const ranks = memberRankWeights.map((weight, rank) => ({ rank, weight }))
  const members: SectMember[] = []
  let id = nextMemberId
  for (let i = 0; i < memberCount; i++) {
    const isMaster = i === memberCount - 1
    let classId: string
    ;[classId, rng] = pick(rng, sect.trainerClassIds)
    let rank: number
    if (isMaster) {
      rank = Math.max(0, ...members.map((m) => m.rank)) + masterRankLead
    } else {
      let picked: { rank: number }
      ;[picked, rng] = pickWeighted(rng, ranks, (entry) => entry.weight)
      rank = picked.rank
    }
    members.push({
      id: `m${id++}`,
      nameId: names[i % names.length],
      classId,
      rank,
      contribution: sectRankThreshold(data, rank),
      isMaster
    })
  }
  return { members, rng, nextMemberId: id }
}

/** Ra lại toàn bộ nhiệm vụ tông (bỏ thưởng tiền / vật phẩm của mẫu: nhiệm vụ tông thưởng cống hiến). */
function rollSectMissions(data: GameData, state: GameState): GameState {
  if (Object.keys(data.quests).length === 0) {
    return { ...state, quests: { ...state.quests, sect: [] } }
  }
  let { rng } = state
  let { nextQuestId } = state.quests
  const missions: ActiveQuest[] = []
  for (let i = 0; i < data.config.sects.missions.count; i++) {
    let quest: QuestInstance
    ;[quest, rng] = rollQuest(data, {
      rng,
      highestFloor: state.highestFloor,
      id: `q${nextQuestId}`
    })
    nextQuestId++
    missions.push({ ...quest, reward: { money: BIG_ZERO, items: [] }, progress: 0 })
  }
  return { ...state, rng, quests: { ...state.quests, sect: missions, nextQuestId } }
}

/** Gia nhập tông ở thị trấn: đủ cảnh giới, chưa ở tông nào, hết thời gian chờ sau khi rời tông. */
export function joinSect(data: GameData, state: GameState, sectId: string): GameState {
  requireTownIdle(state)
  if (state.sect.sectId !== null) {
    throw new ActionError('alreadyInSect', { sectId: state.sect.sectId })
  }
  if (typeof sectId !== 'string' || !Object.hasOwn(data.sects, sectId)) {
    throw new ActionError('sectNotFound', { sectId: String(sectId) })
  }
  const sect = data.sects[sectId]
  if (bestRealmReached(state) < sect.minRealm) {
    throw new ActionError('sectRealmTooLow', { sectId, minRealm: sect.minRealm })
  }
  const day = dayOf(state.time)
  const { leftDay } = state.sect
  const untilDay = leftDay === null ? 0 : leftDay + data.config.sects.rejoinCooldownDays
  if (day < untilDay) throw new ActionError('sectRejoinCooldown', { untilDay })
  const generated = generateSectMembers(data, state.rng, {
    sect,
    nextMemberId: state.sect.nextMemberId
  })
  const joined: GameState = {
    ...state,
    rng: generated.rng,
    sect: {
      ...state.sect,
      sectId,
      contribution: 0,
      totalContribution: 0,
      rank: 0,
      joinedDay: day,
      missionDay: day,
      members: generated.members,
      nextMemberId: generated.nextMemberId,
      duels: { day, count: 0 }
    }
  }
  return rollSectMissions(data, joined)
}

/** Rời tông: mất chức vị, cống hiến, đồng môn, nhiệm vụ tông; ghi ngày rời (thời gian chờ). */
export function leaveSect(data: GameData, state: GameState): GameState {
  requireTownIdle(state)
  currentSect(data, state)
  return {
    ...state,
    sect: {
      ...newSectState(),
      leftDay: dayOf(state.time),
      nextMemberId: state.sect.nextMemberId,
      war: { ...state.sect.war, round: null, rivalSectId: null }
    },
    quests: { ...state.quests, sect: [] }
  }
}

/**
 * Nộp nhiệm vụ tông đã đủ tiến độ (thị trấn): + contributionPerCount × số lần cần cống hiến, tung
 * talentPointChance % + 1 điểm thiên phú ngự thú sư. Không cộng bộ đếm questsCompleted (nhiệm vụ tông
 * đã có thưởng riêng, tránh nhận điểm hai lần).
 */
export function claimSectMission(data: GameData, state: GameState, questId: string): GameState {
  requireTownIdle(state)
  currentSect(data, state)
  const mission = state.quests.sect.find((quest) => quest.id === questId)
  if (!mission) throw new ActionError('questNotFound', { questId: String(questId) })
  if (mission.progress < mission.target) {
    throw new ActionError('questNotComplete', {
      questId,
      progress: mission.progress,
      target: mission.target
    })
  }
  const { contributionPerCount, talentPointChance } = data.config.sects.missions
  const [lucky, rng] = rollPercent(state.rng, talentPointChance)
  return {
    ...state,
    rng,
    sect: addSectContribution(state.sect, contributionPerCount * mission.target),
    tamer: addBonusTalentPoints(state.tamer, lucky ? 1 : 0),
    quests: { ...state.quests, sect: state.quests.sect.filter((quest) => quest.id !== questId) }
  }
}

/** Món ở Tàng Bảo Các khớp định danh (vật phẩm gộp chồng hoặc sách đúng loại). */
function findSectShopEntry(sect: SectDef, ref: ItemRef): SectShopEntry | undefined {
  return sect.shop.find((entry) => {
    if ('itemId' in entry) return ref.storage === 'stack' && ref.itemId === entry.itemId
    return (
      ref.storage === 'book' && ref.skillId === entry.skillId && ref.reusable === entry.reusable
    )
  })
}

/** Mua `count` món ở Tàng Bảo Các bằng cống hiến (đủ chức vị tối thiểu của món). */
export function buySectItem(
  data: GameData,
  state: GameState,
  { item, count }: { item: unknown; count: number }
): GameState {
  requireTownIdle(state)
  requireItemCount(count)
  const sect = currentSect(data, state)
  const ref = parseItemRef(data, item)
  const entry = findSectShopEntry(sect, ref)
  // Id để báo lỗi: id vật phẩm hoặc id skill của sách; món riêng (trang bị, tinh thể) không bán ở đây.
  const itemId = 'itemId' in ref ? ref.itemId : 'skillId' in ref ? ref.skillId : ref.storage
  if (!entry || ref.storage === 'instance' || ref.storage === 'crystal') {
    throw new ActionError('notInSectShop', { itemId })
  }
  if (state.sect.rank < entry.minRank) {
    throw new ActionError('sectRankTooLow', { itemId, minRank: entry.minRank })
  }
  const need = entry.cost * count
  const have = state.sect.contribution
  if (need > have) throw new ActionError('notEnoughContribution', { need, have })
  // Bí kíp đổi về có thể thành sticker (docs/rules/skill-stickers.md).
  const { stickers: _stickers, ...received } = receiveByRef(data, state, ref, count)
  return { ...state, ...received, sect: { ...state.sect, contribution: have - need } }
}

/** Một ngày của đệ tử: + cống hiến ngẫu nhiên × (chức vị + 1), lên chức theo cống hiến tổng. */
function memberDay(data: GameData, rng: RngState, member: SectMember): [SectMember, RngState] {
  const { min, max } = data.config.sects.memberDailyContribution
  let gained: number
  ;[gained, rng] = nextInt(rng, min, max)
  const contribution = Math.min(
    Number.MAX_SAFE_INTEGER,
    member.contribution + gained * (member.rank + 1)
  )
  const rank = Math.max(member.rank, sectRankForContribution(data, contribution))
  return [{ ...member, contribution, rank }, rng]
}

/** Tông chủ luôn đứng đầu: chức vị ≥ chức vị cao nhất của đệ tử + masterRankLead. */
function keepMasterAhead(data: GameData, members: SectMember[]): SectMember[] {
  const top = Math.max(0, ...members.filter((m) => !m.isMaster).map((m) => m.rank))
  return members.map((member) => {
    if (!member.isMaster) return member
    const rank = Math.max(member.rank, top + data.config.sects.masterRankLead)
    const contribution = Math.max(member.contribution, sectRankThreshold(data, rank))
    return { ...member, rank, contribution }
  })
}

/**
 * Việc theo ngày (DAILY_TASKS): đệ tử tích cống hiến và lên chức, tông chủ giữ vị trí đầu, nhiệm vụ
 * tông làm mới mỗi refreshDays ngày (thay cả nhiệm vụ chưa nộp).
 */
export function sectDailyTask(
  data: GameData,
  state: GameState,
  _events: DayEvent[],
  day: number
): GameState {
  if (state.sect.sectId === null) return state
  let { rng } = state
  const members: SectMember[] = []
  for (const member of state.sect.members) {
    let next = member
    if (!member.isMaster) [next, rng] = memberDay(data, rng, member)
    members.push(next)
  }
  const next: GameState = {
    ...state,
    rng,
    sect: { ...state.sect, members: keepMasterAhead(data, members) }
  }
  if (day < state.sect.missionDay + data.config.sects.missions.refreshDays) return next
  return rollSectMissions(data, { ...next, sect: { ...next.sect, missionDay: day } })
}

/** Một dòng bảng xếp hạng cống hiến của tông; người chơi có memberId null. */
export interface SectRankingEntry {
  memberId: string | null
  rank: number
  contribution: number
}

/** Bảng xếp hạng cống hiến tổng trong tông (đồng môn + người chơi), cao xuống thấp. */
export function sectRanking(state: Pick<GameState, 'sect'>): SectRankingEntry[] {
  const members: SectRankingEntry[] = state.sect.members.map((m) => ({
    memberId: m.id,
    rank: m.rank,
    contribution: m.contribution
  }))
  const player = {
    memberId: null,
    rank: state.sect.rank,
    contribution: state.sect.totalContribution
  }
  return [...members, player].sort((a, b) => b.contribution - a.contribution)
}
