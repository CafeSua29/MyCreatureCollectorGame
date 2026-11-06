# Phản ứng hệ

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Lấy từ **Type Chemistry của Cassette Beasts**: mỗi cặp (hệ đòn, hệ mục tiêu) có một kết quả: buff cho mục tiêu, debuff cho mục tiêu hoặc biến hệ. Phản ứng **luôn xảy ra** khi trúng, không tung tỉ lệ. Game giữ khắc hệ kiểu Pokémon (hệ số sát thương), phản ứng là lớp riêng chạy sau đòn. **Mọi cặp hệ đều có phản ứng** (chủ project chốt 2026-11-04; bản gốc để trống nhiều ô).

## Luật

- Sau khi skill **trúng** một mục tiêu, với **mỗi hệ hiện tại của mục tiêu** (`Monster.elementIds`: đã tính Tera, dạng trong trận, đổi hệ tạm), theo thứ tự hệ: log `elementReaction { monsterId, reactionId, attackElementId, defenderElementId }` rồi chạy `effects` của cặp (hệ skill, hệ đó) lên mục tiêu (luôn trúng). Danh sách hệ lấy lúc bắt đầu nên biến hệ của phản ứng đầu không làm mất phản ứng của hệ còn lại (`battle/elementReactions.ts`).
- **Có phản ứng:** skill gây sát thương lẫn skill trạng thái; skill nhắm đồng đội (`ally`, phần đồng đội của `allAllies`); skill do trait / lặp skill (mỗi lần dùng một lần); hệ số khắc hệ 0 (như mọi hiệu ứng khác của skill và như bản gốc không có miễn nhiễm: điện đánh hệ đất không mất máu nhưng vẫn thủy tinh hóa thành hệ Thủy tinh). Áp cho mọi phe, mọi loại trận.
- **Không có phản ứng:** trượt, né, không với tới, bảo vệ, guard của phe, hút skill theo hệ, phản lại (Magic Coat), thế thân đỡ, mục tiêu đã gục hoặc đã rời sân vì đòn (Roar, Dragon Tail, trait bỏ chạy), quái tự dùng lên chính nó, skill không hệ (`typeless`: Struggle, Bide), đòn đến muộn (Future Sight, như mọi hiệu ứng của nó), vật phẩm ném.
- Đánh nhiều lần: **một lần mỗi skill mỗi mục tiêu**, sau đòn cuối.
- Hệ skill là hệ thật lúc dùng (Tera Blast, Weather Ball, Electrify...).
- **Biến hệ** (hiệu ứng skill `transmute { elementId, turns? }`, timing `afterHits`, dùng được trên mọi skill): mục tiêu thành đúng một hệ, dùng chung cơ chế đổi hệ tạm với Soak (`changeIdentity`, `VolatileState.originalIdentity`, log `identityChanged`). Lớp phủ của gốc có thời hạn 3 lượt (`turns`, mục "Lớp phủ hệ có thời hạn" ở `cassette-mechanics.md`), không có `turns` thì tới khi rời sân. Đang Tera hoặc đã đúng hệ đó thì không đổi.
- **Cộng hưởng** (hiệu ứng skill `resonate { threshold }`, Resonance của gốc, 3 lần): mỗi lần cộng một vào `VolatileState.resonance`, log `resonance { monsterId, count, threshold }`; đủ số thì mất hết máu còn lại (log `perished`). Mất khi rời sân. **Boss hoang không bị** (như Perish Song, để không hạ boss chỉ bằng vài đòn).
- **AI:** cộng điểm hiệu ứng phản ứng vào ứng viên (skill, mục tiêu) như hiệu ứng skill (`reactionEffectsOn`): `applyStatus` buff lên địch là điểm âm (đổi chung cho mọi skill), debuff điểm dương, `statusWeights` riêng mỗi trạng thái; `transmute` chấm theo khắc hệ của các hệ quái dùng lên mục tiêu trước và sau × `stageValuePerStep`; `resonate` = `koBonus` × (số lần sau đòn này / ngưỡng). AI không dự đoán đổi mục tiêu của Đa / Đơn mục tiêu (như chiêu đổi mục tiêu theo môi trường).

## Hệ Nấm

`fungal` (Portals of Phereon, chủ project yêu cầu 2026-11-05; `phereon-import.mjs element`, phần chung ở `element-common.mjs`). Gốc không có bảng khắc hệ (kháng theo loại sát thương, Nấm đánh hệ Độc) nên **khắc hệ do Claude chọn theo chủ đề**: khắc cỏ / đất / nước; kém với lửa / thép / độc / bay / nấm; bị lửa / băng / ánh sáng khắc; kháng cỏ / nước / đất / điện / bóng tối. 3 phản ứng lấp theo hệ đánh (Nhiễm bào tử, Vỏ sợi nấm, Bụi bào tử). 8 skill theo tên gốc, Max / Z-Move, đồ theo hệ chép mẫu hệ đá, cộng hưởng đồng hệ. Trạng thái `spored` (Spore: gục khi đang dính thì một địch của nó nhận minion `fungalSpores`), theme `mycelium` (3 map), thần Khuẩn Mẫu Tinh Quân. Chỉ 6 loài mang hệ Nấm (đúng gốc).

## Ba hệ của Cassette Beasts

`glass` (Thủy tinh), `plastic` (Nhựa), `glitter` (Kim tuyến), script `scripts/data-import/cb-elements-import.mjs` (nguồn `Data:Moves`, `Data:Species` của wiki, lưu ở `cb-elements-source.json`; chạy trước `element-reactions-import.mjs`).

- **Khắc hệ** theo bảng gốc, ô debuff = ×2, ô buff = ×0,5, ô biến hệ = ×1 (gốc là +30% / −23%, quy về thang Pokémon của game): Thủy tinh khắc điện, bị thường / thép / bay khắc. Nhựa khắc tâm linh / điện, kém với lửa, bị đất khắc, kháng điện. Kim tuyến không khắc và không bị khắc. Cặp với hệ chỉ game này có: ×1.
- **Loài theo gốc:** Glaistain (Thủy tinh); Weevilite, Binterloper, Traffikrab, Robindam, Lobstacle, Mascotoy, Mascotorn, Clocksley, Ratcousel (Nhựa): đổi `elementIds` thành đúng một hệ như gốc. Không loài nào mang sẵn Kim tuyến (như gốc); quái thành Kim tuyến qua phản ứng (Lấp lánh), sau này qua Bootleg (`bootleg.md`).
- **Chiêu nhập theo gốc** (đủ 27 chiêu của ba hệ, cùng power, accuracy): Crystal Lens, Glass Cannon, Silicon Slash, Bottle Volley, Window, Revolving Door, Glass Bonds, Glass Resistance, Glass Camouflage, Toy Hammer, Clockwork Mouse, Suction Cup Dart, Brick Blast, Plastic Knife, Plastic Coating, Plastic Wall, Traffic Jam, Recycle (`plasticRecycle`), Plastic Resistance, Plastic Camouflage, Spring-Load, Glitter Bomb, Sticker Trick, Prismatic, Glitter Resistance. Cơ chế tường, Booby Trap, skill bị động, Spring-Loaded, Glass Bonds ở `cassette-mechanics.md`. Quái cùng hệ học theo level; chiêu riêng loài (nhãn trùng tên loài: Traffic Jam, Spring-Load, Sticker Trick...) học ở level 36; loài Cassette Beasts có nhãn (`tags`) trùng chiêu thì học qua sách (`bookSkillIds`), như băng cassette của gốc ghép theo nhãn.
- **Đồ và chiêu theo hệ** (chép mẫu của hệ đá): Đá quý, Mảnh Tera, Pha Lê Z, Yêu Đan, Linh Thạch, Thức Tỉnh Đan + công thức luyện đan, dòng phụ linh, chiêu Max, Z-Move, thần thông, % chỉ số làm việc; có mặt trong bảng khai thác, rương bí cảnh, chợ đen.
- **Lệch gốc:** Brick Blast gốc 2 đòn × 40 lên cả đội gộp thành power 80 nhắm mọi địch; `glitterStorm` (power 120) là chiêu riêng của game vì thần thông cần đòn mạnh mà gốc chỉ có Glitter Bomb 30.
- **Map và thần:** theme `glassland` (Bờ biển Thủy tinh, Biển Cát Lớn, Đảo Murano; thần Lưu Ly Tinh Quân), `junkyard` (Vùng rác Thái Bình Dương, Bãi phế liệu Agbogbloshie; Khuôn Đúc Tinh Quân), `festival` (Lễ hội Rio, Lễ hội hóa trang Venice, Đại lộ Las Vegas; Lễ Hội Tinh Quân), `deities.md`. Hệ chủ đạo của theme: Thủy tinh + đá / đất / lửa; Nhựa + thép / độc / thường; Kim tuyến + tiên / tâm linh / thường (ít loài mang ba hệ mới nên map chủ yếu là loài hệ đi kèm).

## Dữ liệu

- `src/data/elementReactions.json`: `{ id, pairs: [{ attackElementId, defenderElementId }], effects }`. Các cặp cùng tên và cùng hiệu ứng gộp một mục để tên ở i18n `elementReactions` không lặp. Tra theo cặp qua `GameData.elementReactionIndex` (`elementReactionsOn`, `registries/elementReactions.ts`).
- Kiểm tra (`gameData/validateElementReactions.ts`): trường lạ, hệ không tồn tại, cặp trùng (cả giữa hai mục), ít nhất 1 cặp và 1 hiệu ứng, hiệu ứng timing `afterHits`, không chạy lên quái dùng (`userOnly`). Kiểm tra dữ liệu không ép đủ mọi cặp (dữ liệu là nguồn tham khảo, fixture không có); script nhập báo lỗi nếu thiếu cặp.
- Trường trạng thái mới: `skillTargetOverride` (`allEnemies` / `enemy`): đổi mục tiêu skill gây sát thương nhắm địch (đánh nhiều lần và skill tự nhắm kẻ vừa đánh giữ nguyên; `retargetedByStatus`); `conductsElement { elementId, percent }`: mỗi mục tiêu bị skill gây sát thương hệ đó trúng (của bất kỳ quái nào), quái mang trạng thái trên sân mất `percent`% max HP.

Script nhập: `scripts/data-import/element-reactions-import.mjs` (nguồn đã lưu ở `element-reactions-source.json`, `--fetch` tải lại `wiki.cassettebeasts.com/wiki/Data:Types`). Quy đổi nội dung ở mục "Dữ liệu phản ứng hệ" của `content-mechanics.md`.

## Trạng thái của phản ứng

Thời hạn 3 lượt như gốc. `battleOnly`. Số theo gốc: 2 bậc của gốc = −33% / +50%.

| Trạng thái      | Gốc                   | Tác dụng                                         |
| --------------- | --------------------- | ------------------------------------------------ |
| `extinguished`  | Melee / Ranged Atk ↓  | công, đặc công −33%                              |
| `potentiated`   | Melee / Ranged Atk ↑  | công, đặc công +50%                              |
| `eroded`        | Melee / Ranged Def ↓  | thủ, đặc thủ −33%                                |
| `bulkedUp`      | Melee / Ranged Def ↑  | thủ, đặc thủ +50%                                |
| `buried`        | Evasion, Speed ↓      | tốc độ −33%, không né được                       |
| `chilled`       | Accuracy Down         | accuracy −33%                                    |
| `disturbed`     | Berserk               | không dùng được skill trạng thái                 |
| `tipped`        | Contact Dmg Poison    | đòn vật lý trúng thì quái đánh mất 6,25% max HP  |
| `staticCharged` | Contact Dmg Lightning | đòn vật lý trúng thì quái đánh mất 6,25% max HP  |
| `shattered`     | Glass Shards          | đòn vật lý trúng thì quái đánh mất 10% max HP    |
| `healingMist`   | Healing Steam / Leaf  | hồi 10% max HP mỗi lượt                          |
| `conducted`     | Multitarget           | skill một địch đánh mọi địch (spread như thường) |
| `grounded`      | Unitarget             | skill mọi địch chỉ đánh một địch, accuracy −50%  |
| `conductive`    | Conductive            | `conductsElement` hệ điện, 8%                    |
| `energised`     | AP Boost              | +10 thể lực mỗi cuối lượt                        |
| `drained`       | AP Drain              | −10 thể lực mỗi cuối lượt                        |

Dùng lại trạng thái có sẵn: `poison`, `burn`, `seeded` (giới hạn 3 lượt như gốc qua `turns`), `flinch`, `agile` (Evasion Up), `protected` (cặp riêng Hộ thân của game); Air Wall là tường thật (`cassette-mechanics.md`); ở cặp riêng của game thêm `confused`, `feared`, `cursed`, `blind`, `vulnerable`.

**Trạng thái nhẹ** (chỉ cho ô trung tính, không có ở gốc): `softAttackDown` / `softAttackUp`, `softDefenseDown` / `softDefenseUp`, `softSpeedDown` / `softSpeedUp` (±15%), `softAccuracyDown` (accuracy −15%), `softRegen` (hồi 3% max HP mỗi lượt), `softBurn` (mất 3% max HP mỗi lượt).

## Lệch gốc

- **AP Boost / Drain:** quy đổi 1 AP = 10 thể lực: `energised` / `drained` ±10 thể lực mỗi cuối lượt (`stamina.md`).
- **Boss hoang không bị Resonance:** gốc hạ gục mọi mục tiêu ở lần thứ 3.
- **Contact Dmg:** gốc là đòn 20 power cả khi đánh lẫn khi bị đánh; đổi thành % max HP khi bị đánh theo hook `retaliateDamage` có sẵn (không phụ thuộc độ lớn chỉ số).
- **Ô trung tính có phản ứng:** gốc để trống, chủ project yêu cầu lấp đủ; dùng trạng thái nhẹ để không mạnh bằng ô khắc / kháng.

## Cặp không có ở bản gốc

Bảng 23 hệ = 529 cặp, 138 phản ứng. Theo thứ tự ưu tiên trong script (`element-reactions-import.mjs`):

1. **84 cặp gốc** (`element-reactions-source.json`).
2. **39 cặp đặt tay theo nghĩa** (`EXTRA_PAIRS`, `EXTRA_REACTIONS`; chủ project đồng ý 2026-11-03): hệ khắc (×2) ra debuff, bị kháng (×0,5 / 0) ra buff, trung tính chọn theo nghĩa; ngoại lệ theo nghĩa: rồng nung chảy thép (bỏng), bóng tối làm tiên tha hóa (biến hệ). Biến hệ riêng: ma đánh thường thành hệ ma (Hồn hóa), bóng tối đánh tiên (Sa đọa).
3. **Luật Kim tuyến của gốc mở rộng cho mọi hệ** (`coverGlitter`): đánh Kim tuyến thì nó thành hệ của đòn, Kim tuyến đánh quái khác thì quái đó thành Kim tuyến (Lấp lánh).
4. **Phần còn lại lấp theo hệ đánh và khắc hệ** (`FILL_BY_ATTACKER`, chủ project yêu cầu 2026-11-04): mỗi hệ đánh ba phản ứng theo chủ đề: khắc = debuff mạnh, bị kháng = buff nhẹ, trung tính = trạng thái nhẹ. Thêm hệ mới mà thiếu mục này thì script báo lỗi.
