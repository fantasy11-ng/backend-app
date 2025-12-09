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

export enum FantasyGameweekPhase {
  GROUP = 'GROUP',
  KNOCKOUT = 'KNOCKOUT',
}
