import { Module } from '@nestjs/common';
import { PlayersService } from './players.service';
import { SportmonksModule } from 'src/common/sportmonks/sportmonks.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from './entities/player.entity';
import { FootballModule } from 'src/common/football/football.module';
import { PlayersController } from './players.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Player]),
    SportmonksModule,
    FootballModule,
    SettingsModule,
  ],
  controllers: [PlayersController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
