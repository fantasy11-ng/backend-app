import { PositionCode } from '@/modules/fantasy/fantasy.types';

export interface FormationDefinition {
  code: string;
  positions: Record<PositionCode, number>;
}

export interface ScoringConfig {
  goal: number;
  assist: number;
  playedMatch: number;
  cleanSheet: number;
  threeSaves: number;
  ratingHigh: { min: number; max: number; points: number };
  ratingMedium: { min: number; max: number; points: number };
  penaltyScoredCorrectTaker: number;
  freeKickScoredCorrectTaker: number;
  penaltyMiss: number;
  yellowCard: number;
  redCard: number;
  ownGoal: number;
  goalsConcededStep: { step: number; points: number };
}

export const fantasyConfig = () => {
  const leagueMaxParticipants = parseInt(
    process.env.FANTASY_LEAGUE_MAX_PARTICIPANTS || '200',
    10,
  );

  const initialBudget = parseInt(
    process.env.FANTASY_INITIAL_BUDGET || '100000000',
    10,
  );

  const snapshotLeadMinutes = parseInt(
    process.env.FANTASY_SNAPSHOT_LEAD_MINUTES || '120',
    10,
  );

  // Optional "time travel" override for development/testing (e.g. AFCON historical data).
  // If set, fantasy endpoints will use this date as "now" for queries like upcoming fixtures.
  const nowOverrideIso = process.env.FANTASY_NOW_OVERRIDE_ISO || undefined;

  const scoring: ScoringConfig = {
    goal: 5,
    assist: 3,
    playedMatch: 1,
    cleanSheet: 4,
    threeSaves: 1,
    ratingHigh: { min: 8.5, max: 10, points: 3 },
    ratingMedium: { min: 7, max: 8.4, points: 3 },
    penaltyScoredCorrectTaker: 1,
    freeKickScoredCorrectTaker: 2,
    penaltyMiss: -3,
    yellowCard: -1,
    redCard: -3,
    ownGoal: -2,
    goalsConcededStep: { step: 2, points: -1 }, // every 2 goals conceded (GK/DEF)
  };

  return {
    leagueMaxParticipants,
    initialBudget,
    squadSize: 15,
    startingXiSize: 11,
    benchSize: 4,
    scoring,
    transfersLocked: process.env.FANTASY_TRANSFERS_LOCKED === 'true',
    snapshotLeadMinutes,
    nowOverrideIso,
  };
};

export type FantasyConfig = ReturnType<typeof fantasyConfig>;
