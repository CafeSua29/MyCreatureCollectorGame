# Dấu ấn trên quái: sẹo, đột biến, thích nghi, ám ảnh, chiến tích

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03 (bổ sung cùng ngày: chỉ sẹo / đột biến khi phá bộ phận thì đơn điệu, làm thêm). Ý từ **Mewgenics** (đột biến theo bộ phận cơ thể, nhiều đột biến hai mặt lợi / hại, di truyền khi lai; thương tật và rối loạn tâm lý sau trận), nối với hệ **phá bộ phận** (`hit-locations.md`). Chủ đề "trải qua sinh tử thì mạnh lên": quái mang dấu vết của những trận đã qua, mỗi con một khác. Làm xong 2026-11-07 (bước 11c.4). Số là **số tạm** (`balance.json` khóa `marks`), chỉnh theo mô phỏng (mục "Mô phỏng").

Code: `model/marks.ts` (kiểu dữ liệu, `MarkConfig`, `MarkBattleRecord`, `MarkLogEntry`), `registries/marks.ts` (tra mục, `MARK_TARGETS`, `isMarkActive`, `markHookEntries` cho `ownHooks`: điểm duy nhất hỏi "dấu này đang làm gì"), `monster/marks.ts` (nhận / lên cấp / mất dấu, `rollPartMarkGain`, `advanceCountedMark`, di truyền `rollChildMarks`, dấu sẵn `rollSpawnMarks`, luân hồi `clearRebirthMarks`, lý lịch `noteMarkChanges`, kiểm tra save `checkMonsterMarks`), `battle/marks.ts` (ghi trong trận, `rollBattleMarks` lúc hết trận, `grantTribulationTrophy`), `progression/marks.ts` (Thầy thuốc `treatMark`), hiệu ứng vật phẩm `mutate` / `cureScar` (`registries/itemEffects.ts`), kết quả event `mutateParty` (`events/eventResults.ts`), kiểm tra dữ liệu `gameData/validateMarks.ts`, kiểm tra bản ghi trận `game/validateBattleExtras.ts` (`checkRecordMarks`).

## Năm loại dấu ấn

| Loại                      | Nghĩa                              | Tốt / xấu                                          | Nguồn chính                                                                               | Mất đi                                                             | Di truyền  |
| ------------------------- | ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| `scar` (sẹo)              | Thương tật vĩnh viễn ở một bộ phận | Xấu                                                | Bộ phận bị phá, chí mạng lớn, gục trong trận, trạng thái nặng, cấy ghép hỏng              | Thầy thuốc, Sinh Cơ Đan, luân hồi, hoặc tự **chai thành sẹo chiến** | Không      |
| `mutation` (đột biến)     | Bộ phận biến dạng                  | Tốt hoặc **hai mặt** (+ một chỉ số, − chỉ số khác) | Bộ phận bị phá (hiếm), thắng khi suýt chết, hiểm địa, event, Dị Biến Dịch, linh dịch, bẩm sinh | Chỉ Thầy thuốc bỏ theo ý người chơi                                | Có (25%)   |
| `adaptation` (thích nghi) | Cơ thể quen dần với thứ hay gặp    | Tốt                                                | Trúng đòn theo hệ, dính debuff, đánh trong thời tiết / địa hình                           | Không mất                                                          | Có (5%)    |
| `trauma` (ám ảnh)         | Nỗi sợ sau thất bại                | Xấu, chỉ khi gặp thứ gây ra nó                     | Gục nhiều lần dưới tay một loài / một hệ                                                  | **Vượt qua** (thành chiến tích), Thầy thuốc, luân hồi              | Không      |
| `trophy` (chiến tích)     | Huân chương của con quái           | Tốt, có thể theo đối tượng                         | Hạ boss, boss thế giới, hạ đủ quái một race, vượt ám ảnh, độ kiếp, sẹo chai lại           | Không mất                                                          | Không      |

## Dữ liệu

- `src/data/marks.json`, union theo `kind` (`MarkDef`), tên ở i18n `marks` (tên dấu theo đối tượng có `{target}`, UI thay bằng tên đối tượng). Phần chung: `id`, `kind`, `hooks` (hook trait, × hệ số cấp như trait cấp), `traitId?` (trait dấu cho, cấp = cấp dấu, không chiếm ô), `maxLevel?` (bỏ trống = không trần). Trường riêng:
  - `scar`: `partId`, `weight`, `statusIds?` (có = sẹo của trạng thái, không = sẹo vết thương), `hardensInto?` (chiến tích `hardened` cùng bộ phận).
  - `mutation`: `partId`, `weight`, `inheritPercent?` (bỏ trống = `mutationInheritPercent`).
  - `adaptation`: `target` (`element` / `status` / `weather` / `terrain`), `targetIds?` (giới hạn đối tượng), `threshold`, `inheritPercent?` (bỏ trống = `adaptationInheritPercent`).
  - `trauma`: `target` (`species` / `element`), `resolveInto` (chiến tích `resolve` cùng loại đối tượng).
  - `trophy`: `trigger` (`bossKill` / `worldBoss` / `raceKills` / `resolve` / `tribulation` / `hardened`), `target?` (`raceKills`: `race`; `resolve`: như ám ảnh), `threshold?` (chỉ `raceKills`), `partId?` (chỉ `hardened`).
- **Dấu theo đối tượng** (lệch roadmap: một mục cho cả loại đối tượng thay vì một mục mỗi đối tượng, vì "Sợ loài X" có hàng nghìn loài): quái lưu `targetId`; hook của mục viết chỗ giữ `$target`, thay bằng id đối tượng lúc gom hook (nhớ theo bộ dữ liệu). Loại đối tượng (`MARK_TARGETS`, một bảng): `element` (hệ), `status` (chỉ **debuff**), `weather` / `terrain` (môi trường lớp đó trừ mặc định), `species` (loài thường), `race`. Thay chỗ giữ dùng chung hàm `fillPlaceholders` với sticker (`$skill` / `$choice`).
- Hook theo đối tượng dùng điều kiện ngôn ngữ trait có sẵn và hai điều kiện mới (`trait-dsl.md`): `species { who, speciesIds }` (loài quyết định bộ phận của quái được xét: quái fuse là loài gốc) và `skillBodyPart { partIds }` (skill ra chiêu bằng bộ phận, `Skill.bodyPart`). Trong pha sát thương `other` = bên kia của đòn, nên dấu viết `who: 'other'` cho cả gây và nhận sát thương.
- Kiểm tra dữ liệu: trường lạ theo loại, bộ phận / trạng thái / trait / mục liên kết tồn tại, `$target` chỉ ở dấu theo đối tượng, hook kiểm bằng đối tượng mẫu đầu tiên của loại; `config.marks` tỉ lệ 0–100, ngưỡng nguyên ≥ 1.
- **Nội dung đầu** (2026-11-07, 36 mục; Claude soạn theo ví dụ của roadmap, chủ project duyệt danh sách và tên 2026-11-07, cùng event Suối Lạ / Quả Lạ, hai đan và ba thành tựu): sẹo vết thương mỗi bộ phận (Mù một mắt, Gãy sừng, Vết thương ngực, Tay bị thương, Què, Cánh rách, Đuôi cụt), sẹo trạng thái (Vết bỏng sâu ← bỏng, Vết độc ăn ← nhiễm độc nặng, Vết tê cóng ← đóng băng), đột biến (Mắt thứ ba, Sừng đá, Da đá, Phổi lửa, Tay thứ ba, Chân lò xo, Cánh dơi = trait Levitate, Đuôi kép; nhiều cái hai mặt), thích nghi (Quen hệ X tối đa cấp 10 vì giảm sát thương nhân dồn thành miễn nhiễm, Kháng X, Chịu thời tiết X, Quen địa hình X), ám ảnh (Sợ loài X, Sợ hệ X) và chiến tích vượt qua tương ứng, Kẻ hạ boss, Chiến binh diệt thế, Kẻ diệt race X, Thân qua thiên kiếp, Sẹo chiến mỗi bộ phận. Thêm nội dung chỉ cần thêm mục JSON.

## Ghi trong trận và tung lúc hết trận

Chỉ **quái của người chơi**, chỉ khi dữ liệu có mục dấu (không thì không ghi, không tung, không tốn RNG). Trong trận ghi vào `BattleRecord.marks` (`MarkBattleRecord`): `hitElements` (trúng đòn skill của địch theo hệ skill, mỗi đòn), `statuses` (dính debuff), `fields` (thời tiết / địa hình không mặc định lúc hết lượt khi đứng trên sân), `critWounds` (đòn chí mạng lấy ≥ `critScarHpPercent` % max HP: bộ phận bị nhắm, không nhắm = `critDefaultPartId`; loài đối thủ), `faintedBy` (loài kẻ hạ gục, hệ của đòn), `kills` (quái địch nó hạ: loài, race, hệ, có phải boss: trận boss và hệ số boss > 1).

Hết trận (`finish`, mọi kết quả, sau chấn thương), mỗi quái ta có bản ghi chạy các bước theo **thứ tự cố định** (tất định):

1. **Bộ phận bị phá** (`brokenParts`): mỗi bộ phận tung đột biến của bộ phận đó (`mutationOnBreakPercent` 0,5%), trượt thì tung sẹo vết thương ở đó (`scarOnBreakPercent` 8%).
2. **Chí mạng lớn**: mỗi vết tung sẹo ở bộ phận đó (`scarOnCritPercent` 2%).
3. **Gục trong trận** (một lần mỗi trận): sẹo vết thương ở bộ phận ngẫu nhiên (`scarOnFaintPercent` 3%).
4. **Trạng thái nặng còn lúc hết trận**: mỗi trạng thái có sẹo riêng tung `scarOnStatusPercent` (2%).
5. **Thắng khi suýt chết** (đã ra sân, còn sống, ≤ `nearDeathHpPercent` (5) % máu): đột biến (`mutationOnNearDeathPercent` 2%).
6. **Hiểm địa**: map có `markHazardPercent` (Biome, cả map hiểm địa): quái đã ra sân tung đột biến (mọi kết quả). Hiện có: Đầm độc / Bào tử hiểm địa 3%, Hiểm địa cổ đại / Cổng đầm lầy 2%, Chaos Wastes 3%, Skavenblight / Agbogbloshie 2%.
7. **Thích nghi** (không RNG): cộng bộ đếm `markCounters["<id>:<đối tượng>"]`; đủ `threshold × (cấp hiện tại + 1)` thì nhận / lên cấp và trừ phần đã dùng (ngưỡng tăng dần, không trần; tới `maxLevel` thì bỏ bộ đếm). Hiện: hệ 20 đòn, debuff 5 lần, môi trường 5 trận.
8. **Ám ảnh** (không RNG): mỗi lần gục dưới tay loài / hệ cộng bộ đếm; đủ `traumaThreshold` (3) thì nhận (đã có thì lên cấp) và đếm lại. **Thắng** trận mà không gặp lại đối tượng (không quái địch nào là loài đó / có hệ đó) thì bộ đếm giảm 1.
9. **Vượt qua ám ảnh**: đang sợ X mà chính quái đó hạ X thì cộng `resolveCount`; đủ `resolveThreshold` (3) thì xóa ám ảnh, nhận chiến tích `resolveInto` cùng đối tượng.
10. **Chiến tích**: mỗi boss quái hạ gục (không tính Thiên Kiếp) lên một cấp chiến tích `bossKill`; mỗi quái hạ cộng bộ đếm chiến tích `raceKills` theo race (ngưỡng tăng dần như thích nghi, hiện 50); thắng **boss thế giới** khi đã ra sân thì chiến tích `worldBoss`. **Độ kiếp thành công** (`awakening.md`) nhận chiến tích `tribulation` lúc phân thắng thua của độ kiếp.
11. **Sẹo chai thành sẹo chiến**: mỗi trận thắng đã ra sân, mọi sẹo có từ trước trận + 1 `winBattles`; đủ `scarHardenBattles` (100) thì mỗi trận thắng tung `scarHardenPercent` (10%) đổi sẹo thành `hardensInto`. Người chơi chọn: trả tiền chữa ngay, hay giữ sẹo chờ chai.

Mỗi thay đổi ghi log trận `markGained { monsterId, markId, targetId?, level, source }` / `markRemoved { ..., reason }` và mốc lý lịch.

## Nguồn ngoài trận

- **Quái hoang / boss / quái khu bảo tồn** sinh ra (tung sau cùng): `wildMarkPercent` (2%) mang sẵn một dấu, trong đó `wildMutationShare` (25%) là đột biến, còn lại là sẹo vết thương (bắt được quái có dấu sẵn). Quái NPC, trứng, Cây thần, quái khởi đầu không có.
- **Breeding** (`rollChildMarks`, tung sau các bước breeding cũ): mẹ rồi bố, mỗi đột biến / thích nghi tung % truyền của mục, **giữ cấp** của bố / mẹ; đột biến chỉ khi con có bộ phận đó và bộ phận chưa có đột biến (mẹ trước). Sau đó `birthMutationPercent` (1%) một đột biến bẩm sinh mới.
- **Dị Biến Dịch** (`mutagenElixir`, đan luyện cấp 6, chợ đen): hiệu ứng `mutate`, một đột biến ngẫu nhiên ở bộ phận quái có (không còn bộ phận nhận được thì không mất đan). **Sinh Cơ Đan** (`regenerationPill`, đan luyện cấp 4, chợ đen): hiệu ứng `cureScar`, chữa sẹo cấp cao nhất (cùng cấp: sẹo có trước). Dùng ngoài trận; `useItem` ghi lý lịch và log ngoài trận theo dấu thay đổi (`markChangesBetween`).
- **Event** (`events.md`): kết quả `mutateParty { count, chance }` (mỗi quái còn sống trong `count` quái đầu đội tung `chance` % đột biến); event "Suối Lạ" (uống: 30% hai quái đầu 50% đột biến / hồi máu / nhiễm độc) và "Quả Lạ" (ăn: 40% quái đầu đột biến / hồi máu / nhiễm độc), như ăn thứ lạ của Mewgenics.
- **Linh dịch** (`spirit-virus.md`): ngày quái chuyển sang miễn dịch tung `mutationOnVirusCurePercent` (10%) đột biến.
- **Cấy ghép thất bại** (`implant.md`) mà quái còn sống: tung `scarOnImplantFailPercent` (25%) sẹo ở `implantScarPartId` (thân).

## Luật chung

- Trường `Monster.marks: MarkInstance[]` (`{ markId, targetId?, level, origin: { source, floor, opponentSpeciesId? }, winBattles?, resolveCount? }`, theo thứ tự nhận) và `Monster.markCounters` (chỉ khóa đang dùng, nguyên ≥ 1). Mỗi bộ phận tối đa **một sẹo và một đột biến**: nhận dấu cùng id ở bộ phận đã có thì **lên cấp**, khác id thì không ra (giữ cái cũ; khi chọn ngẫu nhiên đã loại sẵn các mục không ra được). Dấu không theo bộ phận: mỗi cặp id + đối tượng một mục, nhận lại thì lên cấp. `origin` là lần nhận đầu.
- **Tính chỉ số / hook**: hook của dấu đang có tác dụng (và trait của dấu) đi qua `ownHooks` với nguồn hook `mark`, % chỉ số vào nguồn % mới `marks` (`stats-traits.md`). Hook theo đối tượng chỉ có tác dụng trong trận khi gặp đúng đối tượng (điều kiện của hook).
- **Bộ phận không còn** trong `monsterBodyPlan` (tiến hóa đổi race) thì dấu của bộ phận đó **giữ nhưng không có tác dụng** cho tới khi có lại.
- **Thầy thuốc** (NPC ở thị trấn, action `treatMark { monsterId, markId, targetId? }`): bỏ sẹo / đột biến / ám ảnh, giá `treatCostPerLevel` (500) × cấp × tầng cao nhất (`treatMarkCost`; chủ project duyệt 2026-11-07 thay cho giá cố định của roadmap, để giá giữ ý nghĩa ở tầng cao như cấy ghép); bỏ ám ảnh bằng tiền thì **không** nhận chiến tích vượt qua. Thích nghi / chiến tích không bỏ được (`markNotTreatable`). Mã lỗi: `markNotFound`, `markNotTreatable`, cùng các mã chung (`notInTown`, `inBattle`, `monsterNotOwned`, `notEnoughMoney`, quái đang làm việc). Log ngoài trận `markRemoved`.
- **Fuse**: quái gốc giữ dấu của mình, của quái phụ mất. **Luân hồi** (`rebirth.md`): xóa sẹo, ám ảnh và bộ đếm ám ảnh (thân xác mới), giữ phần còn lại, log ngoài trận. **Hiến tế / tiến hóa**: không ảnh hưởng dấu của quái chính.
- **Lý lịch** (`monster-history.md`): mốc `markGained { markId, targetId?, level, source, floor?, opponentSpeciesId? }` và `markRemoved { markId, targetId?, reason }`. Log ngoài trận `markGained` / `markRemoved` (`game-log.md`, cùng dạng `MarkLogEntry` với log trận và log event).
- **Thành tựu** (`achievements.md`): điều kiện `markIds { kind? }` (số loại dấu khác nhau trên quái đang sở hữu), `resolvedFears` (số chiến tích vượt nỗi sợ), `markLevel { kind? }` (cấp cao nhất); thành tựu Thân Đầy Dấu Ấn, Vượt Qua Nỗi Sợ, Dị Chủng (đột biến cấp cao).
- `MonsterView.marks` (`MarkView`): loại, đối tượng, bộ phận, cấp / tối đa, có tác dụng không, nguồn gốc, tiến độ chai sẹo / vượt nỗi sợ, giá Thầy thuốc theo tầng cao nhất của state (`MonsterPlace.highestFloor`; null = không bỏ được).
- **AI**: không đổi (dấu chỉ đổi chỉ số / hook).

## Save

Save `version: 113` (`state-versions.md`): `Monster.marks`, `Monster.markCounters` (migrate: rỗng cho mọi quái kể cả trong trứng); kiểm tra: mục tồn tại, đối tượng hợp lệ của loại, cấp nguyên ≥ 1 và ≤ `maxLevel`, không trùng cặp id + đối tượng, mỗi bộ phận tối đa một sẹo và một đột biến, `winBattles` chỉ ở sẹo, `resolveCount` chỉ ở ám ảnh, nguồn gốc đúng dạng, bộ đếm nguyên ≥ 1. `BattleRecord.marks` tùy chọn (id hệ / trạng thái / môi trường / bộ phận / race / loài tồn tại).

## Mô phỏng

Phần `progression` (`scripts/simulate/marks.ts`): dấu tự đến qua action thật; ở thị trấn "người chơi" chữa sẹo / ám ảnh của đội mẫu khi giá ≤ 5% tiền. Cột kinh tế `markTreat`, `scar/mon`, `mutation/mon`, `adapt/mon`, `trauma/mon`, `trophy/mon`, `markStat%` (% trung bình các chỉ số khác HP từ dấu của đội mẫu, lần đo cuối). Kết quả ở `simulation-features.md` mục "Dấu ấn".

## UI

Chưa có (UI làm sau cùng, `ui-overhaul.md`): danh sách dấu trên trang quái (theo bộ phận, dấu không có tác dụng làm mờ, tiến độ chai sẹo / vượt nỗi sợ), NPC Thầy thuốc ở thị trấn, báo log `markGained` / `markRemoved`, tên dấu theo đối tượng thay `{target}`.
