import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FantasyService } from './fantasy.service';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyTransfer } from './entities/fantasy-transfer.entity';
import { FantasyTeamEvent } from './entities/fantasy-team-event.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { PlayersService } from '@/modules/players/players.service';

describe('FantasyService', () => {
  let service: FantasyService;
  let teamRepo: Repository<FantasyTeam>;
  let squadRepo: Repository<FantasySquad>;
  let squadPlayerRepo: Repository<FantasySquadPlayer>;
  let transferRepo: Repository<FantasyTransfer>;
  let eventRepo: Repository<FantasyTeamEvent>;
  let rankingRepo: Repository<FantasyTeamRanking>;
  let playersService: PlayersService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FantasyService,
        {
          provide: getRepositoryToken(FantasyTeam),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasySquad),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasySquadPlayer),
          useValue: {
            create: jest.fn(),
            delete: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyTransfer),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyTeamEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyTeamRanking),
          useValue: {
            find: jest.fn(),
            create: jest.fn((x) => x),
          },
        },
        {
          provide: PlayersService,
          useValue: {
            getPlayersFromIds: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => ({
              initialBudget: 100000000,
              squadSize: 15,
              startingXiSize: 11,
              benchSize: 4,
              formations: [
                {
                  code: '4-4-2',
                  positions: { GK: 1, DEF: 4, MID: 4, FWD: 2 },
                },
              ],
              scoring: {},
              transfersLocked: false,
            })),
          },
        },
      ],
    }).compile();

    service = module.get<FantasyService>(FantasyService);
    teamRepo = module.get<Repository<FantasyTeam>>(
      getRepositoryToken(FantasyTeam),
    );
    squadRepo = module.get<Repository<FantasySquad>>(
      getRepositoryToken(FantasySquad),
    );
    squadPlayerRepo = module.get<Repository<FantasySquadPlayer>>(
      getRepositoryToken(FantasySquadPlayer),
    );
    transferRepo = module.get<Repository<FantasyTransfer>>(
      getRepositoryToken(FantasyTransfer),
    );
    eventRepo = module.get<Repository<FantasyTeamEvent>>(
      getRepositoryToken(FantasyTeamEvent),
    );
    rankingRepo = module.get<Repository<FantasyTeamRanking>>(
      getRepositoryToken(FantasyTeamRanking),
    );
    playersService = module.get<PlayersService>(PlayersService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSeasonLeaderboard', () => {
    it('should return season leaderboard rows with aggregated stats (goals/assists/cards/etc)', async () => {
      const fakeUser = { id: 'u1' } as any;
      const myTeam = { id: 't-me', budgetRemaining: 123 } as any;
      jest.spyOn(service, 'getMyTeam').mockResolvedValue({ team: myTeam } as any);

      (teamRepo.count as any).mockResolvedValue(2);

      const listTeams = [{ id: 't1' }, { id: 't2' }] as any[];
      const listRaw = [
        {
          totalPoints: '10',
          goals: '3',
          assists: '2',
          saves: '1',
          yellowCards: '4',
          redCards: '0',
          ownGoals: '0',
          cleanSheets: '2',
          rank: '1',
        },
        {
          totalPoints: '5',
          goals: '0',
          assists: '1',
          saves: '0',
          yellowCards: '1',
          redCards: '1',
          ownGoals: '0',
          cleanSheets: '0',
          rank: '2',
        },
      ];

      const qbList: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawAndEntities: jest
          .fn()
          .mockResolvedValue({ entities: listTeams, raw: listRaw }),
      };

      const qbMe: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalPoints: '5',
          goals: '1',
          assists: '2',
          saves: '3',
          yellowCards: '4',
          redCards: '5',
          ownGoals: '6',
          cleanSheets: '7',
        }),
      };

      const qbBetter: any = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      };

      (teamRepo.createQueryBuilder as any)
        .mockReturnValueOnce(qbList)
        .mockReturnValueOnce(qbMe)
        .mockReturnValueOnce(qbBetter);

      const res = await service.getSeasonLeaderboard(fakeUser as any, 1, 50);

      expect(res.data).toHaveLength(2);
      expect(res.data[0]).toMatchObject({
        teamId: 't1',
        fixtureId: 0,
        totalPoints: 10,
        goals: 3,
        assists: 2,
        saves: 1,
        yellowCards: 4,
        redCards: 0,
        ownGoals: 0,
        cleanSheets: 2,
        rank: 1,
      });

      expect(res.me).toMatchObject({
        teamId: 't-me',
        rank: 2,
        totalPoints: 5,
        goals: 1,
        assists: 2,
        saves: 3,
        yellowCards: 4,
        redCards: 5,
        ownGoals: 6,
        cleanSheets: 7,
        budgetRemaining: 123,
      });
    });
  });

  // Additional tests can be added here for:
  // - Team creation validation
  // - Transfer validation
  // - Lineup updates
  // - Role assignments
});








