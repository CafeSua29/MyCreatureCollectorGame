# Bậc sao (`starUp`)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **Fomon** (ghép quái trùng lên bậc) và kiểu "lên sao" của gacha (Summoners War). Làm ở bước 11c.7 (2026-11-07, save v115). Khác **hiến tế** (`sacrifice.md`: cùng race, +1% mỗi stack, tuyến tính): bậc sao đòi **cùng chuỗi tiến hóa**, mỗi sao +5% nhưng sao sau cần nhiều bản hơn sao trước. Hai cơ chế cộng dồn được trên cùng một quái. Không trần.

Code: `progression/starRank.ts` (`starUp`, `canStarFeed`, `previewStarUp`), công thức `registries/starRank.ts` (`copiesForStars`, `starsFromCopies`, `starsOf`, `starFeedWorth`, `starUpCost`, `starStatPercent`, `starRankView`), quái nguyên liệu bị tiêu dùng chung với hiến tế `progression/feeding.ts` (`assertFeedsLosable`, `consumeFeeds`), nguồn % `stars` ở `registries/statPercentSources.ts`.

## Luật

- Trường `Monster.starCopies` (nguyên ≥ 0, không trần): **tổng số bản đã ghép vào**. Số sao **suy ra** từ đây, không lưu (`starsOf`).
- **Số bản mỗi sao** (`balance.json` khóa `stars`, số tạm): lên từ `s` sao lên `s + 1` cần `copiesBase + copiesPerStar × s` bản (1 + s: sao 1 cần 1, sao 2 cần thêm 2...; tuyến tính mỗi bậc nên không trần mà khó dần). Số bản cho `s` sao: `C(s) = copiesBase × s + copiesPerStar × s(s − 1)/2` (1, 3, 6, 10, 15...). Số sao = `s` lớn nhất có `C(s) ≤ starCopies` (`starsFromCopies`, giải bậc hai rồi chỉnh ±1). Kiểm tra dữ liệu: `copiesBase` nguyên ≥ 1 (0 thì 0 bản đã vô hạn sao), `copiesPerStar` nguyên ≥ 0.
- Action `starUp { monsterId, feedIds, discardOverflow? }` ở **NPC fusing ở thị trấn** (cùng chỗ hiến tế), ngoài trận (`inBattle`, `notInTown`). Quái chính và nguyên liệu ở đội hoặc kho, **không đang làm việc** (`findIdleOwned`). `feedIds` khác rỗng, không trùng (`malformedAction`, `parseIdList`), không chứa quái chính (`starFeedSameMonster`). Một action ghép được nhiều nguyên liệu và lên nhiều sao liền.
- **Điều kiện nguyên liệu** (`canStarFeed`): **không fuse** và loài nằm trong **chuỗi tiến hóa** của loài gốc quái chính (`evolutionLineOf(baseSpeciesId)`, `inventory/evolutionLine.ts`: chính nó, mọi dạng trước, mọi dạng sau; không gồm nhánh anh em). Quái chính fuse so theo `baseSpeciesId`. Sai: `starFeedMismatch { monsterId, feedId }`.
- Nguyên liệu (như quái phụ hiến tế, `assertFeedsLosable`): không phải bản mệnh (`isBondBeast`), không khóa (`monsterLocked`), đội còn ít nhất 1 con (`partyWouldBeEmpty`), món không vừa túi cần `discardOverflow` (`bagOverflow`). Quái chính là bản mệnh / đang khóa vẫn được.
- **Giá trị một nguyên liệu** (`starFeedWorth`): `1 + starCopies` của nó (mọi bản đã ghép vào nó truyền sang, sao không mất khi đem ghép). Shiny / Bootleg / boss của nguyên liệu không truyền, vẫn chỉ +1.
- **Bản thừa giữ làm tiến độ** tới sao kế tiếp: ghép chưa đủ một sao vẫn được (chỉ cộng `starCopies`). Tổng vượt `Number.MAX_SAFE_INTEGER`: `starCopiesLimit { max }`.
- **Giá** (`starUpCost`): chỉ trả cho các sao lên được trong lần ghép, `costPerStar × (s + 1)` mỗi bậc `s → s + 1` (`costPerStar` = 1.000, số tạm), tính bằng `Decimal`. Lần ghép không lên sao không tốn tiền. Thiếu tiền `notEnoughMoney`.
- **Hiệu quả**: mỗi sao +`statPercentPerStar` (5) % mọi chỉ số kể cả max HP, tuyến tính theo số sao; nguồn % `stars` cộng chung ở bước áp trait (`stats-traits.md`, mọi nguồn % chỉ cộng).
- **Nguyên liệu mất đi** (`consumeFeeds`): trang bị / sticker về túi, hồn tinh hoàn `soulLevels.fuseRefundPercent` như quái phụ fuse (`soul-levels.md`).
- **Fuse**: quái gốc giữ `starCopies` của mình; quái phụ mất sao (như fuse luôn mất quái phụ; `fusing.md`). **Breeding**: con 0 (bố mẹ không mất, truyền thì nhân bản sao; `breeding-eggs.md`). **Tiến hóa / thoái hóa / phản tổ**: giữ (`changeSpecies` giữ mọi trường không theo loài). Quái hoang / boss / trứng 0.
- **Lý lịch**: mốc `starredUp { from, to }` trên quái chính khi số sao đổi (`monster-history.md`); lần ghép không lên sao không ghi.
- **Thành tựu**: điều kiện `monsterStars` (số sao cao nhất của quái đang sở hữu, `achievements.md`); thành tựu `starAscendant` bậc 1 / 5 / 10 sao rồi ×2.
- `MonsterView.stars = { stars, copies, copiesToNext, statPercent, nextCost }` (`starRankView`).

### Lệch roadmap

- Lưu **tổng số bản** (`starCopies`) thay `stars` và bỏ lỗi `notEnoughStarFeed`: roadmap lưu số sao và bắt đủ bản cho mỗi bậc, nên phần dư bị phí, và nguyên liệu có sao (giá trị lớn) có thể không dùng được nếu không khớp đúng số bản. Lưu tổng số bản thì "nguyên liệu có sao tính 1 + số con đã dùng" đúng tuyệt đối, không phí bản nào, công thức số sao giữ nguyên.
- Thêm `starFeedSameMonster`, `starCopiesLimit` (như hiến tế).

## Save

v115: `Monster.starCopies` (migrate 0 cho mọi quái kể cả trong trứng); kiểm tra nguyên ≥ 0 (`validateMonster`).

## Chưa có

- Màn ghép sao (chọn nguyên liệu hàng loạt bằng `listMonsters`, xem trước bằng `previewStarUp`): chờ UI (`ui-overhaul.md`).

## Mô phỏng

Mục "Bậc sao" ở `simulation-features.md`; số ở `balance-systems.md` mục "Bậc sao".
