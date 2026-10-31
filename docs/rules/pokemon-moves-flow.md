# Chiêu Pokémon cần luồng trận riêng

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Phần tiếp của `pokemon-moves.md` (làm 2026-10-30): chiêu không viết được chỉ bằng `spell` mà cần sửa luồng trận. Số theo Pokémon Showdown thế hệ 9 (trường đặt ở bảng `MECHANICS` của `scripts/data-import/pokemon-move-mechanics.mjs`). Kiểm tra dữ liệu ở `gameData/validateSkillForms.ts`.

## Rà tự động

`node scripts/data-import/pokemon-move-audit.mjs` tải `data/moves.ts` của Showdown (bản server) và khớp từng callback / trường với trường cơ chế game (bảng `HANDLED`); `pokemon-move-audit-report.json` ghi chiêu chưa xử lý (`plain` / `partial`) và chiêu chưa nhập (`missing`). Lần chạy 2026-10-31: **0 / 0 / 0** (tính cả chiêu Unobtainable và Nihil Light; chỉ bỏ chiêu fan làm CAP). Chiêu G-Max khớp theo id viết thường; Hidden Power theo hệ của Showdown gộp thành một chiêu theo gen (`elementFromGenes`). Thêm cơ chế mới thì thêm trường vào `HANDLED` rồi chạy lại.

## Chiêu

- **Bide** (`bide: { turns }` + `fixedDamage: { kind: 'stored', multiplier }`, priority +1): lượt đầu bắt đầu tích (`VolatileState.bide`), `turns` lượt tích (bị ép dùng lại như khóa chiêu; log `charging`), lượt sau trả `multiplier` × sát thương skill đã nhận lên quái gây sát thương cuối cùng (còn trên sân; không thì mục tiêu theo lệnh). Không tích được gì thì thất bại. Đòn không hệ (`typeless`). Số: 2 lượt, ×2.
- **Sky Drop** (`carriesTarget: { maxWeightKg: 200 }`, nạp `air`): lượt nạp nhấc mục tiêu (`VolatileState.carriedBy`): mục tiêu bán vô hình trên không (`invulnerableKindOf`), không hành động, không rời sân; lượt sau đánh xuống rồi thả. Thất bại nếu mục tiêu cùng phe, đã bị nhấc, núp thế thân, đang Dynamax hoặc nặng từ 200 kg. Quái nhấc rời sân / gục thì thả. Hệ Bay không mất máu (`effectiveness.against.flying = 0`).
- **Pursuit** (`pursuit: { damagePercent: 200 }`): địch rút về bằng lệnh đổi quái trong lượt thì quái phe kia đã chọn Pursuit **nhắm vào nó** (lệnh không ghi ô thì nhắm địch duy nhất) đánh nó trước khi rời sân (×2), như Pokémon đấu đôi, lệnh Pursuit đó coi như đã dùng; hạ gục thì ô chờ thay như quái gục. Không ai rút thì đánh như thường.
- **Pollen Puff** (`onAlly`): lệnh skill có `targetAlly: true` nhắm đồng đội: thành skill trạng thái nhắm đồng đội chạy `onAlly` (hồi 50% max HP), không gây sát thương. `targetAlly` với skill không có `onAlly` là `malformedAction`. AI chấm thêm ứng viên nhắm đồng đội như skill hồi máu.
- **Round** (`pullsAllySameSkill`): dùng xong thì đồng đội đang chờ dùng cùng skill đi ngay sau (cùng lượt được ×2 như cũ).
- **Echoed Voice:** bộ đếm `fieldStreak` (`BattleCounters.fieldStreaks`, theo skill): số lượt liên tiếp có quái bất kỳ dùng skill đó, tính cả lượt này (dùng nhiều lần trong một lượt chỉ tính một). Power 40 × chuỗi, tối đa 200.
- **Struggle** (`config.battle.struggleSkillId`, skill `struggle` tạo trong script cơ chế, không học được): lệnh skill của quái không còn skill nào dùng được (bị chặn / đang chờ) thành Struggle; khi đó lệnh skill đang chờ cũng được nhận. 50 power, không hệ, luôn trúng, mất ¼ max HP mỗi lần dùng.
- **Đòn không hệ** `typeless` (Struggle, Bide): khắc chế luôn 1 (trúng cả hệ miễn nhiễm), không STAB.
- **Skill theo dạng** `formOverrides: [{ speciesIds, elementId?, power?, hits?, target?, categoryRule?, stellar? }]` (`battle-forms.md`): quái dùng đang ở dạng trong trận / dạng biến hình / loài khớp thì skill đổi theo mục đầu tiên khớp. Aura Wheel (Morpeko Hangry: hệ Bóng tối), Water Shuriken (Ash-Greninja: 20 power × 3 đòn), Tera Starstorm (Terapagos Stellar: đòn Stellar `stellar`, đánh mọi địch, loại theo công / đặc công cao hơn).
- **Đòn Stellar** `stellar`: khắc chế như Tera Blast Stellar (`stellarBlastEffectiveness`: quái đang Tera theo config, không thì trung tính).
- **Order Up:** quái đang được Commander chỉ huy thì +1 bậc sau đòn theo dạng của Tatsugiri chỉ huy (điều kiện `commanded { speciesIds }`): Curly công, Droopy thủ, Stretchy tốc.
- **Relic Song:** Meloetta đổi qua lại dạng Pirouette sau khi dùng (`changeForm` `toggle`, về dạng thường khi rời sân).
- **Light That Burns the Sky:** Z-Move riêng của Ultra Necrozma (`z-moves.md`).

## Lệch gốc

- Struggle vẫn chọn bằng lệnh skill bất kỳ (game không có PP); quái không có `struggleSkillId` (dữ liệu test) thì như cũ.
