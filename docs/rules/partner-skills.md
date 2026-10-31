# Kỹ năng đồng hành

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Partner Skill của Palworld: **quái đứng đầu đội** (ô 0) cho ngự thú sư một buff riêng, phần lớn ngoài trận (bắt, tiền, EXP, đồ rơi, gặp quái...). Số ở `src/data/partnerSkills.json` và `balance.json` khóa `partnerSkill`; số hiện tại ở `balance-systems.md`.

Code: registry hiệu ứng `PARTNER_EFFECTS` (`registries/partnerEffects.ts`), quái đồng hành và lượng theo kênh (`tamer/partner.ts`: `partnerSkillIdOf`, `partnerStrength`, `activePartner`, `partnerAmount`, `partnerMultiplier`, `partnerTeamBonus`), bật / tắt trong trận `refreshPartnerBonus` (`battle/hpChanges.ts`), kiểm tra dữ liệu `gameData/validatePartnerSkills.ts`. Tên kỹ năng ở `src/data/i18n/<ngôn ngữ>/partnerSkills.json`.

## Dữ liệu

- `partnerSkills.json`: `{ id, effects }`, `effects` là danh sách `{ type, params }` theo registry `PARTNER_EFFECTS` (được rỗng: kỹ năng không có tác dụng). Trường lạ báo lỗi.
- **Gán theo race**: `races.json` trường bắt buộc `partnerSkillId` (race nào cũng có). **Loài ghi đè** bằng trường tùy chọn `partnerSkillId` của loài thường (`species.json`; chủ project thêm dần cho loài đặc biệt). Quái lấy ghi đè của **loài gốc** (`baseSpeciesId`, quái fuse theo loài gốc), không có thì của race của quái.
- `config.partnerSkill.strengthPerTier` (số ≥ 0).

## Luật

- Chỉ **quái ô 0 của đội, còn sống** mới có tác dụng (không cần ra sân); ô 0 gục thì tắt tới khi hồi.
- **Sức mạnh theo thân mật:** sức mạnh = 1 + `strengthPerTier` × bậc thân mật (bậc 0 = mức đầu của `affinityTiers.json`, mức thứ n là bậc n − 1; `affinity.md`). Mọi lượng của hiệu ứng nhân sức mạnh.
- Loại hiệu ứng (`PARTNER_EFFECTS`; thêm loại = thêm id vào `PARTNER_EFFECT_TYPES` + một handler, nơi dùng đọc kênh qua `partnerAmount` / `partnerMultiplier`):

| Loại                 | params                                 | Tác dụng                                                                                                                  |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `catchRatePercent`   | `percent` ≠ 0                          | Tỉ lệ bắt × (1 + % / 100) (hệ số người chơi trong `catchChance`, kẹp 0–100)                                               |
| `recruitPercent`     | `percent` ≠ 0                          | Cộng vào % thu phục (xin theo, boss quy phục, Thị Uy; `recruit.md`)                                                       |
| `moneyPercent`       | `percent` ≠ 0                          | Tiền thắng trận × hệ số (nhân sau hệ số phe và trait), làm tròn xuống                                                     |
| `expPercent`         | `percent` ≠ 0                          | EXP của trận × hệ số (làm tròn xuống) rồi mới tới trait / tuổi của từng quái; EXP ngự thú sư không đổi                    |
| `dropRatePercent`    | `percent` ≠ 0                          | Nhân chung với hệ số rơi của trait (mọi món, kể cả trang bị / sách / vật phẩm biến hình), không nhân tỉ lệ rơi trứng boss |
| `shinyChancePercent` | `percent` ≠ 0                          | Tỉ lệ shiny của quái sinh ra ở trận trên tầng (quái thường, boss ngẫu nhiên, boss tầng)                                   |
| `bossChancePercent`  | `percent` ≠ 0                          | Tỉ lệ gặp boss ngẫu nhiên của `startWildBattle`                                                                           |
| `fleeChancePercent`  | `percent` ≠ 0                          | Tỉ lệ chạy trốn chung × hệ số (trait kiểu Run Away vẫn so với tỉ lệ đã nhân)                                              |
| `eggStepBonus`       | `count` nguyên ≥ 1                     | Trứng giảm thêm ⌊count × sức mạnh⌋ trận mỗi trận thắng (cộng thêm sau trait kiểu Flame Body)                              |
| `teamStatPercent`    | `percent` (chỉ số khác hp, không rỗng) | Trong trận: mọi quái ta trên sân nhận hook `statModifier` % × sức mạnh                                                    |

- Hệ số % không xuống dưới 0. Hệ số ngoài trận đọc đội lúc xảy ra (bắt / chạy: đội trong trận; thưởng: đội lúc thắng, ô 0 gục trong trận thì không có; gặp quái: đội lúc `startWildBattle` / `challengeBoss`).
- **Trong trận:** `battle.teamBonuses.player` có mục `{ kind: 'partner', id, monsterId, strength }` khi quái đồng hành còn sống và kỹ năng có hiệu ứng trong trận (kỹ năng chỉ có hiệu ứng ngoài trận thì không có mục). Hook là nguồn hook `partner`, % chỉ số thuộc nguồn `partner` của `STAT_PERCENT_SOURCES`; chạy qua `teamBonusHooks` như cộng hưởng đội (`team.md`). Quái đồng hành gục thì gỡ mục, hồi sinh (trait, Rebirth, thuốc, kỹ năng ngự thú sư) thì tính lại (sức mạnh theo thân mật lúc đó): `refreshPartnerBonus`.
- `MonsterView`: `partnerSkillId`, `partnerStrength` (hiệu ứng tra ở `data.partnerSkills`).

## Gán hiện có

Mỗi race một kỹ năng (25 kỹ năng, số tạm, Claude chọn theo đặc trưng race; roadmap đã định dragon / avian / insect / mineral / deity). Chưa loài nào ghi đè. Danh sách và số ở `balance-systems.md`.

- `expeditionPowerPercent` (`percent` ≠ 0): nhân độ thành công của đội thám hiểm trước khi kẹp (`expeditions.md`); race beast dùng (+15%, cùng +8% tốc độ).
- `alchemySuccessPercent` (`percent` ≠ 0): + điểm % tỉ lệ luyện đan thành công (`alchemy.md`); race plant dùng (+10%, thay EXP +10% tạm).
- `eventChancePercent` (`percent` ≠ 0): nhân tỉ lệ gặp event khám phá / thị trấn (`events.md`); race spirit dùng (+20%, thay EXP +10% tạm).
