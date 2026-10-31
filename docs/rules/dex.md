# Bộ sưu tập (Dex)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Pokédex: ghi loài **đã gặp** và **đã sở hữu**, thưởng theo mốc, thưởng sưu tập vĩnh viễn, và số loài đã sở hữu làm tăng tỉ lệ **bắt chí mạng** như Pokémon. Bước 8 (làm sớm theo yêu cầu chủ project, 2026-10-25). Số ở `balance.json` khóa `dex` và `capture.criticalTiers` (số tạm, `balance-capture.md`).

Code: `registries/dex.ts` (loài nào tính, %, hệ số chí mạng, thưởng sưu tập, số Dex, Dex theo map; điểm duy nhất), `roster/dex.ts` (ghi Dex `syncDex`, nhận thưởng `claimDexReward` / `claimRegionalDexReward`, mục Dex cho UI `dexEntry`; xuất lại câu hỏi cho UI), `registries/charms.ts` (bùa), `gameData/texts.ts` (`speciesInfoText`), `model/dex.ts`, `gameData/validateDex.ts`, `game/validateDexState.ts`.

## Loài của Dex

- Mọi **loài thường** trừ dạng chỉ có trong trận (Mega, gmax, battleOnly; `isDexSpecies`, cùng luật với khu bảo tồn). Dạng vùng / dạng khác là loài riêng (được ghi và tính % riêng, như theo dõi dạng của Pokémon HOME). Tổng `dexTotal`, % đã sở hữu `dexOwnedPercent` (0–100).
- **Số Dex** (`dexNumber`, như số Pokédex quốc gia): đánh 1, 2, 3... theo thứ tự loài trong `species.json`, chỉ loài gốc; dạng khác (`formOf`) dùng chung số của loài gốc (như Alolan Vulpix #037). Thêm loài vào cuối file thì số cũ không đổi.

## Trang loài

- `dexEntry(data, dex, speciesId, language)`: số Dex, đã gặp / đã sở hữu / đã có shiny, phân loại, mô tả, cân nặng (`speciesWeightKg`: số thật hoặc ước lượng), chiều cao thật (`heightM`, chưa có = null), bộ phận / bộ phận đã đánh trúng / điểm yếu đã khám phá (`bodyParts`, `revealedParts`, `knownWeakPoints`; Dex lưu `hitParts`, luật ở `hit-locations.md` mục "Khám phá điểm yếu"). UI ẩn thông tin chi tiết khi chưa gặp (chờ UI).
- **Phân loại và mô tả** là chữ theo ngôn ngữ, không bắt buộc đủ mọi loài: `src/data/i18n/<ngôn ngữ>/speciesInfo/{category,flavor}.json` (`SPECIES_INFO_KINDS`). Tra bằng `speciesInfoText`: ngôn ngữ đang chọn → ngôn ngữ mặc định → ngôn ngữ khác có chữ; dạng khác không có thì lấy của loài gốc. Kiểm tra dữ liệu: loại đã biết, id là loài tồn tại, chữ không rỗng.
- Đã có: tiếng Anh cho 1.025 Pokémon (phân loại "Seed Pokémon" và mô tả của phiên bản game mới nhất, PokeAPI; `scripts/data-import/pokemon-dex-text-import.mjs`). Phân loại tiếng Việt cho 1.025 Pokémon: Claude dịch theo bảng `scripts/data-import/pokemon-category-vi.json` ("Pokémon Hạt Giống"; chủ project duyệt 2026-10-25, sửa bảng rồi chạy lại script). Tiếng Anh cho loài ngoài Pokémon nhập từ API / wiki (2026-10-26, `content-sources-real.md`): Digimon (type + mô tả digi-api), Temtem (mô tả Tempedia), Yo-kai Watch (bộ tộc + Medallium), Monster Sanctuary (Bio), Monster Rancher, Dragon Quest (họ + ghi chú bestiary), Monster Hunter (lớp + Physiology). Chưa có: mô tả tiếng Việt (nguồn không có; dự phòng sang tiếng Anh), chữ cho các nguồn còn lại (fantasy, thần thoại, Siralim...: chưa có nguồn có cấu trúc; UI có thể hiện tên race thay phân loại).

## Ghi Dex

- **Một chỗ duy nhất:** `gameReducer` gọi `syncDex` sau mọi action (action không đổi gì thì giữ nguyên state, không ghi). Nhờ vậy mọi cách có / gặp quái (bắt, thu phục, khu bảo tồn, nở trứng, tiến hóa, event, quái khởi đầu ở `createNewGame`) đều được tính mà không phải gọi ở từng tính năng.
- **Đã sở hữu** (kèm đã gặp): loài hiện tại và loài gốc của mọi quái trong **đội và kho** (quái fuse tính loài gốc vì loài hiện tại là loài fuse chung). Trứng chưa nở không tính.
- **Shiny đã có** (`shinyOwned` ⊆ `owned`): loài của quái shiny (`shinyStacks > 0`) trong đội và kho.
- **Đã gặp:** quái địch trong trận đang diễn ra (quái hoang, boss, NPC, event), quái đang gặp ở khu bảo tồn.
- Không bao giờ bớt (quái chết, bị thả vẫn giữ).

## Thưởng theo mốc

- `config.dex.milestones`: `{ id, percent, moneyPerFloor, items }`, `percent` tăng dần: 10% / 25% / 50% / 100% loài đã sở hữu (số tạm: 2.000 / 5.000 / 10.000 / 50.000 × highestFloor tiền; 5 / 10 Bóng cao cấp, 1 / 3 Đại Sư Cầu).
- **`claimDexReward { milestoneId }`** (ngoài trận, ở đâu cũng được): đủ % thì nhận tiền `moneyPerFloor × highestFloor` và vật phẩm, mỗi mốc một lần (`dex.claimedMilestones`). Lỗi: `dexMilestoneNotFound`, `dexRewardClaimed`, `dexMilestoneNotReached { milestoneId, need, have }`, `inBattle`.

- Mốc 50% kèm **Bùa Trứng**, mốc 100% kèm **Bùa Lấp Lánh** và **Bằng Khen Bộ Sưu Tập** (vật phẩm chìa khóa, chỉ để trưng), như Pokémon tặng Oval Charm / Shiny Charm / bằng khen khi hoàn thành Pokédex.

## Dex theo map (như Pokédex vùng)

- Loài của Dex một map (`regionalDexSpecies`): loài gặp ngoài tự nhiên và boss của map, kèm mọi dạng tiến hóa trước / sau (`evolutionLineOf`), chỉ loài thuộc Dex. Tiến độ `regionalDexProgress` (đã sở hữu / tổng).
- **`claimRegionalDexReward { biomeId }`** (ngoài trận): sở hữu đủ mọi loài của map thì nhận `config.dex.regionalReward` (tiền × highestFloor, vật phẩm), mỗi map một lần (`dex.claimedRegions`). Lỗi: `dexRegionNotFound`, `dexRegionClaimed`, `dexRegionIncomplete { biomeId, owned, total }`, `inBattle`.

## Bùa

- Category item `charm` (`effects: { type, value }[]`, `world-items.md`): có trong túi là có tác dụng (mỗi loại bùa tính một lần dù có nhiều cái), không dùng / bán / vứt, không rơi, không giá. Luật gộp theo loại ở `CHARM_EFFECT_RULES` (`registries/charms.ts`, điểm duy nhất `charmEffect`): `shinyChanceMultiplier` nhân nhau (> 0), `eggStepBonus` cộng dồn (nguyên ≥ 0).
- **Bùa Lấp Lánh** (`shinyCharm`, shiny × 3): nhân tỉ lệ shiny của quái hoang (cùng hệ số kỹ năng đồng hành / event), khu bảo tồn và con breeding (trừ khi bố mẹ đều shiny; tối đa 100%). Trứng boss chưa áp (tỉ lệ shiny cố định của trứng boss, xem lại khi cần).
- **Bùa Trứng** (`ovalCharm`, +1 lượt ấp mỗi trận thắng): cộng cùng trait kiểu Flame Body và kỹ năng đồng hành. Pokémon dùng Oval Charm để có trứng nhanh hơn; game breed ngay ở NPC nên đổi thành ấp nhanh hơn.

## Thưởng sưu tập vĩnh viễn

- Mỗi `collectionStep` (100) loài đã sở hữu: mọi quái của người chơi **+`collectionStatPercent` (1)% mọi chỉ số**, không trần (`collectionStatPercent`). Nguồn % `collection` (`stats-traits.md`), cộng như mọi nguồn.
- **Chỉ tính trong trận, phe người chơi** (bối cảnh trận `collectionStatPercent`): chỉ số tính từ `(data, monster)` không đọc được Dex của save; màn hình đội ngoài trận chưa hiện phần này (UI sau có thể truyền thêm).

## Bắt chí mạng theo Dex (như Pokémon)

- % chí mạng = tỉ lệ bắt × hệ số / `capture.criticalDivisor` (6), hệ số theo % loài đã sở hữu (`criticalCaptureMultiplier`, mốc cao nhất đạt được; chưa đạt mốc nào = 0, không có chí mạng). Pokémon tính theo số loài đã bắt (> 30 / 150 / 300 / 450 / 600 trong khoảng 900 loài): ở đây đổi thành % của Dex: **3% × 0,5, 17% × 1, 33% × 1,5, 50% × 2, 67% × 2,5**. Luật lắc bóng ở mục "Bắt quái" (`battle.md`).

## State, save

- `GameState.dex = { seen, owned, shinyOwned, claimedMilestones, claimedRegions }` (id loài không trùng; đã sở hữu thì đã gặp). Kiểm tra save (`validateDexState`): loài thuộc Dex, không trùng, `owned` ⊆ `seen`, `shinyOwned` ⊆ `owned`, mốc / map đã nhận tồn tại và không trùng. Save v56: migrate điền Dex từ đội và kho; v57: điền `shinyOwned` từ quái shiny, `claimedRegions` rỗng (`state-versions.md`).
- `createGameState` (test, mô phỏng) bắt đầu Dex rỗng; action đầu tiên làm đổi state sẽ ghi.

## Chưa có

- Màn hình Dex: danh sách theo số Dex, trang loài (`dexEntry`), Dex theo map, lọc / sắp xếp theo phẩm cấp loài (`species-rank.md`), tên loài, đã gặp / sở hữu / shiny (chờ UI, bước 7).
- Ghi nhận giới tính đã gặp (Pokémon HOME có), mô tả tiếng Việt, chữ cho loài của các nguồn chưa có (xem trên).
- Dùng số liệu Dex ở thành tựu (`titles.md`), mở khóa quái khởi đầu (`starter-unlocks.md`), nghiên cứu loài (`species-research.md`): các mục đó tự đọc `state.dex`.
- Giữ Dex qua phi thăng (chờ `ascension.md`: không reset `dex`).
