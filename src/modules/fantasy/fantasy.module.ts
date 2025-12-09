import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyTransfer } from './entities/fantasy-transfer.entity';
import { FantasyTeamEvent } from './entities/fantasy-team-event.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { FantasyGameweek } from './entities/fantasy-gameweek.entity';
import { FantasyBoost } from './entities/fantasy-boost.entity';
import { Fixture } from '@/modules/stages/entities/fixture.entity';
import { FantasyService } from './fantasy.service';
import { FantasyScoringService } from './fantasy-scoring.service';
import { FantasyController } from './fantasy.controller';
import { PlayersModule } from '@/modules/players/players.module';
import { TeamModule } from '@/modules/team/team.module';
import { SportmonksModule } from '@/common/sportmonks/sportmonks.module';
import { MATCH_STATS_PROVIDER } from './match-stats.provider';
import { SportmonksMatchStatsProvider } from './services/sportmonks-match-stats.provider';
import { FootballTeam } from '../team/entities/football-team.entity';
import { FantasyLeague } from './entities/fantasy-league.entity';
import { FantasyLeagueMembership } from './entities/fantasy-league-membership.entity';
import { FantasyLeagueService } from './fantasy-league.service';
import { FantasyLeagueController } from './fantasy-league.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      FantasyTeam,
      FantasySquad,
      FantasySquadPlayer,
      FantasyTransfer,
      FantasyTeamEvent,
      FantasyPoints,
      FantasyTeamRanking,
      FantasyGameweek,
      Fixture,
      FantasyBoost,
      FootballTeam,
      FantasyLeague,
      FantasyLeagueMembership,
    ]),
    PlayersModule,
    TeamModule,
    SportmonksModule,
  ],
  controllers: [FantasyController, FantasyLeagueController],
  providers: [
    FantasyService,
    FantasyScoringService,
    FantasyLeagueService,
    SportmonksMatchStatsProvider,
    {
      provide: MATCH_STATS_PROVIDER,
      useClass: SportmonksMatchStatsProvider,
    },
  ],
  exports: [FantasyService, FantasyScoringService],
})
export class FantasyModule {}
