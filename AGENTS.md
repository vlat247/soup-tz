# Project instructions

## Read before implementation

Read `docs/BUILD_APPROACH.md` for the current build direction, `docs/PRD.md` for acceptance criteria, and `docs/TRD.md` for precise contracts and verification. The user asked to preserve this direction for future sessions. Keep these documents consistent when a later user decision changes the approach.

The project currently contains a Next.js scaffold, specifications, and a deterministic 20-run fixture generator with source-data tests. See `docs/MOCK_DATA.md` for its API and inspection commands. Do not describe planned monitor features, chart behavior tests, measurements, or deployment as completed.

## Implementation principles

- Prefer ordinary loops, small pure functions, and explicit rules. Add complexity only for a demonstrated correctness or performance need.
- Preserve full-resolution source observations. Validate steps, sort numerically, and resolve duplicate groups independently for each metric. Collapse identical readings; expose conflicting values and their finite extrema rather than choosing an arbitrary winner.
- Preserve NaN, infinity, missing-value, and known-cadence gap semantics. Break the affected line; never turn invalid values into zero or reconnect through a removed invalid reading.
- Reduce each metric separately using first/minimum/maximum/last per continuous segment and visible pixel bucket. Keep original steps/values and chronological order. Recompute from source on zoom/resize.
- Use raw data for exact summaries, axis bounds, and inspection. Keep latest invalid/conflict states distinct from an earlier valid reading.
- Use Apache ECharts with its Canvas renderer (user decision on 10 November 2026), linear axes, no smoothing, and accessible HTML controls/inspection. Disable built-in lossy sampling and feed our independently reduced points with explicit breaks. Use a worker for the million-point path and retain a truthful raw rendering mode for baseline comparisons. Keep full datasets out of React state.
- Guard async results with run/version/request identity, including viewport and hover revisions. Plot-width changes also increment the viewport revision. Keep axes and plotted data in the same revision.
- Preserve correctness evidence, failed results, production traces at 4x CPU throttling, and real tab-memory measurements. Never invent results or claim all local peaks survive reduction.

## Working commands

Use Node.js 24.x and npm. `npm run check` runs lint, strict type checking, fixture tests, and a production build. `npm run data:inspect` reports all 20 source fixtures. Add meaningful chart behavior tests with the monitor implementation; documentation-only updates do not require rebuilding the app.
