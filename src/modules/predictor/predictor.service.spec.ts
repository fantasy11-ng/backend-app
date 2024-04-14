import { Test, TestingModule } from '@nestjs/testing';
import { PredictorService } from './predictor.service';

describe('PredictorService', () => {
  let service: PredictorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PredictorService],
    }).compile();

    service = module.get<PredictorService>(PredictorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
