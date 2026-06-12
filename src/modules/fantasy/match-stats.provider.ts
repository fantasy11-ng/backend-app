export const MATCH_STATS_PROVIDER = 'MATCH_STATS_PROVIDER';

export interface PlayerMatchStats {
  playerId: number;
  fixtureId: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  saves: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  rating?: number;
  cleanSheet: boolean;
  penaltyScored: boolean;
  penaltyMissed: boolean;
  freeKickScored: boolean;
}

export interface MatchStatsProvider {
  getStatsForFixture(fixtureId: number): Promise<PlayerMatchStats[]>;

  /**
   * Returns the Sportmonks player IDs (externalId) for every player named in a
   * fixture's match-day squads (starters + named substitutes, both teams).
   * Used to refresh season stats for only the players involved in a fixture.
   */
  getMatchDayPlayerExternalIds(fixtureId: number): Promise<number[]>;
}
