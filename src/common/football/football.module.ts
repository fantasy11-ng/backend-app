import { Module } from '@nestjs/common';
import { FootballService } from './services/football.service';

@Module({
  providers: [FootballService],
  exports: [FootballService],
})
export class FootballModule {}
