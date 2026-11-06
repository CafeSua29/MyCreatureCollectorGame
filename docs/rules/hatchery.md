# Phòng ấp theo môi trường

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Theo Hatching room của Portals of Phereon (chủ project yêu cầu 2026-11-05). Trứng đặt trong phòng có môi trường: loại trứng hợp môi trường thì lớn nhanh và ổn định hơn, trứng cùng phòng ảnh hưởng nhau. Không bắt buộc: trứng mang theo ấp như cũ (`breeding-eggs.md`), không tung độ ổn định.

Code: model `model/hatchery.ts`; logic `progression/hatchery.ts` (`eggTypeOf`, `roomHabitatId`, `eggRoomBonus`, `roomEffects`, `hatcherPower`, `roomSteps`, `hatchFromRoom`, `settleRoomHatch`, `buildHatcheryHabitat`, `buyHatcheryUpgrade`, `setHatcher`, `placeEgg`, `hatcheryDailyTask`); bước theo trận ở `incubateEggs` (`progression/incubation.ts`), nở ở `battle/outcome.ts`; hook gen `eggGrowthPercent`, `eggStabilityPercent` (`registries/rewardTraitHooks.ts`); kiểm tra `gameData/validateHatchery.ts`, `game/validatePhereonState.ts`; số ở `balance.json` khóa `hatchery`.

## Luật

- **Loại trứng** (`eggTypeOf`): `eggType` của loài nếu có (loài Portals of Phereon lấy từ gốc), không thì hệ đầu tiên của quái có trong `eggTypeByElement`, không thì `defaultEggType`. Mười loại: normal, lava, aquatic, floral, stone, ice, light, dark, slime, crystal.
- **Phòng**: `roomCount` (3) phòng, mỗi phòng `eggsPerRoom` (4) trứng. Phòng chưa dựng là `defaultHabitatId` (`basic`). Dựng lại `buildHatcheryHabitat { roomIndex, habitatId }` (thị trấn, ngoài trận) trả `buildCost` của môi trường: basic, outside, crystal, lava, water, slime, ice.
- **Đặt trứng** `placeEgg { eggId, roomIndex }` (ngoài trận, ở đâu cũng được); `roomIndex: null` lấy ra mang theo.
- **Sức lớn và độ ổn định** (`eggRoomBonus`): ổn định gốc `baseStability` (100) cộng các luật khớp:
  - `rules`: theo loại trứng × môi trường (`eggTypes`, `notEggTypes`, `habitatIds`, `notHabitatIds`, `growth`, `stability`). Số đúng `getStabilityBonus` / `getGrowthBonus` của gốc (ví dụ trứng lava +25 sức lớn, ngoài phòng lava −35 ổn định; trứng ice +50 ổn định, ngoài phòng ice −50 sức lớn; phòng crystal +10 / +10).
  - `neighborRules`: mỗi trứng khác **cùng phòng** (floral cạnh floral +10 / +20; trứng dark làm trứng khác −10 sức lớn, tự +15 mỗi trứng không phải dark; trứng light làm trứng khác +10 sức lớn).
  - Hook của quái trong trứng và tinh chất `egg` (`essences.md`).
- **Bước tiến** (`roomSteps`): mỗi trận thắng trứng trong phòng tiến `bước × (1 + sức lớn %)`, phần lẻ tung theo tỉ lệ, âm thì không tiến. Trứng mang theo không tốn RNG.
- **Theo ngày** (`hatcheryDailyTask`): trứng trong phòng tiến thêm `dailySteps` (1) bước mỗi ngày, cũng nhân sức lớn, nhưng **dừng ở 1**: trứng chỉ nở sau trận thắng, nơi xử lý chỗ trong đội / kho (như Ôn Dưỡng Lò).
- **Lúc nở** (`hatchFromRoom`, trứng trong phòng): tung độ ổn định, kẹp dưới `minHatchChance` (5%). Thất bại thì **mất trứng** (log `eggFailed { eggId }`), trừ khi có nâng cấp lùi trứng. Thành công: trên 100 thì gen tăng theo phần dư × `genePercentPerExcessStability` %, ít nhất +1; quái nhận trait của môi trường (`hatchTraitId`: lava, water, slime, ice như gốc) và hiệu ứng nâng cấp, nếu còn ô trait.
- **Người ấp** `setHatcher { roomIndex, monsterId }` (ngoài trận; `null` = cho nghỉ): quái **trong kho**, rảnh; bị khóa như quái làm việc (assignment `hatchery`). Cộng sức lớn cho mọi trứng trong phòng: **sức ấp** `hatcherPower` (công đặc biệt gốc của loài / `statPerPoint`, mỗi `diminishEvery` (10) điểm thì điểm sau × `diminishFactor` (0,75) như `getBaseHatcherBonus`; hook `hatcherBonus`, gen Incubating gấp đôi), `sameEggTypeGrowth` (10) khi cùng loại trứng, `habitatGrowth` (10) khi loại trứng của người ấp hợp môi trường. Người ấp đã mất (tọa hóa...) thì phòng coi như không có người ấp.
- **Nâng cấp phòng** `buyHatcheryUpgrade { roomIndex, upgradeId }` (thị trấn, ngoài trận): tối đa `upgradeCap` (3) mỗi phòng như gốc; có `habitatIds` thì chỉ mua được ở môi trường đó, đổi môi trường thì mất. Dữ liệu `config.hatchery.upgrades`, hiệu ứng theo `kind` (`HatcheryUpgradeEffect`):

| Nâng cấp                    | Tác dụng                                                  |
| --------------------------- | --------------------------------------------------------- |
| `growth`, `stability`       | +10 sức lớn / +10 ổn định                                 |
| `symbiotic`                 | +10 sức lớn mỗi trứng khác cùng loài trong phòng          |
| `supporting`                | +10 ổn định mỗi trứng khác sắp nở                         |
| `boosting`                  | Nở xong, trứng khác trong phòng tiến 1 bước (dừng ở 1)    |
| `energizing`                | Quái nở đầy no và tinh thần                               |
| `embiggening`               | Quái nở nhận trait Giant (+30% HP)                        |
| `potential`                 | Quái nở +20% mọi gen                                      |
| `delayed`                   | Phần bước gốc giảm một nửa, quái nở +9 level              |
| `focusing` / `equalizing`   | Phần ổn định dư chỉ vào gen cao nhất / thấp nhất, gấp đôi |
| `consuming`                 | Nở hỏng: trứng khác trong phòng tiến 2 bước               |
| `continuous`                | Nở hỏng: trứng lùi về 3 trận thay vì mất                  |
| `soulCollector`             | Nở hỏng: nhận điểm hồn tinh                               |
| `mutating` (phòng slime)    | Quái nở nhận một trait ngẫu nhiên                         |
| `obsidianFarm` (phòng lava) | Trứng lava nở thành công cho Linh Thạch Hỏa               |
| `fruiting` (phòng outside)  | Mỗi ngày mỗi trứng floral cho Linh Thạch Mộc              |

- **Lỗi**: `unknownHabitat`, `roomNotFound`, `habitatAlreadyBuilt`, `roomFull { roomIndex, max }`, `eggNotFound`, `unknownHatcheryUpgrade`, `hatcheryUpgradeOwned`, `hatcheryUpgradeWrongHabitat`, `hatcheryUpgradeCap { max }`, `hatcherNotInStorage`, `monsterBusy`, `notInTown`, `inBattle`, `notEnoughMoney`.
- **Save**: `GameState.hatchery = { rooms: [{ habitatId, upgrades, hatcherId }] }` (game mới rỗng), `Egg.roomIndex` tùy chọn. Kiểm tra: tối đa `roomCount` phòng, môi trường tồn tại, `roomIndex` hợp lệ, không quá `eggsPerRoom`.

## Lệch gốc

- Gốc ấp theo ngày; game giữ hai trục ấp theo trận và theo ngày.
- Nâng cấp: giá gốc là gỗ / đá / pha lê / tiền nên quy về tiền (số tạm). **Bỏ Freezing** (game không có trứng hỏng theo thời gian). **Potential** bỏ phần "lên cấp đầu chậm 10 lần". **Embiggening** thành trait vì game không có bậc kích cỡ. Vật phẩm của ObsidianFarm, Fruiting quy về linh thạch (game không có obsidian, plantmatter). `energizing` chỉ giữ no / tinh thần (năng lượng, sữa của gốc không nhập).
- Gốc dùng độ ổn định để nâng gen từng bước lúc nở (mỗi lần tốn ổn định). Game đơn giản thành: phần ổn định dư cộng % mọi gen, vì gen của game không trần.
- Môi trường gốc: Outside, Basic, Crystal, Lava, Water, Slime, Ice (giữ đủ). Giá dựng là tiền thay cho gỗ / đá / pha lê của gốc (số tạm).

## Chưa có

- Mô phỏng chưa đo phòng ấp (`simulation-features.md`).
- Màn hình phòng ấp (chờ UI, `ui-overhaul.md`).
