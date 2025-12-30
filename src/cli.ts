import { CommandFactory } from 'nest-commander';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModule } from './app.module';
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

@Module({
  imports: [
    AppModule,
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
    ]),
  ],
  providers: [
    SeedAfconBlogCommand,
    DedupePlayersCommand,
    RepairSquadStartingCommand,
  ],
})
export class CliModule {}

async function bootstrap() {
  await CommandFactory.runWithoutClosing(CliModule, {
    logger: ['log', 'error', 'warn'],
  });
}

bootstrap();
