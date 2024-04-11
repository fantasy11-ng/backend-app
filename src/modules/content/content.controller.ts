import { Controller, Get } from '@nestjs/common';
import { SportmonksLeaguesService } from 'src/common/sportmonks/services/leagues.service';

@Controller('content')
export class ContentController {
  constructor(private sportmonksLeagueService: SportmonksLeaguesService) {}

  @Get('leagues')
  async getServiceLeagues() {
    return this.sportmonksLeagueService.getLeagues({ live: false });
  }
}
