# Breeding và trứng

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

## Breeding

- Cần **tiền**, một cặp **đực và cái**. Quái không giới tính không breed được (mục "Loài không giới tính" ở `world-items.md`). Bố hoặc mẹ **ấu niên** không breed được (`tooYoungToBreed`, khi bật thọ nguyên; `lifespan.md`).
- Breed được khi (gom vào một hàm `canBreed(a, b)`):
  - cùng loài, hoặc
  - loài của con này nằm trong `lineage` của con kia, hoặc
  - thuộc nhóm loài đặc biệt cho cross-breed: **theo race** — race của con này nằm trong `breedsWith` của race con kia (xét **cả hai chiều**, một chiều là đủ). Hai loài khác nhau cùng race hoặc cùng nhóm race luôn breed được (`breedsWith` đã mở rộng theo nhóm, mục "Nhóm race" ở `stats-traits.md`).
  - "Loài" để so sánh là `baseSpeciesId` (quái fuse dùng loài gốc).
- Con:
  - **Thân mật** (`affinity.md`): quái trong trứng (breeding, trứng boss, trứng truyền thừa) có thân mật khởi đầu `affinity.start.egg` (120).
  - **Loài theo mẹ**: mẹ thường thì con ở dạng đầu tiên chưa tiến hóa (loài có nhiều dạng đầu, ví dụ cây Digimon, thì chọn ngẫu nhiên một dạng đầu; `baseFormsOf`).
  - Nếu mẹ là quái fuse: con cũng là quái fuse (loài chung, lineage của mẹ), **giữ đúng dạng tiến hóa của mẹ** (không về dạng đầu), vẫn không tiến hóa được, `fusingBonusStats` = giá trị lớn nhất của bố hoặc mẹ. Chủ project đã chốt giữ luật này, dù breed rồi đem con đi fuse tiếp vẫn dồn được sức mạnh; không đổi thành 0 hay một phần nhỏ.
  - **Trait:** random lại, tối đa 2 trait, 1 lấy từ bố và 1 lấy từ mẹ.
  - **Gen:** mỗi chỉ số dựa trên giá trị cao nhất của bố mẹ, random tăng hoặc giảm, không có trần, tối thiểu 1.
  - Tỉ lệ thấp ra **shiny**.
  - **Bootleg** (`bootleg.md`, tung sau cùng): mẹ rồi bố Bootleg mỗi bên 25% truyền hệ Bootleg, không thì tỉ lệ như quái hoang.
  - Tỉ lệ thấp ra **đột biến**: tất cả gen đều tăng.
  - **Biến hình** (`transformation.md`): hệ Tera random trong hệ của con (tung sau shiny), không Gmax Factor, cấp Dynamax 0.
  - **Chiêu trứng** (egg move, như Pokémon thế hệ 6 trở đi; `inheritedEggSkills` ở `progression/breeding.ts`): loài con có `eggSkillIds` (dữ liệu loài, chỉ dạng đầu chuỗi; Pokémon nhập từ game gốc) thì con học mọi chiêu trứng mà **bố hoặc mẹ đang biết** (`skillIds`), theo thứ tự trong dữ liệu, sau skill level 1. Quá số ô thì bỏ skill cũ nhất (chiêu trứng được ưu tiên; skill level bị bỏ vẫn học lại được theo learnset). Chiêu trứng ghi vào `extraSkillIds` nên NPC học lại được (`skill-books.md`). Không tốn RNG. Chiêu trứng không học được qua sách (trừ khi cũng có trong `bookSkillIds` / cùng hệ theo luật sách).
  - **Tính cách** (`natures.md`, tung sau hệ Tera): random đều; bố / mẹ lắp **Bất Biến Thạch** (hook `inheritNature`, không tiêu hao) thì con nhận tính cách của bên đó, cả hai cùng lắp thì 50/50.
- Kết quả là **trứng**.
- **Chi tiết đã chốt** (`src/core/progression/breeding.ts`):
  - Chỉ breed ở **NPC thị trấn**, ngoài trận. Bố mẹ ở đội hoặc kho, **không mất đi**. Giá = `breeding.costPerLevel × (level bố + level mẹ)`.
  - Con nhận `traitSlots` **cao nhất của bố mẹ** nhưng chỉ có tối đa 2 trait thường, các ô còn lại để trống (cố ý, xem mục Trait).
  - Con: **level 1**, tuổi 0 (cờ `aging` theo mẹ, `lifespan.md`), gender 50/50 (loài của con không giới tính thì `none`), skill theo learnset level 1 rồi chiêu trứng (trên), không biệt danh. Mẹ thường: loài = `getBaseForm(loài của mẹ)`. Mẹ fuse: loài gốc = `baseSpeciesId` của mẹ (giữ dạng tiến hóa). Race, hệ, skill level 1 theo loài đó.
  - Mẹ fuse: con fuse (`speciesId` loài chung, `baseSpeciesId` = `baseSpeciesId` của mẹ (cùng dạng tiến hóa, **không** về dạng đầu), `lineage` của mẹ), `fusingBonusStats` = **max từng chỉ số** của bố mẹ. Mẹ không fuse: con không fuse, `fusingBonusStats` = 0 (kể cả khi bố fuse). Cấy ghép và `sacrificeStacks` (khi làm) không truyền sang con.
  - **Gen theo %:** mỗi chỉ số = `max(bố, mẹ) × (1 + r)`, r random trong `[−geneDownPercent, +geneUpPercent]` %, làm tròn, **luôn lệch ít nhất 1**, tối thiểu 1. Scale vô hạn (gen 10 hay 1.000.000 dịch cùng tỉ lệ).
  - **Đột biến** (`mutationChance`): mọi gen chỉ tăng, r trong `[0, +geneUpPercent]` %, ít nhất +1.
  - **Trait thường:** mỗi bên random 1 trait (không tính trait loại `shiny` / `boss`), **giữ nguyên cấp**. Mẹ bốc trước. Trùng id thì gộp cấp (cộng). Trait bố loại trừ với trait mẹ thì bốc lại từ phần không xung đột; hết thì con chỉ có 1 trait.
  - **Boss đi theo bossMultiplier:** con nhận `bossMultiplier` cao nhất của bố mẹ; nếu bố hoặc mẹ có trait Huyết thống boss thì con nhận trait đó ở **cấp cao nhất** của bố mẹ (quái nở từ trứng boss có trait nhưng `bossMultiplier = 1` vẫn truyền được trait).
  - **Shiny:** cả bố và mẹ shiny → con **chắc chắn** shiny; đúng một bên shiny → tỉ lệ `shinyChanceOneParent`; không ai shiny → `shinyChance`. Con shiny thì `shinyStacks` = **cao nhất của bố mẹ** (tối thiểu 1), trait shiny cấp tương ứng (qua `addShinyStacks`).
  - **Huyết mạch** (`bloodline.md`): mẹ (không fuse) có huyết mạch chính ≥ 50% thì 0,1% con là một loài tổ của nhóm đó (tung ngay sau khi chọn loài con, chỉ tốn RNG khi đủ điều kiện); độ thuần con = trung bình bố mẹ −5..+8 (nhóm cả hai 0 thì không có), 1% đột biến phản tổ +30 huyết mạch chính (tung sau cùng).
  - **Hiến tế** (`sacrifice.md`): con luôn `sacrificeStacks = 0` (bố mẹ không mất nên truyền là nhân bản stack).
  - **Luân hồi** (`rebirth.md`): con luôn `rebirths = 0`, cùng lý do.
  - **Cấy ghép** (`implant.md`): con luôn `implantBonusStats` = 0, `implantEffects` = `{}`, `implantAttempts` = `implantFails` = 0 (cùng lý do như hiến tế).
  - **Dấu ấn** (`marks.md`, tung sau cùng): mỗi đột biến / thích nghi của mẹ rồi bố truyền theo % của mục (25% / 5%, giữ cấp; đột biến chỉ khi con có bộ phận đó và bộ phận còn trống); sẹo / ám ảnh / chiến tích không truyền; 1% đột biến bẩm sinh mới.
- **Sức chứa** (`capacity.md`): trứng tới lúc nở mà đội đủ và kho đầy thì vẫn là trứng (`battlesLeft` dừng ở 0, log `eggWaiting`), nở ở trận thắng sau khi có chỗ.
  - **Âm / Dương** (`polarity.md`, tung sau cùng): bố mẹ cùng cực thì con cùng cực (trait cực tính random lại); khác cực / một bên không cực thì con không cực.
  - Quái con random sẵn khi tạo trứng, bọc bằng `wrapEgg` (nở sau 5–10 trận thắng như trứng boss). Id trứng / quái lấy từ `nextMonsterId`.

## Trứng

- **Trứng nở** (mọi loại trứng) qua `hatchMonster`: mốc lý lịch `hatched` và bắt đầu **dưỡng dục** (`imprinting.md`); quái trong trứng `imprint` null, breeding không truyền dưỡng dục.
- **Trứng truyền thừa** ấp từ hồn phách của quái chết hẳn dùng chung cơ chế trứng; luật tạo trứng ở `soul-relics.md`. Trứng chưa nở không tính tuổi; quái nở ở tuổi 0.

- Trứng từ breeding và trứng rơi từ boss dùng chung cơ chế.
- Nở sau **5–10 trận đánh quái hoang** (random khi tạo trứng).
- Không giới hạn số trứng mang theo; trứng không cần nằm trong đội hình.
- **Chỉ đếm trận THẮNG quái hoang** (kể cả trận boss); thua hoặc chạy không đếm. Trứng rơi trong chính trận đó chưa bị đếm.
- **Trait ấp trứng** `eggHatchBoost { extraCount }` (Ấp ủ, kiểu Flame Body; hook ở `registries/rewardTraitHooks.ts`): trong đội có quái mang trait (kể cả chưa ra sân / đã gục) thì mỗi trận thắng trứng giảm `1 + extraCount` thay vì 1 (`steps` của `incubateEggs`). Nhiều quái / trait **không cộng dồn**, lấy lớn nhất; `extraCount` không đổi theo cấp trait. Bộ đếm xuống ≤ 0 thì nở.
- Quái bên trong được random sẵn lúc tạo trứng (tất định). Nở khi bộ đếm về 0, sau khi trận kết thúc: vào đội nếu còn chỗ, không thì vào kho (sau quái vừa bắt trong trận); log `eggHatched`.
- `listEggs` chỉ cho biết id và số trận còn lại (không lộ quái bên trong).

Phòng ấp theo môi trường (trứng đặt trong phòng, độ ổn định lúc nở) ở `hatchery.md`. Trứng nở (mọi loại) nhận tinh chất tăng trưởng (`essences.md`). Hook `traitInheritBonus { percent }` (gen Mutating, Stud của Portals of Phereon): breed có % truyền thêm một trait của bên mang hook nếu còn ô.

## Ấp trứng có hoàn cảnh

Như truyện ngự thú (ấp bằng linh thạch, ấp ở linh địa). Code: `progression/incubation.ts` (`infuseEgg`, `incubateEggs`, `warmEggsAtRest`), gen đột biến dùng chung với breeding ở `progression/genes.ts`. Số ở `config.egg.incubation` (`balance.json`, số tạm, xem `balance-systems.md` mục "Ấp trứng có hoàn cảnh"). Áp dụng cho mọi trứng (breeding, boss, truyền thừa, thám hiểm, event).

- **Đặt linh thạch** `infuseEgg { eggId, itemId }` (ngoài trận, ở đâu cũng được): tiêu 1 linh thạch hệ X (`config.alchemy.elementStoneItemIds`, `alchemy.md`), tối đa `maxInfusions` (3) mỗi trứng; `Egg.infusions` ghi hệ theo thứ tự đặt (để đếm và cho UI).
  - Quái trong trứng đã random sẵn nên hiệu ứng **áp ngay** vào quái bên trong (không chờ lúc nở).
  - Cùng hệ với quái trong trứng: mọi gen × (1 + `genePercentPerInfusion` %) (2%), làm tròn xuống, ít nhất +1; nhiều viên nhân dồn.
  - Khác hệ: hệ Tera = hệ đó (lần đặt cuối thắng), không tăng gen; loài có hệ Tera cố định giữ nguyên.
  - Mỗi viên (mọi hệ) tung thêm `infusionShinyChance` % (0,1%) ra shiny (chỉ khi quái chưa shiny, +1 shiny).
  - Lỗi: `eggNotFound`, `notSpiritStone`, `eggInfusionsFull { eggId, max }`, `notEnoughItem`, `inBattle`.
- **Linh địa:** map (`Biome.elementIds`, hệ chủ đạo của map, sinh từ `mapElements` của `biomes-import.mjs`; bỏ trống = không là linh địa) có chung hệ với quái trong trứng: mỗi trận thắng ở map đó trứng tiến thêm `spiritLandExtraSteps` (1) bước và tung `spiritLandMutationChance` % (1%) đột biến (mọi gen tăng như đột biến breeding, có thể đột biến nhiều lần). Trận bí cảnh / hiểm địa dùng map của trận (`battleBiome`). Chỉ tốn RNG với trứng ở linh địa.
  - Lệch roadmap: không xét thời tiết ưa thích (hệ chủ đạo của map đã lấy theo kiểu môi trường, thời tiết theo cùng kiểu đó).
- **Ôn Dưỡng Lò** (`incubationFurnace`, bùa `charm` hiệu ứng `restEggSteps` 1; `dex.md` mục "Bùa"): có trong túi thì mỗi lần nghỉ (`rest`) mọi trứng tiến thêm 1 bước nhưng **dừng ở 1** (trứng chỉ nở sau trận thắng, nơi xử lý chỗ trong đội / kho). Mua ở cửa hàng thị trấn bằng `buyCharm { itemId }`: bùa có `townPrice` luôn bán, giá cố định (30.000), mỗi loại một lần (`charmNotForSale` reason `notSold` / `owned`).
  - Lệch roadmap: là bùa (category `charm`, có trong túi là có tác dụng) thay vì `keyItem` (vật phẩm chìa khóa không có giá, chỉ nhận từ đạo quán).
