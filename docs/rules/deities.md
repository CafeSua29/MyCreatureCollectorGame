# Thần linh và ân sủng

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Gods / Favor của Siralim: mỗi map do một **thần** cai quản; hoạt động trong map tăng **ân sủng** với thần đó, bậc ân sủng mở **chúc phúc** chỉ có tác dụng trong các map của thần. Bước 7e (2026-11-01). Số là **số tạm** ở `balance.json` khóa `deities` và `deities.json` (bảng ở `balance-systems.md`).

Code: model `model/deities.ts`; chúc phúc (registry `BLESSING_EFFECTS`, bậc, % theo kênh, % chỉ số) `registries/blessings.ts`; thần của trận, ân sủng sau trận, tín vật rơi `battle/deities.ts`; Miếu (dâng hương, cửa hàng thần) `world/deities.ts`; kiểm tra dữ liệu `gameData/validateDeities.ts`, kiểm tra save `game/validateDeityState.ts`. Nhập dữ liệu: `scripts/data-import/deities-import.mjs` (nguồn `deities-source.json`, chạy lại được).

## Dữ liệu

- `src/data/deities.json`: `{ id, elementId, tokenItemId, blessings: [{ effects: [{ type, params }] }], shop: [{ itemId, price, minRank }] }`; tên ở `i18n/<ngôn ngữ>/deities.json`.
  - `elementId`: hệ của thần (chúc phúc % chỉ số chỉ cho quái có hệ này). `tokenItemId`: tín vật (vật phẩm gộp chồng rơi được từ quái).
  - `blessings`: danh sách không rỗng, mỗi chúc phúc ít nhất một hiệu ứng. **Lệch roadmap** (roadmap ghi `{ rank, effects }`): bỏ `rank`, bậc k mở chúc phúc thứ ((k − 1) mod số chúc phúc), hết danh sách thì **lặp lại và cộng dồn** để ân sủng không trần vẫn luôn có thưởng (không cần dữ liệu vô hạn).
  - `shop`: món gộp chồng (không trùng), `price` nguyên ≥ 1 tín vật của thần, `minRank` nguyên ≥ 0 (bậc ân sủng cần để mua).
- `Biome.deityId?` (`biomes.json`): thần cai quản map; bỏ trống = map không có thần. Map của hiểm địa (`zones.json`) cũng có `deityId`: thần của **hệ chủ đạo** của hiểm địa (hệ trong điều kiện `partyElement`, không có thì hệ đầu của loài gặp nhiều nhất theo trọng số; `scripts/data-import/deityAssign.mjs`, dùng chung cho `zones-import.mjs` và `deities-import.mjs`; chủ project duyệt 2026-11-01). Gán theo **kiểu môi trường** (`theme`) của map: `themes[x].deityId` trong `biomes-source.json`, `biomes-import.mjs` ghi khi sinh map, `deities-import.mjs` ghi lại vào `biomes.json` hiện có.
- **Danh sách thần** (22, một thần mỗi hệ, chỉ dùng chức danh theo `content-data.md`; 19 thần đầu chủ project duyệt 2026-11-01, 3 thần của hệ Cassette Beasts Claude đặt 2026-11-04): Thành Hoàng (Thường; đồng cỏ), Hỏa Đức Tinh Quân (Lửa; núi lửa, địa nhiệt), Thủy Đức Tinh Quân (Nước; bờ biển, hồ), Lôi Công (Điện; bão, đại dương, gió mùa), Mộc Đức Tinh Quân (Cỏ; rừng ôn đới, Địa Trung Hải), Sương Thần (Băng; băng giá, taiga, lãnh nguyên, sông băng, biển cực), Chiến Thần (Võ; xavan, thảo nguyên), Ôn Thần (Độc; đầm lầy, đất hoang), Thổ Đức Tinh Quân (Đất; sa mạc, sa mạc lạnh), Phong Bá (Bay; trời, hẻm núi, núi tuyết), Mộng Thần (Tâm linh; hang pha lê, cõi tâm linh), Tàm Thần (Bọ; rừng nhiệt đới, rừng ngập mặn), Sơn Thần (Đá; núi, karst), Diêm Vương (Ma; nơi ma ám, phế tích), Long Vương (Rồng; vực thẳm, rạn san hô, rừng tảo bẹ), Dạ Du Thần (Bóng tối; hang động, hỗn mang), Kim Đức Tinh Quân (Thép; công nghiệp, đồng muối, miệng phun thủy nhiệt), Hoa Thần (Tiên; rừng phép, rừng mây), Thái Dương Tinh Quân (Ánh sáng; thánh địa), Lưu Ly Tinh Quân (Thủy tinh; vùng thủy tinh), Khuôn Đúc Tinh Quân (Nhựa; bãi phế liệu), Lễ Hội Tinh Quân (Kim tuyến; lễ hội). Map theo thần (2026-11-01): 2 (Thái Dương) tới 17 (Mộc Đức) map.
- **Vật phẩm**: Hương Nến `incense` (`material` có giá; bán ở Miếu, giá × tầng; kiểm tra dữ liệu bắt buộc có `price`), Tín Vật mỗi thần `<thầnId>Token` (`material`, giá bán nhỏ, chỉ rơi trong map của thần).

## Ân sủng

- `GameState.favor: { [deityId]: Decimal }` (nguyên ≥ 0; thần chưa có ân sủng thì không có mục).
- **Thần của trận** (`battleDeityId`): thần cai quản map của trận (`battleBiome`: tầng, bí cảnh / tháp theo map chủ đề, hiểm địa theo map riêng). **Không có** thần (null) khi trận không diễn ra trong map: độ kiếp, giải đấu / đấu trường (cờ `inMap` của `TRAINER_MODE_RULES`; NPC gặp trên tầng, đạo quán, bí cảnh, event thì có), thú triều, boss thế giới (cờ `inMap` của `SPECIAL_BATTLE_RULES`; trận event, hiểm địa, câu cá / khai thác thì có).
- **Tăng ân sủng** với thần của trận (`grantBattleFavor`, trong `finish`, mọi kết quả): mỗi quái bắt được (bóng, Thị Uy) + `favorPerCapture` (3); thắng + `favorPerWin` (1), trận boss thêm `favorPerBossWin` (10). Nhận quái xin theo / boss quy phục (`acceptRecruit`) + `favorPerCapture`. Log `favorGained { deityId, amount, rank }` và khi lên bậc `blessingRankUp { deityId, rank }`.
- **Miếu** (thị trấn, ngoài trận, không dự giải, không trong bí cảnh / hiểm địa): `buyIncense { count }` mua Hương Nến **luôn có hàng** (giá `incensePrice` = giá vật phẩm × tầng cao nhất như cửa hàng; không nằm trong hàng ngẫu nhiên của cửa hàng vì mô phỏng cho thấy gần như không bao giờ có hàng; lỗi `notEnoughMoney`, `stackLimitReached`); `offerIncense { deityId, count }` mất `count` Hương Nến, + `favorPerIncense` (200) mỗi nén. Lỗi: `inBattle`, `notInTown`, `unknownDeity`, `notEnoughItem`, số lượng sai `malformedAction`.
- **Bậc ân sủng** (`favorRank`): bậc r cần `rankBase` × r^`rankPower` ân sủng (25 × r²; đa thức, không trần; dùng chung `levelCurve`). Bậc 0 = chưa có chúc phúc.

## Chúc phúc

- Chỉ tác dụng trong trận có thần của trận là thần đó (cùng `battleDeityId`), riêng tỉ lệ shiny xét map của tầng lúc gặp. % của các chúc phúc đã mở cộng dồn (× số lần mở), rồi mỗi kênh nhân như kỹ năng đồng hành / món ăn (cộng như mọi nguồn trong cùng kênh).
- Hiệu ứng (`BLESSING_EFFECTS`; params `{ percent }`, % khác 0, ≥ −100):

| Loại                 | Tác dụng                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `elementStatPercent` | `{ percent, stat? }`: % chỉ số trong trận cho **quái ta có hệ của thần** (không ghi stat = mọi chỉ số kể cả max HP), nguồn % `blessing` |
| `expPercent`         | × EXP cả trận (cùng chỗ kỹ năng đồng hành / món ăn)                                                                                     |
| `moneyPercent`       | × tiền thắng                                                                                                                            |
| `dropRatePercent`    | × tỉ lệ mọi đồ rơi của trận                                                                                                             |
| `catchRatePercent`   | × tỉ lệ bắt bằng bóng                                                                                                                   |
| `recruitPercent`     | + % thu phục (xin theo, quy phục, Thị Uy; `recruit.md`)                                                                                 |
| `shinyChancePercent` | × tỉ lệ shiny của quái gặp ở tầng có map của thần (`requireBattleStart`)                                                                |

- Mẫu chúc phúc trong dữ liệu (`deities-import.mjs`, vòng 10 bậc): +3% chỉ số, +5% EXP, kênh riêng của thần +10%, +5% chỉ số riêng của thần, +5% đồ rơi, +3% chỉ số, +5% bắt, +5% tiền, +5% thu phục và +5% shiny, kênh riêng +15% và +3% chỉ số. Mỗi vòng 10 bậc: +14% chỉ số (chỉ số riêng +19%) cho quái cùng hệ.

## Tín vật và cửa hàng thần

- Mỗi quái hoang / boss bị hạ trong trận có thần (không phải trận NPC) tung tín vật của thần với `tokenWildChance` % (5) / `tokenBossChance` % (100), × hệ số rơi của trận (`EXTRA_DROP_TABLES`, `deityTokenDrops`).
- `buyDeityItem { deityId, itemId, count }` (ở Miếu): mất `price × count` tín vật của thần, nhận `count` món. Lỗi: `deityItemNotSold`, `blessingRankTooLow { deityId, rank, need }`, `notEnoughItem` (kể cả giá tràn số nguyên an toàn), `stackLimitReached`, lỗi chung của Miếu.
- Cửa hàng mỗi thần (dữ liệu): yêu đan hệ của thần (8, bậc 1), Mảnh Tera hệ (12, bậc 2), Ngộ Đạo Trà (10, bậc 2), Thiên Linh Quả (15, bậc 3), Z-Crystal hệ (25, bậc 4), Ngũ Hành trận đồ (40, bậc 5), Kẹo Hiếm (30, bậc 6), Long Huyết Quả (40, bậc 6), Luân Hồi Đan (60, bậc 8), Tẩy Tủy Đan (100, bậc 10).

## Save

- `GameState.favor`; kiểm tra: object, mỗi giá trị Decimal nguyên ≥ 0. **Không** kiểm tra id có khớp thần trong dữ liệu (mục thừa vô hại, như saturation của giá thị trường). v83 migrate: `favor: {}` (`state-versions.md`).

## Mô phỏng

Chơi liên tục: ân sủng / chúc phúc / tín vật chạy thật theo reducer; "người chơi" dâng hương, đổi tín vật ở thị trấn (`scripts/simulate/deities.ts`, mục "Thần linh" ở `simulation-features.md`). Cột `incense`, `deityBuy`, `favorRank` trong ô `economy` của `progression.csv`.

## Chưa có

- Màn Miếu (danh sách thần, bậc, chúc phúc, cửa hàng): chờ UI (`ui-overhaul.md`).
