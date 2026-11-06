// Kiểm tra dữ liệu tinh chất (docs/rules/essences.md): essences.json theo loại hiệu ứng
// (ESSENCE_EFFECT_CHECKS, mapped type theo union nên thêm loại mà quên kiểm tra thì TypeScript báo),
// config.essences.

import {
  ESSENCE_EFFECT_KINDS,
  ESSENCE_RARITIES,
  STAT_NAMES,
  type EssenceEffect,
  type EssenceEffectKind,
  type GameData
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkIdList } from '../registries'
import { checkKnownFields } from './checks'

type Effect<K extends EssenceEffectKind> = Extract<EssenceEffect, { kind: K }>

const ESSENCE_EFFECT_CHECKS: {
  [K in EssenceEffectKind]: {
    fields: readonly string[]
    validate(data: GameData, effect: Effect<K>, where: string): string[]
  }
} = {
  growth: {
    fields: ['kind', 'stats', 'percent', 'raceIds', 'raceGroupIds'],
    validate: (data, effect, where) => [
      ...(effect.stats === 'lowest' ||
      (Array.isArray(effect.stats) &&
        effect.stats.length > 0 &&
        effect.stats.every((stat) => (STAT_NAMES as readonly unknown[]).includes(stat)))
        ? []
        : [`${where}.stats phải là "lowest" hoặc danh sách chỉ số`]),
      ...checkNumber(effect.percent, `${where}.percent`, Number.MIN_VALUE),
      ...(effect.raceIds === undefined
        ? []
        : checkIdList(effect.raceIds, `${where}.raceIds`, data.races, { label: 'race' })),
      ...(effect.raceGroupIds === undefined
        ? []
        : checkIdList(effect.raceGroupIds, `${where}.raceGroupIds`, data.raceGroups, {
            label: 'nhóm race'
          }))
    ]
  },
  battleTrait: {
    fields: ['kind', 'traitId'],
    validate: (data, effect, where) =>
      checkIdList([effect.traitId], `${where}.traitId`, data.traits, { label: 'trait' })
  },
  fusionTraitChoices: {
    fields: ['kind', 'extra'],
    validate: (_data, effect, where) => checkInteger(effect.extra, `${where}.extra`, 1)
  },
  egg: {
    fields: ['kind', 'growth', 'stability'],
    validate: (_data, effect, where) => [
      ...checkNumber(effect.growth, `${where}.growth`),
      ...checkNumber(effect.stability, `${where}.stability`)
    ]
  }
}

function checkEffect(data: GameData, value: unknown, where: string, issues: string[]): void {
  const effect = asObject(value)
  const kind = ESSENCE_EFFECT_KINDS.find((entry) => entry === effect?.kind)
  if (!effect || !kind) {
    issues.push(`${where}.kind không hợp lệ "${String(effect?.kind)}"`)
    return
  }
  const rule = ESSENCE_EFFECT_CHECKS[kind]
  checkKnownFields(effect, rule.fields, where, 'hiệu ứng tinh chất', issues)
  // Ép kiểu: đã kiểm `kind`; từng trường do validate của đúng loại kiểm tiếp.
  const validate = rule.validate as (data: GameData, effect: unknown, where: string) => string[]
  issues.push(...validate(data, effect, where))
}

export function checkEssenceData(data: GameData, issues: string[]): void {
  const { offerSize, rarityWeights } = data.config.essences
  issues.push(...checkInteger(offerSize, 'config.essences.offerSize', 1))
  for (const rarity of ESSENCE_RARITIES) {
    issues.push(
      ...checkNumber(rarityWeights?.[rarity], `config.essences.rarityWeights.${rarity}`, 0)
    )
  }
  for (const essence of Object.values(data.essences)) {
    const where = `essences "${essence.id}"`
    checkKnownFields(essence, ['id', 'rarity', 'effect'], where, 'tinh chất', issues)
    if (!(ESSENCE_RARITIES as readonly unknown[]).includes(essence.rarity)) {
      issues.push(`${where}.rarity không hợp lệ "${String(essence.rarity)}"`)
    }
    checkEffect(data, essence.effect, `${where}.effect`, issues)
  }
}
