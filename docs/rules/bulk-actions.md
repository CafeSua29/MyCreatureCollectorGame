# Thao tác hàng loạt

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Làm ngày 2026-11-03 (chỉ core; giao diện chọn / xác nhận chờ `ui-overhaul.md`). Save không đổi.

## Luật chung

- Mỗi thao tác hàng loạt là **một action** của core nhận danh sách đã lọc (id quái, dòng item, vị trí khí linh), không gọi nhiều action lẻ, để chỉ tự lưu một lần.
- Mỗi phần tử theo **đúng luật của action lẻ** tương ứng (vị trí NPC, khóa, bản mệnh thú, đang làm việc, vật phẩm chìa khóa, giá, ô, sức chứa...). **Một phần tử lỗi thì cả lệnh lỗi**, state giữ nguyên (không làm nửa chừng).
- Danh sách rỗng / sai dạng / trùng: `malformedAction`. Danh sách id đọc bằng `parseIdList` (`shared/validation.ts`, dùng chung cho `salvageEquipment`, `sacrifice`, `starUp`, `releaseMonsters`).
- Bộ lọc nằm ở core, UI lấy kết quả lọc gửi thẳng vào action: quái dùng `listMonsters` (`roster.md`: loài, race, hệ, trait, shiny, boss, level, khóa...), item dùng `filterBagItems`.

## Quái

- **Thả hàng loạt** `releaseMonsters { monsterIds, discardOverflow? }` (ngoài trận, ở đâu cũng được): mỗi con như `releaseMonster` (bản mệnh thú, quái khóa `monsterLocked`, quái đang làm việc bị chặn; `roster.md`). Đội phải còn ít nhất 1 con (`partyWouldBeEmpty`). Món đang lắp của **mọi con tính chung** khi xét chỗ trong túi: không đủ thì `bagOverflow { lost }`, gửi lại với `discardOverflow: true` (`capacity.md`). `releaseMonster` là trường hợp một con của action này.
- **Hiến tế hàng loạt**: `sacrifice { baseId, subIds }` đã nhận nhiều quái phụ (`sacrifice.md`); UI lọc quái phụ bằng `listMonsters` (cùng race, `locked: false`).
- **Ghép sao hàng loạt**: `starUp { monsterId, feedIds }` nhận nhiều nguyên liệu (`star-rank.md`).

## Item

- **Bộ lọc túi** `filterBagItems(data, inventory, query)` → danh sách dòng `ItemBatchEntry { item: ItemRef, count }` đủ số lượng đang có, theo thứ tự túi (item gộp chồng, tinh thể, sách, trang bị). Bộ lọc `BagItemQuery` (bỏ trống trường = không lọc):
  - `categories`: category item (tinh thể là `traitCrystal`, sách `skillBook`, món trang bị `equipment`).
  - `rarities`: bậc hiếm, chỉ trang bị. `traitIds`: chỉ tinh thể. `minLevel` / `maxLevel`: cấp tinh thể hoặc cấp cường hóa trang bị.
  - Trường chỉ có ở một loại item khi đặt thì loại khác bị loại (ví dụ đặt `rarities` thì chỉ còn trang bị).
  - Không bao giờ gồm item không rời túi được (vật phẩm chìa khóa, bùa; `canLeaveBag`).
- **Vứt hàng loạt** `discardItems { items }` (ngoài trận, ở đâu cũng được): mỗi dòng như `discardItem`.
- **Bán hàng loạt** `sellItems { items }` (cửa hàng thị trấn): mỗi dòng như `sellItem`, lần lượt (giá thị trường động tụt dần theo số đã bán trước đó trong cùng lệnh, đúng như bán lẻ liên tiếp).
- **Xem trước** `previewSellItems(data, state, items)` → `{ count, money }`: tổng số cái và tổng tiền nhận, đúng như khi gửi `sellItems` (lệnh không hợp lệ thì ném lỗi như action), để UI hiện trước khi xác nhận.
- **Phân giải hàng loạt** ở Thợ rèn: `salvageEquipment { instanceIds }` đã nhận nhiều món (`equipment-forge.md`); UI lọc bằng `filterBagItems` với `categories: ['equipment']`.

## Khí linh (Khí Linh Các, thị trấn)

- **Di dời hàng loạt** `moveSpirits { from: SpiritLocation[], to }`: mỗi khí linh như `moveSpirit` (đã thu phục, tiền theo value, ô món, chỗ trong túi khi về kho; `artifact-spirits.md`). Xử lý từ vị trí lớn xuống nhỏ để vị trí trong lệnh vẫn đúng khi khí linh rời nơi chứa; khí linh tới nơi theo thứ tự đó.
- **Gộp hàng loạt** `mergeSpiritsInto { first, others }`: mỗi khí linh trong `others` gộp vào `first` như `mergeSpirits` (cùng loại, đã thu phục, value cộng dồn không trần); `others` chứa chính `first` thì `malformedAction`.

## Lệch roadmap

- Bán / vứt có xem trước tổng tiền ở core (`previewSellItems`) thay vì UI tự cộng, để số hiện ra luôn khớp giá thị trường động.
- Bộ lọc cấp áp cho cả tinh thể lẫn trang bị (roadmap chỉ nói cấp tinh thể).
- Không có mô phỏng: chỉ là tiện ích, kết quả bằng chuỗi action lẻ nên không đổi cân bằng.
- Chưa có: màn chọn bộ lọc / xác nhận (chờ `ui-overhaul.md`).
