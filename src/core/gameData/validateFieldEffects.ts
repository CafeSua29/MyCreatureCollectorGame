// Kiểm tra môi trường trong trận (fieldEffects.json, mục "Môi trường" ở battle-environment.md): định nghĩa
// môi trường (lớp, hook đúng lớp, tầng), môi trường mặc định (config.field), môi trường tự nhiên
// của biome, fieldModifiers của skill. Tham số hook / hiệu ứng (setField, setSideField, setRoom,
// trait theo môi trường) do registry tự kiểm tra.

import { FIELD_HOOKS, checkFieldIdList, isGlobalFieldLayer, type FieldScope } from '../registries'
import {
  FIELD_LAYERS,
  GLOBAL_FIELD_LAYERS,
  ROOM_REUSES,
  SKILL_TARGETS,
  type FieldEffectDef,
  type FieldLayer,
  type GameData,
  type Skill,
  allMaps
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkEffects } from './checks'

/** Phạm vi hook của một lớp: thời tiết / địa hình dùng hook toàn sân. */
const scopeOf = (layer: FieldLayer): FieldScope =>
  layer === 'side' || layer === 'room' ? layer : 'global'

/**
 * Định nghĩa môi trường: lớp hợp lệ, hook hợp lệ và dùng được ở lớp đó, duration nguyên
 * ≥ 1 (nếu có), maxLayers (chỉ lớp side) nguyên ≥ 2 và khớp số mục theo tầng của hook, onReuse
 * (chỉ lớp room) hợp lệ.
 */
export function checkFieldEffects(data: GameData, issues: string[]): void {
  for (const effect of Object.values(data.fieldEffects)) {
    const where = `Môi trường "${effect.id}"`
    if (!(FIELD_LAYERS as readonly unknown[]).includes(effect.layer)) {
      issues.push(`${where}: layer không hợp lệ "${String(effect.layer)}"`)
    }
    checkEffects(FIELD_HOOKS, effect.hooks, where, data, issues)
    if (effect.duration !== undefined) {
      issues.push(...checkInteger(effect.duration, `${where}: duration`, 1))
    }
    checkHookScopes(effect, where, issues)
    checkLayers(effect, where, issues)
    checkActsAs(data, effect, where, issues)
    if (effect.primal !== undefined) {
      if (effect.primal !== true) issues.push(`${where}: primal chỉ được là true`)
      if (!isGlobalFieldLayer(effect.layer)) {
        issues.push(`${where}: primal chỉ dùng cho thời tiết / địa hình`)
      }
      if (effect.duration !== undefined) {
        issues.push(`${where}: môi trường primal không có duration (kéo dài theo quái đặt)`)
      }
    }
    if (effect.onReuse !== undefined) {
      if (effect.layer !== 'room') issues.push(`${where}: onReuse chỉ dùng cho lớp room`)
      if (!(ROOM_REUSES as readonly unknown[]).includes(effect.onReuse)) {
        issues.push(`${where}: onReuse phải là ${ROOM_REUSES.join(' / ')}`)
      }
    }
  }
}

/** Hook phải dùng được ở lớp của môi trường (bẫy, màn chắn chỉ lớp side; Trick Room chỉ room). */
function checkHookScopes(effect: FieldEffectDef, where: string, issues: string[]): void {
  if (
    !(FIELD_LAYERS as readonly unknown[]).includes(effect.layer) ||
    !Array.isArray(effect.hooks)
  ) {
    return
  }
  const scope = scopeOf(effect.layer)
  effect.hooks.forEach((hook, i) => {
    const handler = FIELD_HOOKS[hook?.type]
    if (handler && !handler.scopes.includes(scope)) {
      issues.push(`${where}: hooks[${i}] "${hook.type}" không dùng được ở lớp ${effect.layer}`)
    }
  })
}

/**
 * actsAs: chỉ lớp toàn sân, danh sách môi trường cùng lớp, không lặp, không chứa chính nó, không
 * phải môi trường mặc định và không trỏ tới môi trường cũng có actsAs (không lồng).
 */
function checkActsAs(
  data: GameData,
  effect: FieldEffectDef,
  where: string,
  issues: string[]
): void {
  if (effect.actsAs === undefined) return
  if (!isGlobalFieldLayer(effect.layer)) {
    issues.push(`${where}: actsAs chỉ dùng cho thời tiết / địa hình`)
    return
  }
  const problems = checkFieldIdList(data, effect.actsAs, `${where}: actsAs`, effect.layer)
  issues.push(...problems)
  if (problems.length > 0) return
  for (const id of effect.actsAs) {
    if (id === effect.id) issues.push(`${where}: actsAs không được chứa chính nó`)
    else if (data.config.field?.defaults?.[effect.layer] === id) {
      issues.push(`${where}: actsAs không được là môi trường mặc định "${id}"`)
    } else if (data.fieldEffects[id].actsAs !== undefined) {
      issues.push(`${where}: actsAs "${id}" cũng có actsAs (không lồng)`)
    }
  }
}

/** maxLayers chỉ cho lớp side, nguyên ≥ 2; hook có danh sách theo tầng phải dài đúng số tầng. */
function checkLayers(effect: FieldEffectDef, where: string, issues: string[]): void {
  if (effect.maxLayers !== undefined) {
    if (effect.layer !== 'side') issues.push(`${where}: maxLayers chỉ dùng cho lớp side`)
    issues.push(...checkInteger(effect.maxLayers, `${where}: maxLayers`, 2))
  }
  if (!Array.isArray(effect.hooks)) return
  const layers = effect.maxLayers ?? 1
  effect.hooks.forEach((hook, i) => {
    // Params sai dạng (null) đã được checkEffects báo.
    const count = FIELD_HOOKS[hook?.type]?.layerCount?.(hook.params) ?? null
    if (count !== null && count !== layers) {
      issues.push(`${where}: hooks[${i}] có ${count} mục theo tầng, cần ${layers} (maxLayers)`)
    }
  })
}

/** config.field.defaults: mỗi lớp toàn sân một môi trường đúng lớp, không có hook. */
export function checkFieldConfig(data: GameData, issues: string[]): void {
  const defaults = asObject(data.config.field?.defaults)
  if (!defaults) {
    issues.push('config.field.defaults phải là object lớp → id môi trường')
    return
  }
  for (const layer of GLOBAL_FIELD_LAYERS) {
    const where = `config.field.defaults.${layer}`
    const problems = checkFieldIdList(data, [defaults[layer]], where, layer)
    issues.push(...problems)
    if (problems.length > 0) continue
    const effect = data.fieldEffects[defaults[layer] as string]
    if (effect.hooks.length > 0) issues.push(`${where}: môi trường mặc định không được có hook`)
    if (effect.duration !== undefined) {
      issues.push(`${where}: môi trường mặc định không có duration`)
    }
  }
  for (const key of Object.keys(defaults)) {
    if (!isGlobalFieldLayer(key)) issues.push(`config.field.defaults: lớp lạ "${key}"`)
  }
  // Trời nắng mà ability kiểu Mega Sol coi là đang có (battle-environment.md).
  issues.push(
    ...checkFieldIdList(
      data,
      [data.config.field.sunWeatherId],
      'config.field.sunWeatherId',
      'weather'
    )
  )
}

/** Môi trường tự nhiên của biome: id đúng lớp, không trùng, trọng số > 0. */
export function checkBiomeFields(data: GameData, issues: string[]): void {
  for (const biome of allMaps(data)) {
    for (const layer of GLOBAL_FIELD_LAYERS) {
      const entries: unknown = biome[layer]
      if (entries === undefined) continue
      const where = `Biome "${biome.id}": ${layer}`
      if (!Array.isArray(entries)) {
        issues.push(`${where} phải là danh sách`)
        continue
      }
      // Danh sách rỗng như bỏ trống: luôn môi trường mặc định.
      if (entries.length === 0) continue
      const fieldIds = entries.map((entry) => asObject(entry)?.fieldId)
      issues.push(...checkFieldIdList(data, fieldIds, where, layer))
      entries.forEach((entry, i) => {
        issues.push(
          ...checkNumber(asObject(entry)?.weight, `${where}[${i}].weight`, Number.MIN_VALUE)
        )
      })
    }
  }
}

/**
 * Đấu trường boss (`bossField` của mục boss): object lớp toàn sân → id môi trường đúng lớp; lớp lạ
 * báo lỗi. Bỏ trống = trận boss tung môi trường tự nhiên như thường.
 */
export function checkBossFields(data: GameData, issues: string[]): void {
  for (const biome of allMaps(data)) {
    if (!Array.isArray(biome.bosses)) continue
    biome.bosses.forEach((boss, i) => {
      const value: unknown = asObject(boss)?.bossField
      if (value === undefined) return
      const where = `Biome "${biome.id}": bosses[${i}].bossField`
      const bossField = asObject(value)
      if (!bossField) {
        issues.push(`${where} phải là object lớp → id môi trường`)
        return
      }
      for (const [layer, fieldId] of Object.entries(bossField)) {
        if (!isGlobalFieldLayer(layer)) issues.push(`${where}: lớp lạ "${layer}"`)
        else issues.push(...checkFieldIdList(data, [fieldId], `${where}.${layer}`, layer))
      }
    })
  }
}

/**
 * fieldModifiers của skill: môi trường tồn tại, không trùng, sức mạnh / hệ số > 0, accuracy 1–100,
 * hệ thay thế tồn tại.
 */
function checkSkillFieldModifiers(data: GameData, skill: Skill, issues: string[]): void {
  const modifiers: unknown = skill.fieldModifiers
  if (modifiers === undefined) return
  const where = `Skill "${skill.id}": fieldModifiers`
  if (!Array.isArray(modifiers) || modifiers.length === 0) {
    issues.push(`${where} phải là danh sách không rỗng`)
    return
  }
  const seen = new Set<unknown>()
  modifiers.forEach((value, i) => {
    const at = `${where}[${i}]`
    const modifier = asObject(value) ?? {}
    if (typeof modifier.fieldId !== 'string' || !(modifier.fieldId in data.fieldEffects)) {
      issues.push(`${at}: môi trường không tồn tại "${String(modifier.fieldId)}"`)
    }
    if (seen.has(modifier.fieldId))
      issues.push(`${at}: môi trường "${String(modifier.fieldId)}" bị lặp`)
    seen.add(modifier.fieldId)
    const { power, powerMultiplier, accuracy, hitsAlways, elementId, requiresGroundedUser } =
      modifier
    const changes = [
      power,
      powerMultiplier,
      accuracy,
      hitsAlways,
      elementId,
      modifier.priority,
      modifier.target
    ]
    if (changes.every((value) => value === undefined)) {
      issues.push(
        `${at}: cần ít nhất power, powerMultiplier, accuracy, hitsAlways, elementId, priority hoặc target`
      )
    }
    if (
      modifier.target !== undefined &&
      !(SKILL_TARGETS as readonly unknown[]).includes(modifier.target)
    ) {
      issues.push(`${at}.target: mục tiêu không hợp lệ "${String(modifier.target)}"`)
    }
    if (modifier.priority !== undefined) {
      issues.push(...checkInteger(modifier.priority, `${at}.priority`))
    }
    if (
      elementId !== undefined &&
      (typeof elementId !== 'string' || !(elementId in data.elements))
    ) {
      issues.push(`${at}: hệ không tồn tại "${String(elementId)}"`)
    }
    if (requiresGroundedUser !== undefined && requiresGroundedUser !== true) {
      issues.push(`${at}.requiresGroundedUser chỉ được là true`)
    }
    if (power !== undefined) issues.push(...checkNumber(power, `${at}.power`, Number.MIN_VALUE))
    if (powerMultiplier !== undefined) {
      issues.push(...checkNumber(powerMultiplier, `${at}.powerMultiplier`, Number.MIN_VALUE))
    }
    if (accuracy !== undefined) issues.push(...checkNumber(accuracy, `${at}.accuracy`, 1, 100))
    if (hitsAlways !== undefined && hitsAlways !== true) {
      issues.push(`${at}.hitsAlways chỉ được là true`)
    }
  })
}

export function checkSkillsFieldModifiers(data: GameData, issues: string[]): void {
  for (const skill of Object.values(data.skills)) checkSkillFieldModifiers(data, skill, issues)
}
