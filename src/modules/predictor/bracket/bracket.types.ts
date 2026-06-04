/**
 * BracketSource describes where a team slot for one side of a match comes from.
 * This lets the BracketEngine resolve concrete team IDs without hard-coding
 * round-specific assumptions.
 */

/** A group winner (place=1), runner-up (place=2), or third-place (place=3). */
export interface GroupPlacementSource {
  type: 'groupPlacement';
  /** Group letter, e.g. 'A', 'B', ..., 'L' */
  group: string;
  /** 1 = winner, 2 = runner-up, 3 = third place */
  place: 1 | 2 | 3;
}

/**
 * The third-place team from a specific group as resolved by the Annex C table.
 * The engine looks up which group's 3rd-placed team fills this slot based
 * on the combination of qualifying third-placed groups.
 *
 * `slotKey` is the label used in Annex C columns: '1A', '1B', '1D', '1E',
 * '1G', '1I', '1K', '1L' (the group winners those third-placers play against).
 */
export interface ThirdPlaceAnnexCSource {
  type: 'thirdPlaceAnnexC';
  /** The Annex C column label for this slot, e.g. '1A' or '1G'. */
  slotKey: string;
  /** Name of the Annex C table to use (e.g. 'wc2026'). */
  annexTable: string;
}

/** Winner of a specific match (by index) in a previous round. */
export interface WinnerOfSource {
  type: 'winnerOf';
  /** The round code of the previous round, e.g. 'r32', 'r16', 'qf', 'sf'. */
  round: string;
  /** Zero-based index of the match within that round's ordered match list. */
  matchIndex: number;
}

/** Loser of a specific match (by index) in a previous round (for third-place match). */
export interface LoserOfSource {
  type: 'loserOf';
  round: string;
  matchIndex: number;
}

export type BracketSource =
  | GroupPlacementSource
  | ThirdPlaceAnnexCSource
  | WinnerOfSource
  | LoserOfSource;

/** A single match template within a BracketSpec. */
export interface BracketMatch {
  home: BracketSource;
  away: BracketSource;
}

/**
 * A complete specification for one bracket round.
 * Both the WC32 and WC2026 specs implement this shape; the BracketEngine
 * resolves sources against live prediction data to produce concrete pairs.
 */
export interface BracketSpec {
  /** Predictor round code, e.g. 'r32', 'r16', 'qf', 'sf', 'final', 'third-place'. */
  roundCode: string;
  /** Ordered list of match templates. Index must match fixture ordering in DB. */
  matches: BracketMatch[];
  /** Expected number of user predictions (= matches.length for most rounds). */
  expectedPredictionCount: number;
}

/** A resolved match pair with concrete team IDs (null when source not yet resolved). */
export interface ResolvedPair {
  fixtureId: number | null;
  home: ResolvedTeam;
  away: ResolvedTeam;
}

export interface ResolvedTeam {
  id: number;
  name: string;
  short: string;
  logo: string;
}

/** The full resolved result for a round seed. */
export interface ResolvedRound {
  round: string;
  participants: number[];
  pairs: ResolvedPair[];
  /** Present only for first knockout round; shows where teams come from. */
  qualified?: {
    winners: number[];
    runnersUp: number[];
    thirdQualified: number[];
  };
}

/**
 * Data the BracketEngine needs to resolve sources.
 * All fields are keyed by group letter (uppercase, e.g. 'A') or match index.
 */
export interface BracketContext {
  /** Map from group letter to winner team ID. */
  winnerByGroup: Record<string, number>;
  /** Map from group letter to runner-up team ID. */
  runnerUpByGroup: Record<string, number>;
  /** Map from group letter to third-place team ID. */
  thirdByGroup: Record<string, number>;
  /**
   * Ordered list of group letters whose 3rd-placed teams qualified.
   * The user submits a ranking; after slicing to the required slots these are
   * sorted by rank (best first). This is used for Annex C lookups.
   */
  thirdQualifiedGroups: string[];
  /**
   * Map from round code → list of winner IDs (ordered by matchIndex).
   * Populated as the engine resolves successive rounds.
   */
  winnersByRound: Record<string, number[]>;
  /**
   * Map from round code → list of loser IDs (ordered by matchIndex).
   * Used for third-place match resolution.
   */
  losersByRound: Record<string, number[]>;
}
