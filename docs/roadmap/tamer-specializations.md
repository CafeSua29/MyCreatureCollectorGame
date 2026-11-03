# Chuyên môn ngự thú sư (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **Specialization của Siralim Ultimate**. Ở bản gốc: người chơi chọn một chuyên môn (khoảng 30 lớp: Animator, Bloodmage, Cleric, Druid, Necromancer, Royal...), mỗi lớp có **bộ perk riêng** nâng cấp bằng perk point (perk mạnh tốn tới 100 điểm mỗi cấp); perk point nhận khi tiến xa hơn trong realm và khi hạ boss cốt truyện; mở dần đủ mọi lớp trong một save và **đổi qua lại nhanh**; **anointment** cho mượn perk của lớp khác (Royal là lớp chuyên mượn perk, có thêm ô). Game này đã có cây thiên phú chung (`tamer-talents.md`, 3 nhánh kinh tế / thu phục) và kỹ năng ngự thú sư trong trận (`tamer.md`); chuyên môn là lớp **riêng** đặt lên trên: cây perk theo lớp + **kỹ năng ngự thú sư riêng của lớp**. Số là **số tạm** (`balance.json` khóa `specializations`).

## Dữ liệu

- `src/data/specializations.json`: `{ id, unlock?, perks, skillIds }`. `unlock` = điều kiện mở (dùng chung registry điều kiện thành tựu như mở khóa quái khởi đầu, `starters.md`); bỏ trống = có sẵn từ đầu. `skillIds` = kỹ năng ngự thú sư riêng của lớp (`tamerSkills.json` thêm trường `specializationId?`; kỹ năng có trường này chỉ dùng được khi lớp đó đang chọn, `tamerSkillBlocker` lý do `specialization`).
- **Perk** (`perks` trong từng lớp): `{ id, requires?, maxRank?, costPerRank, effects }` như nút thiên phú (dùng lại `RankedNode`, `checkRankedNode`, `registries/talents.ts`). `effects` gồm **kênh thưởng ngự thú sư** (`TAMER_BONUSES`) và loại mới **hook trận theo phe** (`sideHooks`: hook trait cho mọi quái phe người chơi trong trận, như luật bí cảnh), để perk có thể làm đúng kiểu Siralim (quái hệ X +% sát thương, minion, hồi máu cuối lượt, đòn đánh gây trạng thái...).
- Tên / mô tả ở i18n `specializations`.
- **Nội dung**: quy đổi danh sách lớp và perk từ wiki Siralim Ultimate (`siralimultimate.wiki.gg`) khi làm, kèm script nhập lại được trong `scripts/data-import/` (luật quy đổi Siralim ở `content-data.md`). Perk cần cơ chế chưa có thì thêm hook (không bỏ bớt); perk dựa vào hệ thống Siralim không có (ví dụ Nether Boss) thì quy đổi sang hệ thống gần nhất, ghi chỗ lệch.

## Luật

- State `tamer.specialization = { activeId, ranks: Record<specId, Record<perkId, rank>>, anointed: perkRef[] }`.
- **Chọn lần đầu**: ở màn Game mới (chọn trong các lớp có sẵn) hoặc sau khi tạo game, action `chooseSpecialization { specId }` lúc chưa có lớp. Chưa có lớp thì không có perk / kỹ năng lớp.
- **Đổi lớp** `chooseSpecialization { specId }`: ở thị trấn, ngoài trận, không đang trong bí cảnh / hiểm địa; lớp phải đã mở (`specializationLocked { specId }`). Miễn phí (như bản gốc đổi nhanh). Cấp perk của mọi lớp **giữ nguyên** khi đổi.
- **Điểm chuyên môn** (khác điểm thiên phú ngự thú sư): không lưu, suy từ nguồn như thiên phú (`tamer-talents.md`): mỗi **mốc tầng cao nhất** (`highestFloor`, `pointsPerFloorMilestone` mỗi `floorsPerPoint` tầng; như bản gốc nhận khi đi sâu hơn), mỗi **boss tầng** lần đầu hạ (`pointsPerFloorBoss`), mỗi lần **đột phá cảnh giới**. **Mỗi lớp tiêu độc lập trên cùng tổng điểm** (đổi lớp không phải cày lại; lớp nào cũng dùng hết điểm đã nhận). Giá cấp n → n + 1 = `costPerRank × (n + 1)`.
- `allocateSpecializationPerk { specId, perkId }`, `resetSpecialization { specId }` (tiêu Hoàn Nguyên Đan như thiên phú). Lỗi dùng chung mã thiên phú (`talentMaxRank`, `talentRequires`, `notEnoughTalentPoints`...).
- **Xức dầu** (anointment): số ô = `anointSlots` theo cảnh giới (bảng trong `balance.json`, tăng không trần theo mốc). Action `anointPerk { specId, perkId }` / `removeAnointment`: mượn một perk của **lớp khác** (lớp đã mở) với **cấp đang có ở lớp đó**; perk của lớp đang chọn không xức dầu được. Lớp kiểu Royal có perk cộng thêm ô xức dầu (hook mới `anointSlots`).
- **Hiệu lực**: chỉ perk của lớp đang chọn + perk xức dầu. Kênh thưởng cộng chung với thiên phú / danh hiệu / chức vị (`tamerBonusAmount` thêm nguồn); hook trận theo phe áp ở bước áp trait như cộng hưởng đội (nguồn % mới `specialization`).
- **Ngự thú sư NPC** (`trainers.md`): lớp NPC có thể khai báo `specializationId` + cấp perk theo tầng, để đối thủ cũng có lối chơi riêng.
- **Mô phỏng**: "người chơi" chọn một lớp chiến đấu và nâng perk theo thứ tự cố định; đo tốc độ qua tầng trước / sau.

## Save

`tamer.specialization`; kiểm tra id lớp / perk, cấp trong [0, maxRank], ô xức dầu không vượt, không xức dầu perk của lớp đang chọn; tăng version + migrate (chưa có lớp).

## Test

Chọn / đổi lớp (khóa, trong bí cảnh), điểm suy đúng từ nguồn, mỗi lớp tiêu độc lập, nâng / tẩy perk, kỹ năng lớp chỉ dùng khi lớp đang chọn, xức dầu (số ô, cấp theo lớp gốc, chặn perk lớp hiện tại), hiệu lực chỉ của lớp đang chọn, hook trận theo phe, NPC có lớp.

## Tài liệu khi xong

Luật vào file mới `docs/rules/tamer-specializations.md` (thêm Mục lục), dòng ở `tamer.md`, `tamer-talents.md` (nguồn kênh thưởng), `trainers.md`, `content-sources-more.md` (nguồn Siralim), dòng Tiến độ; xóa file này.
