import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SportmonksPlayersService } from 'src/common/sportmonks/services/players.service';
import { DataSource } from 'typeorm';
import { Player } from './entities/player.entity';
import { CreatePlayerDto } from './dto/create-player.dto';
import { FootballService } from 'src/common/football/services/football.service';
import { SettingsService } from '../settings/settings.service';
import { SportmonksTeam } from 'src/common/sportmonks/types/teams.type';
import { SportmonksPlayer } from '@/common/sportmonks/types/players.types';
import {
  FilterOperator,
  PaginateConfig,
  PaginateQuery,
  Paginated,
  paginate,
} from 'nestjs-paginate';
import { DEFAULT_PLAYER_RATING } from '@/common/football/constants/players.constants';

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
  ],
  searchableColumns: ['name', 'commonName'],
  filterableColumns: {
    positionId: [FilterOperator.EQ],
    countryId: [FilterOperator.EQ],
    pool: [FilterOperator.EQ],
  },
};

@Injectable()
export class PlayersService {
  constructor(
    private sportmonksPlayersService: SportmonksPlayersService,
    private settingsService: SettingsService,
    private footballService: FootballService,
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
        where: { name: data.name },
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
  }) {
    const {
      sportmonksPlayerId,
      player,
      positionId,
      position,
      fallbackCountryId,
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

    const countryId =
      (player.nationality_id as any) ??
      (player.country_id as any) ??
      (fallbackCountryId as any) ??
      0;

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

            await this.upsertFromSportmonksPlayer({
              sportmonksPlayerId,
              player: smPlayer,
              positionId,
              position: {
                id: pos.id,
                name: pos.name,
                developer_name: pos.developer_name,
                code: pos.code,
              },
              fallbackCountryId: countryId,
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
    return paginate(query, qb, PLAYER_PAGINATION_CONFIG);
  }

  async getPlayersFromIds(playersIds: number[]) {
    return await this.db
      .getRepository(Player)
      .createQueryBuilder('player')
      .whereInIds(playersIds)
      .getMany();
  }
}
