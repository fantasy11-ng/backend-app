import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksResponse } from './types/response.type';

@Injectable()
export class SportmonksService {
  constructor(private httpService: HttpService) {}

  async getPlayerById(playerId) {
    const response = await firstValueFrom(
      this.httpService.get(`/football/players/${playerId}`),
    );
    return response.data;
  }

  async getPlayers({
    page,
    limit,
  }: {
    page: number;
    limit: number;
  }): Promise<SportmonksResponse> {
    const { data } = await firstValueFrom(
      this.httpService.get<SportmonksResponse>(`/football/players`, {
        params: {
          per_page: limit,
          page,
        },
      }),
    );
    return data;
  }

  async syncPlayers() {
    const playersPerPage = 50;
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const players = await this.getPlayers({
        page: currentPage,
        limit: playersPerPage,
      });

      hasMorePages = players.pagination.has_more;
      currentPage = players.pagination.next_page;
    }
  }
}
