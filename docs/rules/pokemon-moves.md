# Cơ chế chiêu Pokémon theo bản gốc

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Chủ project chốt 2026-10-28: chiêu Pokémon làm giống bản gốc nhất có thể. Cơ chế riêng của từng chiêu viết bằng "ngôn ngữ" trait trong phần `spell` của skill (`trait-dsl.md`), không viết handler theo id chiêu. Chiêu cần luồng trận riêng (Bide, Sky Drop, Pursuit, Pollen Puff, Round, Echoed Voice, Struggle, skill theo dạng) và script rà tự động ở `pokemon-moves-flow.md`.

Code: điều kiện ở `registries/traitDsl.ts` / `traitConditions.ts`, `spell.requires` ở `registries/skillSpell.ts` (`meetsSpellRequirements`), ghi việc trong lượt ở `battle/draft.ts` (`currentTurnLog`), `battle/stageChanges.ts`, `battle/hpChanges.ts` (`recordDamage`), `battle/executeSkill.ts`, skill đang chờ ở `battle/actionQueue.ts` (`pendingSkillOf`). Dữ liệu: `scripts/data-import/pokemon-move-mechanics.mjs` (bảng id chiêu → trường ghi đè, chạy lại được), rà so với gốc: `scripts/data-import/pokemon-move-audit.mjs`.

## Việc trong lượt

- **Nhật ký trong lượt** (`VolatileState.turnLog { turn, acted?, statsRaised?, statsLowered?, hits? }`, save v64): ghi trong lượt đang xử lý, **bỏ ở cuối lượt** (cùng lúc với `damagedSinceTurnEnd`), lượt khác coi như trống.
  - `acted`: quái đã dùng skill bằng lệnh của nó (không tính skill do trait / minion, hợp kích kỹ), ghi lúc bắt đầu dùng (kể cả khi sau đó thất bại).
  - `statsRaised` / `statsLowered`: có bậc trận tăng / giảm thật (sau chặn, hệ số, kẹp giới hạn; `applyStageChange`).
  - `hits`: mỗi đòn skill gây sát thương thật lên quái (`{ by, category, amount }`, theo thứ tự; `recordDamage`), dùng cho đòn trả.
- **`lastSkillFailed`** (`VolatileState`, giữ qua các lượt tới khi rời sân): lần dùng skill gần nhất bằng lệnh của quái **không trúng mục tiêu nào** (thất bại vì lượt đầu / bị chặn / bị ngắt / không có mục tiêu / trượt / né / bị bảo vệ / không thỏa `requires` / đang chờ hold). Trúng ít nhất một mục tiêu thì xóa.
- **Skill đang chờ** (`MonsterBattleContext.pendingSkill { skillId, priority }`): lệnh skill đầu tiên của quái còn trong hàng chờ của lượt đang xử lý, priority thật (đã cộng trait). Quái đã đi hoặc không chọn skill thì không có.
- `MonsterBattleContext.field`: môi trường hiện tại (điều kiện theo thời tiết / địa hình).

## Thất bại theo điều kiện (`spell.requires`)

- Danh sách điều kiện (ngôn ngữ trait, không rỗng), xét **với từng mục tiêu** trước guard / accuracy (góc nhìn: `self` = quái dùng, `target` = `other` = mục tiêu). Không thỏa thì skill không có tác dụng lên mục tiêu đó; lần đầu gặp trong lượt dùng ghi log `skillFailed { reason: 'condition' }`.
- **AI** bỏ mục tiêu không thỏa `requires` lúc chọn lệnh; điều kiện theo việc trong lượt (`pendingSkill`, `actedThisTurn`, `hitThisTurn`, `statsChangedThisTurn`, `previousSkillThisTurn`) chưa biết lúc chọn nên coi như thỏa (AI vẫn dùng Sucker Punch, có thể thất bại như người chơi).

## Điều kiện mới của ngôn ngữ trait

Dùng được ở mọi chỗ nhận điều kiện (`powerBonus.when`, `if` của hiệu ứng, `requires`, trigger...):

- `fieldActive { layer, fieldIds? }`: lớp `weather` / `terrain` không ở môi trường mặc định; `fieldIds`: đang là một trong các môi trường đó (phải thuộc đúng lớp).
- `grounded { who, value }`: quái đứng / không đứng trên mặt đất (tính cả Gravity).
- `holdsItem { who, value }`: quái đang lắp / không lắp món nào (trang bị lẫn đồ cầm, như Magic Room coi cả hai là đồ cầm).
- `transformed { who, kinds? }`: biến hình đang có tác dụng (đã kết thúc thì không), `kinds` lọc loại (`mega` / `dynamax` / `tera` / `trueForm` / `merge`).
- `actedThisTurn { who, value }`, `statsChangedThisTurn { who, direction: raised | lowered }`, `hitThisTurn { who, by?, categories?, value? }`, `previousSkillThisTurn { skillIds, sameSide? }` (`by`: chỉ đòn do quái đó ra), `lastSkillFailed { who }`, `pendingSkill { who, categories?, minPriority? }`.

## Power theo công thức (`powerFormula`)

- Trường skill `powerFormula` (chỉ skill gây sát thương; `registries/powerFormulas.ts`, `formulaPower`): power tính theo công thức **thay cho** `power` / `fieldModifiers` trong công thức sát thương (đánh thật và AI dùng chung `rawDamage`). `power` của skill giữ số cũ (60 với chiêu "—" của gốc) chỉ để quy đổi chiêu Max / Z.
- Hai dạng:
  - `linear { value, times, plus?, min?, max? }`: ⌊giá trị × times + plus⌋, kẹp [min, max]; tối thiểu 1 (như Pokémon). Mẫu số tỉ lệ bằng 0 thì coi như vô cùng (kẹp `max`).
  - `steps { value, steps: [{ atLeast?, below?, power }], otherwise }`: mốc đầu tiên thỏa (≥ atLeast và < below), không mốc nào thì `otherwise`.
- Giá trị (`value.of`, `who` = `self` / `target`): `hpPercent` (% máu hiện tại), `stat` (chỉ số trong trận, đã tính bậc / môi trường), `weight` (kg, `monsterWeightKg`), `positiveStages` (tổng bậc trận dương, kể cả chính xác / né), `affinityPercent` (thân mật / tối đa × 100), `counter` (bộ đếm ngôn ngữ trait), `ratio { numerator, denominator }`.
- Chiêu đã làm (số thế hệ 9): Eruption / Water Spout / Dragon Energy (150 × % máu quái dùng), Crush Grip / Wring Out (120 × % máu mục tiêu), Hard Press (100 × % máu mục tiêu), Flail / Reversal (bảng theo ⌊48 × máu / max⌋: 200 / 150 / 100 / 80 / 40 / 20), Gyro Ball (⌊25 × tốc độ mục tiêu / tốc độ quái dùng⌋ + 1, tối đa 150), Electro Ball (tốc độ quái dùng / mục tiêu ≥ 4 / 3 / 2 / 1: 150 / 120 / 80 / 60, còn lại 40), Grass Knot / Low Kick (cân nặng mục tiêu ≥ 200 / 100 / 50 / 25 / 10 kg: 120 / 100 / 80 / 60 / 40, còn lại 20), Heavy Slam / Heat Crash (tỉ lệ cân nặng ≥ 5 / 4 / 3 / 2: 120 / 100 / 80 / 60, còn lại 40), Stored Power / Power Trip (20 + 20 × bậc dương), Punishment (60 + 20 × bậc dương của mục tiêu, tối đa 200), Last Respects (50 + 50 × đồng đội đã gục), Rage Fist (50 + 50 × số lần bị đánh trong trận, tối đa 350), Return (102 × thân mật / tối đa; gốc: thân mật × 10 / 25).

## Chỉ số thay thế, loại đòn, bỏ qua bậc / ability, khắc hệ đặc biệt

Trường skill (kiểm tra ở `gameData/validateSkillMechanics.ts`, tính trong `rawDamage` / `effectivenessAgainst` của `battle/damage.ts`):

- `attackFrom { who: self | target, stat }`: chỉ số công thay cho công / đặc công (Foul Play: công của mục tiêu kể cả bậc của nó; Body Press: thủ của quái dùng). `defenseStat`: chỉ số thủ của mục tiêu dùng thay (Psyshock, Psystrike, Secret Sword: thủ vật lý).
- `categoryRule`: `higherAttack` (Photon Geyser, Light That Burns the Sky: công > đặc công thì tính vật lý), `betterRatio` (Shell Side Arm: tính loại cho tỉ lệ công / thủ mục tiêu cao hơn). Chỉ đổi cách tính sát thương; các luật khác theo `category` ghi trong dữ liệu.
- `ignoresTargetStages: true` (Sacred Sword, Chip Away, Darkest Lariat): bỏ qua bậc trận của mục tiêu khi tính thủ và né.
- `ignoresAbility: true` (Moongeist Beam, Sunsteel Strike, Photon Geyser, Searing Sunraze Smash, Menacing Moonraze Maelstrom; trường `ignoreAbility` của Showdown): trong đòn đó bối cảnh trận của mục tiêu có `abilitySuppressed`, hook nguồn `ability` không chạy. `MonsterBattleContext.abilitySuppressed` cũng đọc từ `VolatileState.abilitySuppressed` (Gastro Acid, Core Enforcer; tới khi rời sân).
- `effectiveness { against?, extraElementIds? }`: `against` ghi đè hệ số lên hệ bên nhận (Freeze-Dry: Nước 2; Thousand Arrows: Bay 1), `extraElementIds` nhân thêm bảng của hệ khác (Flying Press: Bay).
- **Bị hạ xuống đất** (trạng thái `smackedDown`, chỉ trong trận, mất khi rời sân; Smack Down, Thousand Arrows gây 100%): hook trait `grounded { removesImmunityFromElementIds? }` (đặt được trên trạng thái / trait / đồ cầm) làm quái đứng trên mặt đất (thắng hệ Bay và `airborne`) và chiêu hệ Đất đánh trúng nó (`removesAirborneImmunity`).
- Dữ liệu: script đọc `overrideOffensiveStat`, `overrideOffensivePokemon`, `overrideDefensiveStat`, `ignoreDefensive` / `ignoreEvasion`, `ignoreAbility` của Showdown cho mọi chiêu khớp tên + hệ.

## Sát thương cố định, tự gục, hụt mất máu

Code: `battle/fixedDamage.ts` (`fixedDamageAmount`, `ohkoAccuracy`), `computeDamage` / `expectedDamage` (`battle/damage.ts`), chi phí tự thân `applySelfCosts` (`battle/executeSkill.ts`), chừa máu trong `mitigate` (`battle/hpChanges.ts`).

- `fixedDamage` thay công thức (không công / thủ, chí mạng, khắc hệ, dao động; **miễn nhiễm theo hệ vẫn chặn** vì xét sau hệ số khắc chế 0, như Night Shade không trúng hệ Thường):
  - `flat { amount }` (Dragon Rage 40, Sonic Boom 20); `level { minPercent?, maxPercent? }` (Night Shade, Seismic Toss = level quái dùng; Psywave 50–150%, tung đều số nguyên %, AI lấy trung bình); `targetHpPercent { percent }` (Super Fang, Nature's Madness, Ruination: 50% máu hiện tại, tối thiểu 1); `hpDifference` (Endeavor: mục tiêu còn máu bằng quái dùng, mục tiêu ít máu hơn thì 0); `userHp` (Final Gambit); `ohko { immuneElementIds?, accuracyIfNotElement? }` (Fissure, Guillotine, Horn Drill, Sheer Cold: mất hết máu hiện tại).
  - Hạ gục một đòn: accuracy = accuracy gốc (Sheer Cold khi quái dùng không mang hệ Băng: 20) + level quái dùng − level mục tiêu, kẹp 0–100; mục tiêu level cao hơn hoặc mang hệ miễn (Sheer Cold: hệ Băng) thì 0; bỏ qua bậc / môi trường như gốc.
  - Mục tiêu **HP vô hạn** (boss thế giới, `Monster.endlessHp`, `world-boss.md`): `targetHpPercent` / `hpDifference` / `ohko` gây 0, hạ gục một đòn accuracy 0 (như Max Raid của Pokémon); loại khác như thường.
- `selfFaint`: `always` (Explosion, Self-Destruct, Misty Explosion: tự gục kể cả trượt / không có mục tiêu), `onHit` (Final Gambit, Memento: chỉ khi trúng; trường `selfdestruct` của Showdown). `crashDamagePercent` (Jump Kick, High Jump Kick, Axe Kick, Supercell Slam: 50): trượt / bị chặn / không gây sát thương thì mất 50% max HP. `selfDamagePercent` (Mind Blown, Steel Beam, Chloroblast: 50): mỗi lần dùng mất 50% max HP, làm tròn lên. Log `selfDamage { monsterId, skillId, amount, reason: faint | crash | cost }`.
- `leavesOneHp` (False Swipe, Hold Back): sát thương không làm mục tiêu dưới 1 máu.
- AI trừ điểm chi phí tự thân (`selfCostAiValue`): phần máu hiện tại sẽ mất (kỳ vọng theo tỉ lệ trúng), tự gục trừ thêm `koBonus`.
- Dữ liệu đọc `damage`, `ohko`, `selfdestruct`, `hasCrashDamage`, `mindBlownRecoil` của Showdown; Super Fang, Nature's Madness, Ruination, Endeavor, Final Gambit, Psywave, Chloroblast, False Swipe, Hold Back ghi tay (hàm của Showdown không có trong bản client).

## Bảo vệ và đòn trả

- Hiệu ứng skill `protect { consecutiveChanceDivisor, mode?, blocks?, onContact? }` (`registries/transformSkillEffects.ts`, cũng là Max Guard): bật tới hết lượt, tỉ lệ ÷ 3 mỗi lần dùng liên tiếp (mọi skill bảo vệ chung một chuỗi như Pokémon, `VolatileState.protect { turn, streak, skillId }`).
  - `mode: endure` (Endure): không chặn mà trụ lại 1 máu trước đòn skill trong lượt (log `endured`).
  - `blocks: damaging` (King's Shield, Obstruct, Silk Trap, Burning Bulwark): skill trạng thái đi qua; mặc định `all` (Protect, Detect, Spiky Shield, Baneful Bunker, Max Guard).
  - `onContact` (ngôn ngữ trait, self = quái bảo vệ, other = quái đánh): chạy khi chặn **đòn tiếp xúc** (King's Shield −1 công, Obstruct −2 thủ, Silk Trap −1 tốc độ, Spiky Shield mất 1/8 max HP, Baneful Bunker độc, Burning Bulwark bỏng).
- Trường skill `contact: true` (cờ `contact` của Showdown, 257 chiêu lúc làm): đòn tiếp xúc; dùng cho bảo vệ và ability kiểu Rough Skin. `breaksProtect: true` (Feint, Hyperspace Hole / Fury, Shadow / Phantom Force): phá bảo vệ của mục tiêu (log `protectBroken`) rồi đánh. Chiêu nhắm địch không có cờ `protect` của Showdown (Roar, Feint, Perish Song, Future Sight...) có `ignoresProtect`.
- Đòn trả: `targetsLastAttacker { categories? }` tự nhắm quái phe địch còn trên sân gây đòn cuối đúng loại cho quái dùng trong lượt (theo `turnLog.hits`), không có thì thất bại (`skillFailed condition`); sát thương `fixedDamage { kind: counter, multiplier, categories? }` = hệ số × đòn cuối đó (Counter vật lý ×2, Mirror Coat đặc biệt ×2, Metal Burst / Comeuppance mọi đòn ×1,5).
- AI (2026-10-30): skill bảo vệ chấm như lệnh phòng thủ, `config.ai.defendWeight` × (1 − máu còn / max HP) × tỉ lệ thành công (vừa dùng ở lượt trước thì ÷ `consecutiveChanceDivisor` mỗi lần). Đòn trả lúc chọn lệnh (chưa trúng đòn) dùng sát thương kỳ vọng = trung bình trên các skill gây sát thương của mục tiêu: skill đúng loại tính hệ số × sát thương mục tiêu sẽ gây lên quái dùng, loại khác 0 (`expectedCounterDamage` trong `battle/damage.ts`).

## Chiêu nhiều lượt

Code: `battle/multiTurnMoves.ts`, gọi từ `battle/turn.ts` (lệnh bị ép, nghỉ, nạp đầu lượt, đòn đến muộn cuối lượt) và `battle/executeSkill.ts`.

- **Lệnh bị ép** (`withForcedCommands`, đầu lượt, cả lệnh người chơi lẫn AI): quái đang nạp, đang khóa chiêu còn lượt, hoặc phải nghỉ thì lệnh của ô đó thành lệnh skill bị ép (nhắm lại mục tiêu cũ nếu còn trên sân), không đổi quái được, như Pokémon.
- **Nạp hai lượt** (`charge { invulnerable?, onCharge?, skipInFieldIds? }`; cờ `charge` của Showdown): lượt đầu log `charging`, chạy `onCharge` (Skull Bash +1 thủ, Meteor Beam / Electro Shot +1 đặc công), ghi `VolatileState.charging`; lượt sau đánh mục tiêu đã chọn. Môi trường trong `skipInFieldIds` thì đánh ngay sau `onCharge` (Solar Beam / Solar Blade: nắng; Electro Shot: mưa). Power về số gốc (Fly 90, Solar Beam 120...; trước đây giảm để bù lượt nạp).
- **Bán vô hình** (`invulnerable`: `air` Fly / Bounce / Sky Drop, `underground` Dig, `underwater` Dive, `vanished` Phantom / Shadow Force): đòn nhắm quái đang nạp kiểu đó **trượt** (kể cả luôn trúng), trừ skill có `hitsInvulnerable [{ kind, multiplier? }]` (Thunder, Hurricane, Sky Uppercut, Smack Down, Thousand Arrows trúng `air`; Gust / Twister ×2; Earthquake / Magnitude ×2 và Fissure trúng `underground`; Surf / Whirlpool ×2 trúng `underwater`).
- **Nghỉ** (`recharge`: Hyper Beam, Giga Impact, Blast Burn...; `mustrecharge` của Showdown): đánh trúng thì lượt sau quái bỏ lượt (log `recharging`). Power về số gốc (150).
- **Khóa chiêu** (`lockIn { kind, turns, fatigueStatusId?, blocksStatusIds? }`, `VolatileState.lockedMove`): `rampage` (Outrage, Thrash, Petal Dance, Raging Fury: 2–3 lượt, hết lượt thì lú lẫn), `rollout` (Rollout, Ice Ball: 5 lượt), `uproar` (Uproar: 3 lượt, không quái nào dính ngủ trong lúc đó). Trượt / thất bại thì thôi khóa, không lú lẫn.
- **Dùng liên tiếp** (`VolatileState.skillStreak`, bộ đếm DSL `skillStreak`: số lần liên tiếp dùng skill đang xét qua các lượt, đổi skill / bỏ lượt thì đếm lại): Fury Cutter 40 / 80 / 160, Echoed Voice 40 × n (tối đa 200), Rollout / Ice Ball 30 × 2^(n − 1) (`powerFormula`).
- **Đòn đến muộn** (`delayedTurns`: Future Sight, Doom Desire 2): lúc dùng đặt `battle.delayedAttacks` lên ô mục tiêu (ô đã có đòn chờ thì thất bại), cuối lượt thứ `delayedTurns` sau đó trúng quái đang ở ô đó (log `delayedAttackHit`, quái dùng không cần còn trên sân).
- **Nạp đầu lượt** (`chargeAtTurnStart { onContactHit? }`, `VolatileState.turnStartCharge`): sau bước biến hình, trước mọi hành động, quái chọn skill này nạp (log `charging`); trong lượt đó quái đánh tiếp xúc vào nó chịu `onContactHit` (Beak Blast: bỏng). Focus Punch thất bại nếu đã trúng đòn trong lượt (`spell.requires hitThisTurn value false`), Shell Trap chỉ nổ khi đã trúng đòn vật lý (`hitThisTurn categories physical`); bỏ `hold` quy đổi cũ.
- Điều kiện `hitThisTurn` thêm `categories?`, `value?` (mặc định true).
- **Skill vừa dùng trước trong lượt** (`previousSkillThisTurn { skillIds, sameSide? }`, ghi sau mỗi lần dùng bằng lệnh của quái, theo bản nháp, mất khi hết lượt; `MonsterBattleContext.previousSkill`): Round ×2 khi đồng đội vừa dùng Round, Fusion Flare ×2 khi vừa có Fusion Bolt (và ngược lại).
- Chưa có: Sky Drop mang mục tiêu lên trời (hiện nạp như Fly), Power Herb (đồ cầm bỏ lượt nạp), Bide (chiêu cũ, không còn ở thế hệ 8+).

## Trói và giữ chân

Code: `battle/trapping.ts` (`isTrapped`), hook trait `trapped` (`registries/fieldTraitHooks.ts`), chặn ở `battle/battleActions.ts` (đổi quái, chạy trốn: `ActionError monsterTrapped`) và AI đổi quái (`trainerAi.ts`), bỏ trạng thái theo nguồn ở `clearOnFieldState` (`battle/draft.ts`).

- Hook trait `trapped` (không params; đặt trên trạng thái, hoặc ability Shadow Tag / Arena Trap qua hào quang lên địch): quái không đổi ra, không chạy trốn được (trait kiểu Run Away vẫn chạy được như Pokémon). Hệ có `trapImmune` (hệ Ma, `elements.json`) không bị giữ chân.
- Trạng thái có cờ `endsWhenSourceLeaves` nhớ quái gây ra (`StatusInstance.sourceId`) và mất khi quái đó rời sân.
- Trạng thái: `bound` (Bind, Wrap, Fire Spin, Whirlpool, Sand Tomb, Clamp, Magma Storm, Infestation, Snap Trap, Thunder Cage: 4–5 lượt, mất 1/8 max HP cuối lượt; `partiallytrapped` của Showdown), `cantEscape` (Mean Look, Block, Spider Web, Thousand Waves, Anchor Shot, Spirit Shackle; Jaw Lock lên cả hai), `octolocked` (Octolock: thêm −1 thủ / thủ đặc biệt cuối lượt), `ingrained` (Ingrain: giữ chân, hồi 1/16 máu cuối lượt, bám đất), `aquaRing` (Aqua Ring: hồi 1/16), `noRetreat` (No Retreat: +1 mọi chỉ số, giữ chân). Đều chỉ trong trận, mất khi rời sân.

## Đồ cầm

Code: hiệu ứng ngôn ngữ trait `takeItems` / `swapItems` / `eatItems` / `recycleItem` (`registries/traitDsl.ts`, `battle/traitEffects.ts`), sổ món `battle/itemLedger.ts` (trả lại ở `finish`), ghi tiêu hao ở `consumeHeldItem` (`battle/heldItems.ts`).

- "Đang cầm" = mọi món lắp (trang bị và đồ cầm), như Magic Room. Món bị lấy / tráo trong trận **trả lại khi hết trận** (`battle.itemLedger`, ghi ở lần đổi đầu tiên; như Pokémon thế hệ 5+); món bị ăn / ném (`consume`) mất hẳn.
- `takeItems { from, to?, tags?, consume?, firstWith? }`: Knock Off (bỏ mọi món của mục tiêu sau đòn; power ×1,5 nếu mục tiêu cầm đồ), Thief / Covet (lấy sang quái dùng khi nó chưa cầm gì), Corrosive Gas (bỏ), Incinerate (đốt berry, mất hẳn). `swapItems { with }`: Trick, Switcheroo (tráo toàn bộ món), Bestow (cho món khi mục tiêu chưa cầm). `eatItems { from, tags }`: Bug Bite, Pluck (ăn berry của mục tiêu, nhận hiệu ứng trigger của nó). `recycleItem { to }`: Recycle (lắp lại đồ tiêu hao gần nhất trong trận, `BattleRecord.lastConsumedItemId`).
- Bộ đếm `berriesEaten` (`BattleRecord.berriesEaten`, tăng mỗi berry tiêu hao kể cả Bug Bite): Belch cần ≥ 1. Điều kiện `holdsItem` thêm `tags?` (Stuff Cheeks, Natural Gift cần cầm berry).
- Fling: power = `flingPower` của món đầu tiên có số đó (giá trị power `heldItem`), ném rồi mất món (`firstWith: flingPower`); không cầm gì thì thất bại. Món có `flingStatusId` gây trạng thái lên mục tiêu (`takeItems.flingTo`; Flame Orb bỏng, Toxic Orb độc nặng, King's Rock / Razor Fang chùn bước, Light Ball tê liệt, Poison Barb độc).
- Natural Gift (`elementFromHeldItem`): hệ và power theo `naturalGift` của berry đầu tiên, dùng xong mất berry.
- Đồ cầm: `flingPower`, `naturalGift { power, elementId }` (số thật của PokeAPI, `scripts/data-import/pokemon-item-data-import.mjs`: 59 món ném được, 30 berry lúc nhập).
- Trạng thái `embargo` (Embargo, 5 lượt): cờ trạng thái `disablesItems` tắt món của quái mang nó (`MonsterBattleContext.itemsDisabled` như Magic Room). Luật "trạng thái phải có hook" nới: có cờ `disablesItems` thì không cần hook.

## Ép đổi quái

- Hiệu ứng skill `forceSwitch` (không params, sau đòn lên từng mục tiêu; cờ `forceSwitch` của Showdown: Roar, Whirlwind, Dragon Tail, Circle Throw, priority −6; `battle/forceSwitch.ts`): mục tiêu bị đẩy ra (log `forcedOut`), quái dự bị **ngẫu nhiên** vào được ô đó vào thay. **Quái hoang** (trận không có ngự thú sư) bị đẩy thì bỏ đi khỏi trận (`wildFled`, không cho thưởng như quái gục). Không đẩy được (log `forceSwitchFailed`): boss hoang, quái đang Dynamax, quái mang hook trait `anchored` (Ingrain; ability Suction Cups), phe không còn quái dự bị vào được.
- AI: điểm `fieldWeight` khi đẩy địch còn quái dự bị vào thay; 0 khi địch không còn dự bị (quái hoang bỏ chạy mất thưởng, hoặc đẩy thất bại) hoặc là boss (sửa 2026-10-29 theo mô phỏng: phe ta dùng Roar 4,2% lượt lên quái hoang).
- Lệch gốc: quái ta bị quái hoang đẩy thì đổi quái dự bị (gốc: kết thúc trận) vì trận 2v2 nhiều quái hoang.
- Roar của game trước đây quy đổi thành −1 công mọi địch; nay đúng gốc (nhắm một địch, priority −6, luôn trúng, xuyên bảo vệ).

## Chiêu trạng thái

Code: hiệu ứng ngôn ngữ trait ở `battle/pokemonEffects.ts` (runner), `cast` mở rộng ở `battle/traitEffects.ts`, chặn skill ở `isPokemonBlocked` (`battle/executeSkill.ts`), phản / cướp / nổ bột / điện hóa ở `executeSkill.ts`, Destiny Bond / Grudge ở `avengeOnFaint` (`battle/hpChanges.ts`). Dữ liệu ở bảng `MECHANICS` (`scripts/data-import/pokemon-move-mechanics.mjs`).

- **Máu, bậc, chỉ số:** `shareHp` (Pain Split: máu hai quái về trung bình), `copyStages` (Psych Up), `swapStages` (Guard / Power / Heart Swap), `invertStages` (Topsy-Turvy), `averageStats` (Guard / Power Split: chỉ số gốc về trung bình bằng `volatile.flatStats`), `swapStats` (Speed Swap), `swapOwnStats` (Power Trick: đúng 2 chỉ số), `randomStage` (Acupressure: +2 một chỉ số chưa tối đa ngẫu nhiên). Belly Drum (mất ½ máu, công lên tối đa; thất bại khi máu ≤ ½), Strength Sap (hồi bằng công của mục tiêu, −1 công), Venom Drench, Curse (không phải hệ Ma: −1 tốc, +1 công / thủ; hệ Ma: mất ½ máu, trạng thái `curse` mất ¼ máu cuối lượt).
- **Ability trong trận** (`volatile.abilityOverride`, `abilitySuppressed`; xem `abilities.md`): `setAbility` (Role Play chép của mục tiêu, Entrainment gán của mình cho mục tiêu, Doodle cho cả phe, Worry Seed gán Insomnia), `swapAbilities` (Skill Swap), `suppressAbility` (Gastro Acid; Core Enforcer khi mục tiêu đã đi trong lượt). Hết khi rời sân.
- **Khóa skill:** `disableSkill` (Disable 4 lượt skill gần nhất của mục tiêu; Spite: game không có PP nên quy đổi thành khóa 2 lượt), `encore` (Encore 3 lượt: ép dùng lại skill gần nhất, `lockedMove.kind = 'encore'`). Trạng thái `tormented` (Torment, cờ `blocksRepeatSkill`: không dùng skill vừa dùng ở lượt trước), `imprisoning` (Imprison, cờ `imprisons`: địch trên sân không dùng được skill mà quái mang nó biết).
- **Tích trữ:** `stockpile { change: add | reset }` (`volatile.stockpile`, tối đa 3, bộ đếm `stockpile`): Stockpile (+1 thủ / thủ đặc biệt), Spit Up (power 100 × số lần), Swallow (hồi 25 / 50 / 100%).
- **Học / chép / biến hình:** `learnSkill` (Mimic: thay chính nó bằng skill gần nhất của mục tiêu tới hết trận; Sketch `permanent`: học vĩnh viễn), `transformInto` (Transform: hệ, chỉ số, bậc, skill, ability như mục tiêu), `swapPositions` (Ally Switch). Đổi hệ: `identity` thêm `addElementIds` (Forest's Curse, Trick-or-Treat), `elementFromFirstSkill` (Conversion), `resistLastSkillOfOther` (Conversion 2); Soak, Magic Powder, Reflect Type, Camouflage dùng `elementIds` / `elementFrom` sẵn có.
- **Đánh dấu một lần** (`markVolatile`): Destiny Bond (gục vì đòn skill của địch thì kẻ đánh gục theo), Grudge (skill hạ gục nó bị khóa tới hết trận), Magic Coat (phản skill có cờ `reflectable` về quái dùng, log `reflected`), Snatch (cướp skill có cờ `snatchable` của quái khác dùng trong lượt). Destiny Bond / Grudge hết ở lần dùng skill kế tiếp; Magic Coat / Snatch chỉ trong lượt dùng. Cờ `reflectable` / `snatchable` lấy theo cờ Showdown.
- **Gọi chiêu khác** (`cast`): `lastOf: other | battle` (Mirror Move, Copycat), `pendingOf` + `damagePercent` (Me First: chiêu mục tiêu sắp dùng, ×1,5), `by: 'other'` (Instruct: mục tiêu dùng lại skill gần nhất), `pool: 'party'` (Assist), `byField` (Nature Power theo địa hình), `skillIds` (Metronome: chiêu có cờ `metronome` của Showdown). Sleep Talk / Snore có `usableWhileStatusIds: ['sleep']` (dùng được khi ngủ); Sleep Talk / Assist không gọi chiêu thiếu cờ `metronome` và chiêu nạp.
- **Trạng thái mới** (`battle-statuses.md`): `infatuated` (Attract, cần khác giới: điều kiện `oppositeGender`; 50% bỏ lượt, hết khi quái gây rời sân), `healBlocked` (Heal Block 5 lượt, Psychic Noise 2 lượt qua `applyStatus.turns`; cờ `blocksHealing`), `drowsy` (Yawn: hết hạn thì ngủ, `onEndStatusId`), `nightmare` (cần đang ngủ, `requiresStatusId`; mất ¼ máu cuối lượt), `identified` / `miracleEyed` (Foresight, Odor Sleuth, Miracle Eye: hook trait `identified` bỏ miễn nhiễm hệ Thường / Giác đấu hoặc Siêu linh), `lockedOn` (Lock-On, Mind Reader: hook `sureHit`), `laserFocused` (Laser Focus: chí mạng chắc chắn), `telekinesis` (bay, hook `surelyHit`: mọi đòn trúng nó), `magnetRise` (bay 5 lượt), `powdered` (Powder: dùng skill hệ Lửa thì nổ mất ¼ máu, skill thất bại; cờ `explodesOnElement`), `electrified` (Electrify: skill kế tiếp thành hệ Điện; cờ `skillElementOverride`), `helped` (Helping Hand: ×1,5 sát thương trong lượt).
- **Hồi máu khác:** Heal Pulse / Floral Healing (hồi đồng đội 50%, Floral Healing 75% trên địa hình cỏ), Rest (chữa trạng thái chính, hồi đầy, ngủ 2 lượt), Purify, Wish (`delayedHealPercent`: cuối lượt sau hồi ½ max HP của quái dùng cho quái đang ở ô đó), Healing Wish / Lunar Dance (tự gục, hồi đầy quái vào thay), Revival Blessing (hồi sinh đồng đội đã gục 50%).
- **Thứ tự lượt / nhử đòn:** After You / Quash (hiệu ứng `timeline` đầu / cuối), Follow Me / Rage Powder / Spotlight (`provoke`).
- **Điều kiện mới:** `not { condition }`, `oppositeGender`, `hasAbility`.
- Lệch gốc: Spite (không có PP, như trên); Gear Up / Magnetic Flux / Simple Beam chờ ability Plus / Minus / Simple (xem mục "Chưa có").

## Chiêu còn lại (cụm 11)

- **Phản lực** `recoilPercent` (cờ `recoil` của Showdown, 12 chiêu lúc nhập: Double-Edge, Brave Bird, Flare Blitz, Head Smash, Wood Hammer, Take Down, Volt Tackle, Wild Charge, Submission, Head Charge, Wave Crash, Light of Ruin): sau chiêu, quái dùng mất % tổng sát thương vừa gây, làm tròn, ít nhất 1 (log `selfDamage` lý do `recoil`); hook trait `recoilImmunity` (Rock Head) miễn. Bỏ "chờ lượt" (`hold`) game tự thêm cho Chloroblast, Dragon Energy, Eruption, Head Smash, Mind Blown, V-create, Water Spout (đã có cơ chế gốc); Gigaton Hammer giữ (gốc: không dùng 2 lượt liền).
- **Cờ skill:** `ignoresStatusPenalty` (Facade bỏ qua giảm sát thương của bỏng), `ignoresRedirect` (Snipe Shot không bị nhử đòn), `sound` (cờ `sound` của Showdown; trạng thái có `blocksSoundSkills` chặn), `breaksScreens` (Brick Break, Psychic Fangs, Raging Bull: trước khi đánh từng mục tiêu, bỏ hiệu ứng theo phe có hook `damageTakenMultiplier` của phe đó).
- **Priority theo môi trường:** `fieldModifiers[].priority` (Grassy Glide +1 trên địa hình cỏ; tính trong `skillPriority`). Hydro Steam: `powerMultiplier: 3` khi nắng (nắng giảm Nước ½ nên thực ×1,5 như gốc).
- **Khắc hệ trong power:** góc nhìn `powerBonus` có hệ số khắc chế, điều kiện `superEffective` dùng được (Collision Course / Electro Drift ×4/3 khi khắc).
- **Trạng thái:** `throatChopped` (Throat Chop, 2 lượt), `saltCure` (Salt Cure: 1/8 max HP cuối lượt, 1/4 với hệ Nước / Thép qua `turnEndDamage.byElement`), `syrupy` (Syrup Bomb: −1 tốc cuối lượt, 3 lượt, mất khi quái gây rời sân), `glaiveRushed` (Glaive Rush: tới hết lượt sau nhận sát thương ×2 và mọi đòn trúng nó).
- **Hiệu ứng / điều kiện:** `identity.removeElementIds` (Burn Up, Double Shock: thất bại nếu không có hệ đó, dùng xong bỏ hệ, có thể thành không hệ như gốc), `restoreStages.all` (Clear Smog xóa mọi bậc), điều kiện `fainted { who }` (Fell Stinger: +3 công khi mục tiêu gục; trong `if` của hiệu ứng, `other` là mục tiêu bị đánh, `target` là quái nhận hiệu ứng). Sparkling Aria chữa bỏng (`curesTargetStatuses`), Stone Axe / Ceaseless Edge đặt Stealth Rock / Spikes (`setSideField`), Flame Burst 1/16 max HP lên đồng đội của mục tiêu, Synchronoise cần cùng hệ, Secret Power 30% hiệu ứng theo địa hình (không địa hình: tê liệt).

## Luôn trúng (`alwaysHits`)

- Trường skill `alwaysHits: true` (chỉ được là true): không kiểm tra chính xác như accuracy "—" của Pokémon: `skillAccuracy` trả 100, bỏ qua accuracy gốc, bậc chính xác / né, hệ số môi trường và trait chính xác; né của trait (Siralim) vẫn tính.
- Dữ liệu: `pokemon-move-mechanics.mjs` gán cho mọi skill nhắm địch mà chiêu gốc cùng tên (id camelCase) và cùng hệ có `accuracy: true` ở Showdown (Swift, Aerial Ace, Aura Sphere, Shadow Punch, Magical Leaf, Vital Throw, Defog, Roar...; chiêu Max / Z-Move vốn đã luôn trúng).

## Chiêu đã làm đúng gốc

Theo số và luật thế hệ 9 (Bulbapedia, Showdown). Chiêu khác Pokémon chưa liệt kê ở đây vẫn theo luật nhập cũ (`content-mechanics.md`).

- **Thất bại theo điều kiện:** Steel Roller (không có địa hình), Poltergeist (mục tiêu không lắp món), Sucker Punch / Thunderclap (mục tiêu không sắp dùng đòn gây sát thương), Upper Hand (mục tiêu không sắp dùng đòn gây sát thương priority ≥ 1; trúng thì chùn bước 100%).
- **×2 theo việc trong lượt:** Lash Out (vừa bị hạ bậc), Stomping Tantrum / Temper Flare (lần trước thất bại), Payback (mục tiêu đã đi), Bolt Beak / Fishious Rend (mục tiêu chưa đi), Avalanche / Revenge (đã trúng đòn của mục tiêu trong lượt), Assurance (mục tiêu đã trúng đòn trong lượt).
- **Theo trạng thái / đồ / biến hình:** Hex (mục tiêu có trạng thái chính: bỏng, tê liệt, độc, độc nặng, ngủ), Venoshock (độc), Brine (máu mục tiêu < 50%; gốc là ≤ 50%), Smelling Salts / Wake-Up Slap (×2 lên quái tê liệt / ngủ rồi chữa), Facade (quái dùng bỏng / tê liệt / độc), Acrobatics (quái dùng không lắp món), Knock Off (×1,5 khi mục tiêu lắp món), Behemoth Blade / Bash, Dynamax Cannon (×2 lên quái Dynamax).
- **Theo địa hình:** Expanding Force (×1,5 trên địa hình tâm linh khi quái dùng đứng trên mặt đất), Rising Voltage (×2 trên địa hình điện khi mục tiêu đứng trên mặt đất), Psyblade (×1,5 trên địa hình điện).
- **Hiệu ứng khi mục tiêu vừa tăng bậc trong lượt:** Alluring Voice (lú lẫn), Burning Jealousy (bỏng).
- **Defog**: nhắm một địch như gốc (trước đây nhắm chính quái dùng), luôn trúng, hạ 1 bậc né của mục tiêu rồi dọn sân như cũ.
- **Prankster** thất bại trước hệ Bóng tối, **Gravity** cấm chiêu bay: `battle-traits.md`, `battle-environment.md`.

## Chiêu còn lại (cụm 11, đợt 2026-10-30)

- **Power ngẫu nhiên** `randomPower: [{ power, weight }]` (tung mỗi lần dùng; AI và sát thương kỳ vọng dùng power trung bình theo trọng số): Present (40 / 80 / 120 / 0 theo 40 / 30 / 10 / 20%; lệch gốc: 20% hồi ¼ máu mục tiêu quy đổi thành không gây gì), Magnitude (10–150 theo bảng gốc), Fickle Beam (80, 30% ×2).
- **Hệ theo quái dùng** `elementFromUser: first | last`: Revelation Dance, Judgment, Multi-Attack, Raging Bull (hệ thứ nhất: dạng của loài quyết định hệ thay cho đĩa / bộ nhớ), Ivy Cudgel (hệ cuối: mặt nạ của Ogerpon). `elementFromGenes` (Hidden Power): hệ theo tính lẻ của gen HP, công, thủ, tốc, đặc công, đặc thủ như IV (công thức thế hệ 3–7, `hiddenPowerElement`); hệ không có trong dữ liệu thì giữ hệ Thường. Techno Blast: hệ theo Drive đang cầm (đồ cầm `skillElement { skillIds, elementId }`; Burn / Chill / Douse / Shock Drive ở chợ đen).
- **Theo bản ghi trận** (save v67): Last Resort (điều kiện `usedOtherSkills`: biết ≥ 2 skill và đã dùng mọi skill khác trong trận), Trump Card (bộ đếm `skillUses`: 40 / 50 / 60 / 80 rồi 200 từ lần thứ 5; lệch gốc: không có PP nên theo số lần dùng, giữ 200), Retaliate (điều kiện `allyFaintedLastTurn`, ×2). `BattleRecord.skillUses` ghi sau mỗi lần dùng bằng lệnh của quái, `BattleCounters.faintTurn` ghi lượt gục gần nhất theo phe.
- Rage: trạng thái `raging` (bị trúng đòn thì +1 công; mất sau hành động kế tiếp, dùng Rage lại thì có lại). Plasma Fists: Ion Deluge trong lượt. Beat Up: power 13 × số quái còn sống của phe (gốc mỗi quái một đòn ~công/10 + 5). Uproar đã có từ trước (khóa 3 lượt, chặn ngủ).
- **Mục tiêu theo môi trường** `fieldModifiers[].target`: Expanding Force đánh mọi địch trên địa hình tâm linh (quái dùng chạm đất). Spectral Thief `stealsBoosts`: trước khi đánh, cướp mọi bậc đang tăng của mục tiêu (log `boostsStolen`).
- **Pledge kết hợp:** đồng đội vừa dùng Pledge khác trong lượt (`previousSkillThisTurn` cùng phe) thì power 150 và đặt hiệu ứng theo phe bằng hiệu ứng DSL `placeSideField` (Lửa sau Cỏ: Sea of Fire lên phe địch; Cỏ sau Nước: Swamp, tốc độ ×¼; Nước sau Lửa: Rainbow lên phe mình, hook phe `secondaryChance` ×2 tỉ lệ hiệu ứng phụ). Lệch gốc: Pledge của đồng đội vẫn đánh riêng.
- Gear Up / Magnetic Flux: phe mình, chỉ quái có ability Plus / Minus. Power Herb: hook `skipChargeTurn` (đồ cầm tiêu hao) cho skill nạp đánh ngay.

## Chưa có

Không còn chiêu Pokémon chưa làm (rà tự động 0 / 0 / 0, `pokemon-moves-flow.md`). Chiêu mới của game sau: thêm vào bảng `MECHANICS` và `HANDLED`.
