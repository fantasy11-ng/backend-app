import { Test, TestingModule } from '@nestjs/testing';
import { SportmonksService } from './sportmonks.service';

describe('SportmonksService', () => {
  let service: SportmonksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SportmonksService],
    }).compile();

    service = module.get<SportmonksService>(SportmonksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
