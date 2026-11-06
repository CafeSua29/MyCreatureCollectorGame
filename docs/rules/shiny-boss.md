# Shiny và boss

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

## Shiny

- Quái hiếm, có trait shiny đặc biệt. **Chỉ số chỉ tăng một lần**, qua trait "Ánh kim" (+10% mọi chỉ số ở cấp 1); không nhân gì vào chỉ số gốc.
- **Chỉ có một trait shiny cố định** (`config.shiny.traitId`, hiện là "Ánh kim"). Không dùng trait loại shiny nào khác.
- **Cấp trait shiny = shinyStacks** (shiny ×2 → trait cấp 2, hiệu ứng ×1,2 = +12%). Khớp với luật fuse "shinyStacks cộng dồn, trait shiny gộp cấp". Mọi chỗ làm quái thành shiny phải dùng `addShinyStacks`.
- **Quái hoang**: tỉ lệ ra shiny = `shinyChance` của biome nếu có khai báo (áp cho cả boss của biome), không thì `config.shiny.wildChance`. Quái hoang shiny có `shinyStacks = 1`. Tung shiny **sau cùng** khi sinh quái, nên thêm luật shiny không làm đổi loài, level, gen, trait của quái sinh ra từ cùng RNG.
- Gặp quái hoang shiny: log trận có sự kiện `shinyAppeared` (để UI làm hiệu ứng).
- Hạ hoặc bắt quái shiny: EXP và tiền × hệ số shiny (xem Phần thưởng).
- Shiny từ breeding và cộng dồn khi fuse: xem mục Breeding và Fusing.

## Boss

- Chỉ số khởi điểm ×2–5 (random). Khó bắt hơn quái thường. Boss tầng sau mạnh hơn nhờ level và gen theo tầng.
- Hạ boss: có tỉ lệ rơi **trứng**; trứng nở ra quái thường (`bossMultiplier = 1`) kèm trait **Huyết thống boss**.
- Bắt được boss: **giữ nguyên `bossMultiplier`** (2–5) và nhận trait **Huyết thống boss**; giữ hệ Tera, Gmax Factor, cấp Dynamax.
- **Boss biến hình** (Mega / Dynamax / Tera ở lượt đầu, hệ Tera / Gmax Factor / cấp Dynamax riêng của boss, đồ rơi đá Mega / Mảnh Tera): `transformation.md`.
- **Hai cách gặp boss** (chi tiết ở "Tầng và biome", `world-items.md`): **boss ngẫu nhiên** khi `startWildBattle` (biome có boss có `weight`: tung `bossChance` của biome, không có thì `config.boss.chance`) và **boss tầng** qua `challengeBoss`. Cả hai là **trận boss: một boss đánh một mình** (đội ta vẫn 2 ô). Biome không có boss nào có `weight` thì không bao giờ gặp boss ngẫu nhiên.
- Boss ngẫu nhiên: loài theo `weight` trong `biome.bosses`, level như quái thường của tầng. Boss tầng: loài `floorBossSpeciesId`, level cố định `levelPerFloor × N`. Gen / trait / shiny random như quái hoang của tầng. `bossMultiplier` là **số nguyên** random trong `[bossMultiplierMin, bossMultiplierMax]` của biome (không ghi đè thì `config.boss.multiplierMin/Max`).
- Boss lúc đánh **chưa** mang trait Huyết thống boss; chỉ nhận khi bị bắt (đã có thì gộp cấp).
- **Trang bị unique:** boss hoang mang 1 món unique trong pool của loài (nếu có), hạ boss có tỉ lệ rơi món đó / món khác trong pool, bắt boss thì giữ món (mục "Trang bị và đồ cầm" ở `equipment.md`).
- Log trận: `bossAppeared`. **Chạy trốn khỏi boss được**, như quái thường.
- Hạ boss: EXP và tiền × `bossMultiplier`, thêm đồ rơi chung cho boss của biome (`bossDrops`) và đồ rơi riêng của boss đó, tỉ lệ rơi trứng (xem Phần thưởng). Bắt boss: không rơi trứng.
- **Trứng boss**: loài là **dạng đầu tiên chưa tiến hóa** của loài boss (`getBaseForm`), level 1, `bossMultiplier = 1`, gen và trait random như quái hoang **của tầng boss rơi trứng** (khoảng gen nhân theo tầng), có thể shiny theo `config.shiny.wildChance`, kèm trait Huyết thống boss **cấp 1**; boss có cực Âm / Dương thì trứng cùng cực, trait cực tính random lại (`polarity.md`). Số trận để nở random trong `[egg.hatchBattlesMin, egg.hatchBattlesMax]` (5–10).

## Lợi thế boss

Như Battle Advantage của Champion trong WILDERLOCKE (số theo game gốc). Code: `battle/bossScout.ts`, `applyBossAdvantage` ở `battle/openBattle.ts`; số ở `config.boss.advantages` (`randomChance`, `entries`).

- Lợi thế là **trait kind `boss`** thành trait tạm của mọi quái địch khi mở trận (thêm lợi thế = thêm trait và một mục `entries`, không sửa code). Không phải trait thật nên bắt boss không giữ. Boss thế giới không có.
- **Tung ngẫu nhiên mỗi trận boss** (mọi boss, trừ boss thế giới; chủ project chốt 2026-11-05): `randomChance` % (100) có lợi thế, số lợi thế theo `countWeights` (1 / 2 / 3 lợi thế: 85 / 13 / 2, số tạm), mỗi lợi thế chọn theo `weight`, không trùng (`rollBossAdvantages`). Nhiều lợi thế thì cộng dồn.
- Hiện có (chủ project chốt 2026-11-05: khó hơn gốc vì trận boss của game này chỉ khoảng 4 lượt, số gốc gần như không có tác dụng; số ở `BOSS_ADVANTAGE` của `scripts/data-import/wilderlocke-import.mjs`, nằm trong trait): Crescendo (địch +15% sát thương mỗi lượt trên sân; gốc 2%), Rainstorm (mưa ngay khi vào sân và mỗi 2 lượt, địch +40% sát thương khi mưa; gốc mưa mỗi 4 lượt, không cộng sát thương), Suppression (mỗi lượt phe mình không đổi được quái và −1 bậc tốc độ, công, đặc công; gốc chỉ khóa đổi quái mỗi 2 lượt), Garden (địch hồi 12% máu mỗi lượt; gốc 3%).

## Do thám boss

Như Courier của WILDERLOCKE. Action `scoutBoss` (ở tầng, ngoài trận): trả `config.boss.scoutPricePerFloor` × tầng (200, số tạm), **tung trước** lợi thế của lần đánh boss tầng tới và lưu vào `GameState.scoutedBosses: { floor, advantageTraitIds }[]` (save v106); đã do thám (chưa đánh) thì không tốn thêm. Đánh boss tầng đó dùng đúng lợi thế đã tung rồi bỏ khỏi danh sách (lần sau phải do thám lại). `bossScoutReport` trả loài, level, hệ, khoảng hệ số boss, danh sách lợi thế. Chưa có màn UI (làm cùng đợt UI, `ui-overhaul.md`).
