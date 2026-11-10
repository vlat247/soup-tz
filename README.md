# soup-tz

Next.js training-run monitor for the Soup Frontend Engineer take-home task, with explicit data-quality handling and source-based chart reduction.

[Live demo](https://vlat247.github.io/soup-tz/) · [Two-page submission note](output/pdf/soup-submission-note.pdf) · [Performance evidence](evidence/performance/verification.md)

The dashboard includes a searchable, sortable run browser; loss, learning-rate, and gradient-norm charts; whole-run summaries; data-quality details; shared zoom controls; and exact observation and reduction-column inspection. Twenty deterministic synthetic runs include broken telemetry and a million-point spike case. Apache ECharts renders linear, unsmoothed plots from independently reduced data, while a dedicated worker retains the full source observations.

The delivered revision passed **598 tests in 19 files**, lint, strict TypeScript, all 20 exact catalog summaries and production builds locally and in [GitHub Actions](https://github.com/vlat247/soup-tz/actions/runs/42793521873). GitHub Pages deployment succeeded. The [two-page note](output/pdf/soup-submission-note.pdf) gives a qualified SHIP verdict and names the first follow-up.

[Production 4× CPU traces and actual tab memory](evidence/performance/verification.md) compare raw main-thread rendering with the worker/reduced path on the same million-row fixture. Cold chart median improves from 13.63 s to 0.86 s, zoom p95 from 909 to 84 ms, and loaded tab footprint from 1.4 GB to 103 MB. Mouse-movement inspection p95 is **55.8 ms**, missing the proposed 50 ms target. The controlled benchmark uses a simpler inspector than the dashboard; the evidence explains sample counts, measurement methods and limitations.

Independent source checks cover summaries, domains, provenance, breaks and retained extrema. Targeted browser checks cover the spike, invalid data, keyboard/mobile controls and failure recovery. These do not establish comprehensive browser automation or accessibility certification. The [requirements audit](docs/PRD_AUDIT.md) maps implemented behavior to evidence and remaining limits; earlier failed results remain in `evidence/`.

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
| `npm run bench:reduction` | Record Node-only reduction samples and raw/reduced output counts; excludes generation, browser rendering and worker messaging. |
| `npm run validate:presentation` | Verify explicit en-US/UTC output in nine Node locale/time-zone environments; not a browser matrix. |
| `npm run data:catalog` | Regenerate the compact run-list catalog from exact source summaries. |
| `npm run data:catalog:check` | Fail if the committed catalog differs from regenerated summaries. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build; run `npm run build` first. |
| `npm run check` | Run lint, type checking, unit tests, catalog consistency, and a production build. |

Unit tests establish numerical properties within their tested cases. They do not establish correct browser pixels, complete accessibility, absence of every request race, or browser performance.

Replay a particular case with `npm run data:validate -- --run run-012` or `npm run data:validate -- --seed 17`. Selectors can repeat or combine; supplying them runs only those cases. Use `npm run --silent data:validate > report.json` for machine-readable output. Reports include exact case selectors, replay commands, source fingerprints, source/generator versions, Node/platform information and Git revision/dirty state when available. A failed case stays in the report while later cases continue; totals count only completed audits.

The earlier [data-validation record](evidence/data-validation/verification.md) covers source contracts, malformed worker replies and independent oracles. Structural errors are rejected without coercion; NaN, infinities, missing readings, duplicate conflicts and rejected numeric steps remain preserved telemetry. The latest audit passes 300 viewport checks, 900 metric checks and 3,891 exact inspection groups/pages. All 20 fixture fingerprints are unchanged.

## Dashboard controls

Choose a run from the sidebar, or open the run drawer on a narrow screen. Search by name/ID, filter by status or source-data quality, and sort by name, last step, or last valid loss in either direction. Unavailable loss stays last; sorting by loss displays the step of an earlier valid reading when necessary. An empty catalog has its own message, distinct from filters matching no runs. Reset filters and Clear search return focus to search.

All three charts share a step range. Use the range presets, explicit start/end inputs, zoom buttons, or Alt + mouse wheel over a chart. Whole-run summary cards stay unchanged by zoom; each chart labels its **Visible max** separately. The observation inspector reads original source rows, including conflicting duplicates and invalid values. Expand **Exact source readings** for full precision and use its previous/next page buttons for groups larger than 20 rows. Pages retain original source indexes.

Expand **Samples in this chart column** to inspect the raw minimum/maximum and quality counts in the selected reduction column. Click an extremum to inspect its original step. The column uses the current range and shared drawing budget; it can span more than one physical pixel on a wider chart. It includes finite conflicting readings, preserves empty columns and reports intersecting missing intervals separately from missing metric values. Exact source inspection still works outside the visible range, where no column summary is shown.

Open the snapshot disclosure to compare fixed source timestamp/version with **Last successful load**. Reloading a synthetic snapshot does not make its source newer. Pending or failed refresh retains the previous complete snapshot and its load time with a visible notice. Sent worker requests time out after 30 seconds and offer manual retry; background-tab timers can run later. **Export summary** keeps tagged invalid states and shows a visible error if serialization or download setup fails. Exact source text preserves negative zero.

Use Left/Right or Home/End on the Metrics/Data quality tabs. In the selected-observation group, Left/Right move between recorded steps and Home/End select the first/last observation. Explicit keyboard selections are announced without announcing every pointer move.

With `npm run dev`, open [/diagnostics/charts](http://localhost:3000/diagnostics/charts) for handwritten chart/source edge cases. [/diagnostics/silent-failures](http://localhost:3000/diagnostics/silent-failures) wraps the real dashboard worker and renderer with controls to hold, fail, drop or corrupt replies, fail a chart draw, and hide/show its containers. Its replay instructions and event log make failures reproducible; its request deadline is 10 seconds. Both routes are restricted to development and are not performance baselines. A failed chart removes stale pixels and offers **Retry chart**; other metrics and exact source inspection stay available.

The optional `/benchmark` page compares raw main-thread rendering with the production worker/reducer on the same million-point source and Canvas adapter. It is available in development; for a local production comparison, build with `NEXT_PUBLIC_ENABLE_BENCHMARK=1 npm run build` and then `npm start`. Normal production builds return 404 for this route. Scripted commands end at a double-animation-frame paint proxy; the armed mouse-movement probe also records trusted input timestamps and the inspector's DOM commit. Neither alone proves painted frames. The [saved 4× CPU traces](evidence/performance/verification.md) correlate actual Paint events with those marks and disclose the native-drag, discrete-input and observer-overhead limits. Actual memory comes separately from Chrome Task Manager.

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
  diagnostics/           Development-only chart and silent-failure routes
  benchmark/             Opt-in raw/reduced browser comparison route
src/features/dashboard/  Run browser, summaries, quality view, and inspector
src/features/charts/     Pure coordinate/options model and ECharts Canvas component
src/features/diagnostics/ Handwritten cases and controlled worker/renderer faults
src/features/benchmark/  Comparison controls and bounded timing ledger
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

Live on GitHub Pages: [Soup training monitor](https://vlat247.github.io/soup-tz/). [Deployment workflow 42793521873](https://github.com/vlat247/soup-tz/actions/runs/42793521873) published revision `93a3d94` with all 598 tests passing. Earlier hosted checks at `9b96333` verified root navigation, all 20 run URLs, direct reload, active-run state, logo assets, the million-point worker and exact loss 12 at step 500,000, plus keyboard recovery from a 404. Those interaction checks were not repeated for the later benchmark/evidence changes. See [deployment evidence](evidence/github-pages/verification.md).

[The Pages workflow](.github/workflows/pages.yml) runs on code pushes to `main` and supports manual `workflow_dispatch`. It uses Node.js 24, installs from the lockfile, runs `npm run check` with `GITHUB_PAGES=true`, uploads `out/`, and deploys through the `github-pages` environment. Documentation/evidence-only pushes do not redeploy. The benchmark is explicitly disabled in the workflow.

`GITHUB_PAGES=true` enables static export, the `/soup-tz` base path, directory-style routes and unoptimized local images. All 20 detail routes are generated at build time; computation and inspection still run in the browser worker. The Pages-only postbuild step removes diagnostic/benchmark exports and writes `.nojekyll`, so those routes return real HTTP 404 responses. Generated `out/`, `build/` and `tmp/` files are excluded from TypeScript source checking. Reproduce the Pages build locally with:

```sh
GITHUB_PAGES=true NEXT_PUBLIC_ENABLE_BENCHMARK=0 npm run check
```

Serve `out/` beneath `/soup-tz/` with a static server; `next start` is for the default Next.js build, not this export. Repeat the hosted smoke checks after future deployment changes. The standard local `npm run dev` and `npm run build` modes retain their existing root-path behavior.

The [final two-page PDF](output/pdf/soup-submission-note.pdf) and [Markdown source](docs/submission/SUBMISSION.md) contain the qualified SHIP verdict, first follow-up, reflection and AI disclosure. [Saved browser evidence](evidence/performance/verification.md) includes four original 4× CPU traces, five cold loads per variant, 30 zoom and 30 accepted mouse-movement samples per variant, actual tab-memory observations, raw output and reproducible analysis. Run `python3 scripts/analyze-browser-evidence.py` to regenerate the CSV and summary. To render the note, use Python with ReportLab and `python3 scripts/render-submission-note.py`. No submission email has been sent.
