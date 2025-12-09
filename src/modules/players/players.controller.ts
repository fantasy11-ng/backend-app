import { Controller, Get } from '@nestjs/common';
import { PlayersService } from './players.service';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlayerPaginatedResponseDto } from './dto/player-paginated-response.dto';

@ApiTags('Players')
@Controller('players')
export class PlayersController {
  constructor(private playersService: PlayersService) {}

  @Get()
  @ApiOperation({
    summary: 'List players for the current season',
    description:
      'Returns a paginated list of players synced from Sportmonks, filterable by position, country and pool, and sortable by rating or price.',
  })
  @ApiOkResponse({
    description: 'Paginated list of players',
    type: PlayerPaginatedResponseDto,
  })
  async getPlayers(@Paginate() query: PaginateQuery) {
    return await this.playersService.getPlayers(query);
  }

  @Get('sync')
  @ApiOperation({
    summary: 'Sync players from Sportmonks',
    description:
      'Imports or updates all players for the main season from Sportmonks, deriving rating, pool and fantasy price.',
  })
  @ApiOkResponse({
    description: 'Players sync result',
    schema: { example: 'Players have been synchronised successfully' },
  })
  async syncPlayers() {
    return await this.playersService.syncPlayers();
  }
}
