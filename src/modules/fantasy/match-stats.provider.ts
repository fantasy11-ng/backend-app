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
}
