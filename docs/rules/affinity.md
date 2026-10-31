# Độ thân mật

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Quái càng gắn bó với ngự thú sư thì càng chiến đấu tốt (như Friendship / Affection của Pokémon). Số ở `balance.json` khóa `affinity` và `src/data/affinityTiers.json`; số hiện tại ở `balance-content.md`.

Code: `registries/affinity.ts` (điểm duy nhất đổi thân mật `changeAffinity`, `affinityGain`), `registries/affinityTiers.ts` (`affinityTierOf`), nguồn hook `affinity` trong `registries/traitHooks.ts`, `gameData/validateAffinity.ts`. Tên mức ở `src/data/i18n/<ngôn ngữ>/affinityTiers.json`.

## Trên quái

- `Monster.affinity`: số nguyên 0–`affinity.max` (255), kiểm tra trong `validateMonster`. Quái hoang / boss chưa bắt: 0.
- Thân mật khởi đầu lúc về tay người chơi (`affinity.start`): quái khởi đầu 70; quái bắt được 50, hoặc `startAffinity` của bóng (Hữu Nghị Cầu 150; trường tùy chọn của category `ball`, nguyên 0–max); quái trong trứng 120 (trứng breeding, trứng boss, trứng truyền thừa, gán lúc tạo trứng); quái thu phục 70 (`start.recruit`, `recruit.md`).
- **Fuse:** quái gốc lấy thân mật cao hơn của hai quái. **Tiến hóa:** giữ nguyên.
- Save cũ (v27): quái của người chơi 70, quái hoang 0 (`state.md`).

## Tăng / giảm

- Mọi thay đổi đi qua `changeAffinity(data, monster, amount, extraGainPercent?)`: kẹp [0, max]; lượng **tăng** nhân (1 + (tổng hook `affinityGainPercent` + `extraGainPercent`) / 100) rồi làm tròn (Chuông An Thần; `extraGainPercent` = món ăn linh thực khi thắng trận, `cooking.md`); lượng **giảm** không nhân. Không đổi gì thì trả lại chính quái.
- Tăng (`affinity.gain`): thắng trận, mọi quái trong đội +1, quái đã ra sân +2 (thay cho +1); nghỉ (`rest`) / NPC hồi máu (`healParty`): mọi quái trong đội +1; dùng vật phẩm có hồi máu thật (kể cả hồi sinh, trong và ngoài trận) +2; **kẹo EXP / Kẹo Hiếm +1 mỗi viên** (chủ project chốt 2026-10-24: như Pokémon tăng thân mật mỗi lần lên level; `useItem` với `count` = n thì +n).
- Hết dưỡng dục: + ⌊% dưỡng dục / 2⌋ (`imprinting.md`).
- Giảm (`affinity.loss`): quái ta gục trong trận −1 (`faint` ở `battle/hpChanges.ts`).
- Quái trong kho không tăng (chỉ quái trong đội). Quái đang thám hiểm + `expeditions.affinityPerDay` mỗi ngày (`expeditions.md`).

## Vật phẩm

- Hiệu ứng vật phẩm **`addAffinity { amount }`** (`ITEM_EFFECTS`; amount nguyên khác 0, âm = vật phẩm "đắng"): đã chạm trần / sàn thì không có tác dụng, không mất vật phẩm; không kháng.
- Hook trait **`affinityGainPercent { percent }`** (`REWARD_TRAIT_HOOKS`): nhân lượng tăng; dùng làm dòng chính của trang bị.
- Danh sách (số ở `balance-content.md`): Linh Mật Đường `spiritHoney` (+5, cửa hàng, quái hoang rơi), Đồng Tâm Quả `bondFruit` (+20, cửa hàng trọng số thấp, boss rơi), Tâm Linh Ngọc Lộ `heartDew` (+60, boss tầng rơi), Hữu Nghị Cầu `friendBall` (bóng ×1, thân mật khởi đầu 150), Chuông An Thần `sootheBell` (trang bị, dòng chính `affinityGainPercent` common 20–30% … legendary 80–100%).
- Đồ rơi: `affinity.wildDrops` (mỗi quái bị hạ, kể cả boss), `affinity.bossDrops` (mỗi boss bị hạ), `affinity.floorBossDrops` (boss tầng của map); nằm trong danh sách bảng rơi chung `EXTRA_DROP_TABLES` (`battle/outcome.ts`).
- Chợ đen (`events.md`): Tâm Linh Ngọc Lộ; Chuông An Thần rare–legendary (trang bị thường của chợ đen). Chưa có: Tâm Linh Ngọc Lộ còn luyện được (`alchemy.md`).

## Hiệu lực theo mức

- Mức ở `affinityTiers.json` `{ id, from, hooks }`, theo thứ tự `from` tăng dần (mức đầu `from` 0; kiểm tra dữ liệu). **Không chồng:** quái nhận hook của mức cao nhất đã đạt (`affinityTierOf`).
- Hook của mức là **hook trait thường**, nguồn hook mới `affinity` (log `traitTriggered` có `source: 'affinity'`, `traitId` = id mức; % chỉ số nếu có thuộc nguồn `affinity` của `STAT_PERCENT_SOURCES`). Thêm hiệu ứng mới cho mức chỉ cần sửa JSON.
- Mức hiện có: Xa lạ (0, không gì), Quen thuộc (100, EXP +5%), Tin cậy (150, EXP +10%, 5% trụ 1 HP), Tri kỷ (200, EXP +15%, 10% trụ 1 HP, 10% tự giải trạng thái cuối lượt), Tâm linh tương thông (255, EXP +20%, 15% trụ 1 HP, 20% tự giải, chí mạng +5%, né 5%). Hook dùng: `expRewardModifier`, `surviveLethal { fromFullHp: false, chance, exceptFullHp: true }`, `turnEndCureStatus`, `critChance`, `dodge`.
- **Trụ 1 HP** theo luật `surviveLethal` (`battle-traits.md`): không cần đầy máu nên **một lần mỗi trận**; `exceptFullHp` (tham số mới) = **không áp khi đang đầy máu** bị một đòn hạ ngay. Quái hoang thân mật 0 nên không có.
- `MonsterView`: `affinity`, `affinityTierId` (hiệu ứng tra ở `data.affinityTiers`).
- Mở thêm ở mục sau: tiến hóa theo thân mật (điều kiện `affinity` đã làm, `evolution-skills.md`; nội dung chờ `evolution-content.md`), hợp kích kỹ (đã làm: thân mật ≥ `combo.minAffinity`, `team.md`), song thú hợp thể (đã làm: thân mật ≥ `transform.merge.minAffinity`, `battle-merge.md`), bản mệnh thú (đã làm: thân mật ≥ `bond.minAffinity`, không giảm khi gục, `tamer.md`), kỹ năng đồng hành (đã làm: sức mạnh theo bậc thân mật, `partner-skills.md`).
