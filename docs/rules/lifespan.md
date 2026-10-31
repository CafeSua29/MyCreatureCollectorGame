# Tuổi, thọ nguyên và đồng hồ game

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như truyện tu tiên / ngự thú: mỗi quái có **tuổi** và **thọ nguyên** (tuổi thọ tối đa). Hết thọ nguyên thì **tọa hóa** (chết hẳn) và để lại **hồn phách** (ấp thành trứng truyền thừa hoặc luyện hồn khí, `soul-relics.md`). Thọ nguyên tăng theo level, boss, trait và **Thọ Nguyên Đan**. Mọi số là **số tạm** trong `balance.json` (khóa `clock`, `lifespan`; script mô phỏng tự chỉnh theo `simulation.md`). Bước 5c (2026-10-23).

Code: `registries/lifespan.ts` (điểm duy nhất của thọ nguyên / tuổi / giai đoạn tuổi, registry `LIFESPAN_MODIFIERS`), `registries/lifespanTraitHooks.ts` (hook `lifespanPercent`), `monster/life.ts` (trường tuổi của quái mới, kiểm tra; xuất lại hàm thọ nguyên cho bên ngoài core), `progression/time.ts` (đồng hồ, `advanceTime`, `DAILY_TASKS`), `progression/gameOptions.ts` (bật / tắt, `options.md`), `progression/oldAge.ts` (việc theo ngày: già đi, tọa hóa), `monster/soul.ts` (`dieForever`), `progression/eggs.ts` (`createLegacyEgg`), `game/validateTimeState.ts`, `gameData/validateLifespan.ts`.

## Đồng hồ game

- `GameState.time`: số **giờ** game (số nguyên an toàn ≥ 0), giờ thường **24 giờ một ngày** (`HOURS_PER_DAY` ở `model/time.ts`). Ngày = ⌊`time` / 24⌋ (`dayOf`), giờ trong ngày = `time mod 24` (`hourOf`), cả hai ở `model/time.ts`. Game mới bắt đầu ở `clock.startHour` (6 giờ sáng ngày 0).
- **Việc tốn giờ** (`clock.hours`, số tạm): trận quái hoang 2 giờ, trận boss 4 giờ (tính khi `leaveBattle`, mọi kết quả thắng / thua / chạy), đi lại `travel` 1 giờ (đứng yên ở thị trấn thì không tính), NPC hồi máu 1 giờ, cả lượt vào khu bảo tồn 24 giờ (`safari`, tính lúc ra khu; `safari-zone.md`), mỗi bước khám phá hiểm địa không mở trận 1 giờ (`zoneStep`; `zones.md`), **nghỉ (`rest`) là ngủ tới `clock.wakeHour` (6 giờ) sáng kế tiếp** (`hoursUntilWake`, luôn ≥ 1 giờ). Thao tác menu (cửa hàng, breed, fuse, lắp đồ, đổi đội, dùng vật phẩm...) không tốn giờ.
- Điểm duy nhất cho thời gian trôi: `advanceTime(data, state, hours)` (reducer gọi sau action tốn giờ). Mỗi lần qua nửa đêm chạy mọi việc theo ngày trong registry **`DAILY_TASKS`** theo thứ tự (hiện có `aging`, `market`: hồi giá thị trường, `world-items.md`; `imprint`: yêu cầu / chốt dưỡng dục, `imprinting.md`; `garden`, `expeditions`, `beastTide`; `safari`: làm mới danh sách loài khu bảo tồn, `safari-zone.md`; `soulLink`: ngày khế ước của quái, `tamer.md`; `spiritVirus`: bớt ngày linh dịch của quái ở đội, `spirit-virus.md`). Mục sau có việc theo ngày (đấu giá, linh điền, thám hiểm...) thêm một mục vào `DAILY_TASKS`, không sửa `advanceTime`.
- `GameState.dayEvents`: sự kiện của **lần trôi thời gian gần nhất** (mỗi lần `advanceTime` thay mới, không qua ngày thì rỗng) để UI báo người chơi: `diedOfOldAge { monsterId, speciesId, nickname }` (hồn phách id = `monsterId`), `legacyEggHatched { monsterId }`, `monsterAutoJoined { monsterId }`, `nearingLifespanEnd { monsterId, yearsLeft (Decimal) }`, `imprintRequest { monsterId, request }`, `imprintFinished { monsterId, percent }` (`imprinting.md`). Mục sau thêm loại sự kiện vào union `DayEvent` (TypeScript báo nơi kiểm tra save cần thêm trường).
- **Quy ước đồng hồ (chủ project chốt):** việc **theo thời gian** dùng ngày / giờ của đồng hồ này (đổi hàng Phòng Thí Nghiệm, linh điền, thám hiểm, động phủ, giải đấu, đấu giá, thú triều, ngày đêm và mùa...); việc **gắn với chiến đấu** giữ đếm theo trận (trứng nở theo trận thắng, thời hạn modifier của event, thời hạn linh thực, trọng thương). Mục mới chọn đúng một trong hai, không thêm bộ đếm thứ ba. Việc mới tốn thời gian (câu cá, bí cảnh...) thêm một mục vào `clock.hours` (`TIMED_ACTIVITIES`). Thời khắc, mùa, tuần trăng suy từ đồng hồ này: `calendar.md`.

## Bật / tắt thọ nguyên

- Theo từng game: `GameState.options.lifespanEnabled` (**mặc định tắt**, chủ project chốt 2026-10-31; chọn ở game mới `createNewGame({ lifespanEnabled })`; đổi bất cứ lúc nào ngoài trận bằng action `setGameOption { option: 'lifespanEnabled', enabled }`). Luật chung của tùy chọn luật chơi ở `options.md`.
- Mỗi quái mang cờ **`aging`** luôn bằng `options.lifespanEnabled` (đổi cùng lúc cho đội, kho, quái trong trứng; quái sinh ra lấy theo state: `FloorSite.aging`, `MonsterRollSpec.aging`; `validateGameState` kiểm tra khớp). Nhờ vậy hiệu ứng tuổi tính được từ chính quái (không cần state), max HP như nhau ở mọi nơi (giống `battleMaxHpDelta`).
- **Khi tắt:** tuổi đứng yên (`ageDays` không tăng), không có giai đoạn tuổi (chỉ số / EXP như thành niên), không tọa hóa, không cảnh báo, breeding không xét tuổi, fuse không hấp thu thọ nguyên, `MonsterView.life` = `null`. Bật lại thì tuổi chạy tiếp từ chỗ cũ (không cần dịch ngày). Thọ Nguyên Đan không có trong cửa hàng / bảng rơi (món đang có vẫn giữ, dùng vẫn cộng năm). Đồng hồ vẫn chạy.
- Bật / tắt làm max HP đổi (ấu niên, lão niên): quái đang sống không bị gục, còn ít nhất 1 máu (`keepAlive` ở `monster/hp.ts`).

## Trên quái

- `ageDays`: tuổi tính bằng ngày (số nguyên an toàn ≥ 0), "nguyên liệu" như `exp`: `aging` thì +1 mỗi ngày game cho quái đang sở hữu (đội, kho); trứng chưa nở không tăng. Tuổi (năm) = `ageDays` / `lifespan.daysPerYear` (10 ngày một năm).
- `aging` (xem trên), `maxLevelReached` (level cao nhất từng đạt, nguyên ≥ 1, chỉ tăng trong `gainExp`), `lifespanBonusYears` (`Decimal` ≥ 0: năm cộng thêm từ đan, fuse), `itemUseCounts` (số lần đã dùng theo id vật phẩm có hiệu ứng giảm dần, dùng chung cho mọi vật phẩm kiểu này sau này: thiên tài địa bảo...).

## Thọ nguyên

- **Thọ nguyên gốc của loài:** trường `lifespan` (năm, nguyên ≥ 1) trong `species.json`, bắt buộc với loài thường (kể cả dạng vùng / dạng khác), **cấm** với dạng chỉ có trong trận (`BATTLE_FORM_KINDS`: Mega, gmax, battleOnly). Lấy theo `baseSpeciesId` (quái fuse dùng loài của quái gốc; tiến hóa đổi loài nên thọ nguyên đổi theo). Số ban đầu tính theo công thức (chủ project sửa từng loài trực tiếp trong JSON): `20 + max(0, tổng chỉ số gốc − 150) × 0,2`, × race (côn trùng 0,6; thực vật 1,5; khoáng 2; thủy 1,2; bò sát 1,4; khủng long 1,2; rồng 4; linh / undead / quỷ 3; nguyên tố 2,5; thiên thần 5; thần 8; khổng lồ 2; elf 5; dwarf 2,5; halfling 1,3; orc 0,8; shapeshifter / aberration 2; còn lại 1), × `origin` (fantasy 1,2; cryptid 1,5; myth 2; còn lại 1), × độ hiếm (`catchRate` ≤ 5: ×3; ≤ 12: ×1,5), làm tròn (dưới 100: bội 5; dưới 1000: bội 10; còn lại bội 100; tối thiểu 10).
- **Thọ nguyên của quái** (`lifespanYears`, năm, `Decimal`, không trần):

  ```
  lifespan(loài gốc) × (1 + max(level, maxLevelReached) × levelPercent / 100) × tích LIFESPAN_MODIFIERS + lifespanBonusYears
  ```

  - `levelPercent` = 1 (level 100 → ×2). Dùng level cao nhất từng đạt để luân hồi / phi thăng reset level không làm thọ nguyên tụt.
  - **Registry `LIFESPAN_MODIFIERS`** (mỗi nguồn một hàm trả hệ số nhân): `boss` (× `bossMultiplier`), `traits` (tổng hook `lifespanPercent` của mọi nguồn hook trait, nhân cấp; trait **Trường thọ** `longevity` +20%, **Đoản mệnh** `shortLived` −20%, cùng nhóm loại trừ `lifespan`), `contract` (quái đã khế ước × (1 + (`tamer.contract.baseLifespanPercent` + `contractRealm` × `tamer.lifespanPercentPerRealm`) / 100), chưa khế ước × 1, cảnh giới khế ước của quái, `tamer.md`), `awakening` (× `awakening.lifespanMultiplier ^ tầng thức tỉnh`, `awakening.md`). Hệ số trả `number | Decimal`, `lifespanYears` nhân bằng `Decimal` (hệ số lớn vô hạn không ra `Infinity`). `humanForm` (× `humanForm.lifespanMultiplier` khi đã hóa hình, `human-form.md`). `bond` (× `bond.lifespanMultiplier` khi là bản mệnh thú, `tamer.md`). `bloodline` (huyết mạch chính pha thọ nguyên loài tổ, chỉ tăng; `bloodline.md`).

- `MonsterView.life` (`null` khi tắt): `ageYears` (làm tròn xuống), `lifespanYears`, `percentLived`, `stage`, `yearsLeft`, `nearingEnd` (≥ `warnPercent`).

## Giai đoạn tuổi (theo % thọ nguyên đã sống, tính theo ngày)

| Giai đoạn  | Khoảng | Hiệu ứng (số tạm)                                                                              |
| ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| Ấu niên    | < 10%  | mọi chỉ số −15% (kể cả max HP), EXP nhận +50%, **không breed được** (`tooYoungToBreed`)        |
| Thành niên | 10–70% | bình thường                                                                                    |
| Lão niên   | ≥ 70%  | mọi chỉ số giảm tuyến tính từ 0% (ở 70%) tới −30% (ở 100%, kẹp), EXP nhận −30%; vẫn breed được |

- % chỉ số là nguồn **`age`** trong `STAT_PERCENT_SOURCES` (cộng vào tổng % ở bước áp trait, mục "Thứ tự tính chỉ số" ở `stats-traits.md`). Max HP tụt vì già đi thì quái đang sống còn ít nhất 1 máu (`keepAlive`).
- EXP: nhân cùng hệ số trait EXP của quái khi thắng trận (`expWithTraits` ở `battle/outcome.ts`).
- Thọ nguyên tăng (lên level, đan) thì quái "trẻ lại" về %, ví dụ lão niên uống đan về thành niên.

## Thọ tận

- Việc theo ngày `aging` (`ageOneDay`): mỗi quái `aging` trong đội / kho +1 ngày tuổi; tuổi (ngày) ≥ thọ nguyên (ngày) thì **tọa hóa**: rời đội / kho, log `diedOfOldAge`, `dieForever` (đồ đang lắp / đồ cầm / đá Mega về túi, **hồn phách** vào túi với `cause: 'oldAge'`; `soul-relics.md`). Không tự tạo trứng: người chơi ấp hồn phách thành **trứng truyền thừa** hoặc luyện hồn khí ở NPC luyện đan (luật trứng truyền thừa ở `soul-relics.md`). Chỉ xét khi thời gian trôi, không bao giờ giữa trận.
- **Cảnh báo:** % đã sống vượt `warnPercent` (90%) trong ngày vừa qua (so trước / sau cùng một thọ nguyên) thì log `nearingLifespanEnd`. Thọ nguyên tụt giữa hai ngày (nhận trait Đoản mệnh) làm quái nhảy qua mốc thì không cảnh báo (chủ project chấp nhận).
- **Đội không trống** (`refillEmptyParty`, dùng chung với chết thật, `options.md`): quái cuối cùng trong đội tọa hóa thì quái **level cao nhất** trong kho (bằng level lấy con đứng trước) tự vào đội (`monsterAutoJoined`); kho cũng trống thì **hồn phách mới nhất** tự ấp thành trứng truyền thừa và nở ngay vào đội (`legacyEggHatched`; bắt đầu dưỡng dục như mọi quái nở, `imprinting.md`).

## Tuổi khi xuất hiện

- Quái hoang: random theo ngày trong 10–40% thọ nguyên; boss: 30–80% (thọ nguyên đã nhân `bossMultiplier`). Tung **sau cùng** khi sinh quái (`rollSpawnAge` ở `world/encounter.ts`, sau cả hệ số boss và trường biến hình), nên không đổi các giá trị random phía trước. Khi tắt thọ nguyên: lấy giữa khoảng, không tốn RNG.
- Quái khởi đầu: 10% (cố định, không tốn RNG; `rollStarters` nhận cờ thọ nguyên, mặc định tắt như game mới). Con breeding, trứng boss, trứng truyền thừa: tuổi 0 lúc nở. Tuổi theo % làm tròn **lên** (`ageDaysAtPercent`) để đạt đúng mốc (quái khởi đầu 10% là thành niên), kẹp ở số nguyên an toàn.
- **Breeding:** bố hoặc mẹ ấu niên thì `breedBlocker` trả `tooYoungToBreed`. Con nhận cờ `aging` của mẹ.
- **Fuse:** quái gốc giữ tuổi và nhận `fuseAbsorbPercent` (25%) **số năm còn lại** (`yearsLeft`) của quái phụ vào `lifespanBonusYears` ("hấp thu thọ nguyên"); tắt thọ nguyên thì không hấp thu.

## Thọ Nguyên Đan

- Vật phẩm `consumable` (dùng ngoài trận, lên quái ta), hiệu ứng `addLifespan { years }` cộng vào `lifespanBonusYears`. **Kháng đan:** × `pillResistance`^(số lần đã dùng đúng loại đan đó trên quái) (0,8). Hiệu ứng có `countsUses` thì mỗi lần dùng có tác dụng đếm +1 vào `itemUseCounts[id vật phẩm]` (một lần mỗi lần dùng, `ItemEffectContext.useCount` = số lần trước đó).
- Đan có `requiresOption: "lifespanEnabled"` (trường chung của item có giá, `isItemOffered`): chỉ vào cửa hàng và bảng rơi khi bật thọ nguyên. Giá nhân tầng như mọi item.

| Đan (`id`)                                  | + năm | Giá gốc | Nguồn hiện có                            |
| ------------------------------------------- | ----- | ------- | ---------------------------------------- |
| Tiểu Thọ Nguyên Đan (`lesserLongevityPill`) | 5     | 300     | cửa hàng (trọng số 10), mọi boss rơi 10% |
| Trung Thọ Nguyên Đan (`longevityPill`)      | 25    | 2.000   | cửa hàng (trọng số 2), mọi boss rơi 3%   |
| Đại Thọ Nguyên Đan (`greaterLongevityPill`) | 100   | 15.000  | boss tầng rơi 5%                         |
| Vạn Thọ Đan (`myriadLongevityPill`)         | 500   | 100.000 | **chưa có nguồn**                        |

- Bảng rơi: `lifespan.bossDrops` (mọi boss) và `lifespan.floorBossDrops` (thêm khi boss là boss tầng của map), tung sau bảng rơi của biome / boss.
- Chợ đen (`events.md`): Đại Thọ Nguyên Đan, Vạn Thọ Đan trọng số rất thấp (chỉ khi bật thọ nguyên). Chưa có (chờ): công thức luyện cả 4 đan (chờ "Luyện đan", `alchemy.md`).

## Kiểm tra

- Quái (`checkLifeFields`): `ageDays` nguyên ≥ 0, `aging` boolean, `maxLevelReached` nguyên ≥ 1, `lifespanBonusYears` `Decimal` ≥ 0, `itemUseCounts` object: id vật phẩm tồn tại, số lần nguyên ≥ 1.
- State (`validateTimeState`): `time` nguyên ≥ 0; `options` (`options.md`); `dayEvents` danh sách sự kiện đúng loại, đủ trường; `aging` của mọi quái (đội, kho, trứng, quái trong trận) bằng `options.lifespanEnabled`.
- Dữ liệu (`checkLifespanData`): `lifespan` của loài (trên); `clock.startHour` / `wakeHour` giờ nguyên 0–23, `clock.hours` nguyên ≥ 0 cho đủ `TIMED_ACTIVITIES`; `lifespan.*` trong khoảng hợp lệ (`oldFromPercent` ≤ 99, khoảng tuổi `min ≤ max` trong [0, 100], `pillResistance` trong [0, 1]), bảng rơi như bảng rơi biome. `requiresOption` của item phải là một tùy chọn trong `GAME_OPTION_FLAGS`.
