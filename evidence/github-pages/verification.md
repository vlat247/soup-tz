# GitHub Pages delivery — 10 November 2026

The user explicitly requested merging `pref/optimization` into `main`, pushing everything and deploying to GitHub after making the repository public. This supersedes the previous user-owned deployment plan.

## Implementation and merge

- Merge commit: `705fa31` (`pref/optimization` through `45e8889` into `main`).
- Deployment code: `9b96333`.
- Public repository: https://github.com/vlat247/soup-tz.
- Pages destination: https://vlat247.github.io/soup-tz/.
- Workflow: https://github.com/vlat247/soup-tz/actions/runs/42782341803.

`GITHUB_PAGES=true` enables Next.js static export, `/soup-tz` base path, directory-style route output and unoptimized static images. The logo is a bundled static import; the selected-row comparison tolerates trailing slashes. All 20 dynamic run routes are generated at build time with `dynamicParams=false`. A global not-found page provides a recovery link for GitHub's exported 404 response.

The Pages-only postbuild step removes diagnostic and benchmark routes and adds `.nojekyll`. This is necessary because exported `notFound()` route files would otherwise be served with HTTP 200 by a static host. TypeScript excludes generated `out`, `build` and preview `tmp` paths, making repeated checks after export safe. Ordinary development/server builds keep their previous configuration.

The workflow installs from the lockfile with Node 24, runs the full check, uploads only `out`, and deploys through the `github-pages` environment. Build permissions are read-only; deployment receives Pages and OIDC permissions. Code pushes to `main` and manual workflow dispatch trigger publication. Documentation/evidence-only pushes do not rebuild the unchanged site.

## Local checks

The final Pages-mode `npm run check` passed **597 tests in 19 files**, lint, strict types, all 20 exact catalog summaries and the static production build, including the postbuild step. [Output](check-final.stdout), [stderr](check-final.stderr) and [metadata/export assertions](local-check.json) are retained.

The first export passed. A repeated check then exposed TypeScript scanning a copied worker source inside `out`; its failed output remains in `check-repeat-failed.stdout`. Excluding generated output fixed the issue, and the final full check passed with existing output present.

The exported app was served locally under `/soup-tz/`. Browser checks confirmed root navigation and the Soup link reach run 001, all three charts load through the bundled worker, the visible logo loads from the prefixed asset path, and the selected run has `aria-current=page`. The browser recorded no warnings or errors. The temporary preview server was stopped.

## Public deployment verification

The [GitHub Actions run](https://github.com/vlat247/soup-tz/actions/runs/42782341803) completed successfully: the build and deployment jobs both passed at `9b963338998024bf8fb316d7b02405379ca5a193`. The clean hosted build also passed all 597 tests and the full static check. [Build log](github-build.txt), [workflow result](deployment.json) and [Pages configuration](pages.json) are retained.

Live URL: **https://vlat247.github.io/soup-tz/**.

- Public HTTP checks returned 200 for the root and all 20 run pages, and 404 for an unknown run, both diagnostic routes and the benchmark ([results](live-routes.json)). These HTTP checks establish route availability; they are not a rendering test for every fixture.
- In the browser, the root resolved to a fully loaded run 001. Clicking run 020 loaded the million-point dataset and all three canvases. Entering step 500000 returned exact loss 12. A direct reload of that run also loaded correctly; inspection was repeated after reload ([state](live-million.txt)).
- The visible logo loaded from `/soup-tz/_next/static/media/…`; the selected run had the expected prefixed `aria-current=page` link.
- The live charts and isolated spike were visually reviewed ([screenshot](live-dashboard.jpg)). The normal-page [console record](live-console.json), captured before the deliberate missing-page request, has no warnings or errors.
- The unknown-run URL showed the exported recovery page ([state](live-not-found.txt)). Enter on Browse training runs returned to a fully loaded run 001. The missing-page HTTP 404 is expected.

At this checkpoint the 4× CPU before/after traces, actual hover timings, tab-memory measurements and rendered submission note were still outstanding. They are now retained in [production browser evidence](../performance/verification.md) and the [final two-page note](../../output/pdf/soup-submission-note.pdf).

## Performance-evidence delivery

The opt-in benchmark input-timing change at `0eb0e3d` and its evidence were pushed in `9f80f0d`. [Workflow 42790484107](https://github.com/vlat247/soup-tz/actions/runs/42790484107) passed all **598 tests in 19 files**, lint, strict types, catalog consistency and the static build. Build and deploy both succeeded; deployment completed at 2026-11-10 09:26:28 UTC. The benchmark remains disabled on Pages. This CI/deployment confirmation is separate from the earlier hosted interaction checks above; it does not claim those browser checks were repeated.
