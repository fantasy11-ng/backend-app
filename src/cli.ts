import { CommandFactory } from 'nest-commander';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedAfconBlogCommand } from './scripts/seed-afcon-blog';
import { User } from './modules/users/entities/user.entity';
import { PostEntity } from './modules/blog/entities/post.entity';
import { Category } from './modules/blog/entities/category.entity';
import { Tag } from './modules/blog/entities/tag.entity';
import { Player } from './modules/players/entities/player.entity';
import { FantasySquadPlayer } from './modules/fantasy/entities/fantasy-squad-player.entity';
import { FantasyTransfer } from './modules/fantasy/entities/fantasy-transfer.entity';
import { PlayerFixtureStats } from './modules/players/entities/player-fixture-stats.entity';
import { DedupePlayersCommand } from '@/scripts/dedupe-players';
import { RepairSquadStartingCommand } from '@/scripts/repair-squad-starting';
import { FantasySquad } from './modules/fantasy/entities/fantasy-squad.entity';
import { FantasyTeam } from './modules/fantasy/entities/fantasy-team.entity';
import { ExportPlayerReviewJsonCommand } from '@/scripts/export-player-review-json';
import { ExportPlayersCommand } from '@/scripts/export-players';
import { RestorePlayerPricesGameNamesCommand } from '@/scripts/restore-player-prices-gamenames';
import { SportmonksModule } from '@/common/sportmonks/sportmonks.module';
import { FantasyGameweek } from './modules/fantasy/entities/fantasy-gameweek.entity';
import { FantasyPoints } from './modules/fantasy/entities/fantasy-points.entity';
import { Prediction } from './modules/predictor/entities/prediction.entity';
import { FootballTeam } from './modules/team/entities/football-team.entity';
import { ConfigModule } from '@nestjs/config';
import configurations from './common/config/env-configuration';
import authConfiguration from './common/config/auth-configuration';
import { mainConfig } from './common/config/main.config';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
      load: [mainConfig, configurations, authConfiguration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => ({
        type: 'postgres' as const,
        url: process.env.DATABASE_URL,
        synchronize:
          process.env.TYPEORM_SYNCHRONIZE != null
            ? process.env.TYPEORM_SYNCHRONIZE === 'true'
            : process.env.NODE_ENV !== 'production',
        entities: [__dirname + '/**/*.entity.{ts,js}'],
        autoLoadEntities: true,
        logging: true,
        ssl: {
          rejectUnauthorized: false,
        },
      }),
    }),
    // Ensure repositories are available for the command
    TypeOrmModule.forFeature([
      User,
      PostEntity,
      Category,
      Tag,
      Player,
      PlayerFixtureStats,
      FantasyTeam,
      FantasySquad,
      FantasySquadPlayer,
      FantasyTransfer,
      FantasyGameweek,
      FantasyPoints,
      Prediction,
      FootballTeam,
    ]),
    SportmonksModule,
  ],
  providers: [
    SeedAfconBlogCommand,
    DedupePlayersCommand,
    RepairSquadStartingCommand,
    ExportPlayerReviewJsonCommand,
    ExportPlayersCommand,
    RestorePlayerPricesGameNamesCommand,
  ],
})
export class CliModule {}

async function bootstrap() {
  await CommandFactory.runWithoutClosing(CliModule, {
    logger: ['log', 'error', 'warn'],
  });
}

bootstrap();
