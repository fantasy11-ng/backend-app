import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksResponse } from '../types/response.type';
import { SportmonksLeague } from '../types/leagues.type';

@Injectable()
export class SportmonksLeaguesService {
  constructor(private http: HttpService) {}

  async getLeagues(options?: { live?: boolean }) {
    const { live } = options;
    const path = live ? '/football/leagues/live' : '/football/leagues';
    let leagues: Array<SportmonksLeague> = [];
    let hasMore = true;

    while (hasMore) {
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<SportmonksLeague[]>>(path, {
          params: {
            per_page: 50,
            include: 'currentSeason',
          },
        }),
      );

      leagues = leagues.concat(data.data);
      hasMore = data.data.length < 1 ? false : data.pagination.has_more;
    }

    return leagues;
  }

  async getLeagueById({
    leagueId,
    includes,
  }: {
    leagueId: number;
    includes?: ('currentSeason' | 'currentSeason.fixtures')[];
  }) {
    const params = {};
    if (includes) {
      params['include'] = includes.join(';');
    }

    try {
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<SportmonksLeague>>(
          `/football/leagues/${leagueId}`,
          {
            params,
          },
        ),
      );

      return data.data;
    } catch (e) {
      throw new BadGatewayException(e);
    }
  }
}
