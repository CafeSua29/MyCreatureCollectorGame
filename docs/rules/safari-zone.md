# Khu bảo tồn

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Safari Zone của Pokémon: khu **chỉ để bắt**, không đánh; dùng **mồi** và **đá** thay cho làm yếu quái. Bước 5q2 (2026-10-25). Số ở `balance.json` khóa `safari` (số tạm, chỉnh theo mô phỏng; `balance-capture.md`).

Code: `world/safari.ts` (action, tỉ lệ bắt / chạy, chặn action khác), `world/safariRoster.ts` (danh sách loài, việc theo ngày), `model/safari.ts` (type), `gameData/validateSafari.ts` (`config.safari`), `game/validateSafariState.ts` (save). Công thức bắt dùng chung với trận: `world/capture.ts`.

## Vào khu

- `enterSafari` ở **thị trấn** (không trong trận, không đang đi bí cảnh; thú triều đang diễn ra thì chặn như đi lại): trả phí `entryFeeBase × highestFloor` (`safariEntryFee`, `Decimal`), nhận **`balls` (30) Bóng Bảo Tồn** và **`encounters` (20) lượt gặp**, gặp ngay quái đầu tiên. Bóng Bảo Tồn không phải item trong túi: chỉ là bộ đếm của lượt vào khu, ra khu thì mất.
- **Đang trong khu chỉ làm được action của khu** (`assertSafariAllows`, gọi ở `gameReducer` sau `assertEventAllows`): `throwSafariBall`, `throwSafariBait { itemId? }`, `throwSafariRock`, `skipSafariEncounter`, `leaveSafari`; action khác báo `inSafari`. Action của khu khi không ở trong khu: `notInSafari`.
- **Ra khu** khi hết lượt gặp, hết bóng, hoặc `leaveSafari` (mất lượt gặp và bóng còn lại). Cả lượt vào khu tốn **`clock.hours.safari` (24) giờ**, tính một lần lúc ra khu (`withSafariTime` ở reducer; việc theo ngày chạy lúc đó, không chạy giữa chừng).
- Lỗi: `notInTown`, `inBattle`, `trialInProgress`, `notEnoughMoney { need, have }`, `safariUnavailable` (không có loài nào, chỉ xảy ra với dữ liệu rỗng).

## Danh sách loài

- Danh sách `rosterSize` (10) loài không trùng, đổi mỗi **`rotationDays` (7) ngày**: việc theo ngày `safari` (`DAILY_TASKS`) và lúc vào khu đều gọi `refreshSafariRoster` (tới `refreshDay` thì tung mới, `refreshDay` = ngày đó + 7). Game mới / save cũ có `refreshDay` 0 nên lần vào khu đầu tiên tung ngay.
- Mỗi ô (`rollSafariRoster`): tung `unmappedChance` (5%) lấy từ **loài không gán vào map nào** (không là quái thường, boss hay boss tầng của biome nào), còn lại lấy từ **loài quái thường của các map đã mở** (`floorBiomeIds`; boss không vào khu). Một nhóm hết loài thì lấy nhóm kia. Không lấy dạng chỉ có trong trận (Mega, gmax, battleOnly).
- Trong nhóm chọn theo trọng số (`safariSpeciesWeight`), **mọi loài đều có cơ hội**: `(rarityWeightBase + 100 − catchRate) ^ rarityExponent × rankFalloff ^ thứ hạng phẩm cấp loài` (20, mũ 2, 0,7; `species-rank.md`): loài catchRate thấp (hiếm) nhiều hơn, phẩm cấp cao ít hơn.
- Mỗi lần gặp: loài đều trong danh sách; level trong khoảng level quái thường của `highestFloor` (bắt không theo giới hạn khế ước), gen theo `floorGeneMultiplier(highestFloor)`, shiny theo `shiny.wildChance`, tuổi như quái hoang (`rollSpawnAge`). Không có boss. Id quái lấy từ `nextMonsterId`.

## Mỗi lần gặp

Không có trận. Mỗi action là một lượt:

- **Ném bóng** (`throwSafariBall`): mất một Bóng Bảo Tồn, tỉ lệ `safariCatchChance` = công thức bắt chung (`catchChance`, HP đầy nên hệ số HP = sàn) với hệ số bóng `ballCatchMultiplier` (3) × hệ số mồi / đá, nhân kỹ năng đồng hành `catchRatePercent`, rồi **bắt trượt** +5 điểm % mỗi lần quái này đã thoát (theo từng lần gặp; mục "Bắt quái" ở `battle.md`). Bắt được thì sang lượt gặp kế; trượt thì tới bước chạy trốn.
- **Ném mồi** (`throwSafariBait`): không `itemId` = mồi thường miễn phí; có `itemId` = mồi dụ (category `bait`, `recruit.md`) trong túi, mất một, **đúng khẩu vị quái** (`isFavoriteItem`) thì không giảm tỉ lệ bắt. Hiệu ứng `lures.bait`: bắt × 0,8, chạy × 0,5.
- **Ném đá** (`throwSafariRock`): `lures.rock`: bắt × 2, chạy × 1,5.
- Mồi / đá có tác dụng **`turns` (3) lượt kể cả lượt ném**; ném mới thì thay hiệu ứng cũ (mồi và đá không chồng).
- **Bỏ đi** (`skipSafariEncounter`): sang lượt gặp kế (không tung chạy trốn).
- **Chạy trốn:** cuối lượt quái chưa bị bắt (ném bóng trượt, ném mồi / đá) tung `safariFleeChance` = `(fleeBase + fleeRarity × (1 − catchRate / 100)) × hệ số mồi / đá`, kẹp 0–100 (10 + 20: loài càng hiếm càng dễ chạy). Chạy mất thì sang lượt gặp kế; không chạy thì mồi / đá bớt một lượt. Hết bóng sau lượt đó thì ra khu.
- **Quái bắt được:** lý lịch nguồn gốc `safari` (`metFloor` null = thị trấn; `monster-history.md`), thân mật khởi đầu như bắt bóng (`affinity.start.caught`), **chưa khế ước** (mục "Khế ước" ở `tamer.md`), vào đội nếu còn chỗ, không thì vào kho; tính vào nhiệm vụ bắt quái (`quests.md`).
- `GameState.safari.log`: sự kiện của action gần nhất cho UI (`encounter`, `throwBall { chance, critical, shakes }` (lắc bóng / chí mạng như trong trận, `rollCapture`), `breakFree`, `caught { destination }`, `lure { kind, itemId, favorite }`, `fled`, `skipped`, `visitEnded { caught }`).

## State, save

- `GameState.safari = { roster, refreshDay, visit, log }`; `visit` null khi không ở trong khu, không thì `{ encountersLeft (≥ 0, chưa kể quái đang gặp), balls (≥ 1), encounter: { monster, misses, lure }, caught }`. Quái đang gặp là quái hoang (chưa khế ước, chưa có lý lịch), id tính vào kiểm tra `nextMonsterId`. Đang trong khu thì phải ở thị trấn, không có trận. Save v54 (`state-versions.md`).
- Kiểm tra save (`validateSafariState`): loài trong danh sách là loài thường, không trùng; số nguyên đúng khoảng; mồi / đá đúng loại, `turnsLeft` ≥ 1, `favorite` chỉ ở mồi; log mỗi dòng có `type`.

## Chưa có

- Sức chứa kho (`capacity.md`): không còn chỗ cho quái nào thì không vào khu (`rosterFull`, không mất phí); hết chỗ giữa chừng thì không ném bóng (`rosterFull`), vẫn ném mồi / đá, bỏ đi, rời khu được.
- Màn hình khu bảo tồn (chờ UI, bước 7).
