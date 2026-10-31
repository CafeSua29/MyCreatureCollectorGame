# Hệ thống event

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Mục tiêu: tăng tính ngẫu nhiên. Gồm event khám phá (ở tầng), event thị trấn, hiệu ứng toàn cục (modifier), chuỗi event, cửa hàng tạm (thương nhân, chợ đen, khách lạ) và thú triều. Thời tiết trong trận ở mục "Môi trường" (`battle-environment.md`); event chỉ dùng lại qua modifier `fixedField`.

Code: folder `src/core/events/` (gặp / chọn event `encounters.ts`, kết quả `eventResults.ts`, cửa hàng tạm `tempShops.ts`, chặn action + rút lui thú triều `guards.ts`, state đầu `state.ts`), trận đặc biệt `battle/specialBattles.ts` (luật theo loại, sổ sách trận trên tầng) và `battle/eventBattles.ts` (mở trận event, `defendTown`), thú triều theo ngày `progression/beastTide.ts`, modifier `registries/eventModifiers.ts`, kiểm tra dữ liệu `gameData/validateEvents.ts`, kiểm tra save `game/validateEventState.ts`. Số ở `balance.json` khóa `events` (hiện tại ở `balance-systems.md`).

## Dữ liệu

- **`events.json`**: `{ id, group, weight, minFloor, biomeIds?, options }`. `group`: `explore` (ở tầng), `town` (vào thị trấn), `chain` (chỉ là bước của chuỗi, `weight` 0). `minFloor`: tầng đang đứng (event thị trấn: tầng cao nhất). `biomeIds`: chỉ ở các map này (thị trấn: map của tầng cao nhất).
- **Lựa chọn** `{ id, costItems?, outcomes }`: `costItems` (`{ itemId, count }`) tiêu khi chọn, thiếu thì `notEnoughItem`. `outcomes`: `{ weight, results }`, tung một outcome theo trọng số (tổng > 0). Event có thể chỉ có một lựa chọn (không có lựa chọn an toàn). Id lựa chọn là động từ chung (`open`, `leave`, `fight`...): UI dịch theo id.
- **Kết quả** `{ type, params }` (kiểm tra `EVENT_RESULT_CHECKS` ở `validateEvents.ts`, áp `EVENT_RESULT_APPLIERS` ở `events/eventResults.ts`; thêm loại = thêm id vào `EVENT_RESULT_TYPES` + một hàm kiểm tra + một hàm áp):

| Loại               | params                                                                                                                                                | Tác dụng                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `giveItems`        | `items` (`{ itemId, weight, min, max }`), `rolls`                                                                                                     | Tung `rolls` lần món theo trọng số (bỏ món `requiresOption` đang tắt), số lượng đều trong khoảng                                                                                            |
| `giveMoney`        | `battles` > 0                                                                                                                                         | Tiền = ⌊`battles` × `rewards.moneyPerLevel` × level quái thường cao nhất của tầng⌋                                                                                                          |
| `loseMoneyPercent` | `percent` (0, 100]                                                                                                                                    | Mất ⌊tiền × % / 100⌋                                                                                                                                                                        |
| `giveEquipment`    | `count`, `rarityWeights`                                                                                                                              | Trang bị theo `equipmentDrops` của map, bậc theo bảng (có hệ số tầng); túi trang bị đầy thì món mất, log `equipmentLost` (`capacity.md`)                                                    |
| `giveEgg`          | `source`: `wild` / `boss`                                                                                                                             | Trứng loài theo bảng gặp của map / một boss của map (dạng đầu, level 1, gen theo tầng; `createSpeciesEgg` / `createBiomeBossEgg`), lý lịch `{ kind: 'event', eventId }`                     |
| `giveMonster`      | (không)                                                                                                                                               | Một quái hoang thường của map đi theo: chưa khế ước, thân mật như quái bắt được, lý lịch event; đội đầy thì vào kho; đội đủ và kho đầy thì không nhận, log `monsterRefused` (`capacity.md`) |
| `healParty`        | (không)                                                                                                                                               | Hồi đầy cả đội, chữa mọi trạng thái (không tăng thân mật)                                                                                                                                   |
| `applyStatus`      | `statusId` (không `battleOnly`), `count`                                                                                                              | `count` quái còn sống đầu đội (tính cả quái miễn) dính trạng thái; miễn / đang có trạng thái cùng nhóm thì log `statusImmune`                                                               |
| `addModifier`      | `modifierId`                                                                                                                                          | Thêm modifier; đang có thì làm mới thời hạn                                                                                                                                                 |
| `openTempShop`     | `pool`, `priceMultiplier` > 0, tham số pool                                                                                                           | Mở cửa hàng tạm (mục dưới)                                                                                                                                                                  |
| `startChain`       | `chainId`, `eventId` (nhóm chain), `battles` ≥ 0                                                                                                      | Mở chuỗi (đang chạy chuỗi đó thì bỏ qua)                                                                                                                                                    |
| `advanceChain`     | `eventId`, `battles` ≥ 0                                                                                                                              | Chỉ ở event nhóm chain: chuỗi của event đi tiếp tới bước `eventId`                                                                                                                          |
| `startBattle`      | `kind` (`wild` / `boss` / `trainer`), `noFlee`, `count?`, `strength?` ≥ 1, `enemyHpPercent?`, `levelOffset?`, `moneyMultiplier?`, `onWin?`, `onLoss?` | Mở trận event (luôn là kết quả cuối; không có trong `onWin` / `onLoss`)                                                                                                                     |

- **`eventModifiers.json`**: `{ id, effects, duration }`, `duration` = `{ kind: 'battles', count }` hoặc `{ kind: 'town' }` (tới khi rời thị trấn). Hiệu ứng (`EVENT_MODIFIER_EFFECTS`): `bossChancePercent`, `shinyChancePercent`, `moneyPercent`, `dropRatePercent`, `shopPricePercent`, `eventChancePercent` (`percent` ≠ 0, ≥ −100), `fixedField` (`weather` / `terrain`: id môi trường đúng lớp).
- Tên event / modifier ở `src/data/i18n/<ngôn ngữ>/events.json`, `eventModifiers.json` (loại nội dung `events`, `eventModifiers`). Chữ mô tả event và nhãn lựa chọn: chờ UI (i18n phần UI, `ui-overhaul.md`).
- Event / modifier của dữ liệu hiện có: `balance-systems.md` mục "Hệ thống event".

## Gặp event

- **Ở tầng** (`startWildBattle`, action mới `explore`; cùng điều kiện như `startWildBattle`: ở tầng, ngoài trận, còn quái đánh được):
  1. Bước chuỗi đến hạn (hết số trận chờ, tầng ≥ tầng mở chuỗi, bước thỏa `minFloor` / `biomeIds`) xuất hiện thay cho trận, không tung tỉ lệ; rời danh sách chuỗi ngay lúc xuất hiện.
  2. Không thì tung event nhóm `explore`: `startWildBattle` theo `events.wildBattleChance` (10%), `explore` theo `events.exploreChance` (30%), × kỹ năng đồng hành `eventChancePercent` × modifier `eventChancePercent`, kẹp 100. Tung **trước** mọi thứ của trận (ngự thú sư NPC, boss). Không có event nào xuất hiện được thì **không tốn RNG**.
  3. Không gặp event thì ra trận như `startWildBattle` cũ (`explore` không tung lại tỉ lệ event). `explore` không tốn tiền.
  - Event thay cho trận tính **một trận** cho modifier theo số trận. `challengeBoss` không bao giờ ra event.
  - Cửa hàng tạm cũ mất khi đi tiếp (`startWildBattle` / `explore`) hoặc rời chỗ gặp.
- **Thị trấn**: `travel` từ tầng vào thị trấn (sau khi cửa hàng random lại hàng, bảng nhiệm vụ bổ sung): thú triều đã tới ngày thì bắt đầu (mục dưới), không thì `events.townChance` (15%, × cùng hệ số) gặp event nhóm `town` (map của tầng cao nhất). Thua trận về thị trấn không tung event thị trấn.
- **Event chờ** (`events.pending { eventId, floor, chainId }`; `floor` null = thị trấn): có event chờ thì **mọi action khác** báo `eventPending { eventId }` (chặn ở `assertEventAllows` đầu `gameReducer`), chỉ `chooseEventOption { optionId }`. Event nằm trong save nên tắt app mở lại vẫn là event đó; kết quả tất định theo RNG của save.
- **Chọn lựa chọn**: tiêu `costItems`, tung outcome, áp lần lượt các kết quả (scale theo tầng của event; thị trấn: tầng cao nhất), `events.log` thay bằng log của lần này (`eventResolved`, `itemSpent`, rồi log từng kết quả). Tốn `clock.hours.event` (1) giờ nếu không mở trận (trận tính giờ lúc rời trận như mọi trận). Lỗi: `noPendingEvent`, `eventOptionUnknown`.

## Modifier

- `events.modifiers`: `{ modifierId, battlesLeft }` (null = tới khi rời thị trấn). Cùng modifier đến lần nữa làm mới thời hạn; khác modifier thì cùng áp, hệ số **nhân** với nhau (mỗi modifier 1 + tổng % / 100, không dưới 0; `eventModifierMultiplier`).
- **Trận trên tầng** (`countsAsFloorBattle`): trận quái hoang / boss (kể cả `challengeBoss`) / ngự thú sư gặp trên tầng / trận event; không tính bí cảnh, tháp, độ kiếp, đạo quán, giải đấu, đấu trường, thú triều, hiểm địa (luật `isFloorBattle` theo loại trận đặc biệt; trận không phải trận trên tầng cũng không mở tầng, `zones.md`). Hết trận trên tầng (thắng, thua, chạy) modifier theo số trận bớt 1, về 0 thì mất. Modifier thị trấn mất khi rời thị trấn.
- Tác dụng: tỉ lệ boss / shiny của trận trên tầng (nhân cùng kỹ năng đồng hành ở `requireBattleStart`), tiền thắng và hệ số rơi của trận trên tầng (`floorModifierMultiplier`), giá mua ở cửa hàng thị trấn (`shopBuyPrice`, làm tròn xuống), tỉ lệ event, môi trường cố định của trận trên tầng (`fixedField`: sau môi trường của map, trước luật bí cảnh; log `fieldChanged` nguồn `event`).

## Cửa hàng tạm

- `events.tempShop { stock, priceMultiplier, floor }`: món `{ entry, remaining }` (`remaining` null = không giới hạn). Mua bằng `buyEventItem { item, count }` (ngoài trận, còn ở chỗ gặp, không thì `noTempShop`): giá = ⌊giá cửa hàng (`itemBuyPrice`) × `priceMultiplier`⌋; quá số còn lại `tempShopStockLow`, trang bị chỉ mua 1; hết hàng thì món mất khỏi danh sách. Không chịu modifier giá cửa hàng, không bị đóng cửa sau thú triều.
- Pool (`TEMP_SHOP_ROLLERS`, tham số kiểm tra ở `TEMP_SHOP_POOL_CHECKS`):
  - `regular { count }`: hàng như cửa hàng thị trấn (`rollShopStock`), lấy `count` món đầu (thương nhân lưu động).
  - `blackMarket`: theo `events.blackMarket`: số lượt đều trong `count`; mỗi lượt chọn theo trọng số giữa các vật phẩm chưa chọn (`items`: số lượng bán đều trong [min, max]), một trang bị thường không unique (`equipment`: đều trong mọi trang bị thường, bậc theo `rarityWeights` có hệ số tầng, dòng tung ở `minRollPercent` % trên của khoảng, `rollEquipment { minRollPercent }`), hoặc một Bí kíp skill mạnh (`skillBooks`: skill có sách, power > `skillBook.shopMaxPower`, có người học; skill đội học được × `partyMultiplier`; `reusableChance` % là Chân kinh; trùng sách thì cộng số lượng).
  - `crystal { traitKind, level, count }`: tinh thể cấp `level` của `count` trait khác nhau loại `traitKind`, mỗi món 1 (khách lạ).

## Trận event

- `startBattle` mở trận với `battle.special = { kind: 'event', eventId, noFlee, moneyMultiplier }` ở map của event: `wild` = `count` quái hoang thường (không tung boss / số quái của map), `boss` = boss bất kỳ của map (`generateAnyBossEncounter`), `trainer` = lớp NPC của map (không có thì lớp thường bất kỳ), chế độ NPC `event`, `levelOffset` level cộng thêm. Quái hoang / boss: `bossMultiplier × strength`, vào trận còn `enemyHpPercent` % máu (ít nhất 1).
- `noFlee`: `flee` báo `specialBattleRestricted { command: 'flee' }`. Bắt được quái (trừ NPC). Tiền thắng × `moneyMultiplier`. Thua: phạt thua thường.
- `events.battle` (vị trí của kết quả `startBattle`: event, lựa chọn, outcome, kết quả, chuỗi) giữ tới lúc **rời trận**: thắng áp `onWin`, thua / chạy áp `onLoss` (log mới ở `events.log`).
- Không còn quái đánh được lúc mở trận: coi như thua, áp `onLoss`, không mở trận.

## Chuỗi event

- `events.chains`: `{ chainId, eventId, battlesLeft, floor }`; nhiều chuỗi cùng lúc, mỗi chuỗi một tiến trình. Mỗi **trận thắng** trên tầng ở tầng ≥ `floor` bớt 1 (event không phải trận nên không tính). Về 0 thì bước `eventId` xuất hiện ở lần gặp kế tiếp trên tầng (mục "Gặp event").
- Kết quả của bước dùng `advanceChain` để đi tiếp (trực tiếp hoặc trong `onWin` / `onLoss` của trận); bước không đi tiếp (và không còn trận chờ) thì chuỗi kết thúc, log `chainEnded`.

## Thú triều

- **Lịch** (việc theo ngày `beastTide`, `DAILY_TASKS`): chưa có thú triều thì lần qua ngày kế tiếp lên lịch thú triều sau số ngày đều trong `intervalDays` (30–50): `{ phase: 'scheduled', day }`. Số ngày băm từ ngày và RNG của save (`hashToUnit`), không tung RNG (lên lịch không đổi các giá trị random khác; mỗi save một lịch). Còn `warningDays` (3) ngày thì báo trước: `{ phase: 'warned', day }`, `dayEvents` `beastTideWarning { day }`. Thú triều kết thúc (thắng, thua, rút lui) thì lần qua ngày kế tiếp lên lịch lại.
- **Bắt đầu**: tới ngày, khi đang ở thị trấn và rảnh (không trong trận, bí cảnh, giải đấu, không có event chờ): lúc qua ngày (`dayEvents` `beastTideArrived`) hoặc lúc vào thị trấn (`events.log` `beastTideArrived`). Quy mô: số đợt đều trong `waves` (5–20); mốc thú vương `kingAfter` = ⌈số đợt × `kingAfterPercent` / 100⌉ (40%, trong [1, số đợt]; `beastKingAfter`): `{ phase: 'active', cleared: 0, waves, kingAfter }`.
- Trong thú triều: không `travel`, hồi máu ở NPC (`healParty`), nghỉ (`rest`), đấu trường, giải đấu, bí cảnh, tháp, độ kiếp, vào khu bảo tồn (`beastTideActive`). **Không tự hồi máu giữa các đợt** (chủ project chốt 2026-10-25): người chơi tự hồi bằng vật phẩm (dùng ngoài trận được, cửa hàng thị trấn vẫn mở để mua thêm), skill / kỹ năng ngự thú sư trong trận, trait...
- Quái thú triều: map của tầng cao nhất + `floorOffset` (−1, tối thiểu 1); đợt n (= `cleared + 1`) chỉ số × (1 + `strengthPerWavePercent` × (n − 1) / 100) (5%). `battle.special = { kind: 'beastTide', wave, waves, king }`; không chạy, không tính là trận trên tầng.
- **Thủ thành** `defendTown` (thị trấn): đợt thường = 2 quái hoang thường, không bắt (`specialBattleRestricted`). Thắng: thưởng thường của trận + `waveDrops` (× hệ số rơi), log `beastTideWaveWon` (máu giữ nguyên sang đợt sau). Đã thắng đủ `waves` đợt thì `defendTown` là trận thú vương (bắt buộc).
- **Thú vương** `challengeBeastKing` (thị trấn): được từ khi `cleared ≥ kingAfter` (không thì `beastKingLocked { cleared, need }`). Thú vương = boss của map (`generateAnyBossEncounter`: boss ngẫu nhiên của map, không có thì boss tầng) với **hệ số boss thấp nhất** của map (độ khó đều đặn), × hệ số của đợt × `kingStrength` (1,5). Trận boss, **bắt được**. Hạ hoặc bắt được thú vương: `completion` (món cố định, một món đều trong `pickOneItemIds`, `skillBooks` sách theo map (`gainBiomeSkillBooks`), trứng hiếm `createBiomeBossEgg` lý lịch `{ kind: 'beastTide' }` nếu `egg`), log `beastTideCleared`, hết thú triều. Thách thú vương sớm = ít đợt thưởng hơn nhưng ít rủi ro hơn; đánh thêm đợt = nhiều thưởng hơn, thú vương mạnh dần theo đợt.
- Thua (đợt thường hoặc thú vương): mất `lossMoneyPercent` % tiền (thay cho phạt thua thường), cửa hàng thị trấn đóng `closedDays` ngày tính cả hôm nay (`events.shopClosedUntilDay`; `buyItem` / `sellItem` báo `shopClosed { untilDay }`; `isShopOpen`), log `beastTideFailed`, hết thú triều.
- **Rút lui** `retreatBeastTide` (ngoài trận): như thua (mất %, đóng cửa), log `beastTideRetreated { moneyLost, shopClosedUntilDay }`. Lỗi: `noBeastTide`.

## Save

- `GameState.events` (v48, thú vương v49; `state-versions.md`), `BattleState.special`. Kiểm tra ở `validateEventState` / `checkBattleSpecial`: event / modifier / bước chuỗi tồn tại, `chainId` chỉ với bước chuỗi, có event chờ thì không trong trận, modifier không trùng và thời hạn khớp loại, cửa hàng tạm như cửa hàng thị trấn (id món trang bị không trùng toàn save), `events.battle` trỏ đúng kết quả `startBattle` và đang trong trận của event đó, lịch / báo trước có ngày ≥ 0, thú triều đang diễn ra thì ở thị trấn (`cleared ≤ waves`, `kingAfter` trong [1, `waves`]), trận thú triều chưa xong là đợt kế tiếp và khớp tiến độ (thú vương chỉ khi đủ mốc, đợt thường chỉ khi còn đợt). Trường Decimal của log: `moneyGained` / `moneyLost` `amount`, `beastTideRetreated.moneyLost` (`bigFields.ts`).

## Chưa có

- Chữ mô tả event, nhãn lựa chọn, màn hình event / cửa hàng tạm / thú triều (đếm ngược báo trước): chờ UI (`ui-overhaul.md`). Vòng tự đánh dừng khi có `events.pending`: việc của UI (`auto-battle.md`).
- Event theo thời khắc / mùa / tuần trăng: trường `dayPhases`, `seasons`, `moonPhases` của `EventDef` (`calendar.md`); Trăng máu chỉ ban đêm.
- Event tung sẵn giá trị để hiện trước khi chọn (ví dụ loài của quái bị thương): chưa cần (kết quả tất định theo RNG của save nên không reroll được); thêm khi làm UI nếu cần.
