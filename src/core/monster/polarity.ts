// Âm / Dương hóa (docs/rules/polarity.md): nhận / đổi / bỏ cực, tung cực cho quái hoang / boss và
// con breeding, kiểm tra trong save. Hiệu ứng (% chỉ số, trait cực tính, tương khắc) tra ở
// registries/polarity.ts.

import { POLES, type GameData, type Monster, type MonsterPolarity, type Pole } from '../model'
import { asObject, pick, rollPercent, type RngState } from '../shared'

/** Cách đổi cực của đá chuyển cực: nhận Âm / Dương (quái chưa có cực), đảo cực, về không cực. */
export const POLARITY_CHANGES = ['yin', 'yang', 'swap', 'clear'] as const

export type PolarityChange = (typeof POLARITY_CHANGES)[number]

const oppositePole = (pole: Pole): Pole => (pole === 'yin' ? 'yang' : 'yin')

/** Nhận cực `pole`: trait cực tính random đều trong pool của cực. */
export function rollPolarity(
  data: GameData,
  rng: RngState,
  pole: Pole
): [MonsterPolarity, RngState] {
  const [traitId, next] = pick(rng, data.config.polarity.traitIds[pole])
  return [{ pole, traitId }, next]
}

/**
 * Đổi cực bằng đá chuyển cực; null = không có tác dụng (không mất đá, không tốn RNG): Âm / Dương
 * Thạch lên quái đã có cực, Hoán Cực / Quy Nguyên Thạch lên quái không cực.
 */
export function changePolarity(
  data: GameData,
  rng: RngState,
  monster: Monster,
  change: PolarityChange
): [Monster | null, RngState] {
  const current = monster.polarity
  switch (change) {
    case 'yin':
    case 'yang': {
      if (current !== null) return [null, rng]
      const [polarity, next] = rollPolarity(data, rng, change)
      return [{ ...monster, polarity }, next]
    }
    case 'swap': {
      if (current === null) return [null, rng]
      const [polarity, next] = rollPolarity(data, rng, oppositePole(current.pole))
      return [{ ...monster, polarity }, next]
    }
    case 'clear':
      return current === null ? [null, rng] : [{ ...monster, polarity: null }, rng]
  }
}

/**
 * Quái hoang / boss mới sinh có sẵn cực với tỉ lệ `chance` khi tầng ≥ unlockFloor (Âm / Dương đều
 * nhau). Dưới tầng mở khóa hoặc tỉ lệ 0 thì không tốn RNG.
 */
export function rollSpawnPolarity(
  data: GameData,
  rng: RngState,
  monster: Monster,
  { floor, chance }: { floor: number; chance: number }
): [Monster, RngState] {
  if (floor < data.config.polarity.unlockFloor || chance <= 0) return [monster, rng]
  let hasPole: boolean
  ;[hasPole, rng] = rollPercent(rng, chance)
  if (!hasPole) return [monster, rng]
  let pole: Pole
  ;[pole, rng] = pick(rng, POLES)
  let polarity: MonsterPolarity
  ;[polarity, rng] = rollPolarity(data, rng, pole)
  return [{ ...monster, polarity }, rng]
}

/**
 * Cực của con breeding: bố mẹ cùng cực thì con cùng cực đó (trait cực tính random lại); khác cực
 * hoặc một bên không cực thì không cực (không tốn RNG).
 */
export function childPolarity(
  data: GameData,
  rng: RngState,
  parents: readonly Pick<Monster, 'polarity'>[]
): [MonsterPolarity | null, RngState] {
  const poles = new Set(parents.map((parent) => parent.polarity?.pole ?? null))
  const [pole] = poles
  if (poles.size !== 1 || pole === null || pole === undefined) return [null, rng]
  return rollPolarity(data, rng, pole)
}

/** Kiểm tra trường polarity trong save: null hoặc { pole, traitId } với trait loại polarity. */
export function validatePolarity(data: GameData, value: unknown, at: string): string[] {
  if (value === null) return []
  const polarity = asObject(value)
  if (!polarity || Object.keys(polarity).length !== 2) {
    return [`${at} phải là null hoặc { pole, traitId }`]
  }
  const issues: string[] = []
  if (!(POLES as readonly unknown[]).includes(polarity.pole)) {
    issues.push(`${at}.pole phải là ${POLES.join(' / ')}, nhận "${String(polarity.pole)}"`)
  }
  const { traitId } = polarity
  if (typeof traitId !== 'string' || data.traits[traitId]?.kind !== 'polarity') {
    issues.push(`${at}.traitId: phải là trait loại polarity, nhận "${String(traitId)}"`)
  }
  return issues
}
