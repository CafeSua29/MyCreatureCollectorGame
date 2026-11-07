// Bậc sao (NPC fusing ở thị trấn, docs/rules/star-rank.md; Fomon / "lên sao" của gacha): ghép quái
// cùng chuỗi tiến hóa vào quái chính, mỗi bản +1 vào starCopies, đủ bản thì lên sao (+% mọi chỉ số).
// Khác hiến tế (cùng race, +1% mỗi stack): đòi cùng chuỗi tiến hóa, mỗi sao cần nhiều bản hơn sao trước.

import { evolutionLineOf } from '../inventory'
import { findIdleOwned } from '../roster'
import { ActionError, parseIdList, spendMoney, type Decimal } from '../shared'
import { addMilestone } from '../monster'
import { starFeedWorth, starsFromCopies, starUpCost } from '../registries'
import { dayOf, type GameData, type GameState, type Monster } from '../model'
import { assertFeedsLosable, consumeFeeds } from './feeding'

// UI / mô phỏng đọc số sao qua '@core' (registries không phải API công khai).
export { starsOf } from '../registries'

/**
 * Quái `feed` ghép sao được vào `monster`: feed không fuse và loài của nó nằm trong chuỗi tiến hóa của
 * loài gốc quái chính (quái fuse so theo baseSpeciesId; dạng nào trong chuỗi cũng được).
 */
export function canStarFeed(data: GameData, monster: Monster, feed: Monster): boolean {
  if (feed.fused || feed.id === monster.id) return false
  return evolutionLineOf(data, monster.baseSpeciesId).includes(feed.speciesId)
}

/** Kết quả xem trước một lần ghép sao. */
export interface StarUpPreview {
  fromStars: number
  toStars: number
  /** Tổng số bản sau khi ghép. */
  copies: number
  cost: Decimal
}

/**
 * Xem trước ghép các quái nguyên liệu vào quái chính (không kiểm tra điều kiện): số sao trước / sau,
 * giá (chỉ trả cho các sao lên được). Tổng số bản vượt số nguyên an toàn thì starCopiesLimit.
 */
export function previewStarUp(
  data: GameData,
  monster: Monster,
  feeds: readonly Monster[]
): StarUpPreview {
  const config = data.config.stars
  const copies = feeds.reduce((sum, feed) => sum + starFeedWorth(feed), monster.starCopies)
  if (!Number.isSafeInteger(copies)) {
    throw new ActionError('starCopiesLimit', { max: Number.MAX_SAFE_INTEGER })
  }
  const fromStars = starsFromCopies(config, monster.starCopies)
  const toStars = starsFromCopies(config, copies)
  return { fromStars, toStars, copies, cost: starUpCost(config, fromStars, toStars) }
}

/** Lệnh ghép sao: quái chính và danh sách quái nguyên liệu (ít nhất 1, không trùng). */
export interface StarUpOrder {
  monsterId: string
  feedIds: readonly string[]
  /** Xác nhận bỏ món đang lắp không đủ chỗ về túi (docs/rules/capacity.md). */
  discardOverflow?: boolean
}

/** NPC fusing ở thị trấn: ghép một hoặc nhiều quái nguyên liệu vào quái chính để lên sao. */
export function starUp(data: GameData, state: GameState, order: StarUpOrder): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const feedIds = parseIdList(order.feedIds, 'feedIds')
  if (feedIds.includes(order.monsterId)) throw new ActionError('starFeedSameMonster')
  const monster = findIdleOwned(state, order.monsterId)
  const feeds = feedIds.map((id) => findIdleOwned(state, id))
  for (const feed of feeds) {
    if (!canStarFeed(data, monster, feed)) {
      throw new ActionError('starFeedMismatch', { monsterId: monster.id, feedId: feed.id })
    }
  }
  assertFeedsLosable(data, state, { feeds, discardOverflow: order.discardOverflow })
  const preview = previewStarUp(data, monster, feeds)
  const paid = spendMoney(state, preview.cost)
  let receiver: Monster = { ...monster, starCopies: preview.copies }
  if (preview.toStars > preview.fromStars) {
    receiver = addMilestone(data, receiver, {
      day: dayOf(state.time),
      kind: 'starredUp',
      from: preview.fromStars,
      to: preview.toStars
    })
  }
  return consumeFeeds(data, { state, paid }, { receiver, feeds })
}
