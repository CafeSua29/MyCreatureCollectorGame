// Dựng race đủ trường từ nhóm race (raceGroups.json) và race thô (races.json), mục "Race" ở
// stats-traits.md: race chỉ ghi phần khác nhóm; trait = trait riêng của race rồi trait của nhóm;
// breedsWith mở rộng thành danh sách race (cùng nhóm, nhóm breed được, race / nhóm ghi thêm).

import type { Race, RaceGroup, RawRace } from '../model'
import { checkKnownFields, fieldList } from './checks'

const RAW_RACE_FIELDS = fieldList<RawRace>({
  id: true,
  groupId: true,
  statBias: true,
  growth: true,
  traitIds: true,
  breedsWith: true,
  partnerSkillId: true,
  humanForm: true,
  frenzyProne: true,
  weightKg: true,
  bodyParts: true,
  weakPoints: true
})

const GROUP_FIELDS = fieldList<RaceGroup>({
  id: true,
  statBias: true,
  growth: true,
  traitIds: true,
  breedsWith: true,
  partnerSkillId: true,
  humanForm: true,
  frenzyProne: true,
  weightKg: true,
  bodyParts: true,
  weakPoints: true
})

/**
 * Nhóm: trường đã biết, breedsWith là nhóm tồn tại; race: breedsWith ghi thêm là race / nhóm tồn tại.
 * Chỉ số, trait, kỹ năng đồng hành của nhóm được kiểm tra qua race đã trộn (validateContent).
 */
function checkGroupsAndExtras(
  rawRaces: readonly RawRace[],
  { groups, issues }: { groups: Record<string, RaceGroup>; issues: string[] }
): void {
  for (const group of Object.values(groups)) {
    const where = `Nhóm race "${group.id}"`
    checkKnownFields(group, GROUP_FIELDS, where, 'nhóm race', issues)
    if (!Array.isArray(group.breedsWith)) issues.push(`${where}: breedsWith phải là danh sách`)
    else {
      for (const id of group.breedsWith) {
        if (!Object.hasOwn(groups, id))
          issues.push(`${where}: breedsWith có nhóm không tồn tại "${id}"`)
      }
    }
    if (!Array.isArray(group.traitIds)) issues.push(`${where}: traitIds phải là danh sách`)
  }
  const raceIds = new Set(rawRaces.map((race) => race.id))
  for (const race of rawRaces) {
    for (const id of race.breedsWith ?? []) {
      if (!raceIds.has(id) && !Object.hasOwn(groups, id)) {
        issues.push(`Race "${race.id}": breedsWith có race / nhóm không tồn tại "${id}"`)
      }
    }
  }
}

/** Hai nhóm breed chéo được (xét cả hai chiều; cùng nhóm luôn được). */
function groupsBreed(groups: Record<string, RaceGroup>, a: string, b: string): boolean {
  return (
    a === b ||
    groups[a]?.breedsWith.includes(b) === true ||
    groups[b]?.breedsWith.includes(a) === true
  )
}

/**
 * Race đủ trường theo id. Race thiếu nhóm / nhóm không tồn tại / trường lạ ghi vào `issues` (bỏ qua
 * race đó để các bước sau không crash; validateContent kiểm tra tiếp phần còn lại).
 */
export function resolveRaces(
  rawRaces: readonly RawRace[],
  { groups, issues }: { groups: Record<string, RaceGroup>; issues: string[] }
): Record<string, Race> {
  const valid = rawRaces.filter((race) => {
    const where = `Race "${String(race.id)}"`
    checkKnownFields(race, RAW_RACE_FIELDS, where, 'race', issues)
    if (Object.hasOwn(groups, race.id)) issues.push(`${where}: trùng id với nhóm race`)
    if (typeof race.groupId !== 'string' || !Object.hasOwn(groups, race.groupId)) {
      issues.push(`${where}: groupId không phải nhóm race "${String(race.groupId)}"`)
      return false
    }
    return true
  })
  checkGroupsAndExtras(rawRaces, { groups, issues })
  const races: Record<string, Race> = {}
  for (const raw of valid) {
    const group = groups[raw.groupId]
    const extra = raw.breedsWith ?? []
    const breedsWith = valid
      .filter(
        (other) =>
          groupsBreed(groups, raw.groupId, other.groupId) ||
          extra.includes(other.id) ||
          extra.includes(other.groupId) ||
          (other.breedsWith ?? []).includes(raw.id) ||
          (other.breedsWith ?? []).includes(raw.groupId)
      )
      .map((other) => other.id)
    races[raw.id] = {
      id: raw.id,
      groupId: raw.groupId,
      statBias: raw.statBias ?? group.statBias,
      growth: raw.growth ?? group.growth,
      breedsWith,
      traitIds: [
        ...(raw.traitIds ?? []),
        ...group.traitIds.filter((id) => !(raw.traitIds ?? []).includes(id))
      ],
      partnerSkillId: raw.partnerSkillId ?? group.partnerSkillId,
      humanForm: raw.humanForm ?? group.humanForm,
      ...((raw.frenzyProne ?? group.frenzyProne) !== undefined
        ? { frenzyProne: raw.frenzyProne ?? group.frenzyProne }
        : {}),
      ...((raw.weightKg ?? group.weightKg) !== undefined
        ? { weightKg: raw.weightKg ?? group.weightKg }
        : {}),
      ...((raw.bodyParts ?? group.bodyParts) !== undefined
        ? { bodyParts: raw.bodyParts ?? group.bodyParts }
        : {}),
      ...((raw.weakPoints ?? group.weakPoints) !== undefined
        ? { weakPoints: raw.weakPoints ?? group.weakPoints }
        : {})
    }
  }
  return races
}
