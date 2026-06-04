import { Test, TestingModule } from '@nestjs/testing';
import { PredictorController } from './predictor.controller';
import { PredictorService } from './predictor.service';
import { PredictorScoringService } from './services/scoring.service';

describe('PredictorController', () => {
  let controller: PredictorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PredictorController],
      providers: [
        { provide: PredictorService, useValue: {} },
        { provide: PredictorScoringService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PredictorController>(PredictorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
