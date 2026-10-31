# Cây thiên phú ngự thú sư (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Perk Points của Siralim: **điểm thiên phú của ngự thú sư** (khác thiên phú quái ở `monster-talents.md`) để chọn hướng chơi. Làm sau "Bảng nhiệm vụ" (một nguồn điểm). Số là **số tạm** (`balance.json`, khóa `tamerTalents`).

## Luật

- `GameState.tamer.talents: { points, ranks }`. **Tăng version save**; migrate cấp điểm theo cảnh giới hiện có.
- **Nguồn điểm:** +2 mỗi lần đột phá cảnh giới, +1 mỗi nhiệm vụ hoàn thành (`quests.md`), +1 mỗi bậc thành tựu (`titles.md`), thưởng tông môn (`sects.md`).
- Dữ liệu `src/data/tamerTalents.json`: 3 nhánh: **Ngự thú** (+% chỉ số đội, +linh lực, giảm hồi chiêu kỹ năng), **Thu phục** (+tỉ lệ bắt / thu phục (thu phục cộng vào `recruitBonusPercent`, `docs/rules/recruit.md`), +giới hạn level khế ước, +shiny), **Kinh doanh** (+tiền, −giá cửa hàng, +thành công luyện đan / nấu ăn, +sản lượng động phủ). Nút `{ id, branch, requires?, maxRank?, costPerRank, effects }`, nhiều nút không trần.
- Nâng / tẩy như thiên phú quái (tẩy bằng vật phẩm hiếm). % cộng như mọi nguồn.

## Test

Nguồn điểm, nâng nút, yêu cầu, không trần, tẩy, hiệu ứng từng nhánh, migrate.

## Tài liệu khi xong

Luật vào luật ngự thú sư, `state.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
