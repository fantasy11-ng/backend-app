import {
  SportmonksPlayer,
  SportmonksPlayerStatisticDetail,
} from '@/common/sportmonks/types/players.types';

export type PlayerSeasonStatsSnapshot = {
  minutesPlayed: number | null;
  appearances: number | null;
  lineups: number | null;
  starts: number | null;
  bench: number | null;
  shotsOnTarget: number | null;
  keyPasses: number | null;
};

const PLAYER_STAT_TYPE = {
  MINUTES_PLAYED: 119,
  APPEARANCES: 321,
  LINEUPS: 322,
  BENCH: 323,
  SHOTS_ON_TARGET: 86,
  KEY_PASSES: 117,
} as const;

const asNumericValue = (
  value: SportmonksPlayerStatisticDetail['value'],
): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    typeof value.total === 'number' &&
    Number.isFinite(value.total)
  ) {
    return value.total;
  }

  return null;
};

const sumStatType = (
  player: SportmonksPlayer,
  seasonId: number,
  typeId: number,
): number | null => {
  let total = 0;
  let found = false;

  for (const statistic of player.statistics ?? []) {
    if (statistic.season_id !== seasonId) {
      continue;
    }

    for (const detail of statistic.details ?? []) {
      if (detail.type_id !== typeId) {
        continue;
      }

      const value = asNumericValue(detail.value);
      if (value == null) {
        continue;
      }

      total += value;
      found = true;
    }
  }

  return found ? total : null;
};

const deriveStarts = (lineups: number | null, appearances: number | null, bench: number | null) => {
  if (lineups != null) {
    return lineups;
  }

  if (appearances == null || bench == null) {
    return null;
  }

  return Math.max(appearances - bench, 0);
};

export const mapSportmonksSeasonStats = (
  player: SportmonksPlayer,
  seasonId: number,
): PlayerSeasonStatsSnapshot => {
  const minutesPlayed = sumStatType(
    player,
    seasonId,
    PLAYER_STAT_TYPE.MINUTES_PLAYED,
  );
  const appearances = sumStatType(
    player,
    seasonId,
    PLAYER_STAT_TYPE.APPEARANCES,
  );
  const lineups = sumStatType(player, seasonId, PLAYER_STAT_TYPE.LINEUPS);
  const bench = sumStatType(player, seasonId, PLAYER_STAT_TYPE.BENCH);

  return {
    minutesPlayed,
    appearances,
    lineups,
    starts: deriveStarts(lineups, appearances, bench),
    bench,
    shotsOnTarget: sumStatType(
      player,
      seasonId,
      PLAYER_STAT_TYPE.SHOTS_ON_TARGET,
    ),
    keyPasses: sumStatType(player, seasonId, PLAYER_STAT_TYPE.KEY_PASSES),
  };
};
