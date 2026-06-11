import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { SportmonksResponse } from '../types/response.type';

export type NationalTeamStandingStats = {
  countryId: number;
  played: number;
  wins: number;
  goals: number;
  conceded: number;
  goalDifference: number;
  draws: number;
  losses: number;
};

const STANDING_TYPE = {
  played: 129,
  wins: 130,
  draws: 131,
  losses: 132,
  goals: 133,
  conceded: 134,
  goalDifference: 179,
} as const;

const FINISHED_FIXTURE_STATE_ID = 5;

type StandingDetailRow = {
  type_id?: number;
  value?: number | string | null;
};

type StandingRow = {
  participant?: { country_id?: number };
  details?: StandingDetailRow[];
};

@Injectable()
export class SportmonksStandingsService {
  private readonly logger = new Logger(SportmonksStandingsService.name);

  constructor(private http: HttpService) {}

  async getSeasonStandings(seasonId: number) {
    try {
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<any>>(
          `/football/standings/seasons/${seasonId}`,
          {
            params: {
              include: 'standings.participant;groups',
              per_page: 50,
            },
          },
        ),
      );
      return data.data;
    } catch (e) {
      throw new BadGatewayException(e);
    }
  }

  async getNationalTeamStats(
    seasonId: number,
    leagueId?: number,
  ): Promise<NationalTeamStandingStats[]> {
    const fromStandings = await this.tryStandingsEndpoints(seasonId, leagueId);
    if (fromStandings.length > 0) return fromStandings;

    const fromFixtures = await this.tryFixturesAggregation(seasonId);
    if (fromFixtures.length > 0) return fromFixtures;

    return [];
  }

  /** @deprecated Use getNationalTeamStats */
  async getSeasonStandingsWithDetails(
    seasonId: number,
    leagueId?: number,
  ): Promise<any[]> {
    return this.fetchRawStandingsPayload(seasonId, leagueId);
  }

  private isNotFound(error: unknown): boolean {
    return (error as AxiosError)?.response?.status === 404;
  }

  private getDetailValue(
    details: StandingDetailRow[] | undefined,
    typeId: number,
  ): number {
    const entry = details?.find((d) => d.type_id === typeId);
    if (entry?.value === null || entry?.value === undefined || entry?.value === '') {
      return 0;
    }
    const num = Number(entry.value);
    return Number.isFinite(num) ? num : 0;
  }

  private collectStandingRows(payload: any[]): StandingRow[] {
    if (!Array.isArray(payload) || payload.length === 0) return [];

    const first = payload[0];
    if (
      first?.participant_id != null ||
      first?.participant != null ||
      (Array.isArray(first?.details) && first?.position != null)
    ) {
      return payload as StandingRow[];
    }

    const rows: StandingRow[] = [];
    for (const item of payload) {
      if (Array.isArray(item?.groups)) {
        for (const group of item.groups) {
          if (Array.isArray(group?.standings)) {
            rows.push(...group.standings);
          }
        }
      }
      if (Array.isArray(item?.standings)) {
        rows.push(...item.standings);
      }
    }
    return rows;
  }

  private mapStandingRows(rows: StandingRow[]): NationalTeamStandingStats[] {
    const byCountry = new Map<number, NationalTeamStandingStats>();

    for (const row of rows) {
      const countryId = Number(row.participant?.country_id ?? 0);
      if (!countryId) continue;

      const played = this.getDetailValue(row.details, STANDING_TYPE.played);
      const wins = this.getDetailValue(row.details, STANDING_TYPE.wins);
      const draws = this.getDetailValue(row.details, STANDING_TYPE.draws);
      const losses = this.getDetailValue(row.details, STANDING_TYPE.losses);
      const goals = this.getDetailValue(row.details, STANDING_TYPE.goals);
      const conceded = this.getDetailValue(row.details, STANDING_TYPE.conceded);
      let goalDifference = this.getDetailValue(
        row.details,
        STANDING_TYPE.goalDifference,
      );
      if (goalDifference === 0 && goals !== conceded) {
        goalDifference = goals - conceded;
      }

      const existing = byCountry.get(countryId);
      if (existing && existing.played >= played) continue;

      byCountry.set(countryId, {
        countryId,
        played,
        wins,
        goals,
        conceded,
        goalDifference,
        draws,
        losses,
      });
    }

    return Array.from(byCountry.values()).sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }
      return a.countryId - b.countryId;
    });
  }

  private async fetchRawStandingsPayload(
    seasonId: number,
    leagueId?: number,
  ): Promise<any[]> {
    const attempts: Array<{ url: string; params: Record<string, unknown> }> = [
      {
        url: `/football/standings/seasons/${seasonId}`,
        params: { include: 'participant;details.type;group', per_page: 50 },
      },
      ...(leagueId
        ? [
            {
              url: `/football/standings/live/leagues/${leagueId}`,
              params: { include: 'participant;details.type;group', per_page: 50 },
            },
          ]
        : []),
      {
        url: `/football/standings/seasons/${seasonId}`,
        params: {
          include: 'standings.participant;standings.details.type;groups',
          per_page: 50,
        },
      },
    ];

    for (const attempt of attempts) {
      try {
        const { data } = await firstValueFrom(
          this.http.get<SportmonksResponse<any[]>>(attempt.url, {
            params: attempt.params,
          }),
        );
        if (Array.isArray(data.data) && data.data.length > 0) {
          return data.data;
        }
      } catch (error) {
        if (this.isNotFound(error)) continue;
        throw new BadGatewayException('Failed to load team standings');
      }
    }

    return [];
  }

  private async tryStandingsEndpoints(
    seasonId: number,
    leagueId?: number,
  ): Promise<NationalTeamStandingStats[]> {
    const payload = await this.fetchRawStandingsPayload(seasonId, leagueId);
    if (!payload.length) return [];
    return this.mapStandingRows(this.collectStandingRows(payload));
  }

  private extractCurrentGoals(
    scores: Array<{
      participant_id?: number;
      description?: string;
      score?: { goals?: number };
    }> | undefined,
    participantId: number,
  ): number {
    if (!scores?.length) return 0;

    const current = scores.find(
      (s) =>
        s.participant_id === participantId &&
        (s.description === 'CURRENT' ||
          s.description?.toUpperCase() === 'CURRENT'),
    );
    const goals = current?.score?.goals;
    return Number.isFinite(Number(goals)) ? Number(goals) : 0;
  }

  private async tryFixturesAggregation(
    seasonId: number,
  ): Promise<NationalTeamStandingStats[]> {
    const byCountry = new Map<
      number,
      NationalTeamStandingStats & { _teamIds: Set<number> }
    >();

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      let fixtures: any[] = [];
      try {
        const { data } = await firstValueFrom(
          this.http.get<SportmonksResponse<any[]>>(
            `/football/fixtures/seasons/${seasonId}`,
            {
              params: {
                include: 'participants;scores',
                per_page: 50,
                page,
              },
            },
          ),
        );
        fixtures = data.data ?? [];
      } catch (error) {
        if (this.isNotFound(error)) return [];
        this.logger.warn(
          `Fixture aggregation failed on page ${page}: ${(error as Error).message}`,
        );
        return [];
      }

      for (const fixture of fixtures) {
        if (fixture?.state_id !== FINISHED_FIXTURE_STATE_ID) continue;

        const participants = fixture.participants ?? [];
        if (participants.length < 2) continue;

        const [home, away] = participants;
        const homeGoals = this.extractCurrentGoals(fixture.scores, home.id);
        const awayGoals = this.extractCurrentGoals(fixture.scores, away.id);

        for (const [team, goalsFor, goalsAgainst] of [
          [home, homeGoals, awayGoals],
          [away, awayGoals, homeGoals],
        ] as const) {
          const countryId = Number(team.country_id ?? 0);
          if (!countryId) continue;

          let entry = byCountry.get(countryId);
          if (!entry) {
            entry = {
              countryId,
              played: 0,
              wins: 0,
              goals: 0,
              conceded: 0,
              goalDifference: 0,
              draws: 0,
              losses: 0,
              _teamIds: new Set<number>(),
            };
            byCountry.set(countryId, entry);
          }

          entry.played += 1;
          entry.goals += goalsFor;
          entry.conceded += goalsAgainst;

          if (goalsFor > goalsAgainst) entry.wins += 1;
          else if (goalsFor === goalsAgainst) entry.draws += 1;
          else entry.losses += 1;
        }
      }

      hasMore = fixtures.length >= 50;
      page += 1;
      if (page > 20) break;
    }

    if (byCountry.size === 0) return [];

    return Array.from(byCountry.values())
      .map(({ _teamIds, ...stat }) => ({
        ...stat,
        goalDifference: stat.goals - stat.conceded,
      }))
      .sort((a, b) => {
        if (b.goals !== a.goals) return b.goals - a.goals;
        return b.goalDifference - a.goalDifference;
      });
  }
}
