import { Module } from '@nestjs/common';
import { PredictorController } from './predictor.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prediction } from './entities/prediction.entity';
import { SportmonksModule } from '@/common/sportmonks/sportmonks.module';
import { PredictorService } from './predictor.service';
import { SettingsModule } from '../settings/settings.module';
import { StagesModule } from '../stages/stages.module';
import { User } from '@/modules/users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Prediction, User]),
    SportmonksModule,
    SettingsModule,
    StagesModule,
  ],
  controllers: [PredictorController],
  providers: [PredictorService],
})
export class PreditorModule {}
