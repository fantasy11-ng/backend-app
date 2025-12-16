import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SportmonksPlayersService } from 'src/common/sportmonks/services/players.service';
import { DataSource } from 'typeorm';
import { Player } from './entities/player.entity';
import { CreatePlayerDto } from './dto/create-player.dto';
import { FootballService } from 'src/common/football/services/football.service';
import { SettingsService } from '../settings/settings.service';
import { SportmonksTeam } from 'src/common/sportmonks/types/teams.type';
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

  async syncPlayers() {
    const league = await this.settingsService.getMainServiceLeague();

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
        for (const playerData of team.players) {
          if (!playerData.position_id) {
            console.error('Invalid player: no player position');
            continue;
          }
          // SportMonks team squad items have their own id (row id) and a `player_id` which
          // is the stable SportMonks player id. We must persist the player id.
          const sportmonksPlayerId =
            (playerData as any).player_id ?? playerData.player?.id;
          if (!sportmonksPlayerId) {
            console.error('Invalid player: no sportmonks player_id');
            continue;
          }
          if (
            !playerData.player.country_id &&
            !playerData.player.nationality_id
          ) {
            console.log(playerData.player);
            continue;
          }
          await this.createOrUpdatePlayer({
            externalId: sportmonksPlayerId,
            image: playerData.player.image_path,
            name: playerData.player.name,
            commonName: playerData.player.common_name,
            rating: this.footballService.getRating(playerData.player.name),
            pool: this.footballService.getPlayerPool(playerData.player.name),
            positionId: playerData.position_id,
            position: playerData.position
              ? {
                  id: playerData.player.position.id,
                  name: playerData.player.position.name,
                  developer_name: playerData.player.position.developer_name,
                  code: playerData.player.position.code,
                }
              : this.footballService.positionIdToPosition(
                  playerData.position_id,
                ),
            countryId:
              playerData.player.country_id ?? playerData.player.nationality_id,
          });
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
