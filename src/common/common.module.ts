import { Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { SportmonksModule } from './sportmonks/sportmonks.module';
import { FootballModule } from './football/football.module';

@Module({
  providers: [EmailService],
  exports: [EmailService],
  imports: [SportmonksModule, FootballModule],
})
export class CommonModule {}
