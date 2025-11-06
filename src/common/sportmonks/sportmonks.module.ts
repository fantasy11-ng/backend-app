import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SportmonksService } from './sportmonks.service';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '../config/main.config';
import { SportmonksCoreService } from './services/core.service';
import { SportmonksLeaguesService } from './services/leagues.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceLeague } from './entities/service-league.entity';
import { ServiceSeason } from './entities/service-season.entity';
import { SportmonksPlayersService } from './services/players.service';
import { SportmonksStagesService } from './services/stages.service';
import { SportmonksStandingsService } from './services/standings.service';
import { SportmonksSeasonsService } from './services/seasons.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceLeague, ServiceSeason]),
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<MainConfig>) => {
        const sportmonksConfig = configService.get(
          'externalServices.sportmonks',
          { infer: true },
        );
        return {
          baseURL: sportmonksConfig.baseUrl,
          params: {
            api_token: sportmonksConfig.apiToken,
          },
        };
      },
    }),
  ],
  providers: [
    SportmonksService,
    SportmonksCoreService,
    SportmonksLeaguesService,
    SportmonksPlayersService,
    SportmonksStagesService,
    SportmonksStandingsService,
    SportmonksSeasonsService,
  ],
  exports: [
    SportmonksService,
    SportmonksCoreService,
    SportmonksLeaguesService,
    SportmonksPlayersService,
    SportmonksStagesService,
    SportmonksStandingsService,
    SportmonksSeasonsService,
  ],
})
export class SportmonksModule {}
