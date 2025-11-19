import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SchemaValidator } from 'src/validators/schema.validator';
import {
  SetMainServiceLeagueDto,
  setMainServiceLeagueDtoSchema,
} from './dto/set-main-service-league.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/guards/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';

@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Post('leagues/main')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
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
