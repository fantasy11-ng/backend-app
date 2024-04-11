import { Body, Controller, Get, Post } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SchemaValidator } from 'src/validators/schema.validator';
import {
  SetMainServiceLeagueDto,
  setMainServiceLeagueDtoSchema,
} from './dto/set-main-service-league.dto';

@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Post('leagues/main')
  async setMainServiceLeague(
    @Body(new SchemaValidator(setMainServiceLeagueDtoSchema))
    dto: SetMainServiceLeagueDto,
  ) {
    return this.settingsService.setMainServiceLeague(dto);
  }

  @Get('leagues/main')
  async getMainServiceLeague() {
    return this.settingsService.getMainServiceLeague();
  }
}
