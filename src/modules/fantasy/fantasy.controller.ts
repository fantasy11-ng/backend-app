import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { User } from '@/modules/users/entities/user.entity';
import { SchemaValidator } from '@/common/validators/schema.validator';
import {
  CreateFantasyTeamDto,
  CreateFantasySquadDto,
  ApplyBoostDto,
  UpdateLineupDto,
  UpdateRolesDto,
  TransferRequestDto,
  createFantasyTeamSchema,
  createFantasySquadSchema,
  updateLineupSchema,
  updateRolesSchema,
  transferRequestSchema,
  applyBoostSchema,
} from './dto';
import {
  CreateTeamResponseDto,
  FantasyRankingListResponseDto,
  MyTeamResponseDto,
  SimpleMessageResponseDto,
  ApplyBoostResponseDto,
  UpcomingFixtureDto,
  FixturePerformanceItemDto,
  TeamHistoryResponseDto,
} from './dto/fantasy-response.dto';
import { FantasyService } from './fantasy.service';
import { FantasyScoringService } from './fantasy-scoring.service';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/guards/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FantasyBoost } from './entities/fantasy-boost.entity';
import { FantasyTransfer } from './entities/fantasy-transfer.entity';

@ApiTags('Fantasy')
@Controller('fantasy')
@UseGuards(JwtAuthGuard)
export class FantasyController {
  constructor(
    private readonly fantasyService: FantasyService,
    private readonly scoringService: FantasyScoringService,
  ) {}

  @Post('team')
  @ApiOperation({
    summary: 'Create a fantasy team',
    description:
      'Creates a fantasy team for the authenticated user with initial budget and metadata. Squad is created separately.',
  })
  @ApiOkResponse({
    description: 'Team created successfully',
    type: CreateTeamResponseDto,
  })
  @ApiBody({ type: CreateFantasyTeamDto })
  async createTeam(
    @Req() req: Request,
    @Body(new SchemaValidator(createFantasyTeamSchema))
    dto: CreateFantasyTeamDto,
  ) {
    return this.fantasyService.createTeam(req.user as User, dto);
  }

  @Post('team/squad')
  @ApiOperation({
    summary: 'Create initial fantasy squad',
    description:
      'Creates the initial 15-player squad and starting XI for the authenticated user’s fantasy team.',
  })
  @ApiOkResponse({
    description: 'Squad created successfully',
    type: SimpleMessageResponseDto,
  })
  @ApiBody({ type: CreateFantasySquadDto })
  async createSquad(
    @Req() req: Request,
    @Body(new SchemaValidator(createFantasySquadSchema))
    dto: CreateFantasySquadDto,
  ) {
    return this.fantasyService.createSquad(req.user as User, dto);
  }

  @Get('team/me')
  @ApiOperation({
    summary: 'Get my fantasy team and current squad',
  })
  @ApiOkResponse({
    description:
      'Returns the team and current squad for the authenticated user.',
    type: MyTeamResponseDto,
  })
  async getMyTeam(@Req() req: Request) {
    return this.fantasyService.getMyTeam(req.user as User);
  }

  @Post('team/lineup')
  @ApiOperation({
    summary: 'Update lineup',
    description:
      'Updates starting XI and bench for the current squad, creating a new squad snapshot.',
  })
  @ApiOkResponse({
    description: 'Lineup updated successfully',
    type: SimpleMessageResponseDto,
  })
  @ApiBody({ type: UpdateLineupDto })
  async updateLineup(
    @Req() req: Request,
    @Body(new SchemaValidator(updateLineupSchema))
    dto: UpdateLineupDto,
  ) {
    return this.fantasyService.updateLineup(req.user as User, dto);
  }

  @Post('team/roles')
  @ApiOperation({
    summary: 'Update squad roles',
    description:
      'Updates captain, vice-captain, penalty taker and free-kick taker for the current squad.',
  })
  @ApiOkResponse({
    description: 'Roles updated successfully',
    type: SimpleMessageResponseDto,
  })
  @ApiBody({ type: UpdateRolesDto })
  async updateRoles(
    @Req() req: Request,
    @Body(new SchemaValidator(updateRolesSchema))
    dto: UpdateRolesDto,
  ) {
    return this.fantasyService.updateRoles(req.user as User, dto);
  }

  @Post('team/transfers')
  @ApiOperation({
    summary: 'Make transfers',
    description:
      'Performs one or more transfers for the current squad and adjusts remaining budget.',
  })
  @ApiOkResponse({
    description: 'Transfers completed successfully',
    type: SimpleMessageResponseDto,
  })
  @ApiBody({ type: TransferRequestDto })
  async makeTransfers(
    @Req() req: Request,
    @Body(new SchemaValidator(transferRequestSchema))
    dto: TransferRequestDto,
  ) {
    return this.fantasyService.makeTransfers(req.user as User, dto);
  }

  @Post('team/boost')
  @ApiOperation({
    summary: 'Apply a boost for a gameweek',
    description:
      'Applies one of the available boosts (MAX_CAPTAIN, TRIPLE_CAPTAIN, SAVES_BOOST) for a specific gameweek. Only one boost per team per gameweek is allowed.',
  })
  @ApiOkResponse({
    description: 'Boost applied successfully',
    type: ApplyBoostResponseDto,
  })
  @ApiBody({ type: ApplyBoostDto })
  async applyBoost(
    @Req() req: Request,
    @Body(new SchemaValidator(applyBoostSchema))
    dto: ApplyBoostDto,
  ) {
    return this.fantasyService.applyBoost(req.user as User, dto);
  }

  @Get('team/boosts')
  @ApiOperation({
    summary: 'Get boosts for my team',
    description:
      'Returns all boosts applied by the authenticated user, ordered by creation date (most recent first).',
  })
  @ApiOkResponse({
    description: 'List of boosts applied by the user',
    type: [FantasyBoost],
  })
  async getBoosts(@Req() req: Request) {
    return this.fantasyService.getBoosts(req.user as User);
  }

  @Get('fixtures/upcoming')
  @ApiOperation({
    summary: 'Get upcoming fixtures',
    description:
      'Returns upcoming fixtures in the main competition with team information for participants.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of fixtures to return (default: 10)',
    example: 10,
  })
  @ApiOkResponse({
    description: 'List of upcoming fixtures',
    type: [UpcomingFixtureDto],
  })
  async getUpcomingFixtures(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) || 10 : 10;
    return this.fantasyService.getUpcomingFixtures(parsedLimit);
  }

  @Get('team/transfers')
  @ApiOperation({
    summary: 'Get transfer history',
    description:
      "Returns all transfers made by the authenticated user's fantasy team, ordered by creation date (most recent first). Includes player details for both incoming and outgoing transfers.",
  })
  @ApiOkResponse({
    description: 'Transfer history list',
    type: [FantasyTransfer],
  })
  async getTransferHistory(@Req() req: Request) {
    return this.fantasyService.getTransferHistory(req.user as User);
  }

  @Get('team/fixtures/performance')
  @ApiOperation({
    summary: 'Get fixture performance and cumulative points',
    description:
      "Returns fixtures played by the user's team with points, rankings, transfers, captain and vice-captain info, and cumulative points. Results are ordered chronologically by fixture start time.",
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of fixtures to return (default: 5)',
    example: 5,
  })
  @ApiOkResponse({
    description: 'Fixture performance list with cumulative points',
    type: [FixturePerformanceItemDto],
  })
  async getFixturePerformance(
    @Req() req: Request,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) || 5 : 5;
    return this.fantasyService.getFixturePerformance(
      req.user as User,
      parsedLimit,
    );
  }

  @Get('team/history')
  @ApiOperation({
    summary: 'Get team history',
    description:
      "Returns the event history (transfers, role changes, lineup changes, formation changes) for the user's team, ordered by creation date (most recent first).",
  })
  @ApiOkResponse({
    description: 'Team history events',
    type: TeamHistoryResponseDto,
  })
  async getHistory(@Req() req: Request) {
    return this.fantasyService.getHistory(req.user as User);
  }

  @Get('leaderboard/season')
  @ApiOperation({
    summary: 'Get season leaderboard',
    description:
      "Returns precomputed season-long fantasy rankings for all teams. Results are paginated and ordered by total points (highest first). Includes the authenticated user's position in the leaderboard.",
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 50)',
    example: 50,
  })
  @ApiOkResponse({
    description: 'Season leaderboard with pagination metadata',
    type: FantasyRankingListResponseDto,
  })
  async getSeasonLeaderboard(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) || 1 : 1;
    const parsedLimit = limit ? parseInt(limit, 10) || 50 : 50;
    return this.fantasyService.getSeasonLeaderboard(
      req.user as User,
      parsedPage,
      parsedLimit,
    );
  }

  @Get('leaderboard/:fixtureId')
  @ApiOperation({
    summary: 'Get fixture leaderboard',
    description:
      "Returns fantasy team rankings for a specific fixture. Results are paginated and ordered by rank (best first). Includes the authenticated user's position in the leaderboard.",
  })
  @ApiParam({
    name: 'fixtureId',
    type: Number,
    description: 'The ID of the fixture',
    example: 12345,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 50)',
    example: 50,
  })
  @ApiOkResponse({
    description: 'Fixture leaderboard with pagination metadata',
    type: FantasyRankingListResponseDto,
  })
  async getLeaderboard(
    @Req() req: Request,
    @Param('fixtureId', ParseIntPipe) fixtureId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) || 1 : 1;
    const parsedLimit = limit ? parseInt(limit, 10) || 50 : 50;
    return this.fantasyService.getLeaderboard(
      fixtureId,
      req.user as User,
      parsedPage,
      parsedLimit,
    );
  }

  @Get('leaderboard/gameweek/:gameweekId')
  @ApiOperation({
    summary: 'Get gameweek leaderboard',
    description:
      "Returns fantasy team rankings for a specific gameweek. Results are paginated and ordered by total points (highest first). Includes the authenticated user's position in the leaderboard.",
  })
  @ApiParam({
    name: 'gameweekId',
    type: Number,
    description: 'The ID of the gameweek',
    example: 1,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 50)',
    example: 50,
  })
  @ApiOkResponse({
    description: 'Gameweek leaderboard with pagination metadata',
    type: FantasyRankingListResponseDto,
  })
  async getGameweekLeaderboard(
    @Req() req: Request,
    @Param('gameweekId', ParseIntPipe) gameweekId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) || 1 : 1;
    const parsedLimit = limit ? parseInt(limit, 10) || 50 : 50;
    return this.fantasyService.getGameweekLeaderboard(
      gameweekId,
      req.user as User,
      parsedPage,
      parsedLimit,
    );
  }

  @Post('scoring/fixture/:fixtureId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Recompute scoring for a fixture',
    description:
      'Admin only. Recomputes all fantasy points, fixture rankings, gameweek rankings and season rankings for a fixture. This operation recalculates points based on match statistics and updates all related leaderboards.',
  })
  @ApiParam({
    name: 'fixtureId',
    type: Number,
    description: 'The ID of the fixture to recompute scoring for',
    example: 12345,
  })
  @ApiOkResponse({
    description: 'Scoring recomputed successfully',
    type: SimpleMessageResponseDto,
  })
  async recomputeFixture(@Param('fixtureId', ParseIntPipe) fixtureId: number) {
    await this.scoringService.computeForFixture(fixtureId);
    return { message: 'Scoring recomputed' };
  }
}
