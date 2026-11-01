// Tạo game mới: random sẵn các ứng viên quái khởi đầu từ seed, người chơi chọn một.
// Cùng seed luôn ra cùng ứng viên, nên màn chọn hiển thị đúng con sẽ nhận.

import { newEventState } from '../events'
import { newTamerState } from '../tamer'
import { defaultGameOptions, newLabState, restockLab, rollExpeditionBoard } from '../progression'
import { refillQuestBoard } from '../quests'
import {
  newInstabilityState,
  newSafariState,
  newZoneState,
  rollFloorBiome,
  rollMonster
} from '../world'
import { canHaveGmaxFactor, createInventory } from '../inventory'
import { rollShopStock } from '../shop'
import {
  ActionError,
  BIG_ONE,
  malformedAction,
  createRng,
  shuffle,
  toBig,
  type RngState
} from '../shared'
import {
  newAchievementState,
  newCapacityState,
  newDexState,
  newTitleState,
  normalizeNickname,
  syncDex
} from '../roster'
import { startHistory } from '../monster'
import { bindContract } from '../tamer'
import { ageDaysAtPercent, isStarterEligible, newGameStats, starterSlotPool } from '../registries'
import {
  SAVE_VERSION,
  newAlchemyState,
  newCookingState,
  newGatheringState,
  newSmithingState,
  newTrainerState
} from './reducer'
import {
  dayOf,
  SEXED_GENDERS,
  type GameData,
  type GameState,
  type Gender,
  type Monster
} from '../model'

/** Id của quái khởi đầu (quái đầu tiên của game). */
const STARTER_ID = 'm1'

/** Quái khởi đầu random đều trong `pool`: level cố định, tuổi cố định, loài mang được Gmax Factor thì luôn có. */
function rollStarterMonster(
  data: GameData,
  rng: RngState,
  { pool, lifespanEnabled }: { pool: readonly string[]; lifespanEnabled: boolean }
): [Monster, RngState] {
  const { starter } = data.config
  const [monster, after] = rollMonster(
    data,
    rng,
    {
      encounters: pool.map((speciesId) => ({ speciesId, weight: 1 })),
      levelMin: starter.level,
      levelMax: starter.level,
      geneMultiplier: BIG_ONE,
      shinyChance: data.config.shiny.wildChance,
      aging: lifespanEnabled
    },
    STARTER_ID
  )
  // Tuổi khởi đầu cố định (không tốn RNG): % thọ nguyên của config.lifespan.spawnAgePercent.
  const ageDays = ageDaysAtPercent(data, monster, data.config.lifespan.spawnAgePercent.starter)
  const gmaxFactor = canHaveGmaxFactor(data, monster.speciesId)
  return [{ ...monster, ageDays, gmaxFactor }, after]
}

/**
 * Random một ứng viên cho mỗi ô khởi đầu (docs/rules/starters.md): loài random đều trong danh sách
 * của ô, không trùng loài ô trước (ô hết loài thì bỏ), rồi xáo vị trí hiển thị; level cố định,
 * gen, trait và tỉ lệ shiny như quái hoang (config.shiny.wildChance); loài mang được Gmax Factor
 * thì luôn có.
 */
export function rollStarters(
  data: GameData,
  seed: number,
  lifespanEnabled = false
): { candidates: Monster[]; rng: RngState } {
  let rng = createRng(seed)
  const candidates: Monster[] = []
  for (const slot of data.config.starter.slots) {
    const pool = starterSlotPool(data, slot).filter(
      (speciesId) => !candidates.some((m) => m.speciesId === speciesId)
    )
    if (pool.length === 0) continue
    let monster: Monster
    ;[monster, rng] = rollStarterMonster(data, rng, { pool, lifespanEnabled })
    candidates.push(monster)
  }
  // Vị trí các ô trên màn chọn cũng random (không có "ô 1 luôn là Mega"), để người chơi tự khám phá.
  const [shuffled, afterShuffle] = shuffle(rng, candidates)
  return { candidates: shuffled, rng: afterShuffle }
}

/**
 * Quái khởi đầu của một loài đã mở khóa (docs/rules/starters.md): random gen / trait / shiny từ RNG
 * sau các ô, nên cùng seed + cùng loài luôn ra cùng con (màn chọn hiển thị đúng con sẽ nhận).
 * Không kiểm tra loài đã mở hay chưa (createNewGame kiểm).
 */
export function rollUnlockedStarter(
  data: GameData,
  seed: number,
  { speciesId, lifespanEnabled = false }: { speciesId: string; lifespanEnabled?: boolean }
): { monster: Monster; rng: RngState } {
  const { rng } = rollStarters(data, seed, lifespanEnabled)
  const [monster, after] = rollStarterMonster(data, rng, { pool: [speciesId], lifespanEnabled })
  return { monster, rng: after }
}

/**
 * Quái khởi đầu đã chọn: ứng viên của các ô, hoặc loài đã mở khóa (thuộc `unlockedStarterIds` và
 * vẫn làm khởi đầu được với dữ liệu hiện tại); loài khác → notStarter.
 */
function pickStarter(
  data: GameData,
  options: NewGameOptions,
  lifespanEnabled: boolean
): { monster: Monster; rng: RngState } {
  const speciesId = options.starterSpeciesId
  const { candidates, rng } = rollStarters(data, options.seed, lifespanEnabled)
  const candidate = candidates.find((m) => m.speciesId === speciesId)
  if (candidate) return { monster: candidate, rng }
  const isUnlocked =
    (options.unlockedStarterIds ?? []).includes(speciesId) && isStarterEligible(data, speciesId)
  if (!isUnlocked) throw new ActionError('notStarter', { speciesId })
  return rollUnlockedStarter(data, options.seed, { speciesId, lifespanEnabled })
}

export interface NewGameOptions {
  seed: number
  starterSpeciesId: string
  gender: Gender
  nickname: string | null
  /** Bật thọ nguyên cho game này (lifespan.md); bỏ trống = tắt. */
  lifespanEnabled?: boolean
  /** Bật chết thật cho game này (options.md); bỏ trống = tắt. */
  permadeathEnabled?: boolean
  /** Loài khởi đầu đã mở khóa xuyên save (profile.json, docs/rules/starters.md); bỏ trống = chưa có. */
  unlockedStarterIds?: readonly string[]
}

/** Game mới ở thị trấn, mới mở tầng 1, đội gồm quái khởi đầu đã chọn, kèm tiền và vật phẩm ban đầu. */
export function createNewGame(data: GameData, options: NewGameOptions): GameState {
  const { starter } = data.config
  const gameOptions = defaultGameOptions({
    lifespanEnabled: options.lifespanEnabled ?? false,
    permadeathEnabled: options.permadeathEnabled ?? false
  })
  const { lifespanEnabled } = gameOptions
  const { monster: chosen, rng: afterStarters } = pickStarter(data, options, lifespanEnabled)
  // Loài không giới tính chỉ nhận 'none'; loài có giới tính chỉ nhận đực / cái.
  const allowed: readonly Gender[] = chosen.gender === 'none' ? ['none'] : SEXED_GENDERS
  if (!allowed.includes(options.gender)) throw malformedAction('giới tính không hợp lệ')
  // Lý lịch: nhận ở thị trấn lúc bắt đầu game (metFloor null).
  // Quái khởi đầu khế ước với ngự thú sư cảnh giới 0.
  const monster: Monster = bindContract(
    startHistory(
      {
        ...chosen,
        gender: options.gender,
        nickname: normalizeNickname(data, options.nickname),
        affinity: data.config.affinity.start.starter
      },
      { kind: 'starter' },
      { day: dayOf(data.config.clock.startHour), floor: null, level: chosen.level }
    ),
    0
  )
  // Bắt đầu ở thị trấn nên random hàng của cửa hàng ngay (sau khi random quái khởi đầu), rồi tới
  // map của tầng 1 (tầng 1 cũng random như mọi tầng; tung sau để không đổi quái khởi đầu / hàng).
  const inventory = createInventory(starter.items)
  const shop = rollShopStock(data, afterStarters, {
    highestFloor: 1,
    nextItemId: 1,
    inventory,
    options: gameOptions,
    party: [monster]
  })
  const [firstBiomeId, afterBiome] = rollFloorBiome(data, shop.rng)
  // Bảng thám hiểm đầu tiên, làm mới sau refreshDays ngày (docs/rules/expeditions.md).
  const [expeditionBoard, rng] = rollExpeditionBoard(data, afterBiome)
  // Bảng nhiệm vụ đủ nhiệm vụ ngay từ đầu (docs/rules/quests.md); quái khởi đầu vào Bộ sưu tập.
  const state = refillQuestBoard(data, {
    version: SAVE_VERSION,
    location: { type: 'town' },
    highestFloor: 1,
    floorBiomeIds: [firstBiomeId],
    rng,
    money: toBig(starter.money),
    party: [monster],
    storage: [],
    inventory,
    shop: { stock: shop.stock },
    market: { saturation: {} },
    eggs: [],
    nextMonsterId: 2,
    nextItemId: shop.nextItemId,
    teraOrbCharged: true,
    time: data.config.clock.startHour,
    options: gameOptions,
    dayEvents: [],
    tamer: newTamerState(),
    formations: { known: [], active: null },
    alchemy: newAlchemyState(),
    smithing: newSmithingState(),
    cooking: newCookingState(),
    trainers: newTrainerState(),
    trial: null,
    spiritPools: [],
    tower: { highest: 0 },
    instability: newInstabilityState(),
    favor: {},
    events: newEventState(),
    recruit: { bait: null },
    safari: newSafariState(),
    lab: newLabState(),
    capacity: newCapacityState(),
    zones: newZoneState(),
    gathering: newGatheringState(),
    worldBoss: { current: null, rewards: [] },
    dex: newDexState(),
    research: {},
    stats: newGameStats(),
    achievements: newAchievementState(),
    titles: newTitleState(),
    garden: { plots: Array.from({ length: data.config.alchemy.initialPlots }, () => null) },
    quests: { board: [], active: [], nextQuestId: 1 },
    expeditions: {
      board: expeditionBoard,
      refreshDay: dayOf(data.config.clock.startHour) + data.config.expeditions.refreshDays,
      active: [],
      nextId: 1
    },
    battle: null
  })
  // Phòng Thí Nghiệm có hàng ngay từ đầu (docs/rules/implant.md); tung sau cùng để không đổi quái
  // khởi đầu, hàng cửa hàng, bảng thám hiểm / nhiệm vụ.
  return syncDex(data, restockLab(data, state, dayOf(state.time)))
}
