export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';

export enum FantasyEventType {
  TRANSFER = 'TRANSFER',
  BENCH_SWAP = 'BENCH_SWAP',
  ROLE_CHANGE = 'ROLE_CHANGE',
  FORMATION_CHANGE = 'FORMATION_CHANGE',
}

export enum TransferType {
  INITIAL = 'INITIAL',
  NORMAL = 'NORMAL',
}

export enum FantasyBoostType {
  MAX_CAPTAIN = 'MAX_CAPTAIN',
  TRIPLE_CAPTAIN = 'TRIPLE_CAPTAIN',
  SAVES_BOOST = 'SAVES_BOOST',
}

/** Human-readable labels for boost types (used by the "Your Activity" panel). */
export const FANTASY_BOOST_LABELS: Record<FantasyBoostType, string> = {
  [FantasyBoostType.MAX_CAPTAIN]: 'Maximum Captain Boost',
  [FantasyBoostType.TRIPLE_CAPTAIN]: 'Triple Captain Boost',
  [FantasyBoostType.SAVES_BOOST]: 'Saves Boost',
};

export enum FantasyGameweekPhase {
  GROUP = 'GROUP',
  KNOCKOUT = 'KNOCKOUT',
}
