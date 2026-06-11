import { Test, TestingModule } from '@nestjs/testing';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { PaginateQuery } from 'nestjs-paginate';
import { PATH_METADATA } from '@nestjs/common/constants';

describe('PlayersController', () => {
  let controller: PlayersController;
  let playersService: {
    getPlayers: jest.Mock;
    getPlayerDetail: jest.Mock;
    comparePlayers: jest.Mock;
    syncPlayers: jest.Mock;
    getPlayerStatLeaders: jest.Mock;
  };

  beforeEach(async () => {
    playersService = {
      getPlayers: jest.fn(),
      getPlayerDetail: jest.fn(),
      comparePlayers: jest.fn(),
      syncPlayers: jest.fn(),
      getPlayerStatLeaders: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlayersController],
      providers: [
        {
          provide: PlayersService,
          useValue: playersService,
        },
      ],
    }).compile();

    controller = module.get<PlayersController>(PlayersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forwards player detail requests to the service', async () => {
    playersService.getPlayerDetail.mockResolvedValue({ player: { id: 7 } });

    await expect(controller.getPlayerDetail('7')).resolves.toEqual({
      player: { id: 7 },
    });
    expect(playersService.getPlayerDetail).toHaveBeenCalledWith(7);
  });

  it('forwards compare requests to the service with parsed ids', async () => {
    playersService.comparePlayers.mockResolvedValue({
      players: [{ player: { id: 7 } }, { player: { id: 9 } }],
    });

    await expect(controller.comparePlayers('7,9')).resolves.toEqual({
      players: [{ player: { id: 7 } }, { player: { id: 9 } }],
    });
    expect(playersService.comparePlayers).toHaveBeenCalledWith([7, 9]);
  });

  it('keeps the existing player list endpoint wired to the service', async () => {
    const query = { page: 1, limit: 20 } as unknown as PaginateQuery;
    playersService.getPlayers.mockResolvedValue({ data: [] });

    await controller.getPlayers(query);

    expect(playersService.getPlayers).toHaveBeenCalledWith(query);
  });

  it('forwards stat leader requests to the service', async () => {
    playersService.getPlayerStatLeaders.mockResolvedValue({
      mostPoints: { player: { id: 1 }, metricValue: 120 },
      mostGoals: null,
      mostAssists: null,
      mostSelected: null,
    });

    await expect(controller.getPlayerStatLeaders()).resolves.toEqual({
      mostPoints: { player: { id: 1 }, metricValue: 120 },
      mostGoals: null,
      mostAssists: null,
      mostSelected: null,
    });
    expect(playersService.getPlayerStatLeaders).toHaveBeenCalled();
  });

  it('declares static routes before the dynamic id route to avoid shadowing', () => {
    const prototype = PlayersController.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== 'constructor',
    );
    const routes = methodNames.map((name) => ({
      name,
      path: Reflect.getMetadata(PATH_METADATA, prototype[name]),
    }));

    const syncIndex = routes.findIndex((route) => route.name === 'syncPlayers');
    const compareIndex = routes.findIndex(
      (route) => route.name === 'comparePlayers',
    );
    const leadersIndex = routes.findIndex(
      (route) => route.name === 'getPlayerStatLeaders',
    );
    const detailIndex = routes.findIndex((route) => route.name === 'getPlayerDetail');

    expect(routes[syncIndex]?.path).toBe('sync');
    expect(routes[compareIndex]?.path).toBe('compare');
    expect(routes[leadersIndex]?.path).toBe('leaders');
    expect(routes[detailIndex]?.path).toBe(':id');
    expect(syncIndex).toBeLessThan(detailIndex);
    expect(compareIndex).toBeLessThan(detailIndex);
    expect(leadersIndex).toBeLessThan(detailIndex);
  });
});
