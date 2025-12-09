import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksResponse } from '../types/response.type';
import { SportmonksFixture } from '../types/fixtures.types';

export interface SportmonksFixtureStatistics {
  id: number;
  participant_id: number;
  statistics?: {
    player_id?: number;
    player_name?: string;
    player_display_name?: string;
    minutes_played?: number;
    position_id?: number;
    rating?: number;
    goals?: number;
    assists?: number;
    yellow_cards?: number;
    red_cards?: number;
    saves?: number;
    goals_conceded?: number;
    own_goals?: number;
    penalties_scored?: number;
    penalties_missed?: number;
    free_kicks_scored?: number;
  }[];
}

// Minimal shapes based on Sportmonks v3 fixture + lineups response:
// https://docs.sportmonks.com/football/tutorials-and-guides/tutorials/statistics/fixture-statistics#player-fixture-statistics
interface SportmonksStatisticType {
  id: number;
  name: string;
  code: string;
  developer_name: string;
}

interface SportmonksLineupDetail {
  type_id: number;
  data: {
    value: number | string;
  };
  type?: SportmonksStatisticType;
}

interface SportmonksLineup {
  team_id: number;
  player_id: number;
  player_name?: string;
  player_display_name?: string;
  position_id?: number;
  details?: SportmonksLineupDetail[];
}

interface SportmonksFixtureWithLineups extends SportmonksFixture {
  lineups?: SportmonksLineup[];
}

// Fixture player statistic type IDs as defined in:
// https://docs.sportmonks.com/football/definitions/types/statistics/fixture-statistics#fixture-player-statistics
enum FixturePlayerStatisticTypeId {
  GOALS = 52,
  SAVES = 57,
  ASSISTS = 79,
  REDCARDS = 83,
  YELLOWCARDS = 84,
  GOALS_CONCEDED = 88,
  RATING = 118,
  MINUTES_PLAYED = 119,
}

@Injectable()
export class SportmonksFixturesService {
  constructor(private http: HttpService) {}

  async getFixtureById(
    fixtureId: number,
    includes?: string[],
  ): Promise<SportmonksFixture> {
    try {
      const includeParams = includes?.join(';') || '';
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<SportmonksFixture>>(
          `/football/fixtures/${fixtureId}`,
          {
            params: {
              include: includeParams,
            },
          },
        ),
      );

      return data.data as SportmonksFixture;
    } catch (e) {
      throw new BadGatewayException(
        `Error fetching fixture ${fixtureId}: ${e.message}`,
      );
    }
  }

  async getFixtureStatistics(
    fixtureId: number,
  ): Promise<SportmonksFixtureStatistics[]> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<SportmonksFixtureWithLineups>>(
          `/football/fixtures/${fixtureId}`,
          {
            params: {
              // Player fixture statistics via lineups + details + statistic types
              // See: https://docs.sportmonks.com/football/tutorials-and-guides/tutorials/statistics/fixture-statistics#player-fixture-statistics
              include: 'lineups.details.type',
            },
          },
        ),
      );

      const fixture = data.data;

      if (!fixture || !fixture.lineups || fixture.lineups.length === 0) {
        return [];
      }

      // Group player statistics by team (participant)
      const byTeam = new Map<number, SportmonksFixtureStatistics>();

      for (const lineup of fixture.lineups) {
        if (!lineup.team_id || !lineup.player_id) continue;

        let teamStats = byTeam.get(lineup.team_id);
        if (!teamStats) {
          teamStats = {
            id: lineup.team_id,
            participant_id: lineup.team_id,
            statistics: [],
          };
          byTeam.set(lineup.team_id, teamStats);
        }

        const playerStats = this.mapLineupToPlayerStats(lineup);
        teamStats.statistics!.push(playerStats);
      }

      return Array.from(byTeam.values());
    } catch (e) {
      throw new BadGatewayException(
        `Error fetching fixture statistics for ${fixtureId}: ${e.message}`,
      );
    }
  }

  /**
   * Map Sportmonks v3 lineup + statistic types into our flattened player statistics
   */
  private mapLineupToPlayerStats(
    lineup: SportmonksLineup,
  ): SportmonksFixtureStatistics['statistics'][number] {
    const details = lineup.details || [];

    const normalise = (value?: string) =>
      value ? value.trim().toLowerCase().replace(/[\s_]/g, '-') : '';

    const getValueFor = (options: {
      typeIds?: number[];
      keys?: string[];
    }): number | undefined => {
      const typeIdSet = new Set(options.typeIds || []);
      const keySet = new Set((options.keys || []).map((k) => normalise(k)));

      for (const detail of details) {
        const matchesId = typeIdSet.size > 0 && typeIdSet.has(detail.type_id);
        const code = normalise(detail.type?.code);
        const developer = normalise(detail.type?.developer_name);
        const matchesKey =
          keySet.size > 0 &&
          ((code && keySet.has(code)) || (developer && keySet.has(developer)));
        if (!matchesId && !matchesKey) continue;

        const raw = detail.data?.value;
        let num: number | undefined;

        if (typeof raw === 'number') {
          num = raw;
        } else if (raw !== undefined) {
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) {
            num = parsed;
          }
        }

        if (num !== undefined) {
          return num;
        }
      }

      return undefined;
    };

    return {
      player_id: lineup.player_id,
      player_name: lineup.player_name,
      player_display_name: lineup.player_display_name,
      position_id: lineup.position_id,
      minutes_played: getValueFor({
        typeIds: [FixturePlayerStatisticTypeId.MINUTES_PLAYED],
        keys: ['MINUTES_PLAYED', 'minutes-played'],
      }),
      goals: getValueFor({
        typeIds: [FixturePlayerStatisticTypeId.GOALS],
        keys: ['GOALS', 'goals'],
      }),
      assists: getValueFor({
        typeIds: [FixturePlayerStatisticTypeId.ASSISTS],
        keys: ['ASSISTS', 'assists'],
      }),
      yellow_cards: getValueFor({
        typeIds: [FixturePlayerStatisticTypeId.YELLOWCARDS],
        keys: ['YELLOWCARDS', 'YELLOW_CARDS', 'yellowcards', 'yellow-cards'],
      }),
      red_cards: getValueFor({
        typeIds: [FixturePlayerStatisticTypeId.REDCARDS],
        keys: ['REDCARDS', 'RED_CARDS', 'redcards', 'red-cards'],
      }),
      saves: getValueFor({
        typeIds: [FixturePlayerStatisticTypeId.SAVES],
        keys: ['SAVES', 'saves'],
      }),
      goals_conceded: getValueFor({
        typeIds: [FixturePlayerStatisticTypeId.GOALS_CONCEDED],
        keys: ['GOALS_CONCEDED', 'goals-conceded', 'conceded-goals'],
      }),
      own_goals: getValueFor({
        keys: ['OWN_GOALS', 'own-goals'],
      }),
      penalties_scored: getValueFor({
        keys: ['PENALTIES_SCORED', 'penalties-scored', 'penalty-goals'],
      }),
      penalties_missed: getValueFor({
        keys: ['PENALTIES_MISSED', 'penalties-missed', 'missed-penalties'],
      }),
      free_kicks_scored: getValueFor({
        keys: ['FREE_KICKS_SCORED', 'free-kicks-scored'],
      }),
      rating: getValueFor({
        typeIds: [FixturePlayerStatisticTypeId.RATING],
        keys: ['RATING', 'rating'],
      }),
    };
  }
}
