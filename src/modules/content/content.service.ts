import { Injectable } from '@nestjs/common';
import { SportmonksLeaguesService } from 'src/common/sportmonks/services/leagues.service';

@Injectable()
export class ContentService {
  constructor(private sportmonksLeaguesService: SportmonksLeaguesService) {}
}
