// Việc theo ngày của thọ nguyên (mục "Thọ tận" ở lifespan.md): mọi quái đang sở hữu già thêm một
// ngày; hết thọ nguyên thì tọa hóa (rời đội / kho, đồ về túi, để lại hồn phách, soul-relics.md); lần
// đầu vượt mốc thì cảnh báo; đội trống thì có quái thay (refillEmptyParty, dùng chung với chết thật).

import { woundIfBondDied } from '../tamer'
import { dieForever, isFainted, keepAlive } from '../monster'
import {
  aptitudeFloor,
  bumpStat,
  hasReachedLifespanEnd,
  lifePercent,
  yearsLeft,
  recordMonsterResearch
} from '../registries'
import {
  dayOf,
  type DayEvent,
  type GameData,
  type GameState,
  type Monster,
  type PartyRefillEvent
} from '../model'
import { hatchMonster } from './eggs'
import { soulToEgg } from './soulRelics'

/** Quái già thêm một ngày; max HP tụt vì tuổi không làm quái đang sống bị gục. */
function ageMonster(data: GameData, monster: Monster): Monster {
  const ageDays = Math.min(Number.MAX_SAFE_INTEGER, monster.ageDays + 1)
  return keepAlive(data, !isFainted(data, monster), { ...monster, ageDays })
}

/**
 * Một ngày trôi qua cho thọ nguyên. Quái không già đi (tắt thọ nguyên) giữ nguyên; trứng chưa nở
 * không tính tuổi.
 */
export function ageOneDay(data: GameData, state: GameState, events: DayEvent[]): GameState {
  const { warnPercent } = data.config.lifespan
  let { inventory } = state
  const death = {
    aptitudeFloor: aptitudeFloor(state),
    day: dayOf(state.time),
    cause: 'oldAge' as const
  }
  const died: Monster[] = []
  const survivors = (monsters: readonly Monster[]): Monster[] =>
    monsters.flatMap((monster) => {
      if (!monster.aging) return [monster]
      const aged = ageMonster(data, monster)
      if (hasReachedLifespanEnd(data, aged)) {
        const { id: monsterId, speciesId, nickname } = aged
        events.push({ type: 'diedOfOldAge', monsterId, speciesId, nickname })
        died.push(aged)
        inventory = dieForever(data, inventory, aged, death)
        return []
      }
      if (lifePercent(data, monster) < warnPercent && lifePercent(data, aged) >= warnPercent) {
        events.push({
          type: 'nearingLifespanEnd',
          monsterId: aged.id,
          yearsLeft: yearsLeft(data, aged)
        })
      }
      return [aged]
    })
  // Tính đội, kho trước: survivors cập nhật inventory.
  const party = survivors(state.party)
  const storage = survivors(state.storage)
  // Bản mệnh tọa hóa: ngự thú sư bị đạo thương (docs/rules/tamer.md mục "Bản mệnh thú").
  const wound = woundIfBondDied(data, state, died)
  if (wound.bondId) {
    events.push({ type: 'bondBroken', monsterId: wound.bondId, woundUntilDay: wound.woundUntilDay })
  }
  const refilled = refillEmptyParty(data, {
    ...state,
    inventory,
    party,
    storage,
    tamer: wound.tamer,
    stats: bumpStat(state.stats, 'oldAgeDeaths', died.length)
  })
  if (refilled.event) events.push(refilled.event)
  return refilled.state
}

/**
 * Đội không được trống sau khi quái chết hẳn (tọa hóa, chết thật trong trận): quái level cao nhất
 * trong kho (bằng level thì con đứng trước) tự vào đội; kho cũng trống thì hồn phách mới nhất tự ấp
 * thành trứng truyền thừa và nở ngay vào đội (Nuzlocke: thua game, đội để trống). Trả sự kiện để
 * nơi gọi báo (null = đội không trống hoặc đã thua game từ trước).
 */
export function refillEmptyParty(
  data: GameData,
  state: GameState
): { state: GameState; event: PartyRefillEvent | null } {
  if (state.party.length > 0 || state.challenge.gameOver) return { state, event: null }
  if (state.storage.length > 0) {
    const strongest = state.storage.reduce((best, monster) =>
      monster.level > best.level ? monster : best
    )
    return {
      state: {
        ...state,
        party: [strongest],
        storage: state.storage.filter((monster) => monster !== strongest)
      },
      event: { type: 'monsterAutoJoined', monsterId: strongest.id }
    }
  }
  // Nuzlocke: đội và kho trống hoàn toàn là thua game, không có trứng truyền thừa cứu
  // (docs/rules/challenge-modes.md).
  if (state.options.nuzlocke) {
    return {
      state: { ...state, challenge: { ...state.challenge, gameOver: true } },
      event: { type: 'gameOver' }
    }
  }
  const soul = state.inventory.souls.at(-1)
  // Đội chỉ trống khi có quái vừa chết hẳn, nên luôn có hồn phách.
  if (!soul) return { state, event: null }
  const { state: incubated, egg } = soulToEgg(data, state, soul.id)
  const [hatched, rng] = hatchMonster(data, incubated.rng, {
    monster: egg.monster,
    day: dayOf(state.time)
  })
  return {
    state: {
      ...incubated,
      rng,
      party: [hatched],
      stats: bumpStat(incubated.stats, 'eggsHatched'),
      research: recordMonsterResearch(data, incubated.research, [hatched], 'hatched')
    },
    event: { type: 'legacyEggHatched', monsterId: egg.monster.id }
  }
}
