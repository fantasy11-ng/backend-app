import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { SportmonksPlayersService } from '@/common/sportmonks/services/players.service';
import { SportmonksStandingsService } from '@/common/sportmonks/services/standings.service';
import { DataSource, IsNull } from 'typeorm';
import { Fixture } from '@/modules/stages/entities/fixture.entity';
import { Player } from './entities/player.entity';
import { CreatePlayerDto } from './dto/create-player.dto';
import { FootballService } from '@/common/football/services/football.service';
import { SettingsService } from '../settings/settings.service';
import { SportmonksTeam } from '@/common/sportmonks/types/teams.type';
import { SportmonksPlayer } from '@/common/sportmonks/types/players.types';
import {
  FilterOperator,
  PaginateConfig,
  PaginateQuery,
  Paginated,
  paginate,
} from 'nestjs-paginate';
import { DEFAULT_PLAYER_RATING } from '@/common/football/constants/players.constants';
import {
  mapSportmonksSeasonStats,
  PlayerSeasonStatsSnapshot,
} from './player-season-stats.mapper';
import { PlayerFixtureStats } from './entities/player-fixture-stats.entity';
import {
  MultiPlayerCompareDto,
  PlayerDetailDto,
  PlayerGameweekPointsDto,
  PlayerStatLeadersResponseDto,
} from './dto/player-insights.dto';
import {
  toMultiPlayerCompareDto,
  toPlayerDetailDto,
  toPlayerStatLeaderDto,
} from './player-insights.mapper';
import { TeamStatDto } from './dto/team-stats.dto';
import { MainConfig } from '@/common/config/main.config';

const SEASON_STAT_TYPE_IDS = [86, 117, 119, 321, 322, 323];
const pickPositiveId = (...candidates: Array<number | null | undefined>) => {
  for (const c of candidates) {
    if (c == null) continue;
    const n = Number(c);
    if (!Number.isFinite(n) || n <= 0) continue;
    return n;
  }
  return 0;
};

export const PLAYER_PAGINATION_CONFIG: PaginateConfig<Player> = {
  sortableColumns: [
    'id',
    'name',
    'pool',
    'rating',
    'price',
    'goals',
    'assists',
    'yellowCards',
    'redCards',
    'points',
    'cleanSheets',
    'minutesPlayed',
    'appearances',
    'lineups',
    'starts',
    'bench',
    'shotsOnTarget',
    'keyPasses',
  ],
  defaultSortBy: [
    ['points', 'DESC'],
    ['price', 'DESC'],
  ],
  nullSort: 'last',
  searchableColumns: ['name', 'commonName'],
  filterableColumns: {
    positionId: [FilterOperator.EQ],
    countryId: [FilterOperator.EQ],
    pool: [FilterOperator.EQ],
    price: [
      FilterOperator.EQ,
      FilterOperator.GTE,
      FilterOperator.LTE,
      FilterOperator.BTW,
    ],
  },
};

@Injectable()
export class PlayersService {
  private teamStatsCache: { data: TeamStatDto[]; fetchedAt: number } | null =
    null;

  private static readonly TEAM_STATS_CACHE_MS = 60 * 60 * 1000;

  constructor(
    private sportmonksPlayersService: SportmonksPlayersService,
    private sportmonksStandingsService: SportmonksStandingsService,
    private settingsService: SettingsService,
    private footballService: FootballService,
    private configService: ConfigService<MainConfig>,
    @InjectDataSource() private db: DataSource,
  ) {}

  async createOrUpdatePlayer(data: CreatePlayerDto) {
    const playersRepo = this.db.getRepository(Player);

    // IMPORTANT:
    // - `externalId` should be the SportMonks **player** id (stable)
    // - do NOT upsert by name; names are not unique and can cause duplicates
    let existingPlayer: Player | null = null;

    if (data.externalId != null) {
      existingPlayer = await playersRepo.findOne({
        where: { externalId: data.externalId },
      });
    }

    // Fallback for legacy rows created before externalId was correct.
    if (!existingPlayer) {
      existingPlayer = await playersRepo.findOne({
        where: {
          name: data.name,
          externalId: IsNull(),
        },
      });
    }

    // Derive player price between 5M–10M based on rating
    const rating =
      data.rating ?? existingPlayer?.rating ?? DEFAULT_PLAYER_RATING;
    const minRating = 40;
    const maxRating = 90;
    const clamped =
      rating < minRating ? minRating : rating > maxRating ? maxRating : rating;
    const minPrice = 5_000_000;
    const maxPrice = 10_000_000;
    const t = (clamped - minRating) / (maxRating - minRating);
    const price = Math.round(minPrice + t * (maxPrice - minPrice));

    return await playersRepo.save({
      ...existingPlayer,
      ...data,
      rating,
      price,
    });
  }

  /**
   * Idempotent upsert for a Sportmonks player record.
   * Uses Sportmonks `playerId` as `externalId` (stable ID used in fixture stats).
   */
  async upsertFromSportmonksPlayer(params: {
    sportmonksPlayerId: number;
    player: SportmonksPlayer;
    positionId?: number;
    position?: {
      id: number;
      name: string;
      code: string;
      developer_name: string;
    } | null;
    fallbackCountryId?: number;
    seasonStats?: PlayerSeasonStatsSnapshot;
  }) {
    const {
      sportmonksPlayerId,
      player,
      positionId,
      position,
      fallbackCountryId,
      seasonStats,
    } = params;

    const pid = positionId ?? player.position_id;
    if (!pid) {
      throw new Error(
        `Missing position_id for sportmonksPlayerId=${sportmonksPlayerId}`,
      );
    }

    const pos =
      position ??
      player.position ??
      this.footballService.positionIdToPosition(pid);

    const countryId = pickPositiveId(
      player.nationality_id as any,
      player.country_id as any,
      fallbackCountryId as any,
    );

    const seasonStatsPatch =
      seasonStats === undefined
        ? {}
        : {
            minutesPlayed: seasonStats.minutesPlayed ?? null,
            appearances: seasonStats.appearances ?? null,
            lineups: seasonStats.lineups ?? null,
            starts: seasonStats.starts ?? null,
            bench: seasonStats.bench ?? null,
            shotsOnTarget: seasonStats.shotsOnTarget ?? null,
            keyPasses: seasonStats.keyPasses ?? null,
          };

    return this.createOrUpdatePlayer({
      externalId: sportmonksPlayerId,
      image: player.image_path,
      name: player.name,
      commonName: player.common_name,
      rating: this.footballService.getRating(player.name),
      pool: this.footballService.getPlayerPool(player.name),
      positionId: pid,
      position: {
        id: pos.id,
        name: pos.name,
        developer_name: pos.developer_name,
        code: pos.code,
      },
      countryId,
      ...seasonStatsPatch,
    });
  }

  async syncPlayers() {
    const league = await this.settingsService.getMainServiceLeague();

    let validCountryIds: Set<number> | null = null;
    try {
      const countries = await this.sportmonksPlayersService.getCountries();
      validCountryIds = new Set(countries.map((c) => c.id));
    } catch (e) {
      // Best-effort: if countries can't be loaded, still sync players.
      validCountryIds = null;
    }

    const pickCountryId = (...candidates: Array<number | null | undefined>) => {
      for (const c of candidates) {
        if (c == null) continue;
        const n = Number(c);
        if (!Number.isFinite(n) || n <= 0) continue;
        if (validCountryIds && !validCountryIds.has(n)) continue;
        return n;
      }
      return 0;
    };

    let hasMore = true;
    let page = 1;

    while (hasMore) {
      const data =
        await this.sportmonksPlayersService.getPlayers<SportmonksTeam>({
          seasonId: league.currentSeason.serviceId,
          page,
          limit: 50,
        });

      for (const team of data.data) {
        const squad = team.players ?? [];
        for (const playerData of squad) {
          try {
            // SportMonks team squad items have their own id (row id) and a `player_id` which
            // is the stable SportMonks player id. We must persist the player id.
            const sportmonksPlayerId =
              (playerData as any).player_id ?? playerData.player?.id;
            if (!sportmonksPlayerId) {
              console.error('Invalid player: no sportmonks player_id');
              continue;
            }

            const smPlayer = playerData.player;
            if (!smPlayer) {
              console.error(
                `Invalid player ${sportmonksPlayerId}: missing included player payload`,
              );
              continue;
            }

            const positionId = playerData.position_id ?? smPlayer.position_id;
            if (!positionId) {
              console.error(
                `Invalid player ${sportmonksPlayerId}: no position_id`,
              );
              continue;
            }

            // Prefer the squad-position include; fallback to player.position include; fallback to local mapping.
            const pos =
              playerData.position ??
              smPlayer.position ??
              this.footballService.positionIdToPosition(positionId);

            // Don't drop players just because Sportmonks country fields are missing.
            // Fallback to the team's country_id so scoring can still match the player.
            const countryId = pickCountryId(
              smPlayer.nationality_id as any,
              smPlayer.country_id as any,
              team.country_id as any,
            );
            if (
              validCountryIds &&
              countryId === 0 &&
              (smPlayer.nationality_id ||
                smPlayer.country_id ||
                team.country_id)
            ) {
              console.warn(
                `Player ${sportmonksPlayerId} has unknown country IDs: nationality_id=${smPlayer.nationality_id} country_id=${smPlayer.country_id} team.country_id=${team.country_id}`,
              );
            }

            let playerWithSeasonStats = smPlayer;
            let seasonStats: PlayerSeasonStatsSnapshot | undefined = undefined;

            try {
              playerWithSeasonStats =
                await this.sportmonksPlayersService.getPlayerById(
                  sportmonksPlayerId,
                  {
                    include: 'position;statistics.details',
                    filters: `playerStatisticSeasons:${league.currentSeason.serviceId};playerStatisticDetailTypes:${SEASON_STAT_TYPE_IDS.join(',')}`,
                  },
                );
              seasonStats = mapSportmonksSeasonStats(
                playerWithSeasonStats,
                league.currentSeason.serviceId,
              );
            } catch (e) {
              console.warn(
                `Failed to fetch season stats for player ${sportmonksPlayerId}: ${
                  (e as Error)?.message ?? e
                }`,
              );
            }

            await this.upsertFromSportmonksPlayer({
              sportmonksPlayerId,
              player: playerWithSeasonStats,
              positionId,
              position: {
                id: pos.id,
                name: pos.name,
                developer_name: pos.developer_name,
                code: pos.code,
              },
              fallbackCountryId: countryId,
              seasonStats,
            });
          } catch (e) {
            console.error(
              `Failed to upsert player for team ${team.id}: ${
                (e as Error)?.message ?? e
              }`,
            );
          }
        }
      }

      hasMore = data.pagination?.has_more;
      page = data.pagination?.next_page;
    }

    return 'Players have been synchronised successfully';
  }

  async getPlayers(query: PaginateQuery): Promise<Paginated<Player>> {
    const qb = this.db.getRepository(Player).createQueryBuilder('player');
    const result = await paginate(query, qb, PLAYER_PAGINATION_CONFIG);

    if (result.data.length) {
      const playerIds = result.data.map((p) => p.id);
      const formRows = await this.db.query<
        { playerId: number; form: string }[]
      >(
        `
        SELECT t."playerId", ROUND(AVG(t."fantasyPoints")::numeric, 1) AS form
        FROM (
          SELECT pfs."playerId",
                 pfs."fantasyPoints",
                 ROW_NUMBER() OVER (
                   PARTITION BY pfs."playerId"
                   ORDER BY f."startingAt" DESC
                 ) AS rn
          FROM player_fixture_stats pfs
          INNER JOIN fixture f ON f.id = pfs."fixtureId"
          WHERE pfs."playerId" = ANY($1::int[])
            AND pfs."minutesPlayed" > 0
            AND f."startingAt" <= NOW()
        ) t
        WHERE t.rn <= 3
        GROUP BY t."playerId"
        `,
        [playerIds],
      );

      const formByPlayerId = new Map(
        formRows.map((row) => [Number(row.playerId), Number(row.form)]),
      );

      for (const player of result.data) {
        player.form = formByPlayerId.get(player.id) ?? 0;
      }
    }

    return result;
  }

  private async getRecentFixtureStats(
    playerId: number,
    limit = 3,
  ): Promise<PlayerFixtureStats[]> {
    return await this.db
      .getRepository(PlayerFixtureStats)
      .createQueryBuilder('stats')
      .innerJoin(Fixture, 'fixture', 'fixture.id = stats.fixtureId')
      .where('stats.playerId = :playerId', { playerId })
      .andWhere('fixture.startingAt <= NOW()')
      .orderBy('fixture.startingAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Fantasy points per gameweek for a player (only gameweeks with played
   * fixtures), ordered chronologically by the gameweek's first kickoff.
   */
  private async getGameweekPoints(
    playerId: number,
  ): Promise<PlayerGameweekPointsDto[]> {
    const rows = await this.db.query<
      { gameweekId: number; gameweekCode: string | null; points: string }[]
    >(
      `
      SELECT gw."id" AS "gameweekId",
             gw."code" AS "gameweekCode",
             COALESCE(SUM(pfs."fantasyPoints"), 0) AS "points"
      FROM player_fixture_stats pfs
      INNER JOIN fixture f ON f.id = pfs."fixtureId"
      INNER JOIN fantasy_gameweek gw ON gw.id = f."gameweekId"
      WHERE pfs."playerId" = $1
        AND f."startingAt" <= NOW()
      GROUP BY gw."id", gw."code", gw."firstKickoffAt"
      ORDER BY gw."firstKickoffAt" ASC
      `,
      [playerId],
    );

    return rows.map((row) => ({
      gameweekId: Number(row.gameweekId),
      gameweekCode: row.gameweekCode ?? null,
      points: Number(row.points) || 0,
    }));
  }

  /**
   * Ownership across current fantasy squads.
   * `selectedTeams` = number of current squads containing the player.
   * `totalTeams` = total number of current squads.
   */
  private async getOwnershipCounts(playerIds: number[]): Promise<{
    totalTeams: number;
    selectedTeamsByPlayerId: Map<number, number>;
  }> {
    const totalRow = await this.db.query<{ totalTeams: string }[]>(
      `SELECT COUNT(*)::int AS "totalTeams" FROM fantasy_squad WHERE "isCurrent" = true`,
    );
    const totalTeams = Number(totalRow[0]?.totalTeams) || 0;

    const selectedTeamsByPlayerId = new Map<number, number>();
    if (playerIds.length && totalTeams > 0) {
      const selectedRows = await this.db.query<
        { playerId: number; selectedTeams: string }[]
      >(
        `
        SELECT sp."playerId" AS "playerId",
               COUNT(DISTINCT s."id")::int AS "selectedTeams"
        FROM fantasy_squad_player sp
        INNER JOIN fantasy_squad s ON s.id = sp."squadId"
        WHERE s."isCurrent" = true
          AND sp."playerId" = ANY($1::int[])
        GROUP BY sp."playerId"
        `,
        [playerIds],
      );

      for (const row of selectedRows) {
        selectedTeamsByPlayerId.set(
          Number(row.playerId),
          Number(row.selectedTeams) || 0,
        );
      }
    }

    return { totalTeams, selectedTeamsByPlayerId };
  }

  async getPlayerDetail(playerId: number): Promise<PlayerDetailDto> {
    const player = await this.db.getRepository(Player).findOne({
      where: { id: playerId },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    const [recentFixtureStats, gameweekPoints, ownership] = await Promise.all([
      this.getRecentFixtureStats(playerId),
      this.getGameweekPoints(playerId),
      this.getOwnershipCounts([playerId]),
    ]);

    const selectedTeams = ownership.selectedTeamsByPlayerId.get(playerId) ?? 0;
    const currentGameweekPoints =
      gameweekPoints.length > 0
        ? gameweekPoints[gameweekPoints.length - 1].points
        : null;

    return toPlayerDetailDto({
      player,
      recentFixtureStats,
      seasonStats: { currentGameweekPoints },
      insights: { selectedTeams },
      computedMetrics: {
        ownership: { selectedTeams, totalTeams: ownership.totalTeams },
      },
      gameweekPoints,
    });
  }

  async comparePlayers(playerIds: number[]): Promise<MultiPlayerCompareDto> {
    const uniquePlayerIds = Array.from(
      new Set(
        playerIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );

    if (!uniquePlayerIds.length) {
      return { players: [] };
    }

    const players = await this.getPlayersFromIds(uniquePlayerIds);
    const playerById = new Map(players.map((player) => [player.id, player]));

    const orderedPlayers = uniquePlayerIds
      .map((id) => playerById.get(id))
      .filter((player): player is Player => Boolean(player));

    const ownership = await this.getOwnershipCounts(
      orderedPlayers.map((player) => player.id),
    );

    return toMultiPlayerCompareDto(
      orderedPlayers.map((player) => {
        const selectedTeams =
          ownership.selectedTeamsByPlayerId.get(player.id) ?? 0;

        return {
          player,
          insights: { selectedTeams },
          computedMetrics: {
            ownership: { selectedTeams, totalTeams: ownership.totalTeams },
          },
        };
      }),
    );
  }

  async getPlayersFromIds(playersIds: number[]) {
    return await this.db
      .getRepository(Player)
      .createQueryBuilder('player')
      .whereInIds(playersIds)
      .getMany();
  }

  /**
   * Season stat leaders plus the player most selected across current fantasy squads.
   */
  async getPlayerStatLeaders(): Promise<PlayerStatLeadersResponseDto> {
    const playersRepo = this.db.getRepository(Player);

    const findTopBy = (column: 'points' | 'goals' | 'assists') =>
      playersRepo
        .find({
          order: { [column]: 'DESC', id: 'ASC' },
          take: 1,
        })
        .then((rows) => rows[0] ?? null);

    const [mostPoints, mostGoals, mostAssists, mostSelectedRow, totalTeamsRow] =
      await Promise.all([
        findTopBy('points'),
        findTopBy('goals'),
        findTopBy('assists'),
        this.db.query<
          { playerId: number; selectedTeams: string }[]
        >(
          `
          SELECT sp."playerId" AS "playerId",
                 COUNT(DISTINCT s."id")::int AS "selectedTeams"
          FROM fantasy_squad_player sp
          INNER JOIN fantasy_squad s ON s.id = sp."squadId"
          WHERE s."isCurrent" = true
          GROUP BY sp."playerId"
          ORDER BY "selectedTeams" DESC, sp."playerId" ASC
          LIMIT 1
          `,
        ),
        this.db.query<{ totalTeams: string }[]>(
          `SELECT COUNT(*)::int AS "totalTeams" FROM fantasy_squad WHERE "isCurrent" = true`,
        ),
      ]);

    const totalTeams = Number(totalTeamsRow[0]?.totalTeams) || 0;
    const mostSelectedPlayerId = mostSelectedRow[0]?.playerId
      ? Number(mostSelectedRow[0].playerId)
      : null;
    const mostSelectedCount = mostSelectedRow[0]?.selectedTeams
      ? Number(mostSelectedRow[0].selectedTeams) || 0
      : 0;

    const mostSelectedPlayer =
      mostSelectedPlayerId != null
        ? await playersRepo.findOne({ where: { id: mostSelectedPlayerId } })
        : null;

    return {
      mostPoints: mostPoints
        ? toPlayerStatLeaderDto({
            player: mostPoints,
            metricValue: mostPoints.points ?? 0,
          })
        : null,
      mostGoals: mostGoals
        ? toPlayerStatLeaderDto({
            player: mostGoals,
            metricValue: mostGoals.goals ?? 0,
          })
        : null,
      mostAssists: mostAssists
        ? toPlayerStatLeaderDto({
            player: mostAssists,
            metricValue: mostAssists.assists ?? 0,
          })
        : null,
      mostSelected: mostSelectedPlayer
        ? toPlayerStatLeaderDto({
            player: mostSelectedPlayer,
            metricValue: mostSelectedCount,
            insights: { selectedTeams: mostSelectedCount },
            computedMetrics: {
              ownership: {
                selectedTeams: mostSelectedCount,
                totalTeams,
              },
            },
          })
        : null,
    };
  }

  private async getTeamStatsFromPlayersDb(): Promise<TeamStatDto[]> {
    const rows = await this.db
      .getRepository(Player)
      .createQueryBuilder('p')
      .select('p.countryId', 'countryId')
      .addSelect('SUM(p.goals)', 'goals')
      .where('p.countryId > 0')
      .groupBy('p.countryId')
      .getRawMany<{ countryId: string; goals: string }>();

    return rows
      .map((row) => ({
        countryId: Number(row.countryId),
        played: 0,
        wins: 0,
        goals: Number(row.goals) || 0,
        conceded: 0,
        goalDifference: 0,
        draws: 0,
        losses: 0,
      }))
      .sort((a, b) => b.goals - a.goals);
  }

  async getTeamStats(): Promise<TeamStatDto[]> {
    const now = Date.now();
    if (
      this.teamStatsCache &&
      now - this.teamStatsCache.fetchedAt <
        PlayersService.TEAM_STATS_CACHE_MS
    ) {
      return this.teamStatsCache.data;
    }

    const league = await this.settingsService.getMainServiceLeague();
    const seasonOverride = this.configService.get('teamStats.seasonOverride', {
      infer: true,
    });
    const seasonId = seasonOverride ?? league?.currentSeason?.serviceId;
    const leagueId = league?.serviceId;

    if (!seasonId) {
      return [];
    }

    let stats = await this.sportmonksStandingsService.getNationalTeamStats(
      seasonId,
      leagueId,
    );

    if (stats.length === 0) {
      stats = await this.getTeamStatsFromPlayersDb();
    }

    this.teamStatsCache = { data: stats, fetchedAt: now };
    return stats;
  }
}
