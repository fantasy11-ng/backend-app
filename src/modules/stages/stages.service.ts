import { BadGatewayException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { SportmonksService } from '@/common/sportmonks/sportmonks.service';
import { SportmonksStagesService } from '@/common/sportmonks/services/stages.service';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Group } from './entities/group.entity';
import { Stage } from './entities/stage.entity';
import { SportmonksStage } from '@/common/sportmonks/types/stages.type';
import { FootballTeam } from '../team/entities/football-team.entity';

@Injectable()
export class StagesService {
  constructor(
    private settingsService: SettingsService,
    private sportmonksService: SportmonksService,
    private sportmonksStagesService: SportmonksStagesService,
    @InjectDataSource() private db: DataSource,
  ) {}

  async sync() {
    const mainFootballLeague =
      await this.settingsService.getMainServiceLeague();
    const stages = await this.sportmonksStagesService.getSeasonStages(
      mainFootballLeague.currentSeason.serviceId,
    );

    if (!stages.data) {
      return 'There are currently no stages for this season';
    }

    await this.syncStages(stages.data);
    // Sync group and teams to reduce loops and imporove perf
    await this.syncGroupsAndTeams(stages.data);
  }

  async syncStages(stages: SportmonksStage[]) {
    const stagesRepo = this.db.getRepository(Stage);

    for (const stage of stages) {
      await stagesRepo.save({
        id: stage.id,
        externalLeagueId: stage.league_id,
        externalSeasonId: stage.season_id,
        name: stage.name,
        code: stage.type.code,
        startingAt: stage.starting_at,
        endingAt: stage.ending_at,
        finished: stage.finished,
      });
    }
  }

  async syncGroupsAndTeams(stages: SportmonksStage[]) {
    const groupsRepo = this.db.getRepository(Group);

    const serviceGroupStage = stages.find(
      (stage) => stage.type.code === 'group-stage',
    );
    if (!serviceGroupStage) {
      throw new BadGatewayException('Service Group Stage unavailable!');
    }

    const groupTeams: {
      [key: string]: {
        id: number;
        name: string;
        [key: number]: {
          id: number;
          name: string;
          short: string;
          logo: string;
        };
      };
    } = {};

    for (const fixture of serviceGroupStage.fixtures) {
      const group = serviceGroupStage.groups.find(
        (item) => item.id === fixture.group_id,
      );
      if (!group) {
        continue;
      }

      if (!groupTeams[group.name])
        groupTeams[group.name] = {
          id: group.id,
          name: group.name,
        };
      else {
        fixture.participants.map((participant) => {
          groupTeams[group.name][participant.id] = {
            id: participant.id,
            name: participant.name,
            short: participant.short_code,
            logo: participant.image_path,
          };
        });
      }
    }

    const groups = Object.values(groupTeams);
    groups.sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      else return 0;
    });

    for (const group of groups) {
      const { id, name, ...rest } = group;
      const teams = Object.values(rest);

      await groupsRepo.save({
        id,
        name,
        teams,
        externalStageId: serviceGroupStage.id,
      });

      await this.syncTeams(teams);
    }
  }

  async syncTeams(
    teams: {
      id: number;
      name: string;
      short: string;
      logo: string;
    }[],
  ) {
    const footballTeamRepo = this.db.getRepository(FootballTeam);
    for (const team of teams) {
      await footballTeamRepo.save(team);
    }
  }

  async getAll() {
    const groupsRepo = this.db.getRepository(Stage);
    return groupsRepo.find();
  }

  async getOne({ id }: { id: number }) {
    return this.db.getRepository(Stage).findOne({ where: { id } });
  }

  async getGroups() {
    const groupsRepo = this.db.getRepository(Group);
    return groupsRepo.find();
  }

  async getGroup({ id }: { id: number }) {
    return this.db.getRepository(Group).findOne({ where: { id } });
  }
}
