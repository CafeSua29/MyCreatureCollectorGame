// Chết thật (docs/rules/options.md): khi bật, quái ta gục trong trận chết hẳn lúc trận kết thúc
// (thắng, thua, chạy), để lại hồn phách như tọa hóa; đội trống thì có quái thay.

import { refillEmptyParty } from '../progression'
import { dieForever, isFainted } from '../monster'
import { aptitudeFloor } from '../registries'
import { woundIfBondDied } from '../tamer'
import { dayOf, type GameData } from '../model'
import { log, removeDeadFromBattle, type Draft } from './draft'

/**
 * Quái ta đã ra sân trong trận này mà đang gục thì chết hẳn (gọi sau khi tách hợp thể / biến hình,
 * trước khi quái vừa bắt vào đội). Quái gục từ trước trận (bật chết thật khi đang gục) không ra sân
 * được nên không bị tính.
 */
export function buryFallen(data: GameData, d: Draft): void {
  if (!d.options.permadeathEnabled) return
  const fallen = d.party.filter(
    (monster) => d.battle.participants.includes(monster.id) && isFainted(data, monster)
  )
  if (fallen.length === 0) return
  const death = { aptitudeFloor: aptitudeFloor(d), day: dayOf(d.time), cause: 'battle' as const }
  for (const monster of fallen) {
    log(d, { type: 'diedInBattle', monsterId: monster.id })
    d.inventory = dieForever(data, d.inventory, monster, death)
    removeDeadFromBattle(d, monster.id)
  }
  // Bản mệnh chết hẳn: ngự thú sư bị đạo thương (docs/rules/tamer.md mục "Bản mệnh thú").
  const wound = woundIfBondDied(data, d, fallen)
  if (wound.bondId) {
    d.tamer = wound.tamer
    log(d, { type: 'bondBroken', monsterId: wound.bondId, woundUntilDay: wound.woundUntilDay })
  }
}

/** Đội trống sau trận (mọi quái chết thật, không bắt được con nào): có quái thay như tọa hóa. */
export function refillAfterBattleDeaths(data: GameData, d: Draft): void {
  if (d.party.length > 0) return
  const { state, event } = refillEmptyParty(data, d)
  Object.assign(d, state)
  if (event) log(d, event)
}
