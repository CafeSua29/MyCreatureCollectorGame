# Đấu giá hành (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

NPC **Đấu giá hành** ở thị trấn: mỗi phiên bán vài món hiếm, người chơi **đặt giá kín** cạnh tranh với người mua NPC; người chơi cũng **ký gửi** đồ để bán giá tốt hơn cửa hàng. Khác chợ đen (event, mua ngay giá cố định). Làm sau "Hệ thống event". Số là **số tạm** (`balance.json`, khóa `auction`).

## Phiên đấu giá

- Mỗi `sessionDays` (7) ngày (`day`, `lifespan.md`) mở phiên mới: 3–6 **lô** random (trang bị legendary / unique của boss đã gặp, trứng loài hiếm (`catchRate` thấp, tầng ≤ `highestFloor`), Chân kinh / Bí kíp mạnh (`docs/rules/skill-books.md`: định danh `book`, giá `skillBookPrice`), đan phương, Vạn Thọ Đan, bánh Kim Quang...), giá khởi điểm theo giá trị × tầng.
- Mỗi lô có **giá trần NPC ẩn** = khởi điểm × random [`npcMin`, `npcMax`] (0,9–2,5), tung lúc mở phiên (lưu trong state, không lộ trong `MonsterView` / UI).
- **Đặt giá kín** (`placeBid { lotId, amount }`, ở thị trấn): mỗi lô một giá, đổi được trước khi phiên đóng; tiền **bị giữ** (trừ khỏi `money`, ghi vào lô).
- **Đóng phiên** (việc theo ngày trong `DAILY_TASKS` tới ngày đóng): giá ≥ giá trần NPC thì **thắng**, nhận món, trả đúng giá đã đặt; thua thì hoàn tiền. Log `auctionWon` / `auctionLost { npcPrice }` (lộ giá NPC sau khi đóng để người chơi học).

## Ký gửi

- `consignItem { item, count, reservePrice }`: đồ rời túi vào phiên kế tiếp. Lúc đóng: giá NPC trả = giá trị gốc × random [0,6–1,8]; ≥ giá sàn thì bán (trừ phí `feePercent` 10%), không thì trả đồ về túi (túi đầy: giữ ở đấu giá hành tới khi lấy).
- **Tăng version save** (`GameState.auction`: phiên hiện tại, lô, giá đặt, ký gửi).

## Test

Mở phiên theo ngày, giá trần NPC tất định, giữ / hoàn tiền, thắng / thua, ký gửi bán được / không, phí, túi đầy, migrate.

## Tài liệu khi xong

Luật vào `world-items.md` (hoặc file mới), `state.md`, `balance-numbers.md`, dòng Tiến độ trong `docs/progress.md`; xóa file này.
