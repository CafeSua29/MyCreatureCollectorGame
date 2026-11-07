# Biến thể Bootleg

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Làm 2026-11-07 (save v112, cùng đợt sticker skill), lấy từ **Bootleg của Cassette Beasts** (chủ project yêu cầu 2026-11-03). Ở bản gốc: quái Bootleg mang **hệ khác** hệ thường của loài, màu khác, tỉ lệ 1/1000, remaster vẫn giữ hệ Bootleg, ra thuộc tính sticker nhiều hơn. Độc lập với shiny. Số là **số tạm** (`balance.json` khóa `bootleg`; giá trị ở `balance-content.md`).

Code: `monster/bootleg.ts` (`speciesElementsFor`, `bootlegElementChoices`, `rollBootleg`, `withBootleg`, `bootlegRewardFactor`), tung ở `world/encounter.ts` (`rollMonster`) và `progression/breeding.ts` (`childBootleg`), tiến hóa `progression/evolution.ts`, Dex `roster/dex.ts` (`bootlegKeysOf`), sticker `monster/skillBooks.ts` (`bootlegSticker`), kiểm tra dữ liệu `gameData/validateBootleg.ts`.

## Luật

- Trường `Monster.bootlegElementId: string | null`. Quái Bootleg mang **đúng một hệ** này thay toàn bộ hệ của loài (gốc quái một hệ). Hệ Tera vẫn tung theo hệ của loài; trong trận biến hình / Tera / đổi hệ tạm vẫn đè hệ như mọi quái.
- **Một hàm duy nhất** `speciesElementsFor(species, monster)` trả hệ theo loài cho một quái (Bootleg thì hệ Bootleg); tiến hóa gọi hàm này nên **tiến hóa giữ Bootleg** như remaster của gốc. Thoái hóa (`devolution.md`) sẽ dùng chung.
- **Sinh quái** (`rollMonster`: quái hoang, boss, gacha, trứng boss / trứng loài, trao đổi NPC, khu bảo tồn... mọi nơi đi qua hàm sinh chung; **trừ quái khởi đầu** và Thiên Kiếp như gốc: băng khởi đầu không là Bootleg): tung `bootleg.wildChance` (0,1% = 1/1000 như gốc; map ghi đè bằng `Biome.bootlegChance`) × hệ số hoàn cảnh (`EncounterOdds.bootlegMultiplier`): **độ bất ổn tầng** +`instabilityPercentPerLevel` (10) % mỗi mức (`instability.md`), **đợt thú triều** × `beastTideMultiplier` (5; `events.md`); chủ project duyệt 2026-11-07 **sau cùng**, sau trait làm việc, nên mọi giá trị random khác của quái giữ nguyên như trước khi có Bootleg. Hệ tung đều trong **mọi hệ của game trừ hệ thường của loài** (loài không hệ: mọi hệ). Tỉ lệ 0 không tốn RNG.
- **Breeding**: tung sau cùng: mẹ Bootleg thì `inheritPercent` (25) % con nhận hệ của mẹ, không thì bố Bootleg cũng vậy; hệ trùng hệ thường của loài con thì bỏ qua; không nhận thì tung như quái hoang.
- **Fuse**: quái gốc giữ Bootleg của mình (như hệ của quái gốc); Bootleg của quái phụ mất.
- Gặp quái địch Bootleg: log trận `bootlegAppeared { monsterId, elementId }` (UI làm hiệu ứng, như `shinyAppeared`).
- **Thưởng**: EXP / tiền khi hạ / bắt quái Bootleg × `rewardMultiplier` (1,5, nhân cùng hệ số shiny và boss trong `rewardFactor`).
- **Dex** (`dex.md`): `dex.bootlegSeen` / `dex.bootlegOwned` khóa `speciesId:elementId` (loài Dex của quái, gồm loài gốc của quái fuse như Dex thường), ghi sau mọi action (`syncDex`); owned ⊆ seen.
- **Thưởng sưu tập**: thành tựu "Bộ Sưu Tập Bootleg" (`bootlegCollection`, điều kiện `bootlegForms` = số khóa trong `bootlegOwned`; bậc 1 / 10 / 50 rồi ×2 mãi, tiền × tầng). Lệch roadmap: dùng thành tựu có bậc làm "mốc thưởng sưu tập Bootleg" thay cho thêm loại mốc riêng vào `dex.milestones` (mốc Dex tính theo % loài, hai hệ mốc cho cùng một việc là thừa).
- **Sticker** (`skill-stickers.md`): quái Bootleg dùng **Bí kíp thường** thì tung độ hiếm sticker theo `bootleg.stickerRarityChances` (66,6% uncommon, 16,7% rare như gốc khi Bootleg lên sao; gốc áp lúc lên sao, game không có lên sao nên áp lúc dạy sách). Ra sticker (túi còn chỗ) thì Bí kíp thành sticker: quái còn ô thì dán luôn (học skill kèm thuộc tính), đủ ô thì sticker vào túi và skill vào chờ học như sách. Chân kinh không tung.
- **Không có đá đổi hệ Bootleg**: game gốc không có vật phẩm đổi hệ của Bootleg đã có (chủ project chốt 2026-11-07: gốc không có thì không làm).
- **Boss** (trận tĩnh của gốc 2%): boss tầng và boss ngẫu nhiên tung `bootleg.staticChance` (2) % × hệ số hoàn cảnh thay cho tỉ lệ quái hoang (chủ project duyệt 2026-11-07).
- **Cách tạo Bootleg khác của gốc** (Rogue Fusion 2–20%, Ritual Candle, Hacking Glove, nhà Bootleg, quà bảng nhiệm vụ): `rogue-fusion.md`.

## Save, dữ liệu

- Save v112: `Monster.bootlegElementId` (null hoặc id hệ tồn tại), `dex.bootlegSeen`, `dex.bootlegOwned` (khóa đúng dạng loài Dex:hệ, không trùng, owned ⊆ seen). Migrate v111 → v112: mọi quái (kể cả trong trứng) không Bootleg, Dex rỗng.
- Kiểm tra dữ liệu (`checkBootlegConfig`): `wildChance`, `inheritPercent` 0–100, `rewardMultiplier` ≥ 0, `stickerRarityChances` mỗi độ hiếm 0–100 và tổng ≤ 100; trường lạ. `Biome.bootlegChance` 0–100.
- Mô phỏng không đo riêng (0,1% quá hiếm để đổi cân bằng).
