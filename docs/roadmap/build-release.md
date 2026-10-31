# Build & phát hành (đã chốt, **chưa làm**)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

**Kiểu bản build** (electron-builder, một lần build mỗi nền tảng ra cả bản chạy luôn lẫn bộ cài):

| Nền tảng            | Bản chạy luôn (portable) | Bộ cài             | Thư mục save                                                                    |
| ------------------- | ------------------------ | ------------------ | ------------------------------------------------------------------------------- |
| Windows x64         | `portable` (.exe)        | `nsis` (Setup.exe) | portable: `saves/` cạnh file .exe; bộ cài: `userData/saves`                     |
| Linux x64           | `AppImage`               | `deb`              | AppImage: `saves/` cạnh file .AppImage (biến `APPIMAGE`); deb: `userData/saves` |
| macOS (x64 + arm64) | `zip` (.app)             | `dmg`              | luôn `userData/saves`                                                           |

- **Lý do thư mục save khác nhau:** bộ cài Windows (NSIS) khi **gỡ cài đặt có thể xóa cả thư mục cài**, nên save của bản cài **phải** nằm ở `userData`, và cấu hình NSIS **không xóa `userData` khi gỡ** (`deleteAppDataOnUninstall: false`). macOS chạy app từ vị trí tạm chỉ đọc (App Translocation) nên luôn dùng `userData`. Bản cài muốn mang sang máy khác thì dùng **Xuất / Nhập save** (đã có). Màn Tải game đã hiện thư mục save đang dùng.
- Thứ tự chọn thư mục save mới: `MCC_SAVE_DIR` (test) → `PORTABLE_EXECUTABLE_DIR/saves` (Windows portable) → thư mục của `APPIMAGE` + `/saves` (Linux AppImage) → dev: thư mục project → mọi bản còn lại (bộ cài, deb, macOS): `userData/saves`. Không ghi được ở thư mục ưu tiên thì lùi về `userData/saves`. Có test cho hàm chọn thư mục (tách thành hàm thuần nhận tham số môi trường).
- **Build từng nền tảng cần máy / môi trường của nền tảng đó:** bản macOS phải build trên macOS; Linux build trên Linux (hoặc WSL / Docker); Windows build trên Windows. Có thể dùng CI nhiều hệ điều hành sau này. **Máy build có internet** (electron-builder tải Electron, NSIS... bình thường, không cần mirror).
- **Lệnh:** `npm run build:win`, `npm run build:linux`, `npm run build:mac`. Mỗi lệnh chạy lần lượt: test → typecheck → eslint → build; bước nào lỗi thì dừng, không tạo bản build. Sau khi build: chạy thử bản portable trên thư mục **không có `node_modules`**, mở game, vào màn có tính chỉ số (bắt lỗi thiếu dependency).
- **Icon:** chưa có; Claude Code tự vẽ icon tạm dạng SVG, xuất `build/icon.png` 1024×1024 (electron-builder tự tạo `.ico` / `.icns`). Công cụ chuyển SVG → PNG để ở `devDependencies`. Sau này thay icon chỉ cần thay file.
- **Phiên bản:** lấy từ `version` trong `package.json`. **Màn tiêu đề hiện số phiên bản.** File save ghi thêm `appVersion` (chỉ để dò lỗi, **khác** `state.version` dùng cho migrate; không ảnh hưởng việc mở save).
- **Log lỗi ra file:** lỗi chưa bắt được ở main và renderer (gửi qua IPC) ghi vào `saves/logs/` (cùng chỗ với thư mục save đang dùng), giữ tối đa 5 file, mỗi file tối đa ~1 MB, file cũ tự xóa. Không ghi dữ liệu nhạy cảm. Bản build **tắt DevTools**.
- **Chưa ký số (code signing):** Windows hiện cảnh báo SmartScreen lần đầu ("More info → Run anyway"); macOS chặn app chưa xác minh (chuột phải → Open; bản arm64 electron-builder tự ký ad-hoc). Ký số làm sau.
