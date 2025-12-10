import { Player } from '@/modules/players/entities/player.entity';
import { PositionCode } from './fantasy.types';
import { FantasyConfig } from '@/common/config/fantasy.config';

export function mapPlayerToPositionCode(player: Player): PositionCode {
  const rawCode = player.position?.code ?? '';
  const code = rawCode.toString().toUpperCase();
  const dev = player.position?.developer_name?.toLowerCase() ?? '';

  // Goalkeepers
  if (
    code === 'G' ||
    code === 'GK' ||
    code === 'GOALKEEPER' ||
    dev.includes('goalkeeper')
  )
    return 'GK';

  // Defenders
  if (
    code === 'D' ||
    code === 'DF' ||
    code === 'DEF' ||
    code === 'DEFENDER' ||
    dev.includes('defender')
  )
    return 'DEF';

  // Midfielders
  if (
    code === 'M' ||
    code === 'MF' ||
    code === 'MID' ||
    code === 'MIDFIELDER' ||
    dev.includes('midfielder')
  )
    return 'MID';

  // Forwards / Attackers
  if (
    code === 'F' ||
    code === 'FW' ||
    code === 'FWD' ||
    code === 'ATTACKER' ||
    dev.includes('forward') ||
    dev.includes('striker') ||
    dev.includes('attacker')
  )
    return 'FWD';

  // Fallback: treat unknown as MID to avoid blocking
  return 'MID';
}

export function getFormationDef(config: FantasyConfig, formation: string) {
  const def = config.formations.find((f) => f.code === formation);
  if (!def) throw new Error(`Unsupported formation: ${formation}`);
  return def;
}
