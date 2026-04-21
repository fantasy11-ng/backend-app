import { ApiProperty } from '@nestjs/swagger';
import { InsightWidgetCardDto } from './insights-response.dto';

export class LeagueInsightsTableRowDto {
  @ApiProperty()
  teamId: string;

  @ApiProperty()
  teamName: string;

  @ApiProperty()
  teamLogoUrl: string;

  @ApiProperty()
  rank: number;

  @ApiProperty({ nullable: true })
  previousRank: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'Positive means the team moved up (improved). Negative means moved down (worsened).',
  })
  positionChange: number | null;

  @ApiProperty()
  totalPoints: number;

  @ApiProperty({
    description:
      'Whether this row corresponds to the authenticated user’s fantasy team.',
  })
  isMe: boolean;
}

export class LeagueInsightsResponseDto {
  @ApiProperty({ type: LeagueInsightsTableRowDto, isArray: true })
  leaderboard: LeagueInsightsTableRowDto[];

  @ApiProperty({ type: LeagueInsightsTableRowDto, nullable: true })
  me: LeagueInsightsTableRowDto | null;

  @ApiProperty({ type: InsightWidgetCardDto })
  mostSelected: InsightWidgetCardDto;

  @ApiProperty({ type: InsightWidgetCardDto })
  mostCaptained: InsightWidgetCardDto;

  @ApiProperty({ type: InsightWidgetCardDto })
  mostTransferred: InsightWidgetCardDto;

  @ApiProperty({ type: InsightWidgetCardDto })
  bestPerforming: InsightWidgetCardDto;
}

