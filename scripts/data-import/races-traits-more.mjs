// Trait race bổ sung cho races-split.mjs (chủ project 2026-10-25: race có nhiều trait riêng, nhóm lớn
// có nhiều trait dùng chung). Mỗi race thêm một trait riêng, mỗi nhóm thêm hai trait chung; số nhỏ hơn
// trait chính vì mọi trait race luôn bật cùng lúc. Dòng trait: [id, tên vi, tên en, hook].

import {
  S,
  S2,
  acc,
  ally,
  boostEl,
  crit,
  critDmg,
  dodge,
  exp,
  first,
  fullHp,
  heals,
  high,
  immune,
  intimidate,
  leech,
  low,
  noLower,
  onAtk,
  onHit,
  regen,
  resist,
  spikes,
  survive,
  tough,
  weather
} from './races-hooks.mjs'

/** Trait chung thêm cho từng nhóm race (mọi race trong nhóm đều có). */
export const GROUP_EXTRA_TRAITS = {
  beast: [
    ['wildVigor', 'Sức sống hoang dã', 'Wild Vigor', S('hp', 4)],
    ['predatorSense', 'Giác quan thú săn', 'Predator Sense', acc(4)]
  ],
  avian: [
    ['hollowBones', 'Xương rỗng', 'Hollow Bones', S('speed', 4)],
    ['skyborne', 'Sinh ra trên trời', 'Skyborne', resist('ground', 6)]
  ],
  reptile: [
    ['scaledHide', 'Da vảy', 'Scaled Hide', S('defense', 4)],
    ['patientHunter', 'Thợ săn kiên nhẫn', 'Patient Hunter', low(40, { attack: 8 })]
  ],
  aquatic: [
    ['tidalBody', 'Thân thủy triều', 'Tidal Body', resist('water', 6)],
    ['currentRider', 'Cưỡi dòng nước', 'Current Rider', weather(['rain'], { speed: 8 })]
  ],
  insect: [
    ['exoskeleton', 'Bộ xương ngoài', 'Exoskeleton', tough(3)],
    ['broodSwarm', 'Đàn sinh sôi', 'Brood Swarm', ally({ speed: 5 })]
  ],
  dinosaur: [
    ['primevalBulk', 'Thể vóc tiền sử', 'Primeval Bulk', S('hp', 5)],
    ['ancientRoar', 'Gầm tiền sử', 'Ancient Roar', intimidate('defense')]
  ],
  dragon: [
    ['draconicScales', 'Vảy rồng', 'Draconic Scales', S2('defense', 'spDefense', 3)],
    ['dragonPride', 'Long uy', 'Dragon Pride', high(70, { attack: 6, spAttack: 6 })]
  ],
  plant: [
    ['sunFeeding', 'Hấp thụ nắng', 'Sun Feeding', weather(['sun'], { spDefense: 10 })],
    ['rootedLife', 'Bám rễ sinh trưởng', 'Rooted Life', regen(2)]
  ],
  mineral: [
    ['mineralMass', 'Khối khoáng', 'Mineral Mass', S('defense', 5)],
    ['unyielding', 'Bất động', 'Unyielding', noLower('defense')]
  ],
  amorphous: [
    ['formless', 'Vô định hình', 'Formless', tough(3)],
    ['absorbentBody', 'Thân thấm hút', 'Absorbent Body', heals(10)]
  ],
  shapeshifter: [
    ['adaptiveForm', 'Thân thích nghi', 'Adaptive Form', S2('speed', 'spDefense', 3)],
    ['falseFace', 'Mặt nạ giả', 'False Face', first(1, { speed: 10 })]
  ],
  undead: [
    ['restlessDead', 'Xác không yên', 'Restless Dead', immune('poison', 'badPoison')],
    ['graveChill', 'Hơi lạnh mộ', 'Grave Chill', resist('ghost', 6)]
  ],
  demon: [
    ['hellbornMight', 'Sức mạnh địa ngục', 'Hellborn Might', S('attack', 4)],
    ['corruptingTouch', 'Chạm vấy bẩn', 'Corrupting Touch', onHit('cursed', 8)]
  ],
  elemental: [
    ['primalCore', 'Lõi nguyên sơ', 'Primal Core', S('spAttack', 4)],
    ['elementalForm', 'Hình nguyên tố', 'Elemental Form', immune('bleeding')]
  ],
  aberration: [
    ['alienAnatomy', 'Cơ thể dị dạng', 'Alien Anatomy', fullHp(5)],
    [
      'maddeningPresence',
      'Hiện diện gây loạn',
      'Maddening Presence',
      onAtk('special', 'confused', 6)
    ]
  ],
  spirit: [
    ['incorporeal', 'Phi vật chất', 'Incorporeal', dodge(4)],
    ['spiritSight', 'Linh nhãn', 'Spirit Sight', acc(5)]
  ],
  celestial: [
    ['holyAura', 'Hào quang thánh', 'Holy Aura', resist('dark', 8)],
    ['graceOfHeaven', 'Ân điển', 'Grace of Heaven', heals(12)]
  ],
  deity: [
    ['divinity', 'Thần tính', 'Divinity', S2('hp', 'spDefense', 4)],
    ['miracle', 'Phép màu', 'Miracle', fullHp(5)]
  ],
  humanoid: [
    ['ingenuity', 'Khéo léo', 'Ingenuity', exp(5)],
    ['teamwork', 'Phối hợp', 'Teamwork', ally({ attack: 4, spAttack: 4 })]
  ],
  alien: [
    ['otherworldly', 'Khác thường', 'Otherworldly', resist('psychic', 8)],
    ['advancedBiology', 'Sinh học tiến bộ', 'Advanced Biology', regen(2)]
  ]
}

/** Trait riêng thêm cho từng race. */
export const RACE_EXTRA_TRAITS = {
  // Thú
  felid: ['nineLives', 'Chín mạng', 'Nine Lives', low(30, { speed: 12 })],
  canid: ['loyalHowl', 'Tiếng tru trung thành', 'Loyal Howl', ally({ defense: 6 })],
  ursid: ['maulingPaw', 'Cú tát gấu', 'Mauling Paw', critDmg(15)],
  mustelid: ['muskSpray', 'Xịt mùi', 'Musk Spray', onHit('blind', 8)],
  rodent: ['scurry', 'Chạy lủi', 'Scurry', dodge(5)],
  lagomorph: ['quickHop', 'Nhảy nhanh', 'Quick Hop', first(1, { speed: 15 })],
  primate: ['toolUser', 'Dùng công cụ', 'Tool User', acc(6)],
  equid: ['enduringGallop', 'Sức bền', 'Enduring Gallop', S('hp', 5)],
  buffalo: ['hornedCharge', 'Húc sừng', 'Horned Charge', first(2, { attack: 10 })],
  cervid: ['antlerGuard', 'Gạc chắn', 'Antler Guard', spikes(3)],
  suid: ['rooting', 'Ủi đất', 'Rooting', resist('ground', 8)],
  proboscid: ['trunkStrength', 'Vòi lực sĩ', 'Trunk Strength', S('attack', 5)],
  pachyderm: ['armoredHide', 'Da giáp', 'Armored Hide', fullHp(8)],
  chiropteran: [
    'nightFlyer',
    'Bay đêm',
    'Night Flyer',
    weather(['darkness', 'fog'], { speed: 15 })
  ],
  marsupial: ['pouchCare', 'Túi ấp', 'Pouch Care', heals(10)],
  xenarthran: ['diggingClaws', 'Móng đào', 'Digging Claws', S2('attack', 'defense', 3)],
  insectivore: ['spinyCoat', 'Bộ lông gai', 'Spiny Coat', spikes(4)],
  megafauna: ['iceAgeHide', 'Da kỷ băng hà', 'Ice Age Hide', resist('ice', 10)],
  fangedBeast: ['savageBite', 'Cắn xé', 'Savage Bite', onHit('bleeding', 10)],
  mythicBeast: [
    'legendaryBlood',
    'Huyết mạch truyền thuyết',
    'Legendary Blood',
    S2('hp', 'spAttack', 3)
  ],
  wildBeast: ['survivalist', 'Sinh tồn', 'Survivalist', regen(2)],
  // Chim
  raptor: ['talonGrip', 'Vuốt quặp', 'Talon Grip', critDmg(15)],
  owl: ['silentWings', 'Cánh lặng', 'Silent Wings', first(1, { attack: 10, speed: 10 })],
  bird: ['songbird', 'Chim hót', 'Songbird', ally({ spDefense: 6 })],
  waterfowl: ['diving', 'Lặn sâu', 'Diving', resist('water', 8)],
  galliform: ['groundForager', 'Kiếm ăn dưới đất', 'Ground Forager', S('defense', 5)],
  penguin: ['coldPlunge', 'Lặn băng', 'Cold Plunge', weather(['snow', 'blizzard'], { speed: 15 })],
  seabird: ['seaWind', 'Gió biển', 'Sea Wind', weather(['strongWinds', 'rain'], { spAttack: 10 })],
  ratite: ['powerfulKick', 'Cú đá mạnh', 'Powerful Kick', S('attack', 5)],
  parrot: ['mimicSong', 'Bắt chước tiếng', 'Mimic Song', onAtk('special', 'confused', 6)],
  mythicBird: ['rebirthFlame', 'Lửa tái sinh', 'Rebirth Flame', resist('fire', 10)],
  // Bò sát / lưỡng cư
  serpent: ['constrict', 'Siết chặt', 'Constrict', onHit('snared', 8)],
  lizard: ['tailDrop', 'Rụng đuôi', 'Tail Drop', low(30, { speed: 15 })],
  turtle: ['retreatShell', 'Rụt vào mai', 'Retreat Shell', low(40, { defense: 15 })],
  crocodilian: ['deathRoll', 'Cú lăn tử thần', 'Death Roll', critDmg(20)],
  anuran: ['longTongue', 'Lưỡi dài', 'Long Tongue', acc(6)],
  caudate: ['limbRegrowth', 'Mọc lại chi', 'Limb Regrowth', heals(12)],
  // Thủy tộc
  fish: ['schooling', 'Bơi theo đàn', 'Schooling', ally({ speed: 6 })],
  shark: ['bloodScent', 'Đánh hơi máu', 'Blood Scent', crit(30)],
  cetacean: ['blowhole', 'Lỗ phun nước', 'Blowhole', S('spAttack', 5)],
  pinniped: ['blubberLayer', 'Lớp mỡ', 'Blubber Layer', resist('ice', 10)],
  sirenian: ['gentleGiant', 'Khổng lồ hiền lành', 'Gentle Giant', S('hp', 6)],
  cephalopod: ['inkCloud', 'Mực phun', 'Ink Cloud', onHit('blind', 10)],
  crustacean: ['pincerGrip', 'Kẹp càng', 'Pincer Grip', critDmg(15)],
  cnidarian: ['nematocyst', 'Tế bào châm', 'Nematocyst', onHit('poison', 10)],
  mollusk: ['slimeTrail', 'Vệt nhớt', 'Slime Trail', dodge(5)],
  leviathan: ['abyssalPressure', 'Áp lực vực thẳm', 'Abyssal Pressure', intimidate('speed')],
  carapaceon: ['hardCarapace', 'Mai cứng', 'Hard Carapace', fullHp(8)],
  // Côn trùng
  beetle: ['hornLift', 'Hất sừng', 'Horn Lift', S('attack', 5)],
  lepidopteran: ['scaleDust', 'Phấn vảy', 'Scale Dust', onAtk('special', 'sleep', 5)],
  hymenopteran: ['venomStinger', 'Ngòi độc', 'Venom Stinger', onAtk('physical', 'poison', 10)],
  arachnid: ['silkSnare', 'Tơ bẫy', 'Silk Snare', onAtk('physical', 'snared', 8)],
  orthopteran: ['powerLeap', 'Bật nhảy', 'Power Leap', first(1, { speed: 15 })],
  odonate: ['hoverStrike', 'Lượn đánh', 'Hover Strike', acc(8)],
  myriapod: ['manyLegs', 'Trăm chân', 'Many Legs', S('speed', 5)],
  larva: ['metamorphosis', 'Biến thái', 'Metamorphosis', exp(8)],
  neopteron: ['neopteraWings', 'Cánh gập', 'Folded Wings', dodge(5)],
  insectoid: ['chitinPlates', 'Tấm kitin', 'Chitin Plates', S('defense', 5)],
  // Khủng long
  theropod: ['apexJaws', 'Hàm săn mồi', 'Apex Jaws', critDmg(15)],
  sauropod: ['tailWhip', 'Quất đuôi', 'Tail Whip', spikes(3)],
  ornithischian: ['herdDefense', 'Thủ theo đàn', 'Herd Defense', ally({ defense: 6 })],
  pterosaur: [
    'thermalGlide',
    'Lượn nhiệt',
    'Thermal Glide',
    weather(['sun', 'strongWinds'], { speed: 15 })
  ],
  marineReptile: ['deepBreath', 'Hơi thở sâu', 'Deep Breath', S('hp', 5)],
  ancientCreature: ['livingFossil', 'Hóa thạch sống', 'Living Fossil', resist('rock', 10)],
  kaiju: ['colossalStride', 'Bước khổng lồ', 'Colossal Stride', intimidate('attack')],
  // Rồng
  westernDragon: ['dragonHoard', 'Kho báu rồng', 'Dragon Hoard', exp(6)],
  easternDragon: [
    'cloudRider',
    'Cưỡi mây',
    'Cloud Rider',
    weather(['rain', 'thunderstorm'], { spAttack: 12 })
  ],
  wyvern: ['venomTail', 'Đuôi độc', 'Venom Tail', onHit('poison', 10)],
  fangedWyvern: ['frenziedFangs', 'Nanh cuồng', 'Frenzied Fangs', low(50, { attack: 12 })],
  bruteWyvern: ['bruteCharge', 'Húc thô bạo', 'Brute Charge', first(2, { attack: 10 })],
  piscineWyvern: [
    'sandSwim',
    'Bơi cát',
    'Sand Swim',
    weather(['sandstorm', 'rain'], { speed: 15 })
  ],
  birdWyvern: ['quickPeck', 'Mổ nhanh', 'Quick Peck', S('speed', 5)],
  snakeWyvern: ['coilingBody', 'Thân cuộn', 'Coiling Body', dodge(5)],
  elderDragon: [
    'ancientDominion',
    'Thượng cổ bá quyền',
    'Ancient Dominion',
    S2('attack', 'spAttack', 4)
  ],
  drake: ['youngFlame', 'Lửa non', 'Young Flame', boostEl('fire', 8)],
  // Thực vật
  tree: ['barkSkin', 'Vỏ cây', 'Bark Skin', S('defense', 5)],
  flower: ['pollenBurst', 'Phấn hoa', 'Pollen Burst', onAtk('special', 'sleep', 5)],
  fungus: ['sporeCloud', 'Mây bào tử', 'Spore Cloud', onHit('poison', 10)],
  algae: ['bloom', 'Nở rộ', 'Bloom', weather(['rain'], { spDefense: 10 })],
  // Khoáng vật
  golem: ['runeCore', 'Lõi rune', 'Rune Core', S('hp', 5)],
  crystal: ['crystalPrism', 'Lăng kính', 'Crystal Prism', resist('light', 10)],
  metal: ['magnetized', 'Từ hóa', 'Magnetized', resist('electric', 8)],
  livingObject: ['animated', 'Được thổi hồn', 'Animated', immune('sleep')],
  machine: ['overclock', 'Ép xung', 'Overclock', high(70, { speed: 10 })],
  // Vô định hình
  slime: ['splitBody', 'Thân phân tách', 'Split Body', survive()],
  annelid: ['burrowDeep', 'Đào sâu', 'Burrow Deep', resist('ground', 8)],
  // Biến hình
  changeling: ['stolenFace', 'Mặt mượn', 'Stolen Face', first(1, { attack: 10 })],
  lycanthrope: ['feralTransformation', 'Thú hóa', 'Feral Transformation', S('speed', 5)],
  mimic: ['lureBait', 'Mồi nhử', 'Lure Bait', first(1, { attack: 15 })],
  // Bất tử
  zombie: ['shamblingHorde', 'Bầy xác sống', 'Shambling Horde', ally({ attack: 6 })],
  skeleton: ['boneArmor', 'Giáp xương', 'Bone Armor', resist('poison', 10)],
  vampire: [
    'nightLord',
    'Chúa tể bóng đêm',
    'Night Lord',
    weather(['darkness', 'fog'], { attack: 12 })
  ],
  wraith: ['soulChill', 'Rét linh hồn', 'Soul Chill', onAtk('special', 'feared', 6)],
  lich: ['phylactery', 'Hộp hồn', 'Phylactery', regen(3)],
  mummy: ['ancientWraps', 'Vải liệm cổ', 'Ancient Wraps', resist('dark', 10)],
  ghoul: ['corpseFeast', 'Ăn xác', 'Corpse Feast', leech(5)],
  // Tinh linh
  ghost: ['haunting', 'Ám ảnh', 'Haunting', intimidate('spAttack')],
  yokai: ['shapeTrick', 'Huyễn thuật', 'Shape Trick', dodge(5)],
  fey: ['glamour', 'Mê hoặc', 'Glamour', onAtk('special', 'confused', 6)],
  wisp: ['willOWisp', 'Lửa ma trơi', 'Will-o-Wisp', onAtk('special', 'burn', 8)],
  natureSpirit: ['forestBlessing', 'Phúc rừng', 'Forest Blessing', heals(12)],
  // Ác quỷ
  fiend: ['infernalPact', 'Khế ước địa ngục', 'Infernal Pact', low(40, { spAttack: 12 })],
  imp: ['impishLuck', 'Vận tiểu quỷ', 'Impish Luck', crit(30)],
  oni: ['oniHide', 'Da quỷ', 'Oni Hide', S('hp', 5)],
  // Nguyên tố
  elementalSpirit: ['elementalAffinity', 'Thân hòa nguyên tố', 'Elemental Affinity', heals(10)],
  djinn: ['sandWind', 'Gió cát', 'Sand Wind', weather(['sandstorm'], { speed: 15 })],
  // Dị thể
  eldritch: ['unknowable', 'Bất khả tri', 'Unknowable', resist('psychic', 10)],
  chimera: ['hybridVigor', 'Ưu thế lai', 'Hybrid Vigor', S2('attack', 'defense', 3)],
  // Thiên giới / thần
  angel: ['radiantWings', 'Cánh rực sáng', 'Radiant Wings', boostEl('light', 8)],
  god: ['omnipotence', 'Thần lực', 'Omnipotence', S2('attack', 'spAttack', 4)],
  divineBeast: ['sacredGuardian', 'Thần thú hộ vệ', 'Sacred Guardian', ally({ spDefense: 6 })],
  demigod: ['heroicLineage', 'Huyết thống anh hùng', 'Heroic Lineage', critDmg(15)],
  // Nhân hình
  human: ['adaptable', 'Thích ứng', 'Adaptable', S2('attack', 'spAttack', 3)],
  elf: ['elvenGrace', 'Uyển chuyển', 'Elven Grace', dodge(5)],
  dwarf: ['forgeHardened', 'Rèn trong lò', 'Forge-Hardened', resist('fire', 8)],
  orc: ['warcry', 'Tiếng hét trận', 'Warcry', first(2, { attack: 10 })],
  halfling: ['luckyBreak', 'May mắn', 'Lucky Break', crit(30)],
  giant: ['earthshaker', 'Rung đất', 'Earthshaker', intimidate('speed')],
  goblin: ['dirtyTricks', 'Mánh bẩn', 'Dirty Tricks', onHit('blind', 8)],
  troll: ['stoneSleep', 'Hóa đá', 'Stone Sleep', resist('rock', 8)],
  beastfolk: ['wildBlood', 'Huyết thú', 'Wild Blood', S('speed', 5)],
  centaur: ['tramplingHooves', 'Vó giẫm', 'Trampling Hooves', S('attack', 5)],
  insectfolk: ['compoundSight', 'Thị giác kép', 'Compound Sight', acc(8)],
  merfolk: ['tideCaller', 'Gọi thủy triều', 'Tide Caller', boostEl('water', 8)],
  lizardfolk: ['scaleWarrior', 'Chiến binh vảy', 'Scale Warrior', S('defense', 5)],
  harpyfolk: ['shriek', 'Thét chói tai', 'Shriek', intimidate('spDefense')],
  // Ngoại tinh
  alienRace: ['starfarer', 'Lữ khách vì sao', 'Starfarer', exp(6)],
  hive: ['hiveLink', 'Liên kết tổ', 'Hive Link', ally({ attack: 5, defense: 5 })],
  android: ['targetingSystem', 'Hệ ngắm', 'Targeting System', acc(8)],
  mutant: [
    'radiantMutation',
    'Đột biến phóng xạ',
    'Radiant Mutation',
    immune('poison', 'badPoison')
  ]
}
