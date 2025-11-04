import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { StagesService } from './stages.service';

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

  @Get('sync')
  @ApiOperation({
    summary: 'Sync stages, groups, teams, fixtures',
    description:
      'Admin: triggers data sync from SportMonks for the active season.',
  })
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
