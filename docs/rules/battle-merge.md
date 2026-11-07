# Song thú hợp thể

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như DNA digivolution của Digimon: **hai quái của ta trên sân hợp thành một thực thể** trong vài lượt (bước 5s2, xong 2026-10-26). Khác **hợp kích kỹ** (`team.md`: một chiêu chung, hai quái vẫn tách), khác **fuse** (vĩnh viễn, mất quái phụ), khác **biến hình** một quái (`transformation.md`). Là biến hình loại `merge` của khung biến hình, chiếm 2 ô như quái lớn (`monster-size.md`). Số là **số tạm** ở `balance.json` khóa `transform.merge` (số và kết quả mô phỏng: `balance-systems.md` mục "Song thú hợp thể").

Code: `battle/merge.ts` (điều kiện `mergeBlocker`, cặp `mergePairOf`, hợp `applyMerge`, tách `unmerge`, AI `mergeGain`); bước chỉ số `mergeStep` (`monster/stats.ts`); hook quái phụ trong `ownHooks` (`registries/traitHooks.ts`); `mergePartnerOf` / `isMergedAway` / `battleSkillIds` (`model/transform.ts`).

## Kích hoạt

- Kỹ năng ngự thú sư **Song Thú Hợp Thể** (`twinBeastMerge`, `tamerSkills.json`): mục tiêu mới **`merge`** (không có `effects`, không ghi `targetId`), mở ở cảnh giới 3, 60 linh lực, 1 lần mỗi trận. Là lệnh ngự thú sư của lượt (`tamer.md`): chạy sau bước đổi quái, trước bước biến hình và các lệnh khác. Lúc tới lượt mà không còn hợp thể được (đổi quái mất cặp...) thì không có tác dụng, không tốn gì.
- Ngự thú sư NPC dùng được nếu lớp có kỹ năng (hiện quán chủ đạo quán, `trainers.json`); AI chọn như mọi kỹ năng ngự thú sư (dưới).

## Điều kiện (`mergeBlocker`, lỗi `transformUnavailable { kind: 'merge', reason }`)

- Phe có **đúng hai quái thường còn sống trên sân** (`needsPair`); quái ở ô đầu là **quái chính**, con kia là **quái phụ**. Quái lớn đã chiếm mọi ô nên không có cặp (`notEligible`).
- Luật chung của biến hình cho cả hai quái (`transformBlocker`): trận độ kiếp (`tribulation`), luật `noTransforms` của bí cảnh / tháp (`trialRule`), phe đã hợp thể trong trận (`alreadyUsedBySide`: mỗi phe 1 lần mỗi trận), quái đã biến hình trong trận (`monsterAlreadyTransformed`, kể cả biến hình đã hết).
- **Thân mật** mỗi con ≥ `merge.minAffinity` (200, Tri kỷ; `affinityTooLow`). Chỉ xét phe người chơi: quái của NPC coi như đủ (như vật phẩm chìa khóa của NPC).
- **Hợp nhau** (`incompatible`): cùng race, **hoặc** có chung ít nhất một hệ, **hoặc** một con là bản mệnh (`Monster.bond`, mục "Bản mệnh thú" ở `tamer.md`).
- Lệnh có `targetId`: `malformedAction`.

## Thực thể hợp thể

- **Trên sân:** quái chính chiếm cả 2 ô (`playerSlots: ['A', 'A']`), mang `battleTransform = { kind: 'merge', originalElementIds, turnsLeft, mergePartner: { monster, slot } }` với `monster` là **bản chụp** quái phụ lúc hợp thể (không trạng thái, không biến hình). Quái phụ thật vẫn nằm trong đội, mang `battleTransform = { kind: 'merge', originalElementIds, mergedIntoId }`, **ẩn khỏi sân**: không là dự bị (`reservesOf` / `reservesOnSide`), không đổi vào được (`monsterAlreadyActive`), không tính riêng trong phe (`teamOf`: đếm còn sống / gục, tổng máu cuồng bạo, đã thua). Quái phụ rời sân như đổi quái (mất bậc trận, trạng thái tạm).
- **Chỉ số** (bước biến hình của `computeStats`, `mergeStep`): chỉ số tới bước môi trường của quái chính gộp với của quái phụ (tính cùng bối cảnh trận, chịu trạng thái của thực thể): **HP cộng** (max HP = tổng max HP), chỉ số khác = **cao hơn + `lowerSharePercent` (25; roadmap 50, hạ theo mô phỏng) % thấp hơn**. Bậc trận áp sau, lên thực thể. Không tính lại trait của quái phụ ở bước trait của quái chính (đã nằm trong chỉ số riêng của nó).
- **Máu lúc hợp:** máu đã mất = tổng máu đã mất của hai con (HP hiện tại = tổng).
- **Hệ:** hệ đầu của mỗi con (trùng thì 1 hệ); hệ gốc thật giữ ở `originalElementIds` (đang bị đổi hệ bởi trait Siralim thì như biến hình khác).
- **Race, trạng thái, bậc trận, trạng thái tạm, thân mật / bản mệnh:** của quái chính.
- **Skill:** mọi skill của cả hai (`battleSkillIds`: mọi chỗ trong trận hỏi "quái biết skill nào" đi qua đây: lệnh, AI, trait chọn skill, môi trường, room). Skill chỉ quái phụ biết dùng thuần thục của quái phụ (`masteryOf`, cả thế) nhưng không tăng thuần thục trong lúc hợp thể (exp chỉ cộng cho skill của chính quái dùng).
- **Trait, trang bị:** hook lâu dài của quái phụ (trait, trait race, trang bị, mức thân mật, thiên phú) áp như của thực thể (`ownHooks`), kể cả hào quang lên địch. Đồ cầm tiêu hao của quái phụ không dùng được trong lúc hợp thể.
- **Hành động 2 lần mỗi lượt:** thực thể ra lệnh ở **cả hai ô** (`commandSlotsOf(slots, mergedIds)`, AI `actingSlots`); thiếu lệnh ô nào là `malformedAction`. Ngay lượt hợp thể, lệnh đã ra cho quái phụ ở ô của nó thành hành động thứ hai của thực thể. Cuồng bạo vẫn tối đa 1 hành động thêm mỗi lượt (`frenzy.md`). Khác quái lớn (1 hành động, `monster-size.md`) vì thực thể là hai quái thật.
- Là **một** quái trên sân: không có đồng đội (skill `ally` không mục tiêu, synergy không có), **không hợp kích** (`comboUnavailable` `noPartner`), đánh lan trúng một lần. Kỹ năng đồng hành vẫn theo quái ô 0 của đội (`partner-skills.md`). Không nhân hệ số quái lớn.
- Đổi quái ra: thực thể rời sân thì **tách** (dưới), quái vào lấy ô của lệnh, ô kia trống và được thay sau lượt như quái lớn rút về.

## Tách ra (`unmerge`)

- **Hết lượt:** `merge.turns` (3) lượt tính cả lượt hợp thể, tách ở bước biến hình cuối lượt; quái phụ **về ô cũ** (`mergePartner.slot`), nhận bậc trận của thực thể, lượt vào sân tính như quái chính.
- **Rời sân** (đổi quái, gục, hết trận `revertTransforms`): tách, quái phụ chỉ trở lại đội (không ra sân).
- **Máu:** chia theo tỉ lệ max HP riêng của từng con: máu đã mất của mỗi con = máu đã mất của thực thể × max HP con / tổng, làm tròn xuống (có lợi cho quái), còn sống thì ít nhất 1 HP.
- **Bị hạ thì cả hai cùng gục** (quái phụ mất mọi trạng thái như quái gục). Thực thể là quái cuối còn đánh được thì thua trận.
- Sau khi tách cả hai vẫn tính đã biến hình (`ended: true`) tới hết trận; hệ trả lại.
- Log: `merged { side, monsterId, partnerId }`, `unmerged { monsterId, partnerId }`.

## AI

- `mergeGain` (chấm như kỹ năng ngự thú sư, so với `ai.tamerSkillMinScore`): điểm lệnh tốt nhất của thực thể × 2 hành động − điểm lệnh tốt nhất của hai quái riêng, cộng phần tỉ lệ máu đỡ được trước đòn mạnh nhất của từng địch (trung bình hai con so với thực thể, `incomingShare` của `transformAi.ts`). Dùng cho NPC (`chooseAiTamerCommand`) và gợi ý của người chơi (`suggestTamerCommand`, tự đánh, mô phỏng).

## Save

- Không lưu gì ngoài trận; trường hợp thể chỉ có trong `battleTransform` của trận đang diễn ra. Kiểm tra (`validateMonster`): trường hợp thể chỉ ở loại `merge`, không vừa là quái chính vừa là quái phụ, bản chụp là quái hợp lệ không biến hình; `validateGameState`: thực thể chiếm mọi ô, quái phụ không ở trên sân. Save `version: 59` (`state-versions.md`).

## Chưa có

- UI (hiển thị thực thể, nút kỹ năng): chờ `docs/roadmap/ui-overhaul.md`.
- Rogue Fusion (`rogue-fusion.md`): phe địch hợp thể sẵn lúc mở trận (`battleTransform.rogue`: không hết lượt, bị hạ thì tan ra, hai thành phần hồi đầy máu), không cần kỹ năng ngự thú sư.
- Fusion Power (`fusion-power.md`): thực thể hợp thể có thêm skill `fusionPower`, chiêu thật cố định theo cặp loài (hệ, mục tiêu, tầm, buff / debuff), 100 thể lực.
