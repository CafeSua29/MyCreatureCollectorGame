# Thao tác hàng loạt (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- **Thả quái hàng loạt theo bộ lọc:** dùng lại bộ lọc của danh sách quái (`listMonsters`: loài, race, hệ, trait, shiny, boss, level...). Hiện trước danh sách và số lượng sẽ bị thả, hỏi xác nhận. Không bao giờ làm đội rỗng (đội luôn còn ít nhất 1 con). Trang bị trên quái bị thả tự về túi.
- **Bán / vứt item hàng loạt theo bộ lọc:** theo category, bậc hiếm (trang bị), trait / cấp (tinh thể). Bán ở cửa hàng (50% giá như thường), vứt ở đâu cũng được; phân giải trang bị theo bộ lọc ở Thợ rèn (dựng trên `salvageEquipment { instanceIds }`, `equipment-forge.md`). Hiện tổng số món và tổng tiền nhận trước khi xác nhận.
- **Hiến tế hàng loạt** (`sacrifice.md`): core đã có (một action `sacrifice` nhận nhiều `subIds`); còn bộ lọc chọn nhiều quái phụ cùng race / lineage ở UI.
- Mỗi thao tác hàng loạt là **một action** của core (nhận danh sách id đã lọc), không gọi nhiều action lẻ, để chỉ tự lưu một lần.
