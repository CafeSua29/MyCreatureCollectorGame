# Kích cỡ quái

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Dragon Quest Monsters: **quái lớn** chiếm 2 ô. Trên battle 2v2: quái lớn **chiếm cả 2 ô sân của phe** nhưng chỉ **hành động 1 lần mỗi lượt** như quái khác (chủ project chốt 2026-10-26, thay cho 2 hành động: 2 hành động không khác 2 quái là mấy), bù bằng chỉ số và sát thương xấp xỉ ×2. Số ở `balance.json`, khóa `size` (số tạm, chỉnh theo mô phỏng).

Code: `registries/size.ts` (điểm duy nhất hỏi kích cỡ / ô đội), ô sân ở `battle/draft.ts` (`aliveOnField`, `commandSlotsOf`, `canEnterSlot`, `displacedBy`, `putOnField`, `initialSlots`, `fillableSlot`).

## Kích cỡ theo cân nặng

- **Không có trường riêng trong dữ liệu**: kích cỡ suy ra từ cân nặng (`registries/weight.ts`, mục "Cân nặng" ở `battle.md`): cân nặng ≥ `size.largeWeightKg` (1000 kg) là **quái lớn**, còn lại thường. Muốn đổi kích cỡ một loài thì sửa / thêm `weightKg` của loài (hoặc race).
- Quái theo loài hiện tại; quái fuse theo loài gốc. **Không theo dạng biến hình** (Mega / gmax chỉ là dạng trong trận) nên kích cỡ không đổi giữa trận.
- Không lưu trong save (suy ra từ loài). Kết quả nhớ theo bộ dữ liệu (chỉ số tính lại rất nhiều lần).
- Beastmancer: quái `big` của game gốc nhập với `weightKg` 1000 (`content-sources-real.md`). **Không có giới hạn tỉ lệ quái lớn**, theo loài hay theo nguồn (chủ project chốt 2026-11-04): loài nào to theo bản gốc thì là quái lớn. Ví dụ: (voi, tê giác, hà mã, cá voi, khủng long cổ dài, rồng cổ Monster Hunter, kaiju...). Dạng gmax có `weightKg` 1000 nhưng không bao giờ là loài của quái (chỉ là dạng hiển thị) nên không ảnh hưởng.

## Đội

- Quái lớn chiếm `size.largePartySlots` (2) ô trong đội `partySize` (6) ô (đội tối đa 3 quái lớn). Mọi chỗ thêm quái vào đội hỏi `hasPartyRoom` (bắt, thu phục, nở trứng, event, khu bảo tồn, `moveToParty`, `swapWithStorage`); quái bắt / thu phục trong trận vào đội lần lượt theo `partyAfterJoining` (quái lớn không đủ ô về kho, quái sau vẫn vào được). Không đủ ô: `partyFull`.
- **Tiến hóa thành quái lớn** (loài mới nặng hơn ngưỡng) cần đội còn đủ ô cho mọi loài hướng đó có thể ra (kể cả dị biến); quái trong kho không cần. Thiếu ô thì hướng đó coi như chưa đủ điều kiện (tự tiến hóa sau trận / đá / `chooseEvolution` đều không tiến hóa). Sau trận nhiều quái cùng tiến hóa: xét lần lượt theo thứ tự đội.
- Đội NPC: `teamSize` của lớp NPC tính theo **ô**; quái lớn tung ra mà không đủ ô còn lại thì đội dừng ở đó.
- `validateGameState`: đội 1 quái trở lên, tổng ô ≤ `partySize`.

## Sân

- Quái lớn có id ở **mọi ô** của phe (`playerSlots: ['L', 'L']`). Một quái chiếm nhiều ô chỉ khi là quái lớn và chiếm mọi ô (kiểm tra save).
- **Mở trận** (`initialSlots`): xếp theo thứ tự đội; quái thường vào ô trống đầu tiên, quái lớn chỉ khi mọi ô còn trống (lấy hết ô); không vừa thì bỏ qua, quái sau vẫn được xét (đội `[thường, lớn]` → `[thường, trống]`).
- **Vào sân** (đổi quái, rút về, thay quái gục, hồi sinh vào ô trống...): quái lớn chỉ vào khi mọi ô khác trống, thuộc chính quái đang rời ô đó, hoặc cũng đang rút ra (`canEnterSlot`); vào thì mọi quái của phe rời sân (`displacedBy`). Quái thường vào ô của quái lớn thì quái lớn rời sân, ô kia trống.
  - Lệnh đổi sang quái lớn: mọi ô khác phải trống hoặc cũng có lệnh đổi sang đúng quái lớn đó (nhiều lệnh đổi cùng chọn một quái lớn được phép); không thì `largeNeedsAllSlots`. Skill rút về (`switchTo`) sang quái lớn cũng kiểm tra như vậy; lúc chạy, quái thay của skill rút về / trait bỏ chạy chỉ lấy quái vào được.
  - Quái lớn rút về (một lệnh đổi ở ô đầu): quái vào ô đó, ô kia trống và được thay ngay sau lượt (dưới; không tốn lượt).
- **Ô trống được thay** (`settleAfterTurn`): cuối lượt, nếu phe có ô gục **hoặc ô vừa bị bỏ trống trong lượt** (quái lớn rút về, quái hoang bị bắt / bỏ chạy / theo về) thì mọi ô trống được thay: phe người chơi vào pha `chooseReplacement` nếu còn quái dự bị vào được (`fillableSlot`), phe địch AI chọn ngay. Ô vốn trống từ đầu lượt không tự kích hoạt thay.
- **Thay quái** (`replaceFainted`): mỗi lượt thay chọn ô trống + quái dự bị; quái lớn lấy hết ô (cần mọi ô trống). **Phải thay hết mức có thể**: sau khi thay không còn ô trống nào mà quái dự bị còn lại vào được (`replacementIncomplete`). Quái lớn gục → thay 2 quái thường hoặc 1 quái lớn. Một ô gục mà chỉ còn quái lớn dự bị → không thay được, ô để trống.
- AI chọn quái thay (`chooseReplacements`): mỗi ô trống lấy quái dự bị vào được có điểm cao nhất (điểm đã tính sát thương × `damageMultiplier`). AI đổi quái (`withAiSwitches`) không đổi quái lớn ra, không đổi quái lớn vào.

## Trong trận

- **Một lệnh mỗi lượt**, ở ô đầu của nó (`commandSlotsOf`); lệnh ở ô thứ hai là `malformedAction`. (Thực thể Song thú hợp thể cũng chiếm mọi ô nhưng ra lệnh ở cả hai ô, `battle-merge.md`.) AI, cuồng bạo, hành động thêm do trait như quái thường.
- **Chỉ số × `size.statMultipliers`** theo từng chỉ số (mặc định `{ hp: 2 }`; thiếu = 1) ở bước biến hình / HP (nhân cùng max HP của Dynamax).
- **Sát thương skill × `size.damageMultiplier`** (2), nhân trong công thức sát thương (`rawDamage`, cả AI dự đoán). Không nhân công: công thức là công² / thủ nên công ×2 thành sát thương ×4; không nhân thủ vì HP ×2 đã đủ bù. Tổng lại quái lớn ≈ 2 quái thường (2 lượng máu, 2 lượng sát thương mỗi lượt): lợi là không mất nửa sức khi bị dồn đòn, bị đánh lan chỉ trúng một lần; hại là mất trọn lượt khi ngủ / tê liệt, ít hệ hơn, không hợp kích. Sát thương không qua công thức skill (theo % máu, trait cố định) không nhân.
- Là **một** quái trên sân: skill đánh lan trúng một lần, đếm quái trên sân (màn chắn, trait theo đồng đội...) tính 1, không có đồng đội (skill `ally` không có mục tiêu, synergy không có), không dùng hợp kích kỹ (chỉ một lệnh, không có đồng đội). Cộng hưởng đếm theo số quái: quái lớn đếm 1.
- **Quái hoang lớn luôn xuất hiện một mình** (`generateEncounter`: tung ra quái lớn thì trận chỉ có nó). Trận event nhiều quái hoang: quái lớn chờ tới khi mọi ô trống.

## Cân bằng

Số và kết quả mô phỏng (current / noLarge): `balance-systems.md` mục "Kích cỡ quái".

## UI

`MonsterView.size` / `partySlots`, `DexEntry.size`. Hiển thị (quái lớn chiếm 2 ô đội / sân) chờ UI (`docs/roadmap/ui-overhaul.md`).
