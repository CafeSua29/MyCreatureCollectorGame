// Bảng race chi tiết cho races-split.mjs (mục "Race" ở docs/rules/stats-traits.md): mỗi race thuộc
// một nhóm (raceGroups.json), cân nặng điển hình, lệch chỉ số so với nhóm, trait riêng (loại `race`).
// Dòng trait: [id, tên vi, tên en, loại hook, params]. Race cũ giữ id (orc, elf, dwarf, halfling,
// giant, buffalo) dùng lại trait cũ (traitIds) và có thể thêm trait mới.

import {
  S,
  S2,
  dodge,
  crit,
  critDmg,
  acc,
  tough,
  fullHp,
  regen,
  resist,
  boostEl,
  ally,
  first,
  low,
  high,
  weather,
  onAtk,
  onHit,
  spikes,
  leech,
  heals,
  immune,
  noLower,
  intimidate,
  survive,
  exp
} from './races-hooks.mjs'

/** [id, nhóm, tên vi, tên en, kg, lệch chỉ số (nhân vào lệch của nhóm), trait mới, trait cũ giữ lại]. */
export const RACES = [
  // ---------- Thú tộc ----------
  [
    'felid',
    'beast',
    'Miêu tộc',
    'Felids',
    50,
    { speed: 1.1, attack: 1.15, defense: 0.9, hp: 0.9, spAttack: 0.9 },
    [
      ['catReflexes', 'Phản xạ mèo', 'Cat Reflexes', dodge(8)],
      ['pounce', 'Vồ mồi', 'Pounce', first(2, { attack: 15 })]
    ]
  ],
  [
    'canid',
    'beast',
    'Khuyển tộc',
    'Canines',
    30,
    { attack: 1.1, speed: 1.05, hp: 1.05, spAttack: 0.9, spDefense: 0.95 },
    [
      ['packHunter', 'Săn theo bầy', 'Pack Hunter', ally({ attack: 10 })],
      ['keenNose', 'Thính mũi', 'Keen Nose', acc(10)]
    ]
  ],
  [
    'ursid',
    'beast',
    'Hùng tộc',
    'Bears',
    250,
    { hp: 1.25, attack: 1.2, defense: 1.1, speed: 0.7, spAttack: 0.85 },
    [
      ['bearHide', 'Da gấu dày', 'Thick Fur', tough(6)],
      ['hibernation', 'Ngủ đông', 'Hibernation', regen(3)]
    ]
  ],
  [
    'mustelid',
    'beast',
    'Chồn tộc',
    'Mustelids',
    5,
    { speed: 1.1, attack: 1.1, hp: 0.85, defense: 0.85 },
    [
      ['slinky', 'Lủi nhanh', 'Slinky', dodge(8)],
      ['ferocious', 'Hung tợn', 'Ferocious', crit(50)]
    ]
  ],
  [
    'rodent',
    'beast',
    'Thử tộc',
    'Rodents',
    1,
    { speed: 1.15, spDefense: 1.05, hp: 0.8, defense: 0.85, attack: 0.95 },
    [
      ['gnawingTeeth', 'Răng gặm', 'Gnawing Teeth', S2('attack', 'speed', 5)],
      ['scurry', 'Chạy lủi', 'Scurry', dodge(6)]
    ]
  ],
  [
    'lagomorph',
    'beast',
    'Thố tộc',
    'Rabbits',
    3,
    { speed: 1.2, spDefense: 1.1, hp: 0.85, attack: 0.85, defense: 0.9 },
    [
      ['bunnyHop', 'Nhảy thỏ', 'Bunny Hop', S('speed', 10)],
      ['wary', 'Cảnh giác', 'Wary', fullHp(20)]
    ]
  ],
  [
    'primate',
    'beast',
    'Hầu tộc',
    'Primates',
    40,
    { spAttack: 1.3, attack: 1.05, speed: 0.95, defense: 0.9 },
    [
      ['nimbleHands', 'Tay khéo', 'Nimble Hands', acc(10)],
      ['troopBond', 'Đoàn kết bầy', 'Troop Bond', ally({ defense: 8, spDefense: 8 })]
    ]
  ],
  [
    'equid',
    'beast',
    'Mã tộc',
    'Equines',
    400,
    { speed: 1.1, hp: 1.1, defense: 0.95, spAttack: 0.8 },
    [
      ['gallop', 'Phi nước đại', 'Gallop', S('speed', 10)],
      ['stamina', 'Bền sức', 'Stamina', S('hp', 8)]
    ]
  ],
  [
    'buffalo',
    'beast',
    'Ngưu tộc',
    'Bovines',
    600,
    { hp: 1.3, defense: 1.35, attack: 1.05, spDefense: 1.05, speed: 0.6, spAttack: 0.8 },
    [['stampede', 'Húc lao', 'Stampede', first(1, { attack: 20 })]],
    ['buffaloStrength', 'buffaloHide']
  ],
  [
    'cervid',
    'beast',
    'Lộc tộc',
    'Deer',
    150,
    { speed: 1.1, spDefense: 1.15, defense: 0.9, attack: 0.95 },
    [
      ['antlerCharge', 'Gạc húc', 'Antler Charge', S('attack', 8)],
      ['alertEars', 'Tai thính', 'Alert Ears', dodge(6)]
    ]
  ],
  [
    'suid',
    'beast',
    'Trư tộc',
    'Swine',
    100,
    { hp: 1.2, defense: 1.15, speed: 0.75, spAttack: 0.9 },
    [
      ['tusks', 'Răng nanh', 'Tusks', S('attack', 8)],
      ['thickSkin', 'Da dày', 'Thick Skin', tough(5)]
    ]
  ],
  [
    'proboscid',
    'beast',
    'Tượng tộc',
    'Elephants',
    4000,
    { hp: 1.4, attack: 1.2, defense: 1.15, spDefense: 1.05, speed: 0.55, spAttack: 0.95 },
    [
      ['mightyTrunk', 'Vòi khỏe', 'Mighty Trunk', S('attack', 8)],
      ['elephantMemory', 'Trí nhớ voi', 'Elephant Memory', noLower('attack', 'defense')]
    ]
  ],
  [
    'pachyderm',
    'beast',
    'Tê giác & hà mã',
    'Pachyderms',
    2000,
    { hp: 1.25, defense: 1.4, attack: 1.1, speed: 0.55, spAttack: 0.8 },
    [
      ['armoredHide', 'Da giáp', 'Armored Hide', S('defense', 10)],
      ['rampage', 'Lồng lên', 'Rampage', low(50, { attack: 15 })]
    ]
  ],
  [
    'chiropteran',
    'beast',
    'Dực thú (dơi)',
    'Bats',
    1,
    { speed: 1.1, spAttack: 1.15, spDefense: 1.05, hp: 0.8, defense: 0.8 },
    [
      ['echolocation', 'Định vị âm', 'Echolocation', acc(15)],
      ['nightWing', 'Cánh đêm', 'Night Wing', dodge(8)]
    ]
  ],
  [
    'marsupial',
    'beast',
    'Thú có túi',
    'Marsupials',
    30,
    { hp: 1.05, speed: 1.05, spDefense: 1.05, attack: 0.95, defense: 0.95 },
    [
      ['pouch', 'Túi ấp', 'Pouch', heals(20)],
      ['hopKick', 'Đá nhảy', 'Hop Kick', S('attack', 6)]
    ]
  ],
  [
    'xenarthran',
    'beast',
    'Thú ăn kiến & lười',
    'Xenarthrans',
    30,
    { defense: 1.35, hp: 1.1, speed: 0.6, attack: 0.95 },
    [
      ['armoredBand', 'Vỏ đai', 'Armored Band', tough(6)],
      ['slowMetabolism', 'Trao đổi chất chậm', 'Slow Metabolism', regen(2)]
    ]
  ],
  [
    'insectivore',
    'beast',
    'Nhím & chuột chũi',
    'Insectivores',
    1,
    { defense: 1.25, speed: 0.9, hp: 0.9, attack: 0.95 },
    [
      ['quills', 'Gai nhím', 'Quills', spikes(6)],
      ['burrow', 'Đào hang', 'Burrow', fullHp(15)]
    ]
  ],
  [
    'megafauna',
    'beast',
    'Cự thú tiền sử',
    'Megafauna',
    2000,
    { hp: 1.3, attack: 1.2, defense: 1.1, speed: 0.7, spAttack: 0.85 },
    [
      ['iceAgeCoat', 'Lông kỷ băng', 'Ice Age Coat', resist('ice', 15)],
      ['colossalTusks', 'Ngà khổng lồ', 'Colossal Tusks', S('attack', 8)]
    ]
  ],
  [
    'fangedBeast',
    'beast',
    'Nha thú',
    'Fanged Beasts',
    1500,
    { attack: 1.25, hp: 1.05, defense: 0.85, spDefense: 0.9 },
    [
      ['brawler', 'Võ biền', 'Brawler', S('attack', 8)],
      ['tenacious', 'Lì lợm', 'Tenacious', low(30, { defense: 15 })]
    ]
  ],
  [
    'mythicBeast',
    'beast',
    'Kỳ thú',
    'Mythic Beasts',
    300,
    { spAttack: 1.3, spDefense: 1.15, attack: 0.95, speed: 0.95 },
    [
      ['spiritedBeast', 'Linh khí thú', 'Spirited Beast', S2('spAttack', 'spDefense', 8, 5)],
      ['auspicious', 'Điềm lành', 'Auspicious', tough(4)]
    ]
  ],
  [
    'wildBeast',
    'beast',
    'Dã thú',
    'Wild Beasts',
    80,
    {},
    [
      ['survivalist', 'Sinh tồn', 'Survivalist', regen(2)],
      ['wildFangs', 'Nanh vuốt hoang', 'Wild Fangs', S('attack', 5)]
    ]
  ],
  // ---------- Điểu tộc ----------
  [
    'raptor',
    'avian',
    'Mãnh cầm',
    'Raptors',
    5,
    { attack: 1.25, speed: 1.05, spAttack: 0.85, hp: 0.95 },
    [
      ['talons', 'Móng vuốt', 'Talons', crit(50)],
      ['diveStrike', 'Bổ nhào', 'Dive Strike', first(2, { speed: 15 })]
    ]
  ],
  [
    'owl',
    'avian',
    'Cú',
    'Owls',
    1.5,
    { spAttack: 1.15, spDefense: 1.15, speed: 0.85 },
    [
      ['nightVision', 'Mắt đêm', 'Night Vision', acc(15)],
      ['silentFlight', 'Bay lặng', 'Silent Flight', dodge(8)]
    ]
  ],
  [
    'bird',
    'avian',
    'Chim',
    'Birds',
    0.1,
    { speed: 1.1, spDefense: 1.05, hp: 0.85, defense: 0.9 },
    [
      ['birdsong', 'Tiếng hót', 'Birdsong', ally({ spDefense: 8 })],
      ['flit', 'Chuyền cành', 'Flit', dodge(8)]
    ]
  ],
  [
    'waterfowl',
    'avian',
    'Thủy cầm',
    'Waterfowl',
    3,
    { hp: 1.15, spDefense: 1.1, attack: 0.9, speed: 0.9 },
    [
      ['waterproof', 'Lông chống nước', 'Waterproof', resist('water', 15)],
      ['migratory', 'Di cư', 'Migratory', S('speed', 6)]
    ]
  ],
  [
    'galliform',
    'avian',
    'Gà & chim đất',
    'Fowl',
    2,
    { defense: 1.15, hp: 1.1, attack: 1.05, speed: 0.8 },
    [
      ['peck', 'Mổ', 'Peck', S('attack', 6)],
      ['hardy', 'Khỏe mạnh', 'Hardy', S('hp', 6)]
    ]
  ],
  [
    'penguin',
    'avian',
    'Chim cánh cụt',
    'Penguins',
    20,
    { hp: 1.25, defense: 1.15, spDefense: 1.1, speed: 0.6 },
    [
      ['blubber', 'Lớp mỡ', 'Blubber', resist('ice', 20)],
      ['huddle', 'Quây quần', 'Huddle', ally({ defense: 8 })]
    ]
  ],
  [
    'seabird',
    'avian',
    'Hải điểu',
    'Seabirds',
    3,
    { speed: 1.1, spAttack: 1.1, hp: 0.9, defense: 0.9 },
    [
      ['oceanGlide', 'Lướt sóng', 'Ocean Glide', weather(['rain', 'strongWinds'], { speed: 20 })],
      ['fishDive', 'Lặn bắt cá', 'Fish Dive', boostEl('water', 10)]
    ]
  ],
  [
    'ratite',
    'avian',
    'Chim chạy',
    'Ratites',
    90,
    { attack: 1.2, hp: 1.25, defense: 1.05, speed: 0.95, spAttack: 0.7 },
    [
      ['sprinter', 'Chạy nước rút', 'Sprinter', S('speed', 10)],
      ['powerKick', 'Cú đá', 'Power Kick', S('attack', 8)]
    ]
  ],
  [
    'parrot',
    'avian',
    'Vẹt',
    'Parrots',
    1,
    { spAttack: 1.25, spDefense: 1.05, attack: 0.85, defense: 0.9 },
    [
      ['mimicVoice', 'Nhại giọng', 'Mimic Voice', acc(8)],
      ['brightPlumage', 'Lông sặc sỡ', 'Bright Plumage', S('spDefense', 6)]
    ]
  ],
  [
    'mythicBird',
    'avian',
    'Thần điểu',
    'Mythic Birds',
    50,
    { spAttack: 1.25, spDefense: 1.1, hp: 1.05, attack: 0.9 },
    [
      ['undyingFlame', 'Lửa bất diệt', 'Undying Flame', regen(3)],
      ['heavenlyWing', 'Cánh trời', 'Heavenly Wing', S2('speed', 'spAttack', 6)]
    ]
  ],
  // ---------- Bò sát & lưỡng cư ----------
  [
    'serpent',
    'reptile',
    'Xà tộc',
    'Serpents',
    5,
    { speed: 1.2, attack: 1.1, defense: 0.85, hp: 0.95 },
    [
      ['venomFang', 'Nanh độc', 'Venom Fang', onAtk('physical', 'poison', 10)],
      ['coil', 'Cuộn siết', 'Coil', S('defense', 6)]
    ]
  ],
  [
    'lizard',
    'reptile',
    'Thằn lằn',
    'Lizards',
    3,
    { speed: 1.25, defense: 0.9, hp: 0.9 },
    [
      ['tailDrop', 'Rụng đuôi', 'Tail Drop', fullHp(20)],
      ['sunBask', 'Phơi nắng', 'Sun Bask', weather(['sun'], { speed: 20 })]
    ]
  ],
  [
    'turtle',
    'reptile',
    'Quy tộc',
    'Turtles',
    50,
    { defense: 1.35, hp: 1.15, speed: 0.6 },
    [
      ['shellGuard', 'Mai rùa', 'Shell Guard', tough(8)],
      ['longLived', 'Sống lâu', 'Long-Lived', regen(2)]
    ]
  ],
  [
    'crocodilian',
    'reptile',
    'Ngạc tộc',
    'Crocodilians',
    400,
    { attack: 1.25, defense: 1.1, hp: 1.1, speed: 0.75, spAttack: 0.85 },
    [
      ['deathRoll', 'Cú xoắn tử thần', 'Death Roll', critDmg(30)],
      ['ambush', 'Phục kích', 'Ambush', first(1, { attack: 25 })]
    ]
  ],
  [
    'anuran',
    'reptile',
    'Ếch nhái',
    'Frogs & Toads',
    0.2,
    { speed: 1.25, spAttack: 1.1, defense: 0.8, hp: 0.9 },
    [
      ['leap', 'Bật nhảy', 'Leap', dodge(8)],
      ['moistSkin', 'Da ẩm', 'Moist Skin', resist('fire', 10)]
    ]
  ],
  [
    'caudate',
    'reptile',
    'Kỳ nhông',
    'Salamanders',
    1,
    { hp: 1.2, spDefense: 1.15, speed: 0.85, attack: 0.85 },
    [
      ['limbRegrowth', 'Mọc lại chi', 'Limb Regrowth', regen(3)],
      ['toxicSkin', 'Da độc', 'Toxic Skin', spikes(5)]
    ]
  ],
  // ---------- Thủy tộc ----------
  [
    'fish',
    'aquatic',
    'Ngư tộc',
    'Fish',
    5,
    { speed: 1.25, hp: 0.9, defense: 0.9 },
    [
      ['schooling', 'Bơi theo đàn', 'Schooling', ally({ speed: 8 })],
      ['gills', 'Mang cá', 'Gills', weather(['rain'], { speed: 15 })]
    ]
  ],
  [
    'shark',
    'aquatic',
    'Cá mập & cá đuối',
    'Sharks & Rays',
    300,
    { attack: 1.4, speed: 1.15, spAttack: 0.8, spDefense: 0.85 },
    [
      ['bloodScent', 'Mùi máu', 'Blood Scent', crit(50)],
      ['electroSense', 'Cảm điện', 'Electrosense', acc(10)]
    ]
  ],
  [
    'cetacean',
    'aquatic',
    'Kình tộc',
    'Cetaceans',
    5000,
    { hp: 1.3, spAttack: 1.15, defense: 0.85, attack: 0.95 },
    [
      ['sonar', 'Sóng siêu âm', 'Sonar', acc(10)],
      ['leviathanBulk', 'Thân kình', 'Whale Bulk', S('hp', 10)]
    ]
  ],
  [
    'pinniped',
    'aquatic',
    'Hải cẩu',
    'Pinnipeds',
    200,
    { hp: 1.15, attack: 1.1, speed: 0.9, spAttack: 0.9 },
    [
      ['thickBlubber', 'Mỡ dày', 'Thick Blubber', resist('ice', 20)],
      ['flippers', 'Chân chèo', 'Flippers', S('speed', 6)]
    ]
  ],
  [
    'sirenian',
    'aquatic',
    'Bò biển',
    'Sirenians',
    500,
    { hp: 1.35, defense: 1.1, speed: 0.6, attack: 0.8 },
    [
      ['gentleGiant', 'Hiền hòa', 'Gentle Giant', heals(15)],
      ['seagrassGraze', 'Gặm cỏ biển', 'Seagrass Graze', regen(2)]
    ]
  ],
  [
    'cephalopod',
    'aquatic',
    'Mực & bạch tuộc',
    'Cephalopods',
    20,
    { spAttack: 1.2, speed: 1.1, defense: 0.8, hp: 0.9 },
    [
      ['inkCloud', 'Phun mực', 'Ink Cloud', dodge(10)],
      ['tentacles', 'Xúc tu', 'Tentacles', acc(10)]
    ]
  ],
  [
    'crustacean',
    'aquatic',
    'Giáp xác',
    'Crustaceans',
    2,
    { defense: 1.35, attack: 1.2, speed: 0.75, spAttack: 0.8 },
    [
      ['claws', 'Càng kẹp', 'Claws', crit(40)],
      ['hardShell', 'Vỏ cứng', 'Hard Shell', tough(6)]
    ]
  ],
  [
    'cnidarian',
    'aquatic',
    'Sứa & san hô',
    'Cnidarians',
    1,
    { spAttack: 1.15, spDefense: 1.15, attack: 0.8, defense: 0.85 },
    [
      ['stinger', 'Tế bào châm', 'Stinger', spikes(6)],
      ['drifting', 'Trôi dạt', 'Drifting', regen(2)]
    ]
  ],
  [
    'mollusk',
    'aquatic',
    'Thân mềm',
    'Mollusks',
    0.5,
    { defense: 1.35, spDefense: 1.1, speed: 0.55 },
    [
      ['shellRetreat', 'Rụt vỏ', 'Shell Retreat', low(50, { defense: 20 })],
      ['slimeTrail', 'Vệt nhờn', 'Slime Trail', noLower('speed')]
    ]
  ],
  [
    'leviathan',
    'aquatic',
    'Thủy quái',
    'Leviathans',
    1500,
    { hp: 1.3, spAttack: 1.15, attack: 1.1, speed: 0.75 },
    [
      ['abyssal', 'Vực thẳm', 'Abyssal', boostEl('water', 12)],
      ['tidalBulk', 'Thân sóng', 'Tidal Bulk', S('hp', 8)]
    ]
  ],
  [
    'carapaceon',
    'aquatic',
    'Giáp xác khổng lồ',
    'Carapaceons',
    3000,
    { defense: 1.35, hp: 1.1, speed: 0.7, spAttack: 0.9 },
    [
      ['skullShell', 'Vỏ sọ', 'Skull Shell', tough(8)],
      ['pincerCrush', 'Càng nghiền', 'Pincer Crush', S('attack', 8)]
    ]
  ],
  // ---------- Trùng tộc ----------
  [
    'beetle',
    'insect',
    'Giáp trùng',
    'Beetles',
    0.05,
    { defense: 1.3, attack: 1.15, speed: 0.8, spAttack: 0.85 },
    [
      ['elytra', 'Cánh cứng', 'Elytra', tough(5)],
      ['hornLift', 'Sừng nâng', 'Horn Lift', S('attack', 8)]
    ]
  ],
  [
    'lepidopteran',
    'insect',
    'Bướm & ngài',
    'Butterflies & Moths',
    0.01,
    { spAttack: 1.3, speed: 1.1, defense: 0.8, attack: 0.8 },
    [
      ['scaleDust', 'Phấn vảy', 'Scale Dust', onHit('sleep', 8)],
      ['metamorphosis', 'Biến thái', 'Metamorphosis', regen(2)]
    ]
  ],
  [
    'hymenopteran',
    'insect',
    'Ong & kiến',
    'Bees & Ants',
    0.01,
    { attack: 1.15, speed: 1.15, hp: 0.85, defense: 0.9 },
    [
      ['sting', 'Ngòi chích', 'Sting', onAtk('physical', 'poison', 10)],
      ['colony', 'Tổ đàn', 'Colony', ally({ attack: 8 })]
    ]
  ],
  [
    'arachnid',
    'insect',
    'Nhện & bọ cạp',
    'Arachnids',
    0.05,
    { attack: 1.1, spAttack: 1.1, speed: 1.05, hp: 0.85, spDefense: 0.95 },
    [
      ['silkWeb', 'Tơ nhện', 'Silk Web', acc(10)],
      ['venomTail', 'Nọc độc', 'Venom', onAtk('physical', 'poison', 12)]
    ]
  ],
  [
    'orthopteran',
    'insect',
    'Bọ ngựa & châu chấu',
    'Mantises & Crickets',
    0.01,
    { speed: 1.2, attack: 1.1, defense: 0.85, spDefense: 0.9 },
    [
      ['scythe', 'Lưỡi hái', 'Scythe', crit(50)],
      ['hopper', 'Nhảy xa', 'Hopper', dodge(6)]
    ]
  ],
  [
    'odonate',
    'insect',
    'Chuồn chuồn',
    'Dragonflies',
    0.01,
    { speed: 1.3, attack: 1.05, defense: 0.8, hp: 0.85 },
    [
      ['compoundEyes', 'Mắt kép', 'Compound Eyes', acc(15)],
      ['hover', 'Bay lượn', 'Hover', dodge(6)]
    ]
  ],
  [
    'myriapod',
    'insect',
    'Rết & cuốn chiếu',
    'Myriapods',
    0.1,
    { defense: 1.15, attack: 1.1, speed: 0.95, spDefense: 0.9 },
    [
      ['manyLegs', 'Trăm chân', 'Many Legs', S('speed', 6)],
      ['toxicMandibles', 'Hàm độc', 'Toxic Mandibles', onAtk('physical', 'poison', 10)]
    ]
  ],
  [
    'larva',
    'insect',
    'Sâu & ấu trùng',
    'Larvae',
    0.05,
    { hp: 1.25, defense: 1.1, attack: 0.8, speed: 0.75 },
    [
      ['cocoon', 'Kén', 'Cocoon', fullHp(20)],
      ['voracious', 'Ăn khỏe', 'Voracious', heals(15)]
    ]
  ],
  [
    'neopteron',
    'insect',
    'Cự trùng',
    'Giant Insects',
    500,
    { attack: 1.1, speed: 1.05, defense: 0.95, spAttack: 0.9 },
    [
      ['chitinPlate', 'Giáp kitin', 'Chitin Plate', tough(5)],
      ['broodQueen', 'Mẫu trùng', 'Brood Queen', ally({ attack: 8 })]
    ]
  ],
  [
    'insectoid',
    'insect',
    'Trùng loại',
    'Insectoids',
    0.05,
    {},
    [
      ['tinyBody', 'Thân nhỏ', 'Tiny Body', dodge(6)],
      ['insectInstinct', 'Bản năng côn trùng', 'Insect Instinct', S('speed', 5)]
    ]
  ],
  // ---------- Tiền sử ----------
  [
    'theropod',
    'dinosaur',
    'Khủng long chân thú',
    'Theropods',
    3000,
    { attack: 1.25, speed: 1.15, defense: 0.85, spDefense: 0.9 },
    [
      ['apexBite', 'Cú cắn đỉnh', 'Apex Bite', critDmg(30)],
      ['hunterStride', 'Sải chân săn', 'Hunter Stride', S('speed', 6)]
    ]
  ],
  [
    'sauropod',
    'dinosaur',
    'Khủng long cổ dài',
    'Sauropods',
    30000,
    { hp: 1.4, defense: 1.1, speed: 0.6, attack: 0.95 },
    [
      ['tailWhip', 'Roi đuôi', 'Tail Whip', S('attack', 6)],
      ['titanBulk', 'Thân hồng hoang', 'Titan Bulk', S('hp', 10)]
    ]
  ],
  [
    'ornithischian',
    'dinosaur',
    'Khủng long giáp & sừng',
    'Armored Dinosaurs',
    5000,
    { defense: 1.3, hp: 1.05, speed: 0.8, attack: 0.95 },
    [
      ['frillShield', 'Diềm giáp', 'Frill Shield', tough(6)],
      ['hornCharge', 'Sừng húc', 'Horn Charge', first(1, { attack: 20 })]
    ]
  ],
  [
    'pterosaur',
    'dinosaur',
    'Dực long',
    'Pterosaurs',
    50,
    { speed: 1.4, spAttack: 1.05, defense: 0.8, hp: 0.85 },
    [
      ['ancientWings', 'Cánh cổ đại', 'Ancient Wings', S('speed', 8)],
      ['skyStrike', 'Lao từ trời', 'Sky Strike', crit(40)]
    ]
  ],
  [
    'marineReptile',
    'dinosaur',
    'Hải long tiền sử',
    'Marine Reptiles',
    3000,
    { hp: 1.1, attack: 1.1, speed: 1.1, defense: 0.85, spDefense: 0.95 },
    [
      ['deepPredator', 'Thợ săn đại dương', 'Deep Predator', boostEl('water', 10)],
      ['paddleFins', 'Vây chèo', 'Paddle Fins', S('speed', 6)]
    ]
  ],
  [
    'ancientCreature',
    'dinosaur',
    'Sinh vật cổ đại',
    'Ancient Creatures',
    10,
    { defense: 1.15, spDefense: 1.1, speed: 0.9, attack: 0.9 },
    [
      ['livingFossil', 'Hóa thạch sống', 'Living Fossil', noLower('defense', 'spDefense')],
      ['primordial', 'Nguyên thủy', 'Primordial', regen(2)]
    ]
  ],
  [
    'kaiju',
    'dinosaur',
    'Quái thú',
    'Kaiju',
    1000,
    { hp: 1.25, attack: 1.15, spAttack: 1.1, speed: 0.6 },
    [
      ['monstrousHide', 'Da quái thú', 'Monstrous Hide', tough(5)],
      ['roar', 'Gầm thét', 'Roar', intimidate('attack')]
    ]
  ],
  // ---------- Long tộc ----------
  [
    'westernDragon',
    'dragon',
    'Rồng phương Tây',
    'Western Dragons',
    2000,
    {},
    [
      ['dragonBreath', 'Hơi thở rồng', 'Dragon Breath', S('spAttack', 8)],
      ['treasureHoard', 'Canh kho báu', 'Treasure Hoard', fullHp(15)]
    ]
  ],
  [
    'easternDragon',
    'dragon',
    'Long phương Đông',
    'Eastern Dragons',
    1500,
    { spAttack: 1.15, speed: 1.15, spDefense: 1.05, attack: 0.9, defense: 0.9 },
    [
      ['cloudRider', 'Cưỡi mây', 'Cloud Rider', S('speed', 8)],
      ['rainBringer', 'Hô mưa', 'Rain Bringer', weather(['rain', 'thunderstorm'], { spAttack: 15 })]
    ]
  ],
  [
    'wyvern',
    'dragon',
    'Phi long',
    'Wyverns',
    1500,
    { attack: 1.1, speed: 1.1, spAttack: 0.85, spDefense: 0.95 },
    [
      ['wyvernTail', 'Đuôi phi long', 'Wyvern Tail', onAtk('physical', 'poison', 8)],
      ['aerialDive', 'Bổ nhào trên không', 'Aerial Dive', first(2, { speed: 15 })]
    ]
  ],
  [
    'fangedWyvern',
    'dragon',
    'Nha long',
    'Fanged Wyverns',
    1200,
    { speed: 1.2, attack: 1.15, defense: 0.85, spAttack: 0.85 },
    [
      ['wolfishAgility', 'Nhanh như sói', 'Wolfish Agility', dodge(8)],
      ['sharpFangs', 'Nanh sắc', 'Sharp Fangs', crit(40)]
    ]
  ],
  [
    'bruteWyvern',
    'dragon',
    'Bạo long',
    'Brute Wyverns',
    3000,
    { attack: 1.25, hp: 1.1, defense: 1.1, speed: 0.75, spAttack: 0.8 },
    [
      ['brutishJaw', 'Hàm bạo', 'Brutish Jaw', critDmg(30)],
      ['berserker', 'Cuồng chiến', 'Berserker', low(50, { attack: 15 })]
    ]
  ],
  [
    'piscineWyvern',
    'dragon',
    'Ngư long',
    'Piscine Wyverns',
    2000,
    { speed: 1.1, spAttack: 1.05, hp: 1.05, defense: 0.9, attack: 0.95 },
    [
      ['sandSwim', 'Bơi cát', 'Sand Swim', weather(['sandstorm', 'rain'], { speed: 20 })],
      ['finCutter', 'Vây sắc', 'Fin Cutter', S('attack', 6)]
    ]
  ],
  [
    'birdWyvern',
    'dragon',
    'Điểu long',
    'Bird Wyverns',
    600,
    { speed: 1.25, attack: 1.05, hp: 0.85, defense: 0.85 },
    [
      ['raptorPack', 'Bầy điểu long', 'Raptor Pack', ally({ attack: 8 })],
      ['quickPeck', 'Mổ nhanh', 'Quick Peck', acc(10)]
    ]
  ],
  [
    'snakeWyvern',
    'dragon',
    'Xà long',
    'Snake Wyverns',
    3000,
    { hp: 1.1, speed: 1.1, defense: 0.9, attack: 0.95 },
    [
      ['crushingCoil', 'Siết nghiền', 'Crushing Coil', S('attack', 6)],
      ['rattlingScales', 'Vảy rung', 'Rattling Scales', tough(4)]
    ]
  ],
  [
    'elderDragon',
    'dragon',
    'Cổ long',
    'Elder Dragons',
    10000,
    { hp: 1.1, spDefense: 1.1, spAttack: 1.05, speed: 0.85 },
    [
      ['elderPresence', 'Uy thế cổ long', 'Elder Presence', intimidate('attack')],
      ['calamity', 'Thiên tai', 'Calamity', S2('attack', 'spAttack', 5)]
    ]
  ],
  [
    'drake',
    'dragon',
    'Á long',
    'Drakes',
    300,
    { speed: 1.1, attack: 1.05, hp: 0.9, defense: 0.95 },
    [
      ['lesserScales', 'Vảy á long', 'Lesser Scales', S('defense', 6)],
      ['youngFire', 'Lửa non', 'Young Fire', high(50, { spAttack: 10 })]
    ]
  ],
  // ---------- Thảo mộc ----------
  [
    'tree',
    'plant',
    'Mộc tộc (cây)',
    'Trees',
    500,
    { hp: 1.25, defense: 1.25, speed: 0.6, spAttack: 0.9 },
    [
      ['bark', 'Vỏ cây', 'Bark', tough(5)],
      ['deepRoots', 'Rễ sâu', 'Deep Roots', noLower('defense')]
    ]
  ],
  [
    'flower',
    'plant',
    'Hoa cỏ',
    'Flowers & Herbs',
    2,
    { spAttack: 1.2, spDefense: 1.1, defense: 0.85, hp: 0.9 },
    [
      ['pollen', 'Phấn hoa', 'Pollen', onHit('sleep', 8)],
      ['fragrance', 'Hương thơm', 'Fragrance', ally({ spDefense: 8 })]
    ]
  ],
  [
    'fungus',
    'plant',
    'Nấm',
    'Fungi',
    1,
    { hp: 1.1, spDefense: 1.15, speed: 0.8 },
    [
      ['sporeCloud', 'Mây bào tử', 'Spore Cloud', onHit('paralysis', 8)],
      ['decompose', 'Phân hủy', 'Decompose', heals(15)]
    ]
  ],
  [
    'algae',
    'plant',
    'Rong tảo',
    'Algae & Kelp',
    1,
    { speed: 1.15, hp: 1.05, defense: 0.85, attack: 0.9 },
    [
      ['kelpBody', 'Thân rong', 'Kelp Body', resist('water', 15)],
      ['algalBloom', 'Nở rộ', 'Algal Bloom', regen(2)]
    ]
  ],
  // ---------- Khoáng thể & cơ giới ----------
  [
    'golem',
    'mineral',
    'Thạch nhân',
    'Golems',
    500,
    { attack: 1.2, hp: 1.1, defense: 1.1, speed: 0.8, spAttack: 0.85 },
    [
      ['rockFist', 'Nắm đá', 'Rock Fist', S('attack', 8)],
      ['graniteCore', 'Lõi hoa cương', 'Granite Core', tough(5)]
    ]
  ],
  [
    'crystal',
    'mineral',
    'Tinh thạch',
    'Crystals',
    50,
    { spAttack: 1.35, spDefense: 1.1, hp: 0.85, attack: 0.8 },
    [
      ['prismatic', 'Khúc xạ', 'Prismatic', S('spDefense', 8)],
      ['crystalResonance', 'Cộng hưởng tinh thể', 'Crystal Resonance', S('spAttack', 6)]
    ]
  ],
  [
    'metal',
    'mineral',
    'Kim thể',
    'Metallic',
    200,
    { defense: 1.15, attack: 1.1, speed: 0.95, spDefense: 0.9 },
    [
      ['steelBody', 'Thân thép', 'Steel Body', tough(6)],
      ['magnetic', 'Từ tính', 'Magnetic', acc(8)]
    ]
  ],
  [
    'livingObject',
    'mineral',
    'Vật linh',
    'Living Objects',
    5,
    { spAttack: 1.2, speed: 1.2, defense: 0.85, hp: 0.85 },
    [
      ['tsukumogami', 'Linh vật trăm năm', 'Hundred-Year Spirit', S2('spAttack', 'spDefense', 6)],
      ['harmless', 'Vô hại', 'Harmless Look', fullHp(20)]
    ]
  ],
  [
    'machine',
    'mineral',
    'Cơ giới',
    'Machines',
    300,
    { attack: 1.15, speed: 1.2, spAttack: 1.1, defense: 0.9, spDefense: 0.85 },
    [
      ['programmed', 'Lập trình', 'Programmed', immune('confused', 'sleep')],
      ['overclock', 'Ép xung', 'Overclock', low(30, { speed: 20 })]
    ]
  ],
  // ---------- Vô định hình ----------
  [
    'slime',
    'amorphous',
    'Slime',
    'Slimes',
    20,
    {},
    [
      ['jellyBody', 'Thân thạch', 'Jelly Body', tough(4)],
      ['absorbent', 'Thấm hút', 'Absorbent', heals(20)]
    ]
  ],
  [
    'annelid',
    'amorphous',
    'Giun & đỉa',
    'Worms & Leeches',
    0.5,
    { hp: 1.2, attack: 1.1, defense: 0.9, spAttack: 0.8 },
    [
      ['bloodsucker', 'Hút máu', 'Bloodsucker', leech(8)],
      ['burrower', 'Chui đất', 'Burrower', fullHp(15)]
    ]
  ],
  // ---------- Biến hình ----------
  [
    'shapeshifter',
    'shapeshifter',
    'Biến hình',
    'Shapeshifters',
    50,
    {},
    [
      ['mimicry', 'Mô phỏng', 'Mimicry', S('speed', 5)],
      ['deceive', 'Lừa dối', 'Deceive', dodge(8)]
    ]
  ],
  [
    'lycanthrope',
    'shapeshifter',
    'Người sói (thú hóa)',
    'Lycanthropes',
    120,
    { attack: 1.25, hp: 1.1, speed: 1.05, spAttack: 0.75, spDefense: 0.9 },
    [
      ['moonFrenzy', 'Cuồng nguyệt', 'Moon Frenzy', low(50, { attack: 15, speed: 10 })],
      ['silverBane', 'Kỵ bạc', 'Silver Bane', regen(4)]
    ]
  ],
  [
    'mimic',
    'shapeshifter',
    'Quái giả dạng',
    'Mimics',
    30,
    { defense: 1.25, attack: 1.15, speed: 0.7 },
    [
      ['disguise', 'Ngụy trang', 'Disguise', fullHp(25)],
      ['snapTrap', 'Bẫy sập', 'Snap Trap', first(1, { attack: 25 })]
    ]
  ],
  // ---------- Bất tử ----------
  [
    'zombie',
    'undead',
    'Xác sống',
    'Zombies',
    70,
    { hp: 1.3, attack: 1.1, speed: 0.65, spAttack: 0.85 },
    [
      ['rot', 'Thối rữa', 'Rot', onAtk('physical', 'poison', 8)],
      ['painless', 'Không biết đau', 'Painless', low(30, { attack: 15 })]
    ]
  ],
  [
    'skeleton',
    'undead',
    'Khô lâu',
    'Skeletons',
    30,
    { speed: 1.15, attack: 1.1, hp: 0.8, spDefense: 0.95 },
    [
      ['hollowBones', 'Xương rỗng', 'Hollow Bones', S('speed', 6)],
      ['boneArmor', 'Giáp xương', 'Bone Armor', S('defense', 6)]
    ]
  ],
  [
    'vampire',
    'undead',
    'Huyết tộc',
    'Vampires',
    70,
    { spAttack: 1.1, speed: 1.15, attack: 1.05, defense: 0.85, hp: 0.95 },
    [
      ['bloodDrain', 'Hút huyết', 'Blood Drain', leech(10)],
      [
        'nightLord',
        'Chúa đêm',
        'Night Lord',
        weather(['darkness', 'fog'], { attack: 15, spAttack: 15 })
      ]
    ]
  ],
  [
    'wraith',
    'undead',
    'Oán linh',
    'Wraiths',
    1,
    { spAttack: 1.2, speed: 1.1, defense: 0.75, attack: 0.9 },
    [
      ['incorporeal', 'Vô hình', 'Incorporeal', dodge(10)],
      ['dread', 'Kinh hãi', 'Dread', intimidate('spAttack')]
    ]
  ],
  [
    'lich',
    'undead',
    'Vu yêu (Lich)',
    'Liches',
    60,
    { spAttack: 1.3, spDefense: 1.15, hp: 0.8, attack: 0.8, speed: 0.95 },
    [
      ['phylactery', 'Hộp hồn', 'Phylactery', survive()],
      ['necromancy', 'Tử linh thuật', 'Necromancy', S('spAttack', 8)]
    ]
  ],
  [
    'mummy',
    'undead',
    'Xác ướp',
    'Mummies',
    60,
    { defense: 1.2, hp: 1.1, speed: 0.75 },
    [
      ['wrappings', 'Vải liệm', 'Wrappings', tough(5)],
      ['pharaohCurse', 'Lời nguyền', 'Curse', onHit('cursed', 8)]
    ]
  ],
  [
    'ghoul',
    'undead',
    'Thực thi quỷ',
    'Ghouls',
    70,
    { attack: 1.2, speed: 1.05, defense: 0.85, spAttack: 0.85 },
    [
      ['corpseFeast', 'Ăn xác', 'Corpse Feast', leech(6)],
      ['paralyzingClaw', 'Vuốt tê liệt', 'Paralyzing Claw', onAtk('physical', 'paralysis', 8)]
    ]
  ],
  // ---------- Yêu linh ----------
  [
    'ghost',
    'spirit',
    'Ma quỷ',
    'Ghosts',
    1,
    { spAttack: 1.15, speed: 1.05, defense: 0.85, hp: 0.9 },
    [
      ['ethereal', 'Mờ ảo', 'Ethereal', dodge(10)],
      ['haunting', 'Ám', 'Haunting', onAtk('any', 'confused', 8)]
    ]
  ],
  [
    'yokai',
    'spirit',
    'Yêu quái',
    'Yokai',
    30,
    { speed: 1.1, spAttack: 1.05, attack: 1.05, spDefense: 0.9 },
    [
      ['mischief', 'Tinh quái', 'Mischief', acc(8)],
      ['yokaiArts', 'Yêu thuật', 'Yokai Arts', S('spAttack', 6)]
    ]
  ],
  [
    'fey',
    'spirit',
    'Tiên linh',
    'Fey',
    20,
    { spAttack: 1.15, speed: 1.15, defense: 0.8, hp: 0.85 },
    [
      ['glamour', 'Huyễn thuật', 'Glamour', dodge(8)],
      ['faeLuck', 'Tiên vận', 'Fae Luck', crit(40)]
    ]
  ],
  [
    'wisp',
    'spirit',
    'Ma trơi',
    'Wisps',
    0.1,
    { speed: 1.3, spAttack: 1.1, hp: 0.75, defense: 0.8 },
    [
      ['flicker', 'Chập chờn', 'Flicker', dodge(10)],
      ['ghostFire', 'Lửa ma', 'Ghost Fire', onAtk('any', 'burn', 8)]
    ]
  ],
  [
    'natureSpirit',
    'spirit',
    'Thổ thần & tinh linh',
    'Nature Spirits',
    50,
    { spDefense: 1.15, hp: 1.15, speed: 0.85, attack: 0.9 },
    [
      ['localGuardian', 'Thổ địa', 'Local Guardian', tough(5)],
      ['natureBlessing', 'Phúc tự nhiên', 'Nature Blessing', regen(2)]
    ]
  ],
  // ---------- Ác quỷ ----------
  [
    'demon',
    'demon',
    'Ma tộc',
    'Demons',
    200,
    {},
    [
      ['infernalHide', 'Da hỏa ngục', 'Infernal Hide', resist('fire', 15)],
      ['soulHunger', 'Đói linh hồn', 'Soul Hunger', leech(6)]
    ]
  ],
  [
    'imp',
    'demon',
    'Tiểu quỷ',
    'Imps',
    20,
    { speed: 1.25, spAttack: 1.05, hp: 0.8, defense: 0.85 },
    [
      ['trickster', 'Quỷ quyệt', 'Trickster', dodge(8)],
      ['impFire', 'Lửa con', 'Imp Fire', S('spAttack', 6)]
    ]
  ],
  [
    'oni',
    'demon',
    'Quỷ dữ (Oni)',
    'Oni',
    300,
    { attack: 1.25, hp: 1.15, defense: 1.05, spAttack: 0.75, speed: 0.85 },
    [
      ['ironClub', 'Gậy sắt', 'Iron Club', critDmg(25)],
      ['oniRage', 'Quỷ nộ', 'Oni Rage', low(50, { attack: 15 })]
    ]
  ],
  // ---------- Nguyên tố ----------
  [
    'elemental',
    'elemental',
    'Nguyên tố',
    'Elementals',
    100,
    {},
    [
      ['elementalSurge', 'Bùng nổ nguyên tố', 'Elemental Surge', S('spAttack', 6)],
      ['elementalWard', 'Lá chắn nguyên tố', 'Elemental Ward', tough(4)]
    ]
  ],
  [
    'djinn',
    'elemental',
    'Thần đèn (Djinn)',
    'Djinn',
    300,
    { spAttack: 1.15, speed: 1.1, defense: 0.85, hp: 0.9 },
    [
      ['wish', 'Điều ước', 'Wish', heals(20)],
      ['smokeForm', 'Thân khói', 'Smoke Form', dodge(8)]
    ]
  ],
  // ---------- Dị thể ----------
  [
    'aberration',
    'aberration',
    'Dị thể',
    'Aberrations',
    100,
    {},
    [
      ['eldritchGaze', 'Ánh nhìn dị giới', 'Eldritch Gaze', intimidate('spDefense')],
      ['mutation', 'Đột biến', 'Mutation', S2('attack', 'spAttack', 5)]
    ]
  ],
  [
    'chimera',
    'aberration',
    'Quái lai',
    'Chimeras',
    300,
    { attack: 1.2, hp: 1.1, spAttack: 0.9, spDefense: 0.85 },
    [
      ['hybridVigor', 'Sức lai', 'Hybrid Vigor', S2('hp', 'speed', 6)],
      ['manyHeads', 'Nhiều đầu', 'Many Heads', acc(10)]
    ]
  ],
  // ---------- Thiên giới ----------
  [
    'angel',
    'celestial',
    'Thiên sứ',
    'Angels',
    80,
    {},
    [
      ['halo', 'Hào quang', 'Halo', tough(5)],
      ['grace', 'Ân điển', 'Grace', heals(20)]
    ]
  ],
  // ---------- Thần linh ----------
  [
    'god',
    'deity',
    'Thần',
    'Gods',
    500,
    {},
    [
      ['omnipresence', 'Hiện diện', 'Omnipresence', S('hp', 6)],
      ['worship', 'Được thờ phụng', 'Worship', regen(2)]
    ]
  ],
  [
    'divineBeast',
    'deity',
    'Thần thú',
    'Divine Beasts',
    800,
    { hp: 1.1, attack: 1.1, speed: 1.05, spAttack: 0.9, spDefense: 0.9 },
    [
      ['sacredBody', 'Thánh thể', 'Sacred Body', immune('poison', 'badPoison', 'burn')],
      ['heavenMandate', 'Thiên mệnh', 'Heaven Mandate', tough(4)]
    ]
  ],
  [
    'demigod',
    'deity',
    'Á thần',
    'Demigods',
    150,
    { attack: 1.15, speed: 1.05, spAttack: 0.9, spDefense: 0.95 },
    [
      ['heroicBlood', 'Huyết anh hùng', 'Heroic Blood', low(50, { attack: 15, spAttack: 15 })],
      ['mortalWill', 'Ý chí phàm nhân', 'Mortal Will', noLower('attack', 'spAttack')]
    ]
  ],
  // ---------- Nhân tộc ----------
  [
    'human',
    'humanoid',
    'Nhân loại',
    'Humans',
    70,
    {},
    [
      ['quickLearner', 'Học nhanh', 'Quick Learner', exp(10)],
      ['teamwork', 'Phối hợp', 'Teamwork', ally({ attack: 5, spAttack: 5 })]
    ]
  ],
  [
    'elf',
    'humanoid',
    'Tiên tộc',
    'Elves',
    60,
    { spAttack: 1.3, spDefense: 1.15, speed: 1.15, hp: 0.85, defense: 0.8, attack: 0.85 },
    [],
    ['elvenSpirit', 'elvenGrace']
  ],
  [
    'dwarf',
    'humanoid',
    'Người lùn',
    'Dwarves',
    70,
    { hp: 1.15, defense: 1.3, attack: 1.05, spDefense: 1.05, speed: 0.7, spAttack: 0.8 },
    [],
    ['stoutBody', 'stubborn']
  ],
  [
    'orc',
    'humanoid',
    'Orc',
    'Orcs',
    120,
    { attack: 1.25, hp: 1.15, defense: 1.05, spAttack: 0.7, spDefense: 0.85 },
    [],
    ['orcRage', 'orcGrit']
  ],
  [
    'halfling',
    'humanoid',
    'Tiểu nhân',
    'Halflings',
    30,
    { speed: 1.25, spDefense: 1.15, spAttack: 1.05, hp: 0.8, attack: 0.85, defense: 0.9 },
    [],
    ['quickWitted', 'halflingLuck']
  ],
  [
    'giant',
    'humanoid',
    'Khổng lồ',
    'Giants',
    2000,
    { hp: 1.45, attack: 1.3, defense: 1.1, speed: 0.6, spAttack: 0.7, spDefense: 0.85 },
    [['earthshaker', 'Rung chuyển đất', 'Earthshaker', first(1, { attack: 20 })]],
    ['giantBody']
  ],
  [
    'goblin',
    'humanoid',
    'Yêu tinh lùn (Goblin)',
    'Goblins',
    30,
    { speed: 1.2, attack: 1.05, hp: 0.8, defense: 0.85, spDefense: 0.9 },
    [
      ['scavenger', 'Nhặt nhạnh', 'Scavenger', acc(8)],
      ['sneakAttack', 'Đánh lén', 'Sneak Attack', first(1, { attack: 20 })]
    ]
  ],
  [
    'troll',
    'humanoid',
    'Troll & yêu ma',
    'Trolls & Ogres',
    400,
    { hp: 1.3, attack: 1.2, spAttack: 0.7, speed: 0.85 },
    [
      ['trollRegen', 'Tái tạo troll', 'Troll Regeneration', regen(4)],
      ['thickHead', 'Đầu đặc', 'Thick Head', immune('confused')]
    ]
  ],
  [
    'beastfolk',
    'humanoid',
    'Thú nhân',
    'Beastfolk',
    70,
    { attack: 1.15, speed: 1.15, spAttack: 0.85, spDefense: 0.9 },
    [
      ['feralInstinct', 'Bản năng hoang dã', 'Feral Instinct', crit(30)],
      ['beastSense', 'Giác quan thú', 'Beast Sense', acc(8)]
    ]
  ],
  [
    'centaur',
    'humanoid',
    'Nhân mã',
    'Centaurs',
    400,
    { speed: 1.25, attack: 1.1, hp: 1.05, defense: 0.85, spDefense: 0.85 },
    [
      ['gallopCharge', 'Phi nước đại', 'Gallop Charge', first(2, { speed: 20 })],
      ['mountedArcher', 'Cung thủ trên lưng ngựa', 'Mounted Archer', acc(10)]
    ]
  ],
  [
    'insectfolk',
    'humanoid',
    'Trùng nhân',
    'Insectfolk',
    80,
    { defense: 1.2, attack: 1.05, speed: 1.05, spDefense: 0.85, hp: 0.85 },
    [
      ['chitinArmor', 'Giáp kitin', 'Chitin Armor', tough(5)],
      ['swarmTactics', 'Chiến thuật bầy', 'Swarm Tactics', ally({ attack: 8, speed: 4 })]
    ]
  ],
  [
    'merfolk',
    'humanoid',
    'Ngư nhân',
    'Merfolk',
    80,
    { spAttack: 1.15, spDefense: 1.1, speed: 1.05, attack: 0.85, defense: 0.9 },
    [
      ['sirenSong', 'Tiếng hát hải yêu', 'Siren Song', intimidate('speed')],
      ['tideKin', 'Con của sóng', 'Tide Kin', resist('water', 15)]
    ]
  ],
  [
    'lizardfolk',
    'humanoid',
    'Thằn lằn nhân',
    'Lizardfolk',
    90,
    { defense: 1.15, attack: 1.1, hp: 1.05, spAttack: 0.85, spDefense: 0.85 },
    [
      ['scaledWarrior', 'Chiến binh vảy', 'Scaled Warrior', tough(4)],
      ['coldBlooded', 'Máu lạnh', 'Cold-Blooded', S('speed', 5)]
    ]
  ],
  [
    'harpyfolk',
    'humanoid',
    'Điểu nhân',
    'Winged Folk',
    40,
    { speed: 1.3, attack: 1.05, defense: 0.8, hp: 0.85 },
    [
      ['windDancer', 'Vũ công gió', 'Wind Dancer', dodge(8)],
      ['shrillCry', 'Tiếng rít', 'Shrill Cry', intimidate('defense')]
    ]
  ],
  // ---------- Ngoại tinh ----------
  [
    'alienRace',
    'alien',
    'Người ngoài hành tinh',
    'Extraterrestrials',
    70,
    {},
    [
      ['advancedTech', 'Công nghệ cao', 'Advanced Tech', acc(10)],
      ['telepathy', 'Ngoại cảm', 'Telepathy', S('spDefense', 6)]
    ]
  ],
  [
    'hive',
    'alien',
    'Bầy sinh vật',
    'Hive Swarms',
    100,
    { attack: 1.15, speed: 1.15, defense: 0.85, spDefense: 0.85 },
    [
      ['hiveMind', 'Ý chí bầy', 'Hive Mind', ally({ attack: 10 })],
      ['acidBlood', 'Máu axit', 'Acid Blood', spikes(6)]
    ]
  ],
  [
    'android',
    'alien',
    'Người máy',
    'Androids',
    150,
    { defense: 1.15, spDefense: 1.1, spAttack: 1.05, hp: 0.85, speed: 0.95 },
    [
      ['cybernetic', 'Điều khiển học', 'Cybernetic', immune('poison', 'badPoison', 'sleep')],
      ['targeting', 'Ngắm bắn', 'Targeting', acc(12)]
    ]
  ],
  [
    'mutant',
    'alien',
    'Đột biến',
    'Mutants',
    120,
    { hp: 1.15, attack: 1.1, defense: 0.9, spDefense: 0.85 },
    [
      ['radiation', 'Phóng xạ', 'Radiation', onAtk('physical', 'poison', 10)],
      ['mutantVigor', 'Sức đột biến', 'Mutant Vigor', regen(2)]
    ]
  ]
]

/** Trait mới của nhóm Ngoại tinh (nhóm mới, không có race cũ). */
export const GROUP_TRAITS = [
  ['alienPhysiology', 'Thể chất ngoại tinh', 'Alien Physiology', tough(4)],
  ['alienIntellect', 'Trí tuệ ngoại tinh', 'Alien Intellect', S('spAttack', 8)]
]

/** Race mặc định khi không phân được, theo race cũ của loài. */
export const FALLBACK = {
  beast: 'wildBeast',
  avian: 'bird',
  aquatic: 'fish',
  insect: 'insectoid',
  reptile: 'lizard',
  dinosaur: 'kaiju',
  dragon: 'westernDragon',
  plant: 'flower',
  mineral: 'golem',
  amorphous: 'slime',
  shapeshifter: 'shapeshifter',
  undead: 'zombie',
  spirit: 'ghost',
  demon: 'demon',
  elemental: 'elemental',
  aberration: 'aberration',
  celestial: 'angel',
  deity: 'god',
  humanoid: 'human',
  orc: 'orc',
  elf: 'elf',
  dwarf: 'dwarf',
  halfling: 'halfling',
  giant: 'giant',
  buffalo: 'buffalo'
}
