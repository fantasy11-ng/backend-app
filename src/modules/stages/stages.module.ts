import { Module } from '@nestjs/common';
import { StagesService } from './stages.service';
import { StagesController } from './stages.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Stage } from './entities/stage.entity';
import { Group } from './entities/group.entity';
import { Fixture } from './entities/fixture.entity';
import { SportmonksModule } from '@/common/sportmonks/sportmonks.module';
import { SettingsModule } from '../settings/settings.module';
import { FantasyGameweek } from '@/modules/fantasy/entities/fantasy-gameweek.entity';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stage, Group, Fixture, FantasyGameweek]),
    ConfigModule,
    SportmonksModule,
    SettingsModule,
  ],
  controllers: [StagesController],
  providers: [StagesService],
  exports: [StagesService],
})
export class StagesModule {}
