import { BadGatewayException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { SportmonksStagesService } from '@/common/sportmonks/services/stages.service';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Group } from './entities/group.entity';
import { Stage } from './entities/stage.entity';
import { SportmonksStage } from '@/common/sportmonks/types/stages.type';
import { FootballTeam } from '../team/entities/football-team.entity';
import { Fixture } from './entities/fixture.entity';
import { SportmonksRoundsService } from '@/common/sportmonks/services/rounds.service';
import { SportmonksRound } from '@/common/sportmonks/types/rounds.types';
import { FantasyGameweek } from '@/modules/fantasy/entities/fantasy-gameweek.entity';
import { FantasyGameweekPhase } from '@/modules/fantasy/fantasy.types';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';

@Injectable()
export class StagesService {
  constructor(
    private settingsService: SettingsService,
    private sportmonksStagesService: SportmonksStagesService,
    private sportmonksRoundsService: SportmonksRoundsService,
    private configService: ConfigService<MainConfig>,
    @InjectDataSource() private db: DataSource,
  ) {}

  async sync() {
    const mainFootballLeague =
      await this.settingsService.getMainServiceLeague();
    const seasonId = mainFootballLeague.currentSeason.serviceId;
    const stages = await this.sportmonksStagesService.getSeasonStages(seasonId);
    const rounds =
      await this.sportmonksRoundsService.getRoundsBySeasonId(seasonId);

    if (!stages.data) {
      return 'There are currently no stages for this season';
    }

    await this.syncStages(stages.data);
    // Sync group and teams to reduce loops and improve perf
    await this.syncGroupsAndTeams(stages.data);
    await this.syncFixtures(stages.data);
    await this.syncGameweeks(rounds, seasonId);
  }

  async syncStages(stages: SportmonksStage[]) {
    const stagesRepo = this.db.getRepository(Stage);

    for (const stage of stages) {
      // Derive a more specific internal code per stage instead of relying only on type.code.
      // Sportmonks uses "group-stage" for group phases and "knock-out" for all KO phases,
      // so we normalize by name to distinguish r16, qf, sf, final, third-place, etc.
      const nameLower = (stage.name || '').toLowerCase();
      let internalCode = stage.type.code; // default fallback

      if (stage.type.code === 'group-stage') {
        internalCode = 'group-stage';
      } else if (nameLower.includes('round of 16')) {
        internalCode = 'round-of-16';
      } else if (nameLower.includes('quarter') && nameLower.includes('final')) {
        internalCode = 'quarter-finals';
      } else if (nameLower.includes('semi') && nameLower.includes('final')) {
        internalCode = 'semi-finals';
      } else if (
        (nameLower.includes('3rd') || nameLower.includes('third')) &&
        nameLower.includes('place')
      ) {
        internalCode = 'third-place';
      } else if (nameLower.includes('final')) {
        // Plain "Final" without 3rd/semi/quarter wording
        internalCode = 'final';
      }

      await stagesRepo.save({
        id: stage.id,
        externalLeagueId: stage.league_id,
        externalSeasonId: stage.season_id,
        name: stage.name,
        code: internalCode,
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

    const groupTeams: Record<
      string,
      {
        id: number;
        name: string;
        map: Record<
          number,
          { id: number; name: string; short: string; logo: string }
        >;
      }
    > = {};

    for (const fixture of serviceGroupStage.fixtures || []) {
      const group = serviceGroupStage.groups?.find(
        (item) => item.id === fixture.group_id,
      );
      if (!group) continue;
      if (!groupTeams[group.name]) {
        groupTeams[group.name] = { id: group.id, name: group.name, map: {} };
      }
      for (const participant of fixture.participants || []) {
        groupTeams[group.name].map[participant.id] = {
          id: participant.id,
          name: participant.name,
          short: participant.short_code || participant.name.split(' ')[0],
          logo: participant.image_path,
        };
      }
    }

    const groups = Object.values(groupTeams);
    groups.sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      else return 0;
    });

    for (const group of groups) {
      const typed = group as unknown as {
        id: number;
        name: string;
        map: Record<
          number,
          { id: number; name: string; short: string; logo: string }
        >;
      };
      const { id, name, map } = typed;
      const teams = Object.values(map) as {
        id: number;
        name: string;
        short: string;
        logo: string;
      }[];

      await groupsRepo.save({
        id,
        name,
        teams,
        externalStageId: serviceGroupStage.id,
      });

      await this.syncTeams(teams);
    }
  }

  async syncFixtures(stages: SportmonksStage[]) {
    const fixturesRepo = this.db.getRepository(Fixture);

    // Sync fixtures for all stages (group stage + knockout rounds)
    for (const stage of stages) {
      for (const fx of stage.fixtures || []) {
        const participantIds = (fx.participants || []).map((p) => p.id);
        await fixturesRepo.save({
          id: fx.id,
          stageId: stage.id,
          groupId: fx.group_id,
          roundId: fx.round_id,
          startingAt: new Date(fx.starting_at),
          externalSeasonId: stage.season_id,
          participantTeamIds: participantIds,
        });
      }
    }
  }

  async getTournamentStartAt(seasonId: number) {
    const qb = this.db
      .getRepository(Fixture)
      .createQueryBuilder('f')
      .where('f.externalSeasonId = :seasonId', { seasonId })
      .orderBy('f.startingAt', 'ASC')
      .limit(1);
    const first = await qb.getOne();
    return first?.startingAt ?? null;
  }

  private async syncGameweeks(
    rounds: SportmonksRound[],
    seasonId: number,
  ): Promise<void> {
    const fixturesRepo = this.db.getRepository(Fixture);
    const gameweekRepo = this.db.getRepository(FantasyGameweek);

    // Get per-round earliest kickoff time from local fixtures
    const perRound = await fixturesRepo
      .createQueryBuilder('f')
      .select('f.roundId', 'roundId')
      .addSelect('MIN(f.startingAt)', 'firstKickoffAt')
      .where('f.externalSeasonId = :seasonId', { seasonId })
      .andWhere('f.roundId IS NOT NULL')
      .groupBy('f.roundId')
      .getRawMany<{ roundId: number; firstKickoffAt: string }>();

    const firstKickoffByRound = new Map<number, Date>();
    for (const row of perRound) {
      if (!row.roundId) continue;
      firstKickoffByRound.set(row.roundId, new Date(row.firstKickoffAt));
    }

    const fantasyConfig = this.configService.get('fantasy', { infer: true })!;
    const snapshotLeadMinutes = fantasyConfig.snapshotLeadMinutes ?? 120;

    // Load stages to detect finals/third-place rounds
    const stageRepo = this.db.getRepository(Stage);
    const stages = await stageRepo.find({
      where: { externalSeasonId: seasonId },
    });
    const stageById = new Map(stages.map((s) => [s.id, s]));

    // Group rounds into gameweeks; finals + third-place share one gameweek
    type GwGroup = {
      roundIds: number[];
      firstKickoffAt: Date;
      seasonId: number;
      name: string;
      phase: 'GROUP' | 'KNOCKOUT';
    };

    const groups = new Map<string, GwGroup>();

    for (const round of rounds) {
      const firstKickoff = firstKickoffByRound.get(round.id);
      if (!firstKickoff) continue;

      const stage = stageById.get(round.stage_id);
      const stageCode = stage?.code;

      let groupKey: string;
      const phase: 'GROUP' | 'KNOCKOUT' =
        stageCode === 'group-stage' ? 'GROUP' : 'KNOCKOUT';

      if (stageCode === 'final' || stageCode === 'third-place') {
        groupKey = 'finals';
      } else {
        groupKey = `round:${round.id}`;
      }

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          roundIds: [],
          firstKickoffAt: firstKickoff,
          seasonId: round.season_id,
          name: round.name || String(round.id),
          phase,
        };
        groups.set(groupKey, group);
      } else if (firstKickoff < group.firstKickoffAt) {
        group.firstKickoffAt = firstKickoff;
      }

      group.roundIds.push(round.id);
    }

    // Create/update gameweeks and map rounds to gameweekIds
    const roundToGameweek = new Map<number, number>();

    for (const [groupKey, group] of groups.entries()) {
      // IMPORTANT: code must be stable and unique within a season.
      // Sportmonks round names can repeat; use round IDs to avoid collisions.
      const code =
        groupKey === 'finals'
          ? `finals:${seasonId}`
          : `round:${seasonId}:${group.roundIds[0]}`;

      let gameweek = await gameweekRepo.findOne({
        where: { externalSeasonId: group.seasonId, code },
      });

      const snapshotDeadline = new Date(
        group.firstKickoffAt.getTime() - snapshotLeadMinutes * 60 * 1000,
      );

      if (!gameweek) {
        gameweek = gameweekRepo.create({
          code,
          name: `Round ${group.name}`,
          externalSeasonId: group.seasonId,
          externalRoundId: group.roundIds[0],
          firstKickoffAt: group.firstKickoffAt,
          snapshotDeadlineAt: snapshotDeadline,
          phase:
            group.phase === 'GROUP'
              ? FantasyGameweekPhase.GROUP
              : FantasyGameweekPhase.KNOCKOUT,
          isActive: false,
        });
      } else {
        gameweek.firstKickoffAt = group.firstKickoffAt;
        gameweek.snapshotDeadlineAt = snapshotDeadline;
        gameweek.externalRoundId = group.roundIds[0];
        gameweek.phase =
          group.phase === 'GROUP'
            ? FantasyGameweekPhase.GROUP
            : FantasyGameweekPhase.KNOCKOUT;
      }

      const saved = await gameweekRepo.save(gameweek);

      for (const roundId of group.roundIds) {
        roundToGameweek.set(roundId, saved.id);
      }
    }

    // Update fixtures with their gameweekId
    for (const [roundId, gameweekId] of roundToGameweek.entries()) {
      await fixturesRepo.update(
        { externalSeasonId: seasonId, roundId },
        { gameweekId },
      );
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

  async getByCode({ code }: { code: string }) {
    return this.db.getRepository(Stage).findOne({ where: { code } });
  }

  async getGroups() {
    const groupsRepo = this.db.getRepository(Group);
    return groupsRepo.find();
  }

  async getGroup({ id }: { id: number }) {
    return this.db.getRepository(Group).findOne({ where: { id } });
  }

  /**
   * Get fixtures for a knockout round by internal round code and season.
   * Round codes: 'r16' | 'qf' | 'sf' | 'final' | 'third-place'
   */
  async getFixturesForRound(roundCode: string, seasonId: number) {
    const stageCodeMap: Record<string, string> = {
      r16: 'round-of-16',
      qf: 'quarter-finals',
      sf: 'semi-finals',
      final: 'final',
      'third-place': 'third-place',
    };

    const stageCode = stageCodeMap[roundCode];
    if (!stageCode) return [];

    const stageRepo = this.db.getRepository(Stage);
    const fixturesRepo = this.db.getRepository(Fixture);

    const stage = await stageRepo.findOne({
      where: { code: stageCode, externalSeasonId: seasonId },
    });
    if (!stage) return [];

    return fixturesRepo.find({
      where: { stageId: stage.id, externalSeasonId: seasonId },
      order: {
        startingAt: 'ASC',
        id: 'ASC',
      },
    });
  }
}
