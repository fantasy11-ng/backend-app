import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

@Injectable()
export class PredictorService {
  constructor(
    private stagesService: StagesService,
    private settingsService: SettingsService,
    private configService: ConfigService<MainConfig>,
    private seedingRules: SeedingRulesService,
    @InjectDataSource() private db: DataSource,
  ) {}

  private async ensureNotLocked() {
    const allowAfterKickoff = this.configService.get(
      'predictor.allowPredictionsAfterKickoff',
      { infer: true },
    );
    if (allowAfterKickoff) {
      return; // Skip lock check if explicitly allowed via config
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

    // Ensure at most one prediction exists per (user, stage, group)
    const existingPredictions = await predictionRepo.find({
      where: {
        owner: user,
        groupId: dto.groupId,
        stageId: dto.stageId,
      },
    });
    let existingPrediction: Prediction | null = null;
    if (existingPredictions.length > 1) {
      // Keep the most recently updated prediction and remove older duplicates
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
      // Update existing prediction
      existingPrediction.winner = winner;
      existingPrediction.runnerUp = runnerUp;
      existingPrediction.teams = teamsWithGroupPosition;
      return predictionRepo.save(existingPrediction);
    }

    // Create new prediction
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

      // Ensure only one prediction exists per (user, fixture, round, season)
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
        // Keep the most recently updated prediction and remove older duplicates
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

    // Ensure only one record exists per (user, season)
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

    if (roundCode === 'r16') {
      const groupStage = await this.stagesService.getByCode({
        code: 'group-stage',
      });
      if (!groupStage) throw new NotFoundException('Group stage unavailable');

      const [groups, myPredictions, thirdPlaced] = await Promise.all([
        this.stagesService.getGroups(),
        this.getUserPredictionsForStage(user, groupStage.id),
        this.db.getRepository(ThirdPlaceQualifiersInput).findOne({
          where: { owner: user, externalSeasonId: seasonId },
        }),
      ]);

      // Validate all group predictions are complete
      const groupIdToPred = new Map<number, Prediction>();
      for (const p of myPredictions) groupIdToPred.set(p.groupId, p);

      const missingGroups: string[] = [];
      for (const g of groups as Group[]) {
        if (!groupIdToPred.has(g.id)) {
          missingGroups.push(g.name);
        }
      }

      if (missingGroups.length > 0) {
        throw new BadRequestException(
          `Please complete predictions for all groups before seeding Round of 16. Missing groups: ${missingGroups.join(', ')}`,
        );
      }

      // Check if third place qualifiers are required
      const numGroups = groups.length;
      const autoQualified = numGroups * 2;
      const thirdSlots = Math.max(0, 16 - autoQualified);

      if (thirdSlots > 0 && !thirdPlaced?.ranking?.length) {
        throw new BadRequestException(
          `Please submit third-placed qualifiers ranking before seeding Round of 16. ${thirdSlots} third-placed team(s) needed.`,
        );
      }

      const groupsSorted = (groups as Group[])
        .slice()
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

      const winners: number[] = [];
      const runnersUp: number[] = [];
      const thirdPlacedCandidates: number[] = [];

      for (const g of groupsSorted) {
        const pred = groupIdToPred.get(g.id);
        if (pred) {
          winners.push(pred.winner.id);
          runnersUp.push(pred.runnerUp.id);
          // derive third-place if available from teams order indices
          const ordered = [...pred.teams].sort((a, b) => a.index - b.index);
          if (ordered[2]) thirdPlacedCandidates.push(ordered[2].id);
        }
      }

      // Take user's submitted ranking to slice thirdPlaced qualifiers
      let thirdQualified: number[] = [];
      if (thirdPlaced?.ranking?.length) {
        const rankingFiltered = thirdPlaced.ranking.filter((t) =>
          thirdPlacedCandidates.includes(t),
        );
        thirdQualified = rankingFiltered.slice(0, thirdSlots);
      } else {
        thirdQualified = thirdPlacedCandidates.slice(0, thirdSlots);
      }

      // Build group letter maps (A..F) from group names
      const groupIdToLetter = new Map<number, string>();
      for (const g of groups as Group[]) {
        const m = (g.name || '').match(/([A-Z])$/);
        if (m) groupIdToLetter.set(g.id, m[1]);
      }
      const winnerMap: Record<string, number> = {};
      const runnerMap: Record<string, number> = {};
      const thirdGroupToTeamId: Record<string, number> = {};
      for (const g of groups as Group[]) {
        const letter = groupIdToLetter.get(g.id);
        if (!letter) continue;
        const pred = groupIdToPred.get(g.id);
        if (pred) {
          winnerMap[letter] = pred.winner.id;
          runnerMap[letter] = pred.runnerUp.id;
          const ordered = [...pred.teams].sort((a, b) => a.index - b.index);
          if (ordered[2]) thirdGroupToTeamId[letter] = ordered[2].id;
        }
      }

      // Determine competition from override or fallback to league name
      const override = this.configService.get('predictor.competitionOverride', {
        infer: true,
      });
      const main = await this.settingsService.getMainServiceLeague();
      const leagueName = (main?.name || '').toLowerCase();
      const type = (override as string)?.toLowerCase() || leagueName;
      const isWorldCup =
        type.includes('world-cup') || type.includes('world cup');
      const isAfcon = type.includes('afcon') || type.includes('africa cup');
      const isUcl = type.includes('ucl') || type.includes('champions league');

      let pairIds: { home: number; away: number }[] = [];
      if (isWorldCup) {
        pairIds = this.seedingRules.buildWorldCup32Pairs(winnerMap, runnerMap);
      } else if (isAfcon) {
        // Map thirdQualified teamIds back to their group letters, preserving order where possible
        const teamIdToGroupLetter = Object.fromEntries(
          Object.entries(thirdGroupToTeamId).map(([letter, tid]) => [
            String(tid),
            letter,
          ]),
        );
        const thirdLetters = thirdQualified
          .map((t) => teamIdToGroupLetter[String(t)])
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

      // Convert team IDs to full team objects
      const allTeamIds = [
        ...winners,
        ...runnersUp,
        ...thirdQualified,
        ...pairIds.flatMap((p) => [p.home, p.away]),
      ];
      const uniqueTeamIds = [...new Set(allTeamIds)];
      const teams = await this.db.getRepository(FootballTeam).findBy({
        id: In(uniqueTeamIds),
      });
      const teamMap = new Map(teams.map((t) => [t.id, t]));

      const fixturesR16 = await this.stagesService.getFixturesForRound(
        'r16',
        seasonId,
      );

      const pairs = pairIds.map((p, index) => ({
        fixtureId: fixturesR16[index]?.id ?? null,
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

      const participants = pairs.length
        ? pairs.flatMap((p) => [p.home.id, p.away.id])
        : [...winners, ...runnersUp, ...thirdQualified];

      return {
        round: 'r16',
        qualified: {
          winners,
          runnersUp,
          thirdQualified,
        },
        participants,
        pairs,
      };
    }

    const fixturePredRepo = this.db.getRepository(FixturePrediction);

    // Helper to validate previous round predictions are complete
    const validatePreviousRound = async (
      prevRound: string,
      expectedCount: number,
      roundName: string,
    ) => {
      const preds = await fixturePredRepo.find({
        where: {
          owner: user,
          roundCode: prevRound,
          externalSeasonId: seasonId,
        },
      });

      if (preds.length !== expectedCount) {
        throw new BadRequestException(
          `Please complete all ${roundName} predictions before seeding the next round. Expected ${expectedCount} predictions, found ${preds.length}.`,
        );
      }
    };

    const getWinnersForRound = async (prevRound: string) => {
      const preds = await fixturePredRepo.find({
        where: {
          owner: user,
          roundCode: prevRound,
          externalSeasonId: seasonId,
        },
        relations: ['predictedWinner'],
        order: {
          externalFixtureId: 'ASC', // Order by fixture ID to maintain bracket order
        },
      });
      return preds.map((p) => p.predictedWinner.id);
    };

    const getPairsForRound = async (prevRound: string) => {
      const preds = await fixturePredRepo.find({
        where: {
          owner: user,
          roundCode: prevRound,
          externalSeasonId: seasonId,
        },
        relations: ['predictedWinner'],
        order: {
          externalFixtureId: 'ASC',
        },
      });

      const pairs: {
        home: { id: number; name: string; short: string; logo: string };
        away: { id: number; name: string; short: string; logo: string };
      }[] = [];
      // Pair winners sequentially: (Match1 vs Match2), (Match3 vs Match4), etc.
      for (let i = 0; i < preds.length; i += 2) {
        if (i + 1 < preds.length) {
          const homeTeam = preds[i].predictedWinner;
          const awayTeam = preds[i + 1].predictedWinner;
          pairs.push({
            home: {
              id: homeTeam.id,
              name: homeTeam.name,
              short: homeTeam.short,
              logo: homeTeam.logo,
            },
            away: {
              id: awayTeam.id,
              name: awayTeam.name,
              short: awayTeam.short,
              logo: awayTeam.logo,
            },
          });
        }
      }
      return pairs;
    };

    if (roundCode === 'qf') {
      await validatePreviousRound('r16', 8, 'Round of 16');
      const participants = await getWinnersForRound('r16');
      const pairs = await getPairsForRound('r16');
      const fixturesQf = await this.stagesService.getFixturesForRound(
        'qf',
        seasonId,
      );
      const pairsWithFixtures = pairs.map((p, index) => ({
        fixtureId: fixturesQf[index]?.id ?? null,
        ...p,
      }));
      return { round: 'qf', participants, pairs: pairsWithFixtures };
    }

    if (roundCode === 'sf') {
      await validatePreviousRound('qf', 4, 'Quarter-finals');
      const participants = await getWinnersForRound('qf');
      const pairs = await getPairsForRound('qf');
      const fixturesSf = await this.stagesService.getFixturesForRound(
        'sf',
        seasonId,
      );
      const pairsWithFixtures = pairs.map((p, index) => ({
        fixtureId: fixturesSf[index]?.id ?? null,
        ...p,
      }));
      return { round: 'sf', participants, pairs: pairsWithFixtures };
    }

    if (roundCode === 'final') {
      await validatePreviousRound('sf', 2, 'Semi-finals');
      const participants = await getWinnersForRound('sf');
      const pairs = await getPairsForRound('sf');
      const fixturesFinal = await this.stagesService.getFixturesForRound(
        'final',
        seasonId,
      );
      const pairsWithFixtures = pairs.map((p, index) => ({
        fixtureId: fixturesFinal[index]?.id ?? null,
        ...p,
      }));
      return { round: 'final', participants, pairs: pairsWithFixtures };
    }

    if (roundCode === 'third-place') {
      await validatePreviousRound('qf', 4, 'Quarter-finals');
      await validatePreviousRound('sf', 2, 'Semi-finals');
      const qfWinners = await getWinnersForRound('qf');
      const sfWinners = await getWinnersForRound('sf');
      const losers = qfWinners.filter((t) => !sfWinners.includes(t));
      const fixturesThird = await this.stagesService.getFixturesForRound(
        'third-place',
        seasonId,
      );
      const fixtureId = fixturesThird[0]?.id ?? null;
      // In a standard bracket, losers in SF = two teams

      // Build team objects for the two SF losers (if present) so UI can render like other rounds
      const teamRepo = this.db.getRepository(FootballTeam);
      const loserTeams = losers.length
        ? await teamRepo.findBy({ id: In(losers) })
        : [];
      const teamMap = new Map(loserTeams.map((t) => [t.id, t]));

      const pairs =
        losers.length === 2
          ? [
              {
                fixtureId,
                home: {
                  id: losers[0],
                  name: teamMap.get(losers[0])?.name || '',
                  short: teamMap.get(losers[0])?.short || '',
                  logo: teamMap.get(losers[0])?.logo || '',
                },
                away: {
                  id: losers[1],
                  name: teamMap.get(losers[1])?.name || '',
                  short: teamMap.get(losers[1])?.short || '',
                  logo: teamMap.get(losers[1])?.logo || '',
                },
              },
            ]
          : [];

      return {
        round: 'third-place',
        participants: losers,
        pairs,
        fixtureId,
      };
    }

    throw new BadRequestException('Unsupported round code');
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
