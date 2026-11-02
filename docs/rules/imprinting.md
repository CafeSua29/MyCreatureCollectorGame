# Dưỡng dục

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Imprinting của ARK: quái **nở từ trứng** trong thời gian dưỡng dục định kỳ **đòi chăm sóc**; làm đủ thì nhận **buff vĩnh viễn**. Bước 5e2 (2026-10-24, save v29). Số là **số tạm** ở `balance.json` khóa `imprint`.

Code: `model/imprint.ts` (type, `IMPRINT_REQUEST_KINDS`, `imprintPercent`), `monster/imprint.ts` (`startImprint`, `fulfillImprint`, `isImprintRequested`, `advanceImprint`, `validateImprint`), `progression/imprint.ts` (việc theo ngày `imprintOneDay`, action `petMonster`), `gameData/validateImprint.ts`, nguồn % `imprint` ở `registries/statPercentSources.ts`.

## Ai được dưỡng dục

- Chỉ quái **nở từ trứng** của người chơi: mọi đường nở đi qua `hatchMonster` (`progression/eggs.ts`: trứng breeding, trứng boss, trứng truyền thừa, gacha; event dùng lại). Quái bắt / khởi đầu / trao đổi... thì `imprint` = null mãi. **Mỗi quái một lần trong đời**: `startImprint` bỏ qua quái đã có `imprint` (luân hồi trẻ lại cũng không dưỡng dục lại).
- `Monster.imprint`: `null` | `{ phase: 'active', completed, total, endDay, request }` | `{ phase: 'done', completed, total }`. **Lưu số yêu cầu đã làm / tổng** (chủ project chốt 2026-10-24, thay cho cộng `percent` số thực để làm hết là đúng 100%): % = `completed × 100 / total` (`imprintPercent`).
- **Thời gian dưỡng dục** (chủ project chốt: `endDay` **cố định lúc nở**): bật thọ nguyên thì tới hết ấu niên tính theo thọ nguyên lúc nở (`ageDaysAtPercent(youngBelowPercent)` − tuổi, tối thiểu 1 ngày); tắt thọ nguyên thì `fallbackDays` (30) ngày. Lên level (thọ nguyên tăng, ấu niên kéo dài) hay bật / tắt thọ nguyên giữa chừng không đổi `endDay`. `endDay` kẹp ở số nguyên an toàn.
- `total` = ⌈(endDay − ngày nở) / `requestEveryDays`⌉, tính sẵn lúc nở.

## Yêu cầu chăm sóc

- Lịch cố định từ lúc nở: yêu cầu sinh ở ngày nở, nở + 2, nở + 4... (`requestEveryDays` = 2), hạn `dueDay` = ngày sinh yêu cầu kế tiếp (yêu cầu cuối: hạn = `endDay`). Yêu cầu đầu sinh ngay lúc nở (`hatchMonster` nhận RNG).
- Loại yêu cầu tung theo trọng số `requestWeights` (mỗi loại 1, chủ project chốt bằng nhau), RNG core:
  - **Cho ăn** `feed { itemId }`: một món ngẫu nhiên trong `imprint.foods` (Linh Mật Đường `spiritHoney`, Linh Quả `spiritFruit`). Làm bằng `useItem` đúng món lên quái đó: luôn tính là có tác dụng (mất 1 món) kể cả món không có hiệu ứng nào khác hoặc hiệu ứng không làm gì (thân mật đã đầy, đầy máu); làm rồi mà dùng tiếp thì theo luật cũ (`itemNoEffect` nếu không có tác dụng). Quái trong đội hoặc kho.
  - **Cùng chiến đấu** `battle`: thắng một trận khi quái ở trong đội (kể cả không ra sân / đã gục; quái vừa nở sau trận đó không tính). Log trận `imprintProgress { monsterId, completed, total }`.
  - **Nghỉ ngơi** `rest`: `rest` hoặc `healParty` khi quái ở trong đội. **Đội đầy máu vẫn nghỉ / hồi máu được nếu có quái trong đội đang đòi nghỉ** (chủ project chốt; không thì vẫn `partyFullHp`). `rest` vẫn tốn tiền và ngủ tới sáng.
  - **Vuốt ve** `pet`: action `petMonster { monsterId }` (ngoài trận, miễn phí, đội hoặc kho). Quái không đang đòi vuốt ve (hoặc đã làm) thì `imprintNotRequested { monsterId, kind }`; đang trong trận `inBattle`; không sở hữu `monsterNotOwned`.
- Làm đúng yêu cầu chưa xong: `completed + 1`, yêu cầu đánh dấu `done` (không làm hai lần). Việc khác loại / sai món không tính.
- **Việc theo ngày** `imprint` (`DAILY_TASKS`, chạy sau `aging`): mỗi quái đang dưỡng dục trong đội / kho, ngày hiện tại ≥ `dueDay` thì yêu cầu cũ hết (chưa làm thì **mất phần đó**) và sinh yêu cầu mới (`dayEvents`: `imprintRequest { monsterId, request }`); thời gian nhảy nhiều ngày thì sinh lần lượt theo lịch. Quái trong trứng chưa nở không có yêu cầu.

## Phần thưởng

- Hết thời gian (ngày ≥ `endDay`): `phase: 'done'`, `dayEvents` `imprintFinished { monsterId, percent }`.
  - Buff **vĩnh viễn** mọi chỉ số (kể cả max HP) = `maxStatPercent` (15) × percent / 100: nguồn **`imprint`** của `STAT_PERCENT_SOURCES` (cộng vào tổng % ở bước áp trait, `stats-traits.md`). Đang dưỡng dục thì chưa có buff.
  - Thân mật + ⌊percent / 2⌋ qua `changeAffinity` (nhân hook `affinityGainPercent` như mọi lượng tăng, `affinity.md`).
  - Đạt **100%** (`completed = total`): mốc lý lịch `imprintPerfected` (`monster-history.md`).
- Fuse: quái gốc giữ dưỡng dục của mình, của quái phụ mất. Breeding: con trong trứng `imprint` null (không truyền), dưỡng dục riêng khi nở. Tiến hóa giữ nguyên.
- `MonsterView.imprint` (`null` khi chưa từng dưỡng dục): `phase`, `percent`, `statPercent` (đang dưỡng dục: buff dự kiến nếu kết thúc với % hiện tại), `request` (yêu cầu hiện tại kèm hạn, `done`; null khi đã xong), `endDay` (null khi đã xong).

## Vật phẩm

- **Linh Quả** `spiritFruit`: `consumable` dùng ngoài trận lên quái ta, **không có hiệu ứng** (chỉ để cho ăn dưỡng dục), giá 50, cửa hàng trọng số 30. Từ bước này `consumable` được có danh sách hiệu ứng rỗng (chủ project chốt: không bắt buộc có hiệu ứng); dùng món không hiệu ứng ngoài yêu cầu dưỡng dục thì `itemNoEffect` như mọi món không có tác dụng.
- **Món đúng khẩu vị** (`favoriteRaceIds` / `favoriteElementIds` của món, `isFavoriteItem`; bước 5q): yêu cầu cho ăn chọn món theo trọng số, món đúng khẩu vị của quái × `imprint.favoriteFoodWeight` (3), món khác 1. Món hiện có (Linh Quả, Linh Mật) chưa có khẩu vị nên vẫn chọn đều.
- **Món ăn linh thực** (`dish`, `cooking.md`): `imprint.foods` nhận cả món `dish` (Linh Mễ Chúc, Đồng Tâm Bánh); ăn món bằng `eatDish` (cả đội) thì mọi quái trong đội (không đi thám hiểm) đang đòi đúng món đó xong yêu cầu cho ăn.

## Kiểm tra

- Quái (`validateImprint`, gọi trong `validateMonster`): null, hoặc `phase` hợp lệ; `completed` nguyên ≥ 0 không vượt `total` nguyên ≥ 1; `active` thêm `endDay` nguyên ≥ 0 và `request` (`kind` trong `IMPRINT_REQUEST_KINDS`, `dueDay` nguyên ≥ 0 không sau `endDay`, `done` boolean, `feed` có `itemId` là `consumable`); không trường lạ.
- State (`validateGameState`): quái hoang chưa bắt và quái trong trứng phải `imprint` null.
- Dữ liệu (`checkImprintData`): `requestEveryDays`, `fallbackDays` nguyên ≥ 1; `maxStatPercent` ≥ 0; `foods` có ít nhất một món, không lặp, mỗi món là `consumable` dùng ngoài trận (`use` khác `battle`) nhắm quái ta; `requestWeights` đủ mọi loại, mỗi số ≥ 0, tổng > 0, không loại lạ.
- Mô phỏng: chưa đưa vào script mô phỏng (đội mẫu không nở từ trứng; lineage chỉ đo gen).
