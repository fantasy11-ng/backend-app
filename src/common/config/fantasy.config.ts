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

  const maxPlayersPerTeam = parseInt(
    process.env.FANTASY_MAX_PLAYERS_PER_TEAM || '3',
    10,
  );

  // Optional "time travel" override for development/testing (e.g. AFCON historical data).
  // If set, fantasy endpoints will use this date as "now" for queries like upcoming fixtures.
  const nowOverrideIso = process.env.FANTASY_NOW_OVERRIDE_ISO || undefined;

  // Simulated time: advances automatically. Formula: simulatedNow = anchor + (realNow - realAnchor) × speed
  // FANTASY_SIM_ANCHOR_ISO: tournament start in simulated time (e.g. 2022-11-20 for World Cup 2022)
  // FANTASY_SIM_REAL_ANCHOR_ISO: when in real time we "started" (omit = server start)
  // FANTASY_SIM_SPEED: multiplier (2 = 2x speed, 24 = 1 real hour = 1 sim day, 1 = realtime)
  const simAnchorIso = process.env.FANTASY_SIM_ANCHOR_ISO || undefined;
  const simRealAnchorIso = process.env.FANTASY_SIM_REAL_ANCHOR_ISO || undefined;
  const simSpeedParsed = process.env.FANTASY_SIM_SPEED;
  const simSpeed =
    simSpeedParsed != null && simSpeedParsed !== ''
      ? parseFloat(simSpeedParsed)
      : undefined;

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
    maxPlayersPerTeam,
    scoring,
    transfersLocked: process.env.FANTASY_TRANSFERS_LOCKED === 'true',
    snapshotLeadMinutes,
    nowOverrideIso,
    simAnchorIso,
    simRealAnchorIso,
    simSpeed,
  };
};

export type FantasyConfig = ReturnType<typeof fantasyConfig>;
