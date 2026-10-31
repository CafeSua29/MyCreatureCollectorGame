# Thế mạnh / thế nhanh: chiêu Legends: Arceus còn chờ

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Cơ chế và danh sách skill có thế đã làm (luật ở `docs/rules/move-styles.md`). Còn 5 chiêu Legends: Arceus chưa có trong `skills.json` (danh sách mới nhất ở `scripts/data-import/move-styles-report.json`). Nhập xong chiêu nào thì thêm vào `scripts/data-import/la-moves-import.mjs` rồi chạy lại `move-styles-import.mjs --apply`.

- **Chờ hiệu ứng mới:** Focus Energy (skill và bậc chí mạng đã có từ 2026-10-27, còn chờ: luật thế mạnh / thế nhanh của Focus Energy theo Legends: Arceus, nơi chí mạng tính khác), Hidden Power (đổi hệ theo quái), Mimic (sao chép skill địch), Power Shift (đổi chỉ số công ↔ thủ), Rest (hồi đầy máu rồi ngủ đúng 2 lượt: `applyStatus` chưa có số lượt cố định). Chờ mục nội dung thêm các hiệu ứng này.
