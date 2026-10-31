// Nâng save cũ lên cấu trúc GameState hiện tại. Mỗi lần tăng SAVE_VERSION thì thêm một bước
// vào MIGRATIONS: hàm nhận state ở version n (kèm dữ liệu game nếu bước đó cần, ví dụ thọ nguyên
// theo loài), trả về state ở version n + 1.
// Từ v7, trường Decimal lưu bằng chuỗi; bước cuối deserializeState đổi chuỗi thành Decimal.

import {
  asObject,
  BIG_ZERO,
  cloneData,
  countMilestonesReached,
  DataError,
  hashToUnit,
  parseBig
} from '../shared'
import { ageDaysAtPercent, isDexSpecies } from '../registries'
import { newBattleTamer } from '../tamer'
import { masteryExpForLevel } from '../monster'
import { gymElementIds } from '../world'
import { mapBigFieldsInPlace } from './bigFields'
import { SAVE_VERSION } from './reducer'
import type { CapacityKind, GameData, GameState, Monster } from '../model'

type SaveObject = Record<string, unknown> & { version: number }
type RawMonster = Record<string, unknown>

/**
 * v8 → v9: vùng cố định cũ thành tầng (mục "Tầng và biome"): Đồng cỏ = tầng 1, Núi lửa = tầng 2.
 * Viết cứng vì đây là dữ liệu lịch sử của save cũ, không đổi theo dữ liệu game.
 */
const LEGACY_ZONE_FLOORS: Readonly<Record<string, number>> = { meadow: 1, volcano: 2 }
/** Save cũ vốn đi được mọi vùng, nên mở sẵn cả hai tầng. */
const LEGACY_HIGHEST_FLOOR = 2

/** Tầng của vùng cũ; vùng lạ trả về undefined để validateGameState báo lỗi. */
const legacyFloor = (zoneId: unknown): number | undefined =>
  typeof zoneId === 'string' && Object.hasOwn(LEGACY_ZONE_FLOORS, zoneId)
    ? LEGACY_ZONE_FLOORS[zoneId]
    : undefined

function migrateZonesToFloors(save: SaveObject): SaveObject {
  const location = save.location as { type?: unknown; zoneId?: unknown } | undefined
  const battle = save.battle as Record<string, unknown> | null
  const { zoneId: _battleZoneId, ...battleRest } = battle ?? {}
  return {
    ...save,
    version: 9,
    highestFloor: LEGACY_HIGHEST_FLOOR,
    location:
      location?.type === 'zone' ? { type: 'floor', floor: legacyFloor(location.zoneId) } : location,
    battle: battle ? { ...battleRest, floor: legacyFloor(battle.zoneId) } : null
  }
}

/** Áp fn lên mọi quái trong save: đội, kho, quái hoang và quái đã bắt trong trận. */
function mapAllMonsters(save: SaveObject, fn: (m: RawMonster) => RawMonster): SaveObject {
  const mapList = (list: unknown): RawMonster[] => ((list as RawMonster[]) ?? []).map(fn)
  const battle = save.battle as Record<string, unknown> | null
  return {
    ...save,
    party: mapList(save.party),
    storage: mapList(save.storage),
    battle: battle
      ? { ...battle, enemies: mapList(battle.enemies), captured: mapList(battle.captured) }
      : null,
    ...mapSafariVisitMonster(save, fn)
  }
}

/** Quái đang gặp trong khu bảo tồn (docs/rules/safari-zone.md; save từ v54 mới có). */
function mapSafariVisitMonster(
  save: SaveObject,
  fn: (m: RawMonster) => RawMonster
): Partial<SaveObject> {
  const safari = asObject(save.safari)
  const visit = asObject(safari?.visit)
  const encounter = asObject(visit?.encounter)
  const monster = asObject(encounter?.monster)
  if (!safari || !visit || !encounter || !monster) return {}
  return {
    safari: { ...safari, visit: { ...visit, encounter: { ...encounter, monster: fn(monster) } } }
  }
}

/** Áp fn lên quái bên trong mọi trứng (mapAllMonsters không gồm trứng). */
function mapEggMonsters(save: SaveObject, fn: (m: RawMonster) => RawMonster): SaveObject {
  if (!Array.isArray(save.eggs)) return save
  // Trứng hỏng giữ nguyên để validateGameState báo lỗi.
  const eggs = save.eggs.map((value: unknown) => {
    const egg = asObject(value)
    const monster = asObject(egg?.monster)
    return egg && monster ? { ...egg, monster: fn(monster) } : value
  })
  return { ...save, eggs }
}

/** v10 → v11: thêm danh sách trạng thái bất thường rỗng cho mọi quái, kể cả quái trong trứng. */
function addEmptyStatuses(save: SaveObject): SaveObject {
  const addStatuses = (m: RawMonster): RawMonster => ({ ...m, statuses: [] })
  return { ...mapEggMonsters(mapAllMonsters(save, addStatuses), addStatuses), version: 11 }
}

/** v11 → v12: thêm cửa hàng với danh sách hàng rỗng (migrate không có dữ liệu game để random). */
function addEmptyShop(save: SaveObject): SaveObject {
  return { ...save, version: 12, shop: { stock: [] } }
}

/**
 * v12 → v13: trận đang diễn ra có môi trường mặc định (trời quang, không địa hình) cả trận. Viết
 * cứng id vì đây là dữ liệu lịch sử của save cũ, không đổi theo dữ liệu game.
 */
const LEGACY_DEFAULT_FIELD = {
  weather: { id: 'clear', turnsLeft: null },
  terrain: { id: 'none', turnsLeft: null }
}

function addDefaultBattleField(save: SaveObject): SaveObject {
  const battle = save.battle as Record<string, unknown> | null
  return {
    ...save,
    version: 13,
    battle: battle ? { ...battle, field: cloneData(LEGACY_DEFAULT_FIELD) } : null
  }
}

/** v13 → v14: trận đang diễn ra chưa có hiệu ứng theo phe nào. */
function addEmptySideFields(save: SaveObject): SaveObject {
  const battle = save.battle as Record<string, unknown> | null
  const field = asObject(battle?.field)
  return {
    ...save,
    version: 14,
    battle: battle ? { ...battle, field: { ...field, sides: { player: [], enemy: [] } } } : null
  }
}

/** v14 → v15: trận đang diễn ra chưa có hiệu ứng toàn sân đặc biệt (room) nào. */
function addEmptyRooms(save: SaveObject): SaveObject {
  const battle = save.battle as Record<string, unknown> | null
  const field = asObject(battle?.field)
  return {
    ...save,
    version: 15,
    battle: battle ? { ...battle, field: { ...field, rooms: [] } } : null
  }
}

/**
 * Map của tầng trước v16 (luật cũ "tầng N dùng biome thứ (N − 1) mod số biome" với hai biome lúc
 * đó). Viết cứng vì đây là dữ liệu lịch sử của save cũ, không đổi theo dữ liệu game.
 */
const LEGACY_FLOOR_BIOME_IDS: readonly string[] = ['meadow', 'volcano']
/**
 * Giới hạn kỹ thuật khi chuyển save cũ: mỗi tầng một phần tử, nên highestFloor quá lớn (save bị sửa
 * tay) sẽ làm tràn bộ nhớ. Muốn tới tầng này phải hạ một triệu boss tầng nên save thật không chạm.
 */
const MAX_LEGACY_FLOORS = 1_000_000

/**
 * v15 → v16: map của tầng được tung ngẫu nhiên và lưu trong save (mục "Tầng và biome"). Save cũ
 * gán các tầng đã mở theo luật cũ để người chơi không thấy map đã đi bị đổi. highestFloor hỏng
 * (không phải số nguyên an toàn ≥ 1) thì để danh sách rỗng cho validateGameState báo lỗi.
 */
function addFloorBiomes(save: SaveObject): SaveObject {
  const { highestFloor } = save
  const count =
    Number.isSafeInteger(highestFloor) && (highestFloor as number) >= 1 ? highestFloor : 0
  if ((count as number) > MAX_LEGACY_FLOORS) {
    throw new DataError([`highestFloor ${String(highestFloor)} quá lớn để chuyển save cũ`])
  }
  return {
    ...save,
    version: 16,
    floorBiomeIds: Array.from(
      { length: count as number },
      (_, i) => LEGACY_FLOOR_BIOME_IDS[i % LEGACY_FLOOR_BIOME_IDS.length]
    )
  }
}

/**
 * v18 → v19: hiệu ứng trait một lần mỗi trận đã dùng (mục "Trait sống sót" ở battle-traits.md). Trận
 * đang diễn ra: chưa dùng hiệu ứng nào.
 */
function addUsedOnce(save: SaveObject): SaveObject {
  const battle = save.battle as Record<string, unknown> | null
  if (!battle) return { ...save, version: 19 }
  return { ...save, version: 19, battle: { ...battle, usedOnce: {} } }
}

/**
 * v16 → v17: trạng thái tạm của quái trên sân (mục "Skill" ở battle.md). Trận đang diễn ra: mỗi
 * quái đang trên sân coi như đã ở trên sân từ lượt 1 (không biết lượt vào sân thật, nên skill chỉ
 * dùng ở lượt đầu không dùng được sau lượt 1), chưa có thế thân / Perish Song.
 */
function addVolatiles(save: SaveObject): SaveObject {
  const battle = save.battle as Record<string, unknown> | null
  if (!battle) return { ...save, version: 17 }
  const slots = [battle.playerSlots, battle.enemySlots].flatMap((s) => (Array.isArray(s) ? s : []))
  const volatiles = Object.fromEntries(
    slots.filter((id) => typeof id === 'string').map((id) => [id, { firstTurn: 1 }])
  )
  return { ...save, version: 17, battle: { ...battle, volatiles } }
}

/**
 * v20 → v21: trait Siralim (mục "Ngôn ngữ trait" ở trait-dsl.md): trận đang diễn ra thêm bản ghi trận
 * (rỗng: chưa ghi gì) và bộ đếm chung (0). Trạng thái tạm / trạng thái trên quái chỉ thêm trường
 * tùy chọn nên không đổi.
 */
function addBattleRecords(save: SaveObject): SaveObject {
  const battle = save.battle as Record<string, unknown> | null
  if (!battle) return { ...save, version: 21 }
  return {
    ...save,
    version: 21,
    battle: {
      ...battle,
      records: {},
      counters: { casts: { player: 0, enemy: 0 }, lastCastSkillId: null, deaths: 0 }
    }
  }
}

/**
 * v21 → v22: trang bị và đồ cầm (mục "Trang bị và đồ cầm" ở equipment.md): mọi quái (kể cả trong
 * trứng, quái hoang, quái đã bắt trong trận) thêm danh sách món đang lắp rỗng; túi thêm phần trang
 * bị rỗng; thêm bộ đếm id món trang bị.
 */
function addEquipment(save: SaveObject): SaveObject {
  const addSlots = (m: RawMonster): RawMonster => ({ ...m, equipment: [] })
  const inventory = asObject(save.inventory)
  return {
    ...mapEggMonsters(mapAllMonsters(save, addSlots), addSlots),
    version: 22,
    // Túi hỏng giữ nguyên để validateGameState báo lỗi.
    inventory: inventory ? { ...inventory, equipment: [] } : save.inventory,
    nextItemId: 1
  }
}

/**
 * v22 → v23: biến hình trong trận (mục "Biến hình trong trận" ở transformation.md): mọi quái (kể
 * cả trong trứng, quái hoang, quái đã bắt trong trận) có hệ Tera = hệ đầu tiên của nó, không Gmax
 * Factor, cấp Dynamax 0; Tera Orb đang sạc; trận đang diễn ra chưa ai biến hình. Vật phẩm chìa khóa
 * theo highestFloor cần dữ liệu game nên cấp lúc load (grantKeyItems trong parseSave).
 */
function addTransformFields(save: SaveObject): SaveObject {
  const addFields = (m: RawMonster): RawMonster => ({
    ...m,
    teraElementId: Array.isArray(m.elementIds) ? m.elementIds[0] : undefined,
    gmaxFactor: false,
    dynamaxLevel: 0
  })
  const migrated = mapEggMonsters(mapAllMonsters(save, addFields), addFields)
  const battle = migrated.battle as Record<string, unknown> | null
  return {
    ...migrated,
    version: 23,
    teraOrbCharged: true,
    battle: battle
      ? { ...battle, transformsUsed: { player: [], enemy: [] }, plannedTransform: null }
      : null
  }
}

/** v23 → v24: tuổi của quái có sẵn = 20% thọ nguyên (thành niên); viết cứng vì là luật migrate. */
const MIGRATED_AGE_PERCENT = 20

/** Tuổi (ngày) của quái save cũ; quái hỏng (loài lạ...) để 0 cho validateGameState báo lỗi khác. */
function migratedAgeDays(data: GameData, monster: RawMonster): number {
  // Ép kiểu vì chỉ dùng các trường thọ nguyên cần (loài, level, trait, boss, trang bị).
  const probe = { ...monster, lifespanBonusYears: BIG_ZERO } as unknown as Monster
  try {
    return ageDaysAtPercent(data, probe, MIGRATED_AGE_PERCENT)
  } catch {
    // Dữ liệu quái hỏng: tuổi không quan trọng, validateGameState sẽ báo lỗi đúng trường.
    return 0
  }
}

/**
 * v23 → v24 (tuổi và thọ nguyên): đồng hồ về giờ bắt đầu, bật thọ nguyên, mọi quái thêm trường
 * tuổi (quái trong trứng tuổi 0).
 */
function addLifeFields(save: SaveObject, data: GameData): SaveObject {
  const lifeOf = (m: RawMonster, ageDays: number): RawMonster => ({
    ...m,
    ageDays,
    aging: true,
    maxLevelReached: m.level,
    lifespanBonusYears: '0',
    itemUseCounts: {}
  })
  const withAges = mapAllMonsters(save, (m) =>
    lifeOf(m, migratedAgeDays(data, { ...m, maxLevelReached: m.level }))
  )
  return {
    ...mapEggMonsters(withAges, (m) => lifeOf(m, 0)),
    version: 24,
    time: data.config.clock.startHour,
    options: { lifespanEnabled: true },
    dayEvents: []
  }
}

/**
 * v24 → v25 (lý lịch quái): quái của người chơi (đội, kho, trứng, quái vừa bắt) nhận lý lịch
 * nguồn gốc "unknown", trường gặp null, chưa có mốc; quái hoang trong trận là null.
 */
function addHistory(save: SaveObject): SaveObject {
  const unknownHistory = (m: RawMonster): RawMonster => ({
    ...m,
    history: {
      origin: { kind: 'unknown' },
      metDay: null,
      metFloor: null,
      metLevel: null,
      milestones: []
    }
  })
  const owned = mapEggMonsters(mapAllMonsters(save, unknownHistory), unknownHistory)
  const battle = owned.battle as Record<string, unknown> | null
  const enemies = ((battle?.enemies as RawMonster[] | undefined) ?? []).map((m) => ({
    ...m,
    history: null
  }))
  return { ...owned, version: 25, battle: battle ? { ...battle, enemies } : null }
}

/**
 * Số tầng mỗi cảnh giới khi nâng save cũ lên v27: cảnh giới = ⌊(highestFloor − 1) / 10⌋ để quái của
 * save cũ không yếu đi so với tầng đã mở (viết cứng vì là luật lịch sử của lần migrate này).
 */
const MIGRATED_FLOORS_PER_REALM = 10

/**
 * v26 → v27 (ngự thú sư và khế ước): ngự thú sư cảnh giới theo tầng cao nhất, EXP 0; quái của
 * người chơi (đội, kho, trứng, quái vừa bắt) khế ước theo cảnh giới đó, quái hoang null; trận đang
 * diễn ra thêm ngự thú sư của người chơi linh lực đầy.
 */
function addTamer(save: SaveObject, data: GameData): SaveObject {
  const highestFloor = save.highestFloor
  const realm =
    Number.isSafeInteger(highestFloor) && (highestFloor as number) >= 1
      ? Math.floor(((highestFloor as number) - 1) / MIGRATED_FLOORS_PER_REALM)
      : 0
  const contract = (m: RawMonster): RawMonster => ({ ...m, contractRealm: realm })
  const owned = mapEggMonsters(mapAllMonsters(save, contract), contract)
  const battle = owned.battle as Record<string, unknown> | null
  const enemies = ((battle?.enemies as RawMonster[] | undefined) ?? []).map((m) => ({
    ...m,
    contractRealm: null
  }))
  const tamers = { player: newBattleTamer(data, realm), enemy: null }
  return {
    ...owned,
    version: 27,
    tamer: { realm, exp: '0' },
    battle: battle ? { ...battle, enemies, tamers } : null
  }
}

/** Thân mật của quái người chơi khi nâng save cũ lên v28 (luật lịch sử của lần migrate này). */
const MIGRATED_AFFINITY = 70

/**
 * v27 → v28 (độ thân mật): quái của người chơi (đội, kho, trứng, quái vừa bắt) thân mật 70, quái
 * hoang trong trận 0.
 */
function addAffinity(save: SaveObject): SaveObject {
  const owned = (m: RawMonster): RawMonster => ({ ...m, affinity: MIGRATED_AFFINITY })
  const migrated = mapEggMonsters(mapAllMonsters(save, owned), owned)
  const battle = migrated.battle as Record<string, unknown> | null
  const enemies = ((battle?.enemies as RawMonster[] | undefined) ?? []).map((m) => ({
    ...m,
    affinity: 0
  }))
  return { ...migrated, version: 28, battle: battle ? { ...battle, enemies } : null }
}

/** v28 → v29 (dưỡng dục, docs/rules/imprinting.md): mọi quái chưa dưỡng dục (null). */
function addImprint(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, imprint: null })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 29 }
}

/** v29 → v30 (tiến hóa có điều kiện, evolution-skills.md): mọi quái chưa hạ boss nào. */
function addBossDefeats(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, bossDefeats: 0 })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 30 }
}

/**
 * v38 → v39 (thức tỉnh, docs/rules/awakening.md): mọi quái chưa thức tỉnh, chưa thất bại, không
 * trọng thương; trận đang dở là trận thường.
 */
function addAwakening(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({
    ...m,
    awakening: 0,
    tribulationFailures: 0,
    injuryBattlesLeft: 0
  })
  const next = mapEggMonsters(mapAllMonsters(save, none), none)
  const battle = asObject(next.battle)
  return { ...next, version: 39, battle: battle ? { ...battle, tribulation: null } : next.battle }
}

/**
 * v44 → v45 (ngự thú sư NPC, docs/rules/trainers.md): mỗi tầng đạo quán đã mở có đạo quán chưa
 * thắng (hệ theo băm tầng trong các hệ có loài hoang, số NPC = min của config), bậc đấu trường 0,
 * chưa dự giải; trận đang dở không phải trận NPC, ngự thú sư trong trận dùng mọi kỹ năng đã mở.
 * Sự kiện đội thám hiểm về của lần trôi thời gian gần nhất: không mang trứng (`eggId: null`).
 */
function addTrainers(save: SaveObject, data: GameData): SaveObject {
  const { every, trainerCount } = data.config.trainers.gym
  const elementIds = gymElementIds(data)
  const highest = typeof save.highestFloor === 'number' ? save.highestFloor : 1
  const gyms: Record<string, unknown>[] = []
  for (let floor = every; floor <= highest; floor += every) {
    const elementId = elementIds[Math.floor(hashToUnit('gym', floor) * elementIds.length)]
    gyms.push({ floor, elementId, trainerCount: trainerCount.min, progress: 0, wins: 0 })
  }
  const battle = asObject(save.battle)
  const tamers = asObject(battle?.tamers)
  const withSkillIds = (tamer: unknown): unknown => {
    const object = asObject(tamer)
    return object ? { ...object, skillIds: null } : tamer
  }
  const dayEvents = Array.isArray(save.dayEvents)
    ? save.dayEvents.map((event: unknown) => {
        const object = asObject(event)
        return object?.type === 'expeditionReturned' ? { ...object, eggId: null } : event
      })
    : save.dayEvents
  return {
    ...save,
    version: 45,
    dayEvents,
    trainers: { gyms, arenaRank: 0, tournament: { lastPeriod: -1, round: null } },
    battle: battle
      ? {
          ...battle,
          trainer: null,
          tamers: tamers
            ? { player: withSkillIds(tamers.player), enemy: withSkillIds(tamers.enemy) }
            : battle.tamers
        }
      : save.battle
  }
}

/**
 * v45 → v46 (bí cảnh và tháp thí luyện, docs/rules/trials.md): không trong bí cảnh, tháp chưa thắng
 * tầng nào; trận đang dở là trận thường.
 */
function addTrials(save: SaveObject): SaveObject {
  const battle = asObject(save.battle)
  return {
    ...save,
    version: 46,
    trial: null,
    tower: { highest: 0 },
    battle: battle ? { ...battle, trial: null } : save.battle
  }
}

/** v46 → v47 (hồn tinh, docs/rules/soul-levels.md): mọi quái (kể cả trứng) cấp 0 mọi chỉ số. */
function addSoulLevels(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({
    ...m,
    soulLevels: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }
  })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 47 }
}

/** v61 → v62 (điểm nỗ lực, docs/rules/effort-values.md): mọi quái (kể cả trứng) 0 điểm. */
function addEffortFields(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({
    ...m,
    effortValues: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }
  })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 62 }
}

/** v69 → v70 (linh dịch, docs/rules/spirit-virus.md): mọi quái (kể cả trứng) chưa từng nhiễm. */
function addSpiritVirus(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, spiritVirus: null })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 70 }
}

/** v72 → v73 (huyết mạch, docs/rules/bloodline.md): mọi quái (kể cả trứng) chưa có độ thuần nào. */
function addBloodlines(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, bloodlines: [] })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 73 }
}

/** v73 → v74 (Âm / Dương hóa, docs/rules/polarity.md): mọi quái (kể cả trứng) không cực. */
function addPolarity(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, polarity: null })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 74 }
}

/** v74 → v75 (hiến tế, docs/rules/sacrifice.md): mọi quái (kể cả trứng) 0 stack hiến tế. */
function addSacrificeStacks(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, sacrificeStacks: 0 })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 75 }
}

/**
 * v75 → v76 (cấy ghép, docs/rules/implant.md): mọi quái (kể cả trứng) chưa cấy; Phòng Thí Nghiệm
 * chưa có hàng, đổi hàng ngay lần qua ngày đầu tiên (restockDay 0).
 */
function addImplants(save: SaveObject): SaveObject {
  const zero = { hp: '0', attack: '0', defense: '0', spAttack: '0', spDefense: '0', speed: '0' }
  const none = (m: RawMonster): RawMonster => ({
    ...m,
    implantBonusStats: { ...zero },
    implantEffects: {},
    implantAttempts: 0,
    implantFails: 0
  })
  const migrated = mapEggMonsters(mapAllMonsters(save, none), none)
  return { ...migrated, lab: { stock: [], restockDay: 0 }, version: 76 }
}

/**
 * v76 → v77 (sức chứa, docs/rules/capacity.md): save cũ không mất gì: số lần mở rộng sẵn đủ để kho
 * / túi chứa hết những gì đang có (sức chứa làm tròn lên bội số perExpansion).
 */
function addCapacity(save: SaveObject, data: GameData): SaveObject {
  const realm = Number(asObject(save.tamer)?.realm ?? 0)
  const milestones = countMilestonesReached(data.config.tamer.realmMilestones, realm)
  const lengthOf = (value: unknown): number => (Array.isArray(value) ? value.length : 0)
  const inventory = asObject(save.inventory)
  const used: Record<CapacityKind, number> = {
    storage: lengthOf(save.storage),
    bag: lengthOf(inventory?.equipment) + lengthOf(inventory?.souls)
  }
  const expansionsFor = (kind: CapacityKind): number => {
    const rule = data.config.capacity[kind]
    const free = rule.base + rule.realmBonus * milestones
    return Math.max(0, Math.ceil((used[kind] - free) / rule.perExpansion))
  }
  return {
    ...save,
    capacity: { storage: expansionsFor('storage'), bag: expansionsFor('bag') },
    version: 77
  }
}

/** v64 → v65 (ability theo loài, docs/rules/abilities.md): mọi quái (kể cả trứng) ô ability thứ nhất. */
function addAbilitySlot(save: SaveObject): SaveObject {
  const first = (m: RawMonster): RawMonster => ({ ...m, abilitySlot: 'first' })
  return { ...mapEggMonsters(mapAllMonsters(save, first), first), version: 65 }
}

/** v49 → v50 (bản mệnh thú, docs/rules/tamer.md): mọi quái (kể cả trứng) bond false. */
function addBond(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, bond: false })
  const withBond = mapEggMonsters(mapAllMonsters(save, none), none)
  const tamer = asObject(save.tamer) ?? {}
  return { ...withBond, version: 50, tamer: { ...tamer, bondDay: null, woundUntilDay: null } }
}

/**
 * v50 → v51 (hồn phách, docs/rules/soul-relics.md): túi chưa có hồn phách; tọa hóa không còn tạo
 * trứng truyền thừa nên bỏ sự kiện `legacyEggCreated` khỏi dayEvents (trứng đã tạo vẫn giữ).
 */
function addSouls(save: SaveObject): SaveObject {
  const inventory = asObject(save.inventory)
  const dayEvents = Array.isArray(save.dayEvents)
    ? save.dayEvents.filter((event) => asObject(event)?.type !== 'legacyEggCreated')
    : save.dayEvents
  return {
    ...save,
    version: 51,
    inventory: inventory ? { ...inventory, souls: [] } : save.inventory,
    dayEvents
  }
}

/**
 * v51 → v52 (thu phục, docs/rules/recruit.md): chưa dùng mồi dụ; trận đang diễn ra không có quái
 * xin theo.
 */
function addRecruit(save: SaveObject): SaveObject {
  const battle = asObject(save.battle)
  return {
    ...save,
    version: 52,
    recruit: { bait: null },
    battle: battle ? { ...battle, recruitOfferId: null } : save.battle
  }
}

/** v52 → v53 (bắt trượt, mục "Bắt trượt" ở battle.md): bản ghi trận của trận đang dở chưa trượt lần nào. */
function addCatchMisses(save: SaveObject): SaveObject {
  const battle = asObject(save.battle)
  const records = asObject(battle?.records)
  if (!battle || !records) return { ...save, version: 53 }
  const withMisses = Object.fromEntries(
    Object.entries(records).map(([id, record]) => [id, { ...asObject(record), catchMisses: 0 }])
  )
  return { ...save, version: 53, battle: { ...battle, records: withMisses } }
}

/**
 * v54 → v55 (tâm linh tương thông, docs/rules/tamer.md mục "Khế ước"): mọi quái (đội, kho, trứng,
 * quái trong trận, quái đang gặp ở khu bảo tồn) chưa có ngày khế ước nào.
 */
function addContractDays(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, contractDays: 0 })
  const mapped = mapEggMonsters(mapAllMonsters(save, none), none)
  const safari = asObject(save.safari)
  const visit = asObject(safari?.visit)
  const encounter = asObject(visit?.encounter)
  const monster = asObject(encounter?.monster)
  const withSafari =
    safari && visit && encounter && monster
      ? { ...safari, visit: { ...visit, encounter: { ...encounter, monster: none(monster) } } }
      : save.safari
  return { ...mapped, version: 55, safari: withSafari }
}

/**
 * v55 → v56 (Bộ sưu tập, docs/rules/dex.md): Dex điền từ quái đang có trong đội và kho (đã sở hữu, kèm
 * đã gặp; loài hiện tại và loài gốc); trứng chưa nở không tính; chưa nhận mốc nào.
 */
function addDex(save: SaveObject, data: GameData): SaveObject {
  const owned: string[] = []
  for (const list of [save.party, save.storage]) {
    for (const value of Array.isArray(list) ? list : []) {
      const monster = asObject(value)
      for (const id of [monster?.speciesId, monster?.baseSpeciesId]) {
        if (typeof id === 'string' && isDexSpecies(data.species[id]) && !owned.includes(id)) {
          owned.push(id)
        }
      }
    }
  }
  return { ...save, version: 56, dex: { seen: [...owned], owned, claimedMilestones: [] } }
}

/**
 * v56 → v57 (Bộ sưu tập kiểu Pokédex, docs/rules/dex.md): shiny đã sở hữu điền từ quái shiny trong đội
 * và kho (loài hiện tại và loài gốc); chưa nhận thưởng Dex map nào.
 */
function addDexShinyAndRegions(save: SaveObject, data: GameData): SaveObject {
  const dex = asObject(save.dex) ?? {}
  const shinyOwned: string[] = []
  for (const list of [save.party, save.storage]) {
    for (const value of Array.isArray(list) ? list : []) {
      const monster = asObject(value)
      if (typeof monster?.shinyStacks !== 'number' || monster.shinyStacks <= 0) continue
      for (const id of [monster.speciesId, monster.baseSpeciesId]) {
        if (typeof id === 'string' && isDexSpecies(data.species[id]) && !shinyOwned.includes(id)) {
          shinyOwned.push(id)
        }
      }
    }
  }
  return { ...save, version: 57, dex: { ...dex, shinyOwned, claimedRegions: [] } }
}

/** v57 → v58 (thiên phú quái, docs/rules/monster-talents.md): mọi quái (kể cả trứng) chưa nâng nút nào. */
function addTalents(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, talentRanks: {} })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 58 }
}

/**
 * v48 → v49 (thú vương, docs/rules/events.md): thú triều đang diễn ra thêm `kingAfter = waves` (như
 * luật cũ: đánh hết đợt mới gặp boss); trận thú triều đang dở là đợt thường (king false).
 */
function addBeastKing(save: SaveObject): SaveObject {
  const events = asObject(save.events)
  const tide = asObject(events?.beastTide)
  const beastTide =
    tide?.phase === 'active' ? { ...tide, kingAfter: tide.waves } : events?.beastTide
  const battle = asObject(save.battle)
  const special = asObject(battle?.special)
  return {
    ...save,
    version: 49,
    events: events ? { ...events, beastTide } : save.events,
    battle:
      battle && special?.kind === 'beastTide'
        ? { ...battle, special: { ...special, king: false } }
        : save.battle
  }
}

/**
 * v47 → v48 (hệ thống event, docs/rules/events.md): không có event chờ, modifier, chuỗi, cửa hàng
 * tạm, thú triều; trận đang dở là trận thường.
 */
function addEvents(save: SaveObject): SaveObject {
  const battle = asObject(save.battle)
  return {
    ...save,
    version: 48,
    events: {
      pending: null,
      log: [],
      modifiers: [],
      chains: [],
      tempShop: null,
      battle: null,
      beastTide: null,
      shopClosedUntilDay: null
    },
    battle: battle ? { ...battle, special: null } : save.battle
  }
}

/** v43 → v44 (tự động đánh, docs/rules/auto-battle.md): mọi quái chiến thuật `balanced`. */
function addTactics(save: SaveObject): SaveObject {
  const balanced = (m: RawMonster): RawMonster => ({ ...m, tactic: 'balanced' })
  return { ...mapEggMonsters(mapAllMonsters(save, balanced), balanced), version: 44 }
}

/**
 * v42 → v43 (thám hiểm, docs/rules/expeditions.md): mọi quái rảnh; chưa có đội nào đi, bảng trống
 * và làm mới ở lần qua ngày kế tiếp.
 */
function addExpeditions(save: SaveObject): SaveObject {
  const free = (m: RawMonster): RawMonster => ({ ...m, assignment: null })
  return {
    ...mapEggMonsters(mapAllMonsters(save, free), free),
    version: 43,
    expeditions: { board: [], refreshDay: 0, active: [], nextId: 1 }
  }
}

/** v39 → v40 (hóa hình, docs/rules/human-form.md): mọi quái chưa hóa hình. */
function addHumanForm(save: SaveObject): SaveObject {
  const locked = (m: RawMonster): RawMonster => ({ ...m, humanForm: 'locked' })
  return { ...mapEggMonsters(mapAllMonsters(save, locked), locked), version: 40 }
}

/**
 * v30 → v31 (phối hợp đội, docs/rules/team.md): chưa học trận pháp nào; trận đang dở không có cộng
 * hưởng / trận pháp (tính lúc vào trận).
 */
function addFormations(save: SaveObject): SaveObject {
  const battle = save.battle as Record<string, unknown> | null
  return {
    ...save,
    version: 31,
    formations: { known: [], active: null },
    battle: battle ? { ...battle, teamBonuses: { player: [], enemy: [] } } : null
  }
}

/** v31 → v32 (thuần thục skill, docs/rules/skill-mastery.md): mọi quái chưa có mục nào (cấp 1). */
function addSkillMastery(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, skillMastery: {} })
  return { ...mapEggMonsters(mapAllMonsters(save, none), none), version: 32 }
}

/**
 * v32 → v33 (thuần thục skill tính ngược từ tổng exp): exp của mỗi mục đổi từ phần trong cấp sang
 * tổng exp = tổng exp của cấp đang có (công thức hiện tại) + phần trong cấp; cấp giữ nguyên. Mục
 * hỏng giữ nguyên để kiểm tra save báo lỗi.
 */
function totalMasteryExp(save: SaveObject, data: GameData): SaveObject {
  const convert = (m: RawMonster): RawMonster => {
    const record = asObject(m.skillMastery)
    if (!record) return m
    const skillMastery: Record<string, unknown> = {}
    for (const [skillId, raw] of Object.entries(record)) {
      const entry = asObject(raw)
      const exp = parseBig(entry?.exp)
      const level = entry?.level
      skillMastery[skillId] =
        entry && exp && Number.isSafeInteger(level) && (level as number) >= 1
          ? {
              ...entry,
              exp: masteryExpForLevel(data, level as number)
                .plus(exp)
                .toString()
            }
          : raw
    }
    return { ...m, skillMastery }
  }
  return { ...mapEggMonsters(mapAllMonsters(save, convert), convert), version: 33 }
}

/**
 * v35 → v36 (tính cách, docs/rules/natures.md): mọi quái (kể cả trứng, quái hoang trong trận) nhận
 * tính cách theo băm của id quái (tất định, không dùng RNG của save, cùng save luôn ra cùng kết quả).
 */
function addNatures(save: SaveObject, data: GameData): SaveObject {
  const natureIds = Object.keys(data.natures)
  const assign = (m: RawMonster): RawMonster => {
    const index = Math.floor(hashToUnit('nature', String(m.id)) * natureIds.length)
    return { ...m, natureId: natureIds[index] }
  }
  return { ...mapEggMonsters(mapAllMonsters(save, assign), assign), version: 36 }
}

/**
 * v36 → v37 (sách kỹ năng, docs/rules/skill-books.md): túi thêm phần sách rỗng, mọi quái (kể cả trứng,
 * quái hoang trong trận) chưa học skill ngoài learnset nào.
 */
function addSkillBooks(save: SaveObject): SaveObject {
  const none = (m: RawMonster): RawMonster => ({ ...m, extraSkillIds: [] })
  const next = mapEggMonsters(mapAllMonsters(save, none), none)
  const inventory = asObject(save.inventory)
  return {
    ...next,
    version: 37,
    inventory: inventory ? { ...inventory, books: [] } : save.inventory
  }
}

const MIGRATIONS: Record<number, (save: SaveObject, data: GameData) => SaveObject> = {
  // v1 → v2: thêm kho quái và danh sách quái đã bắt trong trận.
  1: (save) => {
    const battle = save.battle as Record<string, unknown> | null
    return {
      ...save,
      version: 2,
      storage: [],
      battle: battle ? { ...battle, captured: [] } : null
    }
  },
  // v2 → v3: thêm biệt danh (null) cho mọi quái.
  2: (save) => ({ ...mapAllMonsters(save, (m) => ({ ...m, nickname: null })), version: 3 }),
  // v3 → v4: thêm vị trí người chơi (đang đánh thì ở vùng của trận, không thì thị trấn)
  // và danh sách skill / tiến hóa chờ cho mọi quái.
  3: (save) => {
    const battle = save.battle as { zoneId?: string } | null
    return {
      ...mapAllMonsters(save, (m) => ({ ...m, pendingSkillIds: [], pendingEvolutionIds: [] })),
      version: 4,
      location: battle?.zoneId ? { type: 'zone', zoneId: battle.zoneId } : { type: 'town' }
    }
  },
  // v4 → v5: thêm danh sách trứng; trận đang diễn ra là trận thường.
  4: (save) => {
    const battle = save.battle as Record<string, unknown> | null
    return {
      ...save,
      version: 5,
      eggs: [],
      battle: battle ? { ...battle, isBoss: false } : null
    }
  },
  // v5 → v6: số ô trait lưu trên từng quái. Trước đây quái thường 3 ô, quái fuse 6 ô.
  5: (save) => ({
    ...mapAllMonsters(save, (m) => ({ ...m, traitSlots: m.fused ? 6 : 3 })),
    version: 6
  }),
  // v6 → v7: trường Decimal (tiền, EXP, máu đã mất, gen, fusingBonusStats, số trong log trận)
  // lưu bằng chuỗi thay cho number. Giá trị không phải number giữ nguyên để kiểm tra báo lỗi.
  6: (save) => {
    const next = cloneData(save)
    mapBigFieldsInPlace(next, (value) => (typeof value === 'number' ? String(value) : value))
    return { ...next, version: 7 }
  },
  // v7 → v8: túi đồ chia phần: số lượng theo id cũ thành inventory.stacks, thêm tinh thể rỗng.
  7: (save) => ({ ...save, version: 8, inventory: { stacks: save.inventory ?? {}, crystals: [] } }),
  8: migrateZonesToFloors,
  // v9 → v10: gender thêm giá trị 'none' (loài không giới tính). Save cũ chỉ có đực / cái nên
  // không đổi dữ liệu; quái sai giới tính so với loài do validateGameState báo.
  9: (save) => ({ ...save, version: 10 }),
  10: addEmptyStatuses,
  11: addEmptyShop,
  12: addDefaultBattleField,
  13: addEmptySideFields,
  14: addEmptyRooms,
  15: addFloorBiomes,
  16: addVolatiles,
  // v17 → v18: trạng thái tạm thêm số quái đã hạ gục (knockouts, tùy chọn). Save cũ không có
  // nghĩa là chưa hạ quái nào nên không đổi dữ liệu.
  17: (save) => ({ ...save, version: 18 }),
  18: addUsedOnce,
  // v19 → v20: trạng thái tạm thêm trait đã hút skill và đang tăng sát thương (absorbBoosts, tùy
  // chọn, kiểu Flash Fire). Save cũ không có nghĩa là chưa hút nên không đổi dữ liệu.
  19: (save) => ({ ...save, version: 20 }),
  20: addBattleRecords,
  21: addEquipment,
  22: addTransformFields,
  23: addLifeFields,
  24: addHistory,
  // v25 → v26: giá thị trường động, chưa bán gì (world-items.md).
  25: (save) => ({ ...save, version: 26, market: { saturation: {} } }),
  26: addTamer,
  27: addAffinity,
  28: addImprint,
  29: addBossDefeats,
  30: addFormations,
  31: addSkillMastery,
  32: totalMasteryExp,
  // v33 → v34: trạng thái tạm thêm lượt dùng lại skill có hold (holdReadyTurns, tùy chọn; mục
  // "Hold" ở battle.md). Save cũ không có nghĩa là chưa dùng skill hold nào nên không đổi dữ liệu.
  33: (save) => ({ ...save, version: 34 }),
  // v34 → v35: trạng thái tạm thêm thế đã dùng ở lượt trước (styleSpeed, tùy chọn;
  // docs/rules/move-styles.md). Save cũ không có nghĩa là chưa dùng thế nên không đổi dữ liệu.
  34: (save) => ({ ...save, version: 35 }),
  35: addNatures,
  36: addSkillBooks,
  // v37 → v38: battle.teamBonuses thêm loại "partner" (kỹ năng đồng hành, partner-skills.md). Trận
  // đang diễn ra của save cũ chưa bật kỹ năng (bật khi quái đầu đội hồi sinh trong trận).
  37: (save) => ({ ...save, version: 38 }),
  38: addAwakening,
  // v39 → v40: mọi quái chưa hóa hình (docs/rules/human-form.md).
  39: addHumanForm,
  // v40 → v41: luyện đan cấp 1 chưa học đan phương, linh điền 2 ô trống (docs/rules/alchemy.md; số ô
  // viết cứng vì là luật lịch sử của bước này).
  40: (save) => ({
    ...save,
    version: 41,
    alchemy: { level: 1, exp: '0', knownRecipes: [], lastCraft: null },
    garden: { plots: [null, null] }
  }),
  // v41 → v42: chưa nhận nhiệm vụ nào; bảng bổ sung khi vào thị trấn (docs/rules/quests.md).
  41: (save) => ({ ...save, version: 42, quests: { board: [], active: [], nextQuestId: 1 } }),
  42: addExpeditions,
  // v43 → v44: mọi quái chiến thuật mặc định (docs/rules/auto-battle.md).
  43: addTactics,
  44: addTrainers,
  45: addTrials,
  46: addSoulLevels,
  47: addEvents,
  48: addBeastKing,
  // v49 → v50: chưa có bản mệnh thú, chưa từng kết, không đạo thương (docs/rules/tamer.md).
  49: addBond,
  50: addSouls,
  51: addRecruit,
  52: addCatchMisses,
  // v53 → v54: khu bảo tồn chưa có danh sách loài, không ở trong khu (docs/rules/safari-zone.md).
  53: (save) => ({
    ...save,
    version: 54,
    safari: { roster: [], refreshDay: 0, visit: null, log: [] }
  }),
  54: addContractDays,
  55: addDex,
  56: addDexShinyAndRegions,
  57: addTalents,
  // v58 → v59: biến hình thêm loại `merge` và trường hợp thể (docs/rules/battle-merge.md); save cũ
  // không có quái nào đang hợp thể nên chỉ đổi version.
  58: (save) => ({ ...save, version: 59 }),
  // v59 → v60: luyện khí cấp 1 (docs/rules/alchemy.md).
  59: (save) => ({ ...save, version: 60, smithing: { level: 1, exp: '0', lastCraft: null } }),
  // v60 → v61: Z-Move (docs/rules/z-moves.md): trận đang diễn ra chưa phe nào dùng Z-Move.
  60: (save) => {
    const battle = save.battle as Record<string, unknown> | null
    return {
      ...save,
      version: 61,
      battle: battle ? { ...battle, zMoveUsed: { player: false, enemy: false } } : null
    }
  },
  61: addEffortFields,
  // v62 → v63: hiểm địa (docs/rules/zones.md): không có lượt vào, mọi hiểm địa mở.
  62: (save) => ({ ...save, version: 63, zones: { visit: null, reopenDay: {} } }),
  // v63 → v64: trạng thái tạm thêm nhật ký trong lượt (turnLog, bỏ ở cuối lượt) và lastSkillFailed
  // (tùy chọn; battle.md mục "Việc trong lượt"). Save cũ chưa có nghĩa là chưa có gì: chỉ đổi version.
  63: (save) => ({ ...save, version: 64 }),
  64: addAbilitySlot,
  // v65 → v66: trạng thái tạm thêm trường chiêu Pokémon (abilitySuppressed, protect.skillId,
  // charging, mustRecharge, lockedMove, skillStreak, turnStartCharge) và battle.delayedAttacks, đều
  // tùy chọn (docs/rules/pokemon-moves.md): save cũ không có nghĩa là không có gì, chỉ đổi version.
  65: (save) => ({ ...save, version: 66 }),
  // v66 → v67: bản ghi trận thêm skillUses, bộ đếm thêm faintTurn (Last Resort, Trump Card,
  // Retaliate; pokemon-moves.md), đều tùy chọn: chỉ đổi version.
  66: (save) => ({ ...save, version: 67 }),
  // v67 → v68: quái thêm battleForm (dạng trong trận), trạng thái tạm thêm bide / carriedBy /
  // commanding / commandedBy / illusionSpeciesId / cudChewTurn, bộ đếm thêm fieldStreaks, biến hình
  // thêm loại ultraBurst (battle-forms.md, pokemon-moves.md): đều tùy chọn, chỉ đổi version.
  67: (save) => ({ ...save, version: 68 }),
  // v68 → v69: vị trí ra đòn và tầm chiêu (docs/rules/hit-locations.md): bản ghi trận thêm
  // partDamagePercent / brokenParts / knockoutPart, trạng thái tạm thêm swoopedUntilTurn, đều tùy
  // chọn: chỉ đổi version.
  68: (save) => ({ ...save, version: 69 }),
  69: addSpiritVirus,
  // v70 → v71: Dex thêm hitParts (bộ phận đã đánh trúng, khám phá điểm yếu; hit-locations.md),
  // trạng thái tạm thêm offBalanceUntilTurn (mất thế, tùy chọn): save cũ chưa đánh trúng gì.
  70: (save) => ({ ...save, version: 71, dex: { ...asObject(save.dex), hitParts: {} } }),
  // v71 → v72 (chết thật, docs/rules/options.md): save cũ tắt chết thật.
  71: (save) => ({
    ...save,
    version: 72,
    options: { ...asObject(save.options), permadeathEnabled: false }
  }),
  72: addBloodlines,
  73: addPolarity,
  74: addSacrificeStacks,
  75: addImplants,
  76: addCapacity,
  // v77 → v78: ấp trứng có hoàn cảnh (docs/rules/breeding-eggs.md): trứng cũ chưa đặt linh thạch nào.
  77: (save) => ({
    ...save,
    version: 78,
    eggs: Array.isArray(save.eggs)
      ? save.eggs.map((value: unknown) => {
          const egg = asObject(value)
          return egg ? { ...egg, infusions: [] } : value
        })
      : save.eggs
  }),
  // v78 → v79: linh thực (docs/rules/cooking.md): cấp nấu ăn 1, chưa ăn món nào.
  78: (save) => ({
    ...save,
    version: 79,
    cooking: { level: 1, exp: '0', lastCraft: null, meal: null }
  })
}

/**
 * Đổi các trường Decimal từ chuỗi (dữ liệu file) sang Decimal. Không ném lỗi: chuỗi không đọc
 * được giữ nguyên để validateGameState báo lỗi kèm đường dẫn trường.
 */
export function deserializeState(raw: unknown): unknown {
  const state = cloneData(raw)
  mapBigFieldsInPlace(state, (value) =>
    typeof value === 'string' ? (parseBig(value) ?? value) : value
  )
  return state
}

/**
 * Nhận dữ liệu save đã parse từ JSON, trả về state ở version hiện tại với Decimal đã đọc. Chưa
 * kiểm tra: nơi gọi phải chạy validateGameState trước khi dùng. Không sửa đầu vào.
 */
export function migrateState(raw: unknown, data: GameData): GameState {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !Number.isSafeInteger((raw as SaveObject).version)
  ) {
    throw new DataError(['save không có version hợp lệ'])
  }
  // Ép kiểu vì đã kiểm tra raw là object có version nguyên ở trên.
  let save = cloneData(raw) as SaveObject
  if (save.version > SAVE_VERSION) {
    throw new DataError([`save version ${save.version} mới hơn game (${SAVE_VERSION})`])
  }
  while (save.version < SAVE_VERSION) {
    const step = MIGRATIONS[save.version]
    if (!step) throw new DataError([`không có migrate cho save version ${save.version}`])
    save = step(save, data)
  }
  // Ép kiểu vì cấu trúc đã đúng version hiện tại; giá trị được validateGameState kiểm tra sau.
  return deserializeState(save) as GameState
}
