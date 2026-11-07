# Fusion Power

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Làm 2026-11-07 (chủ project chốt: áp cho mọi thực thể hợp thể, cả của người chơi lẫn Rogue Fusion), lấy từ **Fusion Power** của Cassette Beasts (trang `Fusion_Power` của `wiki.cassettebeasts.com`). Không đổi save. Số ở `balance.json` khóa `fusionPower`.

Code: chiêu thật `battle/fusionPower.ts` (`fusionPowerSkill`), gọi trong `battleSkill` (`battle/transform.ts`); danh sách skill của thực thể `battleSkillIds` (`model/transform.ts`); cờ skill `fusionPower`, hằng `FUSION_POWER_SKILL_ID`, `isBattleOnlyMove` (`model/content.ts`); AI Orb `aiHintMultiplier` (`battle/ai.ts`); kiểm tra dữ liệu `gameData/validateFusionPower.ts`.

## Luật

- **Ai dùng được:** chỉ **thực thể hợp thể** (`battle-merge.md`): hợp thể của người chơi / NPC bằng kỹ năng ngự thú sư và Rogue Fusion (`rogue-fusion.md`). Thực thể có thêm skill `fusionPower` trong `battleSkillIds` (ngoài skill của hai quái). Gốc cần quan hệ cấp 2 với đồng đội; game đã đòi thân mật Tri kỷ để hợp thể nên không thêm điều kiện.
- **Skill gốc** `fusionPower` (`skills.json`, cờ `fusionPower`): 100% chính xác, priority 0, **100 thể lực** (gốc 10 AP; 1 AP = 10 thể lực). Không có sách, không ở learnset, không thuần thục, không bị gọi bởi chiêu / trait gọi skill (`isBattleOnlyMove`, `allowedCall`).
- **Chiêu thật theo cặp** (`fusionPowerSkill`), lúc dùng và lúc AI chấm: **cố định cho mỗi cặp loài theo thứ tự hợp thể** (quái chính, quái phụ; đổi thứ tự có thể ra chiêu khác như gốc), chọn bằng hàm băm của hai loài thay cho bảng từng cặp của gốc (bảng gốc chỉ có loài Cassette Beasts):
  - **Tiền tố = hệ**: hệ đầu của quái chính hoặc của quái phụ (Bootleg tính hệ Bootleg).
  - **Hậu tố**: một địch hay cả phe địch, cận chiến (vật lý, tiếp xúc) hay tầm xa (đặc biệt, không tiếp xúc), kèm **buff lên chính thực thể** hay **debuff lên mục tiêu trúng**.
  - **Power như gốc** (`power`): một địch 200; cả phe kèm buff 150, kèm debuff 112. Đánh cả phe không bị giảm thêm (`fullSpread`, power gốc đã thấp hơn).
  - **Trạng thái**: buff trong `buffStatusIds` (trạng thái Cassette Beasts đã có: tăng công / thủ, Evasion Up, tăng tốc, hồi máu, AP Boost, Multitarget, Locked On) và buff phản đòn theo hệ của chiêu (`contactStatusByElement`: độc / điện / thủy tinh, gốc Contact Dmg theo hệ); debuff trong `debuffStatusIds` (giảm công / thủ / tốc / chính xác, Berserk, AP Drain, Unitarget, độc, bỏng, lú lẫn, Flinched, Bomb). Thời hạn `statusTurns` (3) như gốc, trừ `shortStatusTurns` (Locked On, Flinched, Bomb 1 lượt như gốc).
- **Orb Fusion** (`rogue-fusion.md`): còn đầy máu và có quả cầu thì điểm AI của Fusion Power × `orbAiMultiplier` (100), tức gần như luôn dùng (gốc: đầy thanh thì thử dùng Fusion Power); quả cầu làm skill không tốn thể lực.
- Hiệu ứng `applyStatus` thêm `self?: true` (gây lên chính quái dùng, một lần cho cả chiêu; AI chấm như buff của phe mình), dùng cho phần buff.

## Lệch gốc

- Gốc: mỗi cặp một tên riêng (tiền tố + hậu tố hiển thị); game giữ id `fusionPower`, tên ghép hiển thị làm cùng UI (chờ `docs/roadmap/ui-overhaul.md`).
- Chọn theo hàm băm thay vì bảng của gốc (bảng chỉ có loài Cassette Beasts; game có loài của nhiều nguồn). Đây là thứ cố định theo cặp như gốc, không phải ngẫu nhiên mỗi trận.

## Kiểm tra dữ liệu

`checkFusionPower`: có đúng skill `fusionPower` mang cờ (cờ chỉ ở skill đó), power ≥ 0, `statusTurns` / `shortStatusTurns` nguyên ≥ 1, trạng thái tồn tại và đúng loại buff / debuff, hệ tồn tại, trường lạ.
