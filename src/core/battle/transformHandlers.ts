// Registry biến hình TRANSFORMS (mục "Khung biến hình chung" ở transformation.md): mỗi loại khai báo
// điều kiện riêng, dạng chọn được, biến hình mới khi bắt đầu, có hết khi rời sân không, dùng được
// trong trận độ kiếp không. Luật chung
// (vật phẩm chìa khóa, mỗi phe mỗi loại một lần, mỗi quái một biến hình) ở transform.ts.
// Thêm loại mới = thêm vào TRANSFORM_KINDS + một handler ở đây (Record báo lỗi nếu thiếu).
// Đặt trong battle/ (không ở registries/) vì handler cần tra dạng loài của monster/.

import { megaFormsByStone } from '../monster'
import { formsOf, heldZCrystals } from '../inventory'
import { isLargeMonster } from '../registries'
import {
  STELLAR,
  type BattleTransform,
  type GameData,
  type Monster,
  type TransformFailReason,
  type TransformKind
} from '../model'

/** Bối cảnh xét / bắt đầu biến hình của một quái. */
export interface TransformContext {
  data: GameData
  monster: Monster
  /** Quái của người chơi (cần đá, Tera Orb đang sạc); boss hoang thì không cần (false). */
  isPlayer: boolean
  /** Tera Orb của người chơi đang sạc (bỏ qua với boss). */
  teraOrbCharged: boolean
  /** Trận ở power spot: trận boss hoặc map có powerSpot. */
  powerSpot: boolean
}

/** Biến hình mới (chưa áp vào quái) và hệ của quái khi biến hình. */
export interface TransformStart {
  transform: BattleTransform
  elementIds: string[]
}

export interface TransformHandler {
  /** Lý do riêng của loại không dùng được (ngoài luật chung); null = dùng được. */
  unavailable(ctx: TransformContext): TransformFailReason | null
  /** Dạng chọn được (Mega X / Y); rỗng = loại này không chọn dạng. */
  forms(ctx: TransformContext): string[]
  /** Biến hình mới; `formSpeciesId` là một trong forms() khi loại có dạng. */
  start(ctx: TransformContext, formSpeciesId?: string): TransformStart
  /** Hết tác dụng khi quái rời sân (Dynamax); không thì giữ tới hết trận (kể cả khi gục). */
  endsOnLeave: boolean
  /** Dùng được trong trận độ kiếp (chỉ Hiện nguyên hình; docs/rules/awakening.md). */
  allowedInTribulation: boolean
  /**
   * Xin bằng lệnh skill của quái (`transform` của lệnh, AI biến hình, kế hoạch boss); false = loại
   * đi đường riêng (hợp thể: kỹ năng ngự thú sư, battle/merge.ts) và `start` không được gọi.
   */
  bySkillCommand: boolean
}

/** Dạng Mega dùng được: theo đá đang cầm hoặc skill của dạng, quái không fuse (megaFormsByStone). */
const megaForms = ({ data, monster }: TransformContext): string[] => megaFormsByStone(data, monster)

/** Dạng Ultra Burst theo crystal đang cầm (loài nguồn đúng loài hiện tại, quái không fuse). */
const ultraBurstForms = ({ data, monster }: TransformContext): string[] =>
  monster.fused
    ? []
    : heldZCrystals(data, monster).flatMap((crystal) =>
        crystal.ultraBurst?.fromSpeciesIds.includes(monster.speciesId)
          ? [crystal.ultraBurst.formId]
          : []
      )

/** Dạng gmax của quái khi Dynamax: có Gmax Factor, không fuse, loài có dạng gmax. */
function gmaxFormOf(data: GameData, monster: Monster): string | undefined {
  if (!monster.gmaxFactor || monster.fused) return undefined
  return formsOf(data, monster.speciesId, 'gmax')[0]?.id
}

export const TRANSFORMS: Readonly<Record<TransformKind, TransformHandler>> = {
  mega: {
    unavailable: (ctx) => (megaForms(ctx).length === 0 ? 'notEligible' : null),
    forms: megaForms,
    start({ data, monster }, formSpeciesId) {
      const form = formSpeciesId === undefined ? undefined : data.species[formSpeciesId]
      if (form?.kind !== 'normal') throw new Error(`Dạng Mega không hợp lệ "${formSpeciesId}"`)
      return {
        transform: { kind: 'mega', formSpeciesId, originalElementIds: [...monster.elementIds] },
        elementIds: [...form.elementIds]
      }
    },
    endsOnLeave: false,
    allowedInTribulation: false,
    bySkillCommand: true
  },
  dynamax: {
    unavailable: ({ powerSpot }) => (powerSpot ? null : 'notPowerSpot'),
    forms: () => [],
    start({ data, monster }) {
      const formSpeciesId = gmaxFormOf(data, monster)
      return {
        transform: {
          kind: 'dynamax',
          ...(formSpeciesId ? { formSpeciesId } : {}),
          originalElementIds: [...monster.elementIds],
          turnsLeft: data.config.transform.dynamax.turns
        },
        elementIds: [...monster.elementIds]
      }
    },
    endsOnLeave: true,
    allowedInTribulation: false,
    bySkillCommand: true
  },
  tera: {
    unavailable: ({ isPlayer, teraOrbCharged }) =>
      isPlayer && !teraOrbCharged ? 'teraOrbEmpty' : null,
    forms: () => [],
    start({ monster }) {
      const teraElementId = monster.teraElementId
      return {
        transform: {
          kind: 'tera',
          teraElementId,
          originalElementIds: [...monster.elementIds]
        },
        // Phòng thủ chỉ còn hệ Tera; Stellar giữ hệ gốc.
        elementIds: teraElementId === STELLAR ? [...monster.elementIds] : [teraElementId]
      }
    },
    endsOnLeave: false,
    allowedInTribulation: false,
    bySkillCommand: true
  },
  // Hiện nguyên hình (docs/rules/human-form.md): quái đang ở nhân hình về bản thể và nhận buff % theo
  // tầng thức tỉnh tới hết trận (nguồn % trueForm); không cần vật phẩm, không cần power spot.
  trueForm: {
    unavailable: ({ monster }) => (monster.humanForm === 'human' ? null : 'notEligible'),
    forms: () => [],
    start: ({ monster }) => ({
      transform: { kind: 'trueForm', originalElementIds: [...monster.elementIds] },
      elementIds: [...monster.elementIds]
    }),
    endsOnLeave: false,
    allowedInTribulation: true,
    bySkillCommand: true
  },
  // Ultra Burst (Necrozma): như Mega theo crystal đang cầm, không cần vật phẩm chìa khóa (như Pokémon:
  // chỉ cần Ultranecrozium Z), không tính lượt Mega của phe.
  ultraBurst: {
    unavailable: (ctx) => (ultraBurstForms(ctx).length === 0 ? 'notEligible' : null),
    forms: ultraBurstForms,
    start({ data, monster }, formSpeciesId) {
      const form = formSpeciesId === undefined ? undefined : data.species[formSpeciesId]
      if (form?.kind !== 'normal')
        throw new Error(`Dạng Ultra Burst không hợp lệ "${formSpeciesId}"`)
      return {
        transform: {
          kind: 'ultraBurst',
          formSpeciesId,
          originalElementIds: [...monster.elementIds]
        },
        elementIds: [...form.elementIds]
      }
    },
    endsOnLeave: false,
    allowedInTribulation: false,
    bySkillCommand: true
  },
  // Song thú hợp thể (docs/rules/battle-merge.md): điều kiện cặp, bắt đầu và tách ở battle/merge.ts;
  // ở đây chỉ luật riêng của từng quái (quái lớn đã chiếm mọi ô nên không hợp thể).
  merge: {
    unavailable: ({ data, monster }) => (isLargeMonster(data, monster) ? 'notEligible' : null),
    forms: () => [],
    start() {
      throw new Error('Hợp thể không bắt đầu qua TRANSFORMS (xem battle/merge.ts)')
    },
    endsOnLeave: true,
    allowedInTribulation: false,
    bySkillCommand: false
  }
}
