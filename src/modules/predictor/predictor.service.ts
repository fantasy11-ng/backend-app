import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Prediction } from './entities/prediction.entity';
import { User } from '@/modules/users/entities/user.entity';
import { StagesService } from '../stages/stages.service';
import { FootballTeam } from '../team/entities/football-team.entity';
import { SettingsService } from '../settings/settings.service';
import { FixturePrediction } from './entities/fixture-prediction.entity';
import { ThirdPlaceMatchDto } from './dto/third-place-match.dto';
import { ThirdPlaceMatchPrediction } from './entities/third-place-match-prediction.entity';
import { BracketPredictionDto } from './dto/bracket-prediction.dto';
import { ThirdPlacedQualifiersDto } from './dto/third-placed-qualifiers.dto';
import { ThirdPlaceQualifiersInput } from './entities/third-place-qualifiers-input.entity';
import { Group } from '../stages/entities/group.entity';
import { SeedingRulesService } from './services/seeding-rules.service';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';
import { BracketEngineService } from './bracket/bracket-engine.service';
import { BracketSpecProviderService } from './bracket/bracket-spec-provider.service';
import {
  PredictionState,
  PredictionStatus,
  PredictionStatusSection,
  ROUND_LABELS,
} from './predictor.types';

@Injectable()
export class PredictorService {
  private readonly logger = new Logger(PredictorService.name);

  constructor(
    private stagesService: StagesService,
    private settingsService: SettingsService,
    private configService: ConfigService<MainConfig>,
    private seedingRules: SeedingRulesService,
    private bracketEngine: BracketEngineService,
    private bracketSpecProvider: BracketSpecProviderService,
    @InjectDataSource() private db: DataSource,
  ) {}

  private async ensureNotLocked() {
    const allowAfterKickoff = this.configService.get(
      'predictor.allowPredictionsAfterKickoff',
      { infer: true },
    );
    if (allowAfterKickoff) {
      return;
    }

    const seasonId = await this.getCurrentSeasonId();
    const startAt = await this.stagesService.getTournamentStartAt(seasonId);
    if (startAt && new Date() >= new Date(startAt)) {
      throw new ForbiddenException(
        'Predictions are locked after tournament kickoff',
      );
    }
  }

  async create(user: User, dto: CreatePredictionDto) {
    await this.ensureNotLocked();
    const predictionRepo = this.db.getRepository(Prediction);

    const stage = await this.stagesService.getOne({ id: dto.stageId });
    if (!stage)
      throw new NotFoundException(
        'Error creating prediction: invalid stage id',
      );

    const existingPredictions = await predictionRepo.find({
      where: {
        owner: user,
        groupId: dto.groupId,
        stageId: dto.stageId,
      },
    });
    let existingPrediction: Prediction | null = null;
    if (existingPredictions.length > 1) {
      existingPredictions.sort(
        (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
      );
      const duplicates = existingPredictions.slice(0, -1);
      existingPrediction = existingPredictions[existingPredictions.length - 1];
      if (duplicates.length) {
        await predictionRepo.remove(duplicates);
      }
    } else if (existingPredictions.length === 1) {
      existingPrediction = existingPredictions[0];
    }

    const teams = await this.db.getRepository(FootballTeam).findBy({
      id: In(dto.teams.map((team) => team.id)),
    });

    const winner = teams.find((team) => team.id === dto.winnerId);
    const runnerUp = teams.find((team) => team.id === dto.runnerUpId);
    const teamsWithGroupPosition = teams.map((team) => {
      return {
        ...team,
        index: dto.teams.find((innerTeam) => innerTeam.id === team.id).index,
      };
    });
    teamsWithGroupPosition.sort((a, b) => a.index - b.index);

    if (winner.id !== dto.teams[0].id) {
      throw new BadRequestException('Winner and first ranking team mismatch');
    }
    if (runnerUp.id !== dto.teams[1].id) {
      throw new BadRequestException(
        'Runner Up and second ranking team mismatch',
      );
    }

    if (existingPrediction) {
      existingPrediction.winner = winner;
      existingPrediction.runnerUp = runnerUp;
      existingPrediction.teams = teamsWithGroupPosition;
      return predictionRepo.save(existingPrediction);
    }

    return predictionRepo.save({
      owner: user,
      stageId: dto.stageId,
      groupId: dto.groupId,
      winner,
      runnerUp,
      teams: teamsWithGroupPosition,
    });
  }

  async getUserPredictionsForStage(user: User, stageId: number) {
    return this.db.getRepository(Prediction).find({
      where: {
        owner: user,
        stageId,
      },
      relations: ['winner', 'runnerUp'],
    });
  }

  private async getCurrentSeasonId(): Promise<number> {
    const main = await this.settingsService.getMainServiceLeague();
    if (!main || !main.currentSeason) {
      throw new NotFoundException('Active season unavailable');
    }
    return main.currentSeason.serviceId;
  }

  async predictBracket(
    user: User,
    roundCode: string,
    dto: BracketPredictionDto,
  ) {
    await this.ensureNotLocked();
    const seasonId = await this.getCurrentSeasonId();
    const fixturePredRepo = this.db.getRepository(FixturePrediction);
    const teamRepo = this.db.getRepository(FootballTeam);

    const teamIds = dto.predictions.map((p) => p.predictedWinnerTeamId);
    const teams = await teamRepo.findBy({ id: In(teamIds) });

    const predictionsToSave: FixturePrediction[] = [] as any;
    for (const p of dto.predictions) {
      const team = teams.find((t) => t.id === p.predictedWinnerTeamId);
      if (!team) {
        throw new BadRequestException('Invalid team in bracket prediction');
      }

      const existingList = await fixturePredRepo.find({
        where: {
          owner: user,
          externalFixtureId: p.externalFixtureId,
          roundCode,
          externalSeasonId: seasonId,
        },
      });

      let existing: FixturePrediction | null = null;
      if (existingList.length > 1) {
        existingList.sort(
          (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
        );
        const duplicates = existingList.slice(0, -1);
        existing = existingList[existingList.length - 1];
        if (duplicates.length) {
          await fixturePredRepo.remove(duplicates);
        }
      } else if (existingList.length === 1) {
        existing = existingList[0];
      }

      if (existing) {
        existing.predictedWinner = team;
        predictionsToSave.push(existing);
      } else {
        const fp = new FixturePrediction();
        fp.owner = user;
        fp.externalFixtureId = p.externalFixtureId;
        fp.roundCode = roundCode;
        fp.externalSeasonId = seasonId;
        fp.predictedWinner = team;
        predictionsToSave.push(fp);
      }
    }

    return fixturePredRepo.save(predictionsToSave);
  }

  async submitThirdPlacedQualifiers(user: User, dto: ThirdPlacedQualifiersDto) {
    await this.ensureNotLocked();
    const seasonId = await this.getCurrentSeasonId();
    const repo = this.db.getRepository(ThirdPlaceQualifiersInput);

    const existingList = await repo.find({
      where: { owner: user, externalSeasonId: seasonId },
    });

    let existing: ThirdPlaceQualifiersInput | null = null;
    if (existingList.length > 1) {
      existingList.sort(
        (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
      );
      const duplicates = existingList.slice(0, -1);
      existing = existingList[existingList.length - 1];
      if (duplicates.length) {
        await repo.remove(duplicates);
      }
    } else if (existingList.length === 1) {
      existing = existingList[0];
    }

    if (existing) {
      existing.ranking = dto.ranking;
      return repo.save(existing);
    }

    const input = new ThirdPlaceQualifiersInput();
    input.owner = user;
    input.externalSeasonId = seasonId;
    input.ranking = dto.ranking;
    return repo.save(input);
  }

  async predictThirdPlaceMatch(user: User, dto: ThirdPlaceMatchDto) {
    await this.ensureNotLocked();
    const seasonId = await this.getCurrentSeasonId();
    const repo = this.db.getRepository(ThirdPlaceMatchPrediction);
    const teamRepo = this.db.getRepository(FootballTeam);

    const team = await teamRepo.findOne({
      where: { id: dto.predictedWinnerTeamId },
    });
    if (!team) throw new BadRequestException('Invalid third-place winner team');

    const existing = await repo.findOne({
      where: {
        owner: user,
        externalFixtureId: dto.externalFixtureId,
        externalSeasonId: seasonId,
      },
    });

    if (existing) {
      existing.predictedWinner = team;
      return repo.save(existing);
    }

    const tpm = new ThirdPlaceMatchPrediction();
    tpm.owner = user;
    tpm.externalFixtureId = dto.externalFixtureId;
    tpm.externalSeasonId = seasonId;
    tpm.predictedWinner = team;
    return repo.save(tpm);
  }

  async getThirdPlaceMatchPrediction(user: User) {
    const seasonId = await this.getCurrentSeasonId();
    const repo = this.db.getRepository(ThirdPlaceMatchPrediction);
    return repo.findOne({
      where: {
        owner: user,
        externalSeasonId: seasonId,
      },
      relations: ['predictedWinner'],
    });
  }

  async getGroupsWithMine(user: User) {
    const groupStage = await this.stagesService.getByCode({
      code: 'group-stage',
    });
    if (!groupStage) throw new NotFoundException('Group stage unavailable');

    const [groups, myPredictions] = await Promise.all([
      this.stagesService.getGroups(),
      this.getUserPredictionsForStage(user, groupStage.id),
    ]);

    const groupIdToPrediction = new Map<number, Prediction>();
    for (const p of myPredictions) groupIdToPrediction.set(p.groupId, p);

    return (groups as Group[]).map((g) => ({
      id: g.id,
      name: g.name,
      teams: g.teams,
      myPrediction: groupIdToPrediction.get(g.id) || null,
    }));
  }

  async getBracketSeed(user: User, roundCode: string) {
    const seasonId = await this.getCurrentSeasonId();

    const override = this.configService.get('predictor.competitionOverride', {
      infer: true,
    }) as string;
    const main = await this.settingsService.getMainServiceLeague();
    const leagueName = (main?.name || '').toLowerCase();
    const typeStr = (override as string)?.toLowerCase() || leagueName;

    const groupStage = await this.stagesService.getByCode({
      code: 'group-stage',
    });
    if (!groupStage) throw new NotFoundException('Group stage unavailable');

    const groups = (await this.stagesService.getGroups()) as Group[];
    const numGroups = groups.length;

    const competition = this.bracketSpecProvider.detectCompetition(
      numGroups,
      typeStr,
    );
    const allSpecs = this.bracketSpecProvider.getSpecs(competition);
    const spec = allSpecs.find((s) => s.roundCode === roundCode);
    if (!spec)
      throw new BadRequestException(`Unsupported round code: ${roundCode}`);

    const firstKOSize = this.bracketSpecProvider.firstKnockoutSize(allSpecs);
    const thirdSlotsRequired = Math.max(0, firstKOSize - numGroups * 2);

    const isAfcon = typeStr.includes('afcon') || typeStr.includes('africa cup');
    const isUcl =
      typeStr.includes('ucl') || typeStr.includes('champions league');
    const isWc32Style = competition === 'world-cup-32';
    const firstRoundCode =
      this.bracketSpecProvider.firstKnockoutRoundCode(allSpecs);
    const isFirstKO = roundCode === firstRoundCode;

    // Validate prerequisites
    await this.bracketEngine.validatePrereqs(
      user,
      seasonId,
      spec,
      allSpecs,
      groupStage.id,
      thirdSlotsRequired,
    );

    // Build context
    const allRoundCodes = allSpecs.map((s) => s.roundCode);
    const ctx = await this.bracketEngine.buildContext(
      user,
      seasonId,
      groupStage.id,
      thirdSlotsRequired,
      allRoundCodes,
    );

    // Legacy seeding path for AFCON/UCL/classic WC (first KO round via SeedingRulesService)
    if (isFirstKO && (isAfcon || isUcl || isWc32Style)) {
      const winnerMap = ctx.winnerByGroup;
      const runnerMap = ctx.runnerUpByGroup;
      const thirdGroupToTeamId = ctx.thirdByGroup;

      let pairIds: { home: number; away: number }[] = [];
      if (isWc32Style) {
        pairIds = this.seedingRules.buildWorldCup32Pairs(winnerMap, runnerMap);
      } else if (isAfcon) {
        const teamIdToGroupLetter = Object.fromEntries(
          Object.entries(thirdGroupToTeamId).map(([l, tid]) => [
            String(tid),
            l,
          ]),
        );
        const thirdLetters = ctx.thirdQualifiedGroups
          .map((g) => teamIdToGroupLetter[String(thirdGroupToTeamId[g])])
          .filter(Boolean) as string[];
        pairIds = this.seedingRules.buildAfcon24Pairs(
          winnerMap,
          runnerMap,
          thirdLetters,
          thirdGroupToTeamId,
        );
      } else if (isUcl) {
        pairIds = this.seedingRules.buildChampionsLeaguePairs(
          winnerMap,
          runnerMap,
        );
      }

      const teamMap = await this.bracketEngine.loadTeamMap(
        pairIds.flatMap((p) => [p.home, p.away]),
      );
      const fixtures = await this.stagesService.getFixturesForRound(
        roundCode,
        seasonId,
      );

      const pairs = pairIds.map((p, index) => ({
        fixtureId: fixtures[index]?.id ?? null,
        home: {
          id: p.home,
          name: teamMap.get(p.home)?.name || '',
          short: teamMap.get(p.home)?.short || '',
          logo: teamMap.get(p.home)?.logo || '',
        },
        away: {
          id: p.away,
          name: teamMap.get(p.away)?.name || '',
          short: teamMap.get(p.away)?.short || '',
          logo: teamMap.get(p.away)?.logo || '',
        },
      }));

      const participants = pairs.flatMap((p) => [p.home.id, p.away.id]);
      const winners = Object.values(winnerMap);
      const runnersUp = Object.values(runnerMap);
      const thirdQualified = ctx.thirdQualifiedGroups
        .map((g) => thirdGroupToTeamId[g])
        .filter(Boolean);

      return {
        round: roundCode,
        qualified: { winners, runnersUp, thirdQualified },
        participants,
        pairs,
      };
    }

    // BracketEngine path (WC2026 and all subsequent rounds)
    const allTeamIds = [
      ...Object.values(ctx.winnerByGroup),
      ...Object.values(ctx.runnerUpByGroup),
      ...Object.values(ctx.thirdByGroup),
      ...Object.values(ctx.winnersByRound).flat(),
      ...Object.values(ctx.losersByRound).flat(),
    ];
    const teamMap = await this.bracketEngine.loadTeamMap(allTeamIds);
    const resolved = await this.bracketEngine.resolveRound(
      spec,
      ctx,
      seasonId,
      teamMap,
    );

    if (isFirstKO) {
      const winners = Object.values(ctx.winnerByGroup);
      const runnersUp = Object.values(ctx.runnerUpByGroup);
      const thirdQualified = ctx.thirdQualifiedGroups
        .map((g) => ctx.thirdByGroup[g])
        .filter(Boolean);
      return { ...resolved, qualified: { winners, runnersUp, thirdQualified } };
    }

    return resolved;
  }

  /**
   * Returns available knockout rounds for the current season in bracket order.
   * Each entry includes the expected match count. Used by clients to render
   * the bracket dynamically (no hard-coded "start at r16").
   */
  async getAvailableRounds() {
    const seasonId = await this.getCurrentSeasonId();
    const rounds =
      await this.stagesService.getKnockoutRoundsForSeason(seasonId);
    return rounds.map((code) => ({
      roundCode: code,
      expectedMatchCount: this.stagesService.expectedMatchCount(code),
    }));
  }

  async getBracketPredictions(user: User, roundCode: string) {
    const seasonId = await this.getCurrentSeasonId();
    const repo = this.db.getRepository(FixturePrediction);
    return repo.find({
      where: { owner: user, roundCode, externalSeasonId: seasonId },
      relations: ['predictedWinner'],
    });
  }

  async getThirdPlacedQualifiers(user: User) {
    const seasonId = await this.getCurrentSeasonId();
    return this.db.getRepository(ThirdPlaceQualifiersInput).findOne({
      where: { owner: user, externalSeasonId: seasonId },
    });
  }

  /**
   * Computes the user's overall prediction completion state across every
   * required section of the tournament (group stage, third-placed ranking,
   * and each knockout round). Used to drive the "Complete Your Predictions"
   * widget and the `predictionStatus` field on the /me object.
   */
  async getPredictionStatus(user: User): Promise<PredictionStatus> {
    const seasonId = await this.getCurrentSeasonId();

    const override = this.configService.get('predictor.competitionOverride', {
      infer: true,
    }) as string;
    const main = await this.settingsService.getMainServiceLeague();
    const leagueName = (main?.name || '').toLowerCase();
    const typeStr = (override as string)?.toLowerCase() || leagueName;

    const groupStage = await this.stagesService.getByCode({
      code: 'group-stage',
    });
    const groups = (await this.stagesService.getGroups()) as Group[];
    const numGroups = groups.length;

    const competition = this.bracketSpecProvider.detectCompetition(
      numGroups,
      typeStr,
    );
    const allSpecs = this.bracketSpecProvider.getSpecs(competition);
    const firstKOSize = this.bracketSpecProvider.firstKnockoutSize(allSpecs);
    const thirdSlotsRequired = Math.max(0, firstKOSize - numGroups * 2);

    // Group-stage predictions (one per group)
    const myGroupPreds = groupStage
      ? await this.db.getRepository(Prediction).find({
          where: { owner: user, stageId: groupStage.id },
        })
      : [];
    const predictedGroupIds = new Set(myGroupPreds.map((p) => p.groupId));
    const groupsCompleted = groups.filter((g) =>
      predictedGroupIds.has(g.id),
    ).length;

    // Third-placed qualifiers ranking (only when slots are required)
    let thirdPlacedCompleted = 0;
    if (thirdSlotsRequired > 0) {
      const thirdInput = await this.db
        .getRepository(ThirdPlaceQualifiersInput)
        .findOne({ where: { owner: user, externalSeasonId: seasonId } });
      thirdPlacedCompleted =
        (thirdInput?.ranking?.length ?? 0) >= thirdSlotsRequired ? 1 : 0;
    }

    // Knockout round predictions
    const allFps = await this.db.getRepository(FixturePrediction).find({
      where: { owner: user, externalSeasonId: seasonId },
    });
    const countByRound = new Map<string, number>();
    for (const fp of allFps) {
      countByRound.set(fp.roundCode, (countByRound.get(fp.roundCode) ?? 0) + 1);
    }

    const sections: PredictionStatusSection[] = [
      {
        key: 'group-stage',
        label: 'Group Stage',
        completed: groupsCompleted,
        total: groups.length,
      },
    ];

    if (thirdSlotsRequired > 0) {
      sections.push({
        key: 'third-placed-qualifiers',
        label: 'Third-Placed Qualifiers',
        completed: thirdPlacedCompleted,
        total: 1,
      });
    }

    for (const spec of allSpecs) {
      sections.push({
        key: spec.roundCode,
        label: ROUND_LABELS[spec.roundCode] ?? spec.roundCode.toUpperCase(),
        completed: Math.min(
          countByRound.get(spec.roundCode) ?? 0,
          spec.expectedPredictionCount,
        ),
        total: spec.expectedPredictionCount,
      });
    }

    const total = sections.reduce((acc, s) => acc + s.total, 0);
    const completed = sections.reduce((acc, s) => acc + s.completed, 0);
    const percent = total ? Math.round((completed / total) * 100) : 0;
    const state: PredictionState =
      completed === 0
        ? 'not_started'
        : completed >= total
          ? 'complete'
          : 'in_progress';

    return {
      state,
      progress: { completed, total, percent },
      sections,
    };
  }

  /**
   * Safe wrapper around getPredictionStatus for contexts (e.g. /me) where a
   * missing active season or predictor setup must not break the request.
   */
  async getPredictionStatusSafe(user: User): Promise<PredictionStatus | null> {
    try {
      return await this.getPredictionStatus(user);
    } catch (e) {
      this.logger.warn(
        `Failed to compute prediction status: ${(e as Error)?.message ?? e}`,
      );
      return null;
    }
  }

  async getCompetition() {
    const override = this.configService.get('predictor.competitionOverride', {
      infer: true,
    }) as string;
    const main = await this.settingsService.getMainServiceLeague();
    const leagueName = main?.name || '';
    const type = (override || leagueName).toLowerCase();
    let competition: 'world-cup' | 'afcon' | 'ucl' | 'other' = 'other';
    if (type.includes('world-cup') || type.includes('world cup'))
      competition = 'world-cup';
    else if (type.includes('afcon') || type.includes('africa cup'))
      competition = 'afcon';
    else if (type.includes('ucl') || type.includes('champions league'))
      competition = 'ucl';
    return {
      competition,
      override: override || null,
      leagueName,
      seasonId: main?.currentSeason?.serviceId,
    };
  }
}
