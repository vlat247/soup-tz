# Project instructions

## Read before implementation

Read `docs/BUILD_APPROACH.md` for the current build direction, `docs/PRD.md` for acceptance criteria, and `docs/TRD.md` for precise contracts and verification. The user asked to preserve this direction for future sessions. Keep these documents consistent when a later user decision changes the approach.

The project contains a Next.js dashboard, a deterministic 20-run fixture generator, typed-array normalization and exact summaries, viewport reduction, a worker, a generated list catalog, and source/numerical-engine tests. Apache ECharts renders the reduced results; the UI includes run search/filter/sort, shared range controls, data-quality details, paginated source inspection, and original extrema/quality counts for the selected reduction column. Pure session tests cover async identity/coalescing, and ECharts SSR geometry tests cover extreme numeric domains. `evidence/downsampling/verification.md` records the latest 525-test checkpoint, independent source audit, targeted Canvas browser checks and isolated Node engine benchmark with their limits. Earlier chart and data-validation records remain historical evidence. See `docs/MOCK_DATA.md` for fixture usage. Do not describe a completed browser baseline renderer, before/after 4x CPU traces, tab-memory measurements, comprehensive browser automation, or deployment as delivered. Browser QA evidence must state the checks actually performed.

## Implementation principles

Runtime validation lives in `model/validate-source.ts` and `model/validate-view.ts`. Malformed structures must not be coerced into valid telemetry, while NaN/infinity/missing/duplicate data remains inspectable. Keep source/reply guards separate from the independent raw-source oracle. `data:validate -- --run <id>` and `data:validate -- --seed <uint32>` replay individual cases; the versioned report preserves failures and reports bounded inspection coverage. The latest downsampling audit covers 60 cases, 300 viewports, 900 metric results and 3,891 exact inspection groups/pages; all 20 fixture fingerprints remain unchanged.

- Use the user's black `#000000`, cream `#E6D5B7`, and orange `#F54F1B` interface palette and supplied slash icon. Chart panels are lighter charcoal with distinct orange, blue, and mint lines, as requested. Keep copy only where it helps navigate, interpret data, or act. Preserve warnings and accessible descriptions; see the visual direction in `docs/BUILD_APPROACH.md`.
- Prefer ordinary loops, small pure functions, and explicit rules. Add complexity only for a demonstrated correctness or performance need.
- Preserve full-resolution source observations. Validate steps, sort numerically, and resolve duplicate groups independently for each metric. Collapse identical readings; expose conflicting values and their finite extrema rather than choosing an arbitrary winner.
- Preserve NaN, infinity, missing-value, and known-cadence gap semantics. Break the affected line; never turn invalid values into zero or reconnect through a removed invalid reading.
- Reduce each metric separately using first/minimum/maximum/last per continuous segment and visible pixel bucket. Keep original steps/values and chronological order. Recompute from source on zoom/resize. Share canonical viewport geometry through `model/buckets.ts`; integer source membership uses exact quotient/remainder thresholds, with independent BigInt test oracles rather than the same floating formula.
- Use raw valid-step observations for exact metric summaries, axis bounds, and inspection; preserve rejected-step rows separately and disclose their count. Include finite duplicate-conflict extremes. Keep latest invalid/conflict states distinct from an earlier valid reading.
- Query column facts from original source rows at the requested position, not the nearest observed step. Preserve empty columns, distinguish missing readings from intersecting known gaps, and keep output bounded. Column geometry uses the shared reduction budget; it is not necessarily one physical pixel on every chart. Zoom/resize clears old column context.
- Use Apache ECharts with its Canvas renderer (user decision on 10 November 2026), linear axes, no smoothing, and accessible HTML controls/inspection. Disable built-in lossy sampling and feed our independently reduced points with explicit breaks. Use a worker for the million-point path and retain a truthful raw rendering mode for baseline comparisons. Keep full datasets out of React state.
- Guard async results with run/version/request identity, including viewport and hover revisions. Plot-width changes also increment the viewport revision. Keep axes and plotted data in the same revision.
- Preserve correctness evidence, failed results, production traces at 4x CPU throttling, and real tab-memory measurements. Never invent results or claim all local peaks survive reduction.

## Working commands

Use Node.js 24.x and npm. `npm run check` runs lint, strict type checking, unit tests, catalog consistency, and a production build. `npm run data:inspect` reports all 20 source fixtures; `npm run data:validate` independently checks source summaries, provenance, gaps and reduced viewports for all fixtures plus seeded adversarial cases. `npm run bench:reduction` measures synchronous Node engine work only; it excludes browser rendering, worker messaging and tab memory. Regenerate the catalog with `npm run data:catalog` after changing source or summary semantics; `npm run data:catalog:check` verifies it. Add meaningful browser checks for rendering and interactions; numerical tests alone do not establish painted chart truthfulness. `/diagnostics/charts` provides small edge-case fixtures in development and returns 404 in production. Documentation-only updates do not require rebuilding the app.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
