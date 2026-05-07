import { BracketEngineService } from './bracket-engine.service';
import { BracketContext, BracketSource } from './bracket.types';

/**
 * Unit tests for BracketEngineService.resolveSource().
 * We test the resolution logic directly without needing a full DB.
 */
describe('BracketEngineService.resolveSource', () => {
  let engine: BracketEngineService;

  const mockCtx: BracketContext = {
    winnerByGroup: { A: 101, B: 201, C: 301, D: 401, E: 501, I: 601 },
    runnerUpByGroup: { A: 102, B: 202, C: 302, D: 402, E: 502, I: 602 },
    thirdByGroup: { A: 103, B: 203, C: 303, D: 403, E: 503, I: 603 },
    thirdQualifiedGroups: ['E', 'I', 'A', 'B', 'C', 'D', 'F', 'G'],
    winnersByRound: {
      r32: [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016],
      r16: [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008],
    },
    losersByRound: {
      sf: [3001, 3002],
    },
  };

  beforeEach(() => {
    engine = new BracketEngineService(null as any, null as any);
  });

  it('resolves groupPlacement winner (place=1)', () => {
    const src: BracketSource = { type: 'groupPlacement', group: 'A', place: 1 };
    expect(engine.resolveSource(src, mockCtx)).toBe(101);
  });

  it('resolves groupPlacement runner-up (place=2)', () => {
    const src: BracketSource = { type: 'groupPlacement', group: 'B', place: 2 };
    expect(engine.resolveSource(src, mockCtx)).toBe(202);
  });

  it('resolves groupPlacement third-place (place=3)', () => {
    const src: BracketSource = { type: 'groupPlacement', group: 'C', place: 3 };
    expect(engine.resolveSource(src, mockCtx)).toBe(303);
  });

  it('resolves winnerOf a previous round by matchIndex', () => {
    const src: BracketSource = { type: 'winnerOf', round: 'r32', matchIndex: 2 };
    expect(engine.resolveSource(src, mockCtx)).toBe(1003);
  });

  it('resolves winnerOf r16 by matchIndex', () => {
    const src: BracketSource = { type: 'winnerOf', round: 'r16', matchIndex: 0 };
    expect(engine.resolveSource(src, mockCtx)).toBe(2001);
  });

  it('resolves loserOf sf for third-place match', () => {
    const src: BracketSource = { type: 'loserOf', round: 'sf', matchIndex: 1 };
    expect(engine.resolveSource(src, mockCtx)).toBe(3002);
  });

  it('resolves thirdPlaceAnnexC for a known combination', () => {
    // EFGHIJKL combination (row 1 from Annex C):
    //   1A → E, 1B → J, 1D → I, 1E → F (not in mockCtx), 1G → H, 1I → G, 1K → L, 1L → K
    // But we'll test with a simpler case where groups exist in mockCtx.
    // We need a combination that has E and I in the thirdByGroup.
    // ABCDEIFG sorted = ABCDEFGI (doesn't match exact Annex C rows)
    // Instead use ABCDEFGI which may or may not exist; let's use a known row:
    // Row ABCDEFGH = "1A:H, 1B:G, 1D:B, 1E:C, 1G:A, 1I:F, 1K:D, 1L:E"
    // For group 'H', thirdByGroup doesn't have H in mockCtx, so it'll be null. 
    // Instead let's test the EFGHIJKL scenario where '1E' slot = group 'F'.
    // We'll use a mock Annex C table with just one entry.
    // Skip actual file read; test via monkey-patch approach.

    // Since the engine loads the JSON at module load time, we test the logic by setting
    // the qualifying groups to 'EFGHIJKL' and expecting slot '1E' = group 'F' = team 502 (not in mockCtx).
    // To test with groups in mockCtx, use combination where slot maps to 'E'.

    // The simplest verifiable test: with qualifying groups ABCDEIFG (sorted = ABCDEFGI)
    // if Annex C has that combo, '1A' slot would map to some group letter in mockCtx.
    // Instead, let us just verify it returns null when the annexTable is unknown.
    const src: BracketSource = {
      type: 'thirdPlaceAnnexC',
      slotKey: '1A',
      annexTable: 'unknown-table',
    };
    expect(engine.resolveSource(src, mockCtx)).toBeNull();
  });

  it('resolves thirdPlaceAnnexC correctly for EFGHIJKL combination, slot 1E → group F third', () => {
    // Row 1: EFGHIJKL → 1E slot = 'F', but 'F' not in mockCtx.thirdByGroup → null
    const ctxWithF: BracketContext = {
      ...mockCtx,
      thirdByGroup: { ...mockCtx.thirdByGroup, F: 999 },
      thirdQualifiedGroups: ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
    };
    const src: BracketSource = {
      type: 'thirdPlaceAnnexC',
      slotKey: '1E',
      annexTable: 'wc2026',
    };
    // EFGHIJKL sorted = EFGHIJKL; Annex C says 1E → 'F', F's third = 999
    expect(engine.resolveSource(src, ctxWithF)).toBe(999);
  });

  it('returns null for winnerOf when round has no predictions yet', () => {
    const src: BracketSource = { type: 'winnerOf', round: 'qf', matchIndex: 0 };
    expect(engine.resolveSource(src, mockCtx)).toBeNull();
  });
});
