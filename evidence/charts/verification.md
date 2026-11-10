# Run and chart validation — 10 November 2026

Branch: `feature/charts`, based on `feature/ui-redesign` at `132dc30`. The tested implementation is committed through `1461d88` (source validation `e50b15b`, session fixes `b8855fb`, renderer/dashboard `1461d88`). Subsequent changes are documentation and retained evidence only. This is a correctness checkpoint, not a completed release/performance sign-off.

## Automated validation

`npm run check` passed: ESLint, strict TypeScript, **279 tests across six files**, exact catalog consistency for 20 runs, and the production Next.js build. See [check-final.txt](check-final.txt).

The independent source validator passed for all **20 fixtures / 1,086,106 source rows**, plus 40 generated adversarial cases (seeds 1–40): 300 viewport checks, 900 metric checks and 130 fragmented metric frames. See [source-validation.json](source-validation.json). Source byte hashes preserve provenance; expected counts, bounds, discontinuities and source memberships are checked by separate straightforward scans. The fixture dataset and its deliberate defects remain unchanged.

The suite includes 92 source-validation tests, 13 worker boundary tests, 26 session-controller tests and 39 chart-model/ECharts SSR tests, alongside the original 109 source/reduction tests. Session tests cover stale/replayed replies, failures, run replacement, hover/viewport coalescing and atomic snapshot publication. Chart tests exercise real ECharts coordinate conversion, raw tuple values, explicit gaps/conflicts, singleton zoom and narrow plot geometry. SSR coordinate checks do not establish Canvas paint by themselves.

Fixed defects include accepting malformed row counts/missing masks, inaccessible duplicate rows after the first 20, stale session responses, failed postMessage handling, and ECharts numeric-domain failures for subnormal, tiny, adjacent and opposite extreme values. Chart coordinates now use a bounded linear mapping with source-unit tick labels and exact raw metadata. No logarithmic scale, smoothing or extra lossy sampling was introduced. Point budgets use measured drawable widths.

## Browser observations

Checks used the desktop app's in-app browser, Canvas rendering, local development port 3000 and a temporary production server on port 3001. Responsive checks used CSS viewport widths 360, 768 and 1440. Device pixel ratio, CPU throttling and tab memory were not recorded. The production server was stopped afterward; the development demo remains available.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Navigate all 20 runs at desktop width | Correct headings, summary values and three metric panels; no page overflow or run-error alerts | [browser-runs.json](browser-runs.json) |
| Compare captured DOM values with source | 364 assertions; 80 summary labels and 60 maxima match independently scanned source data and catalog; zero mismatches | [browser-data-comparison.json](browser-data-comparison.json) |
| Million-point isolated spike | Full-range loss peak 12 is visible; exact inspection at step 500000 gives 12 | [charts-final.jpg](charts-final.jpg) |
| Shared zoom | Peak remains 12 in centered, edge and single-step ranges; excluding it yields visible maximum 0.2694; whole-run summary stays unchanged | [browser-zoom.json](browser-zoom.json), [single-step-spike.jpg](single-step-spike.jpg) |
| Fourteen small diagnostic scenarios | Empty/singleton/constant/invalid/islands/gap/conflict/zero-negative/subnormal/tiny/adjacent/huge/fragmented/pagination cases loaded without page overflow | [browser-diagnostics.json](browser-diagnostics.json), `diagnostic-*.jpg` |
| Source pagination | All 45 readings accessible in pages of 20, 20 and 5; Next disabled on final page | [browser-pagination.json](browser-pagination.json) |
| Mobile exact ticks | Adjacent floating-point readings have distinct visible axis labels at 360px | [mobile-adjacent.jpg](mobile-adjacent.jpg) |
| Mobile gap and metadata | Step 610 requests a missing interval, shows nearest recorded step 620 and a gap notice; snapshot details fit without page overflow | [browser-mobile.json](browser-mobile.json), [mobile-gap.jpg](mobile-gap.jpg) |
| Production tablet layout | Million-point charts render at 768px without page overflow | [production-tablet.json](production-tablet.json), [production-tablet.jpg](production-tablet.jpg) |
| Production NaN and duplicates | Latest NaN stays NaN in exact source table; conflicting final gradient retains both source rows, including value 25 | [production-invalid.txt](production-invalid.txt), [production-conflict.txt](production-conflict.txt), [production-conflict.jpg](production-conflict.jpg) |
| Production console | No captured warnings/errors during million-point, NaN and duplicate-run checks | [production-console.json](production-console.json) |
| Development-only diagnostics | Local HTTP request to production `/diagnostics/charts` returned 404 | Terminal observation; production build in [check-final.txt](check-final.txt) |

Snapshot disclosure was checked before and after Reload: source time stayed `2026-11-01T12:00:00.000Z`; last successful load advanced from `2026-11-09T21:01:03.973Z` to `2026-11-09T21:01:25.211Z`. These were observed DOM values, not a separately retained trace. The distinct source/version/load fields are also covered by session tests.

Saved DOM records verify labels and panel presence, not painted pixel geometry. Screenshots were separately reviewed for the relevant geometric behaviors. The diagnostic renderer is the real chart component and reduction pipeline; its 45-row pagination example is synchronous. Worker pagination and async behavior are additionally covered in unit tests, rather than claimed as a browser fault-injection result.

## Failures and evidence limits

- [validation-initial.txt](validation-initial.txt) retains the initial source-test failures: malformed source inputs exposed missing validation; signed-zero differences in expected extents were corrected in the oracle, without changing source bytes. Passing follow-ups are retained.
- [session-01.txt](session-01.txt) and [session-02.txt](session-02.txt) retain successive passing session-test runs.
- During chart implementation, actual ECharts SSR checks exposed nonfinite coordinates for subnormals, an interval error at tiny magnitudes and out-of-grid adjacent values. Two subsequent helper failures concerned tick precision and invalid width. Those intermediate chart-test transcripts were not saved, so this report records them as implementation findings, not preserved failure logs. The final passing integrated transcript is retained.
- [diagnostic-hydration-failure.json](diagnostic-hydration-failure.json) retains a development hydration warning about a 68px/69px guide inset while chart code was being edited. A fresh reload after edits stabilized produced no new warnings during all fourteen scenario checks; production checks were also clean. Development hot-reload timing is a plausible explanation, not a proven cause.
- Several browser selector attempts failed because native accessibility buttons for HTML summary elements did not match Playwright roles. Retargeting the observed summary elements worked; these were automation locator failures, not failed product controls.

Still outstanding for the assignment's full release gate: the independent raw browser baseline renderer, controlled before/after 4× CPU measurements, real tab-memory measurements, the full end-to-end browser race/failure and assistive-technology matrix, and deployment. Deterministic source/SSR/session tests and manual Canvas checks do not prove every possible input or environment.
