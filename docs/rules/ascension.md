# Phi thăng và Thiên mệnh

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

**Prestige toàn game** (như game idle, và "phi thăng" trong truyện tu tiên): reset tiến trình chính để nhận **Tiên nguyên**, mua **nâng cấp vĩnh viễn** ở Tiên giới; mỗi lần chơi mang **thiên mệnh** có lợi kèm hại. Bước 12d (2026-11-03). Số là **số tạm** (`balance.json` khóa `ascension`).

Code: `model/ascension.ts` (kiểu, `AscensionState`, `bestFloorReached` / `bestRealmReached`), `registries/ascension.ts` (Tiên nguyên, tầng khởi đầu, tiền giữ, số ô thiên mệnh), `game/ascension.ts` (action, guard, lựa chọn thiên mệnh), `registries/tamerBonuses.ts` (hiệu ứng qua kênh thưởng), `registries/challenge.ts` (`gameDataFor`: số ô đội của game), `gameData/validateAscension.ts`, `game/validateAscensionState.ts`. Dữ liệu: `src/data/ascensionUpgrades.json`, `src/data/destinies.json`; tên ở `i18n/<ngôn ngữ>/ascensionUpgrades.json`, `destinies.json`.

## Phi thăng

- **`ascend`**: ở thị trấn, ngoài trận, không dở giải đấu / tông chiến / bí cảnh / hiểm địa / khu bảo tồn / thú triều / event chờ. Cần `highestFloor ≥ minFloor` (100), không thì `ascensionLocked { minFloor, highestFloor }`. UI hỏi xác nhận rõ những gì mất.
- **Tiên nguyên nhận** `ascensionEssenceReward` = ⌊`essenceBase` × √(tầng cao nhất từng đạt / `minFloor`) × (1 + tổng tầng thức tỉnh cao nhất / 100)⌋ − `totalEssenceEarned` (không âm): đường cong căn bậc hai như Realm Grinder, phải đi xa hơn mới được thêm. Phi thăng lại khi không vượt thành tích vẫn được, nhận 0. Tổng tầng thức tỉnh = đội + kho, lấy mức cao nhất từng có lúc phi thăng.
- Ghi log `ascended { count, essenceGained, startFloor }`, rồi **chờ chọn thiên mệnh** (mục dưới).

### Reset

`highestFloor` về tầng khởi đầu, `floorBiomeIds` cắt theo (giữ map các tầng đó, thiếu thì tung; tầng cao hơn tung lại khi mở), đạo quán của các tầng đã có sẵn tung lại, vị trí về thị trấn (hàng cửa hàng mới), tiền (trừ phần giữ lại), **chồng vật phẩm thường** (giữ thứ không rời túi: vật phẩm chìa khóa, bùa), **level / EXP mọi quái** về 1 kèm hồi đầy máu, bỏ trạng thái (`resetMonsterLevel`, dùng chung với luân hồi; cả quái trong trứng), việc được giao của quái (thám hiểm, động phủ: hủy, không có thưởng), cảnh giới / EXP ngự thú sư về 0, đạo quán / bậc đấu trường / tháp, động phủ về như game mới (cây trồng, kho, hộp thức ăn mất; sách trong kho về túi), độ bất ổn về 0, bảng và nhiệm vụ đang nhận (bổ sung lại ngay vì nhiệm vụ cũ có thể đòi tầng cao), hiệu ứng / chuỗi / cửa hàng tạm của event (giữ ngày đóng cửa hàng), độ bão hòa giá thị trường, giá đã đặt ở đấu giá, đồ ký gửi về túi (không thành đường chuyển tiền qua lần sau), cống hiến còn tiêu được, khu Nuzlocke đã dùng, mồi dụ, món ăn đang có tác dụng; Tera Orb sạc đầy.

### Giữ

Mọi trường không liệt kê ở trên (reset chỉ đổi đúng các trường đó nên **phần state mới mặc định được giữ**): mọi thuộc tính vĩnh viễn trên quái trừ level / EXP (gen, trait, skill, thuần thục, thức tỉnh, hóa hình, hiến tế, hồn tinh, cấy ghép, luân hồi, thân mật, tuổi, dưỡng dục, thiên phú, tính cách, Âm / Dương, linh dịch, lý lịch, `maxLevelReached`, cảnh giới khế ước...), trang bị và đồ cầm đang lắp, tinh thể, sách, hồn phách, khí linh, Dex, nghiên cứu loài, thành tựu, danh hiệu, bộ đếm, tông môn (chức vị, cống hiến tổng, đồng môn, nhiệm vụ tông: tự đổi theo ngày), ân sủng thần linh, cấp luyện đan / luyện khí / nấu ăn và công thức, trận pháp, sức chứa đã mở rộng, cấp thiên phú ngự thú sư, bản mệnh / đạo thương, boss thế giới đang xuất hiện và thưởng chờ nhận (giữ tầng lúc xuất hiện, có thể cao hơn tầng đang mở), hàng Phòng Thí Nghiệm, bảng trao đổi, đồng hồ game.

### Mở khóa theo giá trị cao nhất, sức mạnh theo giá trị hiện tại

- **Cao nhất từng đạt** (`bestFloorReached` / `bestRealmReached`, điểm duy nhất; `max(giá trị hiện tại, mốc lúc phi thăng trước)` nên không phải cập nhật liên tục: lệch roadmap "cập nhật liên tục", ít chỗ sửa hơn): số ô đồ cầm, sức chứa kho / túi, kỹ năng ngự thú sư đã mở (`BattleTamer.realm`), ô thám hiểm, mức bất ổn tối đa, tư chất, điểm thiên phú ngự thú sư theo cảnh giới, thành tựu `highestFloor` / `tamerRealm`, điều kiện tầng của bùa bán ở thị trấn và hiểm địa, cảnh giới tối thiểu vào tông.
- **Hiện tại** (chơi lại tiến trình): giới hạn level và số ô khế ước, linh lực, giá vật phẩm theo tầng, quái theo tầng, đối thủ NPC, giá đột phá.
- Cộng hưởng và thọ nguyên đi theo `Monster.contractRealm` của từng quái (không hạ khi reset cảnh giới), level quái reset nhưng `maxLevelReached` giữ nên thọ nguyên và điểm thiên phú không tụt. Quái đã khế ước vẫn giữ dù số ô khế ước hiện tại ít hơn; chỉ không khế ước thêm được.

## Tiên giới (nâng cấp vĩnh viễn)

- **`buyAscensionUpgrade { upgradeId }`**: ngoài trận, ở đâu cũng được (kể cả lúc đang chờ chọn thiên mệnh). Cấp n → n + 1 tốn `costPerRank × (n + 1)` Tiên nguyên (dùng chung `rankedNodeBlocker` với cây thiên phú). Lỗi: `unknownAscensionUpgrade { upgradeId }`, `notEnoughImmortalEssence { need, have }`, `talentMaxRank`, `talentRequires`, `inBattle`.
- Dữ liệu `{ id, requires?, maxRank?, costPerRank, effects }`, hiệu ứng nhân hệ số = cấp, % cộng như mọi nguồn. Hiện có: +% EXP, tiền, đồ rơi, mọi chỉ số quái ta (không trần); +ô thiên mệnh (trần 3); tầng khởi đầu, giữ tiền (trần 10 cấp).
- **Tầng khởi đầu** `ascensionStartFloor` = ⌊tầng cao nhất từng đạt × min(`startFloorMaxPercent` 50, kênh `startFloorPercent`) / 100⌋, ít nhất 1. **Tiền giữ** `ascensionKeptMoney` = tiền × min(`keepMoneyMaxPercent` 50, kênh `keepMoneyPercent`) / 100, làm tròn xuống.

## Thiên mệnh

Như mệnh cách / khí vận trong game tu tiên. Dữ liệu `{ id, rarity, effects }` (độ hiếm `common` / `rare` / `epic`).

Danh sách và số ở `src/data/destinies.json` (36 thiên mệnh: 16 thường, 12 hiếm, 8 cực hiếm; mỗi cái đều có cả lợi lẫn hại, chỉ dùng kênh thưởng có sẵn nên thêm cái mới không phải sửa code). Cái có thể đổi hẳn cách chơi: Thiên Sát Cô Tinh (mọi chỉ số +15%, đội mất 2 ô), Vạn Cổ Độc Hành (mọi chỉ số +30%, đội mất 4 ô, chỉ còn 2 ô).

- Lệch roadmap: Đan Đạo Kỳ Tài ghi "thọ nguyên −10%", đổi thành luyện khí −15% vì thọ nguyên mặc định tắt (`options.md`), khi đó thiên mệnh không có mặt hại. Roadmap ghi "đội tối đa 4 ô": dữ liệu là bớt 2 ô (6 → 4).
- **Lựa chọn**: tung không trùng theo `rarityWeights` (mọi độ hiếm trọng số > 0), số lựa chọn = `choiceCount` (3) + số ô − 1; số chọn được = `baseSlots` (1) + kênh `destinySlots`.
- **Game mới**: `rollNewGameDestinies(data, seed)` tất định theo seed, không tốn RNG của game (màn chọn hiển thị đúng, quái khởi đầu không đổi); `createNewGame` nhận `destinyIds` (bỏ trống = **Phàm nhân**).
- **Sau phi thăng**: `ascension.destinyChoices` giữ lựa chọn, `destinies` rỗng; trong lúc chờ chỉ làm được `chooseDestinies { destinyIds }` (rỗng = Phàm nhân) và `buyAscensionUpgrade`, action khác lỗi `destinyChoicePending` (`assertDestinyChosen`, đầu `gameReducer`). Không đổi giữa chừng.
- Lỗi: `notDestinyChoice { destinyId }`, `tooManyDestinies { max }`, `noDestinyChoice`, id trùng / sai dạng `malformedAction`.
- **Bớt ô đội** (`partySlotPenalty`): `gameDataFor` trả dữ liệu có `config.partySize` đã trừ (không dưới số ô một quái lớn), gọi đầu `gameReducer` nên mọi chỗ hỏi ô đội đều đúng; gọi lại với dữ liệu đã đổi không trừ hai lần. Lúc chọn, quái cuối đội về kho; kho không đủ chỗ thì `storageFullForParty`, chọn cái khác.

## Kênh thưởng

Nâng cấp Tiên giới và thiên mệnh cộng vào **kênh thưởng ngự thú sư** (`tamer-talents.md` mục "Kênh thưởng"), nơi dùng không biết nguồn nào. Kênh mới của mục này:

| Kênh                                    | Nơi dùng                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `teamDamagePercent`                     | nhân sát thương skill của phe người chơi trong `rawDamage` (qua `MonsterBattleContext.tamerBonusDamagePercent`) |
| `contractResonancePercent`              | % của phần cộng hưởng khế ước (`contractStatPercent`) của từng quái, cộng vào nguồn % `tamerBonus` trong trận   |
| `breakthroughCostPercent`               | nhân giá tiền đột phá                                                                                           |
| `startFloorPercent`, `keepMoneyPercent` | tầng khởi đầu, tiền giữ (trên)                                                                                  |
| `destinySlots { slots }`                | số ô thiên mệnh                                                                                                 |
| `partySlotPenalty { slots }`            | số ô đội bớt đi (chỉ bớt: thêm ô đụng tới cộng hưởng đội, kiểm tra dữ liệu theo `partySize`)                    |

## Thành tựu, mở khóa

- Điều kiện thành tựu mới `ascensions` = số lần phi thăng (dùng được cho `config.starter.unlocks`, `starters.md`); thành tựu `ascensionPath`.

## State, save

- `GameState.ascension { count, immortalEssence, totalEssenceEarned, upgrades, bestFloor, bestRealm, bestAwakening, destinyChoices }`, `GameState.destinies: id[]`. Tiên nguyên là `Decimal` (`bigFields.ts`). Tên `immortalEssence` thay `tienNguyen` của roadmap (quy tắc đặt tên tiếng Anh).
- Kiểm tra save: thiên mệnh tồn tại, không trùng; cấp nâng cấp qua `validateRanks`; số không âm. Không xét số lượng theo số ô (dữ liệu có thể đổi).
- Save v102: chưa phi thăng, Phàm nhân. Tầng trong `worldBoss` và trận boss thế giới so với tầng cao nhất từng đạt.

## Mô phỏng

- Biến thể quét tầng `destinyIds` (đội bớt ô theo thiên mệnh) và `ascensionUpgrades` so với `current` (`simulation-features.md`).
- Chơi liên tục chưa phi thăng: kịch bản không tới tầng 100.

## Chưa có

- UI: màn Tiên giới, xác nhận phi thăng, chọn thiên mệnh ở Game mới và sau phi thăng (chờ UI, `ui-overhaul.md`).
- Phi thăng trong chơi liên tục của mô phỏng (chờ kịch bản tới tầng `minFloor`).
