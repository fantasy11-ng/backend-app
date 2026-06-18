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
import { CompetitionLeaderboardArchive } from './entities/competition-leaderboard-archive.entity';
import { FantasyLeagueService } from './fantasy-league.service';
import { FantasyLeagueController } from './fantasy-league.controller';
import { FantasyScoringDailyJob } from './fantasy-scoring.daily-job';
import { TournamentResetService } from './tournament-reset.service';
import { FantasyTimeService } from './fantasy-time.service';
import { Player } from '@/modules/players/entities/player.entity';
import { PlayerFixtureStats } from '@/modules/players/entities/player-fixture-stats.entity';
import { FixturePrediction } from '@/modules/predictor/entities/fixture-prediction.entity';
import { ThirdPlaceMatchPrediction } from '@/modules/predictor/entities/third-place-match-prediction.entity';
import { ThirdPlaceQualifiersInput } from '@/modules/predictor/entities/third-place-qualifiers-input.entity';
import { Prediction } from '@/modules/predictor/entities/prediction.entity';
import { Stage } from '@/modules/stages/entities/stage.entity';
import { Group } from '@/modules/stages/entities/group.entity';
import { SettingsModule } from '@/modules/settings/settings.module';

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
       * One unlocked draft per team/gameweek. Clean up empty duplicates left by
       * concurrent draft creation before applying the partial unique index.
       */
      await this.dataSource.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fantasy_squad'
  ) THEN
    DELETE FROM "fantasy_squad_player" sp
    USING "fantasy_squad" s
    WHERE sp."squadId" = s.id
      AND s."isLocked" = false
      AND s."gameweekId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "fantasy_squad_player" sp2 WHERE sp2."squadId" = s.id
      )
      AND EXISTS (
        SELECT 1 FROM "fantasy_squad" s2
        WHERE s2."teamId" = s."teamId"
          AND s2."gameweekId" = s."gameweekId"
          AND s2."isLocked" = false
          AND s2.id <> s.id
          AND EXISTS (
            SELECT 1 FROM "fantasy_squad_player" sp3 WHERE sp3."squadId" = s2.id
          )
      );

    DELETE FROM "fantasy_squad" s
    WHERE s."isLocked" = false
      AND s."gameweekId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "fantasy_squad_player" sp WHERE sp."squadId" = s.id
      )
      AND EXISTS (
        SELECT 1 FROM "fantasy_squad" s2
        WHERE s2."teamId" = s."teamId"
          AND s2."gameweekId" = s."gameweekId"
          AND s2."isLocked" = false
          AND EXISTS (
            SELECT 1 FROM "fantasy_squad_player" sp2 WHERE sp2."squadId" = s2.id
          )
      );

    CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fantasy_squad_team_gameweek_draft"
      ON "fantasy_squad" ("teamId", "gameweekId")
      WHERE "isLocked" = false AND "gameweekId" IS NOT NULL;
  END IF;
END $$;
      `);

      /**
       * Player fixture stats: persist per-fixture clean sheet flag so it can be
       * aggregated into the player's season clean-sheet total.
       */
      await this.dataSource.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'player_fixture_stats'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player_fixture_stats' AND column_name = 'cleanSheet'
    ) THEN
      ALTER TABLE "player_fixture_stats" ADD COLUMN "cleanSheet" boolean NOT NULL DEFAULT false;
    END IF;
  END IF;
END $$;
      `);

      /**
       * Player: persist season clean-sheet total aggregated from fixture stats.
       */
      await this.dataSource.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'player'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player' AND column_name = 'cleanSheets'
    ) THEN
      ALTER TABLE "player" ADD COLUMN "cleanSheets" integer NOT NULL DEFAULT 0;
    END IF;
  END IF;
END $$;
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

      /**
       * Team rankings: add aggregated stats columns (goals/cards/etc) if missing.
       * These are used for season/gameweek/fixture leaderboard display and for `team/me`.
       */
      await this.dataSource.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'fantasy_team_ranking'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fantasy_team_ranking' AND column_name = 'goals'
    ) THEN
      ALTER TABLE "fantasy_team_ranking" ADD COLUMN "goals" integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fantasy_team_ranking' AND column_name = 'assists'
    ) THEN
      ALTER TABLE "fantasy_team_ranking" ADD COLUMN "assists" integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fantasy_team_ranking' AND column_name = 'saves'
    ) THEN
      ALTER TABLE "fantasy_team_ranking" ADD COLUMN "saves" integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fantasy_team_ranking' AND column_name = 'yellowCards'
    ) THEN
      ALTER TABLE "fantasy_team_ranking" ADD COLUMN "yellowCards" integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fantasy_team_ranking' AND column_name = 'redCards'
    ) THEN
      ALTER TABLE "fantasy_team_ranking" ADD COLUMN "redCards" integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fantasy_team_ranking' AND column_name = 'ownGoals'
    ) THEN
      ALTER TABLE "fantasy_team_ranking" ADD COLUMN "ownGoals" integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fantasy_team_ranking' AND column_name = 'cleanSheets'
    ) THEN
      ALTER TABLE "fantasy_team_ranking" ADD COLUMN "cleanSheets" integer NOT NULL DEFAULT 0;
    END IF;
  END IF;
END $$;
      `);

      /**
       * Gameweeks: `code` must be unique per season (NOT globally).
       *
       * Older DBs may have a global unique constraint on fantasy_gameweek.code.
       * Drop it if present and replace with a composite unique index on
       * (externalSeasonId, code).
       */
      await this.dataSource.query(`
DO $$
DECLARE idx RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'fantasy_gameweek'
  ) THEN
    -- Drop any unique index on just ("code")
    FOR idx IN
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'fantasy_gameweek'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%("code")%'
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
    END LOOP;

    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fantasy_gameweek_season_code" ON "fantasy_gameweek" ("externalSeasonId", "code")';
  END IF;
END $$;
      `);

      /**
       * Competition leaderboard archive: stores top 10 per tournament for history.
       * `id` must have a DB-side default because TypeORM emits `VALUES (DEFAULT, ...)`
       * for @PrimaryGeneratedColumn('uuid') when synchronize is off.
       */
      await this.dataSource.query(
        `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
      );
      await this.dataSource.query(`
CREATE TABLE IF NOT EXISTS "competition_leaderboard_archive" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "competitionName" character varying NOT NULL,
  "externalSeasonId" integer NOT NULL,
  "archivedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "topEntries" jsonb NOT NULL,
  CONSTRAINT "PK_competition_leaderboard_archive" PRIMARY KEY ("id")
);
      `);
      // Backfill default for tables created before this fix
      await this.dataSource.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'competition_leaderboard_archive'
      AND column_name = 'id'
      AND column_default IS NULL
  ) THEN
    ALTER TABLE "competition_leaderboard_archive"
      ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
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
      CompetitionLeaderboardArchive,
      Player,
      PlayerFixtureStats,
      FixturePrediction,
      ThirdPlaceMatchPrediction,
      ThirdPlaceQualifiersInput,
      Prediction,
      Stage,
      Group,
    ]),
    PlayersModule,
    TeamModule,
    SportmonksModule,
    SettingsModule,
  ],
  controllers: [FantasyController, FantasyLeagueController],
  providers: [
    FantasyTimeService,
    FantasyService,
    FantasyScoringService,
    FantasyScoringDailyJob,
    FantasyLeagueService,
    TournamentResetService,
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
