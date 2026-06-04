import type { PlayerFixtureStats } from './entities/player-fixture-stats.entity';

export const PLAYER_INSIGHTS_FORM_LOOKBACK = 3;
export const PLAYER_INSIGHTS_PRICE_CHANGE_LOOKBACK_DAYS = 7;
export const PLAYER_INSIGHTS_MAX_PRICE_CHANGE = 250_000;
export const PLAYER_INSIGHTS_TRANSFER_DEMAND_RATIO_CAP = 0.2;
export const PLAYER_INSIGHTS_PERFORMANCE_LOOKBACK = 5;
export const PLAYER_INSIGHTS_PERFORMANCE_WEIGHTS = {
  fantasyPoints: 0.55,
  minutesPlayed: 0.2,
  shotsOnTarget: 0.15,
  keyPasses: 0.1,
} as const;

const PLAYER_INSIGHTS_FANTASY_POINTS_CAP = 12;
const PLAYER_INSIGHTS_MINUTES_CAP = 90;
const PLAYER_INSIGHTS_SHOTS_ON_TARGET_PER_APPEARANCE_CAP = 2;
const PLAYER_INSIGHTS_KEY_PASSES_PER_APPEARANCE_CAP = 3;

export type OwnershipInput = {
  selectedTeams: number;
  totalTeams: number;
};

export type TransferDemandInput = {
  transferIns: number;
  transferOuts: number;
  totalTeams: number;
  maxAbsPriceChange?: number;
  demandRatioCap?: number;
};

export type RecentFixtureMetricInput = Pick<
  PlayerFixtureStats,
  'fixtureId' | 'fantasyPoints' | 'minutesPlayed'
>;

export type FormInput = {
  recentFixtureStats?: RecentFixtureMetricInput[];
  lookback?: number;
};

export type PerformanceSeasonStatsInput = Partial<{
  appearances: number | null;
  shotsOnTarget: number | null;
  keyPasses: number | null;
}>;

export type PerformanceIndexInput = {
  recentFixtureStats?: RecentFixtureMetricInput[];
  seasonStats?: PerformanceSeasonStatsInput;
  lookback?: number;
};

export type PlayerComputedMetricsInput = Partial<{
  ownership: OwnershipInput | null;
  transferDemand: TransferDemandInput | null;
  form: FormInput | null;
  performanceIndex: PerformanceIndexInput | null;
}>;

export type PlayerComputedMetricsResult = {
  ownership: number | null;
  priceChange: number | null;
  form: number | null;
  performanceIndex: number | null;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const roundTo = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const toSortedRelevantFixtures = (
  recentFixtureStats: RecentFixtureMetricInput[] = [],
  lookback: number,
): RecentFixtureMetricInput[] => {
  if (lookback <= 0) {
    return [];
  }

  return [...recentFixtureStats]
    .filter((fixture) => {
      const minutesPlayed = fixture.minutesPlayed ?? 0;
      const fantasyPoints = fixture.fantasyPoints ?? 0;
      return minutesPlayed > 0 || fantasyPoints !== 0;
    })
    .sort((left, right) => right.fixtureId - left.fixtureId)
    .slice(0, lookback);
};

const average = (values: number[]): number | null => {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toScore = (value: number, cap: number): number => {
  if (cap <= 0) {
    return 0;
  }

  return clamp((value / cap) * 100, 0, 100);
};

export const calculateOwnershipPercentage = ({
  selectedTeams,
  totalTeams,
}: OwnershipInput): number | null => {
  if (totalTeams <= 0) {
    return null;
  }

  const sanitizedSelectedTeams = clamp(selectedTeams, 0, totalTeams);
  return roundTo((sanitizedSelectedTeams / totalTeams) * 100);
};

export const calculatePriceChange = ({
  transferIns,
  transferOuts,
  totalTeams,
  maxAbsPriceChange = PLAYER_INSIGHTS_MAX_PRICE_CHANGE,
  demandRatioCap = PLAYER_INSIGHTS_TRANSFER_DEMAND_RATIO_CAP,
}: TransferDemandInput): number | null => {
  if (totalTeams <= 0 || demandRatioCap <= 0 || maxAbsPriceChange < 0) {
    return null;
  }

  const netTransfers = transferIns - transferOuts;
  const demandRatio = netTransfers / totalTeams;
  const cappedDemandRatio = clamp(
    demandRatio,
    -demandRatioCap,
    demandRatioCap,
  );

  return Math.round((cappedDemandRatio / demandRatioCap) * maxAbsPriceChange);
};

export const calculateRecentForm = ({
  recentFixtureStats = [],
  lookback = PLAYER_INSIGHTS_FORM_LOOKBACK,
}: FormInput): number | null => {
  const relevantFixtures = toSortedRelevantFixtures(recentFixtureStats, lookback);
  const averageFantasyPoints = average(
    relevantFixtures.map((fixture) => fixture.fantasyPoints ?? 0),
  );

  return averageFantasyPoints === null ? null : roundTo(averageFantasyPoints);
};

export const calculatePerformanceIndex = ({
  recentFixtureStats = [],
  seasonStats = {},
  lookback = PLAYER_INSIGHTS_PERFORMANCE_LOOKBACK,
}: PerformanceIndexInput): number | null => {
  const relevantFixtures = toSortedRelevantFixtures(recentFixtureStats, lookback);
  const weightedScores: Array<{ score: number; weight: number }> = [];

  if (relevantFixtures.length) {
    const averageFantasyPoints =
      average(relevantFixtures.map((fixture) => fixture.fantasyPoints ?? 0)) ?? 0;
    const averageMinutesPlayed =
      average(relevantFixtures.map((fixture) => fixture.minutesPlayed ?? 0)) ?? 0;

    weightedScores.push({
      score: toScore(averageFantasyPoints, PLAYER_INSIGHTS_FANTASY_POINTS_CAP),
      weight: PLAYER_INSIGHTS_PERFORMANCE_WEIGHTS.fantasyPoints,
    });
    weightedScores.push({
      score: toScore(averageMinutesPlayed, PLAYER_INSIGHTS_MINUTES_CAP),
      weight: PLAYER_INSIGHTS_PERFORMANCE_WEIGHTS.minutesPlayed,
    });
  }

  const appearances = seasonStats.appearances ?? null;
  if (appearances && appearances > 0) {
    if (seasonStats.shotsOnTarget !== null && seasonStats.shotsOnTarget !== undefined) {
      weightedScores.push({
        score: toScore(
          seasonStats.shotsOnTarget / appearances,
          PLAYER_INSIGHTS_SHOTS_ON_TARGET_PER_APPEARANCE_CAP,
        ),
        weight: PLAYER_INSIGHTS_PERFORMANCE_WEIGHTS.shotsOnTarget,
      });
    }

    if (seasonStats.keyPasses !== null && seasonStats.keyPasses !== undefined) {
      weightedScores.push({
        score: toScore(
          seasonStats.keyPasses / appearances,
          PLAYER_INSIGHTS_KEY_PASSES_PER_APPEARANCE_CAP,
        ),
        weight: PLAYER_INSIGHTS_PERFORMANCE_WEIGHTS.keyPasses,
      });
    }
  }

  if (!weightedScores.length) {
    return null;
  }

  const totalWeight = weightedScores.reduce((sum, item) => sum + item.weight, 0);
  const totalScore = weightedScores.reduce(
    (sum, item) => sum + item.score * item.weight,
    0,
  );

  return roundTo(totalScore / totalWeight);
};

export const computePlayerInsightMetrics = (
  input: PlayerComputedMetricsInput = {},
): PlayerComputedMetricsResult => ({
  ownership: input.ownership
    ? calculateOwnershipPercentage(input.ownership)
    : null,
  priceChange: input.transferDemand
    ? calculatePriceChange(input.transferDemand)
    : null,
  form: input.form ? calculateRecentForm(input.form) : null,
  performanceIndex: input.performanceIndex
    ? calculatePerformanceIndex(input.performanceIndex)
    : null,
});
