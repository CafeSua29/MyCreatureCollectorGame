// Trận đặc biệt (docs/rules/events.md): trận do event mở, đợt thú triều, trận hiểm địa (zones.md),
// trận câu cá / khai thác (gathering.md). Luật theo loại (chạy, bắt,
// tiền thưởng, phạt thua, việc sau trận) ở SPECIAL_BATTLE_RULES; thêm loại = thêm một mục. Kèm sổ
// sách của trận trên tầng: thời hạn modifier, trận thắng của chuỗi event, hệ số của modifier.

import { eventModifierMultiplier, tickModifierList } from '../registries'
import { createBiomeBossEgg } from '../progression'
import { pick, rollPercent } from '../shared'
import {
  dayOf,
  type BattleState,
  type BeastTideState,
  type Egg,
  type EventModifierEffectType,
  type GameData,
  type ItemReward,
  type SpecialBattle,
  type SpecialBattleKind
} from '../model'
import { battleBiome, closeZoneVisit } from '../world'
import { Draft, log } from './draft'
import { gainBiomeSkillBooks, gainDrop, grantItemRewards } from './rewards'
import { rollGuardianRewards } from './zones'

interface SpecialBattleRule<K extends SpecialBattleKind> {
  /**
   * Trận trên tầng (đếm modifier / chuỗi event, mở tầng khi hạ boss tầng; countsAsFloorBattle):
   * trận event có; thú triều (ở thị trấn) và hiểm địa (map riêng) không.
   */
  isFloorBattle: boolean
  /** Chạy được ở lượt hiện tại của trận không. */
  canFlee(special: Extract<SpecialBattle, { kind: K }>, battle: BattleState): boolean
  /** Có quái xin theo / boss quy phục / Thị Uy (docs/rules/recruit.md) như trận quái hoang. */
  canRecruit: boolean
  canCapture(special: Extract<SpecialBattle, { kind: K }>): boolean
  /** Hệ số tiền thắng trận. */
  moneyMultiplier(special: Extract<SpecialBattle, { kind: K }>): number
  /** % tiền mất khi thua thay cho rewards.losePenaltyPercent; null = như trận thường. */
  lossPenaltyPercent(data: GameData): number | null
  /** Thắng (sau phần thưởng chung, trước finish); `dropMultiplier` = hệ số rơi của trận. */
  onWin(data: GameData, d: Draft, dropMultiplier: number): void
  /** Thua (sau phần thua chung, trước finish). */
  onLoss(data: GameData, d: Draft): void
}

const noop = (): void => {}

/** Thú triều của save (trận thú triều luôn có thú triều đang diễn ra). */
function activeTide(d: Draft): Extract<BeastTideState, { phase: 'active' }> {
  const tide = d.events.beastTide
  if (tide?.phase !== 'active') throw new Error('Trận thú triều nhưng không có thú triều')
  return tide
}

/** Hạ / bắt thú vương: món cố định, một món trong danh sách, sách kỹ năng, trứng hiếm. */
function grantTideCompletion(data: GameData, d: Draft): void {
  const { completion } = data.config.events.beastTide
  grantItemRewards(d, completion.items)
  if (completion.pickOneItemIds.length > 0) {
    let itemId: string
    ;[itemId, d.rng] = pick(d.rng, completion.pickOneItemIds)
    grantItemRewards(d, [{ itemId, count: 1 }])
  }
  const biome = battleBiome(data, d, d.battle)
  const { reusableDropChance } = data.config.skillBook
  gainBiomeSkillBooks(data, d, {
    biome,
    count: completion.skillBooks,
    reusableChance: reusableDropChance
  })
  if (!completion.egg) return
  let egg: Egg | null
  ;[egg, d.rng] = createBiomeBossEgg(data, d.rng, {
    biome,
    floor: d.battle.floor,
    aging: d.options.lifespanEnabled,
    day: dayOf(d.time),
    id: `m${d.nextMonsterId}`,
    origin: { kind: 'beastTide' }
  })
  if (!egg) return
  d.nextMonsterId++
  d.eggs.push(egg)
  log(d, { type: 'eggDropped', eggId: egg.id })
}

/** Thua / rút lui thú triều: cửa hàng đóng closedDays ngày (tính cả hôm nay), hết thú triều. */
export function failBeastTide(data: GameData, d: Pick<Draft, 'time' | 'events'>): number {
  const until = dayOf(d.time) + data.config.events.beastTide.closedDays - 1
  d.events = { ...d.events, beastTide: null, shopClosedUntilDay: until }
  return until
}

export const SPECIAL_BATTLE_RULES: { [K in SpecialBattleKind]: SpecialBattleRule<K> } = {
  // Kết quả sau trận (onWin / onLoss của kết quả startBattle) áp khi rời trận (events/).
  event: {
    isFloorBattle: true,
    canFlee: (special) => !special.noFlee,
    canRecruit: false,
    canCapture: () => true,
    moneyMultiplier: (special) => special.moneyMultiplier,
    lossPenaltyPercent: () => null,
    onWin: noop,
    onLoss: noop
  },
  beastTide: {
    isFloorBattle: false,
    canFlee: () => false,
    canRecruit: false,
    // Chỉ bắt được thú vương; bắt được cũng là hạ thú vương (hết thú triều).
    canCapture: (special) => special.king,
    moneyMultiplier: () => 1,
    lossPenaltyPercent: (data) => data.config.events.beastTide.lossMoneyPercent,
    onWin(data, d, dropMultiplier) {
      const tide = activeTide(d)
      const config = data.config.events.beastTide
      for (const drop of config.waveDrops) {
        let dropped: boolean
        ;[dropped, d.rng] = rollPercent(d.rng, Math.min(100, drop.chance * dropMultiplier))
        if (dropped) gainDrop(d, drop.itemId, 1)
      }
      if (d.battle.special?.kind === 'beastTide' && d.battle.special.king) {
        log(d, { type: 'beastTideCleared' })
        grantTideCompletion(data, d)
        d.events = { ...d.events, beastTide: null }
        return
      }
      const cleared = tide.cleared + 1
      log(d, { type: 'beastTideWaveWon', cleared, waves: tide.waves })
      d.events = { ...d.events, beastTide: { ...tide, cleared } }
    },
    onLoss(data, d) {
      log(d, { type: 'beastTideFailed', shopClosedUntilDay: failBeastTide(data, d) })
    }
  },
  // Hiểm địa (docs/rules/zones.md): chạy / bắt như trận thường, thua mất tiền như thường.
  zone: {
    isFloorBattle: false,
    canFlee: () => true,
    canRecruit: false,
    canCapture: () => true,
    moneyMultiplier: () => 1,
    lossPenaltyPercent: () => null,
    onWin(data, d) {
      // Thắng trận thường / tinh anh: không hồi máu (người chơi tự dùng vật phẩm giữa các bước).
      if (d.battle.special?.kind !== 'zone' || !d.battle.special.guardian) return
      const zone = data.zones[d.battle.special.zoneId]
      log(d, { type: 'zoneCompleted', zoneId: zone.id })
      let rewards: ItemReward[]
      ;[rewards, d.rng] = rollGuardianRewards(data, d.rng, { zone, options: d.options })
      grantItemRewards(d, rewards)
      d.zones = closeZoneVisit(data, d)
    },
    onLoss(data, d) {
      if (d.battle.special?.kind !== 'zone') return
      log(d, { type: 'zoneFailed', zoneId: d.battle.special.zoneId })
      d.zones = closeZoneVisit(data, d)
    }
  },
  // Câu cá / khai thác (docs/rules/gathering.md): trận quái hoang trên tầng; phục kích thì không
  // chạy được ở lượt đầu.
  gathering: {
    isFloorBattle: true,
    canFlee: (special, battle) => !special.ambush || battle.turn > 1,
    canRecruit: true,
    canCapture: () => true,
    moneyMultiplier: () => 1,
    lossPenaltyPercent: () => null,
    onWin: noop,
    onLoss: noop
  }
}

/** Gọi luật theo loại của trận đặc biệt (giữ kiểu khớp giữa special và luật của nó). */
export function specialRule(special: SpecialBattle): SpecialBattleRule<SpecialBattleKind> {
  // Ép kiểu: bảng theo đúng loại của special (mapped type), TypeScript không tự thu hẹp theo key.
  return SPECIAL_BATTLE_RULES[special.kind] as SpecialBattleRule<SpecialBattleKind>
}

/**
 * Trận trên tầng (docs/rules/events.md): trận quái hoang / boss / ngự thú sư gặp trên tầng / trận do
 * event mở; không tính bí cảnh, tháp, độ kiếp, đạo quán, giải đấu, đấu trường, thú triều, hiểm địa. Chỉ trận
 * này mới đếm thời hạn modifier, trận thắng của chuỗi event và nhận hệ số của modifier.
 */
export function countsAsFloorBattle(battle: BattleState): boolean {
  if (battle.trial || battle.tribulation) return false
  if (battle.special && !specialRule(battle.special).isFloorBattle) return false
  return !battle.trainer || battle.trainer.mode === 'floor' || battle.trainer.mode === 'event'
}

/** Hệ số % của modifier cho trận này (trận không phải trận trên tầng: 1). */
export const floorModifierMultiplier = (
  data: GameData,
  d: Draft,
  type: EventModifierEffectType
): number =>
  countsAsFloorBattle(d.battle) ? eventModifierMultiplier(data, d.events.modifiers, type) : 1

/** Hết trận trên tầng: modifier theo số trận giảm 1, hết thì mất. */
export function tickModifiers(d: Draft): void {
  if (!countsAsFloorBattle(d.battle)) return
  d.events = { ...d.events, modifiers: tickModifierList(d.events.modifiers) }
}

/** Thắng trận trên tầng: chuỗi event mở ở tầng ≤ tầng của trận bớt 1 trận (không dưới 0). */
export function countChainWin(d: Draft): void {
  if (!countsAsFloorBattle(d.battle)) return
  const chains = d.events.chains.map((chain) =>
    chain.floor <= d.battle.floor && chain.battlesLeft > 0
      ? { ...chain, battlesLeft: chain.battlesLeft - 1 }
      : chain
  )
  d.events = { ...d.events, chains }
}
