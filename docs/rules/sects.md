# Tông môn

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như game tu tiên: ngự thú sư **gia nhập một tông môn**, làm nhiệm vụ tông lấy **điểm cống hiến**, đổi đồ ở **Tàng Bảo Các**, thi **thăng chức**, **luận võ** với đồng môn NPC và dự **tông chiến**. Bước 9e (2026-11-02). Số là **số tạm** (`balance.json` khóa `sects`, `sects.json`; số hiện tại ở `balance-systems.md`).

Code: `model/sects.ts` (kiểu), `registries/sects.ts` (ngưỡng / tên chức vị, buff, cộng cống hiến / điểm thưởng), `progression/sects.ts` (gia nhập / rời, đồng môn NPC, nhiệm vụ tông, Tàng Bảo Các, việc theo ngày `sect`, bảng xếp hạng), `battle/sectBattles.ts` (luận võ, thi thăng chức, tông chiến), luật sau trận ở `TRAINER_MODE_RULES` (`battle/trainerModes.ts`, chế độ `sectDuel` / `sectPromotion` / `sectWar`), `gameData/validateSects.ts`, `game/validateSectState.ts`. Dữ liệu: `src/data/sects.json`, `sectRanks.json`, `npcNames.json`; tên ở `i18n/<ngôn ngữ>/sects.json`, `sectRanks.json`, `npcNames.json`.

## Dữ liệu

- **Tông** (`sects.json`) `{ id, minRealm, rankBonuses, trainerClassIds, shop, rivalSectIds }`: cảnh giới tối thiểu để gia nhập; buff (kênh thưởng ngự thú sư, `tamer-talents.md`) nhân hệ số = chức vị + 1; lớp NPC của đồng môn / đối thủ tông chiến (lớp `regular` ở `trainers.json`, đội theo hệ của lớp); Tàng Bảo Các: món `{ itemId, cost, minRank }` (vật phẩm gộp chồng) hoặc `{ skillId, reusable, cost, minRank }` (sách kỹ năng có sách, `reusable` = Chân kinh), giá cống hiến mỗi cái, không trùng; tông đối địch (có thật, khác chính nó, không rỗng).
- **15 tông** (chủ project duyệt 6 tông của roadmap 2026-11-02, dặn thêm cho đa dạng; Claude thêm 9): Vạn Thú Tông (bắt / thu phục), Long Uyên Các (rồng), Bách Thảo Cốc (luyện đan / nấu ăn), Thiên Kiếm Môn (võ, % chỉ số), Huyền Băng Cung (băng / nước, linh lực), Âm Minh Điện (ma / bóng tối, EXP / đồ rơi), Liệt Hỏa Tông (lửa, luyện khí), Lôi Đình Các (điện, linh lực / đồ rơi), Thiên Cơ Các (tâm linh, trận đồ, EXP / giới hạn khế ước), Kim Cương Tự (đá / thép, động phủ), Bách Hoa Cung (ánh sáng / tiên, shiny / thu phục), Vạn Bảo Lâu (thương hội: tiền, bùa fuse), Ngự Phong Cốc (bay, bắt / EXP), Thánh Quang Điện (ánh sáng, % chỉ số / linh lực), Vạn Độc Môn (độc, đồ rơi / luyện đan). Mỗi tông bán chung Phá Cảnh Đan, Kẹo EXP M, Kẹo Hiếm, Hoàn Nguyên Đan và đồ theo chủ đề (yêu đan, thức tỉnh đan, tinh huyết, trận đồ, đan phương...), cùng **Bí kíp theo hệ chủ đề**: mỗi hệ 3 cuốn (power ≤ 65 giá 40 từ Ngoại môn; 66–95 giá 100 từ Nội môn; 96–130 giá 220 từ Chân truyền; chọn chiêu có nhiều loài học nhất của bậc đó) và 1 **Chân kinh** (chiêu bậc giữa của hệ đầu, giá 1.500, từ Trưởng lão). Buff tông không dùng kênh có trần tự nhiên (giảm giá cửa hàng, giảm hồi chiêu) vì buff nhân theo chức vị không trần (luật nội dung).
- **Chức vị** (`sectRanks.json`, chỉ id + tên): Ngoại môn đệ tử → Nội môn đệ tử → Chân truyền đệ tử → Hộ pháp → Trưởng lão → Thái thượng trưởng lão → "Thái thượng trưởng lão + n" (không trần, như tên cảnh giới; `sectRankTitle`). Lệch roadmap: thêm Hộ pháp giữa Chân truyền và Trưởng lão.
- **Tên NPC** (`npcNames.json`, 90 tên Hán Việt / phiên âm ở i18n): dùng chung cho mọi NPC có tên (đồng môn, đối thủ tông chiến).
- **Kiểm tra dữ liệu:** trường lạ, số nguyên / khoảng của config, trọng số chức vị đồng môn ≥ 0 có ít nhất một số > 0, tông chiến có ít nhất một vòng, phần thưởng là vật phẩm gộp chồng; `sectRanks` / `npcNames` không rỗng.

## Luật

- **Cống hiến** (`number`, kẹp `MAX_SAFE_INTEGER`): `contribution` tiêu được và `totalContribution` từ lúc gia nhập (chỉ tăng; xét thăng chức). Nguồn: nhiệm vụ tông, luận võ, tông chiến. **Chức vị r** cần cống hiến tổng `rankBase × r^rankPower` (200 × r²; đa thức như EXP, `sectRankThreshold`).
- **Gia nhập** `joinSect { sectId }` (thị trấn, ngoài trận, không dự giải / tông chiến): đủ `minRealm`, chưa ở tông nào, đã qua `rejoinCooldownDays` (30) ngày từ lần rời. Lúc gia nhập: sinh đồng môn NPC, ra nhiệm vụ tông. Lỗi: `sectNotFound`, `alreadyInSect`, `sectRealmTooLow { sectId, minRealm }`, `sectRejoinCooldown { untilDay }`.
- **Rời tông** `leaveSect`: mất chức vị, cống hiến, đồng môn, nhiệm vụ tông; ghi `leftDay`. Điểm thiên phú thưởng đã nhận **giữ** (ở `tamer.bonusTalentPoints`).
- **Buff chức vị**: hiệu ứng `rankBonuses` × (chức vị + 1) cộng vào kênh thưởng ngự thú sư (`tamerBonusAmount`, cùng danh hiệu / thiên phú). Chưa ở tông: không có.

### Đồng môn NPC

- Gia nhập thì sinh `memberCount` (12) đồng môn `{ id "m<số>", nameId, classId, rank, contribution, isMaster }` (`generateSectMembers`): tên khác nhau (khi đủ tên), lớp ngẫu nhiên trong `trainerClassIds` của tông, chức vị theo `memberRankWeights` (mỗi chức vị có tên đều có trọng số > 0: 40, 30, 15, 10, 5, 1), cống hiến = ngưỡng chức vị; người cuối là **tông chủ**, chức vị = cao nhất của đệ tử + `masterRankLead` (2).
- **Mỗi ngày** (`DAILY_TASKS.sect`): mỗi đệ tử + cống hiến nguyên trong `memberDailyContribution` [5, 20] × (chức vị + 1) rồi lên chức theo cống hiến (`sectRankForContribution`); tông chủ luôn giữ đầu bảng. Người chơi thăng chức phải **thi** (dưới), đệ tử NPC thì tự lên.
- `sectRanking(state)`: bảng xếp hạng cống hiến tổng (đồng môn + người chơi `memberId: null`), cao xuống thấp.

### Nhiệm vụ tông

- `quests.sect` (danh sách riêng trong `QuestState`, chung bộ đếm id): `missions.count` (3) nhiệm vụ ra bằng `rollQuest` (registry loại nhiệm vụ của `quests.md`), **tự nhận** (tiến độ tính ngay qua `recordQuestEvent`), bỏ thưởng tiền / vật phẩm của mẫu. Làm mới toàn bộ mỗi `refreshDays` (7) ngày (cả nhiệm vụ chưa nộp).
- `claimSectMission { questId }` (thị trấn): đủ tiến độ thì + `contributionPerCount × số lần cần` (10 × số lần) cống hiến, tung `talentPointChance` (10) % **+1 điểm thiên phú ngự thú sư**. Không cộng bộ đếm `questsCompleted` (đã có thưởng riêng, tránh nhận điểm hai lần). Lỗi: `questNotFound`, `questNotComplete`.

### Tàng Bảo Các

- `buySectItem { item: ItemRef, count }` (thị trấn; định danh `stack` hoặc `book`): món có trong `shop` của tông, chức vị ≥ `minRank`, cống hiến ≥ `cost × count` (chỉ trừ cống hiến tiêu được). Lỗi: `notInSectShop`, `sectRankTooLow { itemId, minRank }`, `notEnoughContribution { need, have }`.

### Trận tông (Diễn võ trường trong thị trấn)

- Trận NPC thường (`trainers.md`: không bắt, không chạy, thua theo luật thua chung), ở thị trấn (môi trường mặc định, không ân sủng / chúc phúc), đội theo **tầng cao nhất** + level của chế độ; `battle.trainer` có `memberId` (đồng môn) hoặc `npcNameId` (tên đối thủ).
- **Luận võ** `challengeSectMember { memberId }`: tối đa `duel.perDay` (3) trận mỗi ngày (tính lúc vào trận), đối thủ lớp NPC của đồng môn, level + `levelPerRank × chức vị đồng môn`. Thắng + `duel.contribution × (chức vị đồng môn + 1)` (15 ×) cống hiến (log `sectContributionGained`). Lỗi: `sectMemberNotFound`, `sectDuelLimit { perDay }`.
- **Thi thăng chức** `challengePromotion`: cống hiến tổng ≥ ngưỡng chức vị kế tiếp (`promotionNotReady { need, have }`), đấu **giám khảo** = đệ tử chức vị cao nhất (`promotionExaminer`; không còn đệ tử thì tông chủ), level + `levelOffset + levelPerRank × chức vị mới` (2 + 2 ×). Thắng: chức vị + 1 (log `sectPromoted`), **+ `promotion.talentPoints` (1) điểm thiên phú ngự thú sư** (log `tamerTalentPointsGained`). Thua: thi lại được (chỉ tốn trận).
- **Tông chiến**: mỗi `war.everyDays` (60) ngày một kỳ. `enterSectWar` (mỗi kỳ một lần; `sectWarNotOpen { nextDay }`) tung tông đối địch trong `rivalSectIds`. Đang dự (`sect.war.round` khác null): như giải đấu, **không hồi máu, không nghỉ, không rời thị trấn, không trận / phó bản khác, không rời tông** (`sectWarInProgress`, `assertNoTournament` xét cả hai). `challengeSectWar` đánh vòng kế tiếp (lớp NPC của tông đối địch, tên ngẫu nhiên, `rounds[i]`: level + 0 / 2 / 4 / 6, tiền × 1 / 1,2 / 1,5 / 2), thắng vòng + cống hiến của vòng (30 / 50 / 80 / 120); thắng vòng cuối: **vô địch** + `championContribution` (300), + `championTalentPoints` (2) điểm thiên phú, `championRewards` (Kẹo Hiếm, Kẹo EXP L). Thua: bị loại (giữ cống hiến các vòng đã thắng). `forfeitSectWar` bỏ giải. Lỗi: `noSectWar`. Độ khó (4 vòng không hồi máu, vòng cuối + 6 level) chủ project chốt giữ 2026-11-02: nội dung thử sức giai đoạn sau.

### Điểm thiên phú từ tông môn

- Điểm không suy ra được từ state nên lưu ở **`tamer.bonusTalentPoints`** (cộng vào `tamerTalentPointsEarned`, `tamer-talents.md`): nộp nhiệm vụ tông (10%), mỗi lần thăng chức (+1), vô địch tông chiến (+2). Giữ khi rời tông.

## State, save

- `GameState.sect = { sectId, contribution, totalContribution, rank, joinedDay, leftDay, missionDay, members, nextMemberId, duels: { day, count }, war: { lastPeriod, rivalSectId, round } }` (game mới `newSectState`: chưa vào tông, kỳ tông chiến −1); `quests.sect`; `tamer.bonusTalentPoints`.
- Kiểm tra save (`validateSectState`): tông có thật hoặc null; số nguyên ≥ 0, cống hiến tiêu được ≤ tổng; đồng môn (id "m<số>" < `nextMemberId`, không trùng, tên / lớp có thật), đúng một tông chủ khi ở tông; chưa vào tông thì cống hiến / chức vị 0, không đồng môn, không nhiệm vụ tông; tông chiến (vòng trong số vòng, có tông đối địch, đang dự thì ở thị trấn và đang ở tông); nhiệm vụ tông ≤ `missions.count` (như nhiệm vụ đang nhận, `validateQuestState`); trận luận võ / thi thăng chức có `memberId` là đồng môn, `npcNameId` có thật, trận tông chiến chưa kết thúc thì đang dự tông chiến.
- Save v94: migrate chưa vào tông, `quests.sect = []`, `tamer.bonusTalentPoints = 0`.

## Mô phỏng

- Chơi liên tục, mỗi ngày ở thị trấn sau việc NPC (`runSectActivities`, `scripts/simulate/sects.ts`): chưa vào tông thì gia nhập tông vào được có điểm buff cao nhất (% chỉ số đội × 3 + % EXP × 2 + % tiền), nộp nhiệm vụ tông đã xong, luận võ với đồng môn chức vị thấp nhất tới hết lượt trong ngày (dừng khi thua), thi thăng chức khi đủ cống hiến, dự tông chiến khi mở (đánh tới khi vô địch / bị loại / hết lượt thì bỏ). Không mua Tàng Bảo Các. Ô `economy` của `progression.csv`: `sectMission`, `sectPromote`, `sectWar` (vô địch), `sectBattle`.

## Chưa có

- Đồng môn có thiện cảm / sư phụ, nhiệm vụ do NPC giao riêng, phản bội tông (chưa có luật; thêm khi cần).
- UI tông môn (chờ UI, `ui-overhaul.md`).
