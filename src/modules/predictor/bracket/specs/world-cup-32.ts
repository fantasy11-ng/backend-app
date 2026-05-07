/**
 * Bracket specification for the classic 32-team FIFA World Cup format (WC2022 and before).
 *
 * 8 groups (A–H): 2 qualify per group → 16 teams enter R16.
 * No third-placed qualifiers.
 *
 * R16 seeding (standard FIFA mapping):
 *   Match 0:  1A vs 2B
 *   Match 1:  1C vs 2D
 *   Match 2:  1E vs 2F
 *   Match 3:  1G vs 2H
 *   Match 4:  1B vs 2A
 *   Match 5:  1D vs 2C
 *   Match 6:  1F vs 2E
 *   Match 7:  1H vs 2G
 *
 * Subsequent rounds pair winners sequentially:
 *   QF: (W0 vs W1), (W2 vs W3), (W4 vs W5), (W6 vs W7)  [from R16]
 *   SF: (W0 vs W1), (W2 vs W3)                            [from QF]
 *   Final: (W0 vs W1)                                     [from SF]
 *   Third-place: (L0 vs L1)                               [SF losers]
 *
 * AFCON and UCL follow a similar "group → R16" shape; the only difference is
 * the R16 seeding table.  Those are handled by passing competition-specific
 * pairIds into the context before BracketEngine is called (legacy path
 * preserved in PredictorService).
 */

import { BracketSpec } from '../bracket.types';

/** Standard 32-team WC bracket (WC2022 style) */
export const worldCup32Spec: BracketSpec[] = [
  {
    roundCode: 'r16',
    expectedPredictionCount: 8,
    matches: [
      { home: { type: 'groupPlacement', group: 'A', place: 1 }, away: { type: 'groupPlacement', group: 'B', place: 2 } },
      { home: { type: 'groupPlacement', group: 'C', place: 1 }, away: { type: 'groupPlacement', group: 'D', place: 2 } },
      { home: { type: 'groupPlacement', group: 'E', place: 1 }, away: { type: 'groupPlacement', group: 'F', place: 2 } },
      { home: { type: 'groupPlacement', group: 'G', place: 1 }, away: { type: 'groupPlacement', group: 'H', place: 2 } },
      { home: { type: 'groupPlacement', group: 'B', place: 1 }, away: { type: 'groupPlacement', group: 'A', place: 2 } },
      { home: { type: 'groupPlacement', group: 'D', place: 1 }, away: { type: 'groupPlacement', group: 'C', place: 2 } },
      { home: { type: 'groupPlacement', group: 'F', place: 1 }, away: { type: 'groupPlacement', group: 'E', place: 2 } },
      { home: { type: 'groupPlacement', group: 'H', place: 1 }, away: { type: 'groupPlacement', group: 'G', place: 2 } },
    ],
  },
  {
    roundCode: 'qf',
    expectedPredictionCount: 4,
    matches: [
      { home: { type: 'winnerOf', round: 'r16', matchIndex: 0 }, away: { type: 'winnerOf', round: 'r16', matchIndex: 1 } },
      { home: { type: 'winnerOf', round: 'r16', matchIndex: 2 }, away: { type: 'winnerOf', round: 'r16', matchIndex: 3 } },
      { home: { type: 'winnerOf', round: 'r16', matchIndex: 4 }, away: { type: 'winnerOf', round: 'r16', matchIndex: 5 } },
      { home: { type: 'winnerOf', round: 'r16', matchIndex: 6 }, away: { type: 'winnerOf', round: 'r16', matchIndex: 7 } },
    ],
  },
  {
    roundCode: 'sf',
    expectedPredictionCount: 2,
    matches: [
      { home: { type: 'winnerOf', round: 'qf', matchIndex: 0 }, away: { type: 'winnerOf', round: 'qf', matchIndex: 1 } },
      { home: { type: 'winnerOf', round: 'qf', matchIndex: 2 }, away: { type: 'winnerOf', round: 'qf', matchIndex: 3 } },
    ],
  },
  {
    roundCode: 'final',
    expectedPredictionCount: 1,
    matches: [
      { home: { type: 'winnerOf', round: 'sf', matchIndex: 0 }, away: { type: 'winnerOf', round: 'sf', matchIndex: 1 } },
    ],
  },
  {
    roundCode: 'third-place',
    expectedPredictionCount: 1,
    matches: [
      { home: { type: 'loserOf', round: 'sf', matchIndex: 0 }, away: { type: 'loserOf', round: 'sf', matchIndex: 1 } },
    ],
  },
];
