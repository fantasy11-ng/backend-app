import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  BracketContext,
  BracketMatch,
  BracketSource,
  BracketSpec,
  ResolvedPair,
  ResolvedRound,
  ResolvedTeam,
} from './bracket.types';
import { FixturePrediction } from '../entities/fixture-prediction.entity';
import { Prediction } from '../entities/prediction.entity';
import { ThirdPlaceQualifiersInput } from '../entities/third-place-qualifiers-input.entity';
import { FootballTeam } from '@/modules/team/entities/football-team.entity';
import { Group } from '@/modules/stages/entities/group.entity';
import { User } from '@/modules/users/entities/user.entity';
import { StagesService } from '@/modules/stages/stages.service';

// Annex C JSON is a map: key = sorted 8-letter string of qualifying groups,
// value = { '1A': 'E', '1B': 'J', ... } mapping slot label → group letter.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ANNEX_C_TABLES: Record<string, Record<string, Record<string, string>>> = {
  wc2026: require('../data/wc2026-annex-c.json'),
};

@Injectable()
export class BracketEngineService {
  private readonly logger = new Logger(BracketEngineService.name);

  constructor(
    @InjectDataSource() private db: DataSource,
    private stagesService: StagesService,
  ) {}

  /**
   * Validate that all prerequisites for accessing a round are met.
   * Throws BadRequestException if not.
   */
  async validatePrereqs(
    user: User,
    seasonId: number,
    spec: BracketSpec,
    allSpecs: BracketSpec[],
    groupStageId: number,
    thirdSlotsRequired: number,
  ): Promise<void> {
    const roundIndex = allSpecs.findIndex((s) => s.roundCode === spec.roundCode);
    const isFirstKO = roundIndex === 0;

    if (isFirstKO) {
      // Must have completed all group predictions
      const groups = await this.db.getRepository(Group).find();
      const myPreds = await this.db.getRepository(Prediction).find({
        where: { owner: user, stageId: groupStageId },
      });
      const predicted = new Set(myPreds.map((p) => p.groupId));
      const missing = groups.filter((g) => !predicted.has(g.id)).map((g) => g.name);
      if (missing.length) {
        throw new BadRequestException(
          `Please complete predictions for all groups before seeding ${spec.roundCode.toUpperCase()}. Missing groups: ${missing.join(', ')}`,
        );
      }

      // Must have submitted third-place ranking if slots are needed
      if (thirdSlotsRequired > 0) {
        const thirdInput = await this.db
          .getRepository(ThirdPlaceQualifiersInput)
          .findOne({ where: { owner: user, externalSeasonId: seasonId } });
        if (!thirdInput?.ranking?.length) {
          throw new BadRequestException(
            `Please submit third-placed qualifiers ranking before seeding ${spec.roundCode.toUpperCase()}. ${thirdSlotsRequired} third-placed team(s) needed.`,
          );
        }
      }
    } else {
      // Must have completed the previous round
      const prevSpec = allSpecs[roundIndex - 1];
      const preds = await this.db.getRepository(FixturePrediction).find({
        where: {
          owner: user,
          roundCode: prevSpec.roundCode,
          externalSeasonId: seasonId,
        },
      });
      if (preds.length !== prevSpec.expectedPredictionCount) {
        throw new BadRequestException(
          `Please complete all ${prevSpec.roundCode.toUpperCase()} predictions before seeding ${spec.roundCode.toUpperCase()}. Expected ${prevSpec.expectedPredictionCount} predictions, found ${preds.length}.`,
        );
      }
    }
  }

  /**
   * Build a BracketContext for the given user + season.
   * This loads all the data needed to resolve BracketSource references.
   */
  async buildContext(
    user: User,
    seasonId: number,
    groupStageId: number,
    thirdSlotsRequired: number,
    allRoundCodes: string[],
  ): Promise<BracketContext> {
    const [groups, myGroupPreds, thirdInput] = await Promise.all([
      this.db.getRepository(Group).find(),
      this.db.getRepository(Prediction).find({
        where: { owner: user, stageId: groupStageId },
        relations: ['winner', 'runnerUp'],
      }),
      this.db.getRepository(ThirdPlaceQualifiersInput).findOne({
        where: { owner: user, externalSeasonId: seasonId },
      }),
    ]);

    const winnerByGroup: Record<string, number> = {};
    const runnerUpByGroup: Record<string, number> = {};
    const thirdByGroup: Record<string, number> = {};

    for (const g of groups as Group[]) {
      const letterMatch = (g.name || '').match(/([A-Z])$/);
      const letter = letterMatch?.[1];
      if (!letter) continue;
      const pred = myGroupPreds.find((p) => p.groupId === g.id);
      if (!pred) continue;
      winnerByGroup[letter] = pred.winner.id;
      runnerUpByGroup[letter] = pred.runnerUp.id;
      const ordered = [...pred.teams].sort((a, b) => a.index - b.index);
      if (ordered[2]) thirdByGroup[letter] = ordered[2].id;
    }

    // Resolve which third-placed groups qualify
    const allThirdCandidateTeamIds = Object.values(thirdByGroup);
    let thirdQualifiedGroups: string[] = [];

    if (thirdSlotsRequired > 0 && thirdInput?.ranking?.length) {
      // Use user-submitted ranking filtered to valid 3rd place candidates
      const validRanking = thirdInput.ranking.filter((tid) =>
        allThirdCandidateTeamIds.includes(tid),
      );
      const ranked = validRanking.slice(0, thirdSlotsRequired);
      // Map team IDs back to group letters
      const teamIdToLetter = Object.fromEntries(
        Object.entries(thirdByGroup).map(([l, tid]) => [tid, l]),
      );
      thirdQualifiedGroups = ranked
        .map((tid) => teamIdToLetter[tid])
        .filter(Boolean) as string[];
    }

    // Load previous round winner predictions (ordered by fixture id for consistency)
    const winnersByRound: Record<string, number[]> = {};
    const losersByRound: Record<string, number[]> = {};

    for (const roundCode of allRoundCodes) {
      const preds = await this.db.getRepository(FixturePrediction).find({
        where: { owner: user, roundCode, externalSeasonId: seasonId },
        relations: ['predictedWinner'],
        order: { externalFixtureId: 'ASC' },
      });
      if (preds.length) {
        winnersByRound[roundCode] = preds.map((p) => p.predictedWinner.id);
      }
    }

    // Compute sf losers for third-place match
    if (winnersByRound['qf'] && winnersByRound['sf']) {
      losersByRound['sf'] = winnersByRound['qf'].filter(
        (t) => !winnersByRound['sf'].includes(t),
      );
    }

    return {
      winnerByGroup,
      runnerUpByGroup,
      thirdByGroup,
      thirdQualifiedGroups,
      winnersByRound,
      losersByRound,
    };
  }

  /**
   * Resolve a single BracketSource to a team ID using the context.
   * Returns null when the source is not yet resolvable (e.g. previous round
   * predictions not submitted yet).
   */
  resolveSource(source: BracketSource, ctx: BracketContext): number | null {
    switch (source.type) {
      case 'groupPlacement': {
        const { group, place } = source;
        if (place === 1) return ctx.winnerByGroup[group] ?? null;
        if (place === 2) return ctx.runnerUpByGroup[group] ?? null;
        if (place === 3) return ctx.thirdByGroup[group] ?? null;
        return null;
      }

      case 'thirdPlaceAnnexC': {
        const { slotKey, annexTable } = source;
        const table = ANNEX_C_TABLES[annexTable];
        if (!table) {
          this.logger.warn(`Annex C table not found: ${annexTable}`);
          return null;
        }
        // Build lookup key from sorted qualifying group letters
        const comboKey = [...ctx.thirdQualifiedGroups].sort().join('');
        const slotMapping = table[comboKey];
        if (!slotMapping) {
          this.logger.warn(
            `No Annex C mapping for combination "${comboKey}" in table "${annexTable}"`,
          );
          return null;
        }
        const groupLetter = slotMapping[slotKey];
        if (!groupLetter) return null;
        return ctx.thirdByGroup[groupLetter] ?? null;
      }

      case 'winnerOf': {
        const { round, matchIndex } = source;
        return ctx.winnersByRound[round]?.[matchIndex] ?? null;
      }

      case 'loserOf': {
        const { round, matchIndex } = source;
        return ctx.losersByRound[round]?.[matchIndex] ?? null;
      }
    }
  }

  /**
   * Resolve all matches in a spec to concrete pairs and attach fixture IDs.
   */
  async resolveRound(
    spec: BracketSpec,
    ctx: BracketContext,
    seasonId: number,
    teamMap: Map<number, FootballTeam>,
  ): Promise<ResolvedRound> {
    const fixtures = await this.stagesService.getFixturesForRound(
      spec.roundCode,
      seasonId,
    );

    if (
      fixtures.length > 0 &&
      fixtures.length !== spec.expectedPredictionCount
    ) {
      this.logger.warn(
        `Round ${spec.roundCode}: expected ${spec.expectedPredictionCount} fixtures but found ${fixtures.length}. ` +
          `fixtureId will be null for unmatched positions.`,
      );
    }

    const pairs: ResolvedPair[] = spec.matches.map(
      (match: BracketMatch, index: number) => {
        const homeId = this.resolveSource(match.home, ctx);
        const awayId = this.resolveSource(match.away, ctx);
        const fixtureId = fixtures[index]?.id ?? null;

        const toTeam = (id: number | null): ResolvedTeam => {
          if (id == null) return { id: 0, name: '', short: '', logo: '' };
          const t = teamMap.get(id);
          return {
            id,
            name: t?.name || '',
            short: t?.short || '',
            logo: t?.logo || '',
          };
        };

        return {
          fixtureId,
          home: toTeam(homeId),
          away: toTeam(awayId),
        };
      },
    );

    const participants = pairs.flatMap((p) =>
      [p.home.id, p.away.id].filter((id) => id !== 0),
    );

    return { round: spec.roundCode, participants, pairs };
  }

  /**
   * Convenience: load all team objects needed for a resolved round from the DB.
   */
  async loadTeamMap(teamIds: number[]): Promise<Map<number, FootballTeam>> {
    const unique = [...new Set(teamIds.filter(Boolean))];
    if (!unique.length) return new Map();
    const teams = await this.db
      .getRepository(FootballTeam)
      .findBy({ id: In(unique) });
    return new Map(teams.map((t) => [t.id, t]));
  }
}
