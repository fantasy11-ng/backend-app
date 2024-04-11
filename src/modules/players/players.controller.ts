import { Controller, Get } from '@nestjs/common';
import { PlayersService } from './players.service';
import { Paginate, PaginateQuery } from 'nestjs-paginate';

@Controller('players')
export class PlayersController {
  constructor(private playersService: PlayersService) {}

  @Get()
  async getPlayers(@Paginate() query: PaginateQuery) {
    return await this.playersService.getPlayers(query);
  }

  @Get('sync')
  async syncPlayers() {
    return await this.playersService.syncPlayers();
  }
}
