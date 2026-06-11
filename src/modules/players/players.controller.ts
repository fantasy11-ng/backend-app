import { Controller, Get, Param, Query } from '@nestjs/common';
import { PlayersService } from './players.service';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlayerPaginatedResponseDto } from './dto/player-paginated-response.dto';
import {
  MultiPlayerCompareDto,
  PlayerDetailDto,
  PlayerStatLeadersResponseDto,
} from './dto/player-insights.dto';
import { TeamStatDto } from './dto/team-stats.dto';

@ApiTags('Players')
@Controller('players')
export class PlayersController {
  constructor(private playersService: PlayersService) {}

  @Get()
  @ApiOperation({
    summary: 'List players for the current season',
    description:
      'Returns a paginated list of players synced from Sportmonks, filterable by position, country, pool and price range (e.g. filter.price=$gte:5000000, filter.price=$lte:8000000, or filter.price=$btw:5000000,8000000). Sortable by points, price, rating, goals, assists, cards, clean sheets, minutes, appearances, lineups, starts, bench, shots on target and key passes. Defaults to points DESC, price DESC. Null stat values sort last.',
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

  @Get('compare')
  @ApiOperation({
    summary: 'Compare multiple players',
    description:
      'Returns normalized compare payloads for the requested comma-separated player ids.',
  })
  @ApiOkResponse({
    description: 'Multi-player compare payload',
    type: MultiPlayerCompareDto,
  })
  async comparePlayers(@Query('playerIds') playerIds: string) {
    const parsedIds = (playerIds ?? '')
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isFinite(id));

    return await this.playersService.comparePlayers(parsedIds);
  }

  @Get('leaders')
  @ApiOperation({
    summary: 'Get season stat leaders',
    description:
      'Returns the players with the most season points, goals, assists, and the player most selected across current fantasy squads in a single response.',
  })
  @ApiOkResponse({
    description: 'Season stat leaders',
    type: PlayerStatLeadersResponseDto,
  })
  async getPlayerStatLeaders() {
    return await this.playersService.getPlayerStatLeaders();
  }

  @Get('team-stats')
  @ApiOperation({
    summary: 'Get national team tournament stats',
    description:
      'Returns aggregated team stats (played, wins, goals, conceded, goal difference, draws, losses) from Sportmonks season standings. Cached for one hour.',
  })
  @ApiOkResponse({
    description: 'National team stats',
    type: TeamStatDto,
    isArray: true,
  })
  async getTeamStats() {
    return await this.playersService.getTeamStats();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get player detail',
    description:
      'Returns a detail payload for a player including season stats, insight metrics and recent fixture snapshots.',
  })
  @ApiOkResponse({
    description: 'Player detail payload',
    type: PlayerDetailDto,
  })
  async getPlayerDetail(@Param('id') id: string) {
    return await this.playersService.getPlayerDetail(parseInt(id, 10));
  }
}
