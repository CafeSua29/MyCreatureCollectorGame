# Cuồng bạo

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Frenzy của Dragon Quest Monsters: khi bị dồn vào đường cùng, quái **cuồng bạo**, mạnh hơn, có thể hành động thêm, và **quái có chủ thì mất điều khiển**. Bước 5p (2026-10-25). Số ở `balance.json` khóa `frenzy` (số tạm, chỉnh theo mô phỏng; `balance-content.md`).

## Ai cuồng bạo được (vai trò)

Một hàm duy nhất `frenzyRole(data, battle, { side, monster })` (`registries/frenzy.ts`):

| Vai trò                                  | Khi nào                                                                                                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wild` (quái hoang thường)               | phe địch, trận không có NPC (`battle.trainer === null`), không phải trận boss                                                                                                                         |
| `boss` (boss hoang)                      | như trên, trận boss (`battle.isBoss`)                                                                                                                                                                 |
| `tamed` (quái có chủ: người chơi, NPC)   | **chỉ khi race có `frenzyProne: true`** (race khó kiểm soát)                                                                                                                                          |
| `unbound` (quái người chơi chưa khế ước) | race khác, khi `contractRealm` null (chủ project chốt 2026-10-25: quái chưa khế ước khó điều khiển; quái NPC luôn đã khế ước nên không có); quái có chủ đã khế ước, race khác không bao giờ cuồng bạo |
| `worldBoss` (boss thế giới)              | phe địch trận boss thế giới (`battle.special.kind === 'worldBoss'`, `world-boss.md`); kích hoạt theo lượt (`fromTurn`)                                                                               |
| không có                                 | Thiên Kiếp (phe địch trận độ kiếp, `awakening.md`)                                                                                                                                                    |

- Chủ project chốt 2026-10-25: chỉ quái hoang luôn cuồng bạo được; quái đã bắt (người chơi, NPC) chỉ loài khó kiểm soát. Claude chọn theo race (dữ liệu, không viết cứng): **Rồng (`dragon`), Khủng long (`dinosaur`), Ác quỷ (`demon`), Khổng lồ (`giant`), Dị thể (`aberration`)**. Trường tùy chọn `frenzyProne` (boolean) của race, thiếu = không (`gameData/validateFrenzy.ts`). Quái người chơi race đó vẫn cuồng bạo trong trận độ kiếp.
- Số `unbound`: ngưỡng HP 25%, +15% công / đặc công, 10% hành động thêm (nhẹ hơn `tamed` 50% / 30% / 25%); như mọi quái người chơi cuồng bạo, mất điều khiển tới hết trận.
- Boss thế giới (bước 7f): vai trò `worldBoss`, cuồng bạo cố định từ lượt 5 (`fromTurn`, xem Kích hoạt), +30% công / đặc công, 25% hành động thêm (`world-boss.md`).

## Kích hoạt

Bước cuối cùng của cuối lượt (`frenzyAtTurnEnd`, `battle/frenzy.ts`; sau bước ngự thú sư): mỗi quái **còn sống trên sân** thỏa cả hai thì cuồng bạo, log `frenzy { monsterId }`:

- HP hiện tại ≤ ngưỡng % max HP (`roles.<vai trò>.hpThresholdPercent` + điểm % của trait, xem dưới; vai trò `wild` / `boss` cộng thêm điểm theo độ khó của trận, cả tỉ lệ hành động thêm, kẹp 0–100: `frenzyNumbers(data, role, difficulty)`, `challenge-modes.md`);
- **phe của nó đang thua**: tổng HP / tổng max HP **cả phe** (kể cả dự bị, `teamOf`) thấp hơn phe địch (bằng nhau không tính thua; so nhân chéo `Decimal`).

- **Kích hoạt theo lượt** (trường tùy chọn `fromTurn` của vai trò, nguyên ≥ 2; hiện chỉ `worldBoss` = 5): thay cho hai điều kiện trên, kích hoạt ở cuối lượt `fromTurn − 1` (cuồng bạo có tác dụng từ lượt `fromTurn`), không xét HP / phe thua (boss thế giới HP vô hạn). Trait chặn cuồng bạo (Điềm tĩnh) vẫn chặn; `hpThresholdPercent` của vai trò đó không dùng (để 0).

**Một lần mỗi trận, giữ tới hết trận**: ghi `'frenzy'` vào `BattleState.usedOnce` của quái (cùng chỗ với trait sống sót, `battle-traits.md`), giữ cả khi rời sân / gục / hồi sinh. Không đổi cấu trúc save (thêm giá trị hợp lệ cho `usedOnce`). Kỹ năng ngự thú sư không kích hoạt cuồng bạo.

## Hiệu ứng (tới hết trận)

| Vai trò | Ngưỡng HP | Công / đặc công | Hành động thêm mỗi lượt |
| ------- | --------- | --------------- | ----------------------- |
| `tamed` | 50%       | +30%            | 25%                     |
| `wild`  | 50%       | +15%            | 10%                     |
| `boss`  | 50%       | +20%            | 15%                     |
| `worldBoss` | từ lượt 5 | +30%        | 25%                     |

- **% công / đặc công** (`statPercent`) cộng vào tổng % ở bước trait (luật "mọi nguồn % chỉ cộng", nguồn % `frenzy` ở `stats-traits.md`): `MonsterBattleContext.frenzyStatPercent` → `forEachTraitHook` thêm một hook `statModifier` (nguồn hook `frenzy`). AI chấm sát thương đã tính vì đi qua `computeStats`.
- **Hành động thêm**: sau khi quái cuồng bạo dùng skill (`runSkillCommand`, kể cả quái người chơi), tung `extraActionChance` **một lần mỗi lượt cho mỗi quái** (`claimFrenzyRoll`, `actionQueue.ts`: tung ở lần dùng skill đầu tiên trong lượt, không tung lại ở hành động thêm hay hành động thêm do trait); trúng thì chèn ngay sau một hành động do **AI chung** chọn (không hợp kích), log `frenzyAction { monsterId }`. Quái lớn / thực thể hợp thể sau này cũng chỉ tối đa 1 (cùng id quái).
- **Mất điều khiển (quái người chơi)**: ô có quái cuồng bạo không nhận lệnh. `submitTurn` chỉ đòi lệnh cho các ô còn lại; gửi lệnh cho ô cuồng bạo báo `monsterFrenzied { monsterId }` (state giữ nguyên). Lúc giải lượt, AI chung chọn lệnh cho ô đó (không hợp kích; nên không đổi quái, không dùng vật phẩm, không biến hình). Chạy trốn thất bại vẫn để quái cuồng bạo hành động. `suggestBattleCommands` (tự đánh, mô phỏng) bỏ ô cuồng bạo và tắt hợp kích khi có ô cuồng bạo. Quái NPC / quái hoang vốn do AI đánh nên chỉ khác ở hiệu ứng.

## Trait

| Trait (id)  | Tên        | Hook                                   | Tác dụng                               |
| ----------- | ---------- | -------------------------------------- | -------------------------------------- |
| `rageBorn`  | Cuồng tính | `frenzyThresholdBonus { percent: 10 }` | ngưỡng HP + 10 điểm % (nhân cấp trait) |
| `composure` | Điềm tĩnh  | `frenzyImmune {}`                      | không bao giờ cuồng bạo                |

Hai trait cùng nhóm loại trừ `frenzy`, loại `positive`. Roadmap gọi trait ngưỡng là "Bất khuất", đổi tên thành Cuồng tính vì "Bất khuất" đã là tên của `defiant`. Ngưỡng sau trait: `frenzyThreshold` (`registries/frenzy.ts`; null = bị chặn).

## Kiểm tra dữ liệu

`gameData/validateFrenzy.ts`: `config.frenzy.roles` đủ ba vai trò, không trường lạ; `hpThresholdPercent` và `extraActionChance` trong [0, 100], `statPercent` là số; `frenzyProne` của race là boolean nếu có. Fixture test đặt ngưỡng 0 (không bao giờ kích hoạt) để test cũ không đổi; test cuồng bạo ở `battle/frenzy.test.ts` tự đặt số.

## Mô phỏng

Cột `frenzyPlayer` / `frenzyEnemy` (số quái cuồng bạo trung bình mỗi trận) ở `floors.csv`; biến thể A/B `noFrenzy` (mọi ngưỡng và số về 0) ở `scenarios.json`. Kết quả ở `balance-content.md`.
