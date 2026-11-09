# soup-tz

Next.js training-run monitor for the Soup Frontend Engineer take-home task, with explicit data-quality handling and source-based chart reduction.

The dashboard includes a searchable, sortable run browser; loss, learning-rate, and gradient-norm charts; whole-run summaries; data-quality details; shared zoom controls; and an exact observation inspector. Twenty deterministic synthetic runs include broken telemetry and a million-point spike case. Apache ECharts renders linear, unsmoothed plots from independently reduced data, while a dedicated worker retains the full source observations.

Independent source validation checks summaries, domains, provenance, segment breaks, and retained extrema against raw-column scans. Deterministic fake-worker tests cover run changes, overlapping zoom/resize/inspection, failures, retry, and retained snapshots. Chart-model tests exercise the installed ECharts coordinate engine with tiny, adjacent, and extreme finite values. The [chart verification record](evidence/charts/verification.md) includes the passing integration check, targeted 360/768/1440px browser observations, pagination, production smoke checks, and reviewed diagnostic screenshots, alongside earlier [dashboard verification](evidence/dashboard-ui/verification.md). These checks are not a release certification: a browser baseline renderer, matched before/after traces at 4x CPU throttling, tab-memory measurements, full browser fault injection and assistive-technology coverage, and deployment remain outstanding.

## Requirements documents

- [Build approach](docs/BUILD_APPROACH.md): the current implementation direction, data rules, and build sequence. Start here.
- [Product requirements](docs/PRD.md): scope, user journeys, acceptance criteria, and delivery requirements.
- [Technical requirements](docs/TRD.md): data contracts, chart correctness, architecture, testing, and performance measurement.
- [Mock data](docs/MOCK_DATA.md): fixture allocation, generator usage, anomaly locations, and inspection commands.
- [PRD progress audit](docs/PRD_AUDIT.md): implemented criteria, evidence, and remaining delivery gates.

The detailed PRD and TRD are working specifications. They do not replace the assignment's separate submission note of at most two pages.

`AGENTS.md` preserves the project direction for future coding sessions and points to these documents.

## Run locally

Use Node.js 24.x and npm. With nvm installed:

```sh
nvm use
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The application opens `/runs/run-001`; each of the 20 runs has a direct URL. No environment variables or external services are required.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run lint` | Check TypeScript and React code with ESLint; warnings fail the check. |
| `npm run typecheck` | Generate Next.js route types and run strict TypeScript checks. |
| `npm test` | Verify fixtures, independent source invariants, numerical queries, worker boundaries, async sessions, and chart coordinates. |
| `npm run test:watch` | Run unit tests in watch mode. |
| `npm run data:inspect` | Inspect all 20 runs; add `-- run-015` for exact anomaly source positions. |
| `npm run data:validate` | Audit all 20 fixtures and adversarial seeds 1–40; retain each case result in a versioned JSON report and exit nonzero on failure. |
| `npm run data:catalog` | Regenerate the compact run-list catalog from exact source summaries. |
| `npm run data:catalog:check` | Fail if the committed catalog differs from regenerated summaries. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build; run `npm run build` first. |
| `npm run check` | Run lint, type checking, unit tests, catalog consistency, and a production build. |

Unit tests establish numerical properties within their tested cases. They do not establish correct browser pixels, complete accessibility, absence of every request race, or browser performance.

Replay a particular case with `npm run data:validate -- --run run-012` or `npm run data:validate -- --seed 17`. Selectors can repeat or combine; supplying them runs only those cases. Use `npm run --silent data:validate > report.json` for machine-readable output. Reports include exact case selectors, replay commands, source fingerprints, source/generator versions, Node/platform information and Git revision/dirty state when available. A failed case stays in the report while later cases continue; totals count only completed audits.

The [data-validation record](evidence/data-validation/verification.md) covers source-contract checks, malformed worker replies and stronger independent oracles. Structural errors are rejected without coercion; NaN, infinities, missing readings, duplicate conflicts and rejected numeric steps remain preserved telemetry. The original 20 fixtures are unchanged.

## Dashboard controls

Choose a run from the sidebar, or open the run drawer on a narrow screen. Search by name/ID, filter by status or source-data quality, and sort by name, last step, or last valid loss. Sorting by loss displays the step of the earlier valid reading when necessary.

All three charts share a step range. Use the range presets, explicit start/end inputs, zoom buttons, or Alt + mouse wheel over a chart. Whole-run summary cards stay unchanged by zoom; each chart labels its **Visible max** separately. The observation inspector reads original source rows, including conflicting duplicates and invalid values. Expand **Exact source readings** for full precision and use its previous/next page buttons for groups larger than 20 rows. Pages retain original source indexes.

Open the snapshot disclosure to compare the fixed source timestamp/version with **Last successful load**. Reloading a synthetic snapshot does not make its source newer. While reloading, the prior complete snapshot and its load time remain visible; the replacement summary, frame, and load time commit together. **Export summary** includes the descriptor, tagged whole-run summary, and successful load time.

Use Left/Right or Home/End on the Metrics/Data quality tabs. In the selected-observation group, Left/Right move between recorded steps and Home/End select the first/last observation. Explicit keyboard selections are announced without announcing every pointer move.

With `npm run dev`, open [/diagnostics/charts](http://localhost:3000/diagnostics/charts) for handwritten empty, singleton, gap, conflict, extreme-magnitude, fragmented, and paginated-source cases using the real chart component. This development-only route returns not found outside development. It is a correctness aid, not a production performance baseline or a worker-failure simulator.

## Project structure

```text
AGENTS.md                 Project instructions for future coding sessions
docs/
  BUILD_APPROACH.md       Current build direction and sequence
  MOCK_DATA.md            Generated fixtures and inspection commands
  PRD.md                  Product requirements
  PRD_AUDIT.md            Current evidence and remaining delivery gates
  TRD.md                  Technical requirements
src/app/
  globals.css            Global styles and locally bundled fonts
  layout.tsx             Root document and metadata
  page.tsx               Redirect to the first training run
  runs/                  Shared dashboard layout and validated run routes
  diagnostics/charts/    Development-only chart diagnostic route
src/features/dashboard/  Run browser, summaries, quality view, and inspector
src/features/charts/     Pure coordinate/options model and ECharts Canvas component
src/features/diagnostics/ Handwritten chart/source scenarios
src/features/runs/
  data/manifest.ts        Versioned descriptors for exactly 20 runs
  data/generate.ts        Deterministic source-column generation
  data/catalog.json      Generated run-list summaries
  model/                 Source/view contracts, preparation, reduction, inspection
  hooks/use-run.ts        React lifecycle and worker transport
  hooks/run-session.ts    Pure session state, request identities, bounded queues
  worker/run.worker.ts   Source ownership and numerical queries
scripts/                 Independent source audit, diagnostics, catalog generation
tests/unit/              Source, engine, worker, session, and chart-model checks
eslint.config.mjs        Next.js and TypeScript lint rules
next.config.ts           Next.js configuration
tsconfig.json            Strict TypeScript and @/* import alias
```

The project uses the App Router, CSS Modules, locally bundled Geist and IBM Plex Mono fonts, Phosphor icons, and Apache ECharts. Package versions are pinned and `package-lock.json` records the reproducible dependency tree. Full-resolution arrays remain in the worker; React receives bounded chart data, summaries, and selected observations. The renderer maps raw values into bounded linear display coordinates to avoid overflow and cancellation, retains the exact step/value in separate dimensions, and decodes pointer coordinates back to source steps. Reduction uses the narrowest measured drawable plot width after tick-label padding.

ESLint 9 and TypeScript 6 satisfy the Next.js lint plugins' current peer ranges; ESLint 9 is now outside upstream support. On November 9, 2026, the production dependency audit was clean; the full audit reported eight development-only entries from [one minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249). Its fix requires a major dependency update outside the parser's declared range, so update the lint toolchain when upstream compatibility is available.

## Deployment

Vercel is the intended deployment target. Connect this repository, select the Next.js framework preset, use Node.js 24.x, and run the standard `npm run build` command. Deployment has not been completed.

Before submission, complete the remaining verification and evidence checklist in the requirements documents. The numerical engine has a raw-output mode, but that is not a captured browser baseline. Preserve test output and before/after performance results, including failed results, and document AI assistance and the checks performed.
