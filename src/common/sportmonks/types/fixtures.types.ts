export enum fixturesIncludes {
  sport = 'sport',
  round = 'round',
  stage = 'stage',
  group = 'group',
  aggregate = 'aggregate',
  league = 'league',
  seasoncoaches = 'seasoncoaches',
  tvStations = 'tvStations',
  venue = 'venue',
  state = 'state',
  weatherReport = 'weatherReport',
  lineups = 'lineups',
  events = 'events',
  timeline = 'timeline',
  comments = 'comments',
  trends = 'trends',
  statistics = 'statistics',
  periods = 'periods',
  participants = 'participants',
  oddspremiumOdds = 'oddspremiumOdds',
  inplayOdds = 'inplayOdds',
  prematchNews = 'prematchNews',
  metadata = 'metadata',
  sidelinedpredictions = 'sidelinedpredictions',
  referees = 'referees',
  formations = 'formations',
  ballCoordinates = 'ballCoordinates',
  scores = 'scores',
}

export type FixtureInclude = keyof typeof fixturesIncludes;

export type SportmonksFixture = {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  group_id?: number;
  aggregate_id?: number;
  round_id: number;
  state_id: number;
  venue_id: number;
  name: string;
  starting_at: string;
  result_info: string;
  leg: string;
  details: string;
  length: number;
  placeholder: boolean;
  has_odds: boolean;
  starting_at_timestamp: number;
  participants?: {
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
    meta: {
      location: string;
      winner: boolean;
      position: number;
    };
  }[];
  scores?: SportmonksFixtureScore[];
  state?: SportmonksFixtureState;
};

export type SportmonksFixtureScore = {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id: number;
  score: {
    goals: number;
    participant: 'home' | 'away' | string;
  };
  // e.g. "CURRENT", "1ST_HALF", "2ND_HALF", "2ND_HALF_ONLY"
  description: string;
};

export type SportmonksFixtureState = {
  id: number;
  state: string; // machine code, e.g. "FT", "NS", "LIVE"
  name: string; // human readable, e.g. "Full Time"
  short_name: string;
  developer_name: string;
};
