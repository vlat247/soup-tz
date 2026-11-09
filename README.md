# soup-tz

Next.js foundation for the Soup Frontend Engineer take-home task: a training-run monitor whose charts remain truthful when the data is large, incomplete, duplicated, or invalid.

The current interface is a minimal starter. The data module now generates 20 deterministic training runs, including the required broken telemetry and a million-point spike case, with focused fixture tests. The monitor interface, chart tests, performance evidence, and deployment remain planned work.

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

Open [localhost:3000](http://localhost:3000). No environment variables or external services are needed for the starter.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run lint` | Check TypeScript and React code with ESLint; warnings fail the check. |
| `npm run typecheck` | Generate Next.js route types and run strict TypeScript checks. |
| `npm test` | Verify the generated training-run fixtures. |
| `npm run test:watch` | Run fixture tests in watch mode. |
| `npm run data:inspect` | Inspect all 20 runs; add `-- run-015` for exact anomaly source positions. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build; run `npm run build` first. |
| `npm run check` | Run lint, type checking, fixture tests, and a production build. |

The fixture tests verify source data. Passing them does not establish chart correctness or browser performance.

## Project structure

```text
AGENTS.md                 Project instructions for future coding sessions
docs/
  BUILD_APPROACH.md       Current build direction and sequence
  MOCK_DATA.md            Generated fixtures and inspection commands
  PRD.md                  Product requirements
  TRD.md                  Technical requirements
src/app/
  globals.css             Global base styles
  layout.tsx              Root document and metadata
  page.tsx                Starter screen
  page.module.css         Starter screen styles
src/features/runs/
  data/manifest.ts        Versioned descriptors for exactly 20 runs
  data/generate.ts        Deterministic source-column generation
  model/types.ts          Run and column contracts
scripts/inspect-runs.ts   Human-readable fixture diagnostics
tests/unit/              Fixture verification
eslint.config.mjs         Next.js and TypeScript lint rules
next.config.ts           Next.js configuration
tsconfig.json            Strict TypeScript and @/* import alias
```

The project uses the App Router, React Server Components by default, CSS Modules, and system fonts. Package versions are pinned and `package-lock.json` records the reproducible dependency tree. Add client boundaries only where browser interaction is needed.

ESLint 9 and TypeScript 6 satisfy the Next.js lint plugins' current peer ranges; ESLint 9 is now outside upstream support. On November 9, 2026, the production dependency audit was clean; the full audit reported eight development-only entries from [one minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249). Its fix requires a major dependency update outside the parser's declared range, so update the lint toolchain when upstream compatibility is available.

## Deployment

Vercel is the intended deployment target. Connect this repository, select the Next.js framework preset, use Node.js 24.x, and run the standard `npm run build` command. No deployment has been created as part of this setup.

Before submission, complete the monitor and the evidence checklist in the requirements documents. Preserve test output and before/after performance results, including failed results, and document AI assistance and the checks performed.
