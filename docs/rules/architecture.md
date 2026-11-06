# Kiến trúc chi tiết

> Một phần tài liệu project. Quy tắc chung và phần kiến trúc bắt buộc nhớ: `CLAUDE.md` ở thư mục gốc. File này giữ chi tiết (cây thư mục, ESLint, alias, đóng gói, khởi động) để `CLAUDE.md` gọn.

## Công cụ và đóng gói

- Electron + Vite + React + TypeScript (tạo từ template electron-vite `react-ts`).
- Test: Vitest (`vitest.config.mts`, chạy `src/**/*.test.ts` và `scripts/**/*.test.ts`).
- **Sản phẩm build (exe, deb...) phải cài và chạy được hoàn toàn offline** (chủ project chốt 2026-10-31): mọi thứ game cần lúc chạy (font, ảnh, dữ liệu, thư viện) đóng gói sẵn vào bản build, game không gọi mạng lúc chạy. Lúc phát triển / build thì gọi mạng, tải tài nguyên thoải mái (tải về rồi đóng gói vào, không để game tải lúc chạy).
- Số lớn: thư viện **`decimal.js`** (kiểu `Decimal`), xem `big-numbers.md` (đổi từ `break_infinity.js` vì thư viện đó lệch ±1 với số nguyên nhỏ). Thư viện chỉ cần cài ở máy build; bản exe đã chứa sẵn.
- **Dependency dùng lúc chạy** (như `decimal.js`) phải nằm trong `dependencies` của `package.json`, **không** để trong `devDependencies`. Main / preload không bundle dependency (`externalizeDepsPlugin`), electron-builder chỉ đóng gói `dependencies` vào `app.asar`; để sai chỗ thì `npm run dev` vẫn chạy nhưng bản exe báo `Cannot find module`.
- Máy dev là máy bình thường **có mạng** (chủ project chốt 2026-10-25): cài package thẳng từ npm, commit `package-lock.json`; được tải dữ liệu thật (PokeAPI, wiki...) khi nhập nội dung, kèm script nhập lại được trong `scripts/data-import/`.

## Cây thư mục

Chia theo tính năng (feature folders), mỗi folder chứa file code và file test cạnh nhau (`x.ts` + `x.test.ts`).

```
docs/
  rules/  roadmap/      Tài liệu: luật đã làm / thiết kế chưa làm
src/
  core/                 Logic game THUẦN (hàm thuần, không I/O). Xem `core-map.md`.
    index.ts            API công khai DUY NHẤT cho bên ngoài: import từ '@core'
    shared/  model/  inventory/  registries/  gameData/  shop/  monster/  tamer/  quests/  battle/  world/  progression/  roster/  events/  game/
    testing/            Fixture chỉ dùng trong test ('@core/testing')
  data/                 JSON nội dung game + index.ts (rawGameData), import từ '@data'
  main/                 Electron main process
    index.ts            Mở cửa sổ, kiểm tra dữ liệu lúc khởi động, đăng ký IPC
    startup/            dataCheck (nội dung hộp thoại lỗi dữ liệu)
    saves/              saves (đọc / ghi file), saveIpc (IPC + hộp thoại Xuất / Nhập)
  preload/              Cầu nối an toàn (contextBridge): window.api; api.d.ts = hợp đồng IPC
  renderer/src/         Giao diện React
    main.tsx            Điểm vào
    app/                App.tsx (điều hướng màn hình, phiên chơi)
    features/           Mỗi màn / tính năng một folder: title/, starter/, saves/, party/
    shared/             Dùng chung giữa các feature: components/, lib/ (format, labels), game/ (gameData)
    styles/             main.css
scripts/
  simulate/             Script mô phỏng cân bằng (npm run simulate), chỉ dùng '@core' / '@data'
  data-import/          Script và báo cáo của các đợt nhập dữ liệu
```

## Chi tiết quy ước cấu trúc

- Folder `battle/` chỉ xuất API public (`battleActions`, `damage`, `capture`); các file `draft`, `turn`, `outcome`, `executeSkill`, `multiHit`, `battleItems` là chi tiết nội bộ.
- **Chiều phụ thuộc trong core (hướng dẫn):** `shared → model → inventory → registries / gameData → shop → monster → tamer / quests → battle / world / progression / roster → events → game`. Ngoại lệ đã biết: `registries/itemEffects` gọi `progression` (đá tiến hóa) và `gameData` gọi `validateParams` của registries, nên chiều trong core không ép bằng lint; ranh giới ngoài thì có.
- `src/core` và `src/data` được include trong cả `tsconfig.node.json` và `tsconfig.web.json` (main và renderer dùng chung).
- **Alias** `@core`, `@data` khai báo ở 3 nơi phải khớp nhau: `paths` trong `tsconfig.node.json` / `tsconfig.web.json`, `resolve.alias` trong `electron.vite.config.ts` (main, preload, renderer), `resolve.alias` trong `vitest.config.mts`.

## ESLint tự chặn

`eslint.config.mjs`, lint lỗi là chưa xong:

- Code core (không phải test): cấm import `react`, `electron`, `node:*`, `fs`, `path`, `os`, `@electron-toolkit/*`, `@data`, `@core`; cấm `Math.random`, `Date.now`, `new Date()` (quy tắc 1, 2 của `CLAUDE.md`).
- Main / preload / renderer / data / `scripts/simulate`: cấm đường dẫn tương đối vào core và cấm import sâu `@core/<folder>`; `@core/testing` chỉ được dùng trong `*.test.ts`.
- **Quy tắc code sạch** (mọi file `.ts` / `.tsx`, **kể cả test**): `no-explicit-any`, `no-non-null-assertion` (test dùng `defined(value, what)` từ `@core/testing` thay cho `!`), `no-unused-vars` (biến cố ý bỏ qua đặt tên bắt đầu bằng `_`), `no-console` (ngoại lệ có `eslint-disable-next-line` kèm lý do: 2 dòng dev ở `main/index.ts`, lỗi nạp preload). `switch-exhaustiveness-check` chạy lint có thông tin kiểu (`parserOptions.project` = `tsconfig.node.json` + `tsconfig.web.json`) cho `src/**` và `scripts/simulate/**`; nhánh `default` dùng `assertNever` (`shared/`), riêng `gameReducer` gán `never` rồi ném `ActionError` vì action từ renderer có thể sai lúc chạy.
- **`decimal.js` chỉ được import ở `src/core/shared/big.ts`** (`@typescript-eslint/no-restricted-imports` cho mọi file khác, kể cả renderer và test; dùng rule của typescript-eslint để không đè các luật `no-restricted-imports` ranh giới). Nơi khác dùng `Decimal` và các hàm tiện ích qua `../shared` (trong core) hoặc `@core` (ngoài core), để toàn project chỉ có một điểm phụ thuộc vào thư viện.
- Plugin React hooks: **không đặt tên hàm thường bắt đầu bằng `use`** (bị hiểu là hook). Ví dụ hàm dùng vật phẩm tên `applyItem`, còn action vẫn là `useItem`.

## Chạy app và kiểm tra dữ liệu lúc khởi động

- Chạy app: `npm run dev`. Terminal của VS Code / Claude Code có thể đặt sẵn `ELECTRON_RUN_AS_NODE=1`, khiến Electron chạy như Node thuần và báo `Cannot read properties of undefined (reading 'isPackaged')`. Bỏ biến này trước khi chạy (bash: `unset ELECTRON_RUN_AS_NODE`; PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`).
- `src/main/index.ts` gọi `tryCreateGameData(rawGameData)` trước khi mở cửa sổ. Lỗi thì hiện hộp thoại lỗi của hệ điều hành (`dialog.showErrorBox`, tối đa 20 dòng lỗi, phần thừa ghi "... và X lỗi khác") rồi **thoát app**, không bao giờ chạy game với dữ liệu hỏng. Hợp lệ thì ở dev mode in một dòng tóm tắt ra console.
- Tên game **"My creature collector game"**: hằng `GAME_TITLE` trong `renderer/src/shared/lib/labels.ts` cho màn tiêu đề; tiêu đề cửa sổ trong `src/renderer/index.html` phải khớp.
