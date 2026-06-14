import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksCountry } from '../types/countries.type';
import { SportmonksResponse } from '../types/response.type';

@Injectable()
export class SportmonksCoreService {
  constructor(private http: HttpService) {}

  async getCountries() {
    const all: SportmonksCountry[] = [];
    let page = 1;
    let hasMore = true;
    const perPage = 200;

    while (hasMore) {
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<SportmonksCountry[]>>(
          '/core/countries',
          {
            params: { per_page: perPage, page },
          },
        ),
      );

      if (data?.data?.length) {
        all.push(...data.data);
      }

      hasMore = Boolean(data.pagination?.has_more);
      page += 1;
    }

    return all;
  }
}
