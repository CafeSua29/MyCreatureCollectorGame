# Danh sách quái

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

- Xem toàn bộ quái sở hữu: chỉ số đã tính, gen, trait, level, shiny, boss, lineage.
- **Chỉ có core, chưa có UI.** UI làm ở bước "UI vòng chơi cơ bản" ("Thứ tự làm tiếp theo" ở `docs/roadmap/README.md`), chỉ cần gọi `listMonsters` / `getMonsterView`.
- **Thông tin hiển thị** (`MonsterView`), đều tính lại từ nguyên liệu. **Không chứa chữ hiển thị** (mục "Chữ nội dung" ở `data.md`): loài, race, hệ, trait, skill, lineage chỉ là id, UI tra tên bằng `contentName`; tên hiển thị của quái lấy bằng `monsterName(data, language, view)` (biệt danh nếu có, không thì tên loài theo ngôn ngữ). Trait race nằm riêng ở `raceTraitIds` (không trong `traits`, không tính `traitSlotsUsed`; mục "Trait theo race" ở `stats-traits.md`).
  - Biệt danh, loài, loài gốc, vị trí (đội/kho + chỉ số vị trí).
  - Level, EXP, EXP cần cho level sau, phần EXP còn thiếu.
  - HP hiện tại / max HP, đã gục hay chưa.
  - Chỉ số ngoài trận (đã áp trait, không có bậc trận), tổng chỉ số, gen, `fusingBonusStats`.
  - Trait (id, loại, cấp, có chiếm ô không), số ô đã dùng / tối đa.
  - Trang bị: món đang lắp theo thứ tự ô (`equipment`), số ô của người chơi (`equipmentSlots`); % chỉ số theo từng nguồn (`statPercents`: mọi nguồn của `STAT_PERCENT_SOURCE_IDS`: trait, trạng thái, minion, hào quang, trang bị, thân mật, cộng hưởng khế ước, giai đoạn tuổi; `percentBySource` của `computeStats`).
  - Skill: `skills[]` (`id`, hệ, loại, power, `mastery`: cấp / tổng exp / exp cấp kế tiếp và còn thiếu / mốc kế tiếp, `skill-mastery.md`).
  - Thân mật và khế ước: `affinity`, `affinityTierId` (mức đang có, hiệu ứng tra ở `data.affinityTiers`; `affinity.md`), `contractRealm` (`tamer.md`), `imprint` (dưỡng dục: `phase`, `percent`, `statPercent`, `request`, `endDay`; null khi chưa từng dưỡng dục, `imprinting.md`). `buildMonsterView(data, monster, { location, index, equipmentSlots, scene })`.
  - Tư chất: `aptitude` (`{ ratio, tierId }`, so với tầng mốc `scene.aptitudeFloor`; tên bậc tra `contentName` 'aptitudeTiers'; `aptitude.md`).
  - Phẩm cấp loài: `speciesRankId` (theo `baseSpeciesId`, quái fuse theo loài gốc; tên bậc tra `contentName` 'speciesRanks'; `species-rank.md`).
  - Lý lịch: `history` (bản sao đầy đủ: nguồn gốc, lúc gặp, cột mốc; chỉ id; `monster-history.md`).
  - Biến hình (`transformation.md`): hệ Tera `teraElementId`, `gmaxFactor`, `dynamaxLevel`, dạng Mega dùng được với đá / skill hiện có `megaFormIds` (kể cả dạng tự biến kiểu Primal).
  - Skill, race, hệ, shinyStacks và hệ số thưởng shiny (`shinyRewardMultiplier`, không nhân vào chỉ số), bossMultiplier, fused, lineage (danh sách id loài).
- **Lọc:** vị trí (đội / kho / tất cả), loài, race, hệ, trait, shiny (`shinyStacks > 0`), boss (`bossMultiplier > 1`), fused, đã gục, tư chất từ bậc `minAptitudeTierId` trở lên, phẩm cấp loài từ bậc `minSpeciesRankId` trở lên.
- **Sắp xếp:** mặc định là đội theo thứ tự đội rồi kho theo thứ tự vào kho; hoặc theo level, một chỉ số, tổng chỉ số, tư chất (`aptitude`: tỉ lệ gen), phẩm cấp loài (`speciesRank`: thứ tự bậc), tên hiển thị, tên loài; tăng hoặc giảm. Bằng nhau thì giữ thứ tự mặc định. Sắp theo tên dùng chữ của `sort.language` (mặc định: ngôn ngữ mặc định của dữ liệu), so bằng `localeCompare` theo ngôn ngữ đó.
- **Quản lý quái:** chỉ dùng **ngoài trận**.
  - Đội luôn giữ **ít nhất 1 con, sống hay gục đều được**. Nếu cả đội đã gục thì phải nghỉ hoặc dùng thuốc hồi sinh trước khi đánh.
  - Đội có `partySize` (6) **ô**: quái lớn chiếm 2 ô (`monster-size.md`). `moveToParty` / `swapWithStorage` không đủ ô thì `partyFull`; mọi chỗ quái mới vào đội (bắt, thu phục, nở trứng, event, khu bảo tồn) hỏi `hasPartyRoom`, không đủ ô thì về kho.
  - Chuyển vào kho / vào đội: quái được đặt ở **cuối** danh sách đích. Vào đội báo lỗi khi đội đã đủ 6. Kho đầy (`capacity.md`) thì `moveToStorage` báo `rosterFull`.
  - Đổi chỗ đội ↔ kho: mỗi con nhận vị trí của con kia (dùng được khi đội đầy).
  - Sắp xếp đội: phải là hoán vị đúng của đội hiện tại. Thứ tự đội quyết định 2 con còn sống đầu tiên ra sân.
  - **Thả quái:** xóa vĩnh viễn khỏi đội hoặc kho, **không nhận gì**. UI phải hỏi xác nhận. Món đang lắp về túi; túi trang bị không đủ chỗ thì `bagOverflow`, gửi lại với `discardOverflow: true` để bỏ món thừa (`capacity.md`).
  - **Biệt danh:** cắt khoảng trắng hai đầu; `null` hoặc chuỗi rỗng thì xóa biệt danh; độ dài đếm theo ký tự Unicode (chữ có dấu tính 1 ký tự), tối đa `maxNicknameLength`.
