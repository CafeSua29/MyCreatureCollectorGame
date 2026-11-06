# Độ khó và chế độ thử thách

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Tùy chọn **theo từng game**, lưu trong `GameState.options` cạnh công tắc thọ nguyên / chết thật (`options.md`). Bước 12c, 2026-11-03. Số là **số tạm** (`balance.json`, khóa `challenge`).

Code: `model/challenge.ts` (`DIFFICULTIES`, `CHALLENGE_MODES`, `ChallengeOptions`, `ChallengeState`), `registries/challenge.ts` (điểm duy nhất: `difficultyNumbers`, `difficultyRank`, `hasChallengeMode`, `isNuzlockeDupe`, `randomizedSpeciesId` / `randomizeEncounters`), `progression/gameOptions.ts` (`setDifficulty`, `assertNotGameOver`, `defaultGameOptions`), `battle/nuzlocke.ts` (`nuzlockeAreaOf`, `claimNuzlockeEncounter`, `nuzlockeCaptureError`, `spendNuzlockeEncounter`), `world/encounter.ts` (`withDifficulty`, `enemyRollSpec`), `game/save.ts` (`canSaveManually`, `canLoadSave`, `reseedState`), `game/validateChallengeState.ts`, `gameData/validateChallenge.ts`.

## Trong state

- `options`: `difficulty`, `lowestDifficulty` (mức thấp nhất từng dùng), `nuzlocke: { dupesClause } | null`, `hardcore: boolean`, `randomizer: { seed, learnsets } | null`.
- `challenge`: `{ nuzlockeAreas: string[], gameOver: boolean }`.
- `battle.difficulty` (độ khó lúc mở trận), `battle.nuzlockeEncounter` (trận là lượt gặp Nuzlocke còn bắt được).
- Game mới chọn ở `createNewGame({ difficulty, nuzlocke, hardcore, randomizer })` (bỏ trống = Thường, không chế độ; lựa chọn sai dạng `malformedAction`). `createGameState` (test / mô phỏng) nhận `challengeOptions`. Nuzlocke / Hardcore / Randomizer **không đổi được sau khi tạo game**.

## Độ khó

- 4 mức `easy` / `normal` / `hard` / `nightmare` (Dễ / Thường / Khó / Ác mộng). Số ở `config.challenge.difficulties.<mức>`:

| Mức     | levelPercent | geneMultiplier | frenzyThresholdPercent | frenzyExtraActionPercent | rewardPercent | expPercent |
| ------- | ------------ | -------------- | ---------------------- | ------------------------ | ------------- | ---------- |
| Dễ      | −10%         | ×0,7           | −10                    | −5                       | −20           | +25        |
| Thường  | 0            | ×1             | 0                      | 0                        | 0             | 0          |
| Khó     | +10%         | ×1,3           | +10                    | +5                       | +20           | −17        |
| Ác mộng | +20%         | ×1,8           | +20                    | +10                      | +50           | −30        |

- **Lệch roadmap** (theo mô phỏng 2026-11-03, `simulation-features.md` mục "Độ khó"): roadmap ghi level địch **+5 / +10 cố định** và **một % thưởng chung cho cả EXP**. Mô phỏng cho thấy cả hai làm độ khó gần như không có tác dụng: +5 / +10 nhạt dần theo tầng (game không trần level), và quái level cao tự cho thêm EXP (EXP theo level², đường cong EXP level³) cộng +% thưởng bù đúng phần khó thêm, nên chơi liên tục ở Khó / Ác mộng không chậm hơn Thường. Đổi thành **% level** và **`expPercent` riêng** bù phần EXP tự tăng (EXP mỗi trận gần như Thường: Khó 1,1² × 0,83 ≈ 1, Ác mộng 1,2² × 0,7 ≈ 1, Dễ 0,9² × 1,25 ≈ 1); tiền / đồ rơi vẫn +20 / +50% làm phần thưởng của độ khó. **Ác mộng không bắt buộc qua được** (chủ project chốt 2026-11-03).

- **Level / gen quái địch** (lúc sinh, qua `FloorSite.difficulty` do `floorSite` đặt từ `options`): quái hoang, boss ngẫu nhiên, boss tầng, quái câu cá / khai thác, đội ngự thú sư NPC (mọi chế độ trận), trận event / hiểm địa / bí cảnh dùng `FloorSite`. Level × (1 + `levelPercent` %) (hai đầu khoảng, làm tròn, tối thiểu 1), khoảng gen × `geneMultiplier`. **Không áp**: Thiên Kiếp (độ kiếp theo level quái), boss thế giới (sinh tất định theo lịch, chung mọi game), quái NPC trao đổi, quái event tặng, trứng, gacha, khu bảo tồn (không phải quái địch).
  - Gen cao hơn làm quái bắt được ở Khó / Ác mộng cũng tốt hơn (tư chất cao hơn): là phần thưởng của độ khó, cố ý.
- **Cuồng bạo** (`frenzyNumbers(data, role, difficulty)`): vai trò `wild` / `boss` cộng `frenzyThresholdPercent` vào ngưỡng HP và `frenzyExtraActionPercent` vào tỉ lệ hành động thêm (kẹp 0–100); vai trò khác (quái có chủ, boss thế giới) không đổi. Theo `battle.difficulty`.
- **Thưởng**: `rewardPercent` (tiền, tỉ lệ đồ rơi) và `expPercent` (EXP) **cộng** với % của độ bất ổn rồi nhân một lần cho trận thắng (`battleRewardMultiplier` ở `battle/outcome.ts`).
- Đổi **bất cứ lúc nào ngoài trận**: action `setDifficulty { difficulty }`. Lỗi: `inBattle`; đúng mức đang chơi `difficultyUnchanged { difficulty }`; mức lạ `malformedAction`. Xuống thấp hơn `lowestDifficulty` thì ghi mức mới (thành tựu theo độ khó đọc mức này).

## Nuzlocke

- Ép bật chết thật (`permadeathEnabled`, luật ở `options.md`): `setGameOption` tắt nó báo `nuzlockeLocked { option }`.
- **Lượt gặp mỗi khu**: khu = `floor:<tầng>` cho trận trên tầng (quái hoang, boss, câu cá / khai thác, event, thú triều) hoặc `zone:<id>` cho hiểm địa (`nuzlockeAreaOf`). Trận ngự thú sư NPC, độ kiếp, bí cảnh / tháp, trận không bắt được quái (luật `canCapture` của trận đặc biệt) không có khu: không bắt / thu phục được gì.
  - Lúc mở trận (`openBattle` → `claimNuzlockeEncounter`): khu chưa dùng mà trận có ít nhất một quái hợp lệ thì trận là **lượt gặp** của khu (`battle.nuzlockeEncounter = true`, khu vào `challenge.nuzlockeAreas`, log trận `nuzlockeEncounter { area }`). Khu thành đã dùng ngay, **bắt được hay không** (chạy, hạ, trượt bóng đều mất lượt) như luật Nuzlocke gốc.
  - Trong lượt gặp được bắt / thu phục **một** quái hợp lệ: ném bóng, Thị Uy, xin theo sau trận / boss quy phục. Bắt xong thì `nuzlockeEncounter = false`. Lệnh bắt khi không được: `nuzlockeAreaUsed { area }` (lúc nhập lệnh); con trước cùng lượt vừa bắt thì bóng / Thị Uy sau không có tác dụng, không mất bóng (log `nuzlockeBlocked`). Xin theo chỉ tung cho quái bắt được.
- **Dupes clause** (`nuzlocke.dupesClause`, màn Game mới mặc định bật): quái thuộc **chuỗi tiến hóa** có loài đã từng sở hữu (Dex `owned`, kể cả đã chết) không tính là lượt gặp (trận toàn quái trùng không làm mất lượt của khu) và không bắt được (`nuzlockeDupe { speciesId }`).
- **Khu bảo tồn**: mỗi lượt vào khu bắt được một con (`nuzlockeVisitUsed`), cũng theo dupes clause.
- **Không giới hạn**: trứng (breeding, rơi, gacha), quà event, trao đổi NPC, đấu giá (như luật quà của Nuzlocke phổ biến).
- **Thua game**: đội trống sau khi quái chết hẳn mà **kho cũng trống** thì `challenge.gameOver = true` (log `gameOver`, trong trận hoặc ngoài trận khi tọa hóa), không có trứng truyền thừa cứu (`refillEmptyParty`). Sau đó mọi action báo `gameOver`, trừ `leaveBattle` (rời trận vừa kết thúc); save chỉ còn xem. Kho còn quái thì quái level cao nhất vào đội như thường.

## Hardcore

- **Không lưu tay**: main từ chối `writeManualSave` khi tóm tắt save là Hardcore (`canSaveManually`); nút Lưu báo lỗi. Nhập save Hardcore từ file ghi thành bản tự lưu.
- **Chỉ mở được save mới nhất** của game (`canLoadSave`, main `readSave` kiểm theo danh sách save của game): chặn tải lại bản tự lưu cũ để thử lại fuse / cấy ghép.
- **Không đổi seed khi mở** (`reseedState` giữ nguyên): mở lại rồi làm cùng action ra cùng kết quả, kể cả tắt app giữa trận (về trước trận, đánh lại ra đúng diễn biến cũ nếu ra cùng lệnh).
- Tóm tắt save có `challenge: { difficulty, nuzlocke, hardcore, randomizer, gameOver }` (`summarizeState`; summary thiếu phần này là dạng cũ → null).

## Randomizer

- Bảng ánh xạ **loài → loài** tất định theo `options.randomizer.seed` (game mới: suy từ seed game, `randomizerSeed`): loài của Dex (trừ dạng chỉ có trong trận, trừ Thiên Kiếp) xếp theo tổng chỉ số gốc (bằng nhau theo id), chia **bậc mỗi `config.challenge.randomizer.tierSize` loài liền nhau** (tạm 50), xáo trong từng bậc (hoán vị: mỗi loài một loài đích). Tính một lần mỗi (dữ liệu, seed) rồi nhớ.
- Áp lúc sinh quái, **không sửa JSON**: quái hoang thường (cả trận event / hiểm địa), quái câu cá / khai thác, quái NPC trao đổi và quái event tặng (quà). Trọng số gặp giữ theo loài gốc.
- **Lệch roadmap**: boss (ngẫu nhiên và boss tầng) **giữ loài**, vì đồ rơi / môi trường riêng của boss và việc hạ boss tầng mở tầng sau tra theo loài; đội ngự thú sư NPC giữ bảng loài theo lớp (không phải quái hoang).
- **Xáo learnset** (`randomizer.learnsets`, chọn lúc tạo game: `createNewGame({ randomizer: { learnsets } })`): mỗi loài học theo learnset của **loài cho** `learnsetDonorId` (hoán vị riêng trong cùng bậc tổng chỉ số gốc như bảng loài, seed trộn hằng nên khác bảng loài; loài ngoài bảng giữ learnset của mình). Chỉ đổi learnset; `bookSkillIds` (sách / TM), chiêu trứng, phần khác của loài giữ nguyên.
  - Làm bằng **dữ liệu của game** `gameDataFor(data, state)` (`registries/challenge.ts`, điểm duy nhất): bản sao `data.species` có learnset đã xáo, tính một lần mỗi (dữ liệu, seed) rồi nhớ. `gameReducer` dùng nó cho mọi action, nên mọi chỗ tra learnset (quái hoang / boss / NPC sinh ra, lên level, tiến hóa, phản tổ, học lại skill, rơi sách, sách học được theo chuỗi...) tự theo bảng xáo, không phải truyền `options`. **UI / script gọi thẳng hàm core có tra learnset** (skill sẽ học, học lại) phải truyền `gameDataFor(data, state.options)`; kiểm tra save / dữ liệu vẫn dùng dữ liệu gốc.
  - Quái khởi đầu sinh từ dữ liệu gốc (màn chọn hiện đúng con sẽ nhận); từ lần lên level đầu tiên học theo bảng xáo.
  - Trait quái hoang không xáo thêm: vốn đã random từ toàn bộ pool trait.

## Thành tựu

- Điều kiện `challengeFloor { difficulty?, modes? }` (`achievements.md`): tiến độ = tầng cao nhất khi `lowestDifficulty` không dễ hơn `difficulty` và game đang chơi đủ mọi chế độ trong `modes` (`nuzlocke` / `hardcore` / `randomizer`); không thì 0.
- Dữ liệu: `hardPioneer` (Khó), `nightmarePioneer` (Ác mộng, danh hiệu `nightmareConqueror` +10% EXP), `nuzlockeRun` (danh hiệu `survivor` +10% tỉ lệ bắt), `hardcoreRun` (danh hiệu `ironWill` +10% tỉ lệ đồ rơi), `randomizerRun`; bậc 10 / 25 / 50 / 100 tầng rồi ×2.

## Kiểm tra và save

- `validateChallengeState`: mức độ khó hợp lệ, `lowestDifficulty` không khó hơn `difficulty`, Nuzlocke thì `permadeathEnabled` bật, `hardcore` boolean, `randomizer.seed` nguyên 32-bit không dấu, `randomizer.learnsets` boolean; `nuzlockeAreas` đúng dạng, không trùng; `gameOver` chỉ khi Nuzlocke và đội + kho trống (đội trống chỉ hợp lệ khi đã thua game); `battle.difficulty` hợp lệ, `battle.nuzlockeEncounter` chỉ khi Nuzlocke.
- Dữ liệu: `config.challenge` đủ 4 mức, trường lạ báo lỗi, `levelPercent` ≥ −100, `geneMultiplier` > 0, `rewardPercent` / `expPercent` ≥ −100, `tierSize` nguyên ≥ 1.
- Save `version: 101` (`state-versions.md`; v101 thêm `randomizer.learnsets`).

## UI

Chưa có (UI làm sau cùng): màn Game mới chọn độ khó / Nuzlocke (dupes clause mặc định bật) / Hardcore / Randomizer, màn Cài đặt đổi độ khó, `MonsterView` / màn ngự thú sư / danh sách save hiện chế độ đang chơi, màn thua game. Xem `docs/roadmap/ui-overhaul.md`.

## Mô phỏng

Độ khó: biến thể quét tầng `hard` / `nightmare` và `progression.difficultyModes` (bảng `difficulty.csv`); kết quả và mục tiêu ở `simulation-features.md` mục "Độ khó" (Ác mộng không bắt buộc qua được). Chưa có biến thể Nuzlocke (chờ: cần "người chơi" mô phỏng biết né gục để đo Nuzlocke có ý nghĩa, xem `options.md` mục "Mô phỏng").
