import { ApiProperty } from '@nestjs/swagger';
import { FantasyTeam } from '../entities/fantasy-team.entity';
import { FantasySquad } from '../entities/fantasy-squad.entity';
import { FantasyTeamRanking } from '../entities/fantasy-team-ranking.entity';
import { FantasyBoost } from '../entities/fantasy-boost.entity';
import { FantasyTransfer } from '../entities/fantasy-transfer.entity';
import { FantasyTeamEvent } from '../entities/fantasy-team-event.entity';
import { FantasyBoostType } from '../fantasy.types';
import { Fixture } from '@/modules/stages/entities/fixture.entity';
import { FantasyGameweek } from '../entities/fantasy-gameweek.entity';
import { Player } from '@/modules/players/entities/player.entity';
import { FootballTeam } from '@/modules/team/entities/football-team.entity';

export class CreateTeamResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  teamId: string;
}

export class SimpleMessageResponseDto {
  @ApiProperty()
  message: string;
}

export class ApplyBoostResponseDto extends SimpleMessageResponseDto {
  @ApiProperty({ enum: FantasyBoostType })
  type: FantasyBoostType;

  @ApiProperty()
  gameweekId: number;
}

export enum FantasyBoostState {
  AVAILABLE = 'AVAILABLE',
  USED = 'USED',
  ACTIVE = 'ACTIVE',
  UNAVAILABLE = 'UNAVAILABLE',
}

export class FantasyBoostStatusDto {
  @ApiProperty({ enum: FantasyBoostType })
  type: FantasyBoostType;

  @ApiProperty({ enum: FantasyBoostState })
  state: FantasyBoostState;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isUsed: boolean;

  @ApiProperty()
  isAvailable: boolean;

  @ApiProperty({ nullable: true })
  activeGameweekId: number | null;

  @ApiProperty()
  usedInGroup: boolean;

  @ApiProperty()
  usedInKnockout: boolean;
}

export class GetBoostsResponseDto {
  @ApiProperty({ enum: FantasyBoostType, isArray: true })
  availableBoosts: FantasyBoostType[];

  @ApiProperty({ type: FantasyBoost, isArray: true })
  boosts: FantasyBoost[];

  @ApiProperty({ type: FantasyGameweek, nullable: true })
  nextGameweek: FantasyGameweek | null;

  @ApiProperty({ type: FantasyBoostStatusDto, isArray: true })
  boostStatuses: FantasyBoostStatusDto[];
}

export class MyTeamResponseDto {
  @ApiProperty({ type: FantasyTeam })
  team: FantasyTeam;

  @ApiProperty({ type: FantasySquad, nullable: true })
  currentSquad?: FantasySquad | null;
}

export class FantasyRankingListResponseDto {
  @ApiProperty({ type: FantasyTeamRanking, isArray: true })
  data: FantasyTeamRanking[];

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
      budgetRemaining: { type: 'number' },
    },
  })
  me: {
    teamId: string;
    rank: number | null;
    totalPoints: number;
    budgetRemaining: number;
  } | null;
}


export class UpcomingFixtureDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ type: 'string', format: 'date-time' })
  startingAt: Date;

  @ApiProperty()
  stageId: number;

  @ApiProperty({ nullable: true })
  gameweekId?: number | null;

  @ApiProperty({ type: FootballTeam, isArray: true })
  participants: FootballTeam[];
}

class CaptainViceCaptainDto {
  @ApiProperty()
  squadPlayerId: string;

  @ApiProperty({ type: Player })
  player: Player;

  @ApiProperty()
  points: number;
}

export class FixturePerformanceItemDto {
  @ApiProperty()
  fixtureId: number;

  @ApiProperty({ nullable: true })
  gameweekId?: number | null;

  @ApiProperty({ type: Fixture })
  fixture: Fixture;

  @ApiProperty({ type: FantasyGameweek, nullable: true })
  gameweek?: FantasyGameweek | null;

  @ApiProperty()
  totalPoints: number;

  @ApiProperty()
  cumulativePoints: number;

  @ApiProperty({ type: FantasyTeamRanking, nullable: true })
  ranking?: FantasyTeamRanking | null;

  @ApiProperty({ type: CaptainViceCaptainDto, nullable: true })
  captain?: CaptainViceCaptainDto | null;

  @ApiProperty({ type: CaptainViceCaptainDto, nullable: true })
  viceCaptain?: CaptainViceCaptainDto | null;

  @ApiProperty({ type: FantasyTransfer, isArray: true })
  transfers: FantasyTransfer[];
}

export class TeamHistoryResponseDto {
  @ApiProperty({ type: FantasyTeamEvent, isArray: true })
  events: FantasyTeamEvent[];
}
