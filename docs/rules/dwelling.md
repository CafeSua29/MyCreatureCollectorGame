# Động phủ

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Căn cứ riêng của ngự thú sư (như base của Palworld, động phủ trong truyện tu tiên): xây **công trình**, giao **quái trong kho** làm việc theo **chỉ số làm việc**, mỗi ngày sinh tài nguyên. Khác thám hiểm (`expeditions.md`: việc có hạn) ở chỗ **chạy liên tục**. Chỉ gồm công trình sản xuất / hỗ trợ kiểu Palworld (chủ project bỏ bế quan). **Linh điền** (`alchemy.md`) là một công trình của động phủ. Số là **số tạm** ở `src/data/buildings.json` và `balance.json` khóa `dwelling`; số hiện tại ở `balance-systems.md` mục "Động phủ".

Code: kiểu `model/dwelling.ts`, khả năng làm việc `registries/work.ts`, logic `progression/dwelling.ts` (`workStats`, `workerPower`, `buildingPowers`, `dwellingCraftBonus`, `cropGrowthPercent`, `dwellingPlotCount`, `newDwellingState`, `buildingLevel`, `buildingSlots`, `buildingUpgradeCost`, `upgradeBuilding`, `assignWorker`, `unassignWorker`, `collectDwelling`, việc theo ngày `dwellingDailyTask`), linh điền `progression/garden.ts` (`plantSeed`, `harvest`, `cropDaysLeft`, `growCrops`), kiểm tra dữ liệu `gameData/validateDwelling.ts`, kiểm tra save `game/validateDwellingState.ts`.

## Dữ liệu

- `buildings.json` (tên ở i18n `buildings`): `{ id, workType, startLevel, maxLevel?, slotsPerLevel, cost: { money, moneyGrowth, items: [{ itemId, count }] }, effect }`. `startLevel`: cấp lúc tạo game (0 = chưa xây). `maxLevel` không ghi = không trần. Ô quái làm việc = cấp × `slotsPerLevel`.
- **Giá nâng lên cấp L** (n = L − `startLevel`): tiền `money × moneyGrowth ^ (n − 1)`, mỗi nguyên liệu `count × (n − 1)` (bậc đầu chỉ tốn tiền để xây được trước khi có nguyên liệu).
- `effect` theo `type` (`BUILDING_EFFECT_TYPES`; số "PerPower" nhân với **sức làm việc** của công trình; mọi loại trừ `garden` cần `slotsPerLevel` ≥ 1):
  - `produce { drops: [{ itemId, perDay }] }`: mỗi ngày mỗi món kỳ vọng `perDay × sức` (phần lẻ tung RNG, `rollAmount`) vào kho động phủ; món phải gộp chồng.
  - `garden { plotsPerLevel }`: Linh điền, số ô = cấp × `plotsPerLevel`.
  - `cropGrowth { percentPerPower }`: ô linh điền lớn thêm `percentPerPower × sức` % mỗi ngày.
  - `outputBoost { percentPerPower }`: công trình khác + `percentPerPower × sức` % sức (không tự cộng cho mình).
  - `nurture { affinityPerPower, eggStepsPerPower }`: mỗi ngày mọi quái trong kho + thân mật, mọi trứng bớt số trận còn lại (không dưới 0; trứng 0 nở ở trận thắng kế tiếp như thường), kỳ vọng theo sức.
  - `craftBonus { percentPerPower, stations }`: + điểm % thành công ở các nơi luyện `stations` (`alchemy` / `smithing` / `cooking`; cộng vào `bonusPercent` của `CRAFT_STATION_RULES`, `alchemy.md`).
  - `rest { sanityPerLevel }`: mỗi ngày mọi quái làm việc + cấp × `sanityPerLevel` tinh thần (mục "Đói và tinh thần"), không cần quái.
  - `research { booksPerPower, reusableChance }`: mỗi ngày kỳ vọng `booksPerPower × sức` sách kỹ năng vào kho động phủ, skill trong learnset loài của map tầng cao nhất (`rollSkillBooks` như rương bí cảnh, `skill-books.md`), `reusableChance` % là Chân kinh.
- Hiện có 9 công trình: Linh điền (`garden`, cấp 2 lúc đầu), Khoáng động (khai khoáng: linh thạch đá / đất / thép, tinh phách khoáng thể, Đá cường hóa, Tẩy luyện thạch), Dược viên (trồng: 4 dược liệu, hạt giống), Linh tuyền (tưới: `cropGrowth`), Luyện khí phòng (luyện: `craftBonus` luyện đan / luyện khí / nấu ăn), Thú lan (chăm sóc: `nurture`), Tàng thư các (nghiên cứu: `research`), Linh mạch (phát linh: `outputBoost`), Ôn tuyền (`rest`, không cần quái, như Hot Spring). "Linh tuyền" thay tên "Linh trì" của roadmap vì Linh trì đã là chỗ nuôi khí linh (`artifact-spirits.md`).

## Chỉ số làm việc

Như Work Suitability của Palworld nhưng là **số cùng cỡ với công / thủ của loài** (loài có chỉ số gốc hàng chục thì chỉ số làm việc hàng chục, hàng trăm thì hàng trăm; chủ project chốt 2026-11-01), không trần.

- Loại việc `WORK_TYPES`: `mining`, `farming`, `watering`, `kindling`, `generating`, `transporting`, `caring`, `research`.
- **Chỉ số gốc theo loài** (`speciesWorkStats` cho Dex / so loài): `workStats` trong `species.json` nếu loài có (trường tùy chọn, số nguyên ≥ 0; hiện có ở pet Dinotica theo bảng của game gốc, `content-sources-real.md`), không thì suy ra: % **lớn nhất** theo mọi hệ / race (nhóm race) trong `config.dwelling.workStatPercents { elements, races }` × **chỉ số gốc trung bình của loài** (tổng chỉ số gốc / 6), làm tròn. Mỗi loài một bộ số riêng, loài mạnh / đã tiến hóa làm giỏi hơn (như Palworld). Bảng hiện có: thế mạnh chính 100%, phụ 50% (ví dụ đất / đá / thép khai khoáng 100%, cỏ trồng trọt 100%; loài trung vị tổng 427 → chính ~71, phụ ~36).
- **Chỉ số của quái** (`workStats`) = gốc (theo hệ / race **hiện tại** của quái, tổng chỉ số của loài gốc; loài ghi `workStats` dùng nguyên số đó) + **điểm sách làm việc** (`Monster.workPoints`, tính bằng % chỉ số gốc TB); **cô đặc** (như Condenser của Palworld, ở đây là hiến tế `sacrifice.md`): quái có ≥ `condenseStacks` (4) stack hiến tế thì mọi loại có chỉ số + `condensePercent` (50) % chỉ số gốc TB (một lần, như Palworld chỉ thưởng ở mức cô đặc tối đa).
- **Tốc độ làm việc** (%; như Work Speed của Palworld) ở loại việc = tốc độ gốc của loài (`workSpeed` trong `species.json`, không ghi = `baseWorkSpeed` 100) × (1 + (Σ % trait làm việc + cấp hồn tinh tốc độ × `soulWorkSpeedPercentPerLevel` 3) / 100) (trait `workSpeed` tính mọi loại việc, `workTypeSpeed` chỉ đúng loại), không dưới `minWorkSpeed` (10).
- **Sức của một quái** ở loại việc = chỉ số hiệu dụng / `powerStatUnit` (35) × level ^ `levelExponent` (0,5) × tốc độ / 100 × (1 + 50% nếu cú đêm) × % tình trạng / 100 (mục "Đói và tinh thần"); chỉ số hiệu dụng = lớn nhất của: chỉ số đúng việc, chỉ số vận chuyển × `transportRatio` (0,5; vận chuyển giúp được mọi công trình), `wrongWorkPercent` (12,5) % chỉ số gốc TB (quái không có chỉ số loại đó vẫn làm được). Code: `registries/work.ts` (`speciesWorkStats`, `workStats`, `workSpeedPercent`, `workerPower`; xuất lại qua `progression/dwelling.ts`).
- `MonsterView.work`: `traitIds` (tên tra `contentName` 'workTraits') và mỗi loại việc `{ stat, speedPercent, power }`, `fullness` / `sanity` / `ailmentId` / `conditionPercent`, để UI so quái nào hợp việc nào; `MonsterView.soulLevels.workSpeed` cấp / % / giá hồn tinh tốc độ.

## Cải thiện chỉ số làm việc

- **Sách làm việc** (`workManual<Loại việc>`, 8 cuốn, như Work Suitability Manual của Palworld; hiệu ứng `addWorkPoints { workType, percent }`, mỗi cuốn +50% chỉ số gốc TB ≈ một bậc Palworld): cộng vào `Monster.workPoints` đúng loại việc, loại chưa có cũng được; không trần (lệch Palworld: bậc có trần 5, game chỉ số không trần). Bán ở cửa hàng (trọng số thấp, 5.000 × tầng). Fuse: quái gốc giữ; breeding / quái mới: 0.
- **Hồn tinh tốc độ làm việc** (như Pal Soul / Statue of Power có mục Work Speed): Tượng Lực nhận `upgradeSoulLevel { stat: 'workSpeed' }` như một chỉ số (cùng giá điểm / tiền, `soul-levels.md`), cấp lưu ở `Monster.workSoulLevel`, mỗi cấp + `soulWorkSpeedPercentPerLevel` (3) % tốc độ làm việc.
- **Cô đặc**: hiến tế đủ 4 stack (dòng trên).
- **Trait làm việc**: Phù cấy / Phù tẩy tâm (mục dưới).

## Trait làm việc

Như passive skill của Palworld: mỗi quái có 0–4 **trait làm việc** (`Monster.workTraits`), tách khỏi trait chiến đấu (không chiếm ô trait). Code: kiểu `model/dwelling.ts`, tung `monster/workTraits.ts` (`rollWorkTraits`, `rollChildWorkTraits`), tra / thêm `registries/work.ts` (`workTraitStatPercent`, `maxWorkTraits`, `withWorkTrait`), kiểm tra dữ liệu `gameData/validateWorkTraits.ts`.

- `workTraits.json` (tên ở i18n `workTraits`): `{ id, weight, group?, effects }`; hiệu ứng `WORK_TRAIT_EFFECT_TYPES`: `workSpeed { percent }` (mọi loại việc), `workTypeSpeed { workType, percent }` (một loại), `statPercent { stats }` (nguồn % chỉ số `workTraits`, `stats-traits.md`; có tác dụng cả trong trận), `hungerRate { percent }` / `sanityRate { percent }` (tốc độ đói / mệt khi làm việc), `nocturnal` (cú đêm). Cùng `group` thì loại trừ nhau.
- Hiện có 24 trait theo Palworld:
  - Tốc độ: Thợ thủ công (Artisan, +50%), Nghiêm túc (Serious, +20%), Vụng về (Clumsy, −10%), Lười biếng (Slacker, −30%) (ba trait này cùng nhóm `diligence`), Nô lệ công việc (Work Slave, +30%, công / đặc công −30%), Côn đồ (Hooligan, −10%, công / đặc công +15%), May mắn (Lucky, +15%, công / đặc công +15%); "Attack" của Palworld là một chỉ số nên áp cho cả công lẫn đặc công. 8 trait đốc công +25% một loại việc (Palworld chỉ có Mine Foreman / Logging Foreman; lệch: thêm cho đủ 8 loại việc của game).
  - Tinh thần (nhóm `mind`): Cuồng công việc (Workaholic, mệt −15%), Lạc quan (Positive Thinker, −10%), Bất ổn (Unstable, +10%), Phá hoại (Destructive, +15%).
  - Đói (nhóm `appetite`): Kiêng ăn (Diet Lover, đói −15%), Ăn ít (Dainty Eater, −10%), Phàm ăn (Glutton, +10%), Bụng không đáy (Bottomless Stomach, +15%).
  - Cú đêm (Nocturnal): làm cả đêm, sức + `nocturnalWorkPercent` (50) %, đói / mệt + `nocturnalDrainPercent` (50) % (động phủ tính theo ngày: ca đêm ≈ thêm nửa ngày công, lệch Palworld tính theo giờ).
- Phần công của Work Slave / Hooligan / Lucky giữ như Palworld (chủ project chốt 2026-11-01; mô phỏng 3 seed × 6 biến thể đội trước đó cho thấy có phần này thì trung bình tốn thêm trận: 109 → 123 trận qua 10 tầng, `balance-systems.md`).
- **Sinh ra** (`rollMonster`, tung cuối cùng): số trait theo trọng số `countWeights` ([40, 35, 17, 6, 2] cho 0–4 trait; chỉ một lựa chọn thì không tốn RNG), mỗi trait theo `weight`, không trùng, không trùng nhóm. Quái shiny luôn có `shinyTraitId` (May mắn, như Lucky Pal), đủ chỗ thì thay trait cuối.
- **Breeding** (`makeOffspring`, tung cuối cùng): mỗi trait của bố / mẹ (gộp, không trùng) `inheritChance` (50%) được truyền (bỏ trait trùng nhóm, không quá tối đa), rồi `mutationChance` (10%) thêm một trait ngẫu nhiên; con shiny có May mắn. **Fuse** / **tiến hóa**: giữ.
- **Phù cấy** (`workImplant<Trait>`, như Passive Skill Implant; 12 món: Thợ thủ công, Nghiêm túc, Nô lệ công việc, May mắn, 8 đốc công; hiệu ứng `addWorkTrait { traitId }`): thêm trait khi còn chỗ, thay trait cùng nhóm; đã có / đủ chỗ thì không tác dụng, không mất phù. **Phù tẩy tâm** (`workTraitPurge`, hiệu ứng `clearWorkTraits`; game tự thêm vì Palworld không có, để bỏ trait xấu như Lười biếng): xóa mọi trait. Bán ở cửa hàng (trọng số thấp, giá × tầng).
- Kiểm tra: dữ liệu (trường, hiệu ứng theo loại, `countWeights` số ≥ 0 có ít nhất một số > 0, tỉ lệ 0–100, `shinyTraitId` tồn tại hoặc null, `workSpeed` của loài ≥ 0); save (`validateMonster`: id tồn tại, không lặp, ≤ tối đa, không trùng nhóm). Save v89 (`state-versions.md`).
- **Sức công trình** = cấp × Σ sức quái đang làm × (1 + (Σ % của công trình `outputBoost` + kênh thưởng ngự thú sư `dwellingOutputPercent`, `tamer-talents.md`) / 100). Tính đầu mỗi ngày.

## Đói và tinh thần

Như Hunger / SAN / Feed Box của Palworld, **tính theo ngày** (động phủ sản xuất theo ngày, không có hoạt động theo giờ nào cần no / tinh thần từng giờ). Số ở `config.dwelling.needs`, món ăn ở `config.dwelling.foods`. Code: `progression/needs.ts` (`stockFeedBox`, `takeFeedBox`, `needsDay`), `registries/work.ts` (`workConditionPercent`, `needDrainMultipliers`, `isNocturnal`).

- `Monster.fullness` / `Monster.sanity`: số trong [0, `max` 100]; quái mới (hoang, trứng, breeding) đầy.
- **Hộp thức ăn** `GameState.dwelling.feedBox` (chồng theo id): `stockFeedBox { itemId, count }` bỏ món từ túi vào, `takeFeedBox { itemId, count }` lấy về (thị trấn); chỉ món có trong `foods` (`notFood { itemId }`), số lượng nguyên ≥ 1 (`malformedAction`), thiếu thì `notEnoughItem`.
- **Món ăn** `foods: { id vật phẩm: { fullness, sanity } }`: Thức ăn linh thú `beastFeed` (no 40; nấu ở Đầu bếp: 2 Linh Quả → 5 phần, `cooking.md`), Linh Quả (20), 4 dược liệu (15, tinh thần 5), An Thần Đan `calmPill` (no 5, tinh thần 40; luyện đan: Linh Chi + Tuyết Liên → 2 viên, cấp 2, `alchemy.md`), mọi món linh thực (no 80, tinh thần 20).
- **Mỗi ngày** (việc theo ngày `dwelling`, sau khi công trình làm việc theo tình trạng đầu ngày):
  - Quái làm việc: − `hungerPerDay` (30) no, − `sanityPerDay` (10) tinh thần, × hệ số trait (`hungerRate` / `sanityRate`, cú đêm + 50%); no dưới `eatBelow` (70) thì ăn từ hộp (theo thứ tự `foods`, mỗi lần một món) tới khi ≥ 70 hoặc hết món; ăn xong vẫn đói lả (no 0) thì − thêm `starvingSanityPerDay` (20) tinh thần; + tinh thần từ Ôn tuyền.
  - Quái khác (đội, kho rảnh, đang thám hiểm): + `idleRecoveryPerDay` (50) no và tinh thần.
- **Tình trạng → sức** (`workConditionPercent`): đói lả × `starvingWorkPercent` (50) %, tinh thần dưới `lowSanity` (30) × `lowSanityWorkPercent` (70) %, tinh thần 0 = **bỏ việc** (sức 0) tới khi được nghỉ (gỡ việc thì hồi như quái rảnh) hoặc Ôn tuyền / An Thần Đan / món linh thực hồi lại.

## Bệnh và chấn thương

Như ailment của Palworld (Sprain, Weakened, Fracture, Ulcer, Depression), mắc khi làm việc quá sức **hoặc bị hạ gục trong trận**, ảnh hưởng **cả việc lẫn trận đánh**. Dữ liệu `ailments.json` (tên ở i18n `ailments`): `{ id, weight, causes, workPercent, statPercents?, bodyParts?, cureTier }`, `causes` gồm `work` / `battle` (`AILMENT_CAUSES`). Code: mắc vì làm việc / tự khỏi ở `progression/needs.ts` (`needsDay`, `rollAilmentOf`), mắc vì trận ở `battle/outcome.ts` (`injureFallen` trong `finish`), giảm sức ở `workConditionPercent`, giảm chỉ số qua nguồn % `ailment` (`registries/statPercentSources.ts`), chữa bằng hiệu ứng vật phẩm `cureAilment` (`registries/itemEffects.ts`).

- `Monster.ailment`: null (khỏe) hoặc `{ id, restDays }` (số ngày đã nghỉ kể từ khi mắc); quái mới khỏe. Một quái tối đa một bệnh (đang bệnh thì không mắc thêm).
- **Mắc vì làm việc** (mỗi ngày làm việc, sau khi đói / mệt / ăn): quái có tinh thần dưới `sickSanity` (50) tung `sickChanceMax` (20) × (50 − tinh thần) / 50 %, đói lả thêm `starvingSickChance` (10) %; chọn bệnh nguồn `work` theo `weight`.
- **Mắc vì trận** (khi trận kết thúc, thắng / thua / chạy, sau khi quái chết thật đã rời đội; quái địch không mắc): mỗi quái của người chơi chưa bệnh tung (còn gục ? `faintAilmentChance` 10 : 0) + số bộ phận bị phá × `brokenPartAilmentChance` (30) % (bị phá bộ phận thì không gục cũng có thể chấn thương). Chọn chấn thương theo **vị trí ra đòn** (`hit-locations.md`): bộ phận trúng đòn hạ gục (`knockoutPart`, chỉ đòn nhắm) và các bộ phận bị phá (`brokenParts`) → chấn thương nguồn `battle` có `bodyParts` chứa một trong các bộ phận đó; không có (đòn không nhắm, bộ phận không có chấn thương riêng) thì chấn thương chung (không ghi `bodyParts`). Log trận `ailmentGained { monsterId, ailmentId }`.
- Không có bệnh nào của nguồn đó / tỉ lệ 0 thì không tốn RNG.
- **Hiện có 9 bệnh** (nguồn; bộ phận; sức làm việc còn lại; chỉ số trong trận; bậc thuốc; trọng số):

  | Bệnh                        | Nguồn          | Bộ phận         | Sức | Chỉ số                  | Thuốc | Trọng số |
  | --------------------------- | -------------- | --------------- | --- | ----------------------- | ----- | -------- |
  | Bầm dập `bruise`            | trận           | (chung)         | 90% | mọi chỉ số trừ HP −5%   | 1     | 5        |
  | Bong gân `sprain`           | làm việc, trận | tay, chân       | 70% | tốc độ −20%             | 1     | 5        |
  | Gãy xương `fracture`        | trận           | tay, chân, đuôi | 30% | công −20%, tốc độ −30%  | 2     | 2        |
  | Chấn động `concussion`      | trận           | đầu             | 60% | đặc công / đặc thủ −20% | 2     | 2        |
  | Gãy cánh `brokenWing`       | trận           | cánh            | 60% | tốc độ −40%             | 2     | 2        |
  | Gãy xương sườn `brokenRibs` | trận           | thân            | 50% | thủ −20%, max HP −10%   | 2     | 2        |
  | Suy nhược `weakened`        | làm việc       |                 | 60% | mọi chỉ số trừ HP −10%  | 1     | 4        |
  | Loét dạ dày `ulcer`         | làm việc       |                 | 50% | max HP −15%             | 2     | 2        |
  | Trầm cảm `depression`       | làm việc       |                 | 0%  | công / đặc công −15%    | 3     | 1        |

- **Ảnh hưởng**: sức làm việc × `workPercent` % (nhân cùng đói / tinh thần); chỉ số × `statPercents` qua nguồn % `ailment` (cộng chung tổng % ở bước áp trait như mọi nguồn, `stats-traits.md`; có tác dụng mọi nơi `computeStats` được gọi, gồm trận đánh). Khác **trọng thương** sau độ kiếp (`awakening.md`): trọng thương đếm theo trận, bệnh khỏi theo ngày / thuốc.
- **Khỏi bệnh**:
  - Thuốc (hiệu ứng `cureAilment { tier }`): chữa bệnh có `cureTier` ≤ bậc thuốc; không bệnh / thuốc yếu hơn thì không tác dụng, không mất thuốc. Thuốc trị thương `medicineLow` (bậc 1; cửa hàng trọng số 10, luyện đan: Linh Chi → 3, cấp 1), Thuốc trị thương tốt `medicine` (bậc 2; cửa hàng trọng số 5, Linh Chi + Nhân Sâm → 2, cấp 3), Thuốc trị thương thượng hạng `medicineHigh` (bậc 3; Nhân Sâm + Tuyết Liên + Hà Thủ Ô → 1, cấp 6) (như Medical Supplies các bậc của Palworld).
  - Nghỉ: quái không làm ở động phủ (đội, kho rảnh, thám hiểm) mỗi ngày + 1 `restDays`, đủ `idleCureDays` (7) thì tự khỏi (game tự thêm để không bắt buộc thuốc). - **NPC hồi máu ở thị trấn** (`healParty`) chữa mọi bệnh / chấn thương của cả đội (chủ project chốt 2026-11-01); đội đầy máu mà còn bệnh vẫn hồi được. Quái trong kho / đang làm việc thì dùng thuốc hoặc nghỉ.
- Kiểm tra: dữ liệu (`weight` ≥ 0, `causes` không rỗng thuộc `AILMENT_CAUSES`, `workPercent` 0–100, `statPercents` hợp lệ, `bodyParts` là id trong `bodyParts.json` và chỉ cho bệnh có nguồn `battle`, `cureTier` nguyên ≥ 1; `sickChanceMax` / `starvingSickChance` / `faintAilmentChance` / `brokenPartAilmentChance` 0–100, `idleCureDays` ≥ 1, `sickSanity` ≤ max); save (`validateMonster`: id bệnh tồn tại, `restDays` nguyên trong [0, idleCureDays)). Save v92.
- `MonsterView.work.ailmentId`, `MonsterView.statPercents.ailment`.

## Luật

- `GameState.dwelling: { buildings: { [id]: { level, workers } }, plots, storage: { stacks, books }, feedBox }`; công trình chưa xây thì không có trong `buildings`. Game mới: công trình có `startLevel` ≥ 1, ô linh điền trống, kho rỗng (`newDwellingState`).
- `upgradeBuilding { buildingId }` (thị trấn): xây (0 → 1) hoặc nâng một cấp; lỗi `unknownBuilding`, `buildingMaxLevel { buildingId, maxLevel }`, `notEnoughMoney`, `notEnoughItem`. Công trình `garden` thêm ô trống (thay `buyPlot` cũ).
- `assignWorker { buildingId, monsterId }` (thị trấn): quái **trong kho** (`monsterNotInStorage`), rảnh (`monsterBusy`), không gục (`monsterFainted`; trọng thương vẫn làm được); công trình đã xây (`buildingNotBuilt`) còn ô (`buildingSlotsFull { buildingId, slots }`). Quái nhận `assignment { kind: 'dwelling', id: buildingId }` (dùng chung `expeditions.md`: một quái một việc, bị khóa: không vào đội, không fuse / breed / thả / dùng kẹo).
- `unassignWorker { monsterId }` (ngoài trận, ở đâu cũng được): quái không làm ở động phủ thì `monsterNotWorking`.
- `collectDwelling` (thị trấn): lấy hết đồ / sách trong kho động phủ về túi (không lo túi đầy giữa chừng; kho rỗng thì không đổi gì).
- **Việc theo ngày** `dwelling` (`DAILY_TASKS`): bỏ quái đã rời kho (tọa hóa) khỏi công trình; mỗi công trình có sức > 0 làm việc theo `effect` (theo thứ tự `buildings.json`); linh điền lớn (`growCrops`); quái làm việc + `workerAffinity` (1) thân mật vào ngày chia hết cho `workerAffinityDays` (3). Quái làm việc vẫn già đi như quái trong kho.

## Linh điền

- Luật trồng / thu hoạch ở `alchemy.md` mục "Linh điền". Ô `{ seedItemId, growth }`: `growth` = số ngày đã lớn, mỗi ngày + 1 × (1 + % Linh tuyền / 100), dừng ở `growDays`; đủ `growDays` thì chín (`cropRipe` đúng ngày vượt mốc). Số ngày còn lại = ⌈growDays − growth⌉.

## Kiểm tra save

- `validateDwellingState`: công trình tồn tại, `level` nguyên ≥ 1 và ≤ `maxLevel`, `workers` không lặp, không quá số ô, không một quái ở hai công trình; quái còn trong kho của `workers` phải mang đúng việc, quái mang việc `dwelling` phải nằm trong `workers` của công trình đó (quái đã rời kho được bỏ qua tới việc theo ngày dọn). Số ô linh điền = `dwellingPlotCount`, ô null hoặc hạt giống có `growth` trong [0, growDays]. Kho: `validateGoods` (chồng gộp được + sách hợp lệ). Hộp thức ăn: món có trong `foods`, số nguyên ≥ 1. Quái: `fullness` / `sanity` trong [0, max] (`validateMonster`).
- Save v88 thêm `dwelling`, bỏ `garden` (`state-versions.md`).

## Mô phỏng

- Chơi liên tục: mỗi lần ở thị trấn (sau thám hiểm, luyện đan) "người chơi" lấy hết đồ trong kho động phủ, nâng công trình rẻ nhất khi giá ≤ `buildingSpendFraction` (20%) tiền và đủ nguyên liệu (một lần mỗi lượt về), rồi giao quái rảnh trong kho có chỉ số đúng việc (> 0) vào ô trống, sức cao nhất trước (sức tính cả tốc độ / trait làm việc; người chơi mô phỏng không dùng Sách làm việc / hồn tinh tốc độ vì chỉ đổi sản lượng động phủ, không đổi trận; `scripts/simulate/dwelling.ts`). Giữ hộp thức ăn đủ 7 ngày đói của mọi quái làm việc: nấu Thức ăn linh thú (mua Linh Quả khi cửa hàng bán) rồi bỏ vào hộp. Mua sẵn 2 viên mỗi bậc thuốc khi cửa hàng bán; quái làm việc / quái trong đội bị bệnh: dùng thuốc bậc thấp nhất đủ chữa (túi → mua → luyện), quái làm việc không có thuốc thì cho nghỉ việc (không giao việc cho quái đang bệnh). Cột `economy`: `buildings`, `workers`, `dwellingItems`, `feed`, `sick`, `cured`, `sickRest` (`simulation-features.md`).
