# Dạng trong trận

> Một phần tài liệu project. Mục lục và quy tắc chung: `CLAUDE.md` ở thư mục gốc. Các tham chiếu "mục X" / "xem X" tra tên mục trong `docs/index.md` (mục lục chi tiết).

Như Pokémon đổi dạng trong trận do ability / chiêu (Zen Mode, Stance Change, Forecast, Shields Down, Power Construct, Disguise...). Làm 2026-10-30 (save v68). Độc lập với biến hình (`transformation.md`): quái đang Mega / Tera vẫn đổi dạng được.

Code: `battle/battleForms.ts` (`changeBattleForm`, `revertBattleForm`, `battleFormOnLeave`, `formBeforeSkillUse`, `disguiseBlocks`, `revertBattleForms`), hook ở `registries/formTraitHooks.ts` / `formTraitQueries.ts`, hiệu ứng `changeForm` ở `battle/traitEffects.ts`, chỉ số ở `monster/stats.ts` (`statSpecies`).

## Luật

- **Loài dạng:** loài `formKind: battleOnly` có `formOf` = loài gốc (đã có từ đợt nhập loài: Aegislash Blade, Darmanitan Zen, Minior Meteor, Eiscue Noice, Wishiwashi School, Zygarde Complete, Palafin Hero, Ash-Greninja, Castform 3 dạng, Terapagos Terastal / Stellar, Meloetta Pirouette, Necrozma Ultra...). Dạng chỉ khác hình mà ability cần (Cramorant Gulping / Gorging, Morpeko Hangry, Cherrim Sunshine, Mimikyu Busted / Busted Totem) và 4 dạng Tera của Ogerpon chép từ loài gốc bằng `scripts/data-import/battle-forms-import.mjs` (chạy sau script trait ability, trước `pokemon-abilities-import.mjs`).
- **Dạng khác nhập thêm 2026-10-31** (`alternate`, gặp ở biome như loài thường; chỉ số / hệ / cân nặng theo Showdown, cùng script): 11 dạng Totem (USUM: quái Totem cỡ lớn người chơi nhận bằng Totem Sticker; không có hào quang Totem vì hào quang chỉ có ở trận thử thách của NPC), Greninja Bond (mang Battle Bond, thành Ash-Greninja), Basculin sọc xanh / sọc trắng (sọc trắng tiến hóa thành Basculegion đực / cái ở level 30, gốc: chịu 294 sát thương phản lại), Toxtricity Low Key (Toxel tiến hóa theo tính cách: điều kiện `nature`), Meowstic cái (Espurr theo giới tính), Tatsugiri Droopy / Stretchy, Squawkabilly lông vàng / trắng (ẩn Sheer Force), Magearna Original, Pikachu mũ World, 6 Pikachu cosplay (ORAS; mỗi bộ đồ học chiêu riêng ở level 1: Meteor Mash, Icicle Crash, Draining Kiss, Electric Terrain, Flying Press). Mũ Alola của Pikachu sửa từ `regional` thành `alternate`. Không nhập dạng chỉ khác màu / hoa văn (Vivillon, Zarude Dada, Maushold bốn con, Squawkabilly lông xanh, Dudunsparce ba khúc, Sinistea / Poltchageist bản thật, Genesect theo Drive, Keldeo Resolute, Xerneas Neutral, Pichu tai gai).
- **Quái:** `Monster.battleForm { speciesId, originalElementIds, untilLeave? }`, chỉ có trong trận (save v68).
  - Chỉ số gốc theo loài dạng (dạng Mega / Ultra Burst đang có ưu tiên hơn); ability theo loài dạng khi loài dạng có ability riêng (như Pokémon đổi dạng hẳn: Terapagos Terastal → Tera Shell, Ogerpon Tera → Embody Aspect; cùng ô ability), không thì theo loài gốc (dạng ability đổi dạng như Zen Mode, Stance Change mang lại chính ability đó).
  - Hệ theo loài dạng; quái đang Tera giữ hệ Tera (hệ trả lại khi hết trận đổi theo dạng). Hệ đổi tạm kiểu Soak thì bản gốc trả lại khi rời sân đổi theo dạng.
  - Max HP đổi (Power Construct, Terapagos Stellar) thì **giữ máu đã mất** (như Pokémon); còn sống thì còn ít nhất 1 máu.
  - Log `formChanged { monsterId, speciesId | null }`.
- **Hết dạng:** `untilLeave` thì về dạng thường khi rời sân (Zen Mode, Stance Change, Forecast, Hunger Switch, Relic Song); không thì giữ tới hết trận (Disguise, Ice Face, Battle Bond, Power Construct, Zero to Hero). Hết trận mọi quái về dạng thường, hệ gốc (sau khi trả biến hình).
- **Bảng dạng** (`forms`: loài → dạng, kiểm tra `checkFormMap`): khóa là loài hiện tại của quái (dạng vùng miền là loài riêng: Darmanitan Galar → Zen Galar), giá trị là dạng `battleOnly` của chính loài gốc đó. Quái loài khác có ability này (Skill Swap, Role Play) thì không đổi dạng (như Pokémon).

## Cách đổi dạng

- Hiệu ứng ngôn ngữ trait `changeForm { to, forms | revert, toggle?, untilLeave? }` (`trait-dsl.md`), dùng với sự kiện vào sân / cuối lượt / `fieldChanged` (thời tiết, địa hình đổi) / `transformed` / `kill` / `attack`..., điều kiện `inForm`, `hpBelow`, `levelAtLeast`...
- Hook `formOnSkill { forms, revertSkillIds }` (Stance Change): trước khi skill bằng lệnh có tác dụng, skill gây sát thương → dạng tấn công, skill trong `revertSkillIds` (King's Shield) → dạng thường.
- Hook `formOnLeave { forms }` (Zero to Hero): còn sống rút về thì nhận dạng tới hết trận.
- Hook `disguise { forms, categories, hpCostPercent }` (Disguise: vật lý / đặc biệt, mất ⅛ máu; Ice Face: vật lý, không mất máu): còn ở dạng thường mà trúng đòn đúng loại thì không mất máu vì đòn, đổi sang dạng (giữ tới hết trận), log `disguiseBroken`; sau thế thân (thế thân nhận đòn trước); đòn bỏ qua ability (Mold Breaker, Moongeist Beam) không bị chặn.
- Biến hình Ultra Burst (Necrozma) là loại biến hình riêng (`transformation.md`), không phải dạng trong trận.
- Skill đổi theo dạng: `formOverrides` (`pokemon-moves-flow.md`).

## Dạng chép (2026-11-07)

`BattleForm.copied: true`: dạng chép chỉ số gốc của **loài thường bất kỳ** (không cần `formKind: battleOnly`), do `transformInto { baseStats }` đặt (`copyStatSpecies`, `battle/battleForms.ts`; Transmog của Temtem, `content-sources-temtem.md`). Chỉ số tính từ chỉ số gốc của loài đó với level / gen / điểm của quái; máu đã mất giữ nguyên; hệ / ability / skill do `transformInto` đổi; giữ tới hết trận (không có `untilLeave`). Save v111.
