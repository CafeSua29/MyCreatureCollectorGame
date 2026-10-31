// Yêu cầu của đội thám hiểm (docs/rules/expeditions.md): mỗi loại một handler (trường, kiểm tra
// params, đội đủ chưa). Thêm loại = thêm một handler, nơi dùng không đổi.

import { raceMatches, raceRefIds } from './races'
import { checkInteger } from '../shared'
import type { GameData, Monster } from '../model'

export interface ExpeditionRequirementHandler {
  /** Trường của yêu cầu ngoài `type`. */
  fields: readonly string[]
  validateParams(params: Readonly<Record<string, unknown>>, data: GameData): string[]
  /** Params đã qua validateParams (dùng chung khung checkTypedParams với điều kiện quái). */
  parse(params: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>
  isMet(
    params: Readonly<Record<string, unknown>>,
    team: readonly Monster[],
    data: GameData
  ): boolean
}

const checkKnownId = (
  value: unknown,
  known: Readonly<Record<string, unknown>>,
  label: string
): string[] =>
  typeof value === 'string' && Object.hasOwn(known, value)
    ? []
    : [`${label} không tồn tại "${String(value)}"`]

/** Yêu cầu của đội thám hiểm theo loại; thêm loại = thêm một handler. */
export const EXPEDITION_REQUIREMENTS: Readonly<Record<string, ExpeditionRequirementHandler>> = {
  // Mọi quái level ≥ level.
  minLevel: {
    fields: ['level'],
    parse: (params) => params,
    validateParams: (params) => checkInteger(params.level, 'level', 1),
    isMet: (params, team) => team.every((m) => m.level >= (params.level as number))
  },
  // Ít nhất một quái có hệ.
  element: {
    fields: ['elementId'],
    parse: (params) => params,
    validateParams: (params, data) => checkKnownId(params.elementId, data.elements, 'hệ'),
    isMet: (params, team) => team.some((m) => m.elementIds.includes(params.elementId as string))
  },
  // Ít nhất một quái thuộc race.
  race: {
    fields: ['raceId'],
    parse: (params) => params,
    validateParams: (params, data) => checkKnownId(params.raceId, raceRefIds(data), 'race'),
    isMet: (params, team, data) =>
      team.some((m) => raceMatches(data, m.raceId, String(params.raceId)))
  },
  // Số quái trong [min, max].
  teamSize: {
    fields: ['min', 'max'],
    parse: (params) => params,
    validateParams(params) {
      const issues = [...checkInteger(params.min, 'min', 1), ...checkInteger(params.max, 'max', 1)]
      if ((params.max as number) < (params.min as number)) issues.push('max phải ≥ min')
      return issues
    },
    isMet: (params, team) =>
      team.length >= (params.min as number) && team.length <= (params.max as number)
  }
}
