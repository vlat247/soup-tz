# Project instructions

## Read before implementation

Read `docs/BUILD_APPROACH.md` for the current build direction, `docs/PRD.md` for acceptance criteria, and `docs/TRD.md` for precise contracts and verification. The user asked to preserve this direction for future sessions. Keep these documents consistent when a later user decision changes the approach.

The project contains a Next.js dashboard, 20 deterministic fixtures, typed-array preparation and exact summaries, viewport reduction, a worker, a generated catalog, and source/numerical-engine tests. Apache ECharts renders reduced results; the UI includes run search/filter/sort, shared ranges, quality details, and exact source/column inspection. The latest `evidence/silent-failers/verification.md` records 585 passing tests, source validation, nine Node locale/time-zone cases, and targeted development-browser fault/recovery checks. Earlier downsampling/chart evidence remains historical. See `docs/MOCK_DATA.md` for fixtures. Do not describe a completed browser baseline, before/after 4x CPU traces, tab-memory measurements, comprehensive browser automation, full router/locale/accessibility coverage, or deployment as delivered. Browser QA evidence must state the checks actually performed.

## Implementation principles

Runtime validation lives in `model/validate-source.ts` and `model/validate-view.ts`. Malformed structures must not be coerced into telemetry; NaN/infinity/missing/duplicate data remains inspectable. Keep source/reply guards separate from the independent raw-source oracle. `data:validate -- --run <id>` and `--seed <uint32>` replay cases with bounded inspection coverage. The latest audit covers 60 cases, 300 viewports, 900 metric results and 3,891 inspection groups/pages; all 20 fixture fingerprints remain unchanged.

- Use the user's black `#000000`, cream `#E6D5B7`, and orange `#F54F1B` interface palette and supplied slash icon. Chart panels are lighter charcoal with distinct orange, blue, and mint lines, as requested. Keep copy only where it helps navigate, interpret data, or act. Preserve warnings and accessible descriptions; see the visual direction in `docs/BUILD_APPROACH.md`.
- Prefer ordinary loops, small pure functions, and explicit rules. Add complexity only for a demonstrated correctness or performance need.
- Preserve full-resolution source observations. Validate steps, sort numerically, and resolve duplicate groups independently for each metric. Collapse identical readings; expose conflicting values and their finite extrema rather than choosing an arbitrary winner.
- Preserve NaN, infinity, missing-value, and known-cadence gap semantics. Break the affected line; never turn invalid values into zero or reconnect through a removed invalid reading.
- Reduce each metric separately using first/minimum/maximum/last per continuous segment and visible pixel bucket. Keep original steps/values and chronological order. Recompute from source on zoom/resize. Share canonical viewport geometry through `model/buckets.ts`; integer source membership uses exact quotient/remainder thresholds, with independent BigInt test oracles rather than the same floating formula.
- Use raw valid-step observations for exact metric summaries, axis bounds, and inspection; preserve rejected-step rows separately and disclose their count. Include finite duplicate-conflict extremes. Keep latest invalid/conflict states distinct from an earlier valid reading.
- Query column facts from original source rows at the requested position, not the nearest observed step. Preserve empty columns, distinguish missing readings from intersecting known gaps, and keep output bounded. Column geometry uses the shared reduction budget; it is not necessarily one physical pixel on every chart. Zoom/resize clears old column context.
- Use Apache ECharts with its Canvas renderer (user decision on 10 November 2026), linear axes, no smoothing, and accessible HTML controls/inspection. Disable built-in lossy sampling and feed our independently reduced points with explicit breaks. Use a worker for the million-point path and retain a truthful raw rendering mode for baseline comparisons. Keep full datasets out of React state.
- Guard async results with run/version/request identity, including viewport and hover revisions. Plot-width changes also increment the viewport revision. Keep axes and plotted data in the same revision. Sent requests have a 30-second response deadline; failure stops the session, preserves a labelled complete snapshot when available, and requires manual retry. Canceled or stale callbacks cannot restore data. Timers may fire late in suspended/background tabs.
- Recover renderer failures visibly: remove the failed surface and selected-step guide, retain source inspection and other metrics, and retry explicitly. Zero-sized charts release their surface and draw the latest model when space returns. Exact text preserves signed zero; scientific labels must not round finite values to overflowing numbers. Tagged summary export rejects unexpected untagged nonfinite numbers.
- Preserve correctness evidence, failed results, production traces at 4x CPU throttling, and real tab-memory measurements. Never invent results or claim all local peaks survive reduction.

## Working commands

Use Node.js 24.x and npm. `npm run check` runs lint, strict types, unit tests, catalog consistency and a production build. `data:inspect` reports all fixtures; `data:validate` independently checks source summaries, provenance, gaps and reduced viewports. `validate:presentation` checks nine fresh Node locale/time-zone processes; it does not test browser environments. `bench:reduction` measures synchronous Node engine work only. Regenerate the catalog with `data:catalog` after source/summary changes and verify with `data:catalog:check`. Numerical tests do not establish painted chart truthfulness. `/diagnostics/charts` and `/diagnostics/silent-failures` are development-only correctness aids; the latter wraps the real dashboard worker/renderer with controlled faults. Documentation-only changes do not require rebuilding.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
