// Dựng trận từ quái địch đã sinh (dùng chung cho quái hoang, boss, độ kiếp, ngự thú sư NPC).

import { cloneData, type RngState } from '../shared'
import {
  activeTeamBonuses,
  eventModifierFields,
  hasTrialRule,
  trialEnemyMultiplier,
  trialFixedField
} from '../registries'
import { equipBossUnique, type Encounter, type FloorSite } from '../world'
import { isFainted } from '../monster'
import {
  GLOBAL_FIELD_LAYERS,
  type BattleState,
  type BattleTrainer,
  type BattleTrial,
  type GameData,
  type GameState,
  type Monster,
  type SpecialBattle
} from '../model'
import {
  Draft,
  SLOT_COUNT,
  findMonster,
  initialSlots,
  log,
  occupantIds,
  playerFighters,
  putOnField
} from './draft'
import {
  defaultField,
  placeTribulationField,
  rollNaturalField,
  triggerEntryEffects
} from './environment'
import { settleAfterTurn } from './turn'
import { rollBossTransformPlan } from './transform'
import { isTamerWounded, newBattleTamer, partnerTeamBonus } from '../tamer'
import { countsAsFloorBattle } from './specialBattles'

/** Boss trong trận mang món unique của loài (sinh sau cả trận để không đổi quái đã sinh). */
function equipBosses(
  data: GameData,
  state: GameState,
  encounter: Encounter
): { enemies: Monster[]; rng: RngState; nextItemId: number } {
  let { rng } = encounter
  let { nextItemId } = state
  if (!encounter.isBoss) return { enemies: encounter.enemies, rng, nextItemId }
  const enemies = encounter.enemies.map((boss) => {
    const equipped = equipBossUnique(data, rng, { boss, nextItemId })
    rng = equipped.rng
    nextItemId = equipped.nextItemId
    return equipped.boss
  })
  return { enemies, rng, nextItemId }
}

/** Trận độ kiếp (docs/rules/awakening.md): quái đánh một mình để lên tầng `tier`. */
export interface TribulationSetup {
  monster: Monster
  tier: number
}

/**
 * Trận ngự thú sư NPC (docs/rules/trainers.md): ngự thú sư phe địch (cảnh giới, kỹ năng được
 * dùng), trận pháp của đội NPC; `naturalField` = môi trường tự nhiên của map (trận ở thị trấn: môi
 * trường mặc định).
 */
export interface TrainerSetup {
  trainer: BattleTrainer
  realm: number
  tamerSkillIds: readonly string[]
  formationId: string | null
  naturalField: boolean
}

/**
 * Luật của trận bí cảnh / tháp lúc mở trận (docs/rules/trials.md): chỉ số quái địch × hệ số của
 * luật enemyMultiplier (nhân vào bossMultiplier).
 */
function strengthenEnemies(data: GameData, enemies: Monster[], trial?: BattleTrial): Monster[] {
  const multiplier = trial ? trialEnemyMultiplier(data, trial.rules) : 1
  if (multiplier === 1) return enemies
  return enemies.map((enemy) => ({ ...enemy, bossMultiplier: enemy.bossMultiplier * multiplier }))
}

/** Luật fixedField của bí cảnh / tháp: lớp có ghi lấy cố định cả trận (sau môi trường của map). */
function placeTrialField(data: GameData, d: Draft): void {
  const trial = d.battle.trial
  if (!trial) return
  const fixed = trialFixedField(data, trial.rules)
  for (const layer of GLOBAL_FIELD_LAYERS) {
    const fieldId = fixed[layer]
    if (fieldId === undefined) continue
    d.battle.field[layer] = { id: fieldId, turnsLeft: null }
    log(d, { type: 'fieldChanged', layer, fieldId, source: 'trial' })
  }
}

/**
 * Modifier cố định môi trường (docs/rules/events.md): trận trên tầng lấy môi trường của modifier cả
 * trận (sau môi trường của map, trước luật bí cảnh).
 */
function placeModifierField(data: GameData, d: Draft): void {
  if (!countsAsFloorBattle(d.battle)) return
  const fixed = eventModifierFields(data, d.events.modifiers)
  for (const layer of GLOBAL_FIELD_LAYERS) {
    const fieldId = fixed[layer]
    if (fieldId === undefined) continue
    d.battle.field[layer] = { id: fieldId, turnsLeft: null }
    log(d, { type: 'fieldChanged', layer, fieldId, source: 'event' })
  }
}

/**
 * Dựng trận từ quái địch đã sinh: môi trường tự nhiên của biome (trận độ kiếp: môi trường cố định
 * của config; trận NPC ở thị trấn: môi trường mặc định; bí cảnh / tháp: thêm môi trường cố định của
 * luật), địch ra sân, log NPC / boss / shiny, quái ta còn sống ra sân (trận độ kiếp: chỉ quái độ
 * kiếp; luật một hệ: chỉ quái mang hệ đó), rồi trait vào sân của mọi quái trên sân.
 */
export function openBattle(
  data: GameData,
  state: GameState,
  {
    site,
    encounter,
    tribulation,
    trainer,
    trial,
    special
  }: {
    site: FloorSite
    encounter: Encounter
    tribulation?: TribulationSetup
    trainer?: TrainerSetup
    trial?: BattleTrial
    /** Trận do event mở / đợt thú triều (docs/rules/events.md). */
    special?: SpecialBattle
  }
): GameState {
  const equipped = equipBosses(data, state, encounter)
  const { rng, nextItemId } = equipped
  const enemies = strengthenEnemies(data, equipped.enemies, trial)
  // Luật noTamerSkills: không phe nào có ngự thú sư trong trận.
  const noTamers = hasTrialRule(data, trial?.rules, 'noTamerSkills')
  // Quái lớn (docs/rules/monster-size.md) chỉ ra sân khi mọi ô còn trống, lấy hết ô.
  const enemySlots = initialSlots(data, enemies)
  const battle: BattleState = {
    floor: site.floor,
    isBoss: encounter.isBoss,
    tribulation: tribulation ? { monsterId: tribulation.monster.id, tier: tribulation.tier } : null,
    trainer: trainer?.trainer ?? null,
    trial: trial ?? null,
    special: special ?? null,
    phase: 'chooseActions',
    outcome: null,
    turn: 1,
    enemies,
    playerSlots: Array.from({ length: SLOT_COUNT }, () => null),
    enemySlots,
    field: defaultField(data),
    stages: {},
    // Quái địch ra sân ngay lúc mở trận: lượt 1 là lượt đầu của chúng.
    volatiles: Object.fromEntries(occupantIds(enemySlots).map((id) => [id, { firstTurn: 1 }])),
    usedOnce: {},
    records: {},
    counters: { casts: { player: 0, enemy: 0 }, lastCastSkillId: null, deaths: 0 },
    participants: [],
    captured: [],
    recruitOfferId: null,
    transformsUsed: { player: [], enemy: [] },
    plannedTransform: null,
    zMoveUsed: { player: false, enemy: false },
    // Ngự thú sư của người chơi linh lực đầy mỗi đầu trận; quái hoang / boss không có ngự thú sư,
    // NPC có (docs/rules/trainers.md). Độ kiếp đánh một mình: không ngự thú sư, không phối hợp đội.
    tamers: {
      // Đạo thương: linh lực đầu trận chỉ còn woundManaPercent % (docs/rules/tamer.md).
      player:
        tribulation || noTamers
          ? null
          : newBattleTamer(
              data,
              state.tamer.realm,
              null,
              isTamerWounded(state) ? data.config.bond.woundManaPercent : 100
            ),
      enemy:
        trainer && !noTamers
          ? newBattleTamer(data, trainer.realm, [...trainer.tamerSkillIds])
          : null
    },
    // Cộng hưởng / trận pháp tính một lần từ cả đội lúc vào trận (đội không đổi trong trận);
    // quái hoang không có, đội NPC có (docs/rules/team.md). Kỹ năng đồng hành bật / tắt theo quái
    // đầu đội gục / hồi sinh (refreshPartnerBonus, docs/rules/partner-skills.md).
    teamBonuses: {
      player: tribulation
        ? []
        : [
            ...activeTeamBonuses(data, state.party, state.formations.active),
            ...[partnerTeamBonus(data, state.party)].flatMap((bonus) => (bonus ? [bonus] : []))
          ],
      enemy: trainer ? activeTeamBonuses(data, enemies, trainer.formationId) : []
    },
    log: []
  }
  const d: Draft = {
    ...cloneData(state),
    rng,
    nextMonsterId: encounter.nextMonsterId,
    nextItemId,
    battle
  }
  if (trainer)
    log(d, {
      type: 'trainerAppeared',
      classId: trainer.trainer.classId,
      mode: trainer.trainer.mode
    })
  if (trial) log(d, { type: 'trialRules', ruleIds: trial.rules.map((rule) => rule.ruleId) })
  if (tribulation) placeTribulationField(data, d)
  else if (!trainer || trainer.naturalField) rollNaturalField(data, d, site.biome)
  placeModifierField(data, d)
  placeTrialField(data, d)
  rollBossTransformPlan(data, d)
  for (const id of occupantIds(battle.enemySlots)) {
    log(d, { type: 'enter', side: 'enemy', slot: battle.enemySlots.indexOf(id), monsterId: id })
  }
  for (const enemy of battle.enemies) {
    if (battle.isBoss) log(d, { type: 'bossAppeared', monsterId: enemy.id })
    if (enemy.shinyStacks > 0) log(d, { type: 'shinyAppeared', monsterId: enemy.id })
  }
  const fighters = playerFighters(data, d).filter((m) => !isFainted(data, m))
  initialSlots(data, fighters).forEach((monsterId, slot) => {
    if (monsterId === null || battle.playerSlots.includes(monsterId)) return
    putOnField(data, d, { side: 'player', slot, monsterId, firstTurn: 1 })
  })
  const onField = [...occupantIds(battle.enemySlots), ...occupantIds(battle.playerSlots)].map(
    (id) => findMonster(d, id)
  )
  triggerEntryEffects(data, d, onField)
  // Trait vào sân (đầu trận) có thể hạ quái: phân thắng thua / chờ thay quái như cuối lượt.
  settleAfterTurn(data, d)
  return d
}
