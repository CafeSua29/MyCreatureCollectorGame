// Registry hook của trait. Thêm cơ chế mới = thêm một handler vào TRAIT_HOOKS,
// rồi khai báo hook { type, params } trong traits.json. Không viết if/else theo id trait.
//
// Mỗi handler cài một hoặc nhiều "pha". Pha nào không cài thì trait không tác động ở pha đó.
// Mọi pha nhận scale = levelEffectScale(levelEffectStep, cấp) (tuyến tính) để áp hiệu ứng trait cấp.

import {
  asObject,
  assertNever,
  checkNumber,
  levelEffectScale,
  memoInReadOnlyScope
} from '../shared'
import { findEquipmentItem, findEquipmentLine, lineParams } from '../inventory'
import { abilityTraitId } from '../monster'
import { NON_HP_STATS, mergePartnerOf, type MoveFlag, type StageStat } from '../model'
import type {
  BattleField,
  FieldPlacement,
  FieldLayer,
  GameData,
  Monster,
  MonsterBattleContext,
  NonHpStat,
  PartialStats,
  Skill,
  SkillCategory,
  TraitHookDef,
  TraitInstance,
  TriggerLogSource,
  VolatileState
} from '../model'
import { PASSIVE_TRAIT_HOOKS, type PassiveTraitPhases } from './passiveTraitHooks'
import type { AbilityFlag } from './conditionalTraitHooks'
import {
  ARTIFACT_TRAIT_HOOKS,
  type EquipmentShare,
  type LinePotency,
  type SpellSlot
} from './artifactTraitHooks'
import { checkConditions, checkTrigger, type DslCondition, type TriggerDef } from './traitDsl'
import { checkAllConditions } from './traitConditions'
import { ACTION_TRAIT_HOOKS } from './actionTraitHooks'
import { COMBAT_TRAIT_HOOKS } from './combatTraitHooks'
import { CONDITIONAL_TRAIT_HOOKS } from './conditionalTraitHooks'
import { FORM_TRAIT_HOOKS, type DisguiseRule } from './formTraitHooks'
import { adjustBerryHook } from './berryAbilities'
import { FIELD_TRAIT_HOOKS } from './fieldTraitHooks'
import { HIT_TRAIT_HOOKS, type StatusChance } from './hitTraitHooks'
import { TURN_END_TRAIT_HOOKS } from './turnEndTraitHooks'
import { REWARD_TRAIT_HOOKS } from './rewardTraitHooks'
import { LIFESPAN_TRAIT_HOOKS } from './lifespanTraitHooks'
import { FRENZY_TRAIT_HOOKS } from './frenzyTraitHooks'
import { raceMatchesAny, raceRefIds } from './races'
import { uniformPercent } from './statPercentSources'
import { SURVIVAL_TRAIT_HOOKS, type LethalSurvival } from './survivalTraitHooks'
import { STAGE_TRAIT_HOOKS, type StageTraitEffect, type StageTraitEvent } from './stageTraitHooks'
import { percentToMultiplier, scaleStats, validatePartialStats } from './traitHookUtils'
import { bloodlineTraitOf } from './bloodlines'
import { polarityTraitOf } from './polarity'
import { affinityTierOf } from './affinityTiers'
import { activeTalents } from './talents'
import { teamBonusHooks } from './teamBonuses'

export interface TraitContext {
  data: GameData
  monster: Monster
  /** Môi trường của trận; bỏ trống = ngoài trận (trait theo môi trường không tác dụng). */
  field?: BattleField
  /** Quái đứng trên mặt đất (trait theo địa hình); chỉ cần khi có field. */
  grounded?: boolean
  /**
   * Tỉ lệ máu hiện tại / max HP trong [0, 1] (trait theo máu); bỏ trống ở lượt tính max HP
   * (computeStats tính max HP trước, rồi mới tính lại khi có trait cần tỉ lệ máu).
   */
  hpRatio?: number
  /** Bối cảnh trận của quái (lượt trên sân, đồng đội); bỏ trống = ngoài trận. */
  battle?: MonsterBattleContext
}

export interface DamageContext {
  data: GameData
  attacker: Monster
  defender: Monster
  /** Bối cảnh trận của hai bên (điều kiện, bộ đếm của trait Siralim); bỏ trống = ngoài trận. */
  attackerContext?: MonsterBattleContext
  defenderContext?: MonsterBattleContext
  /** Đòn do trait / minion gây ra (không phải lượt của quái đánh). */
  reactive?: boolean
  skill: Skill
  /** Hệ số khắc chế của đòn (0 = miễn nhiễm). */
  effectiveness: number
  /** Sức mạnh skill sau môi trường (fieldModifiers của skill). */
  power: number
  /** Tỉ lệ máu hiện tại / max HP, trong [0, 1]. */
  attackerHpRatio: number
  defenderHpRatio: number
}

/** Phần đóng góp vào chỉ số: flat cộng thẳng, percent tính bằng % (10 = +10%). */
export interface StatModifier {
  flat: PartialStats
  percent: PartialStats
}

export interface TurnEndEffect {
  /** % max HP hồi lại (âm = mất máu). */
  healPercent: number
}

/** Hào quang (hook `aura`): các hook bên trong áp lên quái khác trên sân. */
export interface AuraGrant {
  /** side: cả phe (kể cả quái phát); allies: đồng đội (không gồm nó); foes: địch trên sân. */
  scope: 'side' | 'allies' | 'foes'
  /** true = nhiều quái phát cùng hào quang thì cộng dồn; false ("does not stack") = lấy một. */
  stacks: boolean
  hooks: TraitHookDef[]
  /** Điều kiện xét trên quái phát hào quang (kiểu "nếu cả đội là X"); bỏ trống = luôn phát. */
  when?: DslCondition[]
  /** Điều kiện xét trên quái nhận (`self` = quái nhận; Flower Veil: chỉ đồng đội hệ Cỏ). */
  receiverWhen?: DslCondition[]
}

/**
 * Lúc hook làm đồ cầm tiêu hao kích hoạt (rồi đồ mất khỏi ô): trigger chạy, trụ lại khi trúng đòn
 * chí mạng, hệ số sát thương của đòn khác 1, đi trước theo tỉ lệ, bị đánh trúng (đang bay).
 */

/** Quái có cờ ability này (mọi nguồn hook, kể cả trait / đồ cầm). */
export function hasAbilityFlag(
  data: GameData,
  monster: Monster,
  flag: AbilityFlag,
  ctx?: MonsterBattleContext
): boolean {
  return hasTraitFlag(
    data,
    monster,
    (handler, params) => handler.abilityFlag?.(params) === flag,
    ctx
  )
}

/**
 * Ability theo loài của quái có cờ `flag` (chỉ xét hook của ability, không cần bối cảnh trận; dùng
 * khi dựng bối cảnh: Neutralizing Gas, Klutz).
 */
export function abilityHasFlag(
  data: GameData,
  monster: Monster,
  flag: AbilityFlag,
  overrideId?: string
): boolean {
  const id = overrideId ?? abilityTraitId(data, monster)
  return id !== null && traitHasAbilityFlag(data, id, flag)
}

/** Trait `traitId` có hook cờ ability `flag`. */
function traitHasAbilityFlag(data: GameData, traitId: string, flag: AbilityFlag): boolean {
  return data.traits[traitId].hooks.some(
    (hook) => hook.type === 'abilityFlag' && (hook.params as { flag?: string }).flag === flag
  )
}

/** Nhãn đồ cầm là berry (Belch, Bug Bite, Natural Gift, Unnerve, Ripen...). */
export const BERRY_ITEM_TAG = 'berry'

export type HeldUse = 'trigger' | 'survive' | 'damage' | 'actFirst' | 'hit' | 'charge'

export interface TraitHookHandler extends PassiveTraitPhases {
  /**
   * Lúc hook làm đồ cầm tiêu hao kích hoạt rồi đồ mất khỏi ô; bỏ trống = hook tác dụng liên tục khi
   * còn cầm, không làm mất đồ (equipment.md mục "Trang bị và đồ cầm").
   */
  heldUse?: HeldUse
  /** Trả về danh sách lỗi; rỗng nếu params hợp lệ. Gọi khi kiểm tra dữ liệu lúc khởi động. */
  validateParams(params: unknown, data: GameData): string[]
  /** Hook là hào quang: không chạy trên quái mang, chỉ phát hook bên trong (forEachTraitHook). */
  auraGrant?(params: unknown): AuraGrant
  /** Trait kích hoạt theo sự kiện (hook `trigger`): trận đấu khớp sự kiện và chạy hiệu ứng. */
  trigger?(params: unknown): TriggerDef
  /** % mạnh thêm cho mọi trait khác của quái (hệ số cấp nhân thêm). */
  traitPotencyPercent?(params: unknown, scale: number): number
  /** Pha tính chỉ số (computeStats). */
  modifyStats?(params: unknown, scale: number, ctx: TraitContext): StatModifier
  /** Hệ số nhân sát thương khi quái mang trait gây sát thương. */
  modifyDamageDealt?(params: unknown, scale: number, ctx: DamageContext): number
  /** Hệ số nhân sát thương khi quái mang trait nhận sát thương. */
  modifyDamageTaken?(params: unknown, scale: number, ctx: DamageContext): number
  /** Quái mang trait bỏ qua hệ số < 1 của trạng thái lên sát thương gây ra (kiểu Guts). */
  ignoresStatusDamagePenalty?(params: unknown): boolean
  /** Skill nạp (Solar Beam, Fly) đánh ngay trong lượt đầu (Power Herb; đồ cầm thì tiêu hao). */
  skipsChargeTurn?(params: unknown): boolean
  /** Quái mang trait không mất máu vì phản lực của skill (`recoilPercent`; kiểu Rock Head). */
  immuneToRecoil?(params: unknown): boolean
  /**
   * Cờ ability Pokémon (abilities.md): bỏ qua ability mục tiêu khi đánh (Mold Breaker), phản skill
   * `reflectable` (Magic Bounce), món không bị lấy (Sticky Hold), đòn nhiều lần luôn tối đa (Skill
   * Link), miễn hiệu ứng phụ của địch (Shield Dust), đòn tiếp xúc xuyên bảo vệ (Unseen Fist), không
   * bị nhử đòn (Stalwart), bỏ qua bậc của đối thủ (Unaware), bỏ qua màn chắn (Infiltrator).
   */
  abilityFlag?(params: unknown): AbilityFlag
  /**
   * Dạng trước khi dùng skill (Stance Change; battle-forms.md): id dạng, null = về dạng thường,
   * undefined = không đổi. `speciesId`: loài hiện tại của quái (khóa bảng dạng).
   */
  formForSkill?(params: unknown, speciesId: string, skill: Skill): string | null | undefined
  /** Dạng nhận khi rời sân, giữ tới hết trận (Zero to Hero); undefined = không đổi. */
  formOnLeave?(params: unknown, speciesId: string): string | undefined
  /** Dạng chặn đòn đầu loại `category` khi còn ở dạng thường (Disguise, Ice Face); null = không. */
  disguiseRule?(params: unknown, speciesId: string, category: SkillCategory): DisguiseRule | null
  /** Miễn skill mang các cờ chiêu này (Overcoat: chiêu bột). */
  immuneMoveFlags?(params: unknown): readonly MoveFlag[]
  /** Đánh trúng hệ miễn nhiễm bằng skill các hệ này (Scrappy: Thường / Giác đấu trúng Ma). */
  hitsImmuneWith?(params: unknown, elementId: string): boolean
  /** Đổi hệ skill của quái mang (Pixilate: Thường → Tiên, +20%); null = không đổi. */
  /** Hệ số cân nặng trong trận (Heavy Metal ×2, Light Metal ×½). */
  weightMultiplier?(params: unknown): number
  convertsSkillElement?(
    params: unknown,
    skill: Skill
  ): { elementId: string; percent: number } | null
  /** Pha modifyStats của hook cần `hpRatio` (computeStats tính lại bước trait khi có). */
  needsHpRatio?: boolean
  /** % thủ của mục tiêu được bỏ qua khi quái mang trait đánh (cộng dồn, kẹp 100). */
  defenseIgnoredPercent?(params: unknown, scale: number): number
  /** Hệ số STAB thay cho STAB chung nếu lớn hơn (lấy lớn nhất, không cộng dồn). */
  stabMultiplier?(params: unknown, scale: number): number
  /** % cộng vào tỉ lệ chí mạng của quái mang trait (tương đối: 100 = gấp đôi). */
  critChancePercent?(params: unknown, scale: number): number
  /** Bậc chí mạng cộng thêm (hook critStage, kiểu Super Luck). */
  critStages?(params: unknown): number
  /** % cộng vào hệ số chí mạng của quái mang trait. */
  critDamagePercent?(params: unknown, scale: number): number
  /** Quái mang trait không bị chí mạng. Không đổi theo cấp trait. */
  blocksCritical?(params: unknown): boolean
  /** % cộng vào accuracy skill của quái mang trait. */
  accuracyPercent?(params: unknown, scale: number): number
  /** % né đòn của quái mang trait (cộng dồn, kẹp 100). */
  evasionPercent?(params: unknown, scale: number): number
  /** Cuối mỗi lượt, với quái còn trên sân. */
  onTurnEnd?(params: unknown, scale: number, ctx: TraitContext): TurnEndEffect
  /** Điểm % cộng vào tỉ lệ fuse thành công, áp từ trait của quái gốc (mục Fusing). */
  modifyFuseChance?(params: unknown, scale: number, ctx: TraitContext): number
  /** Hệ số nhân tỉ lệ bắt, áp từ trait của quái hoang bị ném bóng. */
  modifyCatchRate?(params: unknown, scale: number, ctx: TraitContext): number
  /** Các trạng thái quái mang trait không bị dính (không đổi theo cấp trait). */
  immuneStatusIds?(params: unknown): readonly string[]
  /** Miễn nhiễm skill hệ này (sát thương 0, như khắc hệ ×0). Không đổi theo cấp trait. */
  immuneToElement?(params: unknown, elementId: string): boolean
  /** Quái không đứng trên mặt đất (kiểu Levitate): địa hình không tác dụng. */
  isAirborne?(params: unknown): boolean
  /** Skill của quái mang hook luôn trúng (Lock-On, Mind Reader; No Guard). */
  hitsSurely?(params: unknown): boolean
  /** Skill nhắm quái mang hook luôn trúng (Telekinesis; No Guard). */
  surelyHit?(params: unknown): boolean
  /** Skill hệ này không bị miễn nhiễm vì hệ của quái mang hook (Foresight: Thường / Giác đấu lên Ma). */
  immunityRemovedFor?(params: unknown, elementId: string): boolean
  /** Bậc né của quái mang hook không tính (Foresight, Miracle Eye). */
  evasionIgnored?(params: unknown): boolean
  /** Quái không bị ép rời sân (Ingrain, Suction Cups). */
  resistsForceSwitch?(params: unknown): boolean
  /** Quái không đổi quái / chạy trốn được (Bind, Mean Look; Shadow Tag qua hào quang lên địch). */
  isTrapped?(params: unknown, elementIds: readonly string[]): boolean
  /** Quái bị ép đứng trên mặt đất, thắng isAirborne và hệ bay (Smack Down). */
  isForcedGrounded?(params: unknown): boolean
  /** Skill hệ `elementId` không bị miễn nhiễm vì quái mang hook đang bay (Smack Down: hệ Đất). */
  removesAirborneImmunity?(params: unknown, elementId: string): boolean
  /**
   * Miễn sát thương môi trường (Overcoat). `fieldId` bỏ trống = hỏi miễn mọi môi trường; có =
   * hỏi riêng môi trường đó (Sand Veil chỉ miễn bão cát).
   */
  immuneToFieldDamage?(params: unknown, fieldId?: string): boolean
  /**
   * Số lượt mặc định khi quái mang hook đặt môi trường `fieldId` (Damp Rock: mưa 8 lượt);
   * undefined = không kéo dài.
   */
  fieldTurns?(params: unknown, fieldId: string, layer: FieldLayer): number | undefined
  /**
   * Thời tiết mà đồ cầm mang hook che cho quái cầm (Utility Umbrella: mưa, nắng): trait, chỉ số,
   * skill của nó và hệ số sát thương lên nó coi như trời mặc định. Chỉ xét trên đồ cầm.
   */
  shieldedWeatherIds?(params: unknown): readonly string[]
  /** Môi trường đặt khi quái vào sân (kiểu Drizzle); số lượt không đổi theo cấp trait. */
  fieldOnEntry?(params: unknown): FieldPlacement
  /**
   * Điểm lợi (+1) / hại (−1) cho AI khi môi trường `fieldId` có mặt (mục "AI trận đấu":
   * aiValue của setField); 0 = không liên quan.
   */
  fieldBenefit?(params: unknown, fieldId: string): number
  /** Đổi bậc khi `event` xảy ra với quái mang trait (vào sân, cuối lượt, hạ gục, bị hạ bậc). */
  stageOnEvent?(params: unknown, event: StageTraitEvent): StageTraitEffect | null
  /** Quái khác không hạ được bậc chỉ số này của quái mang trait. Không đổi theo cấp trait. */
  blocksStatLower?(params: unknown, stat: StageStat): boolean
  /** % sát thương đã gây được hồi lại khi quái mang trait đánh trúng địch. */
  lifestealPercent?(params: unknown, scale: number): number
  /** Ngưỡng % máu: địch bị quái mang trait đánh còn máu ≤ ngưỡng thì gục ngay. Không đổi theo cấp. */
  executeBelowPercent?(params: unknown): number
  /** Trạng thái quái mang trait gây lên địch khi đánh trúng bằng skill loại `category`. */
  attackStatuses?(params: unknown, scale: number, category: SkillCategory): StatusChance[]
  /** Trạng thái quái đánh dính khi đánh trúng quái mang trait bằng skill loại `category`. */
  hitStatuses?(params: unknown, scale: number, category: SkillCategory): StatusChance[]
  /** % max HP của quái đánh mà nó mất khi đánh trúng quái mang trait bằng skill loại `category`. */
  retaliatePercent?(params: unknown, scale: number, category: SkillCategory): number
  /** % max HP quái mang trait tự mất sau một lần dùng skill gây sát thương (kiểu Life Orb). */
  recoilPercent?(params: unknown, scale: number): number
  /** Dùng skill nào thì chỉ được dùng skill đó tới khi rời sân (kiểu Choice Band). */
  locksChoice?(params: unknown): boolean
  /** Ô spell của Artifact (Siralim): spell tự dùng sau khi tấn công theo tỉ lệ. */
  spellSlot?(params: unknown, scale: number): SpellSlot
  /** Điểm % cộng vào tỉ lệ kích hoạt ô spell (Battle Born). */
  spellSlotChanceBonus?(params: unknown, scale: number): number
  /** Số lần dùng thêm khi ô spell kích hoạt (Celebrate Decline). */
  spellSlotExtraCasts?(params: unknown): number
  /** % một lần tung thêm, độc lập, của ô spell sau khi tấn công (Overcome). */
  extraSpellSlotRollChance?(params: unknown, scale: number): number
  /** Dòng trang bị cho thêm trait (Artifact's trait), cấp = giá trị dòng. */
  grantedTrait?(params: unknown): { traitId: string; level: number }
  /** Hệ số dòng trang bị theo nhãn (Imbue, Warcraft...). */
  linePotency?(params: unknown, scale: number): LinePotency
  /** Hào quang chia % chỉ số trang bị của quái phát (Honed Blades, Dissection...). */
  equipmentShare?(params: unknown, scale: number): EquipmentShare
  /** % max HP quái mang trait hồi khi hạ gục một địch bằng skill. */
  knockoutHealPercent?(params: unknown, scale: number): number
  /** % max HP của quái đánh mà nó mất khi hạ gục quái mang trait bằng skill. */
  knockedOutRetaliatePercent?(params: unknown, scale: number): number
  /** % tăng tỉ lệ hiệu ứng phụ (hiệu ứng skill có chance < 100) của quái mang trait. */
  secondaryChancePercent?(params: unknown, scale: number): number
  /** Cách trụ lại 1 máu trước đòn skill đủ hạ gục quái mang trait; null = không thỏa điều kiện. */
  lethalSurvival?(params: unknown, scale: number, ctx: { fullHp: boolean }): LethalSurvival | null
  /** % max HP quái mang trait sống lại khi gục (một lần mỗi trận). */
  revivePercent?(params: unknown, scale: number): number
  /** % mất lượt khi quái mang trait tới lượt dùng skill. */
  skipTurnChancePercent?(params: unknown, scale: number): number
  /** Quái mang trait mất lượt dùng skill xen kẽ, từ lượt thứ hai trên sân (kiểu Truant). */
  skipsAlternateTurns?(params: unknown): boolean
  /** % quái mang trait dùng skill ngẫu nhiên thay cho lệnh đã chọn. */
  randomSkillChancePercent?(params: unknown, scale: number): number
  /** Quái mang trait đi sau quái không mang trong cùng mức priority (Stall). */
  actsLast?(params: unknown): boolean
  /** % đi trước mọi quái cùng mức priority (Quick Claw) theo tỉ lệ máu; undefined = không thỏa. */
  actFirstChancePercent?(params: unknown, scale: number, hpRatio: number): number | undefined
  /** Priority cộng thêm cho skill loại `category` của quái mang trait. Không đổi theo cấp. */
  priorityBonus?(params: unknown, category: SkillCategory): number
  /** Priority cộng theo skill / máu (Gale Wings: hệ Bay khi đầy máu; Triage: skill hồi máu). */
  conditionalPriorityBonus?(params: unknown, skill: Skill, fullHp: boolean): number
  /**
   * Skill loại `category` được hook này cộng priority thì thất bại lên quái phe địch mang một
   * trong các hệ `targetElementIds` (Prankster trước hệ Bóng tối).
   */
  boostFailsAgainst?(
    params: unknown,
    category: SkillCategory,
    targetElementIds: readonly string[]
  ): boolean
  /** % chạy trốn thành công khi quái ta mang trait đang trên sân (kiểu Run Away). */
  fleeChancePercent?(params: unknown, scale: number): number
  /** Cuối lượt: % quái mang trait tự bỏ chạy theo tỉ lệ máu; undefined = không thỏa ngưỡng. */
  lowHpFleeChancePercent?(params: unknown, scale: number, hpRatio: number): number | undefined
  /** % cộng vào tỉ lệ rơi đồ khi thắng, từ quái ta mang trait trong đội (kiểu Pickup). */
  dropChancePercent?(params: unknown, scale: number): number
  /** % EXP quái mang trait nhận thêm (âm = bớt). */
  expGainPercent?(params: unknown, scale: number): number
  /** % tiền thưởng khi thắng cộng thêm, từ quái ta mang trait đã tham chiến. */
  moneyPercent?(params: unknown, scale: number): number
  /** % lượng thân mật tăng của quái mang hook (không nhân lượng giảm; docs/rules/affinity.md). */
  affinityGainPercent?(params: unknown, scale: number): number
  /** Breed: con nhận tính cách của bố / mẹ mang hook (Bất Biến Thạch; docs/rules/natures.md). */
  passesNature?(params: unknown): boolean
  /** Điểm nỗ lực cộng thêm mỗi quái bị hạ / bị bắt (docs/rules/effort-values.md). */
  effortBonus?(params: unknown): PartialStats
  /** % điểm nỗ lực quái mang hook nhận khi thắng (docs/rules/effort-values.md). */
  effortGainPercent?(params: unknown, scale: number): number
  /** Số trận trứng giảm thêm mỗi trận thắng khi quái mang trait ở trong đội. Không đổi theo cấp. */
  eggHatchExtra?(params: unknown): number
  /** % thọ nguyên của quái mang trait (âm = bớt; LIFESPAN_MODIFIERS ở lifespan.ts). */
  lifespanPercent?(params: unknown, scale: number): number
  /** Điểm % cộng vào ngưỡng HP kích hoạt cuồng bạo (docs/rules/frenzy.md). */
  frenzyThresholdPercent?(params: unknown, scale: number): number
  /** Quái mang hook không bao giờ cuồng bạo. */
  preventsFrenzy?(params: unknown): boolean
  /** Cuối lượt: % max HP mỗi địch còn sống trên sân mất (của chính địch đó). */
  foeTurnEndDamagePercent?(params: unknown, scale: number): number
  /** Cuối lượt: % max HP quái mang trait tự mất, theo tỉ lệ máu hiện tại (0 = không mất). */
  selfTurnEndDamagePercent?(params: unknown, scale: number, hpRatio: number): number
  /** Cuối lượt: % chữa mọi trạng thái của quái mang trait (kiểu Shed Skin). */
  turnEndCureChance?(params: unknown, scale: number): number
  /** Rời sân còn sống hoặc hết trận thì chữa mọi trạng thái (kiểu Natural Cure). */
  curesStatusOnLeave?(params: unknown): boolean
  /** % max HP hồi khi rời sân còn sống (Regenerator: 33). */
  leaveHealPercent?(params: unknown, scale: number): number
  /** Không mất máu vì nguồn gián tiếp: trạng thái, môi trường, bẫy, phản đòn (kiểu Magic Guard). */
  immuneToIndirectDamage?(params: unknown): boolean
  /** Hút skill hệ `elementId` của địch: % max HP hồi, có tăng sát thương không; null = không hút. */
  absorbs?(params: unknown, scale: number, elementId: string): AbsorbEffect | null
  /** % tăng sát thương skill hệ `elementId` sau khi đã hút (kiểu Flash Fire). */
  absorbBoostPercent?(params: unknown, scale: number, elementId: string): number
}

/** Kết quả một trait hút skill (absorbElement). */
export interface AbsorbEffect {
  /** % max HP hồi (đã nhân hệ số cấp, kẹp 100). */
  healPercent: number
  /** Hút xong thì tăng sát thương skill các hệ đó tới khi rời sân. */
  boosts: boolean
  /** Bậc tăng khi hút (Lightning Rod, Motor Drive). */
  stages: readonly { stat: StageStat; delta: number }[]
}

// ---------- statModifier: cộng / nhân % chỉ số cố định ----------

interface StatModifierParams {
  flat?: PartialStats
  percent?: PartialStats
}

const statModifier: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    if (obj.flat === undefined && obj.percent === undefined)
      return ['cần ít nhất flat hoặc percent']
    return [
      ...validatePartialStats(obj.flat, 'flat'),
      ...validatePartialStats(obj.percent, 'percent')
    ]
  },
  modifyStats(params, scale) {
    const { flat, percent } = params as StatModifierParams
    return { flat: scaleStats(flat, scale), percent: scaleStats(percent, scale) }
  }
}

// ---------- damageVsRace: tăng sát thương lên race mục tiêu (kiểu "Diệt rồng") ----------

interface DamageVsRaceParams {
  raceIds: string[]
  percent: number
}

const damageVsRace: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.percent, 'percent')
    if (!Array.isArray(obj.raceIds) || obj.raceIds.length === 0) {
      issues.push('raceIds phải là danh sách không rỗng')
    } else {
      const known = raceRefIds(data)
      for (const raceId of obj.raceIds) {
        if (!(raceId in known)) issues.push(`raceIds: race không tồn tại "${raceId}"`)
      }
    }
    return issues
  },
  modifyDamageDealt(params, scale, { data, defender }) {
    const { raceIds, percent } = params as DamageVsRaceParams
    return raceMatchesAny(data, defender.raceId, raceIds) ? percentToMultiplier(percent * scale) : 1
  }
}

// ---------- damageTakenModifier: giảm / tăng sát thương nhận vào ----------

const damageTakenModifier: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent') : ['params phải là object']
  },
  modifyDamageTaken(params, scale) {
    return percentToMultiplier((params as { percent: number }).percent * scale)
  }
}

// ---------- regen: hồi % max HP cuối lượt ----------

const regen: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent') : ['params phải là object']
  },
  onTurnEnd(params, scale) {
    return { healPercent: (params as { percent: number }).percent * scale }
  }
}

// ---------- catchRateModifier: tăng / giảm tỉ lệ bị bắt ----------

const catchRateModifier: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent') : ['params phải là object']
  },
  modifyCatchRate(params, scale) {
    return percentToMultiplier((params as { percent: number }).percent * scale)
  }
}

// ---------- fuseChanceBonus: + điểm % fuse thành công khi làm quái gốc ----------

const fuseChanceBonus: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.points, 'points') : ['params phải là object']
  },
  modifyFuseChance(params, scale) {
    return (params as { points: number }).points * scale
  }
}

// ---------- statusImmunity: miễn một số trạng thái bất thường ----------

const statusImmunity: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    if (!Array.isArray(obj.statusIds) || obj.statusIds.length === 0) {
      return ['statusIds phải là danh sách không rỗng']
    }
    return obj.statusIds.flatMap((statusId) =>
      typeof statusId === 'string' && statusId in data.statuses
        ? []
        : [`statusIds: trạng thái không tồn tại "${String(statusId)}"`]
    )
  },
  immuneStatusIds(params) {
    return (params as { statusIds: string[] }).statusIds
  }
}

// ---------- aura: hào quang lên quái khác trên sân ----------

/** Pha của hook không dùng được trong hào quang (gắn với chính quái mang / ngoài trận). */
const AURA_FORBIDDEN_TYPES = new Set(['aura', 'catchRateModifier', 'fuseChanceBonus'])

/**
 * Danh sách hook chỉ có tác dụng trong trận (bên trong hào quang, cộng hưởng đội, trận pháp): không
 * rỗng, hook có trong registry và hợp lệ, không phải hook gắn với chính quái mang / ngoài trận, không
 * đổi hp (max HP không được phụ thuộc bối cảnh trận, mục "Trait Siralim"). `owner`: tên nơi chứa
 * trong thông báo.
 */
export function checkBattleOnlyHooks(hooks: unknown, owner: string, data: GameData): string[] {
  if (!Array.isArray(hooks) || hooks.length === 0) return ['hooks phải là danh sách không rỗng']
  const issues: string[] = []
  hooks.forEach((entry, i) => {
    const hook = asObject(entry)
    const type = hook?.type
    if (typeof type !== 'string' || !Object.hasOwn(TRAIT_HOOKS, type)) {
      issues.push(`hooks[${i}]: hook "${String(type)}" chưa có trong registry`)
      return
    }
    if (AURA_FORBIDDEN_TYPES.has(type)) {
      issues.push(`hooks[${i}]: hook "${type}" không dùng được trong ${owner}`)
      return
    }
    for (const problem of TRAIT_HOOKS[type].validateParams(hook?.params, data)) {
      issues.push(`hooks[${i}] (${type}): ${problem}`)
    }
    const percent = asObject(asObject(hook?.params)?.percent)
    const flat = asObject(asObject(hook?.params)?.flat)
    if (type === 'statModifier' && (percent?.hp !== undefined || flat?.hp !== undefined)) {
      issues.push(`hooks[${i}]: ${owner} không được đổi hp`)
    }
  })
  return issues
}

const aura: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues: string[] = []
    if (obj.scope !== 'side' && obj.scope !== 'allies' && obj.scope !== 'foes') {
      issues.push('scope phải là "side" / "allies" / "foes"')
    }
    if (obj.stacks !== undefined && obj.stacks !== true) issues.push('stacks chỉ được là true')
    issues.push(...checkConditions(obj.when, 'when', data))
    issues.push(...checkConditions(obj.receiverWhen, 'receiverWhen', data))
    return [...issues, ...checkBattleOnlyHooks(obj.hooks, 'hào quang', data)]
  },
  auraGrant(params) {
    const { scope, stacks, hooks, when, receiverWhen } = params as {
      scope: AuraGrant['scope']
      stacks?: true
      hooks: TraitHookDef[]
      when?: DslCondition[]
      receiverWhen?: DslCondition[]
    }
    return { scope, stacks: stacks === true, hooks, when, receiverWhen }
  }
}

// ---------- trigger: kích hoạt theo sự kiện (mục "Trait Siralim") ----------

const trigger: TraitHookHandler = {
  heldUse: 'trigger',
  validateParams: (params, data) => checkTrigger(params, data),
  trigger: (params) => params as TriggerDef
}

// ---------- traitPotency: trait khác của quái mạnh thêm % ----------

const traitPotency: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', -100) : ['params phải là object']
  },
  traitPotencyPercent: (params, scale) => (params as { percent: number }).percent * scale
}

// ---------- Registry ----------

export const TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  statModifier,
  damageVsRace,
  damageTakenModifier,
  regen,
  catchRateModifier,
  fuseChanceBonus,
  statusImmunity,
  ...FIELD_TRAIT_HOOKS,
  ...COMBAT_TRAIT_HOOKS,
  ...CONDITIONAL_TRAIT_HOOKS,
  ...FORM_TRAIT_HOOKS,
  ...STAGE_TRAIT_HOOKS,
  ...HIT_TRAIT_HOOKS,
  ...SURVIVAL_TRAIT_HOOKS,
  ...ACTION_TRAIT_HOOKS,
  ...TURN_END_TRAIT_HOOKS,
  ...REWARD_TRAIT_HOOKS,
  ...LIFESPAN_TRAIT_HOOKS,
  ...FRENZY_TRAIT_HOOKS,
  ...PASSIVE_TRAIT_HOOKS,
  ...ARTIFACT_TRAIT_HOOKS,
  aura,
  trigger,
  traitPotency
}

/**
 * Nguồn của một hook trait (log, hệ số, % chỉ số theo nguồn): trait, trait race, trạng thái, trait
 * tạm, minion, hào quang, trang bị (dòng của món), đồ cầm.
 */
export const HOOK_SOURCE_KINDS = [
  'trait',
  'race',
  'ability',
  'status',
  'gained',
  'minion',
  'aura',
  'equipment',
  'held',
  'affinity',
  'talent',
  'synergy',
  'formation',
  'partner',
  'frenzy',
  'collection',
  'meal',
  'blessing',
  'bloodline',
  'polarity',
  'implant',
  'rule'
] as const

export type HookSourceKind = (typeof HOOK_SOURCE_KINDS)[number]

/** Nguồn hook ghi vào log traitTriggered (trait / trait race / trait tạm / hào quang thì không ghi). */
export function triggerLogSource(kind: HookSourceKind): TriggerLogSource | undefined {
  switch (kind) {
    case 'status':
    case 'minion':
    case 'equipment':
    case 'held':
    case 'affinity':
    case 'talent':
    case 'synergy':
    case 'formation':
    case 'partner':
    case 'implant':
      return kind
    case 'trait':
    case 'race':
    case 'bloodline':
    case 'polarity':
    case 'ability':
    case 'gained':
    case 'aura':
    case 'frenzy':
    case 'collection':
    case 'meal':
    case 'blessing':
    case 'rule':
      // Cuồng bạo có log riêng (`frenzy`) lúc kích hoạt; thưởng sưu tập / món ăn không kích hoạt.
      return undefined
    default:
      return assertNever(kind, 'nguồn hook')
  }
}

export interface HookSource {
  kind: HookSourceKind
  /** Quái có nguồn hook (hào quang: quái phát hào quang). */
  ownerId: string
  /** Số stack (minion). */
  stacks?: number
}

export type TraitHookFn = (
  handler: TraitHookHandler,
  params: unknown,
  scale: number,
  /** Id của trait / trạng thái / minion sinh ra hook (log hiệu ứng nào tác dụng). */
  sourceId: string,
  source: HookSource
) => void

/** Quái có trait nào trả true cho pha bật / tắt `check` không. */
export function hasTraitFlag(
  data: GameData,
  monster: Monster,
  check: (handler: TraitHookHandler, params: unknown) => boolean | undefined,
  ctx?: MonsterBattleContext
): boolean {
  let found = false
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      if (check(handler, params)) found = true
    },
    ctx
  )
  return found
}

/** Trait race của quái: suy ra từ raceId, không lưu trong save (mục Trait ở stats-traits.md). */
export function raceTraitIds(data: GameData, monster: Monster): readonly string[] {
  return data.races[monster.raceId].traitIds
}

/** Dòng trang bị sinh ra hook (hệ số dòng theo nhãn, Siralim). */
interface LineMeta {
  tags: readonly string[]
  /** Dòng đầu tiên mang nhãn `stat` của quái (Aura Boost). */
  firstStat: boolean
  /** Dòng có tăng HP (Reticence bỏ qua). */
  touchesHp: boolean
}

interface OwnHook {
  hook: TraitHookDef
  scale: number
  sourceId: string
  source: HookSource
  line?: LineMeta
}

/** Dòng có tăng HP: đường dẫn giá trị trỏ vào hp. */
const lineTouchesHp = (valueParam: string | readonly string[]): boolean =>
  (typeof valueParam === 'string' ? [valueParam] : valueParam).some((path) =>
    path.split('.').includes('hp')
  )

/**
 * Hook của món đang lắp: dòng trang bị (hệ số theo cấp món, như trait; id nguồn là id món gốc) và đồ
 * cầm (hệ số 1, nguồn `held`, id nguồn là id item). Room kiểu Magic Room (`itemsDisabled`) tắt mọi
 * món.
 */
function equipmentHooks(
  data: GameData,
  monster: Monster,
  {
    berriesBlocked = false,
    abilityId = null
  }: { berriesBlocked?: boolean; abilityId?: string | null } = {}
): OwnHook[] {
  const berryAdjust = {
    ripe: abilityId !== null && traitHasAbilityFlag(data, abilityId, 'ripensBerries'),
    early: abilityId !== null && traitHasAbilityFlag(data, abilityId, 'eatsBerriesEarly')
  }
  const result: OwnHook[] = []
  let seenStatLine = false
  for (const entry of monster.equipment) {
    if (entry.storage === 'stack') {
      const item = data.items[entry.itemId]
      if (item?.category !== 'held') continue
      // Đồ chỉ hợp loài (Leek): quái loài khác cầm thì không có tác dụng, như Pokémon.
      if (item.speciesIds && !item.speciesIds.includes(monster.baseSpeciesId)) continue
      // Unnerve của địch: berry không tác dụng (không ăn được).
      const berry = (item.tags ?? []).includes(BERRY_ITEM_TAG)
      if (berry && berriesBlocked) continue
      for (const hook of item.hooks) {
        result.push({
          hook: berry ? adjustBerryHook(hook, berryAdjust) : hook,
          scale: 1,
          sourceId: item.id,
          source: { kind: 'held', ownerId: monster.id }
        })
      }
      continue
    }
    const { instance } = entry
    const item = findEquipmentItem(data, instance.baseItemId)
    if (!item) continue
    const scale = levelEffectScale(data.config.levelEffectStep, instance.level)
    // Hook cố định của món: không đổi theo cấp.
    for (const hook of item.hooks ?? []) {
      result.push({
        hook,
        scale: 1,
        sourceId: item.id,
        source: { kind: 'equipment', ownerId: monster.id }
      })
    }
    for (const roll of instance.rolls) {
      const line = findEquipmentLine(data, item, roll.lineId, instance.soul)
      if (!line) continue
      const tags = line.tags ?? []
      const meta: LineMeta = {
        tags,
        firstStat: tags.includes('stat') && !seenStatLine,
        touchesHp: lineTouchesHp(line.valueParam)
      }
      if (tags.includes('stat')) seenStatLine = true
      const hook = { type: line.hook.type, params: lineParams(line, roll.value) }
      const source: HookSource = { kind: 'equipment', ownerId: monster.id }
      // Dòng "trait của Artifact": chạy hook của trait đó với cấp = giá trị dòng.
      const granted = TRAIT_HOOKS[hook.type]?.grantedTrait?.(hook.params)
      if (granted) {
        const traitScale = levelEffectScale(data.config.levelEffectStep, granted.level)
        for (const traitHook of data.traits[granted.traitId].hooks) {
          result.push({ hook: traitHook, scale: traitScale, sourceId: item.id, source, line: meta })
        }
        continue
      }
      result.push({ hook, scale, sourceId: item.id, source, line: meta })
    }
  }
  return result
}

/**
 * % chỉ số từ trang bị của quái (cộng các dòng chỉ số, đã nhân hệ số cấp món; không gồm hệ số dòng
 * theo nhãn): hào quang chia chỉ số trang bị (Honed Blades) và bộ đếm của ngôn ngữ trait.
 */
export function equipmentStatPercents(data: GameData, monster: Monster): Record<NonHpStat, number> {
  const result = Object.fromEntries(NON_HP_STATS.map((stat) => [stat, 0])) as Record<
    NonHpStat,
    number
  >
  for (const { hook, scale } of equipmentHooks(data, monster)) {
    const modifier = TRAIT_HOOKS[hook.type]?.modifyStats?.(hook.params, scale, { data, monster })
    for (const stat of NON_HP_STATS) result[stat] += modifier?.percent[stat] ?? 0
  }
  return result
}

/** Trait quái có từ trang bị (dòng "trait của Artifact"): id và cấp (Master of Smiths chia cho đồng đội). */
export function equipmentTraitInstances(data: GameData, monster: Monster): TraitInstance[] {
  const result: TraitInstance[] = []
  for (const entry of monster.equipment) {
    if (entry.storage !== 'instance') continue
    const item = findEquipmentItem(data, entry.instance.baseItemId)
    if (!item) continue
    for (const roll of entry.instance.rolls) {
      const line = findEquipmentLine(data, item, roll.lineId, entry.instance.soul)
      const granted =
        line && TRAIT_HOOKS[line.hook.type]?.grantedTrait?.(lineParams(line, roll.value))
      if (granted) result.push({ id: granted.traitId, level: granted.level })
    }
  }
  return result
}

/** Số dòng chỉ số (nhãn `stat`) của trang bị có tăng chỉ số `stat` (Perishing Salvo). */
export function equipmentStatLineCount(data: GameData, monster: Monster, stat: NonHpStat): number {
  let count = 0
  for (const { hook, scale, line } of equipmentHooks(data, monster)) {
    if (!line?.tags.includes('stat')) continue
    const modifier = TRAIT_HOOKS[hook.type]?.modifyStats?.(hook.params, scale, { data, monster })
    if ((modifier?.percent[stat] ?? 0) !== 0) count++
  }
  return count
}

/**
 * Hook của chính quái: trait đang lưu, trait race (cấp 1), trang bị đang lắp, trạng thái đang có
 * (hệ số = potency / 100), trait tạm và minion trong trận (hệ số = số stack). Thực thể hợp thể
 * (docs/rules/battle-merge.md) thêm hook lâu dài của quái phụ (trait, race, trang bị, thân mật, thiên
 * phú) như của chính nó, trừ khi `withMergePartner` = false (bước trait của chỉ số: chỉ số quái phụ
 * đã tính riêng rồi mới gộp).
 */
function ownHooks(
  data: GameData,
  monster: Monster,
  volatile?: VolatileState,
  {
    itemsDisabled = false,
    berriesBlocked = false,
    withMergePartner = true,
    abilitySuppressed = false
  }: OwnHookOptions = {}
): OwnHook[] {
  const step = data.config.levelEffectStep
  const result: OwnHook[] = []
  const push = (
    hooks: readonly TraitHookDef[],
    scale: number,
    sourceId: string,
    source: HookSource
  ): void => {
    for (const hook of hooks) result.push({ hook, scale, sourceId, source })
  }
  const ownerId = monster.id
  for (const instance of monster.traits) {
    push(data.traits[instance.id].hooks, levelEffectScale(step, instance.level), instance.id, {
      kind: 'trait',
      ownerId
    })
  }
  for (const id of raceTraitIds(data, monster)) {
    push(data.traits[id].hooks, 1, id, { kind: 'race', ownerId })
  }
  // Trait huyết mạch (docs/rules/bloodline.md): suy từ huyết mạch chính, cấp theo mốc độ thuần.
  const bloodlineTrait = bloodlineTraitOf(data, monster)
  if (bloodlineTrait) {
    const { id, level } = bloodlineTrait
    push(data.traits[id].hooks, levelEffectScale(step, level), id, { kind: 'bloodline', ownerId })
  }
  // Trait cực tính (docs/rules/polarity.md): luôn cấp 1, không chiếm ô.
  const polarityTrait = polarityTraitOf(monster)
  if (polarityTrait)
    push(data.traits[polarityTrait.id].hooks, 1, polarityTrait.id, { kind: 'polarity', ownerId })
  // Ability theo loài (docs/rules/abilities.md): như trait cấp 1, không đổi theo cấp.
  const abilityId = abilitySuppressed
    ? null
    : (volatile?.abilityOverride ?? abilityTraitId(data, monster))
  if (abilityId !== null)
    push(data.traits[abilityId].hooks, 1, abilityId, { kind: 'ability', ownerId })
  if (!itemsDisabled) result.push(...equipmentHooks(data, monster, { berriesBlocked, abilityId }))
  for (const status of monster.statuses) {
    const hooks = data.statuses[status.statusId].traitHooks
    if (hooks)
      push(hooks, (status.potency ?? 100) / 100, status.statusId, { kind: 'status', ownerId })
  }
  for (const instance of volatile?.gainedTraits ?? []) {
    push(data.traits[instance.id].hooks, levelEffectScale(step, instance.level), instance.id, {
      kind: 'gained',
      ownerId
    })
  }
  for (const minion of volatile?.minions ?? []) {
    push(data.minions[minion.minionId].hooks, minion.stacks, minion.minionId, {
      kind: 'minion',
      ownerId,
      stacks: minion.stacks
    })
  }
  // Mức thân mật cao nhất đã đạt (docs/rules/affinity.md); sourceId = id mức.
  const tier = affinityTierOf(data, monster.affinity)
  if (tier) push(tier.hooks, 1, tier.id, { kind: 'affinity', ownerId })
  // Hiệu ứng cấy ghép (docs/rules/implant.md): cấp dương hooks, cấp âm failHooks; hệ số = |cấp|.
  for (const [effectId, level] of Object.entries(monster.implantEffects)) {
    const effect = data.serumEffects[effectId]
    push(level > 0 ? effect.hooks : effect.failHooks, Math.abs(level), effectId, {
      kind: 'implant',
      ownerId
    })
  }
  // Thiên phú đã nâng ở nhánh đang mở (docs/rules/monster-talents.md): hệ số = cấp; sourceId = id nút.
  for (const { node, rank } of activeTalents(data, monster)) {
    push(node.hooks, rank, node.id, { kind: 'talent', ownerId })
  }
  const partner = withMergePartner ? mergePartnerOf(monster) : undefined
  // Bản chụp quái phụ không mang trạng thái / trait tạm: chỉ phần lâu dài, chủ hook là thực thể.
  for (const entry of partner ? ownHooks(data, partner, undefined, { itemsDisabled }) : []) {
    result.push({ ...entry, source: { ...entry.source, ownerId } })
  }
  return result
}

interface OwnHookOptions {
  /** Magic Room: món đang lắp không có tác dụng. */
  itemsDisabled?: boolean
  /** Unnerve của địch: berry đang cầm không có tác dụng. */
  berriesBlocked?: boolean
  /** Thực thể hợp thể có tính hook của quái phụ không (mặc định có). */
  withMergePartner?: boolean
  /** Ability theo loài bị vô hiệu (Gastro Acid, skill bỏ qua ability). */
  abilitySuppressed?: boolean
}

interface AuraEntry {
  grant: AuraGrant
  scale: number
  sourceId: string
  owner: Monster
}

type AuraRelation = 'self' | 'ally' | 'foe'

/**
 * Bối cảnh trận của quái phát hào quang, suy từ bối cảnh của quái nhận (đổi đồng đội / địch theo
 * quan hệ), để xét điều kiện của hào quang trên quái phát.
 */
function ownerContext(
  ctx: MonsterBattleContext | undefined,
  receiver: Monster,
  owner: Monster,
  relation: AuraRelation
): MonsterBattleContext | undefined {
  if (!ctx || relation === 'self') return ctx
  const receiverSide = [receiver, ...ctx.allies]
  if (relation === 'ally') {
    return { ...ctx, allies: receiverSide.filter((m) => m.id !== owner.id) }
  }
  return {
    ...ctx,
    side: ctx.side === 'player' ? 'enemy' : 'player',
    allies: ctx.foes.filter((m) => m.id !== owner.id),
    foes: receiverSide
  }
}

/**
 * Hào quang `owner` phát tới quái `receiver` có quan hệ `relation` với nó. `hooks`: hook của chính
 * owner nếu nơi gọi đã gom sẵn (cùng bối cảnh), không thì gom lại.
 */
function collectAuras(
  data: GameData,
  {
    owner,
    receiver,
    relation,
    hooks
  }: { owner: Monster; receiver: Monster; relation: AuraRelation; hooks?: readonly OwnHook[] },
  ctx: MonsterBattleContext | undefined,
  into: AuraEntry[]
): void {
  const ownerHooks =
    hooks ?? ownHooks(data, owner, ctx?.volatiles[owner.id], { itemsDisabled: ctx?.itemsDisabled })
  for (const { hook, scale, sourceId } of ownerHooks) {
    const grant = TRAIT_HOOKS[hook.type].auraGrant?.(hook.params)
    if (!grant) continue
    const reaches =
      relation === 'foe'
        ? grant.scope === 'foes'
        : relation === 'ally'
          ? grant.scope === 'allies' || grant.scope === 'side'
          : grant.scope === 'side'
    if (!reaches) continue
    if (grant.when) {
      // Ngoài trận không có bối cảnh để xét điều kiện; xét máu lúc đang tính max HP còn gọi lại
      // chính computeStats (đệ quy). Hào quang có điều kiện chỉ có tác dụng trong trận.
      if (!ctx) continue
      const selfCtx = ownerContext(ctx, receiver, owner, relation)
      if (!checkAllConditions({ data, self: owner, selfCtx }, grant.when)) continue
    }
    if (grant.receiverWhen) {
      if (!ctx) continue
      if (!checkAllConditions({ data, self: receiver, selfCtx: ctx }, grant.receiverWhen)) continue
    }
    into.push({ grant, scale, sourceId, owner })
  }
}

/** Bỏ hào quang trùng: hào quang không cộng dồn cùng id chỉ giữ bản có hệ số lớn nhất. */
function dedupeAuras(entries: readonly AuraEntry[]): AuraEntry[] {
  const best = new Map<string, AuraEntry>()
  const result: AuraEntry[] = []
  for (const entry of entries) {
    if (entry.grant.stacks) {
      result.push(entry)
      continue
    }
    const current = best.get(entry.sourceId)
    if (!current || entry.scale > current.scale) best.set(entry.sourceId, entry)
  }
  return [...result, ...best.values()]
}

/**
 * Gọi fn với mọi hook có tác dụng lên quái: hook của chính nó (trait, trait race cấp 1, trạng thái,
 * trait tạm, minion; mục "Trait Siralim"), cộng hưởng đội / trận pháp của phe, cuồng bạo, rồi hào
 * quang (hook `aura`) của chính nó và của quái khác trên sân (cần `ctx`, bối cảnh trận). Hook `aura`
 * không được gọi trực tiếp, chỉ hook bên trong.
 */
export function forEachTraitHook(
  data: GameData,
  monster: Monster,
  fn: TraitHookFn,
  ctx?: MonsterBattleContext,
  { withMergePartner = true }: { withMergePartner?: boolean } = {}
): void {
  const calls = memoInReadOnlyScope(
    withMergePartner ? RESOLVED_HOOKS_TABLE : RESOLVED_HOOKS_WITHOUT_PARTNER_TABLE,
    [data, monster, ctx],
    () => resolveTraitHooks(data, monster, ctx, withMergePartner)
  )
  for (const { handler, params, scale, sourceId, source } of calls) {
    fn(handler, params, scale, sourceId, source)
  }
}

/** Bảng nhớ danh sách hook đã gom trong phạm vi chỉ đọc (theo cách tính hook quái phụ hợp thể). */
const RESOLVED_HOOKS_TABLE = {}
const RESOLVED_HOOKS_WITHOUT_PARTNER_TABLE = {}

/** Mọi hook có tác dụng lên quái theo đúng thứ tự gọi, hệ số đã nhân (forEachTraitHook). */
function resolveTraitHooks(
  data: GameData,
  monster: Monster,
  ctx: MonsterBattleContext | undefined,
  withMergePartner: boolean
): ResolvedHook[] {
  const volatile = ctx?.volatiles[monster.id]
  const entries: ResolvedHook[] = []
  const own = ownHooks(data, monster, volatile, {
    itemsDisabled: ctx?.itemsDisabled,
    berriesBlocked: ctx?.berriesBlocked,
    withMergePartner,
    abilitySuppressed: ctx?.abilitySuppressed
  })
  for (const { hook, scale, sourceId, source, line } of own) {
    const handler = TRAIT_HOOKS[hook.type]
    if (!handler.auraGrant) {
      entries.push({ handler, params: hook.params, scale, sourceId, source, line })
    }
  }
  // Cộng hưởng đội / trận pháp (docs/rules/team.md), kỹ năng đồng hành (partner-skills.md) của
  // phe; sourceId = id cộng hưởng / trận pháp / kỹ năng.
  for (const bonus of teamBonusHooks(data, monster, ctx?.teamBonuses ?? [])) {
    const source: HookSource = { kind: bonus.kind, ownerId: monster.id }
    for (const hook of bonus.hooks) {
      entries.push({
        handler: TRAIT_HOOKS[hook.type],
        params: hook.params,
        scale: bonus.scale,
        sourceId: bonus.id,
        source
      })
    }
  }
  // Cuồng bạo (docs/rules/frenzy.md): % công / đặc công tới hết trận, cộng như mọi nguồn %.
  const frenzyPercent = ctx?.frenzyStatPercent ?? 0
  if (frenzyPercent !== 0) {
    entries.push({
      handler: statModifier,
      params: { percent: { attack: frenzyPercent, spAttack: frenzyPercent } },
      scale: 1,
      sourceId: 'frenzy',
      source: { kind: 'frenzy', ownerId: monster.id }
    })
  }
  // Thưởng sưu tập (docs/rules/dex.md): % mọi chỉ số của phe người chơi, cộng như mọi nguồn %.
  const collectionPercent = ctx?.collectionStatPercent ?? 0
  if (collectionPercent !== 0) {
    entries.push({
      handler: statModifier,
      params: { percent: uniformPercent(collectionPercent) },
      scale: 1,
      sourceId: 'collection',
      source: { kind: 'collection', ownerId: monster.id }
    })
  }
  // Linh thực (docs/rules/cooking.md): % chỉ số của món ăn đang có tác dụng, phe người chơi.
  const mealPercent = ctx?.mealStatPercent ?? {}
  if (Object.keys(mealPercent).length > 0) {
    entries.push({
      handler: statModifier,
      params: { percent: mealPercent },
      scale: 1,
      sourceId: 'meal',
      source: { kind: 'meal', ownerId: monster.id }
    })
  }
  // Chúc phúc của thần (docs/rules/deities.md): % chỉ số trong trận ở map của thần.
  const blessingPercent = ctx?.blessingStatPercent ?? {}
  if (Object.keys(blessingPercent).length > 0) {
    entries.push({
      handler: statModifier,
      params: { percent: blessingPercent },
      scale: 1,
      sourceId: 'blessing',
      source: { kind: 'blessing', ownerId: monster.id }
    })
  }
  const auras: AuraEntry[] = []
  collectAuras(
    data,
    { owner: monster, receiver: monster, relation: 'self', hooks: own },
    ctx,
    auras
  )
  for (const ally of ctx?.allies ?? []) {
    collectAuras(data, { owner: ally, receiver: monster, relation: 'ally' }, ctx, auras)
  }
  for (const foe of ctx?.foes ?? []) {
    collectAuras(data, { owner: foe, receiver: monster, relation: 'foe' }, ctx, auras)
  }
  for (const { grant, scale, sourceId, owner } of dedupeAuras(auras)) {
    for (const hook of grant.hooks) {
      const source: HookSource = { kind: 'aura', ownerId: owner.id }
      const share = TRAIT_HOOKS[hook.type].equipmentShare?.(hook.params, scale)
      if (share) {
        // Magic Room tắt món của quái phát nên không còn gì để chia.
        if (ctx?.itemsDisabled) continue
        const shared = sharedEquipmentHook(data, { owner, receiver: monster, share })
        if (shared) entries.push({ ...shared, scale: 1, sourceId, source })
        continue
      }
      entries.push({
        handler: TRAIT_HOOKS[hook.type],
        params: hook.params,
        scale,
        sourceId,
        source
      })
    }
  }
  applyLinePotency(entries)
  // Trait "mạnh thêm %" (traitPotency, kiểu Master of X): nhân hệ số các trait của chính quái.
  let potency = 0
  for (const entry of entries)
    potency += entry.handler.traitPotencyPercent?.(entry.params, entry.scale) ?? 0
  const boost = Math.max(0, 1 + potency / 100)
  if (boost === 1) return entries
  return entries.map((entry) =>
    POTENCY_SOURCES.has(entry.source.kind) && !entry.handler.traitPotencyPercent
      ? { ...entry, scale: entry.scale * boost }
      : entry
  )
}

interface ResolvedHook {
  handler: TraitHookHandler
  params: unknown
  scale: number
  sourceId: string
  source: HookSource
  line?: LineMeta
}

/**
 * Hook đổi từ hào quang chia % chỉ số trang bị (equipmentShare) của quái phát: % chỉ số hoặc % sát
 * thương đòn vật lý bằng `percent`% tổng % các chỉ số đó trên trang bị của nó; quái nhận sai race
 * thì không có.
 */
function sharedEquipmentHook(
  data: GameData,
  { owner, receiver, share }: { owner: Monster; receiver: Monster; share: EquipmentShare }
): Pick<ResolvedHook, 'handler' | 'params'> | null {
  if (share.raceIds && !raceMatchesAny(data, receiver.raceId, share.raceIds)) return null
  const owned = equipmentStatPercents(data, owner)
  const factor = share.percent / 100
  if (share.as === 'damage') {
    const total = share.stats.reduce((sum, stat) => sum + owned[stat], 0) * factor
    if (total === 0) return null
    return {
      handler: TRAIT_HOOKS.damageDealtModifier,
      params: { percent: total, categories: ['physical'] }
    }
  }
  const percent: PartialStats = {}
  for (const stat of share.stats) percent[stat] = owned[stat] * factor
  return { handler: TRAIT_HOOKS.statModifier, params: { percent } }
}

/**
 * Hệ số dòng trang bị theo nhãn (equipmentLinePotency, kể cả qua hào quang): nhân hệ số của hook
 * sinh từ dòng khớp nhãn (Imbue, Warcraft, Aura Boost, Reticence, Unbreakable, War-Forged...).
 */
function applyLinePotency(entries: ResolvedHook[]): void {
  const specs = entries.flatMap((entry) =>
    entry.handler.linePotency ? [entry.handler.linePotency(entry.params, entry.scale)] : []
  )
  if (specs.length === 0) return
  for (const entry of entries) {
    const line = entry.line
    if (!line) continue
    const percent = specs
      .filter(
        (spec) =>
          spec.tags.some((tag) => line.tags.includes(tag)) &&
          (!spec.firstOnly || line.firstStat) &&
          (!spec.excludeHpLines || !line.touchesHp)
      )
      .reduce((sum, spec) => sum + spec.percent, 0)
    entry.scale *= Math.max(0, 1 + percent / 100)
  }
}

/** Nguồn hook được trait "mạnh thêm %" nhân hệ số: trait của chính quái. */
const POTENCY_SOURCES: ReadonlySet<HookSourceKind> = new Set(['trait', 'race', 'ability', 'gained'])
