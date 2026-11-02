# Trao đổi với NPC

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như trao đổi trong game của Pokémon: NPC ở thị trấn muốn một quái theo yêu cầu, đổi lại một quái sinh sẵn hoặc vật phẩm. Bước 9f (2026-11-02). Số là **số tạm** (`balance.json` khóa `trades`; số hiện tại ở `balance-systems.md`).

Code: `model/trades.ts` (kiểu, `TRADE_WANT_KINDS`), `progression/trades.ts` (registry `TRADE_WANTS`, `meetsTradeWant`, `rollTradeOffers`, việc theo ngày `trades`, `acceptTrade`, `tradeExpMultiplier`), `world/encounter.ts` (`generateTradeMonster`), `gameData/validateTrades.ts`, `game/validateTradeState.ts`.

## Bảng trao đổi

- `GameState.trades = { offers, refreshDay, nextOfferId }`. Mỗi `refreshDays` (7) ngày (việc theo ngày `trades`, khi ngày ≥ `refreshDay`) ra lại cả bảng: số đề nghị nguyên trong `offerCount` [1, 3], đề nghị cũ chưa nhận mất. Game mới / save cũ: bảng trống, ra ở lần qua ngày đầu.
- **Đề nghị** `{ id "t<số>", npcNameId, want, give }`: NPC có tên (`npcNames.json`, dùng chung với tông môn, `sects.md`).
- **Yêu cầu** `want` (registry `TRADE_WANTS`, thêm loại = thêm mục `{ roll, matches, isValid }` + khóa trong `TRADE_WANT_KINDS` / `wantWeights`): tung từ **một loài trong bảng gặp của một map đã mở** (theo trọng số gặp; nên yêu cầu luôn làm được, như Pokémon muốn loài bắt được gần đó), loại theo `wantWeights` (3 / 1 / 1):
  - `species { speciesId }`: đúng loài hiện tại của quái;
  - `race { raceId }`: race của loài đó (khớp qua `raceMatches`);
  - `element { elementId }`: một hệ của loài đó.
  - Mọi loại có `minLevel` = ⌈level thấp nhất của quái hoang tầng cao nhất × `wantLevelPercent` (50) / 100⌉, tối thiểu 1.
- **Thứ NPC đưa** `give`, loại theo `giveWeights` (quái 3 / vật phẩm 1):
  - `monster`: quái sinh sẵn lúc ra bảng (id lấy từ `nextMonsterId`, như quái đang gặp ở khu bảo tồn): **mọi loài thường trừ dạng chỉ có trong trận** (`tradeSpeciesPool`, kể cả loài không gặp ở map nào, theo luật "mọi kết quả hợp lệ đều có cơ hội") theo trọng số **phẩm cấp loài** `giveRankWeights` (G→X: 1, 2, 4, 6, 6, 4, 2, 1, 0,5; lệch bản gốc: NPC Pokémon không đưa huyền thoại, ở đây bậc X rất hiếm nhưng vẫn ra), level như quái hoang tầng cao nhất + `giveLevelOffset`, gen × `giveGeneMultiplier` (1,25), tỉ lệ shiny × `giveShinyMultiplier` (4), tuổi / Âm Dương như quái hoang. Lệch roadmap: không ép tính cách / trait riêng (gen và shiny đã làm quái đưa "đặc biệt" hơn quái hoang).
  - `item { itemId, count }`: **mọi vật phẩm gộp chồng có giá** (`tradeItemPool`), 1 cái, trọng số = giá^`itemWeightPower` (0,5: đồ đắt dễ ra hơn, đồ rẻ vẫn có cơ hội).

## Nhận đề nghị

- `acceptTrade { offerId, monsterId, discardOverflow? }` (thị trấn, ngoài trận, không dự giải / tông chiến): quái đưa ở đội hoặc kho, không phải bản mệnh (`isBondBeast`), không đang khóa (`monsterLocked`, `roster.md`), không đang bận (`assertNotBusy`), đúng yêu cầu (`tradeWantNotMet { offerId, monsterId }`). Mỗi đề nghị dùng một lần (`tradeNotFound`).
- Trang bị của quái đưa đi về túi như thả quái (`returnEquipmentWithinCapacity`; túi đầy phải `discardOverflow`, `capacity.md`).
- **Nhận quái**: quái NPC **thế chỗ** quái đưa đi (cùng ô đội / kho, nên không cần chỗ trống), chưa khế ước, thân mật như quái bắt được, **lý lịch** nguồn gốc mới `trade { npcNameId }` (tên NPC là chủ cũ; `monster-history.md`). Quái nhận qua trao đổi được **+ `expBonusPercent` (50) % EXP** mãi mãi (như quái trao đổi của Pokémon nhận ×1,5 EXP; `tradeExpMultiplier`, nhân cùng chỗ trait / tuổi trong `expWithTraits`). Vì chưa khế ước nên quái level cao vẫn theo luật không nghe lệnh (`tamer.md`), như Pokémon trao đổi không nghe lời khi thiếu huy hiệu.
- **Nhận vật phẩm**: quái đưa đi mất, vật phẩm vào túi; quái là con duy nhất của đội thì `partyWouldBeEmpty`.

## State, save

- Kiểm tra save (`validateTradeState`): id đề nghị "t<số>" < `nextOfferId`, không trùng; tên NPC có thật; yêu cầu đúng loại, id có thật, `minLevel` nguyên ≥ 1; quái NPC đưa kiểm tra như quái hoang và id tính chung với mọi quái (không trùng, < `nextMonsterId`); vật phẩm có thật, số ≥ 1. Quái trong đề nghị có trường `Decimal` (`bigFields.ts`).
- Save v95: migrate bảng trống `{ offers: [], refreshDay: 0, nextOfferId: 1 }`.
- Cùng đợt (sửa lỗi cũ, không đổi cấu trúc save): `bigFields.ts` thêm tiền thưởng của nhiệm vụ tông (`quests.sect`, 9e), quái đang gặp trong lượt vào khu bảo tồn, quái phụ của thực thể hợp thể (`battleTransform.mergePartner.monster`): trước đây save giữa các tình huống này đọc lại không được.

## Mô phỏng

- Chơi liên tục, mỗi ngày ở thị trấn (sau tông môn; `runTrades`, `scripts/simulate/trades.ts`): nhận mọi đề nghị có quái trong kho (không thuộc đội mẫu, không bận, không khóa, không phải bản mệnh) đúng yêu cầu, đưa quái level thấp nhất; đồng ý bỏ trang bị thừa. Ô `economy` của `progression.csv`: `trade`, `tradePower%` (quái NPC đưa mạnh nhất, % tổng chỉ số so với trung bình đội; quái nhận nằm ở kho, đội mẫu không dùng nên A/B không đo được sức mạnh của nó).

## Chưa có

- Yêu cầu theo tư chất / phẩm cấp loài tối thiểu (roadmap có nhắc; chưa thêm loại vì 3 loại hiện có đã đủ khớp Pokémon; thêm mục vào `TRADE_WANTS` khi cần).
- UI trao đổi (chờ UI, `ui-overhaul.md`).
