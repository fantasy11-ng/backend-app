/**
 * Bracket specification for the 2026 FIFA World Cup (48-team format).
 *
 * Format: 12 groups (A–L), top 2 per group + 8 best third-placed → Round of 32 (16 matches).
 * Source: FIFA official schedule + Wikipedia Annex C combination table.
 *
 * ROUND OF 32 match order (matches 73–88 in FIFA numbering):
 *   Idx  FIFA#  Match-up
 *    0   M73    2A  vs  2B
 *    1   M74    1C  vs  2F
 *    2   M75    1E  vs  3ABCDF  (third-place slot '1E' in Annex C)
 *    3   M76    1F  vs  2C
 *    4   M77    2E  vs  2I
 *    5   M78    1I  vs  3CDFGH  (third-place slot '1I' in Annex C)
 *    6   M79    1A  vs  3CEFHI  (third-place slot '1A' in Annex C)
 *    7   M80    1L  vs  3EHIJK  (third-place slot '1L' in Annex C)
 *    8   M81    1G  vs  3AEHIJ  (third-place slot '1G' in Annex C)
 *    9   M82    1D  vs  3BEFIJ  (third-place slot '1D' in Annex C)
 *   10   M83    1H  vs  2J
 *   11   M84    2K  vs  2L
 *   12   M85    1B  vs  3EFGIJ  (third-place slot '1B' in Annex C)
 *   13   M86    2D  vs  2G
 *   14   M87    1J  vs  2H
 *   15   M88    1K  vs  3DEIJL  (third-place slot '1K' in Annex C)
 *
 * ROUND OF 16 source mapping (from Wikipedia W73..W88 references):
 *   R16 Idx  Home from R32  Away from R32
 *     0      W73 (idx 0)    W75 (idx 2)
 *     1      W74 (idx 1)    W77 (idx 4)
 *     2      W76 (idx 3)    W78 (idx 5)
 *     3      W79 (idx 6)    W80 (idx 7)
 *     4      W83 (idx 10)   W84 (idx 11)
 *     5      W81 (idx 8)    W82 (idx 9)
 *     6      W86 (idx 13)   W88 (idx 15)
 *     7      W85 (idx 12)   W87 (idx 14)
 *
 * QF pairs winners of R16 sequentially:
 *   QF 0: W(R16 idx 0) vs W(R16 idx 1)
 *   QF 1: W(R16 idx 2) vs W(R16 idx 3)
 *   QF 2: W(R16 idx 4) vs W(R16 idx 5)
 *   QF 3: W(R16 idx 6) vs W(R16 idx 7)
 *
 * SF / Final / Third-place follow standard sequential pairing from QF.
 */

import { BracketSpec } from '../bracket.types';

export const worldCup2026Spec: BracketSpec[] = [
  // --------------------------------------------------------------------------
  // Round of 32
  // --------------------------------------------------------------------------
  {
    roundCode: 'r32',
    expectedPredictionCount: 16,
    matches: [
      // M73: 2A vs 2B
      {
        home: { type: 'groupPlacement', group: 'A', place: 2 },
        away: { type: 'groupPlacement', group: 'B', place: 2 },
      },
      // M74: 1C vs 2F
      {
        home: { type: 'groupPlacement', group: 'C', place: 1 },
        away: { type: 'groupPlacement', group: 'F', place: 2 },
      },
      // M75: 1E vs 3ABCDF  → Annex C slot '1E'
      {
        home: { type: 'groupPlacement', group: 'E', place: 1 },
        away: { type: 'thirdPlaceAnnexC', slotKey: '1E', annexTable: 'wc2026' },
      },
      // M76: 1F vs 2C
      {
        home: { type: 'groupPlacement', group: 'F', place: 1 },
        away: { type: 'groupPlacement', group: 'C', place: 2 },
      },
      // M77: 2E vs 2I
      {
        home: { type: 'groupPlacement', group: 'E', place: 2 },
        away: { type: 'groupPlacement', group: 'I', place: 2 },
      },
      // M78: 1I vs 3CDFGH  → Annex C slot '1I'
      {
        home: { type: 'groupPlacement', group: 'I', place: 1 },
        away: { type: 'thirdPlaceAnnexC', slotKey: '1I', annexTable: 'wc2026' },
      },
      // M79: 1A vs 3CEFHI  → Annex C slot '1A'
      {
        home: { type: 'groupPlacement', group: 'A', place: 1 },
        away: { type: 'thirdPlaceAnnexC', slotKey: '1A', annexTable: 'wc2026' },
      },
      // M80: 1L vs 3EHIJK  → Annex C slot '1L'
      {
        home: { type: 'groupPlacement', group: 'L', place: 1 },
        away: { type: 'thirdPlaceAnnexC', slotKey: '1L', annexTable: 'wc2026' },
      },
      // M81: 1G vs 3AEHIJ  → Annex C slot '1G'
      {
        home: { type: 'groupPlacement', group: 'G', place: 1 },
        away: { type: 'thirdPlaceAnnexC', slotKey: '1G', annexTable: 'wc2026' },
      },
      // M82: 1D vs 3BEFIJ  → Annex C slot '1D'
      {
        home: { type: 'groupPlacement', group: 'D', place: 1 },
        away: { type: 'thirdPlaceAnnexC', slotKey: '1D', annexTable: 'wc2026' },
      },
      // M83: 1H vs 2J
      {
        home: { type: 'groupPlacement', group: 'H', place: 1 },
        away: { type: 'groupPlacement', group: 'J', place: 2 },
      },
      // M84: 2K vs 2L
      {
        home: { type: 'groupPlacement', group: 'K', place: 2 },
        away: { type: 'groupPlacement', group: 'L', place: 2 },
      },
      // M85: 1B vs 3EFGIJ  → Annex C slot '1B'
      {
        home: { type: 'groupPlacement', group: 'B', place: 1 },
        away: { type: 'thirdPlaceAnnexC', slotKey: '1B', annexTable: 'wc2026' },
      },
      // M86: 2D vs 2G
      {
        home: { type: 'groupPlacement', group: 'D', place: 2 },
        away: { type: 'groupPlacement', group: 'G', place: 2 },
      },
      // M87: 1J vs 2H
      {
        home: { type: 'groupPlacement', group: 'J', place: 1 },
        away: { type: 'groupPlacement', group: 'H', place: 2 },
      },
      // M88: 1K vs 3DEIJL  → Annex C slot '1K'
      {
        home: { type: 'groupPlacement', group: 'K', place: 1 },
        away: { type: 'thirdPlaceAnnexC', slotKey: '1K', annexTable: 'wc2026' },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Round of 16 — sources are winners of specific R32 matches (non-sequential)
  // --------------------------------------------------------------------------
  {
    roundCode: 'r16',
    expectedPredictionCount: 8,
    matches: [
      // W73 vs W75  (R32 idx 0 vs idx 2)
      {
        home: { type: 'winnerOf', round: 'r32', matchIndex: 0 },
        away: { type: 'winnerOf', round: 'r32', matchIndex: 2 },
      },
      // W74 vs W77  (R32 idx 1 vs idx 4)
      {
        home: { type: 'winnerOf', round: 'r32', matchIndex: 1 },
        away: { type: 'winnerOf', round: 'r32', matchIndex: 4 },
      },
      // W76 vs W78  (R32 idx 3 vs idx 5)
      {
        home: { type: 'winnerOf', round: 'r32', matchIndex: 3 },
        away: { type: 'winnerOf', round: 'r32', matchIndex: 5 },
      },
      // W79 vs W80  (R32 idx 6 vs idx 7)
      {
        home: { type: 'winnerOf', round: 'r32', matchIndex: 6 },
        away: { type: 'winnerOf', round: 'r32', matchIndex: 7 },
      },
      // W83 vs W84  (R32 idx 10 vs idx 11)
      {
        home: { type: 'winnerOf', round: 'r32', matchIndex: 10 },
        away: { type: 'winnerOf', round: 'r32', matchIndex: 11 },
      },
      // W81 vs W82  (R32 idx 8 vs idx 9)
      {
        home: { type: 'winnerOf', round: 'r32', matchIndex: 8 },
        away: { type: 'winnerOf', round: 'r32', matchIndex: 9 },
      },
      // W86 vs W88  (R32 idx 13 vs idx 15)
      {
        home: { type: 'winnerOf', round: 'r32', matchIndex: 13 },
        away: { type: 'winnerOf', round: 'r32', matchIndex: 15 },
      },
      // W85 vs W87  (R32 idx 12 vs idx 14)
      {
        home: { type: 'winnerOf', round: 'r32', matchIndex: 12 },
        away: { type: 'winnerOf', round: 'r32', matchIndex: 14 },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Quarterfinals — winners of R16 (sequential within bracket halves)
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Semifinals
  // --------------------------------------------------------------------------
  {
    roundCode: 'sf',
    expectedPredictionCount: 2,
    matches: [
      { home: { type: 'winnerOf', round: 'qf', matchIndex: 0 }, away: { type: 'winnerOf', round: 'qf', matchIndex: 1 } },
      { home: { type: 'winnerOf', round: 'qf', matchIndex: 2 }, away: { type: 'winnerOf', round: 'qf', matchIndex: 3 } },
    ],
  },

  // --------------------------------------------------------------------------
  // Third-place match (before Final — SF losers play before SF winners)
  // --------------------------------------------------------------------------
  {
    roundCode: 'third-place',
    expectedPredictionCount: 1,
    matches: [
      { home: { type: 'loserOf', round: 'sf', matchIndex: 0 }, away: { type: 'loserOf', round: 'sf', matchIndex: 1 } },
    ],
  },

  // --------------------------------------------------------------------------
  // Final
  // --------------------------------------------------------------------------
  {
    roundCode: 'final',
    expectedPredictionCount: 1,
    matches: [
      { home: { type: 'winnerOf', round: 'sf', matchIndex: 0 }, away: { type: 'winnerOf', round: 'sf', matchIndex: 1 } },
    ],
  },
];
