import { SportmonksPlayer } from '@/common/sportmonks/types/players.types';
import { mapSportmonksSeasonStats } from './player-season-stats.mapper';

const buildPlayer = (
  overrides: Partial<SportmonksPlayer> = {},
): SportmonksPlayer =>
  ({
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
    statistics: [],
    ...overrides,
  }) as SportmonksPlayer;

describe('mapSportmonksSeasonStats', () => {
  it('maps known season detail types and derives starts from lineups', () => {
    const player = buildPlayer({
      statistics: [
        {
          id: 1,
          player_id: 7,
          team_id: 10,
          season_id: 2026,
          position_id: 3,
          jersey_number: 9,
          details: [
            { id: 11, player_statistic_id: 1, type_id: 119, value: { total: 900 } },
            { id: 12, player_statistic_id: 1, type_id: 321, value: { total: 12 } },
            { id: 13, player_statistic_id: 1, type_id: 322, value: { total: 10 } },
            { id: 14, player_statistic_id: 1, type_id: 323, value: { total: 2 } },
            { id: 15, player_statistic_id: 1, type_id: 86, value: { total: 18 } },
            { id: 16, player_statistic_id: 1, type_id: 117, value: { total: 11 } },
          ],
        },
      ],
    });

    expect(mapSportmonksSeasonStats(player, 2026)).toEqual({
      minutesPlayed: 900,
      appearances: 12,
      lineups: 10,
      starts: 10,
      bench: 2,
      shotsOnTarget: 18,
      keyPasses: 11,
    });
  });

  it('derives starts from appearances minus bench when lineups are absent', () => {
    const player = buildPlayer({
      statistics: [
        {
          id: 2,
          player_id: 7,
          team_id: 10,
          season_id: 2026,
          position_id: 3,
          jersey_number: 9,
          details: [
            { id: 21, player_statistic_id: 2, type_id: 321, value: { total: 14 } },
            { id: 22, player_statistic_id: 2, type_id: 323, value: { total: 5 } },
          ],
        },
      ],
    });

    expect(mapSportmonksSeasonStats(player, 2026)).toEqual({
      minutesPlayed: null,
      appearances: 14,
      lineups: null,
      starts: 9,
      bench: 5,
      shotsOnTarget: null,
      keyPasses: null,
    });
  });

  it('aggregates split season rows and returns nulls when a stat is unavailable', () => {
    const player = buildPlayer({
      statistics: [
        {
          id: 3,
          player_id: 7,
          team_id: 10,
          season_id: 2026,
          position_id: 3,
          jersey_number: 9,
          details: [
            { id: 31, player_statistic_id: 3, type_id: 119, value: { total: 400 } },
            { id: 32, player_statistic_id: 3, type_id: 86, value: { total: 5 } },
          ],
        },
        {
          id: 4,
          player_id: 7,
          team_id: 11,
          season_id: 2026,
          position_id: 3,
          jersey_number: 19,
          details: [
            { id: 41, player_statistic_id: 4, type_id: 119, value: { total: 230 } },
            { id: 42, player_statistic_id: 4, type_id: 86, value: { total: 4 } },
            { id: 43, player_statistic_id: 4, type_id: 117, value: 7 },
          ],
        },
      ],
    });

    expect(mapSportmonksSeasonStats(player, 2026)).toEqual({
      minutesPlayed: 630,
      appearances: null,
      lineups: null,
      starts: null,
      bench: null,
      shotsOnTarget: 9,
      keyPasses: 7,
    });
  });
});
