# Synergy và hold của skill

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Hai trường tùy chọn của skill, như Temtem: **synergy** (skill mạnh hơn khi đồng đội trên sân mang hệ nhất định) và **hold** (skill mạnh phải chờ vài lượt mới dùng được). Khác **hợp kích kỹ** (`team.md`: cần cả hai quái ra chiêu chung): synergy là thuộc tính của **một** skill, đồng đội chỉ cần đứng trên sân.

Code: `battle/skillSynergy.ts` (synergy), `monster/hold.ts` (`holdTurnsLeft`, `heldSkills`), `battle/volatiles.ts` (`startHold`, `reduceHold`), `registries/supportSkillEffects.ts` (hiệu ứng `reduceHold`), `battle/executeSkill.ts` (dùng skill), `battle/damage.ts` (power), `battle/ai.ts`, `battle/battleActions.ts` (lỗi lệnh), `gameData/validateSynergyHold.ts` (kiểm tra dữ liệu), `game/validateBattleExtras.ts` (kiểm tra save).

## Synergy

- Trường `synergy: { partnerElementIds, powerBonusPercent?, effects? }`. Có tác dụng khi quái dùng skill có **đồng đội còn sống trên sân** (không gồm chính nó) mang một hệ trong `partnerElementIds`, theo **hệ hiện tại** (`elementIds` của quái, Tera đã đổi hệ thì tính hệ Tera). Đồng đội đầu tiên khớp là đồng đội synergy.
- `powerBonusPercent`: power × (1 + %/100), nhân trong công thức sát thương chung `rawDamage` (đánh thật và AI dự đoán cùng một chỗ; đọc đồng đội từ bối cảnh trận `attackerContext.allies`, ngoài trận không áp).
- `effects`: hiệu ứng skill (registry hiệu ứng skill có sẵn, theo `timing` như `effects` gốc) chạy thêm sau hiệu ứng gốc (`withSynergyEffects`). AI chấm qua `aiValue` của hiệu ứng như hiệu ứng gốc.
- Xét một lần mỗi lần dùng (sau khi skill không bị chặn / ngắt, trước khi chọn mục tiêu); có tác dụng thì log `synergy { monsterId, skillId, partnerId }`. Áp cho mọi lần dùng kể cả skill do trait / minion (`reactive`).
- Chiêu Max / G-Max không có synergy (quái Dynamax dùng chiêu Max, không phải skill gốc). Quái một mình trên sân không có synergy (quái lớn / thực thể hợp thể sau này cũng vậy vì không có đồng đội trên sân).

## Hold

- Trường `hold` (số lượt, nguyên ≥ 1). Skill có hold **không dùng được trong `hold` lượt đầu sau khi quái vào sân**; dùng xong thì chờ lại `hold` lượt (dùng ở lượt T thì lượt T + hold + 1 mới dùng lại được).
- Bộ đếm theo từng quái trong trạng thái tạm `VolatileState.holdReadyTurns` (lượt dùng lại được theo id skill; thiếu mục = `firstTurn + hold`). Mất khi rời sân (vào lại thì chờ lại từ đầu); hồi sinh giữ `firstTurn` nên tính như chưa dùng. Không truyền qua Baton Pass.
- Số lượt còn chờ: `holdTurnsLeft(battle, user, skill)` (0 = dùng được; quái không trên sân 0); skill đang chờ của quái (kể cả skill tạm): `heldSkills` (`monster/hold.ts`).
- **Lệnh skill đang chờ** báo lỗi `skillOnHold { monsterId, skillId, turnsLeft }` (sau `skillNotKnown`), state giữ nguyên.
- Lúc dùng (`executeSkill`): skill đang chờ dùng bằng lệnh của quái (kể cả skill do trait chọn ngẫu nhiên) thì không có tác dụng (sau log `useSkill`), log `skillFailed { reason: 'onHold' }`. Dùng được thì bắt đầu chờ lại sau cả lệnh (kể cả trượt / bị chặn / lặp của trait, như exp thuần thục). Skill do trait / minion (`reactive`) và hợp kích kỹ không xét và không bắt đầu chờ.
- Quái đang **Dynamax** không phải chờ và không bắt đầu chờ (skill thành chiêu Max; chiêu Max không có hold). Xét theo trạng thái lúc chọn lệnh: biến hình Dynamax cùng lượt vẫn bị chặn skill đang chờ.
- **AI** bỏ qua skill đang chờ; không còn lựa chọn nào thì ra skill đầu tiên không phải chờ, mọi skill đều đang chờ thì **phòng thủ** (`defend`, để lệnh gợi ý cho người chơi luôn hợp lệ).
- **Giảm lượt chờ:** hiệu ứng skill `reduceHold { turns }` (nguyên ≥ 1, timing `afterHits`, chỉ skill nhắm phe mình): mọi skill đang chờ của mục tiêu giảm tối đa `turns` lượt (không dưới 0), log `holdReduced { monsterId, turns }` với tổng lượt thực giảm (không giảm được gì thì không log). AI: điểm = tổng lượt thực giảm × `ai.holdTurnWeight`. Dùng cho kỹ năng ngự thú sư **Tĩnh Tâm Chú** (`calmMind`, `tamer.md`).
- Thần thông thức tỉnh không có hold riêng (chủ project chốt 2026-10-24 bỏ hold 2: thần thông là skill thường, giữ `hold` của chính skill đó; `awakening.md`).

## Dữ liệu

- Kiểm tra (`checkSynergyHold`): `hold` nguyên ≥ 1. `synergy` là object, không có trường lạ; `partnerElementIds` danh sách hệ tồn tại, không rỗng, không lặp; cần ít nhất `powerBonusPercent` hoặc `effects`; `powerBonusPercent` > 0 và chỉ cho skill gây sát thương; `effects` theo luật hiệu ứng skill (params, luật theo mục tiêu của skill), không có hiệu ứng rút quái dùng về (`switchesUserOut`, vì `switchTo` của lệnh chỉ xét `effects` gốc).
- Chiêu Max (`maxMove`) và hợp kích kỹ không được có `synergy` / `hold`.
- **Nội dung** (chủ project duyệt 2026-10-24; script `scripts/data-import/synergy-hold-import.mjs`, chạy lại được): **hold 1** cho mọi skill power ≥ 150 trừ chiêu Max (35 skill; ngưỡng 150 chỉ dùng khi nhập, không phải số trong game). **Synergy +30% power** (không hiệu ứng thêm) cho 84 skill gây sát thương phổ biến, chọn theo nhóm chủ đề hệ hợp lý (`SYNERGY_GROUPS` trong script; chủ project yêu cầu nhiều skill cho đa dạng nhưng hợp lý), skill ← hệ đồng đội: lửa ← cỏ / bay (mồi lửa, gió); điện ← nước / thép (dẫn điện); băng ← nước / bay; nước ← đất (lũ bùn); đất: bùn ← nước, địa chấn ← đá, bão cát ← bay; đá ← đất; cỏ: quang hợp ← ánh sáng, lá ← bay, rễ ← đất; bay ← điện (giông bão); độc: nọc ← côn trùng, độc thực vật ← cỏ; côn trùng ← độc / cỏ; bóng tối ← ma, ma ← bóng tối; siêu linh ← tiên (tiên tri ← ánh sáng); tiên ← ánh sáng; ánh sáng ← tiên (mặt trời ← lửa / bay); rồng ← lửa; thép ← lửa (rèn), cánh thép ← bay. Mỗi skill tối đa một nhóm; hệ thường và giác đấu chưa có (chưa có cặp hợp lý). Tĩnh Tâm Chú và `ai.holdTurnWeight` cũng do script này thêm.

## Save

Save v34: trạng thái tạm thêm `holdReadyTurns?` (migrate chỉ đổi version). Kiểm tra khi load: object id skill (skill tồn tại và có `hold`) → lượt nguyên ≥ 1.
