import { z } from 'zod';

export const fixtureStatusValues = ['all', 'played', 'upcoming', 'live'] as const;
export type FixtureStatus = (typeof fixtureStatusValues)[number];

export const fixtureSortValues = [
  'startingAt:ASC',
  'startingAt:DESC',
] as const;

export const queryFixturesDtoSchema = z.object({
  // played | upcoming | live | all (default: all)
  status: z.enum(fixtureStatusValues).default('all'),

  // Knockout round code (r32, r16, qf, sf, final, third-place) or 'group-stage'.
  // Resolved to a stageId internally.
  round: z.string().trim().optional(),

  // Direct stage / gameweek / group filters (external ids)
  stageId: z.coerce.number().int().optional(),
  gameweekId: z.coerce.number().int().optional(),
  groupId: z.coerce.number().int().optional(),

  // Override season (defaults to the active main-league season)
  seasonId: z.coerce.number().int().optional(),

  // Filter by a participating team (external football team id)
  teamId: z.coerce.number().int().optional(),

  // Free-text search over fixture name (e.g. "France")
  search: z.string().trim().optional(),

  sort: z.enum(fixtureSortValues).default('startingAt:ASC'),

  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type QueryFixturesDto = z.infer<typeof queryFixturesDtoSchema>;
