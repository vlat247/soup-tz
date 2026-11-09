# soup-tz

Next.js training-run monitor for the Soup Frontend Engineer take-home task, with explicit data-quality handling and source-based chart reduction.

The dashboard includes a searchable, sortable run browser; loss, learning-rate, and gradient-norm charts; whole-run summaries; data-quality details; shared zoom controls; and an exact observation inspector. Twenty deterministic synthetic runs include broken telemetry and a million-point spike case. Apache ECharts renders linear, unsmoothed plots from independently reduced data, while a dedicated worker retains the full source observations.

Source and numerical-engine tests cover normalization, duplicate conflicts, gaps, invalid values, exact summaries, inspection, and spike retention in tested viewports. Targeted desktop/mobile browser checks and production smoke checks are recorded in [dashboard verification](evidence/dashboard-ui/verification.md), with screenshots and check output. A browser baseline renderer, before/after traces at 4x CPU throttling, tab-memory measurements, comprehensive browser automation, and deployment remain outstanding.

## Requirements documents

- [Build approach](docs/BUILD_APPROACH.md): the current implementation direction, data rules, and build sequence. Start here.
- [Product requirements](docs/PRD.md): scope, user journeys, acceptance criteria, and delivery requirements.
- [Technical requirements](docs/TRD.md): data contracts, chart correctness, architecture, testing, and performance measurement.
- [Mock data](docs/MOCK_DATA.md): fixture allocation, generator usage, anomaly locations, and inspection commands.

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
| `npm test` | Verify fixtures and numerical preparation, reduction, summaries, and inspection. |
| `npm run test:watch` | Run unit tests in watch mode. |
| `npm run data:inspect` | Inspect all 20 runs; add `-- run-015` for exact anomaly source positions. |
| `npm run data:catalog` | Regenerate the compact run-list catalog from exact source summaries. |
| `npm run data:catalog:check` | Fail if the committed catalog differs from regenerated summaries. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build; run `npm run build` first. |
| `npm run check` | Run lint, type checking, unit tests, catalog consistency, and a production build. |

Unit tests establish numerical properties within their tested cases. They do not establish correct browser pixels, complete accessibility, absence of every request race, or browser performance.

## Dashboard controls

Choose a run from the sidebar, or open the run drawer on a narrow screen. Search by name/ID, filter by status or source-data quality, and sort by name, last step, or last valid loss. Sorting by loss displays the step of the earlier valid reading when necessary.

All three charts share a step range. Use the range presets, explicit start/end inputs, zoom buttons, or Alt + mouse wheel over a chart. Whole-run summary cards stay unchanged by zoom. The observation inspector reads original source rows, including conflicting duplicates and invalid values; expand **Exact source readings** for full precision. **Export summary** downloads the run descriptor and tagged whole-run summary as JSON.

Use Left/Right or Home/End on the Metrics/Data quality tabs. In the selected-observation group, Left/Right move between recorded steps and Home/End select the first/last observation. Explicit keyboard selections are announced without announcing every pointer move.

## Project structure

```text
AGENTS.md                 Project instructions for future coding sessions
docs/
  BUILD_APPROACH.md       Current build direction and sequence
  MOCK_DATA.md            Generated fixtures and inspection commands
  PRD.md                  Product requirements
  TRD.md                  Technical requirements
src/app/
  globals.css            Global styles and locally bundled fonts
  layout.tsx             Root document and metadata
  page.tsx               Redirect to the first training run
  runs/                  Shared dashboard layout and validated run routes
src/features/dashboard/  Run browser, summaries, quality view, and inspector
src/features/charts/     Apache ECharts Canvas component and styles
src/features/runs/
  data/manifest.ts        Versioned descriptors for exactly 20 runs
  data/generate.ts        Deterministic source-column generation
  data/catalog.json      Generated run-list summaries
  model/                 Source/view contracts, preparation, reduction, inspection
  hooks/use-run.ts       Worker lifecycle and request identity checks
  worker/run.worker.ts   Source ownership and numerical queries
scripts/                 Fixture diagnostics and catalog generation
tests/unit/              Source and numerical-engine verification
eslint.config.mjs        Next.js and TypeScript lint rules
next.config.ts           Next.js configuration
tsconfig.json            Strict TypeScript and @/* import alias
```

The project uses the App Router, CSS Modules, locally bundled Geist and IBM Plex Mono fonts, Phosphor icons, and Apache ECharts. Package versions are pinned and `package-lock.json` records the reproducible dependency tree. Full-resolution arrays remain in the worker; React receives bounded chart data, summaries, and selected observations.

ESLint 9 and TypeScript 6 satisfy the Next.js lint plugins' current peer ranges; ESLint 9 is now outside upstream support. On November 9, 2026, the production dependency audit was clean; the full audit reported eight development-only entries from [one minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249). Its fix requires a major dependency update outside the parser's declared range, so update the lint toolchain when upstream compatibility is available.

## Deployment

Vercel is the intended deployment target. Connect this repository, select the Next.js framework preset, use Node.js 24.x, and run the standard `npm run build` command. Deployment has not been completed.

Before submission, complete the remaining verification and evidence checklist in the requirements documents. The numerical engine has a raw-output mode, but that is not a captured browser baseline. Preserve test output and before/after performance results, including failed results, and document AI assistance and the checks performed.
