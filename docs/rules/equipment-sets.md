# Bộ trang bị

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03 (bậc trang bị nào cũng có bộ, tham khảo game có set đồ nổi tiếng: Summoners War, Diablo II / III, Grim Dawn, PoE). Làm ở bước 11c.8 (2026-11-07). Số là **số tạm** (`balance.json` khóa `equipmentSets`; `balance-systems.md`). Phần trang bị chung ở `equipment.md`, đổi bộ ở Thợ rèn ở `equipment-forge.md`.

Code: `inventory/equipmentSets.ts` (tra bộ, tung bộ, bậc ép theo bộ đặt tên, chọn món bộ đặt tên), `inventory/equipment.ts` (`rollEquipment` gọi tung bộ, `rollSetPieceDrop`, `isRandomEquipment`), `registries/equipmentSets.ts` (đếm bộ `equipmentSetStates`, hook thưởng `equipmentSetHooks`, Seal `setsSealedFor`), `registries/traitHooks.ts` (`equipmentHooks` thêm hook thưởng, nguồn `equipmentSet`), `registries/artifactTraitHooks.ts` (hook `setPieceReduction`), `roster/forgeActions.ts` (`rerollEquipmentSet`), `battle/outcome.ts` / `battle/trialOutcome.ts` / `progression/auction.ts` (nguồn món bộ đặt tên), `gameData/validateEquipmentSets.ts`, nội dung sinh bằng `scripts/data-import/equipment-sets-import.mjs`.

## Hai loại bộ

Dữ liệu `src/data/equipmentSets.json`, union theo `kind` (`EquipmentSetDef`); tên bộ ở i18n `equipmentSets`.

- **Bộ ngẫu nhiên** `{ id, kind: 'rolled', size, hooks, weight, wildcard?, seal?, sealable? }`, như **rune set của Summoners War**: mọi món không thuộc bộ đặt tên mang một bộ; kích hoạt **⌊số món / size⌋ lần** (`size` ≥ 2; gốc 2 hoặc 4), đeo nhiều bộ cùng loại thì **mỗi bộ đủ món đều tính** (ô trang bị không trần nên số lần không trần). Hook chạy với **hệ số = số lần kích hoạt** (% cộng dồn, tỉ lệ nhân rồi kẹp 100; hook cờ không có giá trị thì như một lần).
  - **Vô hình** (`wildcard`, kiểu Intangible): không hiệu ứng riêng, **một món** (tối đa một, như gốc) đếm thêm cho bộ ngẫu nhiên đầu tiên (thứ tự dữ liệu) đang **thiếu đúng một món** tới lần kích hoạt kế; không bộ nào thiếu đúng một món thì không bù. Không có hook, không seal; món gốc không cố định bộ vô hình được.
  - **Seal** (`seal`): đang kích hoạt thì vô hiệu các bộ `sealable` (bộ kích hoạt theo sự kiện của gốc: Despair, Vampire, Violent, Nemesis, Revenge, Destroy và chính Seal) của quái phe địch trên sân. Seal cũng `sealable` nên phe mình có Seal kích hoạt thì Seal của địch mất tác dụng (`setsSealedFor`: địch trên sân có Seal và phe mình trên sân không có). Bối cảnh trận `MonsterBattleContext.setsSealed`; ngoài trận không bị Seal.
- **Bộ đặt tên** `{ id, kind: 'named', rarity, pieceItemIds, bonuses: { pieces, hooks }[] }`, như **Diablo II / III, Grim Dawn**: các **món gốc cụ thể** (món gốc ghi ngược `setId`), thưởng theo **số món gốc khác nhau** đang lắp (**món trùng chỉ tính một**, Diablo II); **mọi mốc ≤ số đó đều kích hoạt** (cộng dồn), mốc bằng số món của bộ là thưởng trọn bộ. Hook thưởng hệ số 1, không đổi theo cấp món. `rarity` = bậc của mọi món thuộc bộ (mọi bậc, kể cả `unique`).

## Luật

- **Tung bộ** (`rollEquipmentSet`, cuối `rollEquipment`, sau mọi dòng nên RNG phần trước không đổi): món gốc ghi `setId` (bộ đặt tên hoặc **bộ ngẫu nhiên cố định**) thì lấy bộ đó, không tốn RNG; còn lại tung một bộ ngẫu nhiên theo `weight` (> 0) ở **mọi nguồn và mọi bậc kể cả `unique`** (rơi, cửa hàng, đúc, chợ đen, đấu giá, Khí giới bí cảnh, hồn khí, đội NPC). Không có bộ nào thì không thuộc bộ, không tốn RNG. Trường `EquipmentInstance.setId?`.
- **Bậc ép theo bộ đặt tên** (`equipmentRarityFor`): món gốc thuộc bộ đặt tên luôn ra bậc của bộ, bỏ bậc nơi gọi đã tung. Món bộ đặt tên bậc thường chỉ khai báo khoảng dòng chính cho bậc đó.
- **Món bộ đặt tên không tung ngẫu nhiên như món thường** (`isRandomEquipment` = false): không bán ở cửa hàng, không đúc, không vào chợ đen / lô trang bị thường, không nằm trong `equipmentDrops` của map. Nguồn riêng (`rollSetPieceDrop`: `pieceChance[nguồn]` % rồi bậc theo bảng bậc của nguồn chỉ giữ các bậc có bộ đặt tên, hệ số theo tầng như đồ rơi, rồi món gốc đều trong các bộ bậc đó; không có bậc nào có bộ thì không tung, không tốn RNG):
  - Hạ quái hoang / boss (`pieceChance.wild` 1 / `boss` 10, × hệ số rơi đồ kiểu Pickup, bảng `rarityWeights` / `bossRarityWeights`), **rơi riêng** như đồ bộ của Diablo II, không phụ thuộc danh sách rơi của map.
  - Rương bí cảnh (`chest` 25, bảng bậc của rương).
  - Đấu giá: lô trang bị thường thành món bộ đặt tên cùng bậc (`auction` 15; `pickSetPiece`).
  - Bộ `unique`: món là món unique trong pool boss (`equipment.md`), gom đủ bằng cách hạ nhiều boss khác nhau (nguồn như món unique: boss mang / rơi, lô unique đấu giá). Mọi món của một bộ unique thuộc boss cùng race nên một quái lắp được cả bộ.
- **Đếm bộ** (`equipmentSetStates`, một hàm duy nhất cho thưởng bộ, MonsterView, thành tựu): theo món đang lắp; **đồ cầm không có bộ**; món thiếu `setId` (món cũ) không thuộc bộ; món có `setId` sai loại bị bỏ qua.
- **Giảm số món cần** (hook `setPieceReduction { value }` trên hook cố định / dòng của món đang lắp, kiểu Ring of Royal Grandeur): bộ đặt tên **có ≥ `reductionMinPieces` (3) món** và đang đeo ít nhất một món thì số món đếm được + value, không vượt số món của bộ. Nhiều món giảm thì **lấy lớn nhất**, không cộng (Diablo III chỉ đeo được một nhẫn). Không áp cho bộ ngẫu nhiên.
- **Thưởng bộ trong trận / chỉ số**: hook thưởng vào `forEachTraitHook` qua `equipmentHooks` (nguồn hook `equipmentSet`, id nguồn = id bộ, log `traitTriggered` nguồn `equipmentSet`), % chỉ số cộng vào nguồn `equipment` (`stats-traits.md`). Magic Room / món bị tắt thì tắt cả thưởng bộ.
- **Tẩy luyện / cường hóa / phụ linh** không đổi bộ. **Đổi bộ ngẫu nhiên** ở Thợ rèn (`rerollEquipmentSet`, `equipment-forge.md`).
- `MonsterView.equipmentSets = [{ setId, kind, count, activeBonuses }]` (bộ ngẫu nhiên: số lần kích hoạt; bộ đặt tên: số mốc đang có; bộ vô hình không hiện). Bộ lọc túi `BagItemQuery.setIds` (`bulk-actions.md`). Thành tựu `equipmentSetsCompleted` (số bộ đặt tên khác nhau đang được quái đội / kho đeo đủ; "Trọn Bộ", `achievements.md`).

## Nội dung

"Dữ liệu bộ trang bị" ở `content-mechanics.md`: 23 bộ ngẫu nhiên quy đổi đủ rune set Summoners War, 15 bộ đặt tên tự đặt (3 bộ mỗi bậc thường, 2–6 món), 8 bộ unique (race có nhiều loài boss mang món unique nhất), món Ấn vương giả.

## Lệch roadmap / gốc

- Món bộ đặt tên rơi bằng **tỉ lệ riêng sau khi tung bậc** (`pieceChance`) thay cho `setPieceWeight` trong danh sách rơi của map: bậc của món bộ hiếm đúng như bậc đồ rơi (bộ huyền thoại hiếm như đồ huyền thoại), và không phụ thuộc `equipmentDrops` của map.
- Số lần kích hoạt nhân thẳng vào hệ số hook thay cho khai báo "hook không cộng dồn" trong handler: hook không có giá trị (cờ) tự nhiên chỉ tác dụng một lần, không cần điểm mở rộng mới.
- Quy đổi rune set: chí mạng Blade +80% tỉ lệ (gốc +12 điểm trên nền 15%); Focus / Accuracy = tỉ lệ hiệu ứng phụ; Endure / Tolerance = kháng debuff; Despair choáng = Chùn bước; Nemesis (+4% thanh hành động mỗi 7% máu mất) = bị đánh 30% lên đầu thứ tự lượt; Enhance (+8% HP cả phe) = +8% max HP cả phe lúc vào sân (hào quang không được đổi max HP); Violent chỉ một lần mỗi lượt (không chuỗi vô hạn trong một lượt); Destroy không có trần 4% mỗi đòn; Fatal / Guard / Fight / Determination tăng cả hai loại công / thủ (gốc chỉ có một ATK / DEF).
- Summoners War không đổi được bộ: thêm đổi bộ ở Thợ rèn để không kẹt món đẹp sai bộ và có chỗ tiêu tiền.

## Save

v116: `EquipmentInstance.setId?` (migrate: món cũ không thuộc bộ). Kiểm tra (`checkInstanceSetId`): bộ tồn tại; món gốc ghi bộ thì đúng bộ đó; món gốc không ghi bộ thì chỉ bộ ngẫu nhiên; thiếu `setId` hợp lệ. Không kiểm tra bậc món bộ đặt tên khớp bộ (dữ liệu đổi giữa phiên bản).

## Kiểm tra dữ liệu

`gameData/validateEquipmentSets.ts`: `kind`; bộ ngẫu nhiên `size` nguyên ≥ 2, `weight` ≥ 0, cờ chỉ là true, hook hợp lệ (khác rỗng trừ bộ vô hình / Seal), bộ vô hình không hook / seal; bộ đặt tên bậc hợp lệ, ≥ 2 món không trùng, món gốc tồn tại và **ghi ngược `setId`** (hai chiều), không phải hồn khí, bậc `unique` ↔ món unique của boss, món bậc thường chỉ có khoảng dòng chính bậc của bộ và không bán; mốc `pieces` nguyên ≥ 2, ≤ số món, tăng ngặt, hook khác rỗng; `setId` trên món gốc trỏ tới bộ tồn tại (bộ đặt tên phải liệt kê món; không cố định bộ vô hình); `equipmentDrops` không chứa món bộ đặt tên; `config.equipmentSets` (`pieceChance` 4 nguồn trong [0, 100], `reductionMinPieces` nguyên ≥ 2, `rerollMoney` ≥ 0 đủ mọi bậc). Hook `setPieceReduction`: `value` nguyên ≥ 1.

## Chưa có

- Dex trang bị (chờ hệ thống Dex trang bị, chưa có trong roadmap; thành tựu gom bộ đã có).
- Giao diện xem bộ / lọc theo bộ / đổi bộ (chờ `ui-overhaul.md`).
