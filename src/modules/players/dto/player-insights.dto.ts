import { ApiProperty } from '@nestjs/swagger';

export class PlayerPositionDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  developer_name: string;
}

export class PlayerSummaryDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  commonName: string;

  @ApiProperty()
  image: string;

  @ApiProperty()
  pool: string;

  @ApiProperty()
  positionId: number;

  @ApiProperty({ type: PlayerPositionDto })
  position: PlayerPositionDto;

  @ApiProperty()
  countryId: number;

  @ApiProperty({ nullable: true })
  externalId: number | null;

  @ApiProperty()
  rating: number;

  @ApiProperty()
  price: number;
}

export class PlayerSeasonStatsDto {
  @ApiProperty()
  points: number;

  @ApiProperty()
  goals: number;

  @ApiProperty()
  assists: number;

  @ApiProperty()
  yellowCards: number;

  @ApiProperty()
  redCards: number;

  @ApiProperty({
    description: 'Season clean sheets (counted for GK/DEF only).',
  })
  cleanSheets: number;

  @ApiProperty({
    nullable: true,
    description:
      'Full-season minutes played when explicitly available from stored season stats.',
  })
  minutesPlayed: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'Full-season appearance count when explicitly available from stored season stats.',
  })
  appearances: number | null;

  @ApiProperty({ nullable: true })
  lineups: number | null;

  @ApiProperty({ nullable: true })
  starts: number | null;

  @ApiProperty({ nullable: true })
  bench: number | null;

  @ApiProperty({ nullable: true })
  shotsOnTarget: number | null;

  @ApiProperty({ nullable: true })
  keyPasses: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'Fantasy points the player accumulated in the most recent gameweek with played fixtures.',
  })
  currentGameweekPoints: number | null;
}

export class PlayerInsightMetricsDto {
  @ApiProperty({
    nullable: true,
    description: 'Percentage of current fantasy squads that selected this player.',
  })
  ownership: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Raw count of current fantasy squads that selected this player.',
  })
  selectedTeams: number | null;

  @ApiProperty({ nullable: true })
  priceChange: number | null;

  @ApiProperty({ nullable: true })
  form: number | null;

  @ApiProperty({ nullable: true })
  performanceIndex: number | null;
}

export class PlayerRecentFixtureStatsDto {
  @ApiProperty()
  fixtureId: number;

  @ApiProperty()
  minutesPlayed: number;

  @ApiProperty()
  goals: number;

  @ApiProperty()
  assists: number;

  @ApiProperty()
  yellowCards: number;

  @ApiProperty()
  redCards: number;

  @ApiProperty()
  fantasyPoints: number;
}

export class PlayerGameweekPointsDto {
  @ApiProperty()
  gameweekId: number;

  @ApiProperty({ nullable: true })
  gameweekCode: string | null;

  @ApiProperty()
  points: number;
}

export class PlayerDetailDto {
  @ApiProperty({ type: PlayerSummaryDto })
  player: PlayerSummaryDto;

  @ApiProperty({ type: PlayerSeasonStatsDto })
  season: PlayerSeasonStatsDto;

  @ApiProperty({ type: PlayerInsightMetricsDto })
  insights: PlayerInsightMetricsDto;

  @ApiProperty({
    type: PlayerRecentFixtureStatsDto,
    isArray: true,
    description:
      'Recent per-fixture stat snapshots only. These rows are not season aggregates.',
  })
  recentFixtures: PlayerRecentFixtureStatsDto[];

  @ApiProperty({
    type: PlayerGameweekPointsDto,
    isArray: true,
    description:
      'Fantasy points per gameweek (only gameweeks with played fixtures), ordered chronologically.',
  })
  gameweekPoints: PlayerGameweekPointsDto[];
}

export class PlayerCompareItemDto {
  @ApiProperty({ type: PlayerSummaryDto })
  player: PlayerSummaryDto;

  @ApiProperty({ type: PlayerSeasonStatsDto })
  season: PlayerSeasonStatsDto;

  @ApiProperty({ type: PlayerInsightMetricsDto })
  insights: PlayerInsightMetricsDto;
}

export class MultiPlayerCompareDto {
  @ApiProperty({ type: PlayerCompareItemDto, isArray: true })
  players: PlayerCompareItemDto[];
}
