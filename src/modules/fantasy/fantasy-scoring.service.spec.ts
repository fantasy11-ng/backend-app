import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FantasyScoringService } from './fantasy-scoring.service';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { MATCH_STATS_PROVIDER } from './match-stats.provider';

describe('FantasyScoringService', () => {
  let service: FantasyScoringService;
  let squadRepo: Repository<FantasySquad>;
  let pointsRepo: Repository<FantasyPoints>;
  let rankingRepo: Repository<FantasyTeamRanking>;
  let statsProvider: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FantasyScoringService,
        {
          provide: getRepositoryToken(FantasyTeam),
          useValue: {},
        },
        {
          provide: getRepositoryToken(FantasySquad),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasySquadPlayer),
          useValue: {},
        },
        {
          provide: getRepositoryToken(FantasyPoints),
          useValue: {
            create: jest.fn(),
            delete: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyTeamRanking),
          useValue: {
            create: jest.fn(),
            delete: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: MATCH_STATS_PROVIDER,
          useValue: {
            getStatsForFixture: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => ({
              scoring: {
                goal: 5,
                assist: 3,
                playedMatch: 1,
                cleanSheet: 4,
                threeSaves: 1,
                ratingHigh: { min: 8.5, max: 10, points: 3 },
                ratingMedium: { min: 7, max: 8.4, points: 3 },
                penaltyScoredCorrectTaker: 1,
                freeKickScoredCorrectTaker: 2,
                penaltyMiss: -3,
                yellowCard: -1,
                redCard: -3,
                ownGoal: -2,
                goalsConcededStep: { step: 2, points: -1 },
              },
            })),
          },
        },
      ],
    }).compile();

    service = module.get<FantasyScoringService>(FantasyScoringService);
    squadRepo = module.get<Repository<FantasySquad>>(
      getRepositoryToken(FantasySquad),
    );
    pointsRepo = module.get<Repository<FantasyPoints>>(
      getRepositoryToken(FantasyPoints),
    );
    rankingRepo = module.get<Repository<FantasyTeamRanking>>(
      getRepositoryToken(FantasyTeamRanking),
    );
    statsProvider = module.get(MATCH_STATS_PROVIDER);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Additional tests can be added here for:
  // - Scoring calculations for each rule
  // - Captain multiplier
  // - Role bonus points
  // - Ranking computation
});








