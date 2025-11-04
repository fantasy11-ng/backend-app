import { Injectable } from '@nestjs/common';

type R16Pair = { home: number; away: number };

@Injectable()
export class SeedingRulesService {
  // FIFA World Cup (8 groups: A..H) standard mapping
  buildWorldCup32Pairs(
    groupLetterToWinner: Record<string, number>,
    groupLetterToRunnerUp: Record<string, number>,
  ): R16Pair[] {
    const w = groupLetterToWinner;
    const r = groupLetterToRunnerUp;
    return [
      { home: w['A'], away: r['B'] },
      { home: w['C'], away: r['D'] },
      { home: w['E'], away: r['F'] },
      { home: w['G'], away: r['H'] },
      { home: w['B'], away: r['A'] },
      { home: w['D'], away: r['C'] },
      { home: w['F'], away: r['E'] },
      { home: w['H'], away: r['G'] },
    ];
  }

  // Champions League (classic 8 groups) – deterministic approximation:
  // Winners play runners-up from different groups in fixed mapping for our predictor
  buildChampionsLeaguePairs(
    groupLetterToWinner: Record<string, number>,
    groupLetterToRunnerUp: Record<string, number>,
  ): R16Pair[] {
    const w = groupLetterToWinner;
    const r = groupLetterToRunnerUp;
    return [
      { home: w['A'], away: r['H'] },
      { home: w['B'], away: r['G'] },
      { home: w['C'], away: r['F'] },
      { home: w['D'], away: r['E'] },
      { home: w['E'], away: r['D'] },
      { home: w['F'], away: r['C'] },
      { home: w['G'], away: r['B'] },
      { home: w['H'], away: r['A'] },
    ];
  }

  // AFCON/Euro-style (6 groups: A..F) mapping depends on which third-placed groups qualify.
  // We encode the official combination table (15 combos).
  buildAfcon24Pairs(
    groupLetterToWinner: Record<string, number>,
    groupLetterToRunnerUp: Record<string, number>,
    thirdQualifiedByGroupLetter: string[],
    thirdGroupToTeamId: Record<string, number>,
  ): R16Pair[] {
    const w = groupLetterToWinner;
    const r = groupLetterToRunnerUp;

    // combination key is sorted letters string, e.g., "ABCD"
    const key = thirdQualifiedByGroupLetter.slice().sort().join('');

    // Each entry returns mapping of third slots T1..T4 to group letters.
    // Slots positions:
    // M1: A1 vs T1
    // M2: B1 vs T2
    // M3: C1 vs T3
    // M4: D1 vs T4
    // M5: E1 vs D2
    // M6: F1 vs E2
    // M7: B2 vs F2
    // M8: A2 vs C2
    const table: Record<string, [string, string, string, string]> = {
      ABCD: ['A', 'D', 'B', 'C'],
      ABCE: ['A', 'E', 'B', 'C'],
      ABCF: ['A', 'F', 'B', 'C'],
      ABDE: ['D', 'E', 'A', 'B'],
      ABDF: ['D', 'F', 'A', 'B'],
      ABEF: ['E', 'F', 'A', 'B'],
      ACDE: ['C', 'E', 'A', 'D'],
      ACDF: ['C', 'F', 'A', 'D'],
      ACEF: ['C', 'F', 'A', 'E'],
      ADEF: ['D', 'F', 'A', 'E'],
      BCDE: ['C', 'E', 'B', 'D'],
      BCDF: ['C', 'F', 'B', 'D'],
      BCEF: ['C', 'F', 'B', 'E'],
      BDEF: ['D', 'F', 'B', 'E'],
      CDEF: ['C', 'F', 'D', 'E'],
    };

    const tSlots = table[key];
    if (!tSlots) {
      // Fallback: assign first four in order
      const tLetters = thirdQualifiedByGroupLetter.slice(0, 4);
      return [
        { home: w['A'], away: thirdGroupToTeamId[tLetters[0]] },
        { home: w['B'], away: thirdGroupToTeamId[tLetters[1]] },
        { home: w['C'], away: thirdGroupToTeamId[tLetters[2]] },
        { home: w['D'], away: thirdGroupToTeamId[tLetters[3]] },
        { home: w['E'], away: r['D'] },
        { home: w['F'], away: r['E'] },
        { home: r['B'], away: r['F'] },
        { home: r['A'], away: r['C'] },
      ];
    }

    const [T1, T2, T3, T4] = tSlots;
    return [
      { home: w['A'], away: thirdGroupToTeamId[T1] },
      { home: w['B'], away: thirdGroupToTeamId[T2] },
      { home: w['C'], away: thirdGroupToTeamId[T3] },
      { home: w['D'], away: thirdGroupToTeamId[T4] },
      { home: w['E'], away: r['D'] },
      { home: w['F'], away: r['E'] },
      { home: r['B'], away: r['F'] },
      { home: r['A'], away: r['C'] },
    ];
  }
}
