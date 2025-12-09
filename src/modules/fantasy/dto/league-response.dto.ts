import { ApiProperty } from '@nestjs/swagger';
import { FantasyLeague } from '../entities/fantasy-league.entity';
import { FantasyTeam } from '../entities/fantasy-team.entity';

export class FantasyLeagueSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty({ nullable: true })
  inviteCode?: string | null;

  @ApiProperty()
  participantCount: number;

  @ApiProperty()
  maxParticipants: number;
}

export class CreateFantasyLeagueResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty({ type: FantasyLeagueSummaryDto })
  league: FantasyLeagueSummaryDto;
}

export class MyFantasyLeagueItemDto {
  @ApiProperty({ type: FantasyLeague })
  league: FantasyLeague;

  @ApiProperty()
  participantCount: number;

  @ApiProperty()
  maxParticipants: number;

  @ApiProperty({
    description: 'Whether the current user is the owner of the league',
  })
  isOwner: boolean;
}

export class MyFantasyLeaguesResponseDto {
  @ApiProperty({ type: MyFantasyLeagueItemDto, isArray: true })
  leagues: MyFantasyLeagueItemDto[];
}

export class FantasyLeagueLeaderboardItemDto {
  @ApiProperty({ type: FantasyTeam })
  team: FantasyTeam;

  @ApiProperty()
  totalPoints: number;

  @ApiProperty({
    description: 'Rank of the team within this league (1 = best)',
  })
  rank: number;
}

export class FantasyLeagueLeaderboardResponseDto {
  @ApiProperty({ type: FantasyLeagueLeaderboardItemDto, isArray: true })
  data: FantasyLeagueLeaderboardItemDto[];

  @ApiProperty({
    type: 'object',
    properties: {
      totalItems: { type: 'number' },
      itemCount: { type: 'number' },
      itemsPerPage: { type: 'number' },
      totalPages: { type: 'number' },
      currentPage: { type: 'number' },
    },
  })
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };

  @ApiProperty({
    type: 'object',
    nullable: true,
    properties: {
      teamId: { type: 'string' },
      rank: { type: 'number', nullable: true },
      totalPoints: { type: 'number' },
    },
  })
  me:
    | {
        teamId: string;
        rank: number | null;
        totalPoints: number;
      }
    | null;
}


