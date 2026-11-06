// Dạng chỉ có trong trận do ability / chiêu (mục "Dạng trong trận" ở docs/rules/battle-forms.md):
// Zen Mode, Stance Change, Forecast, Shields Down, Power Construct... Đổi chỉ số gốc và hệ theo loài
// dạng, giữ ability của loài gốc, độc lập với biến hình (quái Tera vẫn đổi dạng nhưng giữ hệ Tera).
// Máu đã mất giữ nguyên khi max HP đổi (như Pokémon: Power Construct cộng phần max HP tăng thêm).

import { activeTransform, getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import { disguiseRuleOf, formBeforeSkill, formOnLeaveOf } from '../registries'
import { maxBig } from '../shared'
import type { GameData, Monster, Skill } from '../model'
import { Draft, log, monsterBattleContext } from './draft'
import { ignoresTargetAbility } from './damage'
import { loseHp } from './hpChanges'
import { punishTransform } from './statuses'

/** Đổi max HP mà giữ máu đã mất; còn sống thì còn ít nhất 1 máu. */
function changeKeepingDamage(data: GameData, monster: Monster, change: () => void): void {
  const alive = !isFainted(data, monster)
  change()
  const maxHp = getMaxHp(data, monster)
  if (!alive) monster.damageTaken = maxHp
  else if (monster.damageTaken.gte(maxHp)) monster.damageTaken = maxBig(0, maxHp.minus(1))
}

/**
 * Hệ của quái đổi theo dạng. Quái đang Tera giữ hệ Tera, chỉ đổi hệ gốc mà Tera trả lại khi hết trận;
 * hệ đổi tạm (Soak) thì đổi cả bản gốc trả lại khi rời sân.
 */
function setFormElements(d: Draft, monster: Monster, elementIds: readonly string[]): void {
  const identity = d.battle.volatiles[monster.id]?.originalIdentity
  if (identity) identity.elementIds = [...elementIds]
  const transform = activeTransform(monster)
  if (transform?.kind === 'tera') transform.originalElementIds = [...elementIds]
  else monster.elementIds = [...elementIds]
}

/** Hệ thật của quái lúc chưa đổi dạng (bỏ qua hệ Tera / hệ đổi tạm). */
function baseElementIds(d: Draft, monster: Monster): string[] {
  const transform = activeTransform(monster)
  if (transform?.kind === 'tera') return [...transform.originalElementIds]
  return [...(d.battle.volatiles[monster.id]?.originalIdentity?.elementIds ?? monster.elementIds)]
}

/** Loài dạng hiện tại của quái (dạng trong trận, không thì loài hiện tại). */
export const currentFormId = (monster: Monster): string =>
  monster.battleForm?.speciesId ?? monster.speciesId

/**
 * Quái đổi sang dạng `speciesId` (loài battleOnly): đang ở đúng dạng đó hoặc đã gục thì thôi.
 * `untilLeave`: về dạng thường khi rời sân.
 */
export function changeBattleForm(
  data: GameData,
  d: Draft,
  monster: Monster,
  { speciesId, untilLeave }: { speciesId: string; untilLeave?: boolean }
): void {
  const form = data.species[speciesId]
  if (form?.kind !== 'normal' || isFainted(data, monster)) return
  if (monster.battleForm?.speciesId === speciesId) return
  const originalElementIds = monster.battleForm?.originalElementIds ?? baseElementIds(d, monster)
  changeKeepingDamage(data, monster, () => {
    monster.battleForm = { speciesId, originalElementIds, ...(untilLeave ? { untilLeave } : {}) }
  })
  setFormElements(d, monster, form.elementIds)
  log(d, { type: 'formChanged', monsterId: monster.id, speciesId })
  punishTransform(data, d, monster)
}

/**
 * Chép chỉ số gốc của loài `speciesId` (Transmog của Temtem): dạng `copied` giữ tới hết trận, máu đã mất
 * giữ nguyên; hệ / ability / skill do nơi gọi đổi (`transformInto`).
 */
export function copyStatSpecies(
  data: GameData,
  d: Draft,
  monster: Monster,
  speciesId: string
): void {
  if (data.species[speciesId]?.kind !== 'normal' || isFainted(data, monster)) return
  const originalElementIds = monster.battleForm?.originalElementIds ?? baseElementIds(d, monster)
  changeKeepingDamage(data, monster, () => {
    monster.battleForm = { speciesId, originalElementIds, copied: true }
  })
}

/** Quái về dạng thường (hệ trước khi đổi dạng); không ở dạng trong trận thì thôi. */
export function revertBattleForm(data: GameData, d: Draft, monster: Monster): void {
  const form = monster.battleForm
  if (!form) return
  changeKeepingDamage(data, monster, () => {
    delete monster.battleForm
  })
  setFormElements(d, monster, form.originalElementIds)
  log(d, { type: 'formChanged', monsterId: monster.id, speciesId: null })
}

/**
 * Quái rời sân: dạng chỉ giữ khi ở trên sân (Zen Mode, Stance Change...) về dạng thường; quái còn
 * sống rút về có hook dạng khi rời sân (Zero to Hero) thì nhận dạng đó tới hết trận.
 */
export function battleFormOnLeave(data: GameData, d: Draft, monster: Monster): void {
  if (monster.battleForm?.untilLeave) revertBattleForm(data, d, monster)
  if (isFainted(data, monster)) return
  const formId = formOnLeaveOf(data, monster, monsterBattleContext(data, d, monster))
  if (formId) changeBattleForm(data, d, monster, { speciesId: formId })
}

/** Trước khi dùng skill: đổi dạng theo skill (Stance Change: tấn công → Blade, King's Shield → Shield). */
export function formBeforeSkillUse(data: GameData, d: Draft, user: Monster, skill: Skill): void {
  const formId = formBeforeSkill(data, user, skill, monsterBattleContext(data, d, user))
  if (formId === null) revertBattleForm(data, d, user)
  else if (formId !== undefined)
    changeBattleForm(data, d, user, { speciesId: formId, untilLeave: true })
}

/**
 * Dạng chặn đòn (Disguise, Ice Face): mục tiêu còn ở dạng thường bị đòn đúng loại thì không mất máu
 * vì đòn, đổi sang dạng chặn (giữ tới hết trận) và mất % max HP của luật. Đòn bỏ qua ability (Mold
 * Breaker) không bị chặn. Trả về true nếu đã chặn.
 */
export function disguiseBlocks(
  data: GameData,
  d: Draft,
  { user, target, skill }: { user: Monster; target: Monster; skill: Skill }
): boolean {
  if (skill.category === 'status') return false
  if (
    ignoresTargetAbility(data, { attacker: user, skill, ctx: monsterBattleContext(data, d, user) })
  )
    return false
  const rule = disguiseRuleOf(data, target, skill.category, monsterBattleContext(data, d, target))
  if (!rule || target.battleForm?.speciesId === rule.formId) return false
  changeBattleForm(data, d, target, { speciesId: rule.formId })
  log(d, { type: 'disguiseBroken', monsterId: target.id, userId: user.id })
  const cost = percentOfMaxHp(getMaxHp(data, target), rule.hpCostPercent)
  if (cost.gt(0)) {
    loseHp(data, d, target, cost, (dealt) => ({
      type: 'traitDamage',
      monsterId: target.id,
      amount: dealt
    }))
  }
  return true
}

/** Hết trận: mọi quái về dạng thường (gọi sau khi trả biến hình). */
export function revertBattleForms(data: GameData, d: Draft): void {
  for (const monster of [...d.party, ...d.battle.enemies, ...d.battle.captured]) {
    const form = monster.battleForm
    if (!form) continue
    changeKeepingDamage(data, monster, () => {
      delete monster.battleForm
    })
    monster.elementIds = [...form.originalElementIds]
  }
}
