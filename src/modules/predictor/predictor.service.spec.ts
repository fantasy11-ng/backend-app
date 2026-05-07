import { Test, TestingModule } from '@nestjs/testing';
import { PredictorService } from './predictor.service';
import { StagesService } from '../stages/stages.service';
import { SettingsService } from '../settings/settings.service';
import { ConfigService } from '@nestjs/config';
import { SeedingRulesService } from './services/seeding-rules.service';
import { BracketEngineService } from './bracket/bracket-engine.service';
import { BracketSpecProviderService } from './bracket/bracket-spec-provider.service';
import { getDataSourceToken } from '@nestjs/typeorm';

describe('PredictorService', () => {
  let service: PredictorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictorService,
        { provide: StagesService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SeedingRulesService, useValue: {} },
        { provide: BracketEngineService, useValue: {} },
        { provide: BracketSpecProviderService, useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
      ],
    }).compile();

    service = module.get<PredictorService>(PredictorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
