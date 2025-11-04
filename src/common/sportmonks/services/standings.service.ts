import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksResponse } from '../types/response.type';

@Injectable()
export class SportmonksStandingsService {
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
}
