# Final local validation — 10 November 2026

Branch: `pref/optimization`. Code checkpoints: `6953f1f` (run-list sorting and keyboard recovery) and `d8192b0` (optional browser comparison harness). The user explicitly retained responsibility for opening the repository and deploying; no publication or hosting configuration was performed.

## Functionality verdict

The review against the original assignment found no missing mandatory product feature in the supplied-fixture application. All 20 runs, the three metric charts, exact summaries and inspection, invalid/gap/conflict handling, worker processing, viewport reduction, filtering/sorting, loading/empty/error states and explicit recovery are implemented. This is a scoped local correctness finding, not a claim that every browser, schedule or accessibility configuration has been certified.

Two old audit gaps were closed: descending numeric valid-loss sorting (unavailable values stay last in both directions), and a distinct empty-catalog message. Search reset/clear also return focus to the search input, result counts announce changes, and run-link outlines remain inside the scrolling list. The empty-catalog branch was code-reviewed; empty selection/filter behavior has unit coverage, while no browser run with a zero-entry catalog was performed.

## Automated validation

The initial checkpoint at `3aacca5` passed 585 tests in 17 files plus lint, strict types, catalog consistency and the production build. This supersedes the earlier intermediate 543-pass/6-fail result. Its [command metadata](check-initial.json), [stdout](check-initial.stdout) and [stderr](check-initial.stderr) are retained.

Final settled-code check at `d8192b0`: **597 tests passed in 19 files**, ESLint with no warnings, strict TypeScript, all 20 exact catalog summaries and the production build. See [metadata](check-final.json), [stdout](check-final.stdout) and [stderr](check-final.stderr). Subsequent edits are documentation/evidence only.

The new run-list suite covers numeric ordering, absent/nonfinite values, signed zero, extreme finite values, equal-value ties, filters and source immutability. The comparison protocol suite covers stale completion identity, retained failed samples, bounded results, navigation timing and deterministic workloads. Focused outputs, including the benchmark's initial lint warning and its successful rerun, remain in this directory.

The numerical/source implementation and fixture bytes did not change in this branch. The prior [independent source audit](../silent-failers/source-validation.json) remains applicable: 60 cases, 300 viewports, 900 metric results, 3,891 inspection groups/pages and all 20 fingerprints unchanged. The prior nine-process locale/time-zone results are Node evidence, not browser locale coverage.

## Observed browser checks

Targeted CUA-driven checks in the in-app Chromium browser, development server, default 1280×720 viewport and 360×800 mobile override:

| Check | Observed result |
| --- | --- |
| Descending valid loss | Run 007 first; all-invalid run 019 last. Earlier valid loss is disclosed for latest-invalid run 009. |
| Ascending valid loss | Negative-loss run 017 first; run 019 remains last. |
| Empty search and reset | A nonmatching query shows No matching runs; Enter on Reset filters restores 20 results and search focus. Clear search also restores results. |
| Million-point source inspection | Enter on step 500000 returns loss 12; ArrowRight on the selected-observation group advances to 500001 with source loss 0.2478 displayed. |
| Precise range and reset | Keyboard range 499999–500001 contains three readings and retains visible maximum 12. All steps restores 0–999999. |
| Mobile drawer | Enter opens the run dialog; Escape closes it and returns focus to Open run navigation. All three canvases remain; document width and viewport both equal 360px. |
| Invalid-only metric | Run 019 shows NaN, No finite observations and an explicit empty loss plot; learning rate and gradient norm remain plotted. |
| Metric/quality tabs | ArrowRight from Metrics selects and focuses Data quality; its table reports 3,000 invalid loss readings. |
| Console | No warnings or errors observed in the development dashboard QA session. |

[Mobile screenshot](mobile-360.jpg). This extends the earlier [real-worker/renderer recovery checks](../silent-failers/verification.md), which cover failed refresh, keyboard retry, late replies, malformed replies, a stalled request, renderer exceptions and zero-size recovery. Those unchanged paths were not all repeated on this branch. Native Chrome profiling was stopped before any required measurement was obtained.

## Production smoke check

The settled production build ran locally on port 3001. All 20 run routes and `/runs` returned HTTP 200; an unknown run, both diagnostic routes and the default-disabled benchmark returned HTTP 404 ([route results](production-routes.json)). HTTP route checks establish page availability, not worker rendering for every fixture.

The actual browser loaded the million-point worker data, sorted descending, and inspected step 500000 with exact loss 12 ([DOM state](production-million.txt), [visually reviewed screenshot](production-million.jpg)). Run 019 retained an empty invalid-only loss plot and working other metrics ([state](production-invalid.txt)). From the unknown-run page, Enter on Browse training runs recovered to a loaded run 001 ([state](production-recovered.txt)). The [production console](production-console.json) contained no warnings or errors. The temporary production server and QA tabs were closed; the existing development demo on port 3000 remains available.

## Optional benchmark correctness

`/benchmark` uses the real Canvas adapter, raw main-thread source processing or the production worker/reducer, and the same deterministic million-point fixture. It is available in development or an explicitly opted-in build; normal production returns 404. See the [protocol and commands](benchmark-protocol.md).

Both development variants completed one load, 30 zoom commands and 30 exact inspections with no failed samples: [optimized smoke report](benchmark-optimized-dev-smoke.json), [raw smoke report](benchmark-raw-dev-smoke.json). The raw load rendered 3,000,000 metric entries. The known peak stayed at step 500000, loss 12. These reports were collected in the development browser without configured CPU throttling and are **functional smoke evidence only**. They do not establish performance acceptance or a before/after speedup.

Smoke testing found stale accessibility labels after Unload and possible mixed-variant aggregates. Both were fixed: Unload clears surfaces, labels and timestamps, and the chosen variant is locked after the first attempt with an engine guard. A fresh raw report after the fixes completed all 61 samples. Unload then left zero canvases and no stale chart labels, with the variant still locked. The optimized report predates these cleanup/isolation fixes; worker/reduction behavior was unchanged. No misleading mixed-variant report was retained.

## Remaining assignment deliverables

- Required production before/after Chrome Performance traces at verified 4× CPU throttling, including first useful chart, zoom and actual hover response.
- Actual browser tab-memory measurements; typed-array estimates or JavaScript heap alone do not substitute for these.
- A final short submission note with linked evidence, a supported verdict and the deployed URL. [The note and AI disclosure are drafted](../../docs/submission/NOTE_DRAFT.md); a final two-page rendering is not yet verified.
- Deployment and public/reviewer access are explicitly user-owned.

The harness's second-animation-frame endpoint is a paint proxy. Scripted inspections exclude physical pointer dispatch and are not hover-response measurements. Broader browser/locale, screen-reader and automated router-race coverage remains an engineering limitation rather than a newly invented assignment requirement. Do not describe this as a fully completed submission until the required evidence is attached.
