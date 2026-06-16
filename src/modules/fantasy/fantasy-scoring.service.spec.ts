import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { FantasyScoringService } from './fantasy-scoring.service';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { FantasyGameweek } from './entities/fantasy-gameweek.entity';
import { FantasyBoost } from './entities/fantasy-boost.entity';
import { Fixture } from '@/modules/stages/entities/fixture.entity';
import { SportmonksFixturesService } from '@/common/sportmonks/services/fixtures.service';
import { FantasyTimeService } from './fantasy-time.service';
import { PlayersService } from '@/modules/players/players.service';
import { MATCH_STATS_PROVIDER, PlayerMatchStats } from './match-stats.provider';
import { PositionCode } from './fantasy.types';

describe('FantasyScoringService', () => {
  let service: FantasyScoringService;

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
          provide: getRepositoryToken(Fixture),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyGameweek),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyBoost),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: MATCH_STATS_PROVIDER,
          useValue: {
            getStatsForFixture: jest.fn(),
            getMatchDayPlayerExternalIds: jest.fn(),
          },
        },
        {
          provide: SportmonksFixturesService,
          useValue: {
            getFixtureById: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: {
            getRepository: jest.fn(),
          },
        },
        {
          provide: FantasyTimeService,
          useValue: {
            getNow: jest.fn(() => new Date()),
          },
        },
        {
          provide: PlayersService,
          useValue: {
            refreshSeasonStatsForExternalIds: jest.fn(),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const baseStat = (
    overrides: Partial<PlayerMatchStats>,
  ): PlayerMatchStats => ({
    playerId: 1,
    fixtureId: 1,
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    goalsConceded: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    rating: undefined,
    cleanSheet: false,
    penaltyScored: false,
    penaltyMissed: false,
    freeKickScored: false,
    ...overrides,
  });

  const calcBase = (position: PositionCode, s: PlayerMatchStats): number =>
    (service as any).calculateBasePoints(position, s);
  const calcBonus = (s: PlayerMatchStats): number =>
    (service as any).calculateBonusPoints(s);

  describe('did-not-play (benched) players', () => {
    it('awards no base points to a benched defender on a clean-sheet team', () => {
      const stat = baseStat({
        minutesPlayed: 0,
        cleanSheet: true,
        goalsConceded: 0,
      });

      expect(calcBase('DEF', stat)).toBe(0);
    });

    it('awards no base points to a benched goalkeeper on a clean-sheet team', () => {
      const stat = baseStat({
        minutesPlayed: 0,
        cleanSheet: true,
        saves: 6,
      });

      expect(calcBase('GK', stat)).toBe(0);
    });

    it('awards no rating bonus to a player who did not play', () => {
      const stat = baseStat({ minutesPlayed: 0, rating: 9 });

      expect(calcBonus(stat)).toBe(0);
    });

    it('still rewards a defender who played and kept a clean sheet', () => {
      const stat = baseStat({
        minutesPlayed: 90,
        cleanSheet: true,
        goalsConceded: 0,
      });

      // playedMatch (1) + cleanSheet (4)
      expect(calcBase('DEF', stat)).toBe(5);
    });

    it('still rewards a high rating for a player who played', () => {
      const stat = baseStat({ minutesPlayed: 45, rating: 9 });

      expect(calcBonus(stat)).toBe(3);
    });
  });
});
