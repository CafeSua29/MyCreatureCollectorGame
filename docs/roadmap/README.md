# Lộ trình tiếp theo

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Các tính năng đã quyết định sẽ làm. Mục ghi "đã chốt thiết kế" thì làm theo mô tả, nhưng roadmap chỉ là khung: thấy chỗ không hợp lý / có cách tốt hơn / khớp code hơn thì tự làm theo cách hợp lý, tối ưu nhất, xong cập nhật md (luật "Roadmap chỉ là khung" và "Làm theo cách hợp lý và tối ưu nhất" ở `CLAUDE.md`, chủ project chốt 2026-10-25); mục còn "Cần chốt" thì tự chốt phương án tốt nhất (chỉ hỏi khi là sở thích của chủ project, ví dụ danh sách nội dung). Không cần đưa kế hoạch trước (chỉ khi chủ project yêu cầu). Thứ tự làm theo mục "Thứ tự làm tiếp theo" ở cuối file này. Làm xong mục nào thì chuyển luật của mục đó vào file tương ứng trong `docs/rules/` (hoặc tạo file mới và thêm vào Mục lục của `CLAUDE.md`), rồi xóa file roadmap của mục đó.

> **Ghi nhớ (tái cấu trúc tài liệu sau này):** dữ liệu mẫu / khởi tạo (danh sách trait, chỉ số loài, các con số tạm...) **không để trong file md mà để trong JSON** (`src/data/*.json`). Sau này tài liệu khởi tạo của project chỉ gồm file md (luật, quy ước, quyết định) và data JSON. Dữ liệu mẫu đang ghi trong tài liệu (mục "Số tạm hiện có" ở `docs/rules/balance-numbers.md`...; danh sách trait race đã chuyển vào `races.json` / `traits.json` ở bước 6.3) là tạm thời: khi làm tính năng thì đưa vào JSON rồi xóa khỏi md, chỉ giữ lại luật.

## Danh sách lộ trình

- [build-release.md](docs/roadmap/build-release.md): Build & phát hành đa nền tảng
- [biome-content.md](docs/roadmap/biome-content.md): Nội dung loài còn chờ: tiến hóa cần vật phẩm chưa có (Monster Sanctuary, Yaoling, Yo-kai), cân nặng thật còn thiếu, rà race loài mặc định
- [evolution-content.md](docs/roadmap/evolution-content.md): Nội dung tiến hóa có điều kiện còn chờ (tiến hóa đặc biệt Pokémon, loài dị biến, Dị Biến Thạch)
- [move-styles.md](docs/roadmap/move-styles.md): Thế mạnh / thế nhanh: 5 chiêu Legends: Arceus chưa nhập (chờ hiệu ứng mới)
- [tamer-specializations.md](docs/roadmap/tamer-specializations.md): Chuyên môn ngự thú sư (Siralim Ultimate: chọn lớp, perk và kỹ năng riêng theo lớp, xức dầu mượn perk)
- [trial-boons.md](docs/roadmap/trial-boons.md): Ân huệ trong lượt bí cảnh / tháp (Dinotica: chọn 1 trong 3 buff tạm sau mỗi trận)
- [challenge-extras.md](docs/roadmap/challenge-extras.md): Phần còn lại của độ khó / chế độ thử thách (mô phỏng Nuzlocke)
- [settings.md](docs/roadmap/settings.md): Cài đặt
- [theme.md](docs/roadmap/theme.md): Theme
- [ui-overhaul.md](docs/roadmap/ui-overhaul.md): Toàn bộ UI, Đa ngôn ngữ: phần UI

## Thứ tự làm tiếp theo

Làm lần lượt theo thứ tự dưới đây (đã được chủ project giao cho Claude tự sắp, có thể đổi khi chủ project yêu cầu). Điểm cần chốt trong mỗi bước thì tự chốt theo cách hợp lý nhất, báo cuối tin nhắn (quy trình làm việc). Xong bước nào thì đánh dấu trong Tiến độ. Lý do thứ tự: làm nền tảng và các thay đổi kiểu dữ liệu / state lớn trước (sửa sau tốn hơn), có công cụ cân bằng sớm, thêm core tính năng theo thứ tự phụ thuộc; **UI làm sau cùng một lần cho toàn bộ** (chủ project chốt). Trong lúc chưa có UI, kiểm tra cân bằng bằng script mô phỏng.

1. **Việc nhỏ trong Tiến độ** (**đã xong**): kiểm tra số trong `validateGameState`; bỏ shiny khỏi chỉ số; trait cấp tuyến tính; đổi tên game; breeding mẹ fuse; điều kiện fuse theo loài; thua trận về thị trấn; kiểm tra tiến hóa giữ race; luật ESLint + `assertNever`. (Tự `leaveBattle` làm cùng màn trận đấu ở bước 7.)
2. **Chuyển sang `Decimal`** (mục "Số lớn"). **Đã xong.**
3. **Nền tảng dữ liệu cho lộ trình:**
   1. **Item: mô hình chung** (đổi `inventory`, `category`): trang bị, tinh thể, cửa hàng, event đều dựa vào. **Đã xong.**
   2. **Vùng tầng N** (biome, `location` kiểu tầng, `highestFloor`, `challengeBoss`): thay hệ vùng trước khi làm UI bản đồ. **Đã xong.**
   3. **Phần core / dữ liệu của Đa ngôn ngữ**: tách chữ khỏi JSON dữ liệu sang file theo ngôn ngữ, `ActionError` dùng mã lỗi + tham số. Làm sớm để mọi nội dung và lỗi thêm sau đã đúng cấu trúc, không phải sửa lại hàng loạt (phần UI của đa ngôn ngữ làm ở bước 7). **Đã xong.**
   4. **Đưa toàn bộ dữ liệu nhập vào game** (`content-data.md`): skill đánh nhiều lần, trường `formOf` / `formKind` / `origin` / `source`, chạy kiểm tra dữ liệu. **Đã xong** (gán loài vào biome tách thành mục nội dung "Gán loài vào biome").
4. **AI trận đấu** (thay chọn ngẫu nhiên của quái hoang). Cần cho script mô phỏng và tự động đánh. **Đã xong.**
5. **Script mô phỏng cân bằng.** Chạy để kiểm tra các số tạm. **Đã xong** (chủ project chốt giữ nguyên `config.ai`, độ khó boss tầng và giá fuse; xem `balance-numbers.md`).
   - **5b. Mở rộng script mô phỏng: lên level + tối ưu tốc độ.** **Đã xong** (luật ở `simulation.md`).
   - **5c. Hiệu ứng môi trường trong trận** (3 giai đoạn: thời tiết + địa hình → hiệu ứng theo phe → hiệu ứng toàn sân). **Đã xong** cả 3 giai đoạn kèm nội dung (luật ở mục "Môi trường" của `battle-environment.md`).
   - **5d. Map ngẫu nhiên theo tầng và môi trường của map.** **Đã xong** (kèm gán loài vào map; luật ở "Tầng và biome" của `world-items.md`, "Môi trường" của `battle-environment.md`, "Dữ liệu map ngẫu nhiên theo tầng" của `content-data.md`).
6. **Core của các tính năng lộ trình** (chỉ core + test, **chưa làm UI**), theo thứ tự phụ thuộc:
   1. Trạng thái bất thường (kèm Thuốc giải, vật phẩm ném). **Đã xong.**
   2. Cửa hàng (mua / bán) + Vứt vật phẩm. **Đã xong.**
      2b. Fuse thất bại và bùa fuse. **Đã xong** (bùa ở chợ đen đã thêm ở bước 5l+.11).
   3. Trait theo race. **Đã xong.**
      3b. Hook trait chờ làm (9 nhóm theo pha, chủ project chốt làm ngay sau trait race). **Đã xong** cả 9 nhóm (nhóm 9 trait Siralim: luật ở `trait-dsl.md`).
   4. Loài không giới tính. **Đã xong** (làm cùng bước 3.4).
   5. Trang bị và đồ cầm (cần item, trạng thái; kèm `aiHints` cho AI boss). **Đã xong** (kèm trait / spell Siralim hoãn tới mục này).
      5b. Biến hình trong trận: Mega, Dynamax / Gigantamax, Tera. **Đã xong** (luật ở `docs/rules/transformation.md`).
      5c. Tuổi và thọ nguyên. **Đã xong** (luật ở `docs/rules/lifespan.md`: đồng hồ theo giờ, `DAILY_TASKS`, `LIFESPAN_MODIFIERS`).
      5c2. Lý lịch quái. **Đã xong** (luật ở `docs/rules/monster-history.md`; mốc của tính năng chưa làm có sẵn trong type, tính năng đó tự gọi `addMilestone`).
      5c3. Giá thị trường động. **Đã xong** (luật ở "Giá thị trường động" của `world-items.md`).
      5c4. Kẹo EXP và Kẹo Hiếm. **Đã xong** (luật ở `docs/rules/exp-candy.md`).
      5d. Ngự thú sư và khế ước. **Đã xong** (luật ở `docs/rules/tamer.md`).
      5e. Độ thân mật. **Đã xong** (luật ở `docs/rules/affinity.md`).
      5e2. Dưỡng dục. **Đã xong** (luật ở `docs/rules/imprinting.md`).
      5f. Tiến hóa có điều kiện. **Đã xong** (luật ở mục "Tiến hóa có điều kiện" của `docs/rules/evolution-skills.md`; nội dung chờ ở `evolution-content.md`).
      5g. Cộng hưởng đội và trận pháp + Hợp kích kỹ. **Đã xong** (luật ở `docs/rules/team.md`).
      5h. Độ thuần thục skill. **Đã xong** (luật ở `docs/rules/skill-mastery.md`).
      5h2. Cộng hưởng skill và thời gian chờ. **Đã xong** (luật ở `docs/rules/skill-synergy-hold.md`; thần thông hold 2 làm cùng `awakening.md`).
      5h3. Thế mạnh / thế nhanh. **Đã xong** (luật ở `docs/rules/move-styles.md`; 5 chiêu Legends: Arceus chờ hiệu ứng mới ở `move-styles.md`; 3 chiêu tutor đã nhập ở bước 5k).
      5i. Tính cách. **Đã xong** (luật ở `docs/rules/natures.md`; Bạc Hà ở chợ đen đã có ở bước 5l+.11, nấu ở Đầu bếp đã có ở 6k, `cooking.md`).
      5j. Phẩm cấp tư chất. **Đã xong** (luật ở `docs/rules/aptitude.md`; dùng cho thành tựu đã làm ở 8b, `docs/rules/achievements.md`, đối thủ NPC chờ UI, `docs/rules/trainers.md`).
      5j2. Phẩm cấp loài. **Đã xong** (luật ở `docs/rules/species-rank.md`; chỗ dùng ở Dex / gacha / khu bảo tồn / thu phục / thành tựu / trao đổi NPC / mở khóa quái khởi đầu ghi ở roadmap của từng mục).
      5k. Sách kỹ năng. **Đã xong** (luật ở `docs/rules/skill-books.md`; chợ đen đã có ở bước 5l+.11, bí cảnh đã làm ở `docs/rules/trials.md`, đấu giá đã làm ở `docs/rules/auction.md`, thần thông không có sách chờ `awakening.md`).
      5k2. Kế thừa skill khi fuse. **Đã xong** (luật ở mục "Kế thừa skill" của `docs/rules/fusing.md`; thần thông chờ `awakening.md`, ô nhân hình đã làm ở `docs/rules/human-form.md`).
      5l. Kỹ năng đồng hành. **Đã xong** (luật ở `docs/rules/partner-skills.md`; hiệu ứng tỉ lệ event / sức thám hiểm / tỉ lệ luyện đan chờ ba hệ thống dưới).
      **5l+. Làm ngay sau 5l** (chủ project chốt 2026-10-24: làm luôn ba hệ thống mà kỹ năng đồng hành còn chờ, kèm mọi phần phụ thuộc chưa có), theo thứ tự phụ thuộc; các bước này được kéo lên trước 5m, ở danh sách dưới chỉ còn dòng trỏ về đây:
      1. Thức tỉnh và độ kiếp. **Đã xong** (luật ở `docs/rules/awakening.md`; Thức tỉnh đan qua luyện đan chờ bước 4, Hiện nguyên hình trong độ kiếp chờ bước 2).
      2. Hóa hình. **Đã xong** (luật ở `docs/rules/human-form.md`; Hóa Hình Đan qua luyện đan chờ bước 4, phản tổ đã làm ở `docs/rules/bloodline.md`).
      3. Thiên tài địa bảo. **Đã xong** (luật ở `docs/rules/treasures.md`; nguồn luyện đan / linh điền chờ bước 4, chợ đen đã có ở bước 11).
      4. Luyện đan và linh điền. **Đã xong** (luật ở `docs/rules/alchemy.md`; chợ đen bán đan phương đã có ở bước 11; dược liệu theo biome dùng chung `wildDrops`).
      5. Bảng nhiệm vụ. **Đã xong** (luật ở `docs/rules/quests.md`; nhiệm vụ tông môn ở `docs/rules/sects.md`).
      6. Phái quái đi thám hiểm. **Đã xong** (luật ở `docs/rules/expeditions.md`; thưởng trứng hiếm đã thêm 2026-10-25, Bí Cảnh Lệnh đã thêm ở bước 9, động phủ dùng lại `assignment` ở `dwelling.md`).
      7. Tự động đánh. **Đã xong** phần core (luật ở `docs/rules/auto-battle.md`; vòng lặp ở UI bước 7; AI chọn quái thay / đổi quái đã làm ở bước 8).
      8. Đấu với ngự thú sư NPC. **Đã xong** (luật ở `docs/rules/trainers.md`; Kẻ lạ thách đấu đã có ở bước 11, hiển thị tư chất NPC chờ UI).
      9. Bí cảnh và tháp thí luyện. **Đã xong** (luật ở `docs/rules/trials.md`; Bí Cảnh Lệnh ở chợ đen đã có ở bước 11, Hồn tinh trong rương chờ bước 10, luật `levelCap` hoãn).
      10. Hồn tinh. **Đã xong** (luật ở `docs/rules/soul-levels.md`; hồn tinh trong thưởng thú triều đã có ở bước 11).
      11. Hệ thống event + hiệu ứng đồng hành `eventChancePercent` (race spirit đổi sang tỉ lệ event). **Đã xong** (luật ở `docs/rules/events.md`; chữ mô tả / màn hình event chờ UI, event theo ngày đêm đã có ở bước 5t, `calendar.md`).
          5m. Bản mệnh thú. **Đã xong** (luật ở mục "Bản mệnh thú" của `docs/rules/tamer.md`; chặn hiến tế / cấy ghép / trao đổi NPC do mục đó tự gọi `assertNotBond`).
          5n. Hồn phách và hồn khí. **Đã xong** (luật ở `docs/rules/soul-relics.md`; cấy ghép thất bại lần 3 gọi `dieForever` đã làm ở 6c, sức chứa túi đã làm (`capacity.md`), phân giải hồn khí xong ở 5o).
          5o. Cường hóa, tẩy luyện, phân giải trang bị. **Đã xong** (luật ở `docs/rules/equipment-forge.md`; tẩy luyện đổi thành tung lại mọi dòng phụ không khóa; khí linh / Khí giới bí cảnh làm ở 7g, `docs/rules/artifact-spirits.md`).
          5p. Cuồng bạo. **Đã xong** (luật ở `docs/rules/frenzy.md`; chủ project chốt 2026-10-25: quái có chủ chỉ race khó kiểm soát mới cuồng bạo và mất điều khiển; boss thế giới đã làm ở 7f, `world-boss.md`).
          5q. Thu phục. **Đã xong** (luật ở `docs/rules/recruit.md`).
          5q2. Khu bảo tồn. **Đã xong** (luật ở `docs/rules/safari-zone.md`; sức chứa kho đã làm, `capacity.md`).
          5q3. Bắt trượt tăng tỉ lệ lần sau. **Đã xong** (luật ở mục "Bắt quái" của `docs/rules/battle.md`).
          5r. Thiên phú quái. **Đã xong** (luật ở `docs/rules/monster-talents.md`).
          5s. Kích cỡ quái. **Đã xong** (luật ở `docs/rules/monster-size.md`; quái lớn suy ra từ cân nặng ≥ 1000 kg thay cho danh sách duyệt tay).
          5s2. Song thú hợp thể. **Đã xong** (luật ở `docs/rules/battle-merge.md`; hành động 2 lần mỗi lượt khác quái lớn vì thực thể là hai quái thật).
          5t. Ngày đêm và mùa. **Đã xong** (luật ở `docs/rules/calendar.md`; thêm tuần trăng cho Ursaluna, điều kiện `hourRange` cho mogwai, tháp thí luyện ngoài lịch).
          5u. Linh dịch. **Đã xong** (luật ở `docs/rules/spirit-virus.md`; tỉ lệ nhiễm / lây theo Pokérus gốc thay cho số tạm của roadmap).
          5v. Âm / Dương hóa. **Đã xong** (luật ở `docs/rules/polarity.md`; quái hoang / boss có cực theo tầng đang đánh thay cho `highestFloor`).
   6. Extract / inject trait. **Đã xong** (2026-10-31; luật ở `docs/rules/trait-crystals.md`; tinh thể rơi đồ để sau).
      6b. Hiến tế. **Đã xong** (2026-10-31; luật ở `docs/rules/sacrifice.md`; độ thuần không vượt độ thuần cao hơn của hai quái thay cho cộng thẳng; chặn quái khóa đã làm ở bước 11b, `roster.md`.md`, bộ lọc hàng loạt ở `bulk-actions.md`).
6c. Phòng Thí Nghiệm: cấy ghép (`implant`). **Đã xong** (2026-10-31; luật ở `docs/rules/implant.md`; bậc huyết thanh ở `balance.json`thay`serums.json`, bản mệnh cấy được (chết thì đạo thương), kết quả qua mốc lý lịch thay log riêng; huyết thanh hiệu ứng + registry `SERUM_EFFECTS` làm ngay sau (5 hiệu ứng theo hook có sẵn, cấp có dấu); hỏi khi túi đầy đã làm cùng sức chứa (`docs/rules/capacity.md`, 2026-10-31, save v77)).
6d. Huyết mạch và Phản tổ. **Đã xong** (2026-10-31, làm trước hiến tế; luật ở `docs/rules/bloodline.md`; phần hiến tế cộng độ thuần đã làm ở 6b, `sacrifice.md`).
6e. Thức tỉnh và độ kiếp. **Đã xong** ở bước 5l+.1 (luật ở `docs/rules/awakening.md`).
6f. Hóa hình. **Đã xong** ở bước 5l+.2 (luật ở `docs/rules/human-form.md`).
6g. Thiên tài địa bảo. **Đã xong** ở bước 5l+.3 (luật ở `docs/rules/treasures.md`).
6h. Luyện đan và linh điền. **Đã xong** ở bước 5l+.4 (luật ở `docs/rules/alchemy.md`).
6i. Ấp trứng có hoàn cảnh. **Đã xong** (2026-10-31; luật ở mục "Ấp trứng có hoàn cảnh" của `docs/rules/breeding-eggs.md`; Ôn Dưỡng Lò là bùa mua ở cửa hàng thay `keyItem`, linh địa theo hệ chủ đạo của map, gen +2% mỗi viên thay 10% theo mô phỏng).
6j. Hồn tinh. **Đã xong** ở bước 5l+.10 (luật ở `docs/rules/soul-levels.md`).
6k. Linh thực. **Đã xong** (2026-10-31; luật ở `docs/rules/cooking.md`; nguồn % `meal`chỉ trong trận như thưởng sưu tập; % thân mật chỉ khi thắng trận; thêm công thức nấu mồi dụ; kỹ năng đồng hành nấu ăn chưa có).
6l. ~~Bánh breed~~: **bỏ khỏi kế hoạch** (chủ project chốt 2026-10-31; xóa`breeding-cakes.md`).
6m. Luân hồi quái. **Đã xong** (2026-10-31; luật ở `docs/rules/rebirth.md`; hồi đầy máu khi luân hồi, gen +10% ít nhất +1, đan rơi 10% từ boss tầng / chợ đen / luyện đan cấp 8).
6n. Câu cá và khai thác. **Đã xong** (2026-11-01; luật ở `docs/rules/gathering.md`; dụng cụ là bùa cấp mua một lần thay `keyItem`, quái suy từ loài của map theo hệ / nhóm race thay bảng `fishingTable` từng map, bảng vật phẩm chung ở config có món theo hệ map, lần không có trận chỉ tốn giờ, không đếm thời hạn theo trận).
   7. Tự động đánh. **Đã xong** phần core ở bước 5l+.7 (luật ở `docs/rules/auto-battle.md`).
      7b. Đấu với ngự thú sư NPC. **Đã xong** ở bước 5l+.8 (luật ở `docs/rules/trainers.md`).
      7c. Bí cảnh và tháp thí luyện. **Đã xong** ở bước 5l+.9 (`docs/rules/trials.md`).
      7d. Độ bất ổn tầng. **Đã xong** (2026-11-01; luật ở `docs/rules/instability.md`; thuộc tính là luật `trialRules.json` có khối `instability` thay file `instabilityProperties` riêng, luật mới dùng được cả ở bí cảnh; tăng mức giữ thuộc tính cũ; giá đổi tuyến tính theo mức).
      7e. Thần linh và ân sủng. **Đã xong** (2026-11-01; luật ở `docs/rules/deities.md`; chúc phúc lặp lại theo vòng thay `{ rank, effects }`, thần gán theo kiểu môi trường của map, một thần mỗi hệ; danh sách 19 thần và thần của map hiểm địa theo hệ chủ đạo chủ project duyệt 2026-11-01).
      7f. Boss thế giới. **Đã xong** (2026-11-01; luật ở `docs/rules/world-boss.md`; ngưỡng bậc theo bội số máu thường của boss thay cho ngưỡng theo tầng, boss tất định theo seed của lần xuất hiện, `bossMultiplier` 1,5 theo mô phỏng).
      7g. Khí linh và Khí giới bí cảnh. **Đã xong** (2026-11-01; luật ở `docs/rules/artifact-spirits.md`; kho khí linh là `inventory.spirits` thay `GameState.spiritStorage`, khí linh / tầng đã qua là trường tùy chọn của món, thêm `softCap` cho hiệu ứng có trần tự nhiên, nuôi bằng yêu đan / hồn phách, Khí giới bí cảnh dùng `GameState.trial` union `TrialRun`, độ dốc tầng 1 / tầng + 0,5 / cấp theo mô phỏng).
   8. Bộ sưu tập (Dex). **Đã xong** (luật ở `docs/rules/dex.md`; màn hình Dex chờ UI).
      8b. Thành tựu và danh hiệu. **Đã xong** (2026-11-01; luật ở `docs/rules/achievements.md`; thưởng nhận bằng action `claimAchievement` thay cho tự cộng kèm log, bộ đếm chỉ cho việc không suy ra được từ state, danh hiệu đạo quán / giải đấu / tháp qua thành tựu, danh hiệu chỉ có kênh %, không % chỉ số).
      8c. Mở khóa quái khởi đầu. **Đã xong** (2026-11-01; luật ở mục "Mở khóa xuyên save" của `docs/rules/starters.md`; điều kiện dùng chung registry điều kiện thành tựu thay bộ điều kiện riêng, mở theo chuỗi đã sở hữu là cờ `unlockOwnedLines`, điều kiện `ascensions` đã có ở 12d).
      8d. Nghiên cứu loài. **Đã xong** (2026-11-01; luật ở `docs/rules/species-research.md`; mẫu nhiệm vụ trong `balance.json` thay file riêng, cấp suy ra từ bộ đếm không lưu, không log lên cấp, Bùa Lấp Lánh / danh hiệu qua thành tựu `researchCompleted`, thưởng cấp (Kẹo Hiếm) nhận bằng action, thêm lợi ích mở điểm yếu ở cấp 6).
   9. Bảng nhiệm vụ. **Đã xong** ở bước 5l+.5 (luật ở `docs/rules/quests.md`).
      9b. Phái quái đi thám hiểm. **Đã xong** ở bước 5l+.6 (luật ở `docs/rules/expeditions.md`).
      9c. Động phủ. **Đã xong** (2026-11-01; luật ở `docs/rules/dwelling.md`; hiệu ứng công trình là union theo `type` thay `output` chung, Tàng thư các ra sách kỹ năng theo map thay Bí kíp, vận chuyển là hệ số dùng ở mọi công trình, bậc đầu chỉ tốn tiền, Linh trì đổi tên Linh tuyền vì trùng chỗ nuôi khí linh).
      9d. Cây thiên phú ngự thú sư. **Đã xong** (2026-11-02; luật ở `docs/rules/tamer-talents.md`; điểm không lưu mà suy từ nguồn, hiệu ứng là kênh thưởng chung với danh hiệu, tẩy bằng action riêng tiêu Hoàn Nguyên Đan).
      9e. Tông môn. **Đã xong** (2026-11-02; luật ở `docs/rules/sects.md`; 15 tông, đồng môn NPC có tên / chức vị / tích cống hiến theo ngày, luận võ, thi thăng chức đấu giám khảo, tông chiến, điểm thiên phú ngự thú sư thưởng lưu ở `tamer.bonusTalentPoints`).
      9f. Trao đổi với NPC. **Đã xong** (2026-11-02; luật ở `docs/rules/trades.md`; quái nhận thế chỗ quái đưa nên không cần chỗ trống, + 50% EXP như Pokémon, NPC dùng chung tên với tông môn).
   10. Cây thần (gacha trứng). **Đã xong** (2026-11-02; luật ở `docs/rules/gacha.md`; trọng số loài mặc định theo phẩm cấp với `gachaWeight` là ghi đè thay vì khai từng loài, loài không giới tính ra được, điểm xuất phát trọng số trait bằng quái hoang).
   11. Sức chứa kho quái / túi trang bị + thao tác hàng loạt. Sức chứa **đã xong** (2026-10-31, làm sớm cùng cấy ghép; luật ở `docs/rules/capacity.md`); thao tác hàng loạt **đã xong** (2026-11-03; luật ở `docs/rules/bulk-actions.md`; bán có xem trước tổng tiền ở core, bộ lọc cấp áp cho cả trang bị).
       11b. Khóa quái, yêu thích, đội hình mẫu. **Đã xong** (2026-11-02; luật ở `docs/rules/roster.md`; làm cùng Bí kíp ở Tàng Bảo Các; khóa còn chặn fuse / cấy ghép có thể mất quái; thứ thiếu ghi log ngoài trận `presetMissing`, `game-log.md`).
       11c. **Tính năng lấy từ game khác** (chủ project chốt 2026-11-03), theo thứ tự phụ thuộc: luật trận dùng chung trước (đổi cân bằng nhiều, mô phỏng sớm), sticker sau thể lực (có thuộc tính giảm thể lực), Bootleg sau sticker (tăng tỉ lệ thuộc tính), thoái hóa sau Bootleg (giữ hệ Bootleg), ân huệ bí cảnh sau thể lực (ân huệ hồi thể lực):
       1. Phản ứng hệ. **Đã xong** (2026-11-03; luật ở `docs/rules/element-reactions.md`; dùng lại đổi hệ tạm của Soak thay `transmutedElementId`, một mục nhiều cặp thay một mục mỗi cặp, thêm trạng thái đổi mục tiêu / dẫn hệ; chủ project yêu cầu thêm: ba hệ Thủy tinh / Nhựa / Kim tuyến, đủ mọi cặp trên bảng 22 hệ, save v103; chiêu gốc chưa nhập ghi ở `element-reactions.md`).
       2. Thể lực cho skill. **Đã xong** (2026-11-05; luật ở `docs/rules/stamina.md`; làm trước vì tường của Cassette Beasts cần; lưu phần đã mất ở bản ghi trận thay `BattleFighter.stamina`, 1 AP của Cassette Beasts = 10 thể lực; trait Phereon dựa trên AP / mana đã xong 2026-11-06, `content-sources-real.md`; giá theo game gốc (PP, Charges, mana), giá suy ra theo hiệu ứng, chiêu / trait / trạng thái Temtem đã xong 2026-11-06, `content-sources-temtem.md`).
       3. Sticker skill. **Đã xong** (2026-11-07; luật ở `docs/rules/skill-stickers.md`; thuộc tính quy đổi đủ bảng gốc, cả thuộc tính cần hệ thống mới qua hook trait / registry; nhập Smack / Spit; save v112; tẩy luyện sticker ở Thợ rèn, bộ đếm EXP theo chiêu cho thuộc tính Exp làm cùng đợt).
       4. Dấu ấn trên quái. **Đã xong** (2026-11-07; luật ở `docs/rules/marks.md`; dấu theo đối tượng là một mục cho cả loại đối tượng với chỗ giữ `$target` thay vì một mục mỗi đối tượng; thêm điều kiện DSL `species` / `skillBodyPart`; đối tượng `status` chỉ là debuff, môi trường tách thời tiết / địa hình; save v113).
       5. Biến thể Bootleg. **Đã xong** (2026-11-07, làm sớm cùng sticker; luật ở `docs/rules/bootleg.md`; save v112; mốc thưởng sưu tập làm bằng thành tựu có bậc; tỉ lệ theo độ bất ổn / thú triều; không có đá đổi hệ vì gốc không có; cùng đợt làm Rogue Fusion và mọi cách tạo Bootleg của gốc, `docs/rules/rogue-fusion.md`).
       6. Thoái hóa. **Đã xong** (2026-11-07; luật ở `docs/rules/evolution-skills.md` mục "Thoái hóa"; luật đổi loài chung `changeSpecies` cho tiến hóa / thoái hóa / phản tổ (phản tổ nhờ đó giữ Bootleg, kiểm tra ô đội); quái khóa vẫn thoái hóa được; không món nào phải tháo vì món khóa race lắp theo cả chuỗi tiến hóa; giá `devolutionCostPerLevel` 50 × level; save v114).
       7. Bậc sao. **Đã xong** (2026-11-07; luật ở `docs/rules/star-rank.md`; lưu tổng số bản `starCopies` thay số sao nên bản thừa giữ làm tiến độ, bỏ lỗi thiếu nguyên liệu; giá chỉ trả khi lên sao; save v115).
       8. Bộ trang bị. **Đã xong** (2026-11-07; luật ở `docs/rules/equipment-sets.md`; đủ 23 rune set Summoners War kể cả Seal / Intangible; món bộ đặt tên rơi bằng tỉ lệ riêng sau khi tung bậc thay `setPieceWeight`, không phụ thuộc danh sách rơi của map; hook nhân số lần kích hoạt thay khai báo không cộng dồn; giảm số món cần lấy lớn nhất; save v116).
       9. Ân huệ trong lượt bí cảnh (`trial-boons.md`).
       10. Chuyên môn ngự thú sư (`tamer-specializations.md`; sau ân huệ vì dùng chung loại hiệu ứng hook trận theo phe).
   12. Hệ thống event. **Đã xong** ở bước 5l+.11 (luật ở `docs/rules/events.md`).
       12b. Đấu giá hành. **Đã xong** (2026-11-03; luật ở `docs/rules/auction.md`; ký gửi lấy giá bán ở cửa hàng làm mốc thay giá gốc để không in tiền, giá khởi điểm = 100% giá trị, lô trang bị tách thường / unique, bể đồ hiếm dùng chung với chợ đen).
       12c. Độ khó và chế độ thử thách. **Đã xong** (2026-11-03; luật ở `docs/rules/challenge-modes.md`; khu Nuzlocke gồm cả hiểm địa (`zone:<id>`), bí cảnh / tháp không có lượt gặp; boss giữ loài khi Randomizer (đồ rơi / mở tầng tra theo loài); Hardcore không đổi seed khi mở; Randomizer xáo learnset qua dữ liệu của game `gameDataFor`; độ khó đổi sang % level + `expPercent` theo mô phỏng; phần còn lại (mô phỏng Nuzlocke) ở `challenge-extras.md`, làm khi có lối chơi cẩn thận trong mô phỏng).
       12d. Phi thăng + Thiên mệnh. **Đã xong** (2026-11-03; luật ở `docs/rules/ascension.md`; giá trị cao nhất suy bằng `max` với mốc lúc phi thăng thay cho cập nhật liên tục, chọn thiên mệnh là action riêng sau `ascend`, bớt ô đội qua dữ liệu của game `gameDataFor`, Đan Đạo Kỳ Tài đổi mặt hại sang luyện khí vì thọ nguyên mặc định tắt).
   - Sau mỗi mục: chạy lại script mô phỏng, **dựa vào số liệu sửa chỗ chưa hợp lý / chưa cân bằng** rồi chạy lại để kiểm chứng (mục "Dùng kết quả mô phỏng" ở `simulation.md`), không chỉ báo số.
7. **Toàn bộ UI (làm sau cùng)**: mọi màn cho mọi hệ thống đã có core, kèm **Theme** (mục cùng tên trong Lộ trình) và **Đa ngôn ngữ: phần UI** (trong `docs/roadmap/ui-overhaul.md`). Thay màn tạm "Đội của bạn". Trước khi code UI: đưa thiết kế tổng (bản đồ màn hình, bố cục ASCII, luồng thao tác) cho chủ project duyệt.
8. **Thiết lập build đa nền tảng** (mục "Build & phát hành": cấu hình electron-builder, icon, lệnh build, log lỗi, phiên bản, thư mục save theo kiểu bản build). Chủ project chốt làm sau toàn bộ UI, trước khi build bản phát hành.
9. **Build bản phát hành** cho Windows, Linux, macOS và kiểm tra từng bản (mục "Build & phát hành").

- **Nội dung** (thêm loài, race, skill, biome trong JSON): làm xen kẽ khi cần, luôn hỏi chủ project trước khi thêm nội dung mới. Việc đang chờ: tiến hóa cần vật phẩm chưa có, cân nặng tên chung, rà race (`docs/roadmap/biome-content.md`; nhập loài mới theo `docs/rules/content-sources-real.md` rồi chạy lại `scripts/data-import/biomes-import.mjs` để gán vào map); skill / trait chờ hiệu ứng mới (`scripts/data-import/skills-planned.json`, `traits-planned.json`; hiện rỗng): mỗi khi làm xong một hiệu ứng / hook mới (ví dụ trạng thái mới, hook trait chờ) thì rà hai file này, chuyển các mục đã đủ hiệu ứng vào `src/data` (kèm tên `i18n` và learnset ghi trong mục), xóa khỏi file chờ.
- Nhiều bước đổi state: mỗi bước tự tăng version save và viết migrate riêng (quy tắc 9), không gộp nhiều bước vào một lần đổi.

## Portals of Phereon: phần còn chờ

- Đo cổng thế giới, phòng ấp, tinh chất trong mô phỏng: chưa làm, số đang là số tạm (`../rules/simulation-features.md`).
- Màn hình: chờ UI (`ui-overhaul.md`).
