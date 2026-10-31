# Động phủ (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Căn cứ riêng của ngự thú sư (như base của Palworld, động phủ trong truyện tu tiên): xây **công trình**, giao **quái trong kho** làm việc theo **thiên phú làm việc** (hệ / race), mỗi ngày sinh tài nguyên. Khác thám hiểm (`expeditions.md`: nhiệm vụ có hạn) ở chỗ **chạy liên tục**. Làm sau "Thám hiểm". Chỉ gồm công trình **sản xuất** kiểu Palworld (trồng trọt, khai khoáng, tưới, luyện, chăm sóc...); chủ project bỏ tính năng bế quan. Số là **số tạm** (`balance.json`, khóa `dwelling`).

## Công trình

- Dữ liệu mới `src/data/buildings.json`: `{ id, workType, maxLevel? (không trần nếu bỏ trống), upgradeCost (tiền + nguyên liệu theo cấp), slotsPerLevel, output }`. Tên ở `i18n`.
- `GameState.dwelling: { buildings: { [id]: { level, workers: monsterId[] } } }`; xây / nâng cấp ở động phủ (vào từ thị trấn), ngoài trận. **Tăng version save**.
- **Chuyển vào động phủ:** **Linh điền** của `alchemy.md` thành công trình Linh điền (số ô = cấp). Migrate giữ nguyên các ô đang trồng.
- Đề xuất công trình: Khoáng động (khai khoáng → khoáng, linh thạch, Đá cường hóa / Tẩy luyện thạch của Thợ rèn `equipment-forge.md`), Dược viên (trồng → dược liệu), Linh trì (tưới → linh điền nhanh hơn), Luyện khí phòng (luyện → +tỉ lệ luyện đan / nấu ăn), Thú lan (chăm sóc → +thân mật quái trong kho, trứng trong kho tiến bước), Tàng thư các (nghiên cứu → hiếm khi ra Bí kíp), Linh mạch (phát linh → mọi công trình +% sản lượng).

## Thiên phú làm việc

- Bảng `workSuitability` (dữ liệu, `balance.json` hoặc file mới): hệ / race → loại việc và bậc 1–3. Ví dụ: đất / đá / thép → khai khoáng; cỏ / côn trùng → trồng; nước / băng → tưới; lửa → luyện; điện → phát linh; bay / avian → vận chuyển (+sản lượng mọi công trình); tiên / spirit → chăm sóc; siêu linh / ma → nghiên cứu. Loài ghi đè được trong `species.json` (trường tùy chọn, chủ project thêm dần).
- Quái giao việc: chỉ **quái trong kho** chưa có việc, dùng chung trường `assignment` của `expeditions.md` (`kind: 'dwelling'`; một quái một việc), bị khóa (không ra trận / fuse / breed / thả), vẫn già đi, +1 thân mật mỗi 3 ngày.
- **Sản lượng mỗi ngày** (việc theo ngày: một mục trong `DAILY_TASKS`, `lifespan.md`) = `output` công trình theo cấp × Σ (bậc thiên phú × hệ số theo level quái) của các quái đúng loại việc; quái sai loại việc làm được nhưng × `wrongWorkRatio` (0,25). RNG cho đồ hiếm. Đồ vào **kho động phủ** (`dwelling.storage`, chồng theo id), người chơi lấy về túi khi vào động phủ (không lo túi đầy giữa chừng).

## Test

Xây / nâng cấp, giao việc (chỉ kho, khóa quái), sản lượng theo thiên phú / cấp / Linh mạch, linh điền chuyển vào (migrate), kho động phủ, già đi và thân mật.

## Tài liệu khi xong

Luật vào `docs/rules/dwelling.md` (file mới, thêm vào Mục lục), cập nhật luật linh điền, `state.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
