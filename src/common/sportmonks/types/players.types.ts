export type SportmonksPlayer = {
  id: number;
  sport_id: number;
  country_id: number;
  nationality_id: number;
  city_id: number;
  position_id: number;
  detailed_position_id: null;
  type_id: number;
  common_name: string;
  firstname: string;
  lastname: string;
  name: string;
  display_name: string;
  image_path: string;
  height: number;
  weight: number;
  date_of_birth: string;
  gender: string;
  position?: {
    id: number;
    name: string;
    code: string;
    developer_name: string;
    model_type: string;
  };
};

export type SportmonksTeamPlayer = {
  id: number;
  transfer_id: number;
  player_id: number;
  team_id: number;
  position_id: number;
  detailed_position_id: number;
  start: string;
  end: string;
  captain: boolean;
  jersey_number: number;
  position?: {
    id: number;
    name: string;
    code: string;
    developer_name: string;
    model_type: string;
  };
  player?: SportmonksPlayer;
};
