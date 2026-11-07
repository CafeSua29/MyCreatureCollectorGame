# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong project này. Trả lời và viết comment bằng tiếng Việt; tên biến, hàm, type bằng tiếng Anh.
File này nạp vào mọi phiên nên **giữ gọn**: chỉ tổng quan, kiến trúc, quy tắc chung, quy trình. Không nhồi luật chi tiết vào đây.

**Tài liệu** (mọi điều ghi trong đó đã được chủ project đồng ý, không tự đổi; riêng roadmap là khung):

- `docs/rules/*.md`: luật chơi và quy ước **đã làm** (code phải khớp).
- `docs/roadmap/*.md`: thiết kế đã chốt nhưng **chưa làm**; danh sách, quy ước và **thứ tự làm tiếp theo** ở `docs/roadmap/README.md`. Làm xong thì chuyển luật sang `docs/rules/` và xóa file roadmap.
  - **Roadmap chỉ là khung**: điểm "đã chốt" là hướng đi, không phải khuôn. Thấy chỗ không hợp lý / có cách tối ưu hơn / khớp code hơn thì tự làm theo cách đó (quy tắc "Làm theo cách hợp lý và tối ưu nhất"), cập nhật md (quy tắc 11), báo ngắn chỗ lệch roadmap.
- `docs/index.md`: **mục lục chi tiết** (nội dung, tên mục, code liên quan của từng file). "mục X" / "xem X" trong docs và comment là tên mục trong bảng đó. File lớn: chỉ tra dòng cần (grep), không đọc hết.
- `docs/rules/core-map.md`: **bản đồ module core và Điểm duy nhất** (đọc trước khi viết code core). `docs/progress.md`: tiến độ (kèm `progress-content.md`, `progress-battle.md`).

**Làm mục nào thì đọc file của mục đó trước** (theo mục lục dưới hoặc theo code đang sửa), không cần đọc hết.

## Mục lục `docs/rules/` (tên file, bỏ `.md`)

- **Nền tảng:** architecture (cây thư mục, ESLint, alias, đóng gói, chạy app), core-map, stats-traits (thứ tự tính chỉ số, nguồn %, race / hệ, trait), big-numbers, state (+ state-versions), data (JSON, kiểm tra dữ liệu, chữ theo ngôn ngữ), saves, game-log, testing, ui (Playwright)
- **Nhập nội dung:** content-data (luật chung, sinh map, quy đổi Siralim), content-sources, content-sources-more, content-sources-real (API / wiki), content-sources-temtem (chiêu, trait, trạng thái Temtem), content-mechanics
- **Trận:** battle (2v2, lượt, AI, skill, sát thương, thưởng, bắt), skill-synergy-hold, pokemon-moves, pokemon-moves-flow, battle-forms, move-styles, battle-traits, battle-statuses, battle-environment, transformation (Mega / Dynamax / Tera), z-moves, monster-size, hit-locations (tầm chiêu, bộ phận), element-reactions, cassette-mechanics, stamina, battle-merge (hợp thể), fusion-power, trait-dsl (ngôn ngữ trait, Siralim, minion, Timeline), auto-battle, team (cộng hưởng, trận pháp), partner-skills, skill-mastery, frenzy (cuồng bạo)
- **Thuộc tính quái:** abilities, natures, growth-rates, effort-values, spirit-virus (linh dịch), marks (dấu ấn: sẹo, đột biến, thích nghi, ám ảnh, chiến tích), polarity (Âm / Dương), aptitude (tư chất), species-rank, affinity (thân mật), bloodline (huyết mạch), monster-talents, monster-history, lifespan (tuổi, thọ nguyên, đồng hồ), imprinting (dưỡng dục), skill-books, skill-stickers, evolution-skills, exp-candy
- **Nâng cấp quái:** fusing, breeding-eggs, hatchery (phòng ấp), shiny-boss, bootleg, rogue-fusion (Rogue Fusion, cách tạo Bootleg), rebirth (luân hồi), sacrifice (hiến tế), star-rank (bậc sao), body-refinement (luyện thể), implant (cấy ghép), trait-crystals (extract / inject trait), awakening (thức tỉnh, độ kiếp), human-form (hóa hình), soul-levels (hồn tinh), treasures (thiên tài địa bảo), soul-relics (hồn khí)
- **Ngự thú sư và tiến trình:** tamer (cảnh giới, khế ước, kỹ năng), tamer-talents, achievements (+ danh hiệu), dex, species-research, quests, ascension (phi thăng, thiên mệnh), essences (tinh chất), options (thọ nguyên, chết thật), challenge-modes (độ khó, Nuzlocke...)
- **Thế giới:** world-items (thị trấn, tầng, biome, item, cửa hàng, giá), calendar, events (+ thú triều, chợ đen), zones (hiểm địa, cổng thế giới), trials (bí cảnh, tháp), trial-boons (ân huệ bí cảnh), instability, deities (thần linh, Miếu), world-boss, gathering (câu cá, khai thác), safari-zone, recruit (thu phục), trainers (NPC, đạo quán, giải đấu), starters, expeditions, dwelling (động phủ), sects (tông môn), trades, auction, gacha (Cây thần), alchemy (luyện đan / khí, linh điền), cooking
- **Đồ và kho:** equipment (+ đồ cầm), equipment-sets (bộ trang bị), artifact-spirits (khí linh, Item World), equipment-forge (thợ rèn), roster (đội / kho), capacity, bulk-actions
- **Cân bằng:** balance-numbers (+ balance-content, balance-capture, balance-systems, balance-traits, balance-history), simulation (+ simulation-features)

## Tổng quan

Game **"My creature collector game"**: creature collector / monster catching, đánh theo lượt, chơi offline một người.
Chủ đề chính: **mọi thứ scale vô hạn**. Quái, level, gen, chỉ số fuse không có trần; riêng **số lần fuse của một quái có giới hạn** (mỗi lần phải thêm loài mới vào lineage, mục Fusing), nên càng nhiều loài càng fuse được nhiều lần.
Thế giới chia thành các tầng không trần, tầng sau mạnh hơn; người chơi có thể quay về tầng thấp để farm tiền, EXP, quái nguyên liệu.

## Kiến trúc

Chi tiết (cây thư mục, luật ESLint, alias, đóng gói, chạy app, kiểm tra dữ liệu lúc khởi động): `docs/rules/architecture.md`.

- Electron + Vite + React + TypeScript; test Vitest. **Bản build phải cài và chạy hoàn toàn offline** (đóng gói sẵn mọi thứ, game không gọi mạng lúc chạy); lúc dev / build được dùng mạng thoải mái.
- Dependency dùng lúc chạy phải ở `dependencies`, không ở `devDependencies` (bản exe sẽ báo `Cannot find module`).
- Folder: `src/core` (logic thuần, chia theo tính năng, test cạnh file `x.ts` + `x.test.ts`), `src/data` (JSON, import qua `@data`), `src/main`, `src/preload`, `src/renderer/src` (`features/<tên>/`, `shared/`), `scripts/simulate`, `scripts/data-import`.
- **Mỗi folder core có `index.ts`** xuất những gì folder khác được dùng. Trong core: cùng folder import tới file (`./stats`), khác folder import qua folder (`../monster`), không dùng `@core`.
- **Bên ngoài core chỉ import `@core`** (= `src/core/index.ts`); `@core/testing` chỉ trong file test. **`decimal.js` chỉ được import ở `src/core/shared/big.ts`**.
- ESLint chặn các ranh giới trên và quy tắc code sạch (lint lỗi là chưa xong). Không đặt tên hàm thường bắt đầu bằng `use` (bị hiểu là hook).
- **Thêm tính năng mới:** logic vào folder core phù hợp (hoặc folder mới + `index.ts` + thêm vào `src/core/index.ts`), test cạnh file; UI vào `renderer/src/features/<tên>/`; dùng chung nhiều feature vào `renderer/src/shared/`.
- Lệnh: `npm test`, `npm run typecheck`, `npx eslint .`, `npx prettier --write src scripts/simulate`, `npm run simulate`, `npm run dev` (bỏ `ELECTRON_RUN_AS_NODE` trước khi chạy).
- Style (prettier): nháy đơn, không chấm phẩy, dòng tối đa 100 ký tự.

## Quy tắc kỹ thuật (bắt buộc)

1. **Core là hàm thuần** `(data, state, action) => newState`. Không sửa state cũ. Action không hợp lệ thì throw lỗi riêng (`ActionError`), state giữ nguyên.
2. **RNG có seed** lưu trong state; mọi ngẫu nhiên trong core đi qua RNG này. Cùng state + cùng action cho cùng kết quả.
3. **Không lưu chỉ số cuối cùng vào save**, chỉ lưu "nguyên liệu" (mục Dữ liệu quái). Chỉ số luôn tính lại bằng **một hàm duy nhất** theo mục Thứ tự tính chỉ số.
4. **Data-driven:** loài, race, hệ, trait, skill, vật phẩm, vùng ở `src/data/*.json`; thêm nội dung không phải sửa code. Kiểm tra tham chiếu khi khởi động và trong test.
5. **Trait và hiệu ứng skill dùng registry hook**: cơ chế mới = thêm handler, không viết chuỗi `if/else` theo id.
6. **Công thức sát thương dựa trên tỉ lệ `công / thủ`**, không dùng `công − thủ`.
7. **Đường cong EXP dùng đa thức** (mặc định `level³`; nhóm tăng trưởng ở `growth-rates.md`), không dùng hàm mũ. Level không trần.
8. **Hiển thị số rút gọn** ở UI: 1,2K; 3,4M; 5,6B... (`formatNumber` nhận `number` lẫn `Decimal`).
9. **Save có `version`.** Đổi cấu trúc state: tăng version và viết migrate.
10. **Viết code xong phải viết test ngay trong cùng lượt:**
    - Logic core: unit test cạnh file. Sửa lỗi thì viết test tái hiện trước (đỏ trước khi sửa, xanh sau khi sửa).
    - Logic thuần ở main / renderer: unit test; phần chạm Electron / hệ điều hành thì tách hàm thuần ra để test.
    - UI mới hoặc sửa: lái app thật bằng Playwright, chụp và xem ảnh (mục UI).
    - Mỗi test phủ trường hợp hợp lệ, báo lỗi (`ActionError` / `DataError`, state giữ nguyên) và biên (0, 1, tối đa, **số cực lớn**).
    - Chạy `npm test` và typecheck trước khi báo xong. Không xóa / sửa test cũ cho pass mà không nói rõ lý do.
11. **Luôn cập nhật tài liệu đúng file, ngay trong lượt**: mỗi quyết định chốt với chủ project (chỉ ghi kết luận) và mỗi thay đổi luật chơi, dữ liệu, state, module, quy ước, tiến độ. Luật chơi → `docs/rules/`, chưa làm → `docs/roadmap/`, kiến trúc / quy tắc / quy trình → `CLAUDE.md` (chi tiết kiến trúc → `architecture.md`), bản đồ module → `core-map.md`, tiến độ → `docs/progress.md` (mỗi mục một dòng, trỏ tới file luật), thứ tự làm → `docs/roadmap/README.md`. Sửa / xóa nội dung đã lỗi thời; tài liệu luôn khớp code.
    - **Ưu tiên file md mới theo chủ đề**: cơ chế mới có luật đủ dài thì viết file riêng trong `docs/rules/`, file chung chỉ giữ một dòng trỏ tới; thay đổi nhỏ thì ghi vào file cũ đúng chủ đề. File md quá ~40 KB thì tách theo chủ đề con. Tạo file mới thì thêm tên vào đúng nhóm ở Mục lục file này và dòng chi tiết ở `docs/index.md`.
    - Làm xong một mục roadmap: chuyển luật sang `docs/rules/`, phần chưa làm sang roadmap của mục sau, xóa file roadmap và dòng mục lục của nó.
    - **Việc chưa làm / chờ phải ghi md ngay trong lượt**: ghi vào roadmap của mục sẽ làm nó, kèm **chờ cái gì** và **vì sao**; file luật của phần đã làm ghi một dòng "chưa có: … (chờ X, xem file Y)".
    - Trước khi báo xong: rà mọi file docs liên quan tới code vừa đổi, sửa chỗ còn mô tả cách cũ, không sót việc đang chờ.
12. **Giá trị có thể lớn vô hạn dùng `Decimal`** (`big-numbers.md`). Không để giá trị game ra `Infinity` / `NaN`; so sánh `Decimal` bằng `.eq` / `.lt` / `.gte`..., không bằng `===` / `<`.
13. **JSON dữ liệu không phải nguồn sự thật**: chủ project sửa `src/data` liên tục, số liệu về dữ liệu trong tài liệu có thể cũ (cần chính xác thì đọc thẳng JSON). Code và test không phụ thuộc số lượng, id, giá trị của dữ liệu thật (trừ fixture). Dữ liệu trái luật thì luật thắng: sửa dữ liệu, không sửa code cho khớp (`data.md`).

## Quy tắc code sạch (bắt buộc)

Mục tiêu: thêm nội dung / tính năng mà không sửa nhiều chỗ, đọc lại sau vài tháng vẫn hiểu. Luật kiểm tra tự động được thì đưa vào ESLint; còn lại tự kiểm khi review trước khi báo xong.

**Tái sử dụng trước, viết mới sau**

- Trước khi viết hàm mới, tìm xem đã có chưa (`index.ts` của folder, "Điểm duy nhất" ở `core-map.md`). Có thì dùng, thiếu chút thì mở rộng, không viết bản thứ hai.
- Logic lặp **lần 2** thì cân nhắc, **lần 3** bắt buộc tách hàm chung. Không trừu tượng "để dành" khi mới có một chỗ dùng.
- Code chung: một folder core → file trong folder đó; nhiều folder core → `shared/` hoặc folder đúng chủ đề; nhiều feature UI → `renderer/src/shared/`. Không chép code giữa main và renderer (logic thuần đặt trong core).

**Dễ mở rộng (scale)**: thêm một loại mới (category item, trạng thái, hook, event, biome...) chỉ cần thêm dữ liệu hoặc một mục / handler.

- Loại có nhiều biến thể dùng registry hoặc bảng `Record<Loại, Luật>` một chỗ (`ITEM_CATEGORY_RULES`, `TRAIT_HOOKS`...), để TypeScript báo lỗi khi thiếu mục; `switch` theo union luôn có `assertNever`.
- Loại khác nhau có trường khác nhau thì dùng union phân loại (mỗi loại một interface), không gom một interface nhiều trường `?`. Dữ liệu có trường lạ thì kiểm tra dữ liệu báo lỗi.
- Luật chung theo loại ("nằm đâu / dùng ở đâu / kiểm tra thế nào") trả lời bằng một hàm / bảng duy nhất (`itemStorage`, `assertUsableIn`), nơi khác gọi lại.
- Không giả định chỉ có N loại; danh sách loại là hằng `as const` (`ITEM_CATEGORIES`) dùng cho cả type lẫn kiểm tra lúc chạy.
- Loại đã chốt nhưng chưa làm: được đưa vào type sớm, nhưng kiểm tra dữ liệu phải chặn ("chưa hỗ trợ", kèm tên mục lộ trình).
- State gom trường cùng chủ đề vào object (`inventory: { stacks, crystals }`); mỗi lần đổi vẫn tăng version + migrate.
- Chỉ dựng điểm mở rộng cho thứ **đã chốt sẽ có nhiều loại**.

**Kiểu dữ liệu**: không `any` (dữ liệu chưa rõ kiểu dùng `unknown` rồi kiểm tra); hạn chế `as` (chỉ khi đã kiểm tra, kèm comment); không `!`; `readonly` cho tham số / type không được sửa; hàm public khai báo rõ kiểu trả về; id dễ nhầm dùng kiểu riêng.

**Hàm và file**

- Mỗi hàm một việc, tên nói rõ việc đó; quá ~50 dòng hoặc lồng quá 3 cấp thì tách; quá ~3 tham số thì gom object; ưu tiên return sớm.
- **Tách file theo trách nhiệm, không theo số dòng**: ~300 dòng chỉ là mốc để xem lại; nội dung gắn chặt (registry và kiểu handler, một luồng, một bảng luật) thì để chung.
- Không code chết, code comment lại, `console.log` debug, biến / import thừa.

**Không viết cứng**

- Không số "ma thuật": số cân bằng ở `src/data/*.json`, hằng kỹ thuật đặt tên rõ ở đầu file hoặc `shared/`.
- Không rẽ nhánh theo id nội dung (`if (speciesId === 'xxx')`): dùng dữ liệu hoặc registry.
- Chuỗi hiển thị không viết cứng trong component: hiện ở `renderer/src/shared/lib/labels.ts`, khi làm UI chuyển sang i18n (`docs/roadmap/ui-overhaul.md`), **mọi chữ hiển thị qua i18n**. Chữ nội dung (tên loài, skill, item...) không nằm trong JSON dữ liệu hay core: tra theo id bằng `contentName`.

**Đặt tên**: tiếng Anh đầy đủ nghĩa (`monster` không phải `mon`; vòng lặp ngắn được dùng `i`, `j`); hàm bắt đầu bằng động từ; boolean bắt đầu bằng `is` / `has` / `can`; cùng khái niệm cùng một tên trong toàn project.

**Lỗi**: core ném `ActionError` **mang mã lỗi + tham số** ("Mã lỗi action" ở `state.md`), dữ liệu sai ném `DataError` (câu tiếng Việt, nêu id, giá trị); không `catch` rỗng. Renderer / main bắt lỗi ở ranh giới và hiện cho người chơi, không crash trắng màn hình.

**React**: component chỉ hiển thị và gọi action, **không chứa luật chơi**; component nhỏ, UI lặp ở 2 màn trở lên tách vào `shared/components/`; logic UI phức tạp tách custom hook cạnh component; màu, khoảng cách, cỡ chữ dùng biến CSS chung trong `main.css`.

**Comment**: tiếng Việt, giải thích **vì sao**; luật đặc biệt / chỗ dễ sửa sai ghi kèm tên mục. Hàm public trong core có một dòng JSDoc.

**Khi sửa code**

- **Code cũ không phải khuôn bắt buộc**, **được sửa không cần hỏi trước**: chỗ nào nên sửa (hợp hơn, tối ưu hơn, xung đột code mới) thì sửa luôn, cập nhật test / docs cùng lượt, báo ngắn đã sửa gì, vì sao, test cũ nào đổi.
- **Chưa có save thật nào**: thiết kế state / kiểm tra save chọn cách tối ưu nhất, không chiều save cũ; vẫn tăng version + migrate.
- Tái cấu trúc lớn làm thành bước riêng trong lượt (test cũ xanh trước khi thêm tính năng). Tái cấu trúc thuần: test cũ pass nguyên vẹn. Có đổi hành vi: cập nhật test cũ, nói rõ test nào đổi và vì sao.

## Quy trình làm việc

- **Không cần đưa kế hoạch trước khi code**, trừ khi chủ project yêu cầu.
- **Làm theo cách hợp lý và tối ưu nhất**: luật chơi, con số, cấu trúc, sửa code cũ, lệch roadmap: tự chọn phương án tốt nhất rồi làm luôn, **không bị gò bó** bởi roadmap / md / code cũ, sửa md theo. Cuối tin nhắn liệt kê ngắn các quyết định đã tự chốt. Chỉ hỏi khi thật sự là sở thích của chủ project (hướng nội dung, tên gọi, danh sách nội dung cần duyệt). Gặp điểm chưa chốt khi đang làm dở cũng vậy (con số: số tạm rồi chỉnh theo mô phỏng), không dừng lại chờ.
- **Ưu tiên giống game / tác phẩm / bản gốc nhất có thể** (Pokémon, Siralim, truyện ngự thú, thần thoại...): cơ chế, nội dung, số, tên, hiệu ứng, thời hạn, điều kiện. Chỉ lệch khi bản gốc không áp được (scale vô hạn, xung đột luật đã chốt) hoặc mất cân bằng rõ; khi lệch thì chọn cách gần gốc nhất, ghi chỗ lệch và lý do vào md, báo cuối tin nhắn. Bản gốc cần hệ thống game chưa có thì làm thêm hệ thống / hook, không bỏ bớt. Giới hạn **do game tự đặt** thì bỏ; giới hạn **của chính bản gốc** (trần EV 252 / 510) thì giữ.
- **Làm giống gốc trước, rồi mới áp giới hạn**: không cắt / chỉnh trước vì lo mất cân bằng hay vì lệch thống kê cũ trong tài liệu (chỉ để mô tả, không phải chuẩn). Chỉ áp giới hạn khi có căn cứ cụ thể (mô phỏng, xung đột luật), ở mức nhỏ nhất, ghi lý do vào md.
- **Hai trục của game: scale vô hạn và ngẫu nhiên**: thứ tạo đa dạng giữa các lần gặp thì random (trait quái, quái xuất hiện, dòng đồ, lợi thế boss, đồ rơi, môi trường...); thứ cần ổn định để so sánh thì **không** random (giá đồ, chỉ số gốc loài, công thức, số ghi trên vật phẩm). Thứ do thám / xem trước được thì tung trước rồi lưu, không cố định theo hàm băm. **Mọi kết quả hợp lệ đều có cơ hội** (trọng số > 0, hiếm thì thấp), không cắt nhóm, không tầng tối thiểu / danh sách cố định. Ngoại lệ ở mục "Luật ngẫu nhiên" (`balance-systems.md`).
- **Câu hỏi / đề xuất cần duyệt để cuối tin nhắn**, gom một mục riêng ("Cần bạn trả lời"), đánh số, mỗi mục viết đủ (chỗ sửa, lý do, phương án đề xuất), không rải rác ở trên, không gộp nhiều đề xuất thành một câu "đồng ý không?".
- **Báo cáo ngắn gọn**: chỉ kết quả, quyết định, chỗ lệch, câu hỏi; không liệt kê chi tiết code đã sửa / từng bước. Giữa các bước chỉ một dòng.
- Không hỏi lại điều đã ghi trong tài liệu. Trước khi làm một mục: đọc docs của mục đó và file luật mà code sắp đụng tới.
- **Rà soát phần đã làm trước khi bắt đầu mục mới**: so code các phần mục mới dựa vào / đụng tới với `CLAUDE.md` và `docs/rules/` hiện tại (luật chơi, cấu trúc, quy tắc kỹ thuật, code sạch); chỗ thiếu / lệch / thiết kế chưa hợp thì sửa luôn (kèm test, docs). Báo ngắn kết quả rà soát (hoặc "không thấy chỗ lệch").
- Xong việc: chạy `npm test`, `npm run typecheck`, eslint, prettier; cập nhật tài liệu (quy tắc 11).
- **Mô phỏng** (`simulation.md`):
  - **Chỉ chạy khi cần**: khi thay đổi có thể đổi cân bằng (luật / số trong trận, thưởng, tiến trình, kinh tế, độ khó) và chỉ chạy phần đo được nó (`--parts`). Không chạy cho UI, chữ, tài liệu, tái cấu trúc thuần, kiểm tra dữ liệu / save. Kịch bản đầy đủ chỉ khi đổi số dùng chung (chỉ số, sát thương, EXP, boss) hoặc khi chủ project yêu cầu.
  - **Phải tái hiện được thay đổi vừa code**: không đo được thì sửa mô phỏng trước (giả định, "người chơi" dùng tính năng, cột đo, biến thể A/B).
  - **Thêm / sửa mô phỏng phải tối ưu** thời gian / tài nguyên (đo trước / sau, dùng lại trận, không tính lặp).
  - **Chạy là để sửa**: rà số liệu, tự sửa chỗ chưa hợp lý (code, dữ liệu, số cân bằng kể cả số đã chốt, luật) rồi chạy lại kiểm chứng, báo đã đổi gì. Giới hạn cứng: `bossMultiplier` luôn ít nhất 2–5.
- Tiến độ: `docs/progress.md`. Thứ tự làm: mục "Thứ tự làm tiếp theo" ở `docs/roadmap/README.md` (đánh dấu **Đã xong** khi xong). **UI làm sau cùng một lần cho toàn bộ**; trong lúc chưa có UI, kiểm tra cân bằng bằng mô phỏng.
