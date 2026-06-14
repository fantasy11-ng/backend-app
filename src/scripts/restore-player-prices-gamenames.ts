import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Player } from '@/modules/players/entities/player.entity';

type BackupRow = {
  externalId?: number | null;
  name?: string | null;
  price?: number | null;
  gameName?: string | null;
};

interface RestoreOptions {
  file: string;
  dryRun: boolean;
}

@Command({
  name: 'players:restore-prices-gamenames',
  description:
    'Restore Player.price and Player.gameName from a pre-wipe backup JSON, matching by externalId (SportMonks player id).',
})
export class RestorePlayerPricesGameNamesCommand extends CommandRunner {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  @Option({
    flags: '-f, --file [file]',
    description:
      'Path to the backup JSON containing { player: [{ externalId, price, gameName }] }. Default: ./player_202606031503.json',
  })
  parseFile(val?: string): string {
    return val || './player_202606031503.json';
  }

  @Option({
    flags: '--dry-run',
    description: 'Do not write to DB; only print what would change.',
    defaultValue: false,
  })
  parseDryRun(): boolean {
    return true;
  }

  async run(_: string[], options?: RestoreOptions): Promise<void> {
    const dryRun = !!options?.dryRun;
    const filePath = path.resolve(process.cwd(), options?.file ?? './player_202606031503.json');

    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { player?: BackupRow[] };
    const rows = parsed.player ?? [];

    const backupByExt = new Map<number, BackupRow>();
    for (const r of rows) {
      if (r.externalId != null) backupByExt.set(Number(r.externalId), r);
    }

    // eslint-disable-next-line no-console
    console.log(
      `Loaded ${rows.length} backup rows (${backupByExt.size} with externalId) from ${options?.file}`,
    );

    const playersRepo = this.db.getRepository(Player);
    const players = await playersRepo.find();

    let matched = 0;
    let priceUpdates = 0;
    let gameNameUpdates = 0;
    let unmatched = 0;

    const toSave: Player[] = [];

    for (const p of players) {
      const backup = p.externalId != null ? backupByExt.get(p.externalId) : undefined;
      if (!backup) {
        unmatched++;
        continue;
      }
      matched++;

      let changed = false;
      if (backup.price != null && backup.price !== p.price) {
        p.price = backup.price;
        priceUpdates++;
        changed = true;
      }
      if (backup.gameName != null && backup.gameName !== p.gameName) {
        p.gameName = backup.gameName;
        gameNameUpdates++;
        changed = true;
      }
      if (changed) toSave.push(p);
    }

    // eslint-disable-next-line no-console
    console.log(
      `DB players: ${players.length} | matched by externalId: ${matched} | unmatched (left as-is): ${unmatched}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `Would update: price=${priceUpdates}, gameName=${gameNameUpdates} (rows touched: ${toSave.length})`,
    );

    if (dryRun) {
      // eslint-disable-next-line no-console
      console.log('DRY RUN: no changes written.');
      const sample = toSave.slice(0, 10).map((p) => ({
        externalId: p.externalId,
        name: p.name,
        price: p.price,
        gameName: p.gameName,
      }));
      // eslint-disable-next-line no-console
      console.log('Sample of changes:', JSON.stringify(sample, null, 2));
      return;
    }

    if (toSave.length) {
      await playersRepo.save(toSave, { chunk: 200 });
    }

    // eslint-disable-next-line no-console
    console.log(
      `Done. Updated ${toSave.length} players (price=${priceUpdates}, gameName=${gameNameUpdates}).`,
    );
  }
}
