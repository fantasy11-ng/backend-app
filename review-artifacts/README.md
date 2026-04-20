### Player review JSON artifacts

This folder is **not used by the runtime API**. It exists to support team review of available player stats and derived metrics.

### What’s in here

- `player-review.schema.json`: field inventory + origins + formulas
- `player-review.sample.example.json`: example structure (placeholder values)

### Generate a live sample from your DB

Run:

```bash
yarn cli review:export-player-stats --outputDir review-artifacts
```

Optional:

```bash
yarn cli review:export-player-stats --outputDir review-artifacts --playerId 123 --maxRecentFixtures 10
```

Outputs (written into this folder):
- `player-review.sample.json`
- `player-review.schema_and_live_sample.json`

