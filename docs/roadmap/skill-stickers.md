# Sticker skill (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **Sticker của Cassette Beasts**. Ở bản gốc: chiêu là sticker dán lên băng; sticker có độ hiếm thường / **uncommon** (xanh lá) / **rare** (xanh dương), tỉ lệ khi nhận 5% uncommon, 1,25% rare; uncommon có 1–2 thuộc tính uncommon, rare có 1–2 thuộc tính uncommon + 1 thuộc tính rare; **tối đa 3 thuộc tính**, phải hợp với chiêu, không trùng; sticker bóc ra dán lại được; quái **Bootleg** có tỉ lệ thuộc tính cao hơn (`bootleg.md`). Game này ghép vào **sách kỹ năng** (`skill-books.md`): sách là sticker. Làm sau `stamina.md` (có thuộc tính giảm thể lực). Số là **số tạm** (`balance.json` khóa `stickers`).

## Sticker

- Sách kỹ năng khi rơi / mua / nhận (mọi nguồn dùng chung một hàm tung) tung độ hiếm: `common` (giữ nguyên là item xếp chồng như bây giờ), `uncommon` (5%), `rare` (1,25%). Uncommon / rare thành **món riêng** `StickerInstance { id, skillId, rarity, rolls }` trong túi (`inventory.stickers`, tính vào sức chứa túi trang bị, `capacity.md`).
- **Thuộc tính** = dòng như dòng trang bị (`EquipmentLineDef`: hook + giá trị random theo bậc, dùng lại `lineParams`), khai báo ở `src/data/stickerAttributes.json` `{ id, rarity, hook, valueParam, ranges, weight, requires? }`. `requires` lọc theo skill (gây sát thương, có accuracy, đánh một mục tiêu, có hiệu ứng trạng thái...) để thuộc tính luôn hợp với chiêu. Không trùng thuộc tính trên một sticker.
- Hook của thuộc tính **chỉ áp cho đúng skill đó** (hook skill mới, phạm vi `skillId`): uy lực %, chính xác, bậc chí mạng, giá thể lực %, ưu tiên, tỉ lệ gây trạng thái thêm, hút máu, đánh thêm một lần, đổi mục tiêu thành cả hai địch... Danh sách lấy theo bảng Sticker Attributes của wiki Cassette Beasts khi làm, quy đổi sang hook có sẵn; hook chưa có thì thêm handler.

## Dán và bóc

- `applySticker { monsterId, stickerId, replaceSkillId? }` (ngoài trận): như học sách (`skill-books.md`: điều kiện loài / hệ, ô skill, thay skill), skill học được mang thuộc tính. Lưu trên quái `Monster.skillStickers: Record<skillId, StickerInstance>`.
- Dán lên skill quái **đã biết**: thay thuộc tính (sticker cũ về túi).
- `peelSticker { monsterId, skillId }`: sticker về túi, quái **vẫn giữ skill** (không thuộc tính). Như bản gốc bóc ra dán lại được.
- Quên skill (thay skill, học lại) thì sticker trên skill đó về túi. Fuse / hiến tế / thả quái: sticker của quái mất đi về túi như trang bị (`returnEquipment` mở rộng).
- Chợ đen / Thợ rèn có thể tẩy luyện thuộc tính sticker như dòng phụ trang bị (dùng lại luật tẩy luyện) nếu mô phỏng cần nguồn tiêu tiền; không bắt buộc ở bước đầu.

## Save

`inventory.stickers`, `Monster.skillStickers`; kiểm tra save (skill có trong `skillIds`, thuộc tính hợp lệ); tăng version + migrate (rỗng).

## Test

Tung độ hiếm đúng tỉ lệ, số thuộc tính theo độ hiếm, `requires` lọc đúng, không trùng; hook chỉ áp đúng skill; dán / thay / bóc / quên skill trả sticker; túi đầy; Bootleg tăng tỉ lệ.

## Tài liệu khi xong

Luật vào `docs/rules/skill-books.md` (hoặc file mới `skill-stickers.md` nếu dài), `equipment.md` (dòng dùng chung), `capacity.md`, dòng Tiến độ; xóa file này.
