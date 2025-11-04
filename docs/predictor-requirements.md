## Predictor Feature - Requirements Specification

### Overview
The Predictor feature allows users to forecast outcomes throughout a tournament: Group Stage → Round of 16 → Quarterfinals → Semifinals → Final. Users must complete predictions for the current stage before progressing to the next. Sports data, including leagues, seasons, stages, groups, fixtures, and teams, is sourced from Sportmonks Football API v3.

This feature must support multiple competitions (e.g., AFCON, FIFA World Cup 2026, UEFA Champions League) and adapt to each competition’s stage structure and seeding rules.

### Goals
- Provide a guided, stage-by-stage prediction flow with gating (cannot proceed until the current stage is complete).
- Support multiple leagues/seasons with a configurable “active” league/season and the ability to switch when needed.
- Use Sportmonks v3 data to populate stages, groups, fixtures, and teams.
- Persist user predictions and enforce validation and uniqueness rules.
- Expose APIs for clients to create, read, and manage predictions and to fetch synced tournament data.

### Out of Scope (initial release)
- Scoring calculation and points attribution based on real results.
- Leaderboards and social features.
- Admin UI for manual overrides.

### Assumptions
- The backend can define a single “main” league/season at a time via settings, but the system design will allow switching the active league/season and preserving historical predictions per season.
- Bracket seeding for knockout rounds follows the competition’s official rules; where seeding rules vary by competition, mappings will be driven from Sportmonks data and/or configuration.
- There is a global tournament lock at the kickoff of the first game of the tournament; after this moment, users may still edit their choices in the UI, but only their last snapshot before lock is eligible for scoring.

### User Roles
- User: creates and views their predictions.
- Admin: triggers data syncs; sets/changes the active league/season; views aggregated data.

### User Stories
- As a user, I can see the current active league/season, stages, and my progress so I know what I can predict next.
- As a user, I can predict each group’s final table (at least winner and runner‑up) in the Group Stage.
- As a user, I cannot access Round of 16 predictions until I have submitted predictions for all groups.
- As a user, I can view the Round of 16 bracket seeded from my group predictions (and/or official seeding rules) and pick winners for each tie.
- As a user, when the tournament uses best third‑placed qualifiers, I can rank third‑placed teams across groups, and the system will automatically determine how many third‑placed teams qualify based on the number of groups and the Round of 16 size.
- As a user, once I complete the Round of 16, I can predict Quarterfinal winners, then Semifinal winners, and finally the champion.
- As a user, I can edit a prediction until the applicable lock time; after lock, the prediction is read‑only.
- As a user, I can view all of my predictions by stage and see lock status and deadlines.
- As an admin, I can sync stages, groups, teams, and fixtures from Sportmonks for the active season.
- As an admin, I can set the active league/season (e.g., switch from AFCON to World Cup 2026) without losing historical data.

### Functional Requirements
1) Data sync and configuration
- The system must sync stages, groups, teams, and fixtures for the active season from Sportmonks v3.
- The system must store stage metadata (id, name, code, start/end, finished flags) and groups (id, name, teams) locally.
- The system must persist teams used in predictions (to ensure referential integrity and future scoring).
- The active league/season is defined in settings and used by sync and default API queries.

2) Prediction flow and gating
- Group Stage:
  - Users submit one prediction per group per stage, specifying winner and runner‑up (and optionally full ordering as needed by UI).
  - Users must complete predictions for all groups before Round of 16 becomes available for that season.
- Knockout rounds (R16 → QF → SF → Final):
  - Users submit a winner for each fixture node in the bracket for the given round.
  - Users must complete the current knockout round before the next round becomes available.
  - Bracket seeding is derived from group predictions and/or official tournament mapping rules. For competitions where Sportmonks provides bracket relationships, the system should map them directly; otherwise we’ll provide a configuration map per competition.
  - Competitions with fewer than eight groups may advance best third‑placed teams per official rules; the seeding map must incorporate third‑placed qualifiers and their tie‑break criteria.
  - For best third‑placed qualifiers, the user submits only an ordered ranking of third‑placed teams across all groups. The server derives the number of qualifier slots from competition structure (e.g., with 6 groups, 12 auto‑qualifiers from 1st/2nd places, leaving 4 slots for best third‑placed teams).

3) Validation and uniqueness
- A user may submit only one prediction per group for a given stage/season.
- Winner and runner‑up selections must be among the teams in the group.
- Winner must match the first position and runner‑up the second position in a submitted ordering when applicable.
- Knockout round predictions must only select contenders valid for each bracket node.
- Stage progression rules must be enforced for every write operation; attempts to predict a later round without completing prior rounds should be rejected.

4) Locking rules
- Global tournament lock: at the kickoff of the tournament’s first fixture, a scoring snapshot is taken. Only predictions as of this time are considered for points for the entire tournament.
- Post‑lock edits: Users can still update predictions in the app after the global lock, but these edits do not affect scoring for already snapshotted stages/fixtures.
- Optional per‑group/per‑fixture locks (for UX):
  - Group predictions may still be presented as locked at the first kickoff of that group for clarity.
  - Knockout predictions may still show lock times relative to fixture kickoff.

5) Multi‑league support
- All predictions are scoped by league and season.
- Switching the active league/season does not affect existing predictions; APIs must allow querying by season where needed.

### Data Model (proposed/actual)
Existing (in code):
- `Stage` (id, name, code, externalLeagueId, externalSeasonId, finished, startingAt, endingAt)
- `Group` (id, externalStageId, name, teams[])
- `FootballTeam` (id, name, short, logo)
- `Prediction` (owner, stageId, groupId, teams[], winner, runnerUp)

Gaps and additions (proposed):
- `FixturePrediction` (owner, fixtureId/externalFixtureId, roundCode, winnerTeamId, snapshotEligible: boolean, lockedAt)
- `StageProgress` (owner, seasonId, stageCode, status: incomplete|complete, completedAt, snapshotEligible: boolean)
- `TournamentSnapshot` (seasonId, takenAt, ruleVersion) to represent the global lock snapshot.
- Add season/league scoping on `Prediction` where needed (e.g., `externalSeasonId`).
- Store bracket structure mapping per season if not fully derivable from Sportmonks, including third‑placed qualifiers logic and tie‑break criteria.
- `PlacementPrediction` for 3rd‑place match (owner, fixtureId/externalFixtureId, predictedTeamId).
- `ThirdPlaceQualifiersInput` (owner, seasonId, ranking: teamId[]) capturing the user’s ordered list of third‑placed teams; server determines slots from competition structure.

### API Endpoints (HTTP, draft)
- Predictor
  - POST `/predictor` → Create/overwrite group prediction for a specific group in the Group Stage (validate uniqueness; allow pre‑lock update if we choose to make idempotent).
  - GET `/predictor/me/:stageId` → Get current user’s predictions for a stage.
  - GET `/predictor/progress/:seasonId` → Get the user’s stage completion state and next actionable stage.
  - POST `/predictor/bracket/:roundCode` → Create/update knockout round predictions for provided bracket nodes.
  - POST `/predictor/third-place` → Create/update third‑place match prediction (if applicable).
  - POST `/predictor/third-placed-qualifiers` → Submit ordered ranking of third‑placed teams; server computes qualifier slots.

- Stages & Groups
  - GET `/stages` → List stages for active season.
  - GET `/stages/groups` → List groups for group stage with team arrays.
  - POST `/stages/sync` (admin) → Trigger full sync from Sportmonks for active season.

- Settings
  - GET `/settings/active-league` → Get active league/season.
  - POST `/settings/active-league` (admin) → Set active league/season.

Notes:
- Endpoints must validate lock state and stage progression on write.
- Responses should include lock deadlines and completion flags for client UX.

### Locking and Deadlines (draft rules)
- Global tournament snapshot occurs at the first fixture kickoff; only predictions at or before this time are counted for scoring across the tournament.
- Group Stage: optionally display group lock time at the kickoff of that group’s first fixture for clarity (UI/UX), but scoring relies on the global snapshot.
- Knockout rounds: optionally display per‑fixture lock times for clarity (UI/UX), but scoring eligibility remains based on the global snapshot rule unless configured otherwise.
- Admins can optionally trigger a manual snapshot/lock in emergencies (not required for MVP).

### Non‑Functional Requirements
- Security: JWT auth and per‑user access controls for predictions.
- Performance: Sync operations should be paginated/batched; bracket generation should be O(n) w.r.t. fixtures.
- Reliability: Handle Sportmonks API errors gracefully; retries and idempotency where appropriate.
- Observability: Log syncs, locks, and validation errors; include request tracing.

### Mapping to Current Implementation
Present (from codebase):
- Prediction creation for a stage/group exists: `POST /predictor` using `PredictorService.create` with zod validation and team verification.
- Duplicate prevention per user/group/stage is implemented.
- Stage and group syncing from Sportmonks exists (`StagesService.sync`, `syncStages`, `syncGroupsAndTeams`).
- Teams are persisted.

Missing or partial:
- No stage progression gating across Group → R16 → QF → SF → Final.
- No knockout round prediction model/endpoints.
- No explicit season/league scoping on predictions beyond `stageId` linkage.
- No locking logic based on fixture times.
- Minor: naming inconsistency (`PreditorModule` vs `PredictorModule`).

### Acceptance Criteria (MVP)
- Users can submit one prediction per group for the active season’s group stage (winner and runner‑up) before lock.
- Users cannot proceed to R16 predictions until all groups are predicted.
- Admin can sync stages/groups/teams from Sportmonks for the active season.
- APIs return user’s predictions per stage and progression state.

### Open Questions
- Scoring model and points per round (needed later for leaderboards)?
- Whether any competitions require partial re‑snapshots for later rounds; default is a single global snapshot.
- Exact tie‑break rules for third‑placed qualifiers per competition (points, GD, goals scored, fair play, draw).
- Seeding rules source of truth: always Sportmonks, or allow per‑competition overrides?
- Validation: server must enforce that submitted third‑placed ranking only includes actual third‑placed teams per the user’s group predictions; server will compute the official slot count based on groups and target round size.

### Glossary
- League: A competition (e.g., AFCON, FIFA World Cup, UCL).
- Season: A specific edition of a league (e.g., AFCON 2025, World Cup 2026).
- Stage: A tournament phase (group-stage, round-of-16, quarterfinals, semifinals, final).
- Group: Subdivision within the group stage containing multiple teams.
- Fixture: A match between two teams at a scheduled date/time.
- Bracket: The structure connecting knockout fixtures from one round to the next.
- Seeding: Rules that determine which teams meet in knockout rounds based on prior results.
- Lock: The time after which a prediction can no longer be modified.


