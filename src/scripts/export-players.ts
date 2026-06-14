import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Player } from '@/modules/players/entities/player.entity';
import { SportmonksCoreService } from '@/common/sportmonks/services/core.service';

interface ExportPlayersOptions {
  outFile?: string;
  resolveNames?: boolean;
}

type ExportedPlayer = {
  id: number;
  name: string;
  nationality: string | number | null;
};

@Command({
  name: 'players:export',
  description:
    'Export all players as { id, name, nationality } JSON. Nationality is resolved to the country name via SportMonks (use --no-resolve-names to emit raw countryId).',
})
export class ExportPlayersCommand extends CommandRunner {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly core: SportmonksCoreService,
  ) {
    super();
  }

  @Option({
    flags: '-o, --out-file [outFile]',
    description: 'Output file path (relative to repo root). Default: players-export.json',
  })
  parseOutFile(val?: string): string {
    return val || 'players-export.json';
  }

  @Option({
    flags: '--no-resolve-names',
    description: 'Emit raw countryId as nationality instead of resolving the country name.',
  })
  parseResolveNames(): boolean {
    return false;
  }

  private async buildCountryNameMap(): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    try {
      const countries = await this.core.getCountries();
      for (const c of countries) {
        if (c?.id != null) {
          map.set(c.id, c.name ?? c.official_name ?? String(c.id));
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `Could not fetch countries from SportMonks; falling back to countryId. ${
          (e as Error)?.message ?? e
        }`,
      );
    }
    return map;
  }

  async run(_: string[], options?: ExportPlayersOptions): Promise<void> {
    const outFile = options?.outFile ?? 'players-export.json';
    const resolveNames = options?.resolveNames !== false;

    const players = await this.db.getRepository(Player).find({
      select: ['id', 'name', 'countryId'],
      order: { id: 'ASC' },
    });

    const countryNames = resolveNames
      ? await this.buildCountryNameMap()
      : new Map<number, string>();

    const exported: ExportedPlayer[] = players.map((p) => ({
      id: p.id,
      name: p.name,
      nationality: resolveNames
        ? countryNames.get(p.countryId) ?? p.countryId ?? null
        : p.countryId ?? null,
    }));

    const outAbs = path.resolve(process.cwd(), outFile);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, JSON.stringify(exported, null, 2) + '\n', 'utf8');

    const unresolved = resolveNames
      ? exported.filter((e) => typeof e.nationality === 'number').length
      : 0;

    // eslint-disable-next-line no-console
    console.log(
      `Exported ${exported.length} players to ${outFile}` +
        (resolveNames ? ` (${unresolved} with unresolved country names)` : ''),
    );
  }
}
