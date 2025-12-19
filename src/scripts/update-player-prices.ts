import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { Player } from '@/modules/players/entities/player.entity';

type PriceRow = { id: number; price: number };

interface UpdatePlayerPricesOptions {
  file: string;
  dryRun: boolean;
  chunkSize: number;
}

@Command({
  name: 'players:update-prices',
  description:
    'Update Player.price from a JS file exporting arrays of { id, price } objects. Prices are interpreted as millions.',
})
export class UpdatePlayerPricesCommand extends CommandRunner {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  @Option({
    flags: '-f, --file [file]',
    description:
      'Path to the JS file containing exported arrays with { id, price }. Default: ./finalPlayers.js',
  })
  parseFile(val?: string) {
    return val || './finalPlayers.js';
  }

  @Option({
    flags: '--dry-run',
    description: 'Do not write to DB; only print what would change.',
    defaultValue: false,
  })
  parseDryRun() {
    return true;
  }

  @Option({
    flags: '--chunk-size [n]',
    description:
      'Batch size for DB updates (CASE expression per batch). Default: 200',
  })
  parseChunkSize(val?: string) {
    const n = val ? parseInt(val, 10) : 200;
    return Number.isFinite(n) && n > 0 ? n : 200;
  }

  async run(_passedParam: string[], options?: UpdatePlayerPricesOptions) {
    const file = options?.file || './finalPlayers.js';
    const dryRun = options?.dryRun ?? false;
    const chunkSize = options?.chunkSize ?? 200;

    const abs = path.isAbsolute(file)
      ? file
      : path.resolve(process.cwd(), file);
    const src = await readFile(abs, 'utf8');

    // finalPlayers.js uses ESM syntax (`export const ...`) but this repo runs CommonJS for the CLI.
    // Transform into a plain script that assigns to `exports` and evaluate it in a sandboxed context.
    const transformed = src.replace(
      /export\s+const\s+([A-Za-z0-9_$]+)\s*=/g,
      'exports.$1 =',
    );
    const sandbox = { exports: {} as Record<string, unknown> };
    vm.runInNewContext(transformed, sandbox, { filename: abs });
    const ns: any = sandbox.exports;
    const exportNames = Object.keys(ns);

    const rows: PriceRow[] = [];
    for (const name of exportNames) {
      const val = ns[name];
      if (!Array.isArray(val)) continue;
      for (const item of val) {
        if (!item || typeof item !== 'object') continue;
        const id = Number((item as any).id);
        const price = Number((item as any).price);
        if (!Number.isFinite(id) || !Number.isFinite(price)) continue;
        rows.push({ id, price });
      }
    }

    if (!rows.length) {
      console.log(`No {id, price} rows found in ${abs}`);
      return;
    }

    // Build a mapping externalId -> priceUnits
    // Note: `id` in finalPlayers.js is the Sportmonks player id. We match it to Player.externalId.
    const PRICE_MULTIPLIER = 1_000_000;
    const priceByExternalId = new Map<number, number>();
    const duplicates: Array<{ id: number; prices: number[] }> = [];

    for (const r of rows) {
      const externalId = r.id;
      const priceUnits = Math.round(r.price * PRICE_MULTIPLIER);

      if (priceByExternalId.has(externalId)) {
        const prev = priceByExternalId.get(externalId)!;
        if (prev !== priceUnits) {
          duplicates.push({
            id: externalId,
            prices: [prev, priceUnits].map((p) => p / PRICE_MULTIPLIER),
          });
        }
      }
      priceByExternalId.set(externalId, priceUnits);
    }

    if (duplicates.length) {
      console.warn(
        `Warning: found ${duplicates.length} duplicate player IDs with conflicting prices. Using the last occurrence.`,
      );
    }

    const externalIds = Array.from(priceByExternalId.keys());
    const playerRepo = this.db.getRepository(Player);

    // Load existing players for these external IDs
    const existingPlayers = await playerRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.externalId', 'p.price', 'p.name'])
      .where('p.externalId IN (:...ids)', { ids: externalIds })
      .getMany();

    const foundByExternalId = new Map<number, Player>();
    for (const p of existingPlayers) {
      if (p.externalId != null) foundByExternalId.set(p.externalId, p);
    }

    const missing = externalIds.filter((id) => !foundByExternalId.has(id));

    // Determine which would change
    const toUpdate = existingPlayers
      .map((p) => {
        const target =
          p.externalId != null
            ? priceByExternalId.get(p.externalId)
            : undefined;
        return {
          externalId: p.externalId!,
          name: p.name,
          current: Number(p.price) || 0,
          next: target ?? (Number(p.price) || 0),
        };
      })
      .filter((x) => x.current !== x.next);

    console.log(
      JSON.stringify(
        {
          file: abs,
          exportsScanned: exportNames.length,
          rowsFound: rows.length,
          uniquePlayersInFile: priceByExternalId.size,
          matchingPlayersInDb: existingPlayers.length,
          missingPlayersInDb: missing.length,
          willUpdate: toUpdate.length,
          dryRun,
          chunkSize,
        },
        null,
        2,
      ),
    );

    if (missing.length) {
      console.warn(
        `Missing ${missing.length} players in DB (no Player.externalId match). Example IDs: ${missing
          .slice(0, 20)
          .join(', ')}`,
      );
    }

    if (dryRun || !toUpdate.length) return;

    // Batch update via CASE expression to reduce round-trips
    const chunks: Array<Array<{ externalId: number; next: number }>> = [];
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
      chunks.push(
        toUpdate.slice(i, i + chunkSize).map((x) => ({
          externalId: x.externalId,
          next: x.next,
        })),
      );
    }

    await this.db.transaction(async (em) => {
      const repo = em.getRepository(Player);
      for (const chunk of chunks) {
        const ids = chunk.map((c) => c.externalId);
        const whenThen = chunk
          .map((c) => `WHEN ${c.externalId} THEN ${c.next}`)
          .join(' ');
        const caseExpr = `CASE "externalId" ${whenThen} ELSE "price" END`;

        await repo
          .createQueryBuilder()
          .update(Player)
          .set({ price: () => caseExpr })
          .where('"externalId" IN (:...ids)', { ids })
          .execute();
      }
    });

    console.log(`Updated ${toUpdate.length} players.`);
  }
}
