import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { PlayersService } from './players.service';
import { SportmonksModule } from '@/common/sportmonks/sportmonks.module';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { Player } from './entities/player.entity';
import { PlayerFixtureStats } from './entities/player-fixture-stats.entity';
import { FootballModule } from '@/common/football/football.module';
import { PlayersController } from './players.controller';
import { SettingsModule } from '../settings/settings.module';
import { DataSource } from 'typeorm';

@Injectable()
class PlayersSchemaInitService implements OnModuleInit {
  private readonly logger = new Logger(PlayersSchemaInitService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit() {
    if (this.dataSource.options.type !== 'postgres') return;

    try {
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
      WHERE table_schema = 'public' AND table_name = 'player' AND column_name = 'minutesPlayed'
    ) THEN
      ALTER TABLE "player" ADD COLUMN "minutesPlayed" integer;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player' AND column_name = 'appearances'
    ) THEN
      ALTER TABLE "player" ADD COLUMN "appearances" integer;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player' AND column_name = 'lineups'
    ) THEN
      ALTER TABLE "player" ADD COLUMN "lineups" integer;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player' AND column_name = 'starts'
    ) THEN
      ALTER TABLE "player" ADD COLUMN "starts" integer;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player' AND column_name = 'bench'
    ) THEN
      ALTER TABLE "player" ADD COLUMN "bench" integer;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player' AND column_name = 'shotsOnTarget'
    ) THEN
      ALTER TABLE "player" ADD COLUMN "shotsOnTarget" integer;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'player' AND column_name = 'keyPasses'
    ) THEN
      ALTER TABLE "player" ADD COLUMN "keyPasses" integer;
    END IF;
  END IF;
END $$;
      `);
    } catch (e) {
      this.logger.warn(
        `Players schema guard skipped/failed: ${(e as Error)?.message ?? e}`,
      );
    }
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Player, PlayerFixtureStats]),
    SportmonksModule,
    FootballModule,
    SettingsModule,
  ],
  controllers: [PlayersController],
  providers: [PlayersService, PlayersSchemaInitService],
  exports: [PlayersService],
})
export class PlayersModule {}
