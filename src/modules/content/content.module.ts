import { Module } from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { SportmonksModule } from 'src/common/sportmonks/sportmonks.module';

@Module({
  imports: [SportmonksModule],
  providers: [ContentService],
  controllers: [ContentController],
})
export class ContentModule {}
