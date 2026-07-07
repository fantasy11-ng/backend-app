import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { StagesService } from './stages.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/guards/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';
import { SchemaValidator } from '@/common/validators/schema.validator';
import {
  QueryFixturesDto,
  queryFixturesDtoSchema,
} from './dto/query-fixtures.dto';

@ApiTags('Stages')
@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Get()
  @ApiOperation({
    summary: 'List stages',
    description: 'Returns all stages for the active season.',
  })
  @ApiOkResponse({
    description: 'List of stages',
    schema: {
      example: [
        {
          id: 7001,
          name: 'Group Stage',
          code: 'group-stage',
          externalLeagueId: 271,
          externalSeasonId: 2045,
          finished: false,
          startingAt: '2025-06-01T00:00:00.000Z',
          endingAt: '2025-06-20T00:00:00.000Z',
        },
      ],
    },
  })
  async getAllStages() {
    return this.stagesService.getAll();
  }

  @Get('group')
  @ApiOperation({
    summary: 'List groups',
    description: 'Returns all groups with their teams for the active season.',
  })
  @ApiOkResponse({
    description: 'List of groups with teams',
    schema: {
      example: [
        {
          id: 1,
          name: 'Group A',
          teams: [
            { id: 100, name: 'Team A', short: 'A', logo: 'url' },
            { id: 101, name: 'Team B', short: 'B', logo: 'url' },
          ],
          externalStageId: 7001,
        },
      ],
    },
  })
  async getAllgroups() {
    return this.stagesService.getGroups();
  }

  @Get('group/:id')
  @ApiOperation({
    summary: 'Get group by id',
    description: 'Returns a single group by id with its teams.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({
    description: 'Group details with teams',
    schema: {
      example: {
        id: 1,
        name: 'Group A',
        teams: [
          { id: 100, name: 'Team A', short: 'A', logo: 'url' },
          { id: 101, name: 'Team B', short: 'B', logo: 'url' },
        ],
        externalStageId: 7001,
      },
    },
  })
  async getGroupById(@Param('id') id: number) {
    return this.stagesService.getGroup({ id });
  }

  @Get('fixtures')
  @ApiOperation({
    summary: 'List fixtures (played + upcoming)',
    description:
      'Public. Paginated list of all fixtures for the active season. ' +
      'Played fixtures include the result (scoreline + winner). Filter by ' +
      'status, round code (r32/r16/qf/sf/final/third-place/group-stage), ' +
      'stageId, gameweekId, groupId, teamId, and free-text name search.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'played', 'upcoming', 'live'],
    description: 'Defaults to "all".',
  })
  @ApiQuery({
    name: 'round',
    required: false,
    description: 'Round code: r32, r16, qf, sf, final, third-place, group-stage',
  })
  @ApiQuery({ name: 'stageId', required: false, type: Number })
  @ApiQuery({ name: 'gameweekId', required: false, type: Number })
  @ApiQuery({ name: 'groupId', required: false, type: Number })
  @ApiQuery({ name: 'seasonId', required: false, type: Number })
  @ApiQuery({ name: 'teamId', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['startingAt:ASC', 'startingAt:DESC'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({
    description: 'Paginated fixtures with teams and results',
    schema: {
      example: {
        data: [
          {
            id: 19609143,
            name: 'France vs Senegal',
            startingAt: '2026-06-16T19:00:00.000Z',
            status: 'played',
            stageId: 77478590,
            roundId: 395361,
            groupId: 253027,
            gameweekId: 12,
            participants: [
              {
                id: 18647,
                name: 'France',
                short: 'FRA',
                logo: 'https://cdn.sportmonks.com/images/soccer/teams/23/18647.png',
              },
              {
                id: 18558,
                name: 'Senegal',
                short: 'SEN',
                logo: 'https://cdn.sportmonks.com/images/soccer/teams/30/18558.png',
              },
            ],
            home: { id: 18647, name: 'France', short: 'FRA', logo: '...' },
            away: { id: 18558, name: 'Senegal', short: 'SEN', logo: '...' },
            result: {
              homeGoals: 3,
              awayGoals: 1,
              winnerTeamId: 18647,
              finished: true,
              info: 'France won after full-time.',
            },
          },
        ],
        meta: {
          total: 104,
          page: 1,
          limit: 20,
          totalPages: 6,
          seasonId: 26618,
        },
      },
    },
  })
  async getFixtures(
    @Query(new SchemaValidator(queryFixturesDtoSchema))
    query: QueryFixturesDto,
  ) {
    return this.stagesService.getFixtures(query);
  }

  @Get('sync')
  @ApiOperation({
    summary: 'Sync stages, groups, teams, fixtures',
    description:
      'Admin: triggers data sync from SportMonks for the active season.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({
    description: 'Sync result',
    schema: {
      example: 'Synced',
    },
  })
  async syncStagesAndGroups() {
    return this.stagesService.sync();
  }
}
