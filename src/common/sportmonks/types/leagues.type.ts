import { SportmonksSeason } from './seasons.type';

export type SportmonksLeague = {
  id: number;
  sport_id: number;
  country_id: number;
  name: string;
  active: boolean;
  short_code: string;
  image_path: string;
  type: string;
  sub_type: string;
  last_played_at: string;
  category: number;
  has_jerseys: boolean;
  currentseason?: SportmonksSeason;
};
