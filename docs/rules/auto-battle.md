# Tự động đánh

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Hai mức: **tự đánh 1 trận** (tự chọn lệnh mỗi lượt cho quái ta) và **tự farm** (vào trận → tự đánh → rời trận → vào trận tiếp). **Vòng lặp chạy ở renderer** (UI, bước 7) bằng các action có sẵn (`startWildBattle`, `submitTurn`, `leaveBattle`, `rest`; mỗi action vẫn tự lưu); core chỉ có hàm thuần chọn lệnh và quyết định bước kế tiếp. Số ở `balance.json` khóa `autoBattle`.

Code: chọn lệnh `suggestBattleCommands(data, state, { transforms?, combos? })` và trọng số chiến thuật trong `battle/ai.ts`; `battle/autoBattle.ts` (`manualMonsterOnField`, `partyHpPercent`, `nextAutoFarmStep`); action `setTactic` (`roster/rosterActions.ts`); kiểm tra `gameData/validateAutoBattle.ts`.

## Chọn lệnh

- AI chung (`suggestBattleCommands`, mục "AI trận đấu" ở `battle.md`). **Không tự ném bóng, không tự dùng thuốc, không tự đổi quái.** Tùy chọn: `transforms: false` (không biến hình), `combos: false` (không hợp kích kỹ); kỹ năng ngự thú sư gợi ý riêng (`suggestTamerCommand`), UI bật / tắt. Ô có quái đang cuồng bạo bị bỏ khỏi lệnh gợi ý (AI chọn lúc giải lượt) và lượt đó không hợp kích (`frenzy.md`).
- **Chiến thuật** `Monster.tactic` (`TACTICS`): `balanced` (cân bằng, mặc định, giữ nguyên AI chung), `allOut` (toàn lực), `cautious` (thận trọng), `support` (hỗ trợ), `manual` (theo lệnh: không tự đánh). Đổi bằng `setTactic { monsterId, tactic }` (ngoài trận, ở đâu cũng được; lạ là `malformedAction`). Quái hoang / boss luôn `balanced`; ngự thú sư NPC cũng `balanced`, đổi quái theo `aiProfile` của lớp (`trainers.md`). Quái thay khi gục: `suggestReplacements` dùng AI chọn quái thay chung (`chooseReplacements`, `trainers.md`).
- **Trọng số** `config.autoBattle.tactics.<chiến thuật>` `{ damage, foeEffects, allyEffects, penalty, guard }` nhân vào từng phần điểm của ứng viên: sát thương (cả điểm hạ gục, địch máu thấp, trait khi trúng, đòn bị hút), hiệu ứng có điểm dương lên địch / lên phe mình (theo mục tiêu của skill), mọi phần điểm âm (skill tự hạ chỉ số, hiệu ứng bất lợi), lệnh phòng thủ / khiêu khích. (Roadmap cũ ghi `config.ai.tactics`; chốt 2026-10-25 giữ khóa riêng `config.autoBattle` vì `config.ai` chỉ gồm số và trọng số theo chiến thuật là một bảng riêng.)

## Tự farm

- `nextAutoFarmStep(data, state, { minHpPercent, autoRest })` sau mỗi trận: **dừng** khi trận vừa đánh có quái ta gục / gặp shiny / gặp boss / trứng nở (đọc log của trận còn trong state), có quái chờ chọn tiến hóa hoặc chờ học skill, có quái `manual`, đội có quái đang gục; máu cả đội (`partyHpPercent`: tổng máu còn ÷ tổng max HP) dưới ngưỡng thì **nghỉ** (`rest`) nếu bật và đủ tiền, không thì dừng (`lowHp` / `cannotAffordRest`); còn lại **farm tiếp**. Mã dừng `AutoFarmStop`.
- `manualMonsterOnField(state)`: quái `manual` đang trên sân (tự đánh 1 lượt chờ người chơi ra lệnh cho nó).
- Dừng khi gặp event: có `events.pending` thì mọi action khác bị chặn (`events.md`), vòng tự đánh ở UI dừng lại cho người chơi chọn; người chơi bấm dừng là việc của UI.

## Save

- `Monster.tactic` (kiểm tra thuộc `TACTICS`); v44 migrate mọi quái `balanced` (`state.md`).

## Mô phỏng

- Biến thể theo chiến thuật (`variants[].tactic`, kịch bản mặc định `allOut` / `cautious`): đội mẫu khi quét tầng dùng chiến thuật đó (`simulation.md`).
