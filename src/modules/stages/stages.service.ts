import { Injectable } from '@nestjs/common';
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
import {
  isKnockoutStageCode,
  normalizeStageCode,
  roundCodeToStageCode,
  stageCodeToRoundCode,
} from './stage-code.utils';

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
      // Normalize to a stable internal code (supports "round-of-32", "round-of-16", etc.)
      const internalCode = normalizeStageCode(stage.type.code, stage.name);

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

    // Sync teams from *all* stages/fixtures (group + knockout).
    // Previously we only synced teams seen in group-stage fixtures, which meant KO participants
    // could be missing locally even though fixtures exist.
    const allTeamsMap: Record<
      number,
      { id: number; name: string; short: string; logo: string }
    > = {};
    for (const stage of stages) {
      for (const fixture of stage.fixtures || []) {
        for (const participant of fixture.participants || []) {
          allTeamsMap[participant.id] = {
            id: participant.id,
            name: participant.name,
            short:
              participant.short_code ||
              participant.name?.split(' ')?.[0] ||
              String(participant.id),
            logo: participant.image_path || '',
          };
        }
      }
    }

    const serviceGroupStage = stages.find(
      (stage) => stage.type.code === 'group-stage',
    );
    // Some competitions may not have a group stage; still sync teams in that case.
    if (!serviceGroupStage) {
      await this.syncTeams(Object.values(allTeamsMap));
      return;
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
    }

    // Ensure all teams (including knockout-stage participants) are synced.
    await this.syncTeams(Object.values(allTeamsMap));
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

    // Get per-stage earliest kickoff time from local fixtures
    // (Needed for knockout phases where Sportmonks "rounds" may not exist / be meaningful.)
    const perStage = await fixturesRepo
      .createQueryBuilder('f')
      .select('f.stageId', 'stageId')
      .addSelect('MIN(f.startingAt)', 'firstKickoffAt')
      .where('f.externalSeasonId = :seasonId', { seasonId })
      .andWhere('f.stageId IS NOT NULL')
      .groupBy('f.stageId')
      .getRawMany<{ stageId: number; firstKickoffAt: string }>();

    const firstKickoffByStage = new Map<number, Date>();
    for (const row of perStage) {
      if (!row.stageId) continue;
      firstKickoffByStage.set(row.stageId, new Date(row.firstKickoffAt));
    }

    const fantasyConfig = this.configService.get('fantasy', { infer: true })!;
    const snapshotLeadMinutes = fantasyConfig.snapshotLeadMinutes ?? 120;

    // Load stages to detect finals/third-place rounds
    const stageRepo = this.db.getRepository(Stage);
    const stages = await stageRepo.find({
      where: { externalSeasonId: seasonId },
    });

    const stageById = new Map(stages.map((s) => [s.id, s]));
    const stageByCode = new Map(stages.map((s) => [s.code, s]));

    // Build gameweeks from:
    // - group-stage rounds (matchdays)
    // - knockout stages (R16/QF/SF + finals/third-place) based on fixtures
    type GwGroup = {
      roundIds: number[];
      stageIds: number[];
      firstKickoffAt: Date;
      seasonId: number;
      name: string;
      phase: 'GROUP' | 'KNOCKOUT';
      externalRoundId: number;
    };

    const groups = new Map<string, GwGroup>();

    // 1) Group-stage gameweeks from rounds
    for (const round of rounds) {
      const firstKickoff = firstKickoffByRound.get(round.id);
      if (!firstKickoff) continue;

      const stage = stageById.get(round.stage_id);
      const stageCode = stage?.code;

      // For this tournament we treat Sportmonks "rounds" as GROUP matchdays only.
      if (stageCode !== 'group-stage') continue;

      const phase: 'GROUP' | 'KNOCKOUT' =
        stageCode === 'group-stage' ? 'GROUP' : 'KNOCKOUT';

      const groupKey = `round:${round.id}`;

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          roundIds: [],
          stageIds: [],
          firstKickoffAt: firstKickoff,
          seasonId: round.season_id,
          name: round.name || String(round.id),
          phase,
          externalRoundId: round.id,
        };
        groups.set(groupKey, group);
      } else if (firstKickoff < group.firstKickoffAt) {
        group.firstKickoffAt = firstKickoff;
      }

      group.roundIds.push(round.id);
    }

    // 2) Knockout gameweeks from stages + fixtures
    // isKnockoutStageCode() handles all "round-of-N" codes dynamically (e.g. round-of-32)
    // as well as named KO stages (quarter-finals, semi-finals, final, third-place).
    for (const stage of stages) {
      if (!isKnockoutStageCode(stage.code)) continue;

      const firstKickoff = firstKickoffByStage.get(stage.id);
      if (!firstKickoff) continue; // stage exists but fixtures aren't available locally yet

      const phase: 'GROUP' | 'KNOCKOUT' = 'KNOCKOUT';
      const groupKey =
        stage.code === 'final' || stage.code === 'third-place'
          ? 'finals'
          : `stage:${stage.id}`;

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          roundIds: [],
          stageIds: [],
          firstKickoffAt: firstKickoff,
          seasonId: seasonId,
          name: stage.name || stage.code,
          phase,
          externalRoundId: stage.id, // for knockout, store stage id here (field name is legacy)
        };
        groups.set(groupKey, group);
      } else if (firstKickoff < group.firstKickoffAt) {
        group.firstKickoffAt = firstKickoff;
      }

      group.stageIds.push(stage.id);
    }

    // Prefer storing the actual "final" stage id for the finals gameweek if available
    const finalStageId = stageByCode.get('final')?.id;
    const thirdPlaceStageId = stageByCode.get('third-place')?.id;
    const finalsGroup = groups.get('finals');
    if (finalsGroup) {
      const preferred =
        (finalStageId && finalsGroup.stageIds.includes(finalStageId)
          ? finalStageId
          : null) ??
        (thirdPlaceStageId && finalsGroup.stageIds.includes(thirdPlaceStageId)
          ? thirdPlaceStageId
          : null) ??
        (finalsGroup.stageIds.length ? finalsGroup.stageIds[0] : null);
      if (preferred != null) finalsGroup.externalRoundId = preferred;
    }

    // Create/update gameweeks and map rounds/stages to gameweekIds
    const roundToGameweek = new Map<number, number>();
    const stageToGameweek = new Map<number, number>();

    for (const [groupKey, group] of groups.entries()) {
      // IMPORTANT: code must be stable and unique within a season.
      // Sportmonks round names can repeat; use round IDs to avoid collisions.
      const code =
        groupKey === 'finals'
          ? `finals:${seasonId}`
          : groupKey.startsWith('round:')
            ? `round:${seasonId}:${group.roundIds[0]}`
            : `stage:${seasonId}:${group.stageIds[0]}`;

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
          externalRoundId: group.externalRoundId,
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
        gameweek.externalRoundId = group.externalRoundId;
        gameweek.phase =
          group.phase === 'GROUP'
            ? FantasyGameweekPhase.GROUP
            : FantasyGameweekPhase.KNOCKOUT;
      }

      const saved = await gameweekRepo.save(gameweek);

      for (const roundId of group.roundIds) {
        roundToGameweek.set(roundId, saved.id);
      }

      for (const stageId of group.stageIds) {
        stageToGameweek.set(stageId, saved.id);
      }
    }

    // Update fixtures with their gameweekId
    for (const [roundId, gameweekId] of roundToGameweek.entries()) {
      await fixturesRepo.update(
        { externalSeasonId: seasonId, roundId },
        { gameweekId },
      );
    }

    for (const [stageId, gameweekId] of stageToGameweek.entries()) {
      await fixturesRepo.update(
        { externalSeasonId: seasonId, stageId },
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
   * Get fixtures for a knockout round by predictor round code and season.
   * Supports any "rN" code (e.g. 'r32', 'r16') plus 'qf', 'sf', 'final', 'third-place'.
   */
  async getFixturesForRound(roundCode: string, seasonId: number) {
    const stageCode = roundCodeToStageCode(roundCode);
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

  /**
   * Returns an ordered list of predictor round codes present in the DB for a season.
   * Order: descending by N for "rN" rounds (so r32 before r16), then qf → sf → final,
   * with third-place last.
   *
   * Example for WC2026: ['r32', 'r16', 'qf', 'sf', 'final', 'third-place']
   * Example for WC2022: ['r16', 'qf', 'sf', 'final', 'third-place']
   */
  async getKnockoutRoundsForSeason(seasonId: number): Promise<string[]> {
    const stageRepo = this.db.getRepository(Stage);
    const stages = await stageRepo.find({
      where: { externalSeasonId: seasonId },
    });

    const roundNSizes: number[] = [];
    const named: string[] = [];

    for (const stage of stages) {
      const roundCode = stageCodeToRoundCode(stage.code);
      if (!roundCode) continue;

      const m = roundCode.match(/^r(\d+)$/);
      if (m) {
        roundNSizes.push(Number(m[1]));
      } else if (
        roundCode === 'qf' ||
        roundCode === 'sf' ||
        roundCode === 'final' ||
        roundCode === 'third-place'
      ) {
        named.push(roundCode);
      }
    }

    // Sort rN rounds largest first (r32 before r16)
    roundNSizes.sort((a, b) => b - a);
    const rNRounds = roundNSizes.map((n) => `r${n}`);

    // Sort named rounds in logical bracket order
    const namedOrder = ['qf', 'sf', 'final', 'third-place'];
    named.sort((a, b) => namedOrder.indexOf(a) - namedOrder.indexOf(b));

    return [...rNRounds, ...named];
  }

  /**
   * Returns the expected number of matches (= fixtures) for a given round code,
   * derived from the stage size implied by the round code.
   */
  expectedMatchCount(roundCode: string): number {
    const m = roundCode.match(/^r(\d+)$/);
    if (m) return Number(m[1]) / 2;
    if (roundCode === 'qf') return 4;
    if (roundCode === 'sf') return 2;
    if (roundCode === 'final') return 1;
    if (roundCode === 'third-place') return 1;
    return 0;
  }
}
