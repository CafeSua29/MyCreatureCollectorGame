# Rogue Fusion và các cách tạo Bootleg

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Làm 2026-11-07 (save v112), lấy từ **Rogue Fusion** của Cassette Beasts và các cách tạo Bootleg của gốc (Ritual Candle, Hacking Glove, nhà Bootleg, bảng Ranger). Nguồn: trang `Rogue_Fusion`, `Bootleg`, `Ritual_Candle`, `Hacking_Glove`, `Fused_Material` của `wiki.cassettebeasts.com`. Số là **số tạm** (`balance.json` khóa `rogueFusion`; giá trị ở `balance-content.md`).

Code: type `model/rogueFusion.ts`; trận `battle/rogueFusion.ts` (`rollRogueFusionStart`, `openRogueFusion`, `rollComponents`, `rogueMerge`, `dissolveRogueFusion`, `spawnSwarmFusion`, `grantRogueFusionRewards`, `grantBossFusedMaterial`), móc ở `battleActions.ts` (`startWildBattle`), `hpChanges.ts` (`loseHp`), `turn.ts` (`settleAfterTurn`), `battleItems.ts` (bóng), `specialBattles.ts`; action ngoài trận `roster/rogueFusionActions.ts`; kiểm tra dữ liệu `gameData/validateRogueFusion.ts`, kiểm tra save `game/validateRogueFusionState.ts`, `validateEventState.ts` (`battle.special`).

## Gặp

- Gốc: Rogue Fusion là boss phụ thường gặp khắp bản đồ. Game: mỗi `startWildBattle` (sau lượt tung ngự thú sư NPC) có **`chance` (3) %** thành trận Rogue Fusion thay trận hoang thường (`battle.special = { kind: 'rogueFusion', variant, swarmPending }`, trận trên tầng, chạy được). Tỉ lệ 0 không tốn RNG. Lệch gốc: gốc thấy trên bản đồ và xem trước tên / hệ trước khi đánh; game chưa có bản đồ đi lại nên gặp theo tỉ lệ như boss ngẫu nhiên.
- **Biến thể** (theo `variantWeights` trong các biến thể có được): `standard`; `flood` (map có hệ chủ đạo thuộc `floodElementIds`: lửa, độc, nước như dung nham / độc lỏng / nước ngập của gốc); `swarm`; `orb` (tầng cao nhất ≥ `orbUnlockFloor`, thay cho "bảng Ranger cấp 6 + Here Comes The Sun" của gốc).
- **Thành phần** (`rollComponents`): hai quái hoang của map (level / gen / độ khó / Randomizer như quái hoang); mỗi thành phần `seenSpeciesChance` (1) % đổi thành loài đã gặp trong Dex, `remasterChance` (10) % tiến hóa lên dạng kế tiếp (remaster của gốc). Flood: thành phần thứ hai là loài của một hệ ngập của map (loài gặp ở map có hệ đó). Thành phần là quái lớn thì trận thành trận hoang thường (hợp thể cần đủ hai ô).
- **Bootleg** (`bootleg.md`): `bootlegChances` theo biến thể như gốc: thường 2%, Flood 5% (ở thành phần ngập), Swarm 10%, Orb 20%; trúng thì một thành phần ngẫu nhiên thành Bootleg hệ ngẫu nhiên (ngoài 0,1% riêng của từng quái hoang).

## Trong trận

- Hai thành phần ra sân rồi **hợp thể sẵn** (`rogueMerge`, dùng chung hợp thể `battle-merge.md`): chỉ số / skill / hai hành động mỗi lượt như hợp thể thường, nhưng `battleTransform.rogue` **không hết lượt** và không tính lượt hợp thể của phe địch.
- **Không bắt được thực thể hợp thể** (`cannotCatchFusion`), như gốc không ghi băng được Rogue Fusion.
- **Bị hạ thì tan ra** (`dissolveRogueFusion`, trong `loseHp` trước khi gục): hai thành phần **hồi đầy máu** về ô của mình, mỗi trạng thái của thực thể (trừ quả cầu) về ngẫu nhiên một thành phần, cả hai **chùn bước** lượt sau (`flinchStatusId`, 2 lần cuối lượt để có tác dụng ở lượt sau); log `rogueFusionDissolved`. Sau đó đánh / bắt từng thành phần như quái hoang (gốc: hạ xong ghi băng được thành phần).
- **Swarm**: trận mở với `swarmSize` (5) quái bầy cùng một loài của map (2 trên sân, còn lại vào thay như đội NPC; gốc 3 rồi thêm 2); đã hạ ít nhất `swarmFusionAfter` (4) con thì quái bầy còn lại bỏ đi và hợp thể xuất hiện ngay (`spawnSwarmFusion`, trước khi xét thắng), một thành phần là loài bầy (remaster `swarmRemasterChance` 50%), thành phần kia là quái khác của map; log `rogueFusionAppeared` (`variant: 'swarm'`).
- **Orb**: thực thể mang trạng thái `rogueOrb` (`orbStatusId`): Barrier `orbBarrierPercent` (100) % max HP (thanh máu thêm, vỡ trước), +100% max HP (gốc: max HP gốc cao hơn nhiều), skill không tốn thể lực (gốc: Archangel không tốn AP); còn đầy máu thì AI dùng Fusion Power (`fusion-power.md`).

## Thưởng

- Thắng: `fusedMaterial` Fused Material theo biến thể (1, Orb 5 như gốc) và `cyberChances` % một **Cyber Material** (gốc chỉ ở trận raid nhiều người; game chơi một người nên cho rơi theo tỉ lệ: thường / Flood 5%, Swarm 10%, Orb 50%). **Lần đầu có Cyber Material thì nhận Hacking Glove** (gốc: Codey tặng sau Cyber Material đầu tiên), log `hackingGloveGained`.
- **Hạ boss** (trận tĩnh của gốc): + `bossFusedMaterial` (1) Fused Material.
- **Fused Material** (`fusedMaterial`, vật liệu gộp chồng, bán được): đổi ở thị trấn `exchangeFusedMaterial { itemId, count }` theo `exchange` (như Ranger Wilma): Nến nghi lễ 50. Lỗi `notExchangeable`, `notEnoughItem`, `malformedAction`, `notInTown`. Lệch gốc: wiki không ghi hàng / giá của Wilma, game chỉ có Nến nghi lễ (số tạm).

## Cách tạo Bootleg của gốc

- **Ritual Candle** (`ritualCandle`): `lightRitualCandle { monsterId, discardOverflow? }` (ngoài trận): hiến một quái của ta (thả như `releaseMonster`: khóa, bản mệnh, đồ về túi), Rogue Fusion kế tiếp chắc chắn có Bootleg: `candleSpeciesPercent` (50) % một thành phần là **loài quái đã hiến** với hệ Bootleg ngẫu nhiên, còn lại một thành phần thành Bootleg **cùng hệ đầu** của quái đã hiến (loài thành phần không mang hệ đó). Hết khi trận Rogue Fusion mở (chạy trốn cũng mất như gốc). Đang có nến thì `omenActive`. Nguồn: đổi Fused Material, thưởng mốc Dex `dex50` (gốc: Hoylake tặng khi đủ 120 mục Bestiary).
- **Hacking Glove** (`hackingGlove`, vật phẩm chìa khóa): `hackRogueFusion` (ngoài trận) tốn 1 Cyber Material, Rogue Fusion kế tiếp có một thành phần thành Bootleg hệ ngẫu nhiên (loài giữ nguyên); **đè Ritual Candle** (nến vẫn giữ cho lần sau) như gốc. Lệch gốc: gốc hack khi đã thấy hợp thể trên bản đồ; game hack trước như nến.
- **Nhà Bootleg** (gốc: nhà ở West Harbourtown tặng Bootleg ngẫu nhiên trong 21 loài): `claimBootlegHouseGift` (thị trấn, một lần): một quái Bootleg level `houseGiftLevel` (5), loài ngẫu nhiên trong loài quái thường của các map đã mở. Lỗi `giftClaimed`, `giftUnavailable`, `rosterFull`.
- **Bảng nhiệm vụ** (gốc: bảng Ranger cấp 5 tặng Bootleg của băng khởi đầu không chọn): `claimQuestBootlegGift` (thị trấn, một lần) khi đã hoàn thành ít nhất `questGiftQuests` (10) nhiệm vụ: Bootleg level khởi đầu của một loài khởi đầu **không được chọn** (`rogueFusion.starterAlternatives`, lưu lúc tạo game; save cũ không có thì loài ngẫu nhiên của các ô khởi đầu). Lỗi `giftLocked { need, have }`, `giftClaimed`.
- Quái quà: lý lịch `origin { kind: 'bootlegGift', gift: 'house' | 'quest' }` (`monster-history.md`), thân mật như quái bắt được.

## Save, dữ liệu

- Save v112: `GameState.rogueFusion = { omen: { candle: { speciesId, elementId } | null, hack }, houseGiftClaimed, questGiftClaimed, starterAlternatives }` (`validateRogueFusionState`), `battle.special` loại `rogueFusion` (`variant` hợp lệ, `swarmPending` chỉ ở Swarm), `battleTransform.rogue` chỉ trên quái chính hợp thể. Migrate v111 → v112: chưa điềm báo, chưa nhận quà, `starterAlternatives` rỗng.
- Kiểm tra dữ liệu (`checkRogueFusionConfig`): tỉ lệ 0–100, bảng theo đủ biến thể, `swarmFusionAfter ≤ swarmSize`, id trạng thái / vật phẩm / hệ tồn tại, hàng đổi (vật phẩm tồn tại, giá nguyên ≥ 1, không trùng), trường lạ.
- Mô phỏng: trận Rogue Fusion xuất hiện trong chơi liên tục theo tỉ lệ thật (AI đánh như hợp thể); "người chơi" chưa dùng nến / găng / đổi vật liệu / nhận quà (không đổi cân bằng chính).
