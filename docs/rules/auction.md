# Đấu giá hành

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

NPC **Đấu giá hành** ở thị trấn: mỗi phiên bán vài lô hiếm, người chơi **đặt giá kín** (đấu giá kín giá thứ nhất) cạnh tranh với người mua NPC; người chơi cũng **ký gửi** đồ để NPC mua. Khác chợ đen (event, mua ngay giá cố định, `events.md`). Bước 12b (2026-11-03, save v99). Số là **số tạm** (`balance.json` khóa `auction`; số hiện tại ở `balance-systems.md`).

Code: `model/auction.ts` (kiểu, `AUCTION_LOT_KINDS`), `progression/auction.ts` (registry `AUCTION_LOTS`, `auctionGoodValue`, `openAuctionSession`, `closeAuctionSession`, việc theo ngày `auction`, action, `visibleAuctionLots`), `shop/rareGoods.ts` (bể đồ hiếm dùng chung với chợ đen), `gameData/validateAuction.ts`, `game/validateAuctionState.ts`, mô phỏng `scripts/simulate/auction.ts`.

## Phiên đấu giá

- `GameState.auction = { lots, closeDay, consignments, held, nextId }`. Việc theo ngày `auction` (`DAILY_TASKS`, sau `market`): khi ngày ≥ `closeDay` thì **đóng phiên** đang mở rồi **mở phiên mới** tới ngày + `sessionDays` (7). Game mới / save cũ: `closeDay` 0, phiên đầu mở ở lần qua ngày đầu.
- Mỗi phiên số lô nguyên trong `lotCount` [3, 6]. Mỗi lô chọn loại theo `lotWeights` trong các loại **có hàng** (loại không có hàng không tung, không tốn RNG); id lô / ký gửi `"a<số>"` chung bộ đếm `nextId`. Loại lô (registry `AUCTION_LOTS`, thêm loại = thêm mục `{ isAvailable, roll }` + khóa trong `AUCTION_LOT_KINDS` / `lotWeights`):
  - `equipment` (3): trang bị gốc thường bất kỳ, bậc theo `equipmentRarityWeights` (epic 1 / legendary 3, hệ số tầng như đồ rơi), dòng ở `equipmentMinRollPercent` (50) % trên của khoảng.
  - `unique` (1): món unique của **loài boss đã gặp** (`dex.seen`), bậc `unique`.
  - `egg` (3): trứng của một loài trong bảng gặp của các map đã mở, trọng số `catchRate`^`eggCatchRatePower` (−1: loài khó bắt hay ra hơn; `catchRate` kẹp tối thiểu 1), như trứng thám hiểm (`createSpeciesEgg`: dạng đầu, level 1, gen theo tầng cao nhất), lý lịch nguồn gốc `auction`. Quái trong trứng lấy id từ `nextMonsterId` lúc mở phiên.
  - `book` (2): sách skill mạnh như chợ đen (`blackMarketSkillIds`: power > `shopMaxPower` hoặc chiêu không loài nào học; sách đội dùng được × `partyMultiplier`), `bookReusableChance` (50) % là Chân kinh.
  - `item` (3): vật phẩm hiếm như hàng chợ đen (`offeredBlackMarketItems`: không bán ở cửa hàng, giá gốc ≥ `minItemPrice`, cộng `extraItemIds`; món cần vật phẩm chìa khóa / tùy chọn luật chơi như cửa hàng), trọng số giá^`itemWeightPower`, số cái trong `itemCount` [1, 3].
- **Giá trị lô** (`auctionGoodValue`): item = giá gốc (`itemBasePrice`, theo tầng cao nhất) × số cái; trứng = `eggValuePerFloor` (1.000) × tầng cao nhất × `eggRankMultipliers`[thứ hạng phẩm cấp loài trong trứng] (G→X 1; 1,5; 2; 3; 4; 6; 8; 12; 16; vượt danh sách lấy số cuối).
- **Giá khởi điểm** = ⌊giá trị × `startPercent` (100) / 100⌋, tối thiểu 1. **Giá trần NPC** = ⌊khởi điểm × % nguyên trong [`npcMinPercent`, `npcMaxPercent`] (90–250) / 100⌋, tung lúc mở phiên, lưu trong state nhưng **ẩn**: UI dùng `visibleAuctionLots` (lô không có `npcPrice`).

## Đặt giá kín

- `placeAuctionBid { lotId, amount }` (thị trấn, ngoài trận, không đang giải đấu / tông chiến): `amount` là `Decimal` nguyên ≥ giá khởi điểm (sai: `auctionBidTooLow { lotId, minimum }`). Tiền **bị giữ** (trừ khỏi `money`, ghi `bid` của lô). Đặt lại thì hoàn giá cũ trước rồi giữ giá mới (`notEnoughMoney` xét trên tiền sau khi hoàn).
- `cancelAuctionBid { lotId }`: hoàn tiền (`auctionNoBid` nếu chưa đặt). Lô lạ: `auctionLotNotFound`.
- **Đóng phiên**: lô có giá đặt ≥ giá trần NPC thì **thắng**, nhận món, trả đúng giá đã đặt (tiền đã giữ); thấp hơn thì **thua**, hoàn tiền. Log ngoài trận `auctionWon { lotId, price, received }` / `auctionLost { lotId, npcPrice }` (lộ giá NPC sau khi đóng để người chơi học). Lô không ai đặt mất cùng phiên.
- **Nhận món** (`received`): item gộp chồng vào túi; trứng vào `eggs`; món trang bị vào túi nếu còn chỗ, túi đầy thì **giữ hộ** ở `auction.held` (`received.held: true`). `claimAuctionHeld {}` nhận món giữ hộ theo thứ tự tới khi túi đầy (`auctionNothingHeld`, `bagFull`).

## Ký gửi

- `consignItem { item, count, reservePrice }` (thị trấn): item trong túi rời được túi (`keyItemLocked` với vật phẩm chìa khóa / bùa), giá sàn `Decimal` nguyên ≥ 0 (`auctionInvalidReserve`). Đồ rời túi, chờ tới khi **phiên đang mở đóng**. `withdrawConsignment { consignmentId }` rút về túi trước khi đóng (món trang bị cần chỗ trong túi; `auctionConsignmentNotFound`).
- Lúc đóng (sau các lô, theo thứ tự ký gửi): giá NPC trả = ⌊**giá bán ở cửa hàng lúc đó** × % nguyên trong [`consignMinPercent`, `consignMaxPercent`] (60–180) / 100⌋ (item gộp chồng theo giá thị trường động `marketSellTotal` của cả số cái; món trang bị theo giá bán theo bậc). Giá NPC > 0 và ≥ giá sàn thì **bán**: nhận ⌊giá × (100 − `feePercent` 10) / 100⌋, item gộp chồng cộng vào độ bão hòa thị trường như bán ở cửa hàng; log `consignmentSold { consignmentId, item, count, earned }`. Không thì **trả đồ về** (món trang bị túi đầy thì giữ hộ), log `consignmentReturned { consignmentId, npcPrice, received }`.

## Save, dữ liệu

- Kiểm tra save (`validateAuctionState`): id `"a<số>"` < `nextId`, không trùng giữa lô và ký gửi; loại lô; thứ bán (item: định danh hợp lệ, `count` ≥ 1, món trang bị đúng 1; trứng: như trứng đang ấp); giá khởi điểm ≥ 1, giá trần NPC ≥ 0, giá đặt null hoặc ≥ giá khởi điểm; giá sàn ≥ 0; `closeDay` nguyên ≥ 0; món giữ hộ hợp lệ. Id quái trong trứng của lô tính chung với mọi quái (`checkIds`); món trang bị trong lô / ký gửi / giữ hộ tính chung với mọi món (`validateEquipmentState`). Trường `Decimal`: giá của lô, giá sàn, quái trong trứng (`bigFields.ts`); migrate áp quái trong trứng của lô cùng trứng đang ấp (`mapEggMonsters`).
- Migrate v98 → v99: `auction = { lots: [], closeDay: 0, consignments: [], held: [], nextId: 1 }`.
- Kiểm tra dữ liệu `config.auction` (`checkAuctionData`): đủ trường, không trường lạ; `sessionDays` ≥ 1; khoảng `lotCount` ≥ 0, `itemCount` ≥ 1; trọng số loại lô ≥ 0 đủ khóa; cặp % NPC / ký gửi nguyên ≥ 0, min ≤ max; bảng bậc trang bị như đồ rơi; % trong [0, 100]; `eggRankMultipliers` không rỗng, số ≥ 0.

## Lệch roadmap

- **Ký gửi lấy giá bán ở cửa hàng (giá thị trường) làm mốc**, không phải giá gốc như roadmap: giá gốc bằng giá mua ở cửa hàng nên mua thuốc rồi ký gửi với giá sàn cao (tối đa 1,8 × 0,9 = 1,62 lần giá mua) là in tiền mỗi tuần; với giá bán (50% giá gốc) tối đa 0,81 lần giá mua. Bán qua ký gửi cũng cộng độ bão hòa để không né giá thị trường động (`world-items.md`).
- **Giá khởi điểm = 100% giá trị** (roadmap chỉ nói "theo giá trị × tầng"): thắng ít nhất 0,9 lần giá gốc, cao hơn mức bán lại tốt nhất (0,81) nên không có vòng mua – bán lời.
- Ký gửi chờ phiên **đang mở** đóng (không phải "phiên kế tiếp") để không phải giữ hai danh sách; thêm `withdrawConsignment`, `cancelAuctionBid` (đổi được trước khi đóng).
- Lô trang bị tách hai loại `equipment` / `unique` để trọng số riêng; trứng là trứng thường (không phải trứng boss). Đan phương, Vạn Thọ Đan, bánh Kim Quang... vào qua bể vật phẩm hiếm chung với chợ đen (`extraItemIds`, giá gốc ≥ `minItemPrice`), không có danh sách riêng.
- Bể đồ hiếm của chợ đen (`blackMarketItems`, `blackMarketSkillIds`, trang bị thường) chuyển từ `events/tempShops.ts` sang `shop/rareGoods.ts` để Đấu giá hành dùng chung (tái cấu trúc thuần).

## Mô phỏng

- Chơi liên tục, mỗi ngày ở thị trấn sau Cây thần (`runAuction`): đặt giá 170% giá khởi điểm (giữa khoảng giá trần NPC) cho mọi lô chưa đặt khi giá ≤ 10% tiền đang có; không ký gửi (mô phỏng đã bán đồ thừa ở cửa hàng). Ô `economy` của `progression.csv`: `auctionBid`. Kết quả ở `balance-systems.md`.

## Chưa có

- UI Đấu giá hành (chờ UI, `ui-overhaul.md`).
