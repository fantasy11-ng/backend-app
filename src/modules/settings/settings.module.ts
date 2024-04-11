import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceLeague } from 'src/common/sportmonks/entities/service-league.entity';
import { ServiceSeason } from 'src/common/sportmonks/entities/service-season.entity';
import { SportmonksModule } from 'src/common/sportmonks/sportmonks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceLeague, ServiceSeason]),
    SportmonksModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
