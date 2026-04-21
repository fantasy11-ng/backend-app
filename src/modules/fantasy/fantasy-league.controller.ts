import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { User } from '@/modules/users/entities/user.entity';
import { SchemaValidator } from '@/common/validators/schema.validator';
import { FantasyLeagueService } from './fantasy-league.service';
import {
  CreateFantasyLeagueDto,
  JoinLeagueByCodeDto,
  createFantasyLeagueSchema,
  joinLeagueByCodeSchema,
  CreateFantasyLeagueResponseDto,
  MyFantasyLeaguesResponseDto,
  FantasyLeagueLeaderboardResponseDto,
  LeagueInsightsResponseDto,
} from './dto';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Fantasy - Leagues')
@Controller('fantasy/leagues')
@UseGuards(JwtAuthGuard)
export class FantasyLeagueController {
  constructor(private readonly leaguesService: FantasyLeagueService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a fantasy league',
    description:
      'Creates a user league for the authenticated user. The league can be public or private (private by default). The creator is automatically added as a member.',
  })
  @ApiOkResponse({
    description: 'League created successfully',
    type: CreateFantasyLeagueResponseDto,
  })
  @ApiBody({ type: CreateFantasyLeagueDto })
  async createLeague(
    @Req() req: Request,
    @Body(new SchemaValidator(createFantasyLeagueSchema))
    dto: CreateFantasyLeagueDto,
  ) {
    return this.leaguesService.createLeague(req.user as User, dto);
  }

  @Post(':leagueId/join')
  @ApiOperation({
    summary: 'Join a public fantasy league by ID',
    description:
      'Joins a public league using its ID. Private leagues must be joined using an invite code.',
  })
  @ApiParam({
    name: 'leagueId',
    type: String,
    description: 'ID of the league to join',
  })
  @ApiOkResponse({
    description: 'Joined league successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  async joinLeagueById(
    @Req() req: Request,
    @Param('leagueId') leagueId: string,
  ) {
    return this.leaguesService.joinLeagueById(req.user as User, leagueId);
  }

  @Post('join/code')
  @ApiOperation({
    summary: 'Join a private fantasy league by invite code',
    description:
      'Joins a private league using the 10-character invite code shared by the league creator.',
  })
  @ApiOkResponse({
    description: 'Joined league successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiBody({ type: JoinLeagueByCodeDto })
  async joinLeagueByCode(
    @Req() req: Request,
    @Body(new SchemaValidator(joinLeagueByCodeSchema))
    dto: JoinLeagueByCodeDto,
  ) {
    return this.leaguesService.joinLeagueByInviteCode(
      req.user as User,
      dto.inviteCode,
    );
  }

  @Post(':leagueId/leave')
  @ApiOperation({
    summary: 'Leave a fantasy league',
    description:
      'Removes the authenticated user’s fantasy team from the specified league.',
  })
  @ApiParam({
    name: 'leagueId',
    type: String,
    description: 'ID of the league to leave',
  })
  @ApiOkResponse({
    description: 'Left league successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  async leaveLeague(@Req() req: Request, @Param('leagueId') leagueId: string) {
    return this.leaguesService.leaveLeague(req.user as User, leagueId);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get leagues I am a member of',
    description:
      'Returns all leagues that the authenticated user’s fantasy team is part of, including participant counts.',
  })
  @ApiOkResponse({
    description: 'List of leagues for the current user',
    type: MyFantasyLeaguesResponseDto,
  })
  async getMyLeagues(@Req() req: Request) {
    return this.leaguesService.getMyLeagues(req.user as User);
  }

  @Get(':leagueId/insights')
  @ApiOperation({
    summary: 'Get league insights',
    description:
      'Returns top 5 league table rows (with position change) plus league-scoped top-player widgets (most selected, most captained, most transferred, best performing).',
  })
  @ApiParam({
    name: 'leagueId',
    type: String,
    description: 'ID of the league',
  })
  @ApiOkResponse({
    description: 'League insights payload',
    type: LeagueInsightsResponseDto,
  })
  async getLeagueInsights(
    @Req() req: Request,
    @Param('leagueId') leagueId: string,
  ) {
    return this.leaguesService.getLeagueInsights(req.user as User, leagueId);
  }

  @Get(':leagueId/leaderboard/season')
  @ApiOperation({
    summary: 'Get season leaderboard for a league',
    description:
      'Returns season-long rankings for teams in the specified league. Points are based on the same fantasy scoring as the global season leaderboard.',
  })
  @ApiParam({
    name: 'leagueId',
    type: String,
    description: 'ID of the league',
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
    description: 'League season leaderboard with pagination metadata',
    type: FantasyLeagueLeaderboardResponseDto,
  })
  async getLeagueSeasonLeaderboard(
    @Req() req: Request,
    @Param('leagueId') leagueId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) || 1 : 1;
    const parsedLimit = limit ? parseInt(limit, 10) || 50 : 50;

    return this.leaguesService.getLeagueSeasonLeaderboard(
      req.user as User,
      leagueId,
      parsedPage,
      parsedLimit,
    );
  }
}
