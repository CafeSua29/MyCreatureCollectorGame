# Huyết mạch và Phản tổ (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Ý tưởng như truyện tu tiên / huyền huyễn: quái mang huyết mạch của một **loài tổ** (rắn có máu rồng, cá chép có máu Long Môn); huyết mạch càng thuần thì càng mạnh, đủ 100% thì **phản tổ**. Đi ngang theo huyết thống, khác **Thức tỉnh** (`awakening.md`) đi dọc theo tiềm năng của chính quái. Chủ project chốt cách kết hợp **pha trộn chỉ số dần (B) + đột biến khi breed (C)**, đạt 100% thì được chọn biến thành loài tổ. Mọi con số dưới đây là **số tạm** (đặt trong `balance.json`, script mô phỏng tự chỉnh theo "Dùng kết quả mô phỏng" ở `simulation.md`).

## Dữ liệu: nhóm huyết mạch

- **Phối hợp đội** (`team.md`): thêm điều kiện quái `bloodline { groupId }` vào `MONSTER_CONDITIONS` (`registries/teamBonuses.ts`) để có cộng hưởng theo huyết mạch (roadmap cũ của cộng hưởng: `match: { bloodlineGroupId }`) và hợp kích kỹ theo huyết mạch; chờ mục này vì chưa có nhóm huyết mạch.
- File mới `src/data/bloodlines.json`, mỗi mục: `{ id, ancestorSpeciesIds, raceIds?, elementIds?, speciesIds?, excludeSpeciesIds?, traitId }`.
  - **Thành viên** của nhóm: loài thường có race thuộc `raceIds`, **hoặc** có ít nhất một hệ thuộc `elementIds`, **hoặc** nằm trong `speciesIds`; trừ `excludeSpeciesIds` và trừ chính các loài tổ của nhóm. Một loài có thể thuộc nhiều nhóm.
  - Tra thành viên chỉ qua một hàm (ví dụ `bloodlineGroupsOf(data, speciesId)`), đánh chỉ mục sẵn trong `createGameData`.
  - Tên ở `i18n/<ngôn ngữ>/bloodlines.json` (loại nội dung mới, thêm vào `CONTENT_KINDS`, mọi ngôn ngữ, tên không trùng).
- **Kiểm tra dữ liệu:** id không trùng; ít nhất một loài tổ, loài tổ là loài thường tồn tại, không lặp; ít nhất một trong `raceIds` / `elementIds` / `speciesIds`; mọi id race / hệ / loài tồn tại; `traitId` trỏ tới trait loại mới `bloodline`; trường lạ báo lỗi (`checkKnownFields`).
- **Loài tổ** là loài mạnh, hiếm (chủ project chốt). Đề xuất 17 nhóm và loài tổ ở `scripts/data-import/bloodlines-source.json` (Long tộc: Chúc Long / Ứng Long / Hoàng Long; Phượng tộc: Phượng Hoàng / Chu Tước / Phượng Hoàng Lửa; Bằng tộc: Côn Bằng / Garuda / Roc; Hồ tộc: Cửu Vĩ Hồ; Lang tộc: Fenrir / Cerberus; Hổ tộc: Bạch Hổ / Sư Tử Nemea; Quy tộc: Huyền Vũ / Kim Quy / Rùa Sư Tử; Xà tộc: Jörmungandr / Ba Xà / Tương Liễu / Rắn Cầu Vồng; Lân tộc: Kỳ Lân / Kỳ Lân Một Sừng / Sleipnir; Ngưu tộc: Quỳ / Behemoth; Hải tộc: Kraken / Leviathan; Trùng tộc: Thổ Chu / Ahtal-Ka; Thi tộc: Hạn Bạt / Bán Lich; Ma tộc: Balrog / Balor; Cự nhân tộc: Daidarabotchi / Khổng Lồ Bão; Mộc tộc: Leshen / Hóa Thân Đại Thụ; Cổ thú tộc: Tarrasque / Thằn Lằn Kinh Hoàng). File có luật thành viên, danh sách thành viên sinh sẵn (khoảng 4512 loài, rà lại tay khi làm), trait huyết mạch đề xuất và config đề xuất. Không có nhóm cho race máy / nguyên tố / linh thể (mineral, elemental, spirit...): không có "máu".

## Trên quái

- Trường mới `bloodlines: { groupId, purity }[]`: độ thuần từng nhóm, số thực trong `[0, 100]` (lưu tối đa 1 chữ số thập phân), không lặp nhóm, chỉ nhóm mà **loài gốc** (`baseSpeciesId`) là thành viên. Nhóm có `purity = 0` thì không ghi. Là "nguyên liệu" nên lưu vào save (quy tắc 3). `validateMonster` kiểm tra các luật này.
- **Huyết mạch chính:** nhóm có độ thuần cao nhất (hòa thì theo thứ tự trong `bloodlines.json`). Chỉ huyết mạch chính có hiệu lực (chỉ số, trait); các nhóm khác chỉ để tích lũy.
- Loài tổ không có huyết mạch của nhóm mà nó là tổ (nhưng vẫn có thể thuộc nhóm khác, ví dụ Ba Xà là tổ Xà tộc, đồng thời là thành viên Long tộc).
- State đổi: **tăng version save**, migrate đặt `bloodlines: []` cho mọi quái (kể cả trong trứng, quái hoang, quái đã bắt trong trận).

## Độ thuần đến từ đâu

1. **Quái hoang / boss / trứng** (`rollMonster`): mỗi nhóm của loài tung độ thuần theo `wildPurityWeights` (đề xuất: 0 với trọng số 70, 1–10 với 25, 11–30 với 5). Boss cộng thêm `bossPurityBonus` (20). Thêm bước tung này vào **cuối** thứ tự tung cố định của `rollMonster` (sau shiny) để không đổi kết quả các bước cũ.
2. **Breeding:** mỗi nhóm của con = trung bình độ thuần của bố mẹ ở nhóm đó (không có thì 0) + ngẫu nhiên trong `[−breedDownPoints, +breedUpPoints]` điểm (−5..+8), kẹp `[0, 100]`.
   - **Đột biến phản tổ** (C): tỉ lệ `atavismMutationChance` (1%) con được thêm `atavismMutationPoints` (+30) ở huyết mạch chính.
   - **Sinh ra loài tổ:** mẹ có huyết mạch chính ≥ `ancestorBirthMinPurity` (50%) thì tỉ lệ `ancestorBirthChance` (0,1%) con là **một loài tổ ngẫu nhiên** của nhóm đó (dạng đầu tiên của loài tổ; race / hệ / skill theo loài tổ). Quái fuse làm mẹ thì không áp.
3. **Vật phẩm Tinh huyết:** mỗi nhóm một vật phẩm ("Tinh huyết Long tộc"...), `consumable` dùng ngoài trận, hiệu ứng mới `addPurity { groupId, amount }` (+5), chỉ dùng cho quái thuộc nhóm đó, kẹp 100. Rơi từ boss có loài thuộc nhóm (`essenceDropChance` 25%), chắc chắn rơi khi hạ / bắt **loài tổ** làm boss. Có thể bán ở cửa hàng với trọng số thấp.
4. **Hiến tế** (khi làm `sacrifice.md`): quái phụ cùng nhóm thì quái chính nhận `sacrificePurityPercent` (25%) độ thuần của quái phụ ở nhóm đó.
5. **Đánh boss cùng nhóm:** thắng trận boss có quái địch thuộc nhóm thì mọi quái tham chiến thuộc nhóm đó +`bossKillPurity` (1); địch là loài tổ của nhóm thì +`ancestorKillPurity` (3).
6. **Fuse:** quái gốc giữ huyết mạch của mình, cộng thêm `fusePurityPercent` (50%) độ thuần của quái phụ ở các nhóm mà loài gốc cũng thuộc; nhóm khác của quái phụ mất.

## Hiệu lực

- **Pha trộn chỉ số gốc (B):** ở bước đầu tiên của thứ tự tính chỉ số, thay "gốc loài" bằng gốc đã pha huyết mạch chính:
  `gốc pha = max(gốc loài, (1 − p) × gốc loài + p × gốc tổ)` từng chỉ số, với `p = purity / 100 × mixAtFullPurity` (1) và `gốc tổ` = trung bình chỉ số gốc của các loài tổ của nhóm. Lấy `max` để huyết mạch không bao giờ làm quái yếu đi. Phần còn lại giữ nguyên: `(gốc pha + gen × geneWeight) × độ lệch race × bossMultiplier → ...`. Cập nhật `stats-traits.md` khi làm.
- **Trait huyết mạch:** loại trait mới `bloodline`, suy ra từ huyết mạch chính (không lưu vào save), **không chiếm ô**, không áp nhóm loại trừ, không gộp cấp qua breed / fuse, không extract / inject được (như trait theo race). Cấp = số mốc đã đạt trong `milestones` (25 / 50 / 75 / 100% → cấp 1–4), hiệu ứng theo `levelEffectScale`. Mỗi nhóm một trait (`traitId`), chỉ dùng hook đã có; đề xuất trong file nguồn (Long uy, Phượng hỏa, Quy giáp...).
- **Thọ nguyên** (`lifespan.md`, làm trước mục này): thêm hệ số vào `LIFESPAN_MODIFIERS`: × `1 + (thọ nguyên loài tổ / thọ nguyên loài gốc − 1) × độ thuần / 100` (pha trộn như chỉ số; chỉ tăng, không giảm). Phản tổ hoàn toàn đổi loài nên thọ nguyên theo loài tổ.
- **Phản tổ hoàn toàn** (huyết mạch chính đạt 100%): action mới `atavize { monsterId, ancestorSpeciesId }`, ở thị trấn, ngoài trận, giá `atavismCostPerLevel × level` (100). Người chơi **có thể không làm** (giữ loài, vẫn hưởng pha trộn tối đa và trait cấp 4).
  - **Lý lịch** (bước 5c2): ghi mốc `atavized { fromSpeciesId, toSpeciesId }` (type và kiểm tra đã có: gọi `addMilestone`, bỏ `pendingRoadmap` của mốc trong `MILESTONE_RULES`; `docs/rules/monster-history.md`).
  - Loài, `baseSpeciesId` → loài tổ đã chọn (phải là tổ của huyết mạch chính); **race và hệ theo loài tổ** (ngoại lệ có chủ đích của luật "tiến hóa giữ race", ghi rõ trong `world-items.md` / `stats-traits.md` khi làm).
  - Giữ: level, EXP, gen, trait thường, `traitSlots`, `shinyStacks`, `bossMultiplier`, biệt danh, các trường khác. Skill giữ nguyên; skill trong learnset loài tổ có level ≤ level quái vào `pendingSkillIds`. `pendingEvolutionIds` xóa. Giới tính: loài tổ không giới tính thì `none`; quái đang `none` mà loài tổ có giới tính thì tung 50/50 (đi qua RNG).
  - `bloodlines` xóa nhóm vừa phản tổ (giờ là tổ); các nhóm khác mà loài tổ thuộc thì giữ, nhóm không còn hợp lệ thì bỏ.
  - **Quái fuse không phản tổ biến hình được** (vẫn pha trộn chỉ số và có trait huyết mạch).
  - Mã lỗi mới: `purityTooLow`, `notAncestor`, `fusedCannotAtavize` (và các mã chung `notInTown`, `inBattle`, `notEnoughMoney`).

## Điều kiện tiến hóa

- Thêm handler `bloodlinePurity { groupId, min }` (độ thuần của nhóm huyết mạch ≥ min, scope `monster`) vào `EVOLUTION_CONDITIONS` (`registries/evolutionConditions.ts`, mục "Tiến hóa có điều kiện" ở `evolution-skills.md`); chờ mục này vì chưa có huyết mạch trên quái.

## AI, hiển thị, mô phỏng

- `MonsterView` thêm huyết mạch chính (id nhóm, độ thuần, cấp trait, loài tổ có thể chọn khi đủ 100%) và danh sách các nhóm khác.
- Script mô phỏng: thêm phần đo độ thuần qua nhiều đời breed (cạnh `lineage.csv`) và tỉ lệ thắng khi có huyết mạch, để tự chỉnh số tạm.

## Test

Thành viên nhóm theo từng luật và loại trừ, kiểm tra dữ liệu báo đủ lỗi, tung độ thuần tất định, breed (trung bình, đột biến, sinh loài tổ), Tinh huyết (đúng nhóm, kẹp 100), fuse / hiến tế cộng đúng %, pha trộn chỉ số (không bao giờ giảm, số cực lớn không ra `NaN`), trait theo mốc, `atavize` (đủ điều kiện, đổi race / hệ, giới tính, skill chờ học, quái fuse bị chặn, state giữ nguyên khi lỗi), migrate save cũ.

## Tài liệu khi xong

Luật vào `docs/rules/` (file mới `bloodline.md` hoặc gộp vào `stats-traits.md` + `breeding-eggs.md` + `fusing.md` cho phần liên quan), `state.md` (trường mới, version, action, mã lỗi), `data.md` (file dữ liệu mới, luật kiểm tra), `balance-numbers.md` (số tạm), dòng Tiến độ trong `docs/progress.md`; xóa file này.
