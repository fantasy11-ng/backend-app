import {
  MultiPlayerCompareDto,
  PlayerCompareItemDto,
  PlayerDetailDto,
  PlayerInsightMetricsDto,
  PlayerRecentFixtureStatsDto,
  PlayerSeasonStatsDto,
  PlayerSummaryDto,
} from './dto/player-insights.dto';
import { Player } from './entities/player.entity';
import { PlayerFixtureStats } from './entities/player-fixture-stats.entity';
import {
  computePlayerInsightMetrics,
  PlayerComputedMetricsInput,
} from './player-insights.metrics';

export type PlayerSeasonStatsInput = Partial<{
  points: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number | null;
  appearances: number | null;
  lineups: number | null;
  starts: number | null;
  bench: number | null;
  shotsOnTarget: number | null;
  keyPasses: number | null;
}>;

export type PlayerInsightMetricsInput = Partial<{
  ownership: number | null;
  priceChange: number | null;
  form: number | null;
  performanceIndex: number | null;
}>;

export type PlayerInsightsMapperInput = {
  player: Player;
  recentFixtureStats?: PlayerFixtureStats[];
  seasonStats?: PlayerSeasonStatsInput;
  insights?: PlayerInsightMetricsInput;
  computedMetrics?: PlayerComputedMetricsInput;
};

const toRecentFixtureStatsDto = (
  stats: PlayerFixtureStats[],
): PlayerRecentFixtureStatsDto[] =>
  stats.map((item) => ({
    fixtureId: item.fixtureId,
    minutesPlayed: item.minutesPlayed ?? 0,
    goals: item.goals ?? 0,
    assists: item.assists ?? 0,
    yellowCards: item.yellowCards ?? 0,
    redCards: item.redCards ?? 0,
    fantasyPoints: item.fantasyPoints ?? 0,
  }));

export const toPlayerSummaryDto = (player: Player): PlayerSummaryDto => ({
  id: player.id,
  name: player.name,
  commonName: player.commonName,
  image: player.image,
  pool: player.pool,
  positionId: player.positionId,
  position: {
    id: player.position.id,
    name: player.position.name,
    code: player.position.code,
    developer_name: player.position.developer_name,
  },
  countryId: player.countryId,
  externalId: player.externalId ?? null,
  rating: player.rating ?? 0,
  price: player.price ?? 0,
});

export const toPlayerSeasonStatsDto = (
  player: Player,
  seasonStats: PlayerSeasonStatsInput = {},
): PlayerSeasonStatsDto => ({
  points: seasonStats.points ?? player.points ?? 0,
  goals: seasonStats.goals ?? player.goals ?? 0,
  assists: seasonStats.assists ?? player.assists ?? 0,
  yellowCards: seasonStats.yellowCards ?? player.yellowCards ?? 0,
  redCards: seasonStats.redCards ?? player.redCards ?? 0,
  minutesPlayed: seasonStats.minutesPlayed ?? player.minutesPlayed ?? null,
  appearances: seasonStats.appearances ?? player.appearances ?? null,
  lineups: seasonStats.lineups ?? player.lineups ?? null,
  starts: seasonStats.starts ?? player.starts ?? null,
  bench: seasonStats.bench ?? player.bench ?? null,
  shotsOnTarget: seasonStats.shotsOnTarget ?? player.shotsOnTarget ?? null,
  keyPasses: seasonStats.keyPasses ?? player.keyPasses ?? null,
});

const hasOwnMetricValue = (
  insights: PlayerInsightMetricsInput,
  key: keyof PlayerInsightMetricsInput,
): boolean =>
  Object.prototype.hasOwnProperty.call(insights, key) &&
  insights[key] !== undefined;

const resolveInsightMetric = (
  insights: PlayerInsightMetricsInput,
  derivedInsights: PlayerInsightMetricsInput,
  key: keyof PlayerInsightMetricsInput,
): number | null =>
  hasOwnMetricValue(insights, key)
    ? (insights[key] ?? null)
    : (derivedInsights[key] ?? null);

const buildDerivedComputedMetrics = (
  player: Player,
  seasonStats: PlayerSeasonStatsInput,
  recentFixtureStats: PlayerFixtureStats[],
  computedMetrics?: PlayerComputedMetricsInput,
): PlayerComputedMetricsInput => {
  const derivedSeasonSupport = {
    appearances: seasonStats.appearances ?? player.appearances ?? null,
    shotsOnTarget: seasonStats.shotsOnTarget ?? player.shotsOnTarget ?? null,
    keyPasses: seasonStats.keyPasses ?? player.keyPasses ?? null,
  };

  const derived: PlayerComputedMetricsInput = {
    ...computedMetrics,
  };

  if (computedMetrics?.form === undefined) {
    derived.form = {
      recentFixtureStats,
    };
  } else if (computedMetrics?.form) {
    derived.form = {
      recentFixtureStats,
      ...computedMetrics.form,
    };
  }

  if (computedMetrics?.performanceIndex === undefined) {
    derived.performanceIndex = {
      recentFixtureStats,
      seasonStats: derivedSeasonSupport,
    };
  } else if (computedMetrics?.performanceIndex) {
    derived.performanceIndex = {
      recentFixtureStats,
      seasonStats: {
        ...derivedSeasonSupport,
        ...(computedMetrics.performanceIndex.seasonStats ?? {}),
      },
      ...computedMetrics.performanceIndex,
    };
  }

  return derived;
};

export const toPlayerInsightMetricsDto = (
  insights: PlayerInsightMetricsInput = {},
  computedMetrics?: PlayerComputedMetricsInput,
): PlayerInsightMetricsDto => {
  const derivedInsights = computePlayerInsightMetrics(computedMetrics);

  return {
    ownership: resolveInsightMetric(insights, derivedInsights, 'ownership'),
    priceChange: resolveInsightMetric(insights, derivedInsights, 'priceChange'),
    form: resolveInsightMetric(insights, derivedInsights, 'form'),
    performanceIndex: resolveInsightMetric(
      insights,
      derivedInsights,
      'performanceIndex',
    ),
  };
};

export const toPlayerDetailDto = ({
  player,
  recentFixtureStats = [],
  seasonStats = {},
  insights = {},
  computedMetrics,
}: PlayerInsightsMapperInput): PlayerDetailDto => ({
  player: toPlayerSummaryDto(player),
  season: toPlayerSeasonStatsDto(player, seasonStats),
  insights: toPlayerInsightMetricsDto(
    insights,
    buildDerivedComputedMetrics(
      player,
      seasonStats,
      recentFixtureStats,
      computedMetrics,
    ),
  ),
  recentFixtures: toRecentFixtureStatsDto(recentFixtureStats),
});

export const toPlayerCompareItemDto = ({
  player,
  recentFixtureStats = [],
  seasonStats = {},
  insights = {},
  computedMetrics,
}: PlayerInsightsMapperInput): PlayerCompareItemDto => ({
  player: toPlayerSummaryDto(player),
  season: toPlayerSeasonStatsDto(player, seasonStats),
  insights: toPlayerInsightMetricsDto(
    insights,
    buildDerivedComputedMetrics(
      player,
      seasonStats,
      recentFixtureStats,
      computedMetrics,
    ),
  ),
});

export const toMultiPlayerCompareDto = (
  players: PlayerInsightsMapperInput[],
): MultiPlayerCompareDto => ({
  players: players.map((player) => toPlayerCompareItemDto(player)),
});
