# Khóa quái, yêu thích, đội hình mẫu (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Tiện ích quản lý quái, đi cùng "Thao tác hàng loạt" (`bulk-actions.md`).

## Khóa và yêu thích

- Trường mới trên quái: `locked` (boolean), `favorite` (boolean). Đổi ngoài trận, miễn phí.
- **Quái khóa không thể:** thả, làm quái phụ khi fuse, hiến tế, phân giải / trao đổi, nằm trong mọi thao tác hàng loạt có mất quái (mã lỗi `monsterLocked`). Vẫn ra trận, breed, tiến hóa, làm quái gốc khi fuse bình thường.
- `favorite` chỉ để lọc / sắp xếp (`roster.md`). Quái shiny / boss bắt về **tự khóa** (có thể mở).

## Đội hình mẫu

- `GameState.teamPresets`: tối đa `presetSlots` (10) mẫu `{ name, monsterIds (thứ tự ô), equipmentByMonster? }`.
- `saveTeamPreset` / `applyTeamPreset { presetId, withEquipment }` (ngoài trận, ở thị trấn hoặc tầng): đưa đúng quái vào đội theo thứ tự, quái cũ về kho; `withEquipment` thì lắp lại đúng món (món đang ở quái khác thì tháo sang). Quái / món không còn: bỏ qua, log `presetMissing`. Áp đội hình đúng luật đội (ô, quái lớn: `docs/rules/monster-size.md`).
- **Tăng version save**.

## Test

Khóa chặn đúng các thao tác, tự khóa shiny / boss, yêu thích lọc, lưu / áp đội hình (có / không trang bị, thiếu quái / món), migrate.

## Tài liệu khi xong

Luật vào `roster.md`, `state.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
