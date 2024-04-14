export type SportmonksGroup = {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  name: string;
  starting_at: string;
  ending_at: string;
  games_in_current_week: boolean;
  is_current: boolean;
  finished: boolean;
  pending: boolean;
};
