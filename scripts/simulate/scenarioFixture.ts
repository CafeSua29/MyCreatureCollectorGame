// Kịch bản mẫu nhỏ trên fixture của @core/testing, dùng chung cho test của script mô phỏng
// (không phải file test để không bị chạy như test khi import).

/** Kịch bản hợp lệ nhỏ trên fixture. */
export function validScenarios(): Record<string, unknown> {
  return {
    seed: 7,
    floors: { from: 1, to: 2 },
    wildBattlesPerFloor: 3,
    bossBattlesPerFloor: 1,
    maxTurns: 50,
    teams: [
      {
        id: 'solo',
        members: [{ speciesId: 'weakling', levelOffset: 0, genes: 'wild', traits: [] }]
      }
    ],
    variants: [{ id: 'current' }],
    progression: {
      teamIds: ['solo'],
      bossPolicy: { type: 'everyWins', wins: 2 },
      maxBattles: 20
    },
    breeding: {
      speciesId: 'weakling',
      floor: 1,
      measureLevel: 10,
      genes: 'wild',
      generations: 2,
      offspringPerGeneration: 2
    },
    fusion: { speciesId: 'weakling', floor: 1, level: 10, genes: 20, fusions: 2 }
  }
}
