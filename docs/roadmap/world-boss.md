# Boss thế giới (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như World Boss của Summoners War: một boss **rất trâu**, không cần hạ; phần thưởng **theo tổng sát thương** gây ra trong số lượt cố định. Khác boss tầng (phải hạ), thú triều (nhiều đợt thủ thành). Làm sau "Bí cảnh và tháp thí luyện". Số là **số tạm** (`balance.json`, khóa `worldBoss`).

## Luật

- Mỗi `everyDays` (14) ngày (`day`) xuất hiện **Thiên Ngoại Tà Thú** trong `activeDays` (3) ngày, loài random trong danh sách loài dạng cuối mạnh (quái lớn nếu có: `docs/rules/monster-size.md`), level theo `highestFloor` + `levelOffset`, `bossMultiplier` không bị giới hạn 2–5 (không phải boss tầng), HP coi như **vô hạn** (không gục; sát thương vẫn tính).
- **Khiêu chiến** (`challengeWorldBoss`, ở thị trấn): **1 lần mỗi ngày** trong thời gian xuất hiện, mỗi lần +1 ngày. Trận `kind: 'worldBoss'`: tối đa `turns` (10) lượt, đội ta đánh 2v2 như thường (đổi quái, vật phẩm, kỹ năng ngự thú sư, biến hình đều được), không bắt, không chạy (rút lui = kết thúc sớm). Boss dùng AI chung, biến hình theo luật boss, cuồng bạo từ lượt 5 (khi làm: thêm vai trò `worldBoss` vào `FRENZY_ROLES` / `config.frenzy.roles` và nhánh trong `frenzyRole`, kích hoạt theo lượt thay vì HP; luật chung ở `docs/rules/frenzy.md`).
- **Thưởng theo tổng sát thương** (`Decimal`) qua bậc ngưỡng theo tầng (ví dụ C / B / A / S / SS): tiền, nguyên liệu hiếm, hồn tinh, Bí kíp, trứng loài boss (tỉ lệ thấp ở bậc S trở lên). Lưu **kỷ lục** mỗi lần xuất hiện; thưởng theo kỷ lục khi hết thời gian (nhận ở thị trấn).
- **Tăng version save** (`GameState.worldBoss`: lịch xuất hiện, loài, kỷ lục, đã đánh hôm nay chưa).

## Test

Lịch xuất hiện theo ngày, 1 lần mỗi ngày, trận giới hạn lượt và không gục, cộng sát thương, bậc thưởng, kỷ lục và nhận thưởng, migrate.

## Tài liệu khi xong

Luật vào `battle.md` (loại trận), `state.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.

## Việc chờ từ mục đã làm

- Thưởng **Kẹo EXP M–XL theo bậc thưởng** (luật kẹo ở `docs/rules/exp-candy.md`; chờ mục này vì chưa có boss thế giới). Kẹo XL hiện chưa có nguồn nào khác.
