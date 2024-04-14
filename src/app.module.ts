import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import configurations from './common/config/env-configuration';
import authConfiguration from './common/config/auth-configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './modules/users/entities/user.entity';
import { mainConfig } from './common/config/main.config';
import { CommonModule } from './common/common.module';
import { TeamModule } from './modules/team/team.module';
import { PlayersModule } from './modules/players/players.module';
import { ContentModule } from './modules/content/content.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PreditorModule } from './modules/predictor/preditor.module';
import { StagesModule } from './modules/stages/stages.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [mainConfig, configurations, authConfiguration],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: true,
      entities: [User],
      autoLoadEntities: true,
    }),
    UsersModule,
    AuthModule,
    CommonModule,
    TeamModule,
    PlayersModule,
    ContentModule,
    SettingsModule,
    PreditorModule,
    StagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
