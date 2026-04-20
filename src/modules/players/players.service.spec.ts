import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PlayersService } from './players.service';
import { SportmonksPlayersService } from '@/common/sportmonks/services/players.service';
import { SettingsService } from '../settings/settings.service';
import { FootballService } from '@/common/football/services/football.service';
import { Player } from './entities/player.entity';
import { SportmonksTeam } from '@/common/sportmonks/types/teams.type';
import { PlayerFixtureStats } from './entities/player-fixture-stats.entity';

describe('PlayersService', () => {
  let service: PlayersService;
  let save: jest.Mock;
  let findOne: jest.Mock;
  let find: jest.Mock;
  let createQueryBuilderWhereInIds: jest.Mock;
  let createQueryBuilderGetMany: jest.Mock;
  let createQueryBuilderWhere: jest.Mock;
  let createQueryBuilderOrderBy: jest.Mock;
  let createQueryBuilderTake: jest.Mock;
  let createQueryBuilderGetManyRecent: jest.Mock;
  let sportmonksPlayersService: {
    getCountries: jest.Mock;
    getPlayers: jest.Mock;
    getPlayerById: jest.Mock;
  };
  let settingsService: {
    getMainServiceLeague: jest.Mock;
  };

  beforeEach(async () => {
    save = jest.fn(async (payload) => payload);
    findOne = jest.fn(async () => null);
    find = jest.fn(async () => []);
    createQueryBuilderGetMany = jest.fn(async () => []);
    createQueryBuilderWhereInIds = jest.fn(() => ({
      getMany: createQueryBuilderGetMany,
    }));
    createQueryBuilderGetManyRecent = jest.fn(async () => []);
    createQueryBuilderTake = jest.fn(() => ({
      getMany: createQueryBuilderGetManyRecent,
    }));
    createQueryBuilderOrderBy = jest.fn(() => ({
      take: createQueryBuilderTake,
    }));
    createQueryBuilderWhere = jest.fn(() => ({
      orderBy: createQueryBuilderOrderBy,
    }));
    sportmonksPlayersService = {
      getCountries: jest.fn(async () => []),
      getPlayers: jest.fn(async () => ({
        data: [],
        pagination: {
          has_more: false,
          next_page: null,
        },
      })),
      getPlayerById: jest.fn(),
    };
    settingsService = {
      getMainServiceLeague: jest.fn(async () => ({
        currentSeason: {
          serviceId: 2026,
        },
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayersService,
        {
          provide: SportmonksPlayersService,
          useValue: sportmonksPlayersService,
        },
        {
          provide: SettingsService,
          useValue: settingsService,
        },
        {
          provide: FootballService,
          useValue: {
            getRating: jest.fn(() => 75),
            getPlayerPool: jest.fn(() => 'STAR'),
            positionIdToPosition: jest.fn(() => ({
              id: 3,
              name: 'Forward',
              code: 'FWD',
              developer_name: 'forward',
            })),
          },
        },
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn((entity) => {
              if (entity === Player) {
                return {
                  findOne,
                  save,
                  find,
                  createQueryBuilder: jest.fn(() => ({
                    whereInIds: createQueryBuilderWhereInIds,
                  })),
                };
              }

              if (entity === PlayerFixtureStats) {
                return {
                  createQueryBuilder: jest.fn(() => ({
                    where: createQueryBuilderWhere,
                  })),
                };
              }

              return {
                findOne,
                save,
              };
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PlayersService>(PlayersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('preserves existing season stats when a fresh season snapshot is unavailable', async () => {
    const payload = await service.upsertFromSportmonksPlayer({
      sportmonksPlayerId: 7,
      player: {
        id: 7,
        sport_id: 1,
        country_id: 160,
        nationality_id: 160,
        city_id: 1,
        position_id: 3,
        detailed_position_id: null,
        type_id: 3,
        common_name: 'Osimhen',
        firstname: 'Victor',
        lastname: 'Osimhen',
        name: 'Victor Osimhen',
        display_name: 'Victor Osimhen',
        image_path: 'https://cdn.example.com/osimhen.png',
        height: 185,
        weight: 78,
        date_of_birth: '1998-12-29',
        gender: 'male',
        position: {
          id: 3,
          name: 'Forward',
          code: 'FWD',
          developer_name: 'forward',
          model_type: 'position',
        },
      },
      seasonStats: undefined,
    });

    expect(payload).not.toHaveProperty('minutesPlayed');
    expect(payload).not.toHaveProperty('appearances');
    expect(payload).not.toHaveProperty('lineups');
    expect(payload).not.toHaveProperty('starts');
    expect(payload).not.toHaveProperty('bench');
    expect(payload).not.toHaveProperty('shotsOnTarget');
    expect(payload).not.toHaveProperty('keyPasses');
  });

  it('writes season stats when a fresh season snapshot is provided', async () => {
    const payload = await service.upsertFromSportmonksPlayer({
      sportmonksPlayerId: 7,
      player: {
        id: 7,
        sport_id: 1,
        country_id: 160,
        nationality_id: 160,
        city_id: 1,
        position_id: 3,
        detailed_position_id: null,
        type_id: 3,
        common_name: 'Osimhen',
        firstname: 'Victor',
        lastname: 'Osimhen',
        name: 'Victor Osimhen',
        display_name: 'Victor Osimhen',
        image_path: 'https://cdn.example.com/osimhen.png',
        height: 185,
        weight: 78,
        date_of_birth: '1998-12-29',
        gender: 'male',
        position: {
          id: 3,
          name: 'Forward',
          code: 'FWD',
          developer_name: 'forward',
          model_type: 'position',
        },
      },
      seasonStats: {
        minutesPlayed: 900,
        appearances: 12,
        lineups: 10,
        starts: 10,
        bench: 2,
        shotsOnTarget: 18,
        keyPasses: 11,
      },
    });

    expect(payload).toMatchObject({
      minutesPlayed: 900,
      appearances: 12,
      lineups: 10,
      starts: 10,
      bench: 2,
      shotsOnTarget: 18,
      keyPasses: 11,
    });
  });

  it('uses fallbackCountryId when Sportmonks country fields are zero', async () => {
    const payload = await service.upsertFromSportmonksPlayer({
      sportmonksPlayerId: 7,
      fallbackCountryId: 160,
      player: {
        id: 7,
        sport_id: 1,
        country_id: 0,
        nationality_id: 0,
        city_id: 1,
        position_id: 3,
        detailed_position_id: null,
        type_id: 3,
        common_name: 'Osimhen',
        firstname: 'Victor',
        lastname: 'Osimhen',
        name: 'Victor Osimhen',
        display_name: 'Victor Osimhen',
        image_path: 'https://cdn.example.com/osimhen.png',
        height: 185,
        weight: 78,
        date_of_birth: '1998-12-29',
        gender: 'male',
        position: {
          id: 3,
          name: 'Forward',
          code: 'FWD',
          developer_name: 'forward',
          model_type: 'position',
        },
      },
    });

    expect(payload.countryId).toBe(160);
  });

  it('limits the legacy name fallback to rows without an externalId', async () => {
    await service.createOrUpdatePlayer({
      externalId: 7,
      image: 'https://cdn.example.com/osimhen.png',
      name: 'Victor Osimhen',
      commonName: 'Osimhen',
      pool: 'STAR',
      positionId: 3,
      position: {
        id: 3,
        name: 'Forward',
        code: 'FWD',
        developer_name: 'forward',
      },
      countryId: 160,
    });

    expect(findOne).toHaveBeenNthCalledWith(1, {
      where: { externalId: 7 },
    });
    expect(findOne).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        name: 'Victor Osimhen',
        externalId: expect.any(Object),
      }),
    });
  });

  it('syncPlayers preserves previously stored season stats when Sportmonks detail fetch fails', async () => {
    const teamPayload: SportmonksTeam = {
      id: 10,
      country_id: 160,
      players: [
        {
          id: 100,
          transfer_id: 1,
          player_id: 7,
          team_id: 10,
          position_id: 3,
          detailed_position_id: 30,
          start: '2026-01-01',
          end: '2026-12-31',
          captain: false,
          jersey_number: 9,
          position: {
            id: 3,
            name: 'Forward',
            code: 'FWD',
            developer_name: 'forward',
            model_type: 'position',
          },
          player: {
            id: 7,
            sport_id: 1,
            country_id: 160,
            nationality_id: 160,
            city_id: 1,
            position_id: 3,
            detailed_position_id: null,
            type_id: 3,
            common_name: 'Osimhen',
            firstname: 'Victor',
            lastname: 'Osimhen',
            name: 'Victor Osimhen',
            display_name: 'Victor Osimhen',
            image_path: 'https://cdn.example.com/osimhen.png',
            height: 185,
            weight: 78,
            date_of_birth: '1998-12-29',
            gender: 'male',
            position: {
              id: 3,
              name: 'Forward',
              code: 'FWD',
              developer_name: 'forward',
              model_type: 'position',
            },
          },
        },
      ],
    } as SportmonksTeam;

    sportmonksPlayersService.getPlayers.mockResolvedValue({
      data: [teamPayload],
      pagination: { has_more: false, next_page: null },
    });
    sportmonksPlayersService.getPlayerById.mockRejectedValue(
      new Error('upstream failed'),
    );

    const upsertSpy = jest.spyOn(service, 'upsertFromSportmonksPlayer');

    await service.syncPlayers();

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sportmonksPlayerId: 7,
        seasonStats: undefined,
      }),
    );
  });

  it('builds player detail from the stored player and recent fixture stats', async () => {
    findOne.mockResolvedValueOnce({
      id: 7,
      name: 'Victor Osimhen',
      commonName: 'Osimhen',
      image: 'https://cdn.example.com/osimhen.png',
      pool: 'STAR',
      positionId: 3,
      position: {
        id: 3,
        name: 'Forward',
        code: 'FWD',
        developer_name: 'forward',
      },
      countryId: 160,
      externalId: 1007,
      rating: 88,
      goals: 12,
      assists: 4,
      yellowCards: 2,
      redCards: 1,
      points: 86,
      price: 9600000,
      appearances: 10,
      shotsOnTarget: 12,
      keyPasses: 18,
    });
    createQueryBuilderGetManyRecent.mockResolvedValueOnce([
      {
        fixtureId: 10,
        playerId: 7,
        minutesPlayed: 90,
        goals: 1,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        fantasyPoints: 10,
      },
      {
        fixtureId: 9,
        playerId: 7,
        minutesPlayed: 70,
        goals: 0,
        assists: 1,
        yellowCards: 0,
        redCards: 0,
        fantasyPoints: 8,
      },
    ]);

    const detail = await service.getPlayerDetail(7);

    expect(detail.player.id).toBe(7);
    expect(detail.season.shotsOnTarget).toBe(12);
    expect(detail.insights.form).toBe(9);
    expect(detail.insights.performanceIndex).toBe(74.03);
    expect(createQueryBuilderWhere).toHaveBeenCalledWith('stats.playerId = :playerId', {
      playerId: 7,
    });
  });

  it('builds compare payloads in requested id order', async () => {
    createQueryBuilderGetMany.mockResolvedValueOnce([
      {
        id: 7,
        name: 'Victor Osimhen',
        commonName: 'Osimhen',
        image: 'https://cdn.example.com/osimhen.png',
        pool: 'STAR',
        positionId: 3,
        position: {
          id: 3,
          name: 'Forward',
          code: 'FWD',
          developer_name: 'forward',
        },
        countryId: 160,
        externalId: 1007,
        rating: 88,
        goals: 12,
        assists: 4,
        yellowCards: 2,
        redCards: 1,
        points: 86,
        price: 9600000,
      },
      {
        id: 9,
        name: 'Kylian Mbappe',
        commonName: 'Mbappe',
        image: 'https://cdn.example.com/mbappe.png',
        pool: 'STAR',
        positionId: 3,
        position: {
          id: 3,
          name: 'Forward',
          code: 'FWD',
          developer_name: 'forward',
        },
        countryId: 250,
        externalId: 1009,
        rating: 90,
        goals: 15,
        assists: 6,
        yellowCards: 1,
        redCards: 0,
        points: 104,
        price: 10000000,
      },
    ]);

    const compare = await service.comparePlayers([9, 7]);

    expect(compare.players.map((entry) => entry.player.id)).toEqual([9, 7]);
  });
});
