# Temtem: chiêu, trait, trạng thái, learnset

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Đợt nhập 2026-11-06 (chủ project duyệt): toàn bộ chiêu (technique), trait, trạng thái (condition) và learnset thật của Temtem, giá thể lực theo gốc. Loài Temtem (chỉ số, hệ, tiến hóa) đã nhập trước ở `content-sources-real.md`.

## Nguồn và script

- `scripts/data-import/temtem-moves-fetch.mjs` (cần mạng) → `temtem-moves-source.json`: số từ temtem-api.mael.tech (sát thương, giá thể lực, hold, ưu tiên, synergy, mục tiêu, learnset, trait của loài); mô tả từ wiki temtem.wiki.gg qua API theo lô 50 trang (có User-Agent; wiki giới hạn tần suất), chỉ giữ infobox và mục Effect vì chữ của API mất số bậc chỉ số (`{{statchange|+1|spd}}`).
- `scripts/data-import/temtem-moves-import.mjs` (chạy lại được, ghi đè đúng mục của script) → báo cáo `temtem-moves-report.json`. Quy đổi ở `temtem/conditions.mjs`, `temtem/techniques.mjs` (test `techniques.test.ts`), `temtem/traits.mjs`.
- Id: mọi chiêu / trait là bản riêng, hậu tố `Temtem` (`aquaStoneTemtem`, `resilientTemtem`); tên giữ tiếng Anh (tên riêng của tác phẩm), trùng tên mục có sẵn thì thêm " (Temtem)" (cả trạng thái: Frozen, Immune, Ngủ, Bỏng, Sung sức).

## Trạng thái

| Gốc                     | Id                                      | Luật                                                                      |
| ----------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| Asleep                  | `asleepTemtem`                          | mất lượt, bị mất máu thì tỉnh; hết hạn thì Alerted; hệ Tâm linh miễn      |
| Burned                  | `burnedTemtem`                          | mất 1/16 máu mỗi lượt, −30% công / đặc công; hệ Lửa miễn                  |
| Cold                    | `coldTemtem`                            | không tác dụng riêng; dính lần hai thành Frozen (`stacksInto`)            |
| Frozen                  | `frozenTemtem`                          | mất lượt                                                                  |
| Exhausted / Invigorated | `exhaustedTemtem` / `invigoratedTemtem` | giá thể lực +50% / −50%; xóa nhau (nhóm `temtemVigor`)                    |
| Isolated                | `isolatedTemtem`                        | không dùng / không làm đồng đội synergy (cờ `blocksSynergy`)              |
| Seized                  | `seizedTemtem`                          | đồ lắp không tác dụng (`disablesItems`)                                   |
| Trapped                 | `trappedTemtem`                         | không đổi quái                                                            |
| Alerted                 | `alertedTemtem`                         | không ngủ (Asleep)                                                        |
| Regenerated             | `regeneratedTemtem`                     | hồi 10% máu mỗi lượt                                                      |
| Evading                 | `evadingTemtem`                         | né đòn kế tiếp rồi mất; bị mất máu cũng mất                               |
| Immune                  | `immuneTemtem`                          | không dính trạng thái mới (cả tốt lẫn xấu)                                |
| Nullified               | `nullifiedTemtem`                       | đòn nhắm quái bỏ qua khắc / kháng hệ (chế độ `neutralTaken`)              |
| Doomed                  | `doomedTemtem`                          | hết đếm ngược thì gục (`faintsOnEnd`, log `perished`)                     |
| Poisoned                | `poison` (có sẵn)                       | mất 1/8 máu mỗi lượt, hệ Độc miễn: trùng trạng thái của game nên dùng lại |

Burned xóa Cold / Frozen và ngược lại (nhóm `temtemHeat`). Mọi trạng thái hết khi hết trận. Thời hạn do chiêu / trait ghi; `duration` của trạng thái là mặc định (Doomed 4, còn lại 2).

## Chiêu

- **Số theo gốc:** sát thương = power, `staminaCost` = giá gốc, `hold`, hệ (bảng hệ của `content-sources.md` mục "Game thuần hóa quái"), loại (Physical / Special; Status = skill trạng thái), độ chính xác 100 (gốc không trượt). Ưu tiên 6 mức → priority: Very Low −2, Low −1, Normal 0, High 1, Very High 2, Ultra 3.
- **Mục tiêu** (như gốc, `battle.md` mục "Mục tiêu"): Single Other Target / Single Target → `enemy` (lệnh `targetAlly` nhắm đồng đội; chiêu trạng thái mọi hiệu ứng có lợi → `ally`); Other Team or Ally → `foesOrAlly`; All Other Temtem → `allOthers`; All → `all`; Single Team → `allAllies` / `allEnemies` theo có lợi; Self → `self`. Mọi chiêu gây sát thương có `fullSpread` (gốc không giảm sát thương khi đánh nhiều mục tiêu).
- **Hiệu ứng** đọc tự động từ mô tả wiki (`parseEffects`): trạng thái với số lượt ("for N turns", "N turn countdown of", "lasts N turns"), bậc chỉ số, hồi % máu / thể lực, mất % máu / thể lực, giảm hold. Ai nhận theo tân ngữ của động từ gần nhất ("gifts the user" = quái dùng; "the rival team or the user's ally" = địch); trạng thái chỉ được nhắc để kiểm tra ("if afflicted with", "cures ... of the") thì bỏ. Thành `spell` (`onTarget` lên mục tiêu, `after` lên quái dùng).
- **Synergy:** `powerBonusPercent` = sát thương mới / sát thương gốc − 1 (từ API, thiếu thì "damage increases to N" trong mô tả); trạng thái / bậc lên mục tiêu, bậc lên quái dùng → `synergy.effects`; "inflicts [x] instead" chỉ cộng phần chênh.
- **Quy đổi tay** (`OVERRIDES`, 59 chiêu): sát thương cố định (Depress 120, Dim Mak 130, Rush 40) → % max HP mục tiêu (gốc / 4: 30%, 32,5%, 10%; HP Temtem ~400 ở level cao), Rend 50% máu hiện tại, Leech hút 45%, Knockback phản 30%, Autodestruction tự gục, công theo hai chỉ số (Autodestruction công + thủ, Hyperkinetic Strike đặc công + tốc) → trung bình (`attackStat` 50%), Extra Energy Slam +1% power mỗi điểm thể lực còn lại, Horror ×2 với mục tiêu đang ngủ, Late Torment / Venom Spread / Nightmare Feed chỉ dùng được khi mục tiêu có trạng thái, Execution / Trample tăng bậc khi hạ gục, Chain Heal / Chain Lightning (chuỗi `chain` như gốc, `battle.md` mục "Mục tiêu"), Sanative Rain / Composure (`all`), Look out (cả đội), hiệu ứng có điều kiện (Brace, Antitoxins, Untangle, Swarm Aid theo máu quái dùng), Rush / Strangle / Petrify → `exhaust`.

### Lệch gốc của chiêu

- Synergy chỉ cộng power và hiệu ứng skill: phần đổi ưu tiên / mục tiêu / loại đòn / giá / hệ của synergy bỏ; hiệu ứng synergy lên quái dùng chỉ giữ bậc chỉ số (trạng thái lên quái dùng như Cozy Net, Metabolize bỏ). Double Edge synergy giảm sát thương bỏ.
- Bamboozle, Jinxed Whisper "hold 1 sau lần đầu": dùng hold gốc 0.
- Depress / Dim Mak không làm mục tiêu đang ngủ tỉnh ở gốc; game: có.

## Trait

192 trait, đủ mọi trait của gốc (`kind: rare`, loài mang làm ability 1–2 ô theo gốc). Quy ước: "đầu lượt" của gốc = cuối lượt (`turnEnd`); "đồng đội" = hào quang `allies`; "cùng dòng tiến hóa" = cùng race (chuỗi Temtem chung race); "khi Nghỉ" = sự kiện `rest`; "khi quá sức" = sự kiện `overexert` / điều kiện `overexerting`; "đối thủ rời sân" = sự kiện `leave`; synergy +% = hook `synergyBoost`; Superconductivity = cờ `grantsSynergy`; Loneliness = cờ `blocksSynergy` cho cả phe; Gotta Go Fast = `conditionalPriority { maxPriority: 0, setTo: 1 }`; Receptive / Resistant = `statusDurationBonus { on: received }` (±1 lượt, về 0 thì không dính); Resilient = không gục vì đòn một lần mỗi trận (`surviveLethal`) rồi +2 tốc và Doomed 1 lượt; Protostar / Supernova = hồi sinh đầy máu khi gục vì Doomed, địch mất 30% max HP của quái (không đổi qua lại hai trait vì game không đổi trait trong trận); Electric / Water Synthesize, Strong Liver = hút hệ hồi 25% (như Volt Absorb); Deceit Aura = `invertsPriority { exceptAtLeast: 3 }` (đảo priority mọi chiêu trên sân, trừ Ultra); Puppet Master / Shared Pain = `redirectToAlly` (đòn đơn nhắm quái mang chuyển sang đồng đội khi dưới 45% máu / khi đã trúng đòn trong lượt); Good Friend = `intercept` khi đồng đội đã trúng đòn trong lượt; Intimidator = Trait Suppressed (`traitSuppressedTemtem`, cờ `suppressesAbility` + `endsWhenSourceLeaves`) 3 lượt lên địch và đồng đội khi vào sân, hết sớm khi quái mang rời sân; Frightening = Gear Suppressed (`gearSuppressedTemtem`, `disablesItems` + `endsWhenSourceLeaves`) cùng cách; Inhibiter = trạng thái Inhibited (`inhibitedTemtem`: cờ `suppressesAbility`, không thời hạn, không mất khi rời sân, hết khi hết trận) lên mục tiêu của đòn đầu tiên; Individualist = cờ `sparesAllies` (đòn gây hại không trúng đồng đội); Spreader = `spreadsSingleTarget { categories: special, powerPercent: 85 }`; Voodoo = cờ `spreadsDebuffsToPartner` (debuff / hạ bậc lên địch lan sang đồng đội của nó một lần); Landing Transmog = vào sân biến thành quái kế tiếp theo chiều kim đồng hồ khác loài (`transformInto { from: nextClockwise, keepStages, baseStats }`: chép hệ, trait, chiêu và **chỉ số gốc** của loài, chỉ số tính theo level / gen / điểm của Mimit, giữ tới hết trận qua dạng `BattleForm.copied`); Striking Transmog = một lần mỗi trận biến thành mục tiêu của đòn vật lý đơn (cùng cách chép), thủ / đặc thủ +30% tới hết lượt (`transmogGuardTemtem`); Natural Conversion = chiêu Nature −10%, chiêu hệ khác +25% (infobox wiki).

### Lệch gốc của trait

- Cold-Blooded chỉ chặn Cold / Frozen (phần tặng Regenerated khi chặn bỏ: game không có sự kiện "bị chặn"); Cold-Natured cho Frozen thời hạn mặc định thay vì thời hạn của Cold.
- Rusher bỏ phần −2 tốc khi rời sân (bậc mất khi rời sân); Safe Retreat = hồi 10% khi rời sân (một lần Regenerated).
- Asleep chỉ cho Alerted khi hết hạn, không khi tỉnh vì bị đánh.
- Friendship: +15% khi mục tiêu đã trúng đòn trong lượt (không phân biệt quái đánh trước).
- Team Elusive: miễn đòn nhắm nhiều quái (`allEnemies` / `allOthers` / `all` / `foesOrAlly`), cả của đồng đội.
- Vòng "chiều kim đồng hồ" (Transmog, chuỗi): ô phe của quái bắt đầu theo thứ tự rồi ô phe kia ngược thứ tự (`clockwiseFrom`); gốc không ghi rõ thứ tự ô.

## Loài

165 loài Temtem: learnset theo cấp (Levelling) **thay** learnset cũ dựng tay (chiêu học sớm nhất về level 1), Technique Course → `bookSkillIds`, Breeding → `eggSkillIds`, trait → `abilities`. Level học giữ như gốc.
