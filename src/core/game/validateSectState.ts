// Kiểm tra tông môn trong save (docs/rules/sects.md): GameState.sect, nhiệm vụ tông
// (quests.sect, cùng kiểu với nhiệm vụ đang nhận ở validateQuestState), trận tông.

import type { GameData } from '../model'
import { asObject, checkInteger } from '../shared'

/** Một đồng môn: id "m<số>" < nextMemberId, tên / lớp NPC có thật, chức vị / cống hiến nguyên ≥ 0. */
function checkMember(
  data: GameData,
  value: unknown,
  { at, nextMemberId }: { at: string; nextMemberId: number },
  issues: string[]
): void {
  const member = asObject(value)
  if (!member) {
    issues.push(`${at} phải là object`)
    return
  }
  const id = member.id
  if (typeof id !== 'string' || !/^m\d+$/.test(id) || Number(id.slice(1)) >= nextMemberId) {
    issues.push(`${at}.id phải có dạng "m<số>" nhỏ hơn nextMemberId`)
  }
  if (typeof member.nameId !== 'string' || !Object.hasOwn(data.npcNames, member.nameId)) {
    issues.push(`${at}.nameId: tên NPC không tồn tại "${String(member.nameId)}"`)
  }
  if (typeof member.classId !== 'string' || !Object.hasOwn(data.trainers, member.classId)) {
    issues.push(`${at}.classId: lớp NPC không tồn tại "${String(member.classId)}"`)
  }
  issues.push(...checkInteger(member.rank, `${at}.rank`, 0))
  issues.push(...checkInteger(member.contribution, `${at}.contribution`, 0))
  if (typeof member.isMaster !== 'boolean') issues.push(`${at}.isMaster phải là boolean`)
}

/** Tông chiến: kỳ ≥ −1, vòng null hoặc trong số vòng, đang dự thì có tông đối địch và ở thị trấn. */
function checkWar(
  data: GameData,
  value: unknown,
  { inTown, inSect }: { inTown: boolean; inSect: boolean },
  issues: string[]
): void {
  const war = asObject(value)
  if (!war) {
    issues.push('sect.war phải là object { lastPeriod, round, rivalSectId }')
    return
  }
  issues.push(...checkInteger(war.lastPeriod, 'sect.war.lastPeriod', -1))
  if (war.round === null) {
    if (war.rivalSectId !== null) issues.push('sect.war.rivalSectId: không dự tông chiến thì null')
    return
  }
  issues.push(...checkInteger(war.round, 'sect.war.round', 0))
  const rounds = data.config.sects.war.rounds.length
  if (typeof war.round === 'number' && war.round >= rounds) {
    issues.push(`sect.war.round phải < ${rounds}`)
  }
  if (typeof war.rivalSectId !== 'string' || !Object.hasOwn(data.sects, war.rivalSectId)) {
    issues.push(`sect.war.rivalSectId: tông không tồn tại "${String(war.rivalSectId)}"`)
  }
  if (!inSect) issues.push('sect.war: chưa gia nhập tông thì không dự tông chiến')
  if (!inTown) issues.push('sect.war: đang dự tông chiến thì phải ở thị trấn')
}

/**
 * GameState.sect: tông có thật hoặc null (khi đó không cống hiến, chức vị, đồng môn, nhiệm vụ tông);
 * số nguyên ≥ 0, cống hiến tiêu được ≤ tổng; đồng môn hợp lệ, đúng một tông chủ khi ở tông.
 */
export function validateSectState(data: GameData, state: Record<string, unknown>): string[] {
  const sect = asObject(state.sect)
  if (!sect) return ['sect phải là object']
  const issues: string[] = []
  const inSect = sect.sectId !== null
  if (inSect && (typeof sect.sectId !== 'string' || !Object.hasOwn(data.sects, sect.sectId))) {
    issues.push(`sect.sectId: tông môn không tồn tại "${String(sect.sectId)}"`)
  }
  for (const field of ['contribution', 'totalContribution', 'rank', 'missionDay'] as const) {
    issues.push(...checkInteger(sect[field], `sect.${field}`, 0))
  }
  issues.push(...checkInteger(sect.nextMemberId, 'sect.nextMemberId', 1))
  for (const field of ['joinedDay', 'leftDay'] as const) {
    if (sect[field] !== null) issues.push(...checkInteger(sect[field], `sect.${field}`, 0))
  }
  if (
    typeof sect.contribution === 'number' &&
    typeof sect.totalContribution === 'number' &&
    sect.contribution > sect.totalContribution
  ) {
    issues.push('sect.contribution không được vượt totalContribution')
  }
  const duels = asObject(sect.duels)
  if (!duels) issues.push('sect.duels phải là object { day, count }')
  else {
    issues.push(...checkInteger(duels.day, 'sect.duels.day', 0))
    issues.push(...checkInteger(duels.count, 'sect.duels.count', 0))
  }
  const members = Array.isArray(sect.members) ? sect.members : null
  if (!members) issues.push('sect.members phải là danh sách')
  const nextMemberId = typeof sect.nextMemberId === 'number' ? sect.nextMemberId : 0
  members?.forEach((member, i) =>
    checkMember(data, member, { at: `sect.members[${i}]`, nextMemberId }, issues)
  )
  const ids = (members ?? []).map((member) => asObject(member)?.id)
  if (new Set(ids).size !== ids.length) issues.push('sect.members: id đồng môn bị trùng')
  const masters = (members ?? []).filter((member) => asObject(member)?.isMaster === true).length
  const sectMissions = asObject(state.quests)?.sect
  if (inSect && masters !== 1) issues.push('sect.members: phải có đúng một tông chủ')
  if (!inSect) {
    if (sect.contribution !== 0 || sect.totalContribution !== 0 || sect.rank !== 0) {
      issues.push('sect: chưa gia nhập tông thì cống hiến / chức vị phải 0')
    }
    if ((members ?? []).length > 0) issues.push('sect.members: chưa gia nhập tông thì rỗng')
    if (Array.isArray(sectMissions) && sectMissions.length > 0) {
      issues.push('quests.sect: chưa gia nhập tông thì không có nhiệm vụ tông')
    }
  }
  checkWar(data, sect.war, { inTown: asObject(state.location)?.type === 'town', inSect }, issues)
  return issues
}

/**
 * battle.trainer của trận tông: đồng môn có thật (luận võ, thi thăng chức), tên NPC có thật, trận
 * tông chiến chưa kết thúc thì đang dự tông chiến.
 */
export function checkSectBattle(
  data: GameData,
  { trainer, battle, state }: Record<'trainer' | 'battle' | 'state', Record<string, unknown>>,
  issues: string[]
): void {
  const { mode, memberId, npcNameId } = trainer
  const sect = asObject(state.sect)
  if (mode === 'sectWar' && battle.phase !== 'ended' && asObject(sect?.war)?.round === null) {
    issues.push('battle.trainer: trận tông chiến nhưng không đang dự tông chiến')
  }
  const members = Array.isArray(sect?.members) ? sect.members : []
  if (memberId !== undefined && !members.some((m) => asObject(m)?.id === memberId)) {
    issues.push(`battle.trainer.memberId: đồng môn không tồn tại "${String(memberId)}"`)
  }
  if ((mode === 'sectDuel' || mode === 'sectPromotion') && memberId === undefined) {
    issues.push('battle.trainer: trận luận võ / thi thăng chức phải có memberId')
  }
  if (
    npcNameId !== undefined &&
    (typeof npcNameId !== 'string' || !Object.hasOwn(data.npcNames, npcNameId))
  ) {
    issues.push(`battle.trainer.npcNameId: tên NPC không tồn tại "${String(npcNameId)}"`)
  }
}
