import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Player } from '@/modules/players/entities/player.entity';
import { FantasySquadPlayer } from '@/modules/fantasy/entities/fantasy-squad-player.entity';
import { FantasyTransfer } from '@/modules/fantasy/entities/fantasy-transfer.entity';
import { PlayerFixtureStats } from '@/modules/players/entities/player-fixture-stats.entity';

interface DedupePlayersOptions {
  dryRun?: boolean;
  externalId?: string;
}

@Command({
  name: 'players:dedupe',
  description:
    'Delete duplicate Player rows (grouped by externalId) and repoint all references to a canonical row.',
})
export class DedupePlayersCommand extends CommandRunner {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  @Option({
    flags: '--dry-run',
    description: 'Print what would change, without modifying the database',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({
    flags: '--externalId <externalId>',
    description: 'Only dedupe a single SportMonks externalId',
  })
  parseExternalId(value: string): string {
    return value;
  }

  async run(_: string[], options?: DedupePlayersOptions): Promise<void> {
    const dryRun = !!options?.dryRun;
    const externalIdFilter =
      options?.externalId != null ? Number(options.externalId) : null;

    if (options?.externalId != null && Number.isNaN(externalIdFilter)) {
      // eslint-disable-next-line no-console
      console.error(`Invalid --externalId: ${options.externalId}`);
      return;
    }

    const playersRepo = this.db.getRepository(Player);

    // Find duplicate groups by externalId
    const qb = playersRepo
      .createQueryBuilder('p')
      .select('p.externalId', 'externalId')
      .addSelect('COUNT(p.id)', 'count')
      .addSelect('ARRAY_AGG(p.id ORDER BY p.id)', 'ids')
      .where('p.externalId IS NOT NULL')
      .groupBy('p.externalId')
      .having('COUNT(p.id) > 1');

    if (externalIdFilter != null) {
      qb.andWhere('p.externalId = :externalId', { externalId: externalIdFilter });
    }

    const groups = await qb.getRawMany<{
      externalId: string;
      count: string;
      ids: string; // e.g. "{12,34,56}"
    }>();

    if (!groups.length) {
      // eslint-disable-next-line no-console
      console.log('No duplicate players found.');
      return;
    }

    let totalDeleted = 0;
    let totalUpdatedRefs = 0;

    for (const g of groups) {
      const ids = String(g.ids || '')
        .replace(/[{}]/g, '')
        .split(',')
        .filter(Boolean)
        .map((x) => Number(x));

      if (ids.length < 2) continue;

      const keepId = ids[0];
      const deleteIds = ids.slice(1);

      // eslint-disable-next-line no-console
      console.log(
        `externalId=${g.externalId}: keep playerId=${keepId}, delete=${deleteIds.join(
          ',',
        )}`,
      );

      if (dryRun) {
        totalDeleted += deleteIds.length;
        continue;
      }

      await this.db.transaction(async (em) => {
        const spRepo = em.getRepository(FantasySquadPlayer);
        const trRepo = em.getRepository(FantasyTransfer);
        const pfsRepo = em.getRepository(PlayerFixtureStats);
        const pRepo = em.getRepository(Player);

        // Repoint FantasySquadPlayer references
        const spUpdate = await spRepo
          .createQueryBuilder()
          .update(FantasySquadPlayer)
          .set({ playerId: keepId })
          .where('playerId IN (:...ids)', { ids: deleteIds })
          .execute();
        totalUpdatedRefs += spUpdate.affected || 0;

        // Repoint FantasyTransfer references (both directions)
        const inUpdate = await trRepo
          .createQueryBuilder()
          .update(FantasyTransfer)
          .set({ playerInId: keepId })
          .where('playerInId IN (:...ids)', { ids: deleteIds })
          .execute();
        totalUpdatedRefs += inUpdate.affected || 0;

        const outUpdate = await trRepo
          .createQueryBuilder()
          .update(FantasyTransfer)
          .set({ playerOutId: keepId })
          .where('playerOutId IN (:...ids)', { ids: deleteIds })
          .execute();
        totalUpdatedRefs += outUpdate.affected || 0;

        // Repoint per-fixture stats
        const pfsUpdate = await pfsRepo
          .createQueryBuilder()
          .update(PlayerFixtureStats)
          .set({ playerId: keepId })
          .where('playerId IN (:...ids)', { ids: deleteIds })
          .execute();
        totalUpdatedRefs += pfsUpdate.affected || 0;

        // Delete duplicates
        await pRepo.delete({ id: In(deleteIds) as any });
        totalDeleted += deleteIds.length;
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      dryRun
        ? `DRY RUN complete. Would delete ${totalDeleted} players.`
        : `Done. Deleted ${totalDeleted} players. Updated ${totalUpdatedRefs} referencing rows.`,
    );
  }
}

