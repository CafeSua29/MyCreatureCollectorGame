# Phản ứng hệ (đã chốt thiết kế)

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project yêu cầu 2026-11-03, lấy từ **Type Chemistry của Cassette Beasts**: ở bản gốc, mỗi cặp (hệ đòn, hệ mục tiêu) trên bảng hệ có một trong bốn kết quả: buff cho mục tiêu, debuff cho mục tiêu, **biến hệ** (transmutation: mục tiêu đổi sang hệ khác, ví dụ đòn Lửa nung chảy quái Plastic thành hệ Độc) hoặc không có gì. Phản ứng **luôn xảy ra** khi trúng (không tung tỉ lệ), kể cả skill không gây sát thương. Game này giữ khắc hệ kiểu Pokémon (hệ số sát thương) và thêm phản ứng là lớp riêng chạy sau đòn. Số là **số tạm** (`balance.json` khóa `elementReactions`).

## Dữ liệu

- File mới `src/data/elementReactions.json`: `{ attackElementId, defenderElementId, effects }`. Mỗi cặp tối đa một mục (kiểm tra dữ liệu báo trùng). `effects` là danh sách hiệu ứng skill (`SKILL_EFFECTS`, timing `afterHits`, chạy lên mục tiêu như skill nhắm `enemy`, luôn trúng) **cộng** một loại hiệu ứng mới `transmute { elementId }`.
- Tên phản ứng ở i18n `elementReactions` (log và UI hiện "Hơi nước", "Dẫn điện"...).
- **Nội dung**: quy đổi bảng 14 hệ của Cassette Beasts sang hệ của game (Fire → fire, Water → water, Plant → grass, Air → flying, Lightning → electric, Earth → ground, Ice → ice, Poison → poison, Metal → steel, Astral → psychic, Beast → normal; Plastic / Glitter không có hệ tương ứng thì bỏ hoặc gán vào hệ gần nhất, chốt khi nhập). Lấy bảng đầy đủ từ wiki Cassette Beasts (`wiki.cassettebeasts.com`) khi làm, kèm script nhập lại được trong `scripts/data-import/`. Hệ chỉ có ở game này (cặp không có ở bản gốc) để trống, thêm dần theo nghĩa (ví dụ Lửa + Nước ra Hơi nước: giảm chính xác).

## Luật

- Sau khi một skill **trúng** một mục tiêu (không tính trượt, không với tới, bị chặn bởi Protect / thế thân), với **mỗi hệ hiện tại của mục tiêu** (`effectiveElements`: tính cả Tera, biến hệ, Bootleg) mà có mục `(hệ skill, hệ đó)`: chạy `effects`. Mục tiêu có hai hệ thì có thể ra hai phản ứng, theo thứ tự hệ.
- Skill đánh nhiều lần: phản ứng chạy **một lần mỗi skill mỗi mục tiêu** (sau đòn cuối), như hiệu ứng `afterHits`.
- **Biến hệ** (`transmute`): mục tiêu mất mọi hệ hiện tại, thành đúng một hệ `elementId` (trạng thái tạm `transmutedElementId`). Mất khi rời sân hoặc hết trận (như Soak của Pokémon). Đang Tera thì **không** biến hệ (Tera khóa hệ). Log `elementReaction { monsterId, reactionId, attackElementId, defenderElementId }` và `elementChanged`.
- Hệ của skill lấy theo hệ thật lúc dùng (đã tính Tera Blast, chiêu đổi hệ...). Skill không hệ (Struggle) không phản ứng.
- Phản ứng áp cho mọi phe và mọi loại trận.
- AI: chấm điểm phản ứng như hiệu ứng skill cùng loại (buff cho địch là điểm âm, debuff là điểm dương; biến hệ chấm theo khắc hệ trước và sau).

## Save

Trạng thái tạm trong trận (`VolatileState.transmutedElementId`), kiểm tra save trận. Tăng version nếu thêm trường vào `BattleState`.

## Test

Cặp có / không có phản ứng; quái hai hệ ra hai phản ứng; đánh nhiều lần chỉ một lần; trượt / Protect không phản ứng; biến hệ đổi khắc hệ ở đòn sau, mất khi rời sân; Tera chặn biến hệ; kiểm tra dữ liệu (trùng cặp, hệ không tồn tại, hiệu ứng sai timing).

## Tài liệu khi xong

Luật vào file mới `docs/rules/element-reactions.md` (thêm vào Mục lục), dòng ở `battle.md`, nguồn nội dung ở `content-mechanics.md`, dòng Tiến độ; xóa file này.
