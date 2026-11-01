# Thu phục

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Cách có quái **ngoài bóng**, như Dragon Quest Monsters (quái bị hạ xin theo, thức ăn tăng tỉ lệ) và truyện tu tiên (yêu thú bị đánh bại thì quy phục, ngự thú sư "thị uy"). Bước 5q. Code: `battle/recruit.ts` (xin theo, quy phục, Thị Uy, đếm mồi), `world/bait.ts` (mồi dụ). Số ở `config.recruit` (`balance.json`), là **số tạm**.

## Trận có thể thu phục

- `isRecruitBattle`: trận quái hoang / boss trên tầng, kể cả trận câu cá / khai thác (`gathering.md`). **Không** thu phục ở trận ngự thú sư NPC, bí cảnh / tháp, trận event / thú triều / hiểm địa, độ kiếp (trận đặc biệt theo `canRecruit` của `SPECIAL_BATTLE_RULES`).
- Quái thu phục (mọi cách): **HP đầy**, hết trạng thái, bỏ max HP đổi trong trận, thân mật khởi đầu `affinity.start.recruit` (70), lý lịch nguồn gốc `{ kind: 'recruit', method }` (`method`: `afterBattle` / `intimidate` / `bossSubmit`; `monster-history.md`), **chưa khế ước** (khế ước là bước riêng, mục "Khế ước" ở `tamer.md`). Boss thu phục giữ `bossMultiplier` và nhận trait "Huyết thống boss" như bắt boss. Tính một lần "bắt quái" cho nhiệm vụ (`quests.md`, event `caught`).
- **Không có giới hạn level** (chủ project chốt 2026-10-25): quái level nào cũng xin theo / quy phục / Thị Uy được; giới hạn level chỉ áp lúc khế ước (`tamer.md`).
- **Sức chứa** (`capacity.md`): đội đủ và kho đầy thì không xin theo / quy phục (`recruitChance` = 0), `acceptRecruit` / Thị Uy báo `rosterFull`.

## Xin theo sau trận thắng, boss quy phục

- Sau mọi việc của trận thắng (`applyWin`, sau `finish` nên quái bị hạ đã trả hệ / race gốc), mỗi quái bị hạ có tỉ lệ (`recruitChance`, kẹp 0–100):
  - quái thường: `baseChance` × `catchRate` / 100 (catchRate của loài gốc, thang 0–100) × (1 + % thu phục / 100) × `rankFalloff` ^ thứ hạng phẩm cấp loài (`speciesRankIndex` của `monsterSpeciesRankOf`, bậc thấp nhất = 0; `species-rank.md`);
  - boss: `bossChance` × (1 + % thu phục / 100), không nhân catchRate / phẩm cấp (boss vẫn giữ `bossMultiplier`, đủ hiếm).
- **% thu phục** = kỹ năng đồng hành `recruitPercent` (`partner-skills.md`) + mồi dụ đang dùng (dưới). + chúc phúc `recruitPercent` của thần cai quản map của trận (`deities.md`; `recruitChance` nhận `blessingBonus`) + danh hiệu đang đeo `recruitPercent` (`achievements.md`). Chưa có: thiên phú ngự thú sư (chờ `tamer-talents.md`); khi làm thì cộng vào `recruitBonusPercent` (`battle/recruit.ts`).
- **Tung một lần cho trận**: tỉ lệ trận = 1 − Π(1 − tỉ lệ từng quái); trúng thì chọn **một** quái theo trọng số tỉ lệ của nó (`rollRecruitOffer`). Mọi tỉ lệ 0 thì không tốn RNG.
- Quái được chọn: `battle.recruitOfferId` (id trong `battle.enemies`), log `recruitOffered { monsterId, method }` (`afterBattle`, boss: `bossSubmit`). Người chơi chọn trước khi rời trận:
  - `acceptRecruit`: quái vào đội (còn chỗ) hoặc kho, rời `battle.enemies`, log `recruited { destination }`;
  - `declineRecruit`: bỏ lời xin theo; **rời trận mà chưa chọn = từ chối** (không chặn action khác như event chờ).
  - Không có quái xin theo: `noRecruitOffer`; trận chưa kết thúc: `wrongBattlePhase`.

## Thị Uy

- Kỹ năng ngự thú sư `intimidate` (`tamerSkills.json`, mục tiêu **`wildFoe`**, không có `effects`; mở từ cảnh giới 0 (roadmap: 1; mô phỏng cho thấy cảnh giới 1 tới sau tầng 10 nên Thị Uy gần như không có lúc thu phục quái tầng thấp có ích nhất), 30 linh lực, 1 lần mỗi trận). Chỉ phe người chơi; **AI không dùng** (người chơi tự quyết thu phục; script mô phỏng tự ra lệnh).
- Chỉ ở **lượt đầu** (`battle.turn` 1) của trận quái hoang thường (không boss): sai thì `tamerSkillUnavailable` với lý do `notWildBattle` / `notFirstTurn`. Mục tiêu: quái hoang còn sống trên sân, không Dynamax (sai: `malformedAction`), trong giới hạn khế ước.
- Tỉ lệ (`intimidateChance`, 0–1) = kẹp((`slope` × tổng chỉ số trong trận của mọi quái ta còn sống trên sân / tổng chỉ số trong trận của mọi quái hoang còn sống trên sân + `offset`) × (1 + % thu phục của mục tiêu / 100), 0, `maxChance`). Số tạm 0,5 / −0,25 / 0,8: hai phe ngang sức → 0,25; phe ta mạnh gấp đôi (hoặc 2 quái ta ngang 1 quái hoang còn lại) → 0,75; từ 2,1 lần trở lên → 0,8. (Roadmap ghi "tổng chỉ số quái hoang" không rõ một hay cả hai con; so với cả phe để ngang sức không quá dễ, xem `balance-capture.md`.)
- **Thành công:** mục tiêu rời sân, vào `battle.captured` như bắt bóng (vào đội / kho khi hết trận, cho EXP như quái bắt), quái còn lại tiếp tục trận; lệnh của ô vừa trống bị bỏ. **Thất bại:** mục tiêu tăng bậc theo `failStages` (+1 công, +1 đặc công). Thành hay bại đều tốn linh lực; log `intimidate { targetId, chance, success }` (thành công thêm `recruited`).

## Mồi dụ

- Category item **`bait`** (`world-items.md`): `recruitPercent` (> 0), `battles` (nguyên ≥ 1), khẩu vị `favoriteRaceIds?` / `favoriteElementIds?` (dùng chung `isFavoriteItem` với thiên tài địa bảo). Không dùng qua `useItem`: action riêng **`useBait { itemId }`** ngoài trận (`applyBait`), mất một mồi, `GameState.recruit.bait = { itemId, battlesLeft: battles }`.
- Đang có mồi còn tác dụng thì không dùng mồi khác (`baitActive`); lỗi khác: `inBattle`, `unknownItem`, `notBait`, `notEnoughItem`.
- Mồi cộng `recruitPercent` vào % thu phục của xin theo, quy phục và Thị Uy; quái đúng khẩu vị nhận % × `baitFavoriteMultiplier` (2).
- **Đếm theo trận:** mỗi trận có thể thu phục kết thúc (thắng, thua, chạy; `finish`) bớt 1 trận, hết thì mất (`tickBait`). Trận cuối của mồi vẫn có tác dụng cho lời xin theo của chính trận đó.
- Dữ liệu: Mồi Dụ Thú (+50%, 5 trận), Linh Mồi (+100%, 10 trận), bốn mồi khẩu vị +60% / 8 trận (thịt: thú / trâu / khủng long; mật hoa: côn trùng / thực vật / chim; cá: thủy sinh / bò sát; Dẫn Hồn Hương: linh hồn / bất tử / nguyên tố / thiên thần); bán ở cửa hàng, nấu ở Đầu bếp (`cooking.md`). Khu bảo tồn ném mồi trong túi (`throwSafariBait { itemId }`, mất một; đúng khẩu vị thì không giảm tỉ lệ bắt; `safari-zone.md`).
- Dưỡng dục dùng lại trường khẩu vị: món đúng khẩu vị được đòi với trọng số `imprint.favoriteFoodWeight` (`imprinting.md`).

## State, save

- `GameState.recruit = { bait: { itemId, battlesLeft } | null }`; `BattleState.recruitOfferId: string | null`. Kiểm tra save (`validateRecruitState`): mồi phải là item `bait`, `battlesLeft` ≥ 1; quái xin theo chỉ có sau trận thắng (`phase` ended, `outcome` won) và là một quái trong `enemies`. Save v52 (`state-versions.md`).
- Bên ngoài core: `recruitChance`, `intimidateChance`, `isRecruitBattle` (UI hiện tỉ lệ, script mô phỏng).

## Số (tạm)

- `config.recruit`: `baseChance` 5 (roadmap 3, tăng theo mô phỏng), `bossChance` 0,5, `rankFalloff` 0,85, `baitFavoriteMultiplier` 2, `intimidate { slope 0,5, offset −0,25, maxChance 0,8, failStages { attack 1, spAttack 1 } }`. Kiểm tra dữ liệu: % trong 0–100, `rankFalloff` 0–1, `maxChance` 0–1, `failStages` chỉ `attack` / `spAttack` với số nguyên khác 0.
- Kỹ năng đồng hành: Thiên Nhiên Hô Hoán (`natureCall`) +30%, Hóa Thân Dụ Dỗ (`mimicLure`) +20% `recruitPercent`.
- Kết quả mô phỏng: `balance-capture.md` mục "Thu phục".
