# Linh thực (nấu ăn) (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Nấu món ăn từ nguyên liệu (linh điền, đồ rơi) cho **buff tạm thời cả đội trong N trận**, như món ăn của Palworld / curry của Pokémon. Dùng chung hệ thống công thức của **luyện đan** (`alchemy.md`), làm ngay sau nó. Số là **số tạm** (`balance.json`, khóa `cooking`).

## Luật

- `recipes.json` thêm trường `station`: `alchemy` (mặc định) | `cooking`. Action `craft` dùng chung, NPC **Đầu bếp** ở thị trấn cho công thức `cooking`. **Cấp nấu ăn riêng** `GameState.cooking: { level, exp }` (cùng luật cấp / tỉ lệ với luyện đan).
- **Món ăn:** category mới `dish` (gộp chồng): `effects` (registry `MEAL_EFFECTS`: `teamStatPercent { stat? }`, `expPercent`, `moneyPercent`, `dropRatePercent`, `catchRatePercent`, `affinityGainPercent`...), `battles` (thời hạn).
- **Ăn** (`eatDish { itemId }`, ngoài trận, ở đâu cũng được): đặt `GameState.activeMeal = { itemId, battlesLeft }` cho **cả đội**; ăn món khác thì **thay** món cũ (không chồng). Thời hạn giảm sau mỗi trận (mọi loại trận). Hiệu ứng chỉ số áp ở bước áp trait cho quái ta trong đội.
- Ví dụ đề xuất: Linh Mễ Chúc (+5% mọi chỉ số, 10 trận), Hỏa Long Thang (+10% công, 10 trận), Bách Hoa Cao (+20% EXP, 15 trận), Kim Ngư Yến (+25% tiền, 15 trận), Đồng Tâm Bánh (+50% thân mật nhận, 20 trận). Nguyên liệu từ `alchemy.md` (dược liệu, linh điền).
- Bánh breed (`breeding-cakes.md`) và Bạc Hà Tính Cách (25 món `mint<Tính cách>` đã có trong `items.json`, luật ở `docs/rules/natures.md`) có công thức nấu ở đây.
- **Món nấu ăn cho dưỡng dục** (chờ từ bước 5e2, `docs/rules/imprinting.md`): đưa vài món `dish` rẻ vào `imprint.foods`; hiện `imprint.foods` chỉ nhận `consumable` cho ăn qua `useItem` (`checkFoods` ở `gameData/validateImprint.ts`, `applyItem` ở `world/field.ts`), nên mục này mở rộng kiểm tra và cách cho ăn một quái bằng món `dish` (đúng món thì tính yêu cầu `feed`).
- **Tăng version save** (`cooking`, `activeMeal`).

## Test

Nấu (dùng chung `craft`, cấp riêng), ăn / thay món, giảm thời hạn theo trận, từng hiệu ứng, migrate.

## Tài liệu khi xong

Luật vào luật luyện đan (`docs/rules/alchemy.md`), `world-items.md`, `state.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
