# Âm / Dương hóa (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Light / Dark Shift của Monster Sanctuary, đổi sang chất tu tiên: **mọi loài** có thể chuyển vĩnh viễn sang **Âm** hoặc **Dương**, tăng chỉ số theo hướng và nhận một **trait cực tính**. Làm sau "Tính cách" và "Phẩm cấp tư chất". Số là **số tạm** (`balance.json`, khóa `polarity`).

## Luật

- Trường mới `polarity`: `null` | `'yin'` | `'yang'`. **Tăng version save**, migrate `null`.
- **Hiệu ứng** (% cộng vào tổng % ở bước áp trait):
  - **Dương:** +10% công, +10% đặc công, +5% tốc độ.
  - **Âm:** +10% thủ, +10% thủ đặc biệt, +5% HP.
  - **Trait cực tính:** một trait loại mới `polarity` (pool riêng cho Âm và Dương trong `traits.json`, ví dụ Dương: Liệt Dương (+sát thương hệ lửa / ánh sáng), Thuần Dương (miễn bỏng); Âm: U Minh (+sát thương hệ ma / bóng tối), Hàn Âm (miễn ngủ)), random khi chuyển cực. **Không chiếm ô trait** (như shiny / boss / race), luôn cấp 1, không extract / inject, không truyền qua breeding như trait thường.
  - **Âm dương tương khắc:** quái Âm đánh quái Dương (và ngược lại) sát thương +`opposeBonus` (10%) trong công thức sát thương; cùng cực hoặc không cực thì không đổi.
- **Chuyển cực** (ngoài trận, lên quái ta): **Âm Thạch** / **Dương Thạch** (quái chưa có cực → Âm / Dương), **Hoán Cực Thạch** (đổi Âm ↔ Dương, random lại trait cực tính), **Quy Nguyên Thạch** (về không cực, mất trait cực tính). Nguồn: boss rơi, chợ đen, cửa hàng (trọng số thấp, giá theo tầng), luyện đan.
- **Mở khóa:** từ `highestFloor ≥ unlockFloor` (30): quái hoang có `wildChance` (10%) đã có cực (random Âm / Dương), boss 25%.
- **Breeding:** bố mẹ **cùng cực** thì con cùng cực đó (trait cực tính random lại); khác cực hoặc một bên không cực thì con không cực. Trứng boss theo cực của boss. **Fuse:** quái gốc giữ cực **và trait cực tính** của mình (trait cực tính không bị random lại khi fuse, như trait race). Loại trait `polarity` thêm vào `CRYSTAL_EXCLUDED_TRAIT_KINDS` (không có tinh thể). **Tiến hóa:** giữ.
- `MonsterView`: cực, trait cực tính, % đang cộng.

## Test

Hiệu ứng từng cực, trait cực tính (không chiếm ô, cấp 1), tương khắc trong sát thương, từng loại đá, quái hoang / boss theo tầng mở khóa, breeding cùng / khác cực, fuse / tiến hóa, migrate.

## Tài liệu khi xong

Luật vào `stats-traits.md`, `battle.md` (sát thương), `breeding-eggs.md`, `state.md`, `world-items.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
