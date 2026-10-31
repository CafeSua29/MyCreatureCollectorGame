# Thiên phú quái

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Talents của Dragon Quest Monsters: quái nhận **điểm thiên phú** để chọn nhánh phát triển. Khác trait (random, qua fuse / tinh thể) và thuần thục (theo skill): thiên phú là **lựa chọn của người chơi**. Đã làm ở bước 5r (2026-10-26). Số là **số tạm** (`balance.json` khóa `talents`, `talents.json`; số hiện tại ở `balance-systems.md`).

Code: `model/talents.ts` (kiểu), `registries/talents.ts` (điểm, giá, `talentBlocker`, `activeTalents`), nguồn hook `talent` trong `registries/traitHooks.ts`, `monster/talents.ts` (kiểm tra trong save, `talentView`), `roster/talentActions.ts` (action), hiệu ứng vật phẩm `resetTalents` (`registries/itemEffects.ts`), `gameData/validateTalents.ts`. Dữ liệu: `src/data/talentBranches.json`, `src/data/talents.json`; tên ở `i18n/<ngôn ngữ>/talentBranches.json`, `talents.json`.

## Dữ liệu

- **Nhánh** (`talentBranches.json`) `{ id, raceIds? }`: bỏ trống `raceIds` = nhánh chung mọi quái; có thì là **nhánh race** (id race hoặc nhóm race, khớp qua `raceMatchesAny`). Hiện có 3 nhánh chung: **Công** `offense`, **Thủ** `defense`, **Hỗ trợ** `support`, và **130 nhánh race, mỗi race một nhánh** `<race>Arts` (`raceIds: [race]`; chủ project chốt 2026-10-26: từng race, không theo nhóm, để không có race lệch chủ đề nhánh, ví dụ rùa không nhận nút nanh độc). Quái thấy 3 nhánh chung và đúng một nhánh race của mình. Tên nút race kèm tên race trong ngoặc ("Săn Mồi (Khuyển tộc)") vì kiểm tra chữ cấm trùng tên trong một loại nội dung.
- **Nút** (`talents.json`) `{ id, branchId, requires?, maxRank?, costPerRank, hooks }`: `requires` = `{ id nút: cấp tối thiểu }`; `maxRank` bỏ trống = **không trần**; `hooks` là **hook trait thường** (lệch roadmap: roadmap ghi `effects`, đổi thành `hooks` cho khớp `affinityTiers.json`). Thêm nút / nhánh / hiệu ứng mới chỉ cần sửa JSON.
- **Kiểm tra dữ liệu:** trường lạ, `branchId` tồn tại, `costPerRank` / `maxRank` nguyên ≥ 1, hook theo luật hook trait; nút yêu cầu tồn tại, khác chính nút, **cùng nhánh hoặc ở nhánh chung** (nút ở nhánh race khác không bao giờ đủ), cấp nguyên trong [1, `maxRank` của nút đó], **không thành vòng**; `raceIds` của nhánh là tham chiếu race hợp lệ. Config: `levelsPerPoint` nguyên ≥ 1, `pointsPerAwakening` nguyên ≥ 0, `bossDrops` hợp lệ.
- **Khuôn nhánh race** (để cân bằng giữa các race; sinh bằng `scripts/data-import/race-talents-import.mjs`, chạy lại được): mỗi race 3 nút ghép từ thư viện khuôn: (1) **nút chỉ số** cost 1 không trần, tổng ~4% mỗi cấp chia theo chủ đề (công + tốc, thủ + HP, đặc công...; như nút chỉ số của nhánh chung; thần linh: +1% mọi chỉ số, cost 2); (2) **nút cơ chế** theo chủ đề race (sát thương theo 2 hệ phổ biến nhất trong các loài của race +4%, gây độc / bỏng / tê liệt / hỗn loạn / chảy máu 2%, ngủ 1%, hút máu 2%, giảm sát thương khắc hệ 3%, chí mạng 1%, phản đòn, kháng debuff, hồi máu, tiền / EXP...), có trần; (3) **nút cuối** cũng là khuôn cơ chế, cần nút chỉ số cấp 3 (cost ≤ 2) hoặc 5 (cost 3). Bảng race → khuôn và số của từng khuôn ở script; muốn đổi chủ đề một race thì sửa bảng `RACES` rồi chạy lại.
- Hook có tỉ lệ (`critChance`, `dodge`, `debuffResist`...) hoặc giảm sát thương nhận (`damageTakenModifier` âm) nên có `maxRank` để không chạm 100% (luật nội dung, không ép bằng kiểm tra dữ liệu).

## Luật

- **Trường trên quái** `talentRanks: { [nodeId]: rank }` (rank nguyên ≥ 1; nút chưa nâng không có mục). **Điểm không lưu** (quy tắc 3): suy từ nguyên liệu.
  - **Điểm nhận** `talentPointsEarned` = ⌊`maxLevelReached` / `levelsPerPoint`⌋ + `awakening` × `pointsPerAwakening` (+1 mỗi 5 level, +1 mỗi tầng thức tỉnh), không trần. Theo `maxLevelReached` nên reset level (luân hồi, phi thăng) không mất điểm. Luân hồi +3 điểm: chưa có (chờ `rebirth.md`).
  - **Điểm đã dùng** `talentPointsSpent` = Σ `costPerRank` × (1 + 2 + … + cấp); **điểm còn** = nhận − đã dùng. Có thể âm nếu dữ liệu tăng giá nút sau khi đã nâng: khi đó chỉ không nâng thêm được, không mất cấp, save vẫn hợp lệ.
  - Lệch roadmap: roadmap ghi trường `talents: { points, ranks }`; bỏ `points` vì suy được (migrate chỉ cần `{}`, tẩy chỉ cần xóa cấp, không lệch khi đổi `levelsPerPoint`).
- **Nâng nút** `allocateTalent { monsterId, nodeId }`: ngoài trận, **ở đâu cũng được** (không cần NPC), quái đội hoặc kho, **kể cả đang thám hiểm** (không đổi gì ngoài quái). Cấp n → n + 1 tốn `costPerRank × (n + 1)` điểm; phải đủ nút yêu cầu, chưa đạt `maxRank`, nhánh đang mở. Lỗi: `unknownTalent { nodeId }`, `talentBranchClosed { nodeId, raceId }`, `talentMaxRank { nodeId, maxRank }`, `talentRequires { nodeId, requiredId, rank }`, `notEnoughTalentPoints { need, have }`, `inBattle`, `monsterNotOwned`. Điểm duy nhất cho câu hỏi "nâng được không": `talentBlocker` (dùng cho action, `MonsterView` và mô phỏng).
- **Hiệu ứng:** mỗi nút đã nâng ở nhánh đang mở cho hook của nút với **hệ số = cấp** (tuyến tính), nguồn hook mới **`talent`** (log `traitTriggered` có `source: 'talent'`, `traitId` = id nút; % chỉ số thuộc nguồn **`talent`** của `STAT_PERCENT_SOURCES`, cộng vào tổng % ở bước áp trait, mục "Nguồn % chỉ số" ở `stats-traits.md`). Nút ở nhánh race mà race của quái không còn khớp thì **không có tác dụng** (cấp vẫn giữ, điểm vẫn tính là đã dùng; tẩy để lấy lại).
- **Tẩy thiên phú:** hiệu ứng vật phẩm **`resetTalents`** (không tham số) xóa mọi cấp, nên hoàn đủ điểm. Chưa nâng nút nào thì không có tác dụng, không mất vật phẩm. Vật phẩm **Vong Ưu Thủy** `forgetWater` (tiêu hao, ngoài trận, giá theo tầng như mọi vật phẩm, bán ở cửa hàng trọng số thấp, boss rơi `talents.bossDrops`).
- **Breeding:** con rỗng (0 điểm: `maxLevelReached` 1). **Fuse:** quái gốc giữ cấp của mình, phần của quái phụ mất (không hoàn: điểm gắn với level của quái phụ). **Tiến hóa:** giữ. Quái hoang / boss rỗng (NPC chưa nâng thiên phú).
- **Kiểm tra quái** (`validateTalentRanks`): object, nút tồn tại, cấp nguyên ≥ 1, không quá `maxRank`. Không xét điểm (dữ liệu đổi giá được).
- `MonsterView.talents`: `{ earned, spent, available, nodes }`, mỗi nút của nhánh đang mở `{ nodeId, rank, nextCost, blocker }` theo thứ tự trong dữ liệu (nhánh race không khớp bị ẩn); `statPercents.talent` như mọi nguồn.
- Save v58 (migrate: mọi quái kể cả trứng `talentRanks: {}`; điểm tự có theo `maxLevelReached` / thức tỉnh).

## Chưa có

- Luân hồi +3 điểm (chờ `rebirth.md`: cộng `rebirths × pointsPerRebirth` vào `talentPointsEarned`).
- Ngự thú sư NPC / boss có thiên phú (chưa có luật; hiện quái NPC rỗng).
- UI thiên phú (chờ UI, `ui-overhaul.md`).
