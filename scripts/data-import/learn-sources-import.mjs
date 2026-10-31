/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nguồn học skill của Pokémon ngoài level-up và các chiêu trước đây bị bỏ vì nguồn học (dữ liệu ở
// docs/rules/content-mechanics.md mục "Dữ liệu nguồn học skill"; luật ở docs/rules/skill-books.md và
// docs/rules/breeding-eggs.md):
// - bookSkillIds của loài Pokémon = chiêu TM / TR / Move Tutor (PokeAPI method machine / tutor),
//   eggSkillIds = chiêu trứng (method egg), thế hệ mới nhất có dữ liệu của loài như learnset level;
// - nhập lại các chiêu bị bỏ lúc nhập Pokémon vì chỉ giữ chiêu có learnset level-up thế hệ mới nhất
//   (Happy Hour, Dragon Cheer, chiêu thế hệ cũ như Return / Signal Beam, chiêu mới của DLC...) và các
//   chiêu từ nay làm được (lú lẫn kiểu Pokémon, hồi máu 50%);
// - hiệu ứng chùn bước / lú lẫn của mọi chiêu Pokémon đã có (move_meta của PokeAPI), Fake Out /
//   First Impression chỉ dùng được ở lượt đầu.
// Skill game khớp move nguồn cùng tên, cùng hệ, cùng loại (như crit-accuracy-import.mjs). Chạy lại
// được (xóa phần do script quản lý rồi ghi lại). Chạy:
//   node scripts/data-import/learn-sources-import.mjs
// rồi node scripts/data-import/zmove-import.mjs (Z-Power của chiêu mới), evolution-conditions-import
// (Dipplin → Hydrapple biết Dragon Cheer) và npx prettier --write src/data

import fs from 'node:fs'
import path from 'node:path'
import { fetchPokeApiCsv, isPokemonSpecies, pokemonMatcher } from './pokeapi.mjs'
import { camelId, fetchShowdown } from './showdown.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const dataDir = path.join(root, 'src/data')
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const write = (file, value) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + '\n')

const kebab = (id) => id.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase()

/** pokemon_move_methods của PokeAPI. */
const METHOD = { levelUp: '1', egg: '2', tutor: '3', machine: '4' }
/** move_meta_ailments của PokeAPI → trạng thái của game (đông lạnh, mê đắm... chưa có). */
const AILMENTS = { 1: 'paralysis', 2: 'sleep', 4: 'burn', 5: 'poison', 6: 'confusion' }
/** stat_id của PokeAPI → chỉ số có bậc trận. */
const STATS = {
  2: 'attack',
  3: 'defense',
  4: 'spAttack',
  5: 'spDefense',
  6: 'speed',
  7: 'accuracy',
  8: 'evasion'
}
/** move_targets của PokeAPI nhắm phe mình (đổi bậc lên `self`). */
const SELF_TARGETS = ['user', 'users-field', 'user-and-allies', 'entire-field', 'user-or-ally']
/** Trạng thái do script này quản lý trên chiêu Pokémon đã có (trạng thái khác nhập từ trước). */
const MANAGED_STATUSES = ['flinch', 'confusion']
/** Chiêu chỉ dùng được ở lượt đầu trên sân (Pokémon: thất bại nếu không phải lượt đầu). */
const FIRST_TURN_ONLY = ['fakeOut', 'firstImpression']

// ---------- chiêu nhập lại ----------

const statusChance = (statusId, chance) => ({ type: 'applyStatus', params: { statusId, chance } })

/**
 * Chiêu nhập theo số Showdown (id Showdown → tên tiếng Việt, ghi đè). Quy đổi như lúc nhập Pokémon
 * (content-sources.md): chiêu nạp / nghỉ lượt power × 0,6 làm tròn 5, chiêu tự gục × 0,5 và không gục,
 * power biến đổi (0) lấy 60. Cơ chế riêng thêm sau ở pokemon-move-mechanics.mjs.
 */
const NEW_MOVES = {
  alluringvoice: { vi: 'Giọng mê hoặc', skipAilments: true },
  barrage: { vi: 'Ném bom liên hoàn' },
  barrier: { vi: 'Rào chắn tâm linh' },
  behemothbash: { vi: 'Khiên cự thú', learners: ['zamazentaCrowned'] },
  behemothblade: { vi: 'Kiếm cự thú', learners: ['zacianCrowned'] },
  blastburn: { vi: 'Đại hỏa bộc phá' },
  boneclub: { vi: 'Gậy xương' },
  burningjealousy: { vi: 'Lửa đố kỵ', skipAilments: true },
  chillingwater: { vi: 'Nước lạnh buốt' },
  chipaway: { vi: 'Mài mòn' },
  coaching: { vi: 'Huấn luyện', target: 'ally' },
  constrict: { vi: 'Quấn siết' },
  eggbomb: { vi: 'Bom trứng' },
  eternabeam: { vi: 'Tia vĩnh hằng' },
  firepledge: { vi: 'Lời thề lửa' },
  frenzyplant: { vi: 'Cây cuồng nộ' },
  grasspledge: { vi: 'Lời thề cỏ' },
  grassyglide: { vi: 'Lướt cỏ' },
  hardpress: { vi: 'Ép mạnh' },
  heartstamp: { vi: 'Dấu ấn trái tim' },
  hydrocannon: { vi: 'Đại pháo nước' },
  jumpkick: { vi: 'Đá nhảy' },
  lashout: { vi: 'Trút giận' },
  magnetbomb: { vi: 'Bom từ tính' },
  magnitude: { vi: 'Địa chấn ngẫu nhiên' },
  meditate: { vi: 'Tĩnh tọa' },
  // Pokémon: +1 công đặc biệt ở lượt nạp (PokeAPI không ghi).
  meteorbeam: {
    vi: 'Tia thiên thạch',
    extraEffects: [{ type: 'statStage', params: { who: 'self', stat: 'spAttack', delta: 1 } }]
  },
  mistyexplosion: {
    vi: 'Nổ sương',
    extra: {
      fieldModifiers: [
        { fieldId: 'mistyTerrain', powerMultiplier: 1.5, requiresGroundedUser: true }
      ]
    }
  },
  needlearm: { vi: 'Tay gai' },
  poltergeist: { vi: 'Yêu tinh quấy phá' },
  pounce: { vi: 'Vồ mồi' },
  psychicnoise: { vi: 'Tạp âm tâm linh', skipAilments: true },
  psywave: { vi: 'Sóng tâm linh' },
  punishment: { vi: 'Trừng trị' },
  razorwind: { vi: 'Gió dao' },
  return: { vi: 'Đền ơn' },
  rockclimb: { vi: 'Leo núi' },
  rollingkick: { vi: 'Đá xoáy' },
  scorchingsands: { vi: 'Cát nóng bỏng' },
  secretpower: { vi: 'Sức mạnh bí ẩn' },
  sharpen: { vi: 'Mài sắc' },
  signalbeam: { vi: 'Tia tín hiệu' },
  skydrop: { vi: 'Thả từ trời' },
  skyuppercut: { vi: 'Móc ngược lên trời' },
  smellingsalts: { vi: 'Muối ngửi' },
  spikecannon: { vi: 'Pháo gai' },
  steamroller: { vi: 'Xe lu' },
  supercellslam: { vi: 'Siêu bão sét' },
  temperflare: { vi: 'Lửa nóng giận' },
  trailblaze: { vi: 'Mở đường' },
  tripleaxel: { vi: 'Ba vòng xoay' },
  // Chùn bước 100% + priority 3 mà chưa có điều kiện "mục tiêu đang dùng chiêu priority" thì mỗi
  // lượt đều chặn được địch: bỏ chùn bước tới khi có điều kiện đó.
  upperhand: { vi: 'Ra tay trước', skipFlinch: true },
  waterpledge: { vi: 'Lời thề nước' },
  // Chiêu sự kiện của game gốc: không loài nào học, chỉ có sách ở chợ đen.
  happyhour: {
    vi: 'Giờ vui vẻ',
    effects: [{ type: 'setSideField', params: { side: 'own', fieldId: 'happyHour' } }]
  },
  celebrate: { vi: 'Ăn mừng' },
  holdhands: { vi: 'Nắm tay' },
  holdback: { vi: 'Nương tay' },
  powershift: { vi: 'Hoán đổi sức mạnh', skipAilments: true },
  // Chiêu Torque: gốc chỉ Starmobile của NPC dùng; ở đây là chiêu sự kiện (sách chợ đen).
  // PokeAPI chưa có move_meta của chiêu Torque: trạng thái theo Showdown.
  blazingtorque: { vi: 'Mô-men rực lửa', effects: [statusChance('burn', 30)] },
  combattorque: { vi: 'Mô-men chiến đấu', effects: [statusChance('paralysis', 30)] },
  noxioustorque: { vi: 'Mô-men độc hại', effects: [statusChance('poison', 30)] },
  magicaltorque: { vi: 'Mô-men ma thuật', effects: [statusChance('confusion', 30)] },
  wickedtorque: { vi: 'Mô-men gian ác', effects: [statusChance('sleep', 10)] },
  // Nihil Light (Legends Z-A, chiêu riêng của Zygarde).
  nihillight: {
    vi: 'Ánh sáng hư vô',
    learners: ['zygarde', 'zygarde10Percent'],
    skipAilments: true
  },
  // Dragon Cheer: đồng đội +1 bậc chí mạng, hệ Rồng +2 (chỉ học qua TM).
  dragoncheer: {
    vi: 'Long khí cổ vũ',
    target: 'ally',
    extra: {
      spell: {
        onTarget: [
          {
            do: 'focus',
            to: 'other',
            stages: 2,
            if: [{ if: 'element', who: 'other', elementIds: ['dragon'] }]
          },
          { do: 'focus', to: 'other', stages: 1 }
        ]
      }
    }
  },
  // Chiêu gây lú lẫn (trạng thái lú lẫn kiểu Pokémon).
  supersonic: { vi: 'Sóng siêu âm' },
  confuseray: { vi: 'Tia lú lẫn' },
  sweetkiss: { vi: 'Nụ hôn ngọt' },
  teeterdance: { vi: 'Điệu nhảy lảo đảo' },
  // Hồi 50% máu (như Recover). Moonlight / Morning Sun / Synthesis / Shore Up: phần đổi lượng hồi
  // theo thời tiết chưa có (giữ 50% như trời quang).
  milkdrink: { vi: 'Uống sữa', effects: [{ type: 'heal', params: { percent: 50 } }] },
  slackoff: { vi: 'Lười biếng', effects: [{ type: 'heal', params: { percent: 50 } }] },
  healorder: { vi: 'Lệnh hồi phục', effects: [{ type: 'heal', params: { percent: 50 } }] },
  moonlight: { vi: 'Ánh trăng hồi phục', effects: [{ type: 'heal', params: { percent: 50 } }] },
  morningsun: { vi: 'Nắng sớm', effects: [{ type: 'heal', params: { percent: 50 } }] },
  synthesis: { vi: 'Quang hợp', effects: [{ type: 'heal', params: { percent: 50 } }] },
  shoreup: { vi: 'Đắp cát', effects: [{ type: 'heal', params: { percent: 50 } }] },
  // Chiêu cần cơ chế riêng (pokemon-moves.md), nhập 2026-10-29; cơ chế ở pokemon-move-mechanics.mjs.
  acupressure: { vi: 'Bấm huyệt', skipAilments: true },
  afteryou: { vi: 'Nhường lượt', skipAilments: true },
  allyswitch: { vi: 'Đổi chỗ đồng đội', skipAilments: true },
  aquaring: { vi: 'Vòng nước', skipAilments: true },
  assist: { vi: 'Trợ giúp', skipAilments: true },
  attract: { vi: 'Mê hoặc tình ái', skipAilments: true },
  banefulbunker: { vi: 'Hầm độc', skipAilments: true },
  bellydrum: { vi: 'Trống bụng', skipAilments: true },
  bestow: { vi: 'Tặng quà', skipAilments: true },
  block: { vi: 'Chặn đường', skipAilments: true },
  burningbulwark: { vi: 'Lũy thành lửa', skipAilments: true },
  camouflage: { vi: 'Ngụy trang địa hình', skipAilments: true },
  comeuppance: { vi: 'Quả báo', skipAilments: true },
  conversion: { vi: 'Chuyển hóa', skipAilments: true },
  conversion2: { vi: 'Chuyển hóa 2', skipAilments: true },
  hiddenpower: { vi: 'Sức mạnh tiềm ẩn', skipAilments: true },
  bide: { vi: 'Nhẫn nhịn', skipAilments: true },
  // Chiêu Let's Go: chỉ dạng Partner học (battle-forms-import.mjs tạo dạng).
  zippyzap: { vi: 'Chớp nhoáng', learners: ['pikachuStarter'] },
  floatyfall: { vi: 'Lơ lửng rơi', learners: ['pikachuStarter'] },
  splishysplash: { vi: 'Té nước rì rào', learners: ['pikachuStarter'] },
  pikapapow: { vi: 'Pika bùm', learners: ['pikachuStarter'] },
  bouncybubble: { vi: 'Bong bóng nảy', learners: ['eeveeStarter'] },
  buzzybuzz: { vi: 'Rì rì điện', learners: ['eeveeStarter'] },
  sizzlyslide: { vi: 'Trượt xèo xèo', learners: ['eeveeStarter'] },
  glitzyglow: { vi: 'Lấp lánh rực rỡ', learners: ['eeveeStarter'] },
  baddybad: { vi: 'Xấu xa xấu xa', learners: ['eeveeStarter'] },
  sappyseed: { vi: 'Hạt nhựa', learners: ['eeveeStarter'] },
  freezyfrost: { vi: 'Sương giá buốt', learners: ['eeveeStarter'] },
  sparklyswirl: { vi: 'Xoáy lấp lánh', learners: ['eeveeStarter'] },
  veeveevolley: { vi: 'Vee bóng chuyền', learners: ['eeveeStarter'] },
  corrosivegas: { vi: 'Khí ăn mòn', skipAilments: true },
  copycat: { vi: 'Bắt chước', skipAilments: true },
  counter: { vi: 'Phản đòn', skipAilments: true },
  curse: { vi: 'Nguyền rủa', skipAilments: true },
  destinybond: { vi: 'Liên kết số mệnh', skipAilments: true },
  detect: { vi: 'Phát hiện', skipAilments: true },
  disable: { vi: 'Vô hiệu hóa', skipAilments: true },
  doodle: { vi: 'Vẽ nguệch ngoạc', skipAilments: true },
  dragonrage: { vi: 'Cơn thịnh nộ của rồng', skipAilments: true },
  electrify: { vi: 'Điện hóa', skipAilments: true },
  embargo: { vi: 'Cấm vận', skipAilments: true },
  encore: { vi: 'Diễn lại', skipAilments: true },
  endure: { vi: 'Chịu đựng', skipAilments: true },
  entrainment: { vi: 'Nhập điệu', skipAilments: true },
  fissure: { vi: 'Khe nứt', skipAilments: true },
  floralhealing: { vi: 'Hoa trị liệu', skipAilments: true },
  followme: { vi: 'Theo tôi', skipAilments: true },
  foresight: { vi: 'Nhìn thấu', skipAilments: true },
  forestscurse: { vi: 'Lời nguyền rừng', skipAilments: true },
  frustration: { vi: 'Bất mãn', skipAilments: true },
  gastroacid: { vi: 'Dịch vị', skipAilments: true },
  gearup: { vi: 'Lên dây cót', skipAilments: true },
  grasswhistle: { vi: 'Sáo cỏ', skipAilments: true },
  grudge: { vi: 'Hận thù', skipAilments: true },
  guardsplit: { vi: 'Chia phòng thủ', skipAilments: true },
  guardswap: { vi: 'Đổi phòng thủ', skipAilments: true },
  guillotine: { vi: 'Máy chém', skipAilments: true },
  healblock: { vi: 'Cấm hồi phục', skipAilments: true },
  healingwish: { vi: 'Điều ước chữa lành', skipAilments: true },
  healpulse: { vi: 'Sóng chữa lành', skipAilments: true },
  heartswap: { vi: 'Hoán đổi tâm hồn', skipAilments: true },
  helpinghand: { vi: 'Bàn tay giúp đỡ', skipAilments: true },
  horndrill: { vi: 'Sừng khoan', skipAilments: true },
  imprison: { vi: 'Giam cầm', skipAilments: true },
  ingrain: { vi: 'Bám rễ', skipAilments: true },
  instruct: { vi: 'Chỉ dẫn', skipAilments: true },
  kingsshield: { vi: 'Khiên vương giả', skipAilments: true },
  laserfocus: { vi: 'Tập trung laser', skipAilments: true },
  lockon: { vi: 'Khóa mục tiêu', skipAilments: true },
  lunardance: { vi: 'Vũ điệu ánh trăng', skipAilments: true },
  magiccoat: { vi: 'Áo choàng phép', skipAilments: true },
  magicpowder: { vi: 'Bột phép', skipAilments: true },
  magneticflux: { vi: 'Từ thông', skipAilments: true },
  magnetrise: { vi: 'Bay từ trường', skipAilments: true },
  meanlook: { vi: 'Ánh nhìn đe dọa', skipAilments: true },
  mefirst: { vi: 'Tôi trước', skipAilments: true },
  metalburst: { vi: 'Bùng nổ kim loại', skipAilments: true },
  metronome: { vi: 'Máy đếm nhịp', skipAilments: true },
  mimic: { vi: 'Nhại lại', skipAilments: true },
  mindreader: { vi: 'Đọc tâm trí', skipAilments: true },
  miracleeye: { vi: 'Mắt kỳ diệu', skipAilments: true },
  mirrorcoat: { vi: 'Áo gương', skipAilments: true },
  mirrormove: { vi: 'Chiêu gương', skipAilments: true },
  naturepower: { vi: 'Sức mạnh thiên nhiên', skipAilments: true },
  nightmare: { vi: 'Ác mộng', skipAilments: true },
  nightshade: { vi: 'Bóng đêm', skipAilments: true },
  obstruct: { vi: 'Cản trở', skipAilments: true },
  octolock: { vi: 'Khóa bạch tuộc', skipAilments: true },
  odorsleuth: { vi: 'Đánh hơi', skipAilments: true },
  painsplit: { vi: 'Chia sẻ đau đớn', skipAilments: true },
  powder: { vi: 'Bột nổ', skipAilments: true },
  powersplit: { vi: 'Chia sức mạnh', skipAilments: true },
  powerswap: { vi: 'Đổi sức mạnh', skipAilments: true },
  powertrick: { vi: 'Đảo sức mạnh', skipAilments: true },
  protect: { vi: 'Bảo vệ', skipAilments: true },
  psychoshift: { vi: 'Chuyển dời tâm linh', skipAilments: true },
  psychup: { vi: 'Tự kỷ ám thị', skipAilments: true },
  purify: { vi: 'Thanh tẩy', skipAilments: true },
  quash: { vi: 'Đè nén', skipAilments: true },
  ragepowder: { vi: 'Bột cuồng nộ', skipAilments: true },
  recycle: { vi: 'Tái chế', skipAilments: true },
  reflecttype: { vi: 'Phản chiếu hệ', skipAilments: true },
  refresh: { vi: 'Làm mới', skipAilments: true },
  rest: { vi: 'Nghỉ ngơi', skipAilments: true },
  revivalblessing: { vi: 'Phước lành hồi sinh', skipAilments: true },
  roleplay: { vi: 'Đóng vai', skipAilments: true },
  seismictoss: { vi: 'Quật địa chấn', skipAilments: true },
  sheercold: { vi: 'Băng giá tuyệt đối', skipAilments: true },
  silktrap: { vi: 'Bẫy tơ nhện', skipAilments: true },
  simplebeam: { vi: 'Tia đơn giản', skipAilments: true },
  sketch: { vi: 'Phác họa', skipAilments: true },
  skillswap: { vi: 'Hoán đổi kỹ năng', skipAilments: true },
  sleeptalk: { vi: 'Nói mớ', skipAilments: true },
  snatch: { vi: 'Cướp đoạt', skipAilments: true },
  soak: { vi: 'Ngâm nước', skipAilments: true },
  sonicboom: { vi: 'Sóng âm', skipAilments: true },
  speedswap: { vi: 'Đổi tốc độ', skipAilments: true },
  spiderweb: { vi: 'Lưới nhện', skipAilments: true },
  spikyshield: { vi: 'Khiên gai nhọn', skipAilments: true },
  spite: { vi: 'Thù vặt', skipAilments: true },
  spotlight: { vi: 'Đèn sân khấu', skipAilments: true },
  stockpile: { vi: 'Tích trữ', skipAilments: true },
  strengthsap: { vi: 'Hút sức mạnh', skipAilments: true },
  stuffcheeks: { vi: 'Phồng má', skipAilments: true },
  swallow: { vi: 'Nuốt', skipAilments: true },
  switcheroo: { vi: 'Tráo đồ', skipAilments: true },
  telekinesis: { vi: 'Niệm lực nhấc', skipAilments: true },
  topsyturvy: { vi: 'Đảo lộn', skipAilments: true },
  torment: { vi: 'Dày vò', skipAilments: true },
  transform: { vi: 'Biến hình', skipAilments: true },
  trick: { vi: 'Mánh khóe', skipAilments: true },
  trickortreat: { vi: 'Cho kẹo hay bị ghẹo', skipAilments: true },
  trumpcard: { vi: 'Lá bài tẩy', skipAilments: true },
  venomdrench: { vi: 'Ngâm độc', skipAilments: true },
  whirlwind: { vi: 'Gió xoáy', skipAilments: true },
  wish: { vi: 'Điều ước', skipAilments: true },
  worryseed: { vi: 'Hạt lo âu', skipAilments: true },
  yawn: { vi: 'Ngáp', skipAilments: true }
}

/** Mục tiêu Showdown → mục tiêu game (nhắm cả đồng đội lẫn địch lân cận thì allEnemies). */
const TARGETS = {
  normal: 'enemy',
  any: 'enemy',
  adjacentFoe: 'enemy',
  randomNormal: 'enemy',
  allAdjacentFoes: 'allEnemies',
  allAdjacent: 'allEnemies',
  foeSide: 'allEnemies',
  self: 'self',
  adjacentAlly: 'ally',
  adjacentAllyOrSelf: 'self',
  allies: 'allAllies',
  allySide: 'self',
  all: 'self'
}

/** Skill game của một move Showdown theo quy đổi lúc nhập Pokémon (chưa có hiệu ứng phụ). */
function baseSkill(sdId, move, def) {
  const id = sdId === 'return' ? 'return' : camelId(move.name)
  const category = move.category.toLowerCase()
  let power = move.basePower
  if (category !== 'status') {
    if (power === 0) power = 60
  }
  const hits = Array.isArray(move.multihit)
    ? { min: move.multihit[0], max: move.multihit[1] }
    : typeof move.multihit === 'number'
      ? { min: move.multihit, max: move.multihit }
      : undefined
  return {
    id,
    elementId: move.type.toLowerCase(),
    category,
    power,
    accuracy: move.accuracy === true ? 100 : move.accuracy,
    target: def.target ?? TARGETS[move.target] ?? 'enemy',
    ...(hits ? { hits } : {}),
    effects: [...(def.effects ?? [])],
    priority: move.priority,
    ...(move.critRatio > 1 ? { critStage: move.critRatio - 1 } : {}),
    ...(def.extra ?? {})
  }
}

// ---------- tải ----------

const [
  showdown,
  moves,
  meta,
  statChanges,
  targets,
  pokemonRows,
  versionGroups,
  types,
  pokemonMoves
] = await Promise.all([
  fetchShowdown('moves.js'),
  fetchPokeApiCsv('moves'),
  fetchPokeApiCsv('move_meta'),
  fetchPokeApiCsv('move_meta_stat_changes'),
  fetchPokeApiCsv('move_targets'),
  fetchPokeApiCsv('pokemon'),
  fetchPokeApiCsv('version_groups'),
  fetchPokeApiCsv('types'),
  fetchPokeApiCsv('pokemon_moves')
])
const damageClasses = { 1: 'status', 2: 'physical', 3: 'special' }
const typeName = Object.fromEntries(types.map((t) => [t.id, t.identifier]))
const targetName = Object.fromEntries(targets.map((t) => [t.id, t.identifier]))
const metaOf = new Map(meta.map((m) => [m.move_id, m]))
const changesOf = new Map()
for (const row of statChanges) {
  if (!changesOf.has(row.move_id)) changesOf.set(row.move_id, [])
  changesOf.get(row.move_id).push(row)
}
const moveByKebab = new Map(moves.map((m) => [m.identifier, m]))
const vgOrder = Object.fromEntries(versionGroups.map((vg) => [vg.id, Number(vg.order)]))

/** Move PokeAPI cùng tên, cùng hệ, cùng loại với skill game; không có = null. */
function pokeApiMove(skill) {
  const move = moveByKebab.get(kebab(skill.id))
  if (!move) return null
  const sameType = typeName[move.type_id] === skill.elementId
  return sameType && damageClasses[move.damage_class_id] === skill.category ? move : null
}

const chanceParams = (chance) => (chance > 0 && chance < 100 ? { chance } : {})

/** Chùn bước / trạng thái của move PokeAPI (chỉ các id trong `statusIds`). */
function statusEffects(move, statusIds) {
  const moveMeta = metaOf.get(move.id)
  if (!moveMeta) return []
  const effects = []
  const ailment = AILMENTS[moveMeta.meta_ailment_id]
  if (ailment && statusIds.includes(ailment)) {
    const chance = Number(moveMeta.ailment_chance)
    effects.push({ type: 'applyStatus', params: { statusId: ailment, ...chanceParams(chance) } })
  }
  const flinch = Number(moveMeta.flinch_chance)
  if (flinch > 0 && statusIds.includes('flinch')) {
    effects.push({ type: 'applyStatus', params: { statusId: 'flinch', ...chanceParams(flinch) } })
  }
  return effects
}

/** Đổi bậc của move PokeAPI (như crit-accuracy-import.mjs); skill nhắm đồng đội thì đổi bậc mục tiêu. */
function stageEffects(move, skill) {
  const toAllies = ['ally', 'allAllies'].includes(skill.target)
  const moveMeta = metaOf.get(move.id)
  const chance = Number(moveMeta?.stat_chance ?? 0)
  const damaging = move.damage_class_id !== '1'
  const rows = changesOf.get(move.id) ?? []
  return rows
    .filter((row) => STATS[row.stat_id])
    .map((row) => {
      const delta = Number(row.change)
      // Đòn gây sát thương: tăng bậc là của quái dùng, giảm bậc là của mục tiêu (Trailblaze /
      // Chilling Water); chiêu trạng thái theo mục tiêu của move.
      const self =
        !toAllies && (damaging ? delta > 0 : SELF_TARGETS.includes(targetName[move.target_id]))
      return {
        type: 'statStage',
        params: {
          who: self ? 'self' : 'target',
          stat: STATS[row.stat_id],
          delta,
          ...chanceParams(chance)
        }
      }
    })
}

// ---------- skill ----------

const report = {
  newMoves: [],
  missingSource: [],
  learnsets: {},
  noLevelLearners: [],
  statusEffects: {},
  firstTurnOnly: [],
  bookSkillIds: { species: 0, entries: 0 },
  eggSkillIds: { species: 0, entries: 0 }
}
const built = []
for (const [sdId, def] of Object.entries(NEW_MOVES)) {
  const move = showdown[sdId]
  if (!move) {
    report.missingSource.push(sdId)
    continue
  }
  const skill = baseSkill(sdId, move, def)
  const source = pokeApiMove(skill)
  if (source && !def.effects) {
    const statusIds = [
      ...(def.skipAilments ? [] : ['paralysis', 'sleep', 'burn', 'poison', 'confusion']),
      ...(def.skipFlinch ? [] : ['flinch'])
    ]
    skill.effects.push(...stageEffects(source, skill), ...statusEffects(source, statusIds))
  }
  if (def.extraEffects) skill.effects.push(...def.extraEffects)
  built.push({ skill, en: move.name, vi: def.vi, def, source })
}
// Chiêu đã có trong skills.json giữ nguyên (các script khác đã thêm Z-Power, thế, cơ chế...): chỉ
// thêm chiêu chưa có.
const existingIds = new Set(read('skills.json').map((skill) => skill.id))
const freshBuilt = built.filter((b) => !existingIds.has(b.skill.id))
built.length = 0
built.push(...freshBuilt)
const newIds = new Set(built.map((b) => b.skill.id))
const skills = read('skills.json')

// Chùn bước / lú lẫn của chiêu Pokémon đã có (trạng thái khác nhập từ trước, giữ nguyên).
for (const skill of skills) {
  if (skill.maxMove || skill.zMove) continue
  const source = pokeApiMove(skill)
  if (!source) continue
  skill.effects = skill.effects.filter(
    (e) => !(e.type === 'applyStatus' && MANAGED_STATUSES.includes(e.params.statusId))
  )
  const added = statusEffects(source, MANAGED_STATUSES)
  skill.effects.push(...added)
  for (const effect of added) {
    const key = effect.params.statusId
    report.statusEffects[key] = (report.statusEffects[key] ?? 0) + 1
  }
  if (FIRST_TURN_ONLY.includes(skill.id)) {
    skill.firstTurnOnly = true
    report.firstTurnOnly.push(skill.id)
  }
}
const allSkills = [...skills, ...built.map((b) => b.skill)]
const comboIds = new Set(read('comboSkills.json').map((combo) => combo.id))
const bookable = new Set(
  allSkills.filter((s) => !s.maxMove && !s.zMove && !comboIds.has(s.id)).map((s) => s.id)
)
/** move_id PokeAPI → skill game (skill có sách). */
const skillOfMove = new Map()
for (const skill of allSkills) {
  if (!bookable.has(skill.id)) continue
  const move = pokeApiMove(skill)
  if (move) skillOfMove.set(move.id, skill.id)
}

// ---------- learnset theo cách học ----------

/** Dòng pokemon_moves theo pokemon_id, chỉ các cách học trong `methods`. */
function rowsByPokemon(methods) {
  const result = new Map()
  for (const row of pokemonMoves) {
    if (!methods.includes(row.pokemon_move_method_id) || !skillOfMove.has(row.move_id)) continue
    if (!result.has(row.pokemon_id)) result.set(row.pokemon_id, [])
    result.get(row.pokemon_id).push(row)
  }
  return result
}
const latestOf = (rows) =>
  rows.reduce((best, row) => Math.max(best, vgOrder[row.version_group_id]), -1)

const match = pokemonMatcher(pokemonRows)
const species = read('species.json')
const pokemonSpecies = species.filter(isPokemonSpecies)

/**
 * Skill học được theo cách học của từng loài Pokémon: thế hệ mới nhất có dữ liệu cách học đó của
 * loài (dạng không có dữ liệu riêng lấy của dạng gốc); skill không loài nào còn học ở thế hệ đó thì
 * lấy thế hệ gần nhất mà loài còn học (như learnset level ở các đợt trước). Trả về Map id loài →
 * Map skill → level thấp nhất.
 */
function learnedBy(methods, onlySkillIds) {
  const byPokemon = rowsByPokemon(methods)
  const rowsOf = (entry) => {
    const own = byPokemon.get(match(entry.id)?.id ?? '')
    if (own?.length) return own
    const base = entry.formOf ? match(entry.formOf) : null
    return base ? (byPokemon.get(base.id) ?? []) : []
  }
  const plans = []
  const inLatest = new Set()
  for (const entry of pokemonSpecies) {
    // Thế hệ mới nhất tính trên mọi skill của cách học, rồi mới lọc skill cần.
    const all = rowsOf(entry)
    const latest = latestOf(all)
    const rows = all.filter(
      (row) => !onlySkillIds || onlySkillIds.has(skillOfMove.get(row.move_id))
    )
    const bySkill = new Map()
    for (const row of rows) {
      const skillId = skillOfMove.get(row.move_id)
      if (!bySkill.has(skillId)) bySkill.set(skillId, [])
      bySkill.get(skillId).push(row)
    }
    for (const [skillId, learned] of bySkill) {
      const latestRows = learned.filter((row) => vgOrder[row.version_group_id] === latest)
      if (latestRows.length > 0) inLatest.add(skillId)
      const fallbackVg = latestOf(learned)
      const fallback = learned.filter((row) => vgOrder[row.version_group_id] === fallbackVg)
      plans.push({ entry, skillId, latestRows, fallback })
    }
  }
  const result = new Map()
  for (const { entry, skillId, latestRows, fallback } of plans) {
    const rows = inLatest.has(skillId) ? latestRows : fallback
    if (rows.length === 0) continue
    if (!result.has(entry.id)) result.set(entry.id, new Map())
    const level = Math.max(1, Math.min(...rows.map((row) => Number(row.level))))
    result.get(entry.id).set(skillId, level)
  }
  return result
}

// Level-up của chiêu mới; chiêu chỉ có ở dạng đặc biệt (Behemoth: dạng Crowned) học ở level 1.
const levelUp = learnedBy([METHOD.levelUp], newIds)
for (const entry of species) {
  if (entry.learnset) entry.learnset = entry.learnset.filter((e) => !newIds.has(e.skillId))
}
const byId = new Map(species.map((entry) => [entry.id, entry]))
for (const [speciesId, learned] of levelUp) {
  const entry = byId.get(speciesId)
  for (const [skillId, level] of learned) {
    entry.learnset.push({ level, skillId })
    report.learnsets[skillId] = (report.learnsets[skillId] ?? 0) + 1
  }
  entry.learnset.sort((a, b) => a.level - b.level)
}
for (const { skill, def } of built) {
  for (const speciesId of def.learners ?? []) {
    const entry = byId.get(speciesId)
    if (!entry || entry.learnset.some((e) => e.skillId === skill.id)) continue
    entry.learnset.unshift({ level: 1, skillId: skill.id })
    report.learnsets[skill.id] = (report.learnsets[skill.id] ?? 0) + 1
  }
}
report.noLevelLearners = built.map((b) => b.skill.id).filter((id) => !report.learnsets[id])

// Sách (TM / TR / tutor): bỏ skill đã có trong learnset của chính loài. Chiêu tutor Legends: Arceus
// (la-moves-import.mjs: Draco Meteor / Steel Beam / Volt Tackle) giữ nguyên.
const LA_TUTOR = ['dracoMeteor', 'steelBeam', 'voltTackle']
const books = learnedBy([METHOD.machine, METHOD.tutor])
for (const entry of pokemonSpecies) {
  const own = new Set(entry.learnset.map((e) => e.skillId))
  const kept = (entry.bookSkillIds ?? []).filter((id) => LA_TUTOR.includes(id))
  const ids = [...new Set([...kept, ...(books.get(entry.id)?.keys() ?? [])])]
    .filter((id) => !own.has(id))
    .sort()
  if (ids.length > 0) entry.bookSkillIds = ids
  else delete entry.bookSkillIds
  if (ids.length > 0) report.bookSkillIds.species++
  report.bookSkillIds.entries += ids.length
}

// Chiêu trứng: chỉ dạng đầu của chuỗi (con breeding luôn ở dạng đầu, trừ mẹ fuse).
const evolvedIds = new Set(
  species.flatMap((entry) => (entry.evolutions ?? []).map((e) => e.speciesId))
)
const eggs = learnedBy([METHOD.egg])
for (const entry of pokemonSpecies) {
  const ids = evolvedIds.has(entry.id) ? [] : [...(eggs.get(entry.id)?.keys() ?? [])].sort()
  if (ids.length > 0) entry.eggSkillIds = ids
  else delete entry.eggSkillIds
  if (ids.length > 0) report.eggSkillIds.species++
  report.eggSkillIds.entries += ids.length
}
write('species.json', species)

// Chiêu mới chưa có nguồn học nào (level / sách) chỉ giữ khi là chiêu sự kiện (chợ đen).
const EVENT_ONLY = [
  'happyHour',
  'celebrate',
  'conversion2',
  'holdHands',
  'holdBack',
  'powerShift',
  'blazingTorque',
  'combatTorque',
  'noxiousTorque',
  'magicalTorque',
  'wickedTorque'
]
const learnable = new Set(
  species.flatMap((entry) => [
    ...(entry.learnset ?? []).map((e) => e.skillId),
    ...(entry.bookSkillIds ?? [])
  ])
)
const kept = built.filter((b) => learnable.has(b.skill.id) || EVENT_ONLY.includes(b.skill.id))
report.newMoves = kept.map((b) => b.skill.id)
report.dropped = built.filter((b) => !kept.includes(b)).map((b) => b.skill.id)
write('skills.json', [...skills, ...kept.map((b) => b.skill)])
for (const language of ['en', 'vi']) {
  const texts = read(`i18n/${language}/skills.json`)
  for (const { skill, en, vi } of built) {
    if (report.newMoves.includes(skill.id)) texts[skill.id] = language === 'en' ? en : vi
    else delete texts[skill.id]
  }
  write(`i18n/${language}/skills.json`, texts)
}

fs.writeFileSync(
  path.join(root, 'scripts/data-import/learn-sources-report.json'),
  JSON.stringify(report, null, 2) + '\n'
)
console.log(
  `chiêu mới ${report.newMoves.length} (bỏ ${report.dropped.length}), ` +
    `sách ${report.bookSkillIds.entries} mục / ${report.bookSkillIds.species} loài, ` +
    `trứng ${report.eggSkillIds.entries} mục / ${report.eggSkillIds.species} loài, ` +
    `trạng thái ${JSON.stringify(report.statusEffects)}`
)
