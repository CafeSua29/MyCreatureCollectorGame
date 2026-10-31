# Tông môn (đã chốt thiết kế, danh sách tông cần chủ project duyệt)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như game tu tiên: ngự thú sư **gia nhập một tông môn**, làm nhiệm vụ tông lấy **điểm cống hiến**, đổi đồ ở **Tàng Bảo Các** của tông, lên **chức vị**, tham gia **tông chiến**. Làm sau "Bảng nhiệm vụ" và "Đấu với ngự thú sư NPC". Số là **số tạm** (`balance.json`, khóa `sects`).

## Dữ liệu

- File mới `src/data/sects.json` (đề xuất 6 tông, chủ project duyệt): Vạn Thú Tông (thu phục / bắt), Long Uyên Các (race rồng), Bách Thảo Cốc (luyện đan / nấu ăn), Thiên Kiếm Môn (chiến đấu), Huyền Băng Cung (hệ băng / nước), Âm Minh Điện (ma / undead). Mỗi tông: `{ id, joinRequirement, rankBuffs, missionPool, shop, rivalSectIds }`. Tên ở `i18n`.

## Luật

- `GameState.sect: { sectId, contribution, rank, leftDay? } | null`. Gia nhập ở thị trấn (`joinSect`) khi đủ yêu cầu (ví dụ cảnh giới ≥ 1). **Rời tông:** mất chức vị và cống hiến, chờ `rejoinCooldownDays` (30) mới vào tông khác.
- **Nhiệm vụ tông:** dùng lại registry loại nhiệm vụ của `quests.md` (bắt, hạ, breed, luyện đan...), bảng riêng 3 nhiệm vụ làm mới mỗi 7 ngày; thưởng điểm cống hiến (+ điểm thiên phú ngự thú sư hiếm).
- **Chức vị** (Ngoại môn → Nội môn → Chân truyền → Trưởng lão → Thái thượng trưởng lão → mốc vô hạn "Trưởng lão + n"): theo tổng cống hiến; mỗi chức vị mở buff theo chủ đề tông (% cộng như mọi nguồn) và hàng mới ở Tàng Bảo Các.
- **Tàng Bảo Các:** mua bằng cống hiến (trận đồ, đan phương, Bí kíp, tinh thể trait, thiên tài địa bảo theo chủ đề tông).
- **Tông chiến:** mỗi `warEveryDays` (60) ngày, chuỗi 3–5 trận với ngự thú sư NPC của tông đối địch (`docs/rules/trainers.md`); thắng nhận nhiều cống hiến và vật phẩm hiếm.
- **Tăng version save**.

## Test

Gia nhập / rời / chờ, nhiệm vụ tông và làm mới, chức vị và buff, cửa hàng, tông chiến theo ngày, migrate.

## Tài liệu khi xong

Luật vào `docs/rules/sects.md` (file mới, thêm vào Mục lục), `state.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
