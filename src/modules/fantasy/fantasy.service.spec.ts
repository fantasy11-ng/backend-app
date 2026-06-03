import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FantasyService } from './fantasy.service';
import { FantasyTimeService } from './fantasy-time.service';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyTransfer } from './entities/fantasy-transfer.entity';
import { FantasyTeamEvent } from './entities/fantasy-team-event.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { FantasyGameweek } from './entities/fantasy-gameweek.entity';
import { FantasyBoost } from './entities/fantasy-boost.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { PlayersService } from '@/modules/players/players.service';
import { SportmonksFixturesService } from '@/common/sportmonks/services/fixtures.service';
import { Fixture } from '@/modules/stages/entities/fixture.entity';
import { FootballTeam } from '@/modules/team/entities/football-team.entity';
import { Player } from '@/modules/players/entities/player.entity';
import { PlayerFixtureStats } from '@/modules/players/entities/player-fixture-stats.entity';

describe('FantasyService', () => {
  let service: FantasyService;
  let teamRepo: Repository<FantasyTeam>;
  let squadRepo: Repository<FantasySquad>;
  let squadPlayerRepo: Repository<FantasySquadPlayer>;
  let transferRepo: Repository<FantasyTransfer>;
  let eventRepo: Repository<FantasyTeamEvent>;
  let rankingRepo: Repository<FantasyTeamRanking>;
  let gameweekRepo: Repository<FantasyGameweek>;
  let boostRepo: Repository<FantasyBoost>;
  let pointsRepo: Repository<FantasyPoints>;
  let fixtureRepo: Repository<Fixture>;
  let footballTeamRepo: Repository<FootballTeam>;
  let playerRepo: Repository<Player>;
  let playerFixtureStatsRepo: Repository<PlayerFixtureStats>;
  let playersService: PlayersService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FantasyService,
        {
          provide: SportmonksFixturesService,
          useValue: {},
        },
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
            find: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasySquadPlayer),
          useValue: {
            create: jest.fn(),
            delete: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyTransfer),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
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
            findOne: jest.fn(),
            create: jest.fn((x) => x),
          },
        },
        {
          provide: getRepositoryToken(FantasyGameweek),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findBy: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyBoost),
          useValue: {
            find: jest.fn(),
            count: jest.fn(),
            create: jest.fn((x) => x),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FantasyPoints),
          useValue: {
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Fixture),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findBy: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FootballTeam),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Player),
          useValue: {
            findBy: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlayerFixtureStats),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: PlayersService,
          useValue: {
            getPlayersFromIds: jest.fn(),
          },
        },
        {
          provide: FantasyTimeService,
          useValue: {
            getNow: () => new Date('2026-01-01T00:00:00.000Z'),
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
              maxPlayersPerTeam: 3,
              snapshotLeadMinutes: 120,
              nowOverrideIso: '2026-01-01T00:00:00.000Z',
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
    gameweekRepo = module.get<Repository<FantasyGameweek>>(
      getRepositoryToken(FantasyGameweek),
    );
    boostRepo = module.get<Repository<FantasyBoost>>(getRepositoryToken(FantasyBoost));
    pointsRepo = module.get<Repository<FantasyPoints>>(
      getRepositoryToken(FantasyPoints),
    );
    fixtureRepo = module.get<Repository<Fixture>>(getRepositoryToken(Fixture));
    footballTeamRepo = module.get<Repository<FootballTeam>>(
      getRepositoryToken(FootballTeam),
    );
    playerRepo = module.get<Repository<Player>>(getRepositoryToken(Player));
    playerFixtureStatsRepo = module.get<Repository<PlayerFixtureStats>>(
      getRepositoryToken(PlayerFixtureStats),
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

  describe('getGlobalInsights', () => {
    const makeQb = <T>(result: T) => {
      const qb: any = {
        select: jest.fn(() => qb),
        addSelect: jest.fn(() => qb),
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        groupBy: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        addOrderBy: jest.fn(() => qb),
        limit: jest.fn(() => qb),
        innerJoin: jest.fn(() => qb),
        getRawMany: jest.fn(async () => result),
      };
      return qb;
    };

    it('computes most selected/captained, transfers, and top performer for the latest locked gameweek', async () => {
      const gw4 = {
        id: 4,
        code: '4',
        snapshotDeadlineAt: new Date('2025-12-31T12:00:00.000Z'),
      } as any;
      const gw3 = {
        id: 3,
        code: '3',
        snapshotDeadlineAt: new Date('2025-12-24T12:00:00.000Z'),
      } as any;

      (gameweekRepo.find as any)
        .mockResolvedValueOnce([gw4]) // latest locked
        .mockResolvedValueOnce([gw3]); // previous

      (squadRepo.find as any).mockResolvedValueOnce([
        { id: 's1' },
        { id: 's2' },
      ]);

      (squadPlayerRepo.find as any).mockResolvedValueOnce([
        { squadId: 's1', playerId: 1, isCaptain: true },
        { squadId: 's1', playerId: 2, isCaptain: false },
        { squadId: 's2', playerId: 1, isCaptain: false },
        { squadId: 's2', playerId: 3, isCaptain: true },
      ]);

      const transferQb = makeQb([
        { playerId: '2', value: '5' },
        { playerId: '1', value: '3' },
      ]);
      (transferRepo.createQueryBuilder as any).mockReturnValue(transferQb);

      const performerQb = makeQb([
        { playerId: '3', value: '18' },
        { playerId: '1', value: '12' },
      ]);
      (playerFixtureStatsRepo.createQueryBuilder as any).mockReturnValue(
        performerQb,
      );

      (playerRepo.findBy as any).mockResolvedValue([
        {
          id: 1,
          name: 'Mbappé',
          commonName: 'Mbappé',
          image: 'p1.png',
          pool: 'A',
          position: { code: 'FWD' },
          points: 100,
        },
        {
          id: 2,
          name: 'Kane',
          commonName: 'Kane',
          image: 'p2.png',
          pool: 'A',
          position: { code: 'FWD' },
          points: 90,
        },
        {
          id: 3,
          name: 'De Bruyne',
          commonName: 'De Bruyne',
          image: 'p3.png',
          pool: 'A',
          position: { code: 'MID' },
          points: 110,
        },
      ]);

      const res = await service.getGlobalInsights();

      expect(res.mostSelected.gameweekId).toBe(4);
      expect(res.mostSelected.items[0].player.id).toBe(1);
      expect(res.mostSelected.items[0].metricValue).toBe(100); // 2/2 squads

      expect(res.mostCaptained.items[0].metricValue).toBe(50); // 1/2 squads
      expect(res.mostTransferred.items[0].player.id).toBe(2);
      expect(res.mostTransferred.items[0].metricValue).toBe(5);

      expect(res.bestPerforming.gameweekId).toBe(4);
      expect(res.bestPerforming.items[0].player.id).toBe(3);
      expect(res.bestPerforming.items[0].metricValue).toBe(18);
    });
  });

  describe('getUpcomingFixtures', () => {
    it('should return upcoming fixtures only from the current (last locked) gameweek when it still has future fixtures', async () => {
      const nextOpenGw = {
        id: 2,
        externalSeasonId: 100,
        snapshotDeadlineAt: new Date('2026-01-02T00:00:00.000Z'),
      } as any;
      const lastLockedGw = {
        id: 1,
        externalSeasonId: 100,
        snapshotDeadlineAt: new Date('2025-12-31T20:00:00.000Z'),
      } as any;

      (gameweekRepo.findOne as any)
        .mockResolvedValueOnce(nextOpenGw) // next open
        .mockResolvedValueOnce(lastLockedGw); // last locked

      (fixtureRepo.findOne as any).mockResolvedValueOnce({ id: 999 }); // has upcoming in last locked

      const fixtures = [
        {
          id: 10,
          startingAt: new Date('2026-01-01T10:00:00.000Z'),
          stageId: 1,
          gameweekId: 1,
          participantTeamIds: [1, 2],
        },
      ] as any[];
      (fixtureRepo.find as any).mockResolvedValueOnce(fixtures);

      (footballTeamRepo.find as any).mockResolvedValueOnce([
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ]);

      const res = await service.getUpcomingFixtures(10);

      expect(fixtureRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ gameweekId: 1 }),
        }),
      );
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ id: 10, gameweekId: 1 });
    });

    it('should fall back to the next gameweek when the last locked gameweek has no remaining future fixtures', async () => {
      const nextOpenGw = {
        id: 2,
        externalSeasonId: 100,
        snapshotDeadlineAt: new Date('2026-01-02T00:00:00.000Z'),
      } as any;
      const lastLockedGw = {
        id: 1,
        externalSeasonId: 100,
        snapshotDeadlineAt: new Date('2025-12-31T20:00:00.000Z'),
      } as any;

      (gameweekRepo.findOne as any)
        .mockResolvedValueOnce(nextOpenGw) // next open
        .mockResolvedValueOnce(lastLockedGw); // last locked

      (fixtureRepo.findOne as any).mockResolvedValueOnce(null); // no upcoming in last locked -> use next open

      const fixtures = [
        {
          id: 20,
          startingAt: new Date('2026-01-02T10:00:00.000Z'),
          stageId: 1,
          gameweekId: 2,
          participantTeamIds: [1, 2],
        },
      ] as any[];
      (fixtureRepo.find as any).mockResolvedValueOnce(fixtures);

      (footballTeamRepo.find as any).mockResolvedValueOnce([
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ]);

      const res = await service.getUpcomingFixtures(10);

      expect(fixtureRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ gameweekId: 2 }),
        }),
      );
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ id: 20, gameweekId: 2 });
    });
  });

  describe('getMyTeam (season ended)', () => {
    it('should return the last/current squad instead of throwing when there is no upcoming gameweek', async () => {
      const user = { id: 'u1' } as any;

      (teamRepo.findOne as any).mockResolvedValueOnce({
        id: 't1',
        ownerId: 'u1',
        squads: [{ id: 's1' }],
      });

      // No season row -> zeros
      (rankingRepo.findOne as any).mockResolvedValueOnce(null);

      // betterCount query for rank
      const qbBetter: any = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      (teamRepo.createQueryBuilder as any).mockReturnValueOnce(qbBetter);

      // No upcoming gameweek -> season ended
      const qbNextGw: any = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      (gameweekRepo.createQueryBuilder as any).mockReturnValueOnce(qbNextGw);

      // lockExpiredDraftSquads: no unlocked drafts to lock
      (squadRepo.find as any).mockResolvedValueOnce([]);

      // Return "current" squad
      (squadRepo.findOne as any)
        .mockResolvedValueOnce({
          id: 's1',
          teamId: 't1',
          isCurrent: true,
          players: [],
        })
        .mockResolvedValueOnce(null);

      const res = await service.getMyTeam(user);
      expect(res.team.id).toBe('t1');
      expect(res.currentSquad?.id).toBe('s1');
    });
  });

  describe('createSquad - max players per team', () => {
    const buildSquadDto = () => ({
      formation: '4-4-2',
      squad: Array.from({ length: 15 }, (_, i) => ({
        playerId: i + 1,
        isStarting: i < 11,
      })),
    });

    // countryId acts as the national-team identifier for the max-per-team rule.
    const buildPlayers = (countryIds: number[]) =>
      countryIds.map((countryId, i) => ({
        id: i + 1,
        countryId,
        price: 1_000_000,
        position: { code: i === 0 ? 'GK' : 'DEF' },
      })) as any[];

    it('rejects a squad with more than 3 players from the same team', async () => {
      const user = { id: 'u1' } as any;
      (teamRepo.findOne as any).mockResolvedValueOnce({
        id: 't1',
        ownerId: 'u1',
        squads: [],
      });

      // 4 players share countryId=10 -> should be rejected.
      const countryIds = [10, 10, 10, 10, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13];
      (playersService.getPlayersFromIds as any).mockResolvedValueOnce(
        buildPlayers(countryIds),
      );

      await expect(service.createSquad(user, buildSquadDto())).rejects.toThrow(
        /maximum of 3 players from the same team/i,
      );
    });

    it('allows a squad with at most 3 players from any single team', async () => {
      const user = { id: 'u1' } as any;
      (teamRepo.findOne as any).mockResolvedValueOnce({
        id: 't1',
        ownerId: 'u1',
        squads: [],
      });

      // At most 3 from countryId=10; passes the per-team rule and proceeds to
      // later validation (budget), which is not the assertion under test.
      const countryIds = [10, 10, 10, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14];
      (playersService.getPlayersFromIds as any).mockResolvedValueOnce(
        buildPlayers(countryIds),
      );

      await expect(
        service.createSquad(user, buildSquadDto()),
      ).rejects.not.toThrow(/maximum of 3 players from the same team/i);
    });
  });

  // Additional tests can be added here for:
  // - Team creation validation
  // - Transfer validation
  // - Lineup updates
  // - Role assignments
});








