import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Player } from '@/modules/players/entities/player.entity';
import { PlayerFixtureStats } from '@/modules/players/entities/player-fixture-stats.entity';
import { FantasySquad } from '@/modules/fantasy/entities/fantasy-squad.entity';
import { FantasySquadPlayer } from '@/modules/fantasy/entities/fantasy-squad-player.entity';
import { FantasyTransfer } from '@/modules/fantasy/entities/fantasy-transfer.entity';
import { FantasyTeam } from '@/modules/fantasy/entities/fantasy-team.entity';
import { FantasyGameweek } from '@/modules/fantasy/entities/fantasy-gameweek.entity';
import {
  computePlayerInsightMetrics,
  PLAYER_INSIGHTS_FORM_LOOKBACK,
  PLAYER_INSIGHTS_PERFORMANCE_LOOKBACK,
  PLAYER_INSIGHTS_PRICE_CHANGE_LOOKBACK_DAYS,
} from '@/modules/players/player-insights.metrics';

type ExportPlayerReviewJsonOptions = {
  outputDir?: string;
  playerId?: number;
  maxRecentFixtures?: number;
};

const buildSchema = () => ({
  schemaVersion: '1.0',
  purpose:
    'Team review artifact: schema + live sample of stored and derived player stats.',
  sections: {
    playerProfile: {
      origin: 'players.player table',
      fields: [
        'id',
        'name',
        'commonName',
        'image',
        'pool',
        'positionId',
        'position.code',
        'countryId',
        'externalId',
        'rating',
        'price',
      ],
    },
    seasonStats: {
      origin:
        'players.player table (season-to-date + Sportmonks season statistics persisted on sync)',
      fields: [
        'points',
        'goals',
        'assists',
        'yellowCards',
        'redCards',
        'minutesPlayed',
        'appearances',
        'lineups',
        'starts',
        'bench',
        'shotsOnTarget',
        'keyPasses',
      ],
    },
    recentFixtureStats: {
      origin: 'players.player_fixture_stats table (per-fixture snapshots)',
      fields: [
        'fixtureId',
        'minutesPlayed',
        'goals',
        'assists',
        'yellowCards',
        'redCards',
        'fantasyPoints',
        'createdAt',
        'updatedAt',
      ],
    },
    derivedInsightMetrics: {
      origin: 'derived (see formulas + inputs)',
      fields: ['ownership', 'priceChange', 'form', 'performanceIndex'],
      formulas: {
        ownership:
          'percentage of fantasy teams whose latest locked squad contains the player',
        priceChange:
          'transfer-demand formula using net transfers (ins - outs) per team over lookback window, capped and scaled',
        form: `average fantasyPoints over last N fixture snapshots (N=${PLAYER_INSIGHTS_FORM_LOOKBACK})`,
        performanceIndex: `weighted score over last N fixtures (N=${PLAYER_INSIGHTS_PERFORMANCE_LOOKBACK}) plus per-appearance season support stats`,
      },
      lookbacks: {
        priceChangeDays: PLAYER_INSIGHTS_PRICE_CHANGE_LOOKBACK_DAYS,
        formFixtures: PLAYER_INSIGHTS_FORM_LOOKBACK,
        performanceFixtures: PLAYER_INSIGHTS_PERFORMANCE_LOOKBACK,
      },
    },
  },
});

@Command({
  name: 'review:export-player-stats',
  description:
    'Export schema + live sample JSON for a representative current-season player.',
})
export class ExportPlayerReviewJsonCommand extends CommandRunner {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  @Option({
    flags: '--outputDir <outputDir>',
    description:
      'Output directory (relative to repo root). Default: review-artifacts',
  })
  parseOutputDir(value: string): string {
    return value;
  }

  @Option({
    flags: '--playerId <playerId>',
    description:
      'Optional explicit player id to export (otherwise auto-picked from current season data).',
  })
  parsePlayerId(value: string): number {
    return parseInt(value, 10);
  }

  @Option({
    flags: '--maxRecentFixtures <maxRecentFixtures>',
    description: 'How many recent fixture snapshots to include (default: 5).',
  })
  parseMaxRecentFixtures(value: string): number {
    return parseInt(value, 10);
  }

  private ensureDir(dirPath: string) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  private writeJson(filePath: string, data: unknown) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  private async pickRepresentativePlayerId(): Promise<number> {
    const raw = await this.db
      .getRepository(Player)
      .createQueryBuilder('p')
      .innerJoin(PlayerFixtureStats, 'pfs', 'pfs.playerId = p.id')
      .select('p.id', 'playerId')
      .addSelect('COUNT(pfs.id)', 'fixtureCount')
      .addSelect('p.points', 'points')
      .groupBy('p.id')
      .orderBy('fixtureCount', 'DESC')
      .addOrderBy('p.points', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .getRawOne<{ playerId: string }>();

    const playerId = parseInt(raw?.playerId ?? '', 10);
    if (!Number.isFinite(playerId)) {
      throw new Error('No PlayerFixtureStats rows found to auto-pick a player');
    }
    return playerId;
  }

  private async getLatestLockedGameweek(): Promise<FantasyGameweek | null> {
    const now = new Date();
    const gw = await this.db
      .getRepository(FantasyGameweek)
      .createQueryBuilder('gw')
      .where('gw.snapshotDeadlineAt <= :now', { now })
      .orderBy('gw.snapshotDeadlineAt', 'DESC')
      .getOne();
    return gw ?? null;
  }

  private async computeOwnershipInput(playerId: number) {
    const latestLockedGw = await this.getLatestLockedGameweek();
    if (!latestLockedGw) return null;

    const totalTeams = await this.db.getRepository(FantasySquad).count({
      where: { isLocked: true, gameweekId: latestLockedGw.id },
    });
    if (!totalTeams) return null;

    const raw = await this.db
      .getRepository(FantasySquadPlayer)
      .createQueryBuilder('sp')
      .innerJoin(FantasySquad, 's', 's.id = sp.squadId')
      .select('COUNT(DISTINCT sp.squadId)', 'selectedTeams')
      .where('s.isLocked = true')
      .andWhere('s.gameweekId = :gwId', { gwId: latestLockedGw.id })
      .andWhere('sp.playerId = :playerId', { playerId })
      .getRawOne<{ selectedTeams: string }>();

    const selectedTeams = parseInt(raw?.selectedTeams ?? '0', 10) || 0;
    return { selectedTeams, totalTeams };
  }

  async run(_: string[], options?: ExportPlayerReviewJsonOptions): Promise<void> {
    const outputDir = options?.outputDir ?? 'review-artifacts';
    const maxRecentFixtures = options?.maxRecentFixtures ?? 5;

    const outAbs = path.resolve(process.cwd(), outputDir);
    this.ensureDir(outAbs);

    const schema = buildSchema();
    const schemaPath = path.join(outAbs, 'player-review.schema.json');
    this.writeJson(schemaPath, schema);

    try {
      const explicitPlayerId = options?.playerId;
      const parsedExplicit =
        explicitPlayerId != null && Number.isFinite(explicitPlayerId)
          ? explicitPlayerId
          : null;

      const playerId = parsedExplicit ?? (await this.pickRepresentativePlayerId());
      const player = await this.db.getRepository(Player).findOne({
        where: { id: playerId },
      });
      if (!player) throw new Error(`Player ${playerId} not found`);

      const recentFixtures = await this.db.getRepository(PlayerFixtureStats).find({
        where: { playerId: player.id },
        order: { fixtureId: 'DESC' },
        take: maxRecentFixtures,
      });

      const ownership = await this.computeOwnershipInput(player.id);

      const now = new Date();
      const windowStart = new Date(
        now.getTime() - PLAYER_INSIGHTS_PRICE_CHANGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      );

      const [transferIns, transferOuts, totalTeams] = await Promise.all([
        this.db
          .getRepository(FantasyTransfer)
          .createQueryBuilder('t')
          .where('t.playerInId = :playerId', { playerId: player.id })
          .andWhere('t.createdAt > :start', { start: windowStart })
          .getCount(),
        this.db
          .getRepository(FantasyTransfer)
          .createQueryBuilder('t')
          .where('t.playerOutId = :playerId', { playerId: player.id })
          .andWhere('t.createdAt > :start', { start: windowStart })
          .getCount(),
        this.db.getRepository(FantasyTeam).count(),
      ]);

      const computed = computePlayerInsightMetrics({
        ownership: ownership ?? undefined,
        transferDemand:
          totalTeams > 0
            ? {
                transferIns,
                transferOuts,
                totalTeams,
              }
            : null,
        form: {
          recentFixtureStats: recentFixtures.map((f) => ({
            fixtureId: f.fixtureId,
            fantasyPoints: f.fantasyPoints,
            minutesPlayed: f.minutesPlayed,
          })),
        },
        performanceIndex: {
          recentFixtureStats: recentFixtures.map((f) => ({
            fixtureId: f.fixtureId,
            fantasyPoints: f.fantasyPoints,
            minutesPlayed: f.minutesPlayed,
          })),
          seasonStats: {
            appearances: player.appearances ?? null,
            shotsOnTarget: player.shotsOnTarget ?? null,
            keyPasses: player.keyPasses ?? null,
          },
        },
      });

      const sample = {
        generatedAt: new Date().toISOString(),
        autoPickCurrentSeason: parsedExplicit == null,
        player: {
          id: player.id,
          name: player.name,
          commonName: player.commonName,
          image: player.image,
          pool: player.pool,
          positionId: player.positionId,
          position: player.position,
          countryId: player.countryId,
          externalId: player.externalId ?? null,
          rating: player.rating ?? 0,
          price: player.price ?? 0,
        },
        seasonStats: {
          points: player.points ?? 0,
          goals: player.goals ?? 0,
          assists: player.assists ?? 0,
          yellowCards: player.yellowCards ?? 0,
          redCards: player.redCards ?? 0,
          minutesPlayed: player.minutesPlayed ?? null,
          appearances: player.appearances ?? null,
          lineups: player.lineups ?? null,
          starts: player.starts ?? null,
          bench: player.bench ?? null,
          shotsOnTarget: player.shotsOnTarget ?? null,
          keyPasses: player.keyPasses ?? null,
        },
        recentFixtureStats: recentFixtures,
        derivedInsightInputs: {
          ownership,
          transferDemand: {
            transferIns,
            transferOuts,
            totalTeams,
            lookbackDays: PLAYER_INSIGHTS_PRICE_CHANGE_LOOKBACK_DAYS,
          },
        },
        derivedInsightMetrics: computed,
      };

      const samplePath = path.join(outAbs, 'player-review.sample.json');
      this.writeJson(samplePath, sample);

      const combinedPath = path.join(
        outAbs,
        'player-review.schema_and_live_sample.json',
      );
      this.writeJson(combinedPath, {
        schema,
        sample,
      });

      // eslint-disable-next-line no-console
      console.log(
        `Wrote review artifacts to ${outputDir}: playerId=${player.id} fixtures=${recentFixtures.length}`,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `Wrote schema but could not write live sample: ${(e as Error)?.message ?? e}`,
      );
    }
  }
}

