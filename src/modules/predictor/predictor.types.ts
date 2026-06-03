export type PredictionState = 'not_started' | 'in_progress' | 'complete';

export interface PredictionStatusSection {
  /** Stable section identifier, e.g. 'group-stage', 'r32', 'final'. */
  key: string;
  /** Human-readable label for display. */
  label: string;
  /** Number of required predictions the user has submitted for this section. */
  completed: number;
  /** Total number of predictions required for this section. */
  total: number;
}

export interface PredictionStatusProgress {
  completed: number;
  total: number;
  /** Completion percentage (0–100), rounded to the nearest integer. */
  percent: number;
}

export interface PredictionStatus {
  state: PredictionState;
  progress: PredictionStatusProgress;
  sections: PredictionStatusSection[];
}

export type MatchStatus = 'correct' | 'incorrect' | 'pending';

export interface SummaryTeam {
  id: number;
  name: string;
  short: string;
  logo: string;
}

export interface SummaryMatch {
  fixtureId: number;
  predictedWinner: SummaryTeam | null;
  actualWinner: SummaryTeam | null;
  status: MatchStatus;
}

export interface PredictionSummaryStage {
  key: string;
  label: string;
  correctTeams: number;
  totalTeams: number;
  /** Accuracy as a percentage (0–100) over resolved matches. */
  accuracy: number;
  points: number;
}

export interface PredictionSummaryMatch extends SummaryMatch {
  round: string;
  label: string;
}

export interface PredictionSummary {
  overall: {
    points: number;
    correctTeams: number;
    totalTeams: number;
    accuracy: number;
  };
  stages: PredictionSummaryStage[];
  matches: PredictionSummaryMatch[];
}

/** Display labels for predictor round codes. */
export const ROUND_LABELS: Record<string, string> = {
  r64: 'Round of 64',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-Finals',
  sf: 'Semi-Finals',
  'third-place': 'Third Place',
  final: 'Final',
};
