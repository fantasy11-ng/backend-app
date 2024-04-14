import { Module } from '@nestjs/common';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team } from './entities/team.entity';
import { PlayersModule } from '../players/players.module';
import { FootballTeam } from './entities/football-team.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Team, FootballTeam]), PlayersModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
