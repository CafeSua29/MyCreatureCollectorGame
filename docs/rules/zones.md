# Hiểm địa

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Khu đặc biệt (chế độ đánh quái riêng, chủ project yêu cầu 2026-10-28): **có điều kiện mới vào được**, map riêng với **quái hiếm hơn** và **đồ theo chủ đề / đồ hiếm**, đi bằng cách **khám phá từng bước** (trận, quái tinh anh, rương, linh tuyền), bước cuối là **boss canh giữ**. Số ở `balance.json` khóa `zones` (số tạm, chỉnh theo mô phỏng; `balance-systems.md`).

Code: model `model/zones.ts` (`ZoneDef`, `ZoneRequirement`, `ZoneVisit`, `allMaps`); điều kiện vào / lượt vào / map `world/zones.ts` (`ZONE_REQUIREMENTS`, `assertZoneRequirements`, `assertZoneOpen`, `rollZoneVisit`, `zoneSite`, `closeZoneVisit`); action và loại bước `battle/zones.ts` (`enterZone`, `exploreZone`, `leaveZone`, registry `ZONE_STEPS`); việc sau trận `SPECIAL_BATTLE_RULES.zone` (`battle/specialBattles.ts`); bảng món theo trọng số dùng chung với rương bí cảnh `rollChestItems` (`inventory/lootTables.ts`); kiểm tra `gameData/validateZones.ts`, `game/validateZoneState.ts`; dữ liệu `src/data/zones.json` (tên ở i18n `zones`), sinh bằng `scripts/data-import/zones-import.mjs`.

## Dữ liệu (`zones.json`)

- `{ id, map, requirements, treasure, rareTreasure }`.
- **`map`**: cùng trường như một biome (`encounters`, `drops`, `bossDrops`, `floorBossSpeciesId` = boss canh giữ, `bosses` có `weight` = quái tinh anh, `weather` / `terrain`, `shinyChance`, `bossChance`, `bossMultiplierMin / Max`...), không ghi `id` (id map = id hiểm địa). Lúc nạp dữ liệu map nhận id và được **kiểm tra bằng đúng các hàm kiểm tra biome** (`allMaps`: biome của tầng + map hiểm địa). Map hiểm địa **không nằm trong `data.biomes`**: không bao giờ tung làm map của tầng / bí cảnh / tháp, không là vùng Dex, không vào danh sách loài khu bảo tồn / đội NPC. Id hiểm địa trùng id biome báo lỗi.
- **`requirements`** (mọi điều kiện phải đạt lúc vào; union theo `type`, trường lạ báo lỗi):

| Loại               | Trường                                       | Đạt khi                                                                                                           |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `minFloor`         | `floor` ≥ 1                                  | `highestFloor` ≥ floor                                                                                            |
| `partyElement`     | `elementId`, `count` ≥ 1                     | ≥ count quái **còn đánh được** trong đội mang hệ đó                                                               |
| `partyRace`        | `raceId`, `count` ≥ 1                        | ≥ count quái còn đánh được thuộc race đó                                                                          |
| `partyRaceGroup`   | `raceGroupId`, `count` ≥ 1                   | ≥ count quái còn đánh được thuộc nhóm race đó (race của quái → `groupId`)                                         |
| `partySpecies`     | `speciesId`                                  | có quái còn đánh được thuộc loài đó                                                                               |
| `partySpeciesLine` | `speciesId`, `count` ≥ 1                     | ≥ count quái còn đánh được cùng dòng tiến hóa với loài đó (chính nó, dạng trước hoặc dạng sau; `evolutionLineOf`) |
| `item`             | `itemId` (gộp chồng), `count` ≥ 1, `consume` | có đủ vật phẩm; `consume` = mất khi vào                                                                           |

- **`treasure` / `rareTreasure`**: `{ rolls, items: [{ itemId, weight, min, max }] }` (rương thường / hiếm; món chỉ có theo tùy chọn đang tắt thì bỏ, như rương bí cảnh).
- Thêm loại điều kiện = thêm một mục vào union `ZoneRequirement`, `ZONE_REQUIREMENTS` (`world/zones.ts`) và `REQUIREMENT_CHECKS` (`validateZones.ts`); hai bảng là mapped type nên TypeScript báo thiếu.

## Vào, khám phá, rời

- **Vào** `enterZone { zoneId }` (thị trấn, ngoài trận, còn quái đánh được, không trong bí cảnh / hiểm địa / giải đấu / khu bảo tồn): hiểm địa không đang khóa (`zoneClosed { zoneId, reopenDay }`), mọi điều kiện đạt (điều kiện đầu tiên chưa đạt: `zoneRequirementUnmet { zoneId, index, requirementType }`), mất vật phẩm của điều kiện `consume`. Sinh `zones.visit = { zoneId, floor, steps, stepsTaken: 0, lastStep: null }`: **tầng sức mạnh** = `highestFloor + floorOffset` (−3, tối thiểu 1; level, gen, bậc trang bị của quái như tầng đó), **số bước** đều trong `steps` [5, 8] (gồm bước boss canh giữ). Không tốn giờ.
- **Khám phá** `exploreZone` (thị trấn, ngoài trận, còn quái đánh được):
  - Bước thứ `steps` (khi `stepsTaken + 1 = steps`) là **boss canh giữ**: boss tầng của map hiểm địa (level boss tầng của tầng sức mạnh). Bước này **không tính** vào `stepsTaken`: chạy thì lần khám phá sau gặp lại.
  - Bước khác: `stepsTaken + 1`, tung loại theo `stepWeights` (trận 55, tinh anh 10, rương 20, rương hiếm 5, linh tuyền 10; trọng số 0 thì bỏ), làm theo registry **`ZONE_STEPS`** (thêm loại bước = thêm vào `ZONE_STEP_KINDS` + một mục):
    - `battle`: trận quái hoang của map (như `startWildBattle`: có thể gặp 2 quái, boss ngẫu nhiên theo `bossChance` của map).
    - `elite`: **quái tinh anh** = boss ngẫu nhiên của map (map không có thì boss canh giữ).
    - `treasure` / `rareTreasure`: tung bảng rương, món vào túi (`lastStep.items`).
    - `spring`: **linh tuyền** hồi `springHealPercent` (40) % max HP cho mọi quái trong đội, **kể cả quái đã gục**.
  - Bước không mở trận tốn `clock.hours.zoneStep` (1) giờ; trận tốn giờ như trận thường lúc rời trận (quái hoang 2, boss 4).
  - `zones.visit.lastStep`: kết quả bước gần nhất cho UI (`battle` / `elite` / `guardian`, rương kèm `items`, linh tuyền kèm `healPercent`).
- **Trận hiểm địa**: `battle.special = { kind: 'zone', zoneId, guardian }`, `battle.floor` = tầng sức mạnh (không bị giới hạn bởi tầng đã mở). Map của trận (đồ rơi, môi trường, boss) tra qua `battleBiome` (điểm duy nhất). **Được bắt, được chạy** như trận thường; phần thưởng mỗi trận như trận thường (tiền, EXP, đồ rơi `drops` / `bossDrops` của map, trứng boss, thân mật). Không phải trận trên tầng (`isFloorBattle` false): không đếm modifier / chuỗi event, **không mở tầng** (kể cả boss canh giữ trùng loài boss tầng), không có quái xin theo (trận đặc biệt).
  - **Thắng** trận thường / tinh anh: **không hồi máu** (chủ project chốt 2026-10-28), lượt vào tiếp tục. Hồi máu chỉ có ở linh tuyền và bằng vật phẩm của người chơi.
  - **Thắng / bắt boss canh giữ**: log `zoneCompleted { zoneId }`, rương hiếm × `guardianRareRolls` (2) lần, hết lượt vào.
  - **Thua**: log `zoneFailed { zoneId }`, hết lượt vào, mất tiền như thua trận thường, giữ mọi thứ đã nhận.
- **Rời** `leaveZone` (ngoài trận): hết lượt vào, giữ mọi thứ đã nhận (`noZoneVisit` khi không trong hiểm địa).
- Lượt vào kết thúc (xong, thua, rời) thì hiểm địa **khóa `cooldownDays` (3) ngày**: `zones.reopenDay[zoneId]` = hôm nay + 3, vào lại được từ ngày đó.
- Đang trong hiểm địa: **không nghỉ, không NPC hồi máu, không rời thị trấn, không vào bí cảnh / tháp / giải đấu / đấu trường / khu bảo tồn / độ kiếp**, thú triều không bắt đầu (`zoneInProgress`; điểm duy nhất `assertNoInstance` ở `world/field.ts`, dùng chung với bí cảnh). **Được dùng vật phẩm** (chủ project chốt 2026-10-28): ngoài trận giữa các bước (thuốc hồi máu, hồi sinh, chữa trạng thái, kẹo...) và trong trận (thuốc, bóng, vật phẩm ném) như trận thường. Đổi đội, lắp đồ... vẫn làm được; lưu game giữa hai bước được.

## Nội dung (`zones-import.mjs`)

Bốn kiểu hiểm địa (49 cái; tên do Claude đặt, chủ project duyệt 2026-10-28). Luật chung của loài / boss / đồ rơi chung (Đá cường hóa 8%, boss Tẩy luyện thạch 20%) / rương chung (Đá cường hóa, `superPotion`, Kẹo EXP S; rương hiếm: Tẩy luyện thạch, Kẹo Hiếm, Kẹo EXP S, Bí Cảnh Lệnh, Phá Cảnh Đan) ở mục theo hệ; hai kiểu sau chỉ ghi phần khác.

### Theo hệ (`zone<Hệ>`, 19 cái)

- **Điều kiện**: tầng cao nhất ≥ 3 (thường, lửa, nước, cỏ, côn trùng, bay), 6 (điện, độc, đất, đá, băng, giác đấu), 10 (siêu linh, ma, bóng tối, thép, tiên), 15 (rồng, ánh sáng); và có ≥ 1 quái mang hệ đó trong đội.
- **Quái**: dạng đầu gặp được ngoài tự nhiên có hệ chính là hệ đó, **phẩm cấp B trở lên** (tổng chỉ số gốc ≥ 510), mẫu đều theo md5, tối đa 150 loài (thiếu 40 thì lấy loài mạnh nhất); trọng số = catchRate (huyền thoại hiếm hơn). Shiny 1% (quái tầng 0,2%), gặp 2 quái 25%, boss ngẫu nhiên 5%, `bossMultiplier` 2–3 (boss tầng 2–5: đội đã qua nhiều bước). Boss canh giữ + 3 tinh anh: dạng cuối của loài trong map gần tổng chỉ số trung bình của map nhất. Môi trường theo hệ (lửa: nắng / tro bụi + địa hình núi lửa...).
- **Đồ rơi**: bóng / thuốc như map tầng (`mapDrops`), thêm linh thạch hệ 6%, Đá cường hóa 8%, mảnh Tera hệ 2%, Thức tỉnh đan hệ 0,5%; boss thêm linh thạch 40%, Tẩy luyện thạch 20%, Thức tỉnh đan 10%, Z-Crystal hệ 8%.
- **Rương** (2 lượt): Đá cường hóa, linh thạch hệ, `superPotion`, mảnh Tera, Kẹo EXP S, đá tiến hóa hệ, dược liệu hợp hệ. **Rương hiếm** (1 lượt): Tẩy luyện thạch, Thức tỉnh đan hệ, Kẹo Hiếm, Kẹo EXP S, Z-Crystal hệ, Bí Cảnh Lệnh, Phá Cảnh Đan.

### Theo nhóm race (`zoneRace<Nhóm>`, 20 cái, mỗi nhóm race một cái)

- **Điều kiện**: tầng cao nhất ≥ 4 (thú, chim, côn trùng, thực vật, thủy sinh), 5 (nhân hình, bò sát), 6 (khủng long, khoáng vật, vô định hình, linh hồn), 8 (nguyên tố, biến hình, bất tử), 10 (dị thể, ác ma, ngoài hành tinh), 12 (rồng), 15 (thiên thần, thần linh); và có ≥ 1 quái thuộc nhóm race đó (`partyRaceGroup`).
- **Quái**: loài thuộc nhóm race đó, phẩm cấp B+ (như theo hệ). Hệ của map (đá tiến hóa rơi) = hệ chính phổ biến nhất của loài trong map.
- **Đồ chủ đề**: **tinh phách của nhóm** (`essence<Nhóm>`; nhóm ngoài hành tinh chưa có tinh phách nên không có): rơi 10%, boss 60%, rương (trọng số 30, 1–3), rương hiếm (20, 3–6).

### Cấm địa cần vật phẩm khóa (`zoneAncient`, Thượng Cổ Cấm Địa)

- **Điều kiện**: tầng cao nhất ≥ 10, **tiêu một Bí Cảnh Lệnh** khi vào (`item`, `consume`).
- **Quái**: phẩm cấp **S trở lên** (tổng chỉ số gốc ≥ 555) của mọi hệ / race; shiny 2%.
- **Đồ**: rương 3 lượt (thêm Tẩy luyện thạch), rương hiếm 2 lượt (thêm Kẹo EXP M, Hóa Hình Đan), Kẹo Hiếm rơi 1% / boss 25%.

### Thêm sau

### Cố hương của loài (`zoneLine<Loài>`, 9 cái; chủ project yêu cầu 2026-10-28, Claude chọn theo luật)

- **Chọn loài**: dạng đầu gặp được ngoài tự nhiên có **≥ 3 nhánh tiến hóa trực tiếp** và cả họ **≤ 40 loài** (bỏ cây Digimon lớn). Hiện có: Eevee, Tyrogue, Burmy, Applin, Ấu Trùng Zerg, Tuwai, Masquerattle, Pawndead, Monitamon. Tên tự sinh: "Cố Hương <tên loài>" / "<name> Homeland".
- **Điều kiện**: tầng cao nhất ≥ 5, có ≥ 1 quái **cùng dòng tiến hóa** (`partySpeciesLine`: quái đã tiến hóa vẫn vào được).
- **Quái**: cả họ (dạng đầu và mọi dạng sau, trừ dạng chỉ có trong trận), trọng số = catchRate: nơi duy nhất gặp **dạng đã tiến hóa** ngoài tự nhiên. Môi trường theo hệ chính của dạng đầu.
- **Đồ chủ đề**: **vật phẩm tiến hóa của họ** (mọi `itemId` trong mục tiến hóa của cả họ, ví dụ Eevee: 5 loại đá, Applin: 3 loại táo) trong rương (trọng số 20) và rương hiếm (15); họ không cần vật phẩm thì chỉ có đồ chung.

### Thêm sau

- Đồ đặc biệt (đồ riêng của từng hiểm địa, nguyên liệu mới...) chỉ cần thêm item rồi thêm vào bảng của hiểm địa trong `zones-import.mjs` (dữ liệu, không sửa code). Điều kiện loài cụ thể (`partySpecies`) đã có, chưa có hiểm địa dùng (cố hương dùng dòng tiến hóa).

## Save

- `GameState.zones = { visit, reopenDay }` (game mới: `{ visit: null, reopenDay: {} }`). Kiểm tra (`validateZoneState`): hiểm địa tồn tại, ngày nguyên ≥ 0; lượt vào: tầng ≥ 1, `0 ≤ stepsTaken < steps`, `lastStep` đúng loại, đang ở thị trấn, không đồng thời bí cảnh / khu bảo tồn. Trận hiểm địa chưa kết thúc phải có lượt vào đúng hiểm địa đó; boss canh giữ chỉ ở bước cuối.
- v63 migrate: `zones: { visit: null, reopenDay: {} }` (`state-versions.md`).

## Chưa có

- Màn hình hiểm địa (chờ UI, `ui-overhaul.md`).
- Sức chứa kho khi bắt quái trong hiểm địa: như trận thường (`capacity.md`).
