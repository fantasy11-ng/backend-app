import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
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

/**
 * Lightweight, idempotent schema guard for Fantasy tables.
 *
 * The project currently relies on TypeORM synchronize in non-prod and does not
 * ship migrations. If the app boots with synchronize=false against a DB that
 * is missing newer columns, TypeORM will generate queries that reference
 * non-existent columns (e.g. FantasySquad.gameweekId) and endpoints will crash.
 */
@Injectable()
class FantasySchemaInitService implements OnModuleInit {
  private readonly logger = new Logger(FantasySchemaInitService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit() {
    // Only run for Postgres; safe no-op for other drivers.
    if (this.dataSource.options.type !== 'postgres') return;

    // Best-effort: schema guard must never prevent app startup.
    try {
      // Column is referenced by the FantasySquad entity and used in multiple
      // code paths; without it, many queries will throw at runtime.
      await this.dataSource.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'fantasy_squad'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fantasy_squad'
      AND column_name = 'gameweekId'
  ) THEN
    ALTER TABLE "fantasy_squad" ADD COLUMN "gameweekId" integer;
  END IF;
END $$;
      `);

      // Index is optional but helps common lookups.
      await this.dataSource.query(`
CREATE INDEX IF NOT EXISTS "IDX_fantasy_squad_gameweekId"
  ON "fantasy_squad" ("gameweekId");
      `);

      /**
       * Boosts: allow multiple boosts per gameweek (one per type).
       *
       * Older deployments may still have a unique index on ("teamId", "gameweekId"),
       * which would incorrectly block applying multiple different boosts in the same
       * gameweek. We drop that legacy index (if present) and ensure the new unique
       * index exists on ("teamId", "gameweekId", "type").
       */
      await this.dataSource.query(`
DO $$
DECLARE idx RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'fantasy_boost'
  ) THEN
    -- Drop legacy unique indexes that match exactly ("teamId", "gameweekId")
    FOR idx IN
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'fantasy_boost'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%("teamId", "gameweekId")%'
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
    END LOOP;

    -- Ensure new uniqueness: one boost per type per team per gameweek
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fantasy_boost_team_gameweek_type" ON "fantasy_boost" ("teamId", "gameweekId", "type")';
  END IF;
END $$;
      `);
    } catch (e) {
      this.logger.warn(
        `Fantasy schema guard skipped/failed: ${(e as Error)?.message ?? e}`,
      );
    }
  }
}

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
    FantasySchemaInitService,
    SportmonksMatchStatsProvider,
    {
      provide: MATCH_STATS_PROVIDER,
      useClass: SportmonksMatchStatsProvider,
    },
  ],
  exports: [FantasyService, FantasyScoringService],
})
export class FantasyModule {}
