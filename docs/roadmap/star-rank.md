# Bậc sao (ghép quái trùng) (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **Fomon** (ghép quái trùng lên bậc) và kiểu "lên sao" của gacha (Summoners War). Khác **hiến tế** (`sacrifice.md`: cùng race, +1% mỗi stack): bậc sao đòi **cùng chuỗi tiến hóa** và tăng theo bậc, giá nguyên liệu tăng dần. Không trần. Số là **số tạm** (`balance.json` khóa `stars`), chỉnh theo mô phỏng.

## Luật

- Trường mới `Monster.stars` (nguyên ≥ 0, mặc định 0).
- Action `starUp { monsterId, feedIds }` ở **NPC fusing** (cùng chỗ hiến tế), ngoài trận. Quái chính và quái nguyên liệu ở đội hoặc kho, không đang làm việc, không khóa; nguyên liệu không phải bản mệnh (`assertNotBond`).
- **Điều kiện nguyên liệu**: cùng **chuỗi tiến hóa** với quái chính (`evolutionLineOf` của loài hiện tại, `inventory/evolutionLine.ts`; dạng nào trong chuỗi cũng được), **không fuse** (quái fuse không làm nguyên liệu; quái chính fuse thì so theo loài gốc `baseSpeciesId`). Sai: `starFeedMismatch { monsterId, feedId }`.
- **Số nguyên liệu** để lên từ `s` sao lên `s + 1`: `copiesBase + copiesPerStar × s` (1 + 1 × s: lên 1 sao cần 1 con, lên 2 sao cần 2 con...; tuyến tính để không trần mà vẫn khó dần). Nguyên liệu có sao thì tính **1 + số con đã dùng để lên sao của nó** (sao không mất đi khi đem ghép). Một action có thể lên nhiều bậc liền nếu đủ nguyên liệu. Thiếu: `notEnoughStarFeed { needed, given }`.
- **Giá**: `costPerStar × (s + 1)` tiền mỗi bậc.
- **Hiệu quả**: mỗi sao +`statPercentPerStar` (5) % mọi chỉ số kể cả max HP, tuyến tính, nguồn % `stars` cộng chung ở bước áp trait (`stats-traits.md`, mọi nguồn % chỉ cộng).
- **Nguyên liệu mất đi**: trang bị / sticker về túi (`returnEquipment`, `bagOverflow` cần `discardOverflow`), hồn tinh hoàn như quái phụ fuse. Shiny / Bootleg / boss của nguyên liệu không truyền (chỉ là nguyên liệu).
- **Fuse**: quái gốc giữ sao của mình; quái phụ mất sao (như fuse luôn mất quái phụ). **Breeding**: con 0 sao. **Tiến hóa / thoái hóa**: giữ sao.
- Lý lịch: mốc `starredUp { from, to }`. Thành tựu theo số sao cao nhất. `MonsterView.stars = { stars, statPercent, nextCost }`.

## Save

`stars` trên quái; kiểm tra nguyên ≥ 0; tăng version + migrate (0).

## Test

Lên 1 / nhiều bậc, số nguyên liệu tăng dần, nguyên liệu có sao tính đúng, sai chuỗi, quái fuse, khóa / đang làm việc / bản mệnh, thiếu tiền, trang bị về túi, % chỉ số cộng, fuse / breed / tiến hóa giữ hoặc reset đúng, số sao cực lớn.

## Tài liệu khi xong

Luật vào file mới `docs/rules/star-rank.md` (thêm Mục lục), dòng ở `sacrifice.md` (so sánh), `stats-traits.md` (nguồn %), dòng Tiến độ; mô phỏng mục mới ở `simulation-features.md`; xóa file này.
