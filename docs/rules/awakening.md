# Thức tỉnh và độ kiếp

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như truyện tu tiên / huyền huyễn: quái mở từng **tầng thức tỉnh** (không có trần), mỗi tầng phải **độ kiếp** (đánh một mình với Thiên Kiếp). Số ở `balance.json` khóa `awakening`; số hiện tại ở `balance-systems.md`.

Code: trên quái `monster/awakening.ts` (`awakeningStatMultiplier`, `awakeningRewardAt`, `countAwakeningRewards`, `nextAwakeningMilestone`, `traitSlotCap`, `divineSkillId`, `awakeningRequirements`), độ kiếp `battle/tribulation.ts` (`payForTribulation`, `assertNotTribulation`, `isTribulationTimeUp`, `settleTribulation`), action `startTribulation` (`battle/battleActions.ts`), Thiên Kiếp `generateTribulationEncounter` (`world/encounter.ts`), môi trường `placeTribulationField` (`battle/environment.ts`), kiểm tra dữ liệu `gameData/validateAwakening.ts`. Nhập dữ liệu: `scripts/data-import/awakening-import.mjs` (từ `awakening-source.json`, chạy lại được).

## Trên quái

- Trường `awakening` (tầng đã đạt, nguyên ≥ 0, không trần), `tribulationFailures` (số lần độ kiếp thua liên tiếp ở tầng đang thử, nguyên 0–`maxFailures`), `injuryBattlesLeft` (số trận thắng còn bị trọng thương, nguyên ≥ 0); `validateMonster` kiểm tra. (Khác bệnh / chấn thương khi bị hạ gục trong trận: khỏi theo ngày / thuốc, `dwelling.md` mục "Bệnh và chấn thương".)
- Quái hoang, boss, trứng, quái mới: 0. **Breeding:** con 0. **Fuse:** quái gốc giữ cả ba trường, của quái phụ mất.

## Hiệu lực mỗi tầng

- **Chỉ số:** × `(1 + statStepPercent / 100) ^ tầng` ở **bước gốc** của `computeStats`, cùng chỗ với `bossMultiplier` (`stats-traits.md`), `Decimal`.
- **Thọ nguyên:** × `lifespanMultiplier ^ tầng` (mục `awakening` của `LIFESPAN_MODIFIERS`; hệ số thọ nguyên trả `number | Decimal`, nhân bằng `Decimal`, tầng rất cao không ra `Infinity`).
- **Tầng mốc** (`milestones` theo tầng tăng dần; sau mốc cuối mỗi `repeatEvery` tầng một mốc, loại xen kẽ bắt đầu bằng loại khác mốc cuối; đếm bằng công thức, không lặp từng tầng):
  - **Thần thông** (`skill`): skill thứ k (mốc thần thông thứ k) lấy từ `divineSkills[hệ]`: mốc lẻ theo hệ đầu của quái (`elementIds[0]`, skill đầu), mốc chẵn theo hệ thứ hai (skill đầu), quái một hệ thì mốc chẵn lấy skill thứ hai của hệ đó. Hệ không có / thiếu skill thì không có gì. Skill vào ô trống hoặc skill chờ học (`offerSkills`), ghi `extraSkillIds` (học lại ở NPC). **Thần thông là skill thường mạnh nhất của hệ** (chủ project chốt 2026-10-24): không thêm hold, vẫn có sách kỹ năng, vẫn kế thừa khi fuse như skill thường. `divineSkills` = 2 skill gây sát thương có power cao nhất của mỗi hệ (hòa thì accuracy, rồi id; bỏ chiêu Max), sinh bằng script nhập.
  - **Ô trait** (`traitSlot`): `traitSlots` + 1 (ô trống). **Trần ô trait riêng** = `config.traitSlots.max` + số mốc ô trait đã đạt (`traitSlotCap`): `validateMonster` và fuse (+1 ô) dùng trần này.
- **Trọng thương:** `injuryBattlesLeft > 0` thì mọi chỉ số kể cả max HP + `injuryStatPercent` (nguồn % `injury` của `STAT_PERCENT_SOURCES`, cộng chung tổng %). Giảm 1 sau mỗi trận **thắng** (quái hoang, boss) khi quái ở trong đội (`applyWin`).
- Điều kiện tiến hóa `awakening { min }` (`EVOLUTION_CONDITIONS`, `evolution-skills.md`).

## Độ kiếp

- Action `startTribulation { monsterId }`: ở thị trấn, ngoài trận; quái **trong đội**, không gục, không trọng thương; level ≥ `levelPerTier × (n + 1)` (n = tầng hiện tại); tiền `costBase × (n + 1)²` (`spendMoney`) và `pillsPerTier × (n + 1)` **Thức tỉnh đan cùng hệ với quái** (đan theo hệ `pillItemIds[hệ]`, category `material`; đan của **bất kỳ hệ nào quái đang mang** đều được, cộng gộp, trừ chồng nhiều nhất trước, `awakeningPillIds`; quái không có hệ nào có đan thì không độ kiếp được trừ khi `pillsPerTier` = 0). Thiếu: `notEnoughAwakeningPills { monsterId, have, need }` (kiểm tra trước tiền). Nguyên liệu trừ **khi bắt đầu**, thua không hoàn. Lần này thua là chết (`tribulationFailures = maxFailures`) mà quái là quái duy nhất trong đội thì chặn `partyWouldBeEmpty`.
- Mã lỗi: `levelTooLowForAwakening { need, have }`, `injured { monsterId, battlesLeft }`, dùng lại `inBattle`, `notInTown`, `monsterNotInParty`, `monsterFainted`, `notEnoughMoney`, `notEnoughItem`, `partyWouldBeEmpty`.
- **Trận:** `BattleState.tribulation = { monsterId, tier }` (null ở trận thường; không phải trận boss, `isBoss = false`). Quái độ kiếp **đánh một mình**: quái khác trong đội vẫn ở `party` nhưng không tham gia (`playerFighters` ở `battle/draft.ts`: phe người chơi của trận, thua khi quái độ kiếp gục, không có dự bị). Không ngự thú sư (`tamers.player = null`), không cộng hưởng đội / trận pháp / kỹ năng đồng hành (`teamBonuses.player` rỗng). Lệnh bị cấm: vật phẩm (kể cả bóng), chạy trốn, đổi quái (kể cả `switchTo`) → `tribulationRestricted { command }`; biến hình → `transformUnavailable` lý do `tribulation`; kỹ năng ngự thú sư → `tamerSkillUnavailable` `noTamer`.
- **Thiên Kiếp** (`tribulation.speciesId`, loài `heavenlyTribulation`: race elemental, hệ Điện / Ánh sáng, không giới tính, không ở biome nào, `catchRate` 0): level = level quái + `levelOffset` (tối thiểu 1), gen theo hệ số gen của `highestFloor`, không shiny, không già đi; `bossMultiplier` = `multiplierBase + multiplierPerTier × n` (số thực ≥ 1, không chịu giới hạn 2–5 của boss tầng). AI trận đấu chung.
- **Môi trường:** thời tiết / địa hình của config đặt lúc vào trận cả trận như môi trường tự nhiên (log `fieldChanged` nguồn `tribulation`, không tốn RNG; skill vẫn đổi được như môi trường tự nhiên).
- **Trần lượt** `tribulation.maxTurns`: hết số lượt mà chưa phân thắng thua là **thua**.
- **Thắng:** `awakening = tier`, `tribulationFailures = 0`, phần thưởng mốc (nếu tầng là mốc), log `awakened { monsterId, tier }`, mốc lý lịch `awakened { tier }`. Không tiền / EXP / đồ rơi / thân mật.
- **Thua** (gục hoặc hết lượt): `tribulationFailures + 1`, mất trạng thái, còn **đúng 1 HP** (tính với max HP đã trọng thương), `injuryBattlesLeft = injuryBattles`, log `tribulationFailed { monsterId, tier, failures }`, mốc lý lịch `tribulationFailed`. Không mất tiền, không về thị trấn (đã ở thị trấn).
- **Thua quá `maxFailures` lần liên tiếp** (lần thứ `maxFailures + 1`): **chết hẳn**: rời đội, `dieForever` (đồ đang lắp về túi, để lại **hồn phách** `cause: 'tribulation'`, `soul-relics.md`), log `diedInTribulation { monsterId }`; trận (đã kết thúc) bỏ mọi chỗ trỏ tới quái (ô, người tham chiến, bản ghi, `usedOnce`; `removeDeadFromBattle`) để save vẫn hợp lệ tới khi rời trận. Bật chết thật (`options.md`) mà quái độ kiếp gục thì chết hẳn ngay lúc trận kết thúc, không tính lần thất bại.
- Kiểm tra save (`validateGameState`): `tribulation` null hoặc `{ monsterId, tier }` (`tier` nguyên ≥ 1); trận chưa kết thúc thì quái phải trong đội và `tier = awakening + 1`; trận độ kiếp không phải trận boss, không có ngự thú sư, không có phối hợp đội.

## Hiển thị

- `MonsterView.awakening`: `tier`, `statMultiplier`, `traitSlotCap`, `nextMilestone` (`{ tier, reward }` hoặc null), `next` (`{ tier, level, money, pills }`), `tribulationFailures`, `failuresLeft` (0 = lần này thua là chết, UI cảnh báo), `injuryBattlesLeft`.

## Vật phẩm

- **Thức tỉnh đan theo hệ** (19 món `awakeningPill<Hệ>`, thay Thức tỉnh đan chung từ 2026-10-27, chủ project chốt: đột phá của quái cần đan làm từ yêu đan cùng hệ): category `material`, giá × tầng, cửa hàng trọng số 15 mỗi hệ (gấp 3 đan chung cũ để bù việc phải đúng hệ, theo mô phỏng); boss rơi đan của **hệ đầu** của boss (`bossPillChance` %, boss tầng của map cộng thêm `floorBossPillChance` %; tỉ lệ 0 hoặc hệ không có đan thì không tung), cộng bảng `bossDrops` / `floorBossDrops` (hiện rỗng), trong `EXTRA_DROP_TABLES`; rương bí cảnh chia đều trọng số cũ cho 19 hệ. Luyện (cấp luyện đan 4): 2 yêu đan cùng hệ + 1 linh thạch cùng hệ + 2 Nhân Sâm + 1.000 tiền (`alchemy.md`). Số: `bossPillChance` 30, `floorBossPillChance` 30. Nhập dữ liệu: `scripts/data-import/element-cores-import.mjs`.

## Mô phỏng

- Phần `tribulation` (kịch bản `tribulation { teamId, tiers, levelOffsets, battles }`): quái đầu của đội đánh độ kiếp bằng action thật, bảng `tribulation.csv` (tỉ lệ thắng, số lượt theo tầng × độ lệch level). Chơi liên tục: "người chơi" độ kiếp ở thị trấn khi đủ điều kiện (mua đan nếu cửa hàng bán), không thử khi lần này thua là chết; cột `awakening` / `awakenings` / `tribulationFails` ở `progression.csv` (`simulation-features.md`).

- Hiện nguyên hình của Hóa hình dùng được trong trận độ kiếp (`human-form.md`). Thức tỉnh đan luyện được từ yêu đan cùng hệ (`alchemy.md`). Chưa có: boss tầng cao có sẵn tầng thức tỉnh (chưa chốt, hỏi chủ project khi cần).
