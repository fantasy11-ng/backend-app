import { Test, TestingModule } from '@nestjs/testing';
import { PredictorController } from './predictor.controller';

describe('PredictorController', () => {
  let controller: PredictorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PredictorController],
    }).compile();

    controller = module.get<PredictorController>(PredictorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
