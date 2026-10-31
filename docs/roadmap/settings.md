# Cài đặt (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- Gồm: **tốc độ trận** (×1 / ×2 / ×4 / tức thì), **bật / tắt hiệu ứng**, mặc định cho tự farm (ngưỡng máu dừng, tự nghỉ), **theme** (mục "Theme" trong Lộ trình), **ngôn ngữ** (mục "Đa ngôn ngữ: phần UI" trong `docs/roadmap/ui-overhaul.md`).
- **Lưu riêng** ở `saves/settings.json`, **không** nằm trong save game, áp dụng cho mọi game. Nằm trong thư mục save nên copy USB vẫn mang theo. Đọc / ghi ở main process qua IPC như save; file hỏng thì dùng mặc định, không crash.
- Cài đặt chỉ ảnh hưởng hiển thị và tự farm, **không** ảnh hưởng luật chơi trong core.
- **Tùy chọn luật chơi theo từng game** (khác cài đặt ở trên): lưu **trong save** (`GameState.options`), đổi qua action của core, màn Cài đặt chỉ hiện công tắc khi đang có game. Hiện có: **bật / tắt thọ nguyên** (`lifespanEnabled`) và **chết thật** (`permadeathEnabled`), luật ở `docs/rules/options.md`; màn Game mới cũng cho chọn (mặc định tắt cả hai).
