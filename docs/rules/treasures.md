# Thiên tài địa bảo

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Linh quả, linh thảo, yêu đan **cho quái ăn** để tăng vĩnh viễn: **gen** (tiềm năng, di truyền khi breed như gen thường), thuần thục skill, cấp trait. Khác cấy ghép (`implant.md`, chưa làm: chỉ số phẳng có rủi ro). Ăn nhiều thì **kháng**. Số ở `balance.json` khóa `treasures` và `items.json`; số hiện tại ở `balance-systems.md`.

Code: handler `registries/treasureEffects.ts` (`TREASURE_EFFECTS` gộp vào `ITEM_EFFECTS`, `treasurePotency`), khẩu vị `isFavoriteItem` và áp vật phẩm `applyConsumable` (`registries/itemEffects.ts`), dùng vật phẩm `applyItem` (`world/field.ts`), đồ rơi `treasureDrops` (`battle/outcome.ts`), kiểm tra `gameData/validateTreasures.ts`. Nhập dữ liệu: `scripts/data-import/treasures-import.mjs` (chạy lại được).

## Hiệu ứng (category `consumable`, dùng ngoài trận lên quái ta: `useItem`)

| Hiệu ứng          | params               | Tác dụng                                                                                                     |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `addGenes`        | `stat`, `amount` > 0 | gen của một chỉ số + ⌊amount × hệ số gen của tầng cao nhất (`floorGeneMultiplier(highestFloor)`) × hiệu quả⌋ |
| `addGenesAll`     | `amount` > 0         | như trên, mọi chỉ số                                                                                         |
| `addGenesTopStat` | `amount` > 0         | như trên, chỉ số gốc cao nhất của loài gốc (hòa: chỉ số đầu theo `STAT_NAMES`) (yêu đan)                     |
| `addMasteryExp`   | `amount` > 0         | ⌊amount × hiệu quả⌋ exp thuần thục của skill chọn lúc dùng (`addMasteryExp` của `mastery.ts`)                |
| `traitLevelUp`    | `count` nguyên ≥ 1   | + count cấp cho **một trait ngẫu nhiên** (đều trên mọi trait của quái trừ loại shiny / boss; RNG của state)  |

- **Hiệu quả** (`treasurePotency`) = `resistance ^ (số lần đã ăn đúng món)` × (`favoriteMultiplier` nếu đúng khẩu vị). Mọi hiệu ứng trên đếm lượt (`countsUses`, `itemUseCounts` dùng chung với Thọ Nguyên Đan; Thọ Nguyên Đan giữ kháng riêng `lifespan.pillResistance`). Lượng làm tròn về 0 (kháng quá nhiều) hoặc không có trait nâng được / skill không biết thì **không có tác dụng** (`itemNoEffect`, không mất vật phẩm).
- **Khẩu vị:** vật phẩm tiêu hao có trường tùy chọn `favoriteRaceIds` / `favoriteElementIds` (id tồn tại, không rỗng). Quái có race trong danh sách hoặc có hệ trong danh sách: hiệu quả × `favoriteMultiplier` (2) và + `favoriteAffinity` (5) thân mật (`changeAffinity`) khi món có tác dụng.
- **Chọn skill:** vật phẩm có hiệu ứng `needsSkill` (`itemNeedsSkill`) bắt buộc `useItem { ..., skillId }` là skill quái đang biết (thiếu `skillId`: `malformedAction`; skill không biết: `skillNotKnown`); vật phẩm khác gửi `skillId` thì `malformedAction`.
- Hiệu ứng ngẫu nhiên (`applyRandom`) chỉ chạy khi có RNG (dùng vật phẩm ngoài trận); kỹ năng ngự thú sư dùng chung `applyItemEffects` không có RNG nên bỏ qua hiệu ứng đó.

## Vật phẩm

- Thiên Linh Quả `heavenSpiritFruit` (`addGenesAll` 1; cửa hàng), 6 quả theo chỉ số: Huyết Bồ Đề (HP), Hổ Cốt Quả (công), Huyền Quy Giáp (thủ), Linh Tâm Quả (đặc công), Băng Tâm Liên (đặc thủ), Phong Linh Thảo (tốc độ) (`addGenes` 3; cửa hàng), Long Huyết Quả `dragonBloodFruit` (`addGenesAll` 2, khẩu vị rồng / bò sát), Ngộ Đạo Trà `enlightenmentTea` (`addMasteryExp` 50; cửa hàng), Tẩy Tủy Đan `marrowCleansingPill` (`traitLevelUp` 1, rất hiếm).
- **Yêu đan theo hệ** (19 món `demonCore<Hệ>`, `addGenesTopStat` 5, khẩu vị đúng hệ đó; chốt theo hệ thay vì theo loài để không cần item có tham số).
- Linh Quả `spiritFruit` của dưỡng dục giữ nguyên (không tăng gen).
- **Đồ rơi** (`EXTRA_DROP_TABLES`): mọi quái bị hạ tung `treasures.wildDrops` và yêu đan của **hệ đầu** (`demonCoreItemIds[hệ]`; quái hoang tỉ lệ `demonCoreWildChance`, boss `demonCoreChance`; tỉ lệ 0 thì không tung, không tốn RNG); boss tung thêm `bossDrops`.
- **Yêu đan còn là nguyên liệu**: **đúng hệ** cho Thức tỉnh đan theo hệ (đột phá của quái, `awakening.md`), đúc trang bị và phụ linh (`equipment-forge.md`); **cùng một hệ** cho Phá Cảnh Đan (đột phá của ngự thú sư); **bất kỳ hệ** (nhóm `demonCore` ở `config.itemGroups`) cho Hóa Hình Đan, Vạn Thọ Đan, Tụ Linh Đan, công thức luyện khí ra đá rèn, cường hóa từ cấp 10 (`alchemy.md`). Người chơi tự chọn ăn (đúng khẩu vị hiệu quả ×2) hay để luyện.
- Luyện được: Thiên Linh Quả, Hổ Cốt Quả, Phong Linh Thảo, Ngộ Đạo Trà (`alchemy.md`). Chợ đen: Long Huyết Quả, Tẩy Tủy Đan, yêu đan (`events.md`).

## Mô phỏng

- Chơi liên tục: sau mỗi trận "người chơi" dùng hết địa bảo trong túi lên đội mẫu (đúng khẩu vị trước, rồi quái ăn ít món đó nhất; Ngộ Đạo Trà cho skill power cao nhất); yêu đan (món của nhóm nguyên liệu) chỉ cho quái đúng khẩu vị ăn, còn lại giữ để luyện, cột `treasures` ở `progression.csv` (`scripts/simulate/treasures.ts`, `simulation-features.md`).
