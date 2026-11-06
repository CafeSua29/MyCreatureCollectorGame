// Isle Of Pochimoon: 20 dạng fuse từ thành tựu Steam ("Fuse and get X", app 2126200) và 8 dạng gốc. Tên hiển
// thị của dạng gốc nằm trong bảng bị nén Oodle của game nên chưa đọc được: đặt tên theo con vật của model
// trong game (Models/Pochimoon/Basic: Gorilla, Cow, Alpaca, Kangaroo, Fox, Puma, Dog, Bear), gọi là "X
// Pochimoon". Âm đầu tên fuse khớp cặp con vật (Goco = Gorilla + Cow, Foi = Fox + Inu) nên suy được race
// và bậc. Hệ game không có. Chạy: node scripts/data-import/pochimoon-fetch.mjs [trang-achievements.html]
// (cần mạng), rồi species-batch-import.mjs sources/pochimoon.json. Luật ở content-sources-real.md mục "Isle Of Pochimoon".

import { writeSource } from './sourceHelpers.mjs'
import { loadSteamAchievements } from './smallSources.mjs'

const APP_ID = 2126200
/** 12 dạng fuse đầu ghép 2 con, còn lại ghép 3 con (nhóm thành tựu và ảnh 12 / 123 của game). */
const TWO_PARENT_COUNT = 12
const BASES = {
  Gorilla: 'primate',
  Cow: 'buffalo',
  Alpaca: 'buffalo',
  Kangaroo: 'marsupial',
  Fox: 'canid',
  Puma: 'felid',
  Dog: 'canid',
  Bear: 'ursid'
}
/** Âm đầu của tên fuse → con vật đứng đầu (quyết định race). */
const FIRST_PARENT = {
  Go: 'Gorilla',
  Co: 'Cow',
  Ca: 'Alpaca',
  Fo: 'Fox',
  Fu: 'Fox',
  Pu: 'Puma',
  Nu: 'Dog',
  Ma: 'Puma'
}

const achievements = await loadSteamAchievements(APP_ID, process.argv[2])
const names = achievements.flatMap((a) => /^Fuse and get (.+)$/.exec(a.text)?.[1] ?? [])
if (names.length !== 20) throw new Error(`Có 20 dạng fuse, đọc được ${names.length}`)
const species = [
  ...Object.entries(BASES).map(([animal, raceId]) => ({
    name: `${animal} Pochimoon`,
    elements: [],
    raceId,
    tier: 'small',
    category: 'Basic Pochimoon'
  })),
  ...names.map((name, index) => {
    const parent = FIRST_PARENT[name.slice(0, 2)]
    if (!parent) throw new Error(`Chưa biết con vật đầu của ${name} (thêm vào FIRST_PARENT)`)
    return {
      name,
      elements: [],
      raceId: BASES[parent],
      tier: index < TWO_PARENT_COUNT ? 'medium' : 'peak',
      category: 'Fused Pochimoon'
    }
  })
]
// Lần nhập đầu chưa có race: cập nhật theo con vật.
writeSource('pochimoon', {
  source: 'pochimoon',
  origin: 'fantasy',
  update: { race: true },
  species
})
