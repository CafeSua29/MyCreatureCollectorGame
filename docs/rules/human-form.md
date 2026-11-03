# Hóa hình

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như truyện tu tiên: yêu thú độ kiếp lần đầu thì **hóa thành nhân hình**. **Mốc vĩnh viễn**: đã hóa hình thì đổi qua lại nhân hình ↔ bản thể ngoài trận; trong trận, quái đang ở nhân hình được **Hiện nguyên hình** một lần để nhận buff lớn. Dựa trên Thức tỉnh (`awakening.md`), dùng chung khung biến hình (`transformation.md`). Số ở `balance.json` khóa `humanForm` (số tạm Claude đặt theo roadmap); số hiện tại ở `balance-systems.md`.

Code: `model/humanForm.ts` (`isHumanShape`), `HUMAN_FORM_ON_TRANSFORM` (`model/transform.ts`), `monster/humanForm.ts` (`skillCapacity`, `lockedSkillIds`, `humanFormBlocker`, `humanFormCost`), action `roster/humanFormActions.ts` (`takeHumanForm`, `setHumanForm`), handler `trueForm` ở `battle/transformHandlers.ts`, nguồn % `humanForm` / `trueForm` (`registries/statPercentSources.ts`), kiểm tra dữ liệu `gameData/validateHumanForm.ts`.

## Ai hóa hình được

- Race có trường bắt buộc `humanForm: boolean` (`races.json`): `false` cho race vốn hình người (humanoid, elf, orc, dwarf, halfling, giant, celestial), còn lại `true`. Quái fuse theo race của quái gốc. Loài không giới tính được.
- Quái hoang, boss, trứng, quái mới, con breeding: `humanForm = 'locked'`.

## Hóa hình

- Action `takeHumanForm { monsterId }` (quái trong đội hoặc kho): ở thị trấn, ngoài trận, không gục, không trọng thương; `awakening ≥ humanForm.minAwakening` (1); 1 **Hóa Hình Đan** (`pillItemId`, category `material`) + tiền `costPerLevel × level` (`spendMoney`). Thành công chắc chắn, thành `'human'`, mốc lý lịch `humanFormed`.
- Mã lỗi: `cannotTakeHumanForm { monsterId, reason: 'race' | 'awakeningTooLow' | 'alreadyTaken' }`; dùng lại `inBattle`, `notInTown`, `monsterNotOwned`, `monsterFainted`, `injured`, `notEnoughItem`, `notEnoughMoney`.
- Không ghi log ngoài trận: kết quả tất định, đọc trường `humanForm` của quái (`game-log.md`).

## Trên quái

- `Monster.humanForm`: `'locked'` | `'beast'` (đã hóa hình, đang ở bản thể) | `'human'` (đang ở nhân hình); `validateMonster` kiểm tra giá trị và cấm `'human'` khi race có `humanForm: false`.
- Đổi dạng: `setHumanForm { monsterId, form: 'beast' | 'human' }`, ngoài trận, ở đâu cũng được, miễn phí. Lỗi: chưa hóa hình hoặc đổi sang nhân hình khi race không cho (sau phản tổ) `humanFormNotTaken { monsterId }`, đúng dạng đang có `humanFormUnchanged { monsterId, form }`, dạng lạ `malformedAction`.
- **Fuse:** quái gốc giữ trạng thái của mình. **Tiến hóa** giữ. **Phản tổ** (`bloodline.md`): race của loài tổ không cho nhân hình thì về `'beast'`.
- **Thọ nguyên:** đã hóa hình (cả bản thể) × `lifespanMultiplier` (1,5; mục `humanForm` của `LIFESPAN_MODIFIERS`).
- **Mang hình người** (`isHumanShape`): `humanForm = 'human'` và trong trận chưa biến hình loại `revert` (`HUMAN_FORM_ON_TRANSFORM`: Mega, Dynamax, Hiện nguyên hình về bản thể tới hết trận, kể cả khi biến hình đã kết thúc; Tera giữ nhân hình).
  - **% chỉ số nhân hình** `statPercents` (HP −10%, công −5%, thủ −10%, đặc công +15%, đặc thủ +10%, tốc độ +15%): nguồn % `humanForm`, cộng ở bước áp trait.
- **+1 ô skill:** đã hóa hình (`'beast'` / `'human'`) thì sức chứa skill = `maxSkills + 1` (`skillCapacity`: học skill, skill chờ học, NPC học lại, kế thừa khi fuse, `validateMonster`). **Skill ở ô sau `maxSkills`** chỉ dùng được khi mang hình người (`lockedSkillIds`): lệnh dùng nó báo `humanFormSkillLocked { monsterId, skillId }`, AI bỏ qua và dùng do trait thì thất bại (`isSkillBlocked`), không kế thừa khi fuse (quái phụ không ở nhân hình).

## Hiện nguyên hình (trong trận)

- Loại biến hình **`trueForm`** trong `TRANSFORMS`, chung luật: mỗi phe mỗi loại 1 lần mỗi trận, mỗi quái 1 biến hình mỗi trận, đi kèm lệnh skill, không tốn lượt. Điều kiện: quái đang ở nhân hình (`notEligible` nếu không); không cần vật phẩm chìa khóa, không cần power spot; **dùng được trong trận độ kiếp** (`allowedInTribulation`, các loại khác bị chặn lý do `tribulation`). Boss không có (trọng số boss `trueForm` 0, quái hoang chưa hóa hình).
- Hiệu ứng tới hết trận: về bản thể (bỏ % nhân hình, khóa ô skill nhân hình) và + `trueForm.statPercentBase + statPercentPerAwakening × tầng thức tỉnh` (20% + 5% mỗi tầng, không trần) mọi chỉ số trừ HP (nguồn % `trueForm`). Log `transformed { kind: 'trueForm' }`. AI chấm như loại biến hình khác (`transformAi.ts`).

## Vật phẩm

- Hóa Hình Đan `humanFormPill`: `material`, giá 5.000 × tầng, cửa hàng trọng số 3; boss tầng của map từ tầng `dropFromFloor` (20) rơi theo `floorBossDrops` (5%), trong `EXTRA_DROP_TABLES`.

## Hiển thị

- `MonsterView.humanForm`: `state`, `raceAllows`, `blocker`, `cost`, `pillItemId`, `statPercents`, `trueFormPercent` (theo tầng hiện tại), `skillCapacity`, `lockedSkillIds`.

## Mô phỏng

- Phần `tribulation`: quái độ kiếp đã thức tỉnh (tầng ≥ 2) mà race cho hóa hình thì ở nhân hình (AI Hiện nguyên hình được). Chơi liên tục: "người chơi" hóa hình quái đủ điều kiện khi ở thị trấn (mua đan nếu cửa hàng bán), cột `humanForms` ở `progression.csv` (`simulation-features.md`).

- Hóa Hình Đan luyện được (đan phương, `alchemy.md`). Chưa có: boss tầng cao ở nhân hình (chưa chốt, hỏi chủ project khi cần).
