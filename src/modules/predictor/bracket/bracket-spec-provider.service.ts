import { Injectable } from '@nestjs/common';
import { BracketSpec } from './bracket.types';
import { worldCup2026Spec } from './specs/world-cup-2026';
import { worldCup32Spec } from './specs/world-cup-32';

export type CompetitionType = 'world-cup-2026' | 'world-cup-32' | 'afcon' | 'ucl' | 'other';

@Injectable()
export class BracketSpecProviderService {
  /**
   * Returns the ordered list of BracketSpecs for the competition.
   *
   * 'world-cup-2026'  → 12 groups, starts at R32 (WC2026 format)
   * 'world-cup-32'    → 8 groups, starts at R16 (classic WC format / WC2022)
   * 'afcon' | 'ucl' | 'other' → falls back to WC32-style (starts at R16);
   *   seeding of R16 is handled separately via SeedingRulesService for AFCON/UCL.
   */
  getSpecs(competition: CompetitionType): BracketSpec[] {
    switch (competition) {
      case 'world-cup-2026':
        return worldCup2026Spec;
      case 'world-cup-32':
      case 'afcon':
      case 'ucl':
      case 'other':
      default:
        return worldCup32Spec;
    }
  }

  /**
   * Detect competition type from the league name or an explicit override.
   * This mirrors the detection logic already in PredictorService/getCompetition().
   */
  detectCompetition(
    numGroups: number,
    leagueNameOrOverride: string,
  ): CompetitionType {
    const t = (leagueNameOrOverride || '').toLowerCase();
    const isWorldCup = t.includes('world-cup') || t.includes('world cup');
    const isAfcon = t.includes('afcon') || t.includes('africa cup');
    const isUcl = t.includes('ucl') || t.includes('champions league');

    if (isWorldCup) {
      // WC2026 has 12 groups; WC22 and before have 8.
      return numGroups >= 12 ? 'world-cup-2026' : 'world-cup-32';
    }
    if (isAfcon) return 'afcon';
    if (isUcl) return 'ucl';
    return 'other';
  }

  /**
   * Returns the first knockout round code for a given spec list.
   * E.g. 'r32' for WC2026, 'r16' for WC32.
   */
  firstKnockoutRoundCode(specs: BracketSpec[]): string {
    return specs[0]?.roundCode ?? 'r16';
  }

  /**
   * Returns the knockout round size (= number of teams) for the first round.
   */
  firstKnockoutSize(specs: BracketSpec[]): number {
    const first = specs[0];
    if (!first) return 16;
    return first.expectedPredictionCount * 2;
  }
}
