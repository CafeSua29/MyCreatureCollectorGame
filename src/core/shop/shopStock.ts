// Danh sách hàng của cửa hàng (mục "Cửa hàng và vứt vật phẩm"): random lại mỗi lần vào thị
// trấn từ một tầng (travel, thua trận) và khi tạo game mới.

import { nextInt, pickWeighted, type RngState } from '../shared'
import {
  CRYSTAL_TRAIT_KINDS,
  type GameData,
  type Monster,
  type Skill,
  type GameOptions,
  type GameState,
  type Inventory,
  type ShopEntry,
  type StackableItemRef
} from '../model'
import {
  equipmentInstanceId,
  isBookableSkill,
  isItemOffered,
  isSkillBookUsefulForParty,
  rollEquipment,
  rollRarity,
  skillBookRarityOf,
  skillLearnerCount
} from '../inventory'

/** Cấp của tinh thể bán ở cửa hàng. */
const SHOP_CRYSTAL_LEVEL = 1

/** Ứng viên của danh sách hàng: item gộp được, hoặc một trang bị gốc (tung món khi được chọn). */
interface ShopCandidate {
  ref: StackableItemRef | { storage: 'equipment'; itemId: string }
  weight: number
}

/**
 * Vật phẩm có `shop: true`, trọng số `shopWeight` (trang bị gốc thường, không có unique); món có
 * `requiresKeyItemId` chỉ khi túi có vật phẩm chìa khóa đó, món có `requiresOption` chỉ khi tùy
 * chọn đó đang bật.
 */
function itemCandidates(
  data: GameData,
  inventory: Inventory,
  options: GameOptions
): ShopCandidate[] {
  const candidates: ShopCandidate[] = []
  for (const item of Object.values(data.items)) {
    // Tinh thể, sách (ứng viên riêng) và vật phẩm chìa khóa không có price, không bán theo id.
    if (!('price' in item)) continue
    if (!item.shop || item.shopWeight === undefined) continue
    if (item.requiresKeyItemId && !inventory.stacks[item.requiresKeyItemId]) continue
    if (!isItemOffered(item, options)) continue
    const storage = item.category === 'equipment' ? 'equipment' : 'stack'
    candidates.push({ ref: { storage, itemId: item.id }, weight: item.shopWeight })
  }
  return candidates
}

/**
 * Tinh thể cấp 1 của mọi trait có tinh thể; trọng số của loại chia đều cho các trait của loại. Chỉ
 * phụ thuộc dữ liệu nên tính một lần cho mỗi bộ dữ liệu (lọc lại mọi trait mỗi lần vào thị trấn).
 */
function crystalCandidates(data: GameData): readonly ShopCandidate[] {
  const cached = crystalCache.get(data)
  if (cached) return cached
  const candidates = buildCrystalCandidates(data)
  crystalCache.set(data, candidates)
  return candidates
}

const crystalCache = new WeakMap<GameData, readonly ShopCandidate[]>()

function buildCrystalCandidates(data: GameData): ShopCandidate[] {
  const traits = Object.values(data.traits)
  const candidates: ShopCandidate[] = []
  for (const kind of CRYSTAL_TRAIT_KINDS) {
    const ofKind = traits.filter((trait) => trait.kind === kind)
    const weight = data.config.shop.crystalWeights[kind] / ofKind.length
    for (const trait of ofKind) {
      const ref: StackableItemRef = {
        storage: 'crystal',
        traitId: trait.id,
        level: SHOP_CRYSTAL_LEVEL
      }
      candidates.push({ ref, weight })
    }
  }
  return candidates
}

/**
 * Skill bán Bí kíp ở kệ sách: có sách, power ≤ shopMaxPower, có trong ít nhất một learnset (skill chỉ
 * học qua sách kiểu Move Tutor không bán). Tính một lần cho mỗi bộ dữ liệu.
 */
const shelfCache = new WeakMap<GameData['skills'], ShopCandidate[]>()

/**
 * Ứng viên kệ sách: trọng số của bậc hiếm (shopWeight) chia đều cho các skill của bậc, nên thêm
 * skill mới không làm bậc khác khó kiếm hơn.
 */
function bookCandidates(data: GameData): ShopCandidate[] {
  const cached = shelfCache.get(data.skills)
  if (cached) return cached
  const { shopMaxPower, shopRareSkillFactor } = data.config.skillBook
  const byTier = new Map<string, Skill[]>()
  for (const skill of Object.values(data.skills)) {
    if (!isBookableSkill(data, skill)) continue
    const tierId = skillBookRarityOf(data, skill.id).id
    byTier.set(tierId, [...(byTier.get(tierId) ?? []), skill])
  }
  const candidates: ShopCandidate[] = []
  for (const tier of data.config.skillBook.rarities) {
    const skills = byTier.get(tier.id) ?? []
    for (const skill of skills) {
      const ref: StackableItemRef = { storage: 'book', skillId: skill.id, reusable: false }
      // Chiêu quá mạnh / không loài nào học: vẫn có cơ hội lên kệ nhưng hiếm (chợ đen dễ gặp hơn).
      const rare = skill.power > shopMaxPower || skillLearnerCount(data, skill.id) === 0
      const weight = (tier.shopWeight / skills.length) * (rare ? shopRareSkillFactor : 1)
      candidates.push({ ref, weight })
    }
  }
  shelfCache.set(data.skills, candidates)
  return candidates
}

/** Chọn lần lượt count món theo trọng số, không trùng (ứng viên trọng số 0 bị bỏ). */
function pickDistinct(
  rng: RngState,
  candidates: readonly ShopCandidate[],
  count: number
): [ShopCandidate[], RngState] {
  let remaining = candidates.filter((c) => c.weight > 0)
  let next = rng
  const picked: ShopCandidate[] = []
  while (picked.length < count && remaining.length > 0) {
    let chosen: ShopCandidate
    ;[chosen, next] = pickWeighted(next, remaining, (c) => c.weight)
    remaining = remaining.filter((c) => c !== chosen)
    picked.push(chosen)
  }
  return [picked, next]
}

/**
 * Kệ sách của cửa hàng: số Bí kíp tung đều trong [shopMin, shopMax] (tách khỏi hàng thường để sách
 * không lấn thuốc / bóng). Sách quái trong đội dùng được nhân trọng số partyMultiplier (hơn 1.800
 * skill nên chọn đều thì gần như không gặp đúng skill cần). shopMax = 0 thì không có kệ, không tốn RNG.
 */
function rollBookShelf(
  data: GameData,
  rng: RngState,
  party: readonly Monster[]
): [StackableItemRef[], RngState] {
  const { shopMin, shopMax, partyMultiplier } = data.config.skillBook
  if (shopMax === 0) return [[], rng]
  const candidates = bookCandidates(data).map((candidate) =>
    candidate.ref.storage === 'book' &&
    isSkillBookUsefulForParty(data, party, candidate.ref.skillId)
      ? { ...candidate, weight: candidate.weight * partyMultiplier }
      : candidate
  )
  const [size, afterSize] = nextInt(rng, shopMin, shopMax)
  const [picked, next] = pickDistinct(afterSize, candidates, size)
  return [picked.flatMap((c) => (c.ref.storage === 'equipment' ? [] : [c.ref])), next]
}

/**
 * Tầng cao nhất (bậc trang bị) và bộ đếm id món trang bị, cho món trang bị trong danh sách; túi đồ
 * để biết vật phẩm chìa khóa đã có (món requiresKeyItemId); tùy chọn luật chơi (món requiresOption).
 */
export interface ShopStockCounters {
  highestFloor: number
  nextItemId: number
  inventory: Inventory
  options: GameOptions
  /** Đội hiện tại: kệ sách ưu tiên sách quái trong đội dùng được; bỏ trống = không ưu tiên. */
  party?: readonly Monster[]
}

/** Kết quả random danh sách hàng: hàng, RNG mới, bộ đếm id món trang bị mới. */
export interface ShopStockRoll {
  stock: ShopEntry[]
  rng: RngState
  nextItemId: number
}

/**
 * Random danh sách hàng: số món tung đều trong [stockMin, stockMax], chọn lần lượt theo trọng số,
 * không trùng món. Ứng viên ít hơn số món thì lấy hết các món có trọng số > 0. Trang bị được chọn
 * thì tung bậc (shopRarityWeights, có hệ số tầng) rồi tung món ngay. Sau đó tung kệ sách
 * (rollBookShelf), thêm vào cuối danh sách.
 */
export function rollShopStock(
  data: GameData,
  rng: RngState,
  counters: ShopStockCounters
): ShopStockRoll {
  const { stockMin, stockMax } = data.config.shop
  const [size, afterSize] = nextInt(rng, stockMin, stockMax)
  let next = afterSize
  let nextItemId = counters.nextItemId
  let remaining = [
    ...itemCandidates(data, counters.inventory, counters.options),
    ...crystalCandidates(data)
  ].filter((c) => c.weight > 0)
  const stock: ShopEntry[] = []
  while (stock.length < size && remaining.length > 0) {
    let chosen: ShopCandidate
    ;[chosen, next] = pickWeighted(next, remaining, (c) => c.weight)
    remaining = remaining.filter((c) => c !== chosen)
    const { ref } = chosen
    if (ref.storage !== 'equipment') {
      stock.push(ref)
      continue
    }
    const weights = data.config.equipment.shopRarityWeights
    const [rarity, afterRarity] = rollRarity(data, next, weights, counters.highestFloor)
    const id = equipmentInstanceId(nextItemId++)
    const [instance, afterRoll] = rollEquipment(data, afterRarity, {
      itemId: ref.itemId,
      rarity,
      id
    })
    next = afterRoll
    stock.push({ storage: 'instance', instance })
  }
  const [books, afterBooks] = rollBookShelf(data, next, counters.party ?? [])
  return { stock: [...stock, ...books], rng: afterBooks, nextItemId }
}

/** Vào thị trấn: đổi vị trí và random lại hàng của cửa hàng (dùng chung cho travel và thua trận). */
export function enterTown(
  data: GameData,
  state: GameState
): Pick<GameState, 'location' | 'shop' | 'rng' | 'nextItemId'> {
  const { stock, rng, nextItemId } = rollShopStock(data, state.rng, state)
  return { location: { type: 'town' }, shop: { stock }, rng, nextItemId }
}
