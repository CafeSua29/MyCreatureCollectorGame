// Dấu ấn trong trận (docs/rules/marks.md): ghi việc dấu ấn cần vào bản ghi trận của quái ta (trúng đòn
// theo hệ, dính debuff, môi trường, vết chí mạng lớn, kẻ hạ gục, quái đã hạ), rồi lúc hết trận tung /
// đếm dấu theo thứ tự cố định (rollBattleMarks). Chỉ quái của người chơi nhận dấu.

import {
  bodyPlanSpeciesId,
  findMark,
  hasMarkData,
  markCounterKey,
  markDefsOfKind
} from '../registries'
import {
  addMarkCounter,
  advanceCountedMark,
  chainMarks,
  clearMarkCounter,
  gainMark,
  grantTriggerTrophies,
  getCurrentHp,
  getMaxHp,
  isFainted,
  markLogEntry,
  marksOfKind,
  noteMarkChanges,
  removeMark,
  rollPartMarkGain,
  type MarkResult
} from '../monster'
import { rollPercent, type Decimal } from '../shared'
import {
  dayOf,
  type BattleOutcome,
  type GameData,
  type MarkBattleRecord,
  type MarkKill,
  type MarkOrigin,
  type MarkSource,
  type Monster,
  type Skill
} from '../model'
import { battleBiome } from '../world'
import { Draft, aliveOnField, effectiveField, log, recordOf, sideOf } from './draft'

// ---------- Ghi trong trận ----------

/** Bản ghi dấu ấn của quái ta (tạo khi cần); quái địch / dữ liệu không có dấu = undefined. */
function markRecordOf(data: GameData, d: Draft, monster: Monster): MarkBattleRecord | undefined {
  if (!hasMarkData(data) || sideOf(d, monster.id) !== 'player') return undefined
  const record = recordOf(d, monster.id)
  return (record.marks ??= {})
}

const bump = (table: Record<string, number> | undefined, key: string): Record<string, number> => ({
  ...table,
  [key]: (table?.[key] ?? 0) + 1
})

/** Quái ta trúng đòn skill của địch (thích nghi theo hệ). */
export function recordMarkHit(data: GameData, d: Draft, target: Monster, skill: Skill): void {
  const record = markRecordOf(data, d, target)
  if (record) record.hitElements = bump(record.hitElements, skill.elementId)
}

/** Quái ta dính debuff (thích nghi theo trạng thái). */
export function recordMarkStatus(
  data: GameData,
  d: Draft,
  monster: Monster,
  statusId: string
): void {
  if (data.statuses[statusId]?.kind !== 'debuff') return
  const record = markRecordOf(data, d, monster)
  if (record) record.statuses = bump(record.statuses, statusId)
}

/**
 * Đòn chí mạng lấy ≥ critScarHpPercent % max HP của quái ta: nhớ bộ phận bị nhắm (không nhắm = bộ
 * phận mặc định) để tung sẹo lúc hết trận.
 */
export function recordMarkCrit(
  data: GameData,
  d: Draft,
  {
    target,
    attacker,
    partId,
    dealt
  }: { target: Monster; attacker: Monster; partId?: string; dealt: Decimal }
): void {
  const record = markRecordOf(data, d, target)
  if (!record) return
  const { critScarHpPercent, critDefaultPartId } = data.config.marks
  if (dealt.times(100).lt(getMaxHp(data, target).times(critScarHpPercent))) return
  const opponentSpeciesId = bodyPlanSpeciesId(data, attacker) ?? undefined
  record.critWounds = [
    ...(record.critWounds ?? []),
    { partId: partId ?? critDefaultPartId, ...(opponentSpeciesId ? { opponentSpeciesId } : {}) }
  ]
}

/**
 * Quái vừa gục vì `source`: quái ta nhớ kẻ hạ gục (ám ảnh); quái ta hạ gục quái địch thì nhớ quái bị
 * hạ (vượt ám ảnh, chiến tích).
 */
export function recordMarkFaint(
  data: GameData,
  d: Draft,
  { target, source, skill }: { target: Monster; source?: Monster; skill?: Skill }
): void {
  if (!hasMarkData(data) || !source || sideOf(d, source.id) === sideOf(d, target.id)) return
  const fallen = markRecordOf(data, d, target)
  if (fallen) {
    const speciesId = bodyPlanSpeciesId(data, source) ?? undefined
    fallen.faintedBy = [
      ...(fallen.faintedBy ?? []),
      { ...(speciesId ? { speciesId } : {}), ...(skill ? { elementId: skill.elementId } : {}) }
    ]
  }
  const killer = markRecordOf(data, d, source)
  if (!killer) return
  const speciesId = bodyPlanSpeciesId(data, target) ?? undefined
  const kill: MarkKill = {
    ...(speciesId ? { speciesId } : {}),
    raceId: target.raceId,
    elementIds: [...target.elementIds],
    boss: d.battle.isBoss && target.bossMultiplier > 1
  }
  killer.kills = [...(killer.kills ?? []), kill]
}

/** Cuối lượt: quái ta trên sân ghi thời tiết / địa hình đang có (thích nghi môi trường). */
export function recordMarkFields(data: GameData, d: Draft): void {
  if (!hasMarkData(data)) return
  const field = effectiveField(data, d)
  const { defaults } = data.config.field
  const ids = [field.weather.id, field.terrain.id].filter(
    (id) => id !== defaults.weather && id !== defaults.terrain
  )
  if (ids.length === 0) return
  for (const { monster } of aliveOnField(data, d, 'player')) {
    const record = markRecordOf(data, d, monster)
    if (!record) continue
    const seen = record.fields ?? []
    const added = ids.filter((id) => !seen.includes(id))
    if (added.length > 0) record.fields = [...seen, ...added]
  }
}

// ---------- Hết trận ----------

/** Bối cảnh tung dấu của một quái lúc hết trận. */
interface MarkStep {
  data: GameData
  d: Draft
  outcome: BattleOutcome
  monster: Monster
  record: MarkBattleRecord
  participated: boolean
  floor: number | null
}

/** Một bước tung / đếm dấu (theo thứ tự trong MARK_STEPS để tất định). */
type MarkStepFn = (step: MarkStep, result: MarkResult) => MarkResult

const originOf = (step: MarkStep, source: MarkSource, opponentSpeciesId?: string): MarkOrigin => ({
  source,
  floor: step.floor,
  ...(opponentSpeciesId ? { opponentSpeciesId } : {})
})

/** Tung một sẹo / đột biến và cập nhật RNG của trận. */
function rollPart(
  step: MarkStep,
  result: MarkResult,
  query: Omit<Parameters<typeof rollPartMarkGain>[2], 'monster'>
): MarkResult {
  let rolled: MarkResult
  ;[rolled, step.d.rng] = rollPartMarkGain(step.data, step.d.rng, {
    ...query,
    monster: result.monster
  })
  return { monster: rolled.monster, changes: [...result.changes, ...rolled.changes] }
}

/** Bộ phận bị phá: tung đột biến, trượt thì tung sẹo ở bộ phận đó. */
const brokenPartMarks: MarkStepFn = (step, result) => {
  const { mutationOnBreakPercent, scarOnBreakPercent } = step.data.config.marks
  for (const partId of step.d.battle.records[step.monster.id]?.brokenParts ?? []) {
    const origin = originOf(step, 'partBreak')
    const mutated = rollPart(step, result, {
      kind: 'mutation',
      partId,
      chance: mutationOnBreakPercent,
      origin
    })
    result =
      mutated.changes.length > result.changes.length
        ? mutated
        : rollPart(step, result, { kind: 'scar', partId, chance: scarOnBreakPercent, origin })
  }
  return result
}

/** Đòn chí mạng lớn: sẹo ở bộ phận trúng. */
const critMarks: MarkStepFn = (step, result) => {
  for (const wound of step.record.critWounds ?? []) {
    result = rollPart(step, result, {
      kind: 'scar',
      partId: wound.partId,
      chance: step.data.config.marks.scarOnCritPercent,
      origin: originOf(step, 'crit', wound.opponentSpeciesId)
    })
  }
  return result
}

/** Gục trong trận (một lần mỗi trận): sẹo ở bộ phận ngẫu nhiên. */
const faintMarks: MarkStepFn = (step, result) => {
  if ((step.d.battle.records[step.monster.id]?.deaths ?? 0) === 0) return result
  return rollPart(step, result, {
    kind: 'scar',
    chance: step.data.config.marks.scarOnFaintPercent,
    origin: originOf(step, 'faint', step.record.faintedBy?.at(-1)?.speciesId)
  })
}

/** Trạng thái nặng còn lúc hết trận: sẹo của trạng thái. */
const statusMarks: MarkStepFn = (step, result) => {
  for (const status of step.monster.statuses) {
    result = rollPart(step, result, {
      kind: 'scar',
      scar: { statusId: status.statusId },
      chance: step.data.config.marks.scarOnStatusPercent,
      origin: originOf(step, 'status')
    })
  }
  return result
}

/** Thắng khi suýt chết (đã ra sân, còn sống, ≤ nearDeathHpPercent % máu): đột biến. */
const nearDeathMarks: MarkStepFn = (step, result) => {
  const { data, monster } = step
  if (step.outcome !== 'won' || !step.participated || isFainted(data, monster)) return result
  const { nearDeathHpPercent, mutationOnNearDeathPercent } = data.config.marks
  const hp = getCurrentHp(data, monster).times(100)
  if (hp.gt(getMaxHp(data, monster).times(nearDeathHpPercent))) return result
  return rollPart(step, result, {
    kind: 'mutation',
    chance: mutationOnNearDeathPercent,
    origin: originOf(step, 'nearDeath')
  })
}

/** Hiểm địa dấu ấn của map (đã ra sân; độ kiếp không đánh trên map): đột biến. */
const hazardMarks: MarkStepFn = (step, result) => {
  if (!step.participated || step.d.battle.tribulation) return result
  const chance = battleBiome(step.data, step.d, step.d.battle).markHazardPercent ?? 0
  return rollPart(step, result, { kind: 'mutation', chance, origin: originOf(step, 'hazard') })
}

/** Thích nghi: cộng bộ đếm theo việc trong trận (không RNG). */
const adaptationMarks: MarkStepFn = (step, result) => {
  const { data, record } = step
  const amounts: Record<string, Readonly<Record<string, number>>> = {
    element: record.hitElements ?? {},
    status: record.statuses ?? {},
    weather: Object.fromEntries((record.fields ?? []).map((id) => [id, 1])),
    terrain: Object.fromEntries((record.fields ?? []).map((id) => [id, 1]))
  }
  for (const def of markDefsOfKind(data, 'adaptation')) {
    for (const [targetId, amount] of Object.entries(amounts[def.target])) {
      result = chainMarks(result, (monster) =>
        advanceCountedMark(data, monster, {
          def,
          targetId,
          amount,
          origin: originOf(step, 'adaptation')
        })
      )
    }
  }
  return result
}

/** Đối tượng (loài / hệ) của kẻ hạ gục theo loại đối tượng của ám ảnh. */
const foeTargets = (step: MarkStep, target: 'species' | 'element'): string[] =>
  (step.record.faintedBy ?? []).flatMap((foe) => {
    const id = target === 'species' ? foe.speciesId : foe.elementId
    return id === undefined ? [] : [id]
  })

/** Trận có gặp đối tượng (quái địch là loài / có hệ đó) không. */
function metTarget(step: MarkStep, target: 'species' | 'element', id: string): boolean {
  return step.d.battle.enemies.some((enemy) =>
    target === 'species'
      ? bodyPlanSpeciesId(step.data, enemy) === id
      : enemy.elementIds.includes(id)
  )
}

/**
 * Ám ảnh: mỗi lần gục dưới tay loài / hệ cộng bộ đếm, đủ traumaThreshold thì nhận (đã có thì lên
 * cấp) và đếm lại; thắng trận không gặp lại thì bộ đếm giảm 1 (không RNG).
 */
const traumaMarks: MarkStepFn = (step, result) => {
  const { data } = step
  const { traumaThreshold } = data.config.marks
  for (const def of markDefsOfKind(data, 'trauma')) {
    const prefix = `${def.id}:`
    const hits = foeTargets(step, def.target)
    if (step.outcome === 'won') {
      for (const key of Object.keys(result.monster.markCounters)) {
        const targetId = key.slice(prefix.length)
        if (
          !key.startsWith(prefix) ||
          hits.includes(targetId) ||
          metTarget(step, def.target, targetId)
        ) {
          continue
        }
        result = { ...result, monster: addMarkCounter(result.monster, key, -1) }
      }
    }
    for (const targetId of hits) {
      const key = markCounterKey(def.id, targetId)
      const counted = addMarkCounter(result.monster, key, 1)
      if ((counted.markCounters[key] ?? 0) < traumaThreshold) {
        result = { ...result, monster: counted }
        continue
      }
      const origin = originOf(step, 'trauma', def.target === 'species' ? targetId : undefined)
      result = chainMarks({ ...result, monster: clearMarkCounter(counted, key) }, (monster) =>
        gainMark(data, monster, { markId: def.id, targetId, origin })
      )
    }
  }
  return result
}

/** Quái bị hạ khớp đối tượng (loài / hệ) không. */
const killMatches = (kill: MarkKill, target: 'species' | 'element', id: string): boolean =>
  target === 'species' ? kill.speciesId === id : kill.elementIds.includes(id)

/**
 * Vượt qua ám ảnh: hạ đúng thứ đang sợ đủ resolveThreshold lần thì xóa ám ảnh, nhận chiến tích
 * resolveInto cùng đối tượng.
 */
const resolveMarks: MarkStepFn = (step, result) => {
  const { data } = step
  const kills = step.record.kills ?? []
  if (kills.length === 0) return result
  for (const { mark, def } of marksOfKind(data, result.monster, 'trauma')) {
    const targetId = mark.targetId
    if (targetId === undefined) continue
    const count = kills.filter((kill) => killMatches(kill, def.target, targetId)).length
    if (count === 0) continue
    const total = (mark.resolveCount ?? 0) + count
    if (total < data.config.marks.resolveThreshold) {
      const marks = result.monster.marks.map((each) =>
        each === mark ? { ...each, resolveCount: total } : each
      )
      result = { ...result, monster: { ...result.monster, marks } }
      continue
    }
    const origin = originOf(step, 'resolve', def.target === 'species' ? targetId : undefined)
    result = chainMarks(result, (monster) => removeMark(monster, mark, 'resolved'))
    result = chainMarks(result, (monster) =>
      gainMark(data, monster, { markId: def.resolveInto, targetId, origin })
    )
  }
  return result
}

/** Nhận chiến tích theo cách nhận (không theo đối tượng) `times` lần. */
function grantTrophies(
  step: MarkStep,
  result: MarkResult,
  options: { trigger: 'bossKill' | 'worldBoss'; times: number; origin: MarkOrigin }
): MarkResult {
  return chainMarks(result, (monster) => grantTriggerTrophies(step.data, monster, options))
}

/** Chiến tích: hạ boss (đòn hạ gục), hạ đủ quái một race, ra sân thắng boss thế giới. */
const trophyMarks: MarkStepFn = (step, result) => {
  const { data } = step
  const kills = step.record.kills ?? []
  const bosses = kills.filter((kill) => kill.boss)
  if (bosses.length > 0 && !step.d.battle.tribulation) {
    const origin = originOf(step, 'bossKill', bosses[0].speciesId)
    result = grantTrophies(step, result, { trigger: 'bossKill', times: bosses.length, origin })
  }
  for (const def of markDefsOfKind(data, 'trophy')) {
    if (def.trigger !== 'raceKills' || def.threshold === undefined) continue
    const threshold = def.threshold
    for (const kill of kills) {
      result = chainMarks(result, (monster) =>
        advanceCountedMark(data, monster, {
          def: { ...def, threshold },
          targetId: kill.raceId,
          amount: 1,
          origin: originOf(step, 'raceKills', kill.speciesId)
        })
      )
    }
  }
  const worldBossWon = step.d.battle.special?.kind === 'worldBoss' && step.outcome === 'won'
  if (worldBossWon && step.participated) {
    result = grantTrophies(step, result, {
      trigger: 'worldBoss',
      times: 1,
      origin: originOf(step, 'worldBoss')
    })
  }
  return result
}

/**
 * Sẹo chai thành sẹo chiến: mỗi trận thắng đã ra sân + 1 trận cho mọi sẹo có từ trước trận; đủ scarHardenBattles thì
 * mỗi trận thắng tung scarHardenPercent % đổi sẹo thành mục hardensInto (cùng bộ phận).
 */
const hardenMarks: MarkStepFn = (step, result) => {
  if (step.outcome !== 'won' || !step.participated) return result
  const { data } = step
  const { scarHardenBattles, scarHardenPercent } = data.config.marks
  for (const { mark, def } of marksOfKind(data, result.monster, 'scar')) {
    // Sẹo vừa nhận trong chính trận này chưa tính trận này.
    if (!findMark(step.monster, mark.markId)) continue
    const winBattles = (mark.winBattles ?? 0) + 1
    const counted = { ...mark, winBattles }
    result = {
      ...result,
      monster: {
        ...result.monster,
        marks: result.monster.marks.map((each) => (each === mark ? counted : each))
      }
    }
    if (def.hardensInto === undefined || winBattles < scarHardenBattles) continue
    let hardened: boolean
    ;[hardened, step.d.rng] = rollPercent(step.d.rng, scarHardenPercent)
    if (!hardened) continue
    const into = def.hardensInto
    result = chainMarks(result, (monster) => removeMark(monster, counted, 'hardened'))
    result = chainMarks(result, (monster) =>
      gainMark(data, monster, { markId: into, origin: originOf(step, 'hardened') })
    )
  }
  return result
}

/** Các bước theo thứ tự cố định (tất định). */
const MARK_STEPS: readonly MarkStepFn[] = [
  brokenPartMarks,
  critMarks,
  faintMarks,
  statusMarks,
  nearDeathMarks,
  hazardMarks,
  adaptationMarks,
  traumaMarks,
  resolveMarks,
  trophyMarks,
  hardenMarks
]

/**
 * Hết trận (mọi kết quả): mỗi quái ta có bản ghi trong trận tung / đếm dấu theo MARK_STEPS; log
 * markGained / markRemoved và ghi lý lịch. Dữ liệu không có mục dấu thì không làm gì.
 */
export function rollBattleMarks(data: GameData, d: Draft, outcome: BattleOutcome): void {
  if (!hasMarkData(data)) return
  const floor = d.battle.floor >= 1 ? d.battle.floor : null
  const day = dayOf(d.time)
  d.party = d.party.map((monster) => {
    const battleRecord = d.battle.records[monster.id]
    if (!battleRecord) return monster
    const step: MarkStep = {
      data,
      d,
      outcome,
      monster,
      record: battleRecord.marks ?? {},
      participated: d.battle.participants.includes(monster.id),
      floor
    }
    const result = MARK_STEPS.reduce<MarkResult>((current, run) => run(step, current), {
      monster,
      changes: []
    })
    return finishChanges(data, d, result, day)
  })
}

/** Log và lý lịch cho các thay đổi dấu của một quái. */
function finishChanges(data: GameData, d: Draft, result: MarkResult, day: number): Monster {
  for (const change of result.changes) log(d, markLogEntry(result.monster.id, change))
  return noteMarkChanges(data, result.monster, result.changes, day)
}

/** Độ kiếp thành công (settleTribulation): quái độ kiếp nhận chiến tích `tribulation`. */
export function grantTribulationTrophy(data: GameData, d: Draft, monsterId: string): void {
  if (!hasMarkData(data)) return
  const floor = d.battle.floor >= 1 ? d.battle.floor : null
  const origin: MarkOrigin = { source: 'tribulation', floor }
  d.party = d.party.map((monster) =>
    monster.id === monsterId
      ? finishChanges(
          data,
          d,
          grantTriggerTrophies(data, monster, { trigger: 'tribulation', times: 1, origin }),
          dayOf(d.time)
        )
      : monster
  )
}
