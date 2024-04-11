import { SportmonksTeamPlayer } from './players.types';

export type SportmonksTeam = {
  id: number;
  sport_id: number;
  country_id: number;
  venue_id: number;
  gender: string;
  name: string;
  short_code: string;
  image_path: string;
  founded: number;
  type: string;
  placeholder: boolean;
  last_played_at: string;
  players?: SportmonksTeamPlayer[];
};
