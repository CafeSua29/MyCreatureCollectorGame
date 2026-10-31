# UI (renderer)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- React, không thư viện UI / state ngoài. Hiện dùng font hệ thống; muốn dùng font riêng thì tải về và đóng gói vào bản build (bản build không tải gì từ mạng, `CLAUDE.md` mục Kiến trúc). Theme tối, màu và nhãn trong `src/renderer/src/styles/main.css` và `src/renderer/src/shared/lib/labels.ts`.
- `src/renderer/src/shared/game/gameData.ts`: nạp dữ liệu bằng `tryCreateGameData` (lưới an toàn: lỗi thì App hiện danh sách lỗi); `newSeed()` lấy seed bằng `crypto.getRandomValues` (renderer được dùng, core thì không).
- `src/renderer/src/shared/lib/format.ts`: `formatNumber` (quy tắc 8): nhận `number`, `Decimal` hoặc chuỗi số (summary trong file save), tính bằng `Decimal`. Dưới 1000 bỏ phần lẻ; từ 1000 rút gọn K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc với **dấu phẩy thập phân, 1 chữ số, cắt xuống** (1234 → "1,2K", 1000 → "1K"); vượt Dc thì dạng mũ, chạy được với số mũ rất lớn ("1,2e40", "1,2e1000"); không phải số → "?", vô cực → "∞". Có test.
- `src/renderer/src/shared/lib/statBar.ts`: thanh chỉ số trên thẻ quái. `statBarScale(views)` = chỉ số lớn nhất trong các thẻ cùng màn (thang chung), `statBarPercent(value, scale)` trong [0, 100], tính bằng `Decimal`. Có test.
- `src/renderer/src/shared/components/MonsterCard.tsx`: thẻ quái (tên / biệt danh, hệ, race, level, giới tính, thanh chỉ số + số + gen, trait theo màu loại, skill theo màu hệ). Dùng `MonsterView` từ `buildMonsterView` / `listMonsters` — **UI không tự tính chỉ số**. Thẻ chọn được dùng `role="radio"` (không dùng `<button>` vì bên trong có tiêu đề, bảng).
- Điều hướng màn hình: `src/renderer/src/app/App.tsx` giữ `screen` (`title`, `starter`, `load`, `game`) và **phiên chơi** `{ gameId, state }`. Mọi state mới của game phải đi qua `commit(session)` (đặt state + tự lưu). Chưa có router / store chung; sẽ thêm khi có nhiều màn hơn.
- Màn hiện có:
  - **Tiêu đề** (`TitleScreen`): tên game, "Tiếp tục" (chỉ hiện khi có save; mở save mới nhất), "Game mới", "Tải game"; dòng "Gần nhất: ..." của save mới nhất. Cỡ chữ tên game co theo chiều rộng cửa sổ (`clamp`) để vừa một dòng ở cửa sổ mặc định 900px.
  - **Chọn quái khởi đầu** (`StarterScreen`): xem bên dưới.
  - **Tải game** (`LoadScreen`): danh sách game (gom theo `gameId`, mới nhất trước), mỗi game liệt kê các bản "Tự lưu" / "Lưu tay" kèm giờ và tóm tắt; nút Tải, Xóa (hỏi xác nhận), Xóa game (hỏi xác nhận), "Nhập save từ file"; hiện thư mục save đang dùng. File hỏng hiện lỗi ngay trong danh sách (nút Tải bị khóa); save mở không được thì hiện danh sách lỗi.
  - **Đội của bạn** (`PartyPreviewScreen`): **màn tạm** khi đang chơi (đội, tiền, túi đồ, trạng thái "Đã lưu lúc ...", nút Lưu / Xuất save ra file / Về màn tiêu đề), sẽ thay bằng màn thị trấn.
- Kiểm tra UI bằng cách lái app thật: Playwright `_electron` (cài `playwright-core` ngoài project, ví dụ trong thư mục tạm), nhớ bỏ `ELECTRON_RUN_AS_NODE`; Windows chạy được trực tiếp, không cần xvfb. Chụp màn hình và **xem ảnh** trước khi báo xong.
  - Đặt `MCC_SAVE_DIR` tới thư mục tạm để không đụng save thật.
  - Hộp thoại file của hệ điều hành không bấm tự động được: thay tạm trong main process bằng `electronApp.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }) })` (tương tự `showSaveDialog`). `window.confirm` thì accept qua `page.on('dialog', d => d.accept())`.

## Màn chọn quái khởi đầu (đã chốt)

- Quái khởi đầu: **Rồng Lửa Nhí / Mầm Tiên / Trâu Sóng** (Lửa / Cỏ / Nước), khai báo ở `config.starter.speciesIds` (theo thứ tự hiển thị).
- **Gen, trait và tỉ lệ shiny random theo seed như quái hoang** (shiny dùng `config.shiny.wildChance`; ra shiny thì có trait shiny như mọi quái), level `config.starter.level` (5). Bấm "Game mới" tạo seed mới → `rollStarters` random sẵn một ứng viên mỗi loài; thẻ hiển thị **đúng con sẽ nhận** (chỉ số tính bằng `computeStats`). Xác nhận → `createNewGame` random lại từ cùng seed (tất định) nên ra đúng con đã xem. Muốn "reroll" thì quay lại và bấm "Game mới" lần nữa.
- Người chơi chọn thêm: **giới tính** (mặc định là giới tính đã random của ứng viên; loài không giới tính thì ẩn lựa chọn này, thẻ hiện "Không giới tính") và **biệt danh** tùy chọn (luật như `renameMonster`: cắt khoảng trắng, rỗng = không có, tối đa `maxNicknameLength`).
- Thanh chỉ số của các thẻ dùng chung một thang (chỉ số lớn nhất trong các thẻ) để so sánh.
- Game mới: ở **thị trấn**, đội gồm quái khởi đầu (id `m1`, `nextMonsterId` = 2), tiền `config.starter.money`, vật phẩm `config.starter.items`, cửa hàng đã random hàng (sau khi random quái khởi đầu), `version` hiện tại.
