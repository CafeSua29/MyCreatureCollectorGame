# Boss thế giới

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như World Boss của Summoners War: **Thiên Ngoại Tà Thú** xuất hiện theo lịch, **HP vô hạn** (không cần hạ), phần thưởng **theo kỷ lục tổng sát thương** trong số lượt cố định. Khác boss tầng (phải hạ), thú triều (nhiều đợt thủ thành). Bước 7f (2026-11-01). Số ở `balance.json` khóa `worldBoss` (số tạm, chỉnh theo mô phỏng; `balance-systems.md`).

Code: lịch / loài / sinh boss / bậc thưởng `world/worldBoss.ts`, việc theo ngày và nhận thưởng `progression/worldBoss.ts`, trận `battle/worldBoss.ts` + mục `worldBoss` của `SPECIAL_BATTLE_RULES` (`battle/specialBattles.ts`), HP vô hạn ở `loseHp` (`battle/hpChanges.ts`) và `fixedDamage.ts`.

## Lịch xuất hiện

- Chu kỳ `everyDays` (14) ngày: chu kỳ của ngày `d` là ⌊d / everyDays⌋; boss xuất hiện ở **`activeDays` (3) ngày cuối** mỗi chu kỳ (`worldBossWindow`). Game mới (ngày 0) gặp lần đầu ở ngày 11.
- Việc theo ngày `worldBoss` (`DAILY_TASKS`, `lifespan.md` mục "Đồng hồ game"): qua ngày cuối (`endDay`) thì lần xuất hiện kết thúc; chưa có boss mà ngày nằm trong thời gian xuất hiện thì boss mới xuất hiện (cần đã mở ít nhất một tầng và có loài hợp lệ). Sự kiện ngày `worldBossAppeared { speciesId, endDay }` / `worldBossLeft { speciesId, tierId }` (`tierId` null = chưa đạt bậc nào).
- Lúc xuất hiện tung (RNG của save) **loài** và **seed** của boss; ghi **tầng tham chiếu** = tầng cao nhất lúc đó, level = level boss tầng của tầng đó + `levelOffset` (0), tối thiểu 1.
- **Loài** (`worldBossCandidates`, lưu tạm theo dữ liệu): loài thường **dạng cuối** (không tiến hóa tiếp) có phẩm cấp loài (`species-rank.md`) từ `minSpeciesRankId` (S) trở lên; loài **lớn** (`monster-size.md`) trọng số `largeWeight` (3), loài khác 1 (mọi loài đủ điều kiện đều có cơ hội).
- Boss sinh **tất định từ seed** (`generateWorldBoss`): mọi lần khiêu chiến trong một lần xuất hiện gặp đúng một con (như Summoners War). Gen theo tầng tham chiếu, không shiny, không già đi, trường biến hình theo luật boss (`rollBossTransformTraits`, biến hình như boss: `transformation.md`), `bossMultiplier` = `worldBoss.bossMultiplier` (1,5; không bị giới hạn 2–5 của boss tầng), `endlessHp: true`. Boss mang trang bị unique như boss hoang (`equipBosses` của `openBattle`).
- **Máu đơn vị** `hpUnit` = max HP của boss khi `bossMultiplier` 1 (`worldBossHpUnit`), tính lúc xuất hiện: đơn vị của ngưỡng bậc thưởng (ngưỡng tự scale theo loài, level, gen, kích cỡ).

## Khiêu chiến

- Action `challengeWorldBoss` (ở thị trấn, không trong bí cảnh / hiểm địa / giải đấu, có quái còn đánh được; bị chặn khi đang có thú triều): **1 lần mỗi ngày** (`lastChallengeDay`), trong thời gian xuất hiện. Lỗi: `noWorldBoss`, `worldBossChallengedToday { day }`, `notInTown`, `inBattle`, `noHealthyMonster`, `trialInProgress`, `zoneInProgress`, `tournamentInProgress`.
- Trận `battle.special = { kind: 'worldBoss' }`, `isBoss: true`, map của tầng tham chiếu. Đội ta đánh 2v2 như thường (đổi quái, vật phẩm, kỹ năng ngự thú sư, biến hình đều được); **không bắt**, không thu phục; **không áp** độ bất ổn tầng, **không có** thần / ân sủng (`isFloorBattle: false`, `inMap: false`).
- **HP vô hạn** (`Monster.endlessHp`, chỉ trên quái địch trong trận): mất máu không trừ HP, không giới hạn bởi HP còn lại, không gục; sát thương vẫn ghi vào bản ghi trận (`records[boss].damageTaken`) và kích hoạt mọi thứ như trúng đòn thường (trait trúng đòn, hút máu, phản đòn...). Tự mất máu (`cost`: Perish Song, Destiny Bond...) không có tác dụng. Đòn **theo máu mục tiêu** (Super Fang, Endeavor, hạ gục một đòn) không có tác dụng, hạ gục một đòn accuracy 0 (như Max Raid của Pokémon).
- **Tối đa `turns` (10) lượt**: hết lượt (`maxTurns` của `SPECIAL_BATTLE_RULES`, xét ở `settleAfterTurn`) thì trận kết thúc với `outcome: 'won'`, log `battleTimeUp`; không phần thưởng chung (không tiền, EXP, đồ rơi).
- **Rút lui** = `flee`: luôn thành công (không tung tỉ lệ, không bị giữ chân; `fleeIsRetreat`), kết thúc sớm.
- **Đội gục**: thua như thường (về thị trấn) nhưng **không mất tiền** (`lossPenaltyPercent` 0).
- **Cuồng bạo theo lượt**: boss vai trò `worldBoss` (`frenzy.md`), kích hoạt cuối lượt 4 (cuồng bạo từ lượt `fromTurn` 5), +30% công / đặc công, 25% hành động thêm.
- Mọi cách hết trận (hết lượt, đội gục, rút lui): `onFinish` của `SPECIAL_BATTLE_RULES` cộng sát thương lên quái HP vô hạn, cập nhật **kỷ lục** (`bestDamage`, chỉ tăng), log `worldBossDamage { total, record }`.
- Rời trận tốn `clock.hours.worldBoss` (24) giờ: mỗi lần khiêu chiến +1 ngày.

## Thưởng

- Hết thời gian xuất hiện: kỷ lục đạt **bậc cao nhất** có `kỷ lục ≥ minHpMultiple × hpUnit` (`worldBossTierOf`) thì thành **thưởng chờ nhận** (`worldBoss.rewards`, nhiều lần xuất hiện cộng dồn); chưa đạt bậc nào thì không có gì.
- Action `claimWorldBossRewards` (thị trấn, ngoài trận) nhận mọi thưởng chờ; lỗi `noWorldBossRewards`, `notInTown`, `inBattle`. Mỗi thưởng theo bậc (`config.worldBoss.tiers`, tăng dần):
  - tiền = `rewards.moneyPerLevel` × level boss × `moneyMultiple`;
  - vật phẩm cố định `items` (hồn tinh, Kẹo EXP M–XL, Kẹo Hiếm, nguyên liệu hiếm: Tẩy luyện thạch, Phá Cảnh Đan, Luân Hồi Đan);
  - `skillBooks` sách kỹ năng trong learnset của loài boss (`rollSkillBooks`, như sách theo map: skill đội học được × `partyMultiplier`, `reusableDropChance` % là Chân kinh);
  - `eggChance` % một trứng loài boss (dạng đầu, `createSpeciesEgg`, lý lịch `bossEgg`).
- Tên hiển thị của bậc (C / B / A / S / SS) lấy theo id; chưa có: hiển thị ở UI (chờ UI, `ui-overhaul.md`).

## State và dữ liệu

- `GameState.worldBoss = { current, rewards }` (save v84). `current` null hoặc `{ cycle, endDay, speciesId, floor, level, seed, hpUnit, bestDamage, lastChallengeDay }`; `rewards` = `{ speciesId, floor, level, tierId, bestDamage }[]`. `hpUnit` / `bestDamage` là `Decimal` (`bigFields.ts`).
- Kiểm tra save (`validateWorldBossState.ts`): loài thường tồn tại, tầng đã mở, level / seed / ngày nguyên, `hpUnit` ≥ 1, `tierId` có trong config; trận boss thế giới chưa kết thúc thì phải có boss đang xuất hiện; `endlessHp` chỉ trên quái hoang trong trận và phải là `true`.
- Kiểm tra dữ liệu (`gameData/validateWorldBoss.ts`): `everyDays` / `activeDays` / `turns` nguyên ≥ 1, `activeDays ≤ everyDays`, `levelOffset` nguyên, `bossMultiplier` ≥ 1, `largeWeight` ≥ 0, `minSpeciesRankId` có trong `speciesRanks.json`, bậc: id không trùng, `minHpMultiple` > 0 tăng dần ngặt, `moneyMultiple` ≥ 0, `items` như món thưởng, `skillBooks` nguyên ≥ 0, `eggChance` 0–100; trường lạ báo lỗi.

## Số (tạm, theo mô phỏng 2026-11-01)

| Bậc | Ngưỡng (× máu đơn vị) | Tiền (× moneyPerLevel × level) | Vật phẩm                                                               | Sách | Trứng |
| --- | --------------------- | ------------------------------ | ---------------------------------------------------------------------- | ---- | ----- |
| C   | 0,5                   | 5                              | Hồn tinh nhỏ 2, Kẹo M 1                                                | 1    | 0%    |
| B   | 1,5                   | 10                             | Hồn tinh nhỏ 3, Kẹo M 2, Kẹo L 1                                       | 1    | 0%    |
| A   | 3                     | 20                             | Hồn tinh lớn 1, Kẹo L 2, Kẹo Hiếm 1, Tẩy luyện thạch 1                 | 2    | 0%    |
| S   | 6                     | 40                             | Hồn tinh lớn 2, Kẹo L 2, Kẹo XL 1, Kẹo Hiếm 2, Phá Cảnh Đan 1          | 2    | 5%    |
| SS  | 12                    | 80                             | Hồn tinh lớn 3, Kẹo XL 2, Kẹo Hiếm 3, Phá Cảnh Đan 1, Luân Hồi Đan 1   | 3    | 10%   |

- Mục tiêu (đo bằng phần `worldBoss` của mô phỏng, `simulation-features.md`): đội đủ 6 quái ở tầng 10 đạt ít nhất C khoảng 70%, ít nhất B khoảng 50%, S trở lên khoảng 20%, SS dưới 10%; đội ít quái thường không đạt bậc nào.
