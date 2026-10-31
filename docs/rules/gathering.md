# Câu cá và khai thác

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Hai hành động trên tầng ngoài đánh quái hoang (bước 6n, 2026-11-01): **không phải minigame** (game dạng chữ), chỉ là action có RNG. Cần dụng cụ, ra quái của map hoặc nguyên liệu (luyện đan, luyện khí, Thợ rèn, thiên tài địa bảo, đồ tiến hóa). Số ở `balance.json` khóa `gathering` (số tạm đã chỉnh theo mô phỏng; `balance-systems.md`).

Code: model `model/gathering.ts` (`GATHERING_METHODS`, `GatheringConfig`, `GatheringResult`), luật theo cách thu thập và truy vấn `registries/gathering.ts` (`GATHERING_METHOD_RULES`, `gatheringToolTier`, `gatheringTierConfig`, `gatheringEncounters`, `gatheringItems`), action `battle/gathering.ts` (`gather`), sinh quái `generateGatheringEncounter` (`world/encounter.ts`), trận đặc biệt `SPECIAL_BATTLE_RULES.gathering` (`battle/specialBattles.ts`), thời gian ở reducer (`gatherWithTime`), kiểm tra `gameData/validateGathering.ts`, `game/validateGatheringState.ts`; cờ map sinh bằng `scripts/data-import/gathering.mjs` (dùng chung `gathering-import.mjs` và `biomes-import.mjs`); mô phỏng `scripts/simulate/gathering.ts`.

## Dữ liệu

- **Map** (`biomes.json`): trường tùy chọn `gathering: { fishing?: true, mining?: true }`; cách nào ghi `true` thì map làm được cách đó. Chỉ map của tầng (map hiểm địa có `gathering` báo lỗi). Map có cờ mà không có loài nào hợp cách đó (dưới) báo lỗi.
- **`config.gathering.<cách>`** (`fishing`, `mining`; thêm cách = thêm vào `GATHERING_METHODS` + một mục `GATHERING_METHOD_RULES`):
  - `battleChance` (0–100): % ra trận.
  - `elementIds`, `raceGroupIds`: quái gặp được = **loài của map** (`encounters` của biome, giữ trọng số quái hoang) mang một hệ trong `elementIds` hoặc thuộc nhóm race trong `raceGroupIds` (`gatheringEncounters`). Câu cá: hệ nước / nhóm thủy sinh; khai thác: hệ đất / đá / thép / nhóm khoáng vật.
  - `items`: bảng món `{ itemId, weight, min, max }` như rương, thêm `minTier?` (cấp dụng cụ tối thiểu, nguyên trong [1, số cấp]) và `mapElementId?` (chỉ ra ở map có hệ chủ đạo đó, `Biome.elementIds`).
  - `tiers`: mỗi cấp dụng cụ `{ rarityExponent ≥ 0, levelOffset (nguyên), itemRolls ≥ 1 }`, cấp 1 là phần tử đầu.
- **Dụng cụ** là **bùa** (category `charm`, `dex.md` mục "Bùa"): có trong túi là có tác dụng, không bán / vứt / rơi; hiệu ứng `fishingRodTier` / `pickaxeTier` (nguyên ≥ 1, nhiều cái thì lấy **cấp cao nhất**; cấp vượt số cấp của config báo lỗi). Mua một lần ở cửa hàng thị trấn (`buyCharm`, `townPrice`), cấp cao chỉ bán khi tầng cao nhất ≥ `townMinFloor` (`charmFloorLocked { itemId, minFloor }`). Lệch roadmap (đã ghi `keyItem` mua theo tầng): bùa có sẵn luật "có là có tác dụng" + mua một lần, chỉ thêm `townMinFloor`.
- **Mồi câu** (category riêng `fishingLure`, không phải `consumable` vì không dùng lên quái): `price`, `rarityFactor` ≥ 0; bán ở cửa hàng, rơi được.

## Câu cá / khai thác

- Action `fish { lureItemId? }` / `mine` (`gather`): ngoài trận, **đứng ở một tầng**, còn quái đánh được (`requireBattleStart` như trận quái hoang, kể cả hệ số shiny của kỹ năng đồng hành / event / bùa); map của tầng có cờ cách đó (`gatheringUnavailable { method, biomeId }`), có dụng cụ cấp ≥ 1 (`gatheringToolMissing { method }`). Mồi câu: id phải là `fishingLure` (`notFishingLure`), có trong túi (`notEnoughItem`), chỉ cho câu cá (khai thác gửi mồi: `malformedAction`); mất một cái mỗi lần câu.
- **Số mũ hiếm** = `rarityExponent` của cấp × `rarityFactor` của mồi (không mồi: × 1). Trọng số loài và trọng số món đều thành `weight ^ số mũ` (< 1 thì loài / món hiếm dễ ra hơn; 0 = san đều). Cần câu / cuốc tốt hơn → loài hiếm hơn, level cao hơn, món hiếm hơn (như Old / Good / Super Rod).
- Tung `battleChance`:
  - **Câu cá**: ra trận (**cá cắn câu**, `encounter: 'bite'`) thì **không** có vật phẩm; không ra trận thì tung bảng `itemRolls` lượt.
  - **Khai thác**: luôn **đào ra** vật phẩm trước (`itemRolls` lượt), rồi ra trận là **bị phục kích** (`'ambush'`).
- **Trận**: một quái thường (không boss, không gặp 2 quái) của `gatheringEncounters`, level quái thường của tầng + `levelOffset` (tối thiểu 1), gen / shiny / tuổi / cực như quái hoang. `battle.special = { kind: 'gathering', method, ambush }`: là **trận trên tầng** (đếm modifier / chuỗi event như trận quái hoang), được bắt, có quái xin theo / Thị Uy (`canRecruit`), thua như trận thường. Phục kích: **không chạy được ở lượt đầu** (`specialBattleRestricted { command: 'flee' }`), từ lượt 2 chạy như thường.
- **Thời gian**: lần không mở trận tốn `clock.hours.fishing` (1) / `mining` (2) giờ; lần mở trận tính giờ lúc rời trận như trận quái hoang. Lệch roadmap ("tính như một trận cho thời hạn theo trận"): lần không có trận **không** đếm thời hạn theo trận (linh thực, modifier, trọng thương, trứng) vì đó là việc gắn với chiến đấu (quy ước đồng hồ ở `lifespan.md`); lần có trận đếm như trận thường.
- `GameState.gathering.lastResult` = `{ method, tier, lureItemId, items, encounter: 'none' | 'bite' | 'ambush' }` của lần gần nhất (cho UI); `null` lúc bắt đầu.

## Nội dung

- **Cờ map** (`gathering.mjs`, chủ project duyệt luật 2026-11-01): map làm được một cách khi hệ chủ đạo của map có hệ của cách đó (câu cá thêm hệ băng: câu trên băng) hoặc ≥ 15% loài của map hợp cách đó. Hiện 68 / 190 map câu cá, 98 khai thác.
- **Dụng cụ** (tên do Claude đặt, chủ project duyệt 2026-11-01): Cần Câu Thường / Tốt / Siêu (`oldRod` / `goodRod` / `superRod`), Cuốc Sắt / Thép / Linh Thạch (`ironPickaxe` / `steelPickaxe` / `spiritPickaxe`): giá 1.000 / 20.000 (từ tầng 10) / 200.000 (từ tầng 30). Mồi Câu `fishingLure` (× 0,8, giá 10 × tầng), Linh Mồi Câu `spiritFishingLure` (× 0,5, giá 30 × tầng).
- **Bảng câu cá**: linh thạch Nước, tinh phách thủy sinh, mảnh Tera Nước; từ cấp 2: Đá Nước, Huyền Quy Giáp, Băng Tâm Liên (map hệ băng), Deep Sea Tooth / Scale, yêu đan Nước; cấp 3: Prism Scale, Z-Crystal Nước.
- **Bảng khai thác**: Đá cường hóa, linh thạch Đá / Đất (map khác hệ thêm linh thạch theo hệ của map), tinh phách khoáng vật, mảnh Tera Đá / Đất / Thép, Oval Stone; từ cấp 2: Đá Đất và đá tiến hóa theo hệ của map, yêu đan Đá / Đất / Thép; cấp 3: Tẩy luyện thạch, Metal Alloy, Black Augurite, Peat Block (đồ đào được ở Legends: Arceus).
