// Mã lỗi action + tham số (mục "Mã lỗi action" trong docs/rules/state.md). Renderer dịch theo mã
// (mỗi ngôn ngữ một bảng cùng kiểu với ACTION_ERROR_MESSAGES); câu tiếng Việt ở đây chỉ để debug.
// Thêm mã mới = thêm một mục vào ActionErrorParams + một câu debug; TypeScript báo nếu thiếu.

import type { Decimal } from './big'

/** Mã không có tham số. */
type NoParams = Record<never, never>

export interface ActionErrorParams {
  /** Lệnh sai dạng: chỉ xảy ra khi UI gửi sai (không phải lỗi người chơi), `detail` để debug. */
  malformedAction: { detail: string }
  inBattle: NoParams
  noBattle: NoParams
  wrongBattlePhase: { phase: string; expected: string }
  notInTown: NoParams
  notOnFloor: NoParams
  floorLocked: { floor: number; highestFloor: number }
  noHealthyMonster: NoParams
  partyFullHp: NoParams
  notEnoughMoney: { need: Decimal; have: Decimal }
  /** Thiếu điểm hồn tinh khi nâng cấp hồn tinh (docs/rules/soul-levels.md). */
  notEnoughSoulCrystals: { need: number; have: number }
  // ---------- Thiên phú quái (docs/rules/monster-talents.md) ----------
  unknownTalent: { nodeId: string }
  /** Nhánh race của nút không mở cho race của quái. */
  talentBranchClosed: { nodeId: string; raceId: string }
  talentMaxRank: { nodeId: string; maxRank: number }
  /** Chưa đủ cấp nút yêu cầu. */
  talentRequires: { nodeId: string; requiredId: string; rank: number }
  notEnoughTalentPoints: { need: number; have: number }
  // ---------- Quái ----------
  monsterNotOwned: { monsterId: string }
  monsterNotInParty: { monsterId: string }
  monsterNotInStorage: { monsterId: string }
  partyFull: { partySize: number }
  partyWouldBeEmpty: NoParams
  nicknameTooLong: { maxLength: number }
  notStarter: { speciesId: string }
  // ---------- Trận đấu ----------
  monsterAlreadyActive: { monsterId: string }
  monsterFainted: { monsterId: string }
  monsterChosenTwice: { monsterId: string }
  /** Môi trường (kiểu Fairy Lock) chặn đổi quái / chạy trốn. */
  escapeBlocked: { fieldId: string }
  monsterTrapped: { monsterId: string }
  monsterCannotEnter: { monsterId: string }
  /** Còn ô trống quái dự bị vào được mà chưa chọn thay (phải thay hết mức có thể). */
  replacementIncomplete: { slot: number }
  /** Quái lớn cần mọi ô sân khác của phe trống / cùng rút ra (docs/rules/monster-size.md). */
  largeNeedsAllSlots: { monsterId: string }
  slotNotReplaceable: { slot: number }
  /** Bóng / vật phẩm ném vào quái không phải quái hoang còn sống trên sân. */
  cannotThrowItem: { itemId: string; targetId: string }
  // ---------- Vật phẩm ----------
  unknownItem: { itemId: string }
  notEnoughItem: { itemId: string; have: number; need: number }
  notEnoughCrystals: { traitId: string; level: number; have: number; need: number }
  notEnoughBooks: { skillId: string; reusable: boolean; have: number; need: number }
  itemNotUsable: { itemId: string }
  itemWrongContext: { itemId: string; context: 'field' | 'battle' }
  itemNoEffect: { itemId: string; monsterId: string }
  /** Dùng nhiều cái một lần với vật phẩm không cho phép (chỉ kẹo EXP). */
  itemCountNotAllowed: { itemId: string }
  unknownTrait: { traitId: string }
  // ---------- Extract / inject trait (docs/rules/trait-crystals.md) ----------
  traitNotOnMonster: { monsterId: string; traitId: string }
  /** Loại trait không có tinh thể (shiny, boss...): không extract được. */
  traitNotExtractable: { traitId: string; kind: string }
  traitSlotsFull: { monsterId: string; slots: number }
  /** Gộp cấp thì cấp trait vượt giới hạn số nguyên an toàn. */
  traitLevelLimit: { traitId: string; max: number }
  /** Cộng thêm thì số lượng trong túi vượt giới hạn (Number.MAX_SAFE_INTEGER). */
  stackLimitReached: { max: number }
  // ---------- Cửa hàng ----------
  /** Món không có trong danh sách hàng hiện tại của cửa hàng. */
  notInShop: NoParams
  /** Bùa không bán ở cửa hàng (không có townPrice) hoặc đã có trong túi. */
  charmNotForSale: { itemId: string; reason: 'notSold' | 'owned' }
  /** Bùa chỉ bán khi tầng cao nhất đã mở ≥ `minFloor` (cần câu / cuốc cấp cao). */
  charmFloorLocked: { itemId: string; minFloor: number }
  // ---------- Ấp trứng (docs/rules/breeding-eggs.md) ----------
  eggNotFound: { eggId: string }
  /** Vật phẩm không phải linh thạch theo hệ (config.alchemy.elementStoneItemIds). */
  notSpiritStone: { itemId: string }
  /** Trứng đã đặt đủ số linh thạch tối đa. */
  eggInfusionsFull: { eggId: string; max: number }
  // ---------- Trang bị ----------
  /** Không có món trang bị id này (trong túi, hoặc trong danh sách hàng khi mua). */
  equipmentNotFound: { instanceId: string }
  /** Quái đã lắp đủ số ô. */
  equipmentSlotsFull: { monsterId: string; slots: number }
  /** Món unique của boss chỉ lắp cho quái cùng race với boss (hoặc có race đó trong lineage). */
  equipmentRaceLocked: { itemId: string; raceId: string }
  /** Item không lắp vào ô được (chỉ trang bị và đồ cầm). */
  notEquippable: { itemId: string }
  /** Món đang lắp trên quái: phải tháo trước (phân giải; docs/rules/equipment-forge.md). */
  equipmentEquipped: { instanceId: string; monsterId: string }
  /** Dòng không tẩy luyện được (dòng chính, dòng unique, dòng hồn). */
  lineNotRerollable: { instanceId: string; lineIndex: number }
  /** Món không còn dòng phụ nào để tẩy luyện (không có dòng phụ hoặc khóa hết). */
  nothingToReroll: { instanceId: string }
  // ---------- Hồn phách ----------
  /** Không có hồn phách id này trong túi (docs/rules/soul-relics.md). */
  soulNotFound: { soulId: string }
  // ---------- Skill ----------
  skillNotKnown: { monsterId: string; skillId: string }
  skillOnHold: { monsterId: string; skillId: string; turnsLeft: number }
  /** Quái đang cuồng bạo, không nhận lệnh (docs/rules/frenzy.md). */
  monsterFrenzied: { monsterId: string }
  styleLocked: { monsterId: string; skillId: string; level: number; need: number }
  /** Quái mục tiêu không có bộ phận được nhắm (docs/rules/hit-locations.md). */
  bodyPartMissing: { monsterId: string; partId: string }
  skillSlotFree: NoParams
  mustForgetSkill: { maxSkills: number }
  skillNotPending: { skillId: string }
  cannotRelearnSkill: { skillId: string }
  unknownSkill: { skillId: string }
  /** Sách kỹ năng không có tác dụng (không mất sách): đã biết / đang chờ học, hoặc không tương thích. */
  skillBookNoEffect: { monsterId: string; skillId: string; reason: 'known' | 'incompatible' }
  // ---------- Tiến hóa, breeding, fusing ----------
  notPendingEvolution: { speciesId: string }
  evolutionConditionsUnmet: { speciesId: string }
  notMale: { monsterId: string }
  notFemale: { monsterId: string }
  breedSameMonster: NoParams
  breedGenderless: NoParams
  breedSameGender: NoParams
  breedIncompatible: NoParams
  /** Bố hoặc mẹ đang ở giai đoạn ấu niên (mục "Tuổi và thọ nguyên"). */
  tooYoungToBreed: NoParams
  /**
   * Quái không đang đòi việc chăm sóc này (dưỡng dục, docs/rules/imprinting.md): kind là
   * ImprintRequestKind (shared không import model nên ghi chuỗi).
   */
  imprintNotRequested: { monsterId: string; kind: string }
  fuseSameMonster: NoParams
  fuseNoNewSpecies: { speciesIds: string[] }
  // ---------- Hiến tế (docs/rules/sacrifice.md) ----------
  sacrificeSameMonster: NoParams
  /** Quái phụ khác race hoặc khác lineage với quái chính. */
  sacrificeMismatch: { baseId: string; subId: string }
  /** Stack hiến tế sau khi cộng vượt giới hạn số nguyên an toàn. */
  sacrificeStackLimit: { max: number }
  // ---------- Luân hồi (docs/rules/rebirth.md) ----------
  /** Level chưa đủ cho lần luân hồi kế tiếp. */
  levelTooLowForRebirth: { need: number; have: number }
  // ---------- Cấy ghép (docs/rules/implant.md) ----------
  /** Không có huyết thanh ở vị trí này trong danh sách hàng của Phòng Thí Nghiệm. */
  serumNotFound: { serumIndex: number }
  // ---------- Sức chứa (docs/rules/capacity.md) ----------
  /** Đội đủ ô và kho quái đầy: không nhận thêm quái. */
  rosterFull: { capacity: number }
  /** Túi trang bị đầy: không thêm món trang bị (mua, tháo, đúc). */
  bagFull: { capacity: number }
  /** Món đang lắp trên quái sắp mất không đủ chỗ về túi: phải xác nhận (discardOverflow) để bỏ `lost` món. */
  bagOverflow: { lost: number }
  /** Item không phải bùa fuse dùng được ở ô này (tăng tỉ lệ / hộ mệnh). */
  wrongFusionAid: { itemId: string; slot: 'boost' | 'protect' }
  /** Chọn kế thừa quá số skill cho phép (config.fusion.inheritSkills). */
  tooManyInheritedSkills: { max: number }
  /**
   * Skill không kế thừa được: quái phụ không biết (`notKnownBySub`), quái gốc đã biết (`known`),
   * loại skill không kế thừa (`notInheritable`: chiêu Max, hợp kích...).
   */
  cannotInheritSkill: { skillId: string; reason: 'notKnownBySub' | 'known' | 'notInheritable' }
  /**
   * Không biến hình được (mục "Biến hình trong trận"): kind là TransformKind, reason là
   * TransformFailReason (model/transform.ts; shared không import model nên ghi chuỗi).
   */
  transformUnavailable: { kind: string; reason: string }
  /** Không dùng Z-Move được (docs/rules/z-moves.md): reason là ZMoveFailReason (model/transform.ts). */
  zMoveUnavailable: { monsterId: string; skillId: string; reason: string }
  /** Ném bóng vào quái đang Dynamax. */
  cannotCatchDynamaxed: { monsterId: string }
  /** Vật phẩm chìa khóa không bán / vứt được. */
  keyItemLocked: { itemId: string }
  /** Đổi hệ Tera sang đúng hệ Tera đang có. */
  teraElementUnchanged: { elementId: string }
  teraElementFixed: { speciesId: string }
  /** Bật / tắt tùy chọn luật chơi đúng như nó đang là. */
  optionUnchanged: { option: string; enabled: boolean }
  /** Đột phá cảnh giới ngự thú sư khi chưa đủ EXP (docs/rules/tamer.md). */
  tamerExpTooLow: { need: Decimal; have: Decimal }
  /** Khế ước quái vượt giới hạn level: cần cảnh giới needRealm (docs/rules/tamer.md mục "Khế ước"). */
  tamerRealmTooLow: { monsterId: string; needRealm: number }
  /** Quái đã khế ước rồi. */
  alreadyContracted: { monsterId: string }
  /** Quái chưa khế ước (giải trừ, kết bản mệnh). */
  notContracted: { monsterId: string }
  /** Đã khế ước đủ số quái tối đa của cảnh giới. */
  contractSlotsFull: { max: number }
  // ---------- Thu phục (docs/rules/recruit.md) ----------
  /** Trận vừa thắng không có quái xin theo đang chờ. */
  noRecruitOffer: NoParams
  /** Item không phải mồi dụ. */
  notBait: { itemId: string }
  /** Đang có mồi dụ còn tác dụng (không dùng chồng). */
  baitActive: { itemId: string; battlesLeft: number }
  // ---------- Bộ sưu tập (docs/rules/dex.md) ----------
  dexMilestoneNotFound: { milestoneId: string }
  dexRewardClaimed: { milestoneId: string }
  /** Chưa sở hữu đủ % loài của mốc. */
  dexMilestoneNotReached: { milestoneId: string; need: number; have: number }
  /** Không có map này (Dex theo map). */
  dexRegionNotFound: { biomeId: string }
  dexRegionClaimed: { biomeId: string }
  /** Chưa sở hữu đủ mọi loài của Dex map. */
  dexRegionIncomplete: { biomeId: string; owned: number; total: number }
  // ---------- Nghiên cứu loài (docs/rules/species-research.md) ----------
  researchSpeciesNotFound: { speciesId: string }
  /** Không có thưởng cấp nào đã đạt mà chưa nhận (level = cấp hiện tại). */
  researchNoReward: { speciesId: string; level: number }
  // ---------- Thành tựu và danh hiệu (docs/rules/achievements.md) ----------
  achievementNotFound: { achievementId: string }
  /** Chưa đạt bậc kế tiếp chưa nhận (need = giá trị bậc đó, have = tiến độ hiện tại). */
  achievementNotReached: { achievementId: string; need: number; have: number }
  /** Đã nhận mọi bậc (thành tựu có trần). */
  achievementCompleted: { achievementId: string }
  titleNotFound: { titleId: string }
  titleNotOwned: { titleId: string }
  // ---------- Khu bảo tồn (docs/rules/safari-zone.md) ----------
  /** Đang trong khu bảo tồn: chỉ làm được action của khu. */
  inSafari: NoParams
  /** Action của khu khi không ở trong khu. */
  notInSafari: NoParams
  /** Không có loài nào cho khu (chưa có map / dữ liệu rỗng). */
  safariUnavailable: NoParams
  /** Không dùng được kỹ năng ngự thú sư lúc này (lý do theo TamerSkillBlocker). */
  tamerSkillUnavailable: { skillId: string; reason: TamerSkillBlocker }
  // ---------- Phối hợp đội (docs/rules/team.md) ----------
  /** Item không phải trận đồ. */
  notFormationScroll: { itemId: string }
  formationAlreadyKnown: { formationId: string }
  formationNotKnown: { formationId: string }
  /** Chọn đúng trận pháp đang dùng (hoặc bỏ khi không dùng trận pháp nào). */
  formationUnchanged: { formationId: string | null }
  /** Không dùng được hợp kích kỹ lúc này (lý do theo ComboBlocker). */
  comboUnavailable: { comboId: string; reason: ComboBlocker }
  /** Thức tỉnh (docs/rules/awakening.md): level chưa đủ cho tầng kế tiếp. */
  levelTooLowForAwakening: { need: number; have: number }
  /** Quái đang trọng thương sau độ kiếp thua. */
  injured: { monsterId: string; battlesLeft: number }
  /** Lệnh bị cấm trong trận độ kiếp (vật phẩm, chạy trốn, đổi quái). */
  tribulationRestricted: { command: 'item' | 'flee' | 'switch' }
  /** Hóa hình (docs/rules/human-form.md): chưa hóa hình được. */
  cannotTakeHumanForm: { monsterId: string; reason: 'race' | 'awakeningTooLow' | 'alreadyTaken' }
  /** Đổi dạng khi chưa hóa hình / race không cho nhân hình; đổi đúng dạng đang có. */
  humanFormNotTaken: { monsterId: string }
  purityTooLow: { monsterId: string; purity: number; required: number }
  notAncestor: { monsterId: string; speciesId: string }
  fusedCannotAtavize: { monsterId: string }
  humanFormUnchanged: { monsterId: string; form: string }
  /** Skill ở ô nhân hình đang khóa (quái không ở nhân hình). */
  humanFormSkillLocked: { monsterId: string; skillId: string }
  /** Luyện đan (docs/rules/alchemy.md). */
  recipeUnknown: { recipeId: string }
  recipeNotLearned: { recipeId: string }
  recipeAlreadyKnown: { recipeId: string }
  notRecipeScroll: { itemId: string }
  alchemyLevelTooLow: { need: number; have: number }
  /** Độ kiếp: thiếu Thức tỉnh đan cùng hệ với quái (docs/rules/awakening.md). */
  notEnoughAwakeningPills: { monsterId: string; have: number; need: number }
  /** Luyện khí (Thợ rèn): công thức luyện khí / đúc trang bị cần cấp luyện khí. */
  smithingLevelTooLow: { need: number; have: number }
  cookingLevelTooLow: { need: number; have: number }
  notDish: { itemId: string }
  /** Thiếu nguyên liệu "món bất kỳ trong nhóm" (config.itemGroups). */
  notEnoughGroupItem: { groupId: string; have: number; need: number }
  /** Đúc trang bị: món gốc không đúc được (không phải trang bị thường). */
  notCastable: { itemId: string }
  /** Đúc / phụ linh: hệ không có dòng linh hệ hoặc không có yêu đan. */
  elementNotImbuable: { elementId: string }
  /** Linh điền. */
  notSeed: { itemId: string }
  plotOccupied: { plotIndex: number }
  plotEmpty: { plotIndex: number }
  cropNotReady: { plotIndex: number; daysLeft: number }
  /** Bảng nhiệm vụ (docs/rules/quests.md). */
  questNotFound: { questId: string }
  tooManyQuests: { maxActive: number }
  questNotComplete: { questId: string; progress: number; target: number }
  /** Thám hiểm (docs/rules/expeditions.md). */
  monsterBusy: { monsterId: string }
  expeditionNotOffered: { expeditionId: string }
  expeditionSlotsFull: { slots: number }
  expeditionRequirementUnmet: { expeditionId: string; requirement: string }
  expeditionNotFound: { expeditionActiveId: string }
  /** Ngự thú sư NPC (docs/rules/trainers.md): trận NPC không bắt / không chạy. */
  trainerBattleRestricted: { command: 'ball' | 'flee' }
  noGym: { floor: number }
  tournamentNotOpen: { nextDay: number }
  tournamentInProgress: NoParams
  noTournament: NoParams
  // ---------- Bí cảnh và tháp thí luyện (docs/rules/trials.md) ----------
  /** Lệnh bị cấm trong bí cảnh / tháp: bắt, chạy, vật phẩm (luật noItems / noHealing). */
  trialRestricted: { command: 'ball' | 'flee' | 'item' }
  /** Đang đi bí cảnh: không hồi máu ở thị trấn, không rời thị trấn, không vào trận khác. */
  trialInProgress: NoParams
  noTrial: NoParams
  /** Độ bất ổn tầng (docs/rules/instability.md). */
  instabilityLevelTooHigh: { level: number; max: number }
  instabilityUnchanged: { level: number }
  instabilityOff: NoParams
  /** Thần linh và ân sủng (docs/rules/deities.md). */
  unknownDeity: { deityId: string }
  deityItemNotSold: { deityId: string; itemId: string }
  blessingRankTooLow: { deityId: string; rank: number; need: number }
  /** Không còn quái được vào trận theo luật (luật một hệ: hệ `elementId`). */
  noEligibleFighter: { elementIds: string[] }
  // ---------- Hiểm địa (docs/rules/zones.md) ----------
  zoneNotFound: { zoneId: string }
  /** Điều kiện vào thứ `index` (loại `requirementType`) của hiểm địa chưa đạt. */
  zoneRequirementUnmet: { zoneId: string; index: number; requirementType: string }
  /** Hiểm địa đang khóa sau lượt vào trước, mở lại từ ngày `reopenDay`. */
  zoneClosed: { zoneId: string; reopenDay: number }
  /** Đang trong hiểm địa: không hồi máu ở thị trấn, không rời thị trấn, không vào phó bản khác. */
  zoneInProgress: NoParams
  noZoneVisit: NoParams
  // ---------- Câu cá và khai thác (docs/rules/gathering.md) ----------
  /** Map của tầng đang đứng không có chỗ câu cá / mỏ. */
  gatheringUnavailable: { method: string; biomeId: string }
  /** Chưa có dụng cụ (cần câu / cuốc). */
  gatheringToolMissing: { method: string }
  /** Vật phẩm không phải mồi câu (category fishingLure). */
  notFishingLure: { itemId: string }
  // ---------- Bản mệnh thú (docs/rules/tamer.md) ----------
  /** Không thả / làm quái phụ / hiến tế bản mệnh (đổi bản mệnh trước). */
  isBondBeast: { monsterId: string }
  bondAffinityTooLow: { monsterId: string; need: number; have: number }
  bondAlreadyBound: { monsterId: string }
  /** Kết bản mệnh lại được từ ngày `readyDay`. */
  bondCooldown: { readyDay: number }
  /** Đạo thương: không đột phá tới hết ngày `untilDay`. */
  tamerWounded: { untilDay: number }
  // ---------- Hệ thống event (docs/rules/events.md) ----------
  /** Đang có event chờ chọn: chỉ chooseEventOption được làm. */
  eventPending: { eventId: string }
  noPendingEvent: NoParams
  eventOptionUnknown: { eventId: string; optionId: string }
  noTempShop: NoParams
  /** Cửa hàng tạm còn ít hơn số muốn mua. */
  tempShopStockLow: { remaining: number }
  /** Lệnh bị cấm trong trận event không chạy được / đợt thú triều. */
  specialBattleRestricted: { command: 'ball' | 'flee' }
  /** Đang có thú triều: không rời thị trấn, không hồi máu, không vào trận khác. */
  beastTideActive: NoParams
  noBeastTide: NoParams
  /** Chưa thắng đủ đợt để thách đấu thú vương. */
  beastKingLocked: { cleared: number; need: number }
  /** Cửa hàng thị trấn đóng tới hết ngày `untilDay` (sau thú triều thất bại). */
  shopClosed: { untilDay: number }
  /** Boss thế giới (docs/rules/world-boss.md): không có boss đang xuất hiện. */
  noWorldBoss: NoParams
  /** Đã khiêu chiến boss thế giới trong ngày `day`. */
  worldBossChallengedToday: { day: number }
  noWorldBossRewards: NoParams
  // ---------- Khí linh và Khí giới bí cảnh (docs/rules/artifact-spirits.md) ----------
  /** Không có khí linh ở vị trí `index` (instanceId null = kho khí linh). */
  spiritNotFound: { instanceId: string | null; index: number }
  /** Dã linh chưa thu phục: không di dời / gộp / nuôi được. */
  spiritNotSubdued: { instanceId: string | null; index: number }
  spiritSlotsFull: { instanceId: string; slots: number }
  /** Gộp hai khí linh khác loại. */
  spiritTypesDiffer: NoParams
  /** Phối linh cần hai khí linh một loại, khác loại nhau. */
  spiritNotBreedable: NoParams
  spiritPoolNotFound: { index: number }
  spiritPoolNotReady: { index: number; readyDay: number }
  noItemWorld: NoParams
  /** Chưa tới mốc rời Khí giới bí cảnh (không dùng Phá Giới Phù). */
  itemWorldLeaveLocked: { depth: number; leaveEvery: number }
}

/**
 * Lý do không dùng được hợp kích kỹ: thiếu đồng đội cùng ra lệnh (lệnh hai ô không khớp), đồng đội
 * không trên sân / đã gục, cặp quái không thỏa cặp điều kiện, thân mật chưa đủ, trận boss / phe
 * quái hoang (không có ngự thú sư).
 */
export type ComboBlocker = 'noPartner' | 'pairMismatch' | 'affinityTooLow' | 'noTamer'

/**
 * Lý do không dùng được kỹ năng ngự thú sư: chưa mở, thiếu linh lực, đang hồi chiêu, hết lượt dùng
 * trong trận, phe không có ngự thú sư (quái hoang, trận độ kiếp), không có tác dụng với mục tiêu.
 */
/**
 * Lý do không dùng được kỹ năng ngự thú sư; `notWildBattle` / `notFirstTurn`: Thị Uy chỉ dùng ở lượt
 * đầu trận quái hoang thường (docs/rules/recruit.md).
 */
export type TamerSkillBlocker =
  | 'locked'
  | 'notEnoughMana'
  | 'onCooldown'
  | 'noUsesLeft'
  | 'noTamer'
  | 'noEffect'
  | 'notWildBattle'
  | 'notFirstTurn'

export type ActionErrorCode = keyof ActionErrorParams

/** Bảng câu theo mã lỗi; renderer dùng cùng kiểu này cho từng ngôn ngữ. */
export type ActionErrorMessages = {
  readonly [C in ActionErrorCode]: (params: ActionErrorParams[C]) => string
}

/** Câu tiếng Việt chỉ để debug (message của lỗi, log); không hiện thẳng cho người chơi. */
export const ACTION_ERROR_MESSAGES: ActionErrorMessages = {
  malformedAction: ({ detail }) => `Lệnh không hợp lệ: ${detail}`,
  inBattle: () => 'Không thể làm việc này khi đang trong trận',
  noBattle: () => 'Không có trận đấu nào đang diễn ra',
  wrongBattlePhase: ({ phase, expected }) => `Trận đang ở pha "${phase}", không phải "${expected}"`,
  notInTown: () => 'Chỉ làm được việc này ở thị trấn',
  notOnFloor: () => 'Phải đi tới một tầng mới làm được việc này',
  floorLocked: ({ floor, highestFloor }) => `Tầng ${floor} chưa mở (cao nhất: ${highestFloor})`,
  noHealthyMonster: () => 'Không còn quái nào đủ sức chiến đấu',
  partyFullHp: () => 'Cả đội đã đầy máu (NPC hồi máu: và không có trạng thái bất thường)',
  notEnoughMoney: ({ need, have }) => `Cần ${need.toString()} tiền, có ${have.toString()}`,
  notEnoughSoulCrystals: ({ need, have }) => `Cần ${need} điểm hồn tinh, có ${have}`,
  unknownTalent: ({ nodeId }) => `Thiên phú không tồn tại "${nodeId}"`,
  talentBranchClosed: ({ nodeId, raceId }) =>
    `Race "${raceId}" không nâng được thiên phú "${nodeId}"`,
  talentMaxRank: ({ nodeId, maxRank }) => `Thiên phú "${nodeId}" đã đạt cấp tối đa ${maxRank}`,
  talentRequires: ({ nodeId, requiredId, rank }) =>
    `Thiên phú "${nodeId}" cần "${requiredId}" cấp ${rank} trước`,
  notEnoughTalentPoints: ({ need, have }) => `Cần ${need} điểm thiên phú, có ${have}`,
  monsterNotOwned: ({ monsterId }) => `Không sở hữu quái "${monsterId}"`,
  monsterNotInParty: ({ monsterId }) => `Quái "${monsterId}" không có trong đội`,
  monsterNotInStorage: ({ monsterId }) => `Quái "${monsterId}" không có trong kho`,
  partyFull: ({ partySize }) => `Đội không còn đủ ô (tối đa ${partySize} ô; quái lớn chiếm 2 ô)`,
  partyWouldBeEmpty: () => 'Đội phải còn ít nhất 1 quái',
  nicknameTooLong: ({ maxLength }) => `Biệt danh tối đa ${maxLength} ký tự`,
  notStarter: ({ speciesId }) => `"${speciesId}" không phải quái khởi đầu`,
  monsterAlreadyActive: ({ monsterId }) => `Quái "${monsterId}" đang trên sân`,
  monsterFainted: ({ monsterId }) => `Quái "${monsterId}" đã gục`,
  monsterChosenTwice: ({ monsterId }) => `Quái "${monsterId}" được chọn vào sân hai lần`,
  escapeBlocked: ({ fieldId }) => `Môi trường "${fieldId}" không cho đổi quái / chạy trốn`,
  monsterTrapped: ({ monsterId }) => `Quái "${monsterId}" đang bị giữ chân, không đổi / chạy được`,
  monsterCannotEnter: ({ monsterId }) => `Quái "${monsterId}" không thể vào sân`,
  replacementIncomplete: ({ slot }) => `Ô ${slot} vẫn còn quái thay được, cần chọn thêm`,
  largeNeedsAllSlots: ({ monsterId }) =>
    `Quái lớn "${monsterId}" chiếm cả hai ô: ô còn lại phải trống hoặc cùng rút ra`,
  slotNotReplaceable: ({ slot }) => `Ô ${slot} không cần thay hoặc bị chọn hai lần`,
  cannotThrowItem: ({ itemId, targetId }) => `Không thể ném "${itemId}" vào "${targetId}"`,
  unknownItem: ({ itemId }) => `Vật phẩm không tồn tại "${itemId}"`,
  notEnoughItem: ({ itemId, have, need }) =>
    `Không đủ vật phẩm "${itemId}": có ${have}, cần ${need}`,
  notEnoughCrystals: ({ traitId, level, have, need }) =>
    `Không đủ tinh thể "${traitId}" cấp ${level}: có ${have}, cần ${need}`,
  notEnoughBooks: ({ skillId, reusable, have, need }) =>
    `Không đủ ${reusable ? 'Chân kinh' : 'Bí kíp'} "${skillId}": có ${have}, cần ${need}`,
  itemNotUsable: ({ itemId }) => `Vật phẩm "${itemId}" không dùng trực tiếp được`,
  itemWrongContext: ({ itemId, context }) =>
    `Vật phẩm "${itemId}" ${context === 'field' ? 'chỉ dùng trong trận' : 'chỉ dùng ngoài trận'}`,
  itemNoEffect: ({ itemId, monsterId }) =>
    `Vật phẩm "${itemId}" không có tác dụng với quái "${monsterId}"`,
  itemCountNotAllowed: ({ itemId }) => `Vật phẩm "${itemId}" chỉ dùng được từng cái một`,
  unknownTrait: ({ traitId }) => `Trait không tồn tại "${traitId}"`,
  traitNotOnMonster: ({ monsterId, traitId }) => `Quái "${monsterId}" không có trait "${traitId}"`,
  traitNotExtractable: ({ traitId, kind }) =>
    `Trait "${traitId}" loại "${kind}" không extract / inject được`,
  traitSlotsFull: ({ monsterId, slots }) => `Quái "${monsterId}" đã dùng hết ${slots} ô trait`,
  traitLevelLimit: ({ traitId, max }) => `Cấp trait "${traitId}" không được vượt ${max}`,
  stackLimitReached: ({ max }) => `Số lượng trong túi không được vượt ${max}`,
  notInShop: () => 'Cửa hàng không bán món này',
  equipmentNotFound: ({ instanceId }) => `Không có món trang bị "${instanceId}"`,
  equipmentSlotsFull: ({ monsterId, slots }) => `Quái "${monsterId}" đã lắp đủ ${slots} ô`,
  equipmentEquipped: ({ instanceId, monsterId }) =>
    `Món "${instanceId}" đang lắp trên quái "${monsterId}", tháo trước đã`,
  lineNotRerollable: ({ instanceId, lineIndex }) =>
    `Dòng ${lineIndex} của món "${instanceId}" không tẩy luyện được`,
  nothingToReroll: ({ instanceId }) => `Món "${instanceId}" không còn dòng phụ nào để tẩy luyện`,
  equipmentRaceLocked: ({ itemId, raceId }) =>
    `Món "${itemId}" chỉ lắp cho quái race "${raceId}" (hoặc có race đó trong lineage)`,
  notEquippable: ({ itemId }) => `Vật phẩm "${itemId}" không lắp vào ô được`,
  soulNotFound: ({ soulId }) => `Không có hồn phách "${soulId}"`,
  skillNotKnown: ({ monsterId, skillId }) => `Quái "${monsterId}" không biết skill "${skillId}"`,
  skillOnHold: ({ monsterId, skillId, turnsLeft }) =>
    `Skill "${skillId}" của quái "${monsterId}" còn phải chờ ${turnsLeft} lượt`,
  monsterFrenzied: ({ monsterId }) => `Quái "${monsterId}" đang cuồng bạo, không nghe lệnh`,
  styleLocked: ({ monsterId, skillId, level, need }) =>
    `Quái "${monsterId}" cần thuần thục skill "${skillId}" cấp ${need} mới dùng được thế (đang cấp ${level})`,
  bodyPartMissing: ({ monsterId, partId }) =>
    `Quái "${monsterId}" không có bộ phận "${partId}" để nhắm`,
  skillSlotFree: () => 'Còn ô skill trống, không cần quên skill nào',
  mustForgetSkill: ({ maxSkills }) => `Đã đủ ${maxSkills} skill, phải chọn một skill để quên`,
  skillNotPending: ({ skillId }) => `Skill "${skillId}" không nằm trong danh sách chờ học`,
  cannotRelearnSkill: ({ skillId }) => `Quái không thể học lại skill "${skillId}"`,
  unknownSkill: ({ skillId }) => `Skill không tồn tại "${skillId}"`,
  skillBookNoEffect: ({ skillId, reason }) =>
    reason === 'known'
      ? `Sách "${skillId}" không có tác dụng: quái đã biết hoặc đang chờ học skill này`
      : `Sách "${skillId}" không có tác dụng: quái không học được skill này`,
  notPendingEvolution: ({ speciesId }) => `"${speciesId}" không phải hướng tiến hóa đang chờ chọn`,
  evolutionConditionsUnmet: ({ speciesId }) =>
    `Quái chưa đủ điều kiện để tiến hóa thành "${speciesId}"`,
  notMale: ({ monsterId }) => `Quái "${monsterId}" không phải con đực`,
  notFemale: ({ monsterId }) => `Quái "${monsterId}" không phải con cái`,
  breedSameMonster: () => 'Không thể breed một quái với chính nó',
  breedGenderless: () => 'Quái không giới tính không breed được',
  breedSameGender: () => 'Cần một con đực và một con cái',
  breedIncompatible: () =>
    'Hai quái không cùng loài, không cùng dòng fuse và race không tương thích',
  tooYoungToBreed: () => 'Quái ấu niên chưa breed được',
  imprintNotRequested: ({ monsterId, kind }) =>
    `Quái "${monsterId}" không đang đòi chăm sóc "${kind}"`,
  fuseSameMonster: () => 'Quái gốc và quái phụ phải là hai con khác nhau',
  fuseNoNewSpecies: ({ speciesIds }) =>
    `Quái phụ không đóng góp loài mới: quái gốc đã có ${speciesIds.join(', ')}`,
  sacrificeSameMonster: () => 'Quái chính không được nằm trong danh sách quái phụ',
  sacrificeMismatch: ({ baseId, subId }) =>
    `Quái "${subId}" không cùng race và cùng lineage với quái chính "${baseId}"`,
  sacrificeStackLimit: ({ max }) => `Số stack hiến tế không được vượt ${max}`,
  levelTooLowForRebirth: ({ need, have }) => `Cần level ${need} để luân hồi, đang ${have}`,
  serumNotFound: ({ serumIndex }) => `Phòng Thí Nghiệm không có huyết thanh thứ ${serumIndex}`,
  rosterFull: ({ capacity }) => `Đội đã đủ và kho quái đã đầy (${capacity} con)`,
  bagFull: ({ capacity }) => `Túi trang bị đã đầy (${capacity} chỗ)`,
  bagOverflow: ({ lost }) =>
    `Túi trang bị không đủ chỗ: ${lost} món đang lắp sẽ mất, cần xác nhận (discardOverflow)`,
  wrongFusionAid: ({ itemId, slot }) =>
    `Vật phẩm "${itemId}" không phải bùa fuse ô ${slot === 'boost' ? 'tăng tỉ lệ' : 'hộ mệnh'}`,
  tooManyInheritedSkills: ({ max }) => `Chỉ được kế thừa tối đa ${max} skill của quái phụ`,
  cannotInheritSkill: ({ skillId, reason }) => `Không kế thừa được skill "${skillId}" (${reason})`,
  transformUnavailable: ({ kind, reason }) => `Không biến hình "${kind}" được (${reason})`,
  zMoveUnavailable: ({ monsterId, skillId, reason }) =>
    `Quái "${monsterId}" không dùng Z-Move từ skill "${skillId}" được (${reason})`,
  cannotCatchDynamaxed: ({ monsterId }) => `Không thể bắt quái "${monsterId}" khi đang Dynamax`,
  keyItemLocked: ({ itemId }) => `Vật phẩm chìa khóa "${itemId}" không bán / vứt được`,
  charmNotForSale: ({ itemId, reason }) =>
    reason === 'owned'
      ? `Đã có bùa "${itemId}", mỗi loại chỉ mua một lần`
      : `Cửa hàng không bán bùa "${itemId}"`,
  charmFloorLocked: ({ itemId, minFloor }) => `Bùa "${itemId}" bán từ khi mở tầng ${minFloor}`,
  eggNotFound: ({ eggId }) => `Không có trứng "${eggId}"`,
  notSpiritStone: ({ itemId }) => `Vật phẩm "${itemId}" không phải linh thạch`,
  eggInfusionsFull: ({ eggId, max }) => `Trứng "${eggId}" đã đặt đủ ${max} linh thạch`,
  teraElementUnchanged: ({ elementId }) => `Hệ Tera đã là "${elementId}"`,
  teraElementFixed: ({ speciesId }) => `Loài "${speciesId}" có hệ Tera cố định`,
  optionUnchanged: ({ option, enabled }) =>
    `Tùy chọn "${option}" đã ${enabled ? 'bật' : 'tắt'} sẵn`,
  tamerExpTooLow: ({ need, have }) =>
    `Cần ${need.toString()} EXP ngự thú sư để đột phá, có ${have.toString()}`,
  noRecruitOffer: () => 'Không có quái nào đang xin theo',
  alreadyContracted: ({ monsterId }) => `Quái "${monsterId}" đã khế ước`,
  notContracted: ({ monsterId }) => `Quái "${monsterId}" chưa khế ước`,
  contractSlotsFull: ({ max }) => `Đã khế ước đủ ${max} quái (đột phá cảnh giới để thêm ô)`,
  notBait: ({ itemId }) => `Vật phẩm "${itemId}" không phải mồi dụ`,
  baitActive: ({ itemId, battlesLeft }) =>
    `Mồi dụ "${itemId}" còn tác dụng ${battlesLeft} trận, chưa dùng mồi khác được`,
  dexMilestoneNotFound: ({ milestoneId }) => `Không có mốc Bộ sưu tập "${milestoneId}"`,
  dexRewardClaimed: ({ milestoneId }) => `Đã nhận thưởng mốc "${milestoneId}"`,
  dexMilestoneNotReached: ({ milestoneId, need, have }) =>
    `Mốc "${milestoneId}" cần sở hữu ${need}% loài, mới có ${have.toFixed(1)}%`,
  dexRegionNotFound: ({ biomeId }) => `Không có map "${biomeId}"`,
  dexRegionClaimed: ({ biomeId }) => `Đã nhận thưởng Dex của map "${biomeId}"`,
  dexRegionIncomplete: ({ biomeId, owned, total }) =>
    `Dex của map "${biomeId}" mới sở hữu ${owned} / ${total} loài`,
  researchSpeciesNotFound: ({ speciesId }) => `"${speciesId}" không phải loài thuộc Bộ sưu tập`,
  researchNoReward: ({ speciesId, level }) =>
    `Loài "${speciesId}" (cấp nghiên cứu ${level}) không có thưởng chờ nhận`,
  achievementNotFound: ({ achievementId }) => `Không có thành tựu "${achievementId}"`,
  achievementNotReached: ({ achievementId, need, have }) =>
    `Thành tựu "${achievementId}" cần ${need}, mới có ${have}`,
  achievementCompleted: ({ achievementId }) => `Đã nhận mọi bậc của thành tựu "${achievementId}"`,
  titleNotFound: ({ titleId }) => `Không có danh hiệu "${titleId}"`,
  titleNotOwned: ({ titleId }) => `Chưa có danh hiệu "${titleId}"`,
  inSafari: () => 'Đang trong khu bảo tồn: chỉ ném bóng / mồi / đá, bỏ đi hoặc rời khu',
  notInSafari: () => 'Không ở trong khu bảo tồn',
  safariUnavailable: () => 'Khu bảo tồn chưa có loài nào',
  tamerRealmTooLow: ({ monsterId, needRealm }) =>
    `Cần cảnh giới ${needRealm} mới khế ước được quái "${monsterId}"`,
  tamerSkillUnavailable: ({ skillId, reason }) =>
    `Không dùng được kỹ năng ngự thú sư "${skillId}" (${reason})`,
  notFormationScroll: ({ itemId }) => `Vật phẩm "${itemId}" không phải trận đồ`,
  formationAlreadyKnown: ({ formationId }) => `Đã học trận pháp "${formationId}"`,
  formationNotKnown: ({ formationId }) => `Chưa học trận pháp "${formationId}"`,
  formationUnchanged: ({ formationId }) =>
    formationId === null ? 'Đang không dùng trận pháp nào' : `Đang dùng trận pháp "${formationId}"`,
  comboUnavailable: ({ comboId, reason }) => `Không dùng được hợp kích kỹ "${comboId}" (${reason})`,
  levelTooLowForAwakening: ({ need, have }) => `Cần level ${need} để thức tỉnh, đang ${have}`,
  injured: ({ monsterId, battlesLeft }) =>
    `Quái "${monsterId}" đang trọng thương (còn ${battlesLeft} trận)`,
  tribulationRestricted: ({ command }) => `Không được dùng lệnh "${command}" khi độ kiếp`,
  cannotTakeHumanForm: ({ monsterId, reason }) =>
    `Quái "${monsterId}" chưa hóa hình được (${reason})`,
  humanFormNotTaken: ({ monsterId }) => `Quái "${monsterId}" chưa hóa hình hoặc không có nhân hình`,
  purityTooLow: ({ monsterId, purity, required }) =>
    `Quái "${monsterId}" có huyết mạch chính ${purity}%, cần ${required}% để phản tổ`,
  notAncestor: ({ monsterId, speciesId }) =>
    `"${speciesId}" không phải loài tổ của huyết mạch chính của quái "${monsterId}"`,
  fusedCannotAtavize: ({ monsterId }) => `Quái fuse "${monsterId}" không phản tổ được`,
  humanFormUnchanged: ({ monsterId, form }) => `Quái "${monsterId}" đang ở dạng "${form}"`,
  humanFormSkillLocked: ({ monsterId, skillId }) =>
    `Skill "${skillId}" của "${monsterId}" chỉ dùng được ở nhân hình`,
  recipeUnknown: ({ recipeId }) => `Công thức không tồn tại "${recipeId}"`,
  recipeNotLearned: ({ recipeId }) => `Chưa học đan phương của "${recipeId}"`,
  recipeAlreadyKnown: ({ recipeId }) => `Đã biết công thức "${recipeId}"`,
  notRecipeScroll: ({ itemId }) => `"${itemId}" không phải đan phương`,
  alchemyLevelTooLow: ({ need, have }) => `Cần cấp luyện đan ${need}, đang ${have}`,
  smithingLevelTooLow: ({ need, have }) => `Cần cấp luyện khí ${need}, đang ${have}`,
  cookingLevelTooLow: ({ need, have }) => `Cần cấp nấu ăn ${need}, đang ${have}`,
  notDish: ({ itemId }) => `Vật phẩm "${itemId}" không phải món ăn`,
  notEnoughAwakeningPills: ({ monsterId, have, need }) =>
    `Không đủ Thức tỉnh đan cùng hệ với "${monsterId}": có ${have}, cần ${need}`,
  notEnoughGroupItem: ({ groupId, have, need }) =>
    `Không đủ nguyên liệu nhóm "${groupId}": có ${have}, cần ${need}`,
  notCastable: ({ itemId }) => `"${itemId}" không đúc được`,
  elementNotImbuable: ({ elementId }) => `Hệ "${elementId}" không phụ linh được`,
  notSeed: ({ itemId }) => `"${itemId}" không phải hạt giống`,
  plotOccupied: ({ plotIndex }) => `Ô linh điền ${plotIndex} đang trồng`,
  plotEmpty: ({ plotIndex }) => `Ô linh điền ${plotIndex} đang trống`,
  cropNotReady: ({ plotIndex, daysLeft }) =>
    `Ô linh điền ${plotIndex} còn ${daysLeft} ngày mới chín`,
  questNotFound: ({ questId }) => `Không có nhiệm vụ "${questId}"`,
  tooManyQuests: ({ maxActive }) => `Chỉ nhận tối đa ${maxActive} nhiệm vụ cùng lúc`,
  questNotComplete: ({ questId, progress, target }) =>
    `Nhiệm vụ "${questId}" chưa xong (${progress}/${target})`,
  monsterBusy: ({ monsterId }) => `Quái "${monsterId}" đang làm việc (thám hiểm)`,
  expeditionNotOffered: ({ expeditionId }) => `Bảng thám hiểm không có "${expeditionId}"`,
  expeditionSlotsFull: ({ slots }) => `Đã có đủ ${slots} đội thám hiểm`,
  expeditionRequirementUnmet: ({ expeditionId, requirement }) =>
    `Đội không đủ yêu cầu "${requirement}" của "${expeditionId}"`,
  expeditionNotFound: ({ expeditionActiveId }) => `Không có đội thám hiểm "${expeditionActiveId}"`,
  trainerBattleRestricted: ({ command }) => `Không được dùng lệnh "${command}" khi đấu ngự thú sư`,
  noGym: ({ floor }) => `Tầng ${floor} không có đạo quán`,
  tournamentNotOpen: ({ nextDay }) => `Giải đấu kế tiếp mở vào ngày ${nextDay}`,
  tournamentInProgress: () => 'Đang trong giải đấu (không hồi máu, không rời thị trấn)',
  noTournament: () => 'Không trong giải đấu nào',
  trialRestricted: ({ command }) => `Không được dùng lệnh "${command}" trong bí cảnh / tháp`,
  trialInProgress: () => 'Đang đi bí cảnh (không hồi máu, không rời thị trấn, không vào trận khác)',
  noTrial: () => 'Không trong bí cảnh nào',
  instabilityLevelTooHigh: ({ level, max }) => `Mức bất ổn ${level} vượt mức tối đa ${max}`,
  instabilityUnchanged: ({ level }) => `Độ bất ổn đang ở mức ${level}`,
  instabilityOff: () => 'Chưa bật độ bất ổn tầng',
  unknownDeity: ({ deityId }) => `Không có thần "${deityId}"`,
  deityItemNotSold: ({ deityId, itemId }) => `Cửa hàng của thần "${deityId}" không bán "${itemId}"`,
  blessingRankTooLow: ({ deityId, rank, need }) =>
    `Bậc ân sủng với thần "${deityId}" là ${rank}, cần ${need}`,
  noEligibleFighter: ({ elementIds }) =>
    `Không còn quái nào được vào trận (hệ ${String(elementIds)})`,
  zoneNotFound: ({ zoneId }) => `Không có hiểm địa "${zoneId}"`,
  zoneRequirementUnmet: ({ zoneId, index, requirementType }) =>
    `Chưa đạt điều kiện ${index + 1} (${requirementType}) để vào hiểm địa "${zoneId}"`,
  zoneClosed: ({ zoneId, reopenDay }) => `Hiểm địa "${zoneId}" mở lại vào ngày ${reopenDay}`,
  zoneInProgress: () =>
    'Đang trong hiểm địa (không hồi máu, không rời thị trấn, không vào phó bản khác)',
  noZoneVisit: () => 'Không trong hiểm địa nào',
  gatheringUnavailable: ({ method, biomeId }) =>
    `Map "${biomeId}" không có chỗ ${method === 'fishing' ? 'câu cá' : 'khai thác'}`,
  gatheringToolMissing: ({ method }) =>
    `Chưa có ${method === 'fishing' ? 'cần câu' : 'cuốc'} để ${method === 'fishing' ? 'câu cá' : 'khai thác'}`,
  notFishingLure: ({ itemId }) => `"${itemId}" không phải mồi câu`,
  isBondBeast: ({ monsterId }) => `Quái "${monsterId}" là bản mệnh thú (đổi bản mệnh trước)`,
  bondAffinityTooLow: ({ monsterId, need, have }) =>
    `Quái "${monsterId}" thân mật ${have}, cần ${need} để kết bản mệnh`,
  bondAlreadyBound: ({ monsterId }) => `Quái "${monsterId}" đã là bản mệnh thú`,
  bondCooldown: ({ readyDay }) => `Kết bản mệnh lại được từ ngày ${readyDay}`,
  tamerWounded: ({ untilDay }) => `Ngự thú sư bị đạo thương tới hết ngày ${untilDay}`,
  eventPending: ({ eventId }) => `Đang có event "${eventId}" chờ chọn`,
  noPendingEvent: () => 'Không có event nào đang chờ',
  eventOptionUnknown: ({ eventId, optionId }) =>
    `Event "${eventId}" không có lựa chọn "${optionId}"`,
  noTempShop: () => 'Không có cửa hàng tạm nào',
  tempShopStockLow: ({ remaining }) => `Cửa hàng tạm chỉ còn ${remaining} món`,
  specialBattleRestricted: ({ command }) => `Không được dùng lệnh "${command}" trong trận này`,
  beastTideActive: () =>
    'Đang có thú triều (không rời thị trấn, không hồi máu, không vào trận khác)',
  noBeastTide: () => 'Không có thú triều nào đang diễn ra',
  beastKingLocked: ({ cleared, need }) =>
    `Mới thắng ${cleared} đợt, cần ${need} đợt mới thách đấu thú vương`,
  shopClosed: ({ untilDay }) => `Cửa hàng đóng tới hết ngày ${untilDay}`,
  noWorldBoss: () => 'Không có boss thế giới nào đang xuất hiện',
  worldBossChallengedToday: ({ day }) => `Đã khiêu chiến boss thế giới hôm nay (ngày ${day})`,
  noWorldBossRewards: () => 'Không có thưởng boss thế giới nào đang chờ nhận',
  spiritNotFound: ({ instanceId, index }) =>
    `Không có khí linh ở vị trí ${index} của ${instanceId === null ? 'kho khí linh' : `món "${instanceId}"`}`,
  spiritNotSubdued: ({ instanceId, index }) =>
    `Khí linh ở vị trí ${index} của ${instanceId === null ? 'kho khí linh' : `món "${instanceId}"`} chưa thu phục`,
  spiritSlotsFull: ({ instanceId, slots }) => `Món "${instanceId}" đã đủ ${slots} khí linh`,
  spiritTypesDiffer: () => 'Chỉ gộp được hai khí linh cùng loại',
  spiritNotBreedable: () => 'Phối linh cần hai khí linh một loại, khác loại nhau',
  spiritPoolNotFound: ({ index }) => `Linh trì không có cặp khí linh ở vị trí ${index}`,
  spiritPoolNotReady: ({ index, readyDay }) =>
    `Cặp khí linh ở vị trí ${index} xong vào ngày ${readyDay}`,
  noItemWorld: () => 'Không trong Khí giới bí cảnh nào',
  itemWorldLeaveLocked: ({ depth, leaveEvery }) =>
    `Đang ở tầng ${depth}: chỉ rời được sau mỗi ${leaveEvery} tầng (hoặc dùng Phá Giới Phù)`
}

/** Tham số của mã: mã không có tham số thì được bỏ trống. */
export type ActionErrorArgs<C extends ActionErrorCode> = keyof ActionErrorParams[C] extends never
  ? [params?: ActionErrorParams[C]]
  : [params: ActionErrorParams[C]]
