# Fusing

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- Cần **tiền**. Chọn quái gốc và quái phụ; **quái phụ mất đi** sau khi fuse. Fuse **có thể thất bại** (mục "Fuse thất bại và bùa fuse" bên dưới).
- Quái gốc nhận thêm **½ chỉ số của quái phụ** vào `fusingBonusStats` (cộng dồn qua mỗi lần fuse, giá trị không có trần; số lần fuse có giới hạn, xem "Điều kiện fuse"). Chỉ số lấy từ quái phụ là chỉ số **sau bước cộng fusingBonusStats, trước bước áp trait**.
- Số ô trait của quái gốc **tăng thêm 1** (tối đa 6). Các ô trait được random lại từ tổng trait của cả hai quái, có thể mất trait tốt.
  - Trait trùng: gộp thành cấp cao hơn.
  - Random ra cặp loại trừ: bỏ cả cặp, rồi random bù từ phần còn lại. Nếu phần còn lại cũng bị loại trừ thì chấp nhận thiếu ô.
- `shinyStacks` cộng dồn: quái gốc nhận thêm shinyStacks của quái phụ (hai quái shiny → trait "Ánh kim" cấp 2 = +12%, fuse tiếp với shiny → cấp 3 = +14%). Trait shiny truyền sang và gộp cấp.
- Quái sau fuse: đổi sang loài chung, đặt `fused = true`, thêm loài của quái phụ (và lineage của nó) vào `lineage`. **Giữ race, hệ nguyên tố và skill của quái gốc**, cộng skill chọn kế thừa của quái phụ (mục "Kế thừa skill" bên dưới). `baseSpeciesId` giữ loài của quái gốc.
- **Thân mật** (`affinity.md`): quái gốc lấy thân mật cao hơn của hai quái.
- **Tuổi và thọ nguyên** (`lifespan.md`): quái gốc giữ tuổi (`ageDays`) và level cao nhất từng đạt, nhận thêm `lifespan.fuseAbsorbPercent` (25%) **số năm còn lại** của quái phụ vào `lifespanBonusYears` ("hấp thu thọ nguyên"); tắt thọ nguyên thì không hấp thu.
- **Huyết mạch** (`bloodline.md`): quái gốc giữ độ thuần của mình, cộng `bloodline.fusePurityPercent` (50%) độ thuần của quái phụ ở các nhóm loài gốc của quái gốc cũng thuộc; nhóm khác của quái phụ mất.
- **Chi tiết đã chốt** (`src/core/progression/fusion.ts`):
  - Chỉ fuse ở **NPC thị trấn**, ngoài trận. Race, hệ, gender nào cũng được; quái đã fuse làm gốc hay phụ đều được, miễn thỏa **điều kiện fuse** bên dưới. Quái gốc và phụ ở đội hoặc kho, phải là hai con khác nhau; đội vẫn phải còn ít nhất 1 con **trong trường hợp xấu nhất** (mất cả hai quái; có Bùa Hộ Mệnh thì chỉ mất quái phụ), kiểm tra trước khi tung, vi phạm thì `partyWouldBeEmpty`. Giá = `fuseCostPerLevel × (level gốc + level phụ)`.
  - **Điều kiện fuse (xét theo loài, không theo race):**
    - **Loài đã có** của quái gốc = `baseSpeciesId` của nó + các loài trong `lineage` của nó.
    - **Loài đóng góp** của quái phụ = `baseSpeciesId` của nó + các loài trong `lineage` của nó (quái phụ thường thì chỉ có `baseSpeciesId`).
    - Fuse được khi loài đóng góp có **ít nhất 1 loài chưa nằm trong loài đã có**. Ví dụ: quái phụ thường thì loài của nó phải khác loài gốc và chưa có trong lineage của quái gốc. Trâu Sóng fuse được với Trâu Hơi Nước (khác loài, dù cùng race và cùng chuỗi tiến hóa), không fuse được với Trâu Sóng khác.
    - Vi phạm thì ném `ActionError`, nói rõ loài nào đã có. Kiểm tra trong action `fuse` qua `newFusionSpecies(base, sub)` (`fuseMonsters` chỉ là phần tính kết quả, không kiểm tra).
    - Hệ quả (đã chốt, chấp nhận): mỗi lần fuse lineage tăng ít nhất 1 loài, nên một quái fuse **tối đa (số loài thường − 1) lần**. Sức mạnh vẫn tăng tiếp qua level, gen, trang bị và hiến tế.
    - **Save cũ:** quái đã fuse trước khi có luật này mà vi phạm thì **giữ nguyên**. Luật chỉ áp cho các lần fuse mới, `validateMonster` không kiểm tra luật này.
    - Quái con breeding từ mẹ fuse nhận `lineage` của mẹ nên cũng chịu cùng giới hạn đó.
  - `fusingBonusStats` += ½ chỉ số `withFusingBonus` của quái phụ (gồm bonus của nó, gồm boss / level / gen, không gồm trait, nên phần tăng từ shiny không truyền qua bonus), **giữ số thực** (chỉ số cuối vẫn làm tròn như thường).
  - `traitSlots` + 1, tối đa 6.
  - **Trait thường:** pool = trait chiếm ô của cả hai, trait trùng gộp cấp (cộng); trait chọn giữ vào ô trước (mục "Chọn trait và gen"), phần còn lại xáo trộn rồi lấy dần cho đủ số ô; bốc phải trait loại trừ với trait đã chọn thì **bỏ cả hai** và bốc bù tiếp; hết pool thì chấp nhận thiếu ô. Pool ít hơn số ô thì giữ hết (trừ cặp loại trừ).
  - **Trait boss** gộp cấp (cộng cấp của cả hai). **`bossMultiplier` = cao nhất** của hai quái.
  - **`shinyStacks` cộng dồn**, trait shiny cấp = tổng (qua `addShinyStacks`).
  - **`sacrificeStacks` cộng dồn** (stack hiến tế của quái phụ, không +1; `sacrifice.md`).
  - **`rebirths`**: của quái gốc + ⌊½ của quái phụ⌋ (`rebirth.md`).
  - **Cấy ghép giữ của quái gốc** (`implantBonusStats`, `implantEffects`, `implantAttempts`, `implantFails`; hiệu ứng của quái phụ mất); phần cấy của quái phụ đã nằm trong chỉ số `withFusingBonus` của nó nên ½ tự truyền qua `fusingBonusStats` (`implant.md`).
  - `lineage` thêm `baseSpeciesId` và lineage của quái phụ, **không lặp loài**.
  - Giữ: hệ Tera, Gmax Factor, cấp Dynamax (quái fuse không Mega / Gigantamax được, Dynamax / Tera thì được; `transformation.md`); level, EXP, gen, gender (kể cả `none`: quái gốc không giới tính thì quái fuse cũng vậy), biệt danh, máu đã mất (max HP tăng nên HP hiện tại tăng theo), skill chờ học. Xóa `pendingEvolutionIds` (quái fuse không tiến hóa).
  - `previewFusion(data, base, sub, { boostItemId?, essences? })` cho UI xem trước phần chắc chắn (kể cả `canFuse`, `newSpeciesIds`, tỉ lệ thành công `successChance` đã cộng bùa, mức hợp race `raceMatch`, skill kế thừa được `inheritableSkillIds`); trait random lúc fuse nên không xem trước được. UI hỏi xác nhận, ghi rõ "thất bại sẽ mất cả hai quái" (hoặc "mất quái phụ" khi có Bùa Hộ Mệnh).

## Chọn trait và gen

Theo GeneSelection của Portals of Phereon (chủ project yêu cầu 2026-11-05). Code: `progression/fusionChoices.ts`. Số `config.fusion.keptTraitPercent` (50). Lựa chọn của skill ở mục "Kế thừa skill".

- Action `fuse` có thêm `keepTraitIds?` và `geneSources?`. Kiểm tra trước khi tung, lỗi thì state giữ nguyên.
- **Giữ trait**: mỗi bên chọn tối đa ⌈số trait chiếm ô × `keptTraitPercent` %⌉ + tinh chất `fusionTraitChoices` (`essences.md`), không vượt số trait của bên đó (`keptTraitCapacity`, `previewFusion.keptTraitCapacity`). Trait có ở cả hai bên tính cho quái gốc, vẫn gộp cấp. Trait giữ **vào ô trước và không bị bỏ**; ô còn lại tung như cũ, trait bốc ra loại trừ với trait giữ thì bỏ qua. Lỗi: `cannotKeepTrait { traitId }`, `tooManyKeptTraits { monsterId, max }`, `keptTraitsExclusive`, `malformedAction`. Công thức gốc: `(số trait + 1) / 2`, nên cùng kết quả.
- **Gen**: `geneSources` theo từng chỉ số `base` (mặc định) hoặc `sub`: lấy gen của bên đó (`chosenGenes`). Sai dạng: `malformedAction`.
- **Tinh chất tăng trưởng** cộng gen cho quái vừa fuse, sau khi chọn gen (`applyEssenceGrowth`).
- **Lệch gốc**: gốc không chọn gen nào thì lấy trung bình hai bên, chọn cả hai có thể +1 gen, tốn pha lê cho lựa chọn đặc biệt. Game để mặc định **giữ gen quái gốc** (không làm yếu lần fuse không chọn gì), không tốn thêm, chưa có chọn cả hai.

## Kế thừa skill

Như hợp thể quỷ của Shin Megami Tensei. Code: `progression/fusionSkills.ts`. Số tạm `config.fusion.inheritSkills` (2, `balance.json`; nguyên ≥ 0, 0 = tắt).

- Action `fuse` có thêm `inheritSkillIds?` (tối đa `inheritSkills` skill, trong skill **đang biết** của quái phụ mà quái gốc **chưa biết**; skill quái gốc đang chờ học thì được) và `forgetSkillIds?` (skill quái gốc đang biết). Kiểm tra trước khi tung (`parseSkillInheritance`, lỗi thì state giữ nguyên): không phải mảng chuỗi / trùng: `malformedAction`; quá số: `tooManyInheritedSkills { max }`; skill không chọn được: `cannotInheritSkill { skillId, reason }` (`notKnownBySub` / `known` / `notInheritable`); skill quên quái gốc không biết: `skillNotKnown`; quên nhiều hơn số skill kế thừa thiếu ô: `skillSlotFree`.
- **Chỉ áp khi fuse thành công** (thất bại có Bùa Hộ Mệnh: quái gốc không nhận gì). Theo thứ tự `inheritSkillIds`: còn ô thì học ngay; hết ô thì thay lần lượt skill trong `forgetSkillIds`; không còn skill để quên thì vào **skill chờ học** (`evolution-skills.md`). Skill đang chờ học mà được học ngay thì rời danh sách chờ.
- **Thuần thục** (`skill-mastery.md`): quái gốc nhận ½ cấp của quái phụ (làm tròn xuống, tối thiểu 1; cấp ≤ 1 không tạo mục); quái gốc từng có cấp cao hơn (biết rồi quên) thì giữ của mình. Exp = max(exp đang có, tổng exp của cấp mới) để cấp khớp tổng exp.
- Skill kế thừa ghi vào `extraSkillIds` (dùng chung với sách kỹ năng, `skill-books.md`), kể cả khi chỉ vào chờ học, nên NPC học lại skill dạy lại được ở mọi level.
- **Không kế thừa** (`inheritableSkillIds`, cùng luật `isBookableSkill`): chiêu Max / G-Max / Max Guard, hợp kích kỹ (thực tế không nằm trong `skillIds`). Thần thông thức tỉnh là skill thường nên kế thừa như skill thường (`awakening.md`). Skill ở ô nhân hình đang khóa của quái phụ (quái phụ không ở nhân hình) không kế thừa (`lockedSkillIds`, `human-form.md`); sức chứa skill của quái gốc theo `skillCapacity`.
- Không đổi save. Mô phỏng (`lineage.csv`): "người chơi" kế thừa skill power cao nhất, quên skill yếu hơn (`chooseInheritance`); cột `skillPower`, `inheritedSkills`.
- Skill quên để học skill kế thừa mang sticker thì sticker về túi (như đồ tự về túi); quên skill mang sticker Extra Slots mà quái gốc còn đủ skill thì `stickerSlotInUse` trước khi tung (`skill-stickers.md`).

## Fuse thất bại và bùa fuse

Code: `progression/fusionChance.ts` (tỉ lệ), `progression/fusion.ts` (action), `registries/fusionAidEffects.ts` (bùa). Lý do: fuse là cách duy nhất tăng số ô trait tối đa, rất mạnh, nên phải có rủi ro.

- **Tỉ lệ thành công** (`fuseSuccessChance`, **hàm duy nhất**), kẹp trong [0, 100]:
  ```
  thành công % = config.fuseChance.raceChances[độ hợp race] × lineageFactor^(số loài trong lineage của quái gốc trước khi fuse)
                 + điểm của trait quái gốc (hook modifyFuseChance) + điểm của bùa tăng tỉ lệ
  ```
  - **Độ hợp race** (`fuseRaceMatch`): so race của quái gốc với race của quái phụ (quái fuse giữ race gốc). `same` (cùng race) 90%; `breedable` (race nằm trong `breedsWith`, xét cả hai chiều như luật breed, hàm dùng chung `areRacesCompatible`) 60% (50% → 60% ngày 2026-10-25 theo mô phỏng chơi liên tục: quái race hợp là nguyên liệu dễ gặp nhất, 50% thì gần như không fuse an toàn được; `balance-systems.md`); `other` 30%. Số tạm trong `balance.json`.
  - `lineageFactor` 0,9 nhân dần nên tỉ lệ giảm mà không bao giờ về 0 (lineage cực dài thì số thực có thể chạm 0, khi đó chỉ còn điểm cộng). Ví dụ: quái gốc chưa fuse + quái phụ cùng race: 90%. Lineage 5 loài, quái phụ khác race: 30% × 0,59 ≈ 18%.
  - Shiny và boss không ảnh hưởng. Trait có thể cộng / trừ điểm qua pha `modifyFuseChance` (handler `fuseChanceBonus { points }`, điểm × hệ số cấp trait, chỉ xét trait của quái gốc); chưa có trait thật dùng.
  - Tung bằng `rollPercent` (≥ 100 hoặc ≤ 0 không tốn RNG), **trước** phần random trait của `fuseMonsters`.
- **Thất bại:** mất **cả quái gốc lẫn quái phụ** và mất tiền fuse. Món đang lắp trên hai quái (quái gốc chỉ khi không có Bùa Hộ Mệnh) tự về túi (mục "Trang bị và đồ cầm" ở `equipment.md`). Fuse thành công: món trên quái phụ về túi, quái gốc giữ món của nó.
- **Báo kết quả cho UI:** log ngoài trận `fused { baseId, outcome }`, outcome `success` / `failed` (quái gốc mất) / `protected` (thất bại có Bùa Hộ Mệnh, quái gốc còn) (`game-log.md`; thay hàm `fuseOutcome` so state trước / sau).
- **Load lại để thử lại:** chấp nhận. Load đổi seed nên người chơi có thể mở file tự lưu trước lần fuse rồi thử lại; game offline một người nên không chặn.
- **Bùa fuse** (category `fusionAid`, `effects` theo registry `FUSION_AID_EFFECTS`, mỗi handler thuộc một ô `boost` / `protect`; mọi hiệu ứng của một bùa cùng ô). Số tạm trong `items.json`:

  | Vật phẩm (id)                            | Hiệu ứng                                                                                                               | `price` | `shopWeight` |
  | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- | ------------ |
  | Bùa Kết Hợp (`fusionCharm`)              | `fuseChanceBonus { points: 10 }`                                                                                       | 800     | 60           |
  | Bùa Kết Hợp Tốt (`greatFusionCharm`)     | `fuseChanceBonus { points: 20 }`                                                                                       | 2.000   | 30           |
  | Bùa Kết Hợp Cao Cấp (`ultraFusionCharm`) | `fuseChanceBonus { points: 35 }`                                                                                       | 5.000   | 12           |
  | Bùa Hộ Mệnh (`fusionAmulet`)             | `fuseProtect`: thất bại thì **quái gốc giữ nguyên** (không nhận chỉ số, ô trait, lineage...); quái phụ và tiền vẫn mất | 6.000   | 20           |
  - Giá / trọng số chỉnh 2026-10-25 theo mô phỏng (bản cũ 2.000 / 5.000 / 12.000 / 10.000, trọng số 10 / 6 / 3 / 5: bùa chỉ có ở khoảng 6% lần ghé cửa hàng và đắt gấp nhiều lần giá fuse, nên fuse gần như không làm được; `balance-systems.md`).

  - Action `fuse` có thêm `boostItemId?` (ô `boost`) và `protectItemId?` (ô `protect`): **tối đa 1 bùa mỗi ô**. Bùa **bị tiêu hao dù thành công hay thất bại**. Id không phải chuỗi: `malformedAction`; không tồn tại: `unknownItem`; không phải bùa fuse hoặc sai ô: `wrongFusionAid { itemId, slot }`; không có trong túi: `notEnoughItem`.
  - Không dùng qua `useItem`. Bán và vứt được như mọi vật phẩm. **Không rơi** từ quái hoang hay boss (kiểm tra dữ liệu chặn, `itemDropsFromMonsters`).
  - **Nguồn:** cửa hàng thị trấn (`shopWeight` thấp hơn thuốc), chợ đen (`extraItemIds`, `events.md`).
  - **Giá theo tầng** như mọi vật phẩm có `price` (`price × highestFloor`, mục "Cửa hàng và vứt vật phẩm" ở `world-items.md`); bán lại 50% giá lúc bán.

- Không đổi cấu trúc quái hay `GameState` (save vẫn `version: 17`).
