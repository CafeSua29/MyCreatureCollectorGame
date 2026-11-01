# Script mô phỏng: theo tính năng

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Tách từ `simulation.md` (cách chạy, luật dùng kết quả, kịch bản, chơi liên tục ở đó). Mỗi mục: "người chơi" của mô phỏng dùng tính năng thế nào và cột đo.

## Cuồng bạo (`battleRunner.ts`)

- Không cần giả định: cuồng bạo chạy trong trận như game (quái hoang / boss luôn; đội mẫu có Rồng `emberling` / `pyrodrake` nên phe người chơi cũng cuồng bạo, lệnh của ô đó do AI chọn như mọi lệnh của mô phỏng). `collectStats` đếm log `frenzy` theo phe; `floors.csv` cột `frenzyPlayer` / `frenzyEnemy` = số quái cuồng bạo trung bình mỗi trận. Biến thể A/B `noFrenzy` (mọi ngưỡng / số về 0). Luật ở `frenzy.md`.

## Kích cỡ quái (`battleRunner.ts`)

- Không cần giả định: quái hoang / boss / NPC lớn sinh như game (cân nặng thật của dữ liệu), quái lớn HP / sát thương ×2. `floors.csv` cột `largeEnemy` = % trận có quái địch lớn. Biến thể A/B `noLarge` (`size.largeWeightKg` 1e300: không quái nào lớn) trong kịch bản mặc định. Đội mẫu chưa có quái lớn (đội mẫu chọn loài tay trong `scenarios.json`). Luật ở `monster-size.md`.

## Tầm chiêu và vị trí ra đòn (`battleRunner.ts`, `floorSweep.ts`, `report.ts`)

- AI chung chọn bộ phận (`chooseAim`) và tránh đòn cận chiến không với tới, cho cả hai phe; phe người chơi chỉ biết điểm yếu đã khám phá (`dex.hitParts`). **Giả định quét tầng:** bộ phận đã khám phá mang qua các trận của cùng một lượt quét (đội × tầng × loại trận; `floorSweep.ts`), như người chơi đánh liên tục ở tầng đó; trận hết lượt vẫn giữ phần đã khám phá (`runBattle`). Chơi liên tục dùng state thật nên tự tích lũy. Kết quả 2026-10-31 (`--parts sweep`, A/B `current` / `noHitLocations`, sau khi thêm khám phá điểm yếu và mất thế): bản đầu (quái hoang biết hết điểm yếu) quái hoang 66,9% / 70,1%; chẩn đoán: AI không thử bộ phận chưa biết 67,2%, tắt chí mạng mất thế 67,0%, nên nguyên nhân là quái hoang nhắm điểm yếu quái người chơi; đổi thành quái hoang không nhắm: quái hoang **69,7% / 70,1%**, boss **12,8% / 12,0%**; mỗi trận quái hoang người chơi nhắm 0,62 lần, khám phá 0,55 bộ phận, quái người chơi mất thế 0,34 lần, quái địch 0,12 lần. Quét tầng (`--parts sweep`, 2 biến thể) 241 giây với 11 worker. Sau phá bộ phận chặn skill (`bodyPart`, 2026-10-31, cùng cách chạy; luật thử "phá đầu / thân là gục" đã bỏ theo chủ project): quái hoang **69,7% / 70,1%**, boss **12,7% / 12,0%** (trong mục tiêu), bộ phận địch bị phá 0,24 mỗi trận quái hoang. `collectStats` đếm log trận (`HitLocationCounts`): `floors.csv` cột `aimed` / `weakHits` (đòn nhắm / trúng điểm yếu của phe người chơi), `outOfReachPlayer` / `outOfReachEnemy` (skill không với tới theo phe), `partsBroken` (bộ phận quái địch bị phá), `offBalancePlayer` / `offBalanceEnemy` (số lần quái mỗi phe mất thế), `partsRevealed` (bộ phận khám phá lần đầu), trung bình mỗi trận; dùng lại trận đã có, không thêm trận. Biến thể A/B `noHitLocations` (mọi skill tầm xa, điểm yếu không cộng sát thương nên AI hai phe không nhắm, mất thế không cộng chí mạng). Luật ở `hit-locations.md`.

## Song thú hợp thể (`battleRunner.ts`, `floorSweep.ts`)

- Không cần giả định thêm: phe người chơi dùng `suggestTamerCommand` (AI `mergeGain`), thân mật giả định tối đa từ tầng 2 (mục "Thân mật"). Cảnh giới giả định theo tầng (`assumedTamerRealm`) chưa tới 3 ở tầng 1–10 nên kịch bản mặc định có biến thể `realm3` (cảnh giới 3) và `realm3NoMerge` (cảnh giới 3, `merge.minAffinity` 1e300: không hợp thể được) để so A/B. `floors.csv` cột `merged` = % trận người chơi hợp thể. Đội mẫu `fireDuo` (Emberling + Ashgrunt, chung hệ lửa) để có cặp hợp nhau (`duo` / `full6` hai quái đầu khác race và hệ). Luật ở `battle-merge.md`.

## Z-Move (`floorSweep.ts`, `economy.ts`, `battleRunner.ts`)

- Quét tầng: như người chơi đã thắng các đạo quán đã qua (có Vòng Z từ tầng 40), quái đầu đội cầm Z-Crystal hợp skill của nó (`withLeadZCrystal`: `pickZCrystalFor`, hết ô thì thay trang bị kém nhất); AI chọn Z-Move như mọi ứng viên. Tầng quét mặc định 1–10 chưa có Vòng Z nên kịch bản mặc định có biến thể `zRing10` (Vòng Z ở đạo quán tầng 10) để so A/B với `current` ở tầng 10. `floors.csv` cột `zMove` = % trận người chơi dùng Z-Move. Chơi liên tục: có Vòng Z thì quái đội mẫu cầm crystal hợp skill có trong túi (`holdZCrystals`, cột `economy` mục `zCrystal`); quán chủ (lớp `transforms`) có crystal và dùng Z-Move. Luật ở `z-moves.md`.
- Kết quả 2026-10-27 (kịch bản mặc định, `zRing10` so với `current`, tầng 10): dùng Z-Move ở 33–56% trận quái hoang, 20–46% trận boss (trận boss là power spot, AI hay Dynamax quái đầu đội nên không Z-Move được); tỉ lệ thắng quái hoang +0–4 điểm (solo 47,0 → 49,0%, duo 74,5 → 75,5%, fireDuo 71,0 → 75,0%, full6 96,8 → 95,9%), boss ±4 điểm (n = 50): đều trong ngưỡng nhiễu (≈ ±3,2 điểm với 200 trận, ±6 điểm với 50 trận). Z-Move là đòn mạnh một lần mỗi trận nên tác dụng nhỏ, như Pokémon; không chỉnh số. Chơi liên tục (tới tầng 10, quán chủ tầng 10 đã có Z-Move): huy hiệu và tỉ lệ thắng NPC như trước (100% các đội đã thách đạo quán; `duoRare (no growth)` lần này dừng ở tầng 10 trước khi thách đạo quán nên 0 huy hiệu, không phải thua quán chủ); chưa có Vòng Z (tầng 40) nên cột `zCrystal` trống.
- Kết quả 2026-10-27 sau bậc chí mạng / chính xác / né (kịch bản mặc định, so với lần chạy trước cùng ngày): tỉ lệ thắng quét tầng biến thể `current` lệch trung bình +0,01 điểm, lớn nhất ±0,5 điểm (90 dòng, ngưỡng nhiễu ≈ ±3,2 điểm với 200 trận): đội mẫu và quái hoang tầng 1–10 ít dùng các chiêu mới, Super Luck đổi sang +1 bậc vẫn 12,5% khi không có nguồn bậc khác. Chơi liên tục: mọi đội có 1 huy hiệu ở tầng 10. Không chỉnh số.
- Kết quả 2026-10-28 sau nguồn học skill (TM / tutor / chiêu trứng, 67 chiêu nhập bù, chùn bước / lú lẫn cho chiêu Pokémon, đồ cầm chí mạng; so với lần chạy 2026-10-27): tỉ lệ thắng quét tầng lệch trung bình −0,2 điểm (quái hoang 350 ô, boss 280 ô; lệch lớn nhất ±8 điểm ở ô 50 trận boss, trong ngưỡng nhiễu ±14 của cỡ mẫu đó). Chơi liên tục: sách rơi / mua / dùng 28 / 296 / 312 (trước 34 / 304 / 314), trận quái hoang 1.132 (trước 1.206), thua 208 (214), mọi đội vẫn 1 huy hiệu ở tầng 10 (trừ `duoRare` có growth, như trước); đồ cầm chí mạng được mua và cầm 24 lần (`critItem`). Không chỉnh số. Thời gian (quick, `--workers 1`): 84,4 giây có `holdCritItems` / 84,0 giây không có (progression 21,7 / 21,4 giây): chỉ chạy ở thị trấn, duyệt hàng cửa hàng, không thêm trận.

## Ngày đêm và mùa (`floorSweep.ts`)

- Quét tầng trải trận theo giờ (`sweepTime`: `startHour + 13 × i`), `floor-fields.csv` thêm lớp `dayPhase` / `season` (`calendar.md`). Chơi liên tục đã có giờ trôi thật, không cần sửa.
- Kết quả 2026-10-28 (kịch bản mặc định, so với lần chạy 19:39 cùng ngày, 1.086 giây với 11 worker): tỉ lệ thắng quét tầng lệch trung bình −0,14 điểm, 15 / 630 ô lệch quá 2 sai số chuẩn (kỳ vọng nhiễu ≈ 5%), lớn nhất `duoRare` tầng 10 quái hoang −12 điểm (z −4,8, ô có loài ban đêm mạnh hơn được nhân ×2). Theo thời khắc (biến thể `current`, quái hoang): bình minh 69,0%, ngày 70,9%, hoàng hôn 68,2%, đêm 68,1% (đêm khó hơn ngày ~3 điểm vì loài ma / bóng tối / undead / demon gặp nhiều hơn); theo mùa 68,9–69,7%. Mục tiêu: chênh lệch giữa thời khắc / mùa ≤ 5 điểm (đủ để thấy khác nhau, không bắt người chơi né giờ); đạt nên không chỉnh số. Chơi liên tục: thắng quái hoang 86,2 → 87,3%, boss như cũ ±2 điểm.
- Kết quả 2026-10-28 sau giờ hoạt động theo nguồn gốc (Pokémon PokeAPI, động vật EltonTraits / Wikidata, thêm `cathemeral`; so với lần chạy trước, 868 giây): quét tầng lệch trung bình +0,04 điểm, 3 / 630 ô lệch quá 2 sai số chuẩn (dưới mức nhiễu). Quái hoang theo thời khắc (`current`): bình minh 67,6%, ngày 70,9%, hoàng hôn 67,2%, đêm 68,8% (chênh ngày / đêm 2,1 điểm, đạt mục tiêu ≤ 5). Chơi liên tục: thắng quái hoang 88,6%, boss 37,6%. Không chỉnh số.

## Ngự thú sư (`tamer.ts`)

- Mọi trận: phe người chơi dùng lệnh ngự thú sư của `suggestTamerCommand` mỗi lượt (null = không dùng; luật ở `tamer.md`). Số lần dùng đếm vào bảng nhóm skill (`ai.csv`) với nhóm `tamer:<id>` của phe dùng.
- Quét tầng / quét map / tìm level (`sweepFloor`): ngự thú sư ở **cảnh giới giả định** `assumedTamerRealm(tầng)` = ⌊(tầng − 1) / 10⌋ (như luật migrate save cũ), nên cộng hưởng, linh lực, kỹ năng đã mở theo tầng.
- Chơi liên tục: cảnh giới thật. Sau mỗi trận, EXP ngự thú sư đủ đột phá thì "người chơi" về thị trấn (kể cả khi không mất máu) và đột phá liên tục tới khi không còn đủ điều kiện (`breakthroughWhilePossible`): thiếu Phá Cảnh Đan mà cửa hàng có bán và đủ tiền (sau khi chừa tiền đột phá) thì mua cho đủ. `progression.csv` thêm cột `realm` (cảnh giới lúc mở tầng) và `breakthroughFails` (số lần đột phá thất bại trong lúc ở tầng đó).

## Tính cách (`team.ts`)

- Đội mẫu (`buildMonster`) dùng Bạc Hà như người chơi thật: tính cách tăng chỉ số tấn công cao hơn (công / đặc công ở bước level) và giảm chỉ số tấn công còn lại (`bestNatureId`; không có tính cách khớp thì giữ tính cách đã tung). Quái hoang / boss tung đều như game (`natures.md`). Đo tác động bằng biến thể `noNature` (đã thay bằng `noPartner` ở bước 5l; thêm lại khi chỉnh tính cách).

## Thuần thục skill (`mastery.ts`)

- Mỗi trận quét tầng dùng quái mới nên thuần thục không tự tích được (cấp 2 cần 4 lần dùng): quét tầng / quét map / tìm level đặt **thuần thục giả định** cho mọi skill đang biết của đội mẫu, exp = `expPerFloor × (tầng − 1)` (`withAssumedMastery`; `teamMastery`: `masteryExpPerFloor` của đội đè số chung), cấp tính ngược từ exp.
- Chơi liên tục: thuần thục tích thật theo luật game (`skill-mastery.md`). `progression.csv` thêm cột `masteryLevel` / `masteryExp`: cấp / exp trung bình trên mọi skill đang biết của đội mẫu lúc mở tầng (`averageMastery`), dùng để **chỉnh lại số giả định**: exp trung bình lúc mở tầng N ≈ `expPerFloor × N`.
- Đo 2026-10-24 (kịch bản mặc định, chơi liên tục): exp trung bình mỗi skill tăng khoảng `duo` 60, `full6` 20, `duoRare` 25 mỗi tầng (đội ít quái thì mỗi quái đánh nhiều hơn); `solo` chưa đo (không chơi liên tục), dùng như `duo`.
- Biến thể `noMastery` (đã thay bằng `noSynergyHold`, thêm lại khi cần) tắt hiệu lực (giữ exp / cấp) để so tác động của thuần thục trên cùng đội; `noSynergyHold` bỏ synergy / hold để so tác động của hai trường này.

## Độ kiếp (`tribulation.ts`, `awakening.ts`)

- Phần `tribulation` (kịch bản `tribulation { teamId, tiers, levelOffsets, battles }`, độ lệch ≥ 0 vì thấp hơn level cần thì không độ kiếp được): mỗi tầng sẽ lên một việc; quái đầu của đội dựng ở level `levelPerTier × tầng + độ lệch` (gen, thân mật, thuần thục giả định theo tầng ứng với level), đã thức tỉnh tới tầng trước, ở thị trấn đủ tiền / đan, đánh `battles` lần bằng action thật `startTribulation` (AI chung, biến thể đầu tiên). Bảng `tribulation.csv`: tầng, độ lệch, level, số trận, tỉ lệ thắng, số lượt trung bình.
- Chơi liên tục: khi có quái đội mẫu đủ level, không trọng thương và còn đường lui (`tribulationFailures < maxFailures`), "người chơi" về thị trấn, sau đột phá thì độ kiếp từng quái tới khi hết điều kiện / tiền / đan hoặc thua (mua Thức tỉnh đan cùng hệ với quái nếu cửa hàng bán, hệ đầu trước), NPC hồi máu sau mỗi lần. Sau độ kiếp, quái đủ điều kiện hóa hình thì hóa hình (mua Hóa Hình Đan nếu cửa hàng bán; `human-form.md`). Phần `tribulation`: quái đã thức tỉnh (tầng ≥ 2) mà race cho thì ở nhân hình (Hiện nguyên hình được). Cột `awakening` (tầng trung bình lúc mở tầng), `awakenings`, `tribulationFails`, `humanForms` ở `progression.csv`.

## Thám hiểm (`expeditions.ts`)

- Chơi liên tục: mỗi lần ở thị trấn "người chơi" phái quái rảnh trong kho (trứng nở vào kho) đi các thám hiểm trên bảng khi còn ô (đội gồm quái level cao nhất, đủ số tối đa của `teamSize`, không có thì 4; đội không đủ yêu cầu thì bỏ qua mẫu đó). Cột `expeditions` ở `progression.csv` (`expeditions.md`).

## Nhiệm vụ (`quests.ts`)

- Chơi liên tục: mỗi lần ở thị trấn "người chơi" nhận thưởng nhiệm vụ đã xong, hủy loại mô phỏng không làm được (bắt, fuse, breed), nhận nhiệm vụ làm được (hạ quái, boss tầng, trứng nở) trên bảng cho đủ số tối đa; bảng không có loại làm được thì nhận rồi hủy nhiệm vụ đầu bảng để đổi (tối đa 10 lần mỗi lần ở thị trấn). Cột `quests` ở `progression.csv` (`quests.md`).

## Ngự thú sư NPC (`trainers.ts`)

- Quét tầng: trận quái hoang có `trainers.encounterChance` % là trận NPC (như game thật); `BattleStats.trainerClassId`, `FloorResult.byTrainer` theo lớp NPC → `trainers.csv` (số trận, tỉ lệ thắng mỗi tầng / đội). Quét tầng coi như người chơi đã thắng mọi đạo quán đã qua (có vật phẩm chìa khóa của các tầng đạo quán ≤ tầng đang quét).
- Chơi liên tục: mỗi ngày game tối đa một lần khi ở thị trấn (sau hồi máu, đột phá, độ kiếp): dự giải đấu nếu kỳ này chưa dự (đánh tới vô địch / bị loại; dừng giữa chừng thì bỏ giải), đánh đấu trường một trận, rồi thách đạo quán chưa có huy hiệu thấp nhất (đi tới tầng đó, đánh tới khi có huy hiệu hoặc thua), về thị trấn hồi máu. Cột `trainerBattles` (cả NPC gặp trên tầng), `trainerWinRate`, `badges`, `tournaments`, `arenaRank` ở `progression.csv` (`trainers.md`).

## Bí cảnh và tháp thí luyện (`trials.ts`)

- Chơi liên tục: cùng nhịp với ngự thú sư NPC (mỗi ngày game tối đa một lần khi ở thị trấn, sau việc NPC): có Bí Cảnh Lệnh thì vào bí cảnh và đánh lần lượt (trận cuối dùng trần lượt boss) tới khi xong hoặc không thắng (hết lượt thì bỏ cuộc); rồi leo tháp tối đa `TOWER_ATTEMPTS_PER_DAY` (3) tầng, dừng khi không thắng (tầng boss dùng trần lượt boss); hồi máu sau mỗi lần. Không dùng vật phẩm trong bí cảnh. Cột `trials` (hoàn thành / đã vào), `trialBattles`, `towerWins`, `towerFloor` (tầng tháp cao nhất lúc mở tầng) ở `progression.csv` (`trials.md`).

## Độ bất ổn tầng (`floorSweep.ts`)

- Biến thể `instabilityLevel` (số nguyên ≥ 0, mặc định 0): mỗi trận quét tầng mang độ bất ổn mức đó (`sweepInstability`: thuộc tính tung bằng RNG riêng theo seed của trận nên không đổi RNG của trận, đều đã lộ, bỏ qua mức tối đa theo tầng). So với `current` trên cùng đội / seed: tỉ lệ thắng (độ khó) và `avgMoney` / `avgExp` / `avgDropValue` (thưởng) ở `floors.csv` / `ai-summary.csv`. Kịch bản mặc định: `instability3`. Chơi liên tục chưa bật độ bất ổn (`instability.md` mục "Chưa có").

## Thần linh (`deities.ts`, `progression.ts`)

- Chơi liên tục: ân sủng (thắng, boss, bắt, thu phục), chúc phúc và tín vật chạy thật theo reducer với `deityId` của map thật. Mỗi lần về thị trấn (sau mọi việc tốn tiền khác) "người chơi" mua Hương Nến ở Miếu (`buyIncense`, tổng giá ≤ `DEITY_POLICY.spendFraction` = 20% tiền), dâng hết hương cho thần cai quản map của **tầng cao nhất** (nơi đánh boss / farm), rồi đổi tín vật của mọi thần lấy món đắt nhất (theo giá tín vật) đã mở bậc, lặp tới khi không đổi được. Hương và tín vật không bị bán như nguyên liệu dư (`isDeityCurrency`). Ô `economy` của `progression.csv`: `incense` (nén đã dâng), `deityBuy` (món đổi bằng tín vật), `favorRank` (bậc ân sủng cao nhất trong mọi thần lúc mở tầng). A/B: chạy `--parts progression` với `config.deities` tắt (tín vật 0%, bậc không bao giờ đạt) so với bật, cùng code (`balance-systems.md` mục "Thần linh").

## Event (`events.ts`)

- Mọi action của mô phỏng đi qua `simAct`: trước action, "người chơi" giải quyết event đang chờ (lựa chọn đầu tiên trả được vật phẩm; dữ liệu xếp lựa chọn chủ động trước) và thủ thành khi thú triều đang diễn ra (đánh đợt thường; trước mỗi đợt hồi máu bằng vật phẩm (`healWithItems`, mục dưới); đã mở thú vương mà máu cả đội còn ≥ `KING_HP_FRACTION` (60%) thì thách thú vương, không thì đánh tiếp đợt thường; không còn quái đánh được thì rút lui; thú triều kết thúc thì hồi máu ở NPC); event mới sau action (event thị trấn, thú triều bắt đầu) giải quyết ngay. Trận event / đợt thú triều đánh tới hết; chạm trần `EVENT_BATTLE_TURNS` (400) thì trận event bỏ như chưa đánh (giữ RNG) và thử lựa chọn kế tiếp, đợt thú triều thì rút lui; đếm ở cột `timeouts` của `events.csv`. Không mua ở cửa hàng tạm. Cửa hàng thị trấn đóng thì các phần mua đồ thấy hàng rỗng (`shopStock`).
- `runBattle`: `startWildBattle` ra event thì giải quyết rồi gặp lại (tối đa `MAX_EVENT_RETRIES` 50 lần); trận event thua đưa về thị trấn thì hồi máu và quay lại tầng cũ.
- Cột `events` (số event), `eventBattles` (thắng / trận event), `tides` (thắng hết / bắt đầu), `tideWaves` ở `progression.csv`; bảng `events.csv` mỗi lần chơi: số event theo id, tỉ lệ thắng trận event, tiền nhận / mất từ kết quả event, thú triều (thắng hết / bắt đầu, thất bại, thua thú vương `kingLosses`, đợt thắng, trung bình đợt thắng trước khi hạ thú vương `wavesBeforeKing`), số trận chạm trần (`events.md`). Đo thú triều / trận event cần nhiều mẫu: tạm tăng tần suất trong `balance.json` (ví dụ `beastTide.intervalDays` 6–10, `wildBattleChance` 40), chạy `--parts progression` rồi khôi phục (`balance-systems.md`).

## Linh thực (`cooking.ts`)

- Chơi liên tục: mỗi lần ở thị trấn, **trước luyện đan** (luyện đan dùng hết dược liệu), chưa có món đang ăn thì "người chơi" ăn món ăn trong túi; không có thì nấu món có cấp yêu cầu cao nhất còn đủ nguyên liệu (nguyên liệu thiếu mà cửa hàng đang bán thì mua đủ một lần nấu; nấu từng lần tới khi thành công) rồi ăn. Không nấu Bạc Hà / mồi dụ. Cột `meals` (số món đã ăn), `cooks` (số lần nấu), `cookingLevel` ở `progression.csv` (`cooking.md`).

## Luyện đan (`alchemy.ts`)

- Chơi liên tục: mỗi lần ở thị trấn (trước đột phá / độ kiếp) "người chơi" thu hoạch ô chín, trồng hạt giống trong túi vào ô trống, luyện hết mọi công thức luyện đan dùng được (thứ tự trong `recipes.json`), học đan phương trong túi. Giả định (`ALCHEMY_POLICY`): bỏ qua công thức luyện khí (yêu đan để đúc, `forge.ts`); công thức dùng nguyên liệu nhóm (yêu đan bất kỳ) mỗi lần về thị trấn luyện tối đa `groupRecipeTimes` (1) lần để giữ yêu đan cho Thợ rèn. Cột `crafts`, `harvests`, `alchemyLevel` ở `progression.csv` (`alchemy.md`).

## Hồn tinh (`soulLevels.ts`)

- Chơi liên tục: mỗi lần về thị trấn (sau đột phá / độ kiếp, hai việc đó ưu tiên tiền) "người chơi" dùng hết điểm hồn tinh lên đội mẫu, mỗi lần nâng (quái, chỉ số) có cấp thấp nhất trong các chỉ số hữu ích (bỏ chỉ số công yếu hơn), hết điểm hoặc tiền thì dừng. Cột `soulUpgrades` (số lần nâng) và `soulPercent` (% chỉ số trung bình từ hồn tinh lúc mở tầng, như `gearPercent`) ở `progression.csv` (`soul-levels.md`).

## Điểm nỗ lực (`effort.ts`)

- Chơi liên tục / quét bằng đội thật: điểm tăng thật sau mỗi trận thắng theo luật game (`effort-values.md`); "người chơi" không mua vitamin / đồ cầm Power (giả định: tiền dành cho hồn tinh, đột phá). Cột `effortPercent` ở `progression.csv` (% chỉ số trung bình từ điểm nỗ lực lúc mở tầng, như `gearPercent`).
- Quét tầng / quét map / tìm level: đội mẫu có **điểm giả định** `assumedEffortValues(tầng)` = tầng × `EFFORT_PER_FLOOR` (35) điểm, tới trần tổng, chia đều 6 chỉ số. Số đo bằng chơi liên tục kịch bản mặc định (2026-10-28): tầng 1 khoảng 40–110 điểm, tầng 10 khoảng 190 (đội 6 con: ít trận mỗi con) tới 500 (đội 2 con), trung bình 350.
- Biến thể A/B `noEffort` (`effort.percentPerPoint` 0) đo tác động.

## Linh dịch (`progression.ts`)

- Chơi liên tục: nhiễm / lây thật theo luật game (`spirit-virus.md`), không thêm trận. Cột `spiritVirus` ở `progression.csv`: số quái đội mẫu đã từng nhiễm (đang nhiễm hoặc miễn dịch) lúc mở tầng.
- Kết quả 2026-10-31 (`--parts progression`, kịch bản mặc định, 42 giây): 2.068 trận, kỳ vọng 2.068 × 3/65536 ≈ 0,09 lần nhiễm, đo được 0: khớp tỉ lệ gốc. Linh dịch hiếm như Pokérus nên không đổi cân bằng tới tầng 10; không thêm biến thể A/B (quét tầng không có đội lâu dài để nhiễm, tác động mỗi lần nhiễm tính được trực tiếp: EXP ×2 trong 1–4 ngày).

## Nhóm tăng trưởng EXP và ability theo loài (`progression.ts`, quét tầng)

- Đội mẫu đều là loài Medium Fast nên chơi liên tục ghi thêm cột **`growthLevels`** ở `progression.csv`: level trung bình của đội nếu cùng lượng EXP thuộc từng nhóm (`levelFromExp`, không chạy thêm trận; `growth-rates.md`).
- Kết quả 2026-10-28 (kịch bản mặc định, `--parts progression`, tầng 10): duo Medium Fast 163 → Erratic 193,5 (+19%), Fast 175,5 (+8%), Medium Slow 159,5 (−2%), Slow 151,5 (−7%), Fluctuating 138 (−15%); full6 tương tự. Đúng tỉ lệ của gốc ở level 100 (căn bậc ba tỉ lệ EXP), nhóm là đặc tính loài như Pokémon nên **không bù cân bằng**.
- Ability theo loài (`abilities.md`, 730 loài Pokémon có ability lúc nhập): `--parts sweep` so với lần chạy trước cùng ngày, biến thể `current` (90 ô): tỉ lệ thắng trung bình quái hoang −0,09 điểm %, boss +0,1 điểm %, ô lệch nhiều nhất ±4 điểm % (50 trận boss, sai số chuẩn ~6 điểm %): trong nhiễu, không sửa số.

## Thiên phú quái (`talents.ts`)

- Chơi liên tục: mỗi lần về thị trấn (sau hồn tinh; thiên phú không tốn tiền nên không tranh việc khác) "người chơi" dùng hết điểm thiên phú của từng quái đội mẫu, mỗi lần nâng nút nâng được có giá cấp tiếp theo rẻ nhất (rải đều theo giá tăng dần), hòa theo thứ tự trong `talents.json`. Cột `talentUpgrades` (số lần nâng) và `talentPercent` (% chỉ số trung bình từ thiên phú lúc mở tầng, như `gearPercent`) ở `progression.csv` (`monster-talents.md`).

## Thợ rèn (`forge.ts`)

- Chơi liên tục, ở thị trấn: trước khi bán đồ dư, phân giải mọi trang bị trong túi bậc từ `FORGE_POLICY.salvageMinRarity` (rare; bậc thấp hơn vẫn bán lấy tiền); sau hồn tinh, cường hóa đồ đang lắp của đội mẫu, mỗi lần món cấp thấp nhất, tới khi hết Đá cường hóa, yêu đan (cấp ≥ 10) hoặc tiền; rồi phụ linh mọi món đang lắp chưa có dòng linh hệ bằng yêu đan hệ đầu của quái mang nó (thiếu thì bỏ qua món đó), rồi đúc trang bị theo lô `FORGE_POLICY.castCores` (3) yêu đan cùng hệ (hệ đầu của quái đội mẫu theo thứ tự đội trước, rồi hệ bất kỳ đủ yêu đan), món gốc: quái đội mẫu còn ô trống thì món thường giá gốc cao nhất, không thì món thường kém nhất đang lắp (tự lắp đổi sang món đúc nếu tốt hơn). Không tẩy luyện (giả định: khó chấm điểm dòng phụ). Đá của Thợ rèn không bị bán (`sellSurplus`). Yêu đan chỉ cho quái đúng khẩu vị ăn (`treasures.ts`), còn lại giữ để luyện. Cột `enhances`, `salvaged`, `casts` (số lần đúc), `imbues` (số lần phụ linh), `smithingLevel`, `demonCores` (số yêu đan trong túi lúc mở tầng) ở `progression.csv`; tác dụng đo bằng `gearPercent` (`equipment-forge.md`).

## Thiên tài địa bảo (`treasures.ts`)

- Chơi liên tục: sau mỗi trận "người chơi" dùng hết thiên tài địa bảo trong túi lên đội mẫu (đúng khẩu vị trước, rồi quái ăn ít món đó nhất; Ngộ Đạo Trà cho skill power cao nhất; món không có tác dụng thì giữ lại). Cột `treasures` ở `progression.csv` (`treasures.md`).

## Thân mật (`affinity.ts`)

- Quét tầng / quét map / tìm level: đội mẫu có **thân mật giả định** `assumedAffinity(tầng)` = thân mật quái khởi đầu ở tầng 1, tối đa (`affinity.max`) từ tầng 2, vì chơi liên tục cần khoảng 200 trận mỗi tầng nên qua tầng 1 là đầy. Chơi liên tục: thân mật tăng / giảm thật theo luật game (`affinity.md`).

## Fuse, breeding và mạnh lên trong chơi liên tục (`growth.ts`)

- Mỗi đội chạy một lần cho mỗi chế độ trong `progression.growthModes` (mặc định và quick: `[true, false]`; thiếu = `[true]`), nhân với `pillModes`. Lần chơi `false` ghi tên đội kèm `(no growth)` để so A/B mức mạnh lên nhờ fuse / breeding.
- Bật (`growth: true`), "người chơi" (giả định ở `GROWTH_POLICY`, không phải luật game):
  - **Bắt quái** (`captureCommand`, qua `runBattle { capture }`): trận quái hoang / boss thường (không NPC, bí cảnh, độ kiếp, trận đặc biệt), ô đầu tiên ném bóng thay lệnh AI vào quái làm được nguyên liệu fuse cho quái đội mẫu (có loài mới, tỉ lệ fuse không bùa ≥ `minFuseChance` 50%: cùng race hoặc race hợp, lineage còn ngắn) hoặc hiến tế được cho quái đội mẫu (mục "Hiến tế"), khi bóng tốt nhất trong túi có tỉ lệ ≥ `minCatchChance` (10%), kho chưa đủ `maxFodder` (4) nguyên liệu; lượt có hợp kích kỹ thì không ném. Ở thị trấn mua bóng loại tốt nhất cửa hàng đang bán cho đủ `ballsWanted` (10); quái bắt về dư thì hiến tế (mục "Hiến tế"), không còn làm nguyên liệu cho ai thì thả (`releaseStaleFodder`).
  - **Fuse** (`fuseWhenPossible`, ở thị trấn, sau việc NPC): mỗi quái đội mẫu fuse với nguyên liệu rảnh trong kho có tổng chỉ số cao nhất, nếu giá ≤ `spendFraction` (50%) tiền và tỉ lệ (đã cộng bùa tăng tỉ lệ mạnh nhất trong túi; thiếu thì mua bùa tăng tỉ lệ rẻ nhất đủ đạt `safeFuseChance`) ≥ `minFuseChance` (50%: cùng race hoặc race hợp), fuse không Bùa Hộ Mệnh khi tỉ lệ ≥ `safeFuseChance` (75%), thấp hơn thì phải có Bùa Hộ Mệnh (mua khi giá ≤ 50% tiền); kế thừa skill như `lineage.ts` (`chooseInheritance`). Đội chỉ còn quái gốc mà không hộ mệnh thì không fuse (luật `partyWouldBeEmpty`). Thất bại mất quái gốc: quái mạnh nhất trong kho vào đội mẫu (`teamLost`).
  - **Breeding** (`breedWhenPossible`): mỗi `breedEveryDays` (30) ngày breed cặp đực / cái rảnh (đội và kho) có tổng gen cao nhất breed được, giá ≤ `breedSpendFraction` (20%) tiền (50% thì đội thiếu tiền đột phá, `balance-systems.md`). Con nở vào kho, lên level nhờ thám hiểm (`expeditions.ts`); con mạnh hơn quái yếu nhất của đội mẫu ≥ `promoteRatio` (×1,05 tổng chỉ số) thì đổi vào đội mẫu (`promoteChildren`).
  - **Trận pháp** (`applyFormations`): học mọi trận đồ trong túi, chọn trận pháp đã học đầu tiên đội đủ yêu cầu. **Dưỡng dục** (`petRequests`): vuốt ve quái đang đòi sau mỗi trận.
- Hồi máu bằng vật phẩm (`healWithItems`, mọi chế độ): giữa các đợt thú triều (không hồi ở NPC được) quái gục dùng vật phẩm hồi sinh, quái dưới `itemHealBelowPercent` (60%) máu dùng thuốc; thiếu thì mua ở cửa hàng (giá ≤ 50% tiền).
- Cột `captures` (bắt được / lần ném), `fuses` (thành công / lần fuse), `teamLost`, `breeds`, `promotions`, `fuseSkips` (lần bỏ qua fuse theo lý do: `money` giá fuse > 50% tiền, `charmNotSold` cửa hàng không bán bùa đủ dùng, `charmTooExpensive` có bán nhưng không đủ / quá đắt, `lastMember`) ở `progression.csv`.

## Thu phục (`growth.ts`, `battleRunner.ts`)

- Chơi liên tục, chế độ có growth: "người chơi" Thị Uy ở lượt đầu (`intimidateCommand`, thay gợi ý AI của lượt đó) vào quái hoang làm nguyên liệu fuse được khi tỉ lệ ≥ `GROWTH_POLICY.minIntimidateChance` (0,5) và kho chưa đủ nguyên liệu; trận thắng có quái xin theo thì nhận nếu làm nguyên liệu được, không thì từ chối (`recruitDecision`, tùy chọn `recruit` của `runBattle`); ở thị trấn chưa có mồi mà còn thiếu nguyên liệu thì dùng / mua mồi rẻ nhất (`applyBaitWhenNeeded`). Quái thu phục tính là nguyên liệu như quái bắt (`isCaughtSpare`).
- Cột `recruits` của `progression.csv`: `quái thu phục / lần xin theo  Thị Uy thành công / lần  b<số mồi đã dùng>` (quái thu phục gồm cả Thị Uy). Cột `captures` chỉ đếm quái bắt bằng bóng (sự kiện `caught`).

## Khu bảo tồn (`safari.ts`)

- Phần `safari` (bước 5q2; luật ở `safari-zone.md`): mỗi (tầng trong `safari.floors` × cách chơi) vào khu `visits` lần liên tiếp bằng action thật (`enterSafari` → action của khu tới khi ra khu; danh sách loài đổi theo ngày như thật). Map của tầng như quét tầng (`floorMapsFor`), cảnh giới giả định theo tầng (`assumedTamerRealm`), đội một quái loài đầu của map (để có kỹ năng đồng hành); mỗi lượt vào khu đủ tiền, bỏ quái đã bắt và event / thú triều (không đo ở phần này).
- Cách chơi mỗi lần gặp: `balls` chỉ ném bóng; `rock` ném đá một lần rồi ném bóng; `bait` ném mồi thường một lần rồi ném bóng; `rareOnly` chỉ bắt loài catchRate < 30, loài khác bỏ đi.
- Bảng `safari.csv`: tầng, cách chơi, số lượt vào khu, trung bình mỗi lượt (quái bắt được, bóng đã ném, quái chạy mất, lần gặp), tỉ lệ bắt mỗi bóng, catchRate / thứ hạng phẩm cấp trung bình của quái bắt được, % quái thuộc loài không có trong map đã mở, phí một lần vào khu, phí trên mỗi quái.
- Phần `zones` (hiểm địa; luật ở `zones.md`, mục tiêu ở `balance-systems.md`): mỗi (hiểm địa × tầng trong `zones.runs`; `leadSpeciesId` đổi loài quái đầu đội cho hiểm địa cần loài / dòng tiến hóa) vào `visits` lần liên tiếp bằng action thật với đội `zones.teamId` dựng ở tầng đó (`buildTeam`, cảnh giới giả định theo tầng): hồi máu ở thị trấn trước mỗi lượt vào, mang đúng đồ tiếp tế `zones.supplies` (hồi sinh / hồi máu / chữa trạng thái) và vật phẩm điều kiện của hiểm địa (túi chỉ còn các món đó), tua giờ tới ngày mở lại (bỏ qua thời gian khóa); trước mỗi bước dùng đồ tiếp tế (quái gục: hồi sinh; máu dưới `healBelowPercent` %: hồi máu; có trạng thái: chữa), `exploreZone` tới khi hết lượt vào; bước mở trận đánh bằng `runBattle` (chạy lại đúng bước đó, tất định), hết lượt trận thì rời hiểm địa. Không dùng vật phẩm trong trận, không ném bóng. Bảng `zones.csv`: tỉ lệ xong / thua / bỏ, trận mỗi lượt vào, tỉ lệ thắng trận / boss canh giữ, giờ, giá trị đồ (chênh lệch túi theo giá gốc ở tầng đó) và tiền mỗi lượt vào, số món / giá đồ tiếp tế đã dùng (kể cả vật phẩm điều kiện), giá trị ròng mỗi giờ (trừ đồ đã dùng).
- Phần `gathering` (câu cá / khai thác; luật ở `gathering.md`, mục tiêu ở `balance-systems.md`): mỗi (tầng trong `gathering.floors` × cách chơi trong `gathering.runs`: `fishing` / `mining` với `toolItemId` và `lureItemId` tùy chọn, hoặc `wild` = trận quái hoang thường để so) làm `casts` lần liên tiếp bằng action thật với đội `gathering.teamId` dựng ở tầng đó. Mọi cách chơi của một tầng ở **cùng một map** câu cá và khai thác được (chọn theo seed). **Giả định:** hồi máu và về lại tầng giữa hai lần không tốn giờ (như đội tự hồi bằng vật phẩm); có dụng cụ dù chưa tới tầng mua được (đọc kết quả theo cấp mua được ở tầng đó); trận mở ra đánh bằng `runBattle` (chạy lại đúng action, tất định), không ném bóng, từ chối quái xin theo. Bảng `gathering.csv`: map, % lần ra trận, tỉ lệ thắng, % loài hiếm (catchRate < 30), level địch trung bình, giờ / đồ (giá gốc, kể cả đồ rơi) / tiền / mồi mỗi lần, giá trị ròng mỗi giờ. Phần `gathering` 16–24 việc, ~45–70 giây CPU.
- Bắt trượt (bước 5q3) đo qua chơi liên tục (`captureCommand` chọn bóng theo `battleCatchChance`, đã cộng bắt trượt) và trong `safari.csv`.

## Kinh tế và việc nhỏ (`economy.ts`, mọi chế độ)

- Giả định ở `ECONOMY_POLICY`. Ở thị trấn, trước mọi việc tốn tiền: bán mọi trang bị còn trong túi (tự lắp đã lấy món tốt nhất; món bậc từ rare đã phân giải trước, `forge.ts`) và nguyên liệu dư quá `materialKeep` (20) mỗi loại (trừ đá của Thợ rèn), giá theo thị trường động (`sellSurplus`). Sau luyện đan: mua ô linh điền khi giá ≤ `plotSpendFraction` (20%) tiền (`buyPlotWhenCheap`). Sau ô linh điền: kho quái / túi trang bị còn ≤ `capacityMargin` (5) chỗ thì mở rộng khi giá ≤ `capacitySpendFraction` (20%) tiền (`expandCapacityWhenFull`; cột `economy`: `expand`, `storagePeak` / `bagPeak` = chỗ dùng cao nhất thấy ở thị trấn, `capacity.md`).
- Sau mỗi trận: quái đội mẫu chưa đầy thân mật ăn vật phẩm thân mật trong túi, quái thấp nhất trước (`feedAffinityItems`); có vật phẩm chìa khóa (Vòng Mega) thì quái đội mẫu cầm đá Mega của loài nó có trong túi, hết ô thì thay trang bị bậc thấp nhất (`holdMegaStones`), để AI Mega trong trận; có Vòng Z thì cầm Z-Crystal hợp skill có trong túi (`holdZCrystals`, mục "Z-Move").
- Ngay sau khi giải quyết event mở cửa hàng tạm (thương nhân, chợ đen): mua món dùng được (bóng, bùa fuse, kẹo / thuốc / vật phẩm thân mật, Bí Cảnh Lệnh, trận đồ, đan phương; tối đa `tempShopMaxCount` 3 mỗi món) và trang bị từ bậc `tempShopMinRarity` (epic), giá ≤ `tempShopSpendFraction` (30%) tiền (`buyFromTempShop`; cột `tempShopBought` ở `events.csv`). Không mua tinh thể trait ở cửa hàng tạm (tinh thể mua ở cửa hàng thường, mục "Tinh thể trait").
- Cứ `EXPLORE_EVERY` (5) trận quái hoang thì một trận dùng `explore` (chủ động tìm event, `progression.ts`).
- Ở thị trấn, sau mua sách: quái đội mẫu chưa cầm đồ cầm tăng bậc chí mạng (đồ `persistent` có hook `critStage`, hợp loài theo `speciesIds`) mua món nhiều bậc nhất cửa hàng đang bán cho nó nếu đủ tiền và cầm vào ô trống, không thay trang bị (`holdCritItems`).
- Ở thị trấn: chưa có bản mệnh thú (hoặc đã chết, hết thời gian chờ) thì kết với quái đội mẫu mạnh nhất (tổng chỉ số) đủ thân mật (`bindBondWhenPossible`); không đổi bản mệnh khi đã có.
- Cột `economy` ở `progression.csv`: `sold` (món đã bán), `affinity` (vật phẩm thân mật đã dùng), `mega` (lần cầm đá Mega), `zCrystal` (lần cầm Z-Crystal), `critItem` (đồ cầm chí mạng đã mua và cầm), `plots` (ô linh điền mua), `bond` (lần kết bản mệnh), `dex` (mốc Bộ sưu tập đã nhận, `claimDexRewardsWhenPossible`), `contract` / `contractFail` / `escape` (khế ước thành công / thất bại / quái bỏ trốn: "người chơi" khế ước quái đội mẫu chưa khế ước khi tỉ lệ ≥ `minContractChance` 60%, `contractTeamWhenPossible`; `tamer.md` mục "Khế ước").
- Không mô phỏng (ảnh hưởng nhỏ tới cân bằng hoặc đã đo riêng): Bạc Hà Tính Cách (±10% một chỉ số), học lại skill ở NPC, đổi hệ Tera, chiến thuật tự đánh (đã có biến thể A/B ở quét tầng), đổi nhân hình / bản thể, chọn quái đầu đội theo kỹ năng đồng hành.

## Tinh thể trait (`traitCrystals.ts`)

- Chơi liên tục, ở thị trấn, sau mọi việc NPC khác (giá nhỏ so với fuse / đột phá; `tuneTeamTraits`): giả định ở `TRAIT_CRYSTAL_POLICY`, mỗi việc chỉ làm khi tổng giá ≤ `spendFraction` (20%) tiền. (1) Gỡ mọi trait xấu (`negative`) của quái đội mẫu: extract rồi bán tinh thể ngay. (2) Inject tinh thể trait tốt (`positive` / `rare`) có trong túi, cấp cao trước, lên quái đội mẫu đầu tiên nhận được (gộp cấp hoặc còn ô; không inject tinh thể loại trừ với trait đang có vì sẽ bỏ cả hai). (3) Mua tinh thể trait tốt cửa hàng đang bán khi có quái đội mẫu nhận được, rồi inject. Cột `economy` ở `progression.csv`: `extract`, `inject`, `crystalBuy` (`trait-crystals.md`).
- Đo 2026-10-31 (kịch bản mặc định, `--parts progression`, A/B bằng code trước / sau): 74 lần mua + inject (đội mẫu không có trait xấu nên chưa extract); không đội nào kẹt (trước đó `duo` kẹt ở tầng 10: margin 76 > 75); tổng trận quái hoang tới tầng 10 của 6 lần chơi 528 → 501 (`duo` 128 → 89, `full6` 92 → 119, `full6 (no growth)` 99 → 84: lệch theo RNG vì trait đổi diễn biến trận; `duoRare` không đổi). Không đổi số cân bằng: giá tinh thể nhỏ so với tiền (giá cấp 1 khoảng 1–2 trận quái hoang tầng 3), dồn cấp đắt dần theo cấp².

## Hiến tế (`sacrifice.ts`, `growth.ts`, `lineage.ts`)

- Chơi liên tục, ở thị trấn, ngay sau fuse (`sacrificeSpareFodder`, giả định ở `SACRIFICE_POLICY`): quái bắt / thu phục về trong kho, trừ `keepFuseFodder` (2) nguyên liệu fuse tổng chỉ số cao nhất, hiến tế hàng loạt vào quái đội mẫu cùng race, cùng lineage (ít stack trước) khi giá ≤ `spendFraction` (20%) tiền; nguyên liệu hết dùng còn lại thả như cũ. Bắt / Thị Uy / nhận xin theo cả quái hiến tế được cho quái đội mẫu (`isWantedFodder`). Cột `economy` ở `progression.csv`: `sacrifice` (số quái phụ).
- Breed nhiều đời (`lineage.ts`): mỗi đời các con không chọn (cùng loài, level 1) hiến tế vào con được chọn (`absorbSacrifice`); cột `sacrificeStacks`, `sacrificeCost` ở `lineage.csv`.
- Đo 2026-10-31 (kịch bản mặc định): chơi liên tục 0 lần hiến tế, mọi ô giống trước (đội mẫu race hiếm, nguyên liệu toàn khác loài để fuse); breed 20 đời ×1,56 (không hiến tế ×1,55), độ thuần 6–18%. Trước khi kẹp độ thuần (`sacrifice.md`) breed 20 đời ×2,55, độ thuần 100 từ đời 18: đã sửa luật. Số ở `balance-systems.md` mục "Hiến tế".

## Luân hồi (`rebirth.ts`, `progression.ts`)

- Chơi liên tục, ở thị trấn, sau hóa hình (`rebirthWhenPossible`, giả định ở `REBIRTH_POLICY`): quái đội mẫu (đội / kho, rảnh) đủ level, đủ Luân Hồi Đan, giá ≤ `spendFraction` (30%) tiền thì luân hồi, level cao nhất trước, **tối đa một quái mỗi lần về thị trấn** và không luân hồi khi còn quái đang luyện lại (đã luân hồi, level < `recoverRatio` (50%) level cao nhất từng đạt). Cửa hàng tạm (chợ đen) mua Luân Hồi Đan như món dùng được (`isUsefulStack`). Cột `rebirths` ở `progression.csv`.
- Đo 2026-10-31: A/B bằng `spendFraction` 0 (không luân hồi), cùng code; kết quả ở `balance-systems.md` mục "Luân hồi". Thêm bảng rơi / món chợ đen làm đổi chuỗi RNG nên so với CSV trước khi có luân hồi lệch tới −27% số trận cả ở đội không luân hồi (full6): so A/B, không so với bản cũ.

## Cấy ghép (`implant.ts`, `progression.ts`)

- Chơi liên tục, ở thị trấn, sau NPC tinh thể trait (`implantTeam`, giả định ở `IMPLANT_POLICY`): mỗi quái đội mẫu trong đội cấy huyết thanh hiệu ứng (nhiều cấp nhất) tới khi đủ `effectLevelsWanted` (3) cấp hiệu ứng dương, còn lại huyết thanh cộng chỉ số tổng cao nhất; chỉ bậc giá gốc ≥ `minTierPrice` (800: lượt cấy an toàn chỉ khoảng 6 mỗi quái nên không phí vào common), tổng giá mỗi lượt về thị trấn ≤ `spendFraction` (30%) tiền lúc đến, khi tỉ lệ lần tới ≥ `minChance` (50%), **không liều mạng** (dừng khi lần thất bại kế tiếp sẽ mất quái; người chơi thật load lại được). Cột `economy` ở `progression.csv`: `implant` (thành công), `implantFail`, `implantEffect` (lần cấy là huyết thanh hiệu ứng), `implantShare%` (`implantSharePercent`: tổng cấy ghép cộng chỉ số / tổng (gốc loài + gen × geneWeight) của đội mẫu, lần đo cuối của tầng).
- Đo 2026-10-31 (kịch bản mặc định, `--parts progression`; A/B/C bằng `effectLevelsWanted` 0 = không dùng hiệu ứng, `minChance` 101 = không cấy, cùng code): kết quả ở `balance-systems.md` mục "Cấy ghép". Nhiễu một lần chạy lớn: chỉ đổi chuỗi RNG đã lệch tới −40% số trận (full6 119 → 72), nên so A/B/C theo chiều chung của 6 đội, không theo từng ô.
- Các bản chính sách đã thử: mỗi lần cấy được tiêu tới 20% tiền (cấy liên tiếp cạn ~70% tiền, duo chậm hơn +25 trận); chọn món mạnh nhất bất kể giá (rare / epic quá ngân sách, gần như không cấy); món mạnh nhất mua được (tiêu hết lượt cấy an toàn vào common ở tầng 1–3, huyết thanh hiệu ứng không bao giờ được chọn); bậc ≥ 1.000 với 20% tiền (0–3 lần cấy cả lượt chơi: tiền trung vị ≈ 3.500 × tầng, ngân sách ≈ 700 × tầng). Bản hiện tại là bản cuối.
- Thời gian phần progression tăng vài chục giây theo số trận / lượt (chuỗi RNG mới); phần cấy ghép chỉ là vài action và một lần `computeStats` mỗi lượt về thị trấn.

## Huyết mạch (`lineage.ts`, quét tầng)

- `lineage.csv` thêm cột `bloodline` / `purity`: huyết mạch chính của quái mỗi đời breed / fuse (`bloodline.md`). Mẹ đời 0 và bố mỗi đời tung độ thuần như quái hoang (`rollMonster`), "người chơi" chọn con theo gen (không chọn theo độ thuần), nên cột đo độ thuần trôi khi breed không chủ đích.
- Biến thể A/B `noBloodline` (config `wildPurityWeights` chỉ 0, `bossPurityBonus` 0: không quái nào có huyết mạch) đã đo một lần ngày 2026-10-31 (kết quả ở `balance-systems.md`) rồi bỏ khỏi `scenarios.json` để mô phỏng đỡ tốn; thêm lại (khai báo ở trên) khi đổi số độ thuần quái hoang / boss.
- Biến thể `blood50` (`assumedPurity: 50`, cờ biến thể mới `assumedPurity`, `withAssumedPurity` ở `floorSweep.ts`): mỗi quái của đội mẫu mang huyết mạch chính là nhóm đầu của loài với độ thuần 50% (trait cấp 2, pha chỉ số 50%, cộng hưởng nhóm khi ≥ 2 quái cùng nhóm, hợp kích song huyết khi đủ thân mật). Trận pháp không đo (quét tầng không đặt trận pháp).
- `backToFloor` (`battleRunner.ts`): trận event trước trận đo mà đội bị thương thì về thị trấn hồi máu rồi quay lại tầng, kể cả khi event thắng mà vẫn ở tầng (trước đây chỉ hồi khi bị đưa về thị trấn, nên có lúc lần thử lại báo `noHealthyMonster`; lộ ra khi huyết mạch đổi chuỗi RNG).

## Breed / fuse nhiều đời (`lineage.ts`)

Chỉ đo gen, chỉ số và giá; gọi thẳng hàm thuần (`makeOffspring`, `fuseMonsters`), không qua NPC thị trấn (không đo kinh tế, thời gian ấp trứng). Chưa đánh trận với quái sau breed / fuse.

- **Breed:** mẹ đời 0 là quái mẫu (cái). Mỗi đời bố là quái hoang cùng loài của tầng `floor` (đực, level `measureLevel`); sinh `offspringPerGeneration` con, lấy con **cái** có tổng gen cao nhất làm mẹ đời sau (lớn tới `measureLevel`), các con còn lại hiến tế vào mẹ mới. Không có con cái thì giữ mẹ cũ (ghi chú). Loài không breed được (`breedBlocker`, ví dụ loài không giới tính) báo `DataError`.
- **Breed có linh thạch** (`breedInfused`, chạy cùng seed ngay sau breed thường): mỗi con đặt đủ `maxInfusions` linh thạch cùng hệ đầu (`infuseMonster`, `breeding-eggs.md` mục "Ấp trứng có hoàn cảnh") trước khi chọn mẹ đời sau. Đo 2026-10-31 (kịch bản mặc định, emberling tầng 1): 20 đời ×4,71 tổng chỉ số (gen 48 → 734) so với breed thường ×1,56; fuse 7 lần ×4,97. Linh địa và Ôn Dưỡng Lò chỉ đổi tốc độ nở, chưa đo trong chơi liên tục (người chơi mô phỏng chưa đặt linh thạch / mua lò).
- **Fuse:** quái gốc là quái mẫu; mỗi lần fuse với quái hoang cùng level, loài **ngẫu nhiên trong mọi loài thường của dữ liệu** chưa có trong lineage. Hết loài mới thì ghi "hết loài mới" và dừng.
- Bảng `lineage.csv` mỗi đời: tổng gen, tổng chỉ số (`computeStats`, ở `measureLevel` / `level`), tỉ lệ so với đời 0, tư chất (`aptitude` id bậc, `aptitudeRatio`; tầng mốc = `floor` của kịch bản; `aptitude.md`), giá (`breedCost` / `fuseCost`), stack và giá hiến tế (breed: các con không chọn hiến tế vào con được chọn, mục "Hiến tế"). Fuse luôn coi là thành công để đo chỉ số; thêm cột `successChance` (tỉ lệ thành công của lần fuse ra đời đó, không bùa, `fuseSuccessChance`) và `reachChance` (tỉ lệ đi tới đời đó mà không thất bại lần nào = tích các `successChance`). Mỗi lần fuse "người chơi" kế thừa skill power cao nhất của quái phụ (`chooseInheritance`: còn ô thì học, hết ô thì quên skill yếu hơn, không vào chờ học); cột `skillPower` (tổng power skill đang biết) và `inheritedSkills` (số skill kế thừa lần đó).

## Âm / Dương (`floorSweep.ts`, quét tầng)

- Cờ biến thể `assumedPolarity` (`yin` / `yang`; `withAssumedPolarity`): mọi quái đội mẫu mang cực đó với trait cực tính đầu pool (`polarity.md`). Quét tầng mặc định chỉ tới tầng 10 (< `unlockFloor` 30) nên quái hoang / boss không có cực; đo bằng biến thể có `config.polarity.unlockFloor: 1`.
- Kết quả 2026-10-31 (`--parts sweep`, kịch bản tạm 4 biến thể, 630 giây với 4 worker): `current` quái hoang 69,0% / boss 11,4%; `polarWild` (quái hoang 10% / boss 25% có cực từ tầng 1) 69,8% / 10,7% (lệch trong nhiễu ≈ ±1 / ±1,4 điểm với 2 sai số chuẩn); `yangTeam` (thêm đội Dương) 71,5% / 14,2% (+2,5 / +2,8 điểm); `yinTeam` 70,8% / 11,0% (+1,8 / −0,4 điểm). Mục tiêu: một cực của cả đội ≤ +5 điểm (cỡ tính cách, không bắt buộc phải dùng) và quái có cực không làm tầng khó thêm quá nhiễu: đạt nên không chỉnh số. Các biến thể này không để trong `scenarios.json` (đỡ tốn); thêm lại như trên khi đổi số `config.polarity`.

## Boss thế giới (`worldBoss.ts`)

- Phần `worldBoss` (luật ở `world-boss.md`, mục tiêu ở đó và số ở `balance-systems.md`): mỗi (đội trong `worldBoss.teamIds` × tầng trong `worldBoss.floors`) khiêu chiến `challenges` lần bằng action thật `challengeWorldBoss` (AI chung chọn lệnh, kỹ năng ngự thú sư theo gợi ý, `runBattle` với trần lượt = `worldBoss.turns` + 5 vì trận tự kết thúc). **Giả định:** đội mẫu như quét tầng (`withAssumedGrowth`: thân mật, điểm nỗ lực, thuần thục theo tầng; cảnh giới `assumedTamerRealm`; vật phẩm chìa khóa `inventoryWithKeyItems`; Z-Crystal quái đầu), mỗi lần một lần xuất hiện mới do việc theo ngày của game tung (loài, seed; ngày đầu thời gian xuất hiện để kỷ lục còn ở `current` sau khi rời trận), map tung theo seed.
- Bảng `world-boss.csv`: đội, tầng, số lần, % lần cả đội gục trước khi hết lượt, tổng sát thương theo bội số máu đơn vị (trung bình, phân vị 25 / 50 / 75), % lần đạt từng bậc (bậc cao nhất; `-` = chưa đạt). Kịch bản mặc định `duo` / `full6` ở tầng 5 / 10 / 30, 40 lần (6 việc, ~25 giây cộng mọi worker); kịch bản nhanh một đội, tầng 5, 5 lần.

## Khí giới bí cảnh (`itemWorld.ts`)

- Phần `itemWorld` (luật và mục tiêu ở `artifact-spirits.md`, số ở `balance-systems.md`): mỗi (đội trong `itemWorld.teamIds` × tầng trong `itemWorld.floors` × bậc món trong `itemWorld.rarities`) đi Khí giới bí cảnh bằng action thật (`enterItemWorld` với một món thường mới cấp 1 của bậc đó, `challengeItemWorld`, AI chung chọn lệnh, `runBattle` trần lượt `maxTurns`) từ tầng 0 tới khi thua / hết lượt / đủ `maxDepth` tầng. **Giả định:** đội mẫu như boss thế giới (`withAssumedGrowth`, `assumedTamerRealm`, vật phẩm chìa khóa), món mẫu là trang bị thường đầu tiên của dữ liệu.
- Bảng `item-world.csv`: đội, tầng, bậc, số cấp lên được (= tầng qua), số trận, dừng sớm, giờ mỗi cấp, tiền mỗi giờ trong lượt đi, giá cường hóa cùng số cấp (tiền, Đá cường hóa, yêu đan), `enhanceHours` (giờ đi Khí giới bí cảnh để kiếm đủ tiền cường hóa đó), `itemWorldVsEnhance` (giờ Khí giới bí cảnh ÷ `enhanceHours`; < 1 là Khí giới bí cảnh nhanh hơn, so thêm với tiền mỗi trận ở `floors.csv` vì farm tầng thường ra tiền nhiều hơn), dã linh đã thu phục. Kịch bản mặc định `duo` / `full6` ở tầng 10 / 30, common / rare / legendary, tối đa 40 tầng (12 việc, ~35 giây cộng mọi worker); kịch bản nhanh một đội, tầng 10, rare, 10 tầng.

