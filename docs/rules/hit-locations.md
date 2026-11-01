# Tầm chiêu và vị trí ra đòn

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-10-30: combat không chỉ chọn skill và mục tiêu mà thêm **tầm chiêu** (quái dưới đất đánh cận chiến không tới quái trên trời) và **vị trí ra đòn** (nhắm đầu, thân, chân..., mỗi quái tối đa 2 điểm yếu; trúng điểm yếu có lợi; trúng đầu dễ làm vỡ yêu đan). Bổ sung 2026-10-31: phá bộ phận thì **không dùng được skill ra chiêu bằng bộ phận đó** (quật đuôi...); thêm bộ phận **tay**; điểm yếu **không biết trước**, người chơi đánh trúng mới biết và Dex lưu lại; lấy ý **Press Turn** (Shin Megami Tensei / Persona: trúng điểm yếu được thêm lượt, trượt / bị kháng thì mất lượt) và **khoảng cách** của Monster Rancher (chiêu chỉ dùng được ở tầm nhất định) nhưng **không thêm / mất lượt**, đổi thành tác dụng thực tế (mục "Mất thế"; khoảng cách của Monster Rancher ứng với tầm chiêu). Số là **số tạm** Claude đặt (`balance.json` khóa `hitLocations`, `bodyParts.json`), chỉnh theo mô phỏng (`balance-systems.md` mục "Tầm chiêu và vị trí ra đòn").

Code: `battle/reach.ts` (tầm chiêu: `skillReach`, `canReach`, `markSwoop`), `battle/hitLocations.ts` (nhắm bộ phận: `canAim`, `aimedPartOn`, hệ số, `recordPartHit`, hệ số đồ rơi, `chooseAim` của AI), `registries/bodyParts.ts` (`monsterBodyPlan`: điểm duy nhất hỏi bộ phận / điểm yếu; `revealedBodyParts`: bộ phận người chơi đã biết; `dexBodySpeciesId`), khám phá / mất thế ở `battle/hitLocations.ts` (`revealPart`, `markOffBalance`, `afterAimedStrike`, `offBalanceCritStage`), mục Dex ở `roster/dex.ts` (`dexEntry`), gắn vào trận ở `battle/executeSkill.ts` (`landsOn`, `strikeOnce`, `strikeTarget`, `applyToTargets`), lệnh ở `battle/battleActions.ts` (`validateAim`), AI ở `battle/ai.ts`, đồ rơi ở `battle/outcome.ts`; kiểm tra dữ liệu `gameData/validateBodyParts.ts`, `reach` ở `gameData/validateSkillMechanics.ts`; kiểm tra save `game/validateBattleExtras.ts`.

## Tầm chiêu

- Trường skill `reach`: `melee` (cận chiến) hoặc `ranged` (tầm xa). **Bỏ trống** = `melee` nếu skill có cờ `contact` (đòn tiếp xúc của Pokémon), không thì `ranged` (`skillReach`).
- **Không với tới** (`canReach`) chỉ khi đủ cả: skill cận chiến, quái dùng **đứng trên đất**, mục tiêu **đang bay** (không đứng trên đất: hệ `airborne` kiểu hệ Bay, trait bay kiểu Levitate / Air Balloon; dùng chung `isGrounded` với địa hình, `battle-environment.md`), cả hai **không phải quái lớn** (quái lớn cao / thân to nên với tới và bị với tới, `monster-size.md`), mục tiêu **chưa sà xuống** (dưới), và skill không trúng được quái trên không (`hitsInvulnerable` kiểu `air`: Sky Uppercut, Thunder, Smack Down... luôn với tới). Bị hạ xuống đất (`smackedDown`, Gravity) thì đứng trên đất nên với tới.
- Không với tới: trước accuracy, log `outOfReach { monsterId, targetId }`, không sát thương, không hiệu ứng, tính như trượt (Jump Kick vẫn mất máu).
- **Sà xuống** (`markSwoop`): quái đang bay dùng skill cận chiến nhắm địch mà có ít nhất một mục tiêu đứng trên đất thì phải sà xuống: trạng thái tạm `swoopedUntilTurn = lượt hiện tại + hitLocations.swoopTurns` (1), log `swooped { monsterId, untilTurn }`; tới hết lượt đó skill cận chiến của quái đứng trên đất với tới nó (kể cả trúng hay trượt). Mất khi rời sân như mọi trạng thái tạm. Như quái bay của Monster Hunter phải hạ xuống để vồ: quái bay chỉ dùng đòn tầm xa thì quái đất chỉ có đòn cận chiến không làm gì được.
- AI: ứng viên không với tới chấm 0 phần trúng (không sát thương, không hiệu ứng, không điểm máu thấp), nên AI hầu như không chọn.
- Dữ liệu (`scripts/data-import/skill-reach-import.mjs`, chạy lại được): chiêu Pokémon (khớp chiêu Showdown theo id / tên tiếng Anh) không ghi `reach`, theo cờ `contact` thật; chiêu nguồn khác physical gây sát thương ghi `reach: "melee"`, trừ tên có từ khóa đòn từ xa (ném, bắn, mưa, sóng, tia, bầy...) mà không có từ khóa đòn bằng thân thể (vuốt, đấm, húc, cắn, lao...); special / status là tầm xa. Kết quả 2026-10-30: 928 chiêu Pokémon, 368 chiêu nguồn khác cận chiến, 64 chiêu vật lý nguồn khác tầm xa. Hợp kích kỹ (`comboSkills.json`) chưa ghi `reach` (theo `contact`, hiện là tầm xa).

## Bộ phận và điểm yếu

- **Bộ phận** (`src/data/bodyParts.json`, tên ở i18n `bodyParts`): `head` (đầu), `torso` (thân), `arms` (tay), `legs` (chân), `wings` (cánh), `tail` (đuôi). Mỗi bộ phận: `accuracyPercent`, `damagePercent` (đổi accuracy / sát thương khi nhắm, ≥ −100), `critStage` (bậc chí mạng cộng thêm, nguyên ≥ 0), `hitEffects` (hiệu ứng skill khi trúng), `breakPercent` (ngưỡng phá, bỏ trống = không phá được), `breakEffects`, `breakDropPercent`, `knockoutCorePercent` (≥ −100). Hiệu ứng là hiệu ứng skill (`SKILL_EFFECTS`), chạy lên quái bị đánh như skill nhắm `enemy`; chỉ hiệu ứng timing `afterHits` (đổi bậc, gây trạng thái...), hiệu ứng `perHit` / `perSkill` bị kiểm tra dữ liệu chặn.
- **Bộ phận của quái** (`monsterBodyPlan`): trường `bodyParts` của loài, không thì của race, không thì của nhóm race (race trộn mặc định nhóm như `weightKg`), không thì `hitLocations.defaultBodyParts` (đầu, thân, chân). Theo loài hiện tại (quái fuse: loài gốc), không theo dạng biến hình. Không lưu trong save.
- **Điểm yếu** `weakPoints`: cùng thứ tự kế thừa; tối đa `hitLocations.maxWeakPoints` (2) bộ phận, phải nằm trong bộ phận của chính mục đó (kiểm tra dữ liệu); loài đổi bộ phận mà không ghi điểm yếu thì giữ điểm yếu của race còn có trong bộ phận mới. Mặc định theo nhóm race (2026-10-30; số Claude đặt, 0–2 điểm yếu để cân bằng: nhóm cứng / vô hình không có điểm yếu, nhóm lớn mạnh có 2):

  | Nhóm                                                | Bộ phận                      | Điểm yếu    |
  | --------------------------------------------------- | ---------------------------- | ----------- |
  | dragon                                              | đầu, thân, chân, cánh, đuôi  | đầu, cánh   |
  | demon                                               | đầu, thân, tay, chân, cánh, đuôi | cánh    |
  | avian                                               | đầu, thân, chân, cánh, đuôi  | cánh        |
  | celestial                                           | đầu, thân, tay, chân, cánh   | cánh        |
  | insect                                              | đầu, thân, chân, cánh        | chân        |
  | dinosaur                                            | đầu, thân, chân, đuôi        | đầu         |
  | beast                                               | đầu, thân, chân, đuôi        | chân        |
  | reptile                                             | đầu, thân, chân, đuôi        | đuôi        |
  | aquatic                                             | đầu, thân, đuôi              | đuôi        |
  | humanoid, shapeshifter, undead, aberration, alien   | đầu, thân, tay, chân         | đầu         |
  | plant                                               | đầu, thân, chân              | đầu         |
  | mineral, deity                                      | đầu, thân, tay, chân         | không có    |
  | amorphous, elemental, spirit                        | thân                         | không có    |

- Chưa có: bộ phận / điểm yếu riêng theo loài (mọi loài đang theo nhóm race; loài không có cánh trong nhóm có cánh như chim cánh cụt vẫn có cánh; chờ nguồn, xem `docs/roadmap/biome-content.md` mục "Bộ phận và điểm yếu theo loài"). Thêm bằng `bodyParts` / `weakPoints` của loài / race, không cần sửa code. Tay (2026-10-31) cho nhóm có tay rõ ràng (người, ác ma, thiên thần, thần, xác sống, ngoài hành tinh, dị thể, biến hình, khoáng vật kiểu golem); thú bốn chân tính chi trước là chân, khủng long / côn trùng / thực vật chưa có tay (chờ dữ liệu theo loài như trên).

## Khám phá điểm yếu

Như Persona / Shin Megami Tensei (điểm yếu của địch chưa biết cho tới khi đánh trúng, rồi được ghi lại): **bộ phận** của quái luôn thấy (nhìn là biết có cánh, có đuôi), **điểm yếu thì không**.

- Dex lưu `dex.hitParts` (id loài → id bộ phận đã đánh trúng bằng đòn nhắm). Bộ phận đã trúng thì người chơi biết nó **có phải điểm yếu không** (suy từ dữ liệu loài, nên save không thể lệch dữ liệu); chưa trúng thì chưa biết. Cách thứ hai: loài đạt cấp nghiên cứu mở điểm yếu (`revealWeakPoints`, cấp 6 tạm; `species-research.md`) thì biết mọi bộ phận (Dex và AI qua `revealedBodyParts`, không ghi thêm vào `hitParts`). Ghi theo loài quyết định bộ phận (`dexBodySpeciesId`: loài hiện tại, quái fuse là loài gốc; loài phải thuộc Dex).
- Ghi khi đòn nhắm **trúng** (log `aimedHit`) lần đầu bộ phận đó của loài: log `partRevealed { speciesId, partId, weakPoint }` (`revealPart`). Mọi đòn trong trận đều tính, kể cả đòn địch nhắm vào quái của người chơi (người chơi chứng kiến). Trượt, không với tới, không nhắm thì không khám phá.
- Mục Dex (`dexEntry`): `bodyParts` (mọi bộ phận), `revealedParts` (đã đánh trúng), `knownWeakPoints` (điểm yếu đã khám phá); điểm yếu chưa trúng không hiện.
- Lệnh nhắm vẫn chọn được mọi bộ phận (người chơi tự thử); AI phe người chơi chỉ dùng điểm yếu đã biết (mục AI).

## Mất thế

Lấy ý Press Turn (SMT / Persona: trúng điểm yếu thêm lượt và làm địch "Down", trượt / bị kháng mất lượt) nhưng **không đổi số lượt** (chủ project 2026-10-31), đổi thành sơ hở thực tế: quái **mất thế** tới hết lượt hiện tại + `hitLocations.offBalanceTurns` (1, tức hết lượt sau), mọi đòn đánh vào nó + `offBalanceCritStage` (1) bậc chí mạng (cộng như Focus Energy). Trạng thái tạm `offBalanceUntilTurn` (không cộng dồn, bị lại thì kéo dài), log `offBalance { monsterId, untilTurn, cause }`; mất khi rời sân như mọi trạng thái tạm. Ba nguyên nhân (`OFF_BALANCE_CAUSES`):

- `weakPoint`: đòn nhắm **trúng điểm yếu** có sát thương vào quái (thế thân nhận thay thì không) → **mục tiêu** lảo đảo (như "Down" của Persona). Đồng đội đánh tiếp dễ chí mạng.
- `missed`: đòn nhắm **trượt** (accuracy hoặc bị né) → **quái dùng** hụt đòn, lộ sơ hở (như trượt mất lượt của SMT). Không với tới / mục tiêu bán vô hình không tính (không phải lỗi nhắm).
- `resisted`: đòn nhắm **bị kháng hệ** (hiệu quả < 1, kể cả miễn nhiễm) → **quái dùng** bị dội lại (như bị kháng mất lượt của SMT, nảy đòn của Monster Hunter).

Chỉ đòn **nhắm bộ phận** gây mất thế (đòn thường không), nên nhắm là lựa chọn rủi ro / phần thưởng. Đòn vào quái cùng phe không tính. `afterAimedStrike` chạy sau mọi đòn của chiêu lên mục tiêu (vừa trúng điểm yếu vừa bị kháng thì cả hai cùng mất thế).

## Nhắm bộ phận

- Lệnh skill thêm `aim` (id bộ phận, `BattleCommand`); chỉ skill **gây sát thương nhắm một địch** (`canAim`: power > 0, `target: enemy`). Kiểm tra lệnh: id không phải bộ phận hoặc skill không nhắm được → `malformedAction`; quái đang ở ô mục tiêu không có bộ phận đó → `ActionError` `bodyPartMissing { monsterId, partId }`. Lúc đánh, mục tiêu đổi (quái cũ gục, chuyển mục tiêu) mà không có bộ phận đó thì đánh như không nhắm. Trait đổi skill (chọn skill ngẫu nhiên...) thì bỏ nhắm. Đòn do trait / minion, đòn đến muộn, hợp kích kỹ không nhắm.
- Trúng (sau tầm chiêu và accuracy) thì log `aimedHit { monsterId, targetId, partId, weakPoint }`. Tác dụng:
  - **Accuracy** × (100 + `accuracyPercent`) / 100, sau mọi hệ số khác (`aimAccuracyFactor`). Skill luôn trúng (`alwaysHits`, chiêu Max, Z-Move) không bị trừ: đòn tự tìm mục tiêu nên nhắm chính xác (lợi riêng của chiêu luôn trúng).
  - **Sát thương** × (100 + `damagePercent`) / 100 × (điểm yếu: (100 + `weakPointDamagePercent`) / 100), nhân vào `damagePercent` của công thức sát thương (`aimDamageFactor`, cùng chỗ với đòn thêm của trait).
  - **Chí mạng:** + `critStage` bậc (cộng như Focus Energy, `battle.md` mục "Chí mạng").
  - **Hiệu ứng khi trúng** (`hitEffects`): một lần cho cả chiêu lên mục tiêu, sau hiệu ứng `afterHits` của skill, khi sát thương > 0 và mục tiêu còn sống; tỉ lệ nhân như hiệu ứng phụ của skill (Serene Grace, thuần thục, Shield Dust...) × `weakPointChanceMultiplier` (2) nếu trúng điểm yếu. Thế thân chặn như hiệu ứng skill.
- Số hiện tại:

  | Bộ phận | Accuracy | Sát thương | Chí mạng | Khi trúng                 | Phá (≥ % max HP) → hiệu ứng | Đồ rơi khi phá | Hạ gục: yêu đan |
  | ------- | -------- | ---------- | -------- | ------------------------- | --------------------------- | -------------- | --------------- |
  | đầu     | −25%     | 0          | +1 bậc   | 10% choáng (flinch)       | 30% → hỗn loạn (confusion)  | +25%           | × 0,5 (vỡ đan)  |
  | thân    | 0        | 0          | 0        | không                     | 50% → −1 bậc thủ            | +25%           | không đổi       |
  | tay     | −10%     | −10%       | 0        | 20% −1 bậc công           | 30% → −2 bậc công           | +25%           | không đổi       |
  | chân    | −10%     | −10%       | 0        | 20% −1 bậc tốc độ         | 30% → −2 bậc tốc độ         | +25%           | không đổi       |
  | cánh    | −15%     | −10%       | 0        | 30% hạ xuống đất          | 25% → hạ xuống đất          | +25%           | không đổi       |
  | đuôi    | −15%     | −10%       | 0        | 20% −1 bậc né             | 25% → −1 bậc né             | +50% (cắt đuôi) | không đổi      |

  Điểm yếu: sát thương +50%, tỉ lệ hiệu ứng khi trúng ×2, sát thương tính vào phá bộ phận ×2.
- Thiết kế: nhắm bộ phận thường **không lợi về sát thương kỳ vọng** (accuracy × sát thương ≤ 1) mà đổi lấy hiệu ứng (đầu: chí mạng / choáng; tay: yếu công; chân: chậm; cánh: kéo quái bay xuống để đòn cận chiến với tới; đuôi: mất thăng bằng nên dễ bị đánh trúng, đồ rơi). Đuôi đổi từ −công sang −né ngày 2026-10-31 khi thêm tay, để mỗi bộ phận một tác dụng riêng. Điểm yếu thì lợi rõ (đầu 0,75 × 1,5 = 1,125; chân 0,9 × 0,9 × 1,5 ≈ 1,22; thân 1,5).

## Phá bộ phận và đòn hạ gục

- Mỗi đòn nhắm trúng quái (không phải thế thân) cộng `sát thương / max HP × 100` (× `weakPointBreakMultiplier` nếu điểm yếu) vào `battle.records[id].partDamagePercent[bộ phận]` (số nhỏ dù chỉ số lớn cỡ nào). Đạt `breakPercent` lần đầu thì bộ phận **bị phá** (một lần mỗi trận): thêm vào `brokenParts`, log `partBroken { monsterId, partId }`, chạy `breakEffects` lên quái nếu còn sống (luôn trúng, không nhân tỉ lệ). Phá ở đòn hạ gục vẫn tính. Hai phe như nhau (ngự thú sư NPC cũng phá được bộ phận quái của người chơi).
- Đầu / thân phá thì có hiệu ứng riêng (hỗn loạn / −1 bậc thủ), **không** làm quái gục ngay (chủ project 2026-10-31 thử luật "phá đầu / thân là gục" rồi bỏ).
- **Không dùng được skill của bộ phận đã phá** (`usesBrokenPart`, trong `isSkillBlocked`): skill có trường `bodyPart` (id bộ phận) mà bộ phận đó của quái dùng đã bị phá trong trận thì bị chặn như Seal (AI không chọn, lệnh dùng thì log `skillBlocked`, kể cả skill do trait; hết skill dùng được thì Struggle). Quái không có bộ phận đó thì vẫn dùng (bộ phận theo nhóm race còn thô). Tới hết trận (bản ghi trận), ngoài trận không ảnh hưởng. Dữ liệu (`scripts/data-import/skill-body-part-import.mjs`, chạy lại được, theo từ khóa id / tên tiếng Anh, mọi nguồn kể cả chiêu Pokémon; 2026-10-31): đuôi 16 (Iron Tail, Tail Whip, Aqua Tail...), cánh 17 (Wing Attack, Steel Wing, Feather Dance, Gust...), tay 45 (các chiêu Punch / Chop / Palm, Arm Thrust, Hammer Arm...), chân 26 (các chiêu Kick, Stomp, Talon...); đầu / thân không ghi (phá là gục); vuốt / cắn không ghi (thú vuốt bằng chân, người bằng tay: chờ bộ phận theo loài, `biome-content.md`).
- **Đồ rơi:** mọi đồ rơi của quái bị hạ (bảng của biome, boss, bảng thêm, trang bị, đồ biến hình, sách kỹ năng) × (1 + tổng `breakDropPercent` của bộ phận đã phá / 100) (`brokenPartDropMultiplier`), như phá bộ phận của Monster Hunter. Trận NPC không rơi theo quái nên không áp.
- **Đòn hạ gục:** đòn skill nhắm bộ phận làm quái gục thì nhớ `knockoutPart`; đòn skill không nhắm hạ gục thì xóa. Tỉ lệ rơi **yêu đan** của quái đó × (1 + `knockoutCorePercent` / 100) (`knockoutCoreMultiplier`): hạ gục bằng đòn vào đầu thì yêu đan dễ vỡ (× 0,5). Chỉ yêu đan (`treasures.md`), không đổi đồ rơi khác. Tỉ lệ về 0 thì không tung (không tốn RNG).
- AI phe người chơi (tự đánh, mô phỏng) không nhắm bộ phận làm vỡ yêu đan khi đòn dự kiến hạ gục (`chooseAim` với `keepCore`); ngự thú sư NPC không quan tâm.

## AI

- `chooseAim` (không tốn RNG): với ứng viên skill nhắm một địch, chấm mỗi bộ phận (và không nhắm) như phần sát thương của AI: hệ số accuracy × (phần máu còn lại mất đi, tối đa 1, + `koBonus` nếu đủ hạ gục); lấy lựa chọn điểm cao nhất, hòa thì không nhắm. Sát thương thừa không có giá trị, nên đòn thường đã đủ hạ gục thì không đổi accuracy lấy sát thương (bản đầu chỉ so accuracy × sát thương thô: boss cũng nhắm đầu quái người chơi, trượt nhiều hơn mà sát thương dư vô ích, làm boss yếu đi ~3,5 điểm % thắng; sửa 2026-10-30 theo mô phỏng). Điểm của ứng viên dùng hitChance × hệ số accuracy và sát thương dự kiến × hệ số sát thương. Thực tế chỉ nhắm điểm yếu (bộ phận thường có accuracy × sát thương ≤ 1).
- **Ai nhắm:** phe người chơi (tự đánh, mô phỏng) và **ngự thú sư NPC** (`battle.trainer`); **quái hoang (kể cả boss tầng) đánh theo bản năng, không nhắm bộ phận** (như quái của Monster Hunter; 2026-10-31 theo mô phỏng: cho quái hoang biết hết điểm yếu mà người chơi phải tự khám phá thì thắng quái hoang −3,2 điểm, vượt nhiễu). Quái hoang vẫn mất thế khi bị đánh trúng điểm yếu.
- **Phe người chơi chỉ biết điểm yếu đã khám phá** (`revealed` = `revealedBodyParts`); ngự thú sư NPC biết hết (`revealed` null, dày kinh nghiệm). Bộ phận chưa biết chấm theo kỳ vọng: coi là điểm yếu với tỉ lệ `hitLocations.aiUnknownWeakPercent` (100 = lạc quan: thử bộ phận chưa biết khi nó hơn mọi lựa chọn đã biết; lần đầu gặp loài AI thường thử thân trước vì không mất accuracy, rồi tay / chân...). Giới hạn đã biết: AI chưa tính rủi ro mất thế khi nhắm (trượt / bị kháng). Giới hạn đã biết: AI chưa chấm giá trị hiệu ứng khi trúng / phá bộ phận (nhắm cánh để đồng đội cận chiến với tới, nhắm đuôi để tăng đồ rơi...); người chơi tự nhắm được.
- Lệnh của AI chỉ ghi `aim` khi skill gốc của lệnh nhắm được (Z-Move / chiêu Max có thể khác skill gốc).

## Save

- Bản ghi trận: `partDamagePercent` (id bộ phận → số ≥ 0), `brokenParts` (không trùng), `knockoutPart`; trạng thái tạm: `swoopedUntilTurn`, `offBalanceUntilTurn` (nguyên ≥ 1); đều tùy chọn, kiểm tra id bộ phận tồn tại. Dex: `hitParts` (object id loài thuộc Dex → id bộ phận tồn tại, không trùng; không bắt nằm trong bộ phận hiện tại của loài, phần thừa bị bỏ qua khi tra). Save `version: 71` (`state-versions.md`).

## UI

Chưa có (UI làm sau cùng, `ui-overhaul.md`): chọn bộ phận khi ra lệnh, hiện điểm yếu đã biết (trận và trang Dex: `dexEntry`), báo mất thế, đánh dấu skill không với tới mục tiêu đang bay, log `aimedHit` / `partBroken` / `outOfReach` / `swooped` / `offBalance` / `partRevealed`; hiện thanh phá bộ phận (`partDamagePercent` / ngưỡng) và làm mờ skill của bộ phận đã phá.
