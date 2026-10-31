# Theme (đã chốt thiết kế, làm ở bước UI)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- Lựa chọn: **Tối** / **Sáng** / **Theo hệ thống** (đi theo cài đặt Windows qua `prefers-color-scheme` / `nativeTheme` của Electron; đổi theme Windows lúc đang chạy thì game đổi theo). **Mặc định: Tối.**
- Đổi trong Cài đặt, **áp dụng ngay**, lưu trong `saves/settings.json`.
- Mọi màu qua **biến CSS** trong `main.css`; mỗi theme là một bộ giá trị biến (ví dụ `[data-theme="light"]`). Component không viết màu cứng (đã có trong quy tắc code sạch). Màu theo hệ, loại trait, bậc hiếm... phải đọc rõ ở cả hai theme.
