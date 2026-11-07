// Action: mọi thứ người chơi làm, đi qua gameReducer.

import type { Decimal } from '../shared'
import type { MoveStyle } from './moveStyles'
import type { Tactic } from './monster'
import type { ItemBatchEntry, ItemRef, Location } from './state'
import type { TamerCommand } from './tamer'
import type { TransformKind } from './transform'
import type { StatName } from './stats'
import type { GameOptionFlag } from './time'
import type { Difficulty } from './challenge'
import type { CapacityKind } from './capacity'
import type { SpiritDestination, SpiritFood, SpiritLocation } from './artifactSpirits'

// ---------- Action ----------

export type BattleCommand =
  | {
      slot: number
      kind: 'skill'
      skillId: string
      /** Ô của mục tiêu (enemy/ally). */ target?: number
      /**
       * Quái dự bị vào thay khi skill làm quái dùng rút về (hiệu ứng switchOut); bỏ trống = quái
       * dự bị còn sống đầu tiên theo thứ tự đội. Skill không rút về thì không được ghi.
       */
      switchTo?: string
      /**
       * Thế mạnh / thế nhanh (docs/rules/move-styles.md): skill có `styles` và đã thuần thục đủ
       * cấp; bỏ trống = thế thường.
       */
      style?: MoveStyle
      /**
       * Biến hình trước pha skill (không tốn lượt, mục "Biến hình trong trận"). Đang Dynamax thì
       * skillId vẫn là skill gốc, trận tự đổi sang chiêu Max.
       */
      transform?: TransformKind
      /** Mega: dạng Mega muốn dùng khi quái cầm nhiều đá hợp lệ (bắt buộc khi đó). */
      formSpeciesId?: string
      /** Nhắm đồng đội bằng skill có `onAlly` (Pollen Puff: hồi máu thay vì gây sát thương). */
      targetAlly?: true
      /** Nhắm địch bằng skill có `onFoe` (Wall của Cassette Beasts); ô địch ở `target`. */
      targetFoe?: true
      /**
       * Dùng skill thành Z-Move (docs/rules/z-moves.md): quái cầm Z-Crystal hợp skill, phe chưa
       * dùng Z-Move trong trận; skillId vẫn là skill gốc.
       */
      zMove?: true
      /**
       * Bộ phận của địch được nhắm (id trong bodyParts.json; docs/rules/hit-locations.md): chỉ skill
       * gây sát thương nhắm một địch; bỏ trống = không nhắm.
       */
      aim?: string
    }
  | { slot: number; kind: 'switch'; monsterId: string }
  /** Dùng vật phẩm: thuốc nhắm quái của ta (cả dự bị), bóng nhắm quái hoang trên sân. */
  | { slot: number; kind: 'item'; itemId: string; targetId: string }
  /**
   * Phòng thủ (Defend của Siralim): đi trước, nhận ít sát thương hơn tới đầu lượt sau. Khiêu
   * khích (Provoke): đi trước, skill đơn mục tiêu của địch phải nhắm vào nó tới đầu lượt sau.
   */
  | { slot: number; kind: 'defend' }
  | { slot: number; kind: 'provoke' }
  /** Nghỉ: không làm gì, hồi thêm thể lực (docs/rules/stamina.md). */
  | { slot: number; kind: 'rest' }
  /**
   * Hợp kích kỹ (docs/rules/team.md): cả hai quái trên sân cùng ghi lệnh này (cùng comboId và
   * target), tốn lượt của cả hai; chiêu tung ở lượt của quái chậm hơn.
   */
  | { slot: number; kind: 'combo'; comboId: string; target?: number }

export type GameAction =
  /** Đánh quái hoang ở tầng đang đứng (có thể gặp event thay cho trận; docs/rules/events.md). */
  | { type: 'startWildBattle' }
  /**
   * Hệ thống event (docs/rules/events.md): khám phá ở tầng (tìm event, không thì ra trận quái
   * hoang), chọn lựa chọn của event đang chờ, mua ở cửa hàng tạm của event, thủ thành / thách đấu
   * thú vương / rút lui khi thú triều.
   */
  | { type: 'explore' }
  | { type: 'chooseEventOption'; optionId: string }
  | { type: 'buyEventItem'; item: ItemRef; count: number }
  | { type: 'defendTown' }
  | { type: 'challengeBeastKing' }
  | { type: 'retreatBeastTide' }
  /** Boss thế giới (docs/rules/world-boss.md): khiêu chiến ở thị trấn, nhận thưởng chờ. */
  | { type: 'challengeWorldBoss' }
  | { type: 'claimWorldBossRewards' }
  /** Chiến thuật tự đánh của quái (ngoài trận, ở đâu cũng được; docs/rules/auto-battle.md). */
  | { type: 'setTactic'; monsterId: string; tactic: Tactic }
  /** Thám hiểm (docs/rules/expeditions.md): phái đi ở thị trấn, gọi về ở đâu cũng được. */
  | { type: 'startExpedition'; expeditionId: string; monsterIds: string[] }
  | { type: 'recallExpedition'; expeditionActiveId: string }
  /** Bảng nhiệm vụ (docs/rules/quests.md): nhận / nhận thưởng ở thị trấn, hủy ở đâu cũng được. */
  | { type: 'acceptQuest'; questId: string }
  | { type: 'abandonQuest'; questId: string }
  | { type: 'claimQuest'; questId: string }
  /** Luyện đan (ở thị trấn; docs/rules/alchemy.md). */
  | { type: 'craft'; recipeId: string; times: number }
  | { type: 'learnRecipe'; itemId: string }
  /** Động phủ (ở thị trấn; docs/rules/dwelling.md), linh điền là công trình của động phủ. */
  | { type: 'upgradeBuilding'; buildingId: string }
  | { type: 'assignWorker'; buildingId: string; monsterId: string }
  | { type: 'unassignWorker'; monsterId: string }
  | { type: 'collectDwelling' }
  /** Hộp thức ăn của động phủ (ở thị trấn; docs/rules/dwelling.md mục "Đói và tinh thần"). */
  | { type: 'stockFeedBox'; itemId: string; count: number }
  | { type: 'takeFeedBox'; itemId: string; count: number }
  | { type: 'plantSeed'; plotIndex: number; itemId: string }
  | { type: 'harvest'; plotIndex: number }
  /** Hồn phách ở NPC luyện đan (thị trấn; docs/rules/soul-relics.md). */
  | { type: 'incubateSoul'; soulId: string }
  | { type: 'forgeSoulRelic'; soulId: string }
  /** Hóa hình (ở thị trấn) / đổi nhân hình ↔ bản thể (ngoài trận; docs/rules/human-form.md). */
  | { type: 'takeHumanForm'; monsterId: string }
  | { type: 'setHumanForm'; monsterId: string; form: 'beast' | 'human' }
  /** Phản tổ: huyết mạch chính 100% thì biến thành một loài tổ của nhóm (thị trấn; bloodline.md). */
  | { type: 'atavize'; monsterId: string; ancestorSpeciesId: string }
  /** Độ kiếp lên tầng thức tỉnh kế tiếp (ở thị trấn; docs/rules/awakening.md). */
  | { type: 'startTribulation'; monsterId: string }
  /**
   * Ngự thú sư NPC (docs/rules/trainers.md): đạo quán ở tầng có đạo quán; giải đấu và đấu trường
   * ở thị trấn.
   */
  | { type: 'challengeGym' }
  | { type: 'enterTournament' }
  | { type: 'challengeTournament' }
  | { type: 'forfeitTournament' }
  | { type: 'challengeArena' }
  /**
   * Tông môn (ở thị trấn; docs/rules/sects.md): gia nhập / rời, nộp nhiệm vụ tông, Tàng Bảo Các,
   * luận võ với đồng môn, thi thăng chức, tông chiến.
   */
  | { type: 'joinSect'; sectId: string }
  | { type: 'leaveSect' }
  | { type: 'claimSectMission'; questId: string }
  | { type: 'buySectItem'; item: ItemRef; count: number }
  | { type: 'challengeSectMember'; memberId: string }
  | { type: 'challengePromotion' }
  | { type: 'enterSectWar' }
  | { type: 'challengeSectWar' }
  | { type: 'forfeitSectWar' }
  /**
   * Trao đổi với NPC ở thị trấn (docs/rules/trades.md): đưa quái `monsterId` cho đề nghị `offerId`.
   * `discardOverflow`: đồng ý bỏ trang bị của quái đưa đi không vừa túi (docs/rules/capacity.md).
   */
  | { type: 'acceptTrade'; offerId: string; monsterId: string; discardOverflow?: boolean }
  /**
   * Đấu giá hành (thị trấn; docs/rules/auction.md): đặt / đổi / rút giá kín cho lô `lotId` (tiền bị
   * giữ tới khi phiên đóng), ký gửi / rút đồ ký gửi, nhận món trang bị giữ hộ.
   */
  | { type: 'placeAuctionBid'; lotId: string; amount: Decimal }
  | { type: 'cancelAuctionBid'; lotId: string }
  | { type: 'consignItem'; item: ItemRef; count: number; reservePrice: Decimal }
  | { type: 'withdrawConsignment'; consignmentId: string }
  | { type: 'claimAuctionHeld' }
  /** Quay Cây thần (thị trấn; count là một trong config.gacha.pullOptions; docs/rules/gacha.md). */
  | { type: 'pullGacha'; count: number }
  /**
   * Bí cảnh (ở thị trấn, tiêu một Bí Cảnh Lệnh) và tháp thí luyện (ở thị trấn; docs/rules/trials.md).
   */
  | { type: 'enterTrial' }
  | { type: 'challengeTrial' }
  | { type: 'abandonTrial' }
  | { type: 'challengeTower' }
  /**
   * Khí Linh Các (thị trấn; docs/rules/artifact-spirits.md): triệu khí linh bằng Dẫn Hồn Châu, di
   * dời / gộp / nuôi khí linh, phối linh ở Linh trì, nhận khí linh kép; Khí giới bí cảnh (vào bằng
   * một món trong túi, đánh tầng kế tiếp, rời).
   */
  | { type: 'summonSpirit' }
  | { type: 'moveSpirit'; from: SpiritLocation; to: SpiritDestination }
  | { type: 'mergeSpirits'; first: SpiritLocation; second: SpiritLocation }
  /** Hàng loạt (docs/rules/bulk-actions.md): di dời nhiều khí linh tới `to`, gộp nhiều vào `first`. */
  | { type: 'moveSpirits'; from: SpiritLocation[]; to: SpiritDestination }
  | { type: 'mergeSpiritsInto'; first: SpiritLocation; others: SpiritLocation[] }
  | { type: 'feedSpirit'; target: SpiritLocation; food: SpiritFood }
  | { type: 'breedSpirits'; first: number; second: number }
  | { type: 'collectSpiritPool'; index: number }
  | { type: 'enterItemWorld'; instanceId: string }
  | { type: 'challengeItemWorld' }
  | { type: 'leaveItemWorld'; useTalisman?: boolean }
  /**
   * Độ bất ổn tầng ở Đền dịch chuyển (thị trấn; docs/rules/instability.md): đặt mức (0 = tắt), đổi
   * thuộc tính (tốn tiền).
   */
  | { type: 'setInstability'; level: number }
  | { type: 'rerollInstability' }
  /**
   * Miếu thần linh (thị trấn; docs/rules/deities.md): mua Hương nến, dâng hương tăng ân sủng, đổi
   * tín vật lấy món ở cửa hàng thần.
   */
  | { type: 'buyIncense'; count: number }
  | { type: 'offerIncense'; deityId: string; count: number }
  | { type: 'buyDeityItem'; deityId: string; itemId: string; count: number }
  /** Hiểm địa (ở thị trấn; docs/rules/zones.md): vào khi đạt điều kiện, khám phá bước kế, rời. */
  | { type: 'enterZone'; zoneId: string }
  /** Vào một cổng thế giới đang mở (docs/rules/zones.md mục "Cổng thế giới"). */
  | { type: 'enterPortal'; portalId: string }
  /** Trả tiền gia cố cổng: cổng mở thêm vài ngày. */
  | { type: 'stabilizePortal'; portalId: string }
  | { type: 'exploreZone' }
  | { type: 'leaveZone' }
  /**
   * Câu cá / khai thác ở tầng đang đứng (docs/rules/gathering.md): cần map có chỗ câu / mỏ và dụng
   * cụ; câu cá dùng được một mồi câu `lureItemId`.
   */
  | { type: 'fish'; lureItemId?: string }
  | { type: 'mine' }
  /** Gọi boss tầng của tầng đang đứng: miễn phí, không giới hạn số lần. */
  | { type: 'challengeBoss' }
  /** Do thám boss tầng đang đứng (docs/rules/shiny-boss.md). */
  | { type: 'scoutBoss' }
  /**
   * Một lệnh cho mỗi ô có quái ta còn sống; `tamer`: tối đa một lệnh ngự thú sư (không chiếm lượt
   * quái, docs/rules/tamer.md).
   */
  | { type: 'submitTurn'; commands: BattleCommand[]; tamer?: TamerCommand }
  | { type: 'flee' }
  | { type: 'replaceFainted'; replacements: { slot: number; monsterId: string }[] }
  | { type: 'leaveBattle' }
  /**
   * Thu phục (docs/rules/recruit.md): nhận / từ chối quái xin theo của trận vừa thắng (trước
   * leaveBattle; rời trận mà chưa chọn là từ chối).
   */
  | { type: 'acceptRecruit' }
  | { type: 'declineRecruit' }
  /** Dùng mồi dụ (vật phẩm category `bait`) ngoài trận. */
  | { type: 'useBait'; itemId: string }
  /** Ăn món ăn linh thực (category `dish`) ngoài trận cho cả đội (docs/rules/cooking.md). */
  | { type: 'eatDish'; itemId: string }
  /** Nhận thưởng mốc Bộ sưu tập (docs/rules/dex.md). */
  | { type: 'claimDexReward'; milestoneId: string }
  /** Nhận thưởng cấp nghiên cứu của loài (docs/rules/species-research.md). */
  | { type: 'claimResearchReward'; speciesId: string }
  | { type: 'claimRegionalDexReward'; biomeId: string }
  /** Nhận thưởng mọi bậc đã đạt mà chưa nhận của một thành tựu (docs/rules/achievements.md). */
  | { type: 'claimAchievement'; achievementId: string }
  /** Đeo danh hiệu đã có (null = tháo), ngoài trận, miễn phí. */
  | { type: 'setTitle'; titleId: string | null }
  /** Khu bảo tồn (docs/rules/safari-zone.md): vào khu ở thị trấn, tốn phí. */
  | { type: 'enterSafari' }
  | { type: 'throwSafariBall' }
  /** Ném mồi: itemId = mồi dụ trong túi (đúng khẩu vị thì không giảm tỉ lệ bắt); bỏ trống = mồi thường. */
  | { type: 'throwSafariBait'; itemId?: string }
  | { type: 'throwSafariRock' }
  /** Bỏ quái đang gặp, sang lượt gặp kế. */
  | { type: 'skipSafariEncounter' }
  /** Rời khu ngay, mất lượt gặp và bóng còn lại. */
  | { type: 'leaveSafari' }
  | { type: 'rest' }
  | { type: 'travel'; to: Location }
  /** NPC hồi máu ở thị trấn: miễn phí. */
  | { type: 'healParty' }
  | { type: 'chooseEvolution'; monsterId: string; speciesId: string }
  /** forgetSkillId bắt buộc khi đã đủ ô skill. */
  | { type: 'learnPendingSkill'; monsterId: string; skillId: string; forgetSkillId?: string }
  | { type: 'skipPendingSkill'; monsterId: string; skillId: string }
  /** NPC breeding ở thị trấn: tốn tiền, tạo trứng. */
  | { type: 'breed'; fatherId: string; motherId: string }
  /**
   * NPC fusing ở thị trấn: quái phụ mất đi, quái gốc mạnh lên; có thể thất bại. Tùy chọn tối đa
   * 1 bùa tăng tỉ lệ (`boostItemId`) và 1 Bùa Hộ Mệnh (`protectItemId`), tiêu hao mỗi lần fuse.
   * `inheritSkillIds`: skill của quái phụ kế thừa (tối đa config.fusion.inheritSkills); quái gốc đủ
   * ô thì `forgetSkillIds` quên lần lượt để học ngay, thiếu thì skill còn lại vào chờ học.
   */
  | {
      type: 'fuse'
      baseId: string
      subId: string
      boostItemId?: string
      protectItemId?: string
      inheritSkillIds?: readonly string[]
      forgetSkillIds?: readonly string[]
      /** Trait chọn giữ, gen từng chỉ số lấy của bên nào (fusing.md mục "Chọn trait và gen"). */
      keepTraitIds?: readonly string[]
      geneSources?: Partial<Record<StatName, 'base' | 'sub'>>
      /** Xác nhận bỏ món đang lắp không đủ chỗ về túi (docs/rules/capacity.md). */
      discardOverflow?: boolean
    }
  /** Luyện thể ở NPC thị trấn (docs/rules/body-refinement.md). */
  | { type: 'refineBody'; monsterId: string; refinementId: string }
  | { type: 'removeRefinement'; monsterId: string; partId: string }
  /** Phòng ấp (docs/rules/hatchery.md): dựng môi trường, đặt / lấy trứng (roomIndex null = mang theo). */
  | { type: 'buildHatcheryHabitat'; roomIndex: number; habitatId: string }
  | { type: 'placeEgg'; eggId: string; roomIndex: number | null }
  | { type: 'buyHatcheryUpgrade'; roomIndex: number; upgradeId: string }
  /** Đặt người ấp (quái trong kho); monsterId null = cho nghỉ. */
  | { type: 'setHatcher'; roomIndex: number; monsterId: string | null }
  /** Chọn một tinh chất trong lựa chọn đang chờ (docs/rules/essences.md). */
  | { type: 'chooseEssence'; essenceId: string }
  /**
   * NPC fusing ở thị trấn, hiến tế (docs/rules/sacrifice.md): các quái phụ `subIds` (cùng race, cùng
   * lineage với quái chính) mất đi, quái chính nhận stack hiến tế; nhiều quái phụ = hàng loạt.
   */
  | { type: 'sacrifice'; baseId: string; subIds: readonly string[]; discardOverflow?: boolean }
  /**
   * NPC luân hồi ở thị trấn (docs/rules/rebirth.md): quái về level 1, nhận % vĩnh viễn, gen, điểm
   * thiên phú, trẻ lại.
   */
  | { type: 'rebirthMonster'; monsterId: string }
  /**
   * Thầy thuốc ở thị trấn (docs/rules/marks.md): bỏ một sẹo / đột biến / ám ảnh (id + đối tượng) của
   * quái, giá theo cấp dấu.
   */
  | { type: 'treatMark'; monsterId: string; markId: string; targetId?: string }
  /**
   * Phòng Thí Nghiệm ở thị trấn (docs/rules/implant.md): cấy huyết thanh thứ `serumIndex` của danh
   * sách hàng vào quái; thất bại trừ chỉ số, thất bại lần cuối mất quái.
   */
  | { type: 'implant'; monsterId: string; serumIndex: number; discardOverflow?: boolean }
  /**
   * NPC kho đồ ở thị trấn (docs/rules/capacity.md): mở rộng kho quái / túi trang bị thêm
   * perExpansion chỗ, giá costBase × k².
   */
  | { type: 'expandCapacity'; kind: CapacityKind }
  /**
   * Đặt một linh thạch vào trứng (ngoài trận, ở đâu cũng được; docs/rules/breeding-eggs.md mục "Ấp
   * trứng có hoàn cảnh").
   */
  | { type: 'infuseEgg'; eggId: string; itemId: string }
  /** Mua bùa bán ở cửa hàng thị trấn (bùa có townPrice, mỗi loại một lần; kiểu Ôn Dưỡng Lò). */
  | { type: 'buyCharm'; itemId: string }
  /** NPC học lại skill ở thị trấn: tốn tiền. */
  | { type: 'relearnSkill'; monsterId: string; skillId: string; forgetSkillId?: string }
  /**
   * Dùng sách kỹ năng lên quái trong đội hoặc kho (ngoài trận; docs/rules/skill-books.md): item là
   * định danh `{ storage: 'book', skillId, reusable }`.
   */
  | { type: 'useSkillBook'; monsterId: string; item: ItemRef }
  /**
   * Dán sticker trong túi lên quái (ngoài trận; docs/rules/skill-stickers.md): quái đã biết skill thì
   * thay sticker cũ; chưa biết thì học như sách, đủ ô thì quên `replaceSkillId`.
   */
  | { type: 'applySticker'; monsterId: string; stickerId: string; replaceSkillId?: string }
  /** Ritual Candle: hiến quái, Rogue Fusion kế tiếp có Bootleg (docs/rules/rogue-fusion.md). */
  | { type: 'lightRitualCandle'; monsterId: string; discardOverflow?: boolean }
  /** Hacking Glove: tốn Cyber Material, Rogue Fusion kế tiếp có Bootleg hệ ngẫu nhiên. */
  | { type: 'hackRogueFusion' }
  /** Đổi Fused Material lấy vật phẩm (thị trấn). */
  | { type: 'exchangeFusedMaterial'; itemId: string; count: number }
  /** Quà Bootleg của nhà Bootleg / bảng nhiệm vụ (thị trấn, mỗi loại một lần). */
  | { type: 'claimBootlegHouseGift' }
  | { type: 'claimQuestBootlegGift' }
  /** Bóc sticker khỏi skill của quái về túi (quái vẫn giữ skill). */
  | { type: 'peelSticker'; monsterId: string; skillId: string }
  /** Dùng vật phẩm lên quái trong đội hoặc kho; count > 1 chỉ với kẹo EXP (bỏ trống = 1). */
  /** skillId: skill chọn lúc dùng (vật phẩm cần skill, docs/rules/treasures.md). */
  | { type: 'useItem'; itemId: string; monsterId: string; count?: number; skillId?: string }
  /** Bật / tắt tùy chọn luật chơi của game này (ngoài trận, ở đâu cũng được; options.md). */
  | { type: 'setGameOption'; option: GameOptionFlag; enabled: boolean }
  /** Đổi độ khó của game này (ngoài trận; docs/rules/challenge-modes.md). */
  | { type: 'setDifficulty'; difficulty: Difficulty }
  /** Vứt item (ngoài trận, ở đâu cũng được): không nhận gì. */
  | { type: 'discardItem'; item: ItemRef; count: number }
  /** Cửa hàng ở thị trấn: bán item có giá, nhận % giá. */
  | { type: 'sellItem'; item: ItemRef; count: number }
  /** Hàng loạt (docs/rules/bulk-actions.md): vứt / bán nhiều dòng trong một action. */
  | { type: 'discardItems'; items: ItemBatchEntry[] }
  | { type: 'sellItems'; items: ItemBatchEntry[] }
  /** Cửa hàng ở thị trấn: mua món đang có trong danh sách hàng. */
  | { type: 'buyItem'; item: ItemRef; count: number }
  // Quản lý quái (chỉ ngoài trận)
  | { type: 'moveToStorage'; monsterId: string }
  | { type: 'moveToParty'; monsterId: string }
  | { type: 'swapWithStorage'; partyMonsterId: string; storageMonsterId: string }
  /** Danh sách id mới của đội, phải là hoán vị của đội hiện tại. */
  | { type: 'reorderParty'; monsterIds: string[] }
  | { type: 'releaseMonster'; monsterId: string; discardOverflow?: boolean }
  /** Thả nhiều quái trong một action (hàng loạt, docs/rules/bulk-actions.md). */
  | { type: 'releaseMonsters'; monsterIds: string[]; discardOverflow?: boolean }
  /** Đội hình mẫu (ngoài trận; docs/rules/roster.md): lưu mới hoặc ghi đè `presetId`, xóa, áp. */
  | { type: 'saveTeamPreset'; name: string | null; presetId?: string }
  | { type: 'deleteTeamPreset'; presetId: string }
  | { type: 'applyTeamPreset'; presetId: string; withEquipment: boolean }
  /** Khóa / yêu thích (ngoài trận, miễn phí; docs/rules/roster.md). */
  | { type: 'setMonsterLocked'; monsterId: string; locked: boolean }
  | { type: 'setMonsterFavorite'; monsterId: string; favorite: boolean }
  /** Lắp món trong túi (trang bị, đồ cầm) lên quái vào ô trống tiếp theo (ngoài trận). */
  | { type: 'equipItem'; monsterId: string; item: ItemRef }
  /** Tháo món ở ô `slotIndex` (0 = ô đầu) của quái về túi (ngoài trận). */
  | { type: 'unequipItem'; monsterId: string; slotIndex: number }
  /** NPC Thợ rèn ở thị trấn (docs/rules/equipment-forge.md): món trong túi hoặc đang lắp, cấp +1. */
  | { type: 'enhanceEquipment'; instanceId: string }
  /** Thợ rèn: tung lại mọi dòng phụ không khóa của món (trong túi hoặc đang lắp). */
  | { type: 'rerollEquipmentAffixes'; instanceId: string; lockedLineIndexes?: number[] }
  /** Tẩy luyện sticker ở Thợ rèn (docs/rules/skill-stickers.md): vị trí thuộc tính khóa. */
  | { type: 'rerollSticker'; stickerId: string; lockedIndexes?: number[] }
  /** Thợ rèn: phân giải các món trong túi (món đang lắp phải tháo trước). */
  | { type: 'salvageEquipment'; instanceIds: string[] }
  /** Đúc trang bị (luyện khí) từ món gốc thường và `cores` yêu đan cùng hệ `elementId`. */
  | { type: 'castEquipment'; itemId: string; elementId: string; cores: number }
  /** Phụ linh: gắn / thay dòng linh hệ `elementId` (tốn yêu đan cùng hệ). */
  | { type: 'imbueEquipment'; instanceId: string; elementId: string }
  /**
   * NPC tinh thể trait ở thị trấn (docs/rules/trait-crystals.md): extract lấy nguyên trait thành
   * tinh thể; inject dùng tinh thể (định danh `{ storage: 'crystal', traitId, level }`) lên quái.
   */
  | { type: 'extractTrait'; monsterId: string; traitId: string }
  | { type: 'injectTrait'; monsterId: string; item: ItemRef }
  /** NPC ở thị trấn: đổi hệ Tera của quái, tốn Mảnh Tera của hệ đích. */
  | { type: 'changeTeraElement'; monsterId: string; elementId: string }
  /** NPC Tượng Lực ở thị trấn (docs/rules/soul-levels.md): +1 cấp hồn tinh một chỉ số. */
  | { type: 'upgradeSoulLevel'; monsterId: string; stat: StatName | 'workSpeed' }
  /** Nâng một nút thiên phú của quái thêm 1 cấp, ngoài trận (docs/rules/monster-talents.md). */
  | { type: 'allocateTalent'; monsterId: string; nodeId: string }
  /** Nâng một nút thiên phú ngự thú sư thêm 1 cấp, ngoài trận (docs/rules/tamer-talents.md). */
  | { type: 'allocateTamerTalent'; nodeId: string }
  /** Phi thăng ở thị trấn (docs/rules/ascension.md): reset tiến trình chính, nhận Tiên nguyên. */
  | { type: 'ascend' }
  /** Chọn thiên mệnh sau khi phi thăng; rỗng = Phàm nhân. */
  | { type: 'chooseDestinies'; destinyIds: string[] }
  /** Mua một cấp nâng cấp Tiên giới bằng Tiên nguyên. */
  | { type: 'buyAscensionUpgrade'; upgradeId: string }
  /** Tẩy cả cây thiên phú ngự thú sư, tiêu 1 vật phẩm config.tamerTalents.resetItemId. */
  | { type: 'resetTamerTalents' }
  /** Kết / đổi bản mệnh thú ở thị trấn (docs/rules/tamer.md mục "Bản mệnh thú"). */
  | { type: 'bindBond'; monsterId: string }
  /** Khế ước quái đang sở hữu (thị trấn; có thể thất bại; docs/rules/tamer.md mục "Khế ước"). */
  | { type: 'formContract'; monsterId: string }
  /** Giải trừ khế ước (thị trấn; mất thân mật). */
  | { type: 'dissolveContract'; monsterId: string }
  /** Đột phá cảnh giới ngự thú sư ở thị trấn (docs/rules/tamer.md): có thể thất bại. */
  | { type: 'tamerBreakthrough' }
  /** nickname null hoặc chuỗi rỗng = xóa biệt danh. */
  | { type: 'renameMonster'; monsterId: string; nickname: string | null }
  /** Tiêu một trận đồ trong túi để học trận pháp của nó (ngoài trận; docs/rules/team.md). */
  | { type: 'learnFormation'; itemId: string }
  /** Chọn trận pháp đã học (null = bỏ trận pháp; ngoài trận, miễn phí). */
  | { type: 'setFormation'; formationId: string | null }
  /** Vuốt ve quái đang dưỡng dục (ngoài trận, miễn phí; docs/rules/imprinting.md). */
  | { type: 'petMonster'; monsterId: string }
