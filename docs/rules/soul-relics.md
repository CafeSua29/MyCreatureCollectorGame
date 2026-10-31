# Hồn phách và hồn khí

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Quái **chết hẳn** để lại **hồn phách** trong túi; ở NPC luyện đan người chơi chọn **ấp thành trứng truyền thừa** (miễn phí) hoặc **luyện thành hồn khí** (trang bị mang trait của quái, tốn tiền). Bước 6.5n (2026-10-25). Số là **số tạm** (`balance.json`, khóa `soulRelic`).

Code: `model/soul.ts` (`SoulRemnant`, `SoulImprint`, `DEATH_CAUSES`, `SoulRelicConfig`), `monster/soul.ts` (`createSoul`, **`dieForever`**: điểm duy nhất cho mọi cái chết vĩnh viễn), `monster/validateSoul.ts`, `inventory/souls.ts` (`addSoul`, `takeSoul`), `inventory/equipment.ts` (dòng hồn `SOUL_LINE_ID`, `soulRelicBaseItem`, `requiredRaceId`, `isRandomEquipment`), `progression/soulRelics.ts` (`incubateSoul`, `forgeSoulRelic`, `rollSoulRelic`, `rollSoulRelicStat`, `soulToEgg`, `soulRelicCost`), `progression/eggs.ts` (`createLegacyEgg`), `gameData/validateSoulRelics.ts`.

## Hồn phách

- **Mọi cái chết vĩnh viễn** gọi `dieForever(data, inventory, monster, { aptitudeFloor, day, cause })`: đồ đang lắp về túi (`returnEquipment`), hồn phách vào **cuối** `inventory.souls` (cũ trước mới). Nơi gọi tự bỏ quái khỏi đội / kho và xử lý bản mệnh. Hiện có: tọa hóa (`cause: 'oldAge'`, `lifespan.md`), độ kiếp thất bại lần cuối (`'tribulation'`, `awakening.md`), gục trong trận khi bật chết thật (`'battle'`, `options.md`; Nuzlocke sau này dùng lại). Chưa có: cấy ghép thất bại lần 3 (chờ `implant.md`: thêm `'implant'` vào `DEATH_CAUSES` rồi gọi `dieForever`).
- **Hồn phách** (`SoulRemnant`, không gộp chồng): ảnh chụp lúc chết `{ id (= id quái, id quái không bao giờ dùng lại), speciesId, baseSpeciesId, raceId, nickname, level, genes, traits, shinyStacks, contractRealm, aptitudeTierId, history }`.
  - `traits`: chỉ trait **chiếm ô** (giữ cấp; trait shiny / boss / race không giữ).
  - `aptitudeTierId`: bậc tư chất lúc chết, so với tầng mốc lúc đó (`aptitudeOf` + `aptitudeFloor`, `aptitude.md`); chụp lại vì tầng mốc tăng làm bậc tụt.
  - `history`: bản sao lý lịch kèm mốc **`died { cause }`** (`monster-history.md`); quái không có lý lịch thì null.
- Chưa có: hồn phách tính vào sức chứa túi trang bị (chờ `capacity.md`), bán / vứt / hiến tế hồn phách (chưa cần; khí linh ăn hồn phách chờ `artifact-spirits.md`).

## Action ở NPC luyện đan

Ở thị trấn, ngoài trận (`requireTown` của luyện đan: `inBattle`, `notInTown`); không tốn giờ. Không có hồn phách id đó: `soulNotFound { soulId }`.

- **`incubateSoul { soulId }`**: thành **trứng truyền thừa** (miễn phí; `createLegacyEgg`, id quái mới từ `nextMonsterId`, vào danh sách trứng, nở theo luật trứng): loài = dạng đầu tiên (`getBaseForm`) của loài gốc, level 1, tuổi 0, gen = `lifespan.legacyEgg.genePercent` (50%) gen của quái (làm tròn xuống, tối thiểu `wild.geneMin`), **1 trait random** trong `traits` của hồn phách (giữ cấp), shiny thì shiny ×1, `bossMultiplier` 1, giới tính / hệ Tera random như quái hoang, cờ `aging` theo `options.lifespanEnabled` lúc ấp, chưa khế ước (khế ước mất cùng quái đã chết; `tamer.md` mục "Khế ước"), lý lịch nguồn `legacy { parentSpeciesId }`.
- **`forgeSoulRelic { soulId }`**: tốn `forgeCostPerLevel × level` (`soulRelicCost`, `Decimal`; thiếu tiền `notEnoughMoney`), thành **hồn khí** vào túi trang bị (id món từ `nextItemId`).

## Hồn khí

- **Trang bị instance** như mọi trang bị (`EquipmentInstance`, lắp vào ô chung, `equipment.md`), thêm trường **`soul: SoulImprint { speciesId, raceId, nickname, traitId, history }`** (để hiển thị và giới hạn lắp).
- **Món gốc:** mỗi chỉ số đúng một trang bị gốc có `soulRelicStat: <chỉ số>` (`items.json`: `soulRelicHp` … `soulRelicSpeed`, tên "Hồn Khí: …"); luyện thì **tung chỉ số theo trọng số chỉ số gốc** của loài gốc (`rollSoulRelicStat`: `baseStats` của `baseSpeciesId`, chỉ số càng cao càng dễ ra, chỉ số nào cũng có cơ hội; chủ project chốt 2026-10-25, thay luật \"chỉ số gốc cao nhất\" vì luật cũ dồn HP lên 34% do hòa và Đặc Thủ chỉ 1,2%) rồi lấy món gốc của chỉ số đó (`soulRelicBaseItem`). Món gốc hồn khí có khoảng dòng chính cho **mọi bậc** (cả `unique`), không có phần `unique`, không bán ở cửa hàng, không nằm trong `equipmentDrops` của map, không vào chợ đen (`isRandomEquipment` = false): chỉ có qua luyện hồn khí.
- **Bậc theo tư chất lúc chết:** `soulRelic.rarityByAptitude` (Phàm → common, Lương → uncommon, Ưu → rare, Tinh → epic, Thiên → legendary, Thần → unique).
- **Dòng:** tung như trang bị thường cùng bậc (`rollEquipment`: dòng chính +% chỉ số đã tung theo khoảng của bậc, dòng phụ theo `affixCounts`), rồi thêm **dòng hồn** `{ lineId: 'soul', value: cấp trait }` với **một trait random** trong `traits` của hồn phách (`SoulImprint.traitId`). Dòng hồn = hook `equipmentTrait { traitId, level }` (tag `trait`): trait chạy như trait của món (nguồn `equipment`, hệ số theo cấp trait), tính trong `equipmentTraitInstances` như dòng "trait của Artifact" (`trait-dsl.md`). Hồn phách không có trait chiếm ô thì `traitId` null, không có dòng hồn.
- **Giới hạn lắp** (`requiredRaceId` / `canWearEquipment`, dùng chung với món unique của boss): quái **cùng race** với quái đã chết, hoặc có race đó trong `lineage` hoặc chuỗi tiến hóa của loài; sai thì `equipmentRaceLocked { itemId, raceId }`. Khi load save, hồn khí không còn đủ điều kiện tự về túi (`unequipIneligible`).
- **Giá:** như trang bị cùng bậc (`price` món gốc 250, giống trang bị thường; bậc unique × `rarityPriceMultipliers.unique`). Cường hóa / phân giải như trang bị (phân giải thêm hồn tinh, `equipment-forge.md`); dòng hồn không tẩy luyện được. Chưa có: khí linh (chờ `artifact-spirits.md`).

## Đội trống

Quái cuối cùng trong đội và cả kho cùng tọa hóa (hoặc cả đội chết thật trong trận, `options.md`): **hồn phách mới nhất** tự ấp thành trứng truyền thừa và **nở ngay** vào đội (`refillEmptyParty` gọi `soulToEgg` rồi `hatchMonster`; log `legacyEggHatched { monsterId }`), không cần ở thị trấn. Còn quái trong kho thì quái level cao nhất tự vào đội như cũ (`lifespan.md`).

## Kiểm tra

- **Save:** `inventory.souls` là danh sách; mỗi hồn phách (`validateSoul`): id chuỗi khác rỗng, loài / race / bậc tư chất tồn tại, level nguyên ≥ 1, gen `Decimal` ≥ 1, trait tồn tại và chiếm ô, `shinyStacks` nguyên ≥ 0, `contractRealm` null hoặc nguyên ≥ 0, `highestStat` là chỉ số, lý lịch hợp lệ, không trường lạ. Id hồn phách tính chung với id quái (không trùng quái đang sống, `nextMonsterId` lớn hơn mọi id). Món trang bị: món gốc hồn khí **khi và chỉ khi** có `soul`; phần hồn: loài / race tồn tại, `traitId` null hoặc trait chiếm ô, không trường lạ; dòng `soul` chỉ hợp lệ khi `traitId` khác null; lý lịch kiểm tra ở `validateEquipmentState`; hồn khí được mọi bậc (món khác: bậc unique ↔ món unique). Gen hồn phách lưu chuỗi (`bigFields.ts`).
- **Dữ liệu** (`checkSoulRelicData`, `checkEquipmentItem`): `config.soulRelic` (`forgeCostPerLevel` ≥ 0, `rarityByAptitude` đủ mọi bậc tư chất, giá trị là bậc trang bị, không bậc tư chất lạ); mỗi chỉ số đúng một món gốc hồn khí; món gốc: `soulRelicStat` là chỉ số, khoảng dòng chính đủ mọi bậc, không `unique`, không `shop`; `equipmentDrops` không chứa món gốc hồn khí.

## Số (số tạm) và mô phỏng

- `forgeCostPerLevel` 50 (như `fuseCostPerLevel`), khoảng dòng chính theo mức chuẩn của trang bị (common 5–10 … legendary 30–40, unique 35–50; `content-mechanics.md`).
- Mô phỏng: "người chơi" xử lý mọi hồn phách mỗi lần về thị trấn (`handleSouls` ở `scripts/simulate/lifespan.ts`): đủ tiền thì luyện hồn khí (`autoEquip` lắp nếu tốt hơn), không thì ấp trứng; cột `relicsForged` / `relicRarities` / `soulEggs` và xem trước `previewRarities` / `previewCostPercent` ở `lifespan.csv` (`simulation.md`).
- **Kết quả 2026-10-25** (kịch bản mặc định): không quái nào chết trong ≤ 224 trận nên chưa có hồn phách thật; xem trước: quái đội mẫu chủ yếu tư chất Lương → hồn khí **uncommon** (đôi khi rare), giá luyện 3–32% tiền đang có. Hợp ý thiết kế (hồn khí bằng đồ thường cùng bậc + một dòng trait, luyện được nhưng không quá rẻ), giữ số.
