import { Player } from './entities/player.entity';
import { PlayerFixtureStats } from './entities/player-fixture-stats.entity';
import {
  toMultiPlayerCompareDto,
  toPlayerCompareItemDto,
  toPlayerDetailDto,
} from './player-insights.mapper';

const buildPlayer = (overrides: Partial<Player> = {}): Player =>
  ({
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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-15T00:00:00.000Z'),
    ...overrides,
  }) as Player;

const buildFixtureStats = (
  fixtureId: number,
  overrides: Partial<PlayerFixtureStats> = {},
): PlayerFixtureStats =>
  ({
    id: `pfs-${fixtureId}`,
    playerId: 7,
    fixtureId,
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    fantasyPoints: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as PlayerFixtureStats;

describe('player insights mapper', () => {
  it('keeps recent fixture data separate from nullable season metrics', () => {
    const player = buildPlayer();
    const recentFixtureStats = [
      buildFixtureStats(103, { minutesPlayed: 90, goals: 1, fantasyPoints: 10 }),
      buildFixtureStats(104, {
        minutesPlayed: 25,
        assists: 1,
        yellowCards: 1,
        fantasyPoints: 6,
      }),
      buildFixtureStats(105, { minutesPlayed: 0, fantasyPoints: 0 }),
    ];

    const dto = toPlayerDetailDto({
      player,
      recentFixtureStats,
    });

    expect(dto.player.id).toBe(player.id);
    expect(dto.player.position.code).toBe('FWD');
    expect(dto.season.points).toBe(86);
    expect(dto.season.goals).toBe(12);
    expect(dto.season.assists).toBe(4);
    expect(dto.season.minutesPlayed).toBeNull();
    expect(dto.season.appearances).toBeNull();
    expect(dto.season.lineups).toBeNull();
    expect(dto.season.starts).toBeNull();
    expect(dto.season.bench).toBeNull();
    expect(dto.season.shotsOnTarget).toBeNull();
    expect(dto.season.keyPasses).toBeNull();
    expect(dto.insights.ownership).toBeNull();
    expect(dto.insights.priceChange).toBeNull();
    expect(dto.insights.form).toBe(8);
    expect(dto.insights.performanceIndex).toBe(65.93);
    expect(dto.recentFixtures).toEqual([
      {
        fixtureId: 103,
        minutesPlayed: 90,
        goals: 1,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        fantasyPoints: 10,
      },
      {
        fixtureId: 104,
        minutesPlayed: 25,
        goals: 0,
        assists: 1,
        yellowCards: 1,
        redCards: 0,
        fantasyPoints: 6,
      },
      {
        fixtureId: 105,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        fantasyPoints: 0,
      },
    ]);
  });

  it('prefers richer season stats and derived insights when provided', () => {
    const player = buildPlayer({
      goals: 5,
      assists: 2,
      yellowCards: 0,
      redCards: 0,
      points: 30,
    });

    const dto = toPlayerCompareItemDto({
      player,
      recentFixtureStats: [buildFixtureStats(201, { fantasyPoints: 3 })],
      seasonStats: {
        points: 99,
        goals: 14,
        assists: 8,
        yellowCards: 3,
        redCards: 0,
        minutesPlayed: 1234,
        appearances: 15,
        lineups: 14,
        starts: 13,
        bench: 2,
        shotsOnTarget: 17,
        keyPasses: 22,
      },
      insights: {
        ownership: 18.4,
        priceChange: 250000,
        form: 8.4,
        performanceIndex: 74.6,
      },
    });

    expect(dto.season.points).toBe(99);
    expect(dto.season.goals).toBe(14);
    expect(dto.season.assists).toBe(8);
    expect(dto.season.minutesPlayed).toBe(1234);
    expect(dto.season.appearances).toBe(15);
    expect(dto.season.lineups).toBe(14);
    expect(dto.season.starts).toBe(13);
    expect(dto.season.bench).toBe(2);
    expect(dto.season.shotsOnTarget).toBe(17);
    expect(dto.season.keyPasses).toBe(22);
    expect(dto.insights.ownership).toBe(18.4);
    expect(dto.insights.priceChange).toBe(250000);
    expect(dto.insights.form).toBe(8.4);
    expect(dto.insights.performanceIndex).toBe(74.6);
  });

  it('derives insight metrics from computed inputs when explicit insight values are absent', () => {
    const recentFixtureStats = [
      buildFixtureStats(1, { fantasyPoints: 7, minutesPlayed: 60 }),
      buildFixtureStats(2, { fantasyPoints: 8, minutesPlayed: 70 }),
      buildFixtureStats(3, { fantasyPoints: 9, minutesPlayed: 75 }),
      buildFixtureStats(4, { fantasyPoints: 10, minutesPlayed: 75 }),
      buildFixtureStats(5, { fantasyPoints: 11, minutesPlayed: 80 }),
    ];

    const dto = toPlayerDetailDto({
      player: buildPlayer(),
      recentFixtureStats,
      computedMetrics: {
        ownership: {
          selectedTeams: 18,
          totalTeams: 100,
        },
        transferDemand: {
          transferIns: 60,
          transferOuts: 20,
          totalTeams: 400,
        },
        form: {
          recentFixtureStats,
        },
        performanceIndex: {
          recentFixtureStats,
          seasonStats: {
            appearances: 10,
            shotsOnTarget: 12,
            keyPasses: 18,
          },
        },
      },
    });

    expect(dto.insights.ownership).toBe(18);
    expect(dto.insights.priceChange).toBe(125000);
    expect(dto.insights.form).toBe(10); // lookback=3: top 3 of [1→7,2→8,3→9,4→10,5→11] = avg(11,10,9)
    expect(dto.insights.performanceIndex).toBe(72.25);
  });

  it('prefers explicit insight values over computed fallbacks', () => {
    const dto = toPlayerCompareItemDto({
      player: buildPlayer(),
      computedMetrics: {
        ownership: {
          selectedTeams: 40,
          totalTeams: 100,
        },
      },
      insights: {
        ownership: 91.2,
      },
    });

    expect(dto.insights.ownership).toBe(91.2);
  });

  it('falls back to derived metrics when explicit insight keys are present but undefined', () => {
    const recentFixtureStats = [
      buildFixtureStats(10, { fantasyPoints: 8, minutesPlayed: 90 }),
      buildFixtureStats(11, { fantasyPoints: 6, minutesPlayed: 70 }),
    ];

    const dto = toPlayerDetailDto({
      player: buildPlayer({
        appearances: 8,
        shotsOnTarget: 10,
        keyPasses: 12,
      }),
      recentFixtureStats,
      insights: {
        form: undefined,
      },
    });

    expect(dto.insights.form).toBe(7);
    expect(dto.insights.performanceIndex).toBe(64.24);
  });

  it('allows computed metric nulls to suppress auto-derived fallbacks', () => {
    const dto = toPlayerDetailDto({
      player: buildPlayer({
        appearances: 8,
        shotsOnTarget: 10,
        keyPasses: 12,
      }),
      recentFixtureStats: [
        buildFixtureStats(10, { fantasyPoints: 8, minutesPlayed: 90 }),
        buildFixtureStats(11, { fantasyPoints: 6, minutesPlayed: 70 }),
      ],
      computedMetrics: {
        form: null,
        performanceIndex: null,
      },
    });

    expect(dto.insights.form).toBeNull();
    expect(dto.insights.performanceIndex).toBeNull();
  });

  it('merges partial computed metric overrides with mapper-derived defaults', () => {
    const recentFixtureStats = [
      buildFixtureStats(10, { fantasyPoints: 8, minutesPlayed: 90 }),
      buildFixtureStats(11, { fantasyPoints: 6, minutesPlayed: 70 }),
      buildFixtureStats(12, { fantasyPoints: 4, minutesPlayed: 30 }),
      buildFixtureStats(13, { fantasyPoints: 2, minutesPlayed: 20 }),
    ];

    const dto = toPlayerDetailDto({
      player: buildPlayer({
        appearances: 8,
        shotsOnTarget: 10,
        keyPasses: 12,
      }),
      recentFixtureStats,
      computedMetrics: {
        form: {
          lookback: 3,
        },
        performanceIndex: {
          lookback: 3,
        },
      },
    });

    expect(dto.insights.form).toBe(4);
    expect(dto.insights.performanceIndex).toBe(41.6);
  });

  it('builds a multi-player compare response in input order', () => {
    const first = buildPlayer({ id: 1, name: 'First Player', commonName: 'First' });
    const second = buildPlayer({
      id: 2,
      name: 'Second Player',
      commonName: 'Second',
      externalId: 1002,
    });

    const dto = toMultiPlayerCompareDto([
      { player: first, recentFixtureStats: [buildFixtureStats(301, { playerId: 1 })] },
      { player: second, recentFixtureStats: [buildFixtureStats(302, { playerId: 2 })] },
    ]);

    expect(dto.players).toHaveLength(2);
    expect(dto.players.map((item) => item.player.id)).toEqual([1, 2]);
    expect(dto.players[0].player.name).toBe('First Player');
    expect(dto.players[1].player.name).toBe('Second Player');
  });

  it('leaves compare season metrics nullable unless explicit season data is provided', () => {
    const dto = toPlayerCompareItemDto({
      player: buildPlayer(),
      recentFixtureStats: [
        buildFixtureStats(401, { minutesPlayed: 90, fantasyPoints: 12 }),
      ],
    });

    expect(dto.season.points).toBe(86);
    expect(dto.season.minutesPlayed).toBeNull();
    expect(dto.season.appearances).toBeNull();
    expect(dto.insights.form).toBe(12);
  });

  it('uses persisted season stats from the player entity when they are available', () => {
    const dto = toPlayerDetailDto({
      player: buildPlayer({
        minutesPlayed: 1320,
        appearances: 16,
        lineups: 15,
        starts: 15,
        bench: 1,
        shotsOnTarget: 21,
        keyPasses: 17,
      }),
    });

    expect(dto.season.minutesPlayed).toBe(1320);
    expect(dto.season.appearances).toBe(16);
    expect(dto.season.lineups).toBe(15);
    expect(dto.season.starts).toBe(15);
    expect(dto.season.bench).toBe(1);
    expect(dto.season.shotsOnTarget).toBe(21);
    expect(dto.season.keyPasses).toBe(17);
  });

  it('surfaces persisted clean sheets and defaults to zero', () => {
    expect(
      toPlayerDetailDto({ player: buildPlayer({ cleanSheets: 6 }) }).season
        .cleanSheets,
    ).toBe(6);
    expect(
      toPlayerDetailDto({ player: buildPlayer() }).season.cleanSheets,
    ).toBe(0);
  });

  it('prefers explicit season clean sheets over the persisted value', () => {
    const dto = toPlayerCompareItemDto({
      player: buildPlayer({ cleanSheets: 6 }),
      seasonStats: { cleanSheets: 9 },
    });

    expect(dto.season.cleanSheets).toBe(9);
  });

  it('exposes ownership selectedTeams and current gameweek points on the detail payload', () => {
    const dto = toPlayerDetailDto({
      player: buildPlayer(),
      seasonStats: { currentGameweekPoints: 14 },
      insights: { selectedTeams: 37 },
      computedMetrics: {
        ownership: { selectedTeams: 37, totalTeams: 100 },
      },
      gameweekPoints: [
        { gameweekId: 1, gameweekCode: 'GW1', points: 8 },
        { gameweekId: 2, gameweekCode: 'GW2', points: 14 },
      ],
    });

    expect(dto.insights.selectedTeams).toBe(37);
    expect(dto.insights.ownership).toBe(37);
    expect(dto.season.currentGameweekPoints).toBe(14);
    expect(dto.gameweekPoints).toEqual([
      { gameweekId: 1, gameweekCode: 'GW1', points: 8 },
      { gameweekId: 2, gameweekCode: 'GW2', points: 14 },
    ]);
  });

  it('defaults gameweek points to an empty list and nullable current gameweek points', () => {
    const dto = toPlayerDetailDto({ player: buildPlayer() });

    expect(dto.gameweekPoints).toEqual([]);
    expect(dto.season.currentGameweekPoints).toBeNull();
    expect(dto.insights.selectedTeams).toBeNull();
  });
});
