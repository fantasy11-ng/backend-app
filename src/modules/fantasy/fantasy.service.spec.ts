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

  // Additional tests can be added here for:
  // - Team creation validation
  // - Transfer validation
  // - Lineup updates
  // - Role assignments
});





