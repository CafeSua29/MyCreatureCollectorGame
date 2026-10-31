# Độ bất ổn tầng (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Realm Instability / Realm Properties của Siralim: người chơi **tự chọn** làm tầng khó hơn bằng các **thuộc tính bất lợi**, đổi lại đồ rơi và phần thưởng nhiều hơn. Làm sau "Bí cảnh và tháp thí luyện" (dùng lại registry luật `TRIAL_RULES`). Số là **số tạm** (`balance.json`, khóa `instability`).

## Luật

- `GameState.instability: { level, properties: [{ id, hidden }] }`. Đặt ở **Đền dịch chuyển** trong thị trấn (`setInstability { level }`), 0 = tắt. Mức tối đa = ⌊tầng cao nhất từng đạt / 10⌋ (`bestFloor`, `ascension.md`; không trần).
- **Mỗi mức thêm 2 thuộc tính** random từ `instabilityProperties` (dùng registry `TRIAL_RULES` + luật mới chỉ dành cho bất ổn): **1 hiện, 1 ẩn** (lộ khi vào tầng). Ví dụ: quái hoang thêm 1 trait random, quái hoang hồi 5% HP cuối lượt, phe ta không chí mạng, tốc độ phe ta −10%, quái hoang cuồng bạo sớm hơn (cộng ngưỡng HP của `frenzyThreshold`, `docs/rules/frenzy.md`), quái từ map khác xuất hiện, quái hoang có thể là quái fuse.
- **Thưởng:** tiền, EXP, tỉ lệ đồ rơi + `rewardPercentPerLevel` (25%) mỗi mức (cộng, không nhân). Thuộc tính khó hơn (trọng số `difficulty` trong dữ liệu) cộng thêm.
- **Đổi thuộc tính** (`rerollInstability`) ở đền, tốn tiền theo mức.
- Áp cho trận quái hoang thường và boss trên tầng; **không** áp cho trận độ kiếp, NPC, bí cảnh, tháp, thú triều, boss thế giới, khu bảo tồn.
- **Tăng version save**.

## Test

Mức tối đa theo tầng, số thuộc tính / ẩn hiện, từng thuộc tính, thưởng cộng, reroll, phạm vi áp dụng, migrate.

## Tài liệu khi xong

Luật vào `world-items.md` (tầng), `battle.md`, `state.md`, `data.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
