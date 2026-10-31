# Linh thực (nấu ăn)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Nấu món ăn từ nguyên liệu (linh điền, đồ rơi, cửa hàng) cho **buff tạm thời cả đội trong N trận**, như món ăn của Palworld / curry của Pokémon. Dùng chung hệ thống công thức của luyện đan (`alchemy.md`). Số tạm ở `balance.json` khóa `cooking`, `recipes.json` (`station: "cooking"`), `items.json` (category `dish`); số hiện tại ở `balance-systems.md` mục "Linh thực".

Code: nơi luyện `cooking` trong `CRAFT_STATION_RULES` (`progression/alchemy.ts`), kiểu `CookingState` / `ActiveMeal` / `MEAL_EFFECT_TYPES` (`model/alchemy.ts`), `DishItem` (`model/content.ts`), action `eatDish` (`progression/cooking.ts`), hiệu ứng `MEAL_EFFECTS`, `mealPercent`, `mealMultiplier`, `mealStatPercent`, `tickMeal` (`registries/mealEffects.ts`), kiểm tra dữ liệu `checkDish` (`gameData/itemCategories.ts`) và `config.cooking` (`gameData/validateAlchemy.ts`), kiểm tra save `validateCookingState` (`game/validateAlchemyState.ts`). Nhập dữ liệu: `scripts/data-import/cooking-import.mjs` (chạy lại được, chạy **sau** `alchemy-import.mjs` / `element-cores-import.mjs` vì `alchemy-import.mjs` ghi lại cả `recipes.json`).

## Nấu

- Công thức `station: "cooking"`, dùng chung action `craft` (thị trấn, NPC **Đầu bếp**; luật kiểm tra / tung / thất bại như luyện đan). **Cấp nấu ăn riêng** `GameState.cooking: { level, exp, lastCraft, meal }`, đường cong `config.cooking { expBase, expPower, levelBonusPercent }` (cùng luật cấp / tỉ lệ với luyện đan); thiếu cấp `cookingLevelTooLow { need, have }`. Chưa có cộng thêm % thành công ngoài cấp (kỹ năng đồng hành nấu ăn: chưa có loài / race nào). Công thức nấu có `scroll` bị kiểm tra dữ liệu chặn ("chưa hỗ trợ", công thức đã học chỉ lưu ở `alchemy.knownRecipes`).
- Công thức hiện có: 10 món ăn, **25 Bạc Hà Tính Cách** (2 dược liệu theo chỉ số tăng của tính cách: công Nhân Sâm, thủ Hà Thủ Ô, đặc công Linh Chi, đặc thủ Tuyết Liên, tốc Linh Quả; tính cách trung tính 1 Linh Chi + 1 Nhân Sâm; + 1 Linh Mật), **mồi dụ** (mồi khẩu vị: 1 tinh phách của race khẩu vị đầu + 1 Linh Quả ra 2; Mồi Dụ Thú: tinh phách thú + Linh Quả ra 2; Linh Mồi: tinh phách thú + Linh Mật + Nhân Sâm).

## Món ăn (category `dish`)

- `{ price, effects, battles }`, gộp chồng, bán / vứt được, không dùng qua `useItem`. `effects` không rỗng, mỗi mục `{ type, params }` theo registry `MEAL_EFFECTS`:
  - `statPercent { percent, stat? }`: % chỉ số **trong trận** cho mọi quái ta (phe người chơi), không ghi `stat` = mọi chỉ số kể cả max HP. Nguồn % `meal` (cộng cùng tổng với mọi nguồn %, `stats-traits.md`), qua `MonsterBattleContext.mealStatPercent` như thưởng sưu tập.
  - `expPercent`, `moneyPercent`, `dropRatePercent`, `catchRatePercent { percent }`: nhân EXP / tiền thắng / tỉ lệ mọi món rơi / tỉ lệ bắt (cả Khu bảo tồn) theo hệ số 1 + % / 100 (không dưới 0), **nhân** với kỹ năng đồng hành và modifier event như các nguồn khác của kênh đó. Mọi trận (không chỉ trận trên tầng).
  - `affinityGainPercent { percent }`: % thân mật nhận khi thắng trận, **cộng** cùng tổng với hook `affinityGainPercent` (Chuông An Thần) ở `affinityGain` (tham số `extraPercent`). Nguồn thân mật khác (nghỉ, vật phẩm) không nhân (món ăn tính theo trận).
  - `percent` khác 0, ≥ −100; trường lạ báo lỗi.
- **Ăn** (`eatDish { itemId }`, ngoài trận, ở đâu cũng được): tiêu một món, đặt `cooking.meal = { itemId, battlesLeft: battles }` cho **cả đội**; đang có món (kể cả cùng món) thì **thay** (không chồng, làm mới thời hạn). Lỗi: `inBattle`, `unknownItem`, `notDish`, `notEnoughItem`.
- **Thời hạn:** mọi trận kết thúc (thắng, thua, chạy; mọi loại trận) bớt 1 ở `finish`, sau khi đã tính thưởng của trận đó; về 0 thì mất.
- **Dưỡng dục:** `config.imprint.foods` nhận cả món `dish`; ăn món đang được quái trong đội (không đi thám hiểm) đòi thì tính là cho ăn (`fulfillImprint { kind: 'feed' }`, `imprinting.md`).
- Món hiện có: Linh Mễ Chúc (+5% mọi chỉ số, 10 trận), Đồng Tâm Bánh (+50% thân mật nhận, 20 trận), Hỏa Long Thang (+10% công, 10 trận), Huyền Quy Canh (+10% thủ / đặc thủ, 10 trận), Truy Phong Bánh (+10% tốc, 10 trận), Dụ Thú Cao (+20% tỉ lệ bắt, 15 trận), Bách Hoa Cao (+20% EXP, 15 trận), Kim Ngư Yến (+25% tiền, 15 trận), Tầm Bảo Thang (+25% đồ rơi, 15 trận), Bát Trân Yến (+10% mọi chỉ số, +10% EXP, +10% tiền, 20 trận; cần 1 yêu đan bất kỳ). Linh Mễ Chúc và Đồng Tâm Bánh nằm trong `imprint.foods`.

## Kiểm tra save

- `cooking`: cấp khớp tổng exp (như luyện đan), `lastCraft` null hoặc công thức nấu ăn, `meal` null hoặc `{ itemId là món ăn, battlesLeft nguyên ≥ 1 }` (trường lạ báo lỗi). Save v79 thêm `cooking` (`state-versions.md`). Trường Decimal: `cooking.exp` (`bigFields.ts`).

## Mô phỏng

- Chơi liên tục: mỗi lần ở thị trấn, chưa có món đang ăn thì "người chơi" ăn món trong túi, không có thì nấu món có cấp yêu cầu cao nhất đủ nguyên liệu (nguyên liệu thiếu mà cửa hàng đang bán thì mua; nấu tới khi thành công) rồi ăn; chạy **trước** luyện đan (luyện đan dùng hết dược liệu). Không nấu Bạc Hà / mồi dụ. Cột `meals`, `cooks`, `cookingLevel` ở `progression.csv` (`scripts/simulate/cooking.ts`, `simulation-features.md`).
