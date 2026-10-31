# Thiên mệnh (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như mệnh cách / khí vận trong game tu tiên: lúc **tạo game** (và sau mỗi lần **phi thăng**), ngự thú sư chọn **thiên mệnh**: mỗi cái có lợi kèm hại, đổi cách chơi. Làm cùng đợt với "Phi thăng". Số là **số tạm**.

## Luật

- Dữ liệu `src/data/destinies.json`: `{ id, rarity, effects }` (hiệu ứng toàn cục qua registry dùng chung với danh hiệu / chúc phúc; % cộng như mọi nguồn). Ví dụ: **Thiên Tuyển** (tỉ lệ shiny +100%, tiền −20%), **Sát Tinh** (sát thương quái ta +10%, tỉ lệ bắt −20%), **Phúc Tinh** (đồ rơi +25%, EXP −10%), **Thiên Sát Cô Tinh** (chỉ số quái ta +15%, đội tối đa 4 ô), **Đan Đạo Kỳ Tài** (luyện đan +15% thành công, thọ nguyên quái −10%), **Ngự Thú Thánh Thể** (cộng hưởng khế ước +50%, giá đột phá +100%). Tên ở `i18n`.
- Màn Game mới: random **3 lựa chọn** (theo `rarity`), chọn 1. Số ô thiên mệnh tăng bằng nâng cấp tiên giới (`ascension.md`). Có nút **"Phàm nhân"** (không chọn gì) cho ai muốn chơi thường.
- `GameState.destinies: id[]`. **Không đổi** giữa chừng (chỉ chọn lại khi phi thăng). **Tăng version save** (save cũ: rỗng).

## Test

Sinh lựa chọn (tất định), chọn / Phàm nhân, hiệu ứng từng loại, chọn lại sau phi thăng, migrate.

## Tài liệu khi xong

Luật vào luật phi thăng / tùy chọn (`docs/rules/`), `state.md`, `data.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
