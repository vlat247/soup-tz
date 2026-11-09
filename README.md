# soup-tz

Next.js foundation for the Soup Frontend Engineer take-home task: a training-run monitor whose charts remain truthful when the data is large, incomplete, duplicated, or invalid.

The current application is a minimal starter. The monitor, generated datasets, automated chart tests, performance evidence, and deployment are planned in the requirements documents and are not implemented yet.

## Requirements documents

- [Product requirements](docs/PRD.md): scope, user journeys, acceptance criteria, and delivery requirements.
- [Technical requirements](docs/TRD.md): data contracts, chart correctness, architecture, testing, and performance measurement.

The detailed PRD and TRD are working specifications. They do not replace the assignment's separate submission note of at most two pages.

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
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build; run `npm run build` first. |
| `npm run check` | Run lint, type checking, and a production build. |

Behavioral test tooling will be added with the data and chart implementation. Passing starter checks does not establish chart correctness or performance.

## Project structure

```text
docs/
  PRD.md                  Product requirements
  TRD.md                  Technical requirements
src/app/
  globals.css             Global base styles
  layout.tsx              Root document and metadata
  page.tsx                Starter screen
  page.module.css         Starter screen styles
eslint.config.mjs         Next.js and TypeScript lint rules
next.config.ts           Next.js configuration
tsconfig.json            Strict TypeScript and @/* import alias
```

The project uses the App Router, React Server Components by default, CSS Modules, and system fonts. Package versions are pinned and `package-lock.json` records the reproducible dependency tree. Add client boundaries only where browser interaction is needed.

ESLint 9 and TypeScript 6 satisfy the Next.js lint plugins' current peer ranges; ESLint 9 is now outside upstream support. On November 9, 2026, the production dependency audit was clean; the full audit reported eight development-only entries from [one minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249). Its fix requires a major dependency update outside the parser's declared range, so update the lint toolchain when upstream compatibility is available.

## Deployment

Vercel is the intended deployment target. Connect this repository, select the Next.js framework preset, use Node.js 24.x, and run the standard `npm run build` command. No deployment has been created as part of this setup.

Before submission, complete the monitor and the evidence checklist in the requirements documents. Preserve test output and before/after performance results, including failed results, and document AI assistance and the checks performed.
