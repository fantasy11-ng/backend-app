import { Module } from '@nestjs/common';
import { PredictorController } from './predictor.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prediction } from './entities/prediction.entity';
import { FixturePrediction } from './entities/fixture-prediction.entity';
import { ThirdPlaceQualifiersInput } from './entities/third-place-qualifiers-input.entity';
import { ThirdPlaceMatchPrediction } from './entities/third-place-match-prediction.entity';
import { SportmonksModule } from '@/common/sportmonks/sportmonks.module';
import { PredictorService } from './predictor.service';
import { SettingsModule } from '../settings/settings.module';
import { StagesModule } from '../stages/stages.module';
import { User } from '@/modules/users/entities/user.entity';
import { PredictorScoringService } from './services/scoring.service';
import { SeedingRulesService } from './services/seeding-rules.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Prediction,
      FixturePrediction,
      ThirdPlaceQualifiersInput,
      ThirdPlaceMatchPrediction,
      User,
    ]),
    SportmonksModule,
    SettingsModule,
    StagesModule,
  ],
  controllers: [PredictorController],
  providers: [PredictorService, PredictorScoringService, SeedingRulesService],
})
export class PredictorModule {}
