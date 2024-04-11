import { Injectable } from '@nestjs/common';
//import * as playerRatings from '../../../../assets/cleaned.json';
import { DEFAULT_PLAYER_RATING } from '../constants/players.constants';

@Injectable()
export class FootballService {
  positionIdToPosition(positionId: number) {
    switch (positionId) {
      case 24:
        return {
          id: 24,
          name: 'Goalkeeper',
          code: 'goalkeeper',
          developer_name: 'GOALKEEPER',
        };
      case 25:
        return {
          id: 25,
          name: 'Defender',
          code: 'defender',
          developer_name: 'DEFENDER',
        };
      case 26:
        return {
          id: 26,
          name: 'Midfielder',
          code: 'midfielder',
          developer_name: 'MIDFIELDER',
        };
      case 27:
        return {
          id: 27,
          name: 'Attacker',
          code: 'attacker',
          developer_name: 'ATTACKER',
        };
      case 221:
        return {
          id: 221,
          name: 'Coach',
          code: 'coach',
          developer_name: 'COACH',
        };
    }
  }

  getRating = (playerName: string) => DEFAULT_PLAYER_RATING;

  getPlayerPool(playerName: string) {
    const rating = this.getRating(playerName);
    if (rating >= 90) return 'A';
    else if (rating >= 80) return 'B';
    else if (rating >= 65) return 'C';
    else if (rating >= 50) return 'D';
    else return 'E';
  }
}
