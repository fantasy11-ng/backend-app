import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FantasyLeagueService } from './fantasy-league.service';
import { FantasyService } from './fantasy.service';
import { FantasyTimeService } from './fantasy-time.service';
import { FantasyLeague } from './entities/fantasy-league.entity';
import { FantasyLeagueMembership } from './entities/fantasy-league-membership.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { FantasyGameweek } from './entities/fantasy-gameweek.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyTransfer } from './entities/fantasy-transfer.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { Player } from '@/modules/players/entities/player.entity';

describe('FantasyLeagueService', () => {
  let service: FantasyLeagueService;
  let leagueRepo: Repository<FantasyLeague>;
  let membershipRepo: Repository<FantasyLeagueMembership>;
  let gameweekRepo: Repository<FantasyGameweek>;
  let squadRepo: Repository<FantasySquad>;
  let squadPlayerRepo: Repository<FantasySquadPlayer>;
  let transferRepo: Repository<FantasyTransfer>;
  let pointsRepo: Repository<FantasyPoints>;
  let playerRepo: Repository<Player>;
  let fantasyService: FantasyService;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FantasyLeagueService,
        {
          provide: FantasyService,
          useValue: {
            getMyTeam: jest.fn(),
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
              leagueMaxParticipants: 200,
            })),
          },
        },
        { provide: getRepositoryToken(FantasyLeague), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(FantasyLeagueMembership),
          useValue: { find: jest.fn(), count: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(FantasyTeamRanking),
          useValue: { findOne: jest.fn(), find: jest.fn(), createQueryBuilder: jest.fn() },
        },
        { provide: getRepositoryToken(FantasyGameweek), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(FantasySquad), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(FantasySquadPlayer), useValue: { find: jest.fn() } },
        {
          provide: getRepositoryToken(FantasyTransfer),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(FantasyPoints),
          useValue: { createQueryBuilder: jest.fn() },
        },
        { provide: getRepositoryToken(Player), useValue: { findBy: jest.fn() } },
      ],
    }).compile();

    service = module.get(FantasyLeagueService);
    leagueRepo = module.get(getRepositoryToken(FantasyLeague));
    membershipRepo = module.get(getRepositoryToken(FantasyLeagueMembership));
    gameweekRepo = module.get(getRepositoryToken(FantasyGameweek));
    squadRepo = module.get(getRepositoryToken(FantasySquad));
    squadPlayerRepo = module.get(getRepositoryToken(FantasySquadPlayer));
    transferRepo = module.get(getRepositoryToken(FantasyTransfer));
    pointsRepo = module.get(getRepositoryToken(FantasyPoints));
    playerRepo = module.get(getRepositoryToken(Player));
    fantasyService = module.get(FantasyService);
  });

  it('computes leaderboard ranks + positionChange and league-scoped widget cards', async () => {
    (fantasyService.getMyTeam as any).mockResolvedValue({
      team: { id: 't-me' },
    });

    (leagueRepo.findOne as any).mockResolvedValue({ id: 'l1' });

    (membershipRepo.find as any).mockResolvedValue([
      { teamId: 't1', team: { id: 't1', name: 'A', logoUrl: 'a.png' } },
      { teamId: 't2', team: { id: 't2', name: 'B', logoUrl: 'b.png' } },
      { teamId: 't-me', team: { id: 't-me', name: 'ME', logoUrl: 'me.png' } },
    ]);

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
      .mockResolvedValueOnce([gw3]); // prev locked

    // current totals <= gw4
    const qbTotalsNow = makeQb([
      { teamId: 't1', totalPoints: '10' },
      { teamId: 't2', totalPoints: '8' },
      { teamId: 't-me', totalPoints: '6' },
    ]);
    // prev totals <= gw3
    const qbTotalsPrev = makeQb([
      { teamId: 't1', totalPoints: '7' },
      { teamId: 't2', totalPoints: '9' },
      { teamId: 't-me', totalPoints: '6' },
    ]);
    // top performer (league scoped) for gw4
    const qbPerformers = makeQb([
      { playerId: '3', value: '18' },
      { playerId: '1', value: '12' },
    ]);

    (pointsRepo.createQueryBuilder as any)
      .mockReturnValueOnce(qbTotalsNow)
      .mockReturnValueOnce(qbTotalsPrev)
      .mockReturnValueOnce(qbPerformers);

    // locked squads for league teams
    (squadRepo.find as any).mockResolvedValueOnce([
      { id: 's1' },
      { id: 's2' },
      { id: 's3' },
    ]);

    (squadPlayerRepo.find as any).mockResolvedValueOnce([
      { squadId: 's1', playerId: 1, isCaptain: true },
      { squadId: 's2', playerId: 1, isCaptain: false },
      { squadId: 's3', playerId: 2, isCaptain: true },
    ]);

    const qbTransfers = makeQb([
      { playerId: '2', value: '5' },
      { playerId: '1', value: '3' },
    ]);
    (transferRepo.createQueryBuilder as any).mockReturnValue(qbTransfers);

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

    const res = await service.getLeagueInsights({ id: 'u1' } as any, 'l1');

    // current ranks: t1=1, t2=2, t-me=3
    // prev ranks: t2=1, t1=2, t-me=3
    const rowT1 = res.leaderboard.find((r) => r.teamId === 't1')!;
    expect(rowT1.rank).toBe(1);
    expect(rowT1.previousRank).toBe(2);
    expect(rowT1.positionChange).toBe(1);

    const rowT2 = res.leaderboard.find((r) => r.teamId === 't2')!;
    expect(rowT2.rank).toBe(2);
    expect(rowT2.previousRank).toBe(1);
    expect(rowT2.positionChange).toBe(-1);

    expect(res.me?.teamId).toBe('t-me');
    expect(res.me?.isMe).toBe(true);

    // cards are scoped to league squads (3 squads -> player 1 selected in 2 => 67%)
    expect(res.mostSelected.items[0].player.id).toBe(1);
    expect(res.mostSelected.items[0].metricValue).toBe(67);
    expect(res.bestPerforming.items[0].player.id).toBe(3);
    expect(res.bestPerforming.items[0].metricValue).toBe(18);
  });
});

