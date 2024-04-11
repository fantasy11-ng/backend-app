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

export const PLAYER_PAGINATION_CONFIG: PaginateConfig<Player> = {
  sortableColumns: ['id', 'name', 'pool'],
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

    const existingPlayer = playersRepo.findOne({ where: { name: data.name } });

    return await playersRepo.save({ ...existingPlayer, ...data });
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
          await this.createOrUpdatePlayer({
            externalId: playerData.id,
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
            countryId: playerData.player.country_id,
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
