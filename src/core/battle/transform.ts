// Biến hình trong trận (mục "Biến hình trong trận" ở transformation.md): luật chung (vật phẩm chìa
// khóa, mỗi phe mỗi loại một lần, mỗi quái một biến hình mỗi trận), bước biến hình của lượt (sau đổi
// quái, theo tốc độ), Primal tự biến khi ra sân, Dynamax hết lượt / rời sân (giữ % máu), trả lại
// dạng thường khi hết trận, skill thật khi đang biến hình (chiêu Max, Tera Blast, power tối thiểu
// của Tera) và STAB theo Tera. Phần riêng từng loại ở transformHandlers.ts.

import { activeTransform, autoMegaForm, getMaxHp, isFainted } from '../monster'
import { hasTrialRule, traitStabMultiplier } from '../registries'
import { hasKeyItemFor } from '../inventory'
import { battleBiome } from '../world'
import {
  ActionError,
  malformedAction,
  maxBig,
  nextFloat,
  pick,
  pickWeighted,
  rollPercent,
  type Decimal
} from '../shared'
import {
  STELLAR,
  TRANSFORM_KINDS,
  type BattleCommand,
  type BattleSide,
  type GameData,
  type Monster,
  type MonsterBattleContext,
  type Skill,
  type TransformFailReason,
  type TransformKind
} from '../model'
import { Draft, aliveOnField, battleStats, findMonster, log, sideOf, slotsOf } from './draft'
import { compareSpeed } from './rooms'
import { maxMoveFor } from './maxMoves'
import { TRANSFORMS, type TransformContext } from './transformHandlers'
import { activeMergeLeads, unmerge } from './merge'
import { emitTraitEvent } from './eventQueue'
import { changeBattleForm, currentFormId } from './battleForms'

/** Một yêu cầu biến hình trong lượt. */
export interface TransformRequest {
  side: BattleSide
  monsterId: string
  kind: TransformKind
  formSpeciesId?: string
}

/** Trận ở power spot (Dynamax dùng được): trận boss hoặc map có powerSpot. */
const isPowerSpot = (data: GameData, d: Draft): boolean =>
  d.battle.isBoss || battleBiome(data, d, d.battle).powerSpot === true

function contextOf(data: GameData, d: Draft, side: BattleSide, monster: Monster): TransformContext {
  return {
    data,
    monster,
    isPlayer: side === 'player',
    teraOrbCharged: d.teraOrbCharged,
    powerSpot: isPowerSpot(data, d)
  }
}

/**
 * NPC được biến hình (lớp có `transforms`, docs/rules/trainers.md): coi như có đủ vật phẩm chìa khóa
 * (như người chơi đã qua các đạo quán có vật phẩm chìa khóa), kể cả Vòng Z.
 */
export const trainerCanTransform = (data: GameData, d: Draft): boolean =>
  d.battle.trainer !== null && data.trainers[d.battle.trainer.classId].transforms

/**
 * Lý do quái không biến hình loại `kind` được (null = được): loại cần vật phẩm chìa khóa thì quái
 * người chơi phải có trong túi, quái hoang / boss không dùng được (không có túi đồ; chủ project chốt),
 * quái của NPC biến hình được thì có;
 * phe chưa dùng loại này; quái chưa biến hình trong trận; điều kiện riêng của loại.
 */
export function transformBlocker(
  data: GameData,
  d: Draft,
  { side, monster, kind }: { side: BattleSide; monster: Monster; kind: TransformKind }
): TransformFailReason | null {
  // Độ kiếp chỉ cho Hiện nguyên hình (docs/rules/awakening.md).
  if (d.battle.tribulation && !TRANSFORMS[kind].allowedInTribulation) return 'tribulation'
  if (hasTrialRule(data, d.battle.trial?.rules, 'noTransforms')) return 'trialRule'
  const needsKeyItem = data.config.transform.keyItems[kind] !== undefined
  const hasKeyItem =
    side === 'enemy' ? trainerCanTransform(data, d) : hasKeyItemFor(data, d.inventory, kind)
  if (needsKeyItem && !hasKeyItem) return 'noKeyItem'
  if (d.battle.transformsUsed[side].includes(kind)) return 'alreadyUsedBySide'
  if (monster.battleTransform) return 'monsterAlreadyTransformed'
  return TRANSFORMS[kind].unavailable(contextOf(data, d, side, monster))
}

/** Dạng chọn được của loại (Mega X / Y); rỗng = loại không chọn dạng. */
export function transformForms(
  data: GameData,
  d: Draft,
  { side, monster, kind }: { side: BattleSide; monster: Monster; kind: TransformKind }
): string[] {
  return TRANSFORMS[kind].forms(contextOf(data, d, side, monster))
}

/**
 * Kiểm tra lệnh biến hình của người chơi trong lượt (trước khi đụng state): đủ điều kiện, hai quái
 * không cùng xin một loại, dạng chọn đúng (bắt buộc khi có nhiều dạng). Trả về các yêu cầu đã chốt.
 */
export function validateTransformCommands(
  data: GameData,
  d: Draft,
  commands: readonly BattleCommand[]
): TransformRequest[] {
  const requests: TransformRequest[] = []
  for (const command of commands) {
    if (command.kind !== 'skill' || command.transform === undefined) {
      if (command.kind === 'skill' && command.formSpeciesId !== undefined) {
        throw malformedAction('formSpeciesId chỉ dùng kèm transform')
      }
      continue
    }
    const { transform: kind } = command
    if (!Object.hasOwn(TRANSFORMS, kind) || !TRANSFORMS[kind].bySkillCommand) {
      throw malformedAction(`loại biến hình lạ: ${kind}`)
    }
    if (requests.some((request) => request.kind === kind)) {
      throw new ActionError('transformUnavailable', { kind, reason: 'alreadyUsedBySide' })
    }
    const monster = findMonster(d, slotsOf(d.battle, 'player')[command.slot] as string)
    const reason = transformBlocker(data, d, { side: 'player', monster, kind })
    if (reason) throw new ActionError('transformUnavailable', { kind, reason })
    const forms = transformForms(data, d, { side: 'player', monster, kind })
    const formSpeciesId = chooseForm(forms, command.formSpeciesId)
    requests.push({
      side: 'player',
      monsterId: monster.id,
      kind,
      ...(formSpeciesId ? { formSpeciesId } : {})
    })
  }
  return requests
}

/** Dạng của lệnh: một dạng thì tự chọn, nhiều dạng thì lệnh phải ghi đúng một dạng trong số đó. */
function chooseForm(forms: readonly string[], requested: string | undefined): string | undefined {
  if (forms.length === 0) {
    if (requested !== undefined) throw malformedAction('loại biến hình này không chọn dạng')
    return undefined
  }
  if (requested === undefined) {
    if (forms.length > 1) throw malformedAction(`cần chọn dạng: ${forms.join(', ')}`)
    return forms[0]
  }
  if (!forms.includes(requested)) throw malformedAction(`dạng không dùng được: ${requested}`)
  return requested
}

/**
 * Giữ tỉ lệ máu khi max HP đổi (Dynamax bắt đầu / kết thúc): máu đã mất theo tỉ lệ, làm tròn xuống
 * (có lợi cho quái); còn sống thì còn ít nhất 1 máu, đã gục thì vẫn gục.
 */
function rescaleDamage(
  monster: Monster,
  { before, after, alive }: { before: Decimal; after: Decimal; alive: boolean }
): void {
  if (!alive) {
    monster.damageTaken = after
    return
  }
  const scaled = monster.damageTaken.times(after).div(before).floor()
  monster.damageTaken = maxBig(0, scaled.gte(after) ? after.minus(1) : scaled)
}

/** Đổi biến hình của quái mà giữ tỉ lệ máu (max HP có thể đổi theo Dynamax). */
function changeKeepingHpRatio(data: GameData, monster: Monster, change: () => void): void {
  const before = getMaxHp(data, monster)
  const alive = !isFainted(data, monster)
  change()
  const after = getMaxHp(data, monster)
  if (!after.eq(before)) rescaleDamage(monster, { before, after, alive })
}

/**
 * Dạng Tera theo loài (Ogerpon → dạng Tera của mặt nạ, Terapagos Terastal → Stellar; như Pokémon:
 * đổi dạng hẳn, ability theo dạng mới): giữ tới hết trận.
 */
function teraForm(data: GameData, d: Draft, monster: Monster): void {
  const species = data.species[currentFormId(monster)]
  if (species?.kind !== 'normal' || species.teraFormId === undefined) return
  changeBattleForm(data, d, monster, { speciesId: species.teraFormId })
}

/**
 * Áp biến hình lên quái: dạng / hệ mới (hệ gốc thật giữ để trả lại khi hết trận; quái đang bị đổi
 * hệ trong trận thì phần trả lại khi rời sân cũng thành hệ mới), tính lượt của phe (trừ đá tự kích
 * hoạt kiểu Primal), Tera Orb hết sạc, log.
 */
export function applyTransform(
  data: GameData,
  d: Draft,
  request: TransformRequest & { countsForSide?: boolean }
): void {
  const monster = findMonster(d, request.monsterId)
  const { side, kind } = request
  const start = TRANSFORMS[kind].start(contextOf(data, d, side, monster), request.formSpeciesId)
  const identity = d.battle.volatiles[monster.id]?.originalIdentity
  const transform = {
    ...start.transform,
    originalElementIds: [...(identity?.elementIds ?? start.transform.originalElementIds)]
  }
  if (identity) identity.elementIds = [...start.elementIds]
  changeKeepingHpRatio(data, monster, () => {
    monster.battleTransform = transform
    monster.elementIds = [...start.elementIds]
  })
  if (request.countsForSide !== false) d.battle.transformsUsed[side].push(kind)
  if (kind === 'tera' && side === 'player') d.teraOrbCharged = false
  if (kind === 'tera') teraForm(data, d, monster)
  // Embody Aspect / Teraform Zero phản ứng khi quái biến hình (sau khi đã đổi dạng Tera).
  emitTraitEvent(d, { type: 'transformed', subjectId: monster.id })
  log(d, {
    type: 'transformed',
    monsterId: monster.id,
    kind,
    ...(transform.formSpeciesId ? { formSpeciesId: transform.formSpeciesId } : {}),
    ...(transform.teraElementId ? { teraElementId: transform.teraElementId } : {})
  })
}

/**
 * Biến hình hết tác dụng giữa trận (Dynamax hết lượt / rời sân): giữ tỉ lệ máu, vẫn tính đã dùng.
 * Hợp thể thì tách (`placePartner`: quái phụ về ô cũ, chỉ khi hết lượt; battle/merge.ts).
 */
function endTransform(
  data: GameData,
  d: Draft,
  monster: Monster,
  { placePartner }: { placePartner: boolean }
): void {
  const transform = activeTransform(monster)
  if (!transform) return
  if (transform.kind === 'merge') return unmerge(data, d, monster, { placePartner })
  changeKeepingHpRatio(data, monster, () => {
    const { turnsLeft: _turnsLeft, ...rest } = transform
    monster.battleTransform = { ...rest, ended: true }
  })
  log(d, { type: 'transformEnded', monsterId: monster.id, kind: transform.kind })
}

/** Quái rời sân (đổi quái, rút về, gục, bị bắt): biến hình loại hết khi rời sân thì kết thúc. */
export function transformOnLeave(data: GameData, d: Draft, monster: Monster): void {
  const transform = activeTransform(monster)
  if (transform && TRANSFORMS[transform.kind].endsOnLeave) {
    endTransform(data, d, monster, { placePartner: false })
  }
}

/** Cuối lượt: Dynamax / hợp thể của quái trên sân giảm một lượt, hết lượt thì kết thúc / tách. */
export function transformsAtTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      const transform = activeTransform(monster)
      if (transform?.turnsLeft === undefined) continue
      transform.turnsLeft--
      if (transform.turnsLeft <= 0) endTransform(data, d, monster, { placePartner: true })
    }
  }
}

/**
 * Hết trận: mọi quái (đội, địch, quái đã bắt) trở lại dạng thường, hệ gốc, giữ tỉ lệ máu nếu đang
 * Dynamax. Gọi trước phần thưởng / tiến hóa để chúng tính trên dạng thường.
 */
export function revertTransforms(data: GameData, d: Draft): void {
  // Tách thực thể hợp thể trước (chia máu theo max HP riêng), rồi trả dạng thường như mọi loại.
  for (const lead of activeMergeLeads(d)) unmerge(data, d, lead, { placePartner: false })
  for (const monster of [...d.party, ...d.battle.enemies, ...d.battle.captured]) {
    const transform = monster.battleTransform
    if (!transform) continue
    const identity = d.battle.volatiles[monster.id]?.originalIdentity
    if (identity) identity.elementIds = [...transform.originalElementIds]
    changeKeepingHpRatio(data, monster, () => {
      delete monster.battleTransform
      monster.elementIds = [...transform.originalElementIds]
    })
  }
}

/**
 * Quái vào sân cầm đá tự kích hoạt (kiểu Blue / Red Orb) thì biến Mega ngay (trước trait vào sân):
 * không cần Vòng Mega, không tính lượt Mega của phe, vẫn là biến hình của quái đó.
 */
export function autoTransformOnEntry(data: GameData, d: Draft, monsters: readonly Monster[]): void {
  // Luật noTransforms của bí cảnh / tháp chặn cả Primal (docs/rules/trials.md).
  if (hasTrialRule(data, d.battle.trial?.rules, 'noTransforms')) return
  for (const monster of monsters) {
    if (monster.battleTransform || isFainted(data, monster)) continue
    const formSpeciesId = autoMegaForm(data, monster)
    if (!formSpeciesId) continue
    const side = sideOf(d, monster.id)
    applyTransform(data, d, {
      side,
      monsterId: monster.id,
      kind: 'mega',
      formSpeciesId,
      countsForSide: false
    })
  }
}

/**
 * Bước biến hình của lượt (sau đổi quái, trước vật phẩm và skill): biến hình của người chơi và kế
 * hoạch của boss (lượt đầu), theo tốc độ (Trick Room đảo), hòa thì random. Quái đã rời sân / gục /
 * đã biến hình (Primal vừa vào) thì bỏ qua.
 */
export function runTransformStep(
  data: GameData,
  d: Draft,
  playerRequests: readonly TransformRequest[]
): void {
  const requests = [...playerRequests, ...plannedRequests(d)]
  if (requests.length === 0) return
  const ordered = requests.map((request) => {
    let tiebreak: number
    ;[tiebreak, d.rng] = nextFloat(d.rng)
    const monster = findMonster(d, request.monsterId)
    return { request, speed: battleStats(data, d, monster).speed, tiebreak }
  })
  const bySpeed = compareSpeed(data, d.battle.field)
  ordered.sort((a, b) => bySpeed(a.speed, b.speed) || a.tiebreak - b.tiebreak)
  for (const { request } of ordered) {
    const monster = findMonster(d, request.monsterId)
    const onField = slotsOf(d.battle, request.side).includes(monster.id)
    if (!onField || isFainted(data, monster)) continue
    if (transformBlocker(data, d, { side: request.side, monster, kind: request.kind })) continue
    applyTransform(data, d, request)
  }
}

/**
 * Trận boss (và trận NPC biến hình được, docs/rules/trainers.md): tung min(100, base + perFloor ×
 * tầng)% có biến hình; loại chọn theo trọng số trong các loại quái đầu tiên của phe địch dùng được
 * (boss chỉ loại không cần vật phẩm: Mega / Dynamax / Tera hiện đều cần nên boss chưa biến hình; trận
 * boss luôn là power spot), dạng random đều. Biến ở lượt đầu (plannedTransform).
 */
export function rollBossTransformPlan(data: GameData, d: Draft): void {
  const boss = d.battle.enemies[0]
  if (!(d.battle.isBoss || trainerCanTransform(data, d)) || !boss) return
  const config = data.config.transform.boss
  let hit: boolean
  ;[hit, d.rng] = rollPercent(d.rng, Math.min(100, config.base + config.perFloor * d.battle.floor))
  if (!hit) return
  const kinds = TRANSFORM_KINDS.filter(
    (kind) =>
      TRANSFORMS[kind].bySkillCommand &&
      config.weights[kind] > 0 &&
      !transformBlocker(data, d, { side: 'enemy', monster: boss, kind })
  )
  if (kinds.length === 0) return
  let kind: TransformKind
  ;[kind, d.rng] = pickWeighted(d.rng, kinds, (entry) => config.weights[entry])
  const forms = transformForms(data, d, { side: 'enemy', monster: boss, kind })
  let formSpeciesId: string | undefined
  if (forms.length > 0) [formSpeciesId, d.rng] = pick(d.rng, forms)
  d.battle.plannedTransform = {
    monsterId: boss.id,
    kind,
    ...(formSpeciesId ? { formSpeciesId } : {})
  }
}

/** Kế hoạch biến hình của boss: dùng ở lượt đầu tiên (như raid), rồi bỏ. */
function plannedRequests(d: Draft): TransformRequest[] {
  const plan = d.battle.plannedTransform
  if (!plan) return []
  d.battle.plannedTransform = null
  return [{ side: 'enemy', ...plan }]
}

/** Quái đang Dynamax (chưa hết lượt). */
export const isDynamaxed = (monster: Monster): boolean =>
  activeTransform(monster)?.kind === 'dynamax'

/**
 * Skill thật khi quái dùng: đang Dynamax thì chiêu Max (kể cả Max Guard); đang Tera thì Tera Blast
 * đổi hệ / loại, skill cùng hệ Tera yếu được nâng power. Không biến hình thì giữ nguyên.
 */
export function battleSkill(data: GameData, d: Draft, user: Monster, rawSkill: Skill): Skill {
  const skill = withFormOverride(user, rawSkill)
  const transform = activeTransform(user)
  if (transform?.kind === 'dynamax') return maxMoveFor(data, d.battle.field, user, skill)
  if (transform?.kind !== 'tera' || !transform.teraElementId) return skill
  if (skill.teraBlast) return teraBlast(data, d, user, skill, transform.teraElementId)
  const { tera } = data.config.transform
  const raised =
    skill.elementId === transform.teraElementId &&
    skill.power > 0 &&
    skill.power < tera.minPower &&
    skill.hits === undefined &&
    skill.priority <= 0
  return raised ? { ...skill, power: tera.minPower } : skill
}

/**
 * Skill đổi theo dạng của quái dùng (formOverrides; battle-forms.md): dạng trong trận, dạng biến
 * hình (Ultra Burst) hoặc loài hiện tại khớp mục đầu tiên thì áp các trường của mục đó.
 */
function withFormOverride(user: Monster, skill: Skill): Skill {
  if (!skill.formOverrides) return skill
  const forms = [
    user.battleForm?.speciesId,
    activeTransform(user)?.formSpeciesId,
    user.speciesId
  ].filter((id): id is string => id !== undefined)
  const match = skill.formOverrides.find((entry) =>
    entry.speciesIds.some((id) => forms.includes(id))
  )
  if (!match) return skill
  const { speciesIds: _speciesIds, ...changes } = match
  return { ...skill, ...changes }
}

/**
 * Tera Blast khi đã Tera: hệ Tera, vật lý nếu công > đặc công (chỉ số cuối, tính bậc trận). Stellar
 * giữ hệ gốc của skill, power riêng và tự hạ bậc sau chiêu.
 */
function teraBlast(
  data: GameData,
  d: Draft,
  user: Monster,
  skill: Skill,
  teraElementId: string
): Skill {
  const stats = battleStats(data, d, user)
  const category = stats.attack.gt(stats.spAttack) ? 'physical' : 'special'
  if (teraElementId !== STELLAR) return { ...skill, elementId: teraElementId, category }
  const { tera } = data.config.transform
  const selfDrops = tera.stellarBlastSelfStages.map(({ stat, delta }) => ({
    type: 'statStage',
    params: { who: 'self', stat, delta }
  }))
  return {
    ...skill,
    category,
    power: tera.stellarBlastPower,
    effects: [...skill.effects, ...selfDrops]
  }
}

/** Tera Blast của quái Tera Stellar: khắc chế cố định (quái đang Tera) hoặc trung tính. */
export function stellarBlastEffectiveness(
  data: GameData,
  { attacker, defender, skill }: { attacker: Monster; defender: Monster; skill: Skill }
): number | null {
  // Đòn Stellar (Tera Starstorm của Terapagos Stellar) như Tera Blast Stellar.
  const stellarBlast = skill.teraBlast && activeTransform(attacker)?.teraElementId === STELLAR
  if (!stellarBlast && !skill.stellar) return null
  return activeTransform(defender)?.kind === 'tera'
    ? data.config.transform.tera.stellarBlastEffectiveness
    : 1
}

/**
 * Hệ số STAB (mục "Tera"): không Tera thì như cũ (hệ của quái); Tera thì hệ gốc vẫn có STAB, hệ Tera
 * có STAB, trùng hệ gốc thì sameStabMultiplier; Stellar: lần đầu mỗi hệ hệ gốc × stellarOriginal,
 * hệ khác × stellarOther, sau đó như không Tera. Trait kiểu Adaptability nâng phần STAB như cũ.
 */
export function stabMultiplierOf(
  data: GameData,
  { attacker, skill, ctx }: { attacker: Monster; skill: Skill; ctx?: MonsterBattleContext }
): number {
  if (skill.typeless) return 1
  const base = data.config.battle.stabMultiplier
  const stab = (value: number): number => traitStabMultiplier(data, attacker, value, ctx)
  const transform = activeTransform(attacker)
  const teraElementId = transform?.kind === 'tera' ? transform.teraElementId : undefined
  if (!transform || teraElementId === undefined) {
    return attacker.elementIds.includes(skill.elementId) ? stab(base) : 1
  }
  const { tera } = data.config.transform
  const original = transform.originalElementIds.includes(skill.elementId)
  if (teraElementId === STELLAR) {
    const boosted = transform.stellarBoostedElementIds?.includes(skill.elementId) ?? false
    if (!boosted)
      return original ? stab(tera.stellarOriginalMultiplier) : tera.stellarOtherMultiplier
    return original ? stab(base) : 1
  }
  if (skill.elementId === teraElementId) return stab(original ? tera.sameStabMultiplier : base)
  return original ? stab(base) : 1
}

/** Tera Stellar: hệ của skill gây sát thương vừa dùng hết lượt tăng (mỗi hệ một lần mỗi trận). */
export function recordStellarUse(user: Monster, elementId: string): void {
  const transform = activeTransform(user)
  if (transform?.teraElementId !== STELLAR) return
  const boosted = transform.stellarBoostedElementIds ?? []
  if (!boosted.includes(elementId)) transform.stellarBoostedElementIds = [...boosted, elementId]
}

/**
 * Quái giả định đã biến hình (cho AI chấm lợi): bản sao không đụng state. null nếu không biến hình
 * được.
 */
export function previewTransform(
  data: GameData,
  d: Draft,
  { side, monster, kind }: { side: BattleSide; monster: Monster; kind: TransformKind }
): { monster: Monster; formSpeciesId?: string } | null {
  if (transformBlocker(data, d, { side, monster, kind })) return null
  const forms = transformForms(data, d, { side, monster, kind })
  const formSpeciesId = forms[0]
  const start = TRANSFORMS[kind].start(contextOf(data, d, side, monster), formSpeciesId)
  const preview: Monster = {
    ...monster,
    battleTransform: start.transform,
    elementIds: start.elementIds
  }
  // Giữ tỉ lệ máu như khi biến hình thật (Dynamax tăng max HP).
  const before = getMaxHp(data, monster)
  const after = getMaxHp(data, preview)
  if (!after.eq(before)) {
    rescaleDamage(preview, { before, after, alive: !isFainted(data, monster) })
  }
  return { monster: preview, ...(formSpeciesId ? { formSpeciesId } : {}) }
}
