# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong project này. Đọc kỹ trước mỗi thay đổi.
Trả lời và viết comment bằng tiếng Việt. Tên biến, hàm, type viết bằng tiếng Anh.

**Tài liệu chia làm 3 phần** (mọi điều ghi trong đó đã được chủ project đồng ý: không tự đổi; riêng roadmap là khung, xem bên dưới):

- `CLAUDE.md` (file này, nạp vào mọi phiên nên giữ gọn): tổng quan, kiến trúc, quy tắc, quy trình. Bản đồ module ở `docs/rules/core-map.md`, tiến độ ở `docs/progress.md`, thứ tự làm ở `docs/roadmap/README.md`.
- `docs/rules/*.md`: luật chơi và quy ước **đã làm** (code hiện tại phải khớp).
- `docs/roadmap/*.md`: thiết kế đã chốt nhưng **chưa làm**. Làm xong thì chuyển luật sang `docs/rules/` và xóa file roadmap.
  - **Roadmap chỉ là khung** (chủ project chốt 2026-10-23, nới 2026-10-25): các điểm "đã chốt" trong roadmap là hướng đi, không phải khuôn bắt buộc. Khi code mà thấy điểm nào không hợp lý, có cách tối ưu hơn hoặc khớp với code hiện có hơn thì **tự làm theo cách hợp lý, tối ưu nhất** (quy tắc "Làm theo cách hợp lý và tối ưu nhất" ở mục Quy trình), không cần chờ duyệt; làm xong thì **cập nhật md** (luật đã làm vào `docs/rules/`, phần chưa làm sửa trong roadmap) theo quy tắc 11 và báo ngắn chỗ đã lệch roadmap.

**Làm mục nào thì đọc file của mục đó trước** (theo bảng dưới hoặc theo code đang sửa). Không cần đọc hết mọi file. Trong các file docs, "mục X" / "xem X" là tên mục trong bảng chi tiết `docs/index.md`.

## Mục lục

Bảng chi tiết (tên mục, code liên quan của từng file; tra "mục X" ở đây): [docs/index.md](docs/index.md).

**Luật đã làm (`docs/rules/`)**

- [stats-traits.md](docs/rules/stats-traits.md): thứ tự tính chỉ số, nguồn % chỉ số, race / hệ, trait (`monster/stats.ts`, `registries/`)
- [big-numbers.md](docs/rules/big-numbers.md): số lớn `Decimal` (`shared/big.ts`)
- [state.md](docs/rules/state.md): dữ liệu quái trong save, `GameState`, action, mã lỗi (`model/`, `game/`); lịch sử version ở [state-versions.md](docs/rules/state-versions.md)
- [data.md](docs/rules/data.md): file JSON, kiểm tra dữ liệu, chữ theo ngôn ngữ, hệ / race / vùng (`src/data/`, `gameData/`)
- [content-data.md](docs/rules/content-data.md): luật chung khi nhập dữ liệu, sinh map, quy đổi Siralim (`scripts/data-import/`)
- [content-sources.md](docs/rules/content-sources.md): quyết định nhập loài theo nguồn (Pokémon, động vật, fantasy, châu Á, Sơn Hải Kinh, Monster Hunter...)
- [content-sources-more.md](docs/rules/content-sources-more.md): nhập loài: TWW3, Siralim, Ben 10 / Star Wars, đợt mở rộng 1–3
- [content-sources-real.md](docs/rules/content-sources-real.md): nhập loài từ API / wiki (Temtem, Digimon, Yo-kai, Dragon Quest, Monster Rancher, Yaoling, Batomon...)
- [content-mechanics.md](docs/rules/content-mechanics.md): nội dung theo cơ chế: trạng thái, môi trường, chiêu sân, trang bị, biến hình
- [battle.md](docs/rules/battle.md): battle 2v2, thứ tự lượt, AI, skill, sát thương, phần thưởng, quái hoang, bắt quái (`battle/`)
- [skill-synergy-hold.md](docs/rules/skill-synergy-hold.md): synergy và hold của skill
- [pokemon-moves.md](docs/rules/pokemon-moves.md): cơ chế chiêu Pokémon theo bản gốc (việc trong lượt, `spell.requires`, điều kiện mới)
- [pokemon-moves-flow.md](docs/rules/pokemon-moves-flow.md): chiêu Pokémon cần luồng trận riêng (Bide, Sky Drop, Pursuit, Pollen Puff, Struggle...), script rà chiêu
- [battle-forms.md](docs/rules/battle-forms.md): dạng chỉ có trong trận (Zen Mode, Stance Change, Disguise, Forecast...)
- [move-styles.md](docs/rules/move-styles.md): thế mạnh / thế nhanh
- [battle-traits.md](docs/rules/battle-traits.md): trait trong trận theo pha (bậc, trúng đòn, sống sót, lượt, chạy trốn, cuối lượt)
- [battle-statuses.md](docs/rules/battle-statuses.md): trạng thái bất thường
- [battle-environment.md](docs/rules/battle-environment.md): môi trường: thời tiết, địa hình, theo phe, room
- [transformation.md](docs/rules/transformation.md): biến hình: Mega, Primal, Dynamax, Tera
- [z-moves.md](docs/rules/z-moves.md): Z-Move (Vòng Z, Z-Crystal hệ / loài, Z-Power)
- [monster-size.md](docs/rules/monster-size.md): kích cỡ quái (quái lớn theo cân nặng: 2 ô, HP và sát thương ×2)
- [hit-locations.md](docs/rules/hit-locations.md): tầm chiêu (cận chiến không với tới quái bay) và vị trí ra đòn (nhắm bộ phận, điểm yếu phải khám phá, mất thế, phá bộ phận chặn skill, yêu đan vỡ)
- [battle-merge.md](docs/rules/battle-merge.md): song thú hợp thể (kỹ năng ngự thú sư, hai quái thành một vài lượt)
- [trait-dsl.md](docs/rules/trait-dsl.md): ngôn ngữ trait, trait / spell / buff Siralim, minion, Timeline
- [tamer.md](docs/rules/tamer.md): ngự thú sư, khế ước, cảnh giới, kỹ năng ngự thú sư (`tamer/`)
- [affinity.md](docs/rules/affinity.md): độ thân mật
- [bloodline.md](docs/rules/bloodline.md): huyết mạch và phản tổ
- [trait-crystals.md](docs/rules/trait-crystals.md): extract / inject trait (tinh thể trait ở NPC thị trấn)
- [rebirth.md](docs/rules/rebirth.md): luân hồi quái (về level 1, +% mọi chỉ số vĩnh viễn, gen, điểm thiên phú, trẻ lại)
- [sacrifice.md](docs/rules/sacrifice.md): hiến tế (quái phụ cùng race / lineage mất đi, quái chính +1% mọi chỉ số mỗi stack)
- [implant.md](docs/rules/implant.md): Phòng Thí Nghiệm: cấy ghép (huyết thanh cộng chỉ số gốc hoặc hiệu ứng hook, thất bại trừ / hiệu ứng ngược, thất bại lần 3 mất quái)
- [capacity.md](docs/rules/capacity.md): sức chứa kho quái / túi trang bị (mở rộng bằng tiền, theo cảnh giới; chặn khi đầy, xác nhận bỏ món thừa)
- [awakening.md](docs/rules/awakening.md): thức tỉnh và độ kiếp
- [human-form.md](docs/rules/human-form.md): hóa hình
- [treasures.md](docs/rules/treasures.md): thiên tài địa bảo
- [soul-levels.md](docs/rules/soul-levels.md): hồn tinh
- [monster-talents.md](docs/rules/monster-talents.md): thiên phú quái
- [tamer-talents.md](docs/rules/tamer-talents.md): cây thiên phú ngự thú sư (điểm theo cảnh giới / nhiệm vụ / thành tựu, kênh thưởng chung với danh hiệu)
- [alchemy.md](docs/rules/alchemy.md): luyện đan, luyện khí (công thức, cấp riêng, nguyên liệu nhóm như yêu đan) và linh điền
- [cooking.md](docs/rules/cooking.md): linh thực (nấu ăn ở Đầu bếp, món ăn buff cả đội N trận)
- [quests.md](docs/rules/quests.md): bảng nhiệm vụ (`quests/`)
- [gacha.md](docs/rules/gacha.md): Cây thần (gacha trứng: giá theo tầng cao nhất, loài theo phẩm cấp, trait xịn hơn khi lên tầng)
- [expeditions.md](docs/rules/expeditions.md): phái quái đi thám hiểm
- [dwelling.md](docs/rules/dwelling.md): động phủ (công trình sản xuất kiểu Palworld, quái trong kho làm việc theo chỉ số / tốc độ / trait làm việc, đói / tinh thần / bệnh, linh điền là công trình)
- [sects.md](docs/rules/sects.md): tông môn (cống hiến, chức vị, đồng môn NPC, nhiệm vụ tông, Tàng Bảo Các, luận võ, thi thăng chức, tông chiến)
- [trades.md](docs/rules/trades.md): trao đổi với NPC (bảng đề nghị theo tuần, yêu cầu loài / race / hệ, nhận quái sinh sẵn hoặc vật phẩm)
- [trainers.md](docs/rules/trainers.md): ngự thú sư NPC, đạo quán, giải đấu, đấu trường
- [trials.md](docs/rules/trials.md): bí cảnh và tháp thí luyện
- [instability.md](docs/rules/instability.md): độ bất ổn tầng (thuộc tính bất lợi tự chọn ở Đền dịch chuyển, thưởng thêm)
- [deities.md](docs/rules/deities.md): thần linh và ân sủng (thần cai quản map, chúc phúc trong map của thần, Miếu: Hương nến, tín vật, cửa hàng thần)
- [world-boss.md](docs/rules/world-boss.md): boss thế giới (xuất hiện theo lịch, HP vô hạn, thưởng theo kỷ lục tổng sát thương)
- [events.md](docs/rules/events.md): hệ thống event, modifier, cửa hàng tạm / chợ đen, chuỗi event, thú triều (`events/`)
- [auto-battle.md](docs/rules/auto-battle.md): tự động đánh, chiến thuật
- [partner-skills.md](docs/rules/partner-skills.md): kỹ năng đồng hành
- [skill-mastery.md](docs/rules/skill-mastery.md): độ thuần thục skill
- [team.md](docs/rules/team.md): cộng hưởng đội, trận pháp, hợp kích
- [imprinting.md](docs/rules/imprinting.md): dưỡng dục
- [options.md](docs/rules/options.md): tùy chọn luật chơi theo từng game (mặc định tắt): thọ nguyên, chết thật
- [lifespan.md](docs/rules/lifespan.md): tuổi, thọ nguyên, đồng hồ game, việc theo ngày
- [calendar.md](docs/rules/calendar.md): ngày đêm, mùa, tuần trăng (gặp loài, thời tiết, tiến hóa, event theo lịch)
- [soul-relics.md](docs/rules/soul-relics.md): hồn phách và hồn khí (quái chết hẳn)
- [monster-history.md](docs/rules/monster-history.md): lý lịch quái
- [natures.md](docs/rules/natures.md): tính cách
- [abilities.md](docs/rules/abilities.md): ability theo loài (ô ability, ability ẩn, như Pokémon)
- [growth-rates.md](docs/rules/growth-rates.md): nhóm tăng trưởng EXP theo loài (6 nhóm của Pokémon)
- [effort-values.md](docs/rules/effort-values.md): điểm nỗ lực (như EV của Pokémon)
- [spirit-virus.md](docs/rules/spirit-virus.md): linh dịch (như Pokérus: nhiễm / lây trong đội, EXP / gen / điểm nỗ lực)
- [polarity.md](docs/rules/polarity.md): Âm / Dương hóa (chỉ số theo cực, trait cực tính, tương khắc, đá chuyển cực)
- [aptitude.md](docs/rules/aptitude.md): phẩm cấp tư chất
- [species-rank.md](docs/rules/species-rank.md): phẩm cấp loài
- [skill-books.md](docs/rules/skill-books.md): sách kỹ năng
- [roster.md](docs/rules/roster.md): danh sách quái, đội / kho, khóa / yêu thích, đội hình mẫu (`roster/`)
- [evolution-skills.md](docs/rules/evolution-skills.md): tiến hóa (kể cả có điều kiện), skill chờ học, học lại skill
- [world-items.md](docs/rules/world-items.md): thị trấn, tầng và biome, giới tính, item và category, cửa hàng, giá thị trường
- [equipment.md](docs/rules/equipment.md): trang bị và đồ cầm
- [artifact-spirits.md](docs/rules/artifact-spirits.md): khí linh trong trang bị (ô theo bậc, dã linh / thu phục, phẩm cấp, Khí Linh Các) và Khí giới bí cảnh (lên cấp món từng tầng, như Item World)
- [equipment-forge.md](docs/rules/equipment-forge.md): Thợ rèn: cường hóa, tẩy luyện, phân giải, đúc trang bị, phụ linh theo hệ
- [frenzy.md](docs/rules/frenzy.md): cuồng bạo (quái hoang, quái có chủ race khó kiểm soát; mất điều khiển)
- [recruit.md](docs/rules/recruit.md): thu phục (xin theo sau trận, boss quy phục, Thị Uy, mồi dụ)
- [safari-zone.md](docs/rules/safari-zone.md): khu bảo tồn (chỉ bắt, mồi / đá, danh sách loài theo đợt)
- [zones.md](docs/rules/zones.md): hiểm địa (khu có điều kiện vào, quái hiếm, khám phá từng bước, boss canh giữ, đồ theo chủ đề)
- [gathering.md](docs/rules/gathering.md): câu cá và khai thác trên tầng (dụng cụ theo cấp, mồi câu, phục kích)
- [dex.md](docs/rules/dex.md): bộ sưu tập (đã gặp / sở hữu, mốc thưởng, thưởng sưu tập, chí mạng theo Dex)
- [species-research.md](docs/rules/species-research.md): nghiên cứu loài (nhiệm vụ mẫu theo loài, cấp 1–10, lợi ích riêng loài, thưởng cấp, Bùa Lấp Lánh qua thành tựu)
- [achievements.md](docs/rules/achievements.md): thành tựu (bộ đếm chung, điều kiện theo registry, bậc không trần) và danh hiệu (đeo một cái, buff kênh %)
- [exp-candy.md](docs/rules/exp-candy.md): Kẹo EXP và Kẹo Hiếm
- [fusing.md](docs/rules/fusing.md): fusing, kế thừa skill, fuse thất bại và bùa fuse
- [breeding-eggs.md](docs/rules/breeding-eggs.md): breeding, trứng
- [shiny-boss.md](docs/rules/shiny-boss.md): shiny, boss, trứng boss
- [saves.md](docs/rules/saves.md): lưu / đọc save, Xuất / Nhập (`game/save.ts`, `main/saves/`)
- [starters.md](docs/rules/starters.md): quái khởi đầu (ô random theo điều kiện, dạng đầu có tiến hóa)
- [ui.md](docs/rules/ui.md): UI hiện có, kiểm tra UI bằng Playwright (`src/renderer/`)
- [testing.md](docs/rules/testing.md): fixture test
- [balance-numbers.md](docs/rules/balance-numbers.md): luật chung về số, số cơ bản; số theo tính năng ở `balance-content.md`, `balance-capture.md`, `balance-systems.md`, `balance-traits.md`, điều tra ở `balance-history.md`
- [simulation.md](docs/rules/simulation.md): script mô phỏng (bắt buộc dùng kết quả để sửa); theo tính năng ở `simulation-features.md` (`scripts/simulate/`)

**Lộ trình chưa làm (`docs/roadmap/`)**: danh sách file, quy ước chung và **thứ tự làm tiếp theo** ở [docs/roadmap/README.md](docs/roadmap/README.md).

**Khác**

- [core-map.md](docs/rules/core-map.md): **bản đồ module core và Điểm duy nhất** (đọc trước khi viết code core)
- [progress.md](docs/progress.md): tiến độ (kèm `progress-content.md`, `progress-battle.md`)

## Tổng quan

Tên game: **"My creature collector game"** (hằng `GAME_TITLE` trong `renderer/src/shared/lib/labels.ts` cho màn tiêu đề; tiêu đề cửa sổ trong `src/renderer/index.html` phải khớp).
Game creature collector / monster catching, đánh theo lượt, chơi offline một người.
Chủ đề chính: **mọi thứ scale vô hạn**. Quái, level, gen, chỉ số fuse đều không có trần. Riêng **số lần fuse của một quái có giới hạn** (mỗi lần phải thêm loài mới vào lineage, xem mục Fusing), nên game càng nhiều loài thì càng fuse được nhiều lần.
Thế giới chia thành các tầng không có trần, tầng sau mạnh hơn tầng trước; người chơi có thể quay về tầng thấp để farm tiền, EXP và quái nguyên liệu.

## Kiến trúc

- Electron + Vite + React + TypeScript (tạo từ template electron-vite `react-ts`).
- Test: Vitest (`vitest.config.mts`, chạy `src/**/*.test.ts` và `scripts/**/*.test.ts`).
- **Sản phẩm build (exe, deb...) phải cài và chạy được hoàn toàn offline** (chủ project chốt 2026-10-31): mọi thứ game cần lúc chạy (font, ảnh, dữ liệu, thư viện) đóng gói sẵn vào bản build, game không gọi mạng lúc chạy. Lúc phát triển / build thì gọi mạng, tải tài nguyên thoải mái (tải về rồi đóng gói vào, không để game tải lúc chạy).
- Số lớn: thư viện **`decimal.js`** (kiểu `Decimal`), xem mục "Số lớn" (`docs/rules/big-numbers.md`; đổi từ `break_infinity.js` vì thư viện đó lệch ±1 với số nguyên nhỏ). Thư viện chỉ cần cài ở máy build; bản exe đã chứa sẵn, người chơi không phải tải gì.
- **Dependency dùng lúc chạy** (như `decimal.js`) phải nằm trong `dependencies` của `package.json`, **không** để trong `devDependencies`. Main / preload không bundle dependency (`externalizeDepsPlugin`), electron-builder chỉ đóng gói `dependencies` vào `app.asar`; để sai chỗ thì `npm run dev` vẫn chạy nhưng bản exe báo `Cannot find module`. Máy dev là máy bình thường **có mạng** (chủ project chốt 2026-10-25): cài package thẳng từ npm, commit `package-lock.json`; được tải dữ liệu thật (PokeAPI, wiki...) khi nhập nội dung, kèm script nhập lại được trong `scripts/data-import/`.
  Cấu trúc thư mục: **chia theo tính năng (feature folders)**, mỗi folder chứa file code và file test cạnh nhau (`x.ts` + `x.test.ts`).

```
docs/
  rules/  roadmap/      Tài liệu: luật đã làm / thiết kế chưa làm (xem Mục lục)
src/
  core/                 Logic game THUẦN (hàm thuần, không I/O). Xem `docs/rules/core-map.md`.
    index.ts            API công khai DUY NHẤT cho bên ngoài: import từ '@core'
    shared/  model/  inventory/  registries/  gameData/  shop/  monster/  tamer/  quests/  battle/  world/  progression/  roster/  events/  game/
    testing/            Fixture chỉ dùng trong test ('@core/testing')
  data/                 JSON nội dung game + index.ts (rawGameData), import từ '@data'
  main/                 Electron main process
    index.ts            Mở cửa sổ, kiểm tra dữ liệu lúc khởi động, đăng ký IPC
    startup/            dataCheck (nội dung hộp thoại lỗi dữ liệu)
    saves/              saves (đọc / ghi file), saveIpc (IPC + hộp thoại Xuất / Nhập)
  preload/              Cầu nối an toàn (contextBridge): window.api; api.d.ts = hợp đồng IPC
  renderer/src/         Giao diện React
    main.tsx            Điểm vào
    app/                App.tsx (điều hướng màn hình, phiên chơi)
    features/           Mỗi màn / tính năng một folder: title/, starter/, saves/, party/
    shared/             Dùng chung giữa các feature: components/, lib/ (format, labels), game/ (gameData)
    styles/             main.css
scripts/
  simulate/             Script mô phỏng cân bằng (npm run simulate), chỉ dùng '@core' / '@data'
  data-import/          Báo cáo của các đợt nhập dữ liệu
```

**Quy ước cấu trúc (bắt buộc):**

- **Mỗi folder trong core có `index.ts`** xuất những gì folder khác được dùng (`export * from './file'`). Folder `battle/` chỉ xuất API public (`battleActions`, `damage`, `capture`); các file `draft`, `turn`, `outcome`, `executeSkill`, `multiHit`, `battleItems` là chi tiết nội bộ.
- **Import trong core:** cùng folder → tới file (`./stats`); khác folder → qua folder (`../monster`). Không dùng `@core` bên trong core.
- **Bên ngoài core** (main, preload, renderer, data, `scripts/simulate`) **chỉ import `@core`** (= `src/core/index.ts`); `@core/testing` chỉ trong file test. JSON dữ liệu import qua `@data`.
- **Chiều phụ thuộc trong core (hướng dẫn):** `shared → model → inventory → registries / gameData → shop → monster → tamer / quests → battle / world / progression / roster → events → game`. Ngoại lệ đã biết: `registries/itemEffects` gọi `progression` (đá tiến hóa) và `gameData` gọi `validateParams` của registries — nên chiều trong core không ép bằng lint; ranh giới ngoài thì có.
- **ESLint tự chặn** (`eslint.config.mjs`, lint lỗi là chưa xong):
  - Code core (không phải test): cấm import `react`, `electron`, `node:*`, `fs`, `path`, `os`, `@electron-toolkit/*`, `@data`, `@core`; cấm `Math.random`, `Date.now`, `new Date()` (quy tắc 1, 2).
  - Main / preload / renderer / data / `scripts/simulate`: cấm đường dẫn tương đối vào core và cấm import sâu `@core/<folder>`; `@core/testing` chỉ được dùng trong `*.test.ts`.
  - **Quy tắc code sạch** (mọi file `.ts` / `.tsx`, **kể cả test**): `no-explicit-any`, `no-non-null-assertion` (test dùng `defined(value, what)` từ `@core/testing` thay cho `!`), `no-unused-vars` (biến cố ý bỏ qua đặt tên bắt đầu bằng `_`), `no-console` (ngoại lệ có `eslint-disable-next-line` kèm lý do: 2 dòng dev ở `main/index.ts`, lỗi nạp preload). `switch-exhaustiveness-check` chạy lint có thông tin kiểu (`parserOptions.project` = `tsconfig.node.json` + `tsconfig.web.json`) cho `src/**` và `scripts/simulate/**`; nhánh `default` dùng `assertNever` (`shared/`), riêng `gameReducer` gán `never` rồi ném `ActionError` vì action từ renderer có thể sai lúc chạy.
  - **`decimal.js` chỉ được import ở `src/core/shared/big.ts`** (`@typescript-eslint/no-restricted-imports` cho mọi file khác, kể cả renderer và test; dùng rule của typescript-eslint để không đè các luật `no-restricted-imports` ranh giới). Nơi khác dùng `Decimal` và các hàm tiện ích qua `../shared` (trong core) hoặc `@core` (ngoài core). Luật này để toàn project chỉ có một điểm phụ thuộc vào thư viện.
- **Alias** `@core`, `@data` khai báo ở 3 nơi phải khớp nhau: `paths` trong `tsconfig.node.json` / `tsconfig.web.json`, `resolve.alias` trong `electron.vite.config.ts` (main, preload, renderer), `resolve.alias` trong `vitest.config.mts`.
- **Thêm tính năng mới:** logic → folder phù hợp trong core (hoặc folder mới + `index.ts` + thêm vào `src/core/index.ts`), test đặt cạnh file; UI → `renderer/src/features/<tên>/`; thứ dùng chung nhiều feature → `renderer/src/shared/`. Tách file theo trách nhiệm, không theo số dòng (mục "Hàm và file").
- `src/core` và `src/data` được include trong cả `tsconfig.node.json` và `tsconfig.web.json` (main và renderer dùng chung).
- Lệnh: `npm test` (vitest run), `npm run test:watch`, `npm run typecheck`, `npx eslint .`, `npx prettier --write src scripts/simulate`, `npm run simulate` (mục "Script mô phỏng").
- Chạy app: `npm run dev`. **Lưu ý:** terminal của VS Code / Claude Code có thể đặt sẵn `ELECTRON_RUN_AS_NODE=1`, khiến Electron chạy như Node thuần và báo `Cannot read properties of undefined (reading 'isPackaged')`. Bỏ biến này trước khi chạy (bash: `unset ELECTRON_RUN_AS_NODE`; PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`).
- **Kiểm tra dữ liệu lúc khởi động:** `src/main/index.ts` gọi `tryCreateGameData(rawGameData)` trước khi mở cửa sổ. Lỗi thì hiện hộp thoại lỗi của hệ điều hành (`dialog.showErrorBox`, tối đa 20 dòng lỗi, phần thừa ghi "... và X lỗi khác") rồi **thoát app**, không bao giờ chạy game với dữ liệu hỏng. Hợp lệ thì ở dev mode in một dòng tóm tắt ra console.
- Style (prettier): nháy đơn, không chấm phẩy, dòng tối đa 100 ký tự. Comment tiếng Việt.
- ESLint có plugin React hooks: **không đặt tên hàm thường bắt đầu bằng `use`** (bị hiểu là hook). Ví dụ hàm dùng vật phẩm tên `applyItem`, còn action vẫn là `useItem`.

## Quy tắc kỹ thuật (bắt buộc)

1. **Core là hàm thuần** dạng `(data, state, action) => newState`. Không sửa state cũ. Action không hợp lệ thì throw lỗi riêng (ví dụ `ActionError`), state giữ nguyên.
2. **RNG có seed**, seed lưu trong state. Mọi ngẫu nhiên trong core phải đi qua RNG này. Cùng state + cùng action phải cho cùng kết quả.
3. **Không bao giờ lưu chỉ số cuối cùng vào save.** Chỉ lưu "nguyên liệu" (xem mục Dữ liệu quái). Chỉ số luôn được tính lại bằng **một hàm duy nhất** theo đúng thứ tự ở mục Thứ tự tính chỉ số.
4. **Data-driven:** loài, race, hệ, trait, skill, vật phẩm, vùng nằm trong `src/data/*.json`. Thêm nội dung mới không được phải sửa code. Kiểm tra tham chiếu (id tồn tại, nhóm loại trừ hợp lệ...) khi khởi động và trong test.
5. **Trait và hiệu ứng skill dùng registry hook.** Thêm cơ chế mới = thêm handler vào registry, không viết chuỗi `if/else` theo id.
6. **Công thức sát thương dựa trên tỉ lệ `công / thủ`**, không dùng `công − thủ`.
7. **Đường cong EXP dùng đa thức** (mặc định `level³`; nhóm tăng trưởng theo loài như Pokémon ở `docs/rules/growth-rates.md`), không dùng hàm mũ. Level không có trần.
8. **Hiển thị số rút gọn** ở UI: 1,2K; 3,4M; 5,6B... (`formatNumber` nhận cả `number` lẫn `Decimal`).
9. **Save có `version`.** Mỗi khi đổi cấu trúc state: tăng version và viết hàm migrate để save cũ vẫn mở được.
10. **Viết code xong phải viết test ngay trong cùng lượt**, không để "làm sau":
    - Mọi thay đổi logic trong `core`: unit test đặt cạnh file. Sửa lỗi thì thêm test tái hiện lỗi đó trước (test phải đỏ trước khi sửa, xanh sau khi sửa).
    - Logic thuần ở main (`saves`, `dataCheck`...) và renderer (`shared/lib`, `saveService`...): unit test. Phần chạm Electron / hệ điều hành thì tách hàm thuần ra để test.
    - Màn hình UI mới hoặc sửa: lái app thật bằng Playwright, chụp và xem ảnh (mục UI).
    - Mỗi test phủ cả trường hợp hợp lệ, trường hợp báo lỗi (`ActionError` / `DataError`, state giữ nguyên) và biên (0, 1, giá trị tối đa, **số cực lớn**).
    - Chạy `npm test` và typecheck trước khi báo xong. Không xóa hay sửa test cũ cho pass mà không nói rõ lý do với chủ project.
11. **Luôn cập nhật tài liệu, đúng file liên quan.** Mỗi quyết định được chốt khi hỏi đáp với chủ project (chỉ ghi phần kết luận cần thiết, lấy từ cả câu hỏi lẫn câu trả lời, không chép nguyên câu hỏi) và mỗi thay đổi về luật chơi, cấu trúc dữ liệu, state, module, quy ước, tiến độ đều phải được ghi **ngay trong cùng lượt làm việc** vào đúng file (xem Mục lục): luật chơi → `docs/rules/`, thiết kế chưa làm → `docs/roadmap/`, kiến trúc / quy tắc / quy trình → `CLAUDE.md`, bản đồ module / điểm duy nhất → `docs/rules/core-map.md`, tiến độ → `docs/progress.md`, thứ tự làm → `docs/roadmap/README.md`. Sửa hoặc xóa nội dung cũ đã lỗi thời. Tài liệu phải luôn khớp với code hiện tại để phiên sau hiểu ngay và không phải hỏi lại.
    - **Ưu tiên tạo file md mới theo chủ đề** (chủ project chốt 2026-10-23, để mỗi phiên chỉ đọc phần cần, đỡ tốn token): tính năng / cơ chế mới có luật đủ dài thì viết thành file riêng trong `docs/rules/` (ví dụ `transformation.md`), file chung chỉ giữ một dòng trỏ tới. Không bắt buộc: thay đổi nhỏ, hoặc file cũ đúng chủ đề mà còn gọn thì cứ ghi vào file cũ (ví dụ thêm một category item → bảng category ở `world-items.md`). **Không dồn quá nhiều vào một md chung**. Tạo file mới thì thêm dòng vào Mục lục: một dòng ngắn ở `CLAUDE.md` và dòng chi tiết (kèm folder / file code liên quan) ở `docs/index.md`. **Không nhồi luật chi tiết vào `CLAUDE.md`**: file này chỉ giữ tổng quan, kiến trúc, quy tắc chung, quy trình (nạp vào mọi phiên, nên giữ gọn). Mỗi mục Tiến độ (`docs/progress.md`) một dòng ngắn, trỏ tới file luật. **File md nào quá dài** (khoảng > 40 KB) thì tách theo chủ đề con để mỗi phiên chỉ phải đọc phần cần.
    - Làm xong một mục roadmap: chuyển luật đã làm sang `docs/rules/` (file có sẵn đúng chủ đề hoặc file mới), phần chưa làm chuyển sang roadmap của mục sau đó, rồi xóa file roadmap và dòng Mục lục của nó (cả `CLAUDE.md` lẫn `docs/index.md`) (xem `docs/roadmap/README.md`).
    - **Việc chưa làm / chờ phải ghi md ngay trong lượt** (chủ project chốt 2026-10-23): phần nào chưa làm được (chưa có nguồn, chờ mục khác, hoãn, nội dung chờ dữ liệu) thì ghi vào roadmap của mục sẽ làm nó (hoặc file nội dung chờ), kèm **chờ cái gì** và **vì sao**; file luật của phần đã làm ghi một dòng "chưa có: … (chờ X, xem file Y)".
    - Trước khi báo xong: tự rà lại mọi file docs liên quan tới phần code vừa đổi (bảng Mục lục), sửa chỗ còn mô tả cách cũ, và rà lại để không sót việc chưa làm / đang chờ.
12. **Giá trị có thể lớn vô hạn dùng `Decimal`** (xem mục "Số lớn"). Không bao giờ để giá trị game ra `Infinity` hoặc `NaN`; không so sánh `Decimal` bằng `===` / `<` mà dùng `.eq` / `.lt` / `.gte`...
13. **JSON dữ liệu chỉ để tham khảo, không phải nguồn sự thật.** Chủ project thêm và sửa `src/data` liên tục, nên dữ liệu không phải lúc nào cũng chính xác hay đầy đủ; số liệu về dữ liệu ghi trong tài liệu có thể đã cũ (cần con số chính xác thì đọc thẳng file JSON). Code và test không phụ thuộc số lượng, id hay giá trị cụ thể của dữ liệu thật (trừ fixture). Dữ liệu trái luật thì luật thắng: sửa dữ liệu hoặc hỏi chủ project, không sửa code cho khớp dữ liệu sai. Chi tiết ở mục Dữ liệu (`docs/rules/data.md`).

## Quy tắc code sạch (bắt buộc)

Mục tiêu: thêm nội dung và tính năng mới mà không phải sửa nhiều chỗ, đọc lại sau vài tháng vẫn hiểu.
Luật nào kiểm tra tự động được thì đưa vào ESLint (xem `docs/progress.md`); luật còn lại Claude Code tự kiểm khi review code của mình trước khi báo xong.

**Tái sử dụng trước, viết mới sau**

- Trước khi viết hàm mới, tìm xem đã có chưa (đọc `index.ts` của folder liên quan, mục "Điểm duy nhất" ở `docs/rules/core-map.md`). Đã có thì dùng, thiếu một chút thì mở rộng hàm cũ, không viết bản thứ hai.
- Logic giống nhau xuất hiện **lần thứ 2** thì cân nhắc, **lần thứ 3** thì bắt buộc tách thành hàm chung. Không tạo lớp trừu tượng "để dành cho sau này" khi mới có một chỗ dùng.
- Chỗ đặt code chung: dùng trong một folder core → file trong folder đó; dùng nhiều folder core → `shared/` hoặc folder đúng chủ đề; dùng nhiều feature UI → `renderer/src/shared/`.
- Không chép code giữa main và renderer: logic thuần dùng chung thì đặt trong core.

**Dễ mở rộng (scale)**

Game sẽ có rất nhiều loại nội dung mới (category item, trạng thái, hook, event, biome...). Thiết kế sao cho **thêm một loại mới chỉ cần thêm dữ liệu hoặc một mục / handler**, không phải sửa rải rác nhiều file.

- **Điểm mở rộng rõ ràng:** mỗi loại có nhiều biến thể dùng registry hoặc bảng luật (`Record<Loại, Luật>`) đặt ở một chỗ (ví dụ `ITEM_CATEGORY_RULES`, `TRAIT_HOOKS`, `ITEM_EFFECTS`). Dùng mapped type / `Record` theo union để TypeScript **báo lỗi khi thêm loại mà thiếu mục**; `switch` theo union luôn có `assertNever`.
- **Union phân loại thay cho trường tùy chọn:** loại khác nhau có trường khác nhau thì mỗi loại một interface trong union (ví dụ `Item` theo `category`), không gom thành một interface nhiều trường `?`. Dữ liệu JSON có trường lạ so với loại của nó thì báo lỗi khi kiểm tra dữ liệu.
- **Luật chung theo loại đặt một chỗ:** câu hỏi kiểu "loại này nằm đâu / dùng được ở đâu / kiểm tra thế nào" trả lời bằng một hàm hoặc bảng duy nhất (ví dụ `itemStorage`, `assertUsableIn`), nơi khác gọi lại, không tự rẽ nhánh theo loại.
- **Không giới hạn cứng số lượng loại:** không viết code giả định chỉ có N loại (mảng cố định, `if` liệt kê). Danh sách loại là hằng `as const` (ví dụ `ITEM_CATEGORIES`) dùng cho cả type lẫn kiểm tra lúc chạy.
- **Loại đã chốt nhưng chưa làm:** có thể đưa vào type sớm, nhưng dữ liệu dùng loại đó phải bị kiểm tra dữ liệu chặn ("chưa hỗ trợ", kèm tên mục lộ trình) cho tới khi làm, không để nửa vời chạy được.
- **State dễ thêm phần mới:** gom trường cùng chủ đề vào object (ví dụ `inventory: { stacks, crystals }`) để phần sau thêm trường mà không đổi chỗ khác; mỗi lần đổi vẫn tăng version + migrate (quy tắc 9).
- Cân bằng với "không trừu tượng để dành": chỉ dựng điểm mở rộng cho thứ **đã chốt sẽ có nhiều loại** (ghi trong docs), không dựng cho thứ mới có một chỗ dùng.

**Kiểu dữ liệu (TypeScript)**

- Không dùng `any`. Dữ liệu chưa rõ kiểu (JSON, save, IPC) dùng `unknown` rồi kiểm tra.
- Hạn chế `as` ép kiểu; chỉ dùng khi đã kiểm tra, kèm comment lý do. Không dùng `!` (non-null assertion) để bỏ qua kiểm tra.
- Union có trường phân loại (`kind`, `type`, `phase`...) thì `switch` phải xử lý đủ mọi nhánh, nhánh `default` gọi hàm `assertNever` để TypeScript báo lỗi khi thêm loại mới mà quên xử lý.
- Dùng `readonly` / `ReadonlyArray` cho tham số và type không được sửa (hỗ trợ quy tắc 1).
- Hàm public (xuất qua `index.ts`) khai báo rõ kiểu trả về.
- Id dùng kiểu riêng khi dễ nhầm (ví dụ không truyền id loài vào chỗ cần id quái).

**Hàm và file**

- Mỗi hàm làm một việc, tên nói rõ việc đó. Hàm dài quá ~50 dòng hoặc lồng quá 3 cấp thì tách.
- Hàm nhiều hơn ~3 tham số thì gom thành object có tên trường.
- Ưu tiên return sớm (guard clause) thay vì `if` lồng nhau.
- **Tách file theo trách nhiệm, không theo số dòng** (chủ project chốt 2026-10-23). ~300 dòng chỉ là mốc để **xem lại**: file có nhiều trách nhiệm tách được rõ (chủ đề con, phần dùng chung với nơi khác, tránh import vòng) thì tách; nội dung gắn chặt với nhau (registry và kiểu handler của nó, một luồng xử lý, một bảng luật) thì để chung một file dù quá 300 dòng. Không tách chỉ để đủ số dòng.
- Không để code chết, code bị comment lại, `console.log` debug, biến / import thừa. Cần xem lịch sử thì dùng git.

**Không viết cứng**

- Không có số "ma thuật" trong code: con số cân bằng ở `src/data/*.json`, hằng số kỹ thuật đặt tên rõ ở đầu file hoặc trong `shared/`.
- Không rẽ nhánh theo id nội dung (`if (speciesId === 'xxx')`): dùng dữ liệu JSON hoặc registry (quy tắc 4, 5).
- Chuỗi hiển thị (nhãn, tên trạng thái...) không viết cứng trong component: hiện tập trung ở `renderer/src/shared/lib/labels.ts`; khi làm UI chuyển sang file i18n (xem "Đa ngôn ngữ: phần UI" trong `docs/roadmap/ui-overhaul.md`), **mọi chữ hiển thị phải đi qua i18n**. Chữ nội dung (tên loài, skill, item...) không bao giờ nằm trong JSON dữ liệu hay core: tra theo id bằng `contentName` (UI: `renderer/src/shared/lib/contentText.ts`).

**Đặt tên**

- Tên tiếng Anh, đầy đủ nghĩa, không viết tắt khó hiểu (`monster` không phải `mon`, `damageTaken` không phải `dmg`). Biến chạy vòng lặp ngắn thì được dùng `i`, `j`.
- Hàm bắt đầu bằng động từ (`computeDamage`, `rollMonster`); boolean bắt đầu bằng `is` / `has` / `can` (`isFainted`, `canBreed`).
- Cùng một khái niệm dùng cùng một tên trong toàn project (đã có `damageTaken` thì không đặt thêm `hpLost`).

**Lỗi**

- Core: action sai ném `ActionError` **mang mã lỗi + tham số** (id, giá trị; xem "Mã lỗi action" ở `docs/rules/state.md`), dữ liệu sai ném `DataError` (câu tiếng Việt, nêu rõ id, giá trị). Không nuốt lỗi bằng `catch` rỗng.
- Renderer / main: bắt lỗi ở ranh giới (IPC, đọc file, gọi reducer) và hiện cho người chơi; không để app crash trắng màn hình.

**React (renderer)**

- Component chỉ hiển thị và gọi action; **không chứa luật chơi** (tính toán, kiểm tra luật đều ở core).
- Component nhỏ, một trách nhiệm. Phần UI lặp lại ở 2 màn trở lên thì tách vào `shared/components/`.
- Logic UI phức tạp (trạng thái form, điều hướng trong màn) tách thành custom hook đặt cạnh component.
- Màu, khoảng cách, cỡ chữ dùng biến CSS chung trong `main.css`, không viết cứng trong từng component.

**Comment**

- Comment (tiếng Việt) giải thích **vì sao**, không lặp lại code làm gì. Luật chơi đặc biệt hoặc chỗ dễ sửa sai thì ghi comment kèm tên mục trong file này.
- Hàm public trong core có một dòng mô tả ngắn (JSDoc).

**Khi sửa code**

- **Code cũ không phải khuôn bắt buộc.** Được sửa code cũ thoải mái miễn là hợp lý (sạch hơn, dễ mở rộng hơn, tối ưu hơn, hoặc để khớp với code mới). Không bẻ thiết kế code mới cho vừa code cũ khi cách làm mới tốt hơn; khi đó sửa code cũ theo.
- **Được sửa code cũ không cần hỏi trước** (chủ project chốt 2026-10-25, thay luật "hỏi trước" cũ): chỗ nào ở code cũ nên sửa (cho phù hợp hơn, tối ưu hơn, xung đột với code mới) thì sửa luôn theo cách hợp lý nhất, cập nhật test / docs cùng lượt, báo ngắn trong tin nhắn đã sửa gì và vì sao (nói rõ test cũ nào đổi).
- **Chưa có save thật nào** (chủ project chốt 2026-10-24): thiết kế state / luật kiểm tra save chọn cách tối ưu, hợp lý nhất, không cần chiều theo dữ liệu save cũ; vẫn tăng version + migrate theo quy tắc 9.
- Tái cấu trúc lớn (đổi nhiều file, đổi module) được làm khi hợp lý; tách thành bước riêng trong lượt (test cũ xanh trước khi thêm tính năng), không trộn lẫn khó kiểm.
- Tái cấu trúc thuần (không đổi hành vi): test cũ phải pass nguyên vẹn. Sửa code cũ có đổi hành vi / cấu trúc (đã được duyệt): cập nhật test cũ theo, nói rõ test nào đổi và vì sao (quy tắc 10), đổi cấu trúc state thì tăng version + migrate (quy tắc 9), cập nhật docs đúng file (quy tắc 11).

## Quy trình làm việc

- **Không cần đưa kế hoạch trước khi code** (chủ project chốt 2026-10-24): làm thẳng, chỉ gửi kế hoạch khi chủ project yêu cầu.
- **Làm theo cách hợp lý và tối ưu nhất** (chủ project chốt 2026-10-25): luật chơi, con số, cấu trúc, sửa code cũ, sửa / lệch roadmap: tự chọn phương án hợp lý, tối ưu nhất rồi làm luôn, **không bị gò bó** bởi roadmap / md / code cũ; sửa md và roadmap theo (quy tắc 11). Cuối tin nhắn liệt kê ngắn các quyết định đã tự chốt (để chủ project đổi nếu muốn). Chỉ hỏi khi thật sự là sở thích của chủ project mà không có phương án nào tốt hơn rõ ràng (ví dụ hướng nội dung, tên gọi, danh sách nội dung cần duyệt).
- **Ưu tiên giống game / tác phẩm / bản gốc nhất có thể** (chủ project chốt 2026-10-28): cơ chế, nội dung, con số, tên gọi, hiệu ứng, thời hạn, điều kiện lấy theo bản gốc (Pokémon, Siralim, truyện ngự thú, thần thoại...). Chỉ lệch khi bản gốc không áp được vào game (scale vô hạn, hệ thống game chưa có, xung đột luật đã chốt) hoặc gây mất cân bằng rõ; khi lệch thì chọn cách gần gốc nhất, ghi rõ chỗ lệch và lý do vào md, báo ở cuối tin nhắn. Thứ bản gốc cần mà game chưa có hệ thống thì làm thêm hệ thống / hook, không bỏ bớt. Giới hạn **do game tự đặt** (không có ở bản gốc) thì bỏ theo quy tắc "không gò bó"; giới hạn **của chính bản gốc** (ví dụ trần EV 252 / 510) thì giữ.
- **Mọi kết quả hợp lệ đều có cơ hội** (chủ project chốt 2026-10-20, 2026-10-22, rà lại toàn bộ 2026-11-02): mọi chỗ random cho mọi lựa chọn hợp lệ có trọng số > 0 (hiếm thì để trọng số thấp), không cắt nhóm, không giới hạn kiểu tầng tối thiểu / danh sách cố định. Ngoại lệ đã chốt và phần chưa chốt ở mục "Luật ngẫu nhiên" của `balance-systems.md`.
- **Mọi thứ cần chủ project trả lời / duyệt để ở cuối tin nhắn**, gom vào một mục riêng (ví dụ "Cần bạn trả lời"): đề xuất sửa code cũ, điểm cần chốt, câu hỏi, chỗ chưa hiểu. Mỗi mục đánh số, kèm phương án đề xuất. Phần trên của tin nhắn chỉ để báo cáo / giải thích (có thể nhắc "xem câu hỏi 2 ở cuối"), không đặt câu hỏi rải rác.
  - **Mỗi đề xuất cần duyệt là một mục riêng ở cuối, viết đủ nội dung** (chỗ sửa, lý do, phương án), kể cả khi đã nêu ở phần trên (ví dụ bảng rà soát code cũ): phần trên chỉ được tóm tắt và trỏ xuống cuối, không để nội dung cần duyệt chỉ nằm ở phần trên, không gộp nhiều đề xuất thành một câu "đồng ý không?".
- **Báo cáo ngắn gọn** (chủ project chốt 2026-10-23, để tiết kiệm token): tin nhắn chỉ ghi thông tin cần thiết (kết quả, quyết định, chỗ lệch, câu hỏi); không liệt kê chi tiết code đã sửa hay từng bước đã làm nếu không quan trọng. Giữa các bước chỉ cập nhật một dòng ngắn.
- Không hỏi lại những gì đã ghi trong tài liệu (`CLAUDE.md` và `docs/`).
- Trước khi làm một mục: đọc file docs của mục đó và các file luật mà code sắp sửa đụng tới (bảng Mục lục).
- **Rà soát phần đã làm trước khi bắt đầu mục mới** (tài liệu được chủ project cập nhật liên tục nên code cũ có thể chưa theo kịp):
  - So code của các phần đã làm (mục đã đánh dấu trong `docs/progress.md`, nhất là phần mục mới sẽ dựa vào hoặc đụng tới) với yêu cầu hiện tại trong `CLAUDE.md` và `docs/rules/`: đã làm chưa, làm đủ chưa, còn khớp luật không (luật chơi, cấu trúc, quy tắc kỹ thuật, quy tắc code sạch, dễ mở rộng).
  - Review luôn chất lượng code cũ sẽ đụng tới: chỗ nào thiết kế chưa hợp với mục mới, khó mở rộng, lặp, chưa tối ưu thì sửa luôn (xem "Khi sửa code").
  - Có chỗ thiếu / lệch: bổ sung / sửa luôn theo cách hợp lý nhất. Code bổ sung tuân theo mọi quy tắc trong file này, viết test cùng lượt và cập nhật docs đúng file (quy tắc 11). Báo ngắn kết quả rà soát trong tin nhắn báo xong (hoặc "không thấy chỗ lệch").
- **Gặp điểm chưa chốt (luật chơi, con số, cấu trúc) khi đang làm dở:** tự chọn phương án hợp lý nhất (con số: số tạm rồi chỉnh theo mô phỏng), ghi vào md, báo ở cuối tin nhắn; không dừng lại chờ (trừ trường hợp "chỉ hỏi khi" ở quy tắc trên).
- Con số cân bằng luôn đặt trong `src/data/*.json` (không viết cứng trong code) để dễ chỉnh cân bằng.
- Xong việc: chạy `npm test`, `npm run typecheck`, eslint, prettier; rồi cập nhật tài liệu đúng file (quy tắc 11).
- **Chỉ chạy mô phỏng khi cần** (chủ project chốt 2026-11-01, thay luật "bắt buộc chạy trước khi báo xong"): chỉ chạy khi thay đổi có thể đổi cân bằng (luật / số trong trận, phần thưởng, tiến trình, kinh tế, độ khó, số cân bằng dùng chung) và chỉ chạy phần đo được nó (`--parts`); thay đổi không đổi cân bằng (UI, chữ, tài liệu, tái cấu trúc thuần, kiểm tra dữ liệu / save, dữ liệu không đổi số) thì không chạy. Kịch bản mặc định đầy đủ chỉ chạy khi đổi số cân bằng dùng chung (chỉ số, sát thương, EXP, boss) hoặc khi chủ project yêu cầu. Chi tiết ở mục "Khi nào chạy mô phỏng" (`simulation.md`).
- **Mô phỏng phải tái hiện được thay đổi vừa code** (chủ project chốt 2026-10-24): khi đã chạy mô phỏng cho một thay đổi (theo luật trên) mà không đo được tính năng / thay đổi vừa code (chạy vô ích) thì phải sửa mô phỏng trước (giả định cho quét tầng, "người chơi" dùng tính năng, cột đo, biến thể A/B), theo mục "Mô phỏng phải tái hiện được thay đổi vừa code" ở `simulation.md`.
- **Thêm / sửa mô phỏng phải tối ưu** (chủ project chốt 2026-10-28): làm sao tốn ít thời gian / tài nguyên nhất (đo trước / sau, dùng lại trận đã có, không tính lặp, tối ưu không đổi kết quả), không chỉ viết thêm vào; chi tiết ở mục "Thêm / sửa mô phỏng phải tối ưu" (`simulation.md`).
- **Chạy script mô phỏng là để sửa, không chỉ để xem:** mỗi lần chạy (`npm run simulate`) phải rà số liệu, **tự sửa** chỗ chưa hợp lý / chưa cân bằng (lỗi code, dữ liệu, số cân bằng kể cả số đã chốt, code cũ, luật chơi; không cần hỏi trước) rồi chạy lại để kiểm chứng và báo lại đã đổi gì, theo mục "Dùng kết quả mô phỏng" (`simulation.md`). Giới hạn cứng: `bossMultiplier` luôn ít nhất 2–5.

## Tiến độ và thứ tự làm

- Tiến độ chi tiết: `docs/progress.md` (xong bước nào thì thêm một dòng ngắn ở đó, trỏ tới file luật).
- Thứ tự làm tiếp theo: mục "Thứ tự làm tiếp theo" trong `docs/roadmap/README.md` (đánh dấu **Đã xong** ở đó khi xong). **UI làm sau cùng một lần cho toàn bộ** (chủ project chốt); trong lúc chưa có UI, kiểm tra cân bằng bằng script mô phỏng.
